export const FRICTION_PRESETS = {
  raw: { label: "Raw", cost: 0 },
  tight: { label: "Tight", cost: 0.2 },
  realistic: { label: "Realistic Live", cost: 0.5 },
  hostile: { label: "Hostile", cost: 0.8 },
} as const;
export type FrictionPreset = keyof typeof FRICTION_PRESETS;

/** Convert per-ounce round-turn cost into R for one resolved trade. */
export function frictionInR(
  costPerOz: number,
  entry: number | undefined,
  stop: number | undefined,
): number | null {
  if (
    entry === undefined ||
    stop === undefined ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stop)
  )
    return null;
  const riskPerOz = Math.abs(entry - stop);
  return riskPerOz > 0 ? costPerOz / riskPerOz : null;
}

export interface ResolvedRRow {
  setupStatus?: string;
  outcome?: string;
  rMultiple?: number;
  entry?: number;
  sl?: number;
}

export function summarizeFrictionAdjustedR(rows: readonly ResolvedRRow[], costPerOz: number) {
  let count = 0;
  let grossSum = 0;
  let netSum = 0;
  for (const row of rows) {
    if (row.setupStatus !== "RESOLVED" || row.outcome === "OPEN" || row.outcome === "NO_FILL")
      continue;
    if (typeof row.rMultiple !== "number" || !Number.isFinite(row.rMultiple)) continue;
    const costR = frictionInR(costPerOz, row.entry, row.sl);
    if (costR === null) continue;
    grossSum += row.rMultiple;
    netSum += row.rMultiple - costR;
    count++;
  }
  return {
    count,
    grossSum,
    netSum,
    grossAvg: count ? grossSum / count : null,
    netAvg: count ? netSum / count : null,
  };
}
