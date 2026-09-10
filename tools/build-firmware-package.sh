#!/bin/zsh
# Build the firmware and wrap it into a DFU package for Nordic's open bootloader.
#
#   tools/build-firmware-package.sh            build + package (version counts up)
#   tools/build-firmware-package.sh --no-build package the existing build only
#
# Needs nRF Connect SDK (west) and nrfutil (Nordic 8.x with nrf5sdk-tools). The bootloader
# refuses equal or lower application versions, so the number in firmware/dist/app-version
# is incremented on every package. Flash with: npm run flash
set -eu

export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FW="$ROOT/firmware"
DIST="$FW/dist"
mkdir -p "$DIST"

if [ "${1:-}" != "--no-build" ]; then
  # Without MCUboot, so the app links to 0x1000 where the open bootloader expects it.
  ( cd "$FW" && west build -b nrf52840dongle -p always -d build --no-sysbuild )
fi
[ -f "$FW/build/zephyr/zephyr.hex" ] || { echo "No build in firmware/build - run without --no-build first."; exit 1; }

# Throwaway key: the open bootloader validates the app by CRC, not against a fixed public key.
[ -f "$DIST/dfu-sign.pem" ] || nrfutil keys generate "$DIST/dfu-sign.pem" >/dev/null

VERSION=$(( $(cat "$DIST/app-version" 2>/dev/null || echo 0) + 1 ))
nrfutil pkg generate --hw-version 52 --sd-req 0x00 \
  --application "$FW/build/zephyr/zephyr.hex" --application-version "$VERSION" \
  --app-boot-validation VALIDATE_GENERATED_CRC \
  --key-file "$DIST/dfu-sign.pem" "$DIST/createflow-dongle.zip" >/dev/null
echo "$VERSION" > "$DIST/app-version"
echo "firmware/dist/createflow-dongle.zip (application version $VERSION)"
