#include "Arduino.h"
#include "config.h"
#include "Timer.h"
#include "Configuration.h"
#include "Process.h"
#include "ProcessManager.h"
#include "WebSocketManager.h"
#include "CommandRegistry.h"

// Process includes
#include "processes/WiFiProcess.h"
#include "processes/LedProcess.h"
#include "processes/SensorProcess.h"
#include "processes/PublishProcess.h"
#include "processes/ReceiveProcess.h"
#include "processes/SerialProcess.h"
#include "processes/ButtonProcess.h"
#include "processes/LedBehaviors.h"

// Global instances
Configuration  configuration;
ProcessManager processManager;
CommandRegistry commandRegistry;
WebSocketManager webSocketManager;

// Global LED behavior instances
LedsOffBehavior     ledsOff;
SolidBehavior       ledsSolid;
BreathingBehavior   ledsBreathing;
HeartBeatBehavior   ledsHeartBeat;

// Raw signal mode flag — set by SerialProcess and ButtonProcess
bool rawSignalMode = false;

void setup() {
    delay(SETUP_DELAY);
    Serial.begin(SERIAL_BAUD_RATE);
    Serial.println("\n[FuseBeat] Starting...");

    configuration.initialize();

    // Register all processes
    processManager.addProcess("wifi",    new WiFiProcess());
    processManager.addProcess("led",     new LedProcess());
    processManager.addProcess("sensor",  new SensorProcess());
    processManager.addProcess("serial",  new SerialProcess());
    processManager.addProcess("button",  new ButtonProcess());
    processManager.addProcess("publish", new PublishProcess());
    processManager.addProcess("receive", new ReceiveProcess());

    // Halt network processes until WiFi connects
    processManager.haltProcess("publish");
    processManager.haltProcess("receive");

    // Setup all processes
    processManager.setupProcesses();

    Serial.println("[FuseBeat] Setup complete");
}

void loop() {
    WiFiProcess* wifiProc = static_cast<WiFiProcess*>(processManager.getProcess("wifi"));
    bool wifiConnected = wifiProc && wifiProc->isWiFiConnected();

    static bool wasConnected        = false;
    static bool wasRawMode          = false;
    static bool rawEnteredConnected = false;

    if (rawSignalMode && !wasRawMode) {
        if (wasConnected) {
            // Already connected: keep WS alive, only suppress heartbeat sends
            Serial.println("[FuseBeat] Raw mode ON — WS stays live, heartbeats suppressed");
            processManager.haltProcess("publish");
            rawEnteredConnected = true;
        } else {
            // Not connected: stop all WiFi/WS activity
            Serial.println("[FuseBeat] Raw mode ON — halting WiFi/WS");
            processManager.haltProcess("wifi");
            processManager.haltProcess("publish");
            processManager.haltProcess("receive");
            rawEnteredConnected = false;
        }
        {
            LedProcess* led = static_cast<LedProcess*>(processManager.getProcess("led"));
            if (led) { ledsBreathing.setColor(0x00FF00); led->setBehavior(&ledsBreathing); }
        }
    } else if (!rawSignalMode && wasRawMode) {
        if (rawEnteredConnected && wifiConnected) {
            // WS was kept alive and is still up: just resume heartbeats
            Serial.println("[FuseBeat] Raw mode OFF — resuming heartbeats");
            processManager.startProcess("publish");
        } else {
            // Wasn't connected, or lost connection during raw mode: restart WiFi
            Serial.println("[FuseBeat] Raw mode OFF — resuming WiFi/WS");
            processManager.startProcess("wifi");
        }
        rawEnteredConnected = false;
        {
            LedProcess* led = static_cast<LedProcess*>(processManager.getProcess("led"));
            if (led) { ledsBreathing.setColor(wifiConnected ? 0x0000FF : 0xFF0000); led->setBehavior(&ledsBreathing); }
        }
    }
    wasRawMode = rawSignalMode;

    if (rawSignalMode) {
        // Keep WS connection alive when it was maintained through raw mode
        if (rawEnteredConnected && wifiConnected) {
            webSocketManager.update();
        }
        processManager.updateProcesses();
        return;
    }

    if (wifiConnected && !wasConnected) {
        // WiFi just connected — initialize WS and start network processes
        Serial.println("[FuseBeat] WiFi connected — starting WebSocket");
        webSocketManager.initialize(configuration.getSocketServerURL());
        processManager.startProcess("publish");
        processManager.startProcess("receive");

        // Switch LED to breathing in device color
        LedProcess* led = static_cast<LedProcess*>(processManager.getProcess("led"));
        if (led) {
            uint32_t color = 0x0000FF; // Blue while waiting for first beat
            led->setConnectedColor(color);
        }
    } else if (!wifiConnected && wasConnected) {
        // WiFi lost — halt network processes
        Serial.println("[FuseBeat] WiFi lost — halting WebSocket");
        processManager.haltProcess("publish");
        processManager.haltProcess("receive");

        LedProcess* led = static_cast<LedProcess*>(processManager.getProcess("led"));
        if (led) {
            ledsBreathing.setColor(0xFF0000); // Back to red breathing
            led->setBehavior(&ledsBreathing);
        }
    }
    wasConnected = wifiConnected;

    // Update WebSocket connection
    if (wifiConnected) {
        webSocketManager.update();
    }

    // Update all running processes
    processManager.updateProcesses();
}
