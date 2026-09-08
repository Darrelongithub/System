import { useSyncExternalStore } from "react";
import { parseAnalysisSnapshot } from "./analysis-store-validation";
import type { AnalysisSnapshot, AnalysisChart } from "./analysis-store-validation";

export type { AnalysisSnapshot, AnalysisChart } from "./analysis-store-validation";
export { parseAnalysisSnapshot } from "./analysis-store-validation";

const STORAGE_KEY = "forexlens.analysis.snapshot";

let snapshot: AnalysisSnapshot | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    snapshot = parseAnalysisSnapshot(raw);
    if (raw && snapshot === null) window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    snapshot = null;
  }
}

export function setAnalysisSnapshot(next: AnalysisSnapshot) {
  hydrated = true;
  snapshot = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // snapshot may exceed the session storage quota; memory copy still works
  }
  listeners.forEach((listener) => listener());
}

export function getAnalysisSnapshot(): AnalysisSnapshot | null {
  hydrate();
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalysisSnapshot(): AnalysisSnapshot | null {
  return useSyncExternalStore(
    subscribe,
    getAnalysisSnapshot,
    () => null as AnalysisSnapshot | null,
  );
}

export const DEFAULT_SUMMARY_FIELDS = `Symbol:
Direction:
Entry Type:
Entry:
Stop Loss:
Take Profit:
Spread-Adjusted RR:
Trade Thesis:
-
-
-
4H Structure:
1H Structure:
30M Structure:
Entry Reason:
-
-
SL Reason:
-
-
TP Reason:
-
-
Historical Follow-Through:
- Continuation/Reversal Ratio:
- Sample Size:
- Evidence Strength:
Fill Logic:
-
-
Counterarguments Considered:
-
-
Structural Risk Check:
- Recent Invalidation:
- Momentum Divergence:
- Opposing Higher-Timeframe Level:
- News/Session Risk:
Invalidation Window:
Resolved Issues From Stress Test:
-
-
-
Data Age:`;
