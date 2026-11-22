/** The admin token is deliberately session-only and never sent in a URL. */
export const MT5_ADMIN_SESSION_KEY = "forexlens.mt5.admin-token";
export function adminHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const token = sessionStorage.getItem(MT5_ADMIN_SESSION_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
