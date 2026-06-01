#ifndef WIFI_PROCESS_H
#define WIFI_PROCESS_H

#include "Process.h"
#include "Timer.h"
#include "Configuration.h"
#include <WiFi.h>

class WiFiProcess : public Process {
public:
    WiFiProcess()
        : Process(),
          statusTimer(2000),
          isConnected(false)
    {}

    void setup() override {
        WiFi.mode(WIFI_STA);
        WiFi.setAutoReconnect(true);
        String ssid = configuration.getWifiSSID();
        String pass = configuration.getWifiPassword();
        if (ssid.length() > 0) {
            startConnection(ssid, pass);
        } else {
            Serial.println("[WiFi] No SSID configured — set via serial: wifi <ssid> <pass>");
        }
    }

    void update() override {
        if (statusTimer.checkAndReset()) {
            checkStatus();
        }
    }

    bool isWiFiConnected() const { return isConnected; }

    String getIPAddress() const {
        return isConnected ? WiFi.localIP().toString() : String("");
    }

    void updateCredentials(const String& ssid, const String& pass) {
        isConnected = false;
        WiFi.disconnect();
        startConnection(ssid, pass);
    }

private:
    void startConnection(const String& ssid, const String& pass) {
        Serial.print("[WiFi] Connecting to: ");
        Serial.println(ssid);
        WiFi.begin(ssid.c_str(), pass.c_str());
    }

    void checkStatus() {
        bool was = isConnected;
        isConnected = (WiFi.status() == WL_CONNECTED);
        if (isConnected && !was) {
            Serial.print("[WiFi] Connected, IP: ");
            Serial.println(WiFi.localIP());
        } else if (!isConnected && was) {
            Serial.println("[WiFi] Connection lost");
        }
    }

    Timer statusTimer;
    bool isConnected;
};

#endif // WIFI_PROCESS_H
