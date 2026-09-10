# Why this exists

The **Naya Create** is a modular split keyboard (Kickstarter 2023, 1 699 backers) with
swappable modules - touchpad, dials, trackball. It shipped with a USB wireless dongle
(NAYA-100-1) that never worked: Naya confirmed in early 2026 that the dongle was "not yet
active" and would be "enabled in a future firmware update". NayaFlow release notes reserved
Bluetooth slot 5 for it in May 2025 and fixed dongle-related crashes as late as July 2026,
but never enabled it.

On 18 August 2026 Naya B.V. (Groningen) was declared bankrupt (Rechtbank Noord-Nederland,
F.18/26/214). The shop kept selling; the product page still says "RF (coming soon)".

The keyboard's Bluetooth works, so the dongle is not strictly needed - but plain Bluetooth
means pairing per computer, no BIOS/login-screen typing on some hosts, and the connection
drops many users reported. A dongle that behaves like a wired keyboard avoids all of that.

## Why the original dongle cannot be reused

The NAYA-100-1 contains an nRF52 with MCUboot and a vendor signing key. It accepts only
images signed by Naya, its metal case does not open without damage, and the running
firmware offers no way into a recovery mode. Details in [findings](findings.md).

## The replacement

Any nRF52840 USB stick that ships with Nordic's **open** DFU bootloader can be flashed over
USB with no tools beyond a cable. The EBYTE E104-BT5040U is such a stick, sold for about
€10; the original Nordic nRF52840 Dongle (PCA10059) is another.

The firmware is a Zephyr application (nRF Connect SDK): BLE central and HID-over-GATT client
towards the keyboard, USB HID device towards the host, carrying the keyboard's own report
map so nothing has to be translated. The flasher app talks Nordic's serial DFU protocol
itself, so users need neither `nrfutil` nor a driver.

This project is not affiliated with Naya B.V.
