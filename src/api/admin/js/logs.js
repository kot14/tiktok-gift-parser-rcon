// Logs management module
import { api } from "./api.js";

let logs = [];

export const LogsManager = {
  setLogs(newLogs) {
    logs = newLogs || [];
    this.render();
  },

  addLog(logEntry) {
    logs.push(logEntry);
    this.render();
  },

  async clearLogs() {
    try {
      await api("/api/logs/clear", { method: "POST" });
      this.setLogs();
      this.addLog({
        ts: Date.now(),
        type: "info",
        message: "Логи очищено користувачем.",
      });
    } catch (err) {
      console.error("Failed to clear logs:", err);
      this.addLog({
        ts: Date.now(),
        type: "error",
        message: `Помилка очищення логів: ${err.message}`,
      });
    }
  },

  render() {
    const target = document.getElementById("logs");
    if (!target) return;
    target.textContent = logs
      .slice()
      .reverse()
      .map((l) => {
        const time = new Date(l.ts).toLocaleTimeString();
        return `[${time}] [${l.type}] ${l.message}`;
      })
      .join("\n");
  },
};
