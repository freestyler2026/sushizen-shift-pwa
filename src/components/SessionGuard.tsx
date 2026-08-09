"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAuth, clearAuth } from "@/lib/auth";

const POLL_MS = 5 * 60 * 1000;
const SKIP_PATHS = new Set(["/", "/login", "/signup", "/setup-pin"]);

const REASON_MESSAGES: Record<string, string> = {
  account_frozen: "Your account has been frozen. Please contact your manager.",
  expired: "Your session has expired. Please log in again.",
  absolute_expired: "Your session has expired. Please log in again.",
  invalidated: "You have been logged out remotely.",
  force_logout_by_admin: "You have been logged out by an administrator.",
  new_login_elsewhere: "A new login was detected on another device.",
};

export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const kicked = useRef(false);

  const check = async () => {
    if (kicked.current) return;
    const auth = getAuth();

    // Phase 1/2: sessionId in localStorage. Phase 3: hasSession=true with sz_session cookie.
    if (!auth?.sessionId && !auth?.hasSession) return;

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

      const data = (await res.json()) as { valid: boolean; reason?: string };
      if (data.valid) return;

      const reason = data.reason ?? "invalidated";
      // Grace cases: old sessions without session_id, or session not yet created in DB
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
