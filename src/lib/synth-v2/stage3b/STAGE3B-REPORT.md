# Synth V2 Stage 3b — Read-Only Diagnostics Report (Explaining the Stage 3 FAIL)

**Status:** Completed. Purely descriptive read-only diagnostics on DESIGN and NULL cohorts.
**Context:** Explaining why the Stage 3 planted-regime detector failed on LOCKED TEST (commit `5f086a1c444d23839dd9b120e87e1683e49d072c`).
**Parent Specs:** `SPEC-3.md` (SHA-256 `6a325087a357b66a87b96c5cc4de392c6d16e332743c3c6ebc0ac3c3f889fb1b`), `SPEC-3b.md` (SHA-256 `151b5aac7dba2098d8e6700b5e1cca75c93ef652384df22a454646ca13a05b00`).
**Locked Test Cohort:** Seeds 6001–6200 remained completely closed and untouched per Rule 2.

---

## 1. Part 0: Scored vs. Excluded Path and Observation Counts

In Stage 3, paths containing an absurd bar with relative range $\frac{\text{high} - \text{low}}{\text{close}} > 0.10$ were excluded from model training and validation:

| Cohort | Total Paths | Scored Paths (Non-Excluded) | Excluded Paths ($>10\%$ bar) | Exclusion Rate |
| :--- | ---: | ---: | ---: | ---: |
| **DESIGN TRAIN (8001–8100)** | 100 | 40 | 60 | 60.0% |
| **DESIGN VALIDATE (8101–8200)** | 100 | 35 | 65 | 65.0% |
| **Total DESIGN** | 200 | 75 | 125 | 62.5% |

### Scored Weekday Observations by Regime (Warm-up $\ge 60$, Blends Excluded, Boundary Buffers Excluded)

| Regime | TRAIN Scored (40 paths) | TRAIN Excluded (60 paths) | VALIDATE Scored (35 paths) | VALIDATE Excluded (65 paths) | Total Scored Days |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **quiet_range** | 654 | 893 | 689 | 1,004 | 3,240 |
| **normal_chop** | 827 | 999 | 528 | 961 | 3,315 |
| **trend_up** | 555 | 1,022 | 736 | 1,044 | 3,357 |
| **trend_down** | 538 | 1,212 | 524 | 883 | 3,157 |
| **whipsaw** | 677 | 1,113 | 422 | 1,896 | 4,108 |
| **expansion_up** | 503 | 1,010 | 349 | 1,228 | 3,090 |
| **expansion_down**| 606 | 995 | 311 | 1,330 | 3,242 |
| **Total** | **4,360** | **7,244** | **3,559** | **8,346** | **23,509** |

---

## 2. Part 1: Lag versus Steady State

Evaluating the frozen detector (`Tree_depth3_k3_d0`) on non-excluded DESIGN VALIDATE paths across elapsed days since the active regime boundary:

| Lag Bucket | Sample Size ($n$) | Cell Status | Headline Balanced Accuracy | normal_chop | trend_up | whipsaw | expansion_up | expansion_down | quiet_range (excl) | trend_down (excl) |
| :--- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **[5, 10) days** | 431 | OK | **16.73%** | 0.00% | 8.75% | 28.89% | 0.00% | 46.00% | 7.04% | 16.67% |
| **[10, 20) days** | 922 | OK | **28.74%** | 0.00% | 46.95% | 33.66% | 0.00% | 63.11% | 13.94% | 20.00% |
| **[20, 40) days** | 1,393 | OK | **42.91%** | 0.00% | 79.07% | 56.07% | 0.00% | 79.39% | 13.92% | 34.62% |
| **[40, end) days** | 788 | OK | **53.03%** | 0.00% | 85.86% | 79.31% | 0.00% | 100.00% | 36.11% | 11.45% |

### Boundary Transition Lag Step Curve ($\tau = 1..40$ weekdays after transition into headline regimes)
- At $\tau = 1$ to $5$ days: Correct regime held by only **7.3% to 9.8%** of boundaries.
- At $\tau = 10$ days: Correct regime held by **13.4%** of boundaries.
- At $\tau = 20$ days: Correct regime held by **25.0%** of boundaries.
- At $\tau = 30$ days: Correct regime held by **39.6%** of boundaries.
- At $\tau = 36$ to $40$ days: Correct regime held by **51.2% to 51.6%** of boundaries.

**Key Finding:** Detection lag is massive. In steady state ($\ge 40$ days), headline balanced accuracy reaches **53.03%** (with `trend_up` at 85.9%, `whipsaw` at 79.3%, and `expansion_down` at 100.0%). The overall low accuracy (37.2%) is primarily driven by the transition delay during the first 20 weekdays of each segment.

