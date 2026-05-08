#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ "${1:-}" == "--test" ]]; then
    shift
    pio run --environment esp32c3_supermini_test "$@"
else
    pio run --environment esp32c3_supermini "$@"
fi
