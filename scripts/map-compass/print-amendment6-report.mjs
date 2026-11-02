#!/usr/bin/env node
/** Read-only, pre-result Amendment 6 report generated from the A6 artifacts. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CLAIM_CARDS, TEST_ORDER, FAMILIES, FREEZE } from "./claim-cards.draft.mjs";
import { EMPIRICAL_STUDIES } from "./frozen.mjs";
import { paramsToString } from "./signal-params.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const DOC = join(ROOT, "docs");
const read = (n) => JSON.parse(readFileSync(join(ART, n), "utf8"));
const signal = read("signal-counts.json");
const slot = read("slot-model.json");
const overlap = read("measured-overlap.json");
const power = read("power-curve.json");
const cardById = new Map(CLAIM_CARDS.map((c) => [c.id, c]));
const edges = power.edgesR;
const reportPath = join(DOC, "G0-AMENDMENT-6-REPORT.md");
const pct = (x) => Number(x).toFixed(4);
const pairText = (pairs) => pairs.length
  ? pairs.map((x) => `${x.a}/${x.b} J=${Number(x.jaccard).toFixed(6)} (${x.sharedBars} shared)`).join("; ")
  : "(no within-family pair)";
const lines = [];

lines.push(
  "# G0 Amendment 6 — owner-approved pre-result changes",
  "",
  `**Date:** 2026-11-02. **Freeze:** ${FREEZE.status}; approver/date remain null. No strategy verification or strategy outcome was run.`,
  "**Scope:** only remove the two owner-approved cards; preserve every other card/state/parameter and the surviving relative TEST_ORDER. Priorities are renumbered by deletion only. Map, costs, exits, frozen thresholds and CONFIRMED rule are unchanged.",
  "",
  "## 1. Approved deletions and family-overlap change",
  "",
  "Removed `dual-thrust` (old priority 3): its prior-day high/low k=0 evaluator was an exact 1.000 Jaccard duplicate of `pdh-pdl-break`, and opened sources did not establish universal textbook defaults. Removed `stochastic-14-fade` (old priority 15): its signal bars exactly duplicated Williams %R (Jaccard 1.000). Each removal deletes the card, its two verdict claim cells, evaluator and parameter entry. No replacement cards are added.",
  "",
  "Priorities use original rank minus the number of deleted priorities below it: old 1–2 unchanged; old 4–14 become 3–13; old 16–24 become 14–22. TEST_ORDER preserves v1.2 relative order after deleting those IDs; it is not re-sorted by priority.",
  "",
  "| Family | A5 variants / Jaccards / Kish nEff | A6 variants / Jaccards / Kish nEff | Change |",
  "|---|---|---|---|",
);
const delByFamily = new Map(overlap.amendment6.changesFromA5.map((x) => [x.family, x]));
for (const family of FAMILIES) {
  const old = overlap.amendment6.changesFromA5.find((x) => x.family === family);
  const current = overlap.byFamily[family];
  const beforeText = old
    ? `3; ${pairText(old.beforePairwiseJaccard)}; ${old.beforePooled.nEffective}`
    : `${current.cards.length}; ${pairText(current.pairwiseJaccard)}; ${current.pooled.nEffective}`;
  const afterText = `${current.cards.length}; ${pairText(current.pairwiseJaccard)}; ${current.pooled.nEffective}`;
  const change = old
    ? `removed ${old.removedCardIds.join(", ")}; duplicate pair(s) removed`
    : "unchanged; surviving signal sets and pairwise Jaccards retained";
  lines.push(`| ${family} | ${beforeText} | ${afterText} | ${change} |`);
}
lines.push(
  "",
  "A5 had 276 total card pairs; the 22-card A6 universe has 231 (45 fewer). Four deleted within-family pairs are removed from the family-overlap calculations. In channel-breakout, Donchian20/55 remains Jaccard 0.506796 (12,790 shared bars); the two Dual Thrust pairs are removed. In osc-fade, RSI/Williams remains Jaccard 0.115649 (2,305 bars); both Stochastic pairs disappear, including Williams/Stochastic Jaccard 1.000. The other six families' pair statistics are unchanged. There is no cross-family pair above .5 in the A6 22-card universe.",
  "",
  "## 2. Slots and combined-book reconciliation",
  "",
  `**Claim design:** exactly **one slot per card** (${slot.slotCounts.cardCount} independent card slots total); one position maximum in each slot, long OR short. Long and short cannot coexist within a card. **Combined Compass/validation:** exactly **one book slot** total; same-bar conflict winner is the lowest renumbered priority, then one position maximum, long OR short. Long and short cannot coexist in that book. This is the declared DRAFT claim design; no verification was run.`,
  "",
  `After deletion the combined stream contains ${slot.combinedBook.rawSignals.toLocaleString()} eligible EFFICIENT/CHOPPY signal instances; same-bar priority resolution yields ${slot.combinedBook.sameBarCandidates.toLocaleString()} unique candidate bars. **“Eligible same-bar candidates 74,886”** means those unique-bar events before dropping candidates that arrive while the combined slot is occupied. The kept combined-book count remains ${slot.combinedBook.kept.toLocaleString()} because both deleted cards duplicated surviving signal events.`,
  "",
  `Reconciliation: ${slot.combinedBook.kept.toLocaleString()} modeled trades × ${slot.combinedBook.meanSampledHoldBars.toFixed(8)} mean sampled hold = ${(slot.combinedBook.kept * slot.combinedBook.meanSampledHoldBars).toLocaleString()} modeled occupied bar-units, versus ${slot.inputs.devBars.toLocaleString()} DEV bars; headroom ${(slot.inputs.devBars - slot.combinedBook.kept * slot.combinedBook.meanSampledHoldBars).toLocaleString()} bars (${(100 * slot.combinedBook.kept * slot.combinedBook.meanSampledHoldBars / slot.inputs.devBars).toFixed(2)}% utilization). Holds are baseline-histogram samples, not strategy exits/outcomes. The 6,903 count and mean hold are unchanged from A5; deleting duplicate losers changes raw emissions, not the surviving book events.`,
  "",
  "## 3. Signal frequency by DEV calendar day",
  "",
  `Counts are all signal emissions on DEV bars, divided by ${signal.cards[0].devCalendarDays} actual EAT calendar dates containing DEV bars; zero-signal dates are included in the mean. Busiest is the top five by count. Quietest is the five lowest nonzero dates (ties ordered by date); zero-signal dates are reported separately. Signals only; no outcomes.`,
  "",
  "| Priority | Card | Signals/DEV day | DEV signals | Zero days | Five busiest date:count | Five quietest active date:count |",
  "|--:|---|--:|--:|--:|---|---|",
);
for (const order of TEST_ORDER) {
  const c = cardById.get(order.id);
  const r = signal.cards.find((x) => x.cardId === c.id);
  const fmt = (xs) => xs.map((x) => `${x.date}:${x.count}`).join(", ");
  lines.push(`| ${c.priority} | ${c.id} | ${r.signalsPerDevDay} | ${r.devSignals} | ${r.zeroSignalDevDays} | ${fmt(r.busiestDevDays)} | ${fmt(r.quietestActiveDevDays)} |`);
}
lines.push(
  "",
  "## 4. Current 22-card table — exact parameters and study registry",
  "",
  "All rows remain DRAFT. `PRACTITIONER_ONLY` is the exact source-registry status, not an invented URL.",
  "",
  "| TEST_ORDER | ID | Family | Strength | Weakness | Parameters (exact registry) | Study URL / status | Priority |",
  "|--:|---|---|---|---|---|---|--:|",
);
for (const order of TEST_ORDER) {
  const c = cardById.get(order.id);
  const study = EMPIRICAL_STUDIES[c.family];
  lines.push(`| ${order.testOrder} | ${c.id} | ${c.family} | ${c.strength.state} | ${c.weakness.state} | ${paramsToString(c.id)} | ${study.grade === "PRACTITIONER_ONLY" ? "PRACTITIONER_ONLY" : study.url} | ${c.priority} |`);
}
lines.push(
  "",
  "Full pseudo-code for every row is printed in `docs/CLAIM-SIGNAL-SPECIFICATIONS.md`. Rail/open clarification: there is no surviving Dual Thrust card. `pdh-pdl-break` measures its two rails from the previous EAT trading day's observed high and low; **neither rail is measured from that day's open**. Its stored `priorDayBars=48` is metadata only and is not consumed by the evaluator.",
  "",
  "## 5. Family × verdict report-only power",
  "",
  `Each power curve's unit is one verdict for one family × verdict-state cell (16 cells total). Edges are ${edges.map((e) => `${e.toFixed(2)}R`).join(", ")}. Counts sum surviving card-specific one-slot records; Kish nEff is measured over duplicated kept entry bars within each family/state. The SE uses session-mix-weighted matched random-baseline SD and measured calendar-day CR1 inflation: EFFICIENT 1.3222, CHOPPY 1.1202.`,
  "",
  "| Family | Verdict | n | Kish nEff | SD R | CR1 | Power 0.00 | .05 | .10 | .15 | .20 | .30 | Diagnostic at .20 |",
  "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|",
);
for (const c of power.cells) {
  lines.push(`| ${c.family} | ${c.verdictState} | ${c.n} | ${c.nEffective} | ${c.measuredSdR} | ${c.measuredCr1DayInflation} | ${c.powerCurve[0].probability} | ${c.powerCurve[0.05].probability} | ${c.powerCurve[0.1].probability} | ${c.powerCurve[0.15].probability} | ${c.powerCurve[0.2].probability} | ${c.powerCurve[0.3].probability} | ${c.powerCurve[0.2].probability < 0.5 ? "THIN-POWER" : "—"} |`);
}
lines.push(
  "",
  `**THIN-POWER at +0.20R:** ${power.thinPowerCells.length ? power.thinPowerCells.map((c) => `${c.family} × ${c.verdictState} (${c.powerAt0_20R})`).join("; ") : "none; all 16 cells are at least 0.50"}. Diagnostic only; no criterion change.`,
  "",
  "### Veto failure shares at true +0.20R",
  "",
  "Marginal Monte Carlo failure shares (not exclusive; a run can fail multiple gates):",
  "",
  "| Family | Verdict | Net floor | tNet | Excess floor | tExcess | Concentration | LOYO | Min n | NO_BASELINE |",
  "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|",
);
for (const c of power.cells) {
  const f = c.powerCurve[0.2].failureShare;
  lines.push(`| ${c.family} | ${c.verdictState} | ${f.netFloor} | ${f.tNet} | ${f.excess} | ${f.tExcess} | ${f.concentration} | ${f.loyo} | ${f.minN} | ${f.noBaseline} |`);
}
lines.push(
  "",
  "### Analytic net-gate cross-check: analytic / Monte Carlo",
  "",
  "For every family-cell/edge, `P(meanNet > .10 AND tNet > 2) = Φ((edge−max(.10,2·SE))/SE)` is compared with Monte Carlo using the same cell SE. This is the net gate only, not full-conjunction power.",
  "",
  "| Family | Verdict | 0.00 | 0.05 | 0.10 | 0.15 | 0.20 | 0.30 |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
);
for (const c of power.cells) {
  const values = edges.map((e) => `${pct(c.powerCurve[e].analyticNetGateProbability)}/${pct(c.powerCurve[e].mcNetGateProbability)}`);
  lines.push(`| ${c.family} | ${c.verdictState} | ${values.join(" | ")} |`);
}
lines.push(
  "",
  "Marginal veto shares for all six edges, exclusive first-failure attribution, annual survivor counts, exact day counts and edge-by-edge analytic deltas are recorded in `artifacts/map-compass/power-curve.json` and `artifacts/map-compass/slot-model.json`.",
  "",
  "## 6. Guardrails",
  "",
  `The A5 “eligible same-bar candidates” count remains 74,886, now explicitly defined as unique bar candidates before occupied-slot drops. FREEZE.status=${FREEZE.status}; approvedBy and approvedAt remain null. verify-claims stays blocked. No claim-verification.json or claimed-trades.jsonl was created. The frozen +0.10R floor, t>2 requirements, excess rule, vetoes, Map, costs and exit are unchanged. Cards are not frozen.`,
  "",
);
writeFileSync(reportPath, lines.join("\n"));
console.log(`wrote ${reportPath}`);
