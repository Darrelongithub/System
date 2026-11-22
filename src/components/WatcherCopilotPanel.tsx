import { useCallback, useEffect, useState } from "react";
import type { FredSnapshot, JournalLine } from "@/lib/watcher/types";

const monthNow = () => new Date().toISOString().slice(0, 7);
function metric(value: number | null, delta: number | null) {
  return value === null
    ? "n/a"
    : `${value.toFixed(2)}${delta === null ? "" : ` · ${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}`;
}

export function WatcherCopilotPanel() {
  const [macro, setMacro] = useState<FredSnapshot | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [aiStatus, setAiStatus] = useState("disabled_no_key");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fredResponse, journalResponse] = await Promise.all([
        fetch("/api/watcher/fred"),
        fetch("/api/watcher/journal"),
      ]);
      if (!fredResponse.ok || !journalResponse.ok)
        throw new Error("Watcher service temporarily unavailable");
      const fred = (await fredResponse.json()) as FredSnapshot;
      const journal = (await journalResponse.json()) as { lines: JournalLine[]; aiStatus: string };
      setMacro(fred);
      setLines(journal.lines ?? []);
      setAiStatus(journal.aiStatus ?? "error");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Watcher service unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const trades = lines.filter((line) => line.kind === "trade" && line.entry).slice(0, 8);
  const reviews = new Map(
    lines.filter((line) => line.kind === "review").map((line) => [line.eventId, line.review]),
  );
  const series = macro?.series;
  const shadows = trades.flatMap((line) => {
    const review = reviews.get(line.eventId);
    return review?.shadowCounterfactual
      ? [{ id: line.eventId, tag: review.forensicTag, text: review.shadowCounterfactual }]
      : [];
  });
  return (
    <section className="panel flex flex-col gap-4 p-5" aria-label="Read-only Watcher Copilot">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Read-only Watcher Copilot</h2>
          <p className="text-xs text-muted-foreground">
            Deterministic journal + optional Gemini post-trade forensics. AI cannot route or change
            orders.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded border px-3 py-1.5 text-xs"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <a
            href={`/api/watcher/monthly-report?month=${monthNow()}`}
            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
          >
            Export Monthly Maintenance Report (.md)
          </a>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        FRED: {macro?.status ?? "loading"} · As of {macro?.fetchedAt ?? "—"}
        {macro?.warning ? ` · ${macro.warning}` : ""} · Gemini: {aiStatus}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(["DFII10", "VIXCLS", "T10Y2Y", "BAMLH0A0HYM2"] as const).map((id) => {
          const point = series?.[id];
          return (
            <div className="rounded border border-border/60 bg-secondary/30 p-3" key={id}>
              <p className="text-[11px] text-muted-foreground">{point?.label ?? id}</p>
              <p className="num mt-1 text-sm font-semibold">
                {metric(point?.value ?? null, point?.delta5d ?? null)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                5-observation delta · {point?.direction ?? "unavailable"}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold">Recent trade forensics</h3>
          {trades.length ? (
            <ul className="flex flex-col gap-2">
              {trades.map((line) => {
                const entry = line.entry!;
                const review = reviews.get(line.eventId);
                return (
                  <li key={line.eventId} className="rounded border border-border/60 p-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <strong>
                        {entry.strategyName} · {entry.side}
                      </strong>
                      <span>
                        {entry.realizedR === null ? "R n/a" : `${entry.realizedR.toFixed(2)}R`}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {entry.symbol} · {entry.timestamp} · entry {entry.entry ?? "—"} → exit{" "}
                      {entry.exit ?? "—"}
                    </p>
                    {review ? (
                      <p className="mt-2">
                        Grade {review.executionGrade} · {review.forensicTag}: {review.setupSummary}
                      </p>
                    ) : (
                      <p className="mt-2 text-muted-foreground">
                        {aiStatus === "disabled_no_key"
                          ? "Gemini disabled; deterministic journal is active."
                          : "No forensic review available yet."}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No closed positions journaled this month yet.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold">Shadow log · hypotheses only</h3>
          {shadows.length ? (
            shadows.map((shadow) => (
              <p
                key={shadow.id}
                className="mb-2 rounded border border-warning/30 bg-warning/5 p-3 text-xs"
              >
                <strong>{shadow.tag}</strong> · {shadow.text}
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  Not applied. Requires independent, out-of-sample validation.
                </span>
              </p>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No shadow suggestions recorded.</p>
          )}
        </div>
      </div>
    </section>
  );
}
