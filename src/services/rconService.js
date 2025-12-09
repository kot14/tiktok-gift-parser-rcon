// src/services/rconService.js
import { Rcon } from "rcon-client";
import { addLog } from "./logger.js";

let rcon = null;

export async function initRCON(config) {
  if (rcon) {
    return rcon;
  }

  try {
    rcon = new Rcon({
      host: config.rcon.host,
      port: config.rcon.port,
      password: config.rcon.password,
    });
    await rcon.connect();
    console.log("✅ RCON підключено до Minecraft сервера!");
    addLog("info", "RCON підключено");
    return rcon;
  } catch (err) {
    console.error("❌ Помилка RCON:", err.message);
    addLog("error", `Помилка RCON: ${err.message}`);
    throw err;
  }
}

export async function disconnectRcon() {
  if (rcon) {
    try {
      await rcon.end();
    } catch (err) {
      console.warn("⚠️  Не вдалося коректно закрити RCON", err.message);
    }
    rcon = null;
    addLog("info", "RCON відключено");
  }
}

export function getRcon() {
  return rcon;
}

