#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Generate version header ───────────────────────────────────────────────────
BASE="$(cat VERSION | tr -d '[:space:]')"
HASH="$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
VERSION="${BASE}+${HASH}"
cat > include/version.h <<EOF
#pragma once
#define FIRMWARE_VERSION "${VERSION}"
EOF
echo "[build] firmware version: ${VERSION}"

# Write version for copy-firmware.sh to pick up
mkdir -p .pio/build/esp32c3_supermini
echo -n "${VERSION}" > .pio/build/esp32c3_supermini/version.txt

# ── Build ─────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--test" ]]; then
    shift
    pio run --environment esp32c3_supermini_test "$@"
else
    pio run --environment esp32c3_supermini "$@"
fi
