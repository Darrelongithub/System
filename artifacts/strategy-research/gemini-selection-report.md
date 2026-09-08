# Gemini Prompt — Grok Substitute Experiment

**Prompt source:** scripts/gemini-trade-select-experiment.mjs SYSTEM (exact)
**Evaluator:** Grok as Gemini substitute
**Candidates:** 312
**Runs:** 3
**Decisions frozen before scoring:** yes

## Exact prompt used

```
You are a trade-quality selector for XAUUSD strategy candidates.
You receive ONE candidate at the exact entry moment. Decide TAKE or REJECT.

Rules:
- Use ONLY the provided entry-time fields.
- Do NOT assume future prices, outcomes, or realized R.
- Do NOT invent information not in the payload.
- Be consistent: similar contexts should get similar decisions.
- Reply with JSON only: {"decision":"TAKE"|"REJECT","confidence":0.0-1.0,"reason":"brief justification"}
```

## Observed behavior

### Sample baseline
n=312, R=5.990, W/L=84/228

### Results

| Metric | Value |
|--------|-------|
| TAKE | 192 |
| REJECT | 120 |
| Rejection % | 38.5% |
| Rejected losers | 96 |
| Rejected winners | 24 |
| Reject-set R | -30.383 |
| R gained by reject | 30.383 |
| Remaining-book R | 36.373 |
| Sample R | 5.990 |
| Winner-sacrifice rate | 20.0% |
| Loser-removal rate | 80.0% |

### Stability: 1.0

### Chronological split
Discovery rGained=3.60 Validation rGained=26.78

### Per strategy
- **ichimoku-tk**: n=37 REJECT 21 rejectR=-9.09 rGained=9.09
- **morning-star**: n=40 REJECT 17 rejectR=-1.18 rGained=1.18
- **williams-r-fade**: n=31 REJECT 8 rejectR=-4.06 rGained=4.06
- **pdh-retest**: n=30 REJECT 7 rejectR=-3.56 rGained=3.56
- **classic-pivot**: n=29 REJECT 6 rejectR=1.89 rGained=-1.89
- **dual-thrust**: n=29 REJECT 7 rejectR=3.37 rGained=-3.37
- **macd-cross**: n=45 REJECT 25 rejectR=-7.65 rGained=7.65
- **three-soldiers**: n=39 REJECT 19 rejectR=-5.07 rGained=5.07
- **donchian-55**: n=32 REJECT 10 rejectR=-5.02 rGained=5.02

## Primary question

- Rejection rate: **38.5%**
- Reject set materially negative R: **True** (-30.38 R)
- Remaining book vs sample: **36.37** vs **5.99**
- R gained: **30.38**

## Explicit non-actions
No production changes. B not implemented. C not enabled. A1 not activated. Prompt not retuned.
