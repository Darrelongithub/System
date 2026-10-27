#!/usr/bin/env node
/**
 * G0 AMENDMENT 2 — print ALL 24 claim cards IN FULL TEXT, in TEST_ORDER.
 *
 * This is a READ-ONLY dump for human review. It does NOT freeze, edit, reorder
 * or evaluate any card. `FREEZE.status` stays DRAFT; real verification remains
 * BLOCKED by verify-claims.mjs.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CLAIM_CARDS, TEST_ORDER, FREEZE, FAMILIES, validateClaimCards } from "./claim-cards.draft.mjs";
import { EVIDENCE } from "./frozen.mjs";

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
lines.push(`**Card status:** \`${FREEZE.status}\` — DRAFT. NOT FROZEN. NOT TESTED.`);
lines.push(`**Cards:** ${CLAIM_CARDS.length} | **Families:** ${FAMILIES.length} | **Prior false fraction:** ${EVIDENCE.priorFalseFraction}`);
lines.push(`**Order:** ${EVIDENCE.testOrder}`);
lines.push("");
lines.push("> This file is generated mechanically from `scripts/map-compass/claim-cards.draft.mjs`");
lines.push("> by `print-claim-cards.mjs`. It is a REVIEW dump requested by G0 Amendment 2.");
lines.push("> **No card is frozen here.** Strength/weakness claims are written from published");
lines.push("> rationale BEFORE any result on our data. `verify-claims.mjs` refuses real");
lines.push("> verification while `FREEZE.status === \"DRAFT\"`. Editing a card after results");
lines.push("> would be the laundering this project forbids — change it NOW, during review.");
lines.push("");
lines.push("## Tier key");
lines.push("");
for (const [t, desc] of Object.entries(EVIDENCE.tiers)) lines.push(`- **Tier ${t}** — ${desc}`);
lines.push("");
lines.push("## Index");
lines.push("");
lines.push("| # | ID | Family | Tier | Priority | Strength state | Weakness state |");
lines.push("| -: | -- | ------ | ---: | -------: | -------------- | -------------- |");
for (const o of TEST_ORDER) {
  const c = byId.get(o.id);
  lines.push(`| ${o.testOrder} | \`${c.id}\` | ${c.family} | ${c.evidenceTier} | ${c.priority} | ${c.strength.state} | ${c.weakness.state} |`);
}
lines.push("");
lines.push("---");
lines.push("");

for (const o of TEST_ORDER) {
  const c = byId.get(o.id);
  lines.push(`## ${o.testOrder}. \`${c.id}\``);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`| ----- | ----- |`);
  lines.push(`| **Test order** | ${o.testOrder} of ${TEST_ORDER.length} (original index ${o.originalIndex}) |`);
  lines.push(`| **ID** | \`${c.id}\` |`);
  lines.push(`| **Family** | ${c.family} |`);
  lines.push(`| **Variant** | ${c.variant} |`);
  lines.push(`| **Evidence tier** | ${c.evidenceTier} |`);
  lines.push(`| **Priority** | ${c.priority} (frozen numeric, decision #10) |`);
  lines.push(`| **Trade direction** | ${c.direction} (decision #11) |`);
  lines.push(`| **Session restriction** | ${c.sessionRestriction ?? "none (all sessions)"} |`);
  lines.push(`| **Status** | ${FREEZE.status} (approvedBy: ${FREEZE.approvedBy ?? "null"}, approvedAt: ${FREEZE.approvedAt ?? "null"}) |`);
  lines.push("");
  lines.push("**STRENGTH claim**");
  lines.push("");
  lines.push(`- State: **${c.strength.state}**`);
  lines.push(`- Direction: ${c.strength.direction > 0 ? "+1 (expect POSITIVE net R)" : "-1"}`);
  lines.push(`- Claim: ${c.strength.claim}`);
  lines.push("");
  lines.push("**WEAKNESS claim**");
  lines.push("");
  lines.push(`- State: **${c.weakness.state}**`);
  lines.push(`- Direction: ${c.weakness.direction < 0 ? "-1 (expect NEGATIVE net R)" : "+1"}`);
  lines.push(`- Claim: ${c.weakness.claim}`);
  lines.push("");
  lines.push("**Rationale (as written, pre-results)**");
  lines.push("");
  lines.push(`> ${c.rationale}`);
  lines.push("");
  lines.push("**Source(s)**");
  lines.push("");
  for (const s of c.sources ?? []) lines.push(`- ${s}`);
  if (!(c.sources ?? []).length) lines.push("- (none recorded)");
  lines.push("");
  lines.push("**Review fields (leave blank until the human freeze)**");
  lines.push("");
  lines.push("- Reviewer decision: _keep / edit / remove — `_");
  lines.push("- If edited, new strength/weakness state + rationale (pre-results only): _`______`_");
  lines.push("");
  lines.push("---");
  lines.push("");
}

lines.push("## Freeze gate (decision #13)");
lines.push("");
lines.push("Real verification stays BLOCKED until a reviewer sets `FREEZE.status = \"FROZEN\"`");
lines.push("with `approvedBy` and `approvedAt` in `claim-cards.draft.mjs`. **Amendment 2 does");
lines.push("not freeze anything.** See `docs/CLAIM-CARDS-REVIEW.md` for the review checklist.");
lines.push("");

const text = lines.join("\n") + "\n";
writeFileSync(OUT, text);
console.log(`wrote ${OUT}`);
console.log(`cards ${CLAIM_CARDS.length}, families ${FAMILIES.length}, status ${FREEZE.status}`);
console.log(`sha256 ${createHash("sha256").update(text).digest("hex")}`);
