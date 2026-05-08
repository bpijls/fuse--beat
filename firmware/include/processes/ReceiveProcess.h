#ifndef RECEIVE_PROCESS_H
#define RECEIVE_PROCESS_H

#include "Process.h"
#include "WebSocketManager.h"
#include "Configuration.h"
#include "ProcessManager.h"
#include "processes/LedProcess.h"
#include "Utils.h"
#include <ArduinoJson.h>

class ReceiveProcess : public Process {
public:
    ReceiveProcess() : Process() {}

    void setup() override {
        webSocketManager.setMessageCallback([this](const String& msg) {
            handleMessage(msg);
        });
    }

    void update() override {}

private:
    void handleMessage(const String& raw) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, raw);
        if (err) {
            Serial.print("[Receive] JSON parse error: ");
            Serial.println(err.c_str());
            return;
        }

        String type = doc["type"] | "";

        if (type == "fused_beat") {
            unsigned long interval_ms = doc["interval_ms"] | 1000;
            // Use configured color (server may override via config message)
            uint32_t color = hexToColor(configuration.getDeviceColor());

            LedProcess* led = static_cast<LedProcess*>(processManager->getProcess("led"));
            if (led) {
                led->triggerBeat(color, interval_ms);
            }
        }
        else if (type == "config") {
            // Server can push config updates
            String color  = doc["color"]   | "";
            String feedId = doc["feed_id"] | "";
            if (color.length()  > 0) configuration.setDeviceColor(color);
            if (feedId.length() > 0) configuration.setFeedId(feedId);
            Serial.println("[Receive] Config updated from server");
        }
        else if (type == "identified") {
            Serial.println("[Receive] Server acknowledged identification");
        }
        else if (type == "pong") {
            // keepalive
        }
    }
};

#endif // RECEIVE_PROCESS_H
