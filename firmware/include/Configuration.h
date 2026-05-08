#ifndef CONFIGURATION_H
#define CONFIGURATION_H

#include "Arduino.h"
#include <ArduinoJson.h>
#include <Preferences.h>

class Configuration {
private:
    String wifiSSID;
    String wifiPassword;
    String socketServerURL;
    String feedId;
    String deviceColor;   // hex like "#FF0000"

    Preferences preferences;

    static const String DEFAULT_WIFI_SSID;
    static const String DEFAULT_WIFI_PASSWORD;
    static const String DEFAULT_SOCKET_SERVER_URL;
    static const String DEFAULT_FEED_ID;
    static const String DEFAULT_DEVICE_COLOR;

    static const char* NVS_NAMESPACE;
    static const char* KEY_WIFI_SSID;
    static const char* KEY_WIFI_PASSWORD;
    static const char* KEY_SOCKET_SERVER_URL;
    static const char* KEY_FEED_ID;
    static const char* KEY_DEVICE_COLOR;

public:
    Configuration() {}

    void initialize() {
        if (!preferences.begin(NVS_NAMESPACE, false)) {
            Serial.println("[Config] Failed to open NVS namespace");
            loadDefaults();
            return;
        }

        wifiSSID        = preferences.getString(KEY_WIFI_SSID,         DEFAULT_WIFI_SSID);
        wifiPassword    = preferences.getString(KEY_WIFI_PASSWORD,      DEFAULT_WIFI_PASSWORD);
        socketServerURL = preferences.getString(KEY_SOCKET_SERVER_URL,  DEFAULT_SOCKET_SERVER_URL);
        feedId          = preferences.getString(KEY_FEED_ID,            DEFAULT_FEED_ID);
        deviceColor     = preferences.getString(KEY_DEVICE_COLOR,       DEFAULT_DEVICE_COLOR);

        preferences.end();
        Serial.println("[Config] Loaded from NVS");
    }

    void loadDefaults() {
        wifiSSID        = DEFAULT_WIFI_SSID;
        wifiPassword    = DEFAULT_WIFI_PASSWORD;
        socketServerURL = DEFAULT_SOCKET_SERVER_URL;
        feedId          = DEFAULT_FEED_ID;
        deviceColor     = DEFAULT_DEVICE_COLOR;
        Serial.println("[Config] Loaded defaults");
    }

    bool save() {
        if (!preferences.begin(NVS_NAMESPACE, false)) {
            Serial.println("[Config] Failed to open NVS for saving");
            return false;
        }
        preferences.putString(KEY_WIFI_SSID,         wifiSSID);
        preferences.putString(KEY_WIFI_PASSWORD,      wifiPassword);
        preferences.putString(KEY_SOCKET_SERVER_URL,  socketServerURL);
        preferences.putString(KEY_FEED_ID,            feedId);
        preferences.putString(KEY_DEVICE_COLOR,       deviceColor);
        preferences.end();
        Serial.println("[Config] Saved to NVS");
        return true;
    }

    // Getters
    const String& getWifiSSID()        const { return wifiSSID; }
    const String& getWifiPassword()    const { return wifiPassword; }
    const String& getSocketServerURL() const { return socketServerURL; }
    const String& getFeedId()          const { return feedId; }
    const String& getDeviceColor()     const { return deviceColor; }

    // Setters — each saves immediately
    void setWifiSSID(const String& v)        { wifiSSID = v;        save(); }
    void setWifiPassword(const String& v)    { wifiPassword = v;    save(); }
    void setSocketServerURL(const String& v) { socketServerURL = v; save(); }
    void setFeedId(const String& v)          { feedId = v;          save(); }
    void setDeviceColor(const String& v)     { deviceColor = v;     save(); }

    String toJSON() const {
        JsonDocument doc;
        doc["wifiSSID"]        = wifiSSID;
        doc["socketServerURL"] = socketServerURL;
        doc["feedId"]          = feedId;
        doc["deviceColor"]     = deviceColor;
        String out;
        serializeJson(doc, out);
        return out;
    }

    void printConfiguration() const {
        Serial.println("=== Configuration ===");
        Serial.print("WiFi SSID: ");   Serial.println(wifiSSID);
        Serial.print("Server URL: ");  Serial.println(socketServerURL);
        Serial.print("Feed ID: ");     Serial.println(feedId);
        Serial.print("Color: ");       Serial.println(deviceColor);
        Serial.println("====================");
    }
};

const String Configuration::DEFAULT_WIFI_SSID        = "";
const String Configuration::DEFAULT_WIFI_PASSWORD     = "";
const String Configuration::DEFAULT_SOCKET_SERVER_URL = "ws://feib.nl:5020/ws";
const String Configuration::DEFAULT_FEED_ID           = "default";
const String Configuration::DEFAULT_DEVICE_COLOR      = "#FF0000";

const char* Configuration::NVS_NAMESPACE         = "fusebeat";
const char* Configuration::KEY_WIFI_SSID         = "wifi_ssid";
const char* Configuration::KEY_WIFI_PASSWORD     = "wifi_pass";
const char* Configuration::KEY_SOCKET_SERVER_URL = "socket_url";
const char* Configuration::KEY_FEED_ID           = "feed_id";
const char* Configuration::KEY_DEVICE_COLOR      = "dev_color";

extern Configuration configuration;

#endif // CONFIGURATION_H
