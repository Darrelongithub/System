# Synth V2 Stage 2c — pre-registered specification

**Frozen date:** 2026-10-04. This specification must be hashed and recorded before any Stage 2c generator change is evaluated or any Stage 2c synthetic path is generated. The pre-registered gates, settings, calibration mapping protocol, and tolerances below are fixed and may not be adjusted post hoc.

## 1. Provenance and Scope

- Source: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`, expected SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`. Stop before calibration or generation if it differs.
- Timestamps: Interpreted as fixed EAT wall-clock (UTC+03:00) without timezone shifting.
- Worktree scope: Only `src/lib/synth-v2/`, `tests/synth-v2*`, and `scripts/synth-v2-*` may be edited. Analyzer, engine, strategies, UI, and `src/lib/synth/` remain untouched.
- Evaluation scope: Market statistics only. No strategy trades, R, P&L, or detector output.
- Locked test discipline: Never open, parse, or statistically inspect price data of any LOCKED seed (6001–6200). LOCKED TEST paths are generated and hashed only.
- In-flight persistence: Every path's canonical and compressed SHA-256 hash is appended and flushed to disk immediately upon generation, ensuring crash-resilience.

## 2. Incorporation of Stage 2b Specification

`src/lib/synth-v2/SPEC-2b.md` is incorporated unchanged for:
- Window length: $W = 20$ eligible EAT weekdays (weekdays with at least 24 bars).
- Primary statistics: Wilder ATR(14) percentage (arithmetic mean of ATR/priorClose across the window), Drift (mean daily log-return), VR8, and VR16.
- Quantile conventions: Linear interpolation at $(n - 1) \cdot p$. Terciles: LOW $< p_{33}$, NORMAL $p_{33}$ to $p_{67}$, HIGH $> p_{67}$.
- Tercile-median placement: Planted targets are $p_{17}$ for LOW, $p_{50}$ for NORMAL, and $p_{83}$ for HIGH.
- Fixed checks:
  - **C1 (coverage):** Synthetic intended-tercile window share compared against the real 60-weekday stretch persistence ceiling. Pass when $|\text{share} - \text{ceiling}| \le 0.15$. Flagged `TOO CLEAN` ($> +0.15$) or `TOO NOISY` ($< -0.15$). Marked `THIN` if real ceiling qualifying stretches $n < 15$.
  - **C2 (calibration):** Normalized median error $(\text{realized median} - \text{planted}) / (p_{83} - p_{17}) \in [-0.25, +0.25]$.
  - **C3 (ordering):** Pooled realized medians satisfy strict $\text{LOW} < \text{NORMAL} < \text{HIGH}$.
  - Regime status: `DEGRADED` if any assessable C1, any C2, or any C3 fails.
- Path construction rules:
  - DESIGN: 3–6 non-repeating segments, log-uniform lengths 20–80 eligible weekdays, 48–200 bar blends. Overlays selected with $p = 0.25$ per segment, contiguous 2–5 weekdays outside blends.
  - NULL: Single-regime 140 eligible weekdays, overlays off, no blends.
  - LOCKED TEST: Same path rules as DESIGN, generated and hashed only.
  - Additive daily-knot wobble: Bounded by $\pm 10\%$ of p83–p17 width in dial units.
- Separability: Evaluated on DESIGN only, 48 completed causal bars/returns, sampled every 4th non-blend bar starting at bar index 61. Best oriented single-feature AUC $\ge 0.60$; pairs $< 0.60$ are `INSEPARABLE`.

## 3. Pre-registered New Gates (G9, G10, G11) and Preserved Gates (G1–G8, D1)

Evaluated on the base model at its default normal setting pooled over 20 seeds $\times$ 120 weekdays (seeds 1–20, start date 2026-01-05).
Tolerance rule for G1–G5, G7, G9: The wider of $\pm 20\%$ around the full real estimate or inside the real 120-weekday moving-window bootstrap 95% CI (300 replicates).

### G9: Window-level ATR% (Non-overlapping $W=20$ Weekday Windows)
- Pool: $20 \text{ seeds} \times 6 \text{ windows} = 120$ non-overlapping windows.
- Statistic: Arithmetic mean of Wilder ATR(14)/priorClose for each 20-weekday window.
- Real full benchmark ($N = 86$ non-overlapping windows):
  - **Median:** 0.0017587 (0.17587%). Bootstrap 95% CI: [0.0013633, 0.0032075]. Tolerance: [0.0013633, 0.0032075].
  - **p10:** 0.0013707 (0.13707%). Bootstrap 95% CI: [0.0011009, 0.0025748]. Tolerance: [0.0010966, 0.0025748].
  - **p90:** 0.0030414 (0.30414%). Bootstrap 95% CI: [0.0015713, 0.0046823]. Tolerance: [0.0015713, 0.0046823].

