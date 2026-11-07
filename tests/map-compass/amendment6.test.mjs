/** G0 Amendment 6 — owner-approved pre-result card deletions and family power. */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import { assertA8OutputState } from "./a8-helpers.mjs";
import { CLAIM_CARDS, FREEZE, TEST_ORDER, FROZEN_TEST_SEQUENCE, FAMILIES } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { SIGNAL_PARAMS, paramsToString } from "../../scripts/map-compass/signal-params.mjs";
import { CLAIM_CRITERIA } from "../../scripts/map-compass/frozen.mjs";
const ROOT=fileURLToPath(new URL("../..",import.meta.url)),ART=join(ROOT,"artifacts/map-compass");
const json=n=>JSON.parse(readFileSync(join(ART,n),"utf8"));
const oldIds=["donchian-20","donchian-55","dual-thrust","sma-20-50","macd-cross","ichimoku-tk","atr-squeeze-break","nr7-break","inside-bar-break","asian-range-break","london-orb-30","pdh-pdl-break","bollinger-20-2","keltner-20-atr","bb-squeeze-fade","pdh-retest","pdl-retest","classic-pivot","rsi-14-30-70","williams-r-fade","stochastic-14-fade","engulfing","morning-evening-star","three-soldiers-crows"];
const oldPriority={"donchian-20":1,"donchian-55":2,"sma-20-50":4,"macd-cross":5,"ichimoku-tk":6,"asian-range-break":7,"london-orb-30":8,"pdh-pdl-break":9,"pdh-retest":10,"pdl-retest":11,"classic-pivot":12,"rsi-14-30-70":13,"williams-r-fade":14,"bollinger-20-2":16,"keltner-20-atr":17,"bb-squeeze-fade":18,"engulfing":19,"morning-evening-star":20,"three-soldiers-crows":21,"atr-squeeze-break":22,"nr7-break":23,"inside-bar-break":24};

test("A6: exactly two owner-approved deletions, deletion-only priorities and relative order",()=>{
  const deleted=new Set(["dual-thrust","stochastic-14-fade"]),current=CLAIM_CARDS.map(c=>c.id);
  assertEqual(CLAIM_CARDS.length,22);assertEqual(FROZEN_TEST_SEQUENCE.length,22);assertEqual(TEST_ORDER.length,22);
  assertEqual(current.includes("dual-thrust"),false);assertEqual(current.includes("stochastic-14-fade"),false);
  assertEqual(JSON.stringify(TEST_ORDER.map(x=>x.id)),JSON.stringify(oldIds.filter(id=>!deleted.has(id))));
  const priorities=CLAIM_CARDS.map(c=>c.priority).sort((a,b)=>a-b);assertEqual(JSON.stringify(priorities),JSON.stringify(Array.from({length:22},(_,i)=>i+1)));
  const oldSpec=readFileSync(join(ROOT,"docs/CLAIM-SIGNAL-SPECIFICATIONS-v1.5.md"),"utf8");
  for(const c of CLAIM_CARDS){const old=oldPriority[c.id],expected=old-(old>15?2:old>3?1:0);assertEqual(c.priority,expected,`${c.id} priority is deletion-only`);assertEqual(c.parameters,SIGNAL_PARAMS[c.id]);const row=oldSpec.split("\n").find(line=>line.startsWith("| ")&&line.includes(`| ${c.id} |`));assert(row,`${c.id} exists in v1.5`);const fields=row.split("|").map(x=>x.trim());assertEqual(fields[5],`${c.strength.state} / ${c.weakness.state}`,`${c.id} states unchanged`);if(!["asian-range-break","london-orb-30"].includes(c.id))assertEqual(fields[7],paramsToString(c.id),`${c.id} parameters unchanged outside the explicit A7 clock-window corrections`);}
  assertEqual(FREEZE.status,"FROZEN");assertEqual(FREEZE.approvedBy,"Darrel");assertEqual(FREEZE.approvedAt,"2026-11-05");
});

test("A6: slot counts are one per card and one total book slot; opposite sides cannot coexist",()=>{
  const s=json("slot-model.json");
  assertEqual(s.slotCounts.cardCount,22);assertEqual(s.slotCounts.slotsPerCard,1);assertEqual(s.slotCounts.totalIndependentCardSlots,22);assertEqual(s.slotCounts.combinedBookSlots,1);
  assertEqual(s.slotCounts.longAndShortCanCoexistPerCard,false);assertEqual(s.slotCounts.longAndShortCanCoexistInCombinedBook,false);
  assertEqual(s.combinedBook.sameBarCandidates,74886);assertEqual(s.combinedBook.kept,6903);assertEqual(s.inputs.devBars,131922);
  const modeled=s.combinedBook.kept*s.combinedBook.meanSampledHoldBars;
  assert(Math.abs(modeled-123541)<1,`expected about 123,541 occupied bar units, got ${modeled}`);
  assert(modeled<s.inputs.devBars);assertEqual(Object.keys(s.familyPowerStructure).length,16);
});

test("A6: signal frequencies include 22 cards, actual DEV-day means, and busiest/quietest five",()=>{
  const r=json("signal-counts.json");assertEqual(r.cardCount,22);assertEqual(r.cards.length,22);
  for(const c of r.cards){assert(c.signalsPerDevDay>=0);assertEqual(c.busiestDevDays.length,5);assertEqual(c.quietestActiveDevDays.length,5);assert(c.busiestDevDays[0].count>=c.busiestDevDays[4].count);assert(c.quietestActiveDevDays[0].count<=c.quietestActiveDevDays[4].count);}
});

