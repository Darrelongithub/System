import type { StrategyCheck } from "../types";
import { ALL_STRATEGY_IMPLEMENTATIONS, SPEC_STRATEGIES } from "./spec-strategies";
import { FINAL_STRATEGY_IDS, FINAL_TRADE_STRATEGIES } from "./final-survivors";

/**
 * Default production strategy set (9 final trade strategies + context diagnostics).
 * Turtle and Opening-Range-Breakout are not included here.
 */
export const STRATEGIES: StrategyCheck[] = SPEC_STRATEGIES;

/**
 * Full implementation registry including legacy trade systems (Turtle, ORB).
 * Prefer STRATEGIES for production; use this only when resolving explicit strategyIds.
 */
export const ALL_STRATEGIES: StrategyCheck[] = ALL_STRATEGY_IMPLEMENTATIONS;

export { FINAL_STRATEGY_IDS, FINAL_TRADE_STRATEGIES };
