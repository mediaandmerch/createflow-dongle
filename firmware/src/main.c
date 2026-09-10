/*
 * createflow dongle - BLE HID bridge.
 *
 * Scan for devices advertising the HID service (0x1812), connect, bond, discover the
 * HID-over-GATT service, subscribe to every input report and forward each one to USB
 * unchanged, report ID first (usb_hid.c). The dongle offers the keyboard's own report map
 * on USB, so nothing needs translating.
 */
#include "bridge.h"

#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/settings/settings.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <bluetooth/gatt_dm.h>
#include <bluetooth/scan.h>
#include <bluetooth/services/hogp.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(bridge, LOG_LEVEL_INF);

/* Status LEDs. Until USB is up there is no log port, so these are the only sign of life:
 * led_run = main() reached (green on the Nordic dongle, red on the EBYTE clone),
 * led_error = USB start failed, led_usb = USB enabled. */
static const struct gpio_dt_spec led_run = GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios);
static const struct gpio_dt_spec led_error = GPIO_DT_SPEC_GET(DT_ALIAS(led1), gpios);
static const struct gpio_dt_spec led_usb = GPIO_DT_SPEC_GET(DT_ALIAS(led3), gpios);

static void led_on(const struct gpio_dt_spec *led)
{
	gpio_pin_configure_dt(led, GPIO_OUTPUT_ACTIVE);
}

static struct bt_hogp hogp;

/* --- Counters, logged every 30 s while something changes --- */

static struct {
	uint32_t received;      /* reports from the keyboard */
	uint32_t sent;          /* handed to USB */
	uint32_t usb_not_ready; /* host has not opened the interface yet */
	uint32_t rejected;      /* USB refused the report */
	uint32_t connections;
	uint32_t disconnects;
} stats;

