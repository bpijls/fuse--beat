#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.pio/build/esp32c3_supermini"

PORT="${1:-/dev/ttyUSB0}"

PLATFORMIO_PACKAGES="$HOME/.platformio/packages"
BOOT_APP0="$PLATFORMIO_PACKAGES/framework-arduinoespressif32/tools/partitions/boot_app0.bin"

esptool \
  --chip esp32c3 \
  --port "$PORT" \
  --baud 921600 \
  --before default_reset \
  --after hard_reset \
  write_flash \
  --flash_mode qio \
  --flash_freq 80m \
  --flash_size detect \
  0x0000  "$BUILD_DIR/bootloader.bin" \
  0x8000  "$BUILD_DIR/partitions.bin" \
  0xe000  "$BOOT_APP0" \
  0x10000 "$BUILD_DIR/firmware.bin"
