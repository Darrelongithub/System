# Empirical-evidence registry — G0 Amendment 3 (2026-10-27)

**Rule applied:** for each of the 8 strategy families, find and **open** one
empirical study that tests it, and record its full URL; if none exists, mark the
family **PRACTITIONER ONLY**. All studies below were located and opened on
**2026-10-27, before any real strategy result existed**. No outcome from our
own data was used to build this registry — it is literature only.

The four subjective evidence tiers (1–4) used in v1.0–v1.2 are **removed**.
`EVIDENCE.studies` in `scripts/map-compass/frozen.mjs` is the machine-readable
copy; each of the 24 cards carries `evidence` pointing at its family's entry,
and `docs/CLAIM-CARDS-FULL-TEXT.md` prints the URLs again.

`TEST_ORDER` is an explicit frozen list, byte-identical to v1.2. Changing an
evidence grade does **not** re-sort it.

---

## Registry

| # | Family | Grade | Study opened (full URL) | What it tests | Finding |
| -: | ------ | ----- | ----------------------- | ------------- | ------- |
| 1 | channel-breakout | PEER_REVIEWED_TEST | [Brock, Lakonishok & LeBaron (1992), "Simple Technical Trading Rules and the Stochastic Properties of Stock Returns", Journal of Finance 47(5), 1731–1764](http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf) | Trading-range break (channel / support-resistance breakout) rules on DJIA 1897–1986, bootstrap against four null models | In-sample support for the rules; later work (Sullivan, Timmermann & White 1999) warns the rule universe was data-snooped |
| 2 | ma-cross | PEER_REVIEWED_TEST | [Chong & Ng (2008), "Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30", Applied Economics Letters 15(14), 1111–1114, DOI 10.1080/13504850600993598](https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html) | MACD (an exponential moving-average crossover) and RSI on 60 years of the FT30 | MACD/RSI beat buy-and-hold in most cases — a positive but single-market result |
| 3 | opening-range | PEER_REVIEWED_TEST | [Holmberg, Lönnbark & Lundström (2013), "Assessing the profitability of intraday opening range breakout strategies", Finance Research Letters 10(1), 47–53, DOI 10.1016/j.frl.2012.09.001](http://www.econ.umu.se/ueslpnr/ues845.pdf) | Opening-range breakout on US crude-oil futures with a bootstrap test | Full-sample success is **not robust** across three sub-periods — mixed/negative |
| 4 | level-retest | PEER_REVIEWED_TEST | [Osler (2000), "Support for Resistance: Technical Analysis and Intraday Exchange Rates", FRBNY Economic Policy Review 6(2), 53–68](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf) | Support/resistance levels published by six FX firms, intraday 1996–1998, bootstrap vs arbitrary levels | Levels do predict intraday trend interruptions, but firms mis-rank the strength of their own levels |
| 5 | osc-fade | PEER_REVIEWED_TEST | [Chong, Ng & Liew (2014), "Revisiting the Performance of MACD and RSI Oscillators", JRFM 7(1) 1–12 / MPRA Paper 54149](https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf) | RSI(14,30/70), RSI(21,50) and MACD on five OECD indices 1976–2002 | RSI(14,30/70) profitable on the DJIA but not consistently across markets |
| 6 | band-reversion | PEER_REVIEWED_TEST | [Lento, Gradojevic & Wright (2007), "Investment information content in Bollinger Bands?", Applied Financial Economics Letters 3(4), 263–267, DOI 10.1080/17446540701206576](https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands) | Bollinger Band (20,2) and variants on four markets 1995–2004, after transaction costs | BB underperform buy-and-hold; a contrarian inversion does better — a **negative** result for the textbook fade |
| 7 | candlestick-reversal | PEER_REVIEWED_TEST | [Marshall, Young & Rose (2006), "Candlestick technical trading strategies: Can they create value for investors?", Journal of Banking & Finance 30(8), 2303–2323, DOI 10.1016/j.jbankfin.2005.08.001](https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf) | 26 candlestick reversal patterns on DJIA component stocks 1992–2002, OHLC bootstrap | No value: neither bullish nor bearish signals beat buy-and-hold — a **negative** result |
| 8 | vol-compression | **PRACTITIONER ONLY** | [StockCharts ChartSchool, "Narrow Range Day NR7" — documents Crabel (1990), *Day Trading with Short Term Price Patterns & Opening Range Breakout* (Traders Press)](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7) | NR7 / inside-bar / volatility-contraction patterns. **No peer-reviewed test of NR7 or inside-bar was found.** | Practitioner only. Holmberg et al. (2013) discusses Crabel's contraction–expansion principle but tests ORB, not NR7/inside-bar. **This is the plainly-wrong item:** v1.2 ranked this family tier 1 with no empirical study. |

**Result: 7 families have an opened empirical study; 1 is PRACTITIONER ONLY.**
Four of the seven studies report negative or non-robust findings for the
textbook rule — consistent with the 0.80 prior false fraction.

---

## Near-duplicate and mirror-image cards

All 24 within-family pairs are enumerated in `CARD_RELATIONS` in
`scripts/map-compass/claim-cards.draft.mjs` and printed in the full-text dump.
Counts: **11 NEAR_DUPLICATE**, **1 MIRROR_IMAGE**, **12 RELATED**.

Examples:

- NEAR_DUPLICATE: `donchian-20`/`donchian-55` (same rule, different lookback);
  `sma-20-50`/`macd-cross`/`ichimoku-tk` (all MA crosses);
  `asian-range-break`/`london-orb-30`; `rsi-14-30-70`/`williams-r-fade`/
  `stochastic-14-fade`; `bollinger-20-2`/`keltner-20-atr`;
  `atr-squeeze-break`/`nr7-break`.
- MIRROR_IMAGE: `pdh-retest`/`pdl-retest` (prior-day HIGH retest long vs
  prior-day LOW retest short).
- Cross-family mirrors (diagnostic only, do not affect within-family overlap):
  `pdh-pdl-break`/`pdh-retest`, `pdh-pdl-break`/`pdl-retest`,
  `rsi-14-30-70`/`bollinger-20-2`, `engulfing`/`three-soldiers-crows`.

**Recomputed within-family overlap** (`lib/overlap.mjs`): pooled overlap
fraction **0.8302**, Kish design effect **2.2948** (v1.2 was 0.2071 / 1.2316).
Per-family design effects range 2.13–2.58. This uses ONLY the relation metadata
plus a seeded RNG generating entry-bar multiplicities — **no outcomes**. A
0 → 1 share-scale sensitivity sweep is in
`power-projection.json → reportOnlyV13.overlapProvenance.v13.sensitivityByShareScale`.

---

## What this does and does not mean

- It **motivates** the 24 claims and fixes their test order. It does **not**
  pre-confirm any claim on our data.
- A negative study is a reason to expect REFUTED, not a licence to skip the
  test. Every claim is still tested under the frozen rule.
- The PRACTITIONER_ONLY family's v1.2 tier-1 rank was plainly wrong. Its grade
  is corrected; its sequence position is deliberately kept (see
  `docs/BLUEPRINT-AMENDMENTS.md` A4.5) because the user asked to keep
  TEST_ORDER stable unless an item is plainly wrong — the discrepancy is
  surfaced and put to the user rather than silently reshuffling a frozen list.
