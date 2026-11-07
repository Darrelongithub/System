# Stage 4 Orchestrator Specification — Step 1 of 3

**Status:** Document-only specification and pre-code owner authorization, dated 2026-11-08. No Stage 4 run is authorized by this specification. The driver and its tests are future Step 2 work only after this specification is reviewed.

**Branch of record:** `arena/072665f9-system`
**Baseline tip:** `5a70fbf478c0e4cd9b423073fa379dffae87652f`
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

If M15 bars are available, read them from `artifacts/map-compass/normalized/xauusd-m15-eat.csv`, produced by normalization alongside the M30 feed (`scripts/map-compass/normalize.mjs:119-123`). Parse timestamps to establish year/order, but parse high/low only for M15 records whose timestamps fall in a DEV segment and whose own year is in `ROLES.DEV`; do not pass sealed-year OHLC to the mapper. The resolver's intrabar ordering reads M15 high/low values only when both sub-bars exist (`scripts/map-compass/lib/trade.mjs:71-90,155-165`). M15 records are associated with their M30 segment by `m15MapForSegment(segment.bars, m15Bars)`; that helper filters by segment start through `addMinutes(segmentEnd, 15)` and pairs bars at the M30 timestamp and timestamp + 15 minutes (`scripts/map-compass/lib/dev-segments.mjs:132-154`). Missing either M15 sub-bar retains the existing conservative M30 stop-first fallback; the driver must not invent or interpolate sub-bars (`scripts/map-compass/lib/trade.mjs:74-90`). The M15 feed must be ordered and unique by timestamp and must not be stitched across segments.

### 1.3 Segment definitions and input refusals

- Read, do not restate, `DEV_SEGMENT_RULE` (`scripts/map-compass/lib/dev-segments.mjs:5-14`): the four inclusive DEV year spans, warm-up, and tail are sourced from that constant and the frozen imports.
- Call `splitDevSegments(bars, ROLES.DEV)` (`scripts/map-compass/lib/dev-segments.mjs:22-45`). Splitting inspects only timestamps/year labels of non-DEV rows; their OHLCV is never parsed into feature input or passed to Map, signals, trades, random controls, aggregates, or verdicts. Assert that returned segment spans agree with `DEV_SEGMENT_RULE` and that all trade/input bars passed onward belong to `ROLES.DEV`.
- Refuse duplicate timestamps, descending/out-of-order or non-contiguous input under the approved source-calendar rule, malformed or unmatched M30/Map timestamps, unexpected segment spans, non-DEV rows in any pipeline segment or emitted trade, an exit or signal window that crosses a segment boundary, and an M15 mapping that crosses a segment boundary.
- The precise source-calendar definition of “non-contiguous” must be resolved before Step 2. The repository documents ordinary market/holiday gaps as well as material holes (`docs/MAP-COMPASS-DATA-CONTRACT.md:158-173`), but does not define one universal acceptable-gap threshold for this Stage 4 input. The ambiguity is listed in §10; no gap tolerance is invented here.

## 2. Call sequence and point of no return

The sole real-run invocation must be a single-use driver. It imports the frozen 22-card registry `CLAIM_CARDS` (`scripts/map-compass/claim-cards.draft.mjs:124-345`; registry cardinality guard at `:469`) and explicitly imports the functions/constants below; it does not invoke the `verify-claims.mjs` CLI, whose main path does not supply the A8 options required by `verifyReal` (`scripts/map-compass/verify-claims.mjs:361-366`).

### 2.1 Ordered calls

1. **Preflight:** before computation, assert the two permanent output paths do not exist; validate input paths/schema availability, frozen-file hash, the required `reportOnly.criteriaHash`, card registry size, and placebo artifact availability. Read the placebo value from the existing calibration artifact as specified in §6; never regenerate it in Stage 4. Timestamp, segment, boundary, baseline, sweep, and row-equality assertions are evaluated as soon as their in-memory inputs exist and all must pass before the first permanent write.
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
8. After every pre-write assertion passes, write the production `artifacts/map-compass/claimed-trades.jsonl` with exclusive-create semantics; never overwrite. Then call `verifyReal` exactly as follows:

   ```text
   verifyReal(tradesPath, {
     baseline: pipeline.baseline,
     sensitivityByClaim: sweep.sensitivityByClaim,
     precomputedRows,
     a8DevOnly: true
   })
   ```

   Signature and gates: `scripts/map-compass/verify-claims.mjs:297-314`. `precomputedRows` are the deterministic `runBattery` rows just specified. `verifyReal` itself appends ledger records (`:315-327`) and returns `rows,summary` (`:328-338`). Do not call it more than once. Assert its returned rows equal the prevalidated `precomputedRows` before publication.
