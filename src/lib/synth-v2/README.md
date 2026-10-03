# Synth V2 — Stage 1b market generator and Stage 2 regime plant

This directory contains a self-contained XAUUSD 30-minute OHLC research generator and labelled-regime plant. Calibration uses market statistics only; Stage 2 has no detector, strategy, analyzer-result, trade, R, or P&L API.

## API

- `calibrateSourceCsv(text, sourceSha256)` builds a versioned empirical profile from timestamps and OHLC market statistics.
- `generatePath(profile, { seed, weekdays, startDate, startPrice, dials })` returns `{ candles, labels, csv }`. Same profile/config/seed is byte-deterministic. Labels include active dials, extrapolation flags, gap class, and tail-pool selection.
- The Stage 1b volatility model uses slow daily plus fast per-bar log-volatility. Trend-dial endpoints are constrained by the real variance-ratio p10–p90 band; settings outside the observed/allowed range are explicitly labelled `EXTRAPOLATION`.
- `generateStage2Path(profile, { seed, set, regimeId? })` produces a DESIGN/LOCKED TEST regime chain or a single-regime NULL path. Every bar carries regime, segment, transition-blend, dial, overlay, and extrapolation labels. `decodeStage2Artifact` expands the compact hashed record into candles, labels, and engine-compatible CSV.

The frozen Stage 2 base regimes are `quiet_range`, `normal_chop`, `trend_up`, `trend_down`, `whipsaw`, `expansion_up`, and `expansion_down`; `news_storm` and `gap_shocks` are optional overlays. Exact mappings, source-statistic attainment/degradation, DESIGN-only separability, hashes, and caveats are in `STAGE2-REPORT.md`. LOCKED TEST files must not be analyzed until a detector is frozen.

## Run and validate

From the repository root, with dependencies installed:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-run.mjs
```

This verifies the frozen input hash, performs the Stage 0 clock audit, fits the single Stage 1b slow-plus-fast volatility structure to real raw-return ACF, runs the fixed realism gates/bootstrap, constrains trend endpoints, checks D1 and engine-parser round-trips, then writes Stage 1 outputs and hashes. Exit code 2 records a failed registered gate; no tolerance is changed.

Run Stage 2 only after the Stage 1b commit has been pushed and verified:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-stage2.mjs
```

The Stage 2 runner generates/hashes DESIGN seeds 1–200, LOCKED TEST seeds 1001–1200, and 100 NULL paths per regime using seeds 2001+. Only DESIGN and NULL are evaluated. LOCKED TEST is generated, deterministically reproduced, and hashed but is not used for realism, feature, AUC, or detector analysis. If Stage 1b G2 fails, every Stage 2 artifact is tagged `GENERATOR G2 FAIL: do not use features built on fewer than 6 bars.`

`REPORT.md` records the Stage 0/Stage 1b evidence and fixed-gate results. `QUESTIONS.md` records unresolved provenance and measurement conventions with the interim actions taken.
