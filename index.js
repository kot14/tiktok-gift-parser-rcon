// index.js
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import { WebcastPushConnection } from "tiktok-live-connector";
import { Rcon } from "rcon-client";

const CONFIG_PATH = path.join(process.cwd(), "config.json");
const ADMIN_PORT = process.env.ADMIN_PORT || 3000;

let connection;
let rcon;
let config = loadConfig();
let compiledActions = compileActions(config.actions);
const logs = [];
const MAX_LOGS = 300;

function addLog(type, message, extra = undefined) {
  const entry = {
    ts: Date.now(),
    type,
    message,
    extra,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  console.log(`[${type}] ${message}`, extra ?? "");
}

function loadConfig() {
  try {
    const file = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(file);
  } catch (err) {
    console.warn("⚠️  Не знайдено config.json, використовую дефолт", err.message);
    return {
      tiktokUsername: "",
      sessionId: "",
      rcon: { host: "localhost", port: 25575, password: "" },
      targetPlayer: "",
      actions: [],
    };
  }
}

function saveConfig(nextConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
}

function compileAction(action) {
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

function compileActions(actions = []) {
  return actions.map(compileAction);
}

async function initRCON() {
  if (rcon) {
    return rcon;
  }

  try {
    rcon = new Rcon({
      host: config.rcon.host,
      port: config.rcon.port,
      password: config.rcon.password,
    });
    await rcon.connect();
    console.log("✅ RCON підключено до Minecraft сервера!");
    return rcon;
  } catch (err) {
    console.error("❌ Помилка RCON:", err.message);
    throw err;
  }
}

async function disconnectRcon() {
  if (rcon) {
    try {
      await rcon.end();
    } catch (err) {
      console.warn("⚠️  Не вдалося коректно закрити RCON", err.message);
    }
    rcon = null;
  }
}

async function stopTikTok() {
  if (connection) {
    try {
      await connection.disconnect();
    } catch (err) {
      console.warn("⚠️  Не вдалося коректно відключитися від TikTok", err.message);
    }
    connection = null;
    addLog("info", "Зупинено підключення до TikTok");
  }
}

function pickActionForGift(giftName) {
  return compiledActions.find(
    (action) => action.giftName === giftName && !action.error
  );
}

async function runAction(action, event, { useMockRcon = false } = {}) {
  const logs = [];
  const log = (...args) => {
    const line = args
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(" ");
    logs.push(line);
    console.log(`[${action.name}] ${line}`);
  };

  const activeRcon =
    useMockRcon && !rcon
      ? {
          send: async (cmd) => {
            logs.push(`[mock] ${cmd}`);
            return `[mock] ${cmd}`;
          },
        }
      : await initRCON();

  if (!action.run) {
    throw new Error(action.error || "Action is not compiled");
  }

  const result = await action.run({
    rcon: activeRcon,
    event,
    config,
    log,
  });

  return { result, logs };
}

async function connectTikTok() {
  await stopTikTok();

  if (!config.tiktokUsername) {
    console.warn("⚠️  tiktokUsername порожній, не підключаю TikTok");
    addLog("warn", "tiktokUsername порожній, не підключаю TikTok");
    return;
  }

  connection = new WebcastPushConnection(config.tiktokUsername, {
    sessionId: config.sessionId,
    enableExtendedGiftInfo: true,
  });

  connection.on("chat", (data) => {
    console.log(`${data.uniqueId} (${data.nickname}): ${data.comment}`);
    addLog("chat", `${data.uniqueId}: ${data.comment}`, {
      user: data.uniqueId,
      nickname: data.nickname,
      comment: data.comment,
    });
  });

  connection.on("member", (data) =>
    addLog("member", `${data.uniqueId} зайшов у стрім`, {
      user: data.uniqueId,
      nickname: data.nickname,
    })
  );

  connection.on("gift", async (data) => {
    // Ігноруємо проміжні повтори, обробляємо лише фінал комбо або одноразовий подарунок
    if (data.giftType === 1 && data.repeatEnd === false) {
      return;
    }

    addLog(
      "gift",
      `${data.uniqueId} надіслав ${data.giftName} x${data.repeatCount}`,
      {
        user: data.uniqueId,
        nickname: data.nickname,
        gift: data.giftName,
        repeat: data.repeatCount,
      }
    );
    const action = pickActionForGift(data.giftName);
    if (!action) {
      addLog("info", `Немає скрипту для подарунку ${data.giftName}`);
      return;
    }

    try {
      await runAction(action, data);
      addLog("action", `Скрипт ${action.name} виконано`);
    } catch (err) {
      addLog("error", `Помилка у скрипті ${action.name}: ${err.message}`);
    }
  });

  connection.on("streamEnd", async () => {
    console.log("🔴 Стрім закінчився");
    await disconnectRcon();
    addLog("info", "Стрім закінчився");
  });

  connection.on("error", async (err) => {
    addLog("error", `Помилка TikTok: ${err.message}`);
    await disconnectRcon();
  });

  try {
    const state = await connection.connect();
    addLog(
      "info",
      `Підключено до стріму ${config.tiktokUsername}, roomId=${state.roomId}`
    );
    await initRCON();
  } catch (err) {
    addLog("error", `Не вдалося підключитися до TikTok: ${err.message}`);
  }
}

async function reloadFromConfig(nextConfig) {
  config = nextConfig;
  compiledActions = compileActions(config.actions);
  saveConfig(config);
  if (connection) {
    await disconnectRcon();
    await connectTikTok();
  }
}

function adminHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>TikTok Gift Scripts</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; padding-bottom: 80px; }
      h1 { margin-bottom: 0; }
      .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      label { display: block; font-weight: 600; margin-bottom: 4px; }
      input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; }
      textarea { min-height: 120px; font-family: monospace; }
      button { padding: 8px 12px; cursor: pointer; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 8px; vertical-align: top; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill { padding: 2px 6px; border-radius: 8px; background: #eef; font-size: 12px; }
      .error { color: #c00; font-weight: 600; }
      .success { color: #070; font-weight: 600; }
      .card { border: 1px solid #ddd; padding: 12px; border-radius: 8px; margin-top: 12px; }
      .sticky { position: fixed; bottom: 12px; right: 12px; background: #000; color: #fff; padding: 12px; border-radius: 8px; opacity: 0.9; }
      .muted { color: #555; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Gift scripts dashboard</h1>
    <p class="muted">Редагуй конфіг, додавай/тестуй скрипти без перезапуску сервера.</p>
    <div class="row">
      <div class="card">
        <h3>Підключення</h3>
        <div class="actions" style="margin-bottom:8px;">
          <button id="btnStart">▶️ Старт</button>
          <button id="btnStop">⏹ Стоп</button>
          <span id="status" class="muted"></span>
        </div>
        <label>TikTok username
          <input id="tiktokUsername" />
        </label>
        <label>sessionId
          <input id="sessionId" />
        </label>
        <label>Target player
          <input id="targetPlayer" />
        </label>
      </div>
      <div class="card">
        <h3>RCON</h3>
        <label>Host
          <input id="rconHost" />
        </label>
        <label>Port
          <input id="rconPort" type="number" />
        </label>
        <label>Password
          <input id="rconPassword" type="password" />
        </label>
      </div>
    </div>

    <div class="actions" style="margin-top:12px;">
      <button id="saveConfig">💾 Зберегти конфіг</button>
      <span id="saveStatus" class="muted"></span>
    </div>

    <h3 style="margin-top:24px;">Скрипти на подарунки</h3>
    <table>
      <thead>
        <tr><th>Gift name</th><th>Назва</th><th>Опис</th><th>Код</th><th>Дії</th></tr>
      </thead>
      <tbody id="actionsTable"></tbody>
    </table>
    <button id="addAction" style="margin-top:12px;">➕ Додати скрипт</button>

    <div id="toast" class="sticky" style="display:none;"></div>
    <h3 style="margin-top:24px;">Логи трансляції</h3>
    <pre id="logs" style="background:#111;color:#eee;padding:12px;max-height:240px;overflow:auto;border-radius:8px;"></pre>

    <script>
      const toastEl = document.getElementById("toast");
      const showToast = (msg, isError=false) => {
        toastEl.textContent = msg;
        toastEl.style.background = isError ? "#b00020" : "#000";
        toastEl.style.display = "block";
        setTimeout(() => toastEl.style.display = "none", 2500);
      };

      const api = async (path, options = {}) => {
        const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || res.statusText);
        }
        return res.json();
      };

      let state = null;
      let logs = [];
      const TEMPLATES = {
        say: [
          "async ({ rcon, event, config, log }) => {",
          "  const msg = 'Hello ' + (event.nickname || event.uniqueId) + '!';",
          "  await rcon.send('/say ' + msg);",
          "  log('sent:', msg);",
          "}",
        ].join("\\n"),
        zombie: [
          "async ({ rcon, event, config, log }) => {",
          "  const cmd = '/execute as @a[name=' + config.targetPlayer + ',limit=1] at @s run summon zombie ~ ~1 ~';",
          "  await rcon.send(cmd);",
          "  log('zombie spawned');",
          "}",
        ].join("\\n"),
        give: [
          "async ({ rcon, event, config, log }) => {",
          "  const cmd = '/give ' + config.targetPlayer + ' minecraft:diamond 1';",
          "  await rcon.send(cmd);",
          "  log('diamond given');",
          "}",
        ].join("\\n"),
        command: [
          "async ({ rcon, event, config, log }) => {",
          "  const raw = '/time set day'; // заміни на потрібну команду",
          "  const out = await rcon.send(raw);",
          "  log(out);",
          "}",
        ].join("\\n"),
      };

      const renderLogs = () => {
        const target = document.getElementById("logs");
        target.textContent = logs
          .slice()
          .reverse()
          .map((l) => {
            const time = new Date(l.ts).toLocaleTimeString();
            return \`[\${time}] [\${l.type}] \${l.message}\`;
          })
          .join("\\n");
      };

      const renderActions = () => {
        const tbody = document.getElementById("actionsTable");
        tbody.innerHTML = "";
        (state?.actions || []).forEach((action, idx) => {
          const tr = document.createElement("tr");
          tr.innerHTML = \`
            <td><input data-field="giftName" data-idx="\${idx}" value="\${action.giftName || ""}"/></td>
            <td><input data-field="name" data-idx="\${idx}" value="\${action.name || ""}"/></td>
            <td><input data-field="description" data-idx="\${idx}" value="\${action.description || ""}"/></td>
            <td><textarea data-field="code" data-idx="\${idx}">\${action.code || ""}</textarea>
              <div class="muted">Приклад: async ({ rcon, event, config, log }) => {\\n  const cmd = \\\`/say hello \\\${event.uniqueId}\\\`;\\n  await rcon.send(cmd);\\n  log("done");\\n}</div>
              <div style="margin:6px 0; display:flex; gap:6px; align-items:center;">
                <select data-idx="\${idx}" data-field="template">
                  <option value="">Шаблон</option>
                  <option value="say">/say</option>
                  <option value="zombie">Spawn zombie</option>
                  <option value="give">Give diamond</option>
                  <option value="command">Custom command</option>
                </select>
                <button data-action="template" data-idx="\${idx}">Вставити</button>
              </div>
              \${action.error ? '<div class="error">' + action.error + '</div>' : ''}</td>
            <td class="actions">
              <button data-action="test" data-idx="\${idx}">Тест</button>
              <button data-action="remove" data-idx="\${idx}">Видалити</button>
            </td>
          \`;
          tbody.appendChild(tr);
        });
      };

      const bindTableEvents = () => {
        document.getElementById("actionsTable").addEventListener("input", (e) => {
          const idx = Number(e.target.dataset.idx);
          const field = e.target.dataset.field;
          if (Number.isInteger(idx) && field) {
            state.actions[idx][field] = e.target.value;
          }
        });

        document.getElementById("actionsTable").addEventListener("click", async (e) => {
          const idx = Number(e.target.dataset.idx);
          const type = e.target.dataset.action;
          if (!Number.isInteger(idx)) return;
          if (type === "remove") {
            state.actions.splice(idx, 1);
            renderActions();
            return;
          }
          if (type === "template") {
            const select = e.target.parentElement?.querySelector('select[data-field="template"]');
            const tplKey = select?.value;
            if (tplKey && TEMPLATES[tplKey]) {
              state.actions[idx].code = TEMPLATES[tplKey];
              renderActions();
            }
            return;
          }
          if (type === "test") {
            try {
              const resp = await api("/api/actions/test", {
                method: "POST",
                body: JSON.stringify({ action: state.actions[idx] })
              });
              showToast("✅ Тест ок. Логи в консолі браузера.");
              console.log("Test logs:", resp.logs);
            } catch (err) {
              showToast("❌ " + err.message, true);
            }
          }
        });
      };

      const loadConfig = async () => {
        state = await api("/api/config");
        document.getElementById("tiktokUsername").value = state.tiktokUsername || "";
        document.getElementById("sessionId").value = state.sessionId || "";
        document.getElementById("targetPlayer").value = state.targetPlayer || "";
        document.getElementById("rconHost").value = state.rcon?.host || "";
        document.getElementById("rconPort").value = state.rcon?.port || "";
        document.getElementById("rconPassword").value = state.rcon?.password || "";
        renderActions();
      };

      const loadStatus = async () => {
        try {
          const s = await api("/api/status");
          document.getElementById("status").textContent = s.running ? "Підключено" : "Не підключено";
          logs = s.logs || [];
          renderLogs();
        } catch (err) {
          console.warn(err);
        }
      };

      document.getElementById("saveConfig").addEventListener("click", async () => {
        const payload = {
          tiktokUsername: document.getElementById("tiktokUsername").value.trim(),
          sessionId: document.getElementById("sessionId").value.trim(),
          targetPlayer: document.getElementById("targetPlayer").value.trim(),
          rcon: {
            host: document.getElementById("rconHost").value.trim(),
            port: Number(document.getElementById("rconPort").value),
            password: document.getElementById("rconPassword").value
          },
          actions: state.actions
        };
        try {
          const saved = await api("/api/config", { method: "PUT", body: JSON.stringify(payload) });
          state = saved;
          renderActions();
          showToast("✅ Збережено і перезапущено");
        } catch (err) {
          showToast("❌ " + err.message, true);
        }
      });

      document.getElementById("addAction").addEventListener("click", () => {
        state.actions.push({
          id: crypto.randomUUID(),
          name: "New action",
          description: "",
          giftName: "",
          code: "async ({ rcon, event, config, log }) => {\\n  // ваш код тут\\n}"
        });
        renderActions();
      });

      document.getElementById("btnStart").addEventListener("click", async () => {
        try {
          await api("/api/start", { method: "POST" });
          showToast("Запущено");
          await loadStatus();
        } catch (err) {
          showToast("❌ " + err.message, true);
        }
      });

      document.getElementById("btnStop").addEventListener("click", async () => {
        try {
          await api("/api/stop", { method: "POST" });
          showToast("Зупинено");
          await loadStatus();
        } catch (err) {
          showToast("❌ " + err.message, true);
        }
      });

      bindTableEvents();
      loadConfig().catch((err) => showToast("Не зміг завантажити: " + err.message, true));
      loadStatus();
      setInterval(loadStatus, 2000);
    </script>
    <div class="muted" style="margin-top:12px;">
      Параметри у скрипті: { rcon, event, config, log }. event містить giftName, uniqueId, nickname, repeatCount.
    </div>
  </body>
</html>`;
}

function createAdminServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(adminHtml());
  });

  app.get("/api/config", (_req, res) => {
    res.json({ ...config, actions: compiledActions });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ running: Boolean(connection), logs });
  });

  app.put("/api/config", async (req, res) => {
    try {
      const nextConfig = {
        ...config,
        ...req.body,
        rcon: { ...config.rcon, ...(req.body.rcon || {}) },
        actions: req.body.actions || [],
      };
      await reloadFromConfig(nextConfig);
      res.json({ ...config, actions: compiledActions });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/start", async (_req, res) => {
    try {
      await connectTikTok();
      res.json({ running: Boolean(connection) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/stop", async (_req, res) => {
    try {
      await stopTikTok();
      await disconnectRcon();
      res.json({ running: false });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/actions/test", async (req, res) => {
    const action = compileAction(req.body.action);
    if (action.error) {
      return res.status(400).json({ error: action.error });
    }
    try {
      const payload =
        req.body.event || { giftName: action.giftName, uniqueId: "tester", nickname: "Tester", repeatCount: 1 };
      const { logs, result } = await runAction(action, payload, { useMockRcon: false });
      res.json({ ok: true, logs, result: result ?? null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/actions/run", async (req, res) => {
    const action = compiledActions.find((a) => a.id === req.body.id);
    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }
    try {
      const payload =
        req.body.event || { giftName: action.giftName, uniqueId: "manual", nickname: "Manual", repeatCount: 1 };
      const { logs, result } = await runAction(action, payload);
      res.json({ ok: true, logs, result: result ?? null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.listen(ADMIN_PORT, () => {
    console.log(`🛠  Панель: http://localhost:${ADMIN_PORT}`);
  });
}

async function main() {
  createAdminServer();
}

process.on("SIGINT", async () => {
  console.log("\n🛑 Зупинка...");
  await stopTikTok();
  await disconnectRcon();
  process.exit(0);
});

main().catch((err) => {
  console.error("❌ Критична помилка:", err);
  process.exit(1);
});
