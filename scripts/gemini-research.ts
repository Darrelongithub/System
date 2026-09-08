/**
 * Phase-1/Phase-2 Gemini research harness.
 *
 *   node --experimental-strip-types --import ./tests/register.mjs \
 *     scripts/gemini-research.ts --stage research [--live] [--limit N] [--out DIR]
 *
 * Sources the SAME deterministic candidates the certified backtester produces
 * (analyseContinuous over the locked baseline CSV), asks Gemini for a decision
 * per candidate — leak-free prompts, full audit JSONL — then evaluates the
 * selections against the golden truth. The golden files are read-only inputs
 * here; research outputs go to output/ (git-ignored) and never alter the
 * deterministic artifacts.
 *
 * Modes:
 *   default      stubbed deterministic pseudo-model (offline pipeline validation;
 *                clearly labeled "deterministic-stub", stable across runs)
 *   --live       real Gemini API (requires GEMINI_API_KEY; fails closed without)
 */
import { writeFileSync, mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyseContinuous } from "@/lib/pipeline/continuous";
import {
  buildDecisionPrompt,
  compressPatterns,
  evaluateRecords,
  OPTIMIZED_CALLBACK_BUDGET,
  promptHash,
  RESEARCH_CALLBACK_BUDGET,
  runResearch,
  type ResearchRecord,
  sanitizeCandidate,
  visibleContext,
} from "@/lib/ai/research";
import { loadGeminiConfig } from "@/lib/ai/gemini.api";
import { evaluateDeep, resumeState } from "@/lib/ai/evaluate";
import { loadBaselineCsv, loadGoldenTrades } from "../tests/fixtures.mjs";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : fallback;
};

const live = has("--live");
const stage = valueOf("--stage", "research") as "research" | "optimized";
const limit = Number(valueOf("--limit", "0"));
const resumeFile = valueOf("--resume", "");
const outDir = fileURLToPath(new URL("../output", import.meta.url));

/** Offline deterministic pseudo-model: hash-seeded, clearly labeled, for plumbing validation only. */
function stubDecide(candidate: ReturnType<typeof sanitizeCandidate>, prompt: string): string {
  const h = promptHash(prompt);
  const v = parseInt(h.slice(0, 2), 16);
  const verdict = v % 3 === 0 ? "SELECT" : v % 3 === 1 ? "REJECT" : "UNSURE";
  return JSON.stringify({
    verdict,
    confidence: ["L", "M", "H"][v % 3],
    rationale: `stub verdict by hash bucket ${v % 3} for ${candidate.key}`,
    factors: ["stub-factor"],
    patternTags: v % 2 === 0 ? ["stub_even"] : ["stub_odd"],
  });
}

const main = async () => {
  if (stage !== "research" && stage !== "optimized") {
    console.error(`unknown --stage ${stage} (expected research|optimized)`);
    process.exit(1);
  }
  const budget = stage === "research" ? RESEARCH_CALLBACK_BUDGET : OPTIMIZED_CALLBACK_BUDGET;

  const csv = loadBaselineCsv();
  const truth = loadGoldenTrades().map((t) => ({
    strategyId: t.strategyId,
    datetime: t.datetime,
    side: t.side ?? "-",
    outcome: t.outcome ?? "OPEN",
    rMultiple: t.rMultiple ?? null,
  }));

  const continuous = analyseContinuous(csv, { seriesEndsComplete: true });
  if (!continuous.ok) {
    console.error(`analysis failed: ${continuous.error}`);
    process.exit(1);
  }
  const trades = continuous.tradeTriggers.filter((t) => t.kind !== "context");
  console.log(`candidates from deterministic pass: ${trades.length} (budget ${budget})`);

  // --resume: reload a previous audit file; terminal records are skipped,
  // api-error callbacks are retried, and prior callbacks consume budget.
  let prior: ResearchRecord[] = [];
  if (resumeFile) {
    prior = readFileSync(resumeFile, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ResearchRecord);
    console.log(`resuming from ${resumeFile}: ${prior.length} prior callback(s)`);
  }
  const { skipKeys, usedBudget } = resumeState(prior);
  const remainingBudget = Math.max(0, budget - usedBudget);
  const pending = trades.filter(
    (t) => !skipKeys.has(`${t.strategyId}|${t.datetime}|${t.side ?? "-"}`),
  );
  console.log(
    `prior budget used ${usedBudget}; remaining budget ${remainingBudget}; pending candidates ${pending.length}`,
  );
  if (resumeFile && remainingBudget === 0) {
    console.log("budget already exhausted by prior run — nothing to call.");
  }
  const effectiveLimit = limit > 0 ? Math.min(limit, remainingBudget) : remainingBudget;

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const streamPrefix = `gemini-${stage}-${stamp}`;
  const streamPath = resumeFile || `${outDir}/${streamPrefix}.jsonl`;
  const streamFd = openSync(streamPath, resumeFile ? "a" : "w");

  const newRecords = await runResearch({
    candidates: pending.slice(0, effectiveLimit > 0 ? effectiveLimit : pending.length),
    contextEvents: continuous.contextEvents,
    stage,
    maxCallbacks:
      budget - usedBudget > 0
        ? limit > 0
          ? Math.min(limit, budget - usedBudget)
          : budget - usedBudget
        : 0,
    model: live ? loadGeminiConfig().model : "deterministic-stub",
    config: loadGeminiConfig(),
    stubDecide: live ? undefined : stubDecide,
    paceMs: live ? 250 : 0,
    onRecord: (record) => {
      writeSync(streamFd, JSON.stringify(record) + "\n");
      if ((record.index + 1) % 50 === 0) {
        console.log(`  … ${record.index + 1} callbacks recorded (last: ${record.status})`);
      }
    },
  });
  closeSync(streamFd);
  const records =
    stage === "research" || stage === "optimized" ? [...prior, ...newRecords] : newRecords;

  const decided = records.filter((r) => r.status === "decided");
  const failures = records.filter((r) => r.status !== "decided");
  console.log(
    `callbacks used: ${records.length}/${budget}; decided ${decided.length}; failures ${failures.length}`,
  );
  if (live && failures.length > 0) {
    console.log("fail-closed sample:", failures[0]?.status, failures[0]?.error?.slice(0, 160));
  }

  const deep = evaluateDeep(records, truth);
  const metrics = deep.filtered.overall;
  const baselineMetrics = evaluateRecords(
    // Baseline = every truth trade "selected" — the raw deterministic performance.
    truth.map((t) => ({
      index: 0,
      key: `${t.strategyId}|${t.datetime}|${t.side}`,
      decisionDatetime: t.datetime,
      stage: "research" as const,
      promptHash: "",
      prompt: "",
      contextCount: 0,
      status: "decided" as const,
      decision: {
        verdict: "SELECT" as const,
        confidence: "M" as const,
        rationale: "-",
        factors: [],
        patternTags: [],
      },
    })),
    truth,
  );

  // Final audit file is rewritten atomically from memory, but the stream file
  // written inline above is the crash-safe trail for long live runs.
  mkdirSync(outDir, { recursive: true });
  const prefix = streamPrefix;
  const summary = {
    stage,
    mode: live ? "live" : "deterministic-stub",
    model: live ? loadGeminiConfig().model : "deterministic-stub",
    budget,
    callbacksUsed: records.length,
    decided: decided.length,
    failures: failures.length,
    failureBreakdown: Object.fromEntries(
      ["api-error", "invalid-output", "leak-violation"].map((s) => [
        s,
        records.filter((r) => r.status === s).length,
      ]),
    ),
    rawDeterministic: baselineMetrics,
    geminiFiltered: metrics,
    slices: {
      filtered: deep.filtered.buckets,
      baseline: deep.baseline.buckets,
    },
    coverage: deep.decidedCoverage,
    topPatterns: compressPatterns(records, truth).slice(0, 20),
  };
  writeFileSync(`${outDir}/${prefix}.summary.json`, JSON.stringify(summary, null, 2));

  const row = (label: string, m: typeof baselineMetrics) => {
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(
      `${label.padEnd(22)} sel=${String(m.selected).padStart(4)}  TP/SL/OPEN/NOFILL=${m.tp}/${m.sl}/${m.open}/${m.noFill}` +
        `  winRate=${pct(m.winRate)}  avgR=${m.avgR.toFixed(3)}  PF=${m.profitFactor === null ? "∞" : m.profitFactor.toFixed(3)}` +
        `  totalR=${m.totalR.toFixed(2)}  maxDD=${m.maxDrawdownR.toFixed(2)}`,
    );
  };
  console.log("\n=== evaluation (truth joined AFTER decisions) ===");
  row("raw deterministic", baselineMetrics);
  row(`${live ? "gemini" : "stub"} filtered`, metrics);
  console.log(
    `selection rate: ${(metrics.selectionRate * 100).toFixed(1)}% of ${metrics.decided} decided`,
  );
  console.log(`audit trail: output/${prefix}.jsonl`);
  console.log(`summary:      output/${prefix}.summary.json`);
};

void main();
