/** M3 cost model + standardised trade resolver tests. */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import { COST, EXIT_HARNESS, CLAIM_CRITERIA } from "../../scripts/map-compass/frozen.mjs";
import {
  costR,
  netR,
  spreadOverAtr,
  volRegimeOf,
  COST_VARIANTS,
} from "../../scripts/map-compass/lib/cost.mjs";
import { resolveTrade, evaluateBook } from "../../scripts/map-compass/lib/trade.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
const model = existsSync(A("cost-model.json"))
  ? JSON.parse(readFileSync(A("cost-model.json"), "utf8"))
  : null;

const bars = (n = 30) =>
  Array.from({ length: n }, (_, i) => ({
    datetime: `2020-06-15 ${String(((i % 48) / 2) | 0).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00`,
    o: 100.2,
    h: 101,
    l: 99,
    c: 100,
    v: 1,
  }));

test("cost model is real data, in R units, and materially larger than the old $0.20", () => {
  assert(model, "run node scripts/map-compass/build-cost-model.mjs first");
  assert(model.matchedMinutes > 100000);
  assert(
    model.baselineCostR > 0.05,
    `baseline ${model.baselineCostR}R must be economically meaningful`,
  );
  assert(model.baselineCostR < 0.5, "and not absurd");
  assert(model.stressCostR > model.baselineCostR);
  assertEqual(Object.keys(model.table).length, 9);
});

test("cost is scale-free: it does not depend on the price level", () => {
  assert(model);
  const a = costR({ session: "ny", vol: "mid" });
  const b = costR({ session: "ny", vol: "mid", variant: "baseline" });
  assertEqual(a, b);
  // The same call returns the same number regardless of any price argument.
  for (const p of [381, 1700, 5597]) {
    assertEqual(costR({ session: "ny", vol: "mid", price: p }), a, `price ${p}`);
  }
});

test("quiet/low-vol hours cost MORE than high-vol hours (illiquidity effect)", () => {
  assert(model);
  assert(
    spreadOverAtr("ny", "low") > spreadOverAtr("ny", "high"),
    "low-vol spread must exceed high-vol spread — the old model had this backwards",
  );
  assert(costR({ session: "ny", vol: "low" }) > costR({ session: "ny", vol: "high" }));
});

test("stress variants are ordered and are diagnostics only", () => {
  assert(model);
  const costs = COST_VARIANTS.map((v) => ({
    id: v.id,
    c: costR({ session: "ny", vol: "mid", ...v }),
  }));
  assert(costs.find((x) => x.id === "stress").c > costs.find((x) => x.id === "baseline").c);
  assert(costs.find((x) => x.id === "doubleSlippage").c > costs.find((x) => x.id === "baseline").c);
  assertEqual(COST_VARIANTS.length, 3);
});

test("an unknown session|vol cell is a HARD ERROR, never a cheap fallback", () => {
  let threw = false;
  try {
    spreadOverAtr("nowhere", "mid");
  } catch {
    threw = true;
  }
  assert(threw, "missing cost cell must throw");
});

test("netR = grossR - costR, exactly", () => {
  const args = { session: "ny", vol: "mid" };
  const c = costR(args);
  assertEqual(netR(2, args), 2 - c);
  assertEqual(netR(-1, args), -1 - c);
});

test("volRegimeOf uses frozen, price-relative thresholds", () => {
  assertEqual(volRegimeOf({ h: 100.02, l: 100, c: 100 }), "low");
  assertEqual(volRegimeOf({ h: 100.1, l: 100, c: 100 }), "mid");
  assertEqual(volRegimeOf({ h: 100.3, l: 100, c: 100 }), "high");
  assertEqual(COST.volRegime.lowMax, 0.0006);
});

test("D3: standardised 2R trade is NOT rejected by any RR gate", () => {
  const b = bars();
  b[1] = { ...b[1], o: 100, h: 103.01, l: 99.9, c: 103 }; // hits +3 = 2R
  const t = resolveTrade(b, 0, "long", 1, { session: "ny", vol: "mid" });
  assertEqual(t.outcome, "TP");
  assert(t.grossR > 1.99 && t.grossR < 2.01, `gross R should be 2, got ${t.grossR}`);
  assert(t.netR < t.grossR, "cost must be charged");
});

