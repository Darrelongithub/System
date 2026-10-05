import { execSync } from "node:child_process";

const endpoints = [
  { name: "Dukascopy Datafeed", url: "https://datafeed.dukascopy.com" },
  { name: "Yahoo Finance API", url: "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC" },
  { name: "Stooq", url: "https://stooq.com/q/d/l/?s=^spx&i=d" },
  { name: "FRED", url: "https://fred.stlouisfed.org" },
  { name: "NPM Registry", url: "https://registry.npmjs.org" },
  { name: "GitHub API", url: "https://api.github.com" },
];

console.log("=== MULTI-MARKET DATA SOURCING: NETWORK REACHABILITY AUDIT ===");
for (const ep of endpoints) {
  try {
    const res = execSync(`curl -s -m 5 -I "${ep.url}"`, { encoding: "utf8" });
    const firstLine = res.split("\n")[0].trim();
    console.log(`[PASS] ${ep.name} (${ep.url}): ${firstLine}`);
  } catch (err) {
    const msg = err.message ? err.message.split("\n")[0] : String(err);
    console.log(`[FAIL] ${ep.name} (${ep.url}): UNREACHABLE (${msg})`);
  }
}
