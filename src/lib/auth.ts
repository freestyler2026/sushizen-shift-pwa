// src/lib/auth.ts
export type City = "dubai" | "manila";

// ✅ 正式名
export type StaffRole =
  | "STAFF"
  | "MANAGER"
  | "MANAGEMENT"
  | "HR_MANAGER"
  | "HQ"
  | "ADMIN"
  | "DUBAI_MANAGEMENT"
  | "MANILA_MANAGEMENT";
// ✅ 互換のため alias を残す（LoginClient などが type Role を使ってもOK）
export type Role = StaffRole;

export type StepUpLevel = "aal1" | "aal2" | "phishing_resistant";

export type MfaStatus = {
  passkeyCount?: number;
  totpEnabled?: boolean;
  backupCodesRemaining?: number;
  methods?: string[];
  requiredForAdmin?: boolean;
};

export type Auth = {
  staffName: string;
  city: City;
  role?: StaffRole;
  pin?: string;
  accessToken?: string;
  stepUpToken?: string;
  stepUpLevel?: StepUpLevel;
  stepUpMethod?: string;
  stepUpVerifiedAt?: string;
  permissions?: string[];
  mfa?: MfaStatus;
};

const KEY = "sushizen_shift_auth";

function getAuthApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "";
}

function buildAuthApiUrl(path: string) {
  return `${getAuthApiBase()}${path}`;
}

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
  if (
    s === "ADMIN" ||
    s === "HQ" ||
    s === "MANAGER" ||
    s === "MANAGEMENT" ||
    s === "HR_MANAGER" ||
    s === "STAFF" ||
    s === "DUBAI_MANAGEMENT" ||
    s === "MANILA_MANAGEMENT"
  ) {
    return s as StaffRole;
  }
  return undefined;
}

function normalizeStepUpLevel(v: any): StepUpLevel | undefined {
  const s = String(v || "").trim();
  if (s === "aal1" || s === "aal2" || s === "phishing_resistant") return s;
  return undefined;
}

function normalizePermissions(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeMfaStatus(value: any): MfaStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  return {
    passkeyCount: Number.isFinite(Number(value.passkeyCount ?? value.passkey_count)) ? Number(value.passkeyCount ?? value.passkey_count) : 0,
    totpEnabled: Boolean(value.totpEnabled ?? value.totp_enabled),
    backupCodesRemaining: Number.isFinite(Number(value.backupCodesRemaining ?? value.backup_codes_remaining))
      ? Number(value.backupCodesRemaining ?? value.backup_codes_remaining)
      : 0,
    methods: Array.isArray(value.methods) ? value.methods.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
    requiredForAdmin: Boolean(value.requiredForAdmin ?? value.required_for_admin),
  };
}

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
    accessToken: obj.accessToken ? String(obj.accessToken) : undefined,
    stepUpToken: obj.stepUpToken ? String(obj.stepUpToken) : undefined,
    stepUpLevel: normalizeStepUpLevel(obj.stepUpLevel),
    stepUpMethod: obj.stepUpMethod ? String(obj.stepUpMethod) : undefined,
    stepUpVerifiedAt: obj.stepUpVerifiedAt ? String(obj.stepUpVerifiedAt) : undefined,
    permissions: normalizePermissions(obj.permissions),
    mfa: normalizeMfaStatus(obj.mfa),
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
      pin: a.pin || "",
      accessToken: a.accessToken || "",
      stepUpToken: a.stepUpToken || "",
      stepUpLevel: a.stepUpLevel || "",
      stepUpMethod: a.stepUpMethod || "",
      stepUpVerifiedAt: a.stepUpVerifiedAt || "",
      permissions: Array.isArray(a.permissions) ? a.permissions : [],
      mfa: a.mfa || {},
    })
  );
}

