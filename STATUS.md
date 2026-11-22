# STATUS — DST-CORRECT, LONG/SHORT-SPLIT, MATCHED-RANDOM-ENTRY TEST
Branch: `arena/988f2654-system` (frozen rulesets only; no rule changes).
Started 2026-11-21/22. No trade has been run yet — Stage 4 blocked until Stages 1–3 are frozen.

## Stage 1 — Freeze & provenance (FROZEN)
- [x] Core-8 = 9d7912c (tree 4c56402f, PR #22, 2026-11-22T00:39:46Z) — 8 ids
- [x] v3.1 nine = 2f87616 (tree 3643251f5d42b5a8668e57131ac3d10bdc5e87aa, PR #23, 2026-11-22T11:54:51Z) — engine 30-bot; 9-bot book = working-tree pruning (Tier A 9-bot list) — CONTAMINATED (pruning used 2004–2019)
- [x] Rule-file SHA-256 computed, pinned in `artifacts/rc-test/stage1-freeze.md` (20 files @ 9d7912c; 21 files @ 2f87616 incl. v3-expansion-bots.ts)
- [x] First 2004–2019 run pinned: **2026-11-22T12:12:30.360Z** (exp1/unseen-trial-0.20.json)
- [x] Provenance check: no Core-8/v3.1-engine rule-file COMMITS after first run → Core-8 provenance clean; v3.1-nine pruning (uncommitted, after 12:12:30) → CONTAMINATED
- [x] Audit-doc hash discrepancy flagged in QUESTIONS.md (Q1) — frozen hashes authoritative

## Stage 2 — DST-correct timestamps (FROZEN, pre-trade)
- [x] Two-epoch rule frozen (verified by lab against independent Dukascopy M1; 44 months PASS)
- [x] Converted unseen CSV: `artifacts/rc-test/unseen-2004-2019-eat-twoepoch.csv` — 178,435 bars (first/last `2004-06-11 08:00:00` → `2019-12-31 21:30:00`)
- [x] sha256 `75608eb2025cc635d40e7041c4d73f54ce585b575e18f3ae17ee9e450a024312`
- [x] 0 non-monotone / 0 duplicates / 0 bad timestamps (source 178,435 → output 178,435)
- [x] Weekly shape + seam verified; 2004–2009 (epoch A pre-2010-01) explicitly flagged EXTRAPOLATED
- [x] Freeze doc: `artifacts/rc-test/stage2-dst-freeze.md` (pre-trade freeze; changes after this = rule change, logged only)

## Stage 3 — Spreads & cost model (CAPTURED, NOT APPLIED)
- [x] Lab spread-table.json + cost-model.json captured (44 months, 2010→2026, NOT continuous)
- [x] Baseline cost R = 0.119 (stress 0.284); matchedMinutes 1,318,470
- [x] Cells not measured → conservative session-dependent model REQUIRED (never flat 1.85 bps)
- [x] Cost rule frozen: `costR = (spreadOverAtr + 2×0.02×slippageMultiplier)/1.5` (baseline = median spread + 1x slippage; stress = p95 + 2x slippage)
- [ ] Unmeasured-year per-year cost overlay NOT yet decided — logged in QUESTIONS.md (see below)

## Stage 4 — verdict (DONE — one run, frozen)
- [x] CORE-8 (PRIMARY, 2004–2019 UNSEEN): 0/8 PASS — 2,685 trades, gross +132.87R, net (measured cost) −265.37R, net2x −663.60R. Gate detail in artifacts/rc-test/stage4-verdict-report.md
- [x] v3.1 NINE (CONTAMINATED, 2004–2019 UNSEEN): 0/9 PASS — 1,869 trades, gross +139.62R, net (measured cost) −81.18R, net2x −301.98R. CONTAMINATED — pruning used 2004–2019 (Stage 1).
- [x] CORE-8 IN-SAMPLE 2020–2026 (separate report, labeled IN-SAMPLE): 2/8 PASS — 1,121 trades, gross +334.72R, net +253.01R, net2x +171.31R. Does NOT generalize to the unseen window.
- by-side split + per-bot × per-side stats in artifacts/rc-test/stage4-verdict-report.md (LONG/SHORT-SPLIT)
- random baseline: side-matched (921-1681 per side per segment ≈ 11,000+ pooled draws), fixed seed 20261026, one-slot blocking per (bot, side) segment, 1.5 ATR stop / 2R target / 96-bar cap, same measured cost — counts ≥ 4,000/side/segment in every segment
- RANDOM baseline reported in full in verdict-*.json (drawN counts per bot+side)
- PASS gates printed per bot in both reports.

## Current state
- ALL Stages 1–4 complete — no rerun after results.
- QUESTIONS.md has 7 open questions (Q1–Q7, none blocking).
- v3.1 nine continues to require human re-confirmation of the contamination label if a fresh clean book is desired (see Q3).

