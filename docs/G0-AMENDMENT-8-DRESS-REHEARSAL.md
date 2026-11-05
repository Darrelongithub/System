# G0 Amendment 8 — synthetic dress rehearsal (Stage 3)

Generated 2026-11-05T08:17:40.873Z. **Synthetic only; no real strategy outcomes. Result: FAIL.**

- Worlds: 10 per condition (30 total); 60,000 M30 bars/world (20,000 per segment); three isolated segments with holes; every world ran all 25 grid cells and the full A8 pipeline.
- Condition B generator drift: 0.03143677 price units/bar; calibration mean random-long net 0.1492R; target 0.15R.
- Condition C planted edge: 0.45R gross by construction (target about 0.30R net) over 10 bars; mean Donchian20 gross 0.4595R.
- Card false-confirm counts use each card's strategy-level diagnostic verdict; official center results remain family-pooled. Condition B's net/excess gate share uses official family claim cells.

## Full rehearsal table (one row per world)

| Condition | World | Seed | Bars | Cards CONFIRMED | Claim cells CONFIRMED | Random-long net R | Net pass / excess fail | Donchian20 strength | Donchian20 gross R | Donchian20 net R | Other confirmed cards | Planted signals |
|---|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|--:|--:|
| A_ZERO_DRIFT | 1 | 20261106 | 60000 | 1 | 0 | -0.1820 | 22 (50.0%) | REFUTED | -0.0501 | -0.2024 | 1 | — |
| A_ZERO_DRIFT | 2 | 20261107 | 60000 | 1 | 0 | -0.1545 | 16 (36.4%) | REFUTED | -0.0534 | -0.2056 | 1 | — |
| A_ZERO_DRIFT | 3 | 20261108 | 60000 | 0 | 0 | -0.1880 | 22 (50.0%) | REFUTED | 0.0069 | -0.1453 | 0 | — |
| A_ZERO_DRIFT | 4 | 20261109 | 60000 | 0 | 0 | -0.2383 | 16 (36.4%) | INCONCLUSIVE | 0.0110 | -0.1404 | 0 | — |
| A_ZERO_DRIFT | 5 | 20261110 | 60000 | 0 | 0 | -0.2014 | 16 (36.4%) | INCONCLUSIVE | -0.0258 | -0.1757 | 0 | — |
| A_ZERO_DRIFT | 6 | 20261111 | 60000 | 1 | 0 | -0.1163 | 19 (43.2%) | INCONCLUSIVE | -0.0340 | -0.1865 | 1 | — |
| A_ZERO_DRIFT | 7 | 20261112 | 60000 | 4 | 0 | -0.2013 | 16 (36.4%) | INCONCLUSIVE | 0.0154 | -0.1362 | 4 | — |
| A_ZERO_DRIFT | 8 | 20261113 | 60000 | 0 | 0 | -0.2216 | 22 (50.0%) | INCONCLUSIVE | 0.0168 | -0.1351 | 0 | — |
| A_ZERO_DRIFT | 9 | 20261114 | 60000 | 0 | 0 | -0.2376 | 19 (43.2%) | REFUTED | -0.0131 | -0.1639 | 0 | — |
| A_ZERO_DRIFT | 10 | 20261115 | 60000 | 0 | 0 | -0.1933 | 19 (43.2%) | INCONCLUSIVE | 0.0004 | -0.1512 | 0 | — |
| B_CONSTANT_UP_DRIFT | 1 | 20262106 | 60000 | 4 | 8 | 0.0849 | 6 (13.6%) | INCONCLUSIVE | 0.0953 | -0.0624 | 4 | — |
| B_CONSTANT_UP_DRIFT | 2 | 20262107 | 60000 | 1 | 3 | 0.1210 | 11 (25.0%) | INCONCLUSIVE | 0.0241 | -0.1344 | 1 | — |
| B_CONSTANT_UP_DRIFT | 3 | 20262108 | 60000 | 0 | 0 | 0.0394 | 19 (43.2%) | INCONCLUSIVE | 0.0111 | -0.1453 | 0 | — |
| B_CONSTANT_UP_DRIFT | 4 | 20262109 | 60000 | 0 | 0 | 0.1420 | 16 (36.4%) | INCONCLUSIVE | 0.0476 | -0.1098 | 0 | — |
| B_CONSTANT_UP_DRIFT | 5 | 20262110 | 60000 | 0 | 0 | 0.1450 | 22 (50.0%) | INCONCLUSIVE | 0.0555 | -0.1010 | 0 | — |
| B_CONSTANT_UP_DRIFT | 6 | 20262111 | 60000 | 1 | 0 | 0.1283 | 16 (36.4%) | INCONCLUSIVE | -0.0019 | -0.1593 | 0 | — |
| B_CONSTANT_UP_DRIFT | 7 | 20262112 | 60000 | 0 | 0 | 0.0497 | 19 (43.2%) | INCONCLUSIVE | 0.0397 | -0.1166 | 0 | — |
| B_CONSTANT_UP_DRIFT | 8 | 20262113 | 60000 | 0 | 0 | 0.1174 | 17 (38.6%) | INCONCLUSIVE | 0.0440 | -0.1132 | 0 | — |
| B_CONSTANT_UP_DRIFT | 9 | 20262114 | 60000 | 0 | 0 | 0.0824 | 14 (31.8%) | INCONCLUSIVE | 0.0439 | -0.1124 | 0 | — |
| B_CONSTANT_UP_DRIFT | 10 | 20262115 | 60000 | 1 | 0 | 0.0800 | 16 (36.4%) | INCONCLUSIVE | 0.0658 | -0.0914 | 1 | — |
| C_DONCHIAN20_PLANTED_EDGE | 1 | 20263106 | 60000 | 9 | 8 | -0.0641 | 3 (6.8%) | CONFIRMED | 0.4332 | 0.2806 | 8 | 15451 |
| C_DONCHIAN20_PLANTED_EDGE | 2 | 20263107 | 60000 | 10 | 8 | -0.0770 | 0 (0.0%) | CONFIRMED | 0.4402 | 0.2892 | 9 | 15804 |
| C_DONCHIAN20_PLANTED_EDGE | 3 | 20263108 | 60000 | 12 | 10 | -0.0432 | 0 (0.0%) | CONFIRMED | 0.4690 | 0.3180 | 11 | 15661 |
| C_DONCHIAN20_PLANTED_EDGE | 4 | 20263109 | 60000 | 10 | 10 | -0.1311 | 3 (6.8%) | CONFIRMED | 0.3950 | 0.2445 | 9 | 15642 |
| C_DONCHIAN20_PLANTED_EDGE | 5 | 20263110 | 60000 | 11 | 8 | 0.0392 | 0 (0.0%) | CONFIRMED | 0.4742 | 0.3212 | 10 | 15649 |
| C_DONCHIAN20_PLANTED_EDGE | 6 | 20263111 | 60000 | 11 | 8 | -0.0723 | 0 (0.0%) | CONFIRMED | 0.4919 | 0.3397 | 10 | 15874 |
| C_DONCHIAN20_PLANTED_EDGE | 7 | 20263112 | 60000 | 14 | 13 | 0.2066 | 0 (0.0%) | CONFIRMED | 0.5174 | 0.3673 | 13 | 15770 |
| C_DONCHIAN20_PLANTED_EDGE | 8 | 20263113 | 60000 | 13 | 10 | -0.0046 | 0 (0.0%) | CONFIRMED | 0.4492 | 0.2987 | 12 | 15776 |
| C_DONCHIAN20_PLANTED_EDGE | 9 | 20263114 | 60000 | 11 | 8 | -0.1459 | 0 (0.0%) | CONFIRMED | 0.4649 | 0.3124 | 10 | 15930 |
| C_DONCHIAN20_PLANTED_EDGE | 10 | 20263115 | 60000 | 13 | 15 | -0.0624 | 0 (0.0%) | CONFIRMED | 0.4597 | 0.3090 | 12 | 15572 |

