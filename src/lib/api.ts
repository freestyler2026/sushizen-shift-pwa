// src/lib/api.ts
import { getAuthHeaders, tryRefreshAccessToken } from "@/lib/auth";

export type ShiftRow = {
  work_date: string;
  branch_code: string;
  area: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
  is_exception: boolean;
  override: any | null;
  applied: any | null;
};

export type DayView = {
  city: string;
  work_date: string;
  count: number;
  rows: ShiftRow[];
};

export type WeekDay = {
  city: string;
  work_date: string;
  count: number;
  rows: ShiftRow[];
};

export type WeekView = {
  city: string;
  start_date: string;
  days: WeekDay[];
};

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

// ✅ 空なら同一オリジン（相対パス）で叩く
export const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";

export function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const doFetch = () =>
    fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: getAuthHeaders(),
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) res = await doFetch();
  }

  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path}`;
  const doFetch = () =>
    fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: getAuthHeaders(),
      body: JSON.stringify(body ?? {}),
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) res = await doFetch();
  }

  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  return (text ? JSON.parse(text) : {}) as T;
}