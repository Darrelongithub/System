#!/usr/bin/env node
/**
 * M4 — build the Compass routing table from the claim ledger.
 *
 * This script is INERT until claim cards are frozen and M5 produces verdicts.
 * It writes an all-empty routing table (flat everywhere) plus a plumbing
 * report. That is the correct G4 state: no strategy ships without a CONFIRMED
 * claim. Running it before verification is safe and is the plumbing test.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { STATES } from "./frozen.mjs";
import { CLAIM_CARDS, FREEZE, validateClaimCards } from "./claim-cards.draft.mjs";
import { buildRoutingTable, routingFingerprint } from "./lib/compass.mjs";
import { readLedger, ledgerPath } from "./lib/claim-ledger.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass");
const LEDGER = ledgerPath(ROOT);

const errors = validateClaimCards();
if (errors.length) {
  console.error("claim card errors:", errors);
  process.exit(1);
}

// Only CONFIRMED verdicts from a DISCOVERY/DEV window may enable a strategy.
// A holdout/VAL record can never promote (FORWARD-VALIDATION.md §1).
const records = existsSync(LEDGER) ? readLedger(LEDGER) : [];
const verdicts = new Map();
const conditionalIds = new Set();
let ignored = 0;
for (const r of records) {
  if (r.windowKind && r.windowKind !== "DEV") {
    ignored++;
  } else {
    if (r.verdict) verdicts.set(`${r.claimId}|${r.state}`, r.verdict);
  }
  // CONDITIONAL status is a property of the claim on the DEV sweep; it is
  // reported at M9/M10 and can only be lifted by VAL support.
  if (r.conditional === true || r.stability === "DEFINITION_SENSITIVE")
    conditionalIds.add(r.claimId);
}

// G0 Amendment 2 (user default "no"): CONDITIONAL claims do not enable Compass.
const routing = buildRoutingTable(verdicts, CLAIM_CARDS, { conditionalIds, records });
const fingerprint = routingFingerprint(routing);
const enabledCount = STATES.reduce((n, s) => n + routing.table[s].length, 0);

// Plumbing test: route a synthetic signal stream through the table.
const probe = [];
for (const s of STATES) {
  for (const c of CLAIM_CARDS) {
    for (const session of ["asian", "london", "ny"]) {
      probe.push({ index: probe.length, strategyId: c.id, side: "long", state: s, session });
    }
  }
}
const { routeSignals } = await import("./lib/compass.mjs");
const routed = routeSignals(probe, routing, CLAIM_CARDS);

const report = {
  generatedAt: new Date().toISOString(),
  compassVersion: "M4-v0 (binary allow-list, no learned weights)",
  cardStatus: FREEZE.status,
  cardsFrozen: FREEZE.status === "FROZEN",
  cards: CLAIM_CARDS.length,
  ledgerRecords: records.length,
  ignoredNonDevRecords: ignored,
  verdictKeys: verdicts.size,
  enabledCount,
  conditionalIds: [...conditionalIds],
  conditionalPolicy: routing.conditionalPolicy,
  table: routing.table,
  reasons: routing.reasons,
  routingHash: createHash("sha256").update(fingerprint).digest("hex"),
  plumbing: {
    probeSignals: probe.length,
    kept: routed.kept.length,
    dropped: routed.dropped,
    exact: routed.kept.every((s) => routing.table[s.state].includes(s.strategyId)),
  },
  note:
    enabledCount === 0
      ? "No strategy has a CONFIRMED claim yet. Compass is flat everywhere — correct pre-verification state."
      : "Routing active. Freeze this hash at G4 before VAL.",
};
writeFileSync(join(OUT, "routing-table.json"), JSON.stringify(report, null, 2) + "\n");

console.log(
  `cards ${CLAIM_CARDS.length} (${FREEZE.status}), ledger ${records.length}, verdict keys ${verdicts.size}`,
);
console.log(
  `enabled ${enabledCount} strategy-state entries; table hash ${report.routingHash.slice(0, 12)}`,
);
console.log(`plumbing: ${routed.kept.length}/${probe.length} kept, exact=${report.plumbing.exact}`);
if (!report.plumbing.exact) process.exit(1);
