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

---

## Strongest published criticism / failed replication per family

Every URL below was **opened and read during this run (2026-10-27)**, so each is
marked **VERIFIED**. Nothing is cited from memory and no URL, author or year is
invented. For each family the strongest criticism or failed replication found is
listed; where several exist the most damaging is given, with a second where it
materially differs.

| # | Family | Criticism / failed replication (opened) | Full URL | Status |
| -: | ------ | ---------------------------------------- | -------- | ------ |
| 1 | channel-breakout | Sullivan, Timmermann & White (1999), *J. Finance* 54(5) 1647–1691 — re-ran the Brock/Lakonishok/LeBaron rules over a universe of ~7,846 parameterisations and showed the best rule's apparent edge is largely a data-snooping artefact (Sharpe-based p-value ends at 0.72 once snooping is adjusted). | `https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf` | VERIFIED |
| 2 | ma-cross | Allen & Karjalainen (1999), *J. Financial Economics* 51(2) 245–271 — genetic-algorithm-discovered MA-style rules earn **no** consistent excess returns over buy-and-hold in out-of-sample periods once transaction costs are charged; the apparent forecasting ability is low-order serial correlation. | `https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf` | VERIFIED |
| 3 | opening-range | Fetna (2026), SSRN 7428398 — pre-registered 225-cell grid over 16 years of one-minute futures data; **zero** cells meet the positive bar (t ≥ 2.5 at $25/round-trip, sign agreement, year stability). The grid earns +$1.57M gross but loses $6.49M after costs. | `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398` | VERIFIED |
| 3b | opening-range (second) | Sun (2026), *Pricing the Fill* — pre-registered out-of-sample test of the published 1,637% 5-minute ORB claim: **−0.0855R/trade (t = −2.16)** over 2020–2026, killed by the rule written before the run. | `https://github.com/js3872/Pricing-the-Fill` | VERIFIED |
| 4 | level-retest | Curcio, Goodhart, Guillaume & Payne (1997), *Int. J. Finance & Economics* 2(4) 267–280 — trader-supplied support/resistance rules are **on average not profitable** intraday, and once spreads are accounted for "virtually all trading rule profits are eliminated". | `http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf` | VERIFIED |
| 5 | osc-fade | Muruganandan (2020), *Colombo Business Journal* 11(1) 24–46 — the RSI rule "failed to deliver the positive return even before deducting transaction cost" on the BSE Sensex across bull and bear sub-periods. | `https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf` | VERIFIED |
| 6 | band-reversion | Fang, Jacobsen & Qin (2017), *J. Portfolio Management* 43(4) 152–159 — Bollinger Band profitability **self-destructs with popularity**: strongly predictive before 1983, "largely disappeared" since Bollinger's 2001 book, worst in the US first. | `https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf` | VERIFIED |
| 7 | candlestick-reversal | Marshall, Young & Cahan (2008), *Review of Quantitative Finance and Accounting* 31:191–207 — candlestick charting is **not profitable** in the Japanese equity market over 1975–2004, in the full 30-year sample, in three 10-year sub-periods, or in bull or bear markets. | `https://link.springer.com/article/10.1007/s11156-007-0068-1` | VERIFIED |
| 8 | vol-compression | Casey (2024, updated 2026), StatOasis — 17,424 backtests of Crabel's up/down-thrust patterns across 8 markets: "The pattern is real. The edge is mostly drift." A random entry with the same holding period beat the up-thrust long on **4 of 8** markets; the published settings sit at a median rank of 81 of 225. | `https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns` | VERIFIED |

**All 8 families have an opened, VERIFIED criticism or failed replication.**
Six of the eight are peer-reviewed or pre-registered studies; two are
pre-registered replications posted as a repository/preprint. None was found that
supports the textbook claim on out-of-sample data after realistic costs — which
is consistent with `EVIDENCE.priorFalseFraction = 0.80`.

### What this does and does not mean

- It sets expectations and explains why a mostly-REFUTED M6 outcome would not be
  surprising. It does **not** pre-decide any verdict.
- A negative replication is a reason to expect REFUTED, not a licence to skip the
  test. Every claim is still tested under the frozen rule.
- `vol-compression` remains **PRACTITIONER ONLY** for the primary study registry
  (no peer-reviewed NR7/inside-bar test exists); the criticism above is a
  pre-registered backtest of Crabel's *other* patterns, which is the closest
  thing published.

---

## Amendment 5 — Dual Thrust source audit (opened 2026-10-28)

| Status | Source | Verified content | Use / limitation |
|---|---|---|---|
| VERIFIED | FMZ Quant, “Implement a Dual Thrust Digital Currency Quantitative Trading Strategy in Python,” https://www.fmz.com/digest-topic/9872 | Formula Range=max(HH−LC, HC−LL); upper=open+K1×Range; lower=open−K2×Range; K1/K2 described as adjustable; demonstration uses K1=K2=0.5. | Opened implementation tutorial; supports formula and a demo setting, not universal canonical N/K parameters. |
| VERIFIED | ProRealCode, “Dual Thrust Strategy indicator,” https://www.prorealcode.com/prorealtime-indicators/dual-thrust-strategy-indicator/ | Same four-extreme range and K1/K2 rails; strategy reverses on opposite rail. | Opened indicator description; it does not prescribe a fixed N/K pair. |

The existing DRAFT card is not equivalent to that published formulation: it sets k=0, computes a prior-day high/open/low range, and enters on intrabar rail touches. That discrepancy is expressly left DRAFT and proposed for owner review; no current card parameter or signal was changed.