test("D3: a losing trade is -1R gross, worse net", () => {
  const b = bars();
  b[1] = { ...b[1], o: 100, h: 100.1, l: 98.49, c: 98.5 };
  const t = resolveTrade(b, 0, "long", 1, { session: "ny", vol: "mid" });
  assertEqual(t.outcome, "SL");
  assert(t.grossR > -1.01 && t.grossR < -0.99);
  assert(t.netR < -1);
});

test("D4: both levels in one bar with NO M15 -> conservative stop first", () => {
  const b = bars();
  b[1] = { ...b[1], o: 100, h: 104, l: 97, c: 100 }; // contains both
  const t = resolveTrade(b, 0, "long", 1, { session: "ny", vol: "mid" });
  assertEqual(t.outcome, "SL");
  assertEqual(t.ambiguousFallback, true);
});

test("D4: M15 ordering can rescue the ambiguous bar", () => {
  const b = bars();
  b[1] = { ...b[1], o: 100, h: 104, l: 97, c: 100 };
  const m15 = new Map([
    [
      1,
      [
        { o: 100, h: 103.2, l: 99.8, c: 103 }, // TP first (h>=103)
        { o: 103, h: 104, l: 97, c: 100 }, // SL later
      ],
    ],
  ]);
  const t = resolveTrade(b, 0, "long", 1, { session: "ny", vol: "mid", m15ByM30: m15 });
  assertEqual(t.outcome, "TP", "M15 must resolve TP-before-SL");
  assertEqual(t.ambiguousFallback, false);
});

test("gap-through fills at the open, not the declared level", () => {
  const b = bars();
  b[1] = { ...b[1], o: 97, h: 97.5, l: 96, c: 97 }; // opens below stop 98.5
  const t = resolveTrade(b, 0, "long", 1, { session: "ny", vol: "mid" });
  assertEqual(t.outcome, "SL");
  assertEqual(t.exitPrice, 97);
  assert(t.grossR < -1, "gap fill must be worse than -1R");
});

test("shorts are symmetric", () => {
  const b = bars();
  b[1] = { ...b[1], o: 100, h: 100.1, l: 96.99, c: 97 };
  const t = resolveTrade(b, 0, "short", 1, { session: "ny", vol: "mid" });
  assertEqual(t.outcome, "TP");
  assert(t.grossR > 1.99);
});

test("book-level: signals during an occupied slot are DROPPED, not queued", () => {
  const b = bars(30);
  b[3] = { ...b[3], o: 100, h: 100.1, l: 98.49, c: 98.5 }; // first trade SL at bar 3
  const signals = [
    { index: 0, side: "long", strategyId: "A", priority: 1, atr: 1, session: "ny", vol: "mid" },
    { index: 1, side: "long", strategyId: "B", priority: 2, atr: 1, session: "ny", vol: "mid" },
    { index: 2, side: "long", strategyId: "C", priority: 3, atr: 1, session: "ny", vol: "mid" },
  ];
  const book = evaluateBook(b, signals);
  assertEqual(book.trades.length, 1, "one slot means one trade");
  assertEqual(book.rejected.slot, 2, "both signals while occupied must be dropped");
  assertEqual(book.trades[0].exitIndex, 3);
});

test("frozen priority breaks same-bar ties deterministically", () => {
  const b = bars(30);
  b[1] = { ...b[1], o: 100, h: 103.01, l: 99.9, c: 103 };
  const signals = [
    { index: 0, side: "long", strategyId: "LOW", priority: 9, atr: 1, session: "ny", vol: "mid" },
    { index: 0, side: "long", strategyId: "HIGH", priority: 1, atr: 1, session: "ny", vol: "mid" },
  ];
  const book = evaluateBook(b, signals);
  assertEqual(book.trades.length, 1);
  assertEqual(book.trades[0].strategyId, "HIGH");
});

test("claim criteria remain frozen and require net (not gross) profitability", () => {
  assertEqual(CLAIM_CRITERIA.practicalFloorR, 0.1);
  assertEqual(CLAIM_CRITERIA.tStatMin, 2);
  assertEqual(CLAIM_CRITERIA.minTradesPerCell, 100);
  assertEqual(EXIT_HARNESS.targetR, 2);
  assertEqual(EXIT_HARNESS.stopAtrMultiple, 1.5);
});
