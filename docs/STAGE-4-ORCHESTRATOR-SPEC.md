# Stage 4 Orchestrator Specification — Step 1 of 3

**Status:** Verifier-reviewed and **SIGNED as the Step 2 build contract** on 2026-11-08; the approved driver and tests are implemented under this contract. No Stage 4 run is authorized by this specification.

**Branch of record:** `arena/072665f9-system`
**Revision base tip:** `cdb9a6fba7533954344ad5ff74d5f2858c981c33`
**Frozen SHA-256:** `scripts/map-compass/frozen.mjs` = `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`
**Required historical criteriaHash:** `power-projection.json.reportOnly.criteriaHash` = `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`

## Owner authorization — recorded before orchestrator code exists

Dated **2026-11-08**, the Stage 4 orchestrator is authorized as a deliberate pre-registered component and is the **only new machinery permitted**. It consists of exactly one new driver script plus its tests. It may only wire the existing DEV segment builder, card signals, one-slot trade producer with the frozen exit harness, segmented random control, 25-cell sweep, `verifyReal` with `a8DevOnly=true`, and report generation.

It MUST NOT change `scripts/map-compass/frozen.mjs`, `verifyReal`, `lib/verification.mjs`, `lib/signals.mjs`, `lib/compass.mjs`, or any threshold, card, cost, or exit rule. The orchestrator imports and calls the frozen implementations; it never copies their logic. This authorization is dated before any orchestrator code exists. This document does not execute Stage 4.

## 1. Inputs and sealed-data boundary

### 1.1 M30 feed and Map-state alignment source

- Primary feed: `artifacts/map-compass/normalized/xauusd-m30-eat.csv`. Its normalized header is `datetime,open,high,low,close,volume` (`scripts/map-compass/normalize.mjs:26`); M2 reads timestamp plus OHLC and volume into `{datetime,o,h,l,c,v}` (`scripts/map-compass/build-map.mjs:24-35`). The driver must parse the timestamp for every row, but may parse/read OHLCV only for rows whose year is in imported `ROLES.DEV` (`scripts/map-compass/frozen.mjs:102-107`). It must not construct numeric OHLCV values for sealed-year rows.
- `splitDevSegments` needs the ordered timestamps of non-DEV rows to find gaps, so those rows may be passed only as timestamp-only `{datetime}` separators. Its implementation reads `yearOf(bar)` and slices runs; it does not access OHLCV for skipped rows (`scripts/map-compass/lib/dev-segments.mjs:16-45`). Only the resulting DEV segments, containing DEV OHLCV, are passed to `buildDevPipeline`.
- Map-state alignment source: `artifacts/map-compass/normalized/xauusd-m30-map.csv`. Its output columns are defined at `scripts/map-compass/build-map.mjs:247-261`; the driver reads **only `datetime` and `state`**. It uses these solely to assert timestamp alignment, `EXCLUDED` on sealed rows, and equality of each DEV state with the center-grid state recomputed by the segmented pipeline. It does not feed this CSV state or any feature column into signal, trade, baseline, sweep, or verdict calculations. The authoritative Stage 4 state is recomputed by `buildDevPipeline` on the DEV segment bars (`scripts/map-compass/lib/dev-pipeline.mjs:238-263`).
- The frozen `DENYLIST` columns are forbidden from every Stage 4 input and computation: `similar_swing_retrace_pct`, `similar_swing_continued_pct`, `swing_invalidated`, `similar_swing_refs`, and `swing_context_source` (`scripts/map-compass/frozen.mjs:109-116`). In particular, no Map CSV feature or role column other than the `datetime,state` alignment check is read.

### 1.2 M15 sub-bars

Read M15 bars, when available, from `artifacts/map-compass/normalized/xauusd-m15-eat.csv` (`scripts/map-compass/normalize.mjs:119-123`). For each segment, the driver's selected M15 input is bounded exactly to `[segmentStart, segmentEnd]`, inclusive; never select `segmentEnd + 15 minutes`. Every M15 bar actually used in an intrabar decision must satisfy both `yearOf(bar) in ROLES.DEV` and `segmentStart <= bar.datetime <= segmentEnd`; the `M15_SEALED_READ` assertion in §8 enforces this. The existing `m15MapForSegment` helper selects through `addMinutes(segmentEnd, 15)` and is therefore broader than this driver contract (`scripts/map-compass/lib/dev-segments.mjs:139-154`). The driver leaves that helper untouched and supplies only the union of per-segment, bounded M15 slices; before passing that union, it must exclude any timestamp that would be selected by the helper for a different segment. No out-of-segment sub-bar is handed to it or used by it. The helper can still pair the last M30 bar with its first M15 sub-bar, but the second sub-bar is intentionally unavailable under the bounded input. If the second sub-bar is unavailable, the existing conservative M30 stop-first fallback applies unchanged (`scripts/map-compass/lib/trade.mjs:74-90`). Do not interpolate, extend the map, or invent sub-bars. This is stricter input selection than the helper's default window, not a change to frozen behavior: the helper and resolver are unchanged; the driver simply withholds out-of-segment bars. The M15 feed must be ordered and unique by timestamp and must not be stitched across segments.

