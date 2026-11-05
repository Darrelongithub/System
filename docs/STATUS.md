# STATUS — Map / Compass / Strategy Verification

**Last updated:** 2026-11-05 (G0 Amendment 9, record repair)
**Branch of record for this work:** `arena/2350ac34-system`
**Blueprint:** v1.9 · `BLUEPRINT.md` SHA-256 `dafdecb90883e88655684996c43266d54cbb547ed6b776667c77a4e28f1027b4`
**Frozen constants:** `scripts/map-compass/frozen.mjs` SHA-256 `1641999f8b978c23686e58d05ed22badefd3ff6ac17da2ffd5bea96ac2c8bc56`

> The briefs name `arena/072665f9-system` as the builder branch. This session is
> pinned by the platform to `arena/2350ac34-system`, which was branched from
> `9aae04e` on `arena/072665f9-system` and is byte-identical to it at
> Amendment 8. All work is committed and pushed on `arena/2350ac34-system`;
> nothing was force-pushed and `main` was never merged in. This is the single
> declared deviation in this project.

## Stage

| Stage | State |
| --- | --- |
| G0 Amendment 8 (freeze + preregister) | **DONE** — commit `9aae04e` |
| Stage 1-REPAIR (report, constants, markers, STATUS, guards, docs) | **DONE** — see commit recorded below |
| Stage 2 (build segments + sweep, unit tests) | **DONE** — 22 A8 tests, 418 passed / 1 known failure |
| Stage 3 (dress rehearsal, synthetic) | **DONE — VERDICT FAIL** (2 of 7 pre-registered checks). See `docs/STAGE-3-REHEARSAL-REPORT.md` |
| Stage 4 (real DEV run, once) | NOT STARTED — blocked until Stage 3 passes |
| Compass / VAL / HOLDOUT / STRESS / robustness | OUT OF SCOPE |

**Next action:** **HARD STOP — owner decision required before Stage 4.**
Stage 3 failed two pre-registered checks (C: donchian-20 CONFIRMED 6/10 vs >=8/10;
C: other cards 7.2 vs <=0.5 CONFIRMED per world). Conditions A and B passed. The
planted gross R was recovered within 0.016R and the excess gate fired in every C
world, so the verifier is sound; the failure is a criterion-design issue (the
planted drift blankets the whole series because the cards overlap on 50-92% of
signal bars) plus a power issue at a 0.30R edge. Criteria were NOT edited. No
fix-and-rerun cycle was spent because no bug in the new code was found in C.
Stage 4 is blocked. Options are in the hard-stop notice.

### Stage 3 headline numbers

| Condition | Mean CONFIRMED cards/world | Max | donchian-20 CONFIRMED | donchian gross R | Planted |
| --- | --- | --- | --- | --- | --- |
| A (no edge) | 0.2 (<=0.5 PASS) | 1 (<=2 PASS) | 0/10 | -0.0693 | none |
| B (drift +0.15R) | 0.3 (<=0.5 PASS) | 2 (<=2 PASS) | 1/10 | +0.1530 | +0.133R net |
| C (planted +0.30R) | 7.8 | 11 | 6/10 (FAIL) | +0.2707 (+/-0.05 PASS) | +0.2863R gross |

Other-cards mean in C: 7.2 vs <= 0.5 required (FAIL).

### Stage 2 built (no strategy result existed when it was built)

| File | Purpose |
| --- | --- |
| `scripts/map-compass/lib/segments.mjs` | DEV-only segmentation, eligibility window, per-segment Map, canonical 25-cell list, load-time invariants |
| `scripts/map-compass/lib/segmented.mjs` | one-slot trade producer, matched random control, A4 top-up, per-verdict-state sweep, grade, `verifyCardA8` |
| `scripts/map-compass/a8-segments-report.mjs` | Stage 2 structural report → `artifacts/map-compass/a8/segments.json` |
| `tests/map-compass/segments-a8.test.mjs` | 22 tests: (a) segment == continuous Map after warm-up, (b) sentinel never read, (c) hand-computed long/short/stop/target/time-exit/gap-through/slot, (d) causality, plus binning/top-up/grade |

Stage 2 structural numbers (from `a8/segments.json`): 248,912 bars in file;
131,922 readable DEV bars (identical to the historical count); 116,990 non-DEV
bars dropped including 46,513 sealed; segments S1 39,448 / S2 33,862 / S3 35,147
/ S4 23,465 bars; 1,000 warm-up + 96 tail lost per segment (95.3–97.2% of each
segment remains eligible); segmented Map agrees with the old continuous Map on
99.99% of post-warm-up DEV bars (report only). 3 of the 44 sampled spread months
are in sealed years (2012-01, 2012-06, 2012-12) — cost data only.

## Hashes

| File | SHA-256 |
| --- | --- |
| `BLUEPRINT.md` (= `docs/BLUEPRINT-v1.9.md`) | `dafdecb90883e88655684996c43266d54cbb547ed6b776667c77a4e28f1027b4` |
| `docs/BLUEPRINT-v1.8.md` (preserved) | `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4` |
| `docs/BLUEPRINT-v1.7.md` (preserved) | `045b345320fc0a691e9af1cea8fcc0fd140bb7c04204647172f8ac5b0df13281` |
| `scripts/map-compass/frozen.mjs` (after A9) | `1641999f8b978c23686e58d05ed22badefd3ff6ac17da2ffd5bea96ac2c8bc56` |
| `scripts/map-compass/frozen.mjs` (before A9) | `41403386254a20d1261e5adc77fc674067a70823c642a06b373c9d95e7b67389` |
| `docs/CLAIM-CARDS-FULL-TEXT.md` | regenerated from the frozen cards (`print-claim-cards.mjs`) |

All snapshots v1.0–v1.9 are byte-preserved and listed in
`artifacts/map-compass/blueprint-hashes.json`.

## Known test state

`npm test` → **399 passed, 1 failed.** The single failure is the known, untouched
mismatch: `tests/synth.test.mjs:694` expects the UI to say `28/32` while
`src/pages/MapGenerator.tsx` says `26/32`. Both files are unchanged from the base
commit and neither is part of Map/Compass work.

The data-contract tests pass **only after `npm run mc:m1`** (gitignored data).
A fresh clone must run the recovery sequence below before trusting a test count.

## Recovery sequence (fresh clone)

```
git fetch origin arena/2350ac34-system && git reset --mixed FETCH_HEAD
npm install
npm run mc:m1
npm run mc:map
```

## Guards that must stay true

- No `artifacts/map-compass/claim-verification.json` and no
  `artifacts/map-compass/claimed-trades.jsonl` before Stage 4. Both are asserted
  absent by tests.
- Every output contains DEV years only. Sealed: 2008, 2012, 2016, 2019. Never
  read: VAL 2020–2024, STRESS 2025–2026.
- The five pre-A8 artifacts (`random-baseline`, `power-curve`, `signal-counts`,
  `baseline-coverage`, `slot-model`) are history and may not be used as inputs
  to an A8/A9 verdict.
- `scripts/map-compass/frozen.mjs` may change only by the two permitted A8
  additions. Its hash is recorded before and after every stage.
- Cost/spread months inside sealed years: `2012-01`, `2012-06`, `2012-12`
  (3 of the 44 sampled months). Cost data only; no strategy outcome.
