#!/usr/bin/env node
/** G0 Amendment 5 — corrected report-only power analysis.
 * Uses measured card-specific slot survivor counts, actual per-session split,
 * calendar-day clusters, year counts, and the frozen verifyClaim conjunction.
 * No result, parameter, threshold, or card state is changed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { VERDICT_STATES, FOUR_STATES_OF, CLAIM_CRITERIA } from "./frozen.mjs";
const ROOT=fileURLToPath(new URL("../..",import.meta.url)), OUT=join(ROOT,"artifacts/map-compass");
const BASE=JSON.parse(readFileSync(join(OUT,"random-baseline.json"),"utf8"));
const SLOT=JSON.parse(readFileSync(join(OUT,"slot-model.json"),"utf8"));
const EDGES=[0,.05,.10,.15,.20,.30], SESSIONS=["asian","london","ny"], RUNS=10000;
const normCdf=x=>0.5*(1+erf(x/Math.SQRT2));
function erf(x){const s=x<0?-1:1,a=Math.abs(x),t=1/(1+0.3275911*a);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-a*a));}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function normal(r){let u=Math.max(r(),1e-12),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function baseStats(vs,session){let n=0,sum=0,second=0;for(const [k,c] of Object.entries(BASE.fineCellsVerdictState||{})){const [v,side,se]=k.split("|");if(v!==vs||se!==session||!c.n)continue;n+=c.n;sum+=c.n*c.meanNetR;second+=c.n*((c.sd||0)**2+c.meanNetR**2);}const mean=n?sum/n:0;return{n,mean,sd:n?Math.sqrt(Math.max(0,second/n-mean*mean)):1.43};}
const inflation=Object.fromEntries(VERDICT_STATES.map(v=>[v,BASE.dailySe?.[v]?.inflation??1]));
const cells=[];
for(const vs of VERDICT_STATES){
  const stateSession={};
  for(const se of SESSIONS){const key=`${vs}|${se}`,p=SLOT.powerStructure[key];if(!p)throw Error(`slot-model missing ${key}`);stateSession[se]={...p,baseline:baseStats(vs,se)};}
  const pooled={n:0,nEffective:0,distinctEntryBars:0,dayTradeCounts:[],tradesByYear:{},baseline:{n:0,mean:0,sd:0}};
  // Pooled n is exactly the sum of the three measured session counts. Merge the true calendar days/years.
  for(const se of SESSIONS){const p=stateSession[se];pooled.n+=p.n;pooled.distinctEntryBars+=p.distinctEntryBars;pooled.dayTradeCounts.push(...p.dayTradeCounts);for(const [y,n] of Object.entries(p.tradesByYear))pooled.tradesByYear[y]=(pooled.tradesByYear[y]||0)+n;pooled.baseline.n+=p.n;pooled.baseline.mean+=p.n*p.baseline.mean;}
  pooled.baseline.mean=pooled.baseline.n?pooled.baseline.mean/pooled.baseline.n:0;
  let bSecond=0;for(const se of SESSIONS){const p=stateSession[se],w=p.n;bSecond+=w*(p.baseline.sd**2+p.baseline.mean**2);}pooled.baseline.sd=pooled.baseline.n?Math.sqrt(Math.max(0,bSecond/pooled.baseline.n-pooled.baseline.mean**2)):1.43;
  // Exact Kish effective count from deduplicated entry bars across sessions is included in slot artifact below; fallback formula is conservative.
  const pooledPower=SLOT.powerStructure[`${vs}|POOLED`];
  if(pooledPower){pooled.nEffective=pooledPower.nEffective;pooled.distinctEntryBars=pooledPower.distinctEntryBars;pooled.dayTradeCounts=pooledPower.dayTradeCounts;pooled.tradesByYear=pooledPower.tradesByYear;}else pooled.nEffective=stateSession.asian.nEffective+stateSession.london.nEffective+stateSession.ny.nEffective;
  const candidates=[...SESSIONS.map(se=>({verdictState:vs,session:se,...stateSession[se]})),{verdictState:vs,session:"POOLED",...pooled}];
  for(const c of candidates){
    const nEff=Math.max(1,c.nEffective||c.n), sigma=c.baseline.sd, inflate=inflation[vs]||1, se=sigma*inflate/Math.sqrt(nEff);
    const yearCounts=c.tradesByYear, years=Object.keys(yearCounts).sort();
    const curve={};
    for(const edge of EDGES){
      const counts={confirmed:0,netGatePass:0,excessGatePass:0,netFloor:0,tNet:0,excess:0,tExcess:0,concentration:0,loyo:0,minN:0,noBaseline:0,exclusive:{}};
      const random=rng(0xA511E9B3+Math.round(edge*10000)+vs.length*91+c.session.length*13);
      for(let run=0;run<RUNS;run++){
        const noise=se*normal(random),estimatedNet=edge+noise,estimatedExcess=edge-c.baseline.mean+noise;
        const netFloor=estimatedNet<=CLAIM_CRITERIA.practicalFloorR,tnet=estimatedNet/se<=CLAIM_CRITERIA.tStatMin;
        const excess=estimatedExcess<=CLAIM_CRITERIA.excessFloorR,texcess=estimatedExcess/se<=CLAIM_CRITERIA.tStatMin;
        let positiveTotal=0,maxPositiveYear=0,positiveYears=0,eligibleYears=0;
        for(const y of years){const ny=yearCounts[y];if(ny<5)continue;eligibleYears++;const yMean=(edge-c.baseline.mean)+sigma*inflate/Math.sqrt(ny)*normal(random);const total=yMean*ny;if(total>0){positiveYears++;positiveTotal+=total;maxPositiveYear=Math.max(maxPositiveYear,total);}}
        const concentration=positiveTotal>0&&maxPositiveYear/positiveTotal>CLAIM_CRITERIA.concentrationMax;
        const loyo=eligibleYears<2||positiveYears/eligibleYears<CLAIM_CRITERIA.loyoPositiveMin;
        const minN=c.n<CLAIM_CRITERIA.minTradesPerCell,noBaseline=false;
        const netGatePass=!netFloor&&!tnet,excessGatePass=!excess&&!texcess;if(netGatePass)counts.netGatePass++;if(excessGatePass)counts.excessGatePass++;if(netFloor)counts.netFloor++;if(tnet)counts.tNet++;if(excess)counts.excess++;if(texcess)counts.tExcess++;if(concentration)counts.concentration++;if(loyo)counts.loyo++;if(minN)counts.minN++;if(noBaseline)counts.noBaseline++;
        const failures=[];if(minN)failures.push("minN");if(noBaseline)failures.push("noBaseline");if(netFloor)failures.push("netFloor");if(tnet)failures.push("tNet");if(excess)failures.push("excess");if(texcess)failures.push("tExcess");if(concentration)failures.push("concentration");if(loyo)failures.push("loyo");
        if(!failures.length)counts.confirmed++;
        const first=failures[0]||"pass";counts.exclusive[first]=(counts.exclusive[first]||0)+1;
      }
      const probability=counts.confirmed/RUNS;
      curve[edge]={runs:RUNS,confirmed:counts.confirmed,probability:+probability.toFixed(5),failureShare:{netFloor:+(counts.netFloor/RUNS).toFixed(5),tNet:+(counts.tNet/RUNS).toFixed(5),excess:+(counts.excess/RUNS).toFixed(5),tExcess:+(counts.tExcess/RUNS).toFixed(5),concentration:+(counts.concentration/RUNS).toFixed(5),loyo:+(counts.loyo/RUNS).toFixed(5),minN:+(counts.minN/RUNS).toFixed(5),noBaseline:0},exclusiveFailureShare:Object.fromEntries(Object.entries(counts.exclusive).map(([k,v])=>[k,+(v/RUNS).toFixed(5)])),analyticNetGateProbability:+normCdf((edge-Math.max(CLAIM_CRITERIA.practicalFloorR,2*se))/se).toFixed(5),mcNetGateProbability:+(counts.netGatePass/RUNS).toFixed(5),analyticNetGateCrossCheckDifference:+(counts.netGatePass/RUNS-normCdf((edge-Math.max(CLAIM_CRITERIA.practicalFloorR,2*se))/se)).toFixed(5)};
    }
    c.powerCurve=curve;c.cell=`${c.verdictState}|${c.session}`;c.measuredTradesAfterSlot=c.n;c.measuredDevDays=c.dayTradeCounts.length;c.measuredSdR=+sigma.toFixed(5);c.baselineMeanR=c.baseline.mean;c.measuredCr1Inflation=inflate;c.seForNetAndExcessAtN=+se.toFixed(7);c.nEffective=+nEff.toFixed(2);
    cells.push(c);
  }
}
const pooledMonotonicity=VERDICT_STATES.map(v=>{const p=cells.find(c=>c.verdictState===v&&c.session==="POOLED"),parts=cells.filter(c=>c.verdictState===v&&c.session!=="POOLED"),byEdge=Object.fromEntries(EDGES.map(e=>[e,parts.every(c=>p.powerCurve[e].probability+1e-12>=c.powerCurve[e].probability)]));return{verdictState:v,pooledAtLeastEachSessionForEveryEdge:Object.values(byEdge).every(Boolean),pooledAtLeastEachSessionByEdge:byEdge,sessionMax:Object.fromEntries(EDGES.map(e=>[e,Math.max(...parts.map(c=>c.powerCurve[e].probability))])),pooled:Object.fromEntries(EDGES.map(e=>[e,p.powerCurve[e].probability]))};});
const report={generatedAt:new Date().toISOString(),id:"G0-AMENDMENT-5-POWER-CURVE",date:"2026-10-28",reportOnly:true,criteriaChanged:false,thresholdChanged:false,verdictChanged:false,definition:{confirmed:"CONFIRMED iff meanNetR > +0.10R AND day-clustered tNet > 2 AND excessVsRandomR > 0 AND day-clustered t > 2 AND all vetoes clear: n >= 100, concentration <= 0.50, LOYO >= 0.75, NO_BASELINE.",trueNetEdge:"Evaluated at true net edges 0R, 0.05R, 0.10R, 0.15R, 0.20R and 0.30R.",probability:`Parametric Monte Carlo full-conjunction rate over ${RUNS} runs per cell/edge; report-only.`},edgesR:EDGES,simulationRunsPerCellEdge:RUNS,rule:{frozenConjunction:"mean net R > +0.10R AND day-clustered tNet > 2 AND excess vs matched random > 0 AND day-clustered tExcess > 2 AND n >= 100 AND concentration <= 0.50 AND LOYO >= 0.75 AND NO_BASELINE clear",source:"scripts/map-compass/frozen.mjs CLAIM_CRITERIA and lib/verification.mjs verifyClaim; unchanged",analyticalNetCrossCheck:"P(meanNet > 0.10 AND tNet > 2) = Phi((edge - max(0.10, 2*SE))/SE), with SE = measured baseline SD * measured CR1 inflation / sqrt(Kish nEffective)."},requestedPooledPowerConstraint:{status:"MATHEMATICALLY_INCOMPATIBLE_WITH_FROZEN_RULE_AT_TRUE_EDGES_BELOW_0.10R",explanation:"The requested pooled probability >= every session probability cannot hold over the full edge grid while the +0.10R absolute-mean floor is frozen. For true edge 0 or 0.05R, smaller session samples can have a greater chance of crossing the +0.10R threshold by noise; as pooled n increases, that false-confirmation probability approaches zero. No thresholds were altered to force the requested relation. The report checks pooled >= each session separately by edge; at/above 0.10R, higher-n pooled power should dominate within simulation error.",mathematicalCheck:"For edge μ<0.10 and SE→0, P(mean estimate>0.10)→0, whereas at finite session SE it is strictly positive."},method:{counts:"measured card-specific one-slot survivors in slot-model.json; each verdict-state/session n exactly equals the sum of its contributing card-specific kept counts",sessions:"actual signal session at each kept entry; no equal split",pooled:"pooled n equals the sum of the three session n; same EAT calendar dates are clustered together",dependence:"Kish effective N is computed over duplicate kept entry bars across cards; CR1 inflation is measured on baseline trades by verdict state; power uses their combined SE correction",baseline:"fine baseline means and SDs weighted by their observed random-entry counts for matching verdict state/session across side and vol cells",yearVetoSimulation:"parametric year-level Gaussian contributions use measured per-year kept-trade counts; LOYO positive share and concentration are evaluated with frozen cutoffs",limitations:"This aggregate planning calculation combines separately tested card observations. It is not a forecast for any one family/card; card/family results remain unverified and require M6 per-card trade production."},cells,pooledMonotonicity,analyticCrossCheckSummary:cells.map(c=>({verdictState:c.verdictState,session:c.session,edges:EDGES.map(e=>({edge:e,analytic:c.powerCurve[e].analyticNetGateProbability,monteCarlo:c.powerCurve[e].mcNetGateProbability}))})),note:"REPORT-ONLY. No strategy verification or card freeze. No thresholds, Map, costs, exit, or CONFIRMED rule changed."};
writeFileSync(join(OUT,"power-curve.json"),JSON.stringify(report,null,2)+"\n");
for(const c of cells){console.log(`${c.verdictState.padEnd(8)} ${c.session.padEnd(6)} n=${c.n} nEff=${c.nEffective} b=${c.baseline.mean.toFixed(3)} SD=${c.measuredSdR.toFixed(3)} p@.05=${c.powerCurve[.05].probability} p@.10=${c.powerCurve[.1].probability} p@.20=${c.powerCurve[.2].probability} p@.30=${c.powerCurve[.3].probability}`);}
console.log("pooled n=sum(session n):",pooledMonotonicity);
