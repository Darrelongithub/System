# Work status — G0 Amendment 8 Stage 3b

**As of:** 2026-11-06 (Africa/Nairobi)  
**Branch:** `arena/072665f9-system`  
**Verified starting tip for Part 1b:** `12c3a8d932ddf84675181033072e69ee7e21bb98` (matched `git ls-remote` before work; branch fetched/reset to this tip).
**Current task stage:** Parts 0, 1 and 1b are committed/pushed. Part 1b is report-only; no production code, generator, bar, cost, or current threshold changed. Conclusion: (i); earlier causal classification (ii) is withdrawn. The v1.10 criterion proposal is pending owner approval and is not effective.
**Real DEV results:** none. No Stage 3 rerun, Part 4, or Stage 4 was started.

## Existing pushed commits

- Stage 1 freeze: `9aae04e67b1102d1802c4dd0b92f47af19d81fe6`.
- Stage 2 segmented pipeline/audit: `c7879aef39fce647e4dccfa34cf691e3f466ddb8`.
- Stage 3a synthetic rehearsal report: `5cdf4749d3543c00f3298d59a4ef2536803dc9a4`.
- Part 0 / v1.9 Stage 3b pre-registration: `dc9ec21429db671c49143abd11e76f2fbe280608` (pushed and remote-verified).
- Part 1 synthetic diagnosis: `9dd84e32f234781f804746963f70711d7af6bc36` (pushed and remote-verified).
- Part 1 completion bookkeeping: `46d510f6e154bd953e335aa4cfe0b05a51b2db2d`.
- Part 1b starting tip: `12c3a8d932ddf84675181033072e69ee7e21bb98` (remote-verified).
- Part 1b diagnosis/proposal: `921387db3d74ab8e54f559fb40b5e571ca30b6ef` (pushed; remote-verified).

## Part 0 completed

- Additive frozen definitions only: four DEV spans, 1,000-bar warm-up, 96-bar tail and 25 sweep cells. Load-time assertions ensure equality with existing `ROLES.DEV`, `MAP`, `EXIT_HARNESS`, and frozen center values.
- Baseline/power/signal-count/coverage/slot artifacts carry explicit superseded-history metadata.
- v1.9 / G0 Amendment 8B is pre-registered for 2026-11-06, before any real result. It preserves v1.0–v1.8.
- `docs/G0-AMENDMENT-8-REPORT.md`, this file, and `QUESTIONS.md` record scope, hashes, decisions and constraints.
- Tests add frozen-constant/metadata checks and enforce absence of `claim-verification.json` and `claimed-trades.jsonl` before separate Stage 4 authorization.

## Hashes

- Before Part 0: `frozen.mjs` SHA-256 `41403386254a20d1261e5adc77fc674067a70823c642a06b373c9d95e7b67389`; `BLUEPRINT.md` SHA-256 `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`.
- After Part 0: `frozen.mjs` SHA-256 `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; v1.9 `BLUEPRINT.md` / `docs/BLUEPRINT-v1.9.md` SHA-256 `c91ee38c6c56355360fe3def3723b6de81cf9675814c76be4176a2be9375f74a`.
- Part 1b current blueprint v1.10 (`BLUEPRINT.md` byte-identical to `docs/BLUEPRINT-v1.10.md`) SHA-256 `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2`; frozen code unchanged.
- Frozen-file diff: 38 additions, 0 removals.

## Part 1 / Part 1b diagnosis (synthetic only)

The deterministic A/B replay reproduced the saved confirmed-card lists. Across the ten A worlds, strategy-level diagnostics showed mean 0.700 unique confirmed cards/world and max 4; official family-pooled A confirmations were zero. In B there were 11 repeated official card rows representing four unique family cells. All 14 strategy-level confirmation cells were weakness halves, passed numeric gates, and had no vetoes. CR1/day inflation averaged 1.0018; A bar-return purity metrics matched white-noise expectations.

The initial Part 1 report provisionally classified (ii) based on a B pilot/scored calibration difference. **Part 1b supersedes that causal attribution and selects (i)** for the no-edge anomaly: direction-aware weakness net null is +cost (all A weakness cell costs exceed +0.10R), whereas strength null is −cost; per-cell net-gate probabilities are 0.578189 vs 0.001129, with the excess gate at 0.0227501. A-only λ=0.281701 confirmed cards/world; observed mean 0.700/max 4 is a rare multiple-cell Poisson tail (joint tail about 0.001004), not a demonstrated generator/verifier defect. No code, bar, generator, cost or threshold changed. Detailed 44-cell probability table and observed excess/SE table: `docs/G0-AMENDMENT-8B-PART1B.md`; earlier Part 1 record and replay diagnostics remain at `docs/G0-AMENDMENT-8B-PART1-DIAGNOSIS.md` and `artifacts/map-compass/a8-stage3b-part1-diagnostics.json`.

Part 1b used only synthetic A/B diagnostics; no market bar, including no non-DEV bar, entered its computations. The DEV-year inclusion set remains `ROLES.DEV = {2004–2007, 2009–2011, 2013–2015, 2017–2018}`, handled as four independent segments. The non-reading preflight `npm run mc:a8-audit` failed before opening bars with `Error: missing /home/user/System/artifacts/map-compass/normalized/xauusd-m30-eat.csv; run the appropriate M1/Map inputs first`. Per task instruction, `mc:m1` and `mc:map` were not run. The committed `a8-segment-audit.json` remains historical aggregate output (131,922 bars; 127,538 eligible; 4,000 warm-up and 384 tail exclusions), not an input newly read for this report.

**Proposed criterion only; owner approval pending.** See dated G0 Amendment 8C in `BLUEPRINT.md` / v1.10 and the amendment log. Current criterion is not replaced.

## Environment / known test status

`npm install` completed. The recorded full-suite run is **408 passed, 4 failed**: one existing `tests/synth.test.mjs:694` D1 display assertion and three `data-contract.test.mjs` failures due absent raw manifest/normalized OHLC files. On this Part 1b task, `mc:m1` and `mc:map` were explicitly not to be run. The safe preflight `npm run mc:a8-audit` failed before reading bars because the normalized M30 DEV input is absent; exact error is recorded in the Part 1b report. No real-bar computation was attempted.

## Next action

Part 1b report and G0 Amendment 8C proposal are committed and pushed at `921387db3d74ab8e54f559fb40b5e571ca30b6ef`. **Stop and await owner approval** of the proposed criterion. Do not rerun Stage 3, run Part 4, or start Stage 4.
