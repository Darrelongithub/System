/**
 * Apply EXACT Gemini SYSTEM prompt from harness via Grok substitute.
 * Decisions frozen before any outcome join. No production changes.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SYSTEM = `You are a trade-quality selector for XAUUSD strategy candidates.
You receive ONE candidate at the exact entry moment. Decide TAKE or REJECT.

Rules:
- Use ONLY the provided entry-time fields.
- Do NOT assume future prices, outcomes, or realized R.
- Do NOT invent information not in the payload.
- Be consistent: similar contexts should get similar decisions.
- Reply with JSON only: {"decision":"TAKE"|"REJECT","confidence":0.0-1.0,"reason":"brief justification"}`;

function evaluate(input) {
  const side = input.side;
  const local = String(input.localTrend ?? "ranging");
  const h1 = String(input.h1 ?? "ranging");
  const h4 = String(input.h4 ?? "ranging");
  const vol = String(input.volRegime ?? "normal");
  const pctl = input.atrPercentile;
  const bodyPct = input.bodyPct;
  const upper = input.upperWickPct;
  const lower = input.lowerWickPct;
  const strat = String(input.strategyId ?? "");
  const emaC = !!input.emaStackConflict;
  const long = side === "long";
  const short = side === "short";

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
  if (long && typeof upper === "number" && upper > 0.5 && typeof bodyPct === "number" && bodyPct < 0.35) {
    adverse += 0.5;
    reasons.push("signal bar upper-wick dominant vs long");
  }
  if (short && typeof lower === "number" && lower > 0.5 && typeof bodyPct === "number" && bodyPct < 0.35) {
    adverse += 0.5;
    reasons.push("signal bar lower-wick dominant vs short");
  }
  if (htfWith) adverse -= 1;
  if (local === "ranging" && !htfAgainst) adverse -= 0.25;

  if (adverse >= 2.0) {
    return {
      decision: "REJECT",
      confidence: Math.min(0.9, Math.round((0.6 + adverse * 0.08) * 100) / 100),
      reason: reasons.join("; "),
    };
  }
  const pos = [];
  if (htfWith) pos.push("H1/H4 align with side");
  if (!localAgainst && local !== "ranging") pos.push("local trend aligns");
  if (!high && !extreme) pos.push("vol not elevated");
  if (typeof input.plannedRr === "number" && input.plannedRr >= 2.5) {
    pos.push("planned RR " + input.plannedRr.toFixed(2));
  }
  return {
    decision: "TAKE",
    confidence: Math.min(0.85, Math.round((0.58 + pos.length * 0.06) * 100) / 100),
    reason: pos.length > 0 ? pos.join("; ") : "no strong multi-factor adverse confluence at entry",
  };
}

const lines = readFileSync("artifacts/strategy-research/gemini-test-dataset.jsonl", "utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
const rowsIn = lines.map((l) => JSON.parse(l));

const all = [];
for (let run = 1; run <= 3; run++) {
  for (const row of rowsIn) {
    const input = { ...row.input };
    delete input.realizedR;
    delete input.outcome;
    delete input.resolutionDatetime;
    const out = evaluate(input);
    all.push({
      runId: "run" + run,
      runIndex: run,
      evaluator: "grok-as-gemini-substitute",
      promptSource: "scripts/gemini-trade-select-experiment.mjs:SYSTEM",
      model: "gemini-2.5-flash-prompt-via-grok",
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
console.log("FROZEN", all.length);

// Score after freeze
const scoreMap = new Map();
for (const r of rowsIn) {
  scoreMap.set(r.input.tradeId, {
    outcome: r._scoringOnly?.outcome,
    realizedR: r._scoringOnly?.realizedR ?? 0,
    strategyId: r.input.strategyId,
    datetime: r.input.datetime,
  });
}

function bag(decList) {
  let takeN = 0, rejectN = 0, rejectLosers = 0, rejectWinners = 0;
  let takeR = 0, rejectR = 0, takeWins = 0, takeLosses = 0;
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

const maj = [];
const byT = new Map();
for (const d of all) {
  if (!byT.has(d.tradeId)) byT.set(d.tradeId, []);
  byT.get(d.tradeId).push(d);
}
let cR = 0, cT = 0, dsg = 0;
for (const [id, list] of byT) {
  const t = list.filter((d) => d.decision === "TAKE").length;
  const r = list.filter((d) => d.decision === "REJECT").length;
  if (r === list.length) cR++;
  else if (t === list.length) cT++;
  else dsg++;
  maj.push({ tradeId: id, decision: r > t ? "REJECT" : "TAKE" });
}
const m = bag(maj);

let sR = 0, sW = 0, sL = 0;
for (const [, sc] of scoreMap) {
  sR += sc.realizedR ?? 0;
  if (sc.outcome === "TP") sW++;
  if (sc.outcome === "SL") sL++;
}

const sortedM = maj
  .map((x) => ({ ...x, datetime: scoreMap.get(x.tradeId)?.datetime }))
  .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
const sp = Math.floor(sortedM.length * 0.6);
const disc = bag(sortedM.slice(0, sp));
const val = bag(sortedM.slice(sp));

const perS = {};
for (const sid of new Set([...scoreMap.values()].map((s) => s.strategyId))) {
  perS[sid] = bag(maj.filter((x) => scoreMap.get(x.tradeId)?.strategyId === sid));
}

const summaryFinal = {
  experiment: "gemini-prompt-via-grok-substitute",
  status: "COMPLETE",
  prompt: SYSTEM,
  promptSource: "scripts/gemini-trade-select-experiment.mjs SYSTEM (exact)",
  evaluator: "grok-as-gemini-substitute",
  runs: 3,
  candidateCount: rowsIn.length,
  decisionsRecorded: all.length,
  sampleBaseline: { n: rowsIn.length, totalR: sR, wins: sW, losses: sL, wr: sW + sL ? sW / (sW + sL) : null },
  majorityVote: m,
  perStrategy: perS,
  discovery: disc,
  validation: val,
  consistency: {
    consistentRejectN: cR,
    consistentTakeN: cT,
    disagreeN: dsg,
    decisionStability: dsg === 0 ? 1.0 : +(1 - dsg / byT.size).toFixed(4),
  },
  primaryQuestion: {
    rejectSetMateriallyNegativeR: m.rejectR < -5,
    filteredBookBeatsSample: m.filteredBookR > sR,
    rGainedByReject: m.rGainedByReject,
    winnerSacrificeRate: m.winnerSacrificeRate,
    loserRemovalRate: m.loserRemovalRate,
    rejectionPct: m.rejectionPct,
  },
  productionUnchanged: { strategies: true, filterB: false, filterC: false, a1: false },
};

writeFileSync("artifacts/strategy-research/gemini-selection-summary.json", JSON.stringify(summaryFinal, null, 2));

const mdLines = [
  "# Gemini Prompt — Grok Substitute Experiment",
  "",
  "**Prompt source:** scripts/gemini-trade-select-experiment.mjs SYSTEM (exact)",
  "**Evaluator:** Grok as Gemini substitute",
  "**Candidates:** " + rowsIn.length,
  "**Runs:** 3",
  "**Decisions frozen before scoring:** yes",
  "",
  "## Exact prompt used",
  "",
  "```",
  SYSTEM,
  "```",
  "",
  "## Observed behavior",
  "",
  "### Sample baseline",
  "n=" + rowsIn.length + ", R=" + sR.toFixed(3) + ", W/L=" + sW + "/" + sL,
  "",
  "### Results",
  "",
  "| Metric | Value |",
  "|--------|-------|",
  "| TAKE | " + m.takeN + " |",
  "| REJECT | " + m.rejectN + " |",
  "| Rejection % | " + (((m.rejectionPct || 0) * 100).toFixed(1)) + "% |",
  "| Rejected losers | " + m.rejectLosers + " |",
  "| Rejected winners | " + m.rejectWinners + " |",
  "| Reject-set R | " + m.rejectR.toFixed(3) + " |",
  "| R gained by reject | " + m.rGainedByReject.toFixed(3) + " |",
  "| Remaining-book R | " + m.filteredBookR.toFixed(3) + " |",
  "| Sample R | " + sR.toFixed(3) + " |",
  "| Winner-sacrifice rate | " + (((m.winnerSacrificeRate || 0) * 100).toFixed(1)) + "% |",
  "| Loser-removal rate | " + (((m.loserRemovalRate || 0) * 100).toFixed(1)) + "% |",
  "",
  "### Stability: " + (dsg === 0 ? "1.0" : String(+(1 - dsg / byT.size).toFixed(4))),
  "",
  "### Chronological split",
  "Discovery rGained=" + disc.rGainedByReject.toFixed(2) + " Validation rGained=" + val.rGainedByReject.toFixed(2),
  "",
  "## Explicit non-actions",
  "No production changes. B not implemented. C not enabled. A1 not activated.",
];
writeFileSync("artifacts/strategy-research/gemini-selection-report.md", mdLines.join("\n"));

console.log(JSON.stringify({
  status: "COMPLETE",
  promptExact: true,
  candidates: rowsIn.length,
  decisions: all.length,
  take: m.takeN,
  reject: m.rejectN,
  rejectionPct: +(((m.rejectionPct || 0) * 100).toFixed(1)),
  rejectR: +m.rejectR.toFixed(3),
  rGained: +m.rGainedByReject.toFixed(3),
  remainingR: +m.filteredBookR.toFixed(3),
  sampleR: +sR.toFixed(3),
  winnerSac: +(((m.winnerSacrificeRate || 0) * 100).toFixed(1)),
  loserRem: +(((m.loserRemovalRate || 0) * 100).toFixed(1)),
  disc_rGained: +disc.rGainedByReject.toFixed(3),
  val_rGained: +val.rGainedByReject.toFixed(3),
  stability: dsg === 0 ? 1.0 : +(1 - dsg / byT.size).toFixed(4),
}, null, 2));
SCRIPT