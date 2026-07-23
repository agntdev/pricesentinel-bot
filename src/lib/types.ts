/** Durable domain types for the crypto alert bot. */

export interface QuietHours {
  start: string; // "HH:MM" 24h local
  end: string; // "HH:MM" 24h local
}

export interface UserProfile {
  telegramId: number;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  summaryTime: string;
  /** Cooldown between alerts for the same coin, in hours. */
  cooldownLength: number;
  enabledAlerts: boolean;
  /** Morning summary DMs enabled. */
  morningSummary: boolean;
  /** True after the user picks a timezone in onboarding. */
  onboarded: boolean;
  createdAt: number;
}

export type AlertRuleType = "threshold" | "percent";

export interface ThresholdRule {
  id: string;
  type: "threshold";
  direction: "above" | "below";
  price: number;
}

export interface PercentRule {
  id: string;
  type: "percent";
  percent: number;
  /** Lookback window in hours. */
  timeframeHours: number;
  /** Price at the start of the current window (set by monitor). */
  baselinePrice?: number;
  baselineAt?: number;
}

export type AlertRule = ThresholdRule | PercentRule;

export interface WatchlistItem {
  ticker: string; // e.g. "BTC" (base asset; pair is BTCUSDT on Binance)
  displayName: string;
  alertRules: AlertRule[];
  lastAlertTimestamp?: number;
}

export interface Watchlist {
  telegramId: number;
  items: WatchlistItem[];
}

export type DeliveryStatus = "sent" | "suppressed_quiet" | "suppressed_cooldown" | "failed";

export interface AlertEvent {
  id: string;
  telegramId: number;
  coin: string;
  oldPrice: number;
  newPrice: number;
  percentChange: number;
  timestamp: number;
  deliveryStatus: DeliveryStatus;
  ruleId?: string;
}

export interface OwnerDefaults {
  quietHoursStart: string;
  quietHoursEnd: string;
  summaryTime: string;
  cooldownLength: number;
}

export interface OwnerReport {
  totalUsers: number;
  activeWatchlists: number;
  topAlerts: { coin: string; count: number }[];
}

/** Ephemeral conversation state (session). */
export type FlowStep =
  | "idle"
  | "awaiting_timezone"
  | "awaiting_ticker"
  | "awaiting_threshold_price"
  | "awaiting_percent_value"
  | "awaiting_percent_timeframe";

export interface AlertDraft {
  ticker?: string;
  type?: AlertRuleType;
  direction?: "above" | "below";
  price?: number;
  percent?: number;
  timeframeHours?: number;
}

export const DEFAULT_OWNER_DEFAULTS: OwnerDefaults = {
  quietHoursStart: "00:00",
  quietHoursEnd: "08:00",
  summaryTime: "08:00",
  cooldownLength: 24,
};

export const COMMON_TICKERS = ["BTC", "ETH", "TON"] as const;

export const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "New York", value: "America/New_York" },
  { label: "London", value: "Europe/London" },
  { label: "Singapore", value: "Asia/Singapore" },
  { label: "Tokyo", value: "Asia/Tokyo" },
] as const;