### 1.3 Segment definitions and input refusals

- Read, do not restate, `DEV_SEGMENT_RULE` (`scripts/map-compass/lib/dev-segments.mjs:5-14`): the four inclusive DEV year spans, warm-up, and tail are sourced from that constant and the frozen imports.
- Call `splitDevSegments(bars, ROLES.DEV)` (`scripts/map-compass/lib/dev-segments.mjs:22-45`). Splitting inspects only timestamps/year labels of non-DEV rows; their OHLCV is never parsed into feature input or passed to Map, signals, trades, random controls, aggregates, or verdicts. Assert that returned segment spans agree with `DEV_SEGMENT_RULE` and that all trade/input bars passed onward belong to `ROLES.DEV`.
- Structural timestamp refusal only: timestamps must be strictly increasing, with no duplicates and no out-of-order rows. No maximum-gap tolerance is introduced. Documented holiday gaps, including the 2005-11-23 and 2006-11-22 gaps in `docs/MAP-COMPASS-DATA-CONTRACT.md` §5 (`:158-173`), must not be rejected solely for their duration.
- Assert **both independent count families**, all with no tolerance: raw DEV M30 bars by segment `2004-2007` = 39,448; `2009-2011` = 33,862; `2013-2015` = 35,147; `2017-2018` = 23,465; total = 131,922. Separately assert eligible entry bars by segment `2004-2007` = 38,352; `2009-2011` = 32,766; `2013-2015` = 34,051; `2017-2018` = 22,369; total = 127,538. These figures are verified in `artifacts/map-compass/a8-segment-audit.json` under `bySegment[].bars`, `bySegment[].eligibleBars`, `bySegment[].byYear`, and top-level totals. Assert the arithmetic identity `totalRawBars - (MAP.warmupBars + EXIT_HARNESS.maxHoldBars) * DEV_SEGMENT_RULE.years.length === totalEligibleBars`. All four guard families—raw per-segment, raw total, eligible per-segment, eligible total—plus the identity must hold simultaneously with no tolerance.
- Also refuse malformed or unmatched M30/Map timestamps, unexpected segment spans, non-DEV rows in any pipeline segment or emitted trade, an exit or signal window that crosses a segment boundary, and an M15 mapping that crosses a segment boundary.

## 2. Call sequence and point of no return

The sole real-run invocation must be a single-use driver. Its mandatory committed outputs are `artifacts/map-compass/claimed-trades.jsonl`, `artifacts/map-compass/claim-verification.json`, `artifacts/map-compass/claim-ledger.jsonl`, and `docs/G0-STAGE4-REPORT.md`. The ledger is not gitignored, not currently tracked, and does not exist; it is created by `verifyReal` and must be committed with the other outputs. The driver imports the frozen 22-card registry `CLAIM_CARDS` (`scripts/map-compass/claim-cards.draft.mjs:124-345`; registry cardinality guard at `:469`) and explicitly imports the functions/constants below; it does not invoke the `verify-claims.mjs` CLI, whose main path does not supply the A8 options required by `verifyReal` (`scripts/map-compass/verify-claims.mjs:361-366`).

### 2.1 Ordered calls

1. **Preflight:** before computation, assert the production single-use outputs `claim-verification.json`, `claimed-trades.jsonl`, and `docs/G0-STAGE4-REPORT.md` do not exist; validate input paths/schema availability, frozen-file hash, the required `reportOnly.criteriaHash`, card registry size, and placebo artifact availability. The ledger path is append-only: never truncate/delete/rewrite/regenerate it; preserve any existing bytes and append only through `appendVerdict`. Read the placebo value from the existing calibration artifact as specified in §6; never regenerate it in Stage 4. Timestamp, segment, boundary, baseline, sweep, and row-equality assertions are evaluated as soon as their in-memory inputs exist and all must pass before the first ledger append.
2. Load the M30 timestamps and DEV OHLCV; preserve non-DEV rows as timestamp-only separators. Load the aligned Map `datetime,state` fields for comparison only. Load/segment eligible M15 sub-bars as in §1.2.
3. Call `splitDevSegments(bars, ROLES.DEV)` and assert the segment list and each segment's entry range.
4. Call **exactly**:

   ```text
   buildDevPipeline({
     bars,
     m15Bars,
     segments,
     randomSeed: RANDOM_BASELINE_SEED,
     entriesPerRandomGroup: RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE
   })
   ```

   Source: `scripts/map-compass/lib/dev-pipeline.mjs:238`. All five properties are explicit; no default argument is relied on. Consume `centerTrades`, `randomTrades`, `baseline`, `gridInputs`, `segmentMetadata`, `cardTradeSummary`, and `diagnostics` (return object: `:298-320`). `centerTrades` are the center-grid card-book trades written to the trade JSONL; random control trades stay the control input, not card records.
