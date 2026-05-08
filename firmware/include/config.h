#ifndef CONFIG_H
#define CONFIG_H

#define LED_PIN         7
#define LED_COUNT       1
#define BUTTON_PIN      6
#define SERIAL_BAUD_RATE 115200
#define SETUP_DELAY     500

// MAX30102 I2C pins for ESP32-C3 (default I2C)
#define SDA_PIN         8
#define SCL_PIN         9

// Sensor settings
#define SENSOR_SAMPLE_RATE    100    // Hz (timer interval; actual FIFO rate may differ)
#define SENSOR_SETTLE_SAMPLES 200    // discard first N valid samples after finger placement (~4 s)
#define BEAT_MIN_INTERVAL_MS  300    // refractory period — blocks detections < 200 BPM
#define BEAT_MIN_SLOPE        3.0f   // minimum negative-slope envelope before detection is armed

#endif // CONFIG_H