9. Atomically publish `artifacts/map-compass/claim-verification.json` and the already-computed human-readable report `docs/G0-STAGE4-REPORT.md` as the final result publication. No threshold or result is recomputed after publication.

### 2.2 Point of no return

For the public result artifacts, the point of no return is the atomic publication of `claim-verification.json` (the report is published as part of that same final publication step). The permanent `claimed-trades.jsonl` is also single-use and is never overwritten, deleted, regenerated, or used for a second run. Important: existing `verifyReal` appends the ledger before it returns, while `claim-verification.json` is written by its caller afterward (`verify-claims.mjs:315-327,341-373`). Therefore the ledger is an earlier irreversible side effect, not literally after the report PNR. The required failure/atomicity policy for an I/O or ledger failure in that interval is unresolved; see §10. All mathematical and scope assertions must pass before the first permanent write.

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
- Every one of the 44 card/kind rows is retained. If an eligible verdict-cell trade has no matched baseline, report the exact missing count and match levels from `row.stats.baseline` and `row.stats.vetoes`; never substitute zero (`scripts/map-compass/lib/verification.mjs:103-120,275-283,428-445`). Whether this condition must abort the entire run, rather than be reported as the frozen `NO_BASELINE` / `INCONCLUSIVE` outcome, is an open issue in §10 because §8's requested abort wording conflicts with the existing fail-closed verifier behavior.

## 6. Final report layout — exact section order

The human-readable report is `docs/G0-STAGE4-REPORT.md`; its machine-readable rows are in `artifacts/map-compass/claim-verification.json`. Both are produced in the single driver execution. A non-section provenance header records imported `MAP`, `EXIT_HARNESS`, `CLAIM_CRITERIA`, `ROLES`, `VERDICT_STATES`, `RANDOM_BASELINE` (marked legacy/not used), `SENSITIVITY_RULE`, grid/center constants, A8 random-seed/count constants, input hashes, and the required criteria hash without re-declaring values. It also prints the exact DEV year list from `ROLES.DEV`, M30 input row counts by each DEV year, DEV total, timestamp-only excluded-row count, and an assertion that no sealed-year price entered any outcome computation. Tables use center-grid verdicts. Strength and weakness are never merged.

### (i) STRENGTH table, then WEAKNESS table

Separate tables with exactly these columns: **card, family, verdict state, n, gross R, cost R, net R, net t, control mean, excess R, excess t, vetoes, LOYO, year concentration, verdict, sweep grade.**

For each table row, take `n`, net mean, `tNet`, excess, excess t (`stats.t`), vetoes, LOYO, concentration, verdict and stability from the corresponding returned `verifyReal` row's `stats`/row fields. `control mean` is `stats.meanNetR - stats.excessVsRandomR`. Report gross/cost as direction-signed pooled **means** over the same `(family, verdictState)` center trades used by `runBattery`: `mean(trade.grossR * claimDirection)` and `mean(trade.costR * claimDirection)`. Net mean is `stats.meanNetR`; net and excess t values are `stats.tNet` and `stats.t`. This makes gross minus signed cost comparable to net while preserving the verifier's direction convention. Full cell year and leave-one-year-out records are section (v).

### (ii) Family-level count and separate weakness count

Following reading 2(a), count **families with at least one CONFIRMED STRENGTH claim**. Count distinct `family` values, not cards or rows. Separately label the number of `CONFIRMED WEAKNESS claims`; explicitly state that weakness confirmations do **not** count toward the family number. The blueprint says fewer than three surviving families is a kill criterion and rules out lowering the floor, softening the t-stat, or refitting costs (`docs/BLUEPRINT-v1.11.md:595-604`).

### (iii) Strength count beside placebo p95

