import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { gitBlobOid } from "./lib/hash.mjs";
const ROOT=fileURLToPath(new URL("../..",import.meta.url));
const PINS=JSON.parse(readFileSync(new URL("./pins.json",import.meta.url),"utf8"));
const ART=join(ROOT,"artifacts/map-compass"),RAW=join(ART,"raw"),OUT=join(ART,"amendment7");
const fileName=(k)=>/^(bid|ask)_\d{4}_\d{2}$/.test(k)?`${k}.csv`:k;
const checks=Object.entries(PINS).map(([key,expected])=>{
  const file=join(RAW,fileName(key));
  if(!existsSync(file))return {key,expected,actual:null,status:"MISSING"};
  const actual=gitBlobOid(readFileSync(file));
  return {key,expected,actual,status:actual===expected?"MATCH":"MISMATCH"};
});
const manifest=JSON.parse(readFileSync(join(ART,"data-manifest.json"),"utf8"));
const normalizedChecks=Object.entries(manifest.datasets).map(([name,meta])=>{
  const file=join(ART,meta.file);
  if(!existsSync(file))return {name,file:meta.file,expected:meta.sha256,actual:null,status:"MISSING"};
  const actual=createHash("sha256").update(readFileSync(file)).digest("hex");
  return {name,file:meta.file,expected:meta.sha256,actual,status:actual===meta.sha256?"MATCH":"MISMATCH"};
});
const result={
  generatedAt:new Date().toISOString(),
  algorithm:"Git blob SHA-1 for immutable raw pins; SHA-256 for normalized outputs versus data-manifest.json",
  pinnedFiles:checks.length,matched:checks.filter(x=>x.status==="MATCH").length,
  missing:checks.filter(x=>x.status==="MISSING").length,mismatched:checks.filter(x=>x.status==="MISMATCH").length,
  failures:checks.filter(x=>x.status!=="MATCH"),
  normalizedFiles:normalizedChecks.length,normalizedMatched:normalizedChecks.filter(x=>x.status==="MATCH").length,
  normalizedFailures:normalizedChecks.filter(x=>x.status!=="MATCH"),
};
mkdirSync(OUT,{recursive:true});
writeFileSync(join(OUT,"pin-verification.json"),JSON.stringify(result,null,2)+"\n");
console.log(`pin verification: ${result.matched}/${result.pinnedFiles} raw pins; normalized hashes ${result.normalizedMatched}/${result.normalizedFiles} match`);
if(result.missing||result.mismatched||result.normalizedFailures.length)process.exit(1);
