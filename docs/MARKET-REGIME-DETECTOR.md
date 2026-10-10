# Market Regime Detector

A deterministic, configurable TypeScript OHLCV regime detector lives in
`src/lib/regime-detector/`. It is integrated into Map Generator and the
Auto-Backtester. The batch API emits one causal feature row and committed regime
per input bar; no model is fit on the complete sample.

## Usage

```ts
import { detectRegimes } from "@/lib/regime-detector";

const result = detectRegimes(bars, {
  hysteresisBars: 3,
  evaluationFrequency: 1,
  atrReferenceMethod: "median",
  lookbacks: {
    distribution: 50,
    hurst: 50,
    autocorrelation: 50,
    varianceRatio: 50,
    trueRangePercentile: 50,
    rangePercentile: 50,
    atrReference: 50,
  },
  thresholds: {
    trendAdxMin: 20,
    trendEfficiencyMin: 0.28,
    highVolatilityPercentile: 0.85,
  },
  enabledFeatures: { volume: true, distribution: true },
});

const latest = result.points.at(-1);
console.log(latest?.regime, latest?.confidence, latest?.drivers);
console.log(result.changes); // full causal feature snapshot at each committed change
```

`bars` is an ascending array of `{ timestamp, open, high, low, close, volume? }`.
Timestamps may be parseable date-time strings or epoch milliseconds. Prices must
be finite and satisfy OHLC geometry. Missing volume is accepted as `null` or
omitted; malformed OHLC, negative volume, duplicate timestamps, and out-of-order
input fail explicitly instead of being silently repaired.

## Results and features

- `points[i]` aligns exactly with input bar `i`. It contains the committed
  `regime`, raw `candidateRegime`, rule-support `confidence`, candidate score,
  top `drivers`, pending hysteresis state, `changed`, and `features`.
- `changes` contains every committed change, including `from`, `to`, timestamp,
  confidence, drivers, and a complete feature snapshot for the change bar.
- Numeric feature maps are keyed by their actual period. For example,
  `features.adx[14]`, `features.atr[20]`, `features.smaDistancePct[50]`, and
  `features.efficiencyRatio[30]`. Warm-up or mathematically undefined values are
  `null`, not `NaN` or `Infinity`.
- Regimes are `bullish-trend`, `bearish-trend`, `range`, `high-volatility`,
  `compression`, and `transition`. `confidence` is a transparent rule-support
  score in `[0,1]`, **not** a calibrated probability.

The default feature set includes raw OHLCV/time; Wilder ADX/DI and ADX slopes;
close regression slopes; SMA/EMA values, distances and pairwise alignment;
causally confirmed swing HH/HL/LH/LL counts and structure; Kaufman ER; Wilder
ATR and ATR percent/baseline; realized, Parkinson and Garman–Klass volatility;
Bollinger/Keltner widths; true-range and candle-range percentile/relative
measures; volatility of volatility; rolling Hurst, return autocorrelations and
variance ratio; candle body/wicks/overlap/directional streaks; volume SMA/ratio,
spike z-score, OBV slope and up/down volume; return skew, excess kurtosis,
quantiles/IQR; and regime duration/change age.

Percent conventions: `atrPercent` and MA distance fields are percentages
(`1.2` means 1.2%); return/realized-volatility fields are decimals;
`trueRangePercentile`, `rangePercentile`, and compression/expansion percentile
fields are fractions in `[0,1]`; candle overlap is in `[0,100]`. Volatility
estimators are per bar and not annualized, so daily and intraday data work without
an assumed number of bars per year.

Default signal/history windows center on 20–60 bars, while the requested 100/200
moving averages and 100-bar true-range rank naturally remain unavailable until
enough history exists. Pass extra warm-up bars when those long features are
needed. Lookbacks can be overridden independently; feature groups can be disabled
with `enabledFeatures` (`trend`, `efficiency`, `volatility`, `persistence`,
`candleGeometry`, `volume`, `distribution`). Raw OHLCV and regime context are
always retained.

## Rule classifier and walk-forward behavior

The defaults are conservative, configurable thresholds: trend uses ADX, ER,
normalized slope, MA alignment and DI/swing direction; range uses low ADX/ER,
flat alignment and overlap; high volatility uses an upper-tail true-range rank
plus a relative range shock or elevated ATR; compression requires multiple
low-range/low-ATR signals; ambiguous/insufficient evidence is `transition`.
High-volatility/compression are evaluated before directional trend so a volatile
trend is not mislabeled as an ordinary trend. See `DEFAULT_REGIME_THRESHOLDS`
in `config.ts` for the complete rule defaults.

All rolling windows include the current bar and preceding bars only. Confirmed
swing points use right-side candles only once those candles have closed, and the
feature is assigned to its confirmation bar—not backfilled to the pivot. The
batch algorithm processes the series in chronological order and is itself a
walk-forward evaluation; `detectRegimesWalkForward` is an explicit alias with a
per-bar callback. `evaluationFrequency` controls how often hysteresis is
sampled, while features and candidate scores are still emitted for every bar.
A switch is committed after `hysteresisBars` consecutive sampled candidates
agree. `barsInCurrentRegime` is one-based; `barsSinceLastRegimeChange` is zero on
the change bar.

The implementation is deterministic and rule-based. Optional HMM/GMM/K-means
state fitting is intentionally not included: it would add model-training and
state-label stability assumptions beyond the causal rule baseline.

## Existing UI integration

- **Map Generator:** generated OHLC can be analyzed and re-analyzed from the
  map controls. The map toggles between planted ground-truth labels and detected
  causal regimes, shows current confidence/top drivers, and allows click/arrow
  inspection of individual bars. Synthetic maps do not provide volume, so volume
  features are correctly unavailable.
- **Auto-Backtester:** the detector runs once on the same chronological series
  through the selected `To` date, with warm-up history before `From`. Any extra
  bars fetched only for TP/SL resolution are excluded from the detector input.
  Confirmed changes and their feature snapshots appear in the UI/log and are
  exported as `market_regime_changes.json` in the ZIP (or downloaded separately).
  Evaluation frequency, lookback, hysteresis, and detector enablement are
  configurable per run. Detector failure is reported without corrupting the
  strategy backtest.

The detector does not automatically filter or alter strategy trades; use its
labels as an explicit, separately validated research dimension before making a
strategy decision depend on them.
