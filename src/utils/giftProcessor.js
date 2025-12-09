// src/utils/giftProcessor.js
// Трекує останній repeatCount для кожного комбо-подарунку
const comboState = new Map(); // key: `${uniqueId}_${giftName}`, value: lastRepeatCount

export function processGift(data) {
  const comboKey = `${data.uniqueId}_${data.giftName}`;
  const lastRepeatCount = comboState.get(comboKey) || 0;
  const currentRepeatCount = data.repeatCount || 1;

  // Для комбо-подарунків обчислюємо скільки нових подарунків додалося
  let giftsToProcess = 1;
  if (data.giftType === 1) {
    // Комбо-подарунок: обробляємо тільки нові подарунки (різниця)
    giftsToProcess = currentRepeatCount - lastRepeatCount;
    if (giftsToProcess <= 0) {
      return null; // Немає нових подарунків
    }
    comboState.set(comboKey, currentRepeatCount);
    // Якщо комбо закінчилося, очищаємо стан
    if (data.repeatEnd === true) {
      comboState.delete(comboKey);
    }
  } else {
    // Одноразовий подарунок: обробляємо як є
    giftsToProcess = currentRepeatCount;
    comboState.delete(comboKey); // Очищаємо на випадок якщо був старий стан
  }

  return {
    giftsToProcess,
    currentRepeatCount,
  };
}

export function clearComboState() {
  comboState.clear();
}

