"use client";

import { getAuth, refreshAuthFromApi, setAuth } from "@/lib/auth";

export function defaultProcurementName(): string {
  return getAuth()?.staffName || "";
}

export function defaultProcurementPin(): string {
  return getAuth()?.pin || "";
}

export async function procurementTokenHeaders(requestedBy: string, pin: string): Promise<Record<string, string>> {
  const auth = getAuth();
  const refreshed = await refreshAuthFromApi(auth);
  let accessToken = refreshed?.accessToken || auth?.accessToken || "";
  const stepUpToken = refreshed?.stepUpToken || auth?.stepUpToken || "";

  async function remintAccessTokenWithPin(): Promise<string> {
    if (!requestedBy.trim() || !pin.trim()) return "";
    const qs = new URLSearchParams({
      staff_name: requestedBy.trim(),
      pin: pin.trim(),
      city: "manila",
    }).toString();
    const verifyRes = await fetch(`/api/auth/verify?${qs}`, {
      method: "POST",
      cache: "no-store",
    });
    const verifyText = await verifyRes.text();
    if (!verifyRes.ok) throw new Error(verifyText || `Auth verify failed (${verifyRes.status})`);
    const verifyJson = JSON.parse(verifyText || "{}");
    const remintedToken = String(verifyJson?.access_token || "").trim();
    if (!remintedToken) throw new Error("Access token could not be issued.");
    setAuth({
      staffName: String(verifyJson?.staff_name || requestedBy).trim(),
      city: (String(verifyJson?.city || "manila").toLowerCase() === "manila" ? "manila" : "dubai"),
      role: (verifyJson?.role || refreshed?.role || auth?.role || "STAFF"),
      pin: pin.trim(),
      accessToken: remintedToken,
      stepUpToken: stepUpToken || "",
      stepUpLevel: refreshed?.stepUpLevel || auth?.stepUpLevel,
      stepUpMethod: refreshed?.stepUpMethod || auth?.stepUpMethod,
      stepUpVerifiedAt: refreshed?.stepUpVerifiedAt || auth?.stepUpVerifiedAt,
      permissions: Array.isArray(verifyJson?.permissions) ? verifyJson.permissions : (refreshed?.permissions || auth?.permissions || []),
      mfa: refreshed?.mfa || auth?.mfa,
    });
    return remintedToken;
  }

  if (accessToken) {
    const sessionRes = await fetch(`/api/auth/session`, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!sessionRes.ok) accessToken = "";
  }
  if (!accessToken) accessToken = await remintAccessTokenWithPin();
  if (!accessToken) throw new Error("Please login again.");
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(stepUpToken ? { "X-Step-Up-Token": stepUpToken } : {}),
  };
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
      ...(init.headers || {}),
      ...headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return JSON.parse(text || "{}") as T;
}
