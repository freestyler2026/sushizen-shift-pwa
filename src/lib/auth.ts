// src/lib/auth.ts
export type City = "dubai" | "manila";

export type StaffRole = string;
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
  cityLock?: string; // '' = all cities, 'dubai' = Dubai-only, 'manila' = Manila-only
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
export const STEP_UP_FRESH_MS = 30 * 60 * 1000;

function getAuthApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
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
  return s || undefined;
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

  const cityLockRaw = String(obj.cityLock ?? obj.city_lock ?? "").toLowerCase();
  return {
    staffName,
    city: normalizeCity(obj.city),
    cityLock: cityLockRaw === "dubai" || cityLockRaw === "manila" ? cityLockRaw : "",
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
      cityLock: a.cityLock ?? "",
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

export async function refreshAuthFromApi(
  a?: Auth | null,
  options?: {
    includeMfa?: boolean;
  }
): Promise<Auth | null> {
  const current = a ?? getAuth();
  if (!current?.staffName) return current;
  const includeMfa = Boolean(options?.includeMfa);

  const remintAccessTokenWithPin = async (): Promise<Auth | null> => {
    if (!current.pin) return null;
    const qs = new URLSearchParams({
      staff_name: current.staffName,
      pin: current.pin,
      city: current.city,
      ...(includeMfa ? { include_mfa: "1" } : {}),
    }).toString();
    const verifyRes = await fetch(buildAuthApiUrl(`/api/auth/verify?${qs}`), {
      method: "POST",
      cache: "no-store",
    });
    if (!verifyRes.ok) return null;

    const verified = await verifyRes.json();
    const verifiedCityLockRaw = String(verified?.city_lock ?? "").toLowerCase();
    const migrated: Auth = {
      staffName: String(verified?.staff_name || current.staffName).trim(),
      city: normalizeCity(verified?.city || current.city),
      cityLock: verifiedCityLockRaw === "dubai" || verifiedCityLockRaw === "manila" ? verifiedCityLockRaw : "",
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

    const sessionPath = includeMfa ? "/api/auth/session?include_mfa=1" : "/api/auth/session";
    const res = await fetch(buildAuthApiUrl(sessionPath), {
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
    const sessionCityLockRaw = String(data?.city_lock ?? "").toLowerCase();
    const next: Auth = {
      staffName: String(data?.staff_name || current.staffName).trim(),
      city: normalizeCity(data?.city || current.city),
      cityLock: sessionCityLockRaw === "dubai" || sessionCityLockRaw === "manila" ? sessionCityLockRaw : (current.cityLock ?? ""),
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
  if (typeof window !== "undefined" && window.location?.origin) {
    headers["X-WebAuthn-Origin"] = window.location.origin;
  }
  return headers;
}

export function hasPermission(permission: string, a?: Auth | null): boolean {
  const current = a ?? getAuth();
  const permissions = current?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyPermission(permissionKeys: string[], a?: Auth | null): boolean {
  return permissionKeys.some((permission) => hasPermission(permission, a));
}

export function channelPermissionKey(channelKey: string, action: string) {
  return `channel.${channelKey}.${action}`;
}

export function hasChannelAccess(channelKey: string, actions: string[] = ["view"], a?: Auth | null): boolean {
  return hasAnyPermission(actions.map((action) => channelPermissionKey(channelKey, action)), a);
}

export function isAdmin(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  return (x?.role || "").toString().toUpperCase() === "ADMIN";
}

export function canAccessAdminNav(a?: Auth | null): boolean {
  return hasAnyPermission(
    [
      "channel.admin.dashboard.view",
      "channel.admin.daily_inventory.view",
      "channel.admin.daily_inventory.write",
      "channel.admin.inventory.view",
      "channel.admin.menu.view",
      "channel.admin.private_reports.view",
      "channel.admin.procurement.view",
      "channel.admin.cost_calculation.view",
      "channel.admin.analytics.view",
      "channel.admin.ai_analytics_pro.view",
      "channel.admin.attendance.view",
      "channel.admin.absences.view",
      "channel.admin.renewals.view",
      "channel.admin.staff.view",
      "channel.admin.staff.manage_roles",
      "channel.admin.draft.view",
      "channel.admin.backoffice_evaluation.view",
    ],
    a,
  );
}

/** Daily Inventory admin route — keep in sync with ACCESS_CHANNELS in backend `app/access_control.py`. */
export function canAccessDailyInventoryAdmin(a?: Auth | null): boolean {
  return hasChannelAccess("admin.daily_inventory", ["view", "write"], a);
}

/** Renewals admin — matches `admin.renewals` channel in `app/access_control.py`. */
export function canAccessRenewalsAdmin(a?: Auth | null): boolean {
  return hasChannelAccess("admin.renewals", ["view"], a);
}

/** AI Analytics Pro — matches `admin.ai_analytics_pro` channel in `app/access_control.py`. */
export function canAccessAiAnalyticsProAdmin(a?: Auth | null): boolean {
  return hasChannelAccess("admin.ai_analytics_pro", ["view"], a);
}

export function canAccessPrivateReportAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.private_reports.view", "private_report.read"], a);
}

export function canAccessBackofficeEvaluationAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.backoffice_evaluation.view", "backoffice_eval.read"], a);
}

export function procurementMarketFromAuth(a?: Auth | null): City {
  const x = a ?? getAuth();
  return String(x?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
}

export function canAccessProcurementAdmin(roleOrAuth: string | Auth | null | undefined, market: City): boolean {
  if (typeof roleOrAuth === "object" || roleOrAuth == null) {
    const authValue = typeof roleOrAuth === "object" ? roleOrAuth || undefined : undefined;
    return hasAnyPermission(["channel.admin.procurement.view", "procurement.request.write", "procurement.approval.act"], authValue);
  }
  const normalizedRole = String(roleOrAuth || "").toUpperCase();
  const current = getAuth();
  if (current && String(current.role || "").toUpperCase() === normalizedRole) {
    if (hasAnyPermission(["channel.admin.procurement.view", "procurement.request.write", "procurement.approval.act"], current)) {
      return true;
    }
  }
  if (normalizedRole === "HQ") return true;
  if (market === "manila") return normalizedRole === "MANILA_MANAGEMENT";
  if (market === "dubai") return normalizedRole === "DUBAI_MANAGEMENT";
  return false;
}

export function canAccessInventoryAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.inventory.write", "inventory.write"], a);
}

export function canAccessInventoryLimited(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.inventory.view", "inventory.read"], a) && !canAccessInventoryAdmin(a);
}

export function canAccessInventoryWorkspace(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.inventory.view", "channel.admin.inventory.write", "inventory.read", "inventory.write"], a);
}

/** Nav guard: only channel.admin.inventory permissions — excludes legacy inventory.read/write that all STAFF have */
export function canAccessInventoryAdminNav(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.inventory.view", "channel.admin.inventory.write"], a);
}

/** Admin dashboard nav — requires explicit dashboard permission */
export function canAccessAdminDashboard(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.dashboard.view"], a);
}

/** Analytics admin nav — requires explicit analytics permission */
export function canAccessAnalyticsAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.analytics.view"], a);
}

/** Attendance admin nav — requires explicit attendance permission */
export function canAccessAttendanceAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.attendance.view"], a);
}

/** Absences admin nav — requires explicit absences permission */
export function canAccessAbsencesAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.absences.view"], a);
}

/** Staff admin nav — requires explicit staff permission */
export function canAccessStaffAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.staff.view", "channel.admin.staff.manage_roles"], a);
}

/** Draft admin nav — requires explicit draft permission */
export function canAccessDraftAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.draft.view"], a);
}

