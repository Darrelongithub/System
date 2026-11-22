# Stage 1 — Freeze & provenance
**Status:** FROZEN (before any trade). No Stage 4 verdict has been run.
**Date:** 2026-11-21/22, this branch (arena/988f2654-system).

## Frozen engines & identities
| Engine | Commit | Tree | Registry | Date | Source |
|--------|--------|------|----------|------|--------|
| CORE-8 (PRIMARY) | **9d7912c** (PR #22) | 4c56402f | 8 trade bots + 7 context | 2026-11-22T00:39:46Z (PR #22) | `git show 9d7912c:...` |
| v3.1 NINE (secondary — CONTAMINATED) | **2f87616** (PR #23) | 3643251f5d42b5a8668e57131ac3d10bdc5e87aa | 8 core + 22 expansion = 30 bots at commit; v3.1 nine = 9-bot working-tree pruning | 2026-11-22T11:54:51Z (PR #23, merged 12:01:45Z) | `git show 2f87616:...` |

CORE-8 ids (9d7912c): `donchian-55-coiled, ny-pivot-s1r1-reject, killzone-orb-stretch, supertrend-ema-pullback, keltner-squeeze-release, asymmetric-vol-breakout, kijun-cloud-continuation, engulfing-zone-retest`

v3.1 nine ids (2f87616 + working-tree pruning): `donchian-55-coiled, ny-pivot-s1r1-reject, supertrend-ema-pullback, engulfing-zone-retest, weekly-highlow-breakout, crabel-nr7-ignition, bollinger-bandwidth-pop, lambert-cci20-momentum, chandelier-22-flip`
- Working tree (pruned, uncommitted): V2_CORE_STRATEGIES = 4 core + V3_EXPANSION_STRATEGIES = 5 expansion = **9 bots** (matches the audit doc §9 Tier A 9-bot list).

## Rule-file SHA-256 (full, pinned at 9d7912c / 2f87616)
Core-8 (9d7912c):
- run.ts        1bade9acc89c173a60f19a4cb913a81e51854d5fccac54bdab1b67ccccb1e768
- regime-state.ts 02af58b5efa12967aedd1917d77033e316fb2ce9d0e6b2006f3f8aa145c6bf94
- portfolio-gate.ts a540368735482c37698a193d13c6e9100f65f514f0f044f4c7380c1c1841eda7
- math.ts        4cba71f6c1c01aa96e46c3b7f04044083930ef40c879d9b4d86339e1c92871b4
- status.ts      90030a9b280da02a9be4beb5ac4799d9c9d3f5d324511135cc898207cd3a1ffe
- structure.ts   3aec72e3be5e9e8f6f95e8bcc336c6d69ab58aa01bc50447692a5f43c65cfc18
- strategy-kind.ts 75c5aede0831ee01be07a4e0d086452aba095948880b5f445e5689605f8ebc30
- v2-regime-bots.ts a2b04da4831f9fba15dbf3269457f4f7fbcb7c683361e6ac0118fdbfb351de6d
- spec-strategies.ts ac364983f5fd5ff2dffb0d5a0f1e56f675207e937d28b4d30b2c6b5705a439a2
- index.ts       42b20d0768d5a21d4676e6b869f3e482831458912c9e1f8de1d4731c647b65f7
- util.ts        367f0d3d0242f7484f08e5e3e19a5f4ed92c8055f2f40901e110187bb88991e5
- time.ts        66d2e01db3c45940462f088d9387983b4ff24be46174a6432bd288873a95dbc2
- types.ts       894dfd2d0f1537a387cb3f686d793cd43140a114950e6b1692a4d226bd4d9210
- pivots.ts      8bf1034c88b61af1384f14f7d03f40ede7343740966eca8797fbbdbd61bf3f6f
- indicators.ts  1defadff9617873e1a88c27a566280c8369ef9a55a99d19ca063c48f19bccb76
- daily.ts       343e88c1a71014015d537d24542abca44aadb958708189fb5362b6572a5bc46a
- parse.ts       4fbe1424da4094c7e1aa0295a591fc3a9da0954639eb46ea2cdcf0d962c80dd8
- series-contract.ts fe256fff3e2dde815379804794d748aa02599cc71875e0ba5ff5e2e86bc84acd
- config.ts      7c14b5ab7d42b747299d51806c16a74c67f980ee3703eccd9e4d1bbed0ca364b
- day-lookup.ts  a29ca252b079fd8e65441c2f502f555796769042aeb059d1698c6cb2ff086469

v3.1 nine (2f87616) — run.ts / regime-state.ts / strategy-kind.ts / v2-regime-bots.ts / spec-strategies.ts / index.ts / v3-expansion-bots.ts DIFFER; the other 13 files identical (same hash as Core-8 above):
- run.ts        6eb6a3edc393218d6475948cff923bc7e14622ac927ac0677735a0dc5061a651
- regime-state.ts 7c6b2a51aa97de3a337599b9fefaeaf141d775f58a2498bac3284d0ea467115a
- strategy-kind.ts 36eedb93aebe4c3fb0b8764e97d1e279fdf0146539be1e01718b7c6ec3314a59
- v2-regime-bots.ts 4854aa36fcb10ec57150bb4c2e83026556f7fbb70fc3851929359c4c2cf4ecc9
- v3-expansion-bots.ts d0fa49f5d3f52eb00ee22d0adf065223339bea2d523c5d97f11ee2dc61f154a1
- spec-strategies.ts a4a2645f97ded166fa72e0b08d1303c4694be3810c850c273a5369650ce95bb5
- index.ts       873c11267fe2e840881397b9d8b806a27451a69a8e3735fc7305456967c70fe8
(portfolio-gate / math / status / structure / util / time / types / pivots / indicators / daily / parse / series-contract / config / day-lookup — identical to Core-8 hashes above)

## First 2004–2019 run (pinned)
- FIRST recorded 2004–2019 run: **2026-11-22T12:12:30.360Z** (`artifacts/v3-skeptic-audit/exp1/unseen-trial-0.20.json`, meta.generatedAt).
- All 9d7912c (Core-8) and 2f87616 (v3.1 engine) rule-file COMMITS precede the first run (9d7912c = 2026-11-22T00:39:46Z; 2f87616 = 2026-11-22T11:54:51Z). Provenance is clean for Core-8.
- **v3.1 nine**: pruning to the Tier A 9-bot list (4 core + 5 expansion) was performed over the 2004–2019 unseen window AFTER the first run (make-date 2026-11-22 15:07, uncommitted working-tree changes). → **CONTAMINATED**.

## Audit-doc hash discrepancy (flagged, not silently repaired)
`AUDIT-V3.0-HOSTILE-STRATEGY-PROOF.md` (2026-11-21, untracked) pins run.ts → `b5bfb2a02dde6491`, regime-state.ts → `757c748620fc43a1`, v2-regime-bots.ts → `22903e33c5371454`, v3-expansion-bots.ts → `3023276a3eee4262`, portfolio-gate.ts → `ee0a1374ce8a1c1a`, math.ts → `72645bc29f6c3318`, status.ts → `aa08a97cb2818d64`, structure.ts → `83670a1bf9fa24bf`. These DO NOT match any commit on this branch or the untracked working tree. Possibly computed elsewhere/on a different tree. Frozen hashes ABOVE (computed via `git show`) are the authoritative values; this discrepancy is logged in QUESTIONS.md.

## Registry counts
- 9d7912c (Core-8): V2_TRADE_STRATEGIES = 8 (`git show 9d7912c:src/lib/analyzer/strategies/v2-regime-bots.ts` lines 743-754); STRATEGIES = SPEC_STRATEGIES = 8 trade + 7 context = 15 (`spec-strategies.ts` line 418).
- 2f87616 (v3.1 engine): V2_CORE_STRATEGIES = 8 (lines 744-758); V2_TRADE_STRATEGIES = 8 + 22 = 30 (lines 759-764); working-tree (uncommitted) v2-regime-bots.ts = 4 core + 5 expansion = **9** (lines 410-426).