Print `CONFIRMED STRENGTH claims: N` directly beside `placebo p95: P`. Read `P` exactly from `artifacts/map-compass/harness-calibration.json` at `placebo.p95FakeConfirms`; the property is produced by the synthetic `verify-claims.mjs --dry-run` calibration (`scripts/map-compass/verify-claims.mjs:271-289,348-358`; `scripts/map-compass/lib/placebo.mjs:64-81`). Label it **synthetic-calibration figure — not a DEV result**. Stage 4 must not regenerate or recompute this figure.

### (iv) Per-family signal overlap — reading 2(b)

Compute on **all bars within the DEV segments** only, before trade outcomes, by calling imported `emitSignals(segment.bars, card.id, { states: segmentMap.states.map((x) => x.state), start: 0, end: segment.bars.length, include: "all" })` for each card/segment; `segmentMap` is the matching entry in `pipeline.maps`, whose states are `{state}` objects (`scripts/map-compass/lib/dev-pipeline.mjs:250-263`; `emitSignals` contract: `scripts/map-compass/lib/signals.mjs:300-355`). This follows the existing report-only overlap measurement's full-DEV-bar window (`scripts/map-compass/measure-overlap.mjs:66-108,131-156`); it does not alter the stricter eligible-entry range used for trades (`scripts/map-compass/lib/dev-segments.mjs:48-52`). Key signal bars by `(segment.id, local index)` so bars across separate segments can never collide. Report per family: each card's emitted signal-bar count; each within-family pair's shared-bar count and Jaccard; and pooled signal count, distinct bars, overlap fraction, Kish effective N, and design effect using the existing report formulas (`scripts/map-compass/measure-overlap.mjs:101-128,131-156`). This is signal overlap, not accepted-trade overlap, and never feeds or changes a verdict.

### (v) Per-year and leave-one-year-out detail per cell

For each of the 44 card/kind cells, print the returned `stats.years`, `stats.byYearNet`, `stats.leaveOneYearOut`, `stats.concentration`, and `stats.loyoPositivePct`. Preserve nulls and missing years as null/absent; do not manufacture zero estimates. These are returned by `verifyClaim` (`scripts/map-compass/lib/verification.mjs:346-403`). Include a distinct NO_BASELINE detail for each cell: `stats.baseline.missing`, `missingFraction`, `matchLevels`, and the exact related vetoes; never conceal or relabel a missing match. The provenance header also prints the DEV-only input row counts and zero-sealed-outcome assertion.

### (vi) UNKNOWN entries and per-card book identities

For each card, count accepted center-book trades by `verdictState` as EFFICIENT, CHOPPY, or UNKNOWN (where `verdictState === null`); report count and UNKNOWN share. Show the identity **EFFICIENT + CHOPPY + UNKNOWN = total book** on every card row. Total is the accepted one-slot card book (`pipeline.centerTrades`/`cardTradeSummary`), not raw signal emissions or slot-rejected candidates (`scripts/map-compass/lib/dev-pipeline.mjs:66-99,298-320`).

### (vii) 25-cell sweep table per card per kind, and grade

Print every grid cell from imported `SWEEP_GRID`, for every card and both claim kinds, using `sweep.results`; include grid id/ER/ATR values, verdict, and CONFIRMED indicator. Show the center as authoritative. Show the grade from the returned center row only when that center row is CONFIRMED; otherwise `NOT_APPLICABLE`. The sensitivity proportion is the count of CONFIRMED cells divided by the imported grid length, as calculated by `sweepBattery`; do not recompute or optimize it (`scripts/map-compass/lib/dev-pipeline.mjs:323-347`).

### (viii) Claim-versus-routing statement

Include verbatim: **“Stage 4 measures CLAIMS, not ROUTING. It does not depend on the routing fix.”** No route table, routing decision, or Compass behavior is measured or changed by this run.

### (ix) Kill-criterion evaluation — reading 2(a)

State the distinct confirmed-strength-family count, compare it with the preregistered minimum of three surviving families, and state **KILL CRITERION MET** if fewer than three families have at least one CONFIRMED STRENGTH claim; otherwise state **KILL CRITERION NOT MET**. A confirmed weakness never increases this count. No new machinery or remedy is proposed by this report.

