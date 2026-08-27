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
  /** No longer returned to the client — the proxy keeps it in an httpOnly cookie. */
  access_token?: string;
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
  // The token is NOT stored here — /api/admin/impersonate keeps it in an
  // httpOnly cookie the proxies prefer over sz_access. localStorage only holds
  // who is being viewed, so the UI can label itself.
  const impAuth: Auth = {
    staffName: resp.impersonating,
    city: (resp.city === "manila" ? "manila" : "dubai") as "dubai" | "manila",
    cityLock:
      resp.city_lock === "dubai" || resp.city_lock === "manila"
        ? resp.city_lock
        : "",
    role: resp.role,
    accessToken: "",
    hasSession: true,
    permissions: resp.permissions,
  };
  setAuth(impAuth);
}

export async function exitImpersonation(): Promise<void> {
  if (typeof window === "undefined") return;
  // Clear the server-side cookie first. If this fails the API would keep
  // answering as the impersonated staff member while the UI showed the admin.
  try {
    await fetch("/api/admin/impersonate", { method: "DELETE", cache: "no-store" });
  } catch {
    // Fall through: the cookie expires on its own after four hours.
  }
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
