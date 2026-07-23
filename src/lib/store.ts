/**
 * Durable key-value store for domain data.
 *
 * Backed by Redis when REDIS_URL is set (same auto-select pattern as sessions),
 * otherwise an in-memory Map for local/dev/tests. Domain code MUST use explicit
 * index keys — never scan the keyspace.
 */

export interface DurableStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

class MemoryStore implements DurableStore {
  private data = new Map<string, string>();

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.data.get(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

class RedisStore implements DurableStore {
  constructor(
    private readonly client: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(key: string): Promise<unknown>;
    },
    private readonly prefix = "crypto:",
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.client.set(this.k(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }
}

const memory = new MemoryStore();
let store: DurableStore = memory;
let redisInit: Promise<void> | null = null;

function ensureRedis(): void {
  if (redisInit) return;
  const url =
    typeof process !== "undefined" && process.env?.REDIS_URL
      ? process.env.REDIS_URL
      : undefined;
  if (!url) return;
  redisInit = (async () => {
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ioredis: any = require("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
      store = new RedisStore(client);
    } catch {
      // Keep memory if Redis cannot be loaded (Workers, missing dep).
      store = memory;
    }
  })();
}

/** Resolve the active durable store (lazy Redis when REDIS_URL is set). */
export async function getStore(): Promise<DurableStore> {
  ensureRedis();
  if (redisInit) await redisInit;
  return store;
}

/** Inject a store (tests). */
export function setStore(s: DurableStore): void {
  store = s;
  redisInit = null;
}

/** Reset to a fresh in-memory store (tests / harness isolation). */
export function resetDurableStore(): void {
  memory.clear();
  store = memory;
  redisInit = null;
}

// ── Key helpers (explicit indices — never scan) ──────────────────────────

export const keys = {
  user: (id: number) => `user:${id}`,
  watchlist: (id: number) => `watchlist:${id}`,
  alerts: (id: number) => `alerts:${id}`,
  userIndex: () => `index:users`,
  watchlistIndex: () => `index:watchlist_users`,
  alertCounts: () => `index:alert_counts`,
  ownerDefaults: () => `owner:defaults`,
  lastSummaryDay: (id: number) => `summary_day:${id}`,
};
