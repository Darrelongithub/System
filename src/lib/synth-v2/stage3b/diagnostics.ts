import type { Stage2BRegimeId } from "../stage2b-types";
import type { Stage3TreeNode } from "../stage3/types";
import { trainDecisionTree, predictDecisionTree } from "../stage3/models";
import type {
  DialLevel3,
  DriftLevel3,
  TrendLevel3,
} from "./types";

// Regime to dial mappings from SPEC-2b
export const REGIME_TO_VOLATILITY: Record<Stage2BRegimeId, DialLevel3> = {
  quiet_range: "LOW",
  normal_chop: "NORMAL",
  trend_up: "NORMAL",
  trend_down: "NORMAL",
  whipsaw: "HIGH",
  expansion_up: "HIGH",
  expansion_down: "HIGH",
};

export const REGIME_TO_DRIFT: Record<Stage2BRegimeId, DriftLevel3> = {
  quiet_range: "FLAT",
  normal_chop: "FLAT",
  trend_up: "UP",
  trend_down: "DOWN",
  whipsaw: "FLAT",
  expansion_up: "UP",
  expansion_down: "DOWN",
};

export const REGIME_TO_TRENDINESS: Record<Stage2BRegimeId, TrendLevel3> = {
  quiet_range: "MEAN_REVERTING",
  normal_chop: "RANDOM",
  trend_up: "TRENDING",
  trend_down: "TRENDING",
  whipsaw: "MEAN_REVERTING",
  expansion_up: "TRENDING",
  expansion_down: "TRENDING",
};

// Bagged Tree Ensemble
export class BaggedTreeEnsemble {
  private readonly trees: Stage3TreeNode[];
  private readonly numClasses: number;

  constructor(trees: Stage3TreeNode[], numClasses: number) {
    this.trees = trees;
    this.numClasses = numClasses;
  }

  public predictProbs(x: readonly number[]): number[] {
    const pooledProbs = Array(this.numClasses).fill(0);
    for (const tree of this.trees) {
      const p = predictDecisionTree(tree, x);
      for (let c = 0; c < this.numClasses; c++) {
        pooledProbs[c] += p[c]!;
      }
    }
    const n = this.trees.length;
    return pooledProbs.map((sum) => sum / n);
  }

  public predictClass(x: readonly number[]): number {
    const probs = this.predictProbs(x);
    return probs.indexOf(Math.max(...probs));
  }
}

export function trainBaggedTreeEnsemble(
  X: readonly number[][],
  y: readonly number[],
  numClasses: number,
  numTrees: number = 100,
  maxDepth: number = 6,
  seed: number = 42,
): BaggedTreeEnsemble {
  const N = X.length;
  const trees: Stage3TreeNode[] = [];

  // Simple deterministic PRNG for bootstrap sampling
  let s = seed;
  const nextRandom = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  for (let b = 0; b < numTrees; b++) {
    const bootX: number[][] = [];
    const bootY: number[] = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(nextRandom() * N);
      bootX.push(X[idx]!);
      bootY.push(y[idx]!);
    }
    const tree = trainDecisionTree(bootX, bootY, numClasses, maxDepth);
    trees.push(tree);
  }

  return new BaggedTreeEnsemble(trees, numClasses);
}

export function normalCdf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

export function orientedAuc(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;
  const joined = [
    ...a.map((value) => ({ value, group: 1 })),
    ...b.map((value) => ({ value, group: 0 })),
  ].sort((left, right) => left.value - right.value);

  let rankSumA = 0;
  for (let index = 0; index < joined.length;) {
    let end = index + 1;
    while (end < joined.length && joined[end]!.value === joined[index]!.value) end++;
    const averageRank = ((index + 1) + end) / 2;
    for (let current = index; current < end; current++) {
      if (joined[current]!.group === 1) rankSumA += averageRank;
    }
    index = end;
  }
  const raw = (rankSumA - (a.length * (a.length + 1)) / 2) / (a.length * b.length);
  return Math.max(raw, 1 - raw);
}