## 7. Dry-inspection checklist — Step 3 mode

A future `--dry-run` mode must not call `verifyReal`, `appendVerdict`, or any ledger writer; must not write `claim-verification.json`; and must not write verdicts. It may write **only** a dry-run trade JSONL and its inspection report. The inspection must be checkable from those files alone and contain:

1. year → trade-count table, with total row equal to the JSONL record count;
2. count of entries in sealed/HOLDOUT/VAL/STRESS years — exactly zero;
3. per-segment eligible entry range and count of trades outside it — exactly zero;
4. minimum and maximum of `localIndex - eligibleStart` and `segmentLength - exitIndex`;
5. `barsHeld` distribution and maximum;
6. per-card trade count;
7. per-card long, short, and total counts, with long + short = total;
8. per-card UNKNOWN count and share;
9. per-card per-verdict-state trade count and mean net R, including UNKNOWN;
10. `sum(year-row counts) === trade record count` and per-card state identity `EFFICIENT + CHOPPY + UNKNOWN = total book`;
11. SHA-256 of the exact trade JSONL bytes.

The dry-run path must be separate from the permanent `artifacts/map-compass/claimed-trades.jsonl` path so inspection cannot consume the single-use production guard. The exact dry-run filenames/location and cleanup/retention policy require owner confirmation before Step 2; see §10. Dry inspection is not a rehearsal of verdicts and may not write a baseline verdict, sweep verdict, report verdict, claim ledger row, or claim-verification artifact.

## 8. Abort assertions and exact errors

Every listed assertion is a pre-write gate. Before the first permanent output write, the driver must evaluate the complete in-memory trade stream, the serialized JSONL round trip, baseline and sweep, card/row counts, hashes, file guards, and precomputed-row equality. A failure uses exactly the message template shown and creates no permanent output file. Dynamic values in braces are interpolated from the offending data. Do not suppress or convert a hard failure to a warning.

| Condition | Exact error message |
|---|---|
| Any card-trade year is outside `ROLES.DEV` | `STAGE4_ABORT[NON_DEV_YEAR]: trade year {year} is outside ROLES.DEV` |
| Any entry has `localIndex < MAP.warmupBars` in its segment | `STAGE4_ABORT[ENTRY_BEFORE_WARMUP]: segment={segmentId} localIndex={localIndex} warmupBars={MAP.warmupBars}` |
| Any entry has fewer than `EXIT_HARNESS.maxHoldBars` bars remaining (equivalently `localIndex + maxHoldBars >= segmentLength`) | `STAGE4_ABORT[INSUFFICIENT_SEGMENT_TAIL]: segment={segmentId} localIndex={localIndex} segmentLength={segmentLength} maxHoldBars={EXIT_HARNESS.maxHoldBars}` |
| Any signal, feature, trade, M15 pair, or exit reads across a segment boundary; or any returned trade violates its segment-local boundary | `STAGE4_ABORT[SEGMENT_CROSSING]: segment={segmentId} localIndex={localIndex} exitIndex={exitIndex}` |
| Any verdict-eligible trade has no fine or sufficient coarse baseline cell (`matchedBaseline(...).missing`) | `STAGE4_ABORT[NO_BASELINE]: strategyId={strategyId} state={state} side={side} session={session} vol={vol} year={year}` |
| `CLAIM_CARDS.length !== 22` | `STAGE4_ABORT[CARD_COUNT]: expected 22 cards, got {actual}` |
| Center `runBattery` does not produce exactly `CLAIM_CARDS.length * 2` rows (44 when card count is valid) | `STAGE4_ABORT[ROW_COUNT]: expected {expected} center rows, got {actual}` |
| `artifacts/map-compass/power-projection.json.reportOnly.criteriaHash` differs from the required exact hash | `STAGE4_ABORT[CRITERIA_HASH]: expected 788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6, got {actual}` |
| SHA-256 of raw `scripts/map-compass/frozen.mjs` differs from the required exact hash | `STAGE4_ABORT[FROZEN_HASH]: expected 67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22, got {actual}` |
| `artifacts/map-compass/claim-verification.json` already exists | `STAGE4_ABORT[OUTPUT_EXISTS]: artifacts/map-compass/claim-verification.json already exists; Stage 4 is single-use` |
| `artifacts/map-compass/claimed-trades.jsonl` already exists | `STAGE4_ABORT[OUTPUT_EXISTS]: artifacts/map-compass/claimed-trades.jsonl already exists; Stage 4 is single-use` |
| Precomputed center rows differ from the exact `runBattery` output as specified in §2.1 | `STAGE4_ABORT[PRECOMPUTED_ROWS_MISMATCH]: precomputed rows differ from runBattery output` |

