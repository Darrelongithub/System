import { test, assert, assertEqual } from "../tiny.mjs";
import { emitSignals } from "../../scripts/map-compass/lib/signals.mjs";
import { verifyClaim } from "../../scripts/map-compass/lib/verification.mjs";
import { buildRoutingTable, DRIFT_DEPENDENT_NOT_ENABLED } from "../../scripts/map-compass/lib/compass.mjs";
import { CLAIM_CARDS } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { SIGNAL_PARAMS } from "../../scripts/map-compass/signal-params.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const ROOT=fileURLToPath(new URL("../..",import.meta.url));
const bars=(rows)=>rows.map(([time,o,h,l,c])=>({datetime:`2021-01-04 ${time}:00`,o,h,l,c}));

test("A7: Asian range uses all observed Asian clock-window bars; fewer than 20 is valid",()=>{
  const b=bars([
    ["01:00",99,101,99,100],
    ["10:30",99,100,98,99],
    ["11:00",99,100,99,99],
    ["11:30",100,102,99,101],
  ]);
  const rows=emitSignals(b,"asian-range-break");
  assert(rows.some((r)=>r.index===3&&r.side==="long"),"two observed Asian bars must build a range and trigger the London break");
  assertEqual(SIGNAL_PARAMS["asian-range-break"].rangeBars,undefined);
});

test("A7: London ORB is the 11:00–11:29 EAT clock window, not six M30 bars",()=>{
  const b=bars([
    ["11:00",99,100,98,99],
    ["11:30",99,102,99,101],
  ]);
  const rows=emitSignals(b,"london-orb-30");
  assert(rows.some((r)=>r.index===1&&r.side==="long"),"one observed 30-minute opening bar must be sufficient");
  assertEqual(SIGNAL_PARAMS["london-orb-30"].rangeMinutes,30);
});

test("A7: classic pivot uses prior-day close in PP and the previous bar's close is exposed causally",()=>{
  const src=readFileSync(join(ROOT,"scripts/map-compass/lib/signals.mjs"),"utf8");
  assert(src.includes("const pp = (prev.hi + prev.lo + prev.close) / 3;"));
  assert(src.includes("close: bars[j].c"));
});

test("A7: three white soldiers are LONG and three black crows are SHORT",()=>{
  const bullish=bars([
    ["00:00",100,101,99,100], ["00:30",100,101,99,100],
    ["01:00",99,101,98,100.8], ["01:30",100,102,99,101.8], ["02:00",101,103,100,102.8],
  ]);
  const bearish=bars([
    ["00:00",100,101,99,100], ["00:30",100,101,99,100],
    ["01:00",102,103,100,100.2], ["01:30",101,102,99,99.2], ["02:00",100,101,98,98.2],
  ]);
  assert(emitSignals(bullish,"three-soldiers-crows").some((r)=>r.index===4&&r.side==="long"));
  assert(emitSignals(bearish,"three-soldiers-crows").some((r)=>r.index===4&&r.side==="short"));
  const c=CLAIM_CARDS.find((x)=>x.id==="three-soldiers-crows");
  assertEqual(c.strength.state,"CHOPPY");assertEqual(c.weakness.state,"EFFICIENT");
});

test("A7: year-matched baseline reports 100 fixed-seed entries for every cell-year",()=>{
  const r=JSON.parse(readFileSync(join(ROOT,"artifacts/map-compass/amendment7/year-matched-baseline.json"),"utf8"));
  assertEqual(r.totals.yearCellRows,432);assertEqual(r.totals.unavailable.length,0);
  assert(Object.values(r.byCellYear).every((x)=>x.n===100));
  assertEqual(r.design.baselineOnlyNoStrategyOutcome,true);
});

test("A7: year-matched excess t<=2 is tagged and Compass blocks absent VAL confirmation",()=>{
  const n=120;
  const trades=Array.from({length:n},(_,i)=>({
    netR:0.5,year:2004,state:"EXPANSION",verdictState:"EFFICIENT",side:"long",session:"london",vol:"low",
    day:`2004-02-${String((i%28)+1).padStart(2,"0")}`,entryBar:i,
  }));
  const baseline={
    fineCellsVerdictState:{"EFFICIENT|long|london|low":{n:200,meanNetR:0,sufficient:true}},
    yearMatchedCells:{"EFFICIENT|long|london|low|2004":{meanNetR:0.49,baselineSamplingSe:0.1,source:"fine-cell|year"}},
  };
  const stats=verifyClaim(trades,{baseline});
  assertEqual(stats.yearMatchedControl.tag,"DRIFT_DEPENDENT");
  assert(stats.yearMatchedControl.excessSeIncludingBaselineSampling>0);
  const card={id:"fixture",priority:1,strength:{state:"EFFICIENT"},weakness:{state:"CHOPPY"}};
  const verdicts={"fixture|EFFICIENT":"CONFIRMED","fixture|CHOPPY":"INCONCLUSIVE"};
  const record={claimId:"fixture",kind:"strength",windowKind:"DEV",verdict:"CONFIRMED",stats:{driftDependent:true,yearMatchedControl:{tag:"DRIFT_DEPENDENT"}}};
  const routed=buildRoutingTable(verdicts,[card],{records:[record]});
  assertEqual(routed.reasons.find((x)=>x.id==="fixture").decision,DRIFT_DEPENDENT_NOT_ENABLED);
  assert(!routed.table.EFFICIENT.includes("fixture"));
  const val={...record,windowKind:"VAL",stats:{n:150,meanNetR:0.3,tNet:3,excessVsRandomR:0.2,t:2.5,baseline:{mode:"MATCHED_CONTROL",missing:0},vetoes:[],yearMatchedControl:{completeForCell:true,t:2.2}}};
  const promoted=buildRoutingTable(verdicts,[card],{records:[record,val]});
  assert(promoted.table.EFFICIENT.includes("fixture"),"independent passing VAL record may promote DRIFT_DEPENDENT claim");
  assertEqual(promoted.reasons.find((x)=>x.id==="fixture").driftValidationSupport,true);
});
