import { test } from "node:test";
import assert from "node:assert/strict";
import { EconomicNewsManager, checkNewsBlackout } from "../src/lib/mt5/news-filter.ts";
import { canonicalSymbol } from "../src/lib/mt5/engine.ts";
import { generateMql5EaSource } from "../src/lib/mt5/mql5-ea.ts";

test("calendar fails closed without inventing events and backs off", async () => {
  const manager = new EconomicNewsManager();
  let calls = 0;
  const offline = async () => {
    calls++;
    throw new Error("offline");
  };
  await manager.refresh(offline);
  await manager.refresh(offline);
  assert.equal(calls, 1);
  assert.equal(manager.getStatus(), "unavailable");
  assert.deepEqual(manager.getEvents(), []);
});

test("real feed parsed, cached and ages stale", async () => {
  const manager = new EconomicNewsManager();
  const fetcher = async () =>
    new Response(
      JSON.stringify([
        { title: "CPI", country: "USD", date: "2026-12-01T13:30:00Z", impact: "High" },
      ]),
    );
  await manager.refresh(fetcher);
  assert.equal(manager.getStatus(), "live");
  assert.equal(manager.getStatus(manager.getLastFetched() + 3600001), "stale");
  assert.equal(manager.getEvents()[0].title, "CPI");
  assert.equal(
    checkNewsBlackout({
      symbol: "GOLD",
      config: {
        enabled: true,
        filterHighImpact: true,
        filterMediumImpact: false,
        minutesBefore: 30,
        minutesAfter: 15,
        affectedCurrenciesOnly: true,
      },
      events: manager.getEvents(),
      currentTimeMs: Date.parse("2026-12-01T13:10:00Z"),
    }).isBlocked,
    true,
  );
});

test("invalid feed does not become live", async () => {
  const manager = new EconomicNewsManager();
  await manager.refresh(async () => new Response(JSON.stringify([{ title: "bad" }])));
  assert.equal(manager.getStatus(), "unavailable");
});

test("gold alias and terminal guards are generated", () => {
  assert.equal(canonicalSymbol("GOLD"), "XAUUSD");
  const source = generateMql5EaSource({});
  for (const marker of [
    "CalendarValueHistory",
    "InpMaxDailyDrawdownPct",
    "[SPREAD GUARD]",
    "POSITION_MAGIC",
  ])
    assert.ok(source.includes(marker));
});
