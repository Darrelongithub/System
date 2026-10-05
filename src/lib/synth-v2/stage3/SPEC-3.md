# Specification — Synth V2, Stage 3: Planted-Regime Detector (Market Statistics Only)

**Status:** Pre-registered before training, tuning, or evaluating any detector model.
**Parent:** Stage 2c (`SPEC-2c.md`, SHA-256 `9eea82c1c902043fb64f4caa52a32524255b165f67f0cacf092ae52aa21c380b`, commit `f640c4d13cb528177c36a104313187d9b7ef0719`).
**Scope:** Market statistics only. Pure synthetic gold planted regimes. No strategy trades, R, P&L, or real-data detector evaluation. Real gold data is referenced strictly for benchmark comparison of extreme bar geometry.

---

## 1. Regimes and Scope

### 1.1 Headline Regimes (Primary Evaluation)
Per the owner's rule, regimes that are TOO CLEAN (easier than real gold in drift or persistence) are excluded from headline evaluation. TOO NOISY regimes remain:
1. `normal_chop` (NORMAL vol, NORMAL drift, NORMAL trend)
2. `trend_up` (NORMAL vol, HIGH drift, HIGH trend)
3. `whipsaw` (HIGH vol, NORMAL drift, LOW trend)
4. `expansion_up` (HIGH vol, HIGH drift, HIGH trend)
5. `expansion_down` (HIGH vol, LOW drift, HIGH trend)

### 1.2 Excluded Regimes (Reported Separately in Secondary Tables)
1. `quiet_range` (drift TOO CLEAN +18.2 pp)
2. `trend_down` (drift TOO CLEAN +15.4 pp, VR16 C2 fail)

### 1.3 Scope Caveat
Normal and low volatility regimes are TOO NOISY on ATR% (window ATR% in the intended tercile is 20–55% vs real ceilings of 66–83%). 2c separability used 48-bar features only. Passing Stage 3 demonstrates only that the detector can identify planted regimes in synthetic gold. It makes no claims about real gold.

---

## 2. Cohorts and Splits

### 2.1 Cohorts
- **DESIGN (seeds 8001–8200, 200 paths):** Multi-segment paths (140 weekdays) with overlays and daily wobble.
  - **TRAIN:** seeds 8001–8100 (100 paths).
  - **VALIDATE:** seeds 8101–8200 (100 paths).
- **NULL (seeds 20001–20700, 700 paths):** 100 paths per regime, single-regime 140 weekdays, overlays off.
  - **NULL-SELECT:** First 50 paths per regime (seeds 20001–20050, 20101–20150, ..., 20601–20650; 350 paths total). Used for tuning false-switch rate.
  - **NULL-FINAL:** Last 50 paths per regime (seeds 20051–20100, 20151–20200, ..., 20651–20700; 350 paths total). Held out until final evaluation of pass bar D-3.
- **LOCKED TEST (seeds 6001–6200, 200 paths):** Complete 200 paths. Never opened, generated, or scored until Part 4 after all code and model weights are frozen and pushed. Run exactly once.

### 2.2 Path Exclusion Rule
Any DESIGN or NULL path containing an absurd bar with range above 10% of price ($\frac{\text{high} - \text{low}}{\text{close}} > 0.10$) is excluded from model scoring and listed explicitly.
For LOCKED TEST, because generator metadata does not expose bar range without decompressing prices, all 200 paths are scored, and the DESIGN frequency is reported.

---

## 3. Scoring Protocol and Ground Truth

### 3.1 Scoring Unit
The scoring unit is the detector state at the end of each weekday $t \in [0, T-1]$.
At the close of weekday $t$, the detector observes all bars up to the end of weekday $t$ (strictly past bars, no lookahead) and assigns an estimated regime state $\hat{y}_t \in \{0, \dots, 6\}$.

### 3.2 Exclusions from Accuracy Scoring
- **Warm-up:** The first 60 weekdays of every path ($t < 60$) are excluded from all scoring.
- **Blend zones:** Any weekday containing bars within a regime transition blend zone is excluded from accuracy scoring and training.
- **Boundary buffer:** The first 5 weekdays after each regime boundary are excluded from accuracy scoring (detection delay is evaluated separately under D-2).
- **Overlays:** Weekdays with active `news_storm` or `gap_shocks` episodes stay in scoring.

---

## 4. Features (Causal, Past Bars Only)