5. Serialize `centerTrades` in memory to the exact one-record-per-line JSONL bytes. Parse those bytes in memory and run the integrity checks, including baseline coverage, expected rows, and row determinism. Use `pipeline.gridInputs`/`pipeline.baseline` as the source of controls; do not load the legacy `random-baseline.json` as the A8 baseline.
6. Call **exactly** `sweepBattery(pipeline, runBattery)`, where `runBattery` is the named export from `scripts/map-compass/verify-claims.mjs:50` (`sweepBattery` source: `scripts/map-compass/lib/dev-pipeline.mjs:323-347`). This invokes the same battery on each `pipeline.gridInputs` entry and returns `results`, `sensitivityByClaim`, and `informationalPctByClaim`.
7. Produce the center `precomputedRows` from the exact call `runBattery(tradesFromJsonl, { windowKind: "DEV", baseline: pipeline.baseline, sensitivityByClaim: sweep.sensitivityByClaim })`. The sweep's annotated center rows also carry `sweepConfirmedCells`, `sweepCells`, and `sweepConfirmedPct`; these are report annotations, not `runBattery` output fields. Before verification, deep-compare the unannotated center rows with `precomputedRows`, after removing only those three sweep-annotation fields from each sweep row. Also independently call `runBattery` again with the same arguments and assert deep equality with `precomputedRows`. Any mismatch aborts; it is not acceptable to assume the sweep rows are verifier-identical. Compute the complete report payload in memory from these rows, sweep results, center trades, pipeline metadata, placebo input, and signal-only overlap before any permanent write.
8. After every pre-append assertion passes, write the production `artifacts/map-compass/claimed-trades.jsonl` with exclusive-create semantics; never overwrite. Then call `verifyReal` exactly as follows:

   ```text
   verifyReal(tradesPath, {
     baseline: pipeline.baseline,
     sensitivityByClaim: sweep.sensitivityByClaim,
     precomputedRows,
     a8DevOnly: true
   })
   ```

   Signature and gates: `scripts/map-compass/verify-claims.mjs:297-314`. `precomputedRows` are the deterministic `runBattery` rows just specified. `verifyReal` calls `appendVerdict` once per row (`:315-327`) and returns `rows,summary` (`:328-338`). Its ledger path is `artifacts/map-compass/claim-ledger.jsonl` (`scripts/map-compass/lib/claim-ledger.mjs:12-14`). The ledger is a mandatory committed Stage 4 output beside the trade and verification files. It is append-only and must never be truncated, deleted, rewritten, or regenerated. `appendVerdict` records `rerun` and monotonically increasing `seq` for repeated claim/kind/window keys (`lib/claim-ledger.mjs:32-48`); that visible trail is tamper evidence and must be preserved. Do not call `verifyReal` more than once. Assert its returned rows equal the prevalidated `precomputedRows` before final publication.
9. Publish `artifacts/map-compass/claim-verification.json` and the already-computed human-readable report `docs/G0-STAGE4-REPORT.md` only after `verifyReal` has appended all ledger rows and returned successfully. These, `claimed-trades.jsonl`, and the appended `claim-ledger.jsonl` are all mandatory committed outputs. No threshold or result is recomputed after the first append.

### 2.2 Point of no return

The logical **POINT OF NO RETURN is the first append to `artifacts/map-compass/claim-ledger.jsonl`**, which occurs inside `verifyReal` before `claim-verification.json` is written (`verify-claims.mjs:315-327,341-373`). From that first append onward, every ledger byte is permanent tamper evidence. If any failure occurs after the first ledger append and before final publication, report the failure, publish nothing further, do not retry, do not delete or rewrite anything, and mark the run **FAILED** in `docs/STATUS.md`. Never truncate, delete, rewrite, regenerate, or roll back the ledger. All mathematical and scope assertions must pass before the first append.

## 3. Frozen constants: read, never redeclare

The driver must import and read each item below from its listed source. It must not copy a value into a new constant table, default an omitted argument to a local substitute, or shadow it with a local value. Frozen quantities in the new script must never be numeric literals; pass the imported values explicitly. The mandated card/row-count integrity checks are structural assertions, not alternative parameter values.

