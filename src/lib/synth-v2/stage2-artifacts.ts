import { gunzipSync } from "node:zlib";
import { serializeEngineCsv } from "./csv";
import { formatEatDatetime, parseEatDatetime } from "./time";
import { REGIME_IDS } from "./regimes";
import type { Stage2Path, Stage2RegimeId } from "./regimes";
import type { Candle, DialValues } from "./types";

const DIAL_NAMES = ["volatilityLevel", "drift", "trendiness", "gapSize", "newsSpikeIntensity"] as const;
const DIAL_SCALE = 1_000_000_000;
const GAP_KIND_TO_CODE = { none: 0, session: 1, weekend: 2 } as const;
const GAP_CODE_TO_KIND = ["none", "session", "weekend"] as const;
const FLAG_NAMES = ["volatilityLevel", "drift", "trendiness", "gapSize", "newsSpikeIntensity", "trendinessVarianceRatio"] as const;

export interface DecodedStage2Label {
  datetime: string;
  regimeId: Stage2RegimeId;
  segmentIndex: number;
  inBlend: boolean;
  dials: DialValues;
  overlayFlags: string[];
  flags: string[];
  gapKind: "none" | "session" | "weekend";
  newsSpike: boolean;
}
export interface DecodedStage2Artifact {
  set: string;
  seed: number;
  startDate: string;
  weekdays: number;
  segments: Stage2Path["segments"];
  statusTag: string | null;
  candles: Candle[];
  labels: DecodedStage2Label[];
  csv: string;
}
interface EncodedArtifact {
  schemaVersion: 1;
  codec: "synth-v2-stage2-delta-json-v1";
  dialScale: number;
  set: string;
  seed: number;
  startDate: string;
  weekdays: number;
  statusTag: string | null;
  segments: Stage2Path["segments"];
  firstEpochMs: number;
  timestampDeltaMinutes: number[];
  ohlcDeltaCents: number[];
  labelBits: number[];
  dialDeltaFixed: number[];
}

function extrapolationMask(flags: readonly string[]): number {
  let mask = 0;
  for (let index = 0; index < FLAG_NAMES.length; index++) {
    if (flags.includes(`EXTRAPOLATION:${FLAG_NAMES[index]}`)) mask |= 1 << index;
  }
  return mask;
}

function encodePath(path: Stage2Path, statusTag: string | null): EncodedArtifact {
  const candles = path.synthetic.candles;
  const labels = path.synthetic.labels;
  if (candles.length !== labels.length || candles.length !== path.barDials.length || candles.length !== path.scenarioLabels.length) {
    throw new Error("cannot encode Stage 2 path with misaligned per-bar arrays");
  }
  const timestamps: number[] = [];
  const prices: number[] = [];
  const labelBits: number[] = [];
  const dialDeltaFixed: number[] = [];
  let priorEpoch = 0;
  let priorCloseCents = 0;
  const priorDials = [0, 0, 0, 0, 0];
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    const label = labels[index]!;
    const scenario = path.scenarioLabels[index]!;
    const epoch = parseEatDatetime(candle.datetime);
    if (index === 0) {
      timestamps.push(0);
    } else {
      const delta = (epoch - priorEpoch) / 60_000;
      if (!Number.isInteger(delta) || delta <= 0) throw new Error("Stage 2 timestamp delta is not a positive whole minute");
      timestamps.push(delta);
    }
    priorEpoch = epoch;
    const open = Math.round(candle.open * 100);
    const high = Math.round(candle.high * 100);
    const low = Math.round(candle.low * 100);
    const close = Math.round(candle.close * 100);
    prices.push(open - priorCloseCents, high - open, low - open, close - open);
    priorCloseCents = close;
    const regimeIndex = REGIME_IDS.indexOf(scenario.regimeId as Stage2RegimeId);
    if (regimeIndex < 0) throw new Error(`unknown Stage 2 regime label ${scenario.regimeId}`);
    const overlayMask = (scenario.overlays.includes("news_storm") ? 1 : 0) | (scenario.overlays.includes("gap_shocks") ? 2 : 0);
    const gapCode = GAP_KIND_TO_CODE[label.gapKind];
    const flagsMask = extrapolationMask(label.flags);
    const bits = regimeIndex | (scenario.segmentIndex << 3) | (Number(scenario.inBlend) << 6) |
      (overlayMask << 7) | (gapCode << 9) | (Number(label.newsSpike) << 11) | (flagsMask << 12);
    labelBits.push(bits);
    for (let dialIndex = 0; dialIndex < DIAL_NAMES.length; dialIndex++) {
      const fixed = Math.round(path.barDials[index]![DIAL_NAMES[dialIndex]!] * DIAL_SCALE);
      dialDeltaFixed.push(fixed - priorDials[dialIndex]!);
      priorDials[dialIndex] = fixed;
    }
  }
  return {
    schemaVersion: 1,
    codec: "synth-v2-stage2-delta-json-v1",
    dialScale: DIAL_SCALE,
    set: path.set,
    seed: path.seed,
    startDate: path.startDate,
    weekdays: path.weekdays,
    statusTag,
    segments: path.segments,
    firstEpochMs: parseEatDatetime(candles[0]!.datetime),
    timestampDeltaMinutes: timestamps,
    ohlcDeltaCents: prices,
    labelBits,
    dialDeltaFixed,
  };
}

