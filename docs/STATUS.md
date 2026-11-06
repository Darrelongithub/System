# Work status — G0 Amendment 8 Stage 3b

**As of:** 2026-11-06 (Africa/Nairobi)  
**Branch:** `arena/072665f9-system`  
**Verified starting tip:** `5cdf4749d3543c00f3298d59a4ef2536803dc9a4` (matched `git ls-remote`).  
**Current task stage:** Part 0 and Part 1 are committed/pushed; Part 1 used report-only diagnostics, with no production-code changes. Classification: (ii), B synthetic drift-calibration mismatch. Part 2 is blocked at preflight and has not started.
**Real DEV results:** none. Stage 4 has not been started.

## Existing pushed commits

- Stage 1 freeze: `9aae04e67b1102d1802c4dd0b92f47af19d81fe6`.
- Stage 2 segmented pipeline/audit: `c7879aef39fce647e4dccfa34cf691e3f466ddb8`.
- Stage 3a synthetic rehearsal report: `5cdf4749d3543c00f3298d59a4ef2536803dc9a4`.
- Part 0 / v1.9 Stage 3b pre-registration: `dc9ec21429db671c49143abd11e76f2fbe280608` (pushed and remote-verified).
- Part 1 synthetic diagnosis: `9dd84e32f234781f804746963f70711d7af6bc36` (pushed and remote-verified).

## Part 0 completed

- Additive frozen definitions only: four DEV spans, 1,000-bar warm-up, 96-bar tail and 25 sweep cells. Load-time assertions ensure equality with existing `ROLES.DEV`, `MAP`, `EXIT_HARNESS`, and frozen center values.
- Baseline/power/signal-count/coverage/slot artifacts carry explicit superseded-history metadata.
- v1.9 / G0 Amendment 8B is pre-registered for 2026-11-06, before any real result. It preserves v1.0–v1.8.
- `docs/G0-AMENDMENT-8-REPORT.md`, this file, and `QUESTIONS.md` record scope, hashes, decisions and constraints.
- Tests add frozen-constant/metadata checks and enforce absence of `claim-verification.json` and `claimed-trades.jsonl` before separate Stage 4 authorization.

## Hashes

- Before Part 0: `frozen.mjs` SHA-256 `41403386254a20d1261e5adc77fc674067a70823c642a06b373c9d95e7b67389`; `BLUEPRINT.md` SHA-256 `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`.
- After current Part 0 edits: `frozen.mjs` SHA-256 `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; `BLUEPRINT.md` / `docs/BLUEPRINT-v1.9.md` SHA-256 `c91ee38c6c56355360fe3def3723b6de81cf9675814c76be4176a2be9375f74a`.
- Frozen-file diff: 38 additions, 0 removals.

## Part 1 diagnosis (synthetic only)

The deterministic A/B replay reproduced the saved confirmed-card lists. Across the ten A worlds, strategy-level diagnostics showed mean 0.700 unique confirmed cards/world and max 4; official family-pooled A confirmations were zero. In B there were 11 repeated official card rows representing four unique family cells. All 14 strategy-level confirmation cells were weakness halves, passed numeric gates, and had no vetoes. CR1/day inflation averaged 1.0018. A bar-return purity metrics matched white-noise expectations.

**Classification (ii): generator/calibration defect.** B was calibrated to +0.1492R using a fixed M15 seed and all eligible bars, while scored B worlds used a world-specific M15 seed and excluded UNKNOWN-state random entries; scored random-long mean was +0.0990R. No verifier fix or threshold changes. Full Part 1 analysis, complete cell tables, and Poisson checks: `docs/G0-AMENDMENT-8B-PART1-DIAGNOSIS.md`; deterministic diagnostics: `artifacts/map-compass/a8-stage3b-part1-diagnostics.json`. The one required fix cycle is in Part 2. No real DEV bars/results were read. Stage 4 remains blocked.

## Environment / known test status

`npm install` completed. Current full-suite run: **408 passed, 4 failed**. One is the existing `tests/synth.test.mjs:694` D1 display assertion; three `data-contract.test.mjs` checks fail because the fresh checkout has no raw fetch manifest or normalized OHLC files. The recovery commands `mc:m1`/`mc:map` were not run because their current whole-dataset normalization/map paths read non-DEV prices, prohibited by the explicit sealed-data restriction. This conflict is logged in `QUESTIONS.md`; only DEV bars may be used if Part 2 requires real signal counts.

## Next action

Part 1 report and replay diagnostics are committed and remote-verified at `9dd84e32f234781f804746963f70711d7af6bc36`; status bookkeeping is pushed at `46d510f6e154bd953e335aa4cfe0b05a51b2db2d`. Part 2 was not started: raw and normalized DEV inputs are absent, and the only pinned XAU source is a single 2004–2024 archive that must be fully extracted/normalized by the existing recovery path, which would read sealed-year bars. Stop here under the DEV-only rule. Resume only when the owner supplies hash-identified DEV-only M30/M15 inputs (or authorizes a genuinely date-bounded source that does not deliver sealed bars). After that prerequisite, complete Parts 2–4 in order and stop after Part 4; never run Stage 4.
