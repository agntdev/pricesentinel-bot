import { buildBot } from "./bot.js";
import { setDefaultCommands } from "./toolkit/index.js";
import { startMonitor } from "./lib/monitor.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }
  const bot = await buildBot(token);
  // Publish the "/" command list to Telegram (discoverability).
  await setDefaultCommands(bot, [
    { command: "price", description: "Check a coin or your watchlist" },
  ]);
  // Background Binance poll + morning summaries (Node/long-poll deploy).
  startMonitor(bot, { intervalMs: 60_000 });
  bot.start();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
