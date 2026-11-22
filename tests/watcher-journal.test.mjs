import { test, assert, assertEqual } from "./tiny.mjs";
import { appendTradeJournal, readTradeJournal } from "../src/lib/watcher/trade-journal.ts";
import { reviewTrade } from "../src/lib/watcher/gemini-watcher.ts";
import { buildMonthlyMaintenanceReport } from "../src/lib/watcher/monthly-report.ts";
import { rm } from "node:fs/promises";

const macro = {
  status: "offline",
  fetchedAt: null,
  series: Object.fromEntries(
    ["DFII10", "VIXCLS", "T10Y2Y", "BAMLH0A0HYM2"].map((id) => [
      id,
      {
        id,
        label: id,
        value: null,
        observationDate: null,
        delta5d: null,
        delta20d: null,
        direction: "unavailable",
      },
    ]),
  ),
};
const testMonth = "2001-01";

test("watcher journal: deterministic idempotent JSONL + monthly report works without Gemini", async () => {
  const input = {
    timestamp: "2001-01-03T12:00:00.000Z",
    eventId: "watcher-test-event-1",
    symbol: "XAU/USD",
    strategyId: "v3-test",
    side: "BUY",
    entry: 1900,
    exit: 1902,
    sl: 1898,
    tp: 1904,
    signalPrice: 1900.1,
    fillPrice: 1900,
    spread: 0.2,
    realizedR: 1,
    regime: "trend",
    volatility: "normal",
    upcomingNews: ["CPI"],
    profit: 100,
    commission: -1,
    swap: 0,
  };
  const first = await appendTradeJournal(input, macro);
  const second = await appendTradeJournal(input, macro);
  try {
    assert(first.created);
    assert(!second.created);
    assert(Math.abs(first.entry.signalVsFillSlippage + 0.1) < 1e-10);
    assertEqual(
      (await readTradeJournal(testMonth)).filter((line) => line.kind === "trade").length,
      1,
    );
    const report = await buildMonthlyMaintenanceReport(testMonth);
    assert(report.includes("Monthly Maintenance Dossier"));
    assert(report.includes("v3-test"));
    assert(report.includes("Not supplied"));
    const disabled = await reviewTrade(first.entry, { apiKey: "" });
    assertEqual(disabled.aiStatus, "disabled_no_key");
  } finally {
    await rm(`logs/live-trade-journal-${testMonth}.jsonl`, { force: true });
  }
});

test("watcher Gemini: validates structured response and appends read-only review", async () => {
  const input = {
    timestamp: "2001-01-04T12:00:00.000Z",
    eventId: "watcher-test-event-2",
    symbol: "XAU/USD",
    strategyId: "v3-test",
    side: "SELL",
    entry: 1900,
    exit: 1899,
    sl: 1902,
    tp: 1896,
    realizedR: 0.5,
  };
  const trade = await appendTradeJournal(input, macro);
  try {
    const failed = await reviewTrade(trade.entry, {
      apiKey: "test-only",
      fetcher: async () => new Response("{}", { status: 503 }),
    });
    assertEqual(failed.aiStatus, "error");
    assertEqual(
      (await readTradeJournal(testMonth)).filter((line) => line.kind === "trade").length,
      1,
      "Gemini failure cannot undo deterministic journal write",
    );
    const reviewed = await reviewTrade(trade.entry, {
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        const body = JSON.parse(init.body);
        assert(body.contents[0].parts[0].text.includes("read-only"));
        assert(!body.tools, "Gemini receives no execution tools");
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        setupSummary: "Measured exit",
                        executionGrade: "A",
                        forensicTag: "CLEAN_TREND_TP",
                        shadowCounterfactual: "Test one-bar later entries",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });
    assertEqual(reviewed.aiStatus, "ok");
    assertEqual(reviewed.review?.executionGrade, "A");
    assertEqual(
      (await readTradeJournal(testMonth)).filter((line) => line.kind === "review").length,
      1,
    );
  } finally {
    await rm(`logs/live-trade-journal-${testMonth}.jsonl`, { force: true });
  }
});