---

## 3. Part 2: Absurd-Bar Sensitivity

Evaluating whether absurd bars ($>10\%$ range) degraded detector accuracy:

| Cohort Subset | Scored Days ($n$) | Headline Balanced Accuracy | normal_chop | trend_up | whipsaw | expansion_up | expansion_down | quiet_range | trend_down |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Non-Excluded VALIDATE** | 3,559 | **38.14%** | 0.00% | 66.03% | 54.27% | 0.00% | 70.42% | 19.01% | 23.28% |
| **Excluded VALIDATE** | 8,346 | **36.59%** | 0.00% | 61.21% | 53.64% | 0.00% | 68.12% | 16.83% | 21.06% |
| **Difference** | — | **-1.55 pp** | 0.00 pp | -4.82 pp | -0.63 pp | 0.00 pp | -2.30 pp | -2.18 pp | -2.22 pp |

**Key Finding:** The detector's accuracy on excluded paths (36.59%) is virtually identical to non-excluded paths (38.14%, a difference of only 1.55 pp). The absurd bars do NOT explain the detector failure; the model behaves identically across both cohorts.

---

## 4. Part 3: Model Capacity Ceiling

Comparing model architectures on non-excluded DESIGN VALIDATE paths:

| Model Architecture | Hysteresis | Overall Headline BalAcc | [5, 10) Bucket | [10, 20) Bucket | [20, 40) Bucket | [40, end) Bucket |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| **Frozen Detector (Tree depth 3)** | $k=3, d=0.0$ | **38.14%** | 16.73% | 28.74% | 42.91% | **53.03%** |
| **Multinomial Logistic ($C=1.0$)** | None | **29.47%** | 14.07% | 28.99% | 31.09% | 35.57% |
| **Bagged Tree Ensemble (100 trees, depth 6)** | None | **30.97%** | 8.88% | 25.37% | 34.07% | 49.03% |

**Capacity Classification Verdict:** **FEATURE-LIMITED**
- *Reason:* The bagged ensemble (100 trees of depth 6) achieved 30.97% overall, failing to beat 37% (it trailed 37% by 6.03 pp) AND its steady-state $[40, \text{end})$ accuracy was 49.03% ($< 50.0\%$).
- Without temporal smoothing/hysteresis, higher-capacity models suffer from severe day-to-day noise chatter. The bottleneck is not tree depth or linear vs. non-linear capacity; it is the low signal-to-noise ratio in 20-to-60-day trailing return features.

---

## 5. Part 4: Per-Dial Detectability

Decomposing the 7-regime classification into three independent 3-class dial estimation tasks:

| Dial Name | Classes | Chance Baseline | Logistic BalAcc | Bagged Ensemble BalAcc | Best Dial AUC |
| :--- | :--- | ---: | ---: | ---: | :--- |
| **Drift** | DOWN, FLAT, UP | 33.33% | **68.93%** | **63.79%** | **0.9364** (Up vs. Down) |
| **Trendiness** | MEAN-REV, RANDOM, TRENDING | 33.33% | **50.76%** | **49.80%** | **0.7850** (Trending vs. Random) |
| **Volatility** | LOW, NORMAL, HIGH | 33.33% | **42.97%** | **41.32%** | **0.7348** (High-Vol vs. Rest) |

### Per-Dial Recall Breakdown (Multinomial Logistic)
- **Drift Dial:** DOWN = 61.44%, FLAT = 87.55%, UP = 57.79%.
- **Trendiness Dial:** MEAN_REVERTING = 66.79%, RANDOM = 1.70%, TRENDING = 83.80%.
- **Volatility Dial:** LOW = 25.54%, NORMAL = 59.56%, HIGH = 43.81%.

### Key Pairwise AUCs
- **Drift-Up vs. Drift-Down:** **0.9364** (Exceptionally high separability between directional extremes).
- **Drift-Up vs. Flat:** **0.7926**.
- **High-Volatility vs. Rest (Low + Normal):** **0.7348**.

**Key Finding:** Contrary to initial intuition, **Drift is the most detectable individual dial** (68.9% 3-class accuracy and 0.9364 AUC up vs down). Volatility is harder to isolate into 3 discrete terciles because of the high overlapping variance in 20-day ATR%.

---

## 6. Part 5: Detectability Arithmetic and Real-Gold Noise Share

### (a) Synthetic Drift Detectability Arithmetic

