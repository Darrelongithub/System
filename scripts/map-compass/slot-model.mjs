#!/usr/bin/env node
/** G0 Amendment 5 — reconcile the slot unit before any strategy result.
 * Each claim card gets an independent one-position slot for measurement. The
 * combined Compass book is a different, one-slot execution model: simultaneous
 * signals are resolved by frozen card priority. Holds are baseline-sampled,
 * not strategy outcomes. No P&L or claim result is read here.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { emitSignals, signalLibrarySelfCheck } from "./lib/signals.mjs";
import { CLAIM_CARDS, FAMILIES, FROZEN_TEST_SEQUENCE, validateClaimCards } from "./claim-cards.draft.mjs";
import { VERDICT_STATES, STATES, CLAIM_CRITERIA } from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");
const BASELINE = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
if (!BASELINE.barsHeldStats || validateClaimCards().length || signalLibrarySelfCheck().length) throw new Error("slot-model inputs invalid; run baseline and validate cards/signals");
const bars = [];
for (const f of dataLines(readFileSync(join(NORM, "xauusd-m30-eat.csv"), "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  const [o,h,l,c] = f.slice(1,5).map(num);
  if ([o,h,l,c].every(Number.isFinite)) bars.push({ datetime:f[0],o,h,l,c });
}
const map = new Map();
for (const line of readFileSync(join(NORM, "xauusd-m30-map.csv"), "utf8").split("\n").slice(1).filter(Boolean)) {
  const f=line.split(","); map.set(f[0], { state:f[1], session:f[11], role:f[12] });
}
const states = bars.map(b => { const s=map.get(b.datetime)?.state; return STATES.includes(s) ? s : null; });
const dev = new Set(bars.map((b,i)=>map.get(b.datetime)?.role === "DEV" ? i : -1).filter(i=>i>=0));
function sampler(seed) {
  const hist=Object.entries(BASELINE.barsHeldStats.histogram).map(([h,n])=>[+h,n]).sort((a,b)=>a[0]-b[0]);
  const total=hist.reduce((s,x)=>s+x[1],0); let cum=0; const cdf=hist.map(([h,n])=>[h,(cum+=n)/total]); let s=seed>>>0;
  return ()=>{s=(s*1664525+1013904223)>>>0; const u=s/4294967296; return cdf.find(([,p])=>u<=p)?.[0] ?? hist.at(-1)[0];};
}
const cardById=new Map(CLAIM_CARDS.map(c=>[c.id,c]));
const signalsByCard={}, emissionsByCard={};
for (const id of FROZEN_TEST_SEQUENCE) {
  emissionsByCard[id]=emitSignals(bars,id,{states}).filter(x=>dev.has(x.index));
  signalsByCard[id]=emissionsByCard[id].filter(x=>VERDICT_STATES.includes(x.verdictState)).map(x=>({...x,priority:cardById.get(id).priority,session:map.get(x.datetime)?.session,year:Number(x.datetime.slice(0,4)),day:x.datetime.slice(0,10)})).sort((a,b)=>a.index-b.index);
}
function runOneSlot(rows,seed) {
  const draw=sampler(seed); let until=-1; const kept=[]; let dropped=0; let holds=0;
  for(const x of rows) { if(x.index>=until) { const h=draw(); kept.push({...x,barsHeldModel:h}); until=x.index+h; holds+=h; } else dropped++; }
  return {kept,dropped,meanSampledHold:kept.length?holds/kept.length:0};
}
const perCard={};
for(const id of FROZEN_TEST_SEQUENCE) {
  const rows=signalsByCard[id], seed=20261027 + [...id].reduce((a,c)=>a+c.charCodeAt(0),0);
  const result=runOneSlot(rows,seed), c=cardById.get(id), kept=result.kept;
  perCard[id]={cardId:id,family:c.family,priority:c.priority,devSignalEmissions:emissionsByCard[id].length,excludedOutsideVerdictStates:emissionsByCard[id].length-rows.length,rawSignals:rows.length,kept:kept.length,droppedOccupied:result.dropped,survival:rows.length?kept.length/rows.length:0,meanSampledHoldBars:result.meanSampledHold,byVerdictState:Object.fromEntries(VERDICT_STATES.map(v=>[v,kept.filter(x=>x.verdictState===v).length])),bySession:Object.fromEntries(["asian","london","ny"].map(s=>[s,kept.filter(x=>x.session===s).length])),byVerdictStateSession:Object.fromEntries(VERDICT_STATES.flatMap(v=>["asian","london","ny"].map(s=>[`${v}|${s}`,kept.filter(x=>x.verdictState===v&&x.session===s).length]))),_kept:kept};
}
// Family counts are sums of independently-slot-tested card observations, not a pooled family slot.
const perFamily=FAMILIES.map(f=>{const cards=CLAIM_CARDS.filter(c=>c.family===f),strengthState=cards[0].strength.state,weaknessState=cards[0].weakness.state,rawSignals=cards.reduce((s,c)=>s+perCard[c.id].rawSignals,0),kept=cards.reduce((s,c)=>s+perCard[c.id].kept,0),byVerdictState=Object.fromEntries(VERDICT_STATES.map(v=>[v,cards.reduce((s,c)=>s+perCard[c.id].byVerdictState[v],0)]));return {family:f,cardCount:cards.length,strengthState,weaknessState,rawSignals,kept,survival:rawSignals?kept/rawSignals:0,expectedStrengthN:byVerdictState[strengthState],expectedWeaknessN:byVerdictState[weaknessState],byVerdictState,byVerdictStateSession:Object.fromEntries(VERDICT_STATES.flatMap(v=>["asian","london","ny"].map(se=>[`${v}|${se}`,cards.reduce((s,c)=>s+perCard[c.id].byVerdictStateSession[`${v}|${se}`],0)])))}});
// Combined one-position Compass book: priority selects among same-bar candidates.
const candidates=FROZEN_TEST_SEQUENCE.flatMap(id=>signalsByCard[id]);
candidates.sort((a,b)=>a.index-b.index||a.priority-b.priority);
const byBar=new Map(); for(const x of candidates){if(!byBar.has(x.index))byBar.set(x.index,[]);byBar.get(x.index).push(x);}
const selected=[...byBar.values()].map(a=>a.sort((x,y)=>x.priority-y.priority)[0]).sort((a,b)=>a.index-b.index);
const combined=runOneSlot(selected,20261027);
const powerStructure={};
for(const vs of VERDICT_STATES) for(const se of ["asian","london","ny"]) {
  const rows=Object.values(perCard).flatMap(x=>x._kept).filter(x=>x.verdictState===vs&&x.session===se);
  const byDay=new Map(),byYear=new Map();
  for(const x of rows){byDay.set(x.day,(byDay.get(x.day)||0)+1);byYear.set(String(x.year),(byYear.get(String(x.year))||0)+1);}
  const barCounts=new Map(); for(const x of rows) barCounts.set(x.index,(barCounts.get(x.index)||0)+1); const sumSq=[...barCounts.values()].reduce((a,n)=>a+n*n,0); const nEffective=sumSq?rows.length*rows.length/sumSq:0;
  powerStructure[`${vs}|${se}`]={n:rows.length,distinctEntryBars:barCounts.size,nEffective:+nEffective.toFixed(2),designEffect:nEffective?+(rows.length/nEffective).toFixed(4):null,dayTradeCounts:[...byDay.values()],tradesByYear:Object.fromEntries(byYear)};
}
for(const vs of VERDICT_STATES) {
  const rows=Object.values(perCard).flatMap(x=>x._kept).filter(x=>x.verdictState===vs);
  const byDay=new Map(),byYear=new Map(),barCounts=new Map();
  for(const x of rows){byDay.set(x.day,(byDay.get(x.day)||0)+1);byYear.set(String(x.year),(byYear.get(String(x.year))||0)+1);barCounts.set(x.index,(barCounts.get(x.index)||0)+1);}
  const sumSq=[...barCounts.values()].reduce((a,n)=>a+n*n,0),nEffective=sumSq?rows.length*rows.length/sumSq:0;
  powerStructure[`${vs}|POOLED`]={n:rows.length,distinctEntryBars:barCounts.size,nEffective:+nEffective.toFixed(2),designEffect:nEffective?+(rows.length/nEffective).toFixed(4):null,dayTradeCounts:[...byDay.values()],tradesByYear:Object.fromEntries(byYear)};
}
for(const x of Object.values(perCard)) delete x._kept;
const report={generatedAt:new Date().toISOString(),id:"G0-AMENDMENT-5-SLOT-MODEL",date:"2026-10-28",reportOnly:true,isAssumption:true,decidedBeforeResults:true,criteriaChanged:false,assumption:{holdDuration:"Drawn from the RANDOM-ENTRY BASELINE barsHeldStats histogram, not strategy outcomes.",singleGlobalSlot:"The separate combined Compass execution illustration uses one conservative global slot; claim validation counts use independent per-card slots.",noOutcomes:"No strategy P&L or result enters this emulation."},slotArchitecture:{cardMeasurement:"Each card is tested in its own independent one-position slot; another card cannot block its measured card-level count.",familyReporting:"Family totals are sums of the three card-specific slot survivors; variants do not block each other for this measurement.",compassValidation:"Separate combined book has one position total. At a shared bar, lowest frozen numeric priority wins; only that candidate may enter. This book is not the per-card validation sample.",ownerApproval:"This architecture is the recommended reconciliation, not yet owner-approved; do not freeze cards on this basis without approval."},powerStructure,inputs:{bars:bars.length,devBars:dev.size,rawSignalInstances:Object.values(emissionsByCard).reduce((s,a)=>s+a.length,0),eligibleVerdictStateSignalInstances:Object.values(signalsByCard).reduce((s,a)=>s+a.length,0),excludedOutsideVerdictStates:Object.values(perCard).reduce((s,x)=>s+x.excludedOutsideVerdictStates,0),baselineHoldHistogram:"random-baseline.json#barsHeldStats.histogram",baselineHoldMean:BASELINE.barsHeldStats.mean,holdSampling:"one independent deterministic baseline-hold sampler per card, seed 20261027 + sum of card-id character codes; same baseline histogram, not strategy exits",noStrategyOutcomes:true},perCard,perFamily,combinedBook:{priorityRule:"same-bar winner = smallest frozen numeric priority; one global slot afterwards",rawSignals:candidates.length,sameBarCandidates:selected.length,kept:combined.kept.length,droppedOccupied:combined.dropped,meanSampledHoldBars:combined.meanSampledHold,byVerdictState:Object.fromEntries(VERDICT_STATES.map(v=>[v,combined.kept.filter(x=>x.verdictState===v).length])),byVerdictStateSession:Object.fromEntries(VERDICT_STATES.flatMap(v=>["asian","london","ny"].map(s=>[`${v}|${s}`,combined.kept.filter(x=>x.verdictState===v&&x.session===s).length]))),note:"This is Compass/validation capacity illustration only, not the claim-level power denominator."},realHarnessAudit:{harness:"verify-claims.mjs runBattery currently receives externally produced trades; it groups variants at family|verdictState and does not apply card priorities or enforce a card-specific slot itself.",crossCardBlocking:"No strategy-signal-to-trade M6 producer exists; therefore cross-card blocking in the real harness is neither performed nor measured. The earlier global 7,401-kept model incorrectly conflated claim-specific samples with a portfolio execution slot.",requiredBeforeRealVerification:"M6 must produce per-card slot-constrained DEV trades for claim-level validation, and a separate priority-resolved single-book stream for Compass; reject a batch lacking that distinction."},minTradesPerCell:CLAIM_CRITERIA.minTradesPerCell,note:"Counts are signal-survival model counts only; baseline-sampled duration is an assumption. No P&L, verdict, threshold, Map, exit, cost or criterion is changed."};
writeFileSync(join(OUT,"slot-model.json"),JSON.stringify(report,null,2)+"\n");
for(const x of Object.values(perCard)) console.log(`${x.cardId.padEnd(25)} ${String(x.rawSignals).padStart(6)} raw ${String(x.kept).padStart(6)} kept`);
for(const x of perFamily) console.log(`${x.family.padEnd(25)} ${String(x.rawSignals).padStart(7)} raw ${String(x.kept).padStart(7)} kept`);
console.log(`combined one-slot priority book: ${candidates.length} signal instances -> ${selected.length} same-bar candidates -> ${combined.kept.length} kept`);
