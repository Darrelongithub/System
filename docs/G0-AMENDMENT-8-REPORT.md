# G0 AMENDMENT 8 — REPORT

**Date:** 2026-11-05
**Commit that applied it:** `9aae04e67b1102d1802c4dd0b92f47af19d81fe6`
**Blueprint version at the time:** v1.8, SHA-256 `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`
**Strategy results in existence at any point during Amendment 8:** **none**

> This report is written after the fact as part of G0 Amendment 9 (record
> repair). It describes what Amendment 8 did. It changes nothing. Every claim
> below was checked against the committed tree, not against a chat log.

---

## 1. What Amendment 8 authorised

Darrel approved, before any strategy result existed:

1. **All 22 extant claim cards, unchanged.** No card was removed, added, edited,
   re-parameterised, re-ordered or re-assigned a verdict state. Two cards had
   already been removed at Amendment 6 (dual-thrust, stochastic-14-fade),
   leaving 22 across 8 families.
2. **Two proposed methods** for the DEV verification, which had been paused
   because the pre-Amendment-8 harness had two defects:
   - the random-entry control could resolve trades into a **sealed** year, and
   - there was **no claim-level threshold sweep**.

## 2. What was frozen

| Item | Frozen value |
| --- | --- |
| Card status | `FROZEN`, `approvedBy = "Darrel"`, `approvedAt = "2026-11-05"` |
| Card count | 22 cards, 8 families, priorities 1–22 distinct |
| Map | ER(20) cutoff 0.35, ATR14 percentile (500-bar) cutoff 70, ±10% abstain band, 3-bar hysteresis, 1,000-bar warm-up |
| Verdict states | EFFICIENT = EXPANSION + GRIND; CHOPPY = WHIPSAW + QUIET |
| Exit harness | 1.5 × ATR14 stop, 2R target, 96-bar time exit, no trailing, gap-through fills at the open |
| Costs | `costR = (spreadOverAtr + 2 × 0.02) / 1.5`, baseline ≈ 0.119R; stress variant diagnostic only |
| CONFIRMED rule | n ≥ 100; net mean > +0.10R with day-clustered t > 2; excess over matched random > 0 with its t > 2; no year > 50% of cell R; ≥ 75% of leave-one-year-out windows positive; a missing baseline is INCONCLUSIVE, never zero |
| Roles | DEV 2004–07, 2009–11, 2013–15, 2017–18; HOLDOUT (sealed) 2008, 2012, 2016, 2019; VAL 2020–24; STRESS 2025–26 |

**No numeric threshold changed.** No Map, cost, exit, stop, target, floor or
t-statistic value moved at Amendment 8. The two additions it authorised to
`scripts/map-compass/frozen.mjs` are recorded below; they were actually written
into the file at **Amendment 9**, because v1.8 recorded the methods in prose but
never added the constants.

## 3. Method 1 — strict DEV-only segments

- A **non-DEV gap is a hard boundary.** The sealed years 2008, 2012, 2016 and
  2019 sit *inside* the DEV date span, so they are exactly the holes that split
  the data into the four segments.
- Per segment, the **unchanged Map rules are recomputed from that segment's bars
  only**; signal warm-up comes from that segment only.
- **Entries** are eligible only at local segment index ≥ 1,000 **and** with ≥ 96
  bars remaining in the same segment. Anything else is discarded.
- A trade's **year is its entry year**.
- Each card gets **one independent slot**, **unconditional** (every eligible
  signal may enter regardless of state, subject only to its own slot), and
  outcomes are **binned by the verdict state at entry**.
- The **random-entry control is rebuilt with the same boundaries**, the same
  eligibility rule, the same frozen costs and the same frozen exit harness, so
  it cannot resolve into a sealed year.
- No trade, warm-up bar, Map feature or baseline entry may read across a
  boundary.

**Why it matters:** the old harness leaked across the holes, which meant the
"control" could be measured on years the strategy was never allowed to see. That
is the failure mode the whole project exists to prevent.

## 4. Method 2 — matched 5×5 sensitivity sweep

- Grid: ER cutoff {0.25, 0.30, 0.35, 0.40, 0.45} × ATR percentile cutoff
  {60, 65, 70, 75, 80} = **25 cells**.
- For every cell, the same card trades and the same **deterministic-seed** random
  entries are re-binned under that cell's cutoffs and the **exact unchanged
  CONFIRMED rule** is applied **with that cell's matched baseline**.
- **A missing baseline in a cell means not CONFIRMED in that cell.** It never
  falls back to zero.
- The **authoritative verdict stays at the frozen centre (0.35, 70).** The sweep
  never nullifies, never rescues and never selects a cutoff.
- For claims CONFIRMED at the centre, the **grade** is the share of the 25 cells
  that are also CONFIRMED: ROBUST ≥ 80%, FRAGILE ≥ 50%, otherwise
  DEFINITION_SENSITIVE. Other claims are shown for information only.
- Verdict cells use **only the efficiency axis**. The volatility cutoff acts only
  through the abstain band and the 3-bar confirmation.

## 5. What Amendment 8 did NOT do

- It did **not** run any strategy verification.
- It did **not** read VAL, HOLDOUT or STRESS outcome data.
- It did **not** change any threshold, card, cost, exit or Map rule.
- It did **not** produce a `claim-verification.json`, `claimed-trades.jsonl` or
  ledger record. None exists.

## 6. Defects found afterwards and repaired at Amendment 9

| Defect | Repair |
| --- | --- |
| No A8 report existed | This document |
| `DEV_SEGMENTS`, segment warm-up/tail and `SWEEP_GRID` were described but absent from `frozen.mjs` | Added at A9; 52 lines added, 0 removed, no existing value touched |
| The five pre-A8 artifacts were not marked superseded | `supersededByA8` blocks added to each |
| `docs/STATUS.md` did not exist | Created at A9 |
| Ten tests still asserted the cards were `DRAFT`; two pinned "current == v1.7/v1.8" | Brought up to the frozen state, with every "no result artifact" guard retained |
| `matchesV15`/`matchesV16` had been dropped from the hash register | Restored |

## 7. Honest limits carried forward

- The cited empirical studies mostly used **daily** bars. This project tests
  **M30 gold**. Every verdict must carry that caveat.
- Evidence for most of these rules is **negative or mixed**. A REFUTED verdict
  means "this rule did not clear a cost-inclusive bar on this data", not "the
  textbook is wrong".
- Reversion-family verdicts are valid **only under the standard exit**
  (1.5 ATR stop, 2R target).
- Zero to three CONFIRMED families is a legitimate outcome. If fewer than three
  families are CONFIRMED on DEV, the blueprint's kill criterion applies.

**Thresholds changed?** No. **Cards changed?** No. **Result existed at freeze?**
No.