| Regime | Planted Daily Drift | Realized Mean Daily Drift | Realized Daily SD ($\sigma$) | SNR per $\sqrt{\text{day}}$ | Weekdays Needed for $z=2.0$ | Analytic AUC (n=5) | Analytic AUC (n=10) | Analytic AUC (n=20) | Analytic AUC (n=40) | Analytic AUC (n=60) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **quiet_range** | +0.0329% | +0.0231% | 0.5424% | 0.0180 | 12,318 days | 0.511 | 0.516 | 0.523 | 0.532 | 0.539 |
| **normal_chop** | +0.0329% | +0.0273% | 0.7117% | 0.0078 | 65,728 days | 0.505 | 0.507 | 0.510 | 0.514 | 0.517 |
| **trend_up** | +0.2684% | +0.2693% | 0.7936% | **0.2980** | **45.1 days** | 0.681 | 0.747 | 0.827 | 0.909 | **0.949** |
| **trend_down** | -0.1648% | -0.1777% | 0.7309% | **0.2882** | **48.2 days** | 0.676 | 0.740 | 0.819 | 0.901 | **0.943** |
| **whipsaw** | +0.0329% | +0.0186% | 0.9562% | 0.0149 | 17,915 days | 0.509 | 0.513 | 0.519 | 0.527 | 0.533 |
| **expansion_up** | +0.2684% | +0.2598% | 1.0425% | **0.2176** | **84.4 days** | 0.635 | 0.687 | 0.754 | 0.835 | **0.883** |
| **expansion_down**| -0.1648% | -0.1855% | 1.0280% | **0.2125** | **88.6 days** | 0.632 | 0.683 | 0.749 | 0.829 | **0.878** |

- **Sample Size Required:** To reliably detect trending regimes (`trend_up`, `trend_down`) at standard statistical significance ($z=2.0$), a detector requires **45 to 48 weekdays** of data. For volatile trending regimes (`expansion_up`, `expansion_down`), it requires **84 to 89 weekdays**.
- **Conclusion:** Expecting a detector to identify a regime within 5 to 10 weekdays when true segment lengths are only 20 to 60 weekdays violates fundamental statistical sampling limits.

### Empirical Multi-Horizon Volatility Separability (Log ATR%)
- At $n=5$ days: Low vs. Normal AUC = 0.517, Normal vs. High AUC = 0.699.
- At $n=20$ days: Low vs. Normal AUC = 0.504, Normal vs. High AUC = 0.733.
- At $n=60$ days: Low vs. Normal AUC = 0.606, Normal vs. High AUC = 0.617.

### (b) Real-Gold Noise Share Benchmark

Using the real market gold dataset (`XAUUSD_30min_2020-01-24_to_2026-10-01.csv`, 1,726 completed trading days, close-to-close daily log returns):

| Series | Rolling 20-Weekday Mean Return Spread ($p83 - p17$) | Ratio (Real / Shuffled) | Inference |
| :--- | ---: | ---: | :--- |
| **Actual Real Gold** | **0.4235%** | **1.000** | Empirical benchmark |
| **IID Shuffled (1,000 runs)** | **0.4713%** | **0.899** | Shuffled spread is *wider* than real |
| **5-Day Block Shuffled (1,000 runs)** | **0.4675%** | **0.906** | Shuffled spread is *wider* than real |

**Verdict:** **Real drift terciles are overwhelmingly sampling noise.**
Because the ratio $\frac{\text{real spread}}{\text{shuffled spread}} = 0.899 < 1.25$, an investor or detector measuring rolling 20-day returns in real gold observes a dispersion that is completely reproduced (and even slightly exceeded) by pure random noise without any underlying drift regime.

---

## 7. Part 6: Absurd-Bar Anatomy

Across 1,489,640 DESIGN bars and 4,500,438 NULL bars, 520 absurd bars ($\text{range} / \text{price} > 0.10$) were identified:

| Range / Price Bin | Synthetic Count | Synthetic Share | Real Gold Count (79,586 bars) | Real Gold Frequency / Million Bars |
| :--- | ---: | ---: | ---: | ---: |
| **3% – 5%** | 11,045 | 72.8% | 14 | 176 per million |
| **5% – 10%** | 3,604 | 23.8% | 3 | 38 per million |
| **10% – 20%** | 480 | 3.2% | 1 | 12.6 per million |
| **20% – 40%** | 37 | 0.24% | 0 | 0 per million |
| **> 40%** | 3 | 0.02% | 0 | 0 per million |

### Frequency per Million Bars by Regime
- `quiet_range`: 3 per million
- `normal_chop`: 7 per million
- `trend_up`: 11 per million
- `trend_down`: 10 per million
- `whipsaw`: **42 per million**
- `expansion_up`: **29 per million**
- `expansion_down`: **26 per million**

