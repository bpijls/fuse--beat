#ifndef WEBSOCKET_MANAGER_H
#define WEBSOCKET_MANAGER_H

#include "Arduino.h"
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <functional>

typedef std::function<void(const String&)> MessageCallback;

class WebSocketManager {
private:
    WebSocketsClient webSocket;
    bool connected = false;
    String wsHost;
    int wsPort = 80;
    String wsPath = "/";
    String state;

    MessageCallback messageCallback;
    String lastReceivedMessage;
    bool hasNewMessage = false;

    bool isInitialized = false;
    unsigned long lastReconnectAttempt = 0;
    const unsigned long RECONNECT_INTERVAL = 5000;

public:
    WebSocketManager()
        : connected(false)
        , state("DISCONNECTED")
        , hasNewMessage(false)
        , isInitialized(false)
        , lastReconnectAttempt(0)
    {}

    void initialize(const String& wsUrl) {
        if (isInitialized) return;
        parseAndConnect(wsUrl);
        isInitialized = true;
    }

    void update() {
        if (!isInitialized) return;
        webSocket.loop();
        state = connected ? String("CONNECTED") : String("CONNECTING");
    }

    bool sendMessage(const String& message) {
        if (!connected) return false;
        String msg = message;
        webSocket.sendTXT(msg);
        return true;
    }

    bool hasMessage() const { return hasNewMessage; }

    String getMessage() {
        hasNewMessage = false;
        return lastReceivedMessage;
    }

    void setMessageCallback(MessageCallback callback) {
        messageCallback = callback;
    }

    bool isConnected() const { return connected; }
    String getDeviceId() const {
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char buf[5];
        snprintf(buf, sizeof(buf), "%02X%02X", mac[4], mac[5]);
        return String(buf);
    }
    String getState() const { return state; }

    void disconnect() {
        webSocket.disconnect();
        connected = false;
        isInitialized = false;
        state = "DISCONNECTED";
    }

    void reconnect() {
        if (wsHost.length() > 0) {
            webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
        }
    }

    void reinitialize(const String& wsUrl) {
        isInitialized = false;
        connected = false;
        webSocket.disconnect();
        parseAndConnect(wsUrl);
        isInitialized = true;
    }

private:
    void parseAndConnect(const String& wsUrl) {
        if (!wsUrl.startsWith("ws://")) return;

        String rest = wsUrl.substring(5);
        int slash = rest.indexOf('/');
        String hostPort = slash >= 0 ? rest.substring(0, slash) : rest;
        wsPath = slash >= 0 ? rest.substring(slash) : "/";

        int colon = hostPort.indexOf(':');
        if (colon >= 0) {
            wsHost = hostPort.substring(0, colon);
            wsPort = hostPort.substring(colon + 1).toInt();
        } else {
            wsHost = hostPort;
            wsPort = 80;
        }

        webSocket.onEvent([this](WStype_t type, uint8_t * payload, size_t length) {
            if (type == WStype_CONNECTED) {
                connected = true;
                Serial.println("[WS] Connected");
            }
            else if (type == WStype_DISCONNECTED) {
                connected = false;
                Serial.println("[WS] Disconnected");
            }
            else if (type == WStype_TEXT) {
                String message = String((char*)payload);
                lastReceivedMessage = message;
                hasNewMessage = true;
                if (messageCallback) {
                    messageCallback(message);
                }
            }
        });

        webSocket.setReconnectInterval(5000);
        webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
    }
};

// Global WebSocket manager instance
extern WebSocketManager webSocketManager;

#endif // WEBSOCKET_MANAGER_H