export function canAccessMenuAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.menu.view", "channel.admin.menu.write", "menu.read", "menu.write"], a);
}

export function canAccessCostAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.cost_calculation.view", "channel.admin.cost_calculation.write", "cost.read", "cost.write"], a);
}

export function canAccessCountTemplatesAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.inventory.write", "inventory.write"], a);
}

export function canViewSalesAnalytics(a?: Auth | null, cityHint?: City): boolean {
  const x = a ?? getAuth();
  const city = cityHint || x?.city || "dubai";
  if (hasAnyPermission(["channel.admin.analytics.view", "analytics.read.sales"], x)) return true;
  return city === "dubai"
    ? hasPermission("analytics.read.finance.city", x)
    : hasPermission("analytics.read.finance.city", x);
}

export function canViewManagementPl(a?: Auth | null): boolean {
  return hasAnyPermission(["pl.sync.city", "pl.import.excel", "pl.allocation.write"], a);
}

export function canAccessRoleManagement(a?: Auth | null): boolean {
  const x = a ?? getAuth();
  return String(x?.role || "").toUpperCase() === "HQ";
}

/** Incident Report admin — matches `admin.incident_reports` channel in `app/access_control.py`. */
export function canAccessIncidentReportAdmin(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.admin.incident_reports.view", "incident_report.read", "incident_report.reply"], a);
}

/** Incident Report staff channel — matches `incident_report` channel in `app/access_control.py`. */
export function canAccessIncidentReport(a?: Auth | null): boolean {
  return hasAnyPermission(["channel.incident_report.view", "incident_report.submit.self", "incident_report.inbox.read"], a);
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
  return elapsedMs >= 0 && elapsedMs <= STEP_UP_FRESH_MS;
}

/**
 * If the access token expired within the server grace window, exchange it for a new one.
 * Updates localStorage on success. Does not replace PIN-based remint when no token exists.
 */
export async function tryRefreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const current = getAuth();
  if (!current?.accessToken) return false;

  try {
    const res = await fetch(buildAuthApiUrl("/api/auth/refresh"), {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${current.accessToken}`,
        ...(window.location?.origin ? { "X-WebAuthn-Origin": window.location.origin } : {}),
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string };
    const nextToken = String(data?.access_token || "").trim();
    if (!nextToken) return false;
    setAuth({ ...current, accessToken: nextToken });
    return true;
  } catch {
    return false;
  }
}