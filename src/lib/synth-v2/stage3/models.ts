import type {
  Stage3HysteresisConfig,
  Stage3TreeNode,
} from "./types";
import { STAGE3_FEATURE_NAMES } from "./types";

export function trainMultinomialLogistic(
  X: readonly number[][], // [N][num_features]
  y: readonly number[],   // [N] class indices 0..num_classes-1
  numClasses: number,
  cParam: number,
  maxIter: number = 300,
): number[][] {
  const N = X.length;
  const numFeatures = X[0]!.length;
  // Weights array: [numClasses][numFeatures + 1] (last column is bias)
  let W: number[][] = Array.from({ length: numClasses }, () => Array(numFeatures + 1).fill(0));

  const lambda = 1.0 / (cParam * N);
  let lr = 0.5;

  // Compute softmax probabilities
  const computeProbs = (weights: number[][], xRow: number[]): number[] => {
    const scores = weights.map((w) => {
      let score = w[numFeatures]!; // bias
      for (let j = 0; j < numFeatures; j++) score += w[j]! * xRow[j]!;
      return score;
    });
    const maxScore = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - maxScore));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sumExp);
  };

  // Cross entropy loss + L2
  const computeLoss = (weights: number[][]): number => {
    let ce = 0;
    for (let i = 0; i < N; i++) {
      const p = computeProbs(weights, X[i]!);
      ce -= Math.log(Math.max(1e-15, p[y[i]!]!));
    }
    ce /= N;
    let l2 = 0;
    for (let c = 0; c < numClasses; c++) {
      for (let j = 0; j < numFeatures; j++) {
        l2 += weights[c]![j]! * weights[c]![j]!;
      }
    }
    return ce + 0.5 * lambda * l2;
  };

  let prevLoss = computeLoss(W);

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute gradient: [numClasses][numFeatures + 1]
    const grad: number[][] = Array.from({ length: numClasses }, () => Array(numFeatures + 1).fill(0));

    for (let i = 0; i < N; i++) {
      const p = computeProbs(W, X[i]!);
      const target = y[i]!;
      for (let c = 0; c < numClasses; c++) {
        const err = p[c]! - (c === target ? 1 : 0);
        for (let j = 0; j < numFeatures; j++) {
          grad[c]![j] += err * X[i]![j]!;
        }
        grad[c]![numFeatures] += err; // bias grad
      }
    }

    // Average gradient and add L2 penalty
    for (let c = 0; c < numClasses; c++) {
      for (let j = 0; j < numFeatures; j++) {
        grad[c]![j] = grad[c]![j]! / N + lambda * W[c]![j]!;
      }
      grad[c]![numFeatures] /= N; // unregularized bias
    }

    // Backtracking line search
    let step = lr;
    let bestW: number[][] | null = null;
    let newLoss = Infinity;

    for (let lineStep = 0; lineStep < 10; lineStep++) {
      const testW = W.map((row, c) => row.map((w, j) => w - step * grad[c]![j]!));
      const testLoss = computeLoss(testW);
      if (testLoss < prevLoss) {
        bestW = testW;
        newLoss = testLoss;
        step *= 1.1; // accelerate
        break;
      }
      step *= 0.5; // shrink
    }

    if (bestW) {
      W = bestW;
      lr = Math.min(2.0, step);
      if (Math.abs(prevLoss - newLoss) < 1e-7) break;
      prevLoss = newLoss;
    } else {
      lr *= 0.5;
      if (lr < 1e-6) break;
    }
  }

  return W;
}

export function predictMultinomialLogistic(
  weights: readonly (readonly number[])[],
  xStandardized: readonly number[],
): number[] {
  const numFeatures = xStandardized.length;
  const scores = weights.map((w) => {
    let score = w[numFeatures]!; // bias
    for (let j = 0; j < numFeatures; j++) score += w[j]! * xStandardized[j]!;
    return score;
  });
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - maxScore));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExp);
}

// Decision Tree Classifier (Gini Impurity, maxDepth <= 3)
export function trainDecisionTree(
  X: readonly number[][],
  y: readonly number[],
  numClasses: number,
  maxDepth: number,
): Stage3TreeNode {
  const N = X.length;
  const numFeatures = X[0]!.length;

  const gini = (indices: readonly number[]): number => {
    if (indices.length === 0) return 0;
    const counts = Array(numClasses).fill(0);
    for (const idx of indices) counts[y[idx]!]!++;
    let sumSq = 0;
    for (const cnt of counts) {
      const p = cnt / indices.length;
      sumSq += p * p;
    }
    return 1 - sumSq;
  };

  const getProbabilities = (indices: readonly number[]): number[] => {
    const counts = Array(numClasses).fill(1e-3); // Laplace smoothing
    for (const idx of indices) counts[y[idx]!]!++;
    const total = counts.reduce((a, b) => a + b, 0);
    return counts.map((c) => c / total);
  };

  const buildNode = (indices: readonly number[], depth: number): Stage3TreeNode => {
    if (depth >= maxDepth || indices.length <= 10 || gini(indices) < 1e-5) {
      return {
        isLeaf: true,
        probabilities: getProbabilities(indices),
      };
    }

    const currentGini = gini(indices);
    let bestGain = 0;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestLeft: number[] = [];
    let bestRight: number[] = [];

    for (let f = 0; f < numFeatures; f++) {
      // Find candidate thresholds
      const vals = Array.from(new Set(indices.map((idx) => X[idx]![f]!))).sort((a, b) => a - b);
      if (vals.length <= 1) continue;

      // Sample percentiles if too many unique values
      const step = Math.max(1, Math.floor(vals.length / 20));
      for (let v = 0; v < vals.length - 1; v += step) {
        const threshold = (vals[v]! + vals[v + 1]!) / 2;
        const left: number[] = [];
        const right: number[] = [];
        for (const idx of indices) {
          if (X[idx]![f]! <= threshold) left.push(idx);
          else right.push(idx);
        }
        if (left.length === 0 || right.length === 0) continue;

        const leftGini = gini(left);
        const rightGini = gini(right);
        const gain = currentGini - (left.length / indices.length) * leftGini - (right.length / indices.length) * rightGini;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
          bestLeft = left;
          bestRight = right;
        }
      }
    }

    if (bestGain < 1e-4 || bestFeature === -1) {
      return {
        isLeaf: true,
        probabilities: getProbabilities(indices),
      };
    }

    return {
      isLeaf: false,
      featureIndex: bestFeature,
      featureName: STAGE3_FEATURE_NAMES[bestFeature],
      threshold: bestThreshold,
      left: buildNode(bestLeft, depth + 1),
      right: buildNode(bestRight, depth + 1),
    };
  };

  const allIndices = Array.from({ length: N }, (_, i) => i);
  return buildNode(allIndices, 0);
}

export function predictDecisionTree(
  node: Stage3TreeNode,
  x: readonly number[],
): number[] {
  let curr = node;
  while (!curr.isLeaf) {
    const val = x[curr.featureIndex!]!;
    if (val <= curr.threshold!) {
      curr = curr.left!;
    } else {
      curr = curr.right!;
    }
  }
  return curr.probabilities!;
}

// Hysteresis State Machine
export class Stage3HysteresisTracker {
  private currentState: number | null = null;
  private candidateState: number | null = null;
  private candidateStreak: number = 0;
  private readonly k: number;
  private readonly d: number;

  constructor(config: Stage3HysteresisConfig) {
    this.k = config.k;
    this.d = config.d;
  }

  public update(probs: readonly number[]): number {
    const rawBest = probs.indexOf(Math.max(...probs));

    // First weekday initialization
    if (this.currentState === null) {
      this.currentState = rawBest;
      this.candidateState = null;
      this.candidateStreak = 0;
      return this.currentState;
    }

    // If K=1 and d=0, immediate switch
    if (this.k <= 1 && this.d <= 0) {
      this.currentState = rawBest;
      return this.currentState;
    }

    const currentProb = probs[this.currentState]!;
    let bestAlternative = -1;
    let bestAltProb = -Infinity;

    for (let c = 0; c < probs.length; c++) {
      if (c !== this.currentState && probs[c]! > bestAltProb) {
        bestAltProb = probs[c]!;
        bestAlternative = c;
      }
    }

    // Check if best alternative beats current state by margin d
    if (bestAltProb >= currentProb + this.d) {
      if (this.candidateState === bestAlternative) {
        this.candidateStreak++;
      } else {
        this.candidateState = bestAlternative;
        this.candidateStreak = 1;
      }

      if (this.candidateStreak >= this.k) {
        this.currentState = this.candidateState;
        this.candidateState = null;
        this.candidateStreak = 0;
      }
    } else {
      // Condition not met, reset candidate streak
      this.candidateState = null;
      this.candidateStreak = 0;
    }

    return this.currentState;
  }

  public getState(): number | null {
    return this.currentState;
  }
}
