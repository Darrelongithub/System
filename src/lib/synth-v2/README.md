# Synth V2 — Stage 1b market generator

This directory is a self-contained XAUUSD 30-minute OHLC research generator. Stage 1b calibrates realism using market statistics only; it exposes no detector, strategy, analyzer-result, R, or P&L API.

## API

- `calibrateSourceCsv(text, sourceSha256)` builds a versioned empirical profile from timestamp and OHLC market statistics.
- `generatePath(profile, { seed, weekdays, startDate, startPrice, dials })` returns `{ candles, labels, csv }`. The same profile/config/seed is deterministic. Labels carry the active dial values, per-bar extrapolation flags, session/weekend gap classification, and tail-pool selection.
- The fitted profile uses a slow daily plus fast per-bar log-volatility component. Trendiness endpoints are constrained to the real VR p10–p90 bands; settings outside the permitted trend interval receive an explicit `EXTRAPOLATION` flag.
- `src/lib/synth-v2/REPORT.md` records the Stage 0 clock audit and Stage 1b fixed-gate/D1 results. Stage 2 questions and interim decisions are recorded in `QUESTIONS.md` before that stage begins.

## Recalibrate and validate

From the repository root, with dependencies installed:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-run.mjs
```

The script verifies the frozen source hash, fits the slow-plus-fast volatility model to real raw-return ACF, runs the fixed 20-seed × 120-weekday realism comparison and bootstrap, constrains the trend endpoints, checks D1, validates engine-parser round-trips, and writes seed-1 artifacts plus hashes. Exit code 2 records a failed fixed gate, D1 check, or trend VR bound; it never changes a tolerance.

Source timestamps are interpreted as fixed EAT wall-clock based on the Stage 0 weekend-reopen and daylight-shift audit in `REPORT.md`; this conflicts with a UTC section marker, so the provenance caveat and options remain in `QUESTIONS.md`.
