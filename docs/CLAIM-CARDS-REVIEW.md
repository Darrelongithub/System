# Claim Cards — REVIEW REQUIRED (decision #13)

**Status: DRAFT. No claim has been tested on real data.**
**Updated 2026-10-26 with the G0 review amendments — see "What changed" below.**

> **SUPERSEDED IN PART BY G0 AMENDMENTS 2 AND 3 (2026-10-27).** The per-card
> four-state tables and evidence tiers below are a v1.1-era view. The CURRENT
> review dump is `docs/CLAIM-CARDS-FULL-TEXT.md` (all 24 cards in full, with
> **verdict states EFFICIENT/CHOPPY**, opened empirical-study URLs, card
> relations and the standard-exit caveat). Verdicts are now decided on TWO
> verdict states; four Map states are diagnostics. The subjective 1–4 tiers
> were replaced by `docs/EMPIRICAL-EVIDENCE.md`. `TEST_ORDER` is unchanged.
> See `BLUEPRINT.md` §7.11 and `docs/BLUEPRINT-AMENDMENTS.md` A4. This file is
> kept for the historical review checklist only; where it disagrees with
> `BLUEPRINT.md`, the blueprint wins.

Source of truth: `scripts/map-compass/claim-cards.draft.mjs`.
`verify-claims.mjs` refuses to run real verification until this is frozen.

## What changed in the G0 review (all decisions made BEFORE results)

1. **Strength alone ships.** The old "both strength and weakness must be
   CONFIRMED" rule was a redundant gate. Everything not CONFIRMED is blocked by
   default, so the weakness requirement only multiplied the pass probability.
2. **Sweep flips grade, not nullify.** A claim CONFIRMED at the frozen cutoffs
   keeps that verdict even if it flips elsewhere in the sweep grid. The sweep
   produces ROBUST / FRAGILE / DEFINITION_SENSITIVE and a CONDITIONAL tag. This
   was decided NOW so it cannot be changed after seeing outcomes.
3. **A matched random-entry control replaces the zero null.** 4,000 random
   entries per state×side, same stop/target/costs, long and short separately.
   Measured nulls range −0.043R to −0.197R with a long/short gap up to 0.122R —
   larger than the 0.10R floor. Testing against zero would confirm bull-run
   drift, not skill.
4. **Evidence tiers + fixed-sequence order.** Prior false fraction raised from
   0.60 to **0.80**. Tier 1 (momentum/vol phenomena) is tested first; **tier 4
   candlestick patterns are tested LAST**.
5. **Holdout feature bleed measured.** 1.14% (500-bar) / 2.27% (1000-bar) of
   DEV bars have lookbacks touching holdout prices. Declared, with an M10
   sensitivity requirement.
6. **VAL contamination declared.** 2020–2024 was studied in earlier work; the
   sealed interleaved years carry the final confirmatory weight.

## What these are

24 known strategies in 8 families. Each card states a **textbook claim**
about where the strategy should win (strength) and where it should lose
(weakness), written from published rationale **before looking at any result
on our data**. The whole point is that most of these are probably wrong.

States are the Map's 2×2 grid:

|                          | ATR pctile ≥ 70 (expanded) | ATR pctile < 70 (normal) |
| ------------------------ | -------------------------- | ------------------------ |
| **ER ≥ 0.35 (trending)** | EXPANSION                  | GRIND                    |
| **ER < 0.35 (choppy)**   | WHIPSAW                    | QUIET                    |

A claim is CONFIRMED only if it clears: `t > 2`, mean `> +0.10R` net,
concentration veto, LOYO consistency, ≥100 trades, and definition-sensitivity
stability. Both halves (strength AND weakness) must be CONFIRMED for the
strategy to ship.

## The 24 cards

