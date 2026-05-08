#ifndef BUTTON_PROCESS_H
#define BUTTON_PROCESS_H

#include "Process.h"
#include "config.h"
#include "Configuration.h"

extern bool rawSignalMode;

class ButtonProcess : public Process {
public:
    ButtonProcess()
        : Process(),
          lastState(HIGH),
          pressedAt(0),
          longPressHandled(false)
    {}

    void setup() override {
        pinMode(BUTTON_PIN, INPUT_PULLUP);
    }

    void update() override {
        int state = digitalRead(BUTTON_PIN);
        unsigned long now = millis();

        if (state == LOW && lastState == HIGH) {
            // Button just pressed
            pressedAt = now;
            longPressHandled = false;
        }
        else if (state == LOW && lastState == LOW) {
            // Button held down
            if (!longPressHandled && (now - pressedAt) > 3000) {
                // Long press: print config
                Serial.println("[Button] Long press — printing config:");
                configuration.printConfiguration();
                longPressHandled = true;
            }
        }
        else if (state == HIGH && lastState == LOW) {
            // Button released
            unsigned long held = now - pressedAt;
            if (!longPressHandled && held < 1000) {
                // Short press: toggle raw mode
                rawSignalMode = !rawSignalMode;
                Serial.print("[Button] Raw signal mode: ");
                Serial.println(rawSignalMode ? "ON" : "OFF");
            }
        }

        lastState = state;
    }

private:
    int lastState;
    unsigned long pressedAt;
    bool longPressHandled;
};

#endif // BUTTON_PROCESS_H
