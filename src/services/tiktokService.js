// src/services/tiktokService.js
import fs from "fs";
import path from "path";

import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
} from "tiktok-live-connector";
import { addLog } from "./logger.js";
import { disconnectRcon, initRCON } from "./rconService.js";
import {
  pickActionForGift,
  pickActionForSubscription,
  pickActionsForLikes,
  runAction,
} from "./actionService.js";
import { createGiftHandler } from "../utils/giftProcessorSimple.js";

const gift_path = path.join(process.cwd(), "src/types/gifts.json");

let connection = null;
const { handleGift, emitter } = createGiftHandler();
// Відстеження підписаних користувачів у поточному стрімі
let subscribedUsers = new Set();

const saveAvaliableGifts = async (connection) => {
  const gifts = await connection.fetchAvailableGifts();
  addLog("info", `[TikTok] Оновлено список подарунків: ${gifts.length} типів`);
  await fs.writeFileSync(gift_path, JSON.stringify(gifts, null, 2));
};

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
  let isConnectedSuccessfully = false;
  await stopTikTok();
  if (!config.tiktokUsername) {
    console.warn("⚠️  tiktokUsername порожній, не підключаю TikTok");
    addLog("warn", "tiktokUsername порожній, не підключаю TikTok");
    return;
  }

  connection = new TikTokLiveConnection(config.tiktokUsername);
  console.log("🔴 Підключено до TikTok");

  // connection.on(WebcastEvent.CHAT, (data) => {
  //   console.log(`${data.uniqueId} (${data.nickname}): ${data.comment}`);
  //   addLog("chat", `${data.uniqueId}: ${data.comment}`, {
  //     user: data.uniqueId,
  //     nickname: data.nickname,
  //     comment: data.comment,
  //   });
  // });

  // connection.on("member", (data) =>
  //   addLog("member", `${data.uniqueId} зайшов у стрім`, {
  //     user: data.uniqueId,
  //     nickname: data.nickname,
  //   })
  // );

  connection.on(WebcastEvent.GIFT, handleGift);

  emitter.on("gift", async (gift) => {
    console.log(
      `[TikTok] Обробка: ${gift.giftName} подарунка з ${gift.repeatCount} від ${gift.user}`
    );

    addLog(
      "gift",
      `${gift.user} надіслав ${gift.giftName} x${gift.repeatCount}`,
      {
        user: gift.user,
        gift: gift.giftName,
        repeat: gift.repeatCount,
      }
    );

    const action = pickActionForGift(compiledActions, gift.giftName);
    if (!action) {
      addLog("info", `Немає скрипту для подарунку ${gift.giftName}`);
      return;
    }
    console.log(
      `[TikTok] Запуск скрипту ${action.name} ${gift.repeatCount} разів`
    );

    for (let i = 0; i < gift.repeatCount; i++) {
      try {
        console.log(
          `[TikTok] Виконання скрипту ${action.name} (${i + 1}/${
            gift.repeatCount
          })`
        );
        await runAction(action, gift, config);
        addLog(
          "action",
          `Скрипт ${action.name} виконано (${i + 1}/${gift.repeatCount})`
        );
      } catch (err) {
        const errorMessage =
          err?.message || err?.toString() || String(err) || "Невідома помилка";
        console.error(
          `[TikTok] Помилка у скрипті ${action.name} (${i + 1}/${
            gift.repeatCount
          }):`,
          errorMessage
        );
        addLog("error", `Помилка у скрипті ${action.name}: ${errorMessage}`);
      }
    }
  });

  // connection.on(WebcastEvent.SUBSCRIBE, async (data) => {
  //   const userId = data.uniqueId;

  //   // Перевіряємо, чи користувач вже підписався в цьому стрімі
  //   if (subscribedUsers.has(userId)) {
  //     console.log(
  //       `[TikTok] Пропущено повторну підписку: ${userId} (${data.nickname}) вже підписаний у цьому стрімі`
  //     );
  //     addLog(
  //       "info",
  //       `Пропущено повторну підписку: ${userId} вже підписаний у цьому стрімі`,
  //       {
  //         user: userId,
  //         nickname: data.nickname,
  //       }
  //     );
  //     return; console.log("🔴 TUT");
  //   addLog("subscribe", `${userId} (${data.nickname}) підписався`, {
  //     user: userId,
  //     nickname: data.nickname,
  //   });

  //   // Шукаємо скрипт для підписки
  //   const action = pickActionForSubscription(compiledActions);
  //   if (action) {
  //     try {
  //       console.log(`[TikTok] Запуск скрипту ${action.name} для підписки`);
  //       await runAction(action, data, config);
  //       addLog("action", `Скрипт ${action.name} виконано для підписки`);
  //     } catch (err) {
  //       const errorMessage =
  //         err?.message || err?.toString() || String(err) || "Невідома помилка";
  //       console.error(
  //         `[TikTok] Помилка у скрипті ${action.name} для підписки:`,
  //         errorMessage
  //       );
  //       addLog("error", `Помилка у скрипті ${action.name}: ${errorMessage}`);
  //     }
  //   }
  // });

  // connection.on(WebcastEvent.LIKE, async (data) => {
  //   const userId = data.uniqueId;
  //   const likesInThisEvent = data.likeCount || 0;

  //   // console.log(
  //   //   `[TikTok] Лайк: ${userId} (${data.nickname}) поставив ${likesInThisEvent} лайків за раз (всього в стрімі: ${data.totalLikeCount})`
  //   // );
  //   // addLog(  connection = new TikTokLiveConnection(config.tiktokUsername);
  // console.log("🔴 Підключено до TikTok");
  //   //     user: userId,
  //   //     nickname: data.nickname,
  //   //     likeCount: likesInThisEvent,
  //   //     totalLikeCount: data.totalLikeCount,
  //   //   }
  //   // );

  //   // Шукаємо скрипти для лайків
  //   const likeActions = pickActionsForLikes(compiledActions);
  //   if (likeActions.length > 0 && likesInThisEvent > 0) {
  //     // Перевіряємо кожен скрипт - чи кількість лайків за раз >= порогу
  //     for (const action of likeActions) {
  //       const threshold = action.likeThreshold || 100;

  //       // Скрипт спрацює тільки якщо в цій події поставлено >= порогу лайків
  //       if (likesInThisEvent >= threshold) {
  //         try {
  //           console.log(
  //             `[TikTok] Запуск скрипту ${action.name} для лайків (поставлено ${likesInThisEvent} лайків за раз, поріг ${threshold})`
  //           );
  //           await runAction(action, data, config);
  //           addLog(
  //             "action",
  //             `Скрипт ${action.name} виконано для лайків (поставлено ${likesInThisEvent} лайків за раз, поріг ${threshold})`
  //           );
  //         } catch (err) {
  //           const errorMessage =
  //             err?.message ||
  //             err?.toString() ||
  //             String(err) ||
  //             "Невідома помилка";
  //           console.error(
  //             `[TikTok] Помилка у скрипті ${action.name} для лайків:`,
  //             errorMessage
  //           );
  //           addLog(
  //             "error",
  //             `Помилка у скрипті ${action.name}: ${errorMessage}`
  //           );
  //         }
  //       }
  //     }
  //   }
  // });

  // connection.on(WebcastEvent.STREAM_END, async () => {
  //   console.log("🔴 Стрім закінчився");
  //   // Очищаємо список підписаних користувачів при завершенні стріму
  //   subscribedUsers.clear();
  //   await disconnectRcon();
  //   addLog("info", "Стрім закінчився");
  // });

  // connection.on(ControlEvent.ERROR, async (err) => {
  //   // Логуємо помилку, але не відключаємо RCON, якщо підключення ще активно
  //   // Багато помилок можуть бути тимчасовими і не впливають на роботу стріму
  //   // Пропускаємо помилки без повідомлення, щоб не засмічувати логи
  //   if (!err || err.message === undefined) {
  //     return;
  //   }
  //   const errorMessage = err.message;
  //   // Фільтруємо неважливі помилки
  //   if (errorMessage && errorMessage.trim() !== "") {
  //     addLog("warn", `Попередження TikTok: ${errorMessage}`);
  //   }
  // });

  connection.on(ControlEvent.DISCONNECTED, async () => {
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

    saveAvaliableGifts(connection);
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
