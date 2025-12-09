// src/services/logger.js
const MAX_LOGS = 300;
const logs = [];

export function addLog(type, message, extra = undefined) {
  const entry = {
    ts: Date.now(),
    type,
    message,
    extra,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  console.log(`[${type}] ${message}`, extra ?? "");
}

export function getLogs() {
  return logs;
}

export function clearLogs() {
  logs.length = 0;
}

