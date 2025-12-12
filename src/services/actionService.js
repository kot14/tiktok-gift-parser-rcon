// src/services/actionService.js
import { initRCON, getRcon } from "./rconService.js";
import { addLog } from "./logger.js";

export function compileAction(action) {
  if (!action?.code) {
    return { ...action, error: "code is empty" };
  }

  try {
    // code повинно повертати функцію (наприклад async ({ rcon, event }) => {})
    const fn = eval(action.code);
    if (typeof fn !== "function") {
      throw new Error("Code must evaluate to a function");
    }
    return { ...action, run: fn, error: null };
  } catch (err) {
    return { ...action, run: null, error: err.message };
  }
}

export function compileActions(actions = []) {
  return actions.map(compileAction);
}

export function pickActionForGift(compiledActions, giftName) {
  return compiledActions.find(
    (action) =>
      action.giftName.toLowerCase() === giftName.toLowerCase() && !action.error
  );
}

export async function runAction(
  action,
  event,
  config,
  { useMockRcon = false } = {}
) {
  const logs = [];
  const log = (...args) => {
    const line = args
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(" ");
    logs.push(line);
    console.log(`[${action.name}] ${line}`);
  };

  const activeRcon =
    useMockRcon && !getRcon()
      ? {
          send: async (cmd) => {
            logs.push(`[mock] ${cmd}`);
            return `[mock] ${cmd}`;
          },
        }
      : await initRCON(config);

  if (!action.run) {
    throw new Error(action.error || "Action is not compiled");
  }

  // Додаємо змінні з конфігу для зручності використання
  const { targetPlayer, rcon: rconConfig, tiktokUsername, sessionId } = config;

  const result = await action.run({
    rcon: activeRcon,
    event,
    config,
    log,
    // Змінні з конфігу для прямого доступу
    targetPlayer,
    rconConfig,
    tiktokUsername,
    sessionId,
  });

  return { result, logs };
}
