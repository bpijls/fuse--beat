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

VERSION=""
[[ -f "$SRC/version.txt" ]] && VERSION="$(cat "$SRC/version.txt")" && cp "$SRC/version.txt" "$DST/"

# Rewrite manifest.json with the current version in the name field
cat > "$DST/manifest.json" <<EOF
{
  "name": "FuseBeat${VERSION:+ $VERSION}",
  "new_install_prompt_erase": true,
  "builds": [
    {
      "chipFamily": "ESP32-C3",
      "parts": [
        { "path": "bootloader.bin", "offset": 0 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "firmware.bin",   "offset": 65536 }
      ]
    }
  ]
}
EOF

echo "Copied firmware binaries to $DST"
