#ifndef PUBLISH_PROCESS_H
#define PUBLISH_PROCESS_H

#include "Process.h"
#include "WebSocketManager.h"
#include "Configuration.h"
#include "ProcessManager.h"
#include "processes/SensorProcess.h"
#include "processes/ButtonProcess.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include "version.h"

class PublishProcess : public Process {
public:
    PublishProcess() : Process(), wasConnected(false) {}

    void setup() override {}

    void update() override {
        bool nowConnected = webSocketManager.isConnected();

        // Send identify message on fresh connection
        if (nowConnected && !wasConnected) {
            sendIdentify();
        }
        wasConnected = nowConnected;

        if (!nowConnected) return;

        // Send heartbeat event when a beat is detected and the button is held
        SensorProcess*  sensor = static_cast<SensorProcess*>(processManager->getProcess("sensor"));
        ButtonProcess*  btn    = static_cast<ButtonProcess*>(processManager->getProcess("button"));
        if (sensor && sensor->hasBeat() && btn && btn->isPressed()) {
            sendHeartbeat();
        }
    }

private:
    bool wasConnected;

    void sendIdentify() {
        // Read MAC directly at send time — WiFi.macAddress() is reliable
        // once the WS connection is up, whereas the stored String in
        // WebSocketManager can come back as nullptr (empty buffer) in ArduinoJson.
        char macBuf[18];
        uint8_t macBytes[6];
        WiFi.macAddress(macBytes);
        snprintf(macBuf, sizeof(macBuf), "%02X:%02X:%02X:%02X:%02X:%02X",
                 macBytes[0], macBytes[1], macBytes[2],
                 macBytes[3], macBytes[4], macBytes[5]);

        JsonDocument doc;
        doc["type"]        = "identify";
        doc["client_type"] = "device";
        doc["device_id"]   = webSocketManager.getDeviceId();
        doc["mac"]         = macBuf;
        doc["version"]     = FIRMWARE_VERSION;
        doc["feed_id"]     = configuration.getFeedId();
        doc["color"]       = configuration.getDeviceColor();

        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
        Serial.print("[Publish] Identified as: ");
        Serial.print(webSocketManager.getDeviceId());
        Serial.print(" mac=");
        Serial.println(macBuf);
    }

    void sendHeartbeat() {
        JsonDocument doc;
        doc["type"]         = "heartbeat";
        doc["device_id"]    = webSocketManager.getDeviceId();
        doc["feed_id"]      = configuration.getFeedId();
        doc["timestamp_ms"] = (unsigned long)millis();

        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
        Serial.printf("[Publish] heartbeat sent (t=%lu ms)\n", (unsigned long)millis());
    }
};

#endif // PUBLISH_PROCESS_H
