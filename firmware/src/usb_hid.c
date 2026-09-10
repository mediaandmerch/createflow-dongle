/*
 * USB side of the bridge: presents the dongle to the host as a HID device with the
 * keyboard's own report map, plus a CDC ACM port for logging. Input reports from the
 * keyboard are forwarded unchanged, report ID first.
 */
#include "bridge.h"

#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/usb/usbd.h>
#include <zephyr/usb/class/usbd_hid.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(usb_hid, LOG_LEVEL_INF);

/* Report map read from the Naya Create over HID-over-GATT (212 bytes). main.c re-reads it
 * on every connection and warns if the keyboard's map differs from this one.
 *   Report 1: keyboard - 8 bytes in (modifiers, reserved, 6 keys), 1 byte out (LEDs)
 *   Report 2: consumer - 12 bytes in, 6 x 16-bit usages
 *   Report 3: mouse    - 6 bytes in: 5 buttons, x, y, wheel, AC pan, AC zoom
 * Because the host sees the same description as over Bluetooth, nothing is translated. */
static const uint8_t report_map[] = {
	0x05, 0x01, 0x09, 0x06, 0xa1, 0x01, 0x85, 0x01, 0x05, 0x07, 0x19, 0xe0, 0x29, 0xe7, 0x15, 0x00,
	0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02, 0x05, 0x07, 0x75, 0x08, 0x95, 0x01, 0x81, 0x03,
	0x05, 0x07, 0x15, 0x00, 0x26, 0xff, 0x00, 0x19, 0x00, 0x29, 0xff, 0x75, 0x08, 0x95, 0x06, 0x81,
	0x00, 0x05, 0x08, 0x19, 0x01, 0x29, 0x05, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x05, 0x91,
	0x02, 0x75, 0x03, 0x95, 0x01, 0x91, 0x03, 0xc0, 0x05, 0x0c, 0x09, 0x01, 0xa1, 0x01, 0x85, 0x02,
	0x05, 0x0c, 0x15, 0x00, 0x26, 0xff, 0x0f, 0x19, 0x00, 0x2a, 0xff, 0x0f, 0x75, 0x10, 0x95, 0x06,
	0x81, 0x00, 0xc0, 0x05, 0x01, 0x09, 0x02, 0xa1, 0x01, 0x85, 0x03, 0x09, 0x01, 0xa1, 0x00, 0x05,
	0x09, 0x19, 0x01, 0x29, 0x05, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x05, 0x81, 0x02, 0x75,
	0x03, 0x95, 0x01, 0x81, 0x03, 0x05, 0x01, 0x09, 0x30, 0x09, 0x31, 0x15, 0x81, 0x25, 0x7f, 0x75,
	0x08, 0x95, 0x02, 0x81, 0x06, 0xa1, 0x02, 0x09, 0x38, 0x15, 0x81, 0x25, 0x7f, 0x35, 0x00, 0x45,
	0x00, 0x75, 0x08, 0x95, 0x01, 0x81, 0x06, 0xc0, 0xa1, 0x02, 0x05, 0x0c, 0x0a, 0x38, 0x02, 0x15,
	0x81, 0x25, 0x7f, 0x35, 0x00, 0x45, 0x00, 0x75, 0x08, 0x95, 0x01, 0x81, 0x06, 0xc0, 0xa1, 0x02,
	0x0a, 0x2f, 0x02, 0x15, 0x81, 0x25, 0x7f, 0x35, 0x00, 0x45, 0x00, 0x75, 0x08, 0x95, 0x01, 0x81,
	0x06, 0xc0, 0xc0, 0xc0,
};

static const uint8_t report_len[REPORT_ID_MOUSE + 1] = {
	[REPORT_ID_KEYBOARD] = BOOT_KBD_REPORT_LEN,
	[REPORT_ID_CONSUMER] = 12,
	[REPORT_ID_MOUSE] = 6,
};

static const struct device *hid_dev;
static atomic_t usb_ready = ATOMIC_INIT(0);
static atomic_t boot_protocol = ATOMIC_INIT(0);

/* Last report per ID (index = ID) so GET_REPORT can answer; also the aligned send buffer
 * hid_device_submit_report() requires. */
static uint8_t last_report[REPORT_ID_MOUSE + 1][1 + REPORT_MAX_LEN] __aligned(4);

static void iface_ready(const struct device *dev, const bool ready)
{
	ARG_UNUSED(dev);
	atomic_set(&usb_ready, ready ? 1 : 0);
	LOG_INF("USB HID interface %s", ready ? "ready" : "not ready");
}

/* The HID class rejects registration with -EINVAL unless get_report is present, plus
 * set_report when an output report is declared and set_protocol for a boot interface. */

static int get_report(const struct device *dev, const uint8_t type, const uint8_t id,
		      const uint16_t len, uint8_t *const buf)
{
	ARG_UNUSED(dev);

	if (type != HID_REPORT_TYPE_INPUT || id < REPORT_ID_KEYBOARD || id > REPORT_ID_MOUSE ||
	    len < report_len[id]) {
		return -ENOTSUP;
	}
	memcpy(buf, &last_report[id][1], report_len[id]);
	return report_len[id];
}

