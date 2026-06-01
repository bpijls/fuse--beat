#ifndef BUTTON_PROCESS_H
#define BUTTON_PROCESS_H

#include "Process.h"
#include "config.h"
#include "Configuration.h"

class ButtonProcess : public Process {
public:
    ButtonProcess()
        : Process(),
          lastState(HIGH),
          pressedAt(0),
          longPressHandled(false)
    {}

    bool isPressed() const { return lastState == LOW; }

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
            // Button released — no action on short press
        }

        lastState = state;
    }

private:
    int lastState;
    unsigned long pressedAt;
    bool longPressHandled;
};

#endif // BUTTON_PROCESS_H
