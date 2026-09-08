/**
 * Direct Google Gemini API client for the ForexLens AI/quant reasoning layer.
 *
 * Server-side only. The deterministic engine never imports this module; the AI
 * layer sits strictly above it. Transport is injectable so tests and the
 * stub-replay harness run fully offline and deterministically.
 *
 * Failure policy: fail-closed. A missing key, exhausted retries, or a malformed
 * HTTP/JSON response throws a typed GeminiError — callers must record the
 * failure and must NEVER treat it as a model decision.
 */

export type GeminiErrorKind =
  "auth" | "quota" | "rate-limit" | "timeout" | "network" | "bad-response";

export class GeminiError extends Error {
  readonly kind: GeminiErrorKind;
  readonly retryable: boolean;
  constructor(kind: GeminiErrorKind, message: string, retryable: boolean = false) {
    super(message);
    this.name = "GeminiError";
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface GeminiConfig {
  apiKey?: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

export function loadGeminiConfig(
  env: Record<string, string | undefined> = process.env,
): GeminiConfig {
  const timeoutMs = Number(env["GEMINI_TIMEOUT_MS"] ?? "30000");
  const maxRetries = Number(env["GEMINI_MAX_RETRIES"] ?? "2");
  return {
    apiKey: env["GEMINI_API_KEY"],
    model: env["GEMINI_MODEL"] ?? "gemini-2.5-flash",
    baseUrl: (env["GEMINI_API_BASE"] ?? "https://generativelanguage.googleapis.com/v1beta").replace(
      /\/+$/,
      "",
    ),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    maxRetries: Number.isInteger(maxRetries) && maxRetries >= 0 ? Math.min(maxRetries, 5) : 2,
  };
}

export interface GeminiRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Hint for structured output; keeps responses parseable without a rigid rubric. */
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GeminiResponse {
  ok: true;
  text: string;
  model: string;
  latencyMs: number;
  attempts: number;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

interface GenerateContentPayload {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; message?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function attemptOnce(
  config: GeminiConfig,
  request: GeminiRequest,
  fetchImpl: FetchLike,
): Promise<{ text: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = Date.now();
  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: request.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxOutputTokens ?? 2000,
      responseMimeType: "application/json",
    },
  };
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey as string },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new GeminiError(
        "timeout",
        `Gemini request timed out after ${config.timeoutMs}ms`,
        true,
      );
    }
    throw new GeminiError(
      "network",
      `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  }
  clearTimeout(timer);
  const latencyMs = Date.now() - started;
  const text = await res.text();
  let payload: GenerateContentPayload = {};
  try {
    payload = JSON.parse(text) as GenerateContentPayload;
  } catch {
    /* non-JSON body handled below */
  }
  if (!res.ok) {
    const msg = payload.error?.message ?? `${res.status} ${text.slice(0, 200)}`;
    if (res.status === 401 || res.status === 403)
      throw new GeminiError("auth", `Gemini auth rejected: ${msg}`);
    if (res.status === 429)
      throw new GeminiError("rate-limit", `Gemini rate limited: ${msg}`, true);
    if (res.status === 402) throw new GeminiError("quota", `Gemini quota/billing: ${msg}`);
    if (res.status >= 500) throw new GeminiError("network", `Gemini server error: ${msg}`, true);
    throw new GeminiError("bad-response", `Gemini rejected the request: ${msg}`);
  }
  const content = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!content) throw new GeminiError("bad-response", "Gemini returned no text content");
  return { text: content, latencyMs };
}

export async function generateGemini(
  config: GeminiConfig,
  request: GeminiRequest,
  fetchImpl?: FetchLike,
): Promise<GeminiResponse> {
  if (!config.apiKey) {
    throw new GeminiError("auth", "GEMINI_API_KEY is not configured");
  }
  const transport = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  let attempts = 0;
  let lastError: GeminiError | null = null;
  while (attempts <= config.maxRetries) {
    attempts += 1;
    try {
      const { text, latencyMs } = await attemptOnce(config, request, transport);
      return { ok: true, text, model: config.model, latencyMs, attempts };
    } catch (error) {
      const typed =
        error instanceof GeminiError ? error : new GeminiError("network", String(error), true);
      lastError = typed;
      if (!typed.retryable || attempts > config.maxRetries) break;
      // Fixed small backoff; rate-limit bursts are caller-paced, not hammered here.
      await sleep(250 * attempts);
    }
  }
  throw lastError ?? new GeminiError("network", "Gemini request failed");
}
