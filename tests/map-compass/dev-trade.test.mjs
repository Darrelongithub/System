/** A8 M6 resolver hand checks: direction, frozen exits/costs, gaps and slots. */
import { test, assert, assertEqual } from "../tiny.mjs";
import { EXIT_HARNESS } from "../../scripts/map-compass/frozen.mjs";
import { costR } from "../../scripts/map-compass/lib/cost.mjs";
import { evaluateBook, resolveTrade } from "../../scripts/map-compass/lib/trade.mjs";

function bars(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    datetime: `2020-06-15 ${String(Math.floor((i * 30) / 60)).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00`,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 1,
  }));
}
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) <= e, `${a} != ${b}`);

function resolveWith(next, side = "long", maxBars = EXIT_HARNESS.maxHoldBars) {
  const b = bars();
  next(b);
  return resolveTrade(b, 0, side, 1, { session: "london", vol: "mid", variant: "baseline", maxBars });
}

test("A8 hand outcome: long stop at the frozen 1.5 ATR level and frozen net cost", () => {
  const r = resolveWith((b) => { b[1].l = 98; });
  assertEqual(r.outcome, "SL");
  assertEqual(r.exitIndex, 1);
  near(r.grossR, -1);
  near(r.costR, costR({ session: "london", vol: "mid", variant: "baseline" }));
  near(r.netR, r.grossR - r.costR);
});

test("A8 hand outcome: short stop and long/short targets use the same 1.5 ATR / 2R harness", () => {
  const shortStop = resolveWith((b) => { b[1].h = 102; }, "short");
  assertEqual(shortStop.outcome, "SL");
  near(shortStop.grossR, -1);
  const longTarget = resolveWith((b) => { b[1].h = 103; }, "long");
  assertEqual(longTarget.outcome, "TP");
  near(longTarget.grossR, 2);
  const shortTarget = resolveWith((b) => { b[1].l = 97; }, "short");
  assertEqual(shortTarget.outcome, "TP");
  near(shortTarget.grossR, 2);
});

test("A8 hand outcome: TIME_EXIT uses the 96-bar cap close and records the market R", () => {
  const r = resolveWith((b) => { b[3].c = 101.5; }, "long", 3);
  assertEqual(r.outcome, "TIME_EXIT");
  assertEqual(r.exitIndex, 3);
  near(r.grossR, 1);
  near(r.netR, r.grossR - r.costR);
});

test("A8 hand outcome: gap-through stop and target fill at the opening price", () => {
  const stop = resolveWith((b) => { b[1].o = 97; b[1].h = 99; b[1].l = 96; }, "long");
  assertEqual(stop.outcome, "SL");
  assertEqual(stop.exitPrice, 97);
  near(stop.grossR, -2);
  const target = resolveWith((b) => { b[1].o = 104; b[1].h = 105; b[1].l = 103.5; }, "long");
  assertEqual(target.outcome, "TP");
  assertEqual(target.exitPrice, 104);
  near(target.grossR, 4 / 1.5);
});

test("A8 one-slot book blocks an arriving signal while occupied; separate card slots do not block each other", () => {
  const b = bars();
  b[2].h = 103;
  const sig = [
    { index: 0, side: "long", strategyId: "donchian-20", priority: 1, atr: 1, session: "london", vol: "mid" },
    { index: 1, side: "short", strategyId: "donchian-20", priority: 1, atr: 1, session: "london", vol: "mid" },
  ];
  const oneCard = evaluateBook(b, sig, { maxBars: 96 });
  assertEqual(oneCard.n, 1);
  assertEqual(oneCard.rejected.slot, 1);
  const cardA = evaluateBook(b, sig.filter((x) => x.strategyId === "donchian-20"), { maxBars: 96 });
  const cardB = evaluateBook(b, sig.map((x) => ({ ...x, strategyId: "donchian-55", priority: 2 })), { maxBars: 96 });
  assertEqual(cardA.n, 1);
  assertEqual(cardB.n, 1);
});
