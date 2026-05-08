#ifndef WIFI_PROCESS_H
#define WIFI_PROCESS_H

#include "Process.h"
#include "Timer.h"
#include "Configuration.h"
#include <WiFiMulti.h>
#include <WiFi.h>

class WiFiProcess : public Process {
public:
    WiFiProcess()
        : Process(),
          connectionCheckTimer(5000),
          reconnectAttemptTimer(10000),
          isConnected(false),
          reconnectAttempts(0),
          maxReconnectAttempts(10)
    {}

    void setup() override {
        WiFi.mode(WIFI_STA);
        String ssid = configuration.getWifiSSID();
        String pass = configuration.getWifiPassword();
        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), pass.c_str());
            Serial.print("[WiFi] Connecting to: ");
            Serial.println(ssid);
        } else {
            Serial.println("[WiFi] No SSID configured — set via serial: wifi <ssid> <pass>");
        }
        if (ssid.length() > 0) attemptConnection();
    }

    void update() override {
        if (connectionCheckTimer.checkAndReset()) {
            checkConnection();
        }
        if (!isConnected && reconnectAttemptTimer.checkAndReset()) {
            if (reconnectAttempts < maxReconnectAttempts) {
                attemptConnection();
            }
        }
    }

    bool isWiFiConnected() const { return isConnected; }

    String getIPAddress() const {
        return isConnected ? WiFi.localIP().toString() : String("");
    }

    void forceReconnect() {
        isConnected = false;
        reconnectAttempts = 0;
        WiFi.disconnect();
        reconnectAttemptTimer.reset();
    }

    void updateCredentials(const String& ssid, const String& pass) {
        wifiMulti = WiFiMulti();
        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), pass.c_str());
        }
        forceReconnect();
    }

private:
    void checkConnection() {
        bool was = isConnected;
        isConnected = (WiFi.status() == WL_CONNECTED);
        if (isConnected && !was) {
            Serial.print("[WiFi] Connected, IP: ");
            Serial.println(WiFi.localIP());
            reconnectAttempts = 0;
        } else if (!isConnected && was) {
            Serial.println("[WiFi] Connection lost");
            reconnectAttemptTimer.reset();
        }
    }

    void attemptConnection() {
        reconnectAttempts++;
        Serial.print("[WiFi] Attempt ");
        Serial.print(reconnectAttempts);
        Serial.print("/");
        Serial.println(maxReconnectAttempts);
        uint8_t result = wifiMulti.run(10000);
        if (result == WL_CONNECTED) {
            isConnected = true;
            reconnectAttempts = 0;
            Serial.print("[WiFi] Connected, IP: ");
            Serial.println(WiFi.localIP());
        } else {
            isConnected = false;
        }
    }

    Timer connectionCheckTimer;
    Timer reconnectAttemptTimer;
    WiFiMulti wifiMulti;
    bool isConnected;
    int reconnectAttempts;
    int maxReconnectAttempts;
};

#endif // WIFI_PROCESS_H
