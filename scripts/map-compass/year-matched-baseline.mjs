#!/usr/bin/env node
/**
 * G0 Amendment 7 report-only year-matched random-entry control.
 * No strategy signal/trade/outcome artifact is loaded or generated.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { ROLES, STATES, VERDICT_STATES, VERDICT_STATE_OF, MAP, RANDOM_BASELINE, CLAIM_CRITERIA } from "./frozen.mjs";
import { trueRanges } from "./lib/map.mjs";
import { sessionOfEat } from "./lib/dst.mjs";
import { volRegimeOf } from "./lib/cost.mjs";
import { resolveTrade } from "./lib/trade.mjs";
import { mulberry32 } from "./lib/placebo.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const OUT = join(ART, "amendment7");
mkdirSync(OUT,{recursive:true});
const bars = [...dataLines(readFileSync(join(ART,"normalized/xauusd-m30-eat.csv"),"utf8"),{delimiter:","})]
  .filter((f)=>f[0]!=="datetime").map((f)=>({datetime:f[0],o:num(f[1]),h:num(f[2]),l:num(f[3]),c:num(f[4])}))
  .filter((b)=>[b.o,b.h,b.l,b.c].every(Number.isFinite));
const mapLines=readFileSync(join(ART,"normalized/xauusd-m30-map.csv"),"utf8").split("\n").filter((l)=>l&&!l.startsWith("datetime"));
const states=new Array(bars.length).fill(null), roles=new Array(bars.length).fill(null);
let bi=0;
for(const line of mapLines){const f=line.split(",");while(bi<bars.length&&bars[bi].datetime!==f[0])bi++;if(bi>=bars.length)break;states[bi]=f[1];roles[bi]=f[12];bi++;}
const years=[...new Set(ROLES.DEV)].sort((a,b)=>a-b);
const tr=trueRanges(bars), atr=new Float64Array(bars.length).fill(NaN);
let sum=0;
for(let i=0;i<bars.length;i++){sum+=tr[i];if(i>=MAP.atrPeriod)sum-=tr[i-MAP.atrPeriod];if(i>=MAP.atrPeriod-1)atr[i]=sum/MAP.atrPeriod;}
const finePool=new Map(),parentPool=new Map();
const yearOf=(i)=>+bars[i].datetime.slice(0,4);
for(let i=MAP.warmupBars;i<bars.length;i++){
  const y=yearOf(i), state=states[i], vs=VERDICT_STATE_OF[state];
  if(!ROLES.DEV.includes(y)||roles[i]!=="DEV"||!STATES.includes(state)||!Number.isFinite(atr[i])||atr[i]<=0)continue;
  // All future bars that could resolve this sampled entry must remain within DEV and the same year.
  if(i+RANDOM_BASELINE.maxHoldBars>=bars.length)continue;
  let safe=true;for(let k=i;k<=i+RANDOM_BASELINE.maxHoldBars;k++){if(roles[k]!=="DEV"||yearOf(k)!==y){safe=false;break;}}
  if(!safe)continue;
  const session=sessionOfEat(bars[i].datetime),vol=volRegimeOf(bars[i]);
  for(const side of ["long","short"]){
    const p={i,year:y,state,vs,side,session,vol,atr:atr[i]};
    const fk=`${vs}|${side}|${session}|${vol}|${y}`;
    const pk=`${vs}|${side}|${y}`;
    if(!finePool.has(fk))finePool.set(fk,[]);finePool.get(fk).push(p);
    if(!parentPool.has(pk))parentPool.set(pk,[]);parentPool.get(pk).push(p);
  }
}
const MIN=100;
const SEED=RANDOM_BASELINE.seed+20261102;
const rng=mulberry32(SEED);
const mean=(a)=>a.reduce((s,x)=>s+x,0)/(a.length||1);
const sd=(a)=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-mean(a))**2,0)/(a.length-1));
const annual={}, cells={}, unavailable=[];
let added=0, fineExact=0, fallbackCount=0, total=0;
function draw(pool,side){
  const p=pool[Math.floor(rng()*pool.length)];
  const t=resolveTrade(bars,p.i,side,p.atr,{session:p.session,vol:p.vol,variant:"baseline",maxBars:RANDOM_BASELINE.maxHoldBars});
  return {netR:t.netR,barIndex:p.i,day:bars[p.i].datetime.slice(0,10),barsHeld:t.barsHeld,outcome:t.outcome};
}
for(const y of years)for(const vs of VERDICT_STATES)for(const side of ["long","short"])for(const session of ["asian","london","ny"])for(const vol of ["low","mid","high"]){
  const fineKey=`${vs}|${side}|${session}|${vol}|${y}`;
  const parentKey=`${vs}|${side}|${y}`;
  const exact=finePool.get(fineKey)??[];
  const fallback=exact.length<MIN;
  const pool=fallback?(parentPool.get(parentKey)??[]):exact;
  const cellKey=`${vs}|${side}|${session}|${vol}`;
  if(!pool.length){unavailable.push({cell:cellKey,year:y,exactCandidateBars:exact.length,fallbackCandidateBars:0});continue;}
  const rs=[];let topup=0;
  for(let n=0;n<MIN;n++){rs.push(draw(pool,side).netR);total++;}
  // All draws are deterministic with replacement. This is the fixed-seed top-up to the frozen 100-entry annual floor.
  topup=MIN;added+=topup;
  if(fallback)fallbackCount++;else fineExact++;
  const m=mean(rs),s=sd(rs),se=s/Math.sqrt(rs.length);
  const row={cell:cellKey,year:y,verdictState:vs,side,session,vol,n:rs.length,meanNetR:+m.toFixed(8),sd:+s.toFixed(8),baselineSamplingSe:+se.toFixed(8),exactCandidateBars:exact.length,source:fallback?"side|verdictState|year":"fine-cell|year",fallback,topupEntries:topup};
  annual[`${cellKey}|${y}`]=row;
  if(!cells[cellKey])cells[cellKey]=[];cells[cellKey].push(row);
}
const legacy=JSON.parse(readFileSync(join(ART,"random-baseline.json"),"utf8"));
const fineCellSummary={};
for(const [key,yrRows] of Object.entries(cells)){
  const values=yrRows.map((r)=>r.meanNetR),ses=yrRows.map((r)=>r.baselineSamplingSe),n=yrRows.length;
  const annualMean=mean(values), annualSe=Math.sqrt(ses.reduce((s,x)=>s+x*x,0))/(n||1);
  const old=legacy.fineCellsVerdictState[key];
  const oldMean=old?.meanNetR??null;
  const oldSe=old&&old.n>1?old.sd/Math.sqrt(old.n):null;
  const shift=oldMean===null?null:oldMean-annualMean;
  const shiftSe=oldSe===null?null:Math.sqrt(oldSe*oldSe+annualSe*annualSe);
  fineCellSummary[key]={nYearCells:n,yearMatchedMeanEqualYearWeight:+annualMean.toFixed(8),yearMatchedBaselineSamplingSe:+annualSe.toFixed(8),legacyMatchedMean:oldMean,legacyN:old?.n??0,legacySe:oldSe===null?null:+oldSe.toFixed(8),legacyMinusYearMatchedControlDeltaR:shift===null?null:+shift.toFixed(8),controlDeltaSeIncludingBothSamplingErrors:shiftSe===null?null:+shiftSe.toFixed(8),controlDeltaT:shiftSe>0?+(shift/shiftSe).toFixed(5):null,positiveLegacyMean:oldMean!==null&&oldMean>0,positiveYearMatchedMean:annualMean>0};
}
const positiveLegacy=Object.values(fineCellSummary).filter((x)=>x.positiveLegacyMean).map((x)=>x);
const positiveYearMatched=Object.values(fineCellSummary).filter((x)=>x.positiveYearMatchedMean).length;
const report={
  generatedAt:new Date().toISOString(),
  status:"REPORT_ONLY — randomized control entries only; no strategy signals, strategy trades, or strategy outcome used.",
  design:{key:"verdictState|side|session|volRegime|year",minRandomEntriesPerCellYear:MIN, fallbackKey:"side|verdictState|year when fewer than 100 distinct eligible fine-cell candidate bars exist in the cell-year pool",topUp:"deterministic with-replacement random-entry draws to n=100",seed:SEED,seedDerivation:"RANDOM_BASELINE.seed + 20261102",sameHarness:true,stopTargetCostsAndMaxHold:"exactly RANDOM_BASELINE and existing resolveTrade baseline harness",devYearBoundary:"candidate and all 96 possible resolving bars must remain in the same DEV year",baselineOnlyNoStrategyOutcome:true},
  totals:{yearCellRows:Object.keys(annual).length,requiredYearCells:years.length*2*2*3*3,randomEntries:total,fineExactCells:fineExact,fallbackCells:fallbackCount,fixedSeedEntriesGenerated:added,unavailable},
  fineCellMeans:fineCellSummary,
  byCellYear:annual,
  controlCalibration:{legacyFineCells:Object.keys(fineCellSummary).length,positiveLegacyFineCellCount:positiveLegacy.length,positiveLegacyCells:Object.entries(fineCellSummary).filter(([,x])=>x.positiveLegacyMean).map(([k,x])=>({cell:k,meanNetR:x.legacyMatchedMean,n:x.legacyN})),positiveYearMatchedFineCellCount:positiveYearMatched,interpretation:"legacyMinusYearMatchedControlDeltaR and its combined baseline sampling SE compare two random-entry controls only. They are not strategy excess and do not determine a verdict."},
  prospectiveExcess:{computed:false,reason:"No strategy outcomes were run. For a future diagnostic, cell-year excess = strategy mean signed netR minus this matched random mean; excess SE must combine the strategy day-clustered variance with baseline sampling variance, including the weighted sum of per-cell-year baseline variances. DRIFT_DEPENDENT is diagnostic when year-matched excess t<=2 and is not a CONFIRMED verdict."},
};
writeFileSync(join(OUT,"year-matched-baseline.json"),JSON.stringify(report,null,2)+"\n");
console.log(`A7 year-matched baseline: ${total.toLocaleString()} random entries, ${Object.keys(annual).length}/${years.length*36} cell-years; ${fineExact} exact-cell, ${fallbackCount} fallback, ${unavailable.length} unavailable`);
console.log(`legacy fine-cell means >0: ${positiveLegacy.length}/${Object.keys(fineCellSummary).length}; year-matched equal-year means >0: ${positiveYearMatched}/${Object.keys(fineCellSummary).length}`);
