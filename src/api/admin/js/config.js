// Config management module
import { api } from "./api.js";
import { showToast } from "./toast.js";
import { ActionsManager } from "./actions.js";
import { LogsManager } from "./logs.js";

export const ConfigManager = {
  async loadConfig() {
    try {
      const state = await api("/api/config");
      ActionsManager.setState(state);
      
      document.getElementById("tiktokUsername").value = state.tiktokUsername || "";
      document.getElementById("sessionId").value = state.sessionId || "";
      document.getElementById("targetPlayer").value = state.targetPlayer || "";
      document.getElementById("rconHost").value = state.rcon?.host || "";
      document.getElementById("rconPort").value = state.rcon?.port || "";
      document.getElementById("rconPassword").value = state.rcon?.password || "";
      
      ActionsManager.renderActions();
      return state;
    } catch (err) {
      showToast("Не зміг завантажити: " + err.message, true);
      throw err;
    }
  },

  async saveConfig() {
    const payload = {
      tiktokUsername: document.getElementById("tiktokUsername").value.trim(),
      sessionId: document.getElementById("sessionId").value.trim(),
      targetPlayer: document.getElementById("targetPlayer").value.trim(),
      rcon: {
        host: document.getElementById("rconHost").value.trim(),
        port: Number(document.getElementById("rconPort").value),
        password: document.getElementById("rconPassword").value,
      },
      actions: ActionsManager.state?.actions || [],
    };
    
    try {
      const saved = await api("/api/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      ActionsManager.setState(saved);
      ActionsManager.renderActions();
      showToast("✅ Збережено і перезапущено");
    } catch (err) {
      showToast("❌ " + err.message, true);
    }
  },

  async loadStatus() {
    try {
      const s = await api("/api/status");
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = s.running ? "Підключено" : "Не підключено";
      }
      if (s.logs) {
        LogsManager.setLogs(s.logs);
      }
      return s;
    } catch (err) {
      console.warn(err);
      return null;
    }
  },

  async start() {
    try {
      await api("/api/start", { method: "POST" });
      showToast("Запущено");
      await this.loadStatus();
    } catch (err) {
      showToast("❌ " + err.message, true);
    }
  },

  async stop() {
    try {
      await api("/api/stop", { method: "POST" });
      showToast("Зупинено");
      await this.loadStatus();
    } catch (err) {
      showToast("❌ " + err.message, true);
    }
  },
};

