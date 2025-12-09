// src/index.js
import { loadConfig, saveConfig } from "./config/configManager.js";
import { compileActions } from "./services/actionService.js";
import { connectTikTok, stopTikTok, isConnected } from "./services/tiktokService.js";
import { disconnectRcon } from "./services/rconService.js";
import { createAdminServer } from "./api/routes.js";

const ADMIN_PORT = process.env.ADMIN_PORT || 3000;

let config = loadConfig();
let compiledActions = compileActions(config.actions);

async function reloadFromConfig(nextConfig) {
  config = nextConfig;
  compiledActions = compileActions(config.actions);
  saveConfig(config);
  
  if (isConnected()) {
    await disconnectRcon();
    await connectTikTok(config, compiledActions);
  }
}

async function main() {
  const getConfig = () => config;
  const getCompiledActions = () => compiledActions;
  const app = createAdminServer(getConfig, getCompiledActions, reloadFromConfig);
  app.listen(ADMIN_PORT, () => {
    console.log(`🛠  Панель: http://localhost:${ADMIN_PORT}`);
  });
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

