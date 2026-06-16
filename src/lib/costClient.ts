"use client";

import { getAuth, refreshAuthFromApi, setAuth, nonDowngradedAccess, type Auth } from "@/lib/auth";

function parseApiErrorDetail(text: string, fallback: string): string {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    if (/application error/i.test(trimmed) || /request timeout/i.test(trimmed)) {
      return "Server timeout. Please retry in a few seconds.";
    }
    return fallback;
  }
  try {
    const parsed = JSON.parse(trimmed || "{}");
    const detail = parsed?.detail;
    // FastAPI validation errors return detail as an array of {loc, msg, type} objects
    if (Array.isArray(detail)) {
      const msgs = detail.map((d: any) => {
        const loc = Array.isArray(d?.loc) ? d.loc.filter((l: any) => l !== "body").join(".") : "";
        return loc ? `${loc}: ${d?.msg ?? ""}` : String(d?.msg ?? "");
      }).filter(Boolean);
      return msgs.length ? msgs.join("; ") : fallback;
    }
    // detail is an object (but not array)
    if (detail !== null && typeof detail === "object") {
      return parsed?.message ? String(parsed.message) : fallback;
    }
    return String(detail || parsed?.message || fallback);
  } catch {
    return trimmed || fallback;
  }
}

async function costTokenHeaders(): Promise<Record<string, string>> {
  const auth = getAuth();
  const refreshed = await refreshAuthFromApi(auth);
  let accessToken = refreshed?.accessToken || auth?.accessToken || "";
  const stepUpToken = refreshed?.stepUpToken || auth?.stepUpToken || "";

  async function remintAccessTokenWithPin(): Promise<string> {
    const staffName = String(refreshed?.staffName || auth?.staffName || "").trim();
    const pin = String(refreshed?.pin || auth?.pin || "").trim();
    if (!staffName || !pin) return "";
    const authCity = String(refreshed?.city || auth?.city || "dubai").toLowerCase() === "manila" ? "manila" : "dubai";
    const qs = new URLSearchParams({
      staff_name: staffName,
      pin,
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
    if (!verifyRes.ok) {
      throw new Error(parseApiErrorDetail(verifyText, `Auth verify failed (${verifyRes.status})`));
    }
    const verifyJson = JSON.parse(verifyText || "{}");
    const remintedToken = String(verifyJson?.access_token || "").trim();
    if (!remintedToken) throw new Error("Access token could not be issued.");
    // Guard against a transient STAFF fallback downgrading a privileged session
    // mid-task (which would kick the user to the Staff Portal and drop edits).
    const baseAuth = (refreshed || auth) as Auth;
    const guarded = nonDowngradedAccess(
      baseAuth,
      verifyJson?.role,
      Array.isArray(verifyJson?.permissions) ? verifyJson.permissions : [],
    );
    setAuth({
      staffName: String(verifyJson?.staff_name || staffName).trim(),
      city: String(verifyJson?.city || authCity).toLowerCase() === "manila" ? "manila" : "dubai",
      role: guarded.role,
      pin,
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

  if (accessToken) {
    try {
      const sessionRes = await fetch(`/api/auth/session`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Only re-mint when the token is actually REJECTED (401/403). A transient
      // 5xx/timeout must not trigger a re-mint — that races a STAFF fallback and
      // can downgrade the session mid-task. The server still enforces real
      // permissions on every subsequent request, so keeping the token is safe.
      if (sessionRes.status === 401 || sessionRes.status === 403) accessToken = "";
    } catch {
      /* network hiccup — keep the current token */
    }
  }

  if (!accessToken) accessToken = await remintAccessTokenWithPin();
  if (!accessToken) throw new Error("Please login again.");

  return {
    Authorization: `Bearer ${accessToken}`,
    ...(stepUpToken ? { "X-Step-Up-Token": stepUpToken } : {}),
    ...(typeof window !== "undefined" && window.location?.origin ? { "X-WebAuthn-Origin": window.location.origin } : {}),
  };
}

export async function costJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const authHeaders = await costTokenHeaders();
  const headers = {
    ...(init.headers || {}),
    ...(init.body ? { "Content-Type": reqContentType(init.headers) } : {}),
    ...authHeaders,
  };
  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseApiErrorDetail(text, `Request failed (${res.status})`));
  }
  return JSON.parse(text || "{}") as T;
}

export async function costUpload<T>(url: string, formData: FormData): Promise<T> {
  const authHeaders = await costTokenHeaders();
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders,
    body: formData,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseApiErrorDetail(text, `Upload failed (${res.status})`));
  }
  return JSON.parse(text || "{}") as T;
}

function reqContentType(headers: RequestInit["headers"]): string {
  if (headers && !Array.isArray(headers) && !(headers instanceof Headers) && "Content-Type" in headers) {
    return String(headers["Content-Type"] || "application/json");
  }
  if (headers instanceof Headers) {
    return headers.get("Content-Type") || "application/json";
  }
  return "application/json";
}
