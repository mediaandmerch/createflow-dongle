# Firmware

Zephyr application for the `nrf52840dongle` board, built with nRF Connect SDK v3.4.

## Build and package

```
source ~/ncs/.venv/bin/activate
export ZEPHYR_BASE=~/ncs/zephyr
tools/build-firmware-package.sh      # west build + nrfutil pkg generate
npm run flash                        # onto the stick, no nrfutil needed
```

Built **without MCUboot** so the app links to `0x1000`, where Nordic's open bootloader
expects it. `nrfutil` (Nordic 8.x with `nrfutil install nrf5sdk-tools`) wraps the hex into
a DFU package; the signing key in `firmware/dist/` is a throwaway - the open bootloader
validates by CRC, not against a fixed public key. The bootloader refuses equal or lower
application versions, so the script increments `firmware/dist/app-version` every time.

## What runs where

| File | Role |
|---|---|
| `src/main.c` | BLE central: scan for HID service, connect, bond, subscribe to all input reports, forward to USB. Reads the keyboard's report map and warns if it differs from the one on USB. Logs counters every 30 s. |
| `src/usb_hid.c` | USB HID device with the Naya Create's report map (keyboard, consumer, mouse) plus CDC ACM for logging. |
| `src/dfu_trigger.c` | Watches the USB serial port; at 1200 baud it sets GPREGRET and pin-resets into the bootloader. |
| `prj.conf`, `app.overlay` | Kconfig and devicetree: HID report sizes, 8 KB log FIFO, board USB instance disabled. |

## LEDs

| LED | Meaning |
|---|---|
| led0 (green on Nordic, red on EBYTE) | `main()` reached |
| LED2 blue | USB enabled |
| LED2 red, steady | USB start failed |
| LED2 red, pulsing | bootloader (DFU mode) |

## Logs

`/dev/cu.usbmodem*` (macOS) / `COMx` (Windows) at **115200** baud. Never open the port at
1200 baud unless you want the dongle to reboot into the bootloader. Messages emitted before
the host opens the port are lost; everything after that arrives.

## Things that cost a day

Written down so nobody has to find them again.

- The board enables `CDC_ACM_SERIAL_INITIALIZE_AT_BOOT`, which brings up a USB device before
  `main()` and claims the controller. Our own USB instance then never starts. Set it to `n`.
- `hid_device_register()` returns `-EINVAL` unless `get_report` and `set_protocol` callbacks
  are provided (the latter for boot-protocol interfaces).
- `bMaxPower` of 500 mA made macOS enumerate the device without configuring it. 100 mA.
- With CDC ACM in the same device the class triple must be 0xEF/0x02/0x01 (IAD).
- `bt_hogp_rep_size()` is 0 until the first notification arrives - do not filter on it when
  subscribing.
- ZMK keyboards offer no boot protocol; subscribe to the report-protocol input reports.
- Logging over RTT needs a debugger the bare stick does not have. CDC ACM instead.
- The EBYTE stick's case is a closed snap-fit shell. Never flash a first firmware without a
  software way back into the bootloader (`dfu_trigger.c`), or the case has to be pried open.