/* Host sets keyboard LEDs (caps/num/scroll). Accepted, not forwarded yet. */
static int set_report(const struct device *dev, const uint8_t type, const uint8_t id,
		      const uint16_t len, const uint8_t *const buf)
{
	ARG_UNUSED(dev); ARG_UNUSED(type); ARG_UNUSED(id); ARG_UNUSED(len); ARG_UNUSED(buf);
	return 0;
}

/* Only BIOS/UEFI request the boot protocol: no report IDs, keyboard report only.
 * Operating systems stay in the report protocol. */
static void set_protocol(const struct device *dev, const uint8_t proto)
{
	ARG_UNUSED(dev);
	atomic_set(&boot_protocol, proto == HID_PROTOCOL_BOOT);
	LOG_INF("host requests %s protocol", proto == HID_PROTOCOL_BOOT ? "boot" : "report");
}

static const struct hid_device_ops hid_ops = {
	.iface_ready = iface_ready,
	.get_report = get_report,
	.set_report = set_report,
	.set_protocol = set_protocol,
};

/* Nordic's test VID with a PID of our own until a proper one is assigned. */
USBD_DEVICE_DEFINE(dongle_usbd, DEVICE_DT_GET(DT_NODELABEL(zephyr_udc0)), 0x1915, 0x520f);

USBD_DESC_LANG_DEFINE(desc_lang);
USBD_DESC_MANUFACTURER_DEFINE(desc_mfr, "createflow");
USBD_DESC_PRODUCT_DEFINE(desc_product, "createflow Dongle");
USBD_DESC_CONFIG_DEFINE(desc_config, "FS Configuration");

/* Bus powered, bMaxPower in 2 mA units: 50 = 100 mA (the dongle draws well under 50 mA).
 * Asking for the USB maximum of 500 mA made macOS leave the device unconfigured. */
USBD_CONFIGURATION_DEFINE(fs_config, 0, 50, &desc_config);

static int usbd_setup(void)
{
	int err;

	if ((err = usbd_add_descriptor(&dongle_usbd, &desc_lang)) ||
	    (err = usbd_add_descriptor(&dongle_usbd, &desc_mfr)) ||
	    (err = usbd_add_descriptor(&dongle_usbd, &desc_product))) {
		LOG_ERR("descriptor rejected: %d", err);
		return err;
	}
	if ((err = usbd_add_configuration(&dongle_usbd, USBD_SPEED_FS, &fs_config))) {
		LOG_ERR("configuration rejected: %d", err);
		return err;
	}
	if ((err = usbd_register_all_classes(&dongle_usbd, USBD_SPEED_FS, 1, NULL))) {
		LOG_ERR("class registration failed: %d", err);
		return err;
	}
	/* CDC ACM describes itself with an interface association descriptor, which requires
	 * the "miscellaneous / common / IAD" device class triple. */
	if ((err = usbd_device_set_code_triple(&dongle_usbd, USBD_SPEED_FS,
					       USB_BCC_MISCELLANEOUS, 0x02, 0x01))) {
		LOG_ERR("device class rejected: %d", err);
		return err;
	}
	return 0;
}

int usb_hid_start(void)
{
	int err;

	hid_dev = DEVICE_DT_GET_ONE(zephyr_hid_device);
	if (!device_is_ready(hid_dev)) {
		LOG_ERR("HID device not ready");
		return -EIO;
	}
	if ((err = hid_device_register(hid_dev, report_map, sizeof(report_map), &hid_ops))) {
		LOG_ERR("HID registration failed: %d", err);
		return err;
	}
	if ((err = usbd_setup()) || (err = usbd_init(&dongle_usbd))) {
		return err;
	}
	if ((err = usbd_enable(&dongle_usbd))) {
		LOG_ERR("USB enable failed: %d", err);
		return err;
	}
	LOG_INF("USB HID device registered (keyboard, consumer, mouse)");
	return 0;
}

int usb_hid_send(uint8_t report_id, const uint8_t *data, size_t len)
{
	if (report_id < REPORT_ID_KEYBOARD || report_id > REPORT_ID_MOUSE ||
	    len != report_len[report_id]) {
		return -EINVAL;
	}
	if (!atomic_get(&usb_ready)) {
		return -EAGAIN;
	}

	uint8_t *buf = last_report[report_id];
	buf[0] = report_id;
	memcpy(&buf[1], data, len);

	if (atomic_get(&boot_protocol)) {
		if (report_id != REPORT_ID_KEYBOARD) {
			return 0;
		}
		return hid_device_submit_report(hid_dev, len, &buf[1]);
	}
	return hid_device_submit_report(hid_dev, 1 + len, buf);
}

const uint8_t *usb_hid_report_map(size_t *len)
{
	*len = sizeof(report_map);
	return report_map;
}
