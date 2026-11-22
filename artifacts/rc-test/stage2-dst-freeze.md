# Stage 2 — DST-correct timestamp freeze (pre-trade freeze)

**Status:** FROZEN BEFORE ANY TRADE. No Stage 4 verdict has been run.
**Created:** 2026-11-21 (this stage).
**Input (broker-local archive, frozen verbatim):** `artifacts/v3-skeptic-audit/data/unseen-2004-2019.csv`
- 178,435 bars, 2004-06-11 07:00 → 2019-12-31 20:30 (broker-local timestamps, verbatim from `/tmp/audit/XAU_30m_data.csv`; 178,435 = unique)
- sha256 `134e64c65eef308080d35cebc17ec389ac618be2b1d85ac28f64cca8d911201e`
- sha256 of the converted output is printed below and pinned in this doc.

**Output (fixed EAT (UTC+3) wall-clock, same OHLC/is_reliable/volume):**
`artifacts/rc-test/unseen-2004-2019-eat-twoepoch.csv` — 178,435 bars
- sha256 `75608eb2025cc635d40e7041c4d73f54ce585b575e18f3ae17ee9e450a024312` (raw bytes; verify with `sha256sum`)
- first `2004-06-11 08:00:00`  last `2019-12-31 21:30:00`
- 0 non-monotone rows · 0 duplicates · 0 bad timestamps · 0 invalid rows

## Rule (the two-epoch rule)
Both epochs follow EU DST (last Sunday of March → last Sunday of October); the
base UTC offset differs:

- **EPOCH A** `2004-06-11` … `2011-05-06` broker-local — broker = UTC+1 winter / UTC+2 summer
  - EAT (UTC+3) = broker_local **+ 2h** in winter, **+ 1h** in summer
- **EPOCH B** `2011-05-09` … `2026-01-30` broker-local — broker = UTC+2 winter / UTC+3 summer
  - EAT (UTC+3) = broker_local **+ 1h** in winter, **+ 0h** in summer

Conversion is exact date-based (EU summer = [last Sunday March 01:00 UTC, last Sunday October 01:00 UTC); the series contains no weekend bars, so a pure date rule is exact).

EPOCH BOUNDARY = `2011-05-09 01:00:00` broker-local (inclusive to epoch B), as frozen by the Map/Compass DST sign-off.

## Evidence
1. **Independent M1 Dukascopy evidence (Map/Compass, `docs/MAP-COMPASS-DATA-CONTRACT.md`, `artifacts/map-compass/dst-verification.json`, 2026-11-05):** two-epoch rule vs independent UTC M1 bid, 44 sampled months 2010→2026: **PASS** — every month < 0.75 absolute close error; two-epoch strictly beats NO_DST in all 20 winter months and strictly beats ONE_EPOCH in all 16 pre-seam months; post-seam months agree with ONE_EPOCH.
2. **Prior session evidence (this session):** flat +1h vs certified baseline overlap (2025-11-03 → 2026-01-30, epoch B winter) — 90.4% within $5/oz (correct offset: +1h). The same +1h was the ONLY shift that worked in the overlap window; all other shifts failed.
3. **Internal structure check:** post-conversion days show 44 bars/day (epoch A: 02:00→23:30) and 46 bars/day (epoch B: 01:00→23:30), matching the 44/46-bar structure the lab documented; first/last bars per year are consistent with the seam.

## Coverage caveat (explicitly NOT extrapolated)
- EPOCH A is **verified only for 2010-01 → 2011-05** (Dukascopy M1 coverage starts 2010-01). **2004-06 → 2009-12 is EXTRAPOLATED** (no independent UTC reference exists) and is flagged as EXTRAPOLATED in every artefact that cites it.
- Flat +1h (the naive conversion) is therefore NOT used anywhere in this stage.

## Weekly shape (post-conversion, EAT)
- Monday starts: 02:00 (n=373), 01:00 (n=267), 03:00 (n=143), 04:00 (n=4), 09:00/10:00 (n=2 each) — consistent with epoch A winter (+2h) / summer (+1h) / epoch B summer (+0h) / epoch B winter (+1h)
- Friday ends: 23:00 (n=733), 21:00 (n=24), 20:00 (n=15), 22:00 (n=9), 19:00 (n=7), 00:00–01:00 (n=4), 03:00/08:00 (n=1 each)
- Fri→Mon gap = ~50–56h (one normal weekend); 539 Fri→Mon gaps, no intra-week gaps > 90 min other than weekend/holiday transitions.
- Seam 2011-05-06 (epoch A end) → 2011-05-09 (epoch B start): price-continuous gap, 2011-05-06 last bar 23:30 EAT, 2011-05-09 first bar 01:00 EAT.

## Frozen before any trade
This freeze is the input to Stage 4. Any change to this CSV or to the rule AFTER this freeze is a rule change and must be logged in QUESTIONS.md + disclosed in the verdict, never silently applied.
