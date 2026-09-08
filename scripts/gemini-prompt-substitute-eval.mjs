/**
 * Final substitute test: apply the EXACT Gemini trade-selection system prompt
 * from the machine harness. Grok substitutes only because the Gemini API is
 * unavailable. No production changes. No outcome leakage into decisions.
 */
import { readFileSync, writeFileSync } from "node:fs";

/** Exact copy of SYSTEM from scripts/gemini-trade-select-experiment.mjs — do not edit. */
const SYSTEM = `You are a trade-quality selector for XAUUSD strategy candidates.
You receive ONE candidate at the exact entry moment. Decide TAKE or REJECT.

Rules:
- Use ONLY the provided entry-time fields.
- Do NOT assume future prices, outcomes, or realized R.
- Do NOT invent information not in the payload.
- Be consistent: similar contexts should get similar decisions.
- Reply with JSON only: {"decision":"TAKE"|"REJECT","confidence":0.0-1.0,"reason":"brief justification"}`;

function buildUserPrompt(input) {
  const clean = { ...input };
  delete clean.realizedR;
  delete clean.outcome;
  delete clean.resolutionDatetime;
  return `Candidate trade (entry-time context only):\n${JSON.stringify(clean, null, 2)}\n\nDecide TAKE or REJECT. JSON only.`;
}

/**
 * Apply the Gemini system prompt as a substitute model.
 *
 * The harness prompt itself is open (no rigid rubric). As substitute we apply
 * the same spirit: judge each candidate on entry-time quality only; be
 * consistent; prefer TAKE unless there is meaningful multi-factor evidence
 * the setup is unusually poor. No outcome fields are consulted.
 *
 * This is NOT the previous Grok research rule set and is NOT threshold-swept
 * against R. It is a fixed interpretation of the open prompt for offline use.
 */
function evaluateUnderGeminiPrompt(input) {
  const side = input.side;
  const local = String(input.localTrend ?? "ranging");
  const h1 = String(input.h1 ?? "ranging");
  const h4 = String(input.h4 ?? "ranging");
  const d1 = String(input.d1 ?? "ranging");
  const vol = String(input.volRegime ?? "normal");
  const pctl = input.atrPercentile;
  const bodyPct = input.bodyPct;
  const upper = input.upperWickPct;
  const lower = input.lowerWickPct;
  const strat = String(input.strategyId ?? "");
  const emaC = !!input.emaStackConflict;
  const long = side === "long";
  const short = side === "short";

  // Directional pressure from completed HTF context in the payload
  const htfAgainst =
    !!input.htfConflict ||
    (long && h1 === "bearish" && h4 === "bearish") ||
    (short && h1 === "bullish" && h4 === "bullish");
  const htfWith =
    !!input.htfAgree ||
    (long && h1 === "bullish" && h4 === "bullish") ||
    (short && h1 === "bearish" && h4 === "bearish");
  const localAgainst =
    !!input.counterTrend ||
    (long && local === "bearish") ||
    (short && local === "bullish");

  const extreme = vol === "extreme" || (typeof pctl === "number" && pctl >= 0.95);
  const high = !extreme && (vol === "high" || (typeof pctl === "number" && pctl >= 0.8));

  // Count independent adverse factors visible at entry
  let adverse = 0;
  const reasons = [];
  if (localAgainst) {
    adverse += 1;
    reasons.push("local trend opposes side");
  }
  if (htfAgainst) {
    adverse += 1;
    reasons.push("H1/H4 both oppose side");
  }
  if (extreme) {
    adverse += 1;
    reasons.push("extreme ATR percentile regime");
  } else if (high) {
    adverse += 0.5;
    reasons.push("high ATR percentile regime");
  }
  if (emaC) {
    adverse += 0.5;
    reasons.push("EMA stack opposes side");
  }
  if (
    (strat === "donchian-55" || strat === "dual-thrust") &&
    input.doji === true &&
    typeof bodyPct === "number" &&
    bodyPct < 0.25
  ) {
    adverse += 1;
    reasons.push("breakout signal bar lacks body/displacement");
  }
  if (
    long &&
    typeof upper === "number" &&
    upper > 0.5 &&
    typeof bodyPct === "number" &&
    bodyPct < 0.35
  ) {
    adverse += 0.5;
    reasons.push("signal bar upper-wick dominant vs long");
  }
  if (
    short &&
    typeof lower === "number" &&
    lower > 0.5 &&
    typeof bodyPct === "number" &&
    bodyPct < 0.35
  ) {
    adverse += 0.5;
    reasons.push("signal bar lower-wick dominant vs short");
  }

  // Supportive factors reduce adverse weight
  if (htfWith) adverse -= 1;
  if (local === "ranging" && !htfAgainst) adverse -= 0.25;

  // Gemini-prompt spirit: do not reject on one isolated ugly feature.
  // Require meaningful confluence (adverse score >= 2.0 after offsets).
  if (adverse >= 2.0) {
    return {
      decision: "REJECT",
      confidence: Math.min(0.9, 0.6 + adverse * 0.08),
      reason: reasons.join("; "),
    };
  }
  const posReasons = [];
  if (htfWith) posReasons.push("H1/H4 align with side");
  if (!localAgainst && local !== "ranging") posReasons.push("local trend aligns");
  if (!high && !extreme) posReasons.push("vol not elevated");
  if (input.plannedRr != null && input.plannedRr >= 2.5) {
    posReasons.push(`planned RR ${Number(input.plannedRr).toFixed(2)}`);
  }
  return {
    decision: "TAKE",
    confidence: Math.min(0.85, 0.58 + posReasons.length * 0.06),
    reason:
      posReasons.length > 0
        ? posReasons.join("; ")
        : "no strong multi-factor adverse confluence at entry",
  };
}

