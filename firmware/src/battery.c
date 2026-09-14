/*
 * Reads the keyboard's charge over the standard GATT Battery Service (0x180F), characteristic
 * Battery Level (0x2A19): once when the link comes up, then through notifications.
 *
 * One figure only. The Naya Create's whole GATT table, listed from the dongle on 2026-09-14 after
 * encryption, has a single 0x2A19 (value handle 0x0012) and no second one for the other half; the
 * rest is GAP, Device Information, HID and the unused vendor service 0x1234/0x5678. The charge of
 * each half separately is only available over the keyboard's USB protocol.
 */
#include "battery.h"

#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <bluetooth/gatt_dm.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(battery, LOG_LEVEL_INF);

static struct bt_gatt_subscribe_params sub;
static struct bt_gatt_read_params read_params;
static int level = -1;
static void (*on_change)(void);

void battery_on_change(void (*cb)(void))
{
	on_change = cb;
}

int battery_level(void)
{
	return level;
}

void battery_reset(void)
{
	level = -1;
	sub.value_handle = 0; /* a fresh subscription is set up on the next connection */
}

static void set_level(uint8_t pct)
{
	if (pct > 100 || pct == level) {
		return;
	}
	level = pct;
	if (on_change) {
		on_change();
	}
}

static uint8_t notify_cb(struct bt_conn *conn, struct bt_gatt_subscribe_params *params,
			 const void *data, uint16_t len)
{
	ARG_UNUSED(conn);
	if (!data) { /* the keyboard cancelled the subscription */
		params->value_handle = 0;
		return BT_GATT_ITER_STOP;
	}
	if (len >= 1) {
		set_level(((const uint8_t *)data)[0]);
	}
	return BT_GATT_ITER_CONTINUE;
}

static uint8_t read_cb(struct bt_conn *conn, uint8_t err, struct bt_gatt_read_params *params,
		       const void *data, uint16_t len)
{
	ARG_UNUSED(conn); ARG_UNUSED(params);
	if (!err && data && len >= 1) {
		set_level(((const uint8_t *)data)[0]);
	}
	return BT_GATT_ITER_STOP;
}

static void dm_completed(struct bt_gatt_dm *dm, void *ctx)
{
	ARG_UNUSED(ctx);
	struct bt_conn *conn = bt_gatt_dm_conn_get(dm);
	const struct bt_gatt_dm_attr *chrc = bt_gatt_dm_char_by_uuid(dm, BT_UUID_BAS_BATTERY_LEVEL);
	const struct bt_gatt_dm_attr *val =
		chrc ? bt_gatt_dm_desc_by_uuid(dm, chrc, BT_UUID_BAS_BATTERY_LEVEL) : NULL;

	if (!val) {
		LOG_WRN("battery service has no battery-level value");
		bt_gatt_dm_data_release(dm);
		return;
	}

	read_params.func = read_cb;
	read_params.handle_count = 1;
	read_params.single.handle = val->handle;
	read_params.single.offset = 0;
	int err = bt_gatt_read(conn, &read_params);

	if (err) {
		LOG_WRN("battery read failed: %d", err);
	}

	const struct bt_gatt_dm_attr *ccc = bt_gatt_dm_desc_by_uuid(dm, chrc, BT_UUID_GATT_CCC);

	if (ccc) {
		sub.notify = notify_cb;
		sub.value = BT_GATT_CCC_NOTIFY;
		sub.value_handle = val->handle;
		sub.ccc_handle = ccc->handle;
		err = bt_gatt_subscribe(conn, &sub);
		if (err && err != -EALREADY) {
			LOG_WRN("battery subscribe failed: %d", err);
		}
	}
	bt_gatt_dm_data_release(dm);
}

static void dm_service_not_found(struct bt_conn *conn, void *ctx)
{
	ARG_UNUSED(conn); ARG_UNUSED(ctx);
	LOG_INF("keyboard has no battery service over BLE");
}

static void dm_error(struct bt_conn *conn, int err, void *ctx)
{
	ARG_UNUSED(conn); ARG_UNUSED(ctx);
	LOG_WRN("battery service discovery failed: %d", err);
}

static const struct bt_gatt_dm_cb dm_cb = {
	.completed = dm_completed,
	.service_not_found = dm_service_not_found,
	.error_found = dm_error,
};

void battery_discover(struct bt_conn *conn)
{
	int err = bt_gatt_dm_start(conn, BT_UUID_BAS, &dm_cb, NULL);

	if (err) {
		LOG_WRN("battery discovery could not start: %d", err);
	}
}
