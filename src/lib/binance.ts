/**
 * Binance spot public REST client.
 * Public endpoints need no credentials:
 *   GET /api/v3/ticker/24hr?symbol=BTCUSDT
 *   GET /api/v3/ticker/price?symbol=BTCUSDT
 */

const BASE = "https://api.binance.com";

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  priceChange: number;
  highPrice: number;
  lowPrice: number;
}

export interface PriceQuote {
  symbol: string;
  price: number;
}

/** Normalize user input ("btc", "BTCUSDT", "BTC/USDT") → base asset "BTC". */
export function normalizeTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.endsWith("USDT")) t = t.slice(0, -4);
  if (t.endsWith("USD") && t.length > 3) t = t.slice(0, -3);
  return t;
}

/** Binance spot pair symbol for a base ticker. */
export function toBinanceSymbol(ticker: string): string {
  return `${normalizeTicker(ticker)}USDT`;
}

let _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);

/** Inject fetch (tests). */
export function setBinanceFetch(fn: typeof globalThis.fetch): void {
  _fetch = fn;
}

export function resetBinanceFetch(): void {
  _fetch = globalThis.fetch.bind(globalThis);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await _fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Binance ${res.status}: ${body.slice(0, 120)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * Fetch 24h ticker stats. Returns null when the symbol is invalid (HTTP 400)
 * so callers can tell "bad ticker" from network failure.
 */
export async function fetch24h(ticker: string): Promise<Ticker24h | null> {
  const symbol = toBinanceSymbol(ticker);
  try {
    const raw = await getJson<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      priceChange: string;
      highPrice: string;
      lowPrice: string;
    }>(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
    return {
      symbol: raw.symbol,
      lastPrice: Number(raw.lastPrice),
      priceChangePercent: Number(raw.priceChangePercent),
      priceChange: Number(raw.priceChange),
      highPrice: Number(raw.highPrice),
      lowPrice: Number(raw.lowPrice),
    };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400) return null;
    throw e;
  }
}

/** Fetch current price only. null = invalid symbol. */
export async function fetchPrice(ticker: string): Promise<PriceQuote | null> {
  const symbol = toBinanceSymbol(ticker);
  try {
    const raw = await getJson<{ symbol: string; price: string }>(
      `/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    );
    return { symbol: raw.symbol, price: Number(raw.price) };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400) return null;
    throw e;
  }
}

/** Validate a ticker exists on Binance spot USDT. */
export async function validateTicker(ticker: string): Promise<boolean> {
  const q = await fetchPrice(ticker);
  return q !== null;
}

/** Format a USD-ish price for display. */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/** Format a signed percent. */
export function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
