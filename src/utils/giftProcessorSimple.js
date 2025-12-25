import { EventEmitter } from "events";

export function createGiftHandler() {
  const emitter = new EventEmitter();
  const processed = new Set();

  function handleGift(data) {
    // Базова перевірка, чи це подарунок
    if (!data || !data.giftDetails || !data.giftDetails.giftName) {
      return;
    }

    // Визначаємо, чи подарунок підтримує стрек (type === 1)
    const isStreakable = data.giftDetails.type === 1 || data.giftType === 1;

    // Якщо це стрек-подарунок — обробляємо тільки коли repeatEnd === 1 (кінець комбо)
    if (isStreakable && data.repeatEnd !== 1) {
      return;
    }

    // Для дорогих подарунків repeatEnd зазвичай 0 або відсутній — обробляємо відразу

    // Дедуплікація
    const userId = data.user?.userId || data.user?.uniqueId || "unknown";
    const giftId = data.giftId || data.giftDetails.giftId || "unknown";
    const repeatCount = data.repeatCount || 1;

    const key = `${userId}:${giftId}:${repeatCount}`;
    if (processed.has(key)) {
      return;
    }
    processed.add(key);
    setTimeout(() => processed.delete(key), 10_000);

    // ТОЧНО ТАКОЖ САМЕ ФОРМАТ, ЯК У ТЕБЕ БУВ
    emitter.emit("gift", {
      giftName: data.giftDetails.giftName,
      repeatCount: repeatCount,
      user: data.user?.uniqueId || "unknown",
    });
  }

  return {
    handleGift,
    emitter, // якщо потрібно напряму
    onGift: (callback) => emitter.on("gift", callback), // зручний helper
  };
}