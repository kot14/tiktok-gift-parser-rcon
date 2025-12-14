// Main application module
import { ThemeManager } from "./theme.js";
import { api } from "./api.js";
import { GiftSelect } from "./giftSelect.js";
import { ActionsManager } from "./actions.js";
import { ConfigManager } from "./config.js";
import { LogsManager } from "./logs.js";

// Initialize theme
ThemeManager.init();

// Load gifts list
const loadGifts = async () => {
  try {
    const giftList = await api("/api/gifts");
    GiftSelect.setGiftList(giftList);
  } catch (err) {
    console.warn("Failed to load gifts:", err);
    GiftSelect.setGiftList([]);
  }
};

// Bind UI events
const bindEvents = () => {
  // Save config button
  document.getElementById("saveConfig")?.addEventListener("click", () => {
    ConfigManager.saveConfig();
  });

  // Add action button
  document.getElementById("addAction")?.addEventListener("click", () => {
    ActionsManager.addAction();
  });

  // Start/Stop buttons
  document.getElementById("btnStart")?.addEventListener("click", () => {
    ConfigManager.start();
  });

  document.getElementById("btnStop")?.addEventListener("click", () => {
    ConfigManager.stop();
  });
};

// Status polling
const startStatusPolling = () => {
  const updateStatus = async () => {
    const status = await ConfigManager.loadStatus();
    if (status && status.logs) {
      LogsManager.setLogs(status.logs);
    }
  };
  
  updateStatus();
  setInterval(updateStatus, 2000);
};

// Initialize application
const init = async () => {
  bindEvents();
  ActionsManager.bindTableEvents();
  ActionsManager.setSaveCallback(() => ConfigManager.saveConfig());
  
  await loadGifts();
  await ConfigManager.loadConfig();
  startStatusPolling();
};

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

