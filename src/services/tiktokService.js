// src/services/tiktokService.js
import { WebcastPushConnection } from "tiktok-live-connector";
import { addLog } from "./logger.js";
import { disconnectRcon, initRCON } from "./rconService.js";
import { pickActionForGift, runAction } from "./actionService.js";
import { processGift } from "../utils/giftProcessor.js";

let connection = null;

export async function stopTikTok() {
  if (connection) {
    try {
      await connection.disconnect();
    } catch (err) {
      const errorMessage = err?.message || err?.toString() || String(err) || "Невідома помилка";
      console.warn(
        "⚠️  Не вдалося коректно відключитися від TikTok",
        errorMessage
      );
    }
    connection = null;
    addLog("info", "Зупинено підключення до TikTok");
  }
}

export async function connectTikTok(config, compiledActions) {
  await stopTikTok();

  if (!config.tiktokUsername) {
    console.warn("⚠️  tiktokUsername порожній, не підключаю TikTok");
    addLog("warn", "tiktokUsername порожній, не підключаю TikTok");
    return;
  }

  connection = new WebcastPushConnection(config.tiktokUsername, {
    sessionId: config.sessionId,
    enableExtendedGiftInfo: true,
  });

  connection.on("chat", (data) => {
    console.log(`${data.uniqueId} (${data.nickname}): ${data.comment}`);
    addLog("chat", `${data.uniqueId}: ${data.comment}`, {
      user: data.uniqueId,
      nickname: data.nickname,
      comment: data.comment,
    });
  });

  connection.on("member", (data) =>
    addLog("member", `${data.uniqueId} зайшов у стрім`, {
      user: data.uniqueId,
      nickname: data.nickname,
    })
  );

  connection.on("gift", async (data) => {
    const processed = processGift(data);
    if (!processed) {
      return; // Немає нових подарунків
    }

    const { giftsToProcess, currentRepeatCount } = processed;

    addLog(
      "gift",
      `${data.uniqueId} надіслав ${data.giftName} x${giftsToProcess} (всього: ${currentRepeatCount})`,
      {
        user: data.uniqueId,
        nickname: data.nickname,
        gift: data.giftName,
        repeat: currentRepeatCount,
        newGifts: giftsToProcess,
      }
    );

    const action = pickActionForGift(compiledActions, data.giftName);
    if (!action) {
      addLog("info", `Немає скрипту для подарунку ${data.giftName}`);
      return;
    }

    // Виконуємо команду для кожного нового подарунку
    for (let i = 0; i < giftsToProcess; i++) {
      try {
        await runAction(action, data, config);
        addLog(
          "action",
          `Скрипт ${action.name} виконано (${i + 1}/${giftsToProcess})`
        );
      } catch (err) {
        const errorMessage = err?.message || err?.toString() || String(err) || "Невідома помилка";
        addLog("error", `Помилка у скрипті ${action.name}: ${errorMessage}`);
      }
    }
  });

  connection.on("streamEnd", async () => {
    console.log("🔴 Стрім закінчився");
    await disconnectRcon();
    addLog("info", "Стрім закінчився");
  });

  let isConnectedSuccessfully = false;

  connection.on("error", async (err) => {
    // Логуємо помилку, але не відключаємо RCON, якщо підключення ще активно
    // Багато помилок можуть бути тимчасовими і не впливають на роботу стріму
    // Пропускаємо помилки без повідомлення, щоб не засмічувати логи
    if (!err || err.message === undefined) {
      return;
    }
    const errorMessage = err.message;
    // Фільтруємо неважливі помилки
    if (errorMessage && errorMessage.trim() !== "") {
      addLog("warn", `Попередження TikTok: ${errorMessage}`);
    }
  });

  connection.on("disconnected", async () => {
    console.log("🔴 Відключено від TikTok");
    await disconnectRcon();
    isConnectedSuccessfully = false;
    addLog("info", "Відключено від TikTok");
  });

  try {
    const state = await connection.connect();
    isConnectedSuccessfully = true;
    addLog(
      "info",
      `Підключено до стріму ${config.tiktokUsername}, roomId=${state.roomId}`
    );
    await initRCON(config);
  } catch (err) {
    // Логуємо помилку тільки якщо підключення дійсно не вдалося
    if (!isConnectedSuccessfully) {
      const errorMessage = err?.message || err?.toString() || String(err) || "Невідома помилка";
      addLog("error", `Не вдалося підключитися до TikTok: ${errorMessage}`);
    }
  }
}

export function getConnection() {
  return connection;
}

export function isConnected() {
  return Boolean(connection);
}

