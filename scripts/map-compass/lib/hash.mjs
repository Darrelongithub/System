import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Git blob oid = sha1("blob " + byteLength + "\0" + bytes). */
export function gitBlobOid(buffer) {
  const h = createHash("sha1");
  h.update(`blob ${buffer.length}\0`);
  h.update(buffer);
  return h.digest("hex");
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}
