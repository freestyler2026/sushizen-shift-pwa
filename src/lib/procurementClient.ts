"use client";

import { getAuth, refreshAuthFromApi, setAuth, nonDowngradedAccess, type Auth } from "@/lib/auth";

const _SK_NAME = "procurement_session_name";
const _SK_PIN = "procurement_session_pin";

export function saveProcurementSession(name: string, pin: string): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (name.trim()) sessionStorage.setItem(_SK_NAME, name.trim());
    if (pin.trim()) sessionStorage.setItem(_SK_PIN, pin.trim());
  } catch {}
}

export function clearProcurementSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(_SK_NAME);
    sessionStorage.removeItem(_SK_PIN);
  } catch {}
}

export function defaultProcurementName(): string {
  const authName = getAuth()?.staffName || "";
  try {
    if (typeof sessionStorage !== "undefined") {
      const sessionName = sessionStorage.getItem(_SK_NAME);
      if (sessionName) {
        // Only use the cached session name if it matches the current auth user.
        const normalize = (n: string) => n.trim().toLowerCase();
        if (!authName || normalize(sessionName) === normalize(authName)) {
          return sessionName;
        }
      }
    }
  } catch {}
  return authName;
}

export function defaultProcurementPin(): string {
  // Only use auth.pin (set when a PIN is successfully verified via remintAccessTokenWithPin).
  // sessionStorage is intentionally excluded: a stale PIN in sessionStorage for the same user
  // (e.g. after a PIN change) would bypass the backend check and cause "Invalid PIN" errors.
  return getAuth()?.pin || "";
}

export async function procurementTokenHeaders(requestedBy: string, pin: string): Promise<Record<string, string>> {
  const auth = getAuth();
  const refreshed = await refreshAuthFromApi(auth);
  let accessToken = refreshed?.accessToken || auth?.accessToken || "";
  const stepUpToken = refreshed?.stepUpToken || auth?.stepUpToken || "";

  async function remintAccessTokenWithPin(): Promise<string> {
    if (!requestedBy.trim() || !pin.trim()) return "";
    const authCity = String(refreshed?.city || auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
    const qs = new URLSearchParams({
      staff_name: requestedBy.trim(),
      pin: pin.trim(),
      city: authCity,
    }).toString();
    // Send the current (possibly just-expired) token so the backend can refuse
    // to hand back a role weaker than the live session already holds.
    const priorToken = String(refreshed?.accessToken || auth?.accessToken || "").trim();
    const verifyRes = await fetch(`/api/auth/verify?${qs}`, {
      method: "POST",
      cache: "no-store",
      headers: priorToken ? { Authorization: `Bearer ${priorToken}` } : {},
    });
    const verifyText = await verifyRes.text();
    if (!verifyRes.ok) throw new Error(verifyText || `Auth verify failed (${verifyRes.status})`);
    const verifyJson = JSON.parse(verifyText || "{}");
    const remintedToken = String(verifyJson?.access_token || "").trim();
    if (!remintedToken) throw new Error("Access token could not be issued.");
    saveProcurementSession(requestedBy.trim(), pin.trim());
    // Guard against a transient STAFF fallback downgrading a privileged session.
    const baseAuth = (refreshed || auth) as Auth;
    const guarded = nonDowngradedAccess(
      baseAuth,
      verifyJson?.role,
      Array.isArray(verifyJson?.permissions) ? verifyJson.permissions : [],
    );
    setAuth({
      staffName: String(verifyJson?.staff_name || requestedBy).trim(),
      city: (String(verifyJson?.city || "manila").toLowerCase() === "manila" ? "manila" : "dubai"),
      role: guarded.role,
      pin: pin.trim(),
      accessToken: remintedToken,
      stepUpToken: stepUpToken || "",
      stepUpLevel: refreshed?.stepUpLevel || auth?.stepUpLevel,
      stepUpMethod: refreshed?.stepUpMethod || auth?.stepUpMethod,
      stepUpVerifiedAt: refreshed?.stepUpVerifiedAt || auth?.stepUpVerifiedAt,
      permissions: guarded.permissions,
      mfa: refreshed?.mfa || auth?.mfa,
    });
    return remintedToken;
  }

  // Phase 3: when the JWT is in the sz_access httpOnly cookie (accessToken = ""),
  // the Next.js proxy injects it automatically for /api/admin/* and /api/store/* routes,
  // and the backend reads it directly for other paths. Do NOT call remintAccessTokenWithPin()
  // when hasSession=true — that would hit /api/auth/verify on every procurement API call
  // and quickly exhaust the rate limit (8 calls per 10 min) during normal navigation.
  const hasActiveSession = !!(refreshed?.hasSession || auth?.hasSession);

  if (accessToken) {
    try {
      const sessionRes = await fetch(`/api/auth/session`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Only re-mint when the token is actually REJECTED (401/403); a transient
      // 5xx/timeout must not trigger a re-mint that can downgrade the session.
      if (sessionRes.status === 401 || sessionRes.status === 403) accessToken = "";
    } catch {
      /* network hiccup — keep the current token */
    }
  }
  if (!accessToken && !hasActiveSession) accessToken = await remintAccessTokenWithPin();
  if (!accessToken && !hasActiveSession) throw new Error("Please login again.");
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(stepUpToken ? { "X-Step-Up-Token": stepUpToken } : {}),
  };
}

/**
 * Convert a caught error into a user-readable string.
 * procurementJson already extracts FastAPI `detail` messages; this helper
 * polishes edge cases like network failures and opaque 5xx strings.
 */
export function friendlyProcurementError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "Unknown error");
  if (!raw || raw === "undefined" || raw === "null") return "Something went wrong. Please try again.";
  // Network failure
  if (/failed to fetch|networkerror|network request failed/i.test(raw))
    return "Network error — please check your connection and try again.";
  // Generic 5xx with no useful body
  if (/request failed \(5\d\d\)/i.test(raw))
    return "Server error — please try again in a moment.";
  // Token / auth
  if (/please login again|access token|unauthorized/i.test(raw))
    return "Session expired — please enter your PIN and try again.";
  // Keep backend detail messages as-is (they're already human-readable)
  return raw;
}

export async function procurementJson<T>(
  url: string,
  init: RequestInit,
  requestedBy: string,
  pin: string,
): Promise<T> {
  const headers = await procurementTokenHeaders(requestedBy, pin);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
      ...headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    // Extract FastAPI-style { "detail": "..." } message so users see readable errors
    let msg = text || `Request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string" && j.detail.trim()) msg = j.detail.trim();
    } catch { /* not JSON — keep raw text */ }
    throw new Error(msg);
  }
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new Error(`Invalid JSON response from server`);
  }
}
