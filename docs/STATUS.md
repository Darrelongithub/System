# Work status — G0 Amendment 8 Stage 3b

**As of:** 2026-11-06 (Africa/Nairobi)  
**Branch:** `arena/072665f9-system`  
**Verified starting tip:** `5cdf4749d3543c00f3298d59a4ef2536803dc9a4` (matched `git ls-remote`).  
**Current task stage:** Part 0 paperwork completed and validated; ready for its standalone commit. No Part 1 diagnosis has started.  
**Real DEV results:** none. Stage 4 has not been started.

## Existing pushed commits

- Stage 1 freeze: `9aae04e67b1102d1802c4dd0b92f47af19d81fe6`.
- Stage 2 segmented pipeline/audit: `c7879aef39fce647e4dccfa34cf691e3f466ddb8`.
- Stage 3a synthetic rehearsal report: `5cdf4749d3543c00f3298d59a4ef2536803dc9a4`.

## Part 0 changes in progress

- Additive frozen definitions only: four DEV spans, 1,000-bar warm-up, 96-bar tail and 25 sweep cells. Load-time assertions ensure equality with existing `ROLES.DEV`, `MAP`, `EXIT_HARNESS`, and frozen center values.
- Baseline/power/signal-count/coverage/slot artifacts carry explicit superseded-history metadata.
- v1.9 / G0 Amendment 8B is pre-registered for 2026-11-06, before any real result. It preserves v1.0–v1.8.
- `docs/G0-AMENDMENT-8-REPORT.md`, this file, and `QUESTIONS.md` record scope, hashes, decisions and constraints.
- Tests add frozen-constant/metadata checks and enforce absence of `claim-verification.json` and `claimed-trades.jsonl` before separate Stage 4 authorization.

## Hashes

- Before Part 0: `frozen.mjs` SHA-256 `41403386254a20d1261e5adc77fc674067a70823c642a06b373c9d95e7b67389`; `BLUEPRINT.md` SHA-256 `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`.
- After current Part 0 edits: `frozen.mjs` SHA-256 `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; `BLUEPRINT.md` / `docs/BLUEPRINT-v1.9.md` SHA-256 `c91ee38c6c56355360fe3def3723b6de81cf9675814c76be4176a2be9375f74a`.
- Frozen-file diff: 38 additions, 0 removals.

## Known synthetic Stage 3a failure

The saved 30-world rehearsal failed: A and B each averaged 0.700 strategy-level confirmed cards/world, with maximum 4; C Donchian-20 confirmed 10/10 and gross averaged 0.4595R against 0.45R planted, but other cards averaged 10.4 confirmations/world. Full output: `artifacts/map-compass/a8-dress-rehearsal.json` and `docs/G0-AMENDMENT-8-DRESS-REHEARSAL.md`. The cause of A/B confirmations is not yet known. Per the manager instruction, Stage 4 remains blocked.

## Environment / known test status

`npm install` completed. Current full-suite run: **408 passed, 4 failed**. One is the existing `tests/synth.test.mjs:694` D1 display assertion; three `data-contract.test.mjs` checks fail because the fresh checkout has no raw fetch manifest or normalized OHLC files. The recovery commands `mc:m1`/`mc:map` were not run because their current whole-dataset normalization/map paths read non-DEV prices, prohibited by the explicit sealed-data restriction. This conflict is logged in `QUESTIONS.md`; only DEV bars may be used if Part 2 requires real signal counts.

## Next action

Commit and push Part 0 independently, verify the remote tip, and record that hash here. Then perform Part 1 diagnosis only, print and commit its report before Part 2. Do not run Stage 4.
