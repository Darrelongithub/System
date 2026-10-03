# Synth V2 Stage 1

This directory is a self-contained XAUUSD 30-minute OHLC research generator. It exposes no strategy, detector, planted-regime, analyzer-result, R, or P&L API.

## API

- `calibrateSourceCsv(text, sourceSha256)` builds a versioned empirical profile from timestamp and OHLC market statistics.
- `generatePath(profile, { seed, weekdays, startDate, startPrice, dials })` returns `{ candles, labels, csv }`. The same profile/config/seed is deterministic. Labels carry the active dial values, per-bar extrapolation flags, session/weekend gap classification, and tail-pool selection.
- `src/lib/synth-v2/REPORT.md` records Stage 1 calibration, fixed realism-gate results, D1 checks, assumptions, and any remaining failures.

## Recalibrate and validate

From the repository root, with dependencies installed:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-run.mjs
```

The script verifies the frozen source hash, writes `profile.json`, runs the 20-seed × 120-weekday realism comparison and real-data moving-window bootstrap, checks D1, validates engine-parser CSV round-trips, and writes a seed-1 example plus hashes. Exit code 2 means one or more fixed realism gates, D1 movement checks, or the reported trend-endpoint variance-ratio bound remain failed; it does not relax any tolerance.

Source timestamps are interpreted as fixed EAT wall-clock based on the Stage 0 weekend-reopen and daylight-shift audit in `REPORT.md`; this conflicts with a UTC section marker, so provenance caveat and options remain in `QUESTIONS.md`.
