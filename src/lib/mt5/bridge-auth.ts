/**
 * Bridge endpoint authentication (server-side only).
 *
 * /api/mt5/bridge is the ONLY endpoint whose response can trigger real broker
 * orders: the SignalFinderBridge EA polls it and executes whatever commands
 * are queued. So every request must present the current bridge token.
 *
 * Token model:
 *   - The token is the server engine's credential `apiToken`
 *     (`expectedBridgeToken()`), falling back to "sfp-default-token".
 *   - It rotates whenever the server engine restarts with fresh defaults,
 *     which is exactly why a 401 tells the user to re-download the EA: the
 *     freshly generated .mq5 always embeds the CURRENT token.
 *
 * Comparison is SHA-256 + timingSafeEqual (node:crypto) so neither the raw
 * token nor its length leaks through timing.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { mt5Engine } from "./engine";

/** The token the bridge currently accepts. */
export function expectedBridgeToken(): string {
  return mt5Engine.getCredentials().apiToken || "sfp-default-token";
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Validates an `Authorization: Bearer <token>` header against the current
 * bridge token. Returns false for missing, empty, malformed, or wrong tokens.
 */
export function verifyBridgeToken(authorizationHeader: string | null | undefined): boolean {
  if (!authorizationHeader) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const provided = match[1].trim();
  if (!provided) return false;
  const providedHash = sha256(provided);
  const expectedHash = sha256(expectedBridgeToken());
  if (providedHash.length !== expectedHash.length) return false;
  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Standard 401 for the bridge endpoint. The message is actionable: the token
 * rotates on server restart, and the EA download embeds the current one, so
 * re-downloading the EA is always the fix.
 */
export function unauthorizedBridgeResponse(): Response {
  return new Response(
    JSON.stringify({
      status: "error",
      code: "unauthorized",
      message:
        "Invalid or missing bridge token. The token rotates when the server restarts — re-download the EA (SignalFinderBridge.mq5) from the MT5 panel and attach it again to pick up the current token.",
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}
