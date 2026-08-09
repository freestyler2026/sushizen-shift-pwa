"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAuth, setAuth, clearAuth, type Auth } from "@/lib/auth";

const POLL_MS = 5 * 60 * 1000;
const SKIP_PATHS = new Set(["/", "/login", "/signup", "/setup-pin"]);
const RELOAD_GUARD_KEY = "zen:reload-attempt";
const RELOAD_GUARD_MS = 30_000;
const FORCE_RELOAD_DONE_KEY = "zen:force-reload-done";
const FORCE_RELOAD_WINDOW_MS = 30 * 60 * 1000; // 30 min — matches server window

const REASON_MESSAGES: Record<string, string> = {
  account_frozen: "Your account has been frozen. Please contact your manager.",
  expired: "Your session has expired. Please log in again.",
  absolute_expired: "Your session has expired. Please log in again.",
  invalidated: "You have been logged out remotely.",
  force_logout_by_admin: "You have been logged out by an administrator.",
  new_login_elsewhere: "A new login was detected on another device.",
};

function guardedHardReload(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return; // guard — let AutoReload handle the error
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — proceed
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const raw = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((-raw.length) % 4);
    return JSON.parse(atob(raw + pad));
  } catch {
    return null;
  }
}

export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const kicked = useRef(false);
  const permissionsVersion = useRef<number>(-1);

  const refreshPermissions = async (auth: Auth) => {
    const token = auth.accessToken;
    if (!token) return;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-store" },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; access_token?: string };
      if (!data.ok || !data.access_token) return;
      const payload = decodeTokenPayload(data.access_token);
      if (!payload) return;
      setAuth({
        ...auth,
        accessToken: data.access_token,
        permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : auth.permissions,
        role: (payload.role as string) || auth.role,
      });
    } catch { /* Network error — ignore */ }
  };

  const check = async () => {
    if (kicked.current) return;
    const auth = getAuth();

    // Call API for all authenticated users (not just session-tracked ones).
    // JWT-only users (HQ/ADMIN) have no sessionId but still need the force_reload signal.
    if (!auth?.staffName) return;

    try {
      const headers: Record<string, string> = { "Cache-Control": "no-store" };
      if (auth.sessionId) headers["X-Session-Id"] = auth.sessionId;

      const res = await fetch("/api/auth/session-check", {
        method: "GET",
        credentials: "same-origin",
        headers,
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = (await res.json()) as { valid: boolean; reason?: string; force_reload?: boolean; permissions_version?: number };

      // Detect permissions_version change → silently refresh token to pick up new permissions.
      if (typeof data.permissions_version === "number") {
        if (permissionsVersion.current === -1) {
          permissionsVersion.current = data.permissions_version;
        } else if (data.permissions_version !== permissionsVersion.current) {
          permissionsVersion.current = data.permissions_version;
          await refreshPermissions(auth);
        }
      }

      // force_reload is an HQ-triggered emergency signal.
      // Use localStorage cooldown so users are only reloaded once per 30-min window,
      // not on every subsequent 5-minute poll while the window stays active.
      if (data.force_reload) {
        try {
          const lastDone = Number(localStorage.getItem(FORCE_RELOAD_DONE_KEY) || 0);
          if (Date.now() - lastDone < FORCE_RELOAD_WINDOW_MS) return; // already reloaded this window
          localStorage.setItem(FORCE_RELOAD_DONE_KEY, String(Date.now()));
        } catch { /* localStorage unavailable — proceed */ }
        guardedHardReload();
        return;
      }

      if (data.valid) return;

      const reason = data.reason ?? "invalidated";
      if (reason === "no_session_id" || reason === "not_found") return;

      kicked.current = true;
      if (polling.current) clearInterval(polling.current);

      const msg = REASON_MESSAGES[reason] ?? "Your session is no longer valid. Please log in again.";
      setToast(msg);

      setTimeout(() => {
        clearAuth();
        document.cookie = "sushizen_authed=; path=/; max-age=0";
        router.replace(`/login?reason=${encodeURIComponent(reason)}`);
      }, 3000);
    } catch {
      // Network error — don't kick the user out
    }
  };

  useEffect(() => {
    if (SKIP_PATHS.has(pathname)) return;

    const init = setTimeout(check, 2000);
    polling.current = setInterval(check, POLL_MS);

    return () => {
      clearTimeout(init);
      if (polling.current) clearInterval(polling.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!toast) return null;

  return (
    <div role="alert" className="fixed left-1/2 top-4 z-[9999] w-full max-w-sm -translate-x-1/2 px-4">
      <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-neutral-950/95 px-4 py-3 shadow-xl backdrop-blur-sm">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
        <div className="text-sm leading-snug">
          <span className="font-semibold text-red-400">Session ended — </span>
          <span className="text-neutral-300">{toast}</span>
          <div className="mt-1 text-xs text-neutral-500">Redirecting to login…</div>
        </div>
      </div>
    </div>
  );
}
