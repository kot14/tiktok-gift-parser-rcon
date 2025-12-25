// Gift select component module
let giftList = [];

export const GiftSelect = {
  setGiftList(list) {
    giftList = list || [];
  },

  filterGifts(searchTerm) {
    if (!searchTerm) return giftList;
    const term = searchTerm.toLowerCase();
    return giftList.filter((gift) => {
      const name = typeof gift === "string" ? gift : gift.name || "";
      return name.toLowerCase().includes(term);
    });
  },

  getGiftPrice(giftName) {
    if (!giftName) return null;
    const gift = giftList.find((g) => {
      const name = typeof g === "string" ? g : g.name || "";
      return name === giftName;
    });
    if (!gift) return null;
    return typeof gift === "object" &&
      gift.diamond_count !== null &&
      gift.diamond_count !== undefined
      ? gift.diamond_count
      : null;
  },

  updatePriceDisplay(input) {
    const priceSpan = input.parentElement?.querySelector(".gift-price-display");
    if (!priceSpan) return;

    const giftName = input.value.trim();
    if (!giftName) {
      priceSpan.textContent = "";
      priceSpan.style.display = "none";
      return;
    }

    // Перевіряємо, чи є точний збіг з подарунком
    const price = this.getGiftPrice(giftName);
    if (price !== null) {
      priceSpan.textContent = `(${price})`;
      priceSpan.style.display = "inline";
    } else {
      priceSpan.textContent = "";
      priceSpan.style.display = "none";
    }
  },

  createGiftSelect(idx, currentValue) {
    console.log(currentValue);
    const wrapper = document.createElement("div");
    wrapper.className = "gift-select-wrapper";
    wrapper.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">

        <input 
          type="text" 
          class="gift-select-input" 
          data-field="giftName" 
          data-idx="${idx}"
          value="${currentValue || ""}"
          placeholder="🔍 Пошук подарунка..."
          autocomplete="off"
          style="flex: 1;"
        />
        <span class="gift-price-display" style="color: #999; font-size: 0.9em; white-space: nowrap; display: none;"></span>
        
      </div>
      <div class="gift-select-dropdown" data-idx="${idx}"></div>
    `;
    return wrapper;
  },

  renderGiftDropdown(input, idx, state) {
    const wrapper = input.closest(".gift-select-wrapper");
    const dropdown = wrapper?.querySelector(".gift-select-dropdown");
    if (!dropdown) return;

    const searchTerm = input.value;
    const filtered = this.filterGifts(searchTerm);

    dropdown.innerHTML =
      filtered.length > 0
        ? filtered
            .map((gift, i) => {
              const name = typeof gift === "string" ? gift : gift.name || "";
              const price =
                typeof gift === "object" &&
                gift.diamond_count !== null &&
                gift.diamond_count !== undefined
                  ? gift.diamond_count
                  : null;
              const priceDisplay =
                price !== null
                  ? ` <span style="color: #999; font-size: 0.9em;">(${price})</span> <img src=${gift.icon.url_list[0]} style="width:12px; height:12px; vertical-align:middle;"/>`
                  : "";
              return `<div class="gift-select-item" data-value="${name}" data-index="${i}">${name}${priceDisplay}</div>`;
            })
            .join("")
        : '<div class="gift-select-item" style="color:#999;">Нічого не знайдено</div>';

    dropdown.classList.add("show");
    input.dataset.selectedIndex = "-1";
  },

  hideGiftDropdown(input) {
    const wrapper = input.closest(".gift-select-wrapper");
    const dropdown = wrapper?.querySelector(".gift-select-dropdown");
    if (dropdown) {
      dropdown.classList.remove("show");
    }
  },

  setupGiftSelectEvents(giftSelect, idx, state) {
    const giftInput = giftSelect.querySelector(".gift-select-input");
    const giftDropdown = giftSelect.querySelector(".gift-select-dropdown");

    if (!giftInput || !giftDropdown) return;

    giftInput.addEventListener("input", (e) => {
      this.renderGiftDropdown(e.target, idx, state);
      this.updatePriceDisplay(e.target);
      if (state.actions && state.actions[idx]) {
        state.actions[idx].giftName = e.target.value;
      }
    });

    giftInput.addEventListener("focus", (e) => {
      this.renderGiftDropdown(e.target, idx, state);
    });

    giftInput.addEventListener("blur", (e) => {
      setTimeout(() => this.hideGiftDropdown(e.target), 200);
    });

    giftInput.addEventListener("keydown", (e) => {
      if (!giftDropdown.classList.contains("show")) return;

      const items = giftDropdown.querySelectorAll(
        ".gift-select-item[data-value]"
      );
      if (items.length === 0) return;

      let selectedIdx = parseInt(giftInput.dataset.selectedIndex || "-1");

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        giftInput.dataset.selectedIndex = selectedIdx;
        items[selectedIdx].scrollIntoView({ block: "nearest" });
        items.forEach((item, i) => {
          item.classList.toggle("selected", i === selectedIdx);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, -1);
        giftInput.dataset.selectedIndex = selectedIdx;
        if (selectedIdx >= 0) {
          items[selectedIdx].scrollIntoView({ block: "nearest" });
          items.forEach((item, i) => {
            item.classList.toggle("selected", i === selectedIdx);
          });
        }
      } else if (e.key === "Enter" && selectedIdx >= 0) {
        e.preventDefault();
        const item = items[selectedIdx];
        if (item && item.dataset.value) {
          giftInput.value = item.dataset.value;
          this.updatePriceDisplay(giftInput);
          if (state.actions && state.actions[idx]) {
            state.actions[idx].giftName = item.dataset.value;
          }
          this.hideGiftDropdown(giftInput);
        }
      } else if (e.key === "Escape") {
        this.hideGiftDropdown(giftInput);
      }
    });

    giftDropdown.addEventListener("click", (e) => {
      const item = e.target.closest(".gift-select-item");
      if (item && item.dataset.value) {
        giftInput.value = item.dataset.value;
        this.updatePriceDisplay(giftInput);
        if (state.actions && state.actions[idx]) {
          state.actions[idx].giftName = item.dataset.value;
        }
        this.hideGiftDropdown(giftInput);
      }
    });

    giftDropdown.addEventListener("mouseenter", (e) => {
      const item = e.target.closest(".gift-select-item");
      if (item && item.dataset.index) {
        const items = giftDropdown.querySelectorAll(
          ".gift-select-item[data-value]"
        );
        items.forEach((i, idx) => {
          i.classList.toggle("selected", idx === parseInt(item.dataset.index));
        });
        giftInput.dataset.selectedIndex = item.dataset.index;
      }
    });

    // Оновлюємо відображення ціни для початкового значення
    this.updatePriceDisplay(giftInput);
  },
};
