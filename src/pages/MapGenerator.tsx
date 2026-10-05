import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Check,
  Download,
  FileJson2,
  Info,
  Map,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PROFILE_SUMMARY } from "@/lib/synth/profile-summary";
import { SCENARIOS, SEQUENCE_SCENARIOS, SINGLE_CONDITION_SCENARIOS } from "@/lib/synth/scenarios";
import { toCsv } from "@/lib/synth/csv";
import type {
  DriftDial,
  GapDial,
  NewsDial,
  ScenarioName,
  ShockFollowThrough,
  SynthConfig,
  SyntheticResult,
  TrendinessDial,
  VolatilityDial,
  VolatilityShape,
} from "@/lib/synth/types";

const DEFAULT_SEED = "20261001";
const BAND_COLORS = ["#48d8bd", "#f18b76", "#e8bd62", "#a78bfa", "#65aaf7", "#f472b6"];

type Option<T extends string> = { value: T; label: string };

type SelectFieldProps<T extends string> = {
  id: string;
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  hint?: string;
};

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "number";
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
};

function TextField({
  id,
  label,
  value,
  onChange,
  type = "number",
  min,
  max,
  step,
  hint,
}: TextFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {hint && <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function labelize(value: string): string {
  return value
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function regimeColor(regimeId: string, index: number): string {
  const name = regimeId.toLowerCase();
  if (name.includes("crash") || name.includes("downtrend")) return "#f18b76";
  if (name.includes("uptrend") || name.includes("melt_up")) return "#48d8bd";
  if (name.includes("whipsaw") || name.includes("fake_out")) return "#e8bd62";
  if (name.includes("quiet") || name.includes("dead_zone")) return "#65aaf7";
  return BAND_COLORS[index % BAND_COLORS.length]!;
}

function PriceMap({ result }: { result: SyntheticResult }) {
  const geometry = useMemo(() => {
    const { candles, labels } = result;
    const width = 1080;
    const height = 330;
    const left = 66;
    const right = 20;
    const top = 22;
    const bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const candle of candles) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
    }
    const padding = Math.max((high - low) * 0.06, high * 0.0001);
    low -= padding;
    high += padding;
    const xFor = (index: number) => left + (index / Math.max(1, candles.length - 1)) * plotWidth;
    const yFor = (price: number) => top + ((high - price) / (high - low)) * plotHeight;
    const stride = Math.max(1, Math.ceil(candles.length / 520));
    const points: string[] = [];
    for (let index = 0; index < candles.length; index += stride) {
      points.push(
        `${index === 0 ? "M" : "L"}${xFor(index).toFixed(2)},${yFor(candles[index]!.close).toFixed(2)}`,
      );
    }
    if ((candles.length - 1) % stride !== 0) {
      const lastIndex = candles.length - 1;
      points.push(`L${xFor(lastIndex).toFixed(2)},${yFor(candles[lastIndex]!.close).toFixed(2)}`);
    }

    const bands: Array<{ start: number; end: number; id: string; color: string }> = [];
    let bandStart = 0;
    let bandId = labels[0]?.regimeId ?? "regime";
    let bandIndex = 0;
    for (let index = 1; index <= labels.length; index++) {
      const nextId = labels[index]?.regimeId;
      if (index === labels.length || nextId !== bandId) {
        bands.push({
          start: bandStart,
          end: index - 1,
          id: bandId,
          color: regimeColor(bandId, bandIndex),
        });
        bandStart = index;
        bandId = nextId ?? bandId;
        bandIndex++;
      }
    }
    const eventStride = Math.max(1, Math.ceil(candles.length / 140));
    const events = labels.flatMap((label, index) =>
      label.eventFlag !== "none" && index % eventStride === 0
        ? [{ index, y: yFor(candles[index]!.close), flag: label.eventFlag }]
        : [],
    );
    const firstX = xFor(0);
    const lastX = xFor(candles.length - 1);
    const baselineY = top + plotHeight;
    const line = points.join(" ");
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotWidth,
      plotHeight,
      low,
      high,
      xFor,
      yFor,
      bands,
      events,
      firstX,
      lastX,
      baselineY,
      line,
      area: `${line} L${lastX.toFixed(2)},${baselineY.toFixed(2)} L${firstX.toFixed(2)},${baselineY.toFixed(2)} Z`,
    };
  }, [result]);

  const { candles, labels } = result;
  const { width, height, left, top, plotWidth, plotHeight, low, high } = geometry;
  const dateStart = candles[0]?.datetime.slice(0, 10) ?? "";
  const dateEnd = candles.at(-1)?.datetime.slice(0, 10) ?? "";

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-[#080a0c]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Price path + regime map</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            30-minute close · EAT timestamps · color strip shows planted regime windows
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {geometry.bands.map((band, index) => (
            <span
              key={`${band.id}-${band.start}`}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: band.color }}
                aria-hidden
              />
              {labelize(band.id.split(":").at(-1) ?? band.id)}
              {geometry.bands.length > 1 && (
                <span className="text-muted-foreground/70">{index + 1}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto px-2 pt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Synthetic XAUUSD close-price map from ${dateStart} to ${dateEnd}`}
          className="block min-w-[680px] w-full"
        >
          <defs>
            <linearGradient id="map-price-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#48d8bd" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#48d8bd" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width={width} height={height} fill="#080a0c" />
          {geometry.bands.map((band) => {
            const x1 = geometry.xFor(band.start);
            const x2 = geometry.xFor(Math.min(candles.length - 1, band.end + 1));
            return (
              <rect
                key={`${band.id}-${band.start}`}
                x={x1}
                y={top}
                width={Math.max(1, x2 - x1)}
                height={plotHeight}
                fill={band.color}
                fillOpacity="0.045"
              />
            );
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = top + plotHeight * fraction;
            const value = high - (high - low) * fraction;
            return (
              <g key={fraction}>
                <line
                  x1={left}
                  x2={width - 18}
                  y1={y}
                  y2={y}
                  stroke="#283038"
                  strokeDasharray="3 6"
                />
                <text
                  x={left - 9}
                  y={y + 4}
                  textAnchor="end"
                  fill="#727e88"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {value.toFixed(0)}
                </text>
              </g>
            );
          })}
          <path d={geometry.area} fill="url(#map-price-area)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="#70e4cf"
            strokeWidth="1.7"
            vectorEffect="non-scaling-stroke"
          />
          {geometry.events.map((event) => (
            <circle
              key={`${event.index}-${event.flag}`}
              cx={geometry.xFor(event.index)}
              cy={event.y}
              r={event.flag === "unscheduled-shock" ? 3 : 2.2}
              fill={event.flag === "unscheduled-shock" ? "#f18b76" : "#e8bd62"}
              stroke="#080a0c"
              strokeWidth="1"
            >
              <title>{`${candles[event.index]?.datetime ?? ""} · ${event.flag}`}</title>
            </circle>
          ))}
          <rect
            x={left}
            y={top + plotHeight + 9}
            width={plotWidth}
            height="6"
            rx="3"
            fill="#1d252b"
          />
          {geometry.bands.map((band) => {
            const x1 = geometry.xFor(band.start);
            const x2 = geometry.xFor(Math.min(candles.length - 1, band.end + 1));
            return (
              <rect
                key={`strip-${band.id}-${band.start}`}
                x={x1}
                y={top + plotHeight + 9}
                width={Math.max(2, x2 - x1)}
                height="6"
                rx="3"
                fill={band.color}
                fillOpacity="0.92"
              />
            );
          })}
          <text x={left} y={height - 7} fill="#727e88" fontSize="10" fontFamily="var(--font-mono)">
            {dateStart}
          </text>
          <text
            x={width - 18}
            y={height - 7}
            textAnchor="end"
            fill="#727e88"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {dateEnd}
          </text>
          <text
            x={left + plotWidth / 2}
            y={height - 7}
            textAnchor="middle"
            fill="#727e88"
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            {labels.length.toLocaleString()} bars · {geometry.events.length.toLocaleString()} event
            markers shown
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#70e4cf]" aria-hidden /> Close
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#e8bd62]" aria-hidden /> News / gap event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#f18b76]" aria-hidden /> Unscheduled shock
        </span>
      </div>
    </div>
  );
}

export default function MapGenerator() {
  const [scenario, setScenario] = useState<ScenarioName>("normal_chop");
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [tradingDays, setTradingDays] = useState("120");
  const [startDate, setStartDate] = useState<string>(
    DEFAULT_PROFILE_SUMMARY.sample.calendar.representativeStartDate,
  );
  const [priceLevel, setPriceLevel] = useState(String(DEFAULT_PROFILE_SUMMARY.sample.price.median));
  const [volatilityMode, setVolatilityMode] = useState("scenario");
  const [customVolatilityPercent, setCustomVolatilityPercent] = useState("0.25");
  const [driftMode, setDriftMode] = useState("scenario");
  const [customDriftPercent, setCustomDriftPercent] = useState("0");
  const [trendiness, setTrendiness] = useState("scenario");
  const [volatilityShape, setVolatilityShape] = useState("scenario");
  const [gaps, setGaps] = useState("scenario");
  const [news, setNews] = useState("scenario");
  const [shockFollowThrough, setShockFollowThrough] = useState("scenario");
  const [transitionBars, setTransitionBars] = useState("");
  const [wobblePercent, setWobblePercent] = useState("10");
  const [spreadMultiplier, setSpreadMultiplier] = useState("1");
  const [generated, setGenerated] = useState<SyntheticResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileStart = DEFAULT_PROFILE_SUMMARY.source.span.start.slice(0, 10);
  const profileEnd = DEFAULT_PROFILE_SUMMARY.source.span.end.slice(0, 10);
  const preset = SCENARIOS[scenario];
  const presetLine =
    preset.kind === "sequence"
      ? preset.segments.map((segment) => labelize(segment.name)).join(" → ")
      : [
          labelize(preset.dials.volatility.toString()),
          labelize(preset.dials.drift.toString()),
          labelize(preset.dials.trendiness),
          labelize(preset.dials.news),
          labelize(preset.dials.gaps),
        ].join(" · ");

  const buildConfig = (): SynthConfig => {
    const config: SynthConfig = {
      scenario,
      pathLengthTradingDays: Number(tradingDays),
      startDate,
      priceLevel: Number(priceLevel),
      wobblePercent: Number(wobblePercent) / 100,
      spreadMultPerEvent: Number(spreadMultiplier),
    };
    if (transitionBars.trim()) config.transitionBars = Number(transitionBars);
    if (volatilityMode === "custom") {
      config.volatility = Number(customVolatilityPercent) / 100;
    } else if (volatilityMode !== "scenario") {
      config.volatility = volatilityMode as VolatilityDial;
    }
    if (driftMode === "custom") {
      config.drift = Number(customDriftPercent) / 100;
    } else if (driftMode !== "scenario") {
      config.drift = driftMode as DriftDial;
    }
    if (trendiness !== "scenario") config.trendiness = trendiness as TrendinessDial;
    if (volatilityShape !== "scenario") config.volatilityShape = volatilityShape as VolatilityShape;
    if (gaps !== "scenario") config.gaps = gaps as GapDial;
    if (news !== "scenario") config.news = news as NewsDial;
    if (shockFollowThrough !== "scenario") {
      config.shockFollowThrough = shockFollowThrough as ShockFollowThrough;
    }
    return config;
  };

  const handleGenerate = async () => {
    setError(null);
    const parsedSeed = Number(seed);
    const parsedDays = Number(tradingDays);
    const parsedPrice = Number(priceLevel);
    const parsedWobble = Number(wobblePercent);
    const parsedSpread = Number(spreadMultiplier);
    const parsedCustomVolatility = Number(customVolatilityPercent);
    const parsedCustomDrift = Number(customDriftPercent);
    const parsedTransitionBars = Number(transitionBars);
    const invalid =
      !Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 0xffff_ffff
        ? "Seed must be an integer from 0 to 4,294,967,295."
        : !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 2000
          ? "Trading days must be an integer from 1 to 2,000."
          : !validDateOnly(startDate)
            ? "Choose a valid EAT calendar start date."
            : !Number.isFinite(parsedPrice) || parsedPrice <= 0
              ? "Price level must be a positive number."
              : !Number.isFinite(parsedWobble) || parsedWobble < 0 || parsedWobble > 50
                ? "Dial wobble must be between 0% and 50%."
                : !Number.isFinite(parsedSpread) || parsedSpread < 0
                  ? "Spread multiplier must be zero or greater."
                  : volatilityMode === "custom" &&
                      (!Number.isFinite(parsedCustomVolatility) || parsedCustomVolatility <= 0)
                    ? "Custom volatility must be a positive ATR percentage."
                    : driftMode === "custom" && !Number.isFinite(parsedCustomDrift)
                      ? "Custom drift must be a finite 60-day log-return percentage."
                      : transitionBars.trim() &&
                          (!Number.isInteger(parsedTransitionBars) ||
                            parsedTransitionBars < 48 ||
                            parsedTransitionBars > 200)
                        ? "Transition blend must be from 48 to 200 bars."
                        : null;
    if (invalid) {
      setError(invalid);
      return;
    }

    setIsGenerating(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      const { generateSynthetic } = await import("@/lib/synth/generate");
      const next = generateSynthetic(buildConfig(), parsedSeed);
      setGenerated(next);
    } catch (generationError) {
      setError(
        generationError instanceof Error ? generationError.message : String(generationError),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!generated) return;
    downloadText(
      `xauusd_${generated.meta.scenario}_${generated.meta.seed}.csv`,
      toCsv(generated.candles),
      "text/csv",
    );
  };

  const handleDownloadMap = () => {
    if (!generated) return;
    const document = {
      schemaVersion: 1,
      description:
        "Seeded synthetic XAUUSD regime map. Labels align by datetime with the OHLC CSV.",
      meta: generated.meta,
      labels: generated.labels,
    };
    downloadText(
      `xauusd_${generated.meta.scenario}_${generated.meta.seed}.regime-map.json`,
      `${JSON.stringify(document, null, 2)}\n`,
      "application/json",
    );
  };

  const summary = useMemo(() => {
    if (!generated || generated.candles.length === 0) return null;
    const candles = generated.candles;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const candle of candles) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
    }
    const firstClose = candles[0]!.close;
    const lastClose = candles[candles.length - 1]!.close;
    const eventBars = generated.labels.filter((label) => label.eventFlag !== "none").length;
    const gapBars = generated.labels.filter((label) => label.gapFlag).length;
    return {
      low,
      high,
      firstClose,
      lastClose,
      changePercent: (lastClose / firstClose - 1) * 100,
      eventBars,
      gapBars,
    };
  }, [generated]);

  return (
    <main className="app-shell min-h-screen bg-background px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/"
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={12} /> Control panel
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/generator"
                className="rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Data Generator
              </Link>
              <Link
                to="/backtest"
                className="rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Live Backtest
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                <Map size={13} /> Synthetic market lab
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Map Generator
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Build repeatable XAUUSD paths with a seeded regime map, then export engine-ready
                OHLC and aligned ground-truth labels.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              <Activity size={12} /> Market-statistics only
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="glass-card rounded-xl p-4 md:col-span-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-warning/25 bg-warning/10 p-2 text-warning">
                <ShieldAlert size={17} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Archive coverage present · D1 realism gate failed
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Profile: {profileStart} to {profileEnd} EAT. The fixed D1 check passed coverage
                  but only 28/32 market-statistic checks: EAT 05:00, 16:00, 17:00, and 19:00 hourly
                  cells are outside tolerance. Thresholds were not changed. D2–D7 and Phase 4 were
                  not run.
                </p>
              </div>
            </div>
          </div>
          <div className="glass-card flex items-center gap-3 rounded-xl p-4">
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary">
              <Waves size={17} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">17 registered recipes</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                13 single conditions · 4 regime sequences
              </p>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="glass-card flex flex-col gap-5 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Path recipe</h2>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Same recipe + seed + profile yields the same map. Global overrides apply to every
                  segment.
                </p>
              </div>
              <span className="rounded border border-border/60 px-2 py-1 font-mono text-[9px] text-muted-foreground">
                SEED v1
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
                <Label
                  htmlFor="map-scenario"
                  className="text-[11px] uppercase tracking-wide text-muted-foreground"
                >
                  Scenario
                </Label>
                <Select
                  value={scenario}
                  onValueChange={(value) => setScenario(value as ScenarioName)}
                >
                  <SelectTrigger id="map-scenario" aria-label="Scenario">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectGroup>
                      <SelectLabel>Single conditions</SelectLabel>
                      {SINGLE_CONDITION_SCENARIOS.map((name) => (
                        <SelectItem key={name} value={name}>
                          {labelize(name)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Planted sequences</SelectLabel>
                      {SEQUENCE_SCENARIOS.map((name) => (
                        <SelectItem key={name} value={name}>
                          {labelize(name)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <TextField
                id="map-seed"
                label="Seed"
                value={seed}
                min={0}
                max={4294967295}
                step={1}
                onChange={setSeed}
                hint="Unsigned 32-bit integer. Use the same seed to reproduce the path."
              />
              <TextField
                id="map-days"
                label="Trading days"
                value={tradingDays}
                min={1}
                max={2000}
                step={1}
                onChange={setTradingDays}
                hint={`1–2,000 Mon–Fri days; calendar follows the primary ${DEFAULT_PROFILE_SUMMARY.sample.calendar.standardWeekBarCount}-bar weekly template.`}
              />
              <TextField
                id="map-start"
                label="Start date · EAT"
                type="date"
                value={startDate}
                onChange={setStartDate}
              />
              <TextField
                id="map-price"
                label="Start price · USD/oz"
                value={priceLevel}
                min={0.01}
                step={0.01}
                onChange={setPriceLevel}
                hint={`Observed source range: ${DEFAULT_PROFILE_SUMMARY.sample.price.minimum.toFixed(2)}–${DEFAULT_PROFILE_SUMMARY.sample.price.maximum.toFixed(2)}.`}
              />
            </div>

            <div className="border-t border-border/50 pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Dial controls</h3>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Scenario preset preserves each recipe’s registered settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVolatilityMode("scenario");
                    setDriftMode("scenario");
                    setTrendiness("scenario");
                    setVolatilityShape("scenario");
                    setGaps("scenario");
                    setNews("scenario");
                    setShockFollowThrough("scenario");
                  }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw size={11} /> Reset overrides
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <SelectField
                  id="map-volatility"
                  label="Volatility"
                  value={volatilityMode}
                  onChange={setVolatilityMode}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "low", label: "Low · observed p10" },
                    { value: "normal", label: "Normal · observed p50" },
                    { value: "high", label: "High · observed p90" },
                    { value: "p5", label: "Very low · observed p5" },
                    { value: "custom", label: "Custom ATR / price" },
                  ]}
                />
                {volatilityMode === "custom" && (
                  <TextField
                    id="map-volatility-custom"
                    label="Custom ATR / price (%)"
                    value={customVolatilityPercent}
                    min={0.001}
                    step={0.01}
                    onChange={setCustomVolatilityPercent}
                    hint={`Observed p10–p90: ${(DEFAULT_PROFILE_SUMMARY.sample.atrPercent.quantiles.p10 * 100).toFixed(3)}%–${(DEFAULT_PROFILE_SUMMARY.sample.atrPercent.quantiles.p90 * 100).toFixed(3)}%. Out-of-range bars are flagged EXTRAPOLATION.`}
                  />
                )}
                <SelectField
                  id="map-drift"
                  label="60-day log drift"
                  value={driftMode}
                  onChange={setDriftMode}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "down", label: "Down · observed p10" },
                    { value: "flat", label: "Flat · observed p50" },
                    { value: "up", label: "Up · observed p90" },
                    { value: "custom", label: "Custom 60-day log return" },
                  ]}
                  hint="Flat is the observed median, not necessarily zero."
                />
                {driftMode === "custom" && (
                  <TextField
                    id="map-drift-custom"
                    label="Custom log return · 60 days (%)"
                    value={customDriftPercent}
                    step={0.1}
                    onChange={setCustomDriftPercent}
                    hint={`Observed p10–p90: ${(DEFAULT_PROFILE_SUMMARY.sample.rolling60DayDriftLogReturn.quantiles.p10 * 100).toFixed(2)}%–${(DEFAULT_PROFILE_SUMMARY.sample.rolling60DayDriftLogReturn.quantiles.p90 * 100).toFixed(2)}%.`}
                  />
                )}
                <SelectField
                  id="map-trendiness"
                  label="Trendiness"
                  value={trendiness}
                  onChange={setTrendiness}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "mean-reverting", label: "Mean reverting · observed p10" },
                    { value: "random", label: "Random · observed p50" },
                    { value: "trending", label: "Trending · observed p90" },
                  ]}
                />
                <SelectField
                  id="map-volatility-shape"
                  label="Volatility shape"
                  value={volatilityShape}
                  onChange={setVolatilityShape}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "stable", label: "Stable" },
                    { value: "expanding", label: "Expanding" },
                    { value: "contracting", label: "Contracting" },
                  ]}
                />
                <SelectField
                  id="map-gaps"
                  label="Gap intensity"
                  value={gaps}
                  onChange={setGaps}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "normal", label: "Normal · resampled" },
                    { value: "heavy", label: "Heavy · data-derived" },
                  ]}
                />
                <SelectField
                  id="map-news"
                  label="News / shock intensity"
                  value={news}
                  onChange={setNews}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "light", label: "Light · observed p10 rate" },
                    { value: "normal", label: "Normal · observed rate" },
                    { value: "heavy", label: "Heavy · observed p90 rate" },
                  ]}
                />
                <SelectField
                  id="map-shock-follow-through"
                  label="Shock follow-through"
                  value={shockFollowThrough}
                  onChange={setShockFollowThrough}
                  options={[
                    { value: "scenario", label: "Scenario preset" },
                    { value: "continue", label: "Continue" },
                    { value: "revert", label: "Revert" },
                    { value: "mixed", label: "Mixed · observed tail share" },
                  ]}
                />
              </div>
            </div>

            <details className="border-t border-border/50 pt-4">
              <summary className="cursor-pointer list-none text-xs font-semibold text-foreground marker:hidden">
                Advanced generation controls
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  wobble, blend, spread assumption
                </span>
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <TextField
                  id="map-transition"
                  label="Transition blend · bars"
                  value={transitionBars}
                  min={48}
                  max={200}
                  step={1}
                  onChange={setTransitionBars}
                  hint="Leave blank for a seeded 48–200-bar transition."
                />
                <TextField
                  id="map-wobble"
                  label="Bounded dial wobble (%)"
                  value={wobblePercent}
                  min={0}
                  max={50}
                  step={1}
                  onChange={setWobblePercent}
                  hint="Default is ±10%; maximum accepted by the generator is 50%."
                />
                <TextField
                  id="map-spread"
                  label="Spread multiplier · assumption"
                  value={spreadMultiplier}
                  min={0}
                  step={0.1}
                  onChange={setSpreadMultiplier}
                  hint="Label metadata only; no historical spread series is available and OHLC is unchanged."
                />
              </div>
            </details>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            <Button onClick={handleGenerate} disabled={isGenerating} className="h-10 w-full">
              {isGenerating ? (
                <>
                  <Activity size={14} className="animate-pulse" /> Building seeded map…
                </>
              ) : (
                <>
                  <Play size={14} /> Generate map
                </>
              )}
            </Button>
            <p className="inline-flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
              <Info size={12} className="mt-0.5 shrink-0" /> Generation uses only the bundled OHLC
              calibration profile. It does not fetch prices or run strategy results.
            </p>
          </section>

          <div className="flex min-w-0 flex-col gap-5">
            {generated && summary ? (
              <>
                <section className="glass-card flex flex-col gap-4 rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                        <Check size={13} /> Map ready
                      </div>
                      <h2 className="mt-1 text-lg font-semibold text-foreground">
                        {labelize(generated.meta.scenario)}{" "}
                        <span className="font-mono text-sm text-muted-foreground">
                          · seed {generated.meta.seed}
                        </span>
                      </h2>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {generated.meta.pathLengthTradingDays} trading days ·{" "}
                        {generated.candles.length.toLocaleString()} candles ·{" "}
                        {generated.meta.sampledCalendarClosures.toLocaleString()} sampled calendar
                        closure{generated.meta.sampledCalendarClosures === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
                        <Download size={13} /> OHLC CSV
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleDownloadMap}>
                        <FileJson2 size={13} /> Regime map JSON
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                    <StatCard
                      label="Close-to-close"
                      value={`${summary.changePercent >= 0 ? "+" : ""}${summary.changePercent.toFixed(2)}%`}
                      detail={`${summary.firstClose.toFixed(2)} → ${summary.lastClose.toFixed(2)}`}
                    />
                    <StatCard
                      label="Path range"
                      value={`${summary.low.toFixed(2)}–${summary.high.toFixed(2)}`}
                      detail="USD per troy ounce"
                    />
                    <StatCard
                      label="Events / gaps"
                      value={`${summary.eventBars} / ${summary.gapBars}`}
                      detail="seeded news, shocks, and calendar gaps"
                    />
                    <StatCard
                      label="EXTRAPOLATION"
                      value={generated.meta.extrapolationBars.toLocaleString()}
                      detail="bars flagged outside observed dials"
                      warning={generated.meta.extrapolationBars > 0}
                    />
                  </div>

                  {generated.meta.extrapolationBars > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
                      <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                      Some active numeric dials or the starting price are outside the available
                      profile range. Those bars are explicitly flagged EXTRAPOLATION in the
                      regime-map export.
                    </div>
                  )}

                  <PriceMap result={generated} />

                  <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/15 p-3 text-[10px] sm:grid-cols-2">
                    <div>
                      <p className="uppercase tracking-wide text-muted-foreground">
                        Registered path
                      </p>
                      <p className="mt-1 font-medium text-foreground">{presetLine}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide text-muted-foreground">
                        Blend / provenance
                      </p>
                      <p className="mt-1 font-mono text-foreground">
                        {generated.meta.transitionBars.length
                          ? `${generated.meta.transitionBars.join(" · ")} bars`
                          : "single regime"}{" "}
                        · source {generated.meta.sourceHash.slice(0, 12)}…
                      </p>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <section className="glass-card flex min-h-[420px] flex-col items-center justify-center rounded-xl border-dashed p-8 text-center">
                <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 text-primary">
                  <Map size={28} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">
                  Your regime map will appear here
                </h2>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Choose one of the 13 single-condition recipes or four seeded sequences. Generate
                  once to preview the price path and download engine-compatible OHLC plus
                  datetime-aligned ground-truth labels.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded-full border border-border/60 px-2.5 py-1">
                    Seeded & repeatable
                  </span>
                  <span className="rounded-full border border-border/60 px-2.5 py-1">
                    Wilder ATR fallback CSV
                  </span>
                  <span className="rounded-full border border-border/60 px-2.5 py-1">
                    No strategy output
                  </span>
                </div>
              </section>
            )}

            <section className="grid gap-3 md:grid-cols-2">
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <CalendarDays size={14} className="text-primary" /> Profile window
                </div>
                <p className="mt-2 font-mono text-[11px] text-foreground">
                  {profileStart} → {profileEnd} · UTC+03:00
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Canonical candle SHA-256:{" "}
                  {DEFAULT_PROFILE_SUMMARY.source.canonicalCandlesSha256.slice(0, 16)}… · row
                  timestamps are unzoned; section markers say UTC while metadata says EAT. Per input
                  convention, rows are interpreted as EAT+03:00 with no timestamp shift.
                </p>
              </div>
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Info size={14} className="text-primary" /> Output contract
                </div>
                <p className="mt-2 text-[11px] text-foreground">
                  CSV: datetime, open, high, low, close, is_reliable
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  The CSV is EAT wall-clock text with parser metadata and no precomputed ATR
                  override. Ground-truth regime labels download separately as JSON. Full-window D1
                  coverage passed, but four hourly market-statistic checks failed; see the report.
                  No strategy results are included.
                </p>
              </div>
            </section>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-[10px] text-muted-foreground">
          <span>Signal Finder Pro · Map Generator · deterministic synthetic OHLC</span>
          <span>
            Markets use the full-window calibrated profile; D1 did not pass, and no forecast or
            performance claim is made.
          </span>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${warning ? "border-warning/30 bg-warning/5" : "border-border/50 bg-muted/20"}`}
    >
      <p
        className={`text-[9px] font-bold uppercase tracking-wide ${warning ? "text-warning" : "text-muted-foreground"}`}
      >
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-[9px] text-muted-foreground">{detail}</p>
    </div>
  );
}