static void log_stats(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(stats_work, log_stats);

static void log_stats(struct k_work *work)
{
	ARG_UNUSED(work);
	static uint32_t last_total;
	uint32_t total = stats.received + stats.connections + stats.disconnects;

	if (total != last_total) {
		last_total = total;
		LOG_INF("stats: %u received, %u sent, %u usb-not-ready, %u rejected | "
			"%u connections, %u disconnects",
			stats.received, stats.sent, stats.usb_not_ready, stats.rejected,
			stats.connections, stats.disconnects);
	}
	k_work_schedule(&stats_work, K_SECONDS(30));
}

/* --- Input reports --- */

/* HOGP only knows a report's size after the first notification, so the size check
 * happens here (in usb_hid_send) rather than when subscribing. */
static uint8_t on_report(struct bt_hogp *hp, struct bt_hogp_rep_info *rep,
			 uint8_t err, const uint8_t *data)
{
	ARG_UNUSED(hp);

	if (err || data == NULL) {
		return BT_GATT_ITER_CONTINUE;
	}
	stats.received++;

	int ret = usb_hid_send(bt_hogp_rep_id(rep), data, bt_hogp_rep_size(rep));
	if (ret == 0) {
		stats.sent++;
	} else if (ret == -EAGAIN) {
		stats.usb_not_ready++;
	} else {
		stats.rejected++;
		if (ret == -EINVAL) {
			LOG_WRN_ONCE("report %u with %u bytes does not match the report map - dropped",
				     bt_hogp_rep_id(rep), (unsigned int)bt_hogp_rep_size(rep));
		} else {
			LOG_WRN("USB rejected report: %d", ret);
		}
	}
	return BT_GATT_ITER_CONTINUE;
}

/* --- Report map check ---
 * The USB side carries a fixed copy of the Naya Create's report map. If the connected
 * keyboard describes something else (different firmware, different device), report sizes
 * no longer line up and the host would receive garbage. So the map is read on every
 * connection and dumped when it differs, ready to be pasted into usb_hid.c. It does not
 * fit in one ATT packet; each chunk schedules the next read until an empty one ends it. */

static uint8_t report_map[512];
static size_t report_map_len;

static void read_report_map(struct k_work *work);
static K_WORK_DEFINE(report_map_work, read_report_map);

static void on_report_map_chunk(struct bt_hogp *hp, uint8_t err, const uint8_t *data,
				size_t size, size_t offset)
{
	ARG_UNUSED(hp);

	if (err) {
		LOG_ERR("report map read: ATT error %u at offset %u", err, (unsigned int)offset);
		return;
	}
	if (data == NULL || size == 0) {
		size_t usb_len;
		const uint8_t *usb_map = usb_hid_report_map(&usb_len);

		if (report_map_len == usb_len && memcmp(report_map, usb_map, usb_len) == 0) {
			LOG_INF("keyboard report map (%u bytes) matches USB", (unsigned int)report_map_len);
			return;
		}
		LOG_WRN("keyboard report map (%u bytes) differs from USB (%u bytes) - "
			"reports will arrive wrong. Copy this map into usb_hid.c:",
			(unsigned int)report_map_len, (unsigned int)usb_len);
		LOG_HEXDUMP_WRN(report_map, report_map_len, "report map");
		return;
	}
	size_t n = MIN(size, sizeof(report_map) - offset);
	memcpy(report_map + offset, data, n);
	report_map_len = offset + n;
	if (n < size) {
		LOG_WRN("report map longer than %u bytes - truncated", (unsigned int)sizeof(report_map));
		return;
	}
	k_work_submit(&report_map_work);
}

static void read_report_map(struct k_work *work)
{
	ARG_UNUSED(work);
	int err = bt_hogp_map_read(&hogp, on_report_map_chunk, report_map_len, K_SECONDS(2));
	if (err) {
		LOG_ERR("report map read failed: %d", err);
	}
}

/* --- HOGP --- */

static void on_pm_update(struct bt_hogp *hp)
{
	LOG_INF("protocol mode now %s", bt_hogp_pm_get(hp) == BT_HIDS_PM_BOOT ? "boot" : "report");
}

/* Only the report protocol is used. ZMK keyboards such as the Naya Create offer no boot
 * keyboard, and every boot-capable keyboard also speaks the report protocol. */
static void hogp_ready(struct bt_hogp *hp)
{
	struct bt_hogp_rep_info *rep = NULL;
	int subscribed = 0;

	while ((rep = bt_hogp_rep_next(hp, rep)) != NULL) {
		uint8_t id = bt_hogp_rep_id(rep);
		bool input = bt_hogp_rep_type(rep) == BT_HIDS_REPORT_TYPE_INPUT;

		LOG_INF("report id=%u %s", id, input ? "input" : "output/feature");
		if (!input) {
			continue;
		}
		int err = bt_hogp_rep_subscribe(hp, rep, on_report);
		if (err) {
			LOG_ERR("subscribe to report %u failed: %d", id, err);
			continue;
		}
		subscribed++;
	}
	if (subscribed == 0) {
		LOG_ERR("no input report subscribed - keyboard unusable");
		return;
	}
	LOG_INF("keyboard connected, forwarding reports");

	report_map_len = 0;
	k_work_submit(&report_map_work);
}

static void hogp_prep_error(struct bt_hogp *hp, int err)
{
	ARG_UNUSED(hp);
	LOG_ERR("HID service discovery failed: %d", err);
}

static const struct bt_hogp_init_params hogp_init = {
	.ready_cb = hogp_ready,
	.prep_error_cb = hogp_prep_error,
	.pm_update_cb = on_pm_update,
};

/* --- GATT discovery --- */

static void dm_completed(struct bt_gatt_dm *dm, void *ctx)
{
	ARG_UNUSED(ctx);
	int err = bt_hogp_handles_assign(dm, &hogp);
	if (err) {
		LOG_ERR("HOGP handle assignment failed: %d", err);
	}
	bt_gatt_dm_data_release(dm);
}

static void dm_service_not_found(struct bt_conn *conn, void *ctx)
{
	ARG_UNUSED(conn); ARG_UNUSED(ctx);
	LOG_ERR("peer has no HID service");
}

static void dm_error(struct bt_conn *conn, int err, void *ctx)
{
	ARG_UNUSED(conn); ARG_UNUSED(ctx);
	LOG_ERR("service discovery failed: %d", err);
}

static const struct bt_gatt_dm_cb dm_cb = {
	.completed = dm_completed,
	.service_not_found = dm_service_not_found,
	.error_found = dm_error,
};

/* --- Connection --- */

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		LOG_WRN("connection failed: 0x%02x", err);
		bt_scan_start(BT_SCAN_TYPE_SCAN_ACTIVE);
		return;
	}
	stats.connections++;
	LOG_INF("connected, requesting encryption");
	if (bt_conn_set_security(conn, BT_SECURITY_L2)) {
		LOG_WRN("security request failed");
	}
}

