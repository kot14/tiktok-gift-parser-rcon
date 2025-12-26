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
let userLikes = new Map();
let disableRcon = false;

const { handleGift, emitter } = createGiftHandler();
// Відстеження підписаних користувачів у поточному стрімі
let subscribedUsers = new Set();
// Зберігаємо посилання на обробники подій для можливості видалення
let giftEventHandler = null;
let subscriptionEventHandler = null;
let likesEventHandler = null;
// Відстеження, чи потрібно продовжувати спроби підключення
let shouldRetryConnection = false;
let retryTimeout = null;

const saveAvaliableGifts = async (connection) => {
  const gifts = await connection.fetchAvailableGifts();
  addLog("info", `[TikTok] Оновлено список подарунків: ${gifts.length} типів`);
  await fs.writeFileSync(gift_path, JSON.stringify(gifts, null, 2));
};

export async function stopTikTok() {
  // Зупиняємо повторні спроби підключення
  shouldRetryConnection = false;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

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
    // Очищаємо накопичені лайки
    userLikes.clear();
    addLog("info", "Зупинено підключення до TikTok");
  }
  // Видаляємо обробники подій, щоб уникнути дублювання
  if (giftEventHandler) {
    emitter.removeListener("gift", giftEventHandler);
    giftEventHandler = null;
  }
  if (subscriptionEventHandler && connection) {
    connection.removeListener(WebcastEvent.SUBSCRIBE, subscriptionEventHandler);
    subscriptionEventHandler = null;
  }
  if (likesEventHandler && connection) {
    connection.removeListener(WebcastEvent.LIKE, likesEventHandler);
    likesEventHandler = null;
  }
}

// Допоміжні функції для декларативного підходу

function validateConfig(config) {
  if (!config.tiktokUsername) {
    console.warn("⚠️  tiktokUsername порожній, не підключаю TikTok");
    addLog("warn", "tiktokUsername порожній, не підключаю TikTok");
    shouldRetryConnection = false;
    return false;
  }
  return true;
}

async function cleanupPreviousConnection() {
  if (connection) {
    try {
      await connection.disconnect();
    } catch (err) {
      // Ігноруємо помилки при відключенні старого з'єднання
    }
    connection = null;
  }
}

function createTikTokConnection(username) {
  return new TikTokLiveConnection(username);
}

function createGiftEventHandler(compiledActions, config) {
  return async (gift) => {
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
  };
}

function createSubscriptionHandler(compiledActions, config) {
  return async (data) => {
    const userId = data.user?.uniqueId || data.user?.userId || "unknown";
    console.log("[TikTok] Обробка підписки", userId);
    if (userId === "unknown") {
      return;
    }
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

    subscribedUsers.add(userId);

    addLog("subscribe", `${userId} (${data.nickname}) підписався`, {
      user: userId,
      nickname: data.nickname,
    });

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
  };
}

function createLikesHandler(compiledActions, config) {
  return async (data) => {
    // Отримуємо userId з об'єкта user (може бути uniqueId або userId)
    const userId = data.user?.uniqueId || data.user?.userId || "unknown";
    const likesInThisEvent = data.likeCount || 0;
    const likeActions = pickActionsForLikes(compiledActions);

    if (likeActions.length === 0 || likesInThisEvent === 0) {
      return;
    }

    // Накопичуємо лайки для користувача
    const currentUserLikes = (userLikes.get(userId) || 0) + likesInThisEvent;
    userLikes.set(userId, currentUserLikes);

    for (const action of likeActions) {
      const threshold = action.likeThreshold;

      if (!threshold) {
        continue;
      }

      // Перевіряємо накопичену кількість лайків користувача
      if (currentUserLikes >= threshold) {
        // Можна також перевірити, чи це перший раз досягнуто порогу
        // щоб не виконувати action багато разів
        try {
          console.log(
            `[TikTok] Запуск скрипту ${action.name} для лайків (користувач ${userId} поставив ${currentUserLikes} лайків, поріг ${threshold})`
          );
          await runAction(action, data, config);
          addLog(
            "action",
            `Скрипт ${action.name} виконано для лайків (користувач ${userId}: ${currentUserLikes} лайків)`
          );
        } catch (err) {
          console.error(
            "[TikTok] Помилка у скрипті ${action.name} для лайків: ${err}"
          );
        }
        userLikes.set(userId, 0);
      }
    }
  };
}