| Item | Exact source | Driver rule |
|---|---|---|
| `MAP` | `scripts/map-compass/frozen.mjs:18-28` | Read for Map config/eligible warm-up; never restate its members. |
| `EXIT_HARNESS` | `scripts/map-compass/frozen.mjs:135-154` | Read for exit/tail/boundary checks; never restate its members. |
| `CLAIM_CRITERIA` | `scripts/map-compass/frozen.mjs:197-208` | Read-only provenance block in the report and by imported verifier; do not copy or shadow. |
| `ROLES` | `scripts/map-compass/frozen.mjs:102-107` | Pass `ROLES.DEV` to the segment splitter and use it for every year assertion. |
| `VERDICT_STATES` | `scripts/map-compass/frozen.mjs:47-53` | Use for report ordering and identity counts; do not declare a replacement list. |
| `RANDOM_BASELINE` | `scripts/map-compass/frozen.mjs:256-263` | Read-only legacy provenance; do not use as the A8 runtime baseline or transplant its parameters into the segmented control. |
| `SENSITIVITY_RULE` | `scripts/map-compass/frozen.mjs:236-250` | Read for report labels/grade interpretation; grading is performed by imported `sweepBattery`/`applySensitivityGrade`. |
| `SWEEP_GRID`, `CENTER_GRID_ID` | `scripts/map-compass/lib/dev-pipeline.mjs:12-19` | Import and use as supplied; do not create a local grid or center ID. |
| `RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE`, `RANDOM_BASELINE_SEED` | `scripts/map-compass/lib/dev-pipeline.mjs:20-21` | Pass explicitly to `buildDevPipeline`; do not default, replace, or shadow them. |
| `DEV_SEGMENT_RULE` | `scripts/map-compass/lib/dev-segments.mjs:5-14` | Read for segment span/eligibility assertions; do not copy the four spans. |

For the criteria guard, read the exact legacy property `artifacts/map-compass/power-projection.json.reportOnly.criteriaHash` and compare it to `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`. Do not substitute `reportOnlyV13.criteriaHash`: the report object intentionally retains an older `reportOnly` block alongside the current v1.3 block (`scripts/map-compass/lib/amend2-report.mjs:110-124`; `scripts/map-compass/lib/amend3-report.mjs:161-172`). The frozen file SHA guard is over the raw bytes of `scripts/map-compass/frozen.mjs`.

## 4. Trade-file schema

The production `claimed-trades.jsonl` contains one record per `pipeline.centerTrades` trade; each record is the object constructed by `normalizeStrategyTrade` (`scripts/map-compass/lib/dev-pipeline.mjs:41-64`). It includes the resolver's fields via `...resolved` (`scripts/map-compass/lib/trade.mjs:32-41,103-152`). No random-control records are mislabeled as card trades.

| Field | JSON type | Source expression / origin |
|---|---|---|
| `strategyId` | string | `card.id` |
| `family` | string | `card.family` |
| `priority` | number | `card.priority` |
| `side` | string (`long`/`short`) | `signal.side` |
| `session` | string | `signal.session` |
| `vol` | string | `volRegimeOf(segment.bars[signalIndex])` |
| `year` | integer | `yearOf(segment.bars[signalIndex])` |
| `day` | string (`YYYY-MM-DD`) | `bar.datetime.slice(0, 10)` |
| `entryBar` | string | `bar.datetime` |
| `entryDatetime` | string | `bar.datetime` |
| `localIndex` | integer | `signalIndex` |
| `globalIndex` | integer | `(segment.globalStart ?? 0) + signalIndex` |
| `segmentId` | string | `segment.id` |
| `segmentLength` | integer | `segment.bars.length` |
| `state` | string (`EXPANSION`, `GRIND`, `WHIPSAW`, `QUIET`, or `UNKNOWN`) | `signal.fourState ?? "UNKNOWN"` |
| `verdictState` | string or null | `signal.verdictState ?? null` |
| `outcome` | string | `resolved.outcome` (`resolveTrade`; normal kept trades are resolved, not `INVALID_ATR`) |
| `grossR` | number | `resolved.grossR` |
| `costR` | number | `resolved.costR` |
| `netR` | number | `resolved.netR` |
| `exitIndex` | integer | `resolved.exitIndex` (segment-local) |
| `exitDatetime` | string or null | `segment.bars[resolved.exitIndex]?.datetime ?? null` |
| `exitGlobalIndex` | integer | `(segment.globalStart ?? 0) + resolved.exitIndex` |
| `barsHeld` | integer | `resolved.barsHeld` |
| `exitPrice` | number | `resolved.exitPrice` |
| `ambiguousFallback` | boolean | `resolved.ambiguousFallback` |
| `entry` | number | `resolved.entry` |
| `stop` | number | `resolved.stop` |
| `target` | number | `resolved.target` |

`verifyReal` hard requirements are checked before it can append any ledger rows: `year` is in imported `ROLES.DEV`; `localIndex`, `exitIndex`, and `segmentLength` are integers; `localIndex + EXIT_HARNESS.maxHoldBars < segmentLength`; `exitIndex < segmentLength`; and `exitIndex <= localIndex + EXIT_HARNESS.maxHoldBars` (`scripts/map-compass/verify-claims.mjs:305-314`). The driver also asserts every entry is in its segment's `eligibleEntryRange`, whose start/tail come from `MAP.warmupBars` and `EXIT_HARNESS.maxHoldBars` (`scripts/map-compass/lib/dev-segments.mjs:48-52`).

