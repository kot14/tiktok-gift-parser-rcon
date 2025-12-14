// src/services/tiktokService.js
import { WebcastPushConnection } from "tiktok-live-connector";
import { addLog } from "./logger.js";
import { disconnectRcon, initRCON } from "./rconService.js";
import {
  pickActionForGift,
  pickActionForSubscription,
  pickActionsForLikes,
  runAction,
} from "./actionService.js";
import { processGift } from "../utils/giftProcessor.js";

let connection = null;
// Відстеження підписаних користувачів у поточному стрімі
let subscribedUsers = new Set();

export async function stopTikTok() {
  if (connection) {
    try {
      await connection.disconnect();
    } catch (err) {
      const errorMessage =
        err?.message || err?.toString() || String(err) || "Невідома помилка";
      console.warn(
        "⚠️  Не вдалося коректно відключитися від TikTok",
        errorMessage
      );
    }
    connection = null;
    // Очищаємо список підписаних користувачів при зупинці
    subscribedUsers.clear();
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
    console.log(
      `[TikTok] Отримано подію подарунку: ${data.giftName}, repeatCount=${data.repeatCount}, giftType=${data.giftType}, repeatEnd=${data.repeatEnd}`
    );

    const processed = processGift(data);
    if (!processed) {
      console.log(`[TikTok] Подію пропущено: немає нових подарунків`);
      return; // Немає нових подарунків
    }

    const { giftsToProcess, currentRepeatCount } = processed;

    console.log(
      `[TikTok] Обробка: ${giftsToProcess} нових подарунків з ${currentRepeatCount} всього`
    );

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
    console.log(
      `[TikTok] Запуск скрипту ${action.name} ${giftsToProcess} разів`
    );
    for (let i = 0; i < giftsToProcess; i++) {
      try {
        console.log(
          `[TikTok] Виконання скрипту ${action.name} (${
            i + 1
          }/${giftsToProcess})`
        );
        await runAction(action, data, config);
        addLog(
          "action",
          `Скрипт ${action.name} виконано (${i + 1}/${giftsToProcess})`
        );
      } catch (err) {
        const errorMessage =
          err?.message || err?.toString() || String(err) || "Невідома помилка";
        console.error(
          `[TikTok] Помилка у скрипті ${action.name} (${
            i + 1
          }/${giftsToProcess}):`,
          errorMessage
        );
        addLog("error", `Помилка у скрипті ${action.name}: ${errorMessage}`);
      }
    }
    console.log(`[TikTok] Завершено обробку ${giftsToProcess} подарунків`);
  });

  connection.on("subscribe", async (data) => {
    const userId = data.uniqueId;

    // Перевіряємо, чи користувач вже підписався в цьому стрімі
    if (subscribedUsers.has(userId)) {
      console.log(
        `[TikTok] Пропущено повторну підписку: ${userId} (${data.nickname}) вже підписаний у цьому стрімі`
      );
      addLog(
        "info",
        `Пропущено повторну підписку: ${userId} вже підписаний у цьому стрімі`,
        {
          user: userId,
          nickname: data.nickname,
        }
      );
      return;
    }

    // Додаємо користувача до списку підписаних
    subscribedUsers.add(userId);

    console.log(
      `[TikTok] Нова підписка: ${userId} (${data.nickname}) підписався`
    );
    addLog(
      "subscribe",
      `${userId} (${data.nickname}) підписався`,
      {
        user: userId,
        nickname: data.nickname,
      }
    );

    // Шукаємо скрипт для підписки
    const action = pickActionForSubscription(compiledActions);
    if (action) {
      try {
        console.log(`[TikTok] Запуск скрипту ${action.name} для підписки`);
        await runAction(action, data, config);
        addLog("action", `Скрипт ${action.name} виконано для підписки`);
      } catch (err) {
        const errorMessage =
          err?.message || err?.toString() || String(err) || "Невідома помилка";
        console.error(
          `[TikTok] Помилка у скрипті ${action.name} для підписки:`,
          errorMessage
        );
        addLog("error", `Помилка у скрипті ${action.name}: ${errorMessage}`);
      }
    }
  });

  connection.on("like", async (data) => {
    const userId = data.uniqueId;
    const likesInThisEvent = data.likeCount || 0;

    console.log(
      `[TikTok] Лайк: ${userId} (${data.nickname}) поставив ${likesInThisEvent} лайків за раз (всього в стрімі: ${data.totalLikeCount})`
    );
    addLog(
      "like",
      `${userId} (${data.nickname}) поставив ${likesInThisEvent} лайків за раз (всього в стрімі: ${data.totalLikeCount})`,
      {
        user: userId,
        nickname: data.nickname,
        likeCount: likesInThisEvent,
        totalLikeCount: data.totalLikeCount,
      }
    );

    // Шукаємо скрипти для лайків
    const likeActions = pickActionsForLikes(compiledActions);
    if (likeActions.length > 0 && likesInThisEvent > 0) {
      // Перевіряємо кожен скрипт - чи кількість лайків за раз >= порогу
      for (const action of likeActions) {
        const threshold = action.likeThreshold || 100;

        // Скрипт спрацює тільки якщо в цій події поставлено >= порогу лайків
        if (likesInThisEvent >= threshold) {
          try {
            console.log(
              `[TikTok] Запуск скрипту ${action.name} для лайків (поставлено ${likesInThisEvent} лайків за раз, поріг ${threshold})`
            );
            await runAction(action, data, config);
            addLog(
              "action",
              `Скрипт ${action.name} виконано для лайків (поставлено ${likesInThisEvent} лайків за раз, поріг ${threshold})`
            );
          } catch (err) {
            const errorMessage =
              err?.message ||
              err?.toString() ||
              String(err) ||
              "Невідома помилка";
            console.error(
              `[TikTok] Помилка у скрипті ${action.name} для лайків:`,
              errorMessage
            );
            addLog(
              "error",
              `Помилка у скрипті ${action.name}: ${errorMessage}`
            );
          }
        }
      }
    }
  });

  connection.on("streamEnd", async () => {
    console.log("🔴 Стрім закінчився");
    // Очищаємо список підписаних користувачів при завершенні стріму
    subscribedUsers.clear();
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
    // Очищаємо список підписаних користувачів при відключенні
    subscribedUsers.clear();
    await disconnectRcon();
    isConnectedSuccessfully = false;
    addLog("info", "Відключено від TikTok");
  });

  try {
    const state = await connection.connect();
    isConnectedSuccessfully = true;
    // Очищаємо список підписаних користувачів при новому підключенні
    subscribedUsers.clear();

    addLog(
      "info",
      `Підключено до стріму ${config.tiktokUsername}, roomId=${state.roomId}`
    );
    await initRCON(config);
  } catch (err) {
    // Логуємо помилку тільки якщо підключення дійсно не вдалося
    if (!isConnectedSuccessfully) {
      const errorMessage =
        err?.message || err?.toString() || String(err) || "Невідома помилка";
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
