#!/usr/bin/env node
/**
 * G0 AMENDMENT 4 TASK 2 — SIGNAL COUNTS ON DEV (no outcomes).
 *
 * Runs the 24 entry-signal functions (lib/signals.mjs) on the DEV window and
 * counts, per card and per family: signals by side, by verdict state, by the
 * four Map states, by session, and by the verdict state 20 bars BEFORE the
 * signal (a diagnostic only). It also reports the share of each family's
 * signals landing in its strength state, and lists every claim cell whose
 * expected n is below 100 as STRUCTURALLY THIN.
 *
 * NO OUTCOMES: this reads only bars + Map states + the signal parameters. It
 * does NOT run the exit harness, does NOT compute R, and does NOT touch the
 * claim cards, the Map, or any threshold. It does not change anything.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dataLines, num } from "./lib/csv.mjs";
import { emitSignals, signalLibrarySelfCheck, FORBIDDEN_SIGNAL_FIELDS } from "./lib/signals.mjs";
import { SIGNAL_PARAMS, paramsToString } from "./signal-params.mjs";
import {
  CLAIM_CARDS,
  FAMILIES,
  TEST_ORDER,
  validateClaimCards,
  FROZEN_TEST_SEQUENCE,
} from "./claim-cards.draft.mjs";
import {
  VERDICT_STATES,
  VERDICT_STATE_OF,
  FOUR_STATES_OF,
  FAMILY_STRENGTH_STATE,
  otherVerdictState,
  STATES,
  CLAIM_CRITERIA,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const errors = validateClaimCards();
if (errors.length) {
  console.error("claim card errors:", errors);
  process.exit(1);
}
if (signalLibrarySelfCheck().length) {
  console.error("signal library errors:", signalLibrarySelfCheck());
  process.exit(1);
}

const barsPath = join(NORM, "xauusd-m30-eat.csv");
const statesPath = join(NORM, "xauusd-m30-map.csv");
if (!existsSync(barsPath) || !existsSync(statesPath)) {
  console.error("run mc:map first");
  process.exit(2);
}

const bars = [];
for (const f of dataLines(readFileSync(barsPath, "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  const o = num(f[1]), h = num(f[2]), l = num(f[3]), c = num(f[4]);
  if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
  bars.push({ datetime: f[0], o, h, l, c });
}

// Map states + role, aligned 1:1 with bars.
const mapLines = readFileSync(statesPath, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("datetime"));
const states = new Array(bars.length).fill(null);
const roles = new Array(bars.length).fill(null);
let bi = 0;
for (const line of mapLines) {
  const f = line.split(",");
  while (bi < bars.length && bars[bi].datetime !== f[0]) bi++;
  if (bi >= bars.length) break;
  states[bi] = f[1];
  roles[bi] = f[12];
  bi++;
}

const SESSIONS = ["asian", "london", "ny"];
const DEV_IDX = new Set();
for (let i = 0; i < bars.length; i++) if (roles[i] === "DEV") DEV_IDX.add(i);
const devBars = DEV_IDX.size;

const signalStates = states.map((s) => (s && STATES.includes(s) ? s : null));

// Run all 24 signals once, keeping every emitted row.
const perCard = {};
for (const id of FROZEN_TEST_SEQUENCE) {
  perCard[id] = emitSignals(bars, id, { states: signalStates });
}

/** Bucket a signal list into the requested dimensions. */
function bucket(rows) {
  const by = { side: {}, verdictState: {}, fourState: {}, session: {}, verdictStateLag20: {}, lagFourState: {} };
  for (const r of rows) {
    const i = r.index;
    if (!DEV_IDX.has(i)) continue;
    by.side[r.side] = (by.side[r.side] ?? 0) + 1;
    if (r.verdictState) by.verdictState[r.verdictState] = (by.verdictState[r.verdictState] ?? 0) + 1;
    if (r.fourState) by.fourState[r.fourState] = (by.fourState[r.fourState] ?? 0) + 1;
    if (r.session) by.session[r.session] = (by.session[r.session] ?? 0) + 1;
    // verdict state 20 bars BEFORE the signal — diagnostic only
    const lag = i - 20;
    if (lag >= 0) {
      const s = signalStates[lag];
      if (s) {
        const vs = VERDICT_STATE_OF[s];
        by.verdictStateLag20[vs] = (by.verdictStateLag20[vs] ?? 0) + 1;
        by.lagFourState[s] = (by.lagFourState[s] ?? 0) + 1;
      }
    }
  }
  return by;
}

