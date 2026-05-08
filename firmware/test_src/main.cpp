// Hardware test firmware for ESP32-C3 Super Mini
// Tests: RGB LED cycling, button press/release, MAX3010x sensor
// Emits structured serial lines for automated provisioning scripts.

#include <Arduino.h>
#include <WiFi.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <MAX30105.h>

#define LED_PIN          7
#define LED_COUNT        1
#define BUTTON_PIN       6
#define SDA_PIN          8
#define SCL_PIN          9
#define SERIAL_BAUD_RATE 115200
#define SETUP_DELAY      500
#define LED_PHASE_MS     800
#define SENSOR_POLL_MS   150

Adafruit_NeoPixel pixels(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
MAX30105 sensor;

int  ledPhase       = 0;
int  lastBtnState   = HIGH;
bool sensorOk       = false;

unsigned long lastLedChange   = 0;
unsigned long lastSensorPoll  = 0;

// ── helpers ──────────────────────────────────────────────────────────────────

static void setLedPhase(int phase) {
    switch (phase) {
        case 0: pixels.setPixelColor(0, pixels.Color(255, 0,   0  )); Serial.println("LED:RED");   break;
        case 1: pixels.setPixelColor(0, pixels.Color(0,   255, 0  )); Serial.println("LED:GREEN"); break;
        case 2: pixels.setPixelColor(0, pixels.Color(0,   0,   255)); Serial.println("LED:BLUE");  break;
        case 3: pixels.clear();                                        Serial.println("LED:OFF");   break;
    }
    pixels.show();
}

// ── setup / loop ──────────────────────────────────────────────────────────────

void setup() {
    delay(SETUP_DELAY);
    Serial.begin(SERIAL_BAUD_RATE);
    Serial.println("[Test] FuseBeat Hardware Test v1");

    // MAC address (reads eFuse — no WiFi connection needed)
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    Serial.print("MAC:");
    Serial.println(macStr);

    char deviceId[5];
    snprintf(deviceId, sizeof(deviceId), "%02X%02X", mac[4], mac[5]);
    Serial.print("DEVICE_ID:");
    Serial.println(deviceId);

    // LED
    pixels.begin();
    pixels.setBrightness(200);
    pixels.clear();
    pixels.show();
    Serial.println("LED:INIT");
    setLedPhase(ledPhase);
    lastLedChange = millis();

    // Button
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    Serial.println("BUTTON:INIT");

    // Sensor — recover I2C bus before init (unsticks sensor left mid-transaction
    // by a previous firmware session; normal firmware avoids this by spending
    // several seconds in WiFi setup before reaching sensor init).
    pinMode(SCL_PIN, OUTPUT);
    pinMode(SDA_PIN, OUTPUT);
    digitalWrite(SDA_PIN, HIGH);
    for (int i = 0; i < 9; i++) {
        digitalWrite(SCL_PIN, HIGH); delayMicroseconds(5);
        digitalWrite(SCL_PIN, LOW);  delayMicroseconds(5);
    }
    // STOP condition
    digitalWrite(SDA_PIN, LOW);  delayMicroseconds(5);
    digitalWrite(SCL_PIN, HIGH); delayMicroseconds(5);
    digitalWrite(SDA_PIN, HIGH); delayMicroseconds(5);

    Wire.begin(SDA_PIN, SCL_PIN);
    if (sensor.begin(Wire, I2C_SPEED_FAST)) {
        sensor.setup(0x1F, 4, 2, 400, 411, 4096);
        sensor.setPulseAmplitudeRed(0x0A);
        sensor.setPulseAmplitudeGreen(0);
        sensorOk = true;
        Serial.println("SENSOR:OK");
    } else {
        Serial.println("SENSOR:FAIL");
    }

    Serial.println("[Test] Ready — cycling LED, waiting for button & finger");
}

void loop() {
    unsigned long now = millis();

    // LED cycle R → G → B → off → …
    if (now - lastLedChange >= LED_PHASE_MS) {
        lastLedChange = now;
        ledPhase = (ledPhase + 1) % 4;
        setLedPhase(ledPhase);
    }

    // Button press / release
    int btnState = digitalRead(BUTTON_PIN);
    if (btnState == LOW && lastBtnState == HIGH) {
        Serial.println("BUTTON:PRESSED");
    } else if (btnState == HIGH && lastBtnState == LOW) {
        Serial.println("BUTTON:RELEASED");
    }
    lastBtnState = btnState;

    // Sensor IR reading
    if (sensorOk && now - lastSensorPoll >= SENSOR_POLL_MS) {
        lastSensorPoll = now;
        uint16_t n = sensor.check();
        for (uint16_t i = 0; i < n && sensor.available(); i++) {
            long ir = sensor.getIR();
            sensor.nextSample();
            if (ir > 50000) {
                Serial.print("SENSOR:FINGER_DETECTED ir=");
                Serial.println(ir);
            } else {
                Serial.print("SENSOR:IR=");
                Serial.println(ir);
            }
        }
    }
}
