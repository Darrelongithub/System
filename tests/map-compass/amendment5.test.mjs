/** G0 Amendment 5 — slot reconciliation, actual session counts, power repair, DRAFT cleanup safety. */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import { CLAIM_CARDS, FREEZE, TEST_ORDER } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { CLAIM_CRITERIA } from "../../scripts/map-compass/frozen.mjs";
const ROOT=fileURLToPath(new URL("../..",import.meta.url)), ART=join(ROOT,"artifacts/map-compass");
const json=n=>JSON.parse(readFileSync(join(ART,n),"utf8"));

test("A5: claim-specific slots, family survivor sums, and combined Compass slot are separate",()=>{
  const s=json("slot-model.json");
  assertEqual(s.id,"G0-AMENDMENT-5-SLOT-MODEL");
  assertEqual(s.inputs.devBars,131922);
  assertEqual(Object.keys(s.perCard).length,24);
  assertEqual(s.perFamily.length,8);
  for(const f of s.perFamily){const cards=CLAIM_CARDS.filter(c=>c.family===f.family);assertEqual(f.rawSignals,cards.reduce((n,c)=>n+s.perCard[c.id].rawSignals,0));assertEqual(f.kept,cards.reduce((n,c)=>n+s.perCard[c.id].kept,0));}
  for(const vs of ["EFFICIENT","CHOPPY"]){let n=0;for(const ses of ["asian","london","ny"])n+=s.powerStructure[`${vs}|${ses}`].n;assertEqual(n,s.powerStructure[`${vs}|POOLED`].n);}
  assert(s.combinedBook.kept>0 && s.combinedBook.kept< s.inputs.devBars);
  assert(s.realHarnessAudit.crossCardBlocking.includes("neither performed nor measured"));
  assertEqual(s.slotArchitecture.ownerApproval.includes("not yet owner-approved"),true);
});

test("A5: dual-thrust and PDH/PDL duplicate is measured; all cross-family Jaccard > .5 are enumerated",()=>{
  const x=json("measured-overlap.json").amendment5;
  assertEqual(x.allCardPairCount,276);
  assertEqual(x.dualThrustVsPdhPdlBreak.jaccard,1);
  assertEqual(x.dualThrustVsPdhPdlBreak.sharedBars,49228);
  assertEqual(x.crossFamilyPairsJaccardAboveHalf.length,1);
  assertEqual(x.crossFamilyPairsJaccardAboveHalf[0].a,"dual-thrust");
});

test("A5: power counts use actual sessions, pooled n sums, curves monotone, and frozen edge conflict is explicit",()=>{
  const p=json("power-curve.json");
  assertEqual(p.cells.length,8);
  assertEqual(JSON.stringify(p.edgesR),JSON.stringify([0,.05,.1,.15,.2,.3]));
  assertEqual(p.criteriaChanged,false);assertEqual(p.thresholdChanged,false);assertEqual(p.verdictChanged,false);
  for(const vs of ["EFFICIENT","CHOPPY"]){const pool=p.cells.find(c=>c.verdictState===vs&&c.session==="POOLED");const parts=p.cells.filter(c=>c.verdictState===vs&&c.session!=="POOLED");assertEqual(pool.n,parts.reduce((n,c)=>n+c.n,0));for(const c of p.cells.filter(x=>x.verdictState===vs)){const ps=p.edgesR.map(e=>c.powerCurve[e].probability);for(let i=1;i<ps.length;i++)assert(ps[i]>=ps[i-1],`${vs}/${c.session} curve must be monotone`);}assertEqual(new Set(parts.map(c=>c.n)).size,3,`${vs} session counts must differ`);for(const c of parts)assertEqual(new Set([c.n,pool.n]).size,2,`${vs} session and pooled n must differ`);}
  assert(p.requestedPooledPowerConstraint.status.startsWith("MATHEMATICALLY_INCOMPATIBLE"));
  for(const c of p.cells)for(const e of p.edgesR){assert(Math.abs(c.powerCurve[e].analyticNetGateCrossCheckDifference)<0.025,"analytic/MC net-gate cross-check within 2.5 percentage points");assertEqual(c.powerCurve[e].failureShare.noBaseline,0);}
  assertEqual(CLAIM_CRITERIA.practicalFloorR,.1);assertEqual(CLAIM_CRITERIA.tStatMin,2);
});

test("A5: calendar-cluster baseline uses canonical dates; real verification remains blocked",()=>{
  const b=json("random-baseline.json"),s=json("slot-model.json"),daily=json("random-baseline-daily-sums.json");
  for(const vs of ["EFFICIENT","CHOPPY"]){const days=Object.keys(daily.byVerdictState[vs]);assert(days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)),`${vs} baseline clusters must use real ISO calendar days`);assertEqual(days.length,b.dailySe[vs].dayClusters);}
  assert(b.dailySe.EFFICIENT.dayClusters>1000 && b.dailySe.EFFICIENT.dayClusters<3000);
  assert(b.dailySe.CHOPPY.dayClusters>1000 && b.dailySe.CHOPPY.dayClusters<4000);
  assertEqual(FREEZE.status,"DRAFT");assertEqual(FREEZE.approvedBy,null);assertEqual(FREEZE.approvedAt,null);
  assert(!existsSync(join(ART,"claim-verification.json")));assert(!existsSync(join(ART,"claimed-trades.jsonl")));
  assert(s.realHarnessAudit.requiredBeforeRealVerification.includes("per-card slot-constrained"));
});

test("A5: v1.5 snapshot hash is pinned and prior snapshots remain unchanged",()=>{
  const hashes=json("blueprint-hashes.json"),current=readFileSync(join(ROOT,"BLUEPRINT.md")),snapshot=readFileSync(join(ROOT,"docs/BLUEPRINT-v1.5.md"));
  const digest=b=>createHash("sha256").update(b).digest("hex");
  assertEqual(current.toString("utf8"),snapshot.toString("utf8"));
  assertEqual(digest(current),hashes.v15.sha256);
  assertEqual(hashes.current.matchesV15,true);
  for(const key of ["v10","v11","v12","v13","v14"]){const f=readFileSync(join(ROOT,hashes[key].file));assertEqual(digest(f),hashes[key].sha256,`${key} snapshot stays byte-preserved`);}
});

test("A5: full signal-spec table includes all 24 cards and only proposes cleanup",()=>{
  const f=readFileSync(join(ROOT,"docs/CLAIM-SIGNAL-SPECIFICATIONS.md"),"utf8");
  for(const o of TEST_ORDER)assert(f.includes(`| ${o.testOrder} | ${o.id} |`),`${o.id} is in the DRAFT table`);
  assert(f.includes("Jaccard is reported as 1.000"));assert(f.includes("No choice is applied here"));
  assert(f.includes("VERIFIED, opened 2026-10-28"));
});
