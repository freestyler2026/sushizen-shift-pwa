// src/lib/impersonation.ts
import { type Auth, getAuth, setAuth } from "@/lib/auth";

const BACKUP_KEY = "sushizen_shift_auth_pre_imp";

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(BACKUP_KEY));
}

export type ImpersonationInfo = {
  impersonating: string;
  impersonatedBy: string;
};

export function getImpersonationInfo(): ImpersonationInfo | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  try {
    const backup = JSON.parse(raw);
    const current = getAuth();
    return {
      impersonating: current?.staffName || "Unknown",
      impersonatedBy: String(backup?.staffName || "Admin"),
    };
  } catch {
    return null;
  }
}

export type ImpersonateResp = {
  ok: boolean;
  impersonating: string;
  role: string;
  city: string;
  city_lock?: string;
  permissions: string[];
  access_token: string;
  impersonated_by: string;
};

export function startImpersonation(resp: ImpersonateResp): void {
  if (typeof window === "undefined") return;
  const current = getAuth();
  // Save original auth so we can restore it on exit
  window.localStorage.setItem(
    BACKUP_KEY,
    JSON.stringify({
      staffName: current?.staffName || "",
      city: current?.city || "dubai",
      cityLock: current?.cityLock || "",
      role: current?.role || "STAFF",
      pin: current?.pin || "",
      hasSession: current?.hasSession ?? false,
      accessToken: current?.accessToken || "",
      sessionId: current?.sessionId || "",
      stepUpToken: current?.stepUpToken || "",
      stepUpLevel: current?.stepUpLevel || "",
      stepUpMethod: current?.stepUpMethod || "",
      stepUpVerifiedAt: current?.stepUpVerifiedAt || "",
      permissions: current?.permissions || [],
    })
  );
  // Set the impersonated session (token lives in localStorage, not httpOnly cookie)
  const impAuth: Auth = {
    staffName: resp.impersonating,
    city: (resp.city === "manila" ? "manila" : "dubai") as "dubai" | "manila",
    cityLock:
      resp.city_lock === "dubai" || resp.city_lock === "manila"
        ? resp.city_lock
        : "",
    role: resp.role,
    accessToken: resp.access_token,
    hasSession: true,
    permissions: resp.permissions,
  };
  setAuth(impAuth);
}

export function exitImpersonation(): void {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(BACKUP_KEY);
  if (!raw) return;
  window.localStorage.removeItem(BACKUP_KEY);
  try {
    const backup = JSON.parse(raw);
    const restored: Auth = {
      staffName: backup.staffName || "",
      city: (backup.city === "manila" ? "manila" : "dubai") as "dubai" | "manila",
      cityLock:
        backup.cityLock === "dubai" || backup.cityLock === "manila"
          ? backup.cityLock
          : "",
      role: backup.role || "STAFF",
      pin: backup.pin || undefined,
      hasSession: backup.hasSession ?? true,
      accessToken: backup.accessToken || undefined,
      sessionId: backup.sessionId || undefined,
      stepUpToken: backup.stepUpToken || undefined,
      stepUpLevel: backup.stepUpLevel || undefined,
      stepUpMethod: backup.stepUpMethod || undefined,
      stepUpVerifiedAt: backup.stepUpVerifiedAt || undefined,
      permissions: backup.permissions || [],
    };
    setAuth(restored);
  } catch {
    // Backup corrupted — clear state, user will need to log in again
  }
}