| Test # | ID                   | Tier | Family               | Strength  | Weakness  | Session |
| ------ | -------------------- | ---- | -------------------- | --------- | --------- | ------- |
| 1      | donchian-20          | 1    | channel-breakout     | EXPANSION | QUIET     | any     |
| 2      | donchian-55          | 1    | channel-breakout     | EXPANSION | QUIET     | any     |
| 3      | dual-thrust          | 1    | channel-breakout     | EXPANSION | QUIET     | any     |
| 4      | sma-20-50            | 1    | ma-cross             | GRIND     | WHIPSAW   | any     |
| 5      | macd-cross           | 1    | ma-cross             | GRIND     | WHIPSAW   | any     |
| 6      | ichimoku-tk          | 1    | ma-cross             | GRIND     | WHIPSAW   | any     |
| 7      | atr-squeeze-break    | 1    | vol-compression      | EXPANSION | WHIPSAW   | any     |
| 8      | nr7-break            | 1    | vol-compression      | EXPANSION | WHIPSAW   | any     |
| 9      | inside-bar-break     | 1    | vol-compression      | EXPANSION | QUIET     | any     |
| 10     | asian-range-break    | 2    | opening-range        | EXPANSION | QUIET     | london  |
| 11     | london-orb-30        | 2    | opening-range        | EXPANSION | QUIET     | london  |
| 12     | pdh-pdl-break        | 2    | opening-range        | EXPANSION | QUIET     | any     |
| 13     | bollinger-20-2       | 2    | band-reversion       | QUIET     | EXPANSION | any     |
| 14     | keltner-20-atr       | 2    | band-reversion       | QUIET     | EXPANSION | any     |
| 15     | bb-squeeze-fade      | 2    | band-reversion       | QUIET     | WHIPSAW   | any     |
| 16     | pdh-retest           | 3    | level-retest         | GRIND     | WHIPSAW   | any     |
| 17     | pdl-retest           | 3    | level-retest         | GRIND     | WHIPSAW   | any     |
| 18     | classic-pivot        | 3    | level-retest         | GRIND     | WHIPSAW   | any     |
| 19     | rsi-14-30-70         | 3    | osc-fade             | QUIET     | EXPANSION | any     |
| 20     | williams-r-fade      | 3    | osc-fade             | QUIET     | EXPANSION | any     |
| 21     | stochastic-14-fade   | 3    | osc-fade             | QUIET     | EXPANSION | any     |
| 22     | engulfing            | 4    | candlestick-reversal | QUIET     | EXPANSION | any     |
| 23     | morning-evening-star | 4    | candlestick-reversal | QUIET     | EXPANSION | any     |
| 24     | three-soldiers-crows | 4    | candlestick-reversal | QUIET     | WHIPSAW   | any     |

Full rationales and sources are in the source file. **Test # is the
pre-registered fixed-sequence order** (tier ascending, then frozen priority);
`priority` remains 1–24 for the one-slot tie-break (decision #10). Neither is
performance-ranked — no claim has been tested.

## What I need from you

Review and answer:

1. **Are the strength/weakness assignments the claims you want to test?** These
   are my best reading of the textbook rationale. If you believe a family works
   in a different state, change it NOW — after results exist, changing a claim
   is exactly the laundering this project forbids.
2. **Are these the right 24 strategies?** Swap any variant for a different
   known strategy before the freeze. Do not add strategies later.
3. **Session restrictions** — only cards 7 and 8 are London-only. Should any
   others be session-gated?
4. **Confirm the evidence tiers and test order.** Candlesticks are last by
   design. If you think another family has weaker evidence, change it NOW.
5. **Confirm the freeze.** Once approved, set in `claim-cards.draft.mjs`:
   `status: "FROZEN"`, `approvedBy: "<you>"`, `approvedAt: "<date>"`.
   That is the G0 gate that permits `verify-claims.mjs` to run for real.

## Before you approve — read the power warning

`artifacts/map-compass/power-projection.json` says EXPANSION and GRIND claims
are **statistically underpowered** at realistic signal density (power 0.27 and
0.36 vs the 0.80 we'd want). Baseline cost is 0.119R, so a claim needs
**+0.219R gross** to clear the +0.10R net floor. 23.27% of DEV bars are flat.

Practical consequence: many EXPANSION/GRIND claims will land INCONCLUSIVE, and
the Compass may end up with fewer than 3 surviving families — which is a kill
criterion. Options (all must be chosen **before** M6, not after seeing results):

- (a) Accept fewer survivors as an honest result.
- (b) Start a NEW cycle with a different DEV/HOLDOUT allocation to gain sample.
- (c) Pre-register a change to pool more variants per family.

**Not an option:** lowering the practical floor, softening the t-stat, or
re-fitting the cost model. That is the failure mode this whole project exists
to prevent.

**Readability fix (already implemented):** `readability.mjs` classifies the
whole battery as NEGATIVE_RESULT / UNDERPOWERED / MIXED / POSITIVE. Every claim
reports its excess estimate + 95% CI + long/short split regardless of verdict.
Current classification is **UNDERPOWERED** (avg power 0.538). If M6 returns
zero CONFIRMED claims, the correct readout is "too little data", not "the
textbook is false" — escalate to the power decision above instead of lowering
criteria.
