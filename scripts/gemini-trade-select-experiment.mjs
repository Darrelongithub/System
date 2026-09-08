/**
 * Gemini trade-selection experiment (research only).
 * Does NOT modify production strategies or enable filters B/C/A1.
 *
 * Usage:
 *   node --experimental-strip-types --import ./tests/register.mjs \
 *     scripts/gemini-trade-select-experiment.mjs [--runs 3] [--limit N] [--resume]
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { generateGemini, loadGeminiConfig, GeminiError } from "../src/lib/ai/gemini.api.ts";

// Load .env into process.env if missing
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const argNum = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const has = (name) => args.includes(name);
const RUNS = argNum("--runs", 3);
const LIMIT = argNum("--limit", 0); // 0 = all
const OUT_JSONL = new URL("../artifacts/strategy-research/gemini-selection-results.jsonl", import.meta.url);
const OUT_SUMMARY = new URL("../artifacts/strategy-research/gemini-selection-summary.json", import.meta.url);
const OUT_REPORT = new URL("../artifacts/strategy-research/gemini-selection-report.md", import.meta.url);
const DATASET = new URL("../artifacts/strategy-research/gemini-test-dataset.jsonl", import.meta.url);

const SYSTEM = `You are a trade-quality selector for XAUUSD strategy candidates.
You receive ONE candidate at the exact entry moment. Decide TAKE or REJECT.

Rules:
- Use ONLY the provided entry-time fields.
- Do NOT assume future prices, outcomes, or realized R.
- Do NOT invent information not in the payload.
- Be consistent: similar contexts should get similar decisions.
- Reply with JSON only: {"decision":"TAKE"|"REJECT","confidence":0.0-1.0,"reason":"brief justification"}`;

function buildUserPrompt(input) {
  // Strip any accidental scoring fields
  const clean = { ...input };
  delete clean.realizedR;
  delete clean.outcome;
  delete clean.resolutionDatetime;
  return `Candidate trade (entry-time context only):\n${JSON.stringify(clean, null, 2)}\n\nDecide TAKE or REJECT. JSON only.`;
}

function parseDecision(text) {
  let raw = text.trim();
  // Extract JSON object if wrapped
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) raw = m[0];
  const obj = JSON.parse(raw);
  const decision = String(obj.decision || "").toUpperCase();
  if (decision !== "TAKE" && decision !== "REJECT") {
    throw new Error(`invalid decision: ${obj.decision}`);
  }
  return {
    decision,
    confidence: typeof obj.confidence === "number" ? obj.confidence : null,
    reason: typeof obj.reason === "string" ? obj.reason : String(obj.reason ?? ""),
  };
}

async function main() {
  const cfg = loadGeminiConfig();
  if (!cfg.apiKey || cfg.apiKey.includes("your_gemini")) {
    console.error("GEMINI_API_KEY not configured — cannot run live experiment");
    process.exit(1);
  }
  console.log(`[gemini-select] model=${cfg.model} runs=${RUNS} limit=${LIMIT || "all"}`);

  const rows = readFileSync(DATASET, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const candidates = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  console.log(`[gemini-select] candidates=${candidates.length}`);

  // Resume support: load existing decisions for (runId, tradeId)
  const done = new Set();
  if (has("--resume") && existsSync(OUT_JSONL)) {
    for (const line of readFileSync(OUT_JSONL, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        done.add(`${r.runId}|${r.tradeId}`);
      } catch {
        /* skip */
      }
    }
    console.log(`[gemini-select] resume: ${done.size} decisions already recorded`);
  } else if (!has("--resume") && existsSync(OUT_JSONL)) {
    // Fresh run: truncate
    writeFileSync(OUT_JSONL, "");
  }

  const runStamp = new Date().toISOString();
  let calls = 0;
  let errors = 0;

  for (let run = 1; run <= RUNS; run++) {
    const runId = `run${run}`;
    console.log(`[gemini-select] === ${runId} ===`);
    for (const row of candidates) {
      const tradeId = row.input.tradeId;
      const key = `${runId}|${tradeId}`;
      if (done.has(key)) continue;

      const record = {
        runId,
        runIndex: run,
        runBatchTimestamp: runStamp,
        tradeId,
        strategyId: row.input.strategyId,
        datetime: row.input.datetime,
        side: row.input.side,
        model: cfg.model,
        decision: null,
        confidence: null,
        reason: null,
        latencyMs: null,
        attempts: null,
        error: null,
        decidedAt: new Date().toISOString(),
      };

      try {
        const resp = await generateGemini(cfg, {
          systemPrompt: SYSTEM,
          userPrompt: buildUserPrompt(row.input),
          temperature: 0.2,
          maxOutputTokens: 256,
        });
        const parsed = parseDecision(resp.text);
        record.decision = parsed.decision;
        record.confidence = parsed.confidence;
        record.reason = parsed.reason;
        record.latencyMs = resp.latencyMs;
        record.attempts = resp.attempts;
        record.model = resp.model;
        calls++;
      } catch (err) {
        errors++;
        record.error =
          err instanceof GeminiError
            ? `${err.kind}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        console.error(`[gemini-select] FAIL ${key}: ${record.error}`);
      }

      appendFileSync(OUT_JSONL, JSON.stringify(record) + "\n");
      done.add(key);

      if (calls > 0 && calls % 25 === 0) {
        console.log(`[gemini-select] progress calls=${calls} errors=${errors}`);
      }
      // Mild pacing to reduce rate-limit hits
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  console.log(`[gemini-select] done calls=${calls} errors=${errors}`);
  // Scoring happens in a separate pure function below
  await scoreAndReport(candidates);
}

function scoreAndReport(candidates) {
  const scoring = new Map(
    candidates.map((r) => [
      r.input.tradeId,
      {
        outcome: r._scoringOnly?.outcome,
        realizedR: r._scoringOnly?.realizedR ?? 0,
        strategyId: r.input.strategyId,
        datetime: r.input.datetime,
      },
    ]),
  );

  const decisions = readFileSync(OUT_JSONL, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((d) => d.decision === "TAKE" || d.decision === "REJECT");

  const byRun = new Map();
  for (const d of decisions) {
    if (!byRun.has(d.runId)) byRun.set(d.runId, []);
    byRun.get(d.runId).push(d);
  }

  function metrics(decList) {
    let takeN = 0,
      rejectN = 0,
      rejectLosers = 0,
      rejectWinners = 0,
      takeR = 0,
      rejectR = 0,
      takeWins = 0,
      takeLosses = 0;
    for (const d of decList) {
      const sc = scoring.get(d.tradeId);
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
      rRemoved: rejectR,
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

  const perRun = {};
  for (const [runId, list] of byRun) {
    perRun[runId] = metrics(list);
  }

  // Majority vote across runs
  const byTrade = new Map();
  for (const d of decisions) {
    if (!byTrade.has(d.tradeId)) byTrade.set(d.tradeId, []);
    byTrade.get(d.tradeId).push(d);
  }
  const majority = [];
  const consistentReject = [];
  const consistentTake = [];
  const disagree = [];
  for (const [tradeId, list] of byTrade) {
    const takes = list.filter((d) => d.decision === "TAKE").length;
    const rejects = list.filter((d) => d.decision === "REJECT").length;
    let maj = "TAKE";
    if (rejects > takes) maj = "REJECT";
    else if (rejects === takes) maj = "TIE";
    const sc = scoring.get(tradeId);
    const row = {
      tradeId,
      strategyId: sc?.strategyId,
      datetime: sc?.datetime,
      takes,
      rejects,
      majority: maj,
      outcome: sc?.outcome,
      realizedR: sc?.realizedR,
      reasons: list.map((d) => ({ runId: d.runId, decision: d.decision, reason: d.reason, confidence: d.confidence })),
    };
    majority.push(row);
    if (rejects === list.length && list.length >= 2) consistentReject.push(row);
    if (takes === list.length && list.length >= 2) consistentTake.push(row);
    if (takes > 0 && rejects > 0) disagree.push(row);
  }

  const majDecisions = majority
    .filter((m) => m.majority === "TAKE" || m.majority === "REJECT")
    .map((m) => ({ tradeId: m.tradeId, decision: m.majority }));
  const majorityMetrics = metrics(majDecisions);

  // Per strategy majority
  const stratIds = [...new Set(majority.map((m) => m.strategyId).filter(Boolean))];
  const perStrategy = {};
  for (const sid of stratIds) {
    const subset = majority
      .filter((m) => m.strategyId === sid && (m.majority === "TAKE" || m.majority === "REJECT"))
      .map((m) => ({ tradeId: m.tradeId, decision: m.majority }));
    perStrategy[sid] = metrics(subset);
  }

  // Chronological split on majority
  const sortedMaj = [...majority]
    .filter((m) => m.majority === "TAKE" || m.majority === "REJECT")
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  const split = Math.floor(sortedMaj.length * 0.6);
  const discM = metrics(sortedMaj.slice(0, split).map((m) => ({ tradeId: m.tradeId, decision: m.majority })));
  const valM = metrics(sortedMaj.slice(split).map((m) => ({ tradeId: m.tradeId, decision: m.majority })));

  // Baseline sample R (all candidates, no filter)
  let sampleR = 0,
    sampleN = 0,
    sampleW = 0,
    sampleL = 0;
  for (const [, sc] of scoring) {
    sampleN++;
    sampleR += sc.realizedR ?? 0;
    if (sc.outcome === "TP") sampleW++;
    if (sc.outcome === "SL") sampleL++;
  }

  const summary = {
    experiment: "gemini-trade-selection",
    model: loadGeminiConfig().model,
    runs: [...byRun.keys()],
    candidateCount: candidates.length,
    decisionsRecorded: decisions.length,
    sampleBaseline: {
      n: sampleN,
      totalR: sampleR,
      wins: sampleW,
      losses: sampleL,
      wr: sampleW + sampleL ? sampleW / (sampleW + sampleL) : null,
    },
    perRun,
    majorityVote: majorityMetrics,
    perStrategy,
    discovery: discM,
    validation: valM,
    consistency: {
      consistentRejectN: consistentReject.length,
      consistentTakeN: consistentTake.length,
      disagreeN: disagree.length,
      consistentRejectR: consistentReject.reduce((s, t) => s + (t.realizedR ?? 0), 0),
      consistentRejectWins: consistentReject.filter((t) => t.outcome === "TP").length,
      consistentRejectLosses: consistentReject.filter((t) => t.outcome === "SL").length,
      disagreeR: disagree.reduce((s, t) => s + (t.realizedR ?? 0), 0),
    },
    consistentRejectSample: consistentReject.slice(0, 25).map((t) => ({
      tradeId: t.tradeId,
      outcome: t.outcome,
      realizedR: t.realizedR,
      reason: t.reasons[0]?.reason,
    })),
    disagreeSample: disagree.slice(0, 15).map((t) => ({
      tradeId: t.tradeId,
      takes: t.takes,
      rejects: t.rejects,
      outcome: t.outcome,
      realizedR: t.realizedR,
    })),
    primaryQuestion: {
      rejectSetMateriallyNegativeR:
        majorityMetrics.rejectR < 0 && Math.abs(majorityMetrics.rejectR) > 5,
      filteredBookBeatsSample: majorityMetrics.filteredBookR > sampleR,
      winnerSacrificeRate: majorityMetrics.winnerSacrificeRate,
      loserRemovalRate: majorityMetrics.loserRemovalRate,
      rGainedByReject: majorityMetrics.rGainedByReject,
    },
  };

  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2));

  const md = `# Gemini Trade-Selection Experiment Report

**Status:** Research only. Production strategies/filters unchanged.
**Model:** ${summary.model}
**Candidates:** ${candidates.length}
**Runs:** ${summary.runs.join(", ")}
**Decisions recorded:** ${decisions.length}

## Observed Gemini behavior

### Sample baseline (no filter)
- n=${sampleN}, R=${sampleR.toFixed(3)}, W/L=${sampleW}/${sampleL}, WR=${((sampleW / (sampleW + sampleL)) * 100).toFixed(1)}%

### Majority vote across runs
| Metric | Value |
|--------|-------|
| TAKE | ${majorityMetrics.takeN} |
| REJECT | ${majorityMetrics.rejectN} |
| Rejected losers | ${majorityMetrics.rejectLosers} |
| Rejected winners | ${majorityMetrics.rejectWinners} |
| Reject set R | ${majorityMetrics.rejectR.toFixed(3)} |
| **R gained by reject** | **${majorityMetrics.rGainedByReject.toFixed(3)}** |
| Filtered book R (TAKEs) | ${majorityMetrics.filteredBookR.toFixed(3)} |
| Sample baseline R | ${sampleR.toFixed(3)} |
| TAKE win rate | ${majorityMetrics.winRateTake != null ? (majorityMetrics.winRateTake * 100).toFixed(1) + "%" : "n/a"} |
| TAKE expectancy | ${majorityMetrics.expectancyTake?.toFixed(3)} |
| Rejection % | ${((majorityMetrics.rejectionPct ?? 0) * 100).toFixed(1)}% |
| Winner-sacrifice rate | ${((majorityMetrics.winnerSacrificeRate ?? 0) * 100).toFixed(1)}% |
| Loser-removal rate | ${((majorityMetrics.loserRemovalRate ?? 0) * 100).toFixed(1)}% |

### Per run
${Object.entries(perRun)
  .map(
    ([k, m]) =>
      `- **${k}**: TAKE ${m.takeN} REJECT ${m.rejectN} rejectR=${m.rejectR.toFixed(2)} rGained=${m.rGainedByReject.toFixed(2)} filteredR=${m.filteredBookR.toFixed(2)}`,
  )
  .join("\n")}

### Consistency
- Consistent REJECT (all runs): **${consistentReject.length}** trades, bag R=${summary.consistency.consistentRejectR.toFixed(2)}, W/L=${summary.consistency.consistentRejectWins}/${summary.consistency.consistentRejectLosses}
- Consistent TAKE (all runs): **${consistentTake.length}**
- Disagreement across runs: **${disagree.length}**

### Chronological split (majority)
- Discovery: reject ${discM.rejectN}, rejectR=${discM.rejectR.toFixed(2)}, filteredR=${discM.filteredBookR.toFixed(2)}, rGained=${discM.rGainedByReject.toFixed(2)}
- Validation: reject ${valM.rejectN}, rejectR=${valM.rejectR.toFixed(2)}, filteredR=${valM.filteredBookR.toFixed(2)}, rGained=${valM.rGainedByReject.toFixed(2)}

### Per strategy (majority)
${Object.entries(perStrategy)
  .map(
    ([k, m]) =>
      `- **${k}**: n=${m.total} REJECT ${m.rejectN} rejectR=${m.rejectR.toFixed(2)} rGained=${m.rGainedByReject.toFixed(2)} filteredR=${m.filteredBookR.toFixed(2)}`,
  )
  .join("\n")}

## Primary question

> Does Gemini reject a set whose realized R is materially negative while preserving profitable trades?

- Reject set materially negative R: **${summary.primaryQuestion.rejectSetMateriallyNegativeR}** (rejectR=${majorityMetrics.rejectR.toFixed(2)})
- Filtered book beats sample R: **${summary.primaryQuestion.filteredBookBeatsSample}**
- R gained by rejects: **${majorityMetrics.rGainedByReject.toFixed(2)}**
- Winner sacrifice rate: **${((majorityMetrics.winnerSacrificeRate ?? 0) * 100).toFixed(1)}%**

## Hypotheses suggested by behavior (NOT production changes)

1. If consistent rejects are regime-heavy (vol/trend conflict language in reasons), that aligns with prior C/B research — still not a reason to auto-enable filters.
2. High disagreement rate would indicate unstable selection (LLM noise) rather than a reliable filter.
3. WR-up / R-down on the filtered book would be a failed selector even if "accuracy" looks good.

## Explicit non-actions

- No production strategy modifications
- Filter B not implemented
- Filter C not enabled
- A1 not activated
- Prompt not tuned against outcomes
`;

  writeFileSync(OUT_REPORT, md);
  console.log(`[gemini-select] summary → ${OUT_SUMMARY.pathname}`);
  console.log(`[gemini-select] report  → ${OUT_REPORT.pathname}`);
  console.log(
    `[gemini-select] majority rejectR=${majorityMetrics.rejectR.toFixed(2)} rGained=${majorityMetrics.rGainedByReject.toFixed(2)} filteredR=${majorityMetrics.filteredBookR.toFixed(2)} sampleR=${sampleR.toFixed(2)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
