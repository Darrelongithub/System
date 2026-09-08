# Strategy Failure Analysis Report

**Control:** A2-only · Filter C OFF · Filter B not implemented · A1 OFF  
**Baseline:** 2387 triggers · 2383 resolved · **+508.164319 R** · WR 32.27%

Golden artifacts on disk: **untouched**.

---

## A. Strategies with clearest recurring failure mechanisms

| Strategy | n | W/L | Total R | Exp | Clearest negative pattern |
|----------|---|-----|---------|-----|---------------------------|
| dual-thrust | 171 | 61/109 | 40.44 | 0.238 | london (R=-5.91, n=37) |
| macd-cross | 397 | 136/260 | 74.01 | 0.187 | highVol (R=-7.20, n=73) |
| pdh-retest | 127 | 43/84 | 20.62 | 0.162 | doji (R=-3.33, n=17) |
| williams-r-fade | 390 | 128/262 | 114.91 | 0.295 | C (R=-8.00, n=8) |
| three-soldiers | 402 | 136/265 | 69.47 | 0.173 | london (R=-9.80, n=41) |
| morning-star | 373 | 115/258 | 77.62 | 0.208 | extremeVol (R=-2.38, n=42) |
| classic-pivot | 141 | 44/97 | 31.12 | 0.221 | C (R=-6.00, n=6) |
| ichimoku-tk | 202 | 59/142 | 32.61 | 0.162 | highVol (R=-14.29, n=50) |
| donchian-55 | 184 | 47/137 | 47.37 | 0.257 | htfConflict (R=-5.60, n=10) |

### Notes by strategy

**dual-thrust** (n=171, R=40.44)
- Worst: london R=-5.9 n=37; counterTrend R=-0.0 n=76
- Best context: highVol R=12.0; htfConflict R=9.1

**macd-cross** (n=397, R=74.01)
- Worst: highVol R=-7.2 n=73; extremeVol R=-3.8 n=35; B R=-3.0 n=10
- Best context: counterTrend R=46.0; htfConflict R=28.1

**pdh-retest** (n=127, R=20.62)
- Worst: doji R=-3.3 n=17; C R=-1.1 n=8; extremeVol R=-0.2 n=21
- Best context: tight_sl R=4.6; wide_sl R=3.4

**williams-r-fade** (n=390, R=114.91)
- Worst: C R=-8.0 n=8
- Best context: counterTrend R=50.0; highVol R=29.1

**three-soldiers** (n=402, R=69.47)
- Worst: london R=-9.8 n=41; B R=-3.5 n=7; doji R=-3.3 n=62
- Best context: wide_sl R=33.6; counterTrend R=14.7

**morning-star** (n=373, R=77.62)
- Worst: extremeVol R=-2.4 n=42; doji R=-0.6 n=16; B R=-0.2 n=12
- Best context: counterTrend R=29.2; emaStackConflict R=22.8

**classic-pivot** (n=141, R=31.12)
- Worst: C R=-6.0 n=6
- Best context: highVol R=23.2; tight_sl R=20.8

**ichimoku-tk** (n=202, R=32.61)
- Worst: highVol R=-14.3 n=50; B R=-8.0 n=8; london R=-7.2 n=23
- Best context: wide_sl R=15.7; counterTrend R=12.9

**donchian-55** (n=184, R=47.37)
- Worst: htfConflict R=-5.6 n=10; C R=-3.0 n=8
- Best context: counterTrend R=11.1; london R=9.7

---

## B. Failure taxonomy

| Cause class | Evidence in this dataset |
|-------------|--------------------------|
| **Regime/context** | C (counterTrend+extremeVol) R=−24.2; B (htfConflict+highVol) R=−17.3; emaStackConflict+highVol R=−43.2 |
| **Entry quality** | Strategy-specific; no single candle flag with large negative R alone (doji alone is **+15.9R**) |
| **SL placement** | wide_sl alone not strongly negative; tight_sl+highVol mild (−2.5R) |
| **TP/exit design** | Not isolated as a standalone filterable feature (fixed RR targets by design) |
| **Timing/session** | London alone **+19.3R** — cosmetic WR filter only |
| **Noise** | Many hour buckets, single wick flags — unstable or positive R |

---

## C. Patterns capable of improving absolute R

| Pattern | n | W/L | Hit R | rGained | Disc stable? | Val stable? |
|---------|---|-----|-------|---------|--------------|-------------|
| counterTrend | 624+436 | — | — | disc -89.3 / val -82.4 | no | no |
| htfConflict | 165+84 | — | — | disc -43.0 / val -30.3 | no | no |
| highVol | 303+158 | — | — | disc -41.4 / val -19.7 | no | no |
| extremeVol | 155+83 | — | — | disc -22.3 / val 3.9 | no | yes |
| C | 59+32 | — | — | disc -0.4 / val 24.6 | no | yes |
| B | 36+11 | — | — | disc 6.3 / val 11.0 | yes | yes |
| london | 192+155 | — | — | disc -17.7 / val -1.6 | no | no |
| doji | 136+91 | — | — | disc -0.2 / val -15.8 | no | no |
| emaStackConflict | 484+342 | — | — | disc -9.1 / val -57.0 | no | no |
| wide_sl | 130+84 | — | — | disc -50.5 / val -19.7 | no | no |

**Prioritized for later experiments (not implemented now):**
1. Filter C — already coded, default OFF
2. Filter B — evaluated, not implemented (small val n)
3. emaStackConflict+highVol — large full-sample gain but needs OOS discipline (risk of overlap with C/B)

---

## D. Cosmetic traps (higher WR / lower quality if filtered)

| Pattern | n | WR | **Total R of hits** | Verdict |
|---------|---|-----|---------------------|---------|
| London session | 347 | 28.0% | **+19.3** | Filtering destroys R |
| Doji | 227 | 29.1% | **+16.0** | Filtering destroys R |
| EMA stack conflict alone | 826 | 29.2% | **+66.2** | Filtering destroys R |
| High vol alone | 461 | 29.9% | **+61.1** | Filtering destroys R |

---

## E. Controlled experiments deserved later

1. Enable Filter C (opt-in already exists)
2. Filter B (after more OOS mass)
3. Optional: emaStackConflict+highVol as separate one-change test
4. **No** SL/TP/entry math changes without dedicated A/B experiment

---

## F–H. Gemini interface

See `gemini-testing-report.md`.

Dataset: `gemini-test-dataset.jsonl` (312 candidates).
