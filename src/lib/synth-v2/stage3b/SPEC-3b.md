# Specification — Synth V2, Stage 3b: Read-Only Diagnostics on DESIGN and NULL

**Status:** Pre-registered before executing Stage 3b diagnostic evaluations.
**Context:** Explaining the Stage 3 LOCKED TEST FAIL (commit `5f086a1c444d23839dd9b120e87e1683e49d072c`, branch `arena/01a107dc-system`).
**Scope:** Strictly descriptive market statistics and diagnostic evaluations on DESIGN (seeds 8001–8200) and NULL (seeds 20001–20700). LOCKED TEST seeds 6001–6200 remain closed and untouched. Real gold CSV (SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`) is read-only for Parts 5 and 6 benchmark comparisons. No detector selection or new pass/fail bars.

---

## 1. Part 0: Scored vs. Excluded Path and Observation Counts

### 1.1 Path Exclusion Rule
Consistent with Stage 3 pre-registration, any DESIGN or NULL path containing at least one candle with relative range $\frac{\text{high} - \text{low}}{\text{close}} > 0.10$ is classified as an absurd path and excluded from baseline model scoring.

### 1.2 Scored Observations
Scored weekday observations are evaluated at the close of each weekday $t$:
- Warm-up exclusion: $t < 60$.
- Blend zone exclusion: any weekday containing bars labeled `inBlend: true`.
- Boundary buffer exclusion: the first 5 weekdays after each regime transition.
Counts are tabulated separately for DESIGN TRAIN (seeds 8001–8100), DESIGN VALIDATE (seeds 8101–8200), and excluded paths.

---

## 2. Part 1: Detection Lag versus Steady-State Accuracy

Using the frozen Stage 3 detector (`Tree_depth3_k3_d0`, SHA-256 `f41a94c6f350678c83b9523ede59e06aeeecdb327a63f733a4b817c61ffc20cc`) without refitting, score DESIGN VALIDATE non-excluded paths:
- Lag buckets relative to the last true regime boundary:
  1. $[5, 10)$ weekdays
  2. $[10, 20)$ weekdays
  3. $[20, 40)$ weekdays
  4. $[40, \text{end})$ weekdays
- For each bucket, report headline balanced accuracy (macro recall over the 5 headline classes) and per-class recall. Cells with $n < 100$ observations are marked `THIN`.
- For each lag $\tau \in [1, 40]$ weekdays after a boundary, compute the proportion of boundaries where the detector already predicts the correct regime ($\hat{y}_{\text{boundary}+\tau} == \text{targetRegime}$).

---

## 3. Part 2: Absurd-Bar Sensitivity

Evaluate the frozen detector (`Tree_depth3_k3_d0`) on:
- DESIGN paths that were excluded due to absurd bars ($> 10\%$ range).
- DESIGN VALIDATE paths that were non-excluded.
Compare headline balanced accuracy and per-class recalls to evaluate whether absurd bars degrade detector accuracy.

---

## 4. Part 3: Model Capacity Ceiling

Train on non-excluded DESIGN TRAIN (seeds 8001–8100):
- **Model (a):** Multinomial Logistic Regression ($L_2$ regularization, $C \in \{0.1, 1.0, 10.0\}$ chosen on VALIDATE).
- **Model (b):** Bagged Tree Ensemble (100 decision trees, bootstrap sample with replacement, maximum depth 6, no hysteresis).
Score both models on non-excluded DESIGN VALIDATE overall and across the Part 1 lag buckets ($[5, 10), [10, 20), [20, 40), [40, \text{end})$).

**Capacity Classification Rule:**
- State **"feature-limited"** if the bagged ensemble beats the frozen detector (37.2%) by less than 3 percentage points overall AND its $[40, \text{end})$ steady-state accuracy is under 50.0%.
- Otherwise state **"model-limited"**.

---

## 5. Part 4: Per-Dial Detectability

Decompose regime classification into 3 independent dial-level 3-class tasks using the `SPEC-2b` mapping:
1. **Volatility Dial (3 classes):**
   - LOW: `quiet_range`
   - NORMAL: `normal_chop`, `trend_up`, `trend_down`
   - HIGH: `whipsaw`, `expansion_up`, `expansion_down`
2. **Drift Dial (3 classes):**
   - DOWN: `trend_down`, `expansion_down`
   - FLAT: `quiet_range`, `normal_chop`, `whipsaw`
   - UP: `trend_up`, `expansion_up`
3. **Trendiness Dial (3 classes):**
   - MEAN-REVERTING: `quiet_range`, `whipsaw`
   - RANDOM: `normal_chop`
   - TRENDING: `trend_up`, `trend_down`, `expansion_up`, `expansion_down`

Train both model families (Multinomial Logistic and Bagged Tree Ensemble) on TRAIN and evaluate on VALIDATE:
- 3-class balanced accuracy (chance baseline = 33.33%).
- Per-class recall overall and by Part 1 lag buckets.
- Pairwise/One-vs-Rest AUCs:
  - High-volatility vs. the rest (low + normal).
  - Drift-up vs. drift-down.
  - Drift-up vs. flat.

---

## 6. Part 5: Detectability Arithmetic and Real-Gold Noise Share

### 6.1 Detectability Arithmetic (Synthetic DESIGN Cohort)
For each regime:
- Planted mean daily return vs. realized mean daily return.
- Realized daily return standard deviation ($\sigma$).
- Signal-to-Noise Ratio (SNR) per $\sqrt{\text{weekday}}$: $\frac{|\Delta \mu|}{\sigma}$ relative to zero drift.
- Weekdays needed for a statistical two-tailed drift test at $z = 2.0$:
  $$N = \left(\frac{2.0 \cdot \sigma}{\Delta \mu}\right)^2$$
- Analytic AUC of a trailing-$n$ drift test for $n \in \{5, 10, 20, 40, 60\}$:
  $$\text{AUC}(n) = \Phi\left(\frac{|\Delta \mu| \sqrt{n}}{\sqrt{2} \sigma}\right)$$
- Empirical AUC of trailing-$n$ log ATR% separating low, normal, and high volatility for $n \in \{5, 10, 20, 40, 60\}$.

### 6.2 Real-Gold Noise Share Benchmark
From `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`:
- Daily return definition: end-of-day close to end-of-day close ($\ln(\text{close}_t / \text{close}_{t-1})$ across completed weekdays).
- Compute rolling 20-weekday mean daily return and its $p17$-to-$p83$ spread ($p83 - p17$).
- Compare with the spread under:
  1. IID daily return shuffle (1,000 independent shuffles).
  2. 5-day block shuffle (1,000 independent block shuffles).
- Ratio $\frac{\text{real spread}}{\text{shuffled spread}}$: If the ratio is $< 1.25$, real-gold rolling drift terciles are demonstrated to be predominantly sampling noise.

---

## 7. Part 6: Absurd-Bar Anatomy

For every candle in DESIGN and NULL where $\frac{\text{high} - \text{low}}{\text{close}} > 0.10$:
- Body share: $\frac{|\text{close} - \text{open}|}{\text{high} - \text{low}}$.
- Upper wick share: $\frac{\text{high} - \max(\text{open}, \text{close})}{\text{high} - \text{low}}$.
- Lower wick share: $\frac{\min(\text{open}, \text{close}) - \text{low}}{\text{high} - \text{low}}$.
- Time slot (slot index $0..47$).
- Active regime and overlay flags (`news_storm`, `gap_shocks`, or `none`).
- Trailing 48-bar ATR% and $\frac{\text{range}}{\text{priorClose} \cdot \text{ATR\%}}$.
- Tabulate frequency per million bars by regime and overlay.
- Compute histogram of $\frac{\text{range}}{\text{price}}$ for ranges above 3%.
- Benchmark against real gold frequency of range $> 3\%$ and $> 5\%$ per million bars.
- Identify the exact code line in `src/lib/synth-v2/generate.ts` responsible for producing these oversized candle geometries.
