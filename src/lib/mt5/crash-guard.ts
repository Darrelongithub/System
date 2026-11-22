/** Drawdown is a fraction (0.03 = 3%), risk percentages elsewhere are percentage points. */
export function recoveryGainNeeded(drawdownFrac: number): number {
  if (!Number.isFinite(drawdownFrac) || drawdownFrac < 0 || drawdownFrac > 1)
    throw new RangeError("drawdown must be between 0 and 1");
  return drawdownFrac === 1 ? Infinity : drawdownFrac / (1 - drawdownFrac);
}
export function halfKellyFraction(winRate: number, avgWinLossRatio: number): number {
  if (
    !Number.isFinite(winRate) ||
    winRate < 0 ||
    winRate > 1 ||
    !Number.isFinite(avgWinLossRatio) ||
    avgWinLossRatio <= 0
  )
    throw new RangeError("invalid Kelly inputs");
  return 0.5 * Math.max(0, winRate - (1 - winRate) / avgWinLossRatio);
}
export const DEFAULT_DRAWDOWN_THRESHOLDS = [3, 5, 8, 10] as const;
export const DEFAULT_DRAWDOWN_MULTIPLIERS = [1, 0.75, 0.5, 0.25, 0] as const;
export const DEFAULT_STACK_DECAY = [1, 0.75, 0.5] as const;

export function drawdownBrake(
  peak: number,
  equity: number,
  maxTotalPct: number,
  thresholds: readonly number[] = DEFAULT_DRAWDOWN_THRESHOLDS,
  multipliers: readonly number[] = DEFAULT_DRAWDOWN_MULTIPLIERS,
) {
  if (
    !Number.isFinite(peak) ||
    peak <= 0 ||
    !Number.isFinite(equity) ||
    equity < 0 ||
    !Number.isFinite(maxTotalPct) ||
    maxTotalPct <= 0 ||
    thresholds.length !== 4 ||
    multipliers.length !== 5 ||
    thresholds.some(
      (x, i) => !Number.isFinite(x) || x <= 0 || (i > 0 && x <= thresholds[i - 1]!),
    ) ||
    multipliers.some(
      (x, i) => !Number.isFinite(x) || x < 0 || x > 1 || (i > 0 && x > multipliers[i - 1]!),
    ) ||
    multipliers[4] !== 0
  )
    throw new RangeError("invalid drawdown brake inputs");
  const ddPct = Math.max(0, ((peak - equity) / peak) * 100);
  let slot = thresholds.filter((t) => ddPct + 1e-10 >= t).length;
  if (ddPct + 1e-10 >= maxTotalPct) slot = 4;
  return {
    drawdownPct: ddPct,
    multiplier: multipliers[slot]!,
    recoveryFraction: recoveryGainNeeded(Math.min(1, ddPct / 100)),
  };
}
export function stackMultiplier(
  count: number,
  multipliers: readonly number[] = DEFAULT_STACK_DECAY,
): number {
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    multipliers.length !== 3 ||
    multipliers.some(
      (v, i) => !Number.isFinite(v) || v < 0 || v > 1 || (i > 0 && v > multipliers[i - 1]!),
    )
  )
    throw new RangeError("invalid stack configuration");
  return multipliers[count] ?? 0;
}
/** Exact empirical tail mean using fractional weight at the tail boundary. Inputs are loss values. */
export function empiricalExpectedShortfall(
  losses: readonly number[],
  confidence = 0.975,
): number | null {
  if (
    !Number.isFinite(confidence) ||
    confidence <= 0 ||
    confidence >= 1 ||
    losses.some((x) => !Number.isFinite(x))
  )
    throw new RangeError("invalid ES inputs");
  if (!losses.length) return null;
  const sorted = [...losses].sort((a, b) => b - a);
  const count = losses.length * (1 - confidence),
    whole = Math.floor(count),
    part = count - whole;
  let total = 0;
  for (let i = 0; i < whole; i++) total += sorted[i]!;
  if (part > 1e-12) total += part * sorted[whole]!;
  return total / count;
}
/** Gaussian 97.5% ES for loss distribution, in the same units as mean and sigma. */
export function parametricExpectedShortfall975(meanLoss: number, sigma: number): number {
  if (!Number.isFinite(meanLoss) || !Number.isFinite(sigma) || sigma < 0)
    throw new RangeError("invalid normal ES inputs");
  return meanLoss + sigma * 2.337802792201;
}
export function tradeRiskMetrics(rValues: readonly number[]) {
  if (rValues.some((x) => !Number.isFinite(x))) throw new RangeError("invalid R sample");
  const wins = rValues.filter((x) => x > 0),
    losses = rValues.filter((x) => x < 0);
  // A one-sided sample cannot estimate the payoff ratio: conservatively cap at zero.
  const kelly =
    rValues.length >= 30
      ? wins.length && losses.length
        ? halfKellyFraction(
            wins.length / rValues.length,
            wins.reduce((a, b) => a + b, 0) /
              wins.length /
              (-losses.reduce((a, b) => a + b, 0) / losses.length),
          )
        : 0
      : null;
  const lossValues = rValues.map((x) => -x);
  const mean = lossValues.length ? lossValues.reduce((a, b) => a + b, 0) / lossValues.length : 0;
  const sigma = lossValues.length
    ? Math.sqrt(lossValues.reduce((sum, x) => sum + (x - mean) ** 2, 0) / lossValues.length)
    : 0;
  return {
    count: rValues.length,
    halfKellyPct: kelly === null ? null : kelly * 100,
    empiricalCvarR: empiricalExpectedShortfall(lossValues),
    parametricCvarR: lossValues.length ? parametricExpectedShortfall975(mean, sigma) : null,
  };
}
