# Technical findings

What the keyboard actually does over Bluetooth, measured on a Naya Create (firmware
0.3.41) in September 2026. Everything here was read from the device with the dongle's own
logging; nothing is inferred from documentation.

## GATT services

| UUID | Service | Handles |
|---|---|---|
| 0x1800 | Generic Access | 0x0009–0x000f |
| 0x1801 | Generic Attribute | 0x0001–0x0008 |
| 0x180a | Device Information | 0x0014–0x001a |
| 0x180f | Battery | 0x0010–0x0013 |
| 0x1812 | **HID** | 0x001b–0x0030 |
| 0x1234 | vendor, one characteristic 0x5678 (read/write/notify) | 0x0031–0x0034 |

The vendor service `0x1234/0x5678` accepts any write, never notifies, and reads back a
single byte (`0x65`). Writing the keyboard's USB configuration frames to it (GET FW
VERSION, addressed to either half) produces no reply. It looks like a placeholder from a
sample project, not a configuration channel. There is no DFU, SMP or UART service.

**Consequence:** the keyboard can only be configured over USB. A "wireless sync" for
layouts and modules would need different keyboard firmware, and Naya's is an encrypted
MCUboot image (entropy 7.99 bits/byte, no readable strings).

## HID

The keyboard runs ZMK. It offers **no boot protocol**; `bt_hogp_rep_boot_kbd_in()` returns
NULL. In the report protocol it exposes four reports:

| Report | Direction | Content | Size |
|---|---|---|---|
| ID 1 | input | keyboard: modifiers, reserved, 6 key codes | 8 bytes |
| ID 1 | output | LEDs (5 bits + padding) | 1 byte |
| ID 2 | input | consumer: 6 × 16-bit usages (media keys, dials) | 12 bytes |
| ID 3 | input | mouse: 5 buttons, X, Y, wheel, AC pan, AC zoom (8-bit relative) | 6 bytes |

The report map is 212 bytes and is reproduced verbatim in `firmware/src/usb_hid.c`. The
dongle re-reads it on every connection and logs a hex dump if it differs.

`bt_hogp_rep_size()` returns 0 for every report until its first notification has arrived.

## Connection behaviour

- Bonding: encryption level 2 (no MITM), bond persisted on both sides. Reconnects by itself
  after keyboard sleep, keyboard restart and dongle restart.
- Sleep: the keyboard drops the link after its configured idle time (supervision timeout
  0x08 in the log); the next key press wakes it and it reconnects within about two seconds.
- Load: 5 201 reports in three minutes with the touchpad in use, peak ~130 reports/s, none
  lost or rejected by USB.

## The original NAYA-100-1 dongle

- USB CDC device (VID 0x37D1, PID 0x012C) speaking the same frame protocol as the keyboard
  halves, but answering on no known address.
- MCUboot bootloader with a vendor signing key; no serial recovery window observed on
  reset or power-up. Metal case, glued/crimped, did not open without damage.
- NayaFlow (1.21.0 and 1.25.1) contains 18 dongle-related strings and a
  `Naya_DeviceDongle` class, but no firmware image for it.

## Nordic open bootloader on the EBYTE E104-BT5040U

- Factory state: boots straight into DFU (VID 0x1915, PID 0x521F, "Open DFU Bootloader").
  Once an application is present it boots that instead.
- DFU entry: reset button (under the case), pin reset, or `GPREGRET == 0xB1` followed by a
  reset. The firmware uses the last two, triggered by opening the serial port at 1200 baud.
- Serial DFU: MTU 256, data objects of 4 096 bytes, application version must not decrease.
