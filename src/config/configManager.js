// src/config/configManager.js
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config.json");

export function loadConfig() {
  try {
    const file = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(file);
  } catch (err) {
    console.warn(
      "⚠️  Не знайдено config.json, використовую дефолт",
      err.message
    );
    return {
      tiktokUsername: "",
      sessionId: "",
      rcon: { host: "localhost", port: 25575, password: "" },
      targetPlayer: "",
      actions: [],
    };
  }
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