## 5. Baseline, sweep, and verifier rows

- The only real-run baseline is `pipeline.baseline`, built by `baselineForGrid` for the center grid (`scripts/map-compass/lib/dev-pipeline.mjs:172-209,276-305`). It carries `a8Segmented: true`; it is assembled from the segmented pipeline's deterministic random entries. The old `artifacts/map-compass/random-baseline.json` cannot satisfy the gate because it is not the A8 segmented object; `verifyReal` checks `baseline?.a8Segmented` and throws `NO_BASELINE` otherwise (`scripts/map-compass/verify-claims.mjs:299-301`).
- `sweepBattery` returns `sensitivityByClaim` (`scripts/map-compass/lib/dev-pipeline.mjs:323-347`). Only center-grid CONFIRMED claim/kind rows receive a sensitivity grade and enter that object (`:332-345`). This non-null measured object is what satisfies `verifyReal`'s `SWEEP_NOT_RUN` gate (`scripts/map-compass/verify-claims.mjs:301`).
- The sweep grade is a **GRADE ONLY**. The frozen center `CENTER_GRID_ID` is authoritative; other cells cannot nullify or rescue its verdict (`scripts/map-compass/frozen.mjs:211-234,236-250`; `scripts/map-compass/lib/dev-pipeline.mjs:329-345`).
- Every one of the 44 card/kind rows is retained. The `NO_BASELINE` abort applies only to trades with `verdictState` equal to imported `VERDICT_STATES` (`EFFICIENT` or `CHOPPY`): if such a trade has no fine or sufficient coarse baseline cell, abort before `verifyReal`. Do not change or override the verifier's own fail-closed `NO_BASELINE` → `INCONCLUSIVE` semantics (`scripts/map-compass/lib/verification.mjs:103-120,275-283,428-445`). An UNKNOWN trade with no baseline cell is not an abort: report `NOT_APPLICABLE` with the explicit UNKNOWN trade count only; never substitute zero or fabricate a cell.

## 6. Final report layout — exact section order

The human-readable report is `docs/G0-STAGE4-REPORT.md`; its machine-readable rows are in `artifacts/map-compass/claim-verification.json`. Both are produced in the single driver execution. A non-section provenance header records imported `MAP`, `EXIT_HARNESS`, `CLAIM_CRITERIA`, `ROLES`, `VERDICT_STATES`, `RANDOM_BASELINE` (marked legacy/not used), `SENSITIVITY_RULE`, grid/center constants, A8 random-seed/count constants, input hashes, and the required criteria hash without re-declaring values. It also prints the exact DEV year list from `ROLES.DEV`, M30 input row counts by each DEV year, DEV total, timestamp-only excluded-row count, and an assertion that no sealed-year price entered any outcome computation. Tables use center-grid verdicts. Strength and weakness are never merged.

### (i) STRENGTH table, then WEAKNESS table

Separate tables with exactly these columns: **card, family, verdict state, n, gross R, cost R, net R, net t, control mean, excess R, excess t, vetoes, LOYO, year concentration, verdict, sweep grade.**

For each table row, take `n`, net mean, `tNet`, excess, excess t (`stats.t`), vetoes, LOYO, concentration, verdict and stability from the corresponding returned `verifyReal` row's `stats`/row fields. `control mean` is `stats.meanNetR - stats.excessVsRandomR`. Report gross/cost as direction-signed pooled **means** over the same `(family, verdictState)` center trades used by `runBattery`: `mean(trade.grossR * claimDirection)` and `mean(trade.costR * claimDirection)`. Net mean is `stats.meanNetR`; net and excess t values are `stats.tNet` and `stats.t`. This makes gross minus signed cost comparable to net while preserving the verifier's direction convention. Full cell year and leave-one-year-out records are section (v).

### (ii) Family-level count and separate weakness count

Following reading 2(a), count **families with at least one CONFIRMED STRENGTH claim**. Count distinct `family` values, not cards or rows. Separately label the number of `CONFIRMED WEAKNESS claims`; explicitly state that weakness confirmations do **not** count toward the family number. The blueprint says fewer than three surviving families is a kill criterion and rules out lowering the floor, softening the t-stat, or refitting costs (`docs/BLUEPRINT-v1.11.md:595-604`).

### (iii) Strength count beside placebo p95

