// Server-only helpers that stream Gemini models against each other.
// Calls Google Gemini directly (no Lovable gateway required).

const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = 30_000;

// Use a stable, widely available Gemini model.
export const GEMINI_MODEL = "gemini-2.5-flash";
export const OPENAI_MODEL = "gemini-2.5-flash"; // second "voice" also uses Gemini

export type Turn = {
  role: "user" | "assistant";
  speaker: "gemini" | "gpt" | "system";
  text: string;
};

export type ChartImage = { name: string; timeframe: string; pngDataUrl: string };

type DeltaHandler = (text: string) => void | Promise<void>;

async function readSse(
  response: Response,
  onEvent: (payload: unknown) => void | Promise<void>,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Model response had no body");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        await onEvent(JSON.parse(data));
      } catch {
        // ignore keep-alive / non-JSON frames
      }
    }
  }
}

async function assertOk(response: Response, model: string) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  if (response.status === 429) {
    throw new Error(`${model} is rate limited. Please retry in a moment.`);
  }
  if (response.status === 402 || response.status === 403) {
    throw new Error(
      `${model} access denied or quota exceeded. Check your Gemini API key and billing.`,
    );
  }
  throw new Error(`${model} request failed (${response.status}): ${body.slice(0, 400)}`);
}

function geminiContent(text: string, images: ChartImage[]) {
  const parts: unknown[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.pngDataUrl } });
  }
  return parts;
}

/**
 * Shared Gemini native generateContent call.
 * Auth: x-goog-api-key (NOT OpenAI-compatible Bearer).
 * system → system_instruction; user → user; assistant → model.
 * Images: inline_data parts on the first user turn when provided.
 * Non-streaming; emits the full text once via onDelta to preserve callers.
 */
async function streamGeminiChat(
  apiKey: string,
  modelLabel: string,
  system: string,
  turns: Turn[],
  images: ChartImage[],
  onDelta: DeltaHandler,
): Promise<string> {
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [];
  turns.forEach((turn, index) => {
    const role = turn.role === "assistant" ? "model" : "user";
    const parts: unknown[] = [{ text: turn.text }];
    if (index === 0 && turn.role === "user") {
      for (const image of images) {
        const dataUrl = image.pngDataUrl;
        const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        if (m) {
          parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
        }
      }
    }
    contents.push({ role, parts });
  });
  if (contents.length === 0) {
    throw new Error(`${modelLabel} native request has no contents`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const url = `${GEMINI_NATIVE_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new Error(`${modelLabel} timed out after ${GEMINI_TIMEOUT_MS}ms`);
    }
    throw new Error(
      `${modelLabel} network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new Error(`${modelLabel} is rate limited. Please retry in a moment.`);
    }
    if (response.status === 402 || response.status === 403) {
      throw new Error(
        `${modelLabel} access denied or quota exceeded. Check your Gemini API key and billing.`,
      );
    }
    throw new Error(`${modelLabel} request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const text = await response.text();
  let payload: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = {};
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${modelLabel} returned non-JSON body: ${text.slice(0, 200)}`);
  }
  const full = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!full) throw new Error(`${modelLabel} returned no text content`);
  await onDelta(full);
  return full;
}

/** Gemini side of the debate (multimodal, streaming). */
export async function streamGemini(
  apiKey: string,
  system: string,
  turns: Turn[],
  images: ChartImage[],
  onDelta: DeltaHandler,
): Promise<string> {
  return streamGeminiChat(apiKey, "Gemini", system, turns, images, onDelta);
}

/**
 * Second debate voice (originally GPT via Lovable).
 * Now also uses Gemini so only GEMINI_API_KEY is required.
 */
export async function streamOpenAI(
  apiKey: string,
  system: string,
  turns: Turn[],
  images: ChartImage[],
  onDelta: DeltaHandler,
): Promise<string> {
  return streamGeminiChat(apiKey, "Gemini (stress-tester)", system, turns, images, onDelta);
}

export function extractVerdict(text: string): "AGREE" | "REVISE" {
  const matches = text.toUpperCase().match(/VERDICT:\s*(AGREE|REVISE)/g);
  if (!matches || matches.length === 0) return "REVISE";
  const last = matches[matches.length - 1] as string;
  return last.includes("AGREE") ? "AGREE" : "REVISE";
}
