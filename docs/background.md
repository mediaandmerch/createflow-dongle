# Why this project exists

The **Naya Create** is a modular split keyboard (Kickstarter 2023, 1,699 backers) with
hot-swappable modules — touchpad, dials, trackball. Every unit came with a USB wireless
dongle (NAYA-100-1) that never worked. In early 2026 Naya confirmed the dongle was "not
yet active" and would be "enabled in a future firmware update". Their NayaFlow release
notes had reserved Bluetooth slot 5 for it back in May 2025 and were still fixing
dongle-related crashes in July 2026, but the feature never shipped.

On 18 August 2026, Naya B.V. of Groningen was declared bankrupt (Rechtbank
Noord-Nederland, case F.18/26/214). The web shop kept running as if nothing had happened;
the product page still lists "RF (coming soon)".

The keyboard's built-in Bluetooth works fine, so a dongle isn't strictly necessary. But
Bluetooth means pairing on every computer, no typing in the BIOS or at some login screens,
and the connection drops that many users have reported. A dongle that looks like a wired
keyboard to the host sidesteps all of that.

## Why the original dongle can't be reused

The NAYA-100-1 has an nRF52 chip running MCUboot with a vendor signing key. It only
accepts images signed by Naya, its metal case doesn't open without damage, and the
firmware it runs offers no way into a recovery mode. Details are in [findings](findings.md).

## The replacement

Any nRF52840 USB stick that ships with Nordic's **open** DFU bootloader can be flashed over
USB with nothing more than a cable. The EBYTE E104-BT5040U is one such stick, sold for
around $10; Nordic's own nRF52840 Dongle (PCA10059) is another.

The firmware is a Zephyr application built on nRF Connect SDK. Towards the keyboard it acts
as a Bluetooth central and HID-over-GATT client; towards the host it's a USB HID device
carrying the keyboard's own report descriptor, so no translation is needed. The flasher app
implements Nordic's serial DFU protocol itself, so users need neither `nrfutil` nor any
driver.

This project is not affiliated with Naya B.V.