export function encodeStage2Artifact(path: Stage2Path, statusTag: string | null = null): string {
  return JSON.stringify(encodePath(path, statusTag));
}

function decodeInput(input: string | Uint8Array): EncodedArtifact {
  const text = typeof input === "string" ? input : gunzipSync(input).toString("utf8");
  const record = JSON.parse(text) as EncodedArtifact;
  if (record.schemaVersion !== 1 || record.codec !== "synth-v2-stage2-delta-json-v1" || record.dialScale !== DIAL_SCALE) {
    throw new Error("unsupported Stage 2 artifact schema or codec");
  }
  const count = record.timestampDeltaMinutes.length;
  if (record.ohlcDeltaCents.length !== count * 4 || record.labelBits.length !== count || record.dialDeltaFixed.length !== count * 5) {
    throw new Error("Stage 2 artifact arrays have inconsistent lengths");
  }
  return record;
}

export function decodeStage2Artifact(input: string | Uint8Array): DecodedStage2Artifact {
  const record = decodeInput(input);
  const candles: Candle[] = [];
  const labels: DecodedStage2Label[] = [];
  let epoch = record.firstEpochMs;
  let priorCloseCents = 0;
  const priorDials = [0, 0, 0, 0, 0];
  for (let index = 0; index < record.timestampDeltaMinutes.length; index++) {
    if (index > 0) epoch += record.timestampDeltaMinutes[index]! * 60_000;
    const datetime = formatEatDatetime(epoch);
    const priceOffset = index * 4;
    const openCents = priorCloseCents + record.ohlcDeltaCents[priceOffset]!;
    const highCents = openCents + record.ohlcDeltaCents[priceOffset + 1]!;
    const lowCents = openCents + record.ohlcDeltaCents[priceOffset + 2]!;
    const closeCents = openCents + record.ohlcDeltaCents[priceOffset + 3]!;
    priorCloseCents = closeCents;
    candles.push({ datetime, open: openCents / 100, high: highCents / 100, low: lowCents / 100, close: closeCents / 100 });

    const bits = record.labelBits[index]!;
    const regimeIndex = bits & 7;
    const segmentIndex = (bits >>> 3) & 7;
    const inBlend = ((bits >>> 6) & 1) === 1;
    const overlayMask = (bits >>> 7) & 3;
    const gapCode = (bits >>> 9) & 3;
    const newsSpike = ((bits >>> 11) & 1) === 1;
    const flagsMask = bits >>> 12;
    if (!REGIME_IDS[regimeIndex] || !GAP_CODE_TO_KIND[gapCode]) throw new Error("invalid Stage 2 label bit field");
    const dials = {} as DialValues;
    for (let dialIndex = 0; dialIndex < DIAL_NAMES.length; dialIndex++) {
      priorDials[dialIndex] += record.dialDeltaFixed[index * 5 + dialIndex]!;
      dials[DIAL_NAMES[dialIndex]!] = priorDials[dialIndex]! / DIAL_SCALE;
    }
    const flags = flagsMask === 0
      ? []
      : ["EXTRAPOLATION", ...FLAG_NAMES.filter((_, flagIndex) => (flagsMask & (1 << flagIndex)) !== 0).map((name) => `EXTRAPOLATION:${name}`)];
    const overlayFlags = [
      ...(((overlayMask & 1) !== 0) ? ["news_storm"] : []),
      ...(((overlayMask & 2) !== 0) ? ["gap_shocks"] : []),
    ];
    labels.push({
      datetime,
      regimeId: REGIME_IDS[regimeIndex]!,
      segmentIndex,
      inBlend,
      dials,
      overlayFlags,
      flags,
      gapKind: GAP_CODE_TO_KIND[gapCode]!,
      newsSpike,
    });
  }
  const csvBase = serializeEngineCsv(candles);
  const csv = record.statusTag
    ? csvBase.replace(/^# metadata: (.+)$/m, (_line, json: string) => {
        const metadata = JSON.parse(json) as Record<string, unknown>;
        metadata["generator_status_tag"] = record.statusTag;
        return `# metadata: ${JSON.stringify(metadata)}`;
      })
    : csvBase;
  return {
    set: record.set,
    seed: record.seed,
    startDate: record.startDate,
    weekdays: record.weekdays,
    segments: record.segments,
    statusTag: record.statusTag,
    candles,
    labels,
    csv,
  };
}
