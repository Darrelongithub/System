# G1.5 Engine-Bias Register — chassis sign-off

**Status: D1–D4 resolved in the NEW pipeline (M3), not by mutating the frozen
old rule sources. See "Resolution strategy" below.**

The old engine's causality tests, gap-fill fill model, slot/refill/dedupe
semantics and determinism rig are the good part of the previous project. But
"reused" must not mean "trusted without audit". Four biases were identified;
**one of them (D1) was initially mis-diagnosed and is corrected here.**

Evidence that the concern is real: `logs/v1.8.2-gap-fill-resolution.md` — a
gap-blind exit resolution kept positions alive after the market had already
taken them out, booking full planned R instead of the available price. Fixing
it moved 52 exit prices and total R by **−13.73 (2.5%)** and flipped one loser
into a recorded +2.41R winner. A material engine bias survived eight versions
before detection.

---

## CORRECTION: D1 is not what I first claimed

An earlier draft of this register said: "spread is applied to entry only, so a
real trade pays the spread on both sides and cost is understated ~2×."

**That was wrong.** On a **bid** price series (verified in
`MAP-COMPASS-DATA-CONTRACT.md` §1: Kaggle close vs Dukascopy bid median −0.035,
vs ask −0.352):

```
LONG:  buy at ask = bid + spread, sell at bid = TP/SL level
       correct PnL = TP - (bid + spread)
SHORT: sell at bid = entry, buy back at ask = TP/SL + spread
       correct PnL = raw - (TP + spread)
```

The old `math.ts` does exactly this: `entry = raw + spread` (long) or
`raw - spread` (short), with SL/TP unchanged. For a short that is algebraically
identical to `raw - (TP + spread)`. **One spread on the entry IS a full
round-trip cost on a bid series.** There is no missing second charge.

The genuine D1 defect is therefore **magnitude and regime-blindness**, not
one-sidedness. Splitting the spread into "half on entry, half on exit" (as the
earlier draft proposed) would also have been wrong: it would double-count
against bid-based SL/TP levels.

### D1 (corrected) — static, regime-blind, understated spread

- Old: a single `$0.20` for every trade, every year, every session.
- Measured: median real spread **0.34–0.63** price units; p95 up to **2.04**;
  crisis max **14.53**. In R units the spread alone is ~**0.08R** median and
  ~**0.16R** at p95 (see `cost-model.json`).
- The **low-volatility** bucket has the _widest_ spread (quiet/illiquid hours),
  which is the opposite of what a volatility-scaled guess would assume.

**Fix (M3):** `build-cost-model.mjs` joins 851,640 real M1 bid/ask minutes to
the causal ATR(14) of their M30 bar and stores `spreadOverAtr` per
(session, volRegime) cell. Cost is expressed in **R units**, so it is
scale-free across gold's `$381 → $5,597` range. `cost.mjs` applies it. A
missing cell is a hard error, never a cheap fallback. Tests pin the ordering
(low-vol costs more than high-vol).

## D2 — no slippage model (optimistic)

The only mention of slippage in `src/lib/analyzer/` is in a _comment_. Market
orders were assumed to fill exactly at signal-bar close with no adverse
excursion — most wrong in the high-volatility states the Compass routes to.

**Fix (M3):** frozen at `0.02 × ATR` **per side**, charged on both entry and
exit. Justified from 247,910 measured `|next-bar-open − signal-close| / ATR`
samples (median 0.0112, p75 0.0402, p90 0.1400) — a round number between the
median and p75. A 2× stress variant is registered for M9. It is a model, not
measured fills, and is labelled as such.

## D3 — `RR_THRESHOLD = 2` conflicts with the standardised exit harness

`math.ts:3` and `run.ts:285` reject `rr <= 2`. The blueprint mandates one
identical exit for every strategy (stop 1.5×ATR, target 2R). Spread makes
`rr < 2`, so **the gate would reject every standardised trade**. The gate is
also a hidden selection effect: it filters by each strategy's native SL/TP,
which is exactly the exit-tuning confound the harness exists to remove.

