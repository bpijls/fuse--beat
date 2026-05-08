#ifndef LED_PROCESS_H
#define LED_PROCESS_H

#include "Process.h"
#include "processes/LedBehaviors.h"
#include "config.h"
#include <Adafruit_NeoPixel.h>

class LedProcess : public Process {
public:
    LedProcess() : Process(), pixels(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800), currentBehavior(nullptr) {}

    void setup() override {
        pixels.begin();
        pixels.setBrightness(200);
        pixels.clear();
        pixels.show();

        ledsOff.setup(pixels);
        ledsSolid.setup(pixels);
        ledsBreathing.setup(pixels);
        ledsHeartBeat.setup(pixels);

        // Start with breathing red while waiting for WiFi
        ledsBreathing.setColor(0xFF0000);
        setBehavior(&ledsBreathing);
    }

    void update() override {
        if (currentBehavior) {
            currentBehavior->update();
        }
    }

    void setBehavior(LedBehavior* behavior) {
        if (!behavior) return;
        currentBehavior = behavior;
        currentBehavior->setup(pixels);
    }

    // Called when a fused_beat is received from the server
    void triggerBeat(uint32_t color, unsigned long interval_ms) {
        ledsHeartBeat.setParams(color, 770, interval_ms);
        setBehavior(&ledsHeartBeat);
    }

    void setConnectedColor(uint32_t color) {
        ledsBreathing.setColor(color);
        setBehavior(&ledsBreathing);
    }

private:
    Adafruit_NeoPixel pixels;
    LedBehavior* currentBehavior;
};

#endif // LED_PROCESS_H
