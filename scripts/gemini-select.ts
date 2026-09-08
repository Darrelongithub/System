#!/usr/bin/env node
/**
 * Gemini trade-SELECTION research harness (window-based single-selection).
 *
 *   node --experimental-strip-types --import ./tests/register.mjs scripts/gemini-select.ts [flags]
 *
 * Flags:
 *   --times "06:00,12:00,18:00"   decision clock times EAT (default: blueprint example)
 *   --every 3                     decision every N hours (1..24)
 *   --sessions                    decision at session opens (01:00/11:00/16:00 EAT)
 *   --at "2026-01-15 12:00:00,…"  explicit decision timestamps (EAT)
 *   --from/--to "YYYY-MM-DD HH:mm[:ss]"   decision-timestamp range filter (EAT)
 *   --budget 1000                 maximum Gemini calls (default 1000)
 *   --limit N                     stop after N model calls (testing)
 *   --news-file path.json         offline calendar (normalized {events:[…]} or array)
 *   --horizon 48                  upcoming-news look-ahead horizon (hours; schedule-only)
 *   --lookback 24                 recent-news lookback (hours)
 *   --tail 60                     recent candles embedded in the prompt
 *   --live                        real Gemini calls (requires GEMINI_API_KEY; fail-closed)
 *   --resume output/…jsonl        continue an interrupted run
 *
 * Records stream to output/gemini-select-<ts>.jsonl (crash-safe per record);
 * a summary JSON + console comparison table is written at the end. The engine
 * and its golden outputs are read-only inputs.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv } from "@/lib/analyzer/parse";
import { loadGeminiConfig } from "@/lib/ai/gemini.api";
import { decisionTimestamps, windowLabel, type WindowConfig } from "@/lib/ai/select/windows";
import { EvidenceContext, type CandleLike } from "@/lib/ai/select/evidence";
import { finnhubProvider, normalizeEventFile, type CalendarEvent } from "@/lib/ai/select/news";
import { makeLiveCaller, selectAtDecision, type SelectionRecord } from "@/lib/ai/select/selector";
import { evaluateSelections, type TruthTradeFull } from "@/lib/ai/select/evaluate";
// @ts-expect-error plain JS fixture loader
import { loadBaselineCsv, loadGoldenTrades } from "../tests/fixtures.mjs";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : fallback;
};

const live = has("--live");
const budget = Number(valueOf("--budget", "1000"));
const limit = Number(valueOf("--limit", "0"));
const resumeFile = valueOf("--resume", "");
const newsFile = valueOf("--news-file", "");
const newsLive = has("--news-live");
const tail = Number(valueOf("--tail", "60"));
const horizon = Number(valueOf("--horizon", "48"));
const lookback = Number(valueOf("--lookback", "24"));
const outDir = fileURLToPath(new URL("../output", import.meta.url));

const windowConfig: WindowConfig = has("--sessions")
  ? { kind: "sessions" }
  : has("--every")
    ? { kind: "every", hours: Number(valueOf("--every", "3")) }
    : has("--at")
      ? { kind: "explicit", timestamps: valueOf("--at", "").split(",").filter(Boolean) }
      : { kind: "times", times: valueOf("--times", "06:00,12:00,18:00").split(",") };

const normDt = (s: string) => {
  const t = s.replace("T", " ");
  return t.length === 16 ? `${t}:00` : t;
};

const main = async () => {
  if (!Number.isFinite(budget) || budget < 1) {
    console.error("--budget must be a positive integer");
    process.exit(1);
  }
  const csv = loadBaselineCsv();
  const parsed = parseCsv(csv);
  const candles: CandleLike[] = parsed.candles
    .filter(
      (c) =>
        c.open !== undefined &&
        c.high !== undefined &&
        c.low !== undefined &&
        c.close !== undefined,
    )
    .map((c) => ({
      datetime: c.datetime,
      open: c.open!,
      high: c.high!,
      low: c.low!,
      close: c.close!,
    }));
  if (candles.length === 0) {
    console.error("baseline CSV parsed to zero usable candles");
    process.exit(1);
  }
  const truth = loadGoldenTrades() as TruthTradeFull[];
  const ctx = new EvidenceContext(candles);
  const datetimes = candles.map((c) => c.datetime);

  let stamps = decisionTimestamps(datetimes, windowConfig);
  const from = valueOf("--from", "");
  const to = valueOf("--to", "");
  if (from) stamps = stamps.filter((t) => t >= normDt(from));
  if (to) stamps = stamps.filter((t) => t <= normDt(to));
  console.log(
    `[selector] ${windowLabel(windowConfig)} -> ${stamps.length} decision timestamps` +
      (from || to ? ` (range ${from || "-inf"} .. ${to || "+inf"})` : "") +
      `\n[selector] ${truth.length} truth trades; ${candles.length} candles; budget ${budget}; live=${live}`,
  );

  let newsEvents: CalendarEvent[] | undefined;
  if (newsFile && newsLive) {
    console.error("--news-file and --news-live are mutually exclusive");
    process.exit(1);
  }
  if (newsFile) {
    newsEvents = normalizeEventFile(JSON.parse(readFileSync(newsFile, "utf8")));
    console.log(`[selector] news: ${newsEvents.length} events from ${newsFile}`);
  } else if (newsLive) {
    const key = process.env["FINNHUB_API_KEY"] ?? "";
    if (!key) {
      console.error("--news-live requires FINNHUB_API_KEY (fail closed)");
      process.exit(2);
    }
    const provider = finnhubProvider({ apiKey: key });
    const fromUtc = `${stamps[0]?.slice(0, 10) ?? "2026-01-01"}T00:00:00Z`;
    const toMs =
      Date.parse(`${(stamps[stamps.length - 1] ?? stamps[0] ?? "").replace(" ", "T")}+03:00`) +
      horizon * 3600000;
    const toUtc = Number.isFinite(toMs) ? new Date(toMs).toISOString() : fromUtc;
    newsEvents = await provider.fetchCalendar({ fromUtc, toUtc });
    console.log(
      `[selector] news: ${newsEvents.length} events via live Finnhub (${fromUtc.slice(0, 10)} .. ${toUtc.slice(0, 10)})`,
    );
  } else {
    console.log("[selector] news: not configured (pass --news-file or --news-live)");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const settledPath =
    resumeFile || fileURLToPath(new URL(`../output/gemini-select-${stamp}.jsonl`, import.meta.url));
  mkdirSync(outDir, { recursive: true });

  const priorRecords: SelectionRecord[] = [];
  const doneStamps = new Set<string>();
  let priorCalls = 0;
  if (resumeFile) {
    for (const line of readFileSync(resumeFile, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const rec = JSON.parse(t) as SelectionRecord;
      priorRecords.push(rec);
      if (
        rec.status === "decided" ||
        rec.status === "invalid-output" ||
        rec.status === "api-error"
      ) {
        priorCalls++;
        if (rec.status !== "api-error" && rec.status !== "invalid-output")
          doneStamps.add(rec.decisionTimestamp);
      }
      if (rec.status === "invalid-set" || rec.status === "leak-violation")
        doneStamps.add(rec.decisionTimestamp);
    }
    const failedPrior = priorRecords.filter(
      (r) => r.status === "api-error" || r.status === "invalid-output",
    ).length;
    if (priorRecords.some((r) => r.status === "leak-violation")) {
      console.error("[selector] prior run contains leak violations — resolve before resuming");
      process.exit(2);
    }
    console.log(
      `[selector] resuming ${resumeFile}: ${priorRecords.length} prior records, ${priorCalls} calls consumed, ${failedPrior} failed stamp(s) retried`,
    );
  }
  const remainingBudget = budget - priorCalls;
  if (remainingBudget <= 0) {
    console.log(
      `[selector] budget exhausted by prior run (${priorCalls}/${budget}); nothing to do`,
    );
    return;
  }

  const geminiConfig = live ? loadGeminiConfig() : undefined;
  const modelName = live ? geminiConfig!.model : "stub";
  const callModel = live ? makeLiveCaller({ config: geminiConfig! }) : undefined;

  const fd = openSync(settledPath, "a");
  if (!resumeFile && statSync(settledPath).size !== 0) {
    console.error("refusing to clobber a non-empty fresh output file");
    closeSync(fd);
    process.exit(1);
  }

  const records: SelectionRecord[] = [
    ...priorRecords.filter((r) => doneStamps.has(r.decisionTimestamp)),
  ];
  let callsUsed = priorCalls;
  for (const T of stamps) {
    if (doneStamps.has(T)) continue;
    if (callsUsed >= budget) {
      console.log(`[selector] budget reached (${callsUsed}/${budget}) at ${T}`);
      break;
    }
    if (limit > 0 && callsUsed - priorCalls >= limit) break;
    const rec = await selectAtDecision({
      T,
      windowLabel: windowLabel(windowConfig),
      ctx,
      truth,
      newsEvents,
      newsOptions: { horizonHours: horizon, lookbackHours: lookback },
      tail,
      datetimes,
      model: modelName,
      callModel,
    });
    if (rec.status === "decided" || rec.status === "invalid-output" || rec.status === "api-error") {
      callsUsed++;
    }
    records.push(rec);
    try {
      writeSync(fd, JSON.stringify(rec) + "\n");
    } catch (error) {
      closeSync(fd);
      throw error;
    }
    if (
      rec.status === "api-error" ||
      rec.status === "invalid-output" ||
      rec.status === "leak-violation"
    ) {
      console.log(
        `  [${T}] ${rec.status}: ${rec.statusNote ?? rec.validationErrors?.join("; ") ?? ""}`,
      );
    }
    if (records.length % 50 === 0) {
      console.log(`  … ${records.length} records, ${callsUsed}/${budget} calls @ ${T}`);
    }
  }
  closeSync(fd);

  const evaluation = evaluateSelections(records, truth);
  const summaryPath = settledPath.replace(/\.jsonl$/, ".summary.json");
  const summary = {
    generatedAt: new Date().toISOString(),
    live,
    window: windowLabel(windowConfig),
    decisionTimestampsTotal: stamps.length,
    budget,
    callsUsed,
    newsConfigured: newsEvents !== undefined,
    tail,
    horizonHours: horizon,
    evaluation,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const fmt = (label: string, m: typeof evaluation.selected) =>
    `${label.padEnd(22)} n=${String(m.n).padStart(4)} TP/SL=${m.tp}/${m.sl} WR=${(m.winRate * 100).toFixed(1)}% avgR=${m.avgR.toFixed(3)} PF=${m.profitFactor.toFixed(2)} R=${m.totalR.toFixed(2)} DD=${m.maxDrawdownR.toFixed(1)}`;
  console.log("\n=== selection evaluation ===");
  console.log(
    `coverage: ${JSON.stringify(evaluation.coverage)} · selection rate ${(evaluation.selectionRate * 100).toFixed(1)}% of presented decisions`,
  );
  console.log(fmt("deterministic baseline", evaluation.deterministicBaseline));
  console.log(fmt("gemini selected", evaluation.selected));
  console.log(fmt("field-average (random)", evaluation.fieldAverage));
  console.log(fmt("oracle (ex-post best)", evaluation.oracle));
  console.log(fmt("unique selected trades", evaluation.uniqueSelected));
  console.log(fmt("rejected candidates", evaluation.rejected));
  if (evaluation.perStrategy.length > 0) {
    console.log("\nper-strategy (unique selections):");
    for (const s of evaluation.perStrategy) {
      console.log(
        `  ${s.strategyId.padEnd(18)} n=${s.selectedN} totalR=${s.selectedTotalR.toFixed(2)}`,
      );
    }
  }
  console.log(`\nrecords: ${records.length} -> ${settledPath}\nsummary -> ${summaryPath}`);
  if (evaluation.coverage.leakViolations > 0) {
    console.error(
      `\nFAIL-CLOSED: ${evaluation.coverage.leakViolations} leak violation(s) — the model was never called for them. Investigate before any live run.`,
    );
    process.exit(2);
  }
  if (live && evaluation.coverage.decided === 0) {
    console.error("\nFAIL-CLOSED: live run produced zero valid decisions.");
    process.exit(2);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