const cardRows = FROZEN_TEST_SEQUENCE.map((id) => {
  const c = CLAIM_CARDS.find((x) => x.id === id);
  const rows = perCard[id];
  const devRows = rows.filter((r) => DEV_IDX.has(r.index));
  return {
    cardId: id,
    family: c.family,
    variant: c.variant,
    priority: c.priority,
    evidenceTier: c.evidenceTier,
    verdictStrength: c.strength.state,
    verdictWeakness: c.weakness.state,
    fourStateTextbookStrength: c.strength.textbookState,
    fourStateTextbookWeakness: c.weakness.textbookState,
    sessionRestriction: c.sessionRestriction,
    parameters: c.parameters,
    parametersString: paramsToString(id),
    allSignals: rows.length,
    devSignals: devRows.length,
    buckets: bucket(rows),
    // expected n per claim half, measured on DEV bars in that verdict state
    strengthExpectedN: devRows.filter((r) => r.verdictState === c.strength.state).length,
    weaknessExpectedN: devRows.filter((r) => r.verdictState === c.weakness.state).length,
    strengthShareOfCard: devRows.length ? +(devRows.filter((r) => r.verdictState === c.strength.state).length / devRows.length).toFixed(4) : 0,
  };
});

// Family level: pool the three cards.
const familyRows = FAMILIES.map((f) => {
  const cards = cardRows.filter((r) => r.family === f);
  const all = cards.flatMap((r) => perCard[r.cardId].filter((x) => DEV_IDX.has(x.index)));
  const strengthState = FAMILY_STRENGTH_STATE[f];
  const weaknessState = otherVerdictState(strengthState);
  return {
    family: f,
    strengthState,
    weaknessState,
    strengthExpectedN: all.filter((r) => r.verdictState === strengthState).length,
    weaknessExpectedN: all.filter((r) => r.verdictState === weaknessState).length,
    strengthShare: all.length ? +(all.filter((r) => r.verdictState === strengthState).length / all.length).toFixed(4) : 0,
    totalDevSignals: all.length,
    buckets: bucket(cards.flatMap((r) => perCard[r.cardId])),
  };
});

// Claim cells: (card, half, verdictState) — expected n < 100 => STRUCTURALLY THIN.
const cells = [];
for (const r of cardRows) {
  for (const half of [
    { kind: "strength", state: r.verdictStrength, n: r.strengthExpectedN },
    { kind: "weakness", state: r.verdictWeakness, n: r.weaknessExpectedN },
  ]) {
    cells.push({
      cardId: r.cardId,
      family: r.family,
      kind: half.kind,
      verdictState: half.state,
      expectedN: half.n,
      structurallyThin: half.n < CLAIM_CRITERIA.minTradesPerCell,
    });
  }
}
const thinCells = cells.filter((c) => c.structurallyThin);

// Family-level claim cells (the cells that actually decide verdicts).
const familyCells = [];
for (const f of familyRows) {
  for (const half of [
    { kind: "strength", state: f.strengthState, n: f.strengthExpectedN },
    { kind: "weakness", state: f.weaknessState, n: f.weaknessExpectedN },
  ]) {
    familyCells.push({
      family: f.family,
      kind: half.kind,
      verdictState: half.state,
      expectedN: half.n,
      structurallyThin: half.n < CLAIM_CRITERIA.minTradesPerCell,
    });
  }
}
const thinFamilyCells = familyCells.filter((c) => c.structurallyThin);
const familiesWithAnyTestableCell = familyRows.filter(
  (f) => f.strengthExpectedN >= CLAIM_CRITERIA.minTradesPerCell || f.weaknessExpectedN >= CLAIM_CRITERIA.minTradesPerCell,
);
const familiesWithoutAnyTestableCell = familyRows.filter(
  (f) => f.strengthExpectedN < CLAIM_CRITERIA.minTradesPerCell && f.weaknessExpectedN < CLAIM_CRITERIA.minTradesPerCell,
);

