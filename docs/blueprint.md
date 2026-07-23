# Crypto Alert Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that monitors Binance spot crypto prices and sends alerts when watched coins hit user-defined thresholds or move by a percentage. Users manage private watchlists and settings via inline buttons, while the owner receives aggregate analytics reports.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto watchers
- Telegram users
- price alert subscribers

## Success criteria

- Users receive accurate price alerts when conditions are met
- Owner receives daily aggregate analytics reports
- System maintains 99% uptime for price monitoring

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Initialize bot and set up user profile with timezone selection
- **/price** (command, actor: user, command: /price) — Check current price of a specific coin or the user's entire watchlist
- **Manage Watchlist** (button, actor: user, callback: watchlist:manage) — Open watchlist management interface with common coin buttons and ticker input
- **Set Alert** (button, actor: user, callback: alert:create) — Start guided alert creation flow for selected coin
- **View Summary** (button, actor: user, callback: summary:view) — Show morning summary of top movers and recent alerts
- **Admin Dashboard** (button, actor: owner, callback: admin:view) — Show owner analytics dashboard with user stats and alert frequencies

## Flows

### onboarding_flow
_Trigger:_ /start

1. Display welcome message
2. Request timezone selection
3. Set default quiet hours (00:00-08:00)
4. Set default 24h cooldown

_Data touched:_ user_profile

### watchlist_management
_Trigger:_ watchlist:manage

1. Display common coin buttons (BTC, ETH, TON)
2. Show 'Add other ticker' option
3. Validate and add new ticker on first check
4. Allow removal via buttons

_Data touched:_ watchlist_item

### alert_creation
_Trigger:_ alert:create

1. Select coin from watchlist
2. Choose alert type (threshold or percentage)
3. Set price/percentage values and timeframe
4. Confirm and save alert rule

_Data touched:_ watchlist_item

### price_check
_Trigger:_ /price

1. Parse ticker parameter
2. Fetch current price from Binance
3. Display price and 24h change
4. Show top movers if checking full list

_Data touched:_ watchlist_item, alert_event

### alert_delivery
_Trigger:_ price_threshold_reached

1. Check quiet hours
2. Check cooldown period
3. Send alert message with price details
4. Update last-alert timestamp

_Data touched:_ alert_event, watchlist_item

### morning_summary
_Trigger:_ scheduled_morning_time

1. Fetch user's watchlist
2. Calculate top movers
3. Display summary of price changes
4. Show notable alerts from last 24h

_Data touched:_ alert_event, watchlist_item

### admin_reporting
_Trigger:_ admin:view

1. Verify owner identity
2. Display total users count
3. Show active watchlists count
4. List top-fired alerts by ticker

_Data touched:_ user_profile, alert_event

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User-specific settings and preferences
  - fields: telegram_id, timezone, quiet_hours_start, quiet_hours_end, summary_time, cooldown_length, enabled_alerts
- **watchlist_item** _(retention: persistent)_ — Monitored cryptocurrency ticker with alert rules
  - fields: ticker, display_name, alert_rules, last_alert_timestamp
- **alert_event** _(retention: persistent)_ — Record of triggered alerts for reporting and cooldown tracking
  - fields: coin, old_price, new_price, percent_change, timestamp, delivery_status
- **owner_report** _(retention: persistent)_ — Aggregated analytics for the bot owner
  - fields: total_users, active_watchlists, top_alerts

## Integrations

- **Telegram** (required) — Bot API messaging and notifications
- **Binance API** (required) — Fetch spot ticker prices
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View aggregate analytics dashboard
- Configure default settings for new users
- Access top-fired alerts statistics

## Notifications

- Price alert notifications to users
- Morning summary notifications (optional)
- Owner analytics reports (on-demand)

## Permissions & privacy

- User data is private and not shared
- Owner can only view aggregate analytics
- Watchlists and alert rules are user-specific

## Edge cases

- Binance API failure - retry silently without sending alerts
- Invalid ticker entered - validate on first check and inform user
- Multiple alert rules for same coin - process all independently
- Timezone conversion errors - use default UTC if parsing fails

## Required tests

- Verify alert delivery outside quiet hours
- Test morning summary content accuracy
- Validate watchlist management flows
- Confirm owner dashboard shows correct aggregate data

## Assumptions

- Binance API will provide accurate and timely price data
- Users will have stable Telegram connectivity for notifications
- Owner will provide their @username/ID for admin access
