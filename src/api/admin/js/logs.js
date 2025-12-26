// Logs management module
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

  clearLogs() {
    this.setLogs();
    this.addLog({
      ts: Date.now(),
      type: "info",
      message: "Логи очищено користувачем.",
    });
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
