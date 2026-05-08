#ifndef PROCESS_MANAGER_H
#define PROCESS_MANAGER_H

#include "Arduino.h"
#include "Process.h"
#include <map>

class ProcessManager {
private:
    std::map<String, Process*> processes;

public:
    ProcessManager() {}

    ~ProcessManager() {
        for (auto& entry : processes) {
            delete entry.second;
        }
        processes.clear();
    }

    void addProcess(const String& name, Process* process) {
        if (process) {
            process->setProcessManager(this);
            processes[name] = process;
        }
    }

    void startProcess(const String& name) {
        auto it = processes.find(name);
        if (it != processes.end()) {
            it->second->start();
        }
    }

    void haltProcess(const String& name) {
        auto it = processes.find(name);
        if (it != processes.end()) {
            it->second->halt();
        }
    }

    void haltAllProcesses() {
        for (auto& entry : processes) {
            entry.second->halt();
        }
    }

    void updateProcesses() {
        for (auto& entry : processes) {
            if (entry.second->isProcessRunning()) {
                entry.second->update();
            }
        }
    }

    void setupProcesses() {
        for (auto& entry : processes) {
            entry.second->setup();
        }
    }

    Process* getProcess(const String& name) {
        auto it = processes.find(name);
        return (it != processes.end()) ? it->second : nullptr;
    }

    bool hasProcess(const String& name) {
        return processes.find(name) != processes.end();
    }
};

#endif // PROCESS_MANAGER_H
