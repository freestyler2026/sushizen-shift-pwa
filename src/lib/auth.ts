// src/lib/auth.ts
export type City = "dubai" | "manila";

// ✅ 正式名
export type StaffRole = "STAFF" | "MANAGER" | "HQ" | "ADMIN";
// ✅ 互換のため alias を残す（LoginClient などが type Role を使ってもOK）
export type Role = StaffRole;

export type Auth = {
  staffName: string;
  city: City;
  role?: StaffRole;
  pin?: string; // ✅ ローカル保存用（必要なら）
};

const KEY = "sushizen_shift_auth";

function safeParse(json: string | null): any | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeCity(v: any): City {
  const s = String(v || "").toLowerCase();
  return s === "manila" ? "manila" : "dubai";
}

function normalizeRole(v: any): StaffRole | undefined {
  const s = String(v || "").toUpperCase();
  if (s === "ADMIN" || s === "HQ" || s === "MANAGER" || s === "STAFF") return s as StaffRole;
  return undefined;
}

/**
 * Read auth from localStorage.
 * Accepts both {staffName} and {staff_name}.
 */
export function getAuth(): Auth | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(KEY);
  const obj = safeParse(raw);
  if (!obj) return null;

  const staffName = String(obj.staffName || obj.staff_name || "").trim();
  if (!staffName) return null;

  return {
    staffName,
    city: normalizeCity(obj.city),
    role: normalizeRole(obj.role) || "STAFF",
    pin: obj.pin ? String(obj.pin) : undefined,
  };
}

export function setAuth(a: Auth) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      staffName: a.staffName,
      city: a.city,
      role: a.role || "STAFF",
      pin: a.pin || "", // ✅ 保存するなら。保存しない運用にするならこの行ごと削除してOK
    })
  );
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function isAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  return (x?.role || "").toString().toUpperCase() === "ADMIN";
}