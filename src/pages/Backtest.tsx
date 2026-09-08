import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { ArrowLeft, Bot, Download, History, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STRATEGIES } from "@/lib/analyzer/strategies";
import { getDiagnosticsReportLines, resetDiagnostics } from "@/lib/analyzer/strategies/diagnostics";
import { AVAILABLE_SYMBOLS } from "@/lib/market-data";
import { buildOhlcCsv } from "@/lib/ohlc-generator";
import { verifySetup } from "@/lib/verifier.functions";
import { appendAiSections, runDebate, type AiStage } from "@/lib/backtest/ai";
import {
  applyTriggers,
  buildDayReport,
  buildStrategyBreakdown,
  dayFileName,
  batchBacktestReports,
  emptyState,
  addUtcDays,
  rangeDays,
  isWeekend,
  winRate,
  averageRr,
  realizedR,
  type BacktestState,
  type DayTrigger,
} from "@/lib/backtest/engine";
import { analyseContinuous, contextLogForDay } from "@/lib/pipeline/continuous";
import { STANDARD_LOOKBACK_CALENDAR_DAYS } from "@/lib/pipeline/policy";

const AI_STAGE_LABELS: Record<AiStage, string> = {
  verifier: "Verifier / picker (default)",
  debate: "Gemini ↔ GPT debate",
  both: "Verifier + debate",
  off: "Local engine only",
};

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (inIframe()) window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map["year"]}-${map["month"]}-${map["day"]}`;
}

export default function Backtest() {
  const [symbol, setSymbol] = useState("XAU/USD");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  // Forward candles fetched AFTER each analysed day, used only to resolve each
  // trigger to TP/SL. Without this every signal stayed "OPEN" forever, because
  // the window ended on the same candle the signal was generated on.
  const [forwardDays, setForwardDays] = useState(5);

  const [isRunning, setIsRunning] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);
  const [currentDay, setCurrentDay] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<BacktestState>(() => emptyState("XAU/USD"));
  const [zip, setZip] = useState<{ name: string; url: string } | null>(null);
  const [aiStage, setAiStage] = useState<AiStage>("verifier");

  const runVerifier = useServerFn(verifySetup);
  const stopRef = useRef(false);
  /** Synchronous lock — React state alone cannot block a same-tick double-click race. */
  const runLockRef = useRef(false);
  /** Monotonic generation so a superseded async path never writes after a newer run. */
  const runGenerationRef = useRef(0);
  const zipUrlRef = useRef<string | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-400), `${new Date().toLocaleTimeString()}  ${msg}`]);
  };

  const days = useMemo(() => rangeDays(fromDate, toDate), [fromDate, toDate]);

  const statsRows = useMemo(
    () => Object.values(state.stats).sort((a, b) => a.strategy.localeCompare(b.strategy)),
    [state.stats],
  );

  const revokeZipUrl = () => {
    if (zipUrlRef.current) {
      URL.revokeObjectURL(zipUrlRef.current);
      zipUrlRef.current = null;
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    addLog("Stop requested — finishing the current day, then halting.");
  };

  const handleRun = async () => {
    // Ref lock must come before any await so rapid repeated clicks cannot start two runs.
    if (runLockRef.current || isRunning) return;
    if (days.length === 0) {
      toast.error("The From date must be on or before the To date.");
      return;
    }
    if (days.every((day) => isWeekend(day))) {
      toast.error("The selected range contains no trading days (weekends only).");
      return;
    }


    const todayDate = today();
    if (toDate > todayDate) {
      toast.error("The To date cannot be in the future.");
      return;
    }

    runLockRef.current = true;
    const runGeneration = ++runGenerationRef.current;
    const isCurrent = () => runGeneration === runGenerationRef.current;

    stopRef.current = false;
    setIsRunning(true);
    setLogs([]);
    revokeZipUrl();
    setZip(null);
    setProgress({ done: 0, total: days.length });
    resetDiagnostics();

    // Every run is self-contained: the selected range is always processed in full.
    // Clear prior results immediately so a failed re-run cannot leave stale success stats.
    const working: BacktestState = emptyState(symbol);
    setState(working);

    try {
    addLog(
      `Auto-Backtest ${symbol} | ${days[0]} → ${days[days.length - 1]} (${days.length} day(s))`,
    );
    addLog(
      `Mode: CONTINUOUS portfolio replay (analyseContinuous) — default production set (9 final strategies + context). AI stage: ${AI_STAGE_LABELS[aiStage]}.`,
    );
    addLog(
      `Closed-candle policy: seriesEndsComplete=true (historical bars). Future bars only resolve already-generated trades.`,
    );

    const collected: { day: string; content: string; triggers: DayTrigger[] }[] = [];

    const rangeStart = days[0]!;
    const rangeEnd = days[days.length - 1]!;
    // Warm-up window before the first analysed day so every production
    // strategy's indicators (max: Donchian's 20 completed days) have enough
    // history on day one. Turtle (55-day S2) is not part of the production
    // set, so its wider 120-day window is no longer fetched here — that was
    // pulling in ~90 extra unused days on every run.
    const dataStart = addUtcDays(rangeStart, -STANDARD_LOOKBACK_CALENDAR_DAYS);
    const requestedEnd = addUtcDays(rangeEnd, Math.max(0, forwardDays));
    const resolutionEnd = requestedEnd > today() ? today() : requestedEnd;

    addLog(`Fetching continuous OHLC ${dataStart} → ${resolutionEnd} (${STANDARD_LOOKBACK_CALENDAR_DAYS}d warm-up window from first day)…`);
    setCurrentDay(rangeStart);

    let continuousCsv: string | null = null;
    let continuousError: string | undefined;
    try {
      continuousCsv = await buildOhlcCsv({
        symbol,
        startDate: dataStart,
        endDate: resolutionEnd,
        specifyTime: false,
        startTime: "00:00",
        endTime: "23:59",
        log: addLog,
        setCooldown: setCooldownSeconds,
      });
      if (!continuousCsv) continuousError = "no usable OHLC data for continuous window";
    } catch (error) {
      continuousError = `data pull failed: ${String(error)}`;
    }

    if (!isCurrent()) return;

    if (continuousError || !continuousCsv) {
      addLog(`Continuous backtest aborted — ${continuousError}`);
      toast.error(continuousError ?? "No data");
      return;
    }

    addLog("Running analyseContinuous (single shared analyzer pass)…");
    const continuous = analyseContinuous(continuousCsv, { seriesEndsComplete: true });
    if (!isCurrent()) return;
    if (!continuous.ok) {
      addLog(`Continuous analysis failed: ${continuous.error}`);
      toast.error(continuous.error);
      return;
    }

    addLog(
      `Continuous pass: ${continuous.tradeTriggers.length} trade trigger(s), ${continuous.contextEvents.length} context observation(s).`,
    );
    if (continuous.contextLog) {
      for (const line of continuous.contextLog.split("\n").slice(0, 40)) addLog(line);
    }


    // Day-level candle stats derived from the continuous result table (one row per strategy per bar).
    const dayCandleMeta = (() => {
      const map = new Map<string, { analyzed: number; invalid: number; lastDatetime: string }>();
      const seenBars = new Map<string, Set<string>>();
      for (const row of continuous.analysis.results) {
        const dayKey = row.datetime.slice(0, 10);
        let meta = map.get(dayKey);
        if (!meta) {
          meta = { analyzed: 0, invalid: 0, lastDatetime: row.datetime };
          map.set(dayKey, meta);
          seenBars.set(dayKey, new Set());
        }
        const bars = seenBars.get(dayKey)!;
        if (!bars.has(row.datetime)) {
          bars.add(row.datetime);
          meta.analyzed += 1;
          if (row.datetime > meta.lastDatetime) meta.lastDatetime = row.datetime;
        }
      }
      for (const inv of continuous.analysis.invalidRowList) {
        const dayKey = inv.datetime.slice(0, 10);
        let meta = map.get(dayKey);
        if (!meta) {
          meta = { analyzed: 0, invalid: 0, lastDatetime: inv.datetime };
          map.set(dayKey, meta);
        }
        meta.invalid += 1;
      }
      return map;
    })();

    for (let i = 0; i < days.length; i++) {
      if (!isCurrent()) return;
      if (stopRef.current) {
        addLog("Run halted by user.");
        break;
      }

      const day = days[i]!;
      setCurrentDay(day);
      const windowStart = dataStart;
      const triggers = continuous.tradesOnDay(day);
      const dayContext = continuous.contextOnDay(day);
      const contextLog = contextLogForDay(continuous.contextEvents, day);
      const meta = dayCandleMeta.get(day);
      const strategyBreakdown = buildStrategyBreakdown(continuous.analysis.results, day);

      // Weekends (and other calendar days with no bars) produce no market candles.
      // Do not invent data; emit a SKIPPED report and keep rolling stats unchanged.
      if (isWeekend(day) || (!meta && triggers.length === 0 && dayContext.length === 0)) {
        const reason = isWeekend(day)
          ? "weekend — no market session / no OHLC expected"
          : "no OHLC bars for this calendar day in the continuous series";
        working.skipped.push({ day, reason });
        setProgress({ done: i + 1, total: days.length });
        addLog(`${day}: SKIPPED — ${reason}`);
        const report = buildDayReport({
          symbol,
          day,
          checkpoint: "23:59",
          windowStart,
          state: working,
          triggers: [],
          skipReason: reason,
          resolutionEnd,
        });
        collected.push({ day, content: report, triggers: [] });
        continue;
      }

      // Cumulative stats grow strictly with completed trading days (chronological).
      applyTriggers(working, triggers);
      working.firstDay = working.firstDay ?? day;
      working.days.push(day);
      working.lastCompletedDay = day;
      setState({ ...working, stats: { ...working.stats } });
      setProgress({ done: i + 1, total: days.length });

      const resolved = triggers.filter((t) => t.outcome === "TP" || t.outcome === "SL").length;
      const stillOpen = triggers.filter((t) => t.outcome === "OPEN").length;
      addLog(
        `${day}: ${triggers.length} trade(s) · ${dayContext.length} context · ${resolved} resolved · ${stillOpen} open`,
      );

      let report = buildDayReport({
        symbol,
        day,
        checkpoint: "23:59",
        windowStart,
        state: working,
        triggers,
        analyzedRows: meta?.analyzed ?? 0,
        invalidRows: meta?.invalid ?? 0,
        lastRowDatetime: meta?.lastDatetime ?? continuous.analysis.lastRowDatetime,
        strategyBreakdown,
        resolutionEnd,
      });
      if (dayContext.length > 0) {
        report = report + "\n\n" + contextLog;
      }

      const aiSections: { title: string; body: string }[] = [];
      const canRunAi = aiStage !== "off" && triggers.length > 0;
      if (aiStage !== "off" && !canRunAi) {
        addLog(`${day}: AI stage skipped — no trade triggers this day.`);
      }

      if (canRunAi && (aiStage === "verifier" || aiStage === "both")) {
        try {
          addLog(`${day}: running V2 verifier / picker…`);
          const outcome = await runVerifier({ data: { scoutData: report, ohlcCsv: continuousCsv } });
          if (!isCurrent()) return;
          aiSections.push({
            title: `V2 VERIFIER VERDICT (${outcome.provider} · ${outcome.model})`,
            body: outcome.warnings.length
              ? `${outcome.verdict}\n\nwarnings: ${outcome.warnings.join(" | ")}`
              : outcome.verdict,
          });
          addLog(`${day}: verifier done via ${outcome.provider} · ${outcome.model}`);
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof Error ? error.message : String(error);
          aiSections.push({ title: "V2 VERIFIER VERDICT", body: `FAILED: ${message}` });
          addLog(`${day}: verifier failed — ${message}`);
        }
      }

      if (canRunAi && (aiStage === "debate" || aiStage === "both")) {
        try {
          addLog(`${day}: running Gemini ↔ GPT debate…`);
          const debate = await runDebate({
            symbol,
            range: `${windowStart} → ${day}`,
            ohlcCsv: continuousCsv,
            summaryFields: report,
            onLog: (message) => addLog(`${day}: ${message}`),
          });
          if (!isCurrent()) return;
          aiSections.push({
            title: `GEMINI ↔ GPT DEBATE (${debate.status}${debate.agreed ? " · agreed" : ""})`,
            body: `${debate.summary}\n\n--- FULL TRANSCRIPT ---\n${debate.transcript}`,
          });
          addLog(`${day}: debate finished — ${debate.status}`);
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof Error ? error.message : String(error);
          aiSections.push({ title: "GEMINI ↔ GPT DEBATE", body: `FAILED: ${message}` });
          addLog(`${day}: debate failed — ${message}`);
        }
      }

      report = appendAiSections(report, aiSections);
      collected.push({ day, content: report, triggers });
    }

    for (const line of getDiagnosticsReportLines()) addLog(line);

    if (collected.length === 0) {
      toast.error("Nothing was analysed.");
      return;
    }

    if (!isCurrent()) return;

    try {
      const packaged = batchBacktestReports(collected, days.length);
      const bundle = new JSZip();
      for (const file of packaged) bundle.file(file.name, file.content);
      const blob = await bundle.generateAsync({ type: "blob" });
      if (!isCurrent()) return;
      const name = `backtest_${symbol.replace("/", "")}_${collected[0]!.day}_to_${collected[collected.length - 1]!.day}.zip`;
      downloadBlob(blob, name);
      revokeZipUrl();
      const url = URL.createObjectURL(blob);
      zipUrlRef.current = url;
      setZip({ name, url });
      addLog(`Bundled ${packaged.length} packaged report file(s) into ${name}.`);
      toast.success(`Backtest finished — ${packaged.length} packaged report file(s) zipped`);
    } catch (error) {
      if (!isCurrent()) return;
      addLog(`ZIP packaging failed: ${String(error)}`);
      toast.error("ZIP packaging failed.");
    }
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Backtest aborted with unexpected error: ${message}`);
      toast.error(`Backtest failed: ${message}`);
    } finally {
      // Only the active generation may clear the running flag / unlock.
      if (isCurrent()) {
        setCurrentDay(null);
        setCooldownSeconds(null);
        setIsRunning(false);
        runLockRef.current = false;
      }
    }
  };

  return (
    <main className="app-shell min-h-screen bg-background px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/" className="flex w-fit items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={12} /> Main menu
            </Link>
            <Link to="/gemini-console" className="flex w-fit items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground">
              <Bot size={12} /> Gemini console
            </Link>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                <History size={22} className="text-primary" /> Auto-Backtester
              </h1>

            </div>
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`size-2.5 rounded-full ${
                  isRunning
                    ? "animate-pulse bg-warning"
                    : zip
                      ? "bg-success"
                      : "bg-muted-foreground"
                }`}
                aria-hidden
              />
              {isRunning
                ? `Running ${currentDay ?? ""} (${progress.done}/${progress.total})`
                : zip
                  ? "Complete"
                  : "Ready"}
              {cooldownSeconds !== null && (
                <span className="font-mono text-warning">· cooldown {cooldownSeconds}s</span>
              )}
            </span>
          </div>
        </header>

        <section className="glass-card flex flex-col gap-4 rounded-xl p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-wide">Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol} disabled={isRunning}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {AVAILABLE_SYMBOLS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from" className="text-[11px] uppercase tracking-wide">
                From
              </Label>
              <Input
                id="from"
                type="date"
                value={fromDate}
                disabled={isRunning}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to" className="text-[11px] uppercase tracking-wide">
                To
              </Label>
              <Input
                id="to"
                type="date"
                value={toDate}
                disabled={isRunning}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <Label htmlFor="forward" className="text-[11px] uppercase tracking-wide">
                Forward resolution window (days)
              </Label>
              <Input
                id="forward"
                type="number"
                min={0}
                max={60}
                value={forwardDays}
                disabled={isRunning}
                onChange={(event) =>
                  setForwardDays(Math.max(0, Math.min(60, Number(event.target.value) || 0)))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Extra calendar days fetched after the To date so already-generated triggers can
                resolve to TP/SL. Signal generation never uses those bars. 0 means no post-range
                resolution data — more trades stay OPEN. This is not live/incomplete-bar mode;
                seriesEndsComplete remains true for historical backtests.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <Label className="text-[11px] uppercase tracking-wide">AI stage per day</Label>
              <Select
                value={aiStage}
                onValueChange={(value) => setAiStage(value as AiStage)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["verifier", "debate", "both", "off"] as AiStage[]).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {AI_STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The verifier runs on every day that produced PASS setups and its verdict is written
                into that day&apos;s report. The debate is much slower — it streams a full Gemini ↔
                GPT round per day.
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {days.length === 0
              ? "From date must be on or before the To date."
              : `${days.length} day(s) queued · report range ${days[0]} → ${days[days.length - 1]} · OHLC fetch ${addUtcDays(days[0]!, -STANDARD_LOOKBACK_CALENDAR_DAYS)} → ${addUtcDays(days[days.length - 1]!, Math.max(0, forwardDays))} (${STANDARD_LOOKBACK_CALENDAR_DAYS}d warm-up + ${forwardDays}d forward resolution) · strategies: production nine + context · seriesEndsComplete=true`}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleRun}
              disabled={isRunning || days.length === 0}
              className="flex-1"
            >
              {isRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Running {currentDay ?? ""}
                </>
              ) : (
                <>
                  <Play size={14} /> Run backtest
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleStop} disabled={!isRunning}>
              <Square size={14} /> Stop
            </Button>
            {zip && (
              <Button variant="ghost" asChild>
                <a href={zip.url} download={zip.name}>
                  <Download size={14} /> {zip.name}
                </a>
              </Button>
            )}
          </div>

          {isRunning && progress.total > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          )}
        </section>

        <section className="glass-card flex flex-col gap-3 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Rolling stats {state.firstDay ? `since ${state.firstDay}` : ""}
          </h2>
          {statsRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No triggers recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Strategy</th>
                    <th className="py-1.5 pr-3">Triggers</th>
                    <th className="py-1.5 pr-3">TP</th>
                    <th className="py-1.5 pr-3">SL</th>
                    <th className="py-1.5 pr-3">No fill</th>
                    <th className="py-1.5 pr-3">Open</th>
                        <th className="py-1.5 pr-3">Planned RR avg</th>
                        <th className="py-1.5 pr-3">Avg realized R</th>
                    <th className="py-1.5">Win rate</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {statsRows.map((row) => {
                    const rate = winRate(row);
                    const avgRr = averageRr(row);
                    const realized = realizedR(row);
                    return (
                      <tr key={row.strategyId} className="border-t border-border/40">
                        <td className="py-1.5 pr-3 font-sans text-foreground">{row.strategy}</td>
                        <td className="py-1.5 pr-3">{row.triggers}</td>
                        <td className="py-1.5 pr-3 text-success">{row.tpHits}</td>
                        <td className="py-1.5 pr-3 text-destructive">{row.slHits}</td>
                        <td className="py-1.5 pr-3">{row.noFill ?? 0}</td>
                        <td className="py-1.5 pr-3">{row.open}</td>
                        <td className="py-1.5 pr-3">{avgRr === null ? "n/a" : `${avgRr.toFixed(2)}R`}</td>
                        <td className="py-1.5 pr-3">{realized === null ? "n/a" : `${realized >= 0 ? "+" : ""}${realized.toFixed(2)}R`}</td>
                        <td className="py-1.5">{rate === null ? "n/a" : `${rate.toFixed(1)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-card flex flex-col gap-3 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground">Run log</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {logs.length === 0 ? "Idle — pick a range and run." : logs.join("\n")}
          </pre>
        </section>
      </div>
    </main>
  );
}
