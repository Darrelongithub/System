# Analyzer integration boundary

The module is deliberately standalone. It does not patch `src/lib/analyzer`, register a strategy, alter analyzer defaults, or run the strategy engine during generation or D7-style scenario validation.

## Product mode

The user-facing **Map Generator** is registered at `/map-generator` by `src/routes/map-generator.tsx` and linked from the home control panel. Its page exposes the 17 registered scenarios, seed/path/calendar controls, volatility/drift/trendiness/shape/gap/news/shock dials, a price/regime-map preview, and two downloads: engine-ready OHLC CSV and a datetime-aligned regime-label JSON sidecar. It calls `generateSynthetic()` and `toCsv()` only; it does not call `runThroughEngine()` or report strategy outcomes. The UI source still contains the pre-repair summary (26/32 and six old hourly misses); the latest attempt-3 report is 28/32 with EAT 05:00, 16:00, 17:00, and 19:00 outside tolerance. UI files were left untouched because they are outside this task's permitted scope. Generated maps are not described as realism-certified.

## Types and public entry points

```ts
import {
  calibrate,
  generateSynthetic,
  runThroughEngine,
  toCsv,
  type Candle,
  type CalibrationProfile,
  type RegimeLabel,
  type SynthConfig,
  type SyntheticResult,
} from "./src/lib/synth/index.ts";
```

- `Candle` is the generator's minimal `{ datetime, open, high, low, close }` value object. It is intentionally not the analyzer's enriched `src/lib/analyzer/types.ts#Candle`.
- `calibrate(realCandles: Candle[]): CalibrationProfile` is pure and performs no file access. It recomputes Wilder ATR(14) from OHLC and rejects unsorted, duplicate, malformed, or geometrically invalid input instead of silently changing it.
- `generateSynthetic(config: SynthConfig, seed: number, profile?: CalibrationProfile): SyntheticResult` uses the bundled `DEFAULT_PROFILE` when the optional profile is omitted. It returns `candles`, one `RegimeLabel` per candle, and deterministic `meta`.
- `toCsv(candles)` validates and emits the analyzer's metadata + CSV boundary in EAT.
- `runThroughEngine(candles)` is a **separate runner-only adapter**. It calls the existing `runAnalysis()` with `seriesEndsComplete: true` and returns its `tradePasses`. It is not called by `generateSynthetic`, calibration, or the D1/D7 market-statistics checks.

## Exact analyzer input contract

The analyzer API is `runAnalysis(text: string, options?: RunOptions)`, not a raw `Candle[]` function. `parseCsv()` reads a CSV text document whose first non-empty line contains JSON metadata. Four metadata fields are required: `data_age`, `spread_convention`, `atr_method`, and `similar_swing_selection_rule`. The header is matched by column **name**, and these six columns are required:

```text
datetime,open,high,low,close,is_reliable
```

The timestamps are unzoned EAT wall-clock strings (`YYYY-MM-DD HH:mm:ss`); the repo contract interprets unlabelled values as UTC+03:00. In the calibrated archive, section markers say `(UTC)` while `data_age` says `EAT`; that conflict is reported and no timestamp shift is applied. `toCsv()` writes EAT wall-clock strings, sets `is_reliable=true`, and does not write an `atr_30m` column.

### ATR override warning

`src/lib/analyzer/pivots.ts#atrSeries()` implements Wilder ATR(14) when it has to calculate ATR locally. However, it first uses a parsed `candle.atr30m` when present. `parseCsv()` maps CSV `atr_30m` into that field. The supplied archive metadata describes a **simple rolling mean** ATR and includes `atr_30m`; the analyzer would consume that supplied value on the raw archive instead of falling back to Wilder. Synthetic profile calibration follows the requested fallback definition: Wilder ATR(14) is recomputed from OHLC. Synthetic CSV intentionally omits `atr_30m` so a separate `runAnalysis()` call follows its Wilder fallback.

Do not add a precomputed ATR field to synthetic CSV unless you deliberately want the analyzer to override its fallback. If a future adapter does add it, its formula and warm-up behavior must be explicit and covered by a separate boundary test.

## Example: generate, export, optionally run once

```ts
const synthetic: SyntheticResult = generateSynthetic(
  {
    scenario: "range_breakout",
    pathLengthTradingDays: 120,
  },
  20261001,
);

const csvText = toCsv(synthetic.candles);
// Save / inspect csvText in an I/O layer outside the core module.

// Optional and intentionally separate: this computes analyzer trade output.
// Do not call this from generator validation or the D7 scenario-seed loop.
const engine = runThroughEngine(synthetic.candles);
if (!engine.ok) throw new Error(engine.error);
console.log(engine.trades.length);
```

## Profile updates and local files

For new local bars, pass the CSV paths in chronological file order to the scripts. `synth-inspect.ts` reports per-file spans/hashes, duplicates, chronology, timestamp gaps, column names, metadata, prices, years, and file seams. It does not sort, deduplicate, fill, or normalize. `synth-calibrate.ts` also preserves argument order and stops if a seam is non-increasing; inspect and resolve a seam explicitly before calibration. Neither script fetches data. The current source CSV remains on `main` rather than in this branch; see `README.md` for the non-branch-switching `git show` command.

Rerunning calibration updates both `profile.json` and its static `profile-default.ts` mirror. The core imports that static value; it never reads the profile from disk. Keep the JSON and embedded TypeScript profile in sync by using the script rather than editing either manually.

## Extension points

1. **Input adapter:** add a separate parser adapter for a new local CSV vendor, but preserve its original timestamps and report seams/timezone before passing OHLC to `calibrate()`.
2. **Calendar:** the current profile selects its most frequent exact weekly slot template and reports up to five repeated alternatives; generation uses the primary template only. A future change to sample multiple templates must retain raw timestamps and be tested against the fixed D1 gate. Do not imply an observed holiday from a multi-day gap unless the source establishes it.
3. **Regime statistics:** if an independent, price-only regime definition is registered, add its duration distribution to calibration. The current source has no ground-truth regime labels, so sequence lengths follow the task's fixed 20–60-day bounds.
4. **Spread data:** if genuine historical spread observations become available, replace the event-bar `spreadMult` assumption with an independently calibrated spread model. Current `spreadMult` is label-only and does not move OHLC.
5. **Alternative resampler:** any change to block length or trendiness-selection metric must be documented and rerun against the fixed D1–D7 criteria on the complete requested archive; do not tune to strategy trades.
