# createflow Dongle

Open firmware and a one-click flasher that turn a $10 nRF52840 USB stick into a wireless
dongle for the **Naya Create** keyboard.

Naya shipped a dongle with every keyboard but never finished the firmware for it. The
company went into insolvency in August 2026, so that firmware isn't coming. This project
fills the gap: the stick pairs with the keyboard over Bluetooth, just like a laptop would,
and shows up on your computer as an ordinary USB keyboard, media controller and mouse. It
uses nothing but standard Bluetooth HID, which the Naya already speaks.

**Status:** keys, touchpad, dials and media keys all work. Tested on macOS and Windows.
See [Known limits](#known-limits) for what hasn't been covered yet.

## What you need

- An **EBYTE E104-BT5040U** — an nRF52840 USB stick that sells for around $10 on Amazon
  or AliExpress. Nordic's own nRF52840 Dongle (PCA10059) works too, and so should any
  nRF52840 stick that ships with Nordic's open DFU bootloader.
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
`uucp` group, depending on your distribution.

## Pairing the keyboard

Switch the Naya to a Bluetooth slot that isn't already paired with another computer: hold
the **layer key** (bottom-left on the default layout) and press **1**, **2**, **3** or
**4**. On a free slot the keyboard advertises openly; the dongle picks it up, pairs and
remembers it. Use the same key combination to switch back to your computer's built-in
Bluetooth later.

Keep the keyboard unplugged from USB while pairing — when it's on a cable, it sends
keystrokes over the cable instead.

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
- Keyboard LEDs (caps lock and friends) aren't passed back to the keyboard.
- Long-term stability and host sleep/wake haven't been characterised yet. The dongle
  prints counters to its serial port every 30 seconds (115200 baud — never 1200, that
  triggers DFU).
- Configuring the keyboard itself (layouts, modules) still requires USB. The Naya has no
  configuration channel over Bluetooth — see [findings](docs/findings.md).
- The Linux build hasn't been tested on hardware.

## License

Apache-2.0. Not affiliated with Naya B.V.
