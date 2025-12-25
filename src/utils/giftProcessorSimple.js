import { EventEmitter } from "events";

export function createGiftHandler() {
  const emitter = new EventEmitter();
  const processed = new Set();

  function handleGift(data) {
    if (!data.repeatEnd) return;

    const key = `${data.user?.userId}:${data.giftId}:${data.repeatCount}`;
    if (processed.has(key)) return;

    processed.add(key);
    setTimeout(() => processed.delete(key), 10_000);

    emitter.emit("gift", {
      giftName: data.giftDetails.giftName,
      repeatCount: data.repeatCount,
      user: data.user?.uniqueId,
    });
  }

  return { handleGift, emitter };
}