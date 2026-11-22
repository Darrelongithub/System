import type { FredSnapshot, MacroPoint, MacroSeriesId } from "./types";

const SERIES: { id: MacroSeriesId; label: string }[] = [
  { id: "DFII10", label: "10Y Real Yield" },
  { id: "VIXCLS", label: "VIX" },
  { id: "T10Y2Y", label: "2s10s" },
  { id: "BAMLH0A0HYM2", label: "HY Spread" },
];
const TTL_MS = 6 * 60 * 60 * 1000;
let memoryCache: { fetchedAt: number; series: FredSnapshot["series"] } | undefined;

function emptyPoint(id: MacroSeriesId, label: string): MacroPoint {
  return {
    id,
    label,
    value: null,
    observationDate: null,
    delta5d: null,
    delta20d: null,
    direction: "unavailable",
  };
}
function offlineSnapshot(warning: string): FredSnapshot {
  return {
    status: memoryCache ? "cached" : "offline",
    fetchedAt: memoryCache ? new Date(memoryCache.fetchedAt).toISOString() : null,
    series:
      memoryCache?.series ??
      (Object.fromEntries(
        SERIES.map(({ id, label }) => [id, emptyPoint(id, label)]),
      ) as FredSnapshot["series"]),
    warning,
  };
}
function parseFredCsv(id: MacroSeriesId, label: string, text: string): MacroPoint {
  const observations: { date: string; value: number }[] = [];
  for (const line of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(1)) {
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    const value = Number(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && raw !== "." && Number.isFinite(value))
      observations.push({ date, value });
  }
  const latest = observations.at(-1);
  if (!latest) return emptyPoint(id, label);
  const d5 =
    observations.length > 5 ? latest.value - observations[observations.length - 6]!.value : null;
  const d20 =
    observations.length > 20 ? latest.value - observations[observations.length - 21]!.value : null;
  return {
    id,
    label,
    value: latest.value,
    observationDate: latest.date,
    delta5d: d5,
    delta20d: d20,
    direction:
      d5 === null ? "unavailable" : Math.abs(d5) < 1e-9 ? "flat" : d5 > 0 ? "rising" : "falling",
  };
}

/** Fetches FRED's keyless public CSV endpoints; stale cached values survive network failures. */
export async function getFredMacroSnapshot(
  options: { force?: boolean; fetcher?: typeof fetch } = {},
): Promise<FredSnapshot> {
  const now = Date.now();
  if (!options.force && memoryCache && now - memoryCache.fetchedAt < TTL_MS)
    return {
      status: "cached",
      fetchedAt: new Date(memoryCache.fetchedAt).toISOString(),
      series: memoryCache.series,
    };
  const fetcher = options.fetcher ?? fetch;
  try {
    const controller = AbortSignal.timeout(8000);
    const points = await Promise.all(
      SERIES.map(async ({ id, label }) => {
        const response = await fetcher(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
          signal: controller,
        });
        if (!response.ok) throw new Error(`FRED ${id} HTTP ${response.status}`);
        return [id, parseFredCsv(id, label, await response.text())] as const;
      }),
    );
    const series = Object.fromEntries(points) as FredSnapshot["series"];
    if (Object.values(series).every((point) => point.value === null))
      throw new Error("FRED returned no parseable observations");
    memoryCache = { fetchedAt: now, series };
    return { status: "live", fetchedAt: new Date(now).toISOString(), series };
  } catch (error) {
    return offlineSnapshot(error instanceof Error ? error.message : "FRED unavailable");
  }
}

export function resetFredMacroCacheForTests() {
  memoryCache = undefined;
}