**Fix (M3):** `lib/trade.mjs` has **no RR gate**. Every signal is resolved with
the same stop/target, and cost is charged afterwards in R units. Tests assert a
2R winner and a −1R loser both survive. The old engine's gate is untouched
(the old golden lock remains valid); the new pipeline never uses it.

## D4 — intrabar ambiguity keeps trades alive

`status.ts:250-263` returns `FILLED` when the fill bar also touches the
protective stop, leaving the position open. Defensible with M30-only OHLC, but
it is a systematic, invisible choice that biases results.

**Fix (M3):** `lib/trade.mjs` resolves the ordering with the M15 audit layer
where both sub-bars exist (98.56% of M30 bars). Otherwise it applies the
**conservative rule (assume stop hit first)** and sets `ambiguousFallback:
true` so M9 can count affected trades and report the book both ways. Tests pin
both branches.

---

## Resolution strategy — why the old rule files were NOT edited

`tests/ruleset-freeze.test.mjs` hashes `run.ts`, `status.ts`, `structure.ts`,
`regime-filters.ts` and `final-survivors.ts`. Editing them to fix D1–D4 would
break that freeze **and** the golden baseline (2,286 trades / R 527.627...),
destroying the only intact regression fixture from the old project.

So the new pipeline implements all four fixes in its own modules:

| Defect       | New implementation                            |
| ------------ | --------------------------------------------- |
| D1 spread    | `build-cost-model.mjs` + `lib/cost.mjs`       |
| D2 slippage  | `lib/cost.mjs` (frozen 0.02 ATR/side)         |
| D3 RR gate   | `lib/trade.mjs` (no gate)                     |
| D4 ambiguity | `lib/trade.mjs` (M15 + conservative fallback) |

The old engine is retained **as a read-only regression/reference fixture**, not
as the evaluator for new claims. This honours decision #8 ("fix all four
defects before strategy evaluation") without invalidating the old golden lock.

## Additional audit items (reviewed)

| Item                        | Location                      | Finding                                                                                                                                                                                          |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gap-through exit resolution | `status.ts` `gapFillPrice`    | Reimplemented in `lib/trade.mjs`; opens beyond a level fill at the open. Test pins a worse-than-−1R gap fill.                                                                                    |
| Dedupe / slot refill        | `run.ts` `consume()`          | Reimplemented as one-slot drop-on-occupied in `evaluateBook` — never queued. The old project's +16.0R offline estimate became −3.63R in the engine because freed slots refilled. Test pins this. |
| HTF trend context           | `structure.ts` `aggregate30m` | Not used by the Map (it derives H1/H4/D1 from M30 with EAT bucketing). Verify no future-bar read at bucket boundaries before M6.                                                                 |
| `sessionOf` fallthrough     | `time.ts`                     | Deliberately returns `ny` for 00:00–00:59. A reimplementation returned `undefined` and silently dropped that hour — caught and pinned by a test.                                                 |
| Live-final-bar / warm-up    | `series-contract.ts`          | `MAP.warmupBars = 1000` matches `MIN_PRODUCTION_BARS`. Test pins it.                                                                                                                             |
| Cross-feed seam             | Kaggle vs main CSV            | Declared at G0; never stitch. M9 uses the overlap as a sensitivity test.                                                                                                                         |

## Sign-off checklist (G1.5)

- [x] D1 corrected and fixed (real, regime-aware, R-denominated spread)
- [x] D2 fixed (frozen slippage + stress variant)
- [x] D3 resolved (no RR gate in the new harness)
- [x] D4 resolved (M15 ordering + conservative fallback + affected-trade flag)
- [x] Additional items reviewed; slot/dedupe and gap-fill reimplemented
- [x] Full `npm test` suite passes
- [x] Old golden lock and rule-source freeze **unchanged** — no re-freeze needed
- [ ] M6 claim verification may now proceed

**Register CLOSED for the new pipeline.** The old engine remains frozen as a
reference fixture and is never used to evaluate Map/Compass claims.
