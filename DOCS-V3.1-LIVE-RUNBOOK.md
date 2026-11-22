# V3.1 Live Runbook — Demo Burn-In & Limited Launch

**Scope:** operational checklist for the Nov 27–30 demo burn-in and Dec 1–15 limited live launch. Dates are UTC/EAT aligned by system timestamps; owners must confirm local exchange holidays and broker hours. This is not a promise of strategy performance. Start in demo, cap exposure, and require human approval for every change.

## 1. Before the Nov 27 demo burn-in

### Configuration and secrets

- Copy `.env.example` to `.env` locally, or set deployment secrets in the hosting platform. Never commit `.env`.
- Required for candle ingestion: `TWELVE_DATA_API_KEY` or `TWELVE_DATA_API_KEYS` (CSV list; fallback rotations supported). Check `/api/market-data/health`; confirm key count/fingerprints without printing secrets.
- Optional reviewer: `GEMINI_API_KEY`; default model `gemini-2.5-flash`. Gemini is a read-only reviewer. Missing key means journal still works and reviewer status is `disabled_no_key`.
- Configure `MT5_ADMIN_TOKEN` according to the existing MT5 bridge deployment procedure. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_ID` unset unless alert delivery has been separately approved.
- Confirm `logs/` is writable and ignored by Git. **The watcher JSONL implementation requires a persistent writable Node filesystem.** The current production build targets Cloudflare Workers, whose local filesystem is not durable/writable storage; do not deploy journaling there until a durable binding (e.g. approved D1/R2/KV adapter) is configured, or deploy the watcher API on the approved persistent Node host. Journal JSONL is operational data, not a backup; set a secure retention/backup policy outside the repository.

### Nov 27–30 demo burn-in

1. Pin the deployed commit, runtime version (Node >=22.6 for the test harness), symbol, timeframe (M30), broker/demo account, and operator on duty. Verify Nairobi/EAT clock and exchange/server timezone conversion.
2. Run `npm ci`, `./node_modules/.bin/tsc --noEmit`, `npm test`, `npm run test:golden`, and the freeze test. Block deployment on test failures; document any known excluded diagnostics.
3. Start the MT5 bridge in demo with minimal permitted volume. Verify a signal, order acknowledgement, fill, close, account telemetry, and daemon heartbeat. Confirm duplicate/stale signals cannot become duplicate orders.
4. Validate Twelve Data health and latest candle timestamp. Remember providers may return the forming M30 candle: live analysis excludes the final bar (`seriesEndsComplete:false`). Verify stale-feed warnings and retry/cancel behavior.
5. Open Watcher Copilot: check FRED snapshot status and observation dates; `offline` is acceptable only with an explicit warning. Confirm deterministic trade JSONL continues without Gemini. Compare journal rows against closed positions manually.
6. If Gemini is enabled, inspect several structured reviews and ensure they are journal notes only. Shadow counterfactuals are hypotheses and must never be used as automatic instructions.
7. Export the monthly dossier and verify EAT hour leakage, per-bot trades, tag counts and the explicit “baseline not supplied” caveat. Log known differences between MT5 broker accounting and price-based R.
8. Simulate missing provider data, 429 on one/all keys, app restart, FRED outage and Gemini timeout. Confirm retries are bounded, no credentials appear in logs/responses, and no component places/modifies/closes a trade because of a reviewer response.

## 2. Dec 1–15 limited live launch

### Launch gate

- Written sign-off from strategy owner, operations owner and risk owner; demo burn-in issues closed or explicitly accepted.
- Verify broker symbol suffix, contract size, minimum volume, stop distance, spread, commission, swap, trading hours, and max exposure. Set hard account and per-trade limits at the broker/EA boundary.
- Confirm current code hash, environment variables, journal path, backups, monitoring, and rollback commit. Do not treat backtest R as a broker guarantee; execution friction is a flat sensitivity assumption.

### Daily operations

- Before session: check API health, last candle age, FRED status, MT5 heartbeat/account, open positions, spread, economic calendar, and the day's risk cap.
- During session: monitor rejected orders, signal-to-fill slippage, spread changes, stale feed, drawdown, and duplicate commands. Stop new entries through the normal operator/EA control if any hard safety threshold trips; never ask Gemini to control the EA.
- After session: reconcile broker fills/closures against journal and account ledger, verify realized P/L/fees, review AI notes if enabled, and export/retain daily evidence. Investigate all unmatched tickets and missing journal events before next session.
- Weekly: review per-bot live health versus a versioned baseline, EAT hour leakage, and shadow hypotheses. A hypothesis requires a pre-registered, out-of-sample test and human approval before any rule change.

### Immediate stop / rollback conditions

Stop new risk, preserve logs, notify the risk owner, and revert to demo/manual review if: feed age exceeds the agreed limit; account/position telemetry is inconsistent; broker rejects or fills diverge materially; repeated duplicate/stale orders occur; losses breach the pre-approved daily/total cap; secrets leak; or the watcher/API behaves as if it can execute. Do not delete evidence. Capture UTC/EAT timestamps, commit hash, ticket IDs, redacted provider status and journal lines.

**End of limited launch:** on Dec 15, reconcile all broker statements, close/retain positions according to the approved plan, archive reports securely, review all incidents and decide whether to extend, reduce, or stop. No scale-up is automatic.
