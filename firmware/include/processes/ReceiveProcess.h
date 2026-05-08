#ifndef RECEIVE_PROCESS_H
#define RECEIVE_PROCESS_H

#include "Process.h"
#include "WebSocketManager.h"
#include "Configuration.h"
#include "ProcessManager.h"
#include "processes/LedProcess.h"
#include "Utils.h"
#include <ArduinoJson.h>

// Two heartbeat_event messages arriving within this window (ms) are treated as
// the same beat propagated through multiple groups — only the first is used.
static constexpr unsigned long BEAT_DEDUP_WINDOW_MS = 200;

class ReceiveProcess : public Process {
public:
    ReceiveProcess() : Process(), lastTriggerMs(0) {}

    void setup() override {}

    // Poll for messages in update() — NOT from the WebSocket callback.
    // Calling sendMessage() from inside webSocket.loop() re-enters the library
    // and corrupts its internal state.
    void update() override {
        if (!webSocketManager.hasMessage()) return;
        handleMessage(webSocketManager.getMessage());
    }

private:
    unsigned long lastTriggerMs;

    void handleMessage(const String& raw) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, raw);
        if (err) {
            Serial.print("[Receive] JSON parse error: ");
            Serial.println(err.c_str());
            return;
        }

        String type = doc["type"] | "";

        if (type == "identified") {
            Serial.println("[Receive] Identified — fetching groups");
            sendGetDeviceGroups();
        }
        else if (type == "device_groups") {
            JsonArray groups = doc["groups"].as<JsonArray>();
            for (JsonVariant g : groups) {
                sendSubscribe(g.as<String>());
            }
        }
        else if (type == "heartbeat_event") {
            String deviceId = doc["device_id"] | "?";
            String color    = doc["color"]     | "";
            String groupId  = doc["group_id"]  | "?";
            Serial.printf("[Receive] heartbeat_event device=%s color=%s group=%s\n",
                          deviceId.c_str(), color.c_str(), groupId.c_str());

            unsigned long now = millis();
            if (now - lastTriggerMs < BEAT_DEDUP_WINDOW_MS) return;
            lastTriggerMs = now;

            uint32_t ledColor = color.length() > 0
                ? hexToColor(color)
                : hexToColor(configuration.getDeviceColor());

            LedProcess* led = static_cast<LedProcess*>(processManager->getProcess("led"));
            if (led) led->triggerBeat(ledColor, 800);
        }
        else if (type == "config") {
            String color  = doc["color"]   | "";
            String feedId = doc["feed_id"] | "";
            if (color.length()  > 0) configuration.setDeviceColor(color);
            if (feedId.length() > 0) configuration.setFeedId(feedId);
            Serial.println("[Receive] Config updated from server");
        }
        else if (type == "pong") {
            // keepalive
        }
    }

    void sendGetDeviceGroups() {
        JsonDocument doc;
        doc["type"]      = "get_device_groups";
        doc["device_id"] = webSocketManager.getDeviceId();
        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
    }

    void sendSubscribe(const String& groupId) {
        JsonDocument doc;
        doc["type"]     = "subscribe";
        doc["group_id"] = groupId;
        String msg;
        serializeJson(doc, msg);
        webSocketManager.sendMessage(msg);
        Serial.println("[Receive] Subscribed to group: " + groupId);
    }
};

#endif // RECEIVE_PROCESS_H