The driver must additionally refuse missing inputs, malformed CSV/JSON, timestamp misalignment, duplicate/out-of-order timestamps, unexpected segments, missing placebo calibration, missing `.reportOnly.criteriaHash`, and an invalid DEV-only assertion before any permanent write. Stable error strings for these input failures must be fixed in Step 2 tests before the one-time run. `verifyReal` also retains its own guards and exact existing errors (`scripts/map-compass/verify-claims.mjs:297-314`); those checks are not bypassed.

**Pre-write guarantee:** all Stage 4-specific assertions above must be performed against in-memory objects/serialized bytes before creating the permanent trade file. The two permanent result paths use exclusive create/atomic publication and are never overwritten. There is a known technical limit: `verifyReal` reads the production trade path and appends ledger rows internally, so an unexpected verifier or filesystem failure after trade-file creation cannot be guaranteed to leave every file untouched without a staging/transaction design. Do not silently invent rollback behavior; resolve §10 before Step 2.

## 9. What must not change

The sole new machinery is one driver script and its tests. It may only wire the existing DEV segment builder, card signals, one-slot trade producer with frozen exit harness, segmented random control, 25-cell sweep, `verifyReal(..., {a8DevOnly: true})`, and report. It must not alter or copy the logic of `scripts/map-compass/frozen.mjs`, `verifyReal`, `scripts/map-compass/lib/verification.mjs`, `scripts/map-compass/lib/signals.mjs`, `scripts/map-compass/lib/compass.mjs`, or any threshold, card, cost, exit, criterion, routing path, or prior artifact. Imports and direct calls only; no parallel implementation of Map, signal, trade, baseline, sweep, or verdict behavior.

No `npm` script, test, or implementation file is authorized by this Step 1 document-only task. Do not run Stage 4 in Step 1.

## 10. Open questions for resolution before Step 2

1. **Continuity rule:** what exact timestamp-gap test distinguishes a malformed/missing M30 trading bar from documented weekend/holiday closures and known data holes? The normalized feed is not uniformly 30-minute continuous, and the data contract identifies multi-hour market gaps. The frozen pipeline does not export a universal “acceptable gap” policy. No threshold is guessed here.
2. **Sealed M15 edge:** `m15MapForSegment` includes the timestamp at `segmentEnd + 15 minutes` (`lib/dev-segments.mjs:139-154`). Confirm the rule for a second M15 sub-bar whose timestamp falls into a sealed calendar year or across an excluded gap. It must not expose sealed OHLC to an outcome, and the existing conservative fallback must remain unchanged.
3. **NO_BASELINE abort scope:** §8 says abort for any trade without a baseline cell, while the report must account for UNKNOWN entries and the frozen verifier deliberately records missing matches as `NO_BASELINE`/`INCONCLUSIVE`. Should the abort apply only to EFFICIENT/CHOPPY verdict-eligible trades (UNKNOWN trades are outside verdict cells), or literally to all accepted card trades? The frozen code cannot resolve this policy conflict.
4. **Dry-run paths/retention:** confirm the dry-run-only trade and inspection filenames and whether those files are retained. They must not be the permanent single-use output paths or block a later authorized real run.
5. **Failure atomicity/ledger:** `verifyReal` appends ledger rows before the caller writes `claim-verification.json` (`verify-claims.mjs:315-373`). Confirm whether the specified report publication is the logical PNR despite this earlier ledger side effect, and how to handle an I/O failure between ledger append and final artifact publication without changing `verifyReal` or deleting outputs.
6. **UNKNOWN baseline diagnostic:** if question 3 excludes UNKNOWN entries from the NO_BASELINE abort, confirm that their baseline status is reported as not applicable rather than fabricated or treated as a zero baseline.
