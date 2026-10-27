#!/usr/bin/env node
/**
 * M1 / G1 — fetch every external dataset by PINNED git blob oid and verify the
 * bytes. No URL is trusted: each blob is re-hashed with git's own blob-oid
 * formula and must match scripts/map-compass/pins.json. A mismatch aborts.
 *
 * Usage:
 *   node scripts/map-compass/fetch-data.mjs                 # all pins
 *   node scripts/map-compass/fetch-data.mjs --only=bid_2020_03,ask_2020_03
 *   node scripts/map-compass/fetch-data.mjs --eurusd=/path/to/EURUSDm30.csv
 *
 * The --eurusd override exists so a local `archive2` (if it turns up) can be
 * swapped in WITHOUT editing pins.json: it is recorded in the manifest as a
 * local, unverified source and flagged for G1 re-approval.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gitBlobOid, sha256 } from "./lib/hash.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const PINS = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));

const REPOS = {
  "archive.zip": "Darrelongithub/System",
  EURUSDm30: "ejtraderLabs/historical-data",
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

function repoFor(key) {
  if (key === "archive.zip") return REPOS["archive.zip"];
  if (key === "EURUSDm30.csv") return REPOS.EURUSDm30;
  return "kevingtlin/Market-Data-Lab";
}

/** Filesystem name for a pin key. M1 bid/ask pins have no extension in the key. */
export function fileName(key) {
  return /^(bid|ask)_\d{4}_\d{2}$/.test(key) ? `${key}.csv` : key;
}

function fetchBlob(repo, oid) {
  // Raw bytes via the git blobs API. --binary-free: execFileSync returns a Buffer.
  return execFileSync(
    "gh",
    ["api", "-H", "Accept: application/vnd.github.raw+json", `repos/${repo}/git/blobs/${oid}`],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
}

mkdirSync(RAW, { recursive: true });
const only = args.only ? String(args.only).split(",") : Object.keys(PINS);
const manifest = { fetchedAt: new Date().toISOString(), pins: {}, files: {}, errors: [] };

for (const key of only) {
  const oid = PINS[key];
  if (!oid) {
    manifest.errors.push(`${key}: no pin`);
    continue;
  }

  // Local override (only for EURUSD): unverified, must be re-approved at G1.
  if (key === "EURUSDm30.csv" && args.eurusd) {
    const buf = readFileSync(String(args.eurusd));
    writeFileSync(join(RAW, fileName(key)), buf);
    manifest.pins[key] = "LOCAL_OVERRIDE";
    manifest.files[key] = {
      sha256: sha256(buf),
      bytes: buf.length,
      source: `local:${args.eurusd}`,
      verified: false,
      note: "Unverified local source — G1 sign-off required before use.",
    };
    console.log(`LOCAL  ${key.padEnd(20)} ${buf.length} bytes (unverified)`);
    continue;
  }

  const dest = join(RAW, fileName(key));
  if (existsSync(dest)) {
    const existing = readFileSync(dest);
    if (gitBlobOid(existing) === oid) {
      manifest.pins[key] = oid;
      manifest.files[key] = { sha256: sha256(existing), bytes: existing.length, verified: true };
      console.log(`CACHED ${key.padEnd(20)} ${existing.length} bytes`);
      continue;
    }
  }

  try {
    const buf = fetchBlob(repoFor(key), oid);
    const actual = gitBlobOid(buf);
    if (actual !== oid) {
      manifest.errors.push(`${key}: oid mismatch expected ${oid} got ${actual}`);
      console.error(`FAIL   ${key}: oid mismatch`);
      continue;
    }
    writeFileSync(dest, buf);
    manifest.pins[key] = oid;
    manifest.files[key] = { sha256: sha256(buf), bytes: buf.length, verified: true };
    console.log(`OK     ${key.padEnd(20)} ${buf.length} bytes`);
  } catch (err) {
    manifest.errors.push(`${key}: ${err.message}`);
    console.error(`FAIL   ${key}: ${err.message.split("\n")[0]}`);
  }
}

writeFileSync(join(RAW, "fetch-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${Object.keys(manifest.files).length} files, ${manifest.errors.length} errors`);
if (manifest.errors.length) process.exit(1);