test("A6: measured per-family overlap is recomputed for all 22 cards",()=>{
  const r=json("measured-overlap.json"),a=r.amendment6;
  assertEqual(a.cardCount,22);assertEqual(a.allCardPairCount,231);assertEqual(Object.keys(r.byFamily).length,8);
  for(const [f,x] of Object.entries(r.byFamily)){assert(x.pooled.nEffective>0);assertEqual(x.cards.length,CLAIM_CARDS.filter(c=>c.family===f).length);assertEqual(x.pairwiseJaccard.length,x.cards.length*(x.cards.length-1)/2);}
  assertEqual(a.changesFromA5.find(x=>x.family==="channel-breakout").removedCardIds[0],"dual-thrust");
  assertEqual(a.changesFromA5.find(x=>x.family==="osc-fade").removedCardIds[0],"stochastic-14-fade");
  assertEqual(a.changesFromA5.find(x=>x.family==="osc-fade").beforePairwiseJaccard.find(x=>x.a==="williams-r-fade"||x.b==="williams-r-fade").jaccard,0.115649);
  assertEqual(a.crossFamilyPairsJaccardAboveHalf.length,0);
});

test("A6: family × verdict power has six monotone edges, Kish/day dependence and diagnostic thin list",()=>{
  const p=json("power-curve.json"),s=json("slot-model.json");
  assertEqual(p.cells.length,16);assertEqual(JSON.stringify(p.edgesR),JSON.stringify([0,.05,.1,.15,.2,.3]));
  assertEqual(p.thresholdChanged,false);assertEqual(p.criteriaChanged,false);assertEqual(p.verdictChanged,false);
  for(const c of p.cells){const k=`${c.family}|${c.verdictState}`,src=s.familyPowerStructure[k];assertEqual(c.n,src.n);assertEqual(c.nEffective,src.nEffective);assert(c.nEffective<=c.n);assert(c.measuredCr1DayInflation>1);for(let i=1;i<p.edgesR.length;i++)assert(c.powerCurve[p.edgesR[i]].probability>=c.powerCurve[p.edgesR[i-1]].probability);for(const e of p.edgesR){const row=c.powerCurve[e];assert(Math.abs(row.analyticNetGateCrossCheckDifference)<.025);for(const name of ["netFloor","tNet","excess","tExcess","concentration","loyo","minN","noBaseline"])assert(row.failureShare[name]>=0&&row.failureShare[name]<=1);}}
  const computed=p.cells.filter(c=>c.powerCurve[.2].probability<.5).map(c=>`${c.family}|${c.verdictState}`).sort();assertEqual(JSON.stringify(computed),JSON.stringify(p.thinPowerCells.map(c=>`${c.family}|${c.verdictState}`).sort()));
  assertEqual(CLAIM_CRITERIA.practicalFloorR,.1);assertEqual(CLAIM_CRITERIA.tStatMin,2);
});

test("A6: all historical blueprint snapshots match pins and BLUEPRINT.md matches the current snapshot",()=>{
  const report=readFileSync(join(ROOT,"docs/G0-AMENDMENT-6-REPORT.md"),"utf8"),spec=readFileSync(join(ROOT,"docs/CLAIM-SIGNAL-SPECIFICATIONS.md"),"utf8");
  assert(report.includes("74,886"));assert(report.includes("123,541"));assert(report.includes("THIN-POWER"));assert(report.includes("neither rail is measured from that day's open"));
  for(const c of CLAIM_CARDS)assert(spec.includes(`| ${c.id} |`),`${c.id} needs an exact pseudo-code row`);
  assertEqual(FAMILIES.length,8);assertA8OutputState(ART);
  const hashes=json("blueprint-hashes.json");
  const snapshots=Object.entries(hashes).filter(([key,value])=>/^v\d+$/.test(key)&&value?.file);
  const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
  assert(snapshots.length>0,"blueprint-hashes.json must list historical snapshots");
  for(const [version,pin] of snapshots){
    const snapshotPath=join(ROOT,pin.file),actual=digest(readFileSync(snapshotPath));
    assertEqual(actual,pin.sha256,`${pin.file} matches ${version} pinned SHA-256`);
    assertEqual(pin.full,pin.sha256,`${pin.file} full and short-form pins agree`);
  }
  const matchingFlags=Object.entries(hashes.current).filter(([key])=>/^matchesV\d+$/.test(key));
  const currentSnapshot=snapshots.find(([version])=>hashes.current[`matches${version[0].toUpperCase()}${version.slice(1)}`]===true);
  assert(currentSnapshot,"current must identify exactly one pinned snapshot");
  assertEqual(matchingFlags.filter(([,matches])=>matches===true).length,1,"exactly one matchesV* flag is true");
  for(const [flag,matches] of matchingFlags)
    assertEqual(matches,flag===`matches${currentSnapshot[0][0].toUpperCase()}${currentSnapshot[0].slice(1)}`,`current ${flag} flag is consistent`);
  const currentPath=join(ROOT,hashes.current.file),currentHash=digest(readFileSync(currentPath));
  assertEqual(currentHash,hashes.current.sha256,`${hashes.current.file} matches its current SHA-256`);
  assertEqual(currentHash,currentSnapshot[1].sha256,`${hashes.current.file} matches ${currentSnapshot[1].file}`);
  assertEqual(hashes.current.matchesV111,true,"BLUEPRINT.md is the v1.11 current snapshot");
});
