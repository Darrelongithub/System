/**
 * Compositing hygiene — no backdrop blur behind a sticky/fixed layer.
 *
 * A `backdrop-filter` on a `position: sticky` (or `fixed`) element is a
 * compositor trap: the layer has to snapshot and blur the region behind it, and
 * that snapshot is recomputed on every scroll and every composite of anything
 * overlapping it. When a *native* popup has to be composited over that region
 * — which is exactly what `<input type="date">` does — the page can stall long
 * enough for the picker to look frozen, on a completely idle page.
 *
 * This shipped as `backdrop-blur-xl` on the generator's full-width sticky
 * header, directly above that page's date inputs. The header's own background
 * was `bg-black/95`, so at 95% opacity the 24px blur changed almost nothing
 * visually while costing a full-width backdrop snapshot.
 *
 * The invariant: a sticky/fixed element may not also carry a backdrop blur in
 * this repo. If a blur is genuinely wanted there later, it has to be justified
 * against this trade-off rather than added by default.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, assert, assertEqual } from "./tiny.mjs";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(full)) out.push(full);
  }
  return out;
};

const STICKY_OR_FIXED = /\b(?:sticky|fixed)\b/;
const BACKDROP_BLUR = /\bbackdrop-blur(?:-(?:sm|md|lg|xl|2xl|3xl))?\b/;

/** `sticky`/`fixed` and a backdrop blur appearing in the same className value. */
const offending = (source) =>
  [...source.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2] ?? "")
    .filter((cls) => STICKY_OR_FIXED.test(cls) && BACKDROP_BLUR.test(cls))
    .map((cls) => cls.trim());

test("compositing: no sticky or fixed element carries a backdrop blur", () => {
  const violations = [];
  for (const file of walk(SRC)) {
    for (const cls of offending(readFileSync(file, "utf8"))) {
      violations.push(`${path.relative(SRC, file)}: ${cls}`);
    }
  }
  assert(
    violations.length === 0,
    `backdrop blur on a sticky/fixed layer stalls native popups:\n  ${violations.join("\n  ")}`,
  );
});

test("compositing: the generator header keeps its opaque background", () => {
  // Removing the blur must not have replaced it with a translucent background,
  // which would just reintroduce see-through content behind the header.
  const source = readFileSync(path.join(SRC, "pages", "DataGenerator.tsx"), "utf8");
  const header = source.match(/<header className="([^"]*)"/);
  assert(header, "the generator header must be found");
  assert(
    /bg-black\/9[0-9]/.test(header[1]),
    `header background must stay >=90% opaque, got: ${header[1]}`,
  );
  assertEqual(BACKDROP_BLUR.test(header[1]), false, "header must not carry a backdrop blur");
});
