#ifndef SERIAL_PROCESS_H
#define SERIAL_PROCESS_H

#include "Process.h"
#include "Configuration.h"
#include "WebSocketManager.h"
#include "ProcessManager.h"
#include "processes/WiFiProcess.h"

extern bool rawSignalMode;

class SerialProcess : public Process {
public:
    SerialProcess() : Process() {}

    void setup() override {
        Serial.println("[Serial] Ready. Commands: wifi <ssid> <pass> | server <url> | feed <name> | color <#RRGGBB> | rawmode <on|off> | status | reboot");
    }

    void update() override {
        while (Serial.available()) {
            char c = (char)Serial.read();
            if (c == '\n' || c == '\r') {
                if (inputBuffer.length() > 0) {
                    processCommand(inputBuffer);
                    inputBuffer = "";
                }
            } else {
                inputBuffer += c;
            }
        }
    }

private:
    String inputBuffer;

    void processCommand(const String& line) {
        String cmd = line;
        cmd.trim();
        if (cmd.length() == 0) return;

        Serial.print("[Serial] >> ");
        Serial.println(cmd);

        int spaceIdx = cmd.indexOf(' ');
        String verb  = spaceIdx >= 0 ? cmd.substring(0, spaceIdx) : cmd;
        String args  = spaceIdx >= 0 ? cmd.substring(spaceIdx + 1) : String("");
        verb.toLowerCase();

        if (verb == "wifi") {
            // wifi <ssid> <password>
            int s2 = args.indexOf(' ');
            if (s2 < 0) {
                Serial.println("[Serial] Usage: wifi <ssid> <password>");
                return;
            }
            String ssid = args.substring(0, s2);
            String pass = args.substring(s2 + 1);
            configuration.setWifiSSID(ssid);
            configuration.setWifiPassword(pass);
            Serial.println("[Serial] WiFi credentials saved. Reconnecting...");
            WiFiProcess* wf = static_cast<WiFiProcess*>(processManager->getProcess("wifi"));
            if (wf) wf->updateCredentials(ssid, pass);
        }
        else if (verb == "server") {
            configuration.setSocketServerURL(args);
            Serial.println("[Serial] Server URL saved. Reinitializing WS...");
            webSocketManager.reinitialize(args);
        }
        else if (verb == "feed") {
            configuration.setFeedId(args);
            Serial.println("[Serial] Feed ID saved: " + args);
        }
        else if (verb == "color") {
            configuration.setDeviceColor(args);
            Serial.println("[Serial] Color saved: " + args);
        }
        else if (verb == "rawmode") {
            if (args == "on") {
                rawSignalMode = true;
                Serial.println("[Serial] Raw signal mode ON");
            } else {
                rawSignalMode = false;
                Serial.println("[Serial] Raw signal mode OFF");
            }
        }
        else if (verb == "status") {
            configuration.printConfiguration();
            Serial.print("[Serial] WS: ");
            Serial.println(webSocketManager.isConnected() ? "Connected" : "Disconnected");
            Serial.print("[Serial] Device ID: ");
            Serial.println(webSocketManager.getDeviceId());
            Serial.print("[Serial] Raw mode: ");
            Serial.println(rawSignalMode ? "ON" : "OFF");
        }
        else if (verb == "reboot") {
            Serial.println("[Serial] Rebooting...");
            delay(500);
            ESP.restart();
        }
        else {
            Serial.println("[Serial] Unknown command: " + verb);
        }
    }
};

#endif // SERIAL_PROCESS_H
