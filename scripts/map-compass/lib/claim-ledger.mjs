/**
 * M5 — append-only claim ledger. One JSON line per (claim, evaluation).
 *
 * Rules (from FORWARD-VALIDATION.md §4, carried over):
 *  - append only; never edit or delete a line, including a failing one
 *  - a re-evaluation of the same key is allowed but recorded with rerun:true
 *  - discovery-window records are in-sample and can NEVER promote a candidate
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function ledgerPath(root, name = "claim-ledger.jsonl") {
  return `${root}/artifacts/map-compass/${name}`;
}

export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function claimHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 16);
}

/**
 * Append a verdict. Returns { record, rerun }.
 * `record` = { claimId, family, state, kind, windowKind, stats, verdict, ... }
 */
export function appendVerdict(path, record, { allowOverwrite = false } = {}) {
  const existing = readLedger(path);
  const key = (r) => `${r.claimId}|${r.kind}|${r.windowKind}`;
  const prior = existing.filter((r) => key(r) === key(record));
  const rerun = prior.length > 0;
  if (rerun && !allowOverwrite) {
    // Append a visible rerun rather than silently replacing history.
  }
  const line = {
    ...record,
    rerun,
    seq: existing.length + 1,
    id: claimHash({ ...record, seq: existing.length + 1 }),
    recordedAt: new Date().toISOString(),
  };
  appendFileSync(path, JSON.stringify(line) + "\n");
  return { record: line, rerun };
}

export function writeLedger(path, records) {
  writeFileSync(
    path,
    records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""),
  );
}

/** DRAFT guard: real verification is forbidden until a human freezes the cards. */
export function assertCardsFrozen(freeze) {
  if (freeze.status !== "FROZEN" || !freeze.approvedBy || !freeze.approvedAt) {
    throw new Error(
      `Claim cards are ${freeze.status} (approver=${freeze.approvedBy}). ` +
        "Decision #13 requires draft -> review -> FROZEN before any claim is tested. " +
        "Set status/approvedBy/approvedAt in claim-cards.draft.mjs after human review.",
    );
  }
}
