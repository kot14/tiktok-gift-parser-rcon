// src/utils/giftProcessor.js
// Трекує останній repeatCount для кожного комбо-подарунку
const comboState = new Map(); // key: `${uniqueId}_${giftName}`, value: { lastRepeatCount, lastProcessedTime }

export function processGift(data) {
  const comboKey = `${data.uniqueId}_${data.giftName}`;
  const currentRepeatCount = data.repeatCount || 1;
  const currentTime = Date.now();

  // Для комбо-подарунків обчислюємо скільки нових подарунків додалося
  let giftsToProcess = 1;
  if (data.giftType === 1) {
    // Комбо-подарунок: обробляємо тільки нові подарунки (різниця)
    const state = comboState.get(comboKey) || { lastRepeatCount: 0, lastProcessedTime: 0 };
    const lastRepeatCount = state.lastRepeatCount;
    const timeSinceLastProcess = currentTime - state.lastProcessedTime;
    
    // Якщо repeatCount збільшився, обробляємо різницю
    if (currentRepeatCount > lastRepeatCount) {
      giftsToProcess = currentRepeatCount - lastRepeatCount;
    } else if (currentRepeatCount === lastRepeatCount) {
      // Якщо repeatCount той самий, але минуло менше 2 секунд з останньої обробки,
      // це може бути випадок коли TikTok надсилає кілька подій з однаковим repeatCount
      // В такому випадку обробляємо як 1 новий подарунок
      if (timeSinceLastProcess < 2000) {
        giftsToProcess = 1;
        console.log(`[GiftProcessor] Виявлено нову подію з тим самим repeatCount (${currentRepeatCount}) через ${timeSinceLastProcess}ms, обробляємо як 1 подарунок`);
      } else {
        // Повторювана подія з тим самим repeatCount після довгого часу - пропускаємо
        console.log(`[GiftProcessor] Пропущено: дублікат події (lastRepeat=${lastRepeatCount}, currentRepeat=${currentRepeatCount}, минуло ${timeSinceLastProcess}ms)`);
        return null;
      }
    } else {
      // repeatCount зменшився - це не нормально, але обробляємо як новий подарунок
      console.log(`[GiftProcessor] Попередження: repeatCount зменшився з ${lastRepeatCount} до ${currentRepeatCount}, обробляємо як 1 подарунок`);
      giftsToProcess = 1;
    }
    
    // Детальне логування для діагностики
    console.log(`[GiftProcessor] ${comboKey}: lastRepeat=${lastRepeatCount}, currentRepeat=${currentRepeatCount}, toProcess=${giftsToProcess}, timeSinceLast=${timeSinceLastProcess}ms`);
    
    // Оновлюємо стан тільки після успішного обчислення
    comboState.set(comboKey, { lastRepeatCount: currentRepeatCount, lastProcessedTime: currentTime });
    
    // Якщо комбо закінчилося, очищаємо стан
    if (data.repeatEnd === true) {
      console.log(`[GiftProcessor] Комбо закінчилося для ${comboKey}`);
      comboState.delete(comboKey);
    }
  } else {
    // Одноразовий подарунок: обробляємо як є, завжди очищаємо старий стан спочатку
    comboState.delete(comboKey); // Очищаємо на випадок якщо був старий стан
    giftsToProcess = currentRepeatCount;
    console.log(`[GiftProcessor] Одноразовий подарунок ${comboKey}: toProcess=${giftsToProcess}`);
  }

  return {
    giftsToProcess,
    currentRepeatCount,
  };
}

export function clearComboState() {
  comboState.clear();
}