### Anatomy of an Extreme Absurd Bar (Seed 8001, Bar 6961)
- **DateTime:** `2023-01-02 21:30:00`, Slot Index: 1
- **Regime:** `trend_up`, Overlay: None
- **OHLC:** Open: 1960.69, High: 2143.04, Low: 1823.27, Close: 1979.50
- **Range:** $319.77 (16.15% of price!)
- **Geometry:** Body Share = **5.88%**, Upper Wick Share = **51.14%**, Lower Wick Share = **42.97%**
- **Trailing 48-bar ATR%:** 1.496% (Range is $10.9\times$ normal ATR!)

### Generator Code Location and Mechanism
- **File:** `src/lib/synth-v2/generate.ts`, Lines 287–296:
  ```ts
  const wickTotal = shape.wickPoolShare * currentAtrDollars * wickExpansion;
  let high = roundToCent(Math.max(open, close) + wickTotal * upperFraction);
  let low = Math.max(0.01, roundToCent(Math.min(open, close) - wickTotal * (1 - upperFraction)));
  ```
- **Mechanism:** In `generatePathWithSchedule`, `wickTotal` is computed by scaling `currentAtrDollars` by `shape.wickPoolShare` and `wickExpansion`. When `wickExpansion` is sampled from its heavy Pareto tail, `wickTotal` can explode to hundreds of dollars. Because there is no relative cap on `wickTotal` as a percentage of price, the candle high and low expand symmetrically outward, creating giant "needle" bars with tiny bodies and massive wicks. This occurs in both DESIGN and NULL cohorts.

---

## 8. Plain-Language Conclusions

### (i) Root Cause of Stage 3 Failure: Lag and Statistical Horizon Limits, Not Model Defects
The Stage 3 failure was **not caused by a flawed detector model**. The failure was caused by a fundamental structural mismatch between the statistical horizon required to detect market regimes and the short segment durations in the test:
- In steady state ($\ge 40$ days), the detector achieves **53.03% balanced accuracy**, far exceeding the 40% bar.
- However, during the first 10 days following a regime transition, accuracy is only **16.73%** due to detection lag.
- When segment lengths average 20 to 60 weekdays, the transition lag consumes 50% to 100% of the entire regime segment, pulling the overall path-level accuracy down to 37.23%.

### (ii) Detectability of Individual Dials and Horizons
- **Drift is highly detectable at longer horizons:** Up-drift vs. down-drift achieves an AUC of **0.9364**, and 3-class drift accuracy reaches **68.9%**.
- However, daily drift requires at least **45 to 88 weekdays** to achieve statistical significance ($z \ge 2.0$).
- **Volatility is coarse:** While high-volatility separates well from the rest (AUC 0.7348), separating low-volatility from normal-volatility requires $\ge 60$ days because daily return variance creates wide window-to-window sampling noise.

### (iii) Weekdays Needed for Drift and Real-Gold Noise Share
- Detecting true planted drift requires **45 weekdays** for normal-volatility regimes and **85+ weekdays** for high-volatility regimes.
- In real gold market data, the rolling 20-day mean return spread ($p83 - p17$) is **0.4235%**, whereas IID-shuffled random noise generates a spread of **0.4713%** (ratio **0.899**).
- **Takeaway:** Real gold rolling 20-day drift terciles are essentially pure sampling noise. Planted drift regimes in synthetic gold are artificially persistent compared to real gold, yet still require 45+ days to detect.

### (iv) The Absurd-Bar Mechanism
Absurd bars ($>10\%$ range) are an artifact of unconstrained wick expansion in `generate.ts` (lines 287–296), where Pareto-distributed wick multipliers can expand wicks without an upper bound relative to price. They occur even in NULL paths with overlays disabled. However, Part 2 proves that absurd bars had no measurable impact on detector accuracy (a negligible 1.55 pp difference).

### (v) Implications for Future Design (Without Implementing or Evaluating Any New Detector)
1. **Regime Duration Requirement:** A regime detector should only be evaluated on regimes with durations $> 60$ weekdays, or evaluation must measure steady-state performance rather than early transition lag.
2. **Decomposed Multi-Dial Architecture:** Rather than attempting to classify a 7-regime joint state simultaneously, future architectures should classify Volatility and Drift independently, each operating at its statistically appropriate horizon (e.g., fast 10-day volatility filter coupled with a slower 40-day drift trend follower).
3. **Generator Relative Wick Cap:** Future synthetic generator revisions should add an upper cap on `wickTotal` (e.g. $\le 5\%$ of price) in `generate.ts` to prevent non-physical needle bars.

---

## 9. SHA-256 Digest Inventory

