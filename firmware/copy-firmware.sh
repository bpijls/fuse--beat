#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/.pio/build/esp32c3_supermini"
DST="$SCRIPT_DIR/../server/static/firmware"

if [[ ! -f "$SRC/firmware.bin" ]]; then
  echo "firmware.bin not found — run 'pio run' first" >&2
  exit 1
fi

mkdir -p "$DST"
cp "$SRC/bootloader.bin" "$SRC/partitions.bin" "$SRC/firmware.bin" "$DST/"
echo "Copied firmware binaries to $DST"