// Field hygiene: no signal row may carry outcome-related fields.
const forbiddenHits = [];
for (const id of FROZEN_TEST_SEQUENCE) {
  for (const r of perCard[id].slice(0, 2000)) {
    for (const k of Object.keys(r)) if (FORBIDDEN_SIGNAL_FIELDS.includes(k)) forbiddenHits.push(`${id}.${k}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  purpose:
    "G0 Amendment 4 task 2: signal counts on DEV for the 24 entry-signal functions. NO outcomes, NO exits, NO R.",
  decidedBeforeResults: true,
  noStrategyOutcomesUsed: true,
  inputs: {
    bars: "artifacts/map-compass/normalized/xauusd-m30-eat.csv",
    mapStates: "artifacts/map-compass/normalized/xauusd-m30-map.csv",
    cards: "claim-cards.draft.mjs (DRAFT) + signal-params.mjs",
    barsTotal: bars.length,
    devBars,
    devBarShare: +(devBars / bars.length).toFixed(4),
    verdictStates: VERDICT_STATES,
    fourStates: STATES,
    sessions: SESSIONS,
    mapHash: createHash("sha256").update(readFileSync(statesPath)).digest("hex"),
    signalLibrarySelfCheck: signalLibrarySelfCheck(),
  },
  cardCount: cardRows.length,
  familyCount: familyRows.length,
  totalSignalsAllCards: Object.values(perCard).reduce((a, b) => a + b.length, 0),
  totalDevSignalsAllCards: cardRows.reduce((a, r) => a + r.devSignals, 0),
  forbiddenSignalFields: forbiddenHits,
  minTradesPerCell: CLAIM_CRITERIA.minTradesPerCell,
  cards: cardRows,
  families: familyRows,
  cells,
  thinCells,
  familyCells,
  thinFamilyCells,
  structurallyThinSummary: {
    thinCellCount: thinCells.length,
    thinFamilyCellCount: thinFamilyCells.length,
    totalCells: cells.length,
    totalFamilyCells: familyCells.length,
    familiesWithAnyTestableCell: familiesWithAnyTestableCell.map((f) => f.family),
    familiesWithoutAnyTestableCell: familiesWithoutAnyTestableCell.map((f) => f.family),
    familiesWithoutAnyTestableCellCount: familiesWithoutAnyTestableCell.length,
  },
  note:
    "STRUCTURALLY THIN means the measured DEV signal count for that claim cell is below the frozen n >= 100 gate. It says NOTHING about whether the strategy works — only that the cell cannot be tested with the current DEV window. It does NOT authorise changing any card, state, Map threshold or criterion.",
};
writeFileSync(join(OUT, "signal-counts.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`DEV bars ${devBars} of ${bars.length}`);
console.log(
  `signals: ${report.totalDevSignalsAllCards} on DEV across ${cardRows.length} cards; forbidden fields: ${forbiddenHits.length}`,
);
console.log("\ncard                         DEV   L      S   strengthN  weakN   thin(s/w)");
for (const r of cardRows) {
  console.log(
    `${r.cardId.padEnd(26)} ${String(r.devSignals).padStart(6)} ${String(r.buckets.side.long ?? 0).padStart(4)} ${String(r.buckets.side.short ?? 0).padStart(4)} ${String(r.strengthExpectedN).padStart(8)} ${String(r.weaknessExpectedN).padStart(6)}   ${r.strengthExpectedN < 100 ? "Y" : "-"}/${r.weaknessExpectedN < 100 ? "Y" : "-"}`,
  );
}
console.log("\nfamily                        strengthN  weakN    strengthShare");
for (const f of familyRows) {
  console.log(
    `${f.family.padEnd(28)} ${String(f.strengthExpectedN).padStart(8)} ${String(f.weaknessExpectedN).padStart(6)}    ${f.strengthShare}`,
  );
}
console.log(
  `\nSTRUCTURALLY THIN: ${thinCells.length}/${cells.length} card cells, ${thinFamilyCells.length}/${familyCells.length} family cells`,
);
console.log(
  `families with NO testable cell: ${familiesWithoutAnyTestableCell.map((f) => f.family).join(", ") || "(none)"}`,
);
