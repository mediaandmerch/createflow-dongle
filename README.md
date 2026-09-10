# createflow Dongle

Open firmware and a one-button flasher that turn a €10 nRF52840 USB stick into the
wireless dongle for the **Naya Create** keyboard.

Naya shipped a dongle (NAYA-100-1) but never released firmware for it, and since the
company's insolvency in August 2026 nobody will. This project replaces it: the stick
connects to the keyboard over Bluetooth like a computer would, receives its HID reports and
hands them to the host as a plain USB keyboard, consumer control and mouse. No Naya
protocol involved - the keyboard already speaks standard Bluetooth HID.

**Status:** keyboard, touchpad, dials and media keys work. Tested on macOS and Windows.
See [Known limits](#known-limits) for what is not covered yet.

## What you need

- **EBYTE E104-BT5040U** (nRF52840 USB stick, ~€10 on Amazon/AliExpress). The original
  Nordic nRF52840 Dongle (PCA10059) works as well; any nRF52840 stick with Nordic's open
  DFU bootloader should.
- A Naya Create with a free Bluetooth slot.
- The flasher app for your OS from the [releases](../../releases), or Node 20+ to run it
  from source.

## Flash the dongle

1. Plug in the stick. Out of the box it starts in the bootloader (LED pulses red) - no
   button, no driver.
2. Open **createflow Dongle** and click **Flash firmware**. About ten seconds.
3. Done. The stick restarts as the dongle.

Updating later works the same way: the app sends the running dongle back into the
bootloader over USB (a 1200 baud "touch", like Arduino boards), no button needed.

On **Windows** the installer is not code-signed yet; SmartScreen shows "Windows protected
your PC" - click *More info* → *Run anyway*. On **Linux** your user needs access to the
serial port (`dialout` or `uucp` group, depending on the distribution).

## Pair the keyboard

Put the Naya on a free Bluetooth slot: hold the **layer key** (bottom left on the default
layout) and press **1**–**4**. On a free slot the keyboard advertises openly; the dongle
finds it, pairs and remembers it. Use the same key to switch back to your computer's own
Bluetooth later. Keep the Naya off USB while pairing - plugged in, it outputs over USB.

## Build from source

```
npm install
npm test                                   # protocol tests against a fake bootloader
npm run flash                              # flash firmware/dist/createflow-dongle.zip
npm run dev -w @createflow-dongle/flasher  # the app in development mode
```

The firmware is a Zephyr application for `nrf52840dongle`, built with nRF Connect SDK
v3.4 (`west`) and packaged with `nrfutil` - see [firmware/README.md](firmware/README.md).

## How it works

```
Naya Create ──BLE HID (HOGP)──▶ dongle ──USB HID──▶ computer
                                  │
                                  └── USB serial: log output, 1200 baud DFU trigger
```

- `firmware/` - Zephyr app: BLE central + HID-over-GATT client, USB HID device with the
  keyboard's own report map, CDC ACM log port, software DFU trigger.
- `packages/dfu/` - Nordic's serial DFU protocol in TypeScript, so the flasher needs no
  `nrfutil`. Tested against a fake bootloader.
- `packages/serial/` - serialport binding: find the stick, 1200 baud touch, open the port.
- `apps/flasher/` - the Electron app.
- `docs/` - [why this exists](docs/background.md) and
  [technical findings](docs/findings.md) about the keyboard.

## Known limits

- The USB report map is a fixed copy of the Naya Create's. A different keyboard or a Naya
  firmware with a different map will not work as is; the dongle logs the mismatch and the
  keyboard's map so it can be copied into `usb_hid.c`.
- Keyboard LEDs (caps lock etc.) are not forwarded to the keyboard.
- Long-term use and host sleep/wake are not yet characterised. The dongle logs counters
  every 30 s on its serial port (115200 baud - never 1200, that triggers DFU).
- Configuring the keyboard (layouts, modules) still needs USB; the Naya offers no
  configuration channel over Bluetooth - see [findings](docs/findings.md).
- Linux builds are untested on hardware.

## License

Apache-2.0. Not affiliated with Naya B.V.
