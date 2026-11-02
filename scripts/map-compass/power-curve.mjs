#!/usr/bin/env node
/** G0 Amendment 6 — family × verdict report-only power, before any result.
 * The verdict unit is family × EFFICIENT/CHOPPY. Counts are summed from each
 * card's one-slot survivors; Kish adjusts same-bar overlap within that cell,
 * and measured random-baseline CR1/day inflation adjusts the SE. No strategy
 * outcomes or verification are used.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CLAIM_CRITERIA, VERDICT_STATES } from "./frozen.mjs";
import { FAMILIES, CLAIM_CARDS } from "./claim-cards.draft.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass");
const BASE = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
const SLOT = JSON.parse(readFileSync(join(OUT, "slot-model.json"), "utf8"));
const EDGES = [0, 0.05, 0.10, 0.15, 0.20, 0.30];
const RUNS = 10000;

const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) {
  const sign = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592);
  return sign * (1 - polynomial * t * Math.exp(-a * a));
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function baseStats(vs, session) {
  let n=0, sum=0, second=0;
  for (const [key, c] of Object.entries(BASE.fineCellsVerdictState ?? {})) {
    const [v, , se] = key.split("|");
    if (v !== vs || se !== session || !c.n) continue;
    n += c.n; sum += c.n*c.meanNetR; second += c.n*((c.sd||0)**2+c.meanNetR**2);
  }
  const mean = n ? sum/n : 0;
  return { n, mean, sd: n ? Math.sqrt(Math.max(0, second/n-mean*mean)) : 1.43 };
}
const inflation = Object.fromEntries(VERDICT_STATES.map(v => [v, BASE.dailySe?.[v]?.inflation ?? 1]));

function simulate(cell, familyIndex, stateIndex) {
  const state = cell.verdictState;
  const sessionN = cell.nBySession ?? {};
  let baseN=0, baseSum=0, baseSecond=0;
  for (const [session,n] of Object.entries(sessionN)) {
    const b=baseStats(state,session); baseN+=n; baseSum+=n*b.mean; baseSecond+=n*(b.sd*b.sd+b.mean*b.mean);
  }
  const baselineMean = baseN ? baseSum/baseN : 0;
  const baselineSd = baseN ? Math.sqrt(Math.max(0,baseSecond/baseN-baselineMean*baselineMean)) : 1.43;
  const cr1 = inflation[state] ?? 1;
  const nEff = Math.max(1,cell.nEffective || cell.n);
  const se = baselineSd*cr1/Math.sqrt(nEff);
  const years = Object.keys(cell.tradesByYear ?? {}).sort();
  const curve = {};
  for (const edge of EDGES) {
    const counts={confirmed:0,netGatePass:0,excessGatePass:0,netFloor:0,tNet:0,excess:0,tExcess:0,concentration:0,loyo:0,minN:0,noBaseline:0,exclusive:{}};
    const random=rng(0xA611E9B3+Math.round(edge*10000)+familyIndex*4099+stateIndex*179);
    for(let run=0;run<RUNS;run++){
      const noise=se*normal(random), estimatedNet=edge+noise, estimatedExcess=edge-baselineMean+noise;
      const netFloor=estimatedNet<=CLAIM_CRITERIA.practicalFloorR, tnet=estimatedNet/se<=CLAIM_CRITERIA.tStatMin;
      const excess=estimatedExcess<=CLAIM_CRITERIA.excessFloorR, texcess=estimatedExcess/se<=CLAIM_CRITERIA.tStatMin;
      let positiveTotal=0,maxPositiveYear=0,positiveYears=0,eligibleYears=0;
      for(const y of years){const ny=cell.tradesByYear[y];if(ny<5)continue;eligibleYears++;const yMean=(edge-baselineMean)+baselineSd*cr1/Math.sqrt(ny)*normal(random);const total=yMean*ny;if(total>0){positiveYears++;positiveTotal+=total;maxPositiveYear=Math.max(maxPositiveYear,total);}}
      const concentration=positiveTotal>0&&maxPositiveYear/positiveTotal>CLAIM_CRITERIA.concentrationMax;
      const loyo=eligibleYears<2||positiveYears/eligibleYears<CLAIM_CRITERIA.loyoPositiveMin;
      const minN=cell.n<CLAIM_CRITERIA.minTradesPerCell, noBaseline=false;
      const netGatePass=!netFloor&&!tnet, excessGatePass=!excess&&!texcess;
      if(netGatePass)counts.netGatePass++; if(excessGatePass)counts.excessGatePass++;
      if(netFloor)counts.netFloor++;if(tnet)counts.tNet++;if(excess)counts.excess++;if(texcess)counts.tExcess++;
      if(concentration)counts.concentration++;if(loyo)counts.loyo++;if(minN)counts.minN++;if(noBaseline)counts.noBaseline++;
      const failures=[];if(minN)failures.push("minN");if(noBaseline)failures.push("noBaseline");if(netFloor)failures.push("netFloor");if(tnet)failures.push("tNet");if(excess)failures.push("excess");if(texcess)failures.push("tExcess");if(concentration)failures.push("concentration");if(loyo)failures.push("loyo");
      if(!failures.length)counts.confirmed++;
      const first=failures[0]||"pass";counts.exclusive[first]=(counts.exclusive[first]||0)+1;
    }
    const p=counts.confirmed/RUNS;
    const analytic=normCdf((edge-Math.max(CLAIM_CRITERIA.practicalFloorR,2*se))/se);
    curve[edge]={runs:RUNS,confirmed:counts.confirmed,probability:+p.toFixed(5),failureShare:{netFloor:+(counts.netFloor/RUNS).toFixed(5),tNet:+(counts.tNet/RUNS).toFixed(5),excess:+(counts.excess/RUNS).toFixed(5),tExcess:+(counts.tExcess/RUNS).toFixed(5),concentration:+(counts.concentration/RUNS).toFixed(5),loyo:+(counts.loyo/RUNS).toFixed(5),minN:+(counts.minN/RUNS).toFixed(5),noBaseline:0},exclusiveFailureShare:Object.fromEntries(Object.entries(counts.exclusive).map(([k,v])=>[k,+(v/RUNS).toFixed(5)])),analyticNetGateProbability:+analytic.toFixed(5),mcNetGateProbability:+(counts.netGatePass/RUNS).toFixed(5),analyticNetGateCrossCheckDifference:+(counts.netGatePass/RUNS-analytic).toFixed(5)};
  }
  return { ...cell, cell:`${cell.family}|${cell.verdictState}`, baselineMeanR:+baselineMean.toFixed(5), measuredSdR:+baselineSd.toFixed(5), measuredCr1DayInflation:+cr1.toFixed(5), seAtKishN:+se.toFixed(7), powerCurve:curve };
}

const cells=[];
for(let fi=0;fi<FAMILIES.length;fi++) for(let si=0;si<VERDICT_STATES.length;si++) {
  const family=FAMILIES[fi], verdictState=VERDICT_STATES[si], key=`${family}|${verdictState}`;
  const input=SLOT.familyPowerStructure[key];
  if(!input) throw new Error(`slot-model missing family × verdict cell ${key}`);
  const card=CLAIM_CARDS.find(c=>c.family===family);
  cells.push(simulate({...input,strengthState:card.strength.state,weaknessState:card.weakness.state},fi,si));
}
const thinPowerCells=cells.filter(c=>c.powerCurve[0.2].probability<0.5).map(c=>({family:c.family,verdictState:c.verdictState,powerAt0_20R:c.powerCurve[0.2].probability,n:c.n,nEffective:c.nEffective,designation:"THIN-POWER (diagnostic only; no criterion change)"}));
const edgeRows=EDGES.map(edge=>({edgeR:edge,cells:cells.map(c=>({family:c.family,verdictState:c.verdictState,probability:c.powerCurve[edge].probability,analyticNetGateProbability:c.powerCurve[edge].analyticNetGateProbability,mcNetGateProbability:c.powerCurve[edge].mcNetGateProbability,analyticNetGateCrossCheckDifference:c.powerCurve[edge].analyticNetGateCrossCheckDifference}))}));
const report={generatedAt:new Date().toISOString(),id:"G0-AMENDMENT-6-FAMILY-POWER-CURVE",date:"2026-11-02",reportOnly:true,criteriaChanged:false,thresholdChanged:false,verdictChanged:false,unit:"family × verdict state (one decision cell per family's strength/weakness half)",edgesR:EDGES,simulationRunsPerCellEdge:RUNS,definition:{confirmed:"Unchanged frozen conjunction: meanNetR > +0.10R AND day-clustered tNet > 2 AND excessVsRandomR > 0 AND day-clustered t > 2 AND n >= 100 AND concentration <= 0.50 AND LOYO >= 0.75 AND NO_BASELINE clear.",eligibleSameBarCandidates:"74,886 means eligible EFFICIENT/CHOPPY signal instances across the 24-card pre-deletion A5 library, reduced to unique bar indices after lowest-priority same-bar resolution, before the one-slot book dropped occupied-period candidates. This historical denominator is not recomputed as if the deleted cards had never existed.",thinPower:"THIN-POWER is a diagnostic label only: family × verdict power at true net +0.20R below 0.50. It does not change any criterion or threshold."},method:{counts:"A6 per-family × verdict n is the sum of surviving card-specific one-slot records. Kish nEffective is recomputed over duplicate kept entry bars within each family/state; same-bar duplicates are not falsely counted as independent information.",dayClustering:"Use measured random-entry-baseline CR1/plain-SE inflation per verdict state, clustered by canonical EAT calendar date: 1.3222 EFFICIENT and 1.1202 CHOPPY. Family-cell SE = matching-session-weighted random-baseline SD × measured verdict-state CR1 inflation / sqrt(Kish nEffective). Actual family cell date/year counts are preserved in slot-model.json.",baselines:"Random-baseline means/SDs are weighted by that family/state's measured session mix using existing state × session matched-control fine cells.",simulation:"10,000 parametric runs per family × verdict × edge, common net/excess noise, and measured per-year survivor counts for concentration/LOYO simulations; NO strategy returns, exits or claim results are used.",analyticCrossCheck:"Net-gate P(meanNet > .10 AND tNet > 2) = Phi((edge - max(.10, 2*SE))/SE). Monte Carlo estimates of the same net gate are recorded alongside the analytic value."},dependence:{baselineCr1Inflation:inflation,unitSpecificKish:"familyPowerStructure contains n, nEffective, design effect, per-day counts, per-year counts, and session composition for every family × verdict state."},cells,thinPowerCells,edgeRows,requestedPooledConstraintCorrection:"Pooled power below a component cell's power is expected at true edges below +0.10R due to the frozen absolute-mean floor. The 'never below' relation applies only at edges at or above +0.10R; no rule or threshold was changed.",note:"Report-only capacity/power model; not strategy verification. Cards remain DRAFT. No Map, state, parameter, priority, cost, exit or CONFIRMED criterion changed."};
writeFileSync(join(OUT,"power-curve.json"),JSON.stringify(report,null,2)+"\n");
for(const c of cells) console.log(`${c.family.padEnd(24)} ${c.verdictState.padEnd(9)} n=${String(c.n).padStart(5)} nEff=${String(c.nEffective).padStart(7)} p(.20)=${c.powerCurve[.2].probability}${c.powerCurve[.2].probability<.5?' THIN-POWER':''}`);
console.log("THIN-POWER cells:",JSON.stringify(thinPowerCells));