Print `CONFIRMED STRENGTH claims: N` directly beside `placebo p95: 0`. Read the committed value from `artifacts/map-compass/harness-calibration.json` at `placebo.p95FakeConfirms`; it is **0**. This is a synthetic-calibration quantity and must not be compared with a DEV CONFIRMED count. Keep the label **synthetic-calibration figure — not a DEV result**. The property is produced by the synthetic `verify-claims.mjs --dry-run` calibration (`scripts/map-compass/verify-claims.mjs:271-289,348-358`; `scripts/map-compass/lib/placebo.mjs:64-81`). Stage 4 must not regenerate or recompute this figure.

### (iv) Per-family signal overlap — reading 2(b)

Compute on **all bars within the DEV segments** only, before trade outcomes, by calling imported `emitSignals(segment.bars, card.id, { states: segmentMap.states.map((x) => x.state), start: 0, end: segment.bars.length, include: "all" })` for each card/segment; `segmentMap` is the matching entry in `pipeline.maps`, whose states are `{state}` objects (`scripts/map-compass/lib/dev-pipeline.mjs:250-263`; `emitSignals` contract: `scripts/map-compass/lib/signals.mjs:300-355`). This follows the existing report-only overlap measurement's full-DEV-bar window (`scripts/map-compass/measure-overlap.mjs:66-108,131-156`); it does not alter the stricter eligible-entry range used for trades (`scripts/map-compass/lib/dev-segments.mjs:48-52`). Key signal bars by `(segment.id, local index)` so bars across separate segments can never collide. Report per family: each card's emitted signal-bar count; each within-family pair's shared-bar count and Jaccard; and pooled signal count, distinct bars, overlap fraction, Kish effective N, and design effect using the existing report formulas (`scripts/map-compass/measure-overlap.mjs:101-128,131-156`). This is signal overlap, not accepted-trade overlap, and never feeds or changes a verdict.

### (v) Per-year and leave-one-year-out detail per cell

For each of the 44 card/kind cells, print the returned `stats.years`, `stats.byYearNet`, `stats.leaveOneYearOut`, `stats.concentration`, and `stats.loyoPositivePct`. Preserve nulls and missing years as null/absent; do not manufacture zero estimates. These are returned by `verifyClaim` (`scripts/map-compass/lib/verification.mjs:346-403`). On a successful run, report the eligible-cell NO_BASELINE count and match levels from `stats.baseline.missing`, `missingFraction`, `matchLevels`, and related vetoes (the required preflight abort means such missing eligible trades must be zero on a published result). Report UNKNOWN baseline status as **NOT_APPLICABLE**, with counts only; never create a zero baseline or fabricated cell. The provenance header also prints the DEV-only input row counts and zero-sealed-outcome assertion.

### (vi) UNKNOWN entries and per-card book identities

For each card, count accepted center-book trades by `verdictState` as EFFICIENT, CHOPPY, or UNKNOWN (where `verdictState === null`); report count and UNKNOWN share. For UNKNOWN trades lacking a baseline, report **NOT_APPLICABLE** and the count only; do not report a zero baseline or fabricate a baseline cell. Show the identity **EFFICIENT + CHOPPY + UNKNOWN = total book** on every card row. Total is the accepted one-slot card book (`pipeline.centerTrades`/`cardTradeSummary`), not raw signal emissions or slot-rejected candidates (`scripts/map-compass/lib/dev-pipeline.mjs:66-99,298-320`).

### (vii) 25-cell sweep table per card per kind, and grade

Print every grid cell from imported `SWEEP_GRID`, for every card and both claim kinds, using `sweep.results`; include grid id/ER/ATR values, verdict, and CONFIRMED indicator. Show the center as authoritative. Show the grade from the returned center row only when that center row is CONFIRMED; otherwise `NOT_APPLICABLE`. The sensitivity proportion is the count of CONFIRMED cells divided by the imported grid length, as calculated by `sweepBattery`; do not recompute or optimize it (`scripts/map-compass/lib/dev-pipeline.mjs:323-347`).

### (viii) Claim-versus-routing statement

Include verbatim: **“Stage 4 measures CLAIMS, not ROUTING. It does not depend on the routing fix.”** No route table, routing decision, or Compass behavior is measured or changed by this run.

### (ix) Kill-criterion evaluation — reading 2(a)

State the distinct confirmed-strength-family count, compare it with the preregistered minimum of three surviving families, and state **KILL CRITERION MET** if fewer than three families have at least one CONFIRMED STRENGTH claim; otherwise state **KILL CRITERION NOT MET**. A confirmed weakness never increases this count. No new machinery or remedy is proposed by this report.

## 7. Dry-inspection checklist — Step 3 mode

A future `--dry-run` mode must not call `verifyReal`, `appendVerdict`, or any ledger writer; must not write `claim-verification.json`; and must not write verdicts. It may write **only** `artifacts/map-compass/stage4-dry/claimed-trades.dry.jsonl` and `artifacts/map-compass/stage4-dry/inspection.json`. These paths are separate from all production single-use paths, are retained and committed as Step 3 evidence, and neither satisfy nor trip the production single-use guard. A dry-run test must assert that `artifacts/map-compass/claim-ledger.jsonl` is not created. The inspection must be checkable from those files alone and contain:

