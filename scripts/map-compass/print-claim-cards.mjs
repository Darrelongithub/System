#!/usr/bin/env node
/**
 * G0 Amendment 2 / updated at Amendment 3 — print ALL 24 claim cards IN FULL
 * TEXT, in TEST_ORDER. READ-ONLY dump for human review; does NOT freeze, edit,
 * reorder or evaluate any card. `FREEZE.status` stays DRAFT.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  CLAIM_CARDS,
  TEST_ORDER,
  FREEZE,
  FAMILIES,
  validateClaimCards,
  CARD_RELATIONS,
  NEAR_DUPLICATES,
  MIRROR_IMAGES,
  CROSS_FAMILY_MIRRORS,
} from "./claim-cards.draft.mjs";
import {
  EVIDENCE,
  EMPIRICAL_STUDIES,
  CRITICISMS,
  VERDICT_STATES,
  VERDICT_STATE_OF,
  FAMILY_STRENGTH_STATE,
  STATES,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "docs/CLAIM-CARDS-FULL-TEXT.md");

const errors = validateClaimCards();
if (errors.length) {
  console.error("claim card errors:", errors);
  process.exit(1);
}

const byId = new Map(CLAIM_CARDS.map((c) => [c.id, c]));
const lines = [];
lines.push("# Claim cards — FULL TEXT (all 24, in TEST_ORDER)");
lines.push("");
lines.push(`**Generated:** ${new Date().toISOString()}`);
lines.push(`**Card status:** \`${FREEZE.status}\` — NOT FROZEN. NOT TESTED.`);
lines.push(
  `**Cards:** ${CLAIM_CARDS.length} | **Families:** ${FAMILIES.length} | **Prior false fraction:** ${EVIDENCE.priorFalseFraction}`,
);
lines.push(`**Order:** ${EVIDENCE.testOrder}`);
lines.push(
  `**Verdict states:** ${VERDICT_STATES.join(" / ")} — EFFICIENT = EXPANSION+GRIND (ER >= 0.35), CHOPPY = WHIPSAW+QUIET.`,
);
lines.push("");
lines.push("> Generated mechanically from `scripts/map-compass/claim-cards.draft.mjs`");
lines.push("> by `print-claim-cards.mjs`. **No card is frozen here.** Verdicts are decided on the");
lines.push("> TWO verdict states; the four Map states are DIAGNOSTICS only. Editing a card after");
lines.push("> results would be the laundering this project forbids — change it NOW, during review.");
lines.push("");

lines.push("## Empirical-study registry (tiers REPLACED at G0 Amendment 3)");
lines.push("");
lines.push("The old 1-4 subjective tiers are gone. Each family has ONE empirical study that");
lines.push("was located and **opened on 2026-10-27**, with its full URL, or is marked");
lines.push("**PRACTITIONER ONLY**. No outcome from our own data was used.");
lines.push("");
lines.push("| Family | Grade | Study (opened) | Full URL | Finding |");
lines.push("| ------ | ----- | -------------- | -------- | ------- |");
for (const f of FAMILIES) {
  const s = EMPIRICAL_STUDIES[f];
  lines.push(
    `| ${f} | ${s.grade} | ${s.citation.replace(/\|/g, "\\|")} | ${s.url} | ${s.finding.replace(/\|/g, "\\|")} |`,
  );
}
lines.push("");
lines.push(`**Grades:** ${Object.entries(EVIDENCE.grades).map(([k, v]) => `\`${k}\` = ${v}`).join("; ")}`);
lines.push("");
lines.push(`**PLAINLY WRONG item:** \`vol-compression\` is PRACTITIONER ONLY but was ranked tier 1 in v1.2. Its evidence grade is corrected; its position in TEST_ORDER is deliberately KEPT STABLE per the Amendment-3 instruction (see BLUEPRINT-AMENDMENTS.md A4.5).`);
lines.push("");

lines.push("## Verdict-state mapping (Amendment 3)");
lines.push("");
lines.push("| Family | Strength verdict state | Weakness verdict state |");
lines.push("| ------ | ---------------------- | ---------------------- |");
for (const f of FAMILIES) {
  const s = FAMILY_STRENGTH_STATE[f];
  lines.push(`| ${f} | ${s} | ${s === "EFFICIENT" ? "CHOPPY" : "EFFICIENT"} |`);
}
lines.push("");
lines.push(`Four Map states: ${STATES.join(", ")}. Mapping: ${Object.entries(VERDICT_STATE_OF).map(([k, v]) => `${k}->${v}`).join(", ")}.`);
lines.push("");
lines.push(
  `**Standard-exit caveat (task 4):** every verdict for ${REVERSION_FAMILIES.join(", ")} is labelled _"${EXIT_CAVEAT}"_. No new exit is added in this cycle.`,
);
lines.push("");

lines.push("## Strongest published criticism / failed replication (all VERIFIED)");
lines.push("");
lines.push("Every URL below was opened and read on **2026-10-27**. Nothing is cited from memory and no URL,");
lines.push("author or year is invented. A family with no openable criticism is marked as such rather than left blank.");
lines.push("");
lines.push("| Family | Status | Criticism / failed replication | Full URL | Impact |");
lines.push("| ------ | ------ | ---------------------------- | -------- | ------ |");
for (const f of FAMILIES) {
  const c = CRITICISMS[f];
  lines.push(
    `| ${f} | ${c.status} | ${c.citation.replace(/\|/g, "\\|")} | ${c.url} | ${c.impact} |`,
  );
}
lines.push("");
lines.push("---");
lines.push("");

lines.push("## Card relations (near-duplicates and mirror images)");
lines.push("");
lines.push(`Within-family pairs: ${CARD_RELATIONS.length} (${NEAR_DUPLICATES.length} near-duplicate, ${MIRROR_IMAGES.length} mirror-image, ${CARD_RELATIONS.length - NEAR_DUPLICATES.length - MIRROR_IMAGES.length} related).`);
lines.push("");
lines.push("| Type | Pair | Family | Why |");
lines.push("| ---- | ---- | ------ | --- |");
for (const r of CARD_RELATIONS) {
  lines.push(`| ${r.type} | \`${r.a}\` / \`${r.b}\` | ${r.family} | ${r.why} |`);
}
lines.push("");
lines.push("Cross-family mirror images (diagnostic only; pooling is per family):");
for (const m of CROSS_FAMILY_MIRRORS) lines.push(`- \`${m.a}\` / \`${m.b}\` — ${m.why}`);
lines.push("");

lines.push("## Index (TEST_ORDER)");
lines.push("");
lines.push("| # | ID | Family | Rank | Priority | Strength state | Weakness state | Four-state textbook |");
lines.push("| -: | -- | ------ | ---: | -------: | -------------- | -------------- | ------------------- |");
for (const o of TEST_ORDER) {
  const c = byId.get(o.id);
  lines.push(
    `| ${o.testOrder} | \`${c.id}\` | ${c.family} | ${c.evidenceTier} | ${c.priority} | ${c.strength.state} | ${c.weakness.state} | ${c.strength.textbookState} / ${c.weakness.textbookState} |`,
  );
}
lines.push("");
lines.push("---");
lines.push("");

for (const o of TEST_ORDER) {
  const c = byId.get(o.id);
  lines.push(`## ${o.testOrder}. \`${c.id}\``);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| ----- | ----- |");
  lines.push(`| **Test order** | ${o.testOrder} of ${TEST_ORDER.length} (original index ${o.originalIndex}) |`);
  lines.push(`| **ID** | \`${c.id}\` |`);
  lines.push(`| **Family** | ${c.family} |`);
  lines.push(`| **Variant** | ${c.variant} |`);
  lines.push(`| **Evidence grade** | ${c.evidence.grade} |`);
  lines.push(`| **Empirical study** | ${c.evidence.citation} |`);
  lines.push(`| **Study full URL** | ${c.evidence.url} |`);
  lines.push(`| **What the study tests** | ${c.evidence.tests} |`);
  lines.push(`| **Study finding** | ${c.evidence.finding} |`);
  lines.push(`| **Strongest criticism** | ${c.criticism.citation} |`);
  lines.push(`| **Criticism URL** | ${c.criticism.url} |`);
  lines.push(`| **Criticism status** | ${c.criticism.status} (opened ${c.criticism.opened}) |`);
  lines.push(`| **Frozen order rank** | ${c.evidenceTier} (diagnostic only; NOT an evidence claim) |`);
  lines.push(`| **Priority** | ${c.priority} (frozen numeric, decision #10) |`);
  lines.push(`| **Trade direction** | ${c.direction} (decision #11) |`);
  lines.push(`| **Session restriction** | ${c.sessionRestriction ?? "none (all sessions)"} |`);
  lines.push(`| **Status** | ${FREEZE.status} (approvedBy: ${FREEZE.approvedBy ?? "null"}, approvedAt: ${FREEZE.approvedAt ?? "null"}) |`);
  lines.push(`| **Exit caveat** | ${c.exitCaveat ?? "none"} |`);
  lines.push("");
  lines.push("**STRENGTH claim**");
  lines.push("");
  lines.push(`- Verdict state: **${c.strength.state}** (DECIDES the verdict)`);
  lines.push(`- Four Map states in this cell (diagnostics): ${c.strength.fourStates.join(", ")}`);
  lines.push(`- Textbook four-state label (diagnostic): ${c.strength.textbookState}`);
  lines.push(`- Direction: +1 (expect POSITIVE net R)`);
  lines.push(`- Claim: ${c.strength.claim}`);
  lines.push("");
  lines.push("**WEAKNESS claim**");
  lines.push("");
  lines.push(`- Verdict state: **${c.weakness.state}** (the other one)`);
  lines.push(`- Four Map states in this cell (diagnostics): ${c.weakness.fourStates.join(", ")}`);
  lines.push(`- Textbook four-state label (diagnostic): ${c.weakness.textbookState}`);
  lines.push(`- Direction: -1 (expect NEGATIVE net R)`);
  lines.push(`- Claim: ${c.weakness.claim}`);
  lines.push("");
  lines.push("**Rationale (as written, pre-results)**");
  lines.push("");
  lines.push(`> ${c.rationale}`);
  lines.push("");
  lines.push("**Source(s)**");
  lines.push("");
  for (const s of c.sources ?? []) lines.push(`- ${s}`);
  lines.push("");
  lines.push("**Review fields (leave blank until the human freeze)**");
  lines.push("");
  lines.push("- Reviewer decision: _keep / edit / remove — `_");
  lines.push("- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_");
  lines.push("");
  lines.push("---");
  lines.push("");
}

lines.push("## Freeze gate (decision #13) — NOT DONE");
lines.push("");
lines.push("Real verification stays BLOCKED until a reviewer sets `FREEZE.status = \"FROZEN\"`");
lines.push("with `approvedBy` and `approvedAt` in `claim-cards.draft.mjs`. **Amendment 3 did");
lines.push("not freeze anything.** See `docs/CLAIM-CARDS-REVIEW.md` for the review checklist.");
lines.push("");

const text = lines.join("\n") + "\n";
writeFileSync(OUT, text);
console.log(`wrote ${OUT}`);
console.log(`cards ${CLAIM_CARDS.length}, families ${FAMILIES.length}, status ${FREEZE.status}`);
console.log(`sha256 ${createHash("sha256").update(text).digest("hex")}`);
