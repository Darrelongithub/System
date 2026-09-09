import { runAll } from "./tiny.mjs";

await import("./golden.test.mjs");
await import("./math-finiteness.test.mjs");
await import("./live-final-bar.test.mjs");
await import("./ema-invalid-seed.test.mjs");
await import("./parse-spread.test.mjs");
await import("./rate-limit-retry-cap.test.mjs");
await import("./ohlc-chunking.test.mjs");
await import("./ny-session-tail.test.mjs");
await import("./journal-excursion.test.mjs");
await import("./swing-ref-causality.test.mjs");
await import("./accounting.test.mjs");
await import("./determinism.test.mjs");
await import("./causality.test.mjs");
await import("./weekend-tail-accounting.test.mjs");
await import("./backtest-analyzer-parity.test.mjs");
await import("./server-env.test.mjs");
await import("./status-parse-time-tz.test.mjs");
await import("./tz-matrix.test.mjs");

const filter = process.argv[2];
const ok = await runAll(filter);
process.exit(ok ? 0 : 1);