1. year → trade-count table, with total row equal to the JSONL record count;
2. count of entries in sealed/HOLDOUT/VAL/STRESS years — exactly zero;
3. per-segment eligible entry range and count of trades outside it — exactly zero;
4. minimum and maximum of `localIndex - eligibleStart` and `segmentLength - exitIndex`;
5. count and share of M30 bars lacking a second M15 sub-bar under the bounded `[segmentStart, segmentEnd]` rule, per segment and total; report the share as missing-second-sub-bar M30 bars divided by all M30 bars in that segment, so fallback availability is visible;
6. `barsHeld` distribution and maximum;
7. per-card trade count;
8. per-card long, short, and total counts, with long + short = total;
9. per-card UNKNOWN count and share; UNKNOWN baseline status is `NOT_APPLICABLE`, counts only;
10. per-card per-verdict-state trade count and mean net R, including UNKNOWN;
11. `sum(year-row counts) === trade record count` and per-card state identity `EFFICIENT + CHOPPY + UNKNOWN = total book`;
12. SHA-256 of the exact trade JSONL bytes.

Dry inspection is not a rehearsal of verdicts and may not write a baseline verdict, sweep verdict, report verdict, claim ledger row, ledger file, or claim-verification artifact.

## 8. Abort assertions and exact errors

Every listed assertion is a pre-write gate. Before the first permanent output write, the driver must evaluate the complete in-memory trade stream, the serialized JSONL round trip, baseline and sweep, card/row counts, hashes, file guards, and precomputed-row equality. A failure uses exactly the message template shown and creates no permanent output file. Dynamic values in braces are interpolated from the offending data. Do not suppress or convert a hard failure to a warning.

| Condition | Exact error message |
|---|---|
| Any card-trade year is outside `ROLES.DEV` | `STAGE4_ABORT[NON_DEV_YEAR]: trade year {year} is outside ROLES.DEV` |
| Any entry has `localIndex < MAP.warmupBars` in its segment | `STAGE4_ABORT[ENTRY_BEFORE_WARMUP]: segment={segmentId} localIndex={localIndex} warmupBars={MAP.warmupBars}` |
| Any entry has fewer than `EXIT_HARNESS.maxHoldBars` bars remaining (equivalently `localIndex + maxHoldBars >= segmentLength`) | `STAGE4_ABORT[INSUFFICIENT_SEGMENT_TAIL]: segment={segmentId} localIndex={localIndex} segmentLength={segmentLength} maxHoldBars={EXIT_HARNESS.maxHoldBars}` |
| Any signal, feature, trade, M15 pair, or exit reads across a segment boundary; or any returned trade violates its segment-local boundary | `STAGE4_ABORT[SEGMENT_CROSSING]: segment={segmentId} localIndex={localIndex} exitIndex={exitIndex}` |
| Any M15 bar actually used has a year outside `ROLES.DEV` or a datetime outside the segment in which it is used | `STAGE4_ABORT[M15_SEALED_READ]: segment={segmentId} datetime={datetime} year={year}` |
| Raw DEV M30 bars in a segment differ from its expected count (`2004-2007`: 39448; `2009-2011`: 33862; `2013-2015`: 35147; `2017-2018`: 23465) | `STAGE4_ABORT[SEGMENT_BAR_COUNT]: segment={segmentId} expected={expectedCount} actual={n}` |
| Total raw DEV M30 bars differ from 131922 | `STAGE4_ABORT[DEV_TOTAL_BAR_COUNT]: expected=131922 actual={n}` |
| Eligible entry bars in a segment differ from its expected count (`2004-2007`: 38352; `2009-2011`: 32766; `2013-2015`: 34051; `2017-2018`: 22369) | `STAGE4_ABORT[SEGMENT_ELIGIBLE_COUNT]: segment={segmentId} expected={expectedEligible} actual={n}` |
| Total eligible entry bars differ from 127538 | `STAGE4_ABORT[DEV_TOTAL_ELIGIBLE_COUNT]: expected=127538 actual={n}` |
| Raw/eligible totals fail `rawTotal - (MAP.warmupBars + EXIT_HARNESS.maxHoldBars) * DEV_SEGMENT_RULE.years.length === eligibleTotal` | `STAGE4_ABORT[DEV_ELIGIBILITY_IDENTITY]: raw={rawTotal} excluded={excludedTotal} eligible={eligibleTotal}` |
| Any verdict-eligible trade has no fine or sufficient coarse baseline cell (`matchedBaseline(...).missing`) | `STAGE4_ABORT[NO_BASELINE]: strategyId={strategyId} state={state} side={side} session={session} vol={vol} year={year}` |
| `CLAIM_CARDS.length !== 22` | `STAGE4_ABORT[CARD_COUNT]: expected 22 cards, got {actual}` |
| Center `runBattery` does not produce exactly `CLAIM_CARDS.length * 2` rows (44 when card count is valid) | `STAGE4_ABORT[ROW_COUNT]: expected {expected} center rows, got {actual}` |
| `artifacts/map-compass/power-projection.json.reportOnly.criteriaHash` differs from the required exact hash | `STAGE4_ABORT[CRITERIA_HASH]: expected 788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6, got {actual}` |
| SHA-256 of raw `scripts/map-compass/frozen.mjs` differs from the required exact hash | `STAGE4_ABORT[FROZEN_HASH]: expected 67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22, got {actual}` |
| `artifacts/map-compass/claim-verification.json` already exists | `STAGE4_ABORT[OUTPUT_EXISTS]: artifacts/map-compass/claim-verification.json already exists; Stage 4 is single-use` |
| `artifacts/map-compass/claimed-trades.jsonl` already exists | `STAGE4_ABORT[OUTPUT_EXISTS]: artifacts/map-compass/claimed-trades.jsonl already exists; Stage 4 is single-use` |
| `docs/G0-STAGE4-REPORT.md` already exists | `STAGE4_ABORT[OUTPUT_EXISTS]: docs/G0-STAGE4-REPORT.md already exists; Stage 4 is single-use` |
| Precomputed center rows differ from the exact `runBattery` output as specified in §2.1 | `STAGE4_ABORT[PRECOMPUTED_ROWS_MISMATCH]: precomputed rows differ from runBattery output` |

