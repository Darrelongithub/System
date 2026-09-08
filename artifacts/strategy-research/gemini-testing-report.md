# Gemini Testing Report

## Purpose
Test whether an LLM selector can **TAKE / REJECT** individual strategy triggers using **entry-time context only**, without rewriting strategy logic.

## Control
A2-only baseline. Strategies unchanged. Filters B/C not applied to the candidate stream (Gemini sees post-strategy PASS candidates).

## G. Exact information Gemini receives
- `tradeId`
- `strategyId`
- `strategy`
- `datetime`
- `side`
- `entry`
- `sl`
- `tp`
- `plannedRr`
- `open`
- `high`
- `low`
- `close`
- `body`
- `range`
- `bodyPct`
- `upperWickPct`
- `lowerWickPct`
- `doji`
- `atr`
- `atrPrev`
- `atrPercentile`
- `highVol`
- `extremeVol`
- `volRegime`
- `ema20`
- `ema50`
- `ema200`
- `emaStackBull`
- `emaStackBear`
- `emaStackConflict`
- `localTrend`
- `h1`
- `h4`
- `d1`
- `htfConflict`
- `htfAgree`
- `counterTrend`
- `session`
- `hour`
- `vsPdh`
- `vsPdl`
- `priorHigh`
- `priorLow`
- `priorClose`
- `risk`
- `atrMultRisk`
- `spread`
- `ohlcAround`

Plus a short natural-language system prompt enforcing no future data.

## H. Explicitly forbidden (look-ahead)
- realizedR
- outcome
- resolutionDatetime
- future OHLC
- future ATR
- eventual TP/SL hit
- any bar with index > entry index

## Dataset
- File: `gemini-test-dataset.jsonl`
- Size: 312 candidates (stratified ~22/strategy + all B/C regime hits)
- Each row: `{ input: {...}, _scoringOnly: { outcome, realizedR } }`
- **Never** pass `_scoringOnly` to the model

## Placeholder harness (not Gemini)
Deterministic regime rejector used to validate the pipeline:

```
{
  "note": "Placeholder is a deterministic regime rejector, NOT a trained LLM. Interface matches Gemini contract.",
  "sampleSize": 312,
  "takeN": 184,
  "rejectN": 128,
  "takeR": 41.42409690907584,
  "rejectR": -35.43442649825466,
  "rIfRejectsDropped": 41.42409690907584,
  "rGainedByRejects": 35.43442649825466,
  "rejectWins": 25,
  "rejectLosses": 103,
  "resultsPath": "artifacts/strategy-research/gemini-placeholder-results.jsonl"
}
```

Interpretation: placeholder rejects are net **negative R** (rGained positive), so the *interface* can surface useful rejects when the rule is regime-based. A real LLM must beat this without outcome leakage.

## Prompt contract (research)

```
You are a trade selector. You see one candidate at entry time only.
Decide TAKE or REJECT.
You must NOT use or assume any future price, outcome, or realised R.
Base the decision only on the provided entry-time context fields.
Reply JSON: { "decision": "TAKE"|"REJECT", "confidence": 0-1, "reason": "..." }
```

## Next step (not this phase)
Wire real Gemini API with the same schema; score against `_scoringOnly` offline; chronological train/test split on decisions.
