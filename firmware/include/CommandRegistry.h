#ifndef COMMAND_REGISTRY_H
#define COMMAND_REGISTRY_H

#include "Arduino.h"
#include <map>
#include <functional>

class CommandRegistry {
private:
    std::map<String, std::function<void(const String&)>> handlers;

public:
    CommandRegistry() {}

    void registerCommand(const String& name, std::function<void(const String&)> handler) {
        handlers[name] = handler;
    }

    bool executeCommand(const String& command, const String& parameters) {
        if (handlers.count(command)) {
            try {
                handlers[command](parameters);
                return true;
            } catch (...) {
                Serial.print("Error executing command: ");
                Serial.println(command);
                return false;
            }
        } else {
            Serial.print("Unknown command: ");
            Serial.println(command);
            return false;
        }
    }

    bool hasCommand(const String& command) const {
        return handlers.count(command) > 0;
    }

    size_t getCommandCount() const {
        return handlers.size();
    }
};

// Global command registry instance
extern CommandRegistry commandRegistry;

#endif // COMMAND_REGISTRY_H
