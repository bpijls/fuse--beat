#!/usr/bin/env bash
# provision.sh — Build & flash test firmware, capture MAC, run hardware tests
#
# Usage: ./provision.sh [PORT] [--no-build]
#   PORT        Serial port (default: /dev/ttyUSB0)
#   --no-build  Skip firmware build (use existing .pio/build/… binary)
#
# Requires: python3 + pyserial  (pip install pyserial)
#           esptool              (pip install esptool)
#           pio                  (PlatformIO CLI)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.pio/build/esp32c3_supermini_test"
WHITELIST="$SCRIPT_DIR/whitelist.txt"

PORT="/dev/ttyACM0"
DO_BUILD=1

for arg in "$@"; do
    case "$arg" in
        --no-build) DO_BUILD=0 ;;
        /dev/*)     PORT="$arg" ;;
        *)          PORT="$arg" ;;  # accept any port string
    esac
done

# ── 1. Build ──────────────────────────────────────────────────────────────────
if [[ $DO_BUILD -eq 1 ]]; then
    echo "[Provision] Building test firmware..."
    cd "$SCRIPT_DIR"
    pio run --environment esp32c3_supermini_test
fi

# ── 2. Flash ──────────────────────────────────────────────────────────────────
echo "[Provision] Flashing test firmware to $PORT..."
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

echo "[Provision] Flash complete — starting serial tests..."
echo ""

# ── 3. Interactive serial tests (Python) ─────────────────────────────────────
python3 - "$PORT" "$WHITELIST" << 'PYEOF'
import sys
import time

try:
    import serial
except ImportError:
    print("[ERROR] pyserial not found. Install with: pip install pyserial")
    sys.exit(1)

port       = sys.argv[1]
whitelist  = sys.argv[2]

TIMEOUT_BOOT   = 15   # seconds to wait for MAC after reset
TIMEOUT_BUTTON = 30   # seconds to wait for button press+release
TIMEOUT_SENSOR = 30   # seconds to wait for finger on sensor

def banner(title):
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"{'='*50}")

def open_port(port, baud=115200):
    # Retry a few times — device may still be rebooting
    for attempt in range(5):
        try:
            s = serial.Serial(port, baud, timeout=1)
            return s
        except serial.SerialException as e:
            if attempt == 4:
                raise
            time.sleep(1)

# Open port
ser = open_port(port)
time.sleep(0.5)

mac               = None
device_id         = None
sensor_ok         = False
sensor_result_rcv = False

# ── Boot: wait for MAC ────────────────────────────────────────────────────────
banner("BOOT — reading device identity")
print(f"[Wait] Listening on {port} (up to {TIMEOUT_BOOT}s)...")
start = time.time()
while time.time() - start < TIMEOUT_BOOT:
    raw = ser.readline()
    line = raw.decode("utf-8", errors="replace").strip()
    if not line:
        continue
    print(f"  << {line}")

    if line.startswith("MAC:"):
        mac = line[4:]
        print(f"[OK] MAC address: {mac}")
        with open(whitelist, "a") as f:
            f.write(mac + "\n")
        print(f"[OK] MAC appended to {whitelist}")

    if line.startswith("DEVICE_ID:"):
        device_id = line[10:]
        print(f"[OK] Device ID: {device_id}")

    if line == "SENSOR:OK":
        sensor_ok = True
        sensor_result_rcv = True
        print("[OK] Sensor initialised")
    elif line == "SENSOR:FAIL":
        sensor_result_rcv = True
        print("[FAIL] MAX3010x not detected — check wiring!")

    if mac and device_id and sensor_result_rcv:
        break

if not mac:
    print("[FAIL] Did not receive MAC within timeout — is the device connected?")
    sys.exit(1)

# ── Button test ───────────────────────────────────────────────────────────────
banner("BUTTON TEST")
print(f"[Prompt] Press and release the button on the device (up to {TIMEOUT_BUTTON}s)...")
state  = "waiting_press"
passed = False
start  = time.time()

while time.time() - start < TIMEOUT_BUTTON:
    line = ser.readline().decode("utf-8", errors="replace").strip()
    if not line:
        continue

    if "BUTTON:" in line:
        print(f"  << {line}")

    if state == "waiting_press" and line == "BUTTON:PRESSED":
        state = "waiting_release"
        print("[OK] Press detected — release the button...")
    elif state == "waiting_release" and line == "BUTTON:RELEASED":
        passed = True
        break

if not passed:
    print("[FAIL] Button test timed out")
    sys.exit(1)
print("[PASS] Button test passed")

# ── Sensor test ───────────────────────────────────────────────────────────────
banner("SENSOR TEST")
if not sensor_ok:
    print("[FAIL] Sensor did not initialise — skipping finger test")
    sys.exit(1)

print(f"[Prompt] Place your finger on the MAX3010x sensor (up to {TIMEOUT_SENSOR}s)...")
passed = False
start  = time.time()

while time.time() - start < TIMEOUT_SENSOR:
    line = ser.readline().decode("utf-8", errors="replace").strip()
    if not line:
        continue

    if "SENSOR:" in line:
        print(f"  << {line}")

    if "SENSOR:FINGER_DETECTED" in line:
        passed = True
        break

if not passed:
    print("[FAIL] Sensor test timed out — no finger detected")
    sys.exit(1)
print("[PASS] Sensor test passed")

# ── Summary ───────────────────────────────────────────────────────────────────
banner("RESULT")
print(f"  MAC:        {mac}")
print(f"  DEVICE_ID:  {device_id}")
print(f"  Button:     PASS")
print(f"  Sensor:     PASS")
print(f"\n  Whitelist:  {whitelist}")
print("\n[PASS] All hardware tests passed")
ser.close()
PYEOF

