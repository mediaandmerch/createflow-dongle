/* Shared interface between the BLE side (main.c) and the USB side (usb_hid.c). */
#ifndef CREATEFLOW_DONGLE_BRIDGE_H
#define CREATEFLOW_DONGLE_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

/* Reports as described by the Naya Create's HID report map (read from the keyboard over
 * BLE; the same map is offered on USB, see usb_hid.c). */
#define REPORT_ID_KEYBOARD  1   /* in: 8 bytes (modifiers, reserved, 6 keys); out: 1 byte LEDs */
#define REPORT_ID_CONSUMER  2   /* in: 12 bytes, 6 x 16-bit consumer usages (media, dials) */
#define REPORT_ID_MOUSE     3   /* in: 6 bytes: buttons, x, y, wheel, pan, zoom */
#define REPORT_MAX_LEN      12

#define BOOT_KBD_REPORT_LEN 8

/** Register and enable the USB HID device (plus CDC ACM for logging). 0 on success. */
int usb_hid_start(void);

/** Send an input report to the host; the report ID is prepended.
 *  -EAGAIN while the host has not opened the interface yet, -EINVAL if id/len do not
 *  match the report map. */
int usb_hid_send(uint8_t report_id, const uint8_t *data, size_t len);

/** The report map offered on USB, for comparison with the keyboard's. */
const uint8_t *usb_hid_report_map(size_t *len);

/** Watch the USB serial port for the 1200 baud touch and reboot into the bootloader.
 *  Without it, every firmware update needs the reset button under the case. */
int dfu_trigger_start(void);

#endif
