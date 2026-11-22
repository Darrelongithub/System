import { createHash, timingSafeEqual } from "node:crypto";

/** No configured token preserves existing local development behaviour. */
export function verifyAdminRequest(
  request: Request,
  expected = process.env["MT5_ADMIN_TOKEN"],
): boolean {
  if (!expected) return true;
  const authorization = request.headers.get("authorization") ?? "";
  const provided =
    /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? request.headers.get("x-mt5-admin-token") ?? "";
  if (!provided) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}
export function adminUnauthorized(): Response {
  return new Response(JSON.stringify({ status: "error", message: "MT5 admin token required" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
