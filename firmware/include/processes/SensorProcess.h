#ifndef SENSOR_PROCESS_H
#define SENSOR_PROCESS_H

#include "Process.h"
#include "Timer.h"
#include "config.h"
#include <Wire.h>
#include <MAX30105.h>

extern bool rawSignalMode;

class SensorProcess : public Process {
public:
    SensorProcess()
        : Process(),
          sampleTimer(1000 / SENSOR_SAMPLE_RATE),
          smoothed(0.0f),
          dcLevel(0.0f),
          prevAC(0.0f),
          smoothSlope(0.0f),
          negSlopeEnv(0.0f),
          inFallingFlank(false),
          settleCount(0),
          beatDetected(false),
          lastBeatTime(0),
          currentBPM(0.0f),
          lastBeatInterval(0)
    {}

    void setup() override {
        // Recover I2C bus — unsticks the sensor if it was left mid-transaction
        // by a previous firmware session (e.g. after flashing test firmware).
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

        if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
            Serial.println("[Sensor] MAX30102 not found! Check wiring.");
            halt();
            return;
        }

        // ledMode=2: Red+IR only; getIR() returns the IR channel
        sensor.setup(0x1F, 4, 2, 400, 411, 4096);
        sensor.setPulseAmplitudeRed(0x0A);
        sensor.setPulseAmplitudeGreen(0);
        Serial.println("[Sensor] MAX30102 initialized");
        sampleTimer.reset();
    }

    void update() override {
        beatDetected = false;

        if (!sampleTimer.checkAndReset()) return;

        // check() returns the number of new samples pulled from the FIFO; use
        // it to bound the loop so we never spin on uninitialized sense state.
        uint16_t newSamples = sensor.check();

        for (uint16_t s = 0; s < newSamples && sensor.available(); s++) {
            long irValue = sensor.getIR();
            sensor.nextSample();

            // No finger — reset all state
            if (irValue < 50000) {
                dcLevel        = (float)irValue;
                smoothed       = (float)irValue;
                prevAC         = 0.0f;
                smoothSlope    = 0.0f;
                negSlopeEnv    = 0.0f;
                inFallingFlank = false;
                settleCount    = 0;
                if (rawSignalMode) {
                    Serial.print(irValue); Serial.print(','); Serial.println(irValue);
                }
                continue;
            }

            // Seed filters on very first valid sample (after no-finger state)
            if (dcLevel < 50000.0f) {
                dcLevel     = (float)irValue;
                smoothed    = (float)irValue;
                settleCount = 0;
            }

            // Two-stage IIR bandpass approximation:
            //   Stage 1: fast low-pass (~12 Hz at 100 Hz) removes shot noise
            //   Stage 2: slow low-pass (~1 Hz) tracks the DC baseline
            //   AC = stage1 − stage2  →  passes the 1–12 Hz heartbeat band
            smoothed = 0.75f * smoothed + 0.25f * (float)irValue;
            dcLevel  = 0.98f * dcLevel  + 0.02f * smoothed;
            float ac = smoothed - dcLevel;

            // Settling period: let the DC filter converge and flush startup
            // transients before engaging detection (~200 samples ≈ 4 s at 50 Hz).
            if (settleCount < SENSOR_SETTLE_SAMPLES) {
                settleCount++;
                prevAC      = ac;
                negSlopeEnv = 0.0f;
                if (rawSignalMode) {
                    Serial.print(irValue); Serial.print(','); Serial.println(irValue);
                }
                continue;
            }

            // --- Falling-flank detection ---
            //
            // Strategy: compute the slope of the AC signal (first derivative),
            // smooth it to reduce noise, then detect when the slope plunges
            // below a threshold — the sharp negative-going edge that follows
            // the systolic peak.
            //
            // Signal analysis shows the falling flank reaches its steepest
            // point ~150 ms after the AC peak and drops from ~0 to -35
            // in 2–3 samples (much faster than the rising flank).

            // Smoothed slope: 2-tap average of consecutive AC differences to
            // reduce single-sample noise while keeping flank sharpness.
            float rawSlope  = ac - prevAC;
            smoothSlope     = 0.5f * smoothSlope + 0.5f * rawSlope;
            prevAC          = ac;

            // Adaptive envelope of the negative slope (fast attack, moderate decay).
            // Tracks the steepest recent falling edge so the threshold self-calibrates
            // to signal amplitude without manual tuning.
            float negSlope = -smoothSlope;
            if (negSlope > negSlopeEnv) negSlopeEnv = negSlope;
            else                        negSlopeEnv *= 0.997f;

            // Detect the START of a falling flank:
            // smoothSlope crosses below 35% of the recent steepest descent.
            // Hysteresis: "in flank" is cleared only when slope returns above
            // a small positive threshold (+5% of envelope), preventing re-fire
            // on the slope plateau mid-descent.
            float fallThresh  = -0.35f * negSlopeEnv;
            float resetThresh =  0.05f * negSlopeEnv;

            bool nowFalling = (smoothSlope < fallThresh) && (negSlopeEnv > BEAT_MIN_SLOPE);
            bool thisBeat   = false;

            unsigned long now = millis();
            if (nowFalling && !inFallingFlank && (now - lastBeatTime) > BEAT_MIN_INTERVAL_MS) {
                if (lastBeatTime > 0) {
                    lastBeatInterval = now - lastBeatTime;
                    float bpm = 60000.0f / (float)lastBeatInterval;
                    if (bpm >= 40.0f && bpm <= 200.0f) {
                        currentBPM   = bpm;
                        beatDetected = true;
                        thisBeat     = true;
                    }
                }
                lastBeatTime = now;
            }

            // Reset flank flag when slope recovers (signal climbs again)
            if (inFallingFlank && smoothSlope > resetThresh) inFallingFlank = false;
            if (nowFalling) inFallingFlank = true;

            // Raw mode: two comma-separated values.
            // Channel 2 = irValue+1000 on the exact detection sample.
            if (rawSignalMode) {
                long marker = thisBeat ? irValue + 1000L : irValue;
                Serial.print(irValue);
                Serial.print(',');
                Serial.println(marker);
            }
        }
    }

    bool hasBeat() const { return beatDetected; }
    float getBPM() const { return currentBPM; }
    unsigned long getLastBeatInterval() const { return lastBeatInterval; }

private:
    MAX30105 sensor;
    Timer sampleTimer;

    // IIR filter state
    float    smoothed;
    float    dcLevel;

    // Falling-flank detector state
    float    prevAC;
    float    smoothSlope;
    float    negSlopeEnv;
    bool     inFallingFlank;
    uint16_t settleCount;

    bool          beatDetected;
    unsigned long lastBeatTime;
    float         currentBPM;
    unsigned long lastBeatInterval;
};

#endif // SENSOR_PROCESS_H
