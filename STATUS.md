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

## Stage 4 — verdict run (BLOCKED until Stage 3 overlay + Stage 2 freeze land)
- [ ] No trade run yet (hard gate: Stage 2 must be frozen before any run)
- [ ] Frozen CSVs + engine worktrees must exist; use worktrees at /tmp/frozen-core8, /tmp/frozen-v31 (recreate if /tmp wiped — `git worktree add`)
- [ ] Random baseline: side-matched, ≥4,000 draws per side per segment, fixed seed (20261026), one-slot blocking
- [ ] Stack=3, no self-hedging, side-split report
- [ ] PASS gates per bot (≥100 trades; net mean > +0.10R with t>2; excess over matched random >0 with t>2; concentration <50%; LOYO ≥75% positive; positive after 2x cost; single failed bar = FAIL)
- [ ] 2-year-window inflation: none (this is a full-window verdict)

## Current state
- Stage 1+2 frozen and committed. QUESTIONS.md created (5 open questions).
- Next: Stage 3 — conservative cost overlay for unmeasured years (2004–2009, 2012–2017, 2019) + exact same-side computation; then Stage 4 verdict.