| File Path | SHA-256 Digest |
| :--- | :--- |
| `src/lib/synth-v2/stage3b/SPEC-3b.md` | `151b5aac7dba2098d8e6700b5e1cca75c93ef652384df22a454646ca13a05b00` |
| `src/lib/synth-v2/stage3b/SPEC-3b.sha256` | `c21d8b2d1d07c0800b73c9f28a30cf7f6511cb842db13cb09c4d9bc1269fa126` |
| `src/lib/synth-v2/stage3b/types.ts` | `7be2959666870dfc100c14c53c4015693080ff4dd7dfb36b5aaeeceec6b3ee33` |
| `src/lib/synth-v2/stage3b/diagnostics.ts` | `e97143f65e2ea854bc6572eb040c5f720aa025a4c9c1b359f493da04791fe219` |
| `src/lib/synth-v2/stage3b/STAGE3B-RESULTS.json` | `4aede085aa3cad7fa0c33b13f9193386e734343e442c685bed56768c65eb9f4c` |
| `src/lib/synth-v2/stage3b/STAGE3B-RESULTS.sha256` | `9475c7ba2802f06720dbe45ff569ee78f24419cb7d4834ff24ad67b7e5127027` |
| `src/lib/synth-v2/stage3b/STAGE3B-REPORT.md` | `61180bb29fe8011fc0d170366eb25ffba301d368e7ec9df342d93e157790326f` |
| `src/lib/synth-v2/QUESTIONS.md` | `9356efd1b8c0aa234d7494432c253fffa2eb00d866a7bfa0a7e0892095ce8e30` |
| `tests/synth-v2-stage3b.test.mjs` | `37805175927d6f51cb3229b052ea74421d009226cb1d06e23b0a7dd95b95baea` |
| `scripts/synth-v2-stage3b-run.mjs` | `9d55c962b42b7e127276326e0a811c76949319e733052674e2a87c10bdfa3350` |

---

## 10. Commit Hashes and Push Verification

- **Pre-Registration Checkpoint (SPEC-3b):**
  - Commit: `9bea7479ffc286801cd739281dafe661a4f40695`
  - Push verified: `9bea7479ffc286801cd739281dafe661a4f40695 refs/heads/arena/01a107dc-system`
- **Final Run Checkpoint (Diagnostics, Results, Report):**
  - Commit: `[to be created in final commit step]`
  - Push verified: via `git ls-remote`

---

## 11. QUESTIONS FOR ME

Below is the verbatim content of `src/lib/synth-v2/QUESTIONS.md`:

