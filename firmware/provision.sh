#!/usr/bin/env bash
# provision.sh — Configure a FuseBeat device over serial
#
# Usage: ./provision.sh [PORT]
#   PORT  Serial port (default: /dev/ttyACM0)
#
# Requires: python3 + pyserial  (pip install pyserial)
set -euo pipefail

PORT="${1:-/dev/ttyACM0}"

python3 - "$PORT" << 'PYEOF'
import sys
import time

try:
    import serial
except ImportError:
    print("[ERROR] pyserial not found. Install with: pip install pyserial")
    sys.exit(1)

port = sys.argv[1]

COMMANDS = [
    ("wifi RnB morestreet",         "[Serial] WiFi credentials saved"),
    ("server ws://192.168.0.40:5001/ws", "[Serial] Server URL saved"),
]

def open_port(port, baud=115200):
    for attempt in range(5):
        try:
            s = serial.Serial(port, baud, timeout=1)
            return s
        except serial.SerialException:
            if attempt == 4:
                raise
            time.sleep(1)

print(f"[Provision] Opening {port}...")
ser = open_port(port)
time.sleep(2)  # wait for device to finish booting / reset on DTR

ser.reset_input_buffer()

for cmd, expected_ack in COMMANDS:
    print(f"[Provision] >> {cmd}")
    ser.write((cmd + "\n").encode())
    ser.flush()

    deadline = time.time() + 5
    acked = False
    while time.time() < deadline:
        raw = ser.readline()
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        print(f"             << {line}")
        if expected_ack in line:
            acked = True
            break

    if not acked:
        print(f"[FAIL] No acknowledgement for: {cmd}")
        ser.close()
        sys.exit(1)

ser.close()
print("\n[OK] Device provisioned successfully.")
PYEOF
