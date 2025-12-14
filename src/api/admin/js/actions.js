// Actions management module
import { GiftSelect } from "./giftSelect.js";
import { TEMPLATES } from "./templates.js";
import { api } from "./api.js";
import { showToast } from "./toast.js";

let saveConfigCallback = null;

export const ActionsManager = {
  state: null,

  setState(newState) {
    this.state = newState;
  },

  setSaveCallback(callback) {
    saveConfigCallback = callback;
  },

  renderActions() {
    const tbody = document.getElementById("actionsTable");
    if (!tbody) return;

    tbody.innerHTML = "";
    (this.state?.actions || []).forEach((action, idx) => {
      const tr = document.createElement("tr");
      const giftSelectCell = document.createElement("td");
      const giftSelect = GiftSelect.createGiftSelect(idx, action.giftName);
      giftSelectCell.appendChild(giftSelect);

      tr.innerHTML = `
        <td><input data-field="name" data-idx="${idx}" value="${
        action.name || ""
      }"/></td>
        <td><input data-field="description" data-idx="${idx}" value="${
        action.description || ""
      }"/></td>
        <td><textarea data-field="code" data-idx="${idx}">${
        action.code || ""
      }</textarea>
          <div class="muted">Приклад: async ({ rcon, event, log, targetPlayer }) => {\\n  const cmd = \\\`/say hello \\\${event.uniqueId}\\\`;\\n  await rcon.send(cmd);\\n  log("done");\\n}</div>
          <div class="muted" style="margin-top:4px;">Доступні параметри: rcon, event, config, log, targetPlayer, rconConfig, tiktokUsername, sessionId</div>
          <div style="margin:6px 0; display:flex; gap:6px; align-items:center;">
            <select data-idx="${idx}" data-field="template">
              <option value="">Шаблон</option>
              <option value="say">/say</option>
              <option value="zombie">Spawn zombie</option>
              <option value="give">Give diamond</option>
              <option value="command">Custom command</option>
            </select>
            <button data-action="template" data-idx="${idx}">Вставити</button>
          </div>
          ${
            action.error
              ? '<div class="error">' + action.error + "</div>"
              : ""
          }</td>
        <td class="actions">
        <div class="action-col">
          <button data-action="moveUp" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Перемістити вверх">⬆️</button>
          <button data-action="moveDown" data-idx="${idx}" ${idx === (this.state?.actions?.length || 0) - 1 ? 'disabled' : ''} title="Перемістити вниз">⬇️</button>
        </div>
        <div class="action-col">
          <button data-action="test" data-idx="${idx}">Тест</button>
          <button data-action="remove" data-idx="${idx}">Видалити</button>
        </div>
        </td>
      `;
      tr.insertBefore(giftSelectCell, tr.firstChild);
      tbody.appendChild(tr);

      // Setup gift select events
      GiftSelect.setupGiftSelectEvents(giftSelect, idx, this.state);
    });
  },

  bindTableEvents() {
    const table = document.getElementById("actionsTable");
    if (!table) return;

    table.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (Number.isInteger(idx) && field && field !== "giftName") {
        if (this.state.actions && this.state.actions[idx]) {
          this.state.actions[idx][field] = e.target.value;
        }
      }
    });

    table.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (Number.isInteger(idx) && field && field !== "giftName") {
        if (this.state.actions && this.state.actions[idx]) {
          this.state.actions[idx][field] = e.target.value;
        }
      }
    });

    table.addEventListener("click", async (e) => {
      const idx = Number(e.target.dataset.idx);
      const type = e.target.dataset.action;
      if (!Number.isInteger(idx)) return;

      if (type === "remove") {
        if (this.state.actions) {
          this.state.actions.splice(idx, 1);
          this.renderActions();
        }
        return;
      }

      if (type === "template") {
        const select = e.target.parentElement?.querySelector(
          'select[data-field="template"]'
        );
        const tplKey = select?.value;
        if (tplKey && TEMPLATES[tplKey] && this.state.actions && this.state.actions[idx]) {
          this.state.actions[idx].code = TEMPLATES[tplKey];
          this.renderActions();
        }
        return;
      }

      if (type === "test") {
        try {
          const resp = await api("/api/actions/test", {
            method: "POST",
            body: JSON.stringify({ action: this.state.actions[idx] }),
          });
          showToast("✅ Тест ок. Логи в консолі браузера.");
          console.log("Test logs:", resp.logs);
        } catch (err) {
          showToast("❌ " + err.message, true);
        }
        return;
      }

      if (type === "moveUp") {
        if (idx > 0 && this.state.actions) {
          const actions = this.state.actions;
          [actions[idx - 1], actions[idx]] = [actions[idx], actions[idx - 1]];
          this.renderActions();
          await this.saveActions();
        }
        return;
      }

      if (type === "moveDown") {
        if (this.state.actions && idx < this.state.actions.length - 1) {
          const actions = this.state.actions;
          [actions[idx], actions[idx + 1]] = [actions[idx + 1], actions[idx]];
          this.renderActions();
          await this.saveActions();
        }
        return;
      }
    });
  },

  async saveActions() {
    if (saveConfigCallback) {
      await saveConfigCallback();
    }
  },

  addAction() {
    if (!this.state.actions) {
      this.state.actions = [];
    }
    this.state.actions.unshift({
      id: crypto.randomUUID(),
      name: "New action",
      description: "",
      giftName: "",
      code: "async ({ rcon, event, targetPlayer, log }) => {\\n  // ваш код тут\\n  // Доступні: rcon, event, config, log, targetPlayer, rconConfig, tiktokUsername, sessionId\\n}",
    });
    this.renderActions();
  },
};

