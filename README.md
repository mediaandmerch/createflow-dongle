# createflow Dongle

Open firmware and a one-click flasher that turn a $10 nRF52840 USB stick into a wireless
dongle for the **Naya Create** keyboard.

Naya shipped a dongle with every keyboard but never finished the firmware for it. The
company went into insolvency in August 2026, so that firmware isn't coming. This project
fills the gap: the stick pairs with the keyboard over Bluetooth, just like a laptop would,
and shows up on your computer as an ordinary USB keyboard, media controller and mouse. It
uses nothing but standard Bluetooth HID, which the Naya already speaks.

**Status:** keys, touchpad, dials and media keys all work. Flashing is tested on macOS,
Windows and Linux (Ubuntu 24.04). See [Known limits](#known-limits) for what hasn't been
covered yet.

## What you need

- An **EBYTE E104-BT5040U** — an nRF52840 USB stick that sells for around $10 on Amazon.
  Nordic's own nRF52840 Dongle (PCA10059) works too, and so should any nRF52840 stick
  that ships with Nordic's open DFU bootloader.
- A Naya Create with a spare Bluetooth slot.
- The flasher app for your OS from [Releases](../../releases), or Node 20+ if you'd rather
  run it from source.

## Flashing the stick

1. Plug the stick in. Fresh out of the box it boots straight into the bootloader — the
   LED pulses red. No button to press, no driver to install.
2. Open **createflow Dongle** and click **Flash firmware**. It takes about ten seconds.
3. That's it. The stick reboots as the dongle.

Updates work the same way. The app sends the running dongle back into the bootloader over
USB (the same 1200-baud trick Arduino boards use), so you never need to touch the reset
button.

**Windows:** the installer isn't code-signed yet, so SmartScreen will say "Windows
protected your PC". Click *More info*, then *Run anyway*.
**Linux:** your user needs permission to open serial ports — usually the `dialout` or
`uucp` group, depending on your distribution (`sudo usermod -aG dialout $USER`, then log
out and back in). The app tells you if that's missing. The AppImage needs no
installation; make it executable and run it.

## Pairing the keyboard

Switch the Naya to a Bluetooth slot that isn't already paired with another computer: hold
the **layer key** (bottom-left on the default layout) and press **1**, **2**, **3** or
**4**. On a free slot the keyboard advertises openly; the dongle picks it up, pairs and
remembers it. Use the same key combination to switch back to your computer's built-in
Bluetooth later.

Keep the keyboard unplugged from USB while pairing — when it's on a cable, it sends
keystrokes over the cable instead.

**If the dongle stops typing.** When the keyboard no longer has the key for the dongle (its
slot was cleared or paired again), firmware up to 0.1.2 kept retrying the old key and never
paired again. Since 0.1.3 the dongle forgets that key by itself and pairs anew within a few
seconds; update the firmware with the flasher app if yours is older. The dongle's serial port
is its log: open it at 115200 baud (never 1200 — that restarts it into the bootloader) to see
lines like `forgot the stale bond …` and `keyboard connected, forwarding reports`.

## Building from source

```
npm install
npm test                                   # protocol tests against a simulated bootloader
npm run flash                              # flash firmware/dist/createflow-dongle.zip
npm run dev -w @createflow-dongle/flasher  # run the app in development mode
```

The firmware is a Zephyr application for the `nrf52840dongle` board, built with nRF
Connect SDK v3.4 (`west`) and packaged with `nrfutil`. See
[firmware/README.md](firmware/README.md).

## How it works

```
Naya Create ──Bluetooth HID──▶ dongle ──USB HID──▶ computer
                                 │
                                 └── USB serial: log output, 1200-baud DFU trigger
```

- `firmware/` — Zephyr app. Bluetooth central and HID-over-GATT client on one side, a USB
  HID device with the keyboard's own report descriptor on the other, plus a serial port
  for logs and the DFU trigger.
- `packages/dfu/` — Nordic's serial DFU protocol in TypeScript, so the flasher doesn't
  depend on `nrfutil`. Tested against a simulated bootloader.
- `packages/serial/` — the serialport glue: find the stick, send the 1200-baud touch, open
  the port.
- `apps/flasher/` — the Electron app.
- `docs/` — [why this project exists](docs/background.md) and
  [what we learned about the keyboard](docs/findings.md).

## Known limits

- The USB report descriptor is a verbatim copy of the Naya Create's. A different keyboard,
  or a future Naya firmware with a different descriptor, won't work out of the box. The
  dongle logs the mismatch together with the keyboard's descriptor, so it can be pasted
  into `usb_hid.c`.
- Long-term stability and host sleep/wake haven't been characterised yet. The dongle
  prints counters to its serial port every 30 seconds (115200 baud — never 1200, that
  triggers DFU).
- Changing the keyboard's layout or modules still needs the USB cable. That's the
  keyboard, not the dongle: the Naya has no configuration channel over Bluetooth — see
  [findings](docs/findings.md). Typing, touchpad and dials all run wireless.
- Linux was tested on Ubuntu 24.04 only. Other distributions should work but haven't
  been tried.

## Code signing

Release builds are produced by [GitHub Actions](.github/workflows/build.yml) from the
source in this repository, so every binary can be traced back to a commit.

- **macOS:** signed with a Developer ID certificate and notarized by Apple.
- **Windows:** free code signing provided by [SignPath.io](https://signpath.io), certificate
  by [SignPath Foundation](https://signpath.org). *(Application pending — until it is
  approved, Windows builds are unsigned and SmartScreen will warn once.)*

**Code signing policy.** Authors of this project can modify the source code without review.
Changes contributed by others are reviewed by a maintainer before they are merged. Every
release is approved for signing by a maintainer (Sünkel Media & Merch) and built from a
tagged commit by the workflow above; nothing that isn't in this repository ends up in a
signed binary.

**Privacy.** The flasher app does not collect, store or transmit any data about you. It talks
to the USB stick over a serial port. Its only network request: once per start it asks GitHub
(`api.github.com`) for the newest release, to show a notice when there is a newer version
(GitHub sees the usual IP address, nothing else is sent). Untick *Check GitHub for new
versions* at the bottom of the window and it makes no network connection at all. The
firmware on the dongle only ever communicates with the paired keyboard and the host it is
plugged into.

## License

Apache-2.0. Not affiliated with Naya B.V.
