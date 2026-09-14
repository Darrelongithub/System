export type AnalysisSnapshot = {
  symbol: string;
  createdAt: string;
  range: string;
  csvName: string | null;
  ohlcCsv: string | null;
};

/**
 * Parse/validate a persisted snapshot. Returns null for anything malformed so
 * a corrupt or outdated sessionStorage entry can never feed the analyser.
 * Charts were removed: they were written but never read by any page or server
 * function, and rasterizing them into sessionStorage regularly overflowed the
 * quota and dropped the whole snapshot.
 */
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
    return {
      symbol: v["symbol"],
      createdAt: v["createdAt"],
      range: v["range"],
      csvName: v["csvName"] as string | null,
      ohlcCsv: v["ohlcCsv"] as string | null,
    };
  } catch {
    return null;
  }
}
