"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAuth, setAuth, clearAuth, nonDowngradedAccess, type Auth } from "@/lib/auth";

const POLL_MS = 5 * 60 * 1000;
const KEEPALIVE_MS = 20 * 60 * 1000;
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


export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepalive = useRef<ReturnType<typeof setInterval> | null>(null);
  const kicked = useRef(false);
  const permissionsVersion = useRef<number>(-1);

  const refreshPermissions = async (auth: Auth) => {
    // hasSession is set to true after login; accessToken is empty for httpOnly-cookie sessions.
    if (!auth.hasSession) return;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-store" },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; permissions?: string[]; role?: string; permissions_resolved?: boolean };
      if (!data.ok) return;
      // When permissions_resolved=false the backend fell back to legacy defaults —
      // keep the user's current permissions rather than potentially downgrading them.
      const rawPerms = (data.permissions_resolved !== false && Array.isArray(data.permissions))
        ? data.permissions
        : auth.permissions;
      // Protect against transient backend role downgrades (e.g. DB blip returns STAFF).
      const { role: safeRole, permissions: safePerms } = nonDowngradedAccess(
        auth,
        (data.role as string | undefined) || auth.role,
        rawPerms,
      );
      setAuth({
        ...auth,
        permissions: safePerms,
        role: safeRole,
      });
    } catch { /* Network error — ignore */ }
  };

  const refreshSession = async () => {
    if (kicked.current) return;
    const auth = getAuth();
    if (!auth?.hasSession || !auth?.staffName) return;
    try {
      await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch { /* Network error — ignore */ }
  };

  // Sign the user out with a reason, then send them to the login screen.
  const kick = (reason: string) => {
    if (kicked.current) return;
    kicked.current = true;
    if (polling.current) clearInterval(polling.current);

    const msg = REASON_MESSAGES[reason] ?? "Your session is no longer valid. Please log in again.";
    setToast(msg);

    setTimeout(() => {
      // Clear the httpOnly pair too. clearAuth() only reaches localStorage, and
      // sz_access/sz_session are httpOnly on path=/api — JS cannot touch them.
      // Leaving them behind is what made the next sign-in look like a re-mint
      // of a session that no longer existed, so the user logged in, got no
      // session, and was thrown out again within the minute.
      void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
        .catch(() => { /* the login page re-mints either way */ })
        .finally(() => {
          clearAuth();
          document.cookie = "sushizen_authed=; path=/; max-age=0";
          router.replace(`/login?reason=${encodeURIComponent(reason)}`);
        });
    }, 3000);
  };

  // "No session id" used to be read as fine. On 2026-10-17 the owner's browser
  // had no session cookie and no usable token: every API answered 401, the menu
  // still showed him signed in, and each page printed its own raw 401. Ask the
  // server whether it can still sign this browser in; only an explicit 401
  // counts -- a network error is not a reason to log anybody out.
  const stillSignedIn = async (): Promise<boolean> => {
    try {
      // A login that keeps its token in localStorage rather than the cookie
      // must be asked with that token, or it would be signed out by mistake.
      const token = getAuth()?.accessToken || "";
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.status !== 401;
    } catch {
      return true;
    }
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
      if (reason === "no_session_id" || reason === "not_found") {
        if (!(await stillSignedIn())) kick("expired");
        return;
      }

      kick(reason);
    } catch {
      // Network error — don't kick the user out
    }
  };

  useEffect(() => {
    if (SKIP_PATHS.has(pathname)) return;

    const init = setTimeout(check, 2000);
    // A page's own call came back 401 and the retry could not refresh.
    const onLost = () => { void (async () => { if (!(await stillSignedIn())) kick("expired"); })(); };
    window.addEventListener("zen:session-lost", onLost);
    polling.current = setInterval(check, POLL_MS);
    keepalive.current = setInterval(refreshSession, KEEPALIVE_MS);

    return () => {
      clearTimeout(init);
      window.removeEventListener("zen:session-lost", onLost);
      if (polling.current) clearInterval(polling.current);
      if (keepalive.current) clearInterval(keepalive.current);
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
