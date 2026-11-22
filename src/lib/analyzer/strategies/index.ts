import type { StrategyCheck } from "../types";
import { ALL_STRATEGY_IMPLEMENTATIONS, SPEC_STRATEGIES } from "./spec-strategies";
import { V2_STRATEGY_IDS, V2_TRADE_STRATEGIES } from "./v2-regime-bots";
import { V3_EXPANSION_STRATEGIES } from "./v3-expansion-bots";

/**
 * Default production strategy set (30 regime-routed trade bots + context diagnostics).
 * Turtle and Opening-Range-Breakout are not included here.
 */
export const STRATEGIES: StrategyCheck[] = SPEC_STRATEGIES;

/**
 * Full implementation registry including legacy trade systems (Turtle, ORB).
 * Prefer STRATEGIES for production; use this only when resolving explicit strategyIds.
 */
export const ALL_STRATEGIES: StrategyCheck[] = ALL_STRATEGY_IMPLEMENTATIONS;

export { V2_STRATEGY_IDS, V2_TRADE_STRATEGIES };
export { V3_EXPANSION_STRATEGIES };