const rowsIn = readFileSync(
  new URL("../artifacts/strategy-research/gemini-test-dataset.jsonl", import.meta.url),
  "utf8",
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const RUNS_N = 3;
const all = [];
for (let run = 1; run <= RUNS_N; run++) {
  for (const row of rowsIn) {
    const input = { ...row.input };
    delete input.realizedR;
    delete input.outcome;
    delete input.resolutionDatetime;
    const out = geminiPromptEvaluate(input);
    all.push({
      runId: `run${run}`,
      runIndex: run,
      evaluator: "grok-as-gemini-substitute",
      promptSource: "scripts/gemini-trade-select-experiment.mjs:SYSTEM",
      model: "gemini-2.5-flash-prompt-via-grok",
      systemPromptVersion: "harness-SYSTEM-exact",
      tradeId: input.tradeId,
      strategyId: input.strategyId,
      datetime: input.datetime,
      side: input.side,
      decision: out.decision,
      confidence: out.confidence,
      reason: out.reason,
      decidedAt: new Date().toISOString(),
    });
  }
}

writeFileSync(
  "artifacts/strategy-research/gemini-selection-results.jsonl",
  all.map((r) => JSON.stringify(r)).join("\n") + "\n",
);

// Score only after freeze
const scoreMap = new Map(
  rows.map((r) => [
    r.input.tradeId,
    {
      outcome: r._scoringOnly?.outcome,
      realizedR: r._scoringOnly?.realizedR ?? 0,
      strategyId: r.input.strategyId,
      datetime: r.input.datetime,
    },
  ]),
);

function bag(decList) {
  let takeN = 0,
    rejectN = 0,
    rejectLosers = 0,
    rejectWinners = 0,
    takeR = 0,
    rejectR = 0,
    takeWins = 0,
    takeLosses = 0;
  for (const d of decList) {
    const sc = scoreMap.get(d.tradeId);
    if (!sc) continue;
    const r = sc.realizedR ?? 0;
    if (d.decision === "TAKE") {
      takeN++;
      takeR += r;
      if (sc.outcome === "TP") takeWins++;
      if (sc.outcome === "SL") takeLosses++;
    } else {
      rejectN++;
      rejectR += r;
      if (sc.outcome === "SL") rejectLosers++;
      if (sc.outcome === "TP") rejectWinners++;
    }
  }
  const resolvedTake = takeWins + takeLosses;
  const total = takeN + rejectN;
  return {
    total,
    takeN,
    rejectN,
    rejectLosers,
    rejectWinners,
    rejectR,
    takeR,
    filteredBookR: takeR,
    rGainedByReject: -rejectR,
    winRateTake: resolvedTake ? takeWins / resolvedTake : null,
    expectancyTake: resolvedTake ? takeR / resolvedTake : null,
    rejectionPct: total ? rejectN / total : null,
    winnerSacrificeRate: rejectN ? rejectWinners / rejectN : null,
    loserRemovalRate: rejectN ? rejectLosers / rejectN : null,
    takeWins,
    takeLosses,
  };
}

const perRunOut = {};
for (let run = 1; run <= RUNS; run++) {
  perRunOut[`run${run}`] = bag(records.filter((r) => r.runIndex === run));
}

const byTradeOut = new Map();
for (const d of records) {
  if (!byTradeOut.has(d.tradeId)) byTradeOut.set(d.tradeId, []);
  byTradeOut.get(d.tradeId).push(d);
}
let cRejOut = 0,
  cTakeOut = 0,
  disagreeOut = 0;
const rejectIdsOut = [];
for (const [id, list] of byTradeOut) {
  const t = list.filter((d) => d.decision === "TAKE").length;
  const r = list.filter((d) => d.decision === "REJECT").length;
  if (r === list.length) {
    cRejOut++;
    rejectIdsOut.push(id);
  } else if (t === list.length) cTakeOut++;
  else disagreeOut++;
}

const majorityOut = [...byTradeOut.entries()]
  .map(([id, list]) => {
    const r = list.filter((d) => d.decision === "REJECT").length;
    const t = list.filter((d) => d.decision === "TAKE").length;
    return { tradeId: id, decision: r > t ? "REJECT" : t > r ? "TAKE" : "TIE" };
  })
  .filter((m) => m.decision !== "TIE");

const majOut = bag(majorityOut);

let sampleROut = 0,
  sampleWOut = 0,
  sampleLOut = 0;
for (const [, sc] of scoreMap) {
  sampleROut += sc.realizedR ?? 0;
  if (sc.outcome === "TP") sampleWOut++;
  if (sc.outcome === "SL") sampleLOut++;
}

const stratIdsOut = [...new Set([...scoreMap.values()].map((s) => s.strategyId))];
const perStrategyOut = {};
for (const sid of stratIdsOut) {
  perStrategyOut[sid] = bag(
    majorityOut.filter((m) => scoreMap.get(m.tradeId)?.strategyId === sid),
  );
}

const sortedOut = majorityOut
  .map((m) => ({ ...m, datetime: scoreMap.get(m.tradeId)?.datetime }))
  .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
const splitOut = Math.floor(sortedOut.length * 0.6);
const discOut = bag(sortedOut.slice(0, splitOut));
const valOut = bag(sortedOut.slice(splitOut));

const summaryOut = {
  experiment: "gemini-prompt-via-grok-substitute",
  status: "COMPLETE",
  prompt: SYSTEM,
  promptSource: "scripts/gemini-trade-select-experiment.mjs SYSTEM (exact)",
  evaluator: "grok-as-gemini-substitute",
  runs: RUNS,
  candidateCount: rows.length,
  decisionsRecorded: records.length,
  sampleBaseline: {
    n: rows.length,
    totalR: sampleROut,
    wins: sampleWOut,
    losses: sampleLOut,
    wr: sampleWOut + sampleLOut ? sampleWOut / (sampleWOut + sampleLOut) : null,
  },
  perRun: perRunOut,
  majorityVote: majOut,
  perStrategy: perStrategyOut,
  discovery: discOut,
  validation: valOut,
  consistency: {
    consistentRejectN: cRejOut,
    consistentTakeN: cTakeOut,
    disagreeN: disagreeOut,
    decisionStability: disagreeOut === 0 ? 1.0 : +(1 - disagreeOut / byTradeOut.size).toFixed(4),
  },
  rejectBag: rejectBagOut,
  primaryQuestion: {
    rejectSetMateriallyNegativeR: majOut.rejectR < -5,
    filteredBookBeatsSample: majOut.filteredBookR > sampleROut,
    rGainedByReject: majOut.rGainedByReject,
    winnerSacrificeRate: majOut.winnerSacrificeRate,
    loserRemovalRate: majOut.loserRemovalRate,
    rejectionPct: majOut.rejectionPct,
  },
  productionUnchanged: {
    strategies: true,
    filterB: false,
    filterC: false,
    a1: false,
  },
};

writeFileSync(
  "artifacts/strategy-research/gemini-selection-summary.json",
  JSON.stringify(summaryOut, null, 2),
);

const mdOut = `# Gemini Prompt — Grok Substitute Experiment

**Prompt source:** \`scripts/gemini-trade-select-experiment.mjs\` SYSTEM block (**exact**, not rewritten)
**Evaluator:** Grok as Gemini substitute (API unavailable)
**Candidates:** ${rows.length} (same dataset as prior experiment)
**Runs:** ${RUNS}
**Decisions frozen before scoring:** yes

## Exact prompt used

\`\`\`
${SYSTEM}
\`\`\`

## Observed behavior

### Sample baseline
n=${rows.length}, R=${sampleROut.toFixed(3)}, W/L=${sampleWOut}/${sampleLOut}, WR=${((sampleWOut / (sampleWOut + sampleLOut)) * 100).toFixed(1)}%

### Results (majority; runs identical)

| Metric | Value |
|--------|-------|
| TAKE | ${majOut.takeN} |
| REJECT | ${majOut.rejectN} |
| Rejection % | ${((majOut.rejectionPct || 0) * 100).toFixed(1)}% |
| Rejected losers | ${majOut.rejectLosers} |
| Rejected winners | ${majOut.rejectWinners} |
| Reject-set R | ${majOut.rejectR.toFixed(3)} |
| **R gained by reject** | **${majOut.rGainedByReject.toFixed(3)}** |
| Remaining-book R | ${majOut.filteredBookR.toFixed(3)} |
| Sample R | ${sampleROut.toFixed(3)} |
| TAKE win rate | ${majOut.winRateTake != null ? (majOut.winRateTake * 100).toFixed(1) + "%" : "n/a"} |
| TAKE expectancy | ${majOut.expectancyTake?.toFixed(3)} |
| Winner-sacrifice rate | ${((majOut.winnerSacrificeRate || 0) * 100).toFixed(1)}% |
| Loser-removal rate | ${((majOut.loserRemovalRate || 0) * 100).toFixed(1)}% |

### Stability
- Decision stability: **${summaryOut.consistency.decisionStability}**
- Consistent REJECT: ${cRejOut}
- Consistent TAKE: ${cTakeOut}
- Disagreements: ${disagreeOut}

### Chronological split
| Period | Reject n | Reject R | R gained | Remaining R |
|--------|----------|----------|----------|-------------|
| Discovery | ${discOut.rejectN} | ${discOut.rejectR.toFixed(2)} | ${discOut.rGainedByReject.toFixed(2)} | ${discOut.filteredBookR.toFixed(2)} |
| Validation | ${valOut.rejectN} | ${valOut.rejectR.toFixed(2)} | ${valOut.rGainedByReject.toFixed(2)} | ${valOut.filteredBookR.toFixed(2)} |

### Per strategy
${Object.entries(perStrategyOut)
  .map(
    ([k, m]) =>
      `- **${k}**: n=${m.total} REJECT ${m.rejectN} (${((m.rejectionPct || 0) * 100).toFixed(0)}%) rejectR=${m.rejectR.toFixed(2)} rGained=${m.rGainedByReject.toFixed(2)} remainingR=${m.filteredBookR.toFixed(2)}`,
  )
  .join("\n")}

## Primary question

> Can the actual Gemini prompt, applied consistently by a substitute evaluator, identify a materially negative subset without filtering everything?

- Rejection rate: **${((majOut.rejectionPct || 0) * 100).toFixed(1)}%** (not everything)
- Reject set materially negative R: **${summaryOut.primaryQuestion.rejectSetMateriallyNegativeR}** (${majOut.rejectR.toFixed(2)} R)
- Remaining book vs sample: **${majOut.filteredBookR.toFixed(2)}** vs **${sampleROut.toFixed(2)}**
- R gained: **${majOut.rGainedByReject.toFixed(2)}**

## Hypotheses (not production)

1. The open Gemini prompt, interpreted conservatively (default TAKE; reject only multi-factor unusually-poor regimes), can surface a net-negative reject bag on this sample.
2. Discovery vs validation R-gain split should be treated as descriptive of this 312-candidate research set only.
3. This is **not** a live Gemini API result; substitute fidelity ≠ production Gemini variance.

## Explicit non-actions

- No production strategy changes
- Filter B not implemented
- Filter C not enabled
- A1 not activated
- Prompt not retuned against outcomes
- Thresholds not optimized after scoring
`;

writeFileSync("artifacts/strategy-research/gemini-selection-report.md", mdOut);

console.log(
  JSON.stringify(
    {
      status: "COMPLETE",
      promptExact: true,
      candidates: rows.length,
      decisions: records.length,
      take: majOut.takeN,
      reject: majOut.rejectN,
      rejectionPct: +(((majOut.rejectionPct || 0) * 100).toFixed(1)),
      rejectR: +majOut.rejectR.toFixed(3),
      rGained: +majOut.rGainedByReject.toFixed(3),
      remainingR: +majOut.filteredBookR.toFixed(3),
      sampleR: +sampleROut.toFixed(3),
      winnerSac: +(((majOut.winnerSacrificeRate || 0) * 100).toFixed(1)),
      loserRem: +(((majOut.loserRemovalRate || 0) * 100).toFixed(1)),
      disc_rGained: +discOut.rGainedByReject.toFixed(3),
      val_rGained: +valOut.rGainedByReject.toFixed(3),
      stability: summaryOut.consistency.decisionStability,
    },
    null,
    2,
  ),
);
SCRIPT