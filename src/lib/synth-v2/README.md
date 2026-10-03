# Synth V2 — Stage 1b market generator and Stage 2 regime plant

This directory contains a self-contained XAUUSD 30-minute OHLC research generator and labelled-regime plant. Calibration uses market statistics only; Stage 2 has no detector, strategy, analyzer-result, trade, R, or P&L API.

## API

- `calibrateSourceCsv(text, sourceSha256)` builds a versioned empirical profile from timestamps and OHLC market statistics.
- `generatePath(profile, { seed, weekdays, startDate, startPrice, dials })` returns `{ candles, labels, csv }`. Same profile/config/seed is byte-deterministic. Labels include active dials, extrapolation flags, gap class, and tail-pool selection.
- The Stage 1b volatility model uses slow daily plus fast per-bar log-volatility. Trend-dial endpoints are constrained by the real variance-ratio p10–p90 band; settings outside the observed/allowed range are explicitly labelled `EXTRAPOLATION`.
- `generateStage2Path(profile, { seed, set, regimeId? })` produces a DESIGN/LOCKED TEST regime chain or a single-regime NULL path. Every bar carries regime, segment, transition-blend, dial, overlay, and extrapolation labels. `decodeStage2Artifact` expands the compact hashed record into candles, labels, and engine-compatible CSV.

## Stage 2b supersession notice

The previous Stage 2 implementation, reports, checksum files, sample CSV, and `stage2-data/` artifacts remain preserved but are **SUPERSEDED** by the re-specified Stage 2b checks. The old Stage 2 LOCKED TEST cohort is **ABANDONED** and must remain unopened. Its files have not been deleted. Stage 2b uses `SPEC-2b.md`, `STAGE2B-CONFIG.json`, `STAGE2B-SEEDS.json`, and `STAGE2B-REAL-BANDS.json`; the report and hash inventory are `STAGE2B-REPORT.md` and `STAGE2B-SHA256SUMS.txt`. New path data is rebuilt by `scripts/synth-v2-stage2b.mjs` into the ignored working-directory `stage2b-data/` and is not committed.

Stage 2b retains the seven regimes `quiet_range`, `normal_chop`, `trend_up`, `trend_down`, `whipsaw`, `expansion_up`, and `expansion_down`, plus short `news_storm` and `gap_shocks` overlays. Its fixed W=20 calibration, C1–C3, real persistence ceiling, design-only pairwise AUC, new seed ranges, and no-lookahead rules are frozen in `SPEC-2b.md`. LOCKED TEST seeds 6001–6200 are generated and hashed only; they must never be decompressed or analyzed.

### Current preregistered attempt status (2026-10-03)

The Stage 2b cohort is **INCOMPLETE**, not a completed study. DESIGN 5001–5200 and NULL 7001–7100 for all seven regimes were generated and analyzed; LOCKED TEST 6001–6141 were generated and hash-checked only. The frozen runner then failed while attempting LOCKED TEST seed 6142 with an invalid-OHLC exception from the unchanged Stage 1b generator; seeds 6142–6200 were not produced. No LOCKED TEST artifact was decompressed or analyzed. No seed, setting, Stage 1b behavior, or generated OHLC was repaired or replaced. See `STAGE2B-REPORT.md` and the failure decision in `QUESTIONS.md`; do not interpret the partial LOCKED TEST set as a completed holdout.

On 2026-10-04, the fixed cohorts were replayed under the same verified hashes and runtime: all 200 DESIGN, 141 previously successful LOCKED TEST paths (hash-only), and all 700 NULL paths matched the committed partial inventory. The identical seed-6142 invalid-OHLC failure recurred; the cohort remains incomplete.

## Run and validate

From the repository root, with dependencies installed:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-run.mjs
```

This verifies the frozen input hash, performs the Stage 0 clock audit, fits the single Stage 1b slow-plus-fast volatility structure to real raw-return ACF, runs the fixed realism gates/bootstrap, constrains trend endpoints, checks D1 and engine-parser round-trips, then writes Stage 1 outputs and hashes. Exit code 2 records a failed registered gate; no tolerance is changed.

Do **not** run the old `scripts/synth-v2-stage2.mjs`; its outputs and checks are superseded. The Stage 2b sequence derives real W=20 bands and records the config/code/input hashes before any cohort paths are generated, then generates all cohorts:

```sh
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-stage2b-calibrate.mjs
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-v2-stage2b.mjs
```

To rebuild one frozen path and print its canonical/compressed hashes, pass `--set=DESIGN|LOCKED_TEST|NULL` and `--seed=...`; NULL also requires `--regime=...`. An optional `--out=...` must remain under the ignored `src/lib/synth-v2/stage2b-data/` directory. LOCKED TEST seeds 6001–6200 are generated and hashed only; neither the runner nor rebuild mode decompresses or analyzes them.

`STAGE2B-REPORT.md` records the old Stage 2 report-only audit and new Stage 2b outcomes. `STAGE2B-SHA256SUMS.txt` carries per-seed canonical/compressed hashes and committed-artifact hashes; the compressed path files themselves are ignored and not committed. `QUESTIONS.md` preserves resolved owner decisions, outstanding interpretations, and assumptions with interim actions.
