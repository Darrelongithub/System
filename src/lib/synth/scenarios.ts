import type { ScenarioName, SynthDials, TrendinessDial } from "./types";

export interface SingleScenarioPreset {
  kind: "single";
  name: ScenarioName;
  dials: SynthDials;
}

export interface SequenceScenarioPreset {
  kind: "sequence";
  name: ScenarioName;
  segments: Array<{ name: string; dials: SynthDials; short?: boolean }>;
}

export type ScenarioPreset = SingleScenarioPreset | SequenceScenarioPreset;

function single(
  name: ScenarioName,
  volatility: SynthDials["volatility"],
  drift: SynthDials["drift"],
  trendiness: TrendinessDial,
  news: SynthDials["news"] = "normal",
  gaps: SynthDials["gaps"] = "normal",
  shockFollowThrough: SynthDials["shockFollowThrough"] = "mixed",
): SingleScenarioPreset {
  return {
    kind: "single",
    name,
    dials: {
      volatility,
      volatilityShape: "stable",
      drift,
      trendiness,
      news,
      gaps,
      shockFollowThrough,
    },
  };
}

function sequence(
  name: ScenarioName,
  segments: SequenceScenarioPreset["segments"],
): SequenceScenarioPreset {
  return { kind: "sequence", name, segments };
}

const quietRange = single("quiet_range", "low", "flat", "mean-reverting");
const normalChop = single("normal_chop", "normal", "flat", "random");
const slowGrindUp = single("slow_grind_up", "low", "up", "trending");
const strongUptrend = single("strong_uptrend", "normal", "up", "trending");
const slowGrindDown = single("slow_grind_down", "low", "down", "trending");
const strongDowntrend = single("strong_downtrend", "normal", "down", "trending");
const whipsaw = single("whipsaw", "high", "flat", "mean-reverting");
const meltUp = single("melt_up", "high", "up", "trending", "normal", "normal", "continue");
const crash = single("crash", "high", "down", "trending", "heavy", "heavy", "continue");
const newsStorm = single("news_storm", "normal", "flat", "random", "heavy");
const gapShocks = single("gap_shocks", "normal", "flat", "random", "normal", "heavy");
const fakeOuts = single(
  "fake_outs",
  "normal",
  "flat",
  "mean-reverting",
  "normal",
  "normal",
  "revert",
);
const deadZone = single("dead_zone", "p5", "flat", "random", "light");

export const SCENARIOS: Record<ScenarioName, ScenarioPreset> = {
  quiet_range: quietRange,
  normal_chop: normalChop,
  slow_grind_up: slowGrindUp,
  strong_uptrend: strongUptrend,
  slow_grind_down: slowGrindDown,
  strong_downtrend: strongDowntrend,
  whipsaw,
  melt_up: meltUp,
  crash,
  news_storm: newsStorm,
  gap_shocks: gapShocks,
  fake_outs: fakeOuts,
  dead_zone: deadZone,
  calm_storm_calm: sequence("calm_storm_calm", [
    { name: "quiet_range", dials: quietRange.dials },
    { name: "whipsaw", dials: whipsaw.dials },
    { name: "quiet_range", dials: quietRange.dials },
  ]),
  top_and_reversal: sequence("top_and_reversal", [
    { name: "strong_uptrend", dials: strongUptrend.dials },
    { name: "whipsaw", dials: whipsaw.dials, short: true },
    { name: "strong_downtrend", dials: strongDowntrend.dials },
  ]),
  range_breakout: sequence("range_breakout", [
    { name: "normal_chop", dials: normalChop.dials },
    { name: "strong_uptrend", dials: strongUptrend.dials },
    { name: "normal_chop", dials: normalChop.dials },
  ]),
  bull_with_crash: sequence("bull_with_crash", [
    { name: "strong_uptrend", dials: strongUptrend.dials },
    { name: "crash", dials: crash.dials },
    { name: "strong_uptrend", dials: strongUptrend.dials },
  ]),
};

export const SINGLE_CONDITION_SCENARIOS = [
  "quiet_range",
  "normal_chop",
  "slow_grind_up",
  "strong_uptrend",
  "slow_grind_down",
  "strong_downtrend",
  "whipsaw",
  "melt_up",
  "crash",
  "news_storm",
  "gap_shocks",
  "fake_outs",
  "dead_zone",
] as const satisfies readonly ScenarioName[];

export const SEQUENCE_SCENARIOS = [
  "calm_storm_calm",
  "top_and_reversal",
  "range_breakout",
  "bull_with_crash",
] as const satisfies readonly ScenarioName[];