static void security_changed(struct bt_conn *conn, bt_security_t level,
			     enum bt_security_err err)
{
	if (err) {
		LOG_WRN("pairing/encryption failed: %d", err);
		return;
	}
	LOG_INF("encrypted (level %d), discovering HID service", level);
	int e = bt_gatt_dm_start(conn, BT_UUID_HIDS, &dm_cb, NULL);
	if (e) {
		LOG_ERR("service discovery could not start: %d", e);
	}
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	ARG_UNUSED(conn);
	stats.disconnects++;
	LOG_INF("disconnected (0x%02x), scanning again", reason);
	if (bt_hogp_assign_check(&hogp)) {
		bt_hogp_release(&hogp);
	}
	bt_scan_start(BT_SCAN_TYPE_SCAN_ACTIVE);
}

BT_CONN_CB_DEFINE(conn_cbs) = {
	.connected = connected,
	.disconnected = disconnected,
	.security_changed = security_changed,
};

/* --- Scanning --- */

static void scan_filter_match(struct bt_scan_device_info *dev,
			      struct bt_scan_filter_match *match, bool connectable)
{
	ARG_UNUSED(match); ARG_UNUSED(connectable);
	char addr[BT_ADDR_LE_STR_LEN];
	bt_addr_le_to_str(dev->recv_info->addr, addr, sizeof(addr));
	LOG_INF("HID device found: %s", addr);
}

static void scan_connecting_error(struct bt_scan_device_info *dev)
{
	ARG_UNUSED(dev);
	LOG_WRN("connecting from scan failed");
}

BT_SCAN_CB_INIT(scan_cb, scan_filter_match, NULL, scan_connecting_error, NULL);

static int scan_setup(void)
{
	struct bt_scan_init_param param = { .connect_if_match = true };
	bt_scan_init(&param);
	bt_scan_cb_register(&scan_cb);

	int err = bt_scan_filter_add(BT_SCAN_FILTER_TYPE_UUID, BT_UUID_HIDS);
	if (err) {
		LOG_ERR("scan filter not set: %d", err);
		return err;
	}
	return bt_scan_filter_enable(BT_SCAN_UUID_FILTER, false);
}

int main(void)
{
	LOG_INF("createflow dongle starting");
	led_on(&led_run);

	/* First and independent of everything else: if anything below fails, the 1200 baud
	 * touch is the only way to load new firmware without opening the case. */
	if (dfu_trigger_start()) {
		LOG_ERR("DFU trigger not started");
	}

	int err = usb_hid_start();
	if (err) {
		LOG_ERR("USB HID start failed: %d", err);
		led_on(&led_error);
		return 0;
	}
	led_on(&led_usb);

	bt_hogp_init(&hogp, &hogp_init);

	err = bt_enable(NULL);
	if (err) {
		LOG_ERR("Bluetooth start failed: %d", err);
		return 0;
	}
	settings_load();   /* restore the bond */
	if (scan_setup()) {
		return 0;
	}
	err = bt_scan_start(BT_SCAN_TYPE_SCAN_ACTIVE);
	if (err) {
		LOG_ERR("scan start failed: %d", err);
		return 0;
	}
	LOG_INF("scanning for the keyboard");
	k_work_schedule(&stats_work, K_SECONDS(30));
	return 0;
}
