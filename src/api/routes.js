// src/api/routes.js
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { adminHtml } from "./adminHtml.js";
import { getLogs, clearLogs } from "../services/logger.js";
import { compileAction, runAction } from "../services/actionService.js";
import {
  connectTikTok,
  stopTikTok,
  isConnected,
} from "../services/tiktokService.js";
import { disconnectRcon } from "../services/rconService.js";
import { saveConfig, loadConfig } from "../config/configManager.js";
import { compileActions } from "../services/actionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createAdminServer(
  getConfig,
  getCompiledActions,
  reloadCallback
) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Serve static CSS file
  app.get("/admin.css", (_req, res) => {
    try {
      const cssPath = join(__dirname, "admin.css");
      const css = readFileSync(cssPath, "utf-8");
      res.setHeader("Content-Type", "text/css");
      res.send(css);
    } catch (err) {
      res.status(404).send("/* CSS file not found */");
    }
  });

  // Serve static JS files
  app.get("/admin/js/:filename", (req, res) => {
    try {
      const jsPath = join(__dirname, "admin", "js", req.params.filename);
      const js = readFileSync(jsPath, "utf-8");
      res.setHeader("Content-Type", "application/javascript");
      res.send(js);
    } catch (err) {
      res.status(404).send("// JS file not found");
    }
  });

  app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(adminHtml());
  });

  app.get("/api/config", (_req, res) => {
    const config = getConfig();
    const compiledActions = getCompiledActions();
    res.json({ ...config, actions: compiledActions });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ running: isConnected(), logs: getLogs() });
  });

  app.post("/api/logs/clear", (_req, res) => {
    clearLogs();
    res.json({ ok: true });
  });

  app.get("/api/gifts", (_req, res) => {
    try {
      const giftsPath = join(__dirname, "../types/gifts.json");
      const giftsData = JSON.parse(readFileSync(giftsPath, "utf-8"));
      // Повертаємо повні об'єкти з name та price для відображення ціни
      const gifts = Array.isArray(giftsData)
        ? giftsData.map((gift) =>
            typeof gift === "object"
              ? gift
              : { name: gift.name, diamond_count: gift.diamond_count }
          )
        : giftsData.tiktokGifts || [];
      res.json(gifts);
    } catch (err) {
      res.status(500).json({ error: "Failed to load gifts" });
    }
  });

  app.put("/api/config", async (req, res) => {
    try {
      const config = getConfig();
      const nextConfig = {
        ...config,
        ...req.body,
        rcon: { ...config.rcon, ...(req.body.rcon || {}) },
        actions: req.body.actions || [],
      };
      await reloadCallback(nextConfig);
      const newCompiledActions = compileActions(nextConfig.actions);
      res.json({ ...nextConfig, actions: newCompiledActions });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/start", async (req, res) => {
    try {
      const config = getConfig();
      const compiledActions = getCompiledActions();
      await connectTikTok(config, compiledActions);
      res.json({ running: isConnected() });
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
      const config = getConfig();
      const payload = req.body.event || {
        giftName: action.giftName,
        uniqueId: "tester",
        nickname: "Tester",
        repeatCount: 1,
      };
      const { logs, result } = await runAction(action, payload, config, {
        useMockRcon: false,
      });
      res.json({ ok: true, logs, result: result ?? null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/actions/run", async (req, res) => {
    const compiledActions = getCompiledActions();
    const action = compiledActions.find((a) => a.id === req.body.id);
    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }
    try {
      const config = getConfig();
      const payload = req.body.event || {
        giftName: action.giftName,
        uniqueId: "manual",
        nickname: "Manual",
        repeatCount: 1,
      };
      const { logs, result } = await runAction(action, payload, config);
      res.json({ ok: true, logs, result: result ?? null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return app;
}
