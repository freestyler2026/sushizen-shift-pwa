"use client";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function normalizeApiErrorMessage(raw: string, fallback: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return fallback;
  if (text.includes("<!DOCTYPE html") || lower.includes("<html") || lower.includes("application error")) {
    return "Server timed out while loading inventory data. Please retry.";
  }
  if (lower.includes("h12") || lower.includes("request timeout") || lower.includes("503")) {
    return "Server timed out while loading inventory data. Please retry.";
  }
  return text;
}

async function requestWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const current = getAuth();
  const attempt = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...getAuthHeaders(current),
        ...(init?.headers || {}),
      },
    });

  let res = await attempt();
  if (res.ok || res.status !== 401) return res;

  await refreshAuthFromApi(current);
  const refreshed = getAuth();
  res = await fetch(`${getApiBase()}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...getAuthHeaders(refreshed),
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function inventoryFetch(path: string, init?: RequestInit): Promise<Response> {
  return requestWithAuth(path, init);
}

async function parseJson<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const json = JSON.parse(text);
      detail = typeof json?.detail === "string" ? json.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(normalizeApiErrorMessage(detail || text, fallback));
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function inventoryGet<T = any>(path: string): Promise<T> {
  const res = await requestWithAuth(path, { method: "GET" });
  return parseJson<T>(res, `GET ${path} failed`);
}

export async function inventoryPost<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await requestWithAuth(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJson<T>(res, `POST ${path} failed`);
}

export async function inventoryPatch<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await requestWithAuth(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJson<T>(res, `PATCH ${path} failed`);
}

export async function inventoryFormPost<T = any>(path: string, formData: FormData): Promise<T> {
  const res = await requestWithAuth(path, {
    method: "POST",
    body: formData,
  });
  return parseJson<T>(res, `POST ${path} failed`);
}