export async function refreshAuthFromApi(a?: Auth | null): Promise<Auth | null> {
  const current = a ?? getAuth();
  if (!current?.staffName) return current;

  const remintAccessTokenWithPin = async (): Promise<Auth | null> => {
    if (!current.pin) return null;
    const qs = new URLSearchParams({
      staff_name: current.staffName,
      pin: current.pin,
      city: current.city,
    }).toString();
    const verifyRes = await fetch(buildAuthApiUrl(`/api/auth/verify?${qs}`), {
      method: "POST",
      cache: "no-store",
    });
    if (!verifyRes.ok) return null;

    const verified = await verifyRes.json();
    const migrated: Auth = {
      staffName: String(verified?.staff_name || current.staffName).trim(),
      city: normalizeCity(verified?.city || current.city),
      role: normalizeRole(verified?.role) || current.role || "STAFF",
      pin: current.pin,
      accessToken: String(verified?.access_token || "").trim() || current.accessToken,
      permissions: normalizePermissions(verified?.permissions),
      mfa: normalizeMfaStatus(verified?.mfa) || current.mfa,
      stepUpToken: current.stepUpToken,
      stepUpLevel: current.stepUpLevel,
      stepUpMethod: current.stepUpMethod,
      stepUpVerifiedAt: current.stepUpVerifiedAt,
    };
    setAuth(migrated);
    return migrated;
  };

  try {
    // Legacy session migration:
    // if token is missing but local PIN exists, mint a fresh access token.
    if (!current.accessToken) {
      const migrated = await remintAccessTokenWithPin();
      if (migrated) return migrated;
    }

    if (!current.accessToken) return current;

    const res = await fetch(buildAuthApiUrl("/api/auth/session"), {
      method: "GET",
      cache: "no-store",
      headers: getAuthHeaders(current),
    });
    if (!res.ok) {
      // Token may be expired/rotated: try legacy PIN remint when available.
      if (res.status === 401 || res.status === 403) {
        const migrated = await remintAccessTokenWithPin();
        if (migrated) return migrated;
      }
      return current;
    }

    const data = await res.json();
    const next: Auth = {
      staffName: String(data?.staff_name || current.staffName).trim(),
      city: normalizeCity(data?.city || current.city),
      role: normalizeRole(data?.role) || current.role || "STAFF",
      pin: current.pin,
      accessToken: current.accessToken,
      stepUpToken: current.stepUpToken,
      stepUpLevel: normalizeStepUpLevel(data?.step_up?.level) || current.stepUpLevel,
      stepUpMethod: String(data?.step_up?.method || current.stepUpMethod || ""),
      stepUpVerifiedAt: String(data?.step_up?.verified_at || current.stepUpVerifiedAt || ""),
      permissions: normalizePermissions(data?.permissions),
      mfa: normalizeMfaStatus(data?.mfa) || current.mfa,
    };
    setAuth(next);
    return next;
  } catch {
    return current;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function setStepUpAuth(payload: {
  stepUpToken: string;
  stepUpLevel: StepUpLevel;
  stepUpMethod?: string;
}) {
  const current = getAuth();
  if (!current) return;
  setAuth({
    ...current,
    stepUpToken: payload.stepUpToken,
    stepUpLevel: payload.stepUpLevel,
    stepUpMethod: payload.stepUpMethod || "",
    stepUpVerifiedAt: new Date().toISOString(),
  });
}

export function clearStepUpAuth() {
  const current = getAuth();
  if (!current) return;
  setAuth({
    ...current,
    stepUpToken: "",
    stepUpLevel: "aal1",
    stepUpMethod: "",
    stepUpVerifiedAt: "",
  });
}

export function getAuthHeaders(a?: Auth | null): HeadersInit {
  const current = a ?? getAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`;
  if (current?.stepUpToken) headers["X-Step-Up-Token"] = current.stepUpToken;
  return headers;
}

export function hasPermission(permission: string, a?: Auth | null): boolean {
  const current = a ?? getAuth();
  const permissions = current?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function isAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  return (x?.role || "").toString().toUpperCase() === "ADMIN";
}

export function canAccessAdminNav(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "ADMIN" || role === "HQ" || role === "MANAGEMENT" || role === "DUBAI_MANAGEMENT" || role === "MANILA_MANAGEMENT";
}

export function canAccessPrivateReportAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "ADMIN" || role === "HR_MANAGER";
}

export function canAccessBackofficeEvaluationAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "HR_MANAGER";
}

export function canAccessProcurementAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "HR_MANAGER" || role === "ADMIN" || role === "MANILA_MANAGEMENT";
}

export function canAccessInventoryAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "HR_MANAGER" || role === "ADMIN" || role === "DUBAI_MANAGEMENT" || role === "MANILA_MANAGEMENT";
}

export function canAccessCountTemplatesAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "ADMIN";
}

export function canViewSalesAnalytics(a?: Auth | null, cityHint?: City): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  const city = cityHint || x?.city || "dubai";
  return role === "HQ" || role === "ADMIN" || role === "MANAGEMENT" || (role === "DUBAI_MANAGEMENT" && city === "dubai") || (role === "MANILA_MANAGEMENT" && city === "manila");
}

export function canViewManagementPl(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const role = (x?.role || "").toString().toUpperCase();
  return role === "HQ" || role === "ADMIN";
}

export function stepUpSatisfies(required: StepUpLevel, a?: Auth | null): boolean {
  const x = a ?? getAuth();
  const current = x?.stepUpLevel || "aal1";
  const rank = { aal1: 1, aal2: 2, phishing_resistant: 3 };
  if (rank[current] < rank[required]) return false;

  // Enforce step-up freshness on the client as well.
  // Backend is authoritative, but this prevents stale UI visibility.
  const verifiedAtRaw = (x?.stepUpVerifiedAt || "").trim();
  if (!verifiedAtRaw) return false;
  const verifiedAtMs = Date.parse(verifiedAtRaw);
  if (!Number.isFinite(verifiedAtMs)) return false;
  const elapsedMs = Date.now() - verifiedAtMs;
  const maxFreshMs = 15 * 60 * 1000; // 15 minutes
  return elapsedMs >= 0 && elapsedMs <= maxFreshMs;
}