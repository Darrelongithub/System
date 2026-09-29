/**
 * React State Store & Background Runner Hook for MT5 Live Automation
 */

import { useSyncExternalStore } from "react";
import { mt5Engine } from "./engine";
import { newsManager } from "./news-filter";
import {
  DEFAULT_MT5_CONFIG,
  DEFAULT_MT5_CREDENTIALS,
  type MT5AccountCredentials,
  type MT5AutoTradeConfig,
  type MT5State,
} from "./types";
import type { ResultRow } from "@/lib/analyzer/types";
import { toast } from "sonner";

const STORAGE_KEY_CREDS = "forexlens.mt5.credentials";
const STORAGE_KEY_CONFIG = "forexlens.mt5.config";

let state: MT5State = {
  account: mt5Engine.getAccountInfo(),
  credentials: { ...DEFAULT_MT5_CREDENTIALS },
  config: { ...DEFAULT_MT5_CONFIG },
  positions: mt5Engine.getPositions(),
  closedPositions: mt5Engine.getClosedPositions(),
  logs: mt5Engine.getLogs(),
  lastSignalCheck: null,
  isPolling: false,
  pendingCommands: [],
  upcomingNews: newsManager.getUpcomingHighImpactEvents(48),
};

const listeners = new Set<() => void>();

function notify() {
  state = {
    account: mt5Engine.getAccountInfo(),
    credentials: mt5Engine.getCredentials(),
    config: mt5Engine.getConfig(),
    positions: mt5Engine.getPositions(),
    closedPositions: mt5Engine.getClosedPositions(),
    logs: mt5Engine.getLogs(),
    lastSignalCheck: state.lastSignalCheck,
    isPolling: state.isPolling,
    pendingCommands: mt5Engine.getPendingCommands(),
    upcomingNews: newsManager.getUpcomingHighImpactEvents(48),
  };
  listeners.forEach((listener) => listener());
}

// Hydrate from localStorage on client
if (typeof window !== "undefined") {
  try {
    const savedCreds = window.localStorage.getItem(STORAGE_KEY_CREDS);
    if (savedCreds) {
      const parsed = JSON.parse(savedCreds);
      mt5Engine.setCredentials(parsed);
      state.credentials = mt5Engine.getCredentials();
    }
    const savedConfig = window.localStorage.getItem(STORAGE_KEY_CONFIG);
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      mt5Engine.setConfig(parsed);
      state.config = mt5Engine.getConfig();
    }
  } catch (e) {
    console.warn("Storage hydration skipped:", e);
  }
}

/**
 * Web Audio API synthesizer for instant trading feedback tones
 */
export function playSoundAlert(type: "signal" | "fill" | "close" | "error") {
  if (typeof window === "undefined" || !state.config.soundAlerts) return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "signal") {
      // Pleasant rising chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "fill") {
      // Confirmed double beep
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "error") {
      // Low warning tone
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    // Audio context may be restricted by browser policy
  }
}

export function saveMT5Credentials(creds: Partial<MT5AccountCredentials>) {
  mt5Engine.setCredentials(creds);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_CREDS, JSON.stringify(mt5Engine.getCredentials()));
    } catch (e) {
      console.warn("Storage save skipped:", e);
    }
  }
  notify();
  toast.success("MT5 Account credentials updated");
}

export function saveMT5Config(config: Partial<MT5AutoTradeConfig>) {
  mt5Engine.setConfig(config);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(mt5Engine.getConfig()));
    } catch (e) {
      console.warn("Config save skipped:", e);
    }
  }
  notify();
  toast.success("Automation rules updated");
}

export function toggleAutoTrading(enabled: boolean) {
  mt5Engine.setConfig({ enabled });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(mt5Engine.getConfig()));
    } catch (e) {
      console.warn("Config save skipped:", e);
    }
  }
  notify();
  if (enabled) {
    playSoundAlert("signal");
    toast.success("🟢 MT5 Auto-Trading is now ACTIVE!", {
      description:
        "Running strategies in background. Auto entry, TP & SL will execute on new signals.",
    });
  } else {
    toast.info("🔴 MT5 Auto-Trading PAUSED");
  }
}

export function executeManualSignal(signal: ResultRow, symbol: string) {
  const result = mt5Engine.handleLiveStrategySignal({ ...signal, result: "PASS" }, symbol);
  notify();
  if (result?.ok) {
    playSoundAlert("fill");
    toast.success(`Executed ${signal.strategy} on MT5! Ticket #${result.ticket}`);
  } else {
    toast.error("Failed to execute signal: " + (result?.error || "Order rejected"));
  }
  return result;
}

export function closePosition(ticket: number) {
  const ok = mt5Engine.closePosition(ticket);
  notify();
  if (ok) {
    playSoundAlert("close");
    toast.success(`Closed MT5 Position #${ticket}`);
  } else {
    toast.error(`Position #${ticket} not found`);
  }
}

export function feedLiveSignalsToMT5(signals: ResultRow[], symbol: string) {
  state.lastSignalCheck = new Date().toLocaleTimeString();
  let executedCount = 0;

  for (const signal of signals) {
    if (signal.result === "PASS") {
      const res = mt5Engine.handleLiveStrategySignal(signal, symbol);
      if (res?.ok) {
        executedCount++;
        playSoundAlert("fill");
      }
    }
  }

  notify();
  return executedCount;
}

export function updateSimulatedPrice(symbol: string, price: number) {
  mt5Engine.updateMarketPrice(symbol, price);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MT5State {
  return state;
}

export function useMT5State(): MT5State {
  return useSyncExternalStore(subscribe, getSnapshot, () => state);
}
