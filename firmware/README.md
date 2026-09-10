# Firmware

A Zephyr application for the `nrf52840dongle` board, built with nRF Connect SDK v3.4.

## Building and packaging

```
source ~/ncs/.venv/bin/activate
export ZEPHYR_BASE=~/ncs/zephyr
tools/build-firmware-package.sh      # west build + nrfutil pkg generate
npm run flash                        # flash it — no nrfutil required for this step
```

The app is built **without MCUboot**, so it links at `0x1000`, where Nordic's open
bootloader expects it. `nrfutil` (Nordic's 8.x tool with `nrfutil install nrf5sdk-tools`)
wraps the hex file into a DFU package. The signing key in `firmware/dist/` is a throwaway:
the open bootloader validates the image by CRC, not against a fixed public key. Since the
bootloader rejects any application version that isn't higher than the one installed, the
script bumps `firmware/dist/app-version` on every run.

## Source layout

| File | What it does |
|---|---|
| `src/main.c` | Bluetooth central: scans for the HID service, connects, bonds, subscribes to every input report and forwards them to USB. Reads the keyboard's report descriptor and warns if it differs from the one baked into USB. Prints counters every 30 s. |
| `src/usb_hid.c` | USB HID device using the Naya Create's report descriptor (keyboard, consumer, mouse), plus a CDC ACM port for logging. |
| `src/dfu_trigger.c` | Watches the serial port. When the host opens it at 1200 baud, sets GPREGRET and pin-resets into the bootloader. |
| `prj.conf`, `app.overlay` | Kconfig and devicetree: HID report sizes, 8 KB log FIFO, the board's default USB instance disabled. |

## LEDs

| LED | Meaning |
|---|---|
| LED 1 (green on Nordic's dongle, red on the EBYTE) | `main()` is running |
| LED 2, blue | USB is up |
| LED 2, solid red | USB failed to start |
| LED 2, pulsing red | bootloader (DFU mode) |

## Logs

Open `/dev/cu.usbmodem*` (macOS) or `COMx` (Windows) at **115200** baud. Don't open the
port at 1200 baud unless you want the dongle to drop into the bootloader. Anything logged
before the host opens the port is lost; everything after that comes through.

## Lessons learned

Written down so nobody has to rediscover them.

- The board enables `CDC_ACM_SERIAL_INITIALIZE_AT_BOOT` by default, which brings up a USB
  device *before* `main()` and grabs the controller. Our own USB device then never comes
  up. Set it to `n`.
- `hid_device_register()` fails with `-EINVAL` unless you provide `get_report` and
  `set_protocol` callbacks (the latter for boot-protocol interfaces).
- Declaring `bMaxPower` as 500 mA made macOS enumerate the device but never configure it.
  100 mA works.
- With CDC ACM in the same device, the device class triple has to be 0xEF/0x02/0x01 (IAD).
- `bt_hogp_rep_size()` returns 0 until the first notification arrives, so don't filter on
  size when subscribing.
- ZMK keyboards don't implement the boot protocol; subscribe to report-protocol input
  reports instead.
- RTT logging needs a debugger, which a bare USB stick doesn't have. Use CDC ACM.
- The EBYTE stick's case is a sealed snap-fit shell. Never flash a first firmware that has
  no software route back into the bootloader (`dfu_trigger.c`), or you'll be prying the
  case open.
