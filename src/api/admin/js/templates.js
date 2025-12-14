// Code templates module
export const TEMPLATES = {
  say: [
    "async ({ rcon, event, log }) => {",
    "  const msg = 'Hello ' + (event.nickname || event.uniqueId) + '!';",
    "  await rcon.send('/say ' + msg);",
    "  log('sent:', msg);",
    "}",
  ].join("\\n"),
  zombie: [
    "async ({ rcon, targetPlayer, log }) => {",
    "  // targetPlayer доступний напряму з конфігу",
    "  const cmd = '/execute as @a[name=' + targetPlayer + ',limit=1] at @s run summon zombie ~ ~1 ~';",
    "  await rcon.send(cmd);",
    "  log('zombie spawned');",
    "}",
  ].join("\\n"),
  give: [
    "async ({ rcon, targetPlayer, log }) => {",
    "  // Можна використовувати targetPlayer або config.targetPlayer",
    "  const cmd = '/give ' + targetPlayer + ' minecraft:diamond 1';",
    "  await rcon.send(cmd);",
    "  log('diamond given');",
    "}",
  ].join("\\n"),
  command: [
    "async ({ rcon, event, config, log }) => {",
    "  // Доступні змінні: rcon, event, config, log, targetPlayer, rconConfig, tiktokUsername, sessionId",
    "  const raw = '/time set day'; // заміни на потрібну команду",
    "  const out = await rcon.send(raw);",
    "  log(out);",
    "}",
  ].join("\\n"),
};