## Condition summary and pass criteria

| Condition | Mean confirmed cards/world | Max | B net-pass/excess-fail share | Random-long mean R | Donchian20 confirmed worlds | Donchian20 gross mean R | Donchian20 net mean R | Other cards mean / max |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| A_ZERO_DRIFT | 0.700 | 4 | 42.5% | -0.1934 | 0/10 | -0.0126 | -0.1642 | 0.700 / 4 |
| B_CONSTANT_UP_DRIFT | 0.700 | 4 | 35.5% | 0.0990 | 0/10 | 0.0425 | -0.1146 | 0.600 / 4 |
| C_DONCHIAN20_PLANTED_EDGE | 11.400 | 14 | 1.4% | -0.0355 | 10/10 | 0.4595 | 0.3081 | 10.400 / 13 |

| Preregistered criterion | Result |
|---|---|
| A_meanConfirmedCardsAtMostHalf | FAIL |
| A_noWorldAboveTwo | FAIL |
| B_meanConfirmedCardsAtMostHalf | FAIL |
| B_noWorldAboveTwo | FAIL |
| C_donchian20ConfirmedAtLeastEightOfTen | PASS |
| C_meanDonchianGrossWithin005R | PASS |
| C_otherCardsMeanAtMostHalfPerWorld | FAIL |

**Overall:** FAIL — stop here; do not run real verification.

Full per-world pipeline output: `artifacts/map-compass/a8-dress-rehearsal.json`.
