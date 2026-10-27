#!/usr/bin/env node
/**
 * G0 AMENDMENT 3 TASK 2b — BASELINE COVERAGE AUDIT.
 *
 * `verifyClaim` now fails closed (INCONCLUSIVE / NO_BASELINE) when a trade's
 * matched random-entry cell is missing at BOTH the fine and coarse levels.
 * This script answers, BEFORE any strategy result: how many claim / state /
 * session cells would actually hit that veto with the frozen baseline?
 *
 * It reads ONLY:
 *   - claim-cards.draft.mjs (DRAFT card metadata — no outcomes)
 *   - artifacts/map-compass/random-baseline.json (random-entry control)
 * No strategy run, no verdict, no trade outcome is used.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CLAIM_CARDS, TEST_ORDER } from "./claim-cards.draft.mjs";
import { matchedBaseline, NO_BASELINE } from "./lib/verification.mjs";
import {
  VERDICT_STATES,
  FOUR_STATES_OF,
  STATES,
  CLAIM_CRITERIA,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass");
const baseline = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));

const SESSIONS = ["asian", "london", "ny"];
const VOLS = ["low", "mid", "high"];
const SIDES = ["long", "short"];
const minN = CLAIM_CRITERIA.baselineMinCellN;

const cells = [];
const perClaim = new Map();
for (const c of CLAIM_CARDS) {
  for (const [kind, half] of [
    ["strength", c.strength],
    ["weakness", c.weakness],
  ]) {
    const sessions = c.sessionRestriction ? [c.sessionRestriction] : SESSIONS;
    for (const session of sessions) {
      for (const fourState of half.fourStates) {
        for (const side of SIDES) {
          for (const vol of VOLS) {
            const trade = { state: fourState, side, session, vol };
            const b = matchedBaseline(trade, baseline);
            const fine = baseline.fineCells?.[`${fourState}|${side}|${session}|${vol}`];
            const coarse = baseline.cells?.[`${fourState}|${side}`];
            const fineSufficient = !!fine?.sufficient && (fine.n ?? 0) >= minN;
            const coarseSufficient = (coarse?.n ?? 0) >= minN;
            const resolution = b.missing
              ? NO_BASELINE
              : b.level === "fine"
                ? "FINE"
                : "COARSE_FALLBACK";
            cells.push({
              claimId: c.id,
              family: c.family,
              kind,
              verdictState: half.state,
              fourState,
              session,
              side,
              vol,
              fineN: fine?.n ?? 0,
              fineSufficient,
              coarseN: coarse?.n ?? 0,
              coarseSufficient,
              resolution,
              baselineMeanR: b.mean,
            });
          }
        }
      }
    }
  }
}

const count = (pred) => cells.filter(pred).length;
const uniq = (keyFn) => new Set(cells.map(keyFn)).size;

// Aggregate at three levels so the answer is unambiguous.
const claimStateSession = new Map(); // claim|verdictState|session
const claimFourStateSession = new Map(); // claim|fourState|session
for (const x of cells) {
  const k1 = `${x.claimId}|${x.kind}|${x.verdictState}|${x.session}`;
  const k2 = `${x.claimId}|${x.kind}|${x.fourState}|${x.session}`;
  if (!claimStateSession.has(k1)) claimStateSession.set(k1, []);
  if (!claimFourStateSession.has(k2)) claimFourStateSession.set(k2, []);
  claimStateSession.get(k1).push(x);
  claimFourStateSession.get(k2).push(x);
}

const noBaselineVerdictCells = [...claimStateSession.entries()]
  .filter(([, v]) => v.every((x) => x.resolution === NO_BASELINE))
  .map(([k]) => k);
const partialNoBaselineVerdictCells = [...claimStateSession.entries()]
  .filter(([, v]) => v.some((x) => x.resolution === NO_BASELINE))
  .map(([k]) => k);
const noBaselineFourStateCells = [...claimFourStateSession.entries()]
  .filter(([, v]) => v.every((x) => x.resolution === NO_BASELINE))
  .map(([k]) => k);

const report = {
  generatedAt: new Date().toISOString(),
  purpose:
    "G0 Amendment 3 task 2b: how many claim / state / session cells would hit NO_BASELINE (no fine AND no coarse matched random cell)?",
  decidedBeforeResults: true,
  noStrategyOutcomesUsed: true,
  inputs: {
    baseline: "artifacts/map-compass/random-baseline.json",
    cards: "claim-cards.draft.mjs (DRAFT)",
    baselineMinCellN: minN,
    baselineHash: createHash("sha256")
      .update(readFileSync(join(OUT, "random-baseline.json")))
      .digest("hex"),
  },
  rule: {
    resolution: "fine (sufficient) -> coarse (n >= minN) -> NO_BASELINE",
    zeroFallback: false,
    note: "matchedBaseline() returns mean: null (never 0) when both levels are missing; verifyClaim then returns INCONCLUSIVE with a NO_BASELINE veto.",
  },
  universe: {
    cards: CLAIM_CARDS.length,
    claimHalves: CLAIM_CARDS.length * 2,
    verdictStates: VERDICT_STATES,
    fourStates: STATES,
    sessions: SESSIONS,
    volBuckets: VOLS,
    sides: SIDES,
    sessionRestrictedCards: CLAIM_CARDS.filter((c) => c.sessionRestriction).map((c) => c.id),
    tradeLevelLookupCells: cells.length,
    claimVerdictStateSessionCells: claimStateSession.size,
    claimFourStateSessionCells: claimFourStateSession.size,
    distinctClaimStateSessionKeys: uniq(
      (x) => `${x.claimId}|${x.kind}|${x.verdictState}|${x.session}`,
    ),
  },
  resolutionCounts: {
    FINE: count((x) => x.resolution === "FINE"),
    COARSE_FALLBACK: count((x) => x.resolution === "COARSE_FALLBACK"),
    [NO_BASELINE]: count((x) => x.resolution === NO_BASELINE),
  },
  answer: {
    noBaselineTradeLevelCells: count((x) => x.resolution === NO_BASELINE),
    noBaselineClaimVerdictStateSessionCells: noBaselineVerdictCells.length,
    noBaselineClaimFourStateSessionCells: noBaselineFourStateCells.length,
    partiallyAffectedClaimVerdictStateSessionCells: partialNoBaselineVerdictCells.length,
    noBaselineClaimHalves: new Set(
      cells.filter((x) => x.resolution === NO_BASELINE).map((x) => `${x.claimId}|${x.kind}`),
    ).size,
    noBaselineCards: new Set(
      cells.filter((x) => x.resolution === NO_BASELINE).map((x) => x.claimId),
    ).size,
    noBaselineSessions: [...new Set(cells.filter((x) => x.resolution === NO_BASELINE).map((x) => x.session))],
  },
  // Hypothetical: if the COARSE fallback were forbidden, every insufficient
  // fine cell would become NO_BASELINE. Reported so the reader sees how much
  // coverage depends on the (legitimate) coarse fallback.
  strictFineOnlyHypothetical: {
    wouldBeNoBaselineTradeLevelCells: cells.filter(
      (x) => !x.fineSufficient,
    ).length,
    wouldBeAffectedClaimVerdictStateSessionCells: [...claimStateSession.entries()]
      .filter(([, v]) => v.some((x) => !x.fineSufficient))
      .map(([k]) => k).length,
    note: "NOT the shipped rule. Shows that removing the coarse fallback would create real NO_BASELINE holes; the shipped rule keeps coarse fallback but NEVER a zero fallback.",
  },
  coarseCellCoverage: Object.fromEntries(
    Object.entries(baseline.cells).map(([k, v]) => [k, { n: v.n ?? 0, sufficient: (v.n ?? 0) >= minN }]),
  ),
  fineCellCoverage: {
    total: Object.keys(baseline.fineCells ?? {}).length,
    sufficient: Object.values(baseline.fineCells ?? {}).filter(
      (v) => v.sufficient && (v.n ?? 0) >= minN,
    ).length,
    insufficient: Object.values(baseline.fineCells ?? {}).filter(
      (v) => !v.sufficient || (v.n ?? 0) < minN,
    ).length,
    insufficientKeys: Object.entries(baseline.fineCells ?? {})
      .filter(([, v]) => !v.sufficient || (v.n ?? 0) < minN)
      .map(([k, v]) => ({ key: k, n: v.n }))
      .sort((a, b) => a.n - b.n),
  },
  perClaimSummary: [...claimStateSession.entries()]
    .map(([k, v]) => ({
      cell: k,
      lookups: v.length,
      noBaseline: v.filter((x) => x.resolution === NO_BASELINE).length,
      fine: v.filter((x) => x.resolution === "FINE").length,
      coarseFallback: v.filter((x) => x.resolution === "COARSE_FALLBACK").length,
    }))
    .sort((a, b) => b.noBaseline - a.noBaseline || a.cell.localeCompare(b.cell)),
  reversionCaveat: {
    families: REVERSION_FAMILIES,
    label: EXIT_CAVEAT,
    note: "Every verdict row for these families carries this label. No new exit is added in this cycle.",
  },
  // TASK 4 — enumerate ALL 48 verdict slots and label the reversion ones.
  // No verdict exists yet (cards are DRAFT); these are the LABELS that every
  // future verdict for that slot must carry.
  verdictLabels: CLAIM_CARDS.flatMap((c) =>
    [
      ["strength", c.strength],
      ["weakness", c.weakness],
    ].map(([kind, half]) => ({
      claimId: c.id,
      kind,
      family: c.family,
      verdictState: half.state,
      fourStates: half.fourStates,
      exitCaveat: c.exitCaveat,
      verdictLabel: c.exitCaveat
        ? `${c.id} ${kind} in ${half.state} — ${EXIT_CAVEAT}`
        : `${c.id} ${kind} in ${half.state}`,
      reversionFamily: REVERSION_FAMILIES.includes(c.family),
      verdictExists: false,
    })),
  ),
  verdictLabelSummary: {
    totalVerdictSlots: CLAIM_CARDS.length * 2,
    labelledReversionSlots: CLAIM_CARDS.filter((c) => REVERSION_FAMILIES.includes(c.family)).length * 2,
    label: EXIT_CAVEAT,
    note: "Cards are DRAFT, so no verdict has been produced. These are the pre-registered labels; every future verdict for a reversion-family slot MUST be printed with this suffix. No new exit in this cycle.",
  },
};
writeFileSync(join(OUT, "baseline-coverage.json"), JSON.stringify(report, null, 2) + "\n");

const a = report.answer;
console.log(`trade-level lookup cells: ${cells.length}`);
console.log(
  `claim|verdictState|session cells: ${claimStateSession.size}; claim|fourState|session cells: ${claimFourStateSession.size}`,
);
console.log(
  `NO_BASELINE: ${a.noBaselineTradeLevelCells} trade cells, ${a.noBaselineClaimVerdictStateSessionCells} verdict cells, ${a.noBaselineClaimFourStateSessionCells} four-state cells; ${a.noBaselineCards} cards, ${a.noBaselineClaimHalves} claim halves`,
);
console.log(
  `resolutions: FINE ${report.resolutionCounts.FINE}, COARSE_FALLBACK ${report.resolutionCounts.COARSE_FALLBACK}, NO_BASELINE ${report.resolutionCounts[NO_BASELINE]}`,
);
console.log(
  `strict-fine-only hypothetical NO_BASELINE cells: ${report.strictFineOnlyHypothetical.wouldBeNoBaselineTradeLevelCells}`,
);
console.log(
  `verdict labels: ${report.verdictLabelSummary.labelledReversionSlots}/${report.verdictLabelSummary.totalVerdictSlots} carry "${EXIT_CAVEAT}"`,
);
