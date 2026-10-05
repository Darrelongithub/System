import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const ROOT = resolve(".");
const RAW_DIR = resolve(ROOT, "data/multimarket/raw");

console.log("=== STEP 0: INVENTORY AUDIT OF data/multimarket/raw/ ===");

// 1. Check local working tree
if (!existsSync(RAW_DIR)) {
  console.log(`Directory ${RAW_DIR} does not exist in working tree.`);
} else {
  const files = readdirSync(RAW_DIR);
  console.log(`Found ${files.length} items in ${RAW_DIR}.`);
  for (const f of files) {
    const fullPath = join(RAW_DIR, f);
    const st = statSync(fullPath);
    console.log(` - ${f}: ${st.size} bytes`);
  }
}

// 2. Check origin/main git tree
console.log("\n=== Checking origin/main git tree for data/multimarket/raw ===");
try {
  const gitMainTree = execSync("git ls-tree -r --name-only origin/main data/multimarket/raw", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (gitMainTree.length === 0) {
    console.log("git ls-tree origin/main: No files found under data/multimarket/raw.");
  } else {
    console.log("git ls-tree origin/main found:\n" + gitMainTree);
  }
} catch (err) {
  console.log("Error checking origin/main:", err.message.split("\n")[0]);
}

// 3. Test Network Reachability
console.log("\n=== Checking Network Reachability ===");
const endpoints = [
  { name: "Dukascopy Datafeed", url: "https://datafeed.dukascopy.com" },
  { name: "Yahoo Finance API", url: "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC" },
  { name: "Stooq", url: "https://stooq.com/q/d/l/?s=^spx&i=d" },
  { name: "FRED", url: "https://fred.stlouisfed.org" },
  { name: "NPM Registry", url: "https://registry.npmjs.org" },
  { name: "GitHub API", url: "https://api.github.com" },
];

for (const ep of endpoints) {
  try {
    const res = execSync(`curl -s -m 5 -I "${ep.url}"`, { encoding: "utf8" });
    const firstLine = res.split("\n")[0].trim();
    console.log(`[PASS] ${ep.name} (${ep.url}): ${firstLine}`);
  } catch (err) {
    console.log(`[FAIL] ${ep.name} (${ep.url}): UNREACHABLE`);
  }
}
