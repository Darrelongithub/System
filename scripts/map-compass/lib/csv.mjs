/** Tiny, dependency-free CSV helpers. No node_modules in this workspace. */

export function splitLine(line, delimiter = ",") {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field.trim());
      field = "";
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

/** Number, or undefined for blank/non-finite. Never coerces junk to 0. */
export function num(value) {
  if (value === undefined || value === "") return undefined;
  const n = Number(String(value).replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Iterate data lines, skipping blank lines and section markers (=== ... ===). */
export function* dataLines(text, { delimiter = ";", skipHeader = true } = {}) {
  let first = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("===")) continue;
    if (first && skipHeader) {
      first = false;
      continue;
    }
    first = false;
    yield splitLine(line, delimiter);
  }
}

/** Serialise rows as LF-terminated CSV (repo-wide LF policy). */
export function toCsv(header, rows) {
  const esc = (v) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
}
