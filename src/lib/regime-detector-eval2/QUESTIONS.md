# Questions for the requester (logged; no pause in execution)

## 1. How should the B3 percentile be applied to the lower-is-better C2 claim?

- **Options:** (A) Compare all claims on a direction-adjusted improvement scale; (B) compare C2's raw low ratio literally against the B3 upper 95th percentile.
- **Recommendation:** A. A literal upper-tail raw-ratio test contradicts the stated C2 direction; higher `1 - (detected range FTE / B1 FTE)` is the claimed improvement.
- **What I did meanwhile:** Pre-registered direction-adjusted effects and require each observed improvement to exceed its B3 95th percentile. C1 uses ratio-minus-one, C2 uses one-minus-ratio, and C3 uses the bullish-minus-bearish difference.

## 2. How should trailing-statistic terciles be cut for B2?

- **Options:** (A) Recompute predictor-only terciles within each instrument and verdict half; (B) use a single threshold over the full holdout; (C) use an expanding threshold.
- **Recommendation:** A, since the claim comparison is per half and uses no forward outcomes to set a cutoff.
- **What I did meanwhile:** Frozen type-7 empirical 1/3 and 2/3 quantiles among eligible starts in each instrument-half; B2 predictors are known at the close of `t`.

## 3. What effective week count should C3 use when it compares two label groups?

- **Options:** (A) Count weeks with either bullish or bearish starts; (B) require support from both groups and use the smaller weekly count.
- **Recommendation:** B, so a large group cannot mask a sparse comparison group.
- **What I did meanwhile:** Report both counts and use their minimum as C3 effective `n`; THIN is `n < 40`.

## 4. How should a significant opposite-sign EURUSD/XAGUSD result affect the gold verdict?

- **Options:** (A) Downgrade a gold PASS to FAIL on any corresponding opposite-sign cell whose CI excludes B1; (B) report secondary instruments without changing the primary verdict.
- **Recommendation:** A, matching the owner's contradiction-only rule.
- **What I did meanwhile:** Frozen that downgrade; secondary instruments cannot upgrade a gold verdict.

## 5. What holiday calendar should define large holdout gaps?

- **Options:** (A) Use only holidays documented in the holdout README; (B) import an external holiday calendar.
- **Recommendation:** A, because network access is restricted and the README is part of the stated source bundle.
- **What I did meanwhile:** Frozen README-only treatment. If no calendar is supplied, report the limitation and list gaps without importing external holiday data.

## 6. The frozen C3 formula is not in ATR units

- **Options:** (A) execute the literal frozen formula `(close[t+H]/close[t]-1)/ATR14[t]`; (B) issue a new pre-registration version using `(close[t+H]-close[t])/ATR14[t]`, which is a price change divided by price-unit ATR.
- **Recommendation:** B. In SPEC-RD2, the numerator is a fractional return while ATR14 is explicitly the Wilder true-range average in price units, so the quotient has units of inverse price and cannot be the declared signed return in ATR units.
- **What I did meanwhile:** Found this protocol defect during review before computing any outcome on either evaluation dataset. I did not edit the hashed SPEC-RD2.md and did not calculate market labels/outcomes. I stopped pending an authorized replacement/erratum that can be hashed before analysis.

## Run-state note

Step 0's seven file hashes and detector-tree hash matched before commit and after rebase; the frozen source commit is pushed and `git ls-remote` matched local HEAD. Part 1 SPEC-RD2 is committed, hashed and pushed; its hash is in SPEC-RD2.sha256. The source archive was inventoried after preregistration: all 51 CSV members, including the three consolidated instrument files, are zero-byte placeholders and there is no README, so the holdout is unavailable. The gold 2020-2026 CSV copied from origin/main matches its required SHA-256. No evaluation labels or forward outcomes have been computed. The initial full-suite run while preserving the pre-existing user edits in a stash had one unrelated UI assertion failure; after restoring those exact user edits, the full suite passed (246/246), and the seven focused evaluation tests passed.
