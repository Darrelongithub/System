import { test, assert, assertEqual } from "./tiny.mjs";
import {
  getFredMacroSnapshot,
  resetFredMacroCacheForTests,
} from "../src/lib/watcher/fred-macro.ts";

test("watcher FRED: parses four series, five/twenty observation deltas and six-hour cache", async () => {
  resetFredMacroCacheForTests();
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    const id = new URL(url).searchParams.get("id");
    const values = Array.from(
      { length: 25 },
      (_, i) => `2026-01-${String(i + 1).padStart(2, "0")},${i + (id === "VIXCLS" ? 10 : 0)}`,
    ).join("\n");
    return new Response(`observation_date,${id}\n${values}`, { status: 200 });
  };
  const live = await getFredMacroSnapshot({ force: true, fetcher });
  assertEqual(live.status, "live");
  assertEqual(Object.keys(live.series).length, 4);
  assertEqual(live.series.DFII10.delta5d, 5);
  assertEqual(live.series.DFII10.delta20d, 20);
  const cached = await getFredMacroSnapshot({
    fetcher: async () => {
      throw Error("should use cache");
    },
  });
  assertEqual(cached.status, "cached");
  assertEqual(calls, 4);
  const stale = await getFredMacroSnapshot({
    force: true,
    fetcher: async () => {
      throw Error("offline");
    },
  });
  assertEqual(stale.status, "cached");
  assert(stale.warning?.includes("offline"));
  resetFredMacroCacheForTests();
});

test("watcher FRED: offline with no cache returns empty, safe values", async () => {
  resetFredMacroCacheForTests();
  const result = await getFredMacroSnapshot({
    force: true,
    fetcher: async () => {
      throw Error("network down");
    },
  });
  assertEqual(result.status, "offline");
  assert(result.warning?.includes("network down"));
  assertEqual(result.series.DFII10.value, null);
  resetFredMacroCacheForTests();
});
