#ifndef LED_BEHAVIORS_H
#define LED_BEHAVIORS_H

#include <Adafruit_NeoPixel.h>
#include "Timer.h"
#include "Utils.h"

// --- LED Behavior Base Class ---
class LedBehavior {
protected:
    uint32_t color;
    Timer updateTimer;
public:
    const char* type;
    virtual ~LedBehavior() {}
    virtual void setup(Adafruit_NeoPixel& pixels) {
        this->pixels = &pixels;
    }
    virtual void update() = 0;
    virtual void reset() {
        updateTimer.resetMillis();
    }

    void setColor(uint32_t color) { this->color = color; }
    void setTimerInterval(uint32_t interval) { updateTimer.interval = interval; }

protected:
    LedBehavior(const char* type) : type(type) {}
    Adafruit_NeoPixel* pixels;
    uint32_t scaleColor(uint32_t color, uint8_t brightness) {
        uint8_t r = (uint8_t)(((color >> 16) & 0xFF) * brightness / 255);
        uint8_t g = (uint8_t)(((color >> 8)  & 0xFF) * brightness / 255);
        uint8_t b = (uint8_t)((color & 0xFF)          * brightness / 255);
        return pixels->Color(r, g, b);
    }
};

// 1. LedsOffBehavior
class LedsOffBehavior : public LedBehavior {
public:
    LedsOffBehavior() : LedBehavior("Off") {}
    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        this->pixels->clear();
        this->pixels->show();
    }
    void update() override {}
};

// 2. SolidBehavior
class SolidBehavior : public LedBehavior {
public:
    SolidBehavior(uint32_t color = 0) : LedBehavior("Solid") { setColor(color); }
    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        this->pixels->fill(color);
        this->pixels->show();
    }
    void update() override {}
};

// 3. BreathingBehavior
class BreathingBehavior : public LedBehavior {
public:
    uint32_t duration;
    BreathingBehavior(uint32_t color = 0xFF0000, uint32_t duration = 2000)
        : LedBehavior("Breathing"), duration(duration) {
        setColor(color);
        setTimerInterval(20); // 50Hz
    }
    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        updateTimer.reset();
    }
    void update() override {
        if (updateTimer.checkAndReset()) {
            float sine_wave = sin(updateTimer.elapsed() * 2.0 * PI / duration);
            uint8_t brightness = (uint8_t)(((sine_wave + 1.0) / 2.0) * 255.0);
            pixels->fill(scaleColor(color, brightness));
            pixels->show();
        }
    }
};

// 4. HeartBeatBehavior — double-flash pattern
class HeartBeatBehavior : public LedBehavior {
public:
    unsigned long pulse_duration;
    unsigned long pulse_interval;

    HeartBeatBehavior(uint32_t color = 0xFF0000, unsigned long duration = 770, unsigned long interval = 2000)
        : LedBehavior("HeartBeat"),
          pulse_duration(duration),
          pulse_interval(interval),
          state(IDLE),
          stateStartTime(0),
          currentStateDuration(0) {
        setColor(color);
        setTimerInterval(20); // 50Hz
    }

    void setup(Adafruit_NeoPixel& pixels) override {
        LedBehavior::setup(pixels);
        state = IDLE;
        stateStartTime = updateTimer.elapsed();
        currentStateDuration = pulse_interval;
        updateTimer.reset();
        this->pixels->clear();
        this->pixels->show();
    }

    void update() override {
        if (!updateTimer.checkAndReset()) return;

        unsigned long currentTime = updateTimer.elapsed();
        unsigned long elapsed = currentTime - stateStartTime;

        switch (state) {
            case IDLE:
                if (elapsed >= currentStateDuration) {
                    startState(FADE_IN_1, getScaledDuration(FADE_IN_1_DUR));
                }
                break;

            case FADE_IN_1: {
                if (elapsed >= currentStateDuration) {
                    pixels->fill(color);
                    pixels->show();
                    startState(FADE_OUT_1, getScaledDuration(FADE_OUT_1_DUR));
                } else {
                    uint8_t brightness = (elapsed * 255) / currentStateDuration;
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }

            case FADE_OUT_1: {
                if (elapsed >= currentStateDuration) {
                    pixels->clear();
                    pixels->show();
                    startState(PAUSE, getScaledDuration(PAUSE_DUR));
                } else {
                    uint8_t brightness = 255 - (elapsed * 255 / currentStateDuration);
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }

            case PAUSE:
                if (elapsed >= currentStateDuration) {
                    startState(FADE_IN_2, getScaledDuration(FADE_IN_2_DUR));
                }
                break;

            case FADE_IN_2: {
                if (elapsed >= currentStateDuration) {
                    pixels->fill(color);
                    pixels->show();
                    startState(FADE_OUT_2, getScaledDuration(FADE_OUT_2_DUR));
                } else {
                    uint8_t brightness = (elapsed * 255) / currentStateDuration;
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }

            case FADE_OUT_2: {
                if (elapsed >= currentStateDuration) {
                    pixels->clear();
                    pixels->show();
                    startState(IDLE, pulse_interval);
                } else {
                    uint8_t brightness = 255 - (elapsed * 255 / currentStateDuration);
                    pixels->fill(scaleColor(color, brightness));
                    pixels->show();
                }
                break;
            }
        }
    }

    void setParams(uint32_t c, unsigned long dur, unsigned long inter) {
        setColor(c);
        pulse_duration = dur;
        pulse_interval = inter;
    }

private:
    enum BeatState { IDLE, FADE_IN_1, FADE_OUT_1, PAUSE, FADE_IN_2, FADE_OUT_2 };
    BeatState state;
    unsigned long stateStartTime;
    unsigned long currentStateDuration;

    static const unsigned long BASE_DURATION   = 770;
    static const unsigned long FADE_IN_1_DUR   = 60;
    static const unsigned long FADE_OUT_1_DUR  = 150;
    static const unsigned long PAUSE_DUR       = 100;
    static const unsigned long FADE_IN_2_DUR   = 60;
    static const unsigned long FADE_OUT_2_DUR  = 400;

    void startState(BeatState newState, unsigned long duration) {
        state = newState;
        stateStartTime = updateTimer.elapsed();
        currentStateDuration = duration;
    }

    unsigned long getScaledDuration(unsigned long base_part_duration) {
        if (pulse_duration == 0 || BASE_DURATION == 0) return 0;
        return (base_part_duration * pulse_duration) / BASE_DURATION;
    }
};

// Global behavior instances
extern LedsOffBehavior     ledsOff;
extern SolidBehavior       ledsSolid;
extern BreathingBehavior   ledsBreathing;
extern HeartBeatBehavior   ledsHeartBeat;

#endif // LED_BEHAVIORS_H