The driver must additionally refuse missing inputs, malformed CSV/JSON, timestamp misalignment, duplicate/out-of-order timestamps, unexpected segments, missing placebo calibration, missing `.reportOnly.criteriaHash`, and an invalid DEV-only assertion before any permanent write. Stable error strings for these input failures must be fixed in Step 2 tests before the one-time run. `verifyReal` also retains its own guards and exact existing errors (`scripts/map-compass/verify-claims.mjs:297-314`); those checks are not bypassed.

**Pre-append guarantee:** all Stage 4-specific assertions above must be performed against in-memory objects/serialized bytes before creating the production trade file and before invoking `verifyReal`. The production trade file is exclusive-create and never overwritten. `verifyReal` appends to the ledger internally; its first append is the PNR. If any failure occurs after that append and before final publication, follow §2.2 exactly: report failure, publish nothing further, do not retry, do not delete or rewrite anything, preserve and commit the ledger trail, and mark the run FAILED in `docs/STATUS.md`.

## 9. What must not change

The sole new machinery is one driver script and its tests. It may only wire the existing DEV segment builder, card signals, one-slot trade producer with frozen exit harness, segmented random control, 25-cell sweep, `verifyReal(..., {a8DevOnly: true})`, and report. It must not alter or copy the logic of `scripts/map-compass/frozen.mjs`, `verifyReal`, `scripts/map-compass/lib/verification.mjs`, `scripts/map-compass/lib/signals.mjs`, `scripts/map-compass/lib/compass.mjs`, or any threshold, card, cost, exit, criterion, routing path, or prior artifact. Imports and direct calls only; no parallel implementation of Map, signal, trade, baseline, sweep, or verdict behavior.

No npm script is added. The signed contract scopes the driver and tests; it does not authorize a Stage 4 execution.

## 10. Closed questions and count-mapping resolution

The six prior questions are closed by verifier review and the rulings now applied in §§1.3, 1.2, 5, 7, and 8: structural timestamps only with no maximum-gap tolerance; bounded M15 selection plus `M15_SEALED_READ`; NO_BASELINE scope limited to EFFICIENT/CHOPPY verdict-eligible trades while UNKNOWN is NOT_APPLICABLE; the exact retained dry-run paths; first ledger append as PNR with the specified FAILED/no-retry/no-delete response; and UNKNOWN baseline counts only. In particular, the M15 ruling is **CLOSED**: selection is inclusive `[segmentStart, segmentEnd]`, never `segmentEnd + 15`, the helper remains unchanged, the conservative fallback remains unchanged, and the inspection reports missing second-sub-bar counts.

**Count-mapping resolution:** the earlier mismatch was a verifier interpretation error: the lower figures are eligible entry bars, not total DEV bars. `artifacts/map-compass/a8-segment-audit.json` `bySegment` and `byYear` data agree with both count families. Raw DEV bars sum to 131,922; warm-up plus tail exclusions are `(MAP.warmupBars + EXIT_HARNESS.maxHoldBars) * DEV_SEGMENT_RULE.years.length` = 4,384; eligible entry bars sum to 127,538. The four guard families and the arithmetic identity are now separately specified in §§1.3 and 8 and must all hold simultaneously without tolerance.