### G10: Volatility Persistence
- Statistic: Pearson correlation of $\log(\text{ATR}\%)$ between consecutive non-overlapping 20-weekday windows ($5 \text{ pairs/path} \times 20 \text{ paths} = 100 \text{ pairs}$).
- Real full benchmark ($N = 85$ consecutive pairs): 0.59070.
- Tolerance: Within $\pm 0.15$ absolute of real ($[0.44070, 0.74070]$) or inside the real bootstrap 95% CI ($[-0.64695, 0.84713]$), whichever is wider: $[-0.64695, 0.84713]$.

### G11: Invariant Integrity
- Statistic: Zero invalid bars across 5,000 generated paths spanning all 7 regimes, overlays, blends, and extreme dial settings.
- Requirement: Exactly 0 invalid bars (100.0% valid positive OHLC, $0 < \text{low} \le \min(\text{open}, \text{close}) \le \max(\text{open}, \text{close}) \le \text{high}$, finite, valid half-hour timestamps).

### Preserved Gates: G1–G8 and D1
- G1: Return kurtosis / ATR.
- G2: Absolute return ACF at lags 1, 6, 48.
- G3: Candle geometry (mean range / ATR, body share, upper/lower wick shares).
- G4: Gap frequency, median gap / ATR, p95 gap / ATR.
- G5: 4-hour EAT block intraday range shares.
- G6: Variance ratios VR8 and VR16 ($\pm 0.05$ absolute).
- G7: Daily range / ATR (median and p90).
- G8: Reference invariants, exact determinism, engine CSV parser round-trip.
- D1: Five single-dial sensitivity responses.
All G1–G8 and D1 gates must pass under their existing pre-registered definitions and tolerances.

## 4. Pre-registered Structural Changes (Part C)

Budget: Exactly ONE change per defect (two in total). No per-bin, per-regime, or post-hoc patches.

### C-1: Monotone Dial-Response Mapping for Volatility
- If the default normal setting passes G9 and G10, the base generator's slow volatility structure is left untouched, and only the dial mapping layer is updated.
- Calibration protocol:
  - Separate calibration seeds: 91001–91200 (200 seeds), completely disjoint from all validation cohorts (DESIGN 8001–8200, NULL 20001–20700, LOCKED 6001–6200).
  - Grid of `volatilityLevel` dial settings across the operational range ($[0.00030, 0.00200]$).
  - Compute realized median $W=20$ window ATR% across the calibration seeds for each dial setting.
  - Invert the strictly monotone empirical response curve via piecewise linear interpolation to determine the exact dial values $V(\text{target})$ corresponding to the real $W=20$ ATR% targets:
    - $\text{LOW} = V(p_{17})$
    - $\text{NORMAL} = V(p_{50})$
    - $\text{HIGH} = V(p_{83})$
    - Auxiliary bounds: $V(p_{5})$ and $V(p_{95})$.
  - Dial wobble width: Set to $V(p_{83}) - V(p_{17})$ in dial units.
  - Extrapolation flag: Evaluates `volatilityLevel` against $[V(p_{5}), V(p_{95})]$.
  - Drift and VR8/VR16 controls remain unmapped as they showed no units mismatch in Stage 2b.

### C-2: Generator Invariant Defect Fix at Root Cause
- Root cause: In `generatePathWithSchedule` (`generate.ts`), the lower wick subtraction $\min(\text{open}, \text{close}) - \text{wickTotal} \cdot (1 - \text{upperFraction})$ is unconstrained arithmetic subtraction. When large return innovations couple with small body shares and dominant lower wick shares, the arithmetic lower wick exceeds $\min(\text{open}, \text{close})$, driving `low` $\le 0$. The generator asserted `low > 0` and aborted.
- Root-cause fix: In `generate.ts`, strictly enforce the price positivity boundary condition by flooring `low` at the minimum price tick (0.01 cent):
  $\text{low} = \max(0.01, \text{roundToCent}(\min(\text{open}, \text{close}) - \text{wickTotal} \cdot (1 - \text{upperFraction})))$.
  This guarantees $0 < 0.01 \le \text{low} \le \min(\text{open}, \text{close})$ without catching and skipping.
- Regression test: Added to the test suite, reproducing the exact invariant crash condition on debug seed 90135 and verifying zero invalid bars.

## 5. Seed Allocation and Cohort Rules (Part D)

- **DESIGN:** Seeds 8001–8200 (200 paths).
- **NULL:** Seeds 20001–20700 (700 paths; 100 per regime in frozen order: `quiet_range`, `normal_chop`, `trend_up`, `trend_down`, `whipsaw`, `expansion_up`, `expansion_down`).
- **LOCKED TEST:** Seeds 6001–6200 (200 paths, complete at 200, generate and hash only; never open or parse price data).
- **Rebuild Audit:** 20 pre-listed DESIGN/NULL paths selected deterministically by Fisher-Yates with `createRandom(20261004, "stage2c-rebuild-audit")`.
- Resumable disk flushing: Each path's SHA-256 hash is immediately appended to `STAGE2C-SHA256SUMS.txt`.
- Output tables: Per-regime, per-statistic pass table, and a dedicated "vol-free pass" column reporting whether each regime passes C1–C3 on drift and VR8/VR16 alone. Degraded outcomes are reported without repair.
