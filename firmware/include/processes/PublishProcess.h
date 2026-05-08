#ifndef PUBLISH_PROCESS_H
#define PUBLISH_PROCESS_H

#include "Process.h"
#include "WebSocketManager.h"
#include "Configuration.h"
#include "ProcessManager.h"
#include "processes/SensorProcess.h"
#include <ArduinoJson.h>

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

        // Send heartbeat event when a beat is detected
        SensorProcess* sensor = static_cast<SensorProcess*>(processManager->getProcess("sensor"));
        if (sensor && sensor->hasBeat()) {
            sendHeartbeat(sensor->getBPM());
        }
    }

private:
    bool wasConnected;

    void sendIdentify() {
        JsonDocument doc;
        doc["type"]        = "identify";
        doc["client_type"] = "device";
        doc["device_id"]   = webSocketManager.getDeviceId();
        doc["feed_id"]     = configuration.getFeedId();
        doc["color"]       = configuration.getDeviceColor();

        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
        Serial.print("[Publish] Identified as: ");
        Serial.println(webSocketManager.getDeviceId());
    }

    void sendHeartbeat(float bpm) {
        JsonDocument doc;
        doc["type"]         = "heartbeat";
        doc["device_id"]    = webSocketManager.getDeviceId();
        doc["feed_id"]      = configuration.getFeedId();
        doc["bpm"]          = (int)bpm;
        doc["timestamp_ms"] = (unsigned long)millis();

        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
    }
};

#endif // PUBLISH_PROCESS_H