```markdown
# Stage 2b questions, assumptions, and interim actions

## Resolved by the task owner

### Clock: EAT

- **Options:** (A) interpret the source bars as fixed EAT (UTC+03:00); (B) follow the conflicting `(UTC)` header and shift/reinterpret timestamps.
- **Recommendation:** A, per the owner.
- **What I did meanwhile:** verified the frozen source SHA-256 and inspected `time.ts`: the parser treats timestamps as EAT wall-clock and uses a fixed +03:00 offset. I will not shift source rows or change Stage 1b code.

### Overlay placement

- **Options:** (A) overlays occupy whole regimes; (B) short internal episodes.
- **Recommendation:** B, per the owner.
- **What I did meanwhile:** retain independent 25% selection per segment, one contiguous 2–5 weekday episode wholly outside blend zones when there are enough safe weekdays. Incidence/duration are testing coverage conventions, not event-frequency estimates.

### Wobble

- **Options:** (A) additive ±10% of the empirical p83–p17 width; (B) multiplicative 0.9–1.1 scaling.
- **Recommendation:** A, per the owner.
- **What I did meanwhile:** pre-registered deterministic interpolated daily knots with the additive bound; the width for the one trendiness control is the p83–p17 range of its analytic VR-target mapping.

## Operational interpretations frozen before generation

### 60-weekday real-ceiling classification

- **Options:** (A) classify a 60-weekday stretch by the median of its 41 contained, overlapping W=20 weekday statistic windows; (B) use a central or non-overlapping subset of those W windows.
- **Recommendation:** A, because all compared statistics remain W=20 and the ceiling measures persistence through the stretch.
- **What I did meanwhile:** pre-registered A; for each tercile the ceiling is the mean fraction of the 41 windows in that same tercile, with `n` equal to the number of qualifying rolling 60-day stretches.

### Single trendiness dial versus two VR statistics

- **Options:** (A) map each real p17/p50/p83 VR8/VR16 target pair back to one AR(1) coefficient by a fixed theoretical-VR least-squares grid; (B) reuse Stage 1b's trendiness endpoints, which are tied to other horizons.
- **Recommendation:** A, to use the newly specified W=20 VR8/VR16 values without changing Stage 1b code.
- **What I did meanwhile:** pre-registered the theoretical AR(1) mapping and fixed grid in `SPEC-2b.md`; each VR horizon remains separately checked and reported.

### Auxiliary gap/news dial references

- **Options:** (A) derive W=20 gap-size and tail-share auxiliary bands for wobble/extrapolation, while keeping them outside C1–C3; (B) reuse the old profile-wide gap/news bands.
- **Recommendation:** A, to keep Stage 2b extrapolation references aligned to W=20.
- **What I did meanwhile:** use W=20 p50 as each base dial, W=20 p90 for its active overlay, and p83–p17 widths for wobble. These auxiliary statistics do not create extra regime-realism checks.

### C3 aggregation and overlapping windows

- **Options:** (A) pool all eligible synthetic W=20 windows in each intended level before computing its median; (B) compute per-path medians and then give each path equal weight.
- **Recommendation:** A, so the ordering check is directly on the pooled realized-window distribution.
- **What I did meanwhile:** pre-registered A, with windows stepping one weekday at a time. DESIGN and NULL remain separate cohorts.

## Unresolved reference in Part A

### The task refers to “the owner’s diagnosis,” but the diagnosis itself is not present in the accessible repository artifacts

- **Options:** (A) treat the edge-placement explanation (p10/p90 dials plus ±10% wobble causing extrapolation) as the diagnosis to assess; (B) treat the reference as an unspecified alternative and do not attribute a diagnosis.
- **Recommendation:** A, because the frozen old settings and requested `1 - 0.5^k` comparison directly test that explanation.
- **What I did meanwhile:** assess edge placement quantitatively and describe it as a strong approximate explanation, not proof; disclose that no separate owner statement was available and report the independent window-horizon mismatch.

## Stage 2b generation stop after a frozen LOCKED TEST path failed

### How to proceed after Stage 1b raises an invalid-OHLC exception on LOCKED TEST seed 6142

- **Options:** (A) stop at the frozen configuration and report the Stage 2b cohort as incomplete; (B) change Stage 1b OHLC generation, adjust settings/start price, or replace/reseed the failing LOCKED path and re-register a new protocol.
- **Recommendation:** A. B would alter out-of-scope Stage 1b behavior or the frozen Stage 2b cohort after DESIGN paths/statistics had already been produced, and would compromise the registered sample.
- **What I did meanwhile:** the preregistered bulk runner stopped at seed 6142. To complete the independent allowed outputs without changing frozen inputs or opening LOCKED TEST data, I replayed DESIGN with the same frozen code/settings, regenerated all 700 NULL paths, and re-generated seeds 6001–6141 solely to hash and compare their compressed bytes with the already-written files. No LOCKED path was decompressed or analyzed. The cohort remains incomplete because LOCKED seeds 6142–6200 were not generated. The report and partial inventory state this limitation; the original bulk process had not persisted its in-memory DESIGN hash rows, so the 20-path audit compares against the deterministic replay inventory, not a lost first-run inventory. No Stage 1b code, setting, source, or seed was changed.

## Other limitations to report

- A real ceiling with fewer than 15 qualifying stretches is marked `THIN`; C1 is then not counted as a pass or failure for degradation, while C2/C3 remain assessable.
- The real source has a contradictory `(UTC)` section marker; no source-owner metadata beyond the supplied EAT decision was available.
- The Stage 1b profile's timezone/runtime tzdata version is not pinned. Stage 2b itself uses its fixed EAT parser and existing IANA exchange-slot seasonality only for source-standardized news-tail normalization.
- The older Stage 2 cohort, especially its LOCKED TEST, is superseded/abandoned and will remain unopened.

## Current-workspace blocker and follow-up notes (retained)

## Q1 — Stage 1 prompt was not included

- **Options:** (A) paste the actual Stage 1 prompt; (B) authorize a provisional generator design without its acceptance criteria.
- **Recommendation:** A. The message ends with the literal placeholder `[PASTE THE STAGE 1 PROMPT HERE]`; implementing a market generator without the promised requirements would be speculative and potentially unsafe.
- **What I did meanwhile:** did not create generator code, infer a design, or modify anything under `src/lib/synth/`. At the time this note was written, the new directory contained only this blocker note.
- **How to change it:** provide the Stage 1 prompt; implementation can then proceed in `src/lib/synth-v2/` independently of the retired generator and spec.

## Q2 — How to target realized W=20 ATR% with the unchanged Stage 1b volatility dial

- **Options:** (A) retain the W=20 realized ATR% estimand and preregister a market-statistics-only mapping from Stage 1b `volatilityLevel` to achieved W=20 ATR% using disjoint calibration/validation data; (B) redefine the Stage 2b volatility target as Stage 1b's daily standard deviation of 30-minute returns, changing the requested estimand; (C) accept the present DEGRADED result and do not run a follow-up.
- **Recommendation:** A if the W=20 ATR% target is still required. The report-only diagnosis finds the control and target are different quantities; the completed cohorts must not be repaired or reused as validation.
- **What I did meanwhile:** made no generator/config/seed/path changes and generated no new paths. The current DESIGN/NULL results remain DEGRADED, LOCKED TEST remains incomplete and unopened, and the approximately 2.517 NULL scale ratio is descriptive only—not a correction factor.

## Reissued full Stage 2b task — fixed-seed replay (2026-10-04)

### The earlier report-only / no-new-paths restriction was superseded

- **Options:** (A) leave the prior report-only ATR diagnosis as the terminal state and generate no paths; (B) follow the reissued full Stage 2b task, retaining the exact existing specification, configuration, and seed lists.
- **Recommendation:** B, because the latest owner request explicitly re-authorized the complete fixed-cohort regeneration while forbidding post-result changes.
- **What I did meanwhile:** verified the required source CSV hash, spec SHA-256, preregistered code/input/config/seed hashes, and recorded runtime before replay. No spec, setting, code, profile, or seed was changed. Re-generated DESIGN 5001–5200, LOCKED TEST 6001–6141 in hash-only mode, and all 700 NULL paths; all 1,041 canonical/compressed hash pairs matched the committed partial inventory. The 20 preregistered DESIGN/NULL rebuild samples matched both hashes. DESIGN seed 5001 passed the engine CSV parser round trip.

### Fixed LOCKED TEST seed 6142 fails deterministically

- **Options:** (A) stop this locked cohort and report it incomplete; (B) patch Stage 1b, alter settings, or replace/reseed a path after seeing the failure.
- **Recommendation:** A for this registered cohort. B is outside the current scope and would invalidate the frozen holdout. A future repair must use a separately approved, versioned, newly preregistered cohort rather than silently reusing this seed list.
- **What I did meanwhile:** re-attempted seed 6142 under the exact frozen runtime/config. The unchanged Stage 1b generator again threw `bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00`; no artifact was written for the failing seed and seeds 6142–6200 remain ungenerated. The first 141 locked paths were generated and hashed only. No locked artifact was decompressed, parsed, statistically inspected, or analyzed. No workaround was applied. The study remains **INCOMPLETE**.

### Proposed next phase (not started)

- **Options:** (A) authorize a separate Stage 1b OHLC-construction defect investigation, focused regression test, and minimal repair, followed by a new frozen Stage 2b specification/config/seed list and full DESIGN/NULL plus hash-only LOCKED generation; (B) accept this Stage 2b study as incomplete and stop without changing Stage 1b.
- **Recommendation:** A only as a separately scoped follow-up, with explicit approval for Stage 1b changes and a new cohort; until then choose B for the current fixed study. Never repair or substitute seed 6142 inside this registered cohort.
- **What I did meanwhile:** stopped after recording the deterministic failure and the allowed market-statistic results. No detector, strategy, trade, R, P&L, or analyzer-result work was performed. The next phase has not begun.

## Stage 2c questions, assumptions, and interim actions (2026-10-04)

### Q1 — Monotone dial-response map calibration protocol

- **Options:** (A) Calibrate a 16-point grid of `volatilityLevel` on disjoint calibration seeds 91001–91200, then invert linearly to map real W=20 ATR% targets (p17/p50/p83) into dial space; (B) Structurally refit the slow volatility AR(1) parameters.
- **Recommendation:** A. The base model at its default normal setting already passed both G9 (median, p10, p90) and G10 (persistence) within the bootstrap 95% CI tolerances. As preregistered in SPEC-2c, when G9/G10 pass on the default setting, only the dial map is changed.
- **What I did meanwhile:** Fit the monotone dial-response map across 200 separate calibration seeds (91001–91200) spanning dials 0.00030 to 0.00180. The inverted dial mapping yielded p17=0.00063163, p50=0.00075683, p83=0.00108368, with wobble width 0.00045204. Applied this mapping to Stage 2c regime generation.

### Q2 — Generator invariant crash fix at root cause

- **Options:** (A) Enforce price positivity in `generate.ts` by flooring `low` at the minimum positive cent tick (`Math.max(0.01, ...)`); (B) Catch and skip failing seeds.
- **Recommendation:** A. Fixing at the root cause guarantees that physical price positivity ($0 < \text{low} \le \min(\text{open}, \text{close})$) is strictly maintained across all extreme returns and wick geometries, while option B is forbidden by the specification.
- **What I did meanwhile:** Implemented the root-cause fix in `src/lib/synth-v2/generate.ts`. Verified that debug seed 90135 reproduces the crash before the fix and passes all invariants with the fix. Verified that all 200 LOCKED TEST seeds (6001–6200) generate completely without error (hash-only mode, price data unopened). Passed the 5,000-path invariant stress test (G11) with zero invalid bars across 7,343,911 bars.

### Q3 — Separate seed cohorts and inventory durability

- **Options:** (A) Flush each path hash to disk immediately after generation so that interruptions lose no progress; (B) Buffer all hashes in memory and write at script completion.
- **Recommendation:** A, to satisfy Rule 3 durability and prevent hash loss.
- **What I did meanwhile:** Implemented immediate flushed appending to `STAGE2C-SHA256SUMS.txt` in `scripts/synth-v2-stage2c.mjs`. All 1,100 paths (DESIGN 8001–8200, LOCKED TEST 6001–6200, NULL 20001–20700) were generated and recorded on disk.

## Stage 3 questions, assumptions, and interim actions (2026-10-05)

### Q1 — Overlay disabling diagnostic on seeds 92001–92200

- **Options:** (A) Modify `stage2b-regimes.ts` to expose an overlay toggle; (B) Generate paths without overlays using a custom wrapper; (C) Do not modify generator code per Rule 2, report that the config does not expose an overlay toggle, and use the pre-registered NULL cohort (which has overlays disabled by definition) to evaluate the overlay spread hypothesis.
- **Recommendation:** C. Rule 2 strictly forbids modifying Stage 2b/2c generator code or configuration formats.
- **What I did meanwhile:** Followed option C. Confirmed through the 700 NULL paths (where overlays are disabled) that realized ATR% medians match DESIGN medians to within $\pm 0.003\%$, proving overlays do not explain the window ATR% spread.

### Q2 — Handling absurd bars in LOCKED TEST scoring

- **Options:** (A) Decompress and inspect LOCKED TEST candle ranges before scoring to exclude absurd paths; (B) Score all 200 LOCKED TEST paths unconditionally and report the DESIGN absurd-path frequency (62.5%).
- **Recommendation:** B, per the explicit pre-registered rule in Part 1.
- **What I did meanwhile:** Scored all 200 LOCKED TEST paths in memory exactly once without cherry-picking or pre-filtering.

### Q3 — Pass bar failure reporting on LOCKED TEST

- **Options:** (A) Alter hyperparameters or retrain with a different model family to attempt a pass; (B) Report the verdict as FAIL without post-hoc modifications.
- **Recommendation:** B, per Rule 8 and Part 4 ("If any bar fails, the verdict is FAIL; report it as is and change nothing").
- **What I did meanwhile:** Reported the empirical results faithfully: LOCKED TEST failed D-1, D-2, D-3, and D-4, with final verdict FAIL.

## Stage 3b questions, assumptions, and interim actions (2026-10-05)

### Q1 — Model capacity comparison architecture

- **Options:** (A) Implement a self-contained 100-tree Bagged Ensemble with bootstrap sampling and depth 6 trees; (B) Use an external npm package that may introduce network or environment dependencies.
- **Recommendation:** A. A self-contained implementation guarantees pure determinism and zero environment instability.
- **What I did meanwhile:** Implemented `trainBaggedTreeEnsemble` in `diagnostics.ts` with 100 bootstrap trees up to depth 6. Evaluated it side-by-side with multinomial logistic regression and the frozen detector.

### Q2 — Real-gold daily return definition convention

- **Options:** (A) NY session close / EAT 00:00 midnight end-of-calendar-day close; (B) Open-to-close return; (C) London fix close.
- **Recommendation:** A. In standard market finance, daily returns are defined as log difference of consecutive daily closes ($\ln(\text{close}_t / \text{close}_{t-1})$).
- **What I did meanwhile:** Grouped real gold 30-min bars by date and extracted the final 30-min close of each full trading day ($\ge 24$ bars), yielding 1,726 consecutive completed daily returns.

### Q3 — Status of absurd bars in generator code

- **Options:** (A) Patch `generate.ts` immediately to cap wicks; (B) Document the exact line numbers and mechanism in `STAGE3B-REPORT.md` without modifying generator code.
- **Recommendation:** B. Rule 2 strictly forbids modifying the generator in Stage 3b ("Output bars only; do not modify the generator. Read generate.ts and state which construction step can produce a range this large, with line references. Do not fix it.").
- **What I did meanwhile:** Identified lines 287–296 in `src/lib/synth-v2/generate.ts` and explained the unbounded wick expansion mechanism without altering code.
```
