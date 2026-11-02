#!/usr/bin/env node
/**
 * G0 Amendment 7 — pre-outcome signal and session-clock diagnostics.
 * Reads DEV bars + Map labels and emits signals only. It never resolves trades,
 * reads prices after a signal for a strategy outcome, or writes claim artifacts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { emitSignals, signalLibrarySelfCheck } from "./lib/signals.mjs";
import { SIGNAL_PARAMS, paramsToString } from "./signal-params.mjs";
import { CLAIM_CARDS, FROZEN_TEST_SEQUENCE } from "./claim-cards.draft.mjs";
import { ROLES, STATES } from "./frozen.mjs";
import { SESSION_WINDOWS_EAT, sessionOfEat } from "./lib/dst.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const OUT = join(ART, "amendment7");
mkdirSync(OUT, { recursive: true });
if (signalLibrarySelfCheck().length) throw new Error(signalLibrarySelfCheck().join("; "));

const rows = [...dataLines(readFileSync(join(ART, "normalized/xauusd-m30-eat.csv"), "utf8"), { delimiter: "," })];
const bars = rows.filter((r) => r[0] !== "datetime").map((r) => ({
  datetime: r[0], o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]),
})).filter((b) => [b.o,b.h,b.l,b.c].every(Number.isFinite));
const stateLines = readFileSync(join(ART, "normalized/xauusd-m30-map.csv"), "utf8")
  .split("\n").filter((l) => l && !l.startsWith("datetime"));
const states = new Array(bars.length).fill(null);
const roles = new Array(bars.length).fill(null);
let bi = 0;
for (const line of stateLines) {
  const f = line.split(",");
  while (bi < bars.length && bars[bi].datetime !== f[0]) bi++;
  if (bi >= bars.length) break;
  states[bi] = f[1];
  roles[bi] = f[12];
  bi++;
}
const years = [...new Set(ROLES.DEV)].sort((a,b)=>a-b);
const yearDays = new Map(years.map((y) => [y, new Set()]));
const yearStats = Object.fromEntries(years.map((y) => [y, {
  year: y, devBars: 0, devDays: 0, asianBars: 0, asianBarsPerDevDay: 0,
  barsPerDevDay: 0, asianValidRangeDays: 0, londonOrbValidRangeDays: 0,
  minAsianBarsPerDevDay: 0, maxAsianBarsPerDevDay: 0,
}]));
const asianCountsByYearDay = new Map(years.map((y) => [y, new Map()]));
const asianDays = new Map(years.map((y) => [y, new Set()]));
const londonDays = new Map(years.map((y) => [y, new Set()]));
const minute = (dt) => { const m = / (\d{2}):(\d{2})/.exec(dt); return m ? +m[1]*60 + +m[2] : undefined; };
const londonStart = 11*60;
const londonEnd = londonStart + 30;
for (let i = 0; i < bars.length; i++) {
  if (roles[i] !== "DEV") continue;
  const y = +bars[i].datetime.slice(0,4);
  if (!yearStats[y]) continue;
  const day = bars[i].datetime.slice(0,10);
  yearDays.get(y).add(day);
  yearStats[y].devBars++;
  const session = sessionOfEat(bars[i].datetime);
  if (session === "asian") {
    yearStats[y].asianBars++;
    asianDays.get(y).add(day);
    const daily = asianCountsByYearDay.get(y);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }
  const m = minute(bars[i].datetime);
  if (session === "london" && m >= londonStart && m < londonEnd) londonDays.get(y).add(day);
}
for (const y of years) {
  const s = yearStats[y];
  s.devDays = yearDays.get(y).size;
  s.barsPerDevDay = +(s.devBars / s.devDays).toFixed(2);
  s.asianBarsPerDevDay = +(s.asianBars / s.devDays).toFixed(2);
  s.asianValidRangeDays = asianDays.get(y).size;
  s.londonOrbValidRangeDays = londonDays.get(y).size;
  const asianPerDay = [...yearDays.get(y)].map((d) => asianCountsByYearDay.get(y).get(d) ?? 0);
  s.minAsianBarsPerDevDay = Math.min(...asianPerDay);
  s.maxAsianBarsPerDevDay = Math.max(...asianPerDay);

}

const cardMap = new Map(CLAIM_CARDS.map((c) => [c.id,c]));
const oldSignal = JSON.parse(readFileSync(join(ART,"amendment6/signal-counts.json"),"utf8"));
const oldCardReports = new Map(oldSignal.cards.map((c)=>[c.cardId,c]));
const cards = [];
const detailedSignals = {};
for (const id of FROZEN_TEST_SEQUENCE) {
  const card = cardMap.get(id);
  const emitted = emitSignals(bars,id,{states:states.map((s)=>(s && STATES.includes(s) ? s : null))});
  const dev = emitted.filter((r)=>roles[r.index]==="DEV");
  detailedSignals[id] = dev;
  const byYear = years.map((year)=>{
    const match = dev.filter((r)=>+r.datetime.slice(0,4)===year);
    const signalDays = new Set(match.map((r)=>r.datetime.slice(0,10))).size;
    const denom = yearStats[year].devDays;
    const rangeBase = id === "asian-range-break" ? yearStats[year].asianValidRangeDays
      : id === "london-orb-30" ? yearStats[year].londonOrbValidRangeDays : null;
    return {
      year,
      signals: match.length,
      zeroSignal: match.length === 0,
      firstSignalDate: match.length ? match[0].datetime.slice(0,10) : null,
      lastSignalDate: match.length ? match.at(-1).datetime.slice(0,10) : null,
      signalDays,
      devDays: denom,
      signalDayShareOfDevDays: denom ? +(signalDays/denom).toFixed(6) : null,
      validRangeDays: rangeBase,
      signalDayShareOfValidRangeDays: rangeBase === null ? null : rangeBase ? +(signalDays/rangeBase).toFixed(6) : null,
    };
  });
  const oldRow = oldCardReports.get(id);
  const before = oldRow?.devSignals ?? null;
  const oldSides = oldRow?.buckets?.side ?? {};
  const newSides = Object.fromEntries(["long","short"].map((side)=>[side,dev.filter((r)=>r.side===side).length]));
  cards.push({
    id, family: card.family, variant: card.variant, status: "DRAFT",
    strengthState: card.strength.state, weaknessState: card.weakness.state,
    parameters: SIGNAL_PARAMS[id], parametersString: paramsToString(id),
    oldDevSignalsA6: before, newDevSignalsA7: dev.length,
    oldDevSignalsBySideA6: { long: oldSides.long ?? 0, short: oldSides.short ?? 0 },
    newDevSignalsBySideA7: newSides,
    sideSignalDeltas: { long: newSides.long-(oldSides.long??0), short: newSides.short-(oldSides.short??0) },
    totalSignalDelta: before === null ? null : dev.length-before,
    zeroSignalYears: byYear.filter((x)=>x.zeroSignal).map((x)=>x.year),
    byYear,
  });
}

const rangeDiagnostics = {
  asianClockWindowEat: `${String(SESSION_WINDOWS_EAT.asian.start/60).padStart(2,"0")}:00–${String(Math.floor(SESSION_WINDOWS_EAT.asian.end/60)).padStart(2,"0")}:${String(SESSION_WINDOWS_EAT.asian.end%60).padStart(2,"0")}`,
  londonOpeningRangeEat: "11:00–11:29 (timestamps [11:00,11:30)); entry eligibility from 11:30",
  validRangeDefinition: "At least one observed M30 bar in the specified clock window on that DEV EAT calendar date; no range outcomes are evaluated.",
  years: yearStats,
  causeOfPriorAsianZeroSignals: "A6 required the first 20 observed Asian-session bars. The observed Asian window averaged fewer than 20 bars/day in each pre-2011 DEV year (yearly means are recorded below), so the guard skipped every entry; the corrected A7 evaluator ranges all observed bars in Asian clock window 01:00–10:59 and no longer requires 20 bars.",
};
const report = {
  generatedAt: new Date().toISOString(),
  purpose: "Signals-only, pre-outcome DEV diagnostics for G0 Amendment 7; no strategy outcomes, exits, costs, or verification run.",
  sourceArtifacts: ["artifacts/map-compass/normalized/xauusd-m30-eat.csv","artifacts/map-compass/normalized/xauusd-m30-map.csv","artifacts/map-compass/amendment6/signal-counts.json"],
  devYears: years,
  barsAndRangeDiagnostics: rangeDiagnostics,
  cards,
  zeroSignalCardYears: cards.flatMap((c)=>c.zeroSignalYears.map((year)=>({cardId:c.id,year}))),
};
writeFileSync(join(OUT,"signal-yearly.json"),JSON.stringify(report,null,2)+"\n");
console.log(`A7 signals-only report: ${cards.length} cards, ${report.zeroSignalCardYears.length} zero-signal card-years`);
console.log("year | DEV days | M30 bars/day | Asian bars/day | Asian range days | London ORB range days");
for (const y of years) { const r=yearStats[y]; console.log(`${y} | ${r.devDays} | ${r.barsPerDevDay} | ${r.asianBarsPerDevDay} | ${r.asianValidRangeDays} | ${r.londonOrbValidRangeDays}`); }
for (const id of ["asian-range-break","london-orb-30","classic-pivot","three-soldiers-crows"]) {
  const c=cards.find((x)=>x.id===id);
  console.log(`${id}: A6 ${c.oldDevSignalsA6} -> A7 ${c.newDevSignalsA7} (delta ${c.totalSignalDelta})`);
}
