// src/utils/giftProcessor.js
// Трекує останній repeatCount для кожного комбо-подарунку
const comboState = new Map(); // key: `${uniqueId}_${giftName}`, value: { lastRepeatCount, lastProcessedTime }

export function processGift(data) {
  const comboKey = `${data.uniqueId}_${data.giftName}`;
  const currentRepeatCount = data.repeatCount || 1;
  const currentTime = Date.now();
  const COMBO_TIMEOUT = 10000; // 10 секунд - якщо минуло більше, вважаємо що комбо закінчилося

  // Для комбо-подарунків обчислюємо скільки нових подарунків додалося
  let giftsToProcess = 1;
  if (data.giftType === 1) {
    // Комбо-подарунок: обробляємо тільки нові подарунки (різниця)
    const state = comboState.get(comboKey) || { lastRepeatCount: 0, lastProcessedTime: 0 };
    const lastRepeatCount = state.lastRepeatCount;
    const timeSinceLastProcess = currentTime - state.lastProcessedTime;
    
    // Якщо минуло багато часу (більше таймауту), це нова сесія подарунків - очищаємо старий стан
    if (timeSinceLastProcess > COMBO_TIMEOUT && lastRepeatCount > 0) {
      console.log(`[GiftProcessor] Очищено старий стан для ${comboKey} (минуло ${timeSinceLastProcess}ms, більше ${COMBO_TIMEOUT}ms)`);
      comboState.delete(comboKey);
      // Починаємо з чистого листа
      giftsToProcess = currentRepeatCount;
    }
    // Якщо repeatCount зменшився або став 1 після більшого значення - це нова сесія
    else if (currentRepeatCount < lastRepeatCount || (currentRepeatCount === 1 && lastRepeatCount > 1 && timeSinceLastProcess > 2000)) {
      console.log(`[GiftProcessor] Виявлено нову сесію подарунків для ${comboKey} (lastRepeat=${lastRepeatCount}, currentRepeat=${currentRepeatCount}, минуло ${timeSinceLastProcess}ms)`);
      comboState.delete(comboKey);
      // Починаємо нову сесію
      giftsToProcess = currentRepeatCount;
    }
    // Якщо repeatCount збільшився, обробляємо різницю
    else if (currentRepeatCount > lastRepeatCount) {
      giftsToProcess = currentRepeatCount - lastRepeatCount;
    } 
    // Якщо repeatCount той самий
    else if (currentRepeatCount === lastRepeatCount) {
      // Якщо минуло менше 2 секунд з останньої обробки,
      // це може бути випадок коли TikTok надсилає кілька подій з однаковим repeatCount
      // В такому випадку обробляємо як 1 новий подарунок
      if (timeSinceLastProcess < 2000) {
        giftsToProcess = 1;
        console.log(`[GiftProcessor] Виявлено нову подію з тим самим repeatCount (${currentRepeatCount}) через ${timeSinceLastProcess}ms, обробляємо як 1 подарунок`);
      } else {
        // Повторювана подія з тим самим repeatCount після довгого часу - це може бути нова сесія
        // Якщо repeatCount = 1, це точно нова сесія
        if (currentRepeatCount === 1) {
          console.log(`[GiftProcessor] Виявлено нову сесію (repeatCount=1 після ${timeSinceLastProcess}ms)`);
          comboState.delete(comboKey);
          giftsToProcess = 1;
        } else {
          // Інакше пропускаємо як дублікат
          console.log(`[GiftProcessor] Пропущено: дублікат події (lastRepeat=${lastRepeatCount}, currentRepeat=${currentRepeatCount}, минуло ${timeSinceLastProcess}ms)`);
          return null;
        }
      }
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

