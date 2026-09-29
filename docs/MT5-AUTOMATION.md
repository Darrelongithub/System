# MT5 Automation — Real Trading vs Simulation

This document describes the two ways this system can drive MetaTrader 5, how
market data reaches the strategies, and the security model of the bridge.

> **Honesty policy.** Everything in the MT5 panel reflects real server state.
> There are no fake "always connected" indicators and no synthetic prices:
> when no provider key is configured, the daemon says so; when no EA has
> synced, the panel says so.

---

## The two modes

### 🟡 Simulation Mode (default)

- The full analyzer runs on real candles you generate in the app.
- Order execution is simulated in the browser (`mt5Engine` client instance).
- **No order ever reaches a broker.** Safe for learning the system.
- The master switch (`AUTO-TRADING ACTIVE/PAUSED`) still gates simulated fills.

### 🟢 Bridge Mode (real trading, recommended)

- You log in to your MT5 account **inside the MT5 application itself**.
- A small Expert Advisor (`SignalFinderBridge.mq5`) runs on your MT5 terminal
  (desktop or VPS) and polls this server's bridge endpoint:
  `POST /api/mt5/bridge`.
- The EA sends account telemetry (balance, equity, open positions) and
  receives queued trade commands produced by this system's **real** strategy
  engine — the same frozen 9 strategies the live analyzer uses.
- The EA executes those commands on your broker account (Auto Entry, SL, TP).
- The dashboard switches to showing the **server's** account and positions
  (polled every 5 seconds), not the browser-local simulation.

Bridge mode is selected per-account via the *MT5 Login & Real-Trade Bridge*
tab. Credentials are limited to login number + broker server name:
**the password is never sent to this app** — the MT5 terminal owns the login.

---

## Data path (where the candles come from)

```
Twelve Data API (https://api.twelvedata.com)
        │  apikey rotation (TWELVE_DATA_API_KEYS / _KEY / _KEY_1..20)
        ▼
fetchTwelveDataCandles()            src/lib/market-data.ts
        │  20s timeout · rate-limit detection · secret redaction
        ├──────────────────────► /api/market-data   (browser path: thin validated proxy)
        │                                │
        ▼                                ▼
buildOhlcCsv()                    src/lib/ohlc-generator.ts
  – same golden-series pipeline for BOTH paths
  – browser: fetchCandles = requestMarketData (via /api/market-data)
  – daemon:  fetchCandles = fetchTwelveDataCandles (direct, no browser)
        │
        ▼
runAnalysis(csv, ANALYZER_LIVE_OPTIONS)   src/lib/analyzer/run.ts
  – the frozen 9 production strategies, live policy (last bar untrusted)
        │
        ▼
mt5Engine.handleLiveStrategySignal(signal, symbol)
  – simulation mode: simulated fills in the browser engine
  – bridge mode: queued as commands → EA executes on the real terminal
```

### The 24/7 server daemon

`src/lib/mt5/server-daemon.ts` runs inside the server process:

- On **every new 30-minute bar** (EAT = UTC+3, no DST, so bars are exactly
  epoch-aligned at `BAR_MS = 1_800_000`), the fetch is gated to bar close +
  `FETCH_GRACE_MS = 60s` so the provider has time to finalize the candle.
- It fetches a rolling `FEED_WINDOW_DAYS = 85`-day window — padded to 88 days,
  safely under the generator's 90-day single-request cap, so the feed always
  uses the single-request path with `rateLimitRetries: 0` (fail fast, retry on
  the next bar instead of blocking in cooldown loops).
- Positions are marked at the **last real bar close** (`lastCloseFromCsv`,
  which finds the `close` column by header name and skips `===` markers).
  Synthetic prices do not exist anywhere in this path.
- Analysis re-runs only when the fetched CSV actually changed (SHA-256
  compare), so a stalled provider cannot re-fire stale signals.
- **No provider key** → logs once, reports `hasProviderKey: false`, retries in
  15 minutes. **Fetch failure** → retries in 5 minutes; positions keep the
  last real price.

---

## Bridge setup (4 steps)

1. **Log in inside the MT5 app itself** (File → Login to Trade Account). The
   web app never asks for or stores your password.
2. **Download `SignalFinderBridge.mq5`** from the *MT5 Login & Real-Trade
   Bridge* tab (or `GET /api/mt5/ea?type=bridge`) and place it in
   `File → Open Data Folder → MQL5 → Experts`, then refresh Expert Advisors.
3. **Whitelist the bridge URL** in MT5: `Tools → Options → Expert Advisors` →
   check *Allow WebRequest for listed URL* and add the URL shown in the panel
   (e.g. `https://<your-server>/api/mt5/bridge`).
4. **Drag the EA onto your XAUUSD M30 chart** and enable Algo Trading. The
   panel switches to 🟢 Bridge Mode and shows your live account state.

### Token rotation

Every request to `/api/mt5/bridge` must carry `Authorization: Bearer <token>`.
The accepted token is the server engine's credential token (falling back to
`sfp-default-token`), and it **rotates on server restart**. Comparison is
SHA-256 + `timingSafeEqual`. If the EA's journal prints an HTTP 401 note,
**re-download the EA and attach it again** — a fresh download always embeds
the current token.

---

## The standalone 24/7 EA (offline alternative)

`SignalFinderPro_247_Autotrader.mq5` is a **native MQL5 re-implementation** of
the 9 strategies (plus the Red Folder news guard) that runs entirely inside
MT5 with zero server dependency. Honest note: it is *not* the TypeScript
golden engine, so small port drift is possible. For exact parity with the web
signals, use the bridge instead.

---

## Security notes

- **Token auth on the only order-executing endpoint.** `/api/mt5/bridge` is
  the sole surface whose responses trigger real broker orders; both GET and
  POST require a valid Bearer token or return 401.
- **Passwords never stored.** The bridge only knows your login number and
  broker server; the actual login session lives inside MT5.
- **Provider keys are server-only.** Twelve Data keys are read from the server
  environment (`.env` or platform env) at request time and never enter the
  client bundle. Transport error messages are redacted of secrets before they
  cross back to any client.
- **Fail-closed execution.** Auto-trading is OFF by default; the daemon's
  constructor auto-start is safe because the engine master switch gates every
  dispatch. No data key → no fetch (never synthetic data). Analysis rejects
  malformed series instead of guessing.
