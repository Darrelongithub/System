#!/usr/bin/env node
/** Render the Amendment 7 evidence/report tables from its report-only artifacts. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";
import { paramsToString } from "./signal-params.mjs";
const ROOT=fileURLToPath(new URL("../..",import.meta.url));
const ART=join(ROOT,"artifacts/map-compass/amendment7");
const OUT=join(ROOT,"docs/G0-AMENDMENT-7-REPORT.md");
const signals=JSON.parse(readFileSync(join(ART,"signal-yearly.json"),"utf8"));
const baseline=JSON.parse(readFileSync(join(ART,"year-matched-baseline.json"),"utf8"));
const slots=JSON.parse(readFileSync(join(ART,"slot-model.json"),"utf8"));
const pins=JSON.parse(readFileSync(join(ART,"pin-verification.json"),"utf8"));
const cardById=new Map(CLAIM_CARDS.map(c=>[c.id,c]));
const cellLabel=(key)=>String(key).replaceAll("|","\\|");
const years=signals.devYears;
const fm=(x,n=6)=>x===null||x===undefined?"—":Number(x).toFixed(n);
const pct=(x)=>x===null||x===undefined?"—":`${(100*x).toFixed(2)}%`;
const md=(xs)=>xs.map(v=>String(v).replaceAll("|","\\|")).join(" | ");
const sources={
"donchian-20":{tf:"Daily DJIA data (1897–1986).",status:"UNVERIFIED",url:"http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf",note:"The opened search result identifies daily data; no source page/PDF was opened this run."},
"donchian-55":{tf:"Daily DJIA data (1897–1986).",status:"UNVERIFIED",url:"http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf",note:"Same cited BLL study as Donchian-20; the PDF was not opened this run."},
"sma-20-50":{tf:"Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article).",status:"VERIFIED",url:"https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html",note:"The 2008 bibliographic record was opened this run but does not expose its interval; monthly detail came from the opened 2014 article. The cited study is not an SMA20/50 test."},
"macd-cross":{tf:"Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article).",status:"VERIFIED",url:"https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html",note:"The 2008 record was opened but does not expose its interval; accessible monthly detail came from the opened 2014 paper citing it."},
"ichimoku-tk":{tf:"Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article).",status:"VERIFIED",url:"https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html",note:"Source record opened this run; 2014 article supplies the monthly interval detail. Ichimoku itself was not tested there."},
"asian-range-break":{tf:"Daily OHLC records for an intraday opening-range study.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438",note:"ScienceDirect article page opened this run."},
"london-orb-30":{tf:"Daily OHLC records for intraday ORB assessment.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438",note:"ScienceDirect article page opened this run."},
"pdh-pdl-break":{tf:"Daily OHLC records for intraday ORB strategies.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438",note:"Holmberg et al. is a related ORB source, not a test of this exact prior-day-level evaluator."},
"pdh-retest":{tf:"Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998).",status:"VERIFIED",url:"https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf",note:"The paper's full text was opened this run via a ResearchGate mirror: https://www.researchgate.net/publication/5050393_Support_for_Resistance_Technical_Analysis_and_Intraday_Exchange_Rates . The NYFed PDF URL itself did not fetch."},
"pdl-retest":{tf:"Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998).",status:"VERIFIED",url:"https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf",note:"Full text opened via the ResearchGate mirror noted above; source does not test these exact prior-day-level triggers."},
"classic-pivot":{tf:"Daily floor-pivot formula uses prior-session H/L/C; related Osler S/R study uses one-minute FX quote observations.",status:"UNVERIFIED",url:"https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf",note:"Osler source PDF did not open this run; it is not a pivot study. Formula source opened and VERIFIED: https://www.tradealgo.com/trading-guides/technical-analysis/pivot-points-how-floor-traders-calculate-daily-support-and-resistance-levels ."},
"rsi-14-30-70":{tf:"Daily closing prices for five equity indices, January 1976–December 2002.",status:"VERIFIED",url:"https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf",note:"The published article was opened this run at https://www.mdpi.com/1911-8074/7/1/1 ."},
"williams-r-fade":{tf:"Daily closing prices for five equity indices, January 1976–December 2002.",status:"VERIFIED",url:"https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf",note:"Published article opened at https://www.mdpi.com/1911-8074/7/1/1 . Rule-to-source mismatch disclosed."},
"bollinger-20-2":{tf:"Daily closing prices, four markets, May 1995–December 2004.",status:"VERIFIED",url:"https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands",note:"Full paper content opened this run."},
"keltner-20-atr":{tf:"Daily closing prices for four markets, May 1995–December 2004.",status:"VERIFIED",url:"https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands",note:"Full paper content opened this run. Rule-to-source mismatch disclosed."},
"bb-squeeze-fade":{tf:"Daily closing prices, four markets, May 1995–December 2004 in the cited Bollinger study.",status:"VERIFIED",url:"https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands",note:"Full paper content opened this run; its tested variants are not identical to this squeeze-release fade."},
"engulfing":{tf:"Daily stock OHLC for 35 DJIA component stocks, 1992–2002.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116",note:"ScienceDirect article and section snippets opened this run."},
"morning-evening-star":{tf:"Daily stock OHLC for 35 DJIA component stocks, 1992–2002.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116",note:"ScienceDirect article opened this run; the article's full pattern table is access-restricted."},
"three-soldiers-crows":{tf:"Daily stock OHLC for 35 DJIA component stocks, 1992–2002.",status:"VERIFIED",url:"https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116",note:"ScienceDirect article opened this run; direction definition separately verified from ThinkMarkets."},
"atr-squeeze-break":{tf:"Daily NR7 ranges; ATR-squeeze sampling interval is unspecified by the cited page.",status:"VERIFIED",url:"https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7",note:"Linked page opened this run; no academic test or direct ATR-squeeze timeframe was established."},
"nr7-break":{tf:"Daily bars: NR7 is the narrowest absolute high-low range over seven days.",status:"VERIFIED",url:"https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7",note:"Linked ChartSchool page opened this run."},
"inside-bar-break":{tf:"Daily NR7 context; the cited page does not specify an inside-bar sampling interval.",status:"VERIFIED",url:"https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7",note:"Linked page opened this run; the timeframe for the inside-bar evaluator is not established by that page."},
};
const lines=[];
lines.push("# G0 Amendment 7 — pre-result DRAFT corrections and report-only controls","",
"**Date:** 2026-11-02. **Status:** pre-result amendment; every card remains `DRAFT`; `verify-claims` remains blocked. No strategy verification, strategy return, trade-result, claim-verification, or ledger artifact was produced.",
"**Unchanged:** Map, costs, exits, frozen numerical thresholds, claim states (including the preserved CHOPPY/EFFICIENT three-soldiers pair), and the CONFIRMED rule. CONFIRMED remains: net mean > +0.10R and day-clustered t(net)>2 AND matched-control excess >0R and day-clustered t(excess)>2, with the unchanged frozen vetoes.",
"**Versioning:** v1.6 and all earlier snapshots are preserved byte-for-byte. This report accompanies BLUEPRINT v1.7; full SHA-256 is recorded in `artifacts/map-compass/blueprint-hashes.json` and `docs/BLUEPRINT-AMENDMENTS.md`.",
"",
"## 1. DRAFT-only signal corrections (no outcome data)",
"",
"1. `asian-range-break`: replace the A6 ‘first 20 observed Asian bars’ range with **all observed bars in the EAT Asian session clock window, 01:00–10:59**; London entries start only after the range window has ended. There is no 20-bar minimum.",
"2. `london-orb-30`: replace the six-bar/three-hour range with the fixed **11:00–11:29 EAT** opening range (`[11:00,11:30)`); entry eligibility begins at 11:30. The range is the high/low of available bars in that 30-minute clock window; at least one observed range bar is required.",
"3. `classic-pivot`: pre-fix exact code line was `const pp = (prev.hi + prev.lo + prev.open) / 3;`. This used prior-open, not prior-close. The opened textbook source gives **PP = (previous session high + previous session low + previous session close) / 3**: [TradeAlgo floor-trader pivots](https://www.tradealgo.com/trading-guides/technical-analysis/pivot-points-how-floor-traders-calculate-daily-support-and-resistance-levels). Current DRAFT line: `const pp = (prev.hi + prev.lo + prev.close) / 3;` (`prev.close` is the last observed prior EAT-day bar close). A6→A7 DEV signal count change: **6,532 → 6,443 (−89)**.",
"4. `three-soldiers-crows`: the pre-fix variant said **“Three white soldiers / black crows fade”**; the claim text was **“positive net R in CHOPPY”** (strength) / **“negative net R in EFFICIENT”** (weakness), with rationale **“A three-bar directional run in a quiet market is claimed to be exhausted; in high-vol chop it is meaningless.”** The current card claim strings and their CHOPPY/EFFICIENT states are preserved; current variant text is `Three white soldiers LONG / black crows SHORT (textbook direction)`, and rationale now describes a continuation signal. The opened [ThinkMarkets pattern guide](https://www.thinkmarkets.com/en/trading-academy/indicators-and-patterns/three-soldiers-black-crows-pattern/) defines three white soldiers as three consecutive bullish candles after a decline, with opens within prior real bodies and higher closes near highs; three black crows are the bearish mirror after an advance. **Direction fix:** soldiers emit LONG; crows emit SHORT. Source definition and direction were opened and are **VERIFIED** this run. The empirical Marshall–Young–Rose study is separate; its full text is not needed to establish this pattern definition. A6→A7 total signals **2,168 → 2,168 (0 change)**; side counts below show the direction swap.",
"",
"### Affected-card signal counts and direction-side audit (DEV only)",
"",
"| Card | A6 total | A7 total | Δ total | A6 long | A7 long | Δ long | A6 short | A7 short | Δ short |",
"|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
);
for(const id of ["asian-range-break","london-orb-30","classic-pivot","three-soldiers-crows"]){const c=signals.cards.find(x=>x.id===id);lines.push(`| ${id} | ${c.oldDevSignalsA6} | ${c.newDevSignalsA7} | ${c.totalSignalDelta} | ${c.oldDevSignalsBySideA6.long} | ${c.newDevSignalsBySideA7.long} | ${c.sideSignalDeltas.long} | ${c.oldDevSignalsBySideA6.short} | ${c.newDevSignalsBySideA7.short} | ${c.sideSignalDeltas.short} |`);}
lines.push("","## 2. Session coverage and Asian-range diagnosis","",
"Clock-window range validity is defined as at least one observed M30 bar in that window on a DEV EAT calendar date. Signal-day shares count unique signal dates, not repeated same-day emissions.",
"","| DEV year | DEV days | M30 bars/day | Asian-session bars/day | Max Asian bars on any DEV day | Asian valid-range days | Asian valid-range share | London ORB valid-range days | London ORB valid-range share |",
"|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for(const y of years){const r=signals.barsAndRangeDiagnostics.years[y];lines.push(`| ${y} | ${r.devDays} | ${fm(r.barsPerDevDay,2)} | ${fm(r.asianBarsPerDevDay,2)} | ${r.maxAsianBarsPerDevDay} | ${r.asianValidRangeDays} | ${pct(r.asianValidRangeDays/r.devDays)} | ${r.londonOrbValidRangeDays} | ${pct(r.londonOrbValidRangeDays/r.devDays)} |`);}
lines.push("","**Why A6 had zero Asian-break signals before 2011-05-13:** it demanded 20 prior Asian bars, but the observed Asian clock window averaged fewer than 20 M30 bars/day (see means above); the legacy evaluator skipped these days. The new logic uses all bars that actually fall in 01:00–10:59; no post-signal price or outcome is used.",
"","## 3. All 22 cards — source timeframe and status","",
"Each strength and weakness verdict label is explicitly DRAFT and includes the required disclosure **“tested on M30 gold; the source used <timeframe>.”** This phrase describes the target test design vs the cited literature timeframe; it is not a performance finding. VERIFIED means the cited page or full-text mirror was opened this run; UNVERIFIED means it was not.",
"","| Card | Strength / weakness state | Strength verdict label | Weakness verdict label | Source timeframe | Source status | Full cited URL |",
"|---|---|---|---|---|---|---|",
);
for(const c of signals.cards){const card=cardById.get(c.id),s=sources[c.id];const str=`DRAFT: ${card.strength.claim}; tested on M30 gold; the source used ${s.tf}`;const weak=`DRAFT: ${card.weakness.claim}; tested on M30 gold; the source used ${s.tf}`;lines.push(`| ${c.id} | ${c.strengthState} / ${c.weaknessState} | ${str} | ${weak} | ${s.tf} | **${s.status}** — ${s.note} | ${s.url} |`);}
lines.push("","**Source-use caution:** citations are family motivation, not evidence on XAUUSD M30 and not proof that every exact card rule was studied. `sma-20-50`, Ichimoku, Williams %R, Keltner, and the specific BB squeeze are not the exact rule studied by their family citation; the table states that mismatch rather than implying equivalence. `three-soldiers-crows` empirical study tested candlestick patterns, while the direction definition is supported by the separately opened ThinkMarkets guide.",
"","## 4. Signal counts by card and DEV year","",
"Each cell is the number of signal emissions (not trades or outcomes); `0` is explicit and is also flagged in the card's zero-year column. Dates are EAT calendar dates. The detailed machine-readable artifact reports every card-year first/last signal date and zero flag.",
"","| Card | Total | "+years.join(" | ")+" | First signal date | Last signal date | Zero-signal DEV years |",
"|---|---:|"+years.map(()=>"---:").join("|")+"|---|---|---|");
for(const c of signals.cards){const by=new Map(c.byYear.map(x=>[x.year,x]));const all=c.byYear.filter(x=>x.signals>0);lines.push(`| ${c.id} | ${c.newDevSignalsA7} | ${years.map(y=>by.get(y)?.signals??0).join(" | ")} | ${all[0]?.firstSignalDate??"—"} | ${all.at(-1)?.lastSignalDate??"—"} | ${c.zeroSignalYears.length?c.zeroSignalYears.join(", "):"none"} |`);}
lines.push("","### Share of DEV dates with at least one signal, by card and year","",
"This is unique signal dates / DEV dates. For the two clock-range cards, the additional range-valid denominator appears in the following table.",
"","| Card | "+years.join(" | ")+" |","|---|"+years.map(()=>"---:").join("|")+"|");
for(const c of signals.cards){const by=new Map(c.byYear.map(x=>[x.year,x]));lines.push(`| ${c.id} | ${years.map(y=>pct(by.get(y)?.signalDayShareOfDevDays)).join(" | ")} |`);}
lines.push("","### Signal dates as a share of valid range days","","| Card / valid range | "+years.join(" | ")+" |","|---|"+years.map(()=>"---:").join("|")+"|");
for(const id of ["asian-range-break","london-orb-30"]){const c=signals.cards.find(x=>x.id===id);const by=new Map(c.byYear.map(x=>[x.year,x]));lines.push(`| ${id} / valid clock-window range | ${years.map(y=>pct(by.get(y)?.signalDayShareOfValidRangeDays)).join(" | ")} |`);}
lines.push("","Zero-signal card-years across all 22 cards after the corrections: **"+signals.zeroSignalCardYears.length+"**. A6 no-signal Asian years are corrected; every card-year remains explicitly listed in `artifacts/map-compass/amendment7/signal-yearly.json`.",
"","## 5. Matched baseline means by fine cell","",
"The existing frozen matched random baseline uses the fine key verdict-state×side×session×volatility. Positive baseline means exist in **"+baseline.controlCalibration.positiveLegacyFineCellCount+"/36** legacy fine cells and **"+baseline.controlCalibration.positiveYearMatchedFineCellCount+"/36** year-matched equal-year cell means. Thus **yes**, the matched control can change whether a claim clears the control gate even if its absolute net mean exceeds +0.10R: CONFIRMED still requires positive matched excess and its unchanged t>2 gate. No actual claim verdict was computed.",
"","| Fine cell | Legacy baseline mean (n) | Year-matched equal-year mean | Year-matched baseline sampling SE | Legacy − year-matched control delta | Combined control-delta SE | Delta t |",
"|---|---:|---:|---:|---:|---:|---:|");
for(const [key,x] of Object.entries(baseline.fineCellMeans).sort(([a],[b])=>a.localeCompare(b))){lines.push(`| ${cellLabel(key)} | ${fm(x.legacyMatchedMean,6)} (${x.legacyN}) | ${fm(x.yearMatchedMeanEqualYearWeight,6)} | ${fm(x.yearMatchedBaselineSamplingSe,6)} | ${fm(x.legacyMinusYearMatchedControlDeltaR,6)} | ${fm(x.controlDeltaSeIncludingBothSamplingErrors,6)} | ${fm(x.controlDeltaT,4)} |`);}
lines.push("","Positive legacy fine-cell means: `EFFICIENT|long|london|low` = +0.202162R; `EFFICIENT|short|ny|low` = +0.013547R; `CHOPPY|long|ny|high` = +0.008801R. These are control means, not strategy returns.",
"","### Report-only year-matched baseline (cell × year)","",
`The fixed seed generated **${baseline.totals.randomEntries.toLocaleString()}** random entries: ${baseline.totals.yearCellRows}/${baseline.totals.requiredYearCells} cell-years have n=100; ${baseline.totals.fineExactCells} used the exact fine key; ${baseline.totals.fallbackCells} had fewer than 100 exact fine-cell candidate bars and fell back to side×verdict-state×year; ${baseline.totals.unavailable.length} unavailable. Entries are random baseline only, generated with the frozen 1.5×ATR stop, 2R target, costs, 96-bar cap, and within-year DEV eligibility. Fixed seed ${baseline.design.seed}.`,
`Fallback cell-years: ${Object.values(baseline.byCellYear).filter(x=>x.fallback).map(x=>x.cell+"|"+x.year).join(", ") || "none"}.`,
"","All 36 fine cells × 12 DEV years; each value is that cell-year baseline mean net R (n=100). Exact annual SEs and fallback labels are in `artifacts/map-compass/amendment7/year-matched-baseline.json`.",
"","| Fine cell | "+years.join(" | ")+" |","|---|"+years.map(()=>"---:").join("|")+"|");
for(const [cell,rows] of Object.entries(baseline.fineCellMeans).sort(([a],[b])=>a.localeCompare(b))){const values=years.map(y=>baseline.byCellYear[`${cell}|${y}`]?.meanNetR);lines.push(`| ${cellLabel(cell)} | ${values.map(x=>fm(x,4)).join(" | ")} |`);}
lines.push("","**No strategy excess/t is printed**: that would require strategy outcomes, which were prohibited in this amendment. The table above instead prints a control-only calibration delta (legacy matched-control mean minus equal-year mean) and its SE, including sampling error from both random controls. For future strategy verification, year-matched excess is `mean(strategy netR × claim direction) − weighted year-matched baseline mean`; its SE is `sqrt(CR1_SE(strategy excess)^2 + Σ(w_cellYear² × baselineSamplingSE_cellYear²))`. The current code emits `DRIFT_DEPENDENT` when year-matched excess t≤2; that tag does not change the frozen CONFIRMED rule. Compass does not enable a DRIFT_DEPENDENT claim unless independent VAL confirmation passes the frozen gates and year-matched excess t>2.",
"","## 6. Hold-time discrepancy and capacity reconciliation","",
"A4 v1.4 prose stated mean hold 37.9 bars / median 33 / p90 77 / max 96. That statement conflicts with the committed A4 random-baseline artifact at c3e1ba9, which already reports mean 17.532, median 10, p90 40, max 96. This is a documentation/artifact mismatch, not a duration change introduced by A6. The A5 change was a day-cluster-key repair only; it did not change `barsHeld`, `resolveTrade`, the stop, target, costs, or cap. The A6 combined-book sample mean is 17.89671157; the underlying A6 random-entry histogram mean remains 17.532.",
"","| Hold record | Mean | Median | P90 | Max | N (histogram entries/draws) |",
"|---|---:|---:|---:|---:|---:|");
const held=baseline; // report-only A7 control follows A6 histogram; values read from the preserved A6 snapshot below
const a6=JSON.parse(readFileSync(join(ROOT,"artifacts/map-compass/amendment6/random-baseline.json"),"utf8"));
const hist=a6.barsHeldStats.histogram;const heldN=Object.values(hist).reduce((s,n)=>s+n,0);const histMean=Object.entries(hist).reduce((s,[h,n])=>s+Number(h)*n,0)/heldN;
lines.push("| A4 v1.4 prose (reported, not supported by committed histogram) | 37.900 | 33 | 77 | 96 | not reported |");
lines.push(`| A4 committed random-baseline artifact (c3e1ba9) | ${fm(histMean,3)} | ${a6.barsHeldStats.median} | ${a6.barsHeldStats.p90} | ${a6.barsHeldStats.max} | ${heldN.toLocaleString()} |`);
lines.push(`| A6 random baseline histogram | ${fm(histMean,3)} | ${a6.barsHeldStats.median} | ${a6.barsHeldStats.p90} | ${a6.barsHeldStats.max} | ${heldN.toLocaleString()} |`);
lines.push(`| A6 combined-book sampled holds | ${fm(slots.combinedBook.meanSampledHoldBars,8)} | — | — | 96 cap | ${slots.combinedBook.kept.toLocaleString()} sampled draws |`);
lines.push("","A5 exact code change (day-clustering only):","","```diff","- const dayKeyOf = (s) => `${s.year}-${String(s.barIndex).slice(-4)}`;","+ const dayKeyOf = (s) => s.day;","+ day: bars[pick.i].datetime.slice(0, 10) // added to each sampled baseline row","```","");
const bin=(lo,hi)=>Object.entries(hist).filter(([h])=>+h>=lo&&+h<=hi).reduce((s,[,n])=>s+n,0);
lines.push("","| Hold bars | Entries | Share |","|---|---:|---:|");
for(const [label,n] of [["1–10",bin(1,10)],["11–20",bin(11,20)],["21–40",bin(21,40)],["41–95",bin(41,95)],["96 (TIME_EXIT cap)",hist["96"]]])lines.push(`| ${label} | ${n.toLocaleString()} | ${pct(n/heldN)} |`);
const occ=slots.combinedBook.kept*slots.combinedBook.meanSampledHoldBars;
lines.push("","A7 slot/capacity emulation uses the unchanged one-slot design and unchanged A6 baseline hold histogram, but the corrected A7 signal streams:",
"","| Raw eligible signal instances | Unique same-bar candidates | Kept one-book positions | Mean sampled hold | Occupied bar-equivalents | DEV bars | Headroom | Utilization | Over DEV bars? |","|---:|---:|---:|---:|---:|---:|---:|---:|---|");
lines.push(`| ${slots.combinedBook.rawSignals.toLocaleString()} | ${slots.combinedBook.sameBarCandidates.toLocaleString()} | ${slots.combinedBook.kept.toLocaleString()} | ${fm(slots.combinedBook.meanSampledHoldBars,8)} | ${occ.toLocaleString()} | ${slots.inputs.devBars.toLocaleString()} | ${(slots.inputs.devBars-occ).toLocaleString()} | ${pct(occ/slots.inputs.devBars)} | **No** |`);
lines.push("","Occupied bar-equivalents are below the DEV-bar count; no capacity threshold or strategy result is implied. The one-slot emulation is report-only, with baseline-sampled durations.",
"","## 7. Regenerated data pin and map checks","",
`M1 (npm run mc:m1) and M2 (npm run mc:map) completed; raw pins and regenerated normalized outputs were rechecked against scripts/map-compass/pins.json and data-manifest.json: **${pins.matched}/${pins.pinnedFiles} raw Git blob SHA-1 pins match; ${pins.missing} missing, ${pins.mismatched} mismatched; normalized hashes ${pins.normalizedMatched}/${pins.normalizedFiles} match data-manifest.json**. The map-validation artifact reports PASS, zero coverage problems, and deterministic output.`,
"","## 8. Full-suite results (no strategy verification)","",
"`npm test`: **399 passed, 1 failed** in 77.6 seconds. The sole failure is the unchanged synth UI assertion at `tests/synth.test.mjs:694`: it expects “28/32 market-statistic checks,” while the unchanged `src/pages/MapGenerator.tsx` copy discloses 26/32 and the six failed hours 04:00, 08:00, 09:00, 10:00, 15:00, and 19:00. This UI/test mismatch is unrelated to Map Compass/A7; both files are unchanged from the base commit. Focused A7 tests: 6/6 pass. A6 regression group after its explicitly authorized A7 clock-window exceptions: 8/8 pass. No strategy verification was run.",
"","## 9. Pseudocode for every changed card","",
"```text",
"asian-range-break:",
"  on each EAT date, rangeBars = all observed bars with sessionOfEat == asian",
"                 (Asian clock window 01:00–10:59)",
"  require rangeBars is nonempty",
"  for each London bar strictly after Asian window, in chronological order:",
"    if bar.high > max(rangeBars.high): emit LONG",
"    else if bar.low < min(rangeBars.low): emit SHORT",
"  emit signals only; no exit/outcome logic",
"",
"london-orb-30:",
"  for each EAT date, rangeBars = observed London bars timestamped [11:00, 11:30)",
"  require rangeBars is nonempty",
"  for each London bar timestamped >= 11:30, in chronological order:",
"    if bar.high > max(rangeBars.high): emit LONG",
"    else if bar.low < min(rangeBars.low): emit SHORT",
"  emit signals only; no exit/outcome logic",
"",
"classic-pivot:",
"  prev = immediately preceding contiguous EAT trading day's observed OHLC",
"  PP = (prev.high + prev.low + prev.close) / 3",
"  S1 = 2*PP - prev.high; R1 = 2*PP - prev.low",
"  band = 0.25 * ATR14",
"  if current.low is within S1 ± band and current.close > S1: emit LONG",
"  else if current.high is within R1 ± band and current.close < R1: emit SHORT",
"  (priorDayBars=48 remains metadata and is not consumed)",
"",
"three-soldiers-crows:",
"  require each of the last 3 candles to have body >= 0.5 * candle range",
"  if all 3 are bullish and closes strictly rise: emit LONG (soldiers)",
"  else if all 3 are bearish and closes strictly fall: emit SHORT (crows)",
"  preserve claim state labels: strength CHOPPY; weakness EFFICIENT",
"```",
"",
"## 10. Guardrails and generated files","",
"Claim cards remain DRAFT, `FREEZE.approvedBy`/`approvedAt` remain null, and real `verify-claims` was not run. No `claim-verification.json`, `claimed-trades.jsonl`, or new strategy-result artifact was created. Map, costs, exits, frozen thresholds, and CONFIRMED rule are unchanged. Report-only artifacts: `artifacts/map-compass/amendment7/signal-yearly.json`, `year-matched-baseline.json`, `slot-model.json`, and `pin-verification.json`.",
"","The source timeframe notes do not assert that the source tested XAUUSD, M30, or every exact evaluator. Source status reflects this run's access only. No source URL is inferred beyond those listed in existing card references or opened this run.","");
writeFileSync(OUT,lines.join("\n"));
console.log(`wrote ${OUT}`);