At the end of each weekday $t \ge 60$, 12 features are extracted strictly from bars occurring at or before the end of weekday $t$:
1. `log_atr_5`: $\ln(\text{mean Wilder ATR\% over trailing 5 weekdays})$
2. `log_atr_20`: $\ln(\text{mean Wilder ATR\% over trailing 20 weekdays})$
3. `log_atr_60`: $\ln(\text{mean Wilder ATR\% over trailing 60 weekdays})$
4. `drift_z_10`: Trailing 10-weekday daily return drift $z$-score: $\frac{\bar{r}_{10}}{s_{10} / \sqrt{10}}$
5. `drift_z_20`: Trailing 20-weekday daily return drift $z$-score: $\frac{\bar{r}_{20}}{s_{20} / \sqrt{20}}$
6. `drift_z_60`: Trailing 60-weekday daily return drift $z$-score: $\frac{\bar{r}_{60}}{s_{60} / \sqrt{60}}$
7. `vr8_20`: Variance ratio at horizon $q=8$ over 30-min log returns across trailing 20 weekdays.
8. `vr16_20`: Variance ratio at horizon $q=16$ over 30-min log returns across trailing 20 weekdays.
9. `vr8_60`: Variance ratio at horizon $q=8$ over 30-min log returns across trailing 60 weekdays.
10. `vr16_60`: Variance ratio at horizon $q=16$ over 30-min log returns across trailing 60 weekdays.
11. `max_range_atr_5`: Maximum single-bar $(\text{high} - \text{low}) / (\text{close} \cdot \text{ATR\%})$ over trailing 5 weekdays.
12. `max_gap_atr_5`: Maximum inter-day or weekend gap $|\ln(\text{open}_i / \text{close}_{i-1})| / \text{ATR\%}_{i-1}$ over trailing 5 weekdays.

### 4.1 Feature Standardization
Each feature is standardized as $z_j = \frac{x_j - \mu_j}{\sigma_j}$ using means $\mu_j$ and standard deviations $\sigma_j$ estimated strictly on DESIGN TRAIN (seeds 8001–8100, excluding warm-up and blends).

---

## 5. Model Variants and Selection

### 5.1 Variant Candidates
- **Variant 1 (V1):** Multinomial Logistic Regression on all 7 regimes with $L_2$ regularization parameter $C \in \{0.1, 1, 10\}$. Output probabilities $P(Y=c \mid x_t)$ via softmax. Raw prediction $\hat{y}_t = \arg\max_c P(Y=c \mid x_t)$.
- **Variant 2 (V2):** V1 with hysteresis. The detector remains in state $S_{t-1}$ unless a candidate state $c^* = \arg\max_{c \ne S_{t-1}} P(Y=c \mid x_t)$ satisfies:
  $$P(Y=c^* \mid x_t) \ge P(Y=S_{t-1} \mid x_t) + d$$
  for $K$ consecutive weekdays, with grid search over $d \in \{0, 0.1, 0.2\}$ and $K \in \{1, 3, 5\}$.
- **Variant 3 (V3):** Multi-class Decision Tree of depth $\le 3$ trained on TRAIN (Gini impurity), combined with the identical hysteresis grid $(K, d)$.

### 5.2 Selection Criterion
Among all evaluated candidate variants, select the model achieving the highest balanced accuracy on headline regimes on DESIGN VALIDATE (seeds 8101–8200), subject to:
$$\text{False-switch rate on NULL-SELECT (headline regimes)} \le 0.05 \text{ switches per scored weekday}$$

---

## 6. Baselines
- **B1 (Majority Class):** Predict the most prevalent class in DESIGN TRAIN.
- **B2 (Placebo):** Circularly shift each path's predicted detector state sequence by a random uniform integer offset $\delta \in [10, T - 10]$. 1,000 independent shifts. Record pooled balanced accuracy per shift and compute the 95th percentile.
- **B3 (Naive Benchmark):** Decision tree of depth 2 trained on TRAIN using only `{drift_z_20, log_atr_20}`.

---

## 7. Pass Bars on LOCKED TEST (Headline Regimes)

All four bars must pass on the held-out LOCKED TEST cohort (seeds 6001–6200):
- **D-1 (Balanced Accuracy):**
  $$\text{Balanced Accuracy} \ge 0.40 \quad \text{AND} \quad \text{Balanced Accuracy} \ge \text{B3} + 0.03 \quad \text{AND} \quad \text{Balanced Accuracy} > \text{95th percentile of B2}$$
- **D-2 (Detection Delay):**
  For every boundary transitioning into a headline regime:
  - Detection occurs on the first weekday $t$ at which the detector holds the target regime for $\ge 5$ consecutive weekdays.
  - Median delay across all detected headline boundaries $\le 10$ weekdays.
  - At least $80\%$ of headline boundaries must be detected before the segment ends.
- **D-3 (False Switches on NULL-FINAL):**
  Mean state switches per scored weekday on headline regimes $\le 0.05$.
- **D-4 (Per-class Recall):**
  Recall $\ge 0.25$ for each of the 5 headline classes (`normal_chop`, `trend_up`, `whipsaw`, `expansion_up`, `expansion_down`).

---

## 8. Governance and Reproducibility
- Detector code, feature computation, standardized parameters, and chosen hyperparameters are committed and pushed prior to evaluating LOCKED TEST.
- LOCKED TEST price series are generated in memory and scored exactly once.
- Any failure on D-1, D-2, D-3, or D-4 results in a final verdict of FAIL.