function setupEventHandlers(connection, compiledActions, config) {
  // Налаштування обробника подарунків
  connection.on(WebcastEvent.GIFT, handleGift);

  // Видаляємо старі обробники перед додаванням нових
  if (giftEventHandler) {
    emitter.removeListener("gift", giftEventHandler);
  }
  subscriptionEventHandler = null;
  likesEventHandler = null;

  // Створюємо та реєструємо нові обробники
  giftEventHandler = createGiftEventHandler(compiledActions, config);
  emitter.on("gift", giftEventHandler);

  subscriptionEventHandler = createSubscriptionHandler(compiledActions, config);
  connection.on(WebcastEvent.SUBSCRIBE, subscriptionEventHandler);

  likesEventHandler = createLikesHandler(compiledActions, config);
  connection.on(WebcastEvent.LIKE, likesEventHandler);

  // Обробник відключення
  connection.on(ControlEvent.DISCONNECTED, async () => {
    console.log("🔴 Відключено від TikTok");
    subscribedUsers.clear();
    userLikes.clear();
    await disconnectRcon();
    addLog("info", "Відключено від TikTok");
  });
}

function handleSuccessfulConnection(state, config) {
  shouldRetryConnection = false;

  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  subscribedUsers.clear();
  userLikes.clear();

  console.log("✅ Успішно підключено до TikTok");
  addLog(
    "info",
    `Підключено до стріму ${config.tiktokUsername}, roomId=${state.roomId}`
  );
}

function handleConnectionError(err, attemptNumber, config, compiledActions) {
  const errorMessage =
    err?.message || err?.toString() || String(err) || "Невідома помилка";
  console.error(
    `❌ Помилка підключення (спроба ${attemptNumber}): ${errorMessage}`
  );
  addLog(
    "error",
    `Не вдалося підключитися до TikTok (спроба ${attemptNumber}): ${errorMessage}`
  );

  if (shouldRetryConnection) {
    console.log(`⏳ Повторна спроба через 10 секунд...`);
    addLog("info", `Повторна спроба підключення через 10 секунд`);
    retryTimeout = setTimeout(() => {
      attemptConnection(config, compiledActions, attemptNumber + 1);
    }, 10000);
  }
}

// Внутрішня функція для спроби підключення
async function attemptConnection(config, compiledActions, attemptNumber = 1) {
  if (!shouldRetryConnection) {
    return;
  }

  if (!validateConfig(config)) {
    return;
  }

  await cleanupPreviousConnection();

  connection = createTikTokConnection(config.tiktokUsername);
  console.log(`🔴 Спроба підключення до TikTok (спроба ${attemptNumber})...`);
  addLog("info", `Спроба підключення до TikTok (спроба ${attemptNumber})`);

  setupEventHandlers(connection, compiledActions, config);

  try {
    const state = await connection.connect();
    handleSuccessfulConnection(state, config);
    if (!disableRcon) {
      await initRCON(config);
    }
  } catch (err) {
    handleConnectionError(err, attemptNumber, config, compiledActions);
  }
}

export async function connectTikTok(config, compiledActions) {
  await stopTikTok();

  // Вмикаємо режим повторних спроб
  shouldRetryConnection = true;

  // Починаємо першу спробу підключення
  await attemptConnection(config, compiledActions, 1);
}

export function getConnection() {
  return connection;
}

export function isConnected() {
  return Boolean(connection);
}
