import { buildBot } from "./bot.js";
import { resetDurableStore } from "./lib/store.js";
import { resetBinanceFetch } from "./lib/binance.js";
import { setNow } from "./lib/clock.js";

// The Tests-gate harness imports THIS module and calls makeBot() with no args,
// replaying dialog specs tokenlessly (it fakes the Bot API transport — no real
// Telegram call is made). The token is a placeholder for replay. The agntdev-ci
// orchestrator points AGNTDEV_BOT_MODULE at the compiled dist/harness-entry.js.
export async function makeBot() {
  // Fresh durable store + clock + fetch per bot so specs don't leak state.
  resetDurableStore();
  resetBinanceFetch();
  setNow(null);
  return buildBot(process.env.BOT_TOKEN ?? "harness-test-token");
}
