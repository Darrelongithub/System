/**
 * Shared Crabel ORB trade-management contract.
 *
 * Entry discovery belongs to analyzer/strategies/spec-strategies.ts.
 * Forward trade-path management belongs to consumers of this contract.
 * Keeping the one-hour breakeven rule here prevents analyzer/status and the
 * backtest/journal path from implementing different ORB stop behavior.
 */
export const CRABEL_ORB_WINDOW_MINUTES = 30;
export const CRABEL_ORB_BREAKEVEN_MINUTES = 60;

export function crabelOrbBreakevenActive(elapsedMinutes: number): boolean {
  return elapsedMinutes >= CRABEL_ORB_BREAKEVEN_MINUTES;
}

export function crabelOrbEffectiveStop(
  entry: number,
  initialProtectiveStop: number,
  elapsedMinutes: number,
): number {
  return crabelOrbBreakevenActive(elapsedMinutes) ? entry : initialProtectiveStop;
}
