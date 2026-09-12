export type AnalysisChart = { name: string; timeframe: string; pngDataUrl: string };
export type AnalysisSnapshot = {
  symbol: string;
  createdAt: string;
  range: string;
  csvName: string | null;
  ohlcCsv: string | null;
  charts: AnalysisChart[];
};

export function parseAnalysisSnapshot(raw: string | null): AnalysisSnapshot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (
      typeof v["symbol"] !== "string" ||
      typeof v["createdAt"] !== "string" ||
      typeof v["range"] !== "string"
    )
      return null;
    if (v["csvName"] !== null && typeof v["csvName"] !== "string") return null;
    if (v["ohlcCsv"] !== null && typeof v["ohlcCsv"] !== "string") return null;
    if (!Array.isArray(v["charts"])) return null;
    const rawCharts = v["charts"] as unknown[];
    const charts = rawCharts.filter((chart): chart is AnalysisChart => {
      if (!chart || typeof chart !== "object") return false;
      const c = chart as Record<string, unknown>;
      return (
        typeof c["name"] === "string" &&
        typeof c["timeframe"] === "string" &&
        typeof c["pngDataUrl"] === "string"
      );
    });
    if (charts.length !== rawCharts.length) return null;
    return {
      symbol: v["symbol"],
      createdAt: v["createdAt"],
      range: v["range"],
      csvName: v["csvName"] as string | null,
      ohlcCsv: v["ohlcCsv"] as string | null,
      charts,
    };
  } catch {
    return null;
  }
}
