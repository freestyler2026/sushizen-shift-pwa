"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { hasUnsavedEdits, UNSAVED_EVENT } from "@/lib/unsavedGuard";

const POLL_INTERVAL_MS = 30 * 1000;
const BUNDLE_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const RELOAD_GUARD_KEY = "zen:reload-attempt";
const RELOAD_GUARD_MS = 30_000;

async function fetchFrontendVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.v ?? null;
  } catch {
    return null;
  }
}

async function fetchBackendVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/backend-version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.v ?? null;
  } catch {
    return null;
  }
}

export default function AutoReload() {
  const pathname = usePathname();
  const frontendBaseline = useRef<string | null>(null);
  const backendBaseline = useRef<string | null>(null);
  const reloading = useRef(false);
  const pendingReload = useRef(false);
  const earlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckMs = useRef<number>(0);

  // UI states
  const [updateReady, setUpdateReady] = useState(false);   // pending update, user has unsaved edits
  const [applyingUpdate, setApplyingUpdate] = useState(false); // brief "Applying update…" before reload
  const [loopGuarded, setLoopGuarded] = useState(false);   // reload loop detected — show fatal error

  /** Reloading the URL is not enough on this PWA: the service worker keeps serving the
   *  bundle it already cached, so a page can look reloaded and still be running the old
   *  build — which is how a fixed page kept behaving like the broken one until someone
   *  knew to force-refresh. Retire the cached build first, then reload. */
  async function dropCachedBuild() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
      }
      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n).catch(() => undefined)));
      }
    } catch {
      // Best effort — a reload without this is still better than none.
    }
  }

  function hardReload() {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      if (Date.now() - last < RELOAD_GUARD_MS) {
        // Reload loop detected — stop and show error
        setLoopGuarded(true);
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // sessionStorage unavailable — proceed without guard
    }
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    void dropCachedBuild().finally(() => window.location.replace(url.toString()));
  }

  useEffect(() => {
    function triggerReload() {
      if (reloading.current) return;
      if (hasUnsavedEdits()) {
        pendingReload.current = true;
        setUpdateReady(true);
        return;
      }
      reloading.current = true;
      hardReload();
    }

    function check() {
      if (reloading.current) return;
      if (document.visibilityState !== "visible") return;
      if (pendingReload.current && !hasUnsavedEdits()) {
        // Edits were cleared externally (e.g. autosave) — apply update now
        reloading.current = true;
        hardReload();
        return;
      }
      lastCheckMs.current = Date.now();
      fetchFrontendVersion().then((v) => {
        if (reloading.current) return;
        if (!v) return;
        if (!frontendBaseline.current) { frontendBaseline.current = v; return; }
        if (v !== frontendBaseline.current) triggerReload();
      });
      fetchBackendVersion().then((v) => {
        if (reloading.current) return;
        if (!v) return;
        if (!backendBaseline.current) { backendBaseline.current = v; return; }
        if (v !== backendBaseline.current) triggerReload();
      });
    }

    fetchFrontendVersion().then((serverV) => {
      if (reloading.current) return;
      if (serverV && serverV !== "dev" && BUNDLE_BUILD_ID !== "dev" && serverV !== BUNDLE_BUILD_ID) {
        triggerReload();
        if (reloading.current) return;
      }
      if (serverV) frontendBaseline.current = serverV;
      earlyTimerRef.current = setTimeout(() => check(), 2000);
    });

    fetchBackendVersion().then((v) => { if (v) backendBaseline.current = v; });

    const timer = setInterval(check, POLL_INTERVAL_MS);

    function onVisibility() { if (document.visibilityState === "visible") check(); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) check(); }
    window.addEventListener("pageshow", onPageShow);

    function onUnsavedChange() {
      if (reloading.current) return;
      if (pendingReload.current && !hasUnsavedEdits()) {
        // User saved their work — give them a moment to see the save confirmation
        // before the page reloads, so it doesn't feel abrupt.
        reloading.current = true;
        setApplyingUpdate(true);
        setTimeout(() => hardReload(), 1500);
      }
    }
    window.addEventListener(UNSAVED_EVENT, onUnsavedChange);

    return () => {
      clearInterval(timer);
      if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(UNSAVED_EVENT, onUnsavedChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reloading.current) return;
    if (!frontendBaseline.current) return;
    if (Date.now() - lastCheckMs.current < POLL_INTERVAL_MS) return;
    lastCheckMs.current = Date.now();
    fetchFrontendVersion().then((v) => {
      if (reloading.current) return;
      if (v && frontendBaseline.current && v !== frontendBaseline.current) {
        if (hasUnsavedEdits()) {
          pendingReload.current = true;
          setUpdateReady(true);
          return;
        }
        reloading.current = true;
        hardReload();
      }
    });
  }, [pathname]);

  // ── Reload loop detected ─────────────────────────────────────────────────
  if (loopGuarded) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#0a0b14] px-6 text-center">
        <p className="text-lg font-semibold text-red-400">Something went wrong</p>
        <p className="max-w-xs text-sm text-neutral-400">
          The page failed to load and could not recover automatically. Please reload the page manually.
        </p>
        <button
          onClick={() => {
            try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ok */ }
            window.location.reload();
          }}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 active:scale-95"
        >
          Reload Page
        </button>
      </div>
    );
  }

  // ── Applying update (brief message before reload fires) ──────────────────
  if (applyingUpdate) {
    return (
      <div className="fixed bottom-24 left-1/2 z-[9999] -translate-x-1/2 px-4 md:bottom-6">
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-950/90 px-4 py-3 text-sm text-indigo-200 shadow-xl backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
          Applying update…
        </div>
      </div>
    );
  }

  // ── Pending update: user has unsaved edits ────────────────────────────────
  if (updateReady) {
    return (
      <div className="fixed bottom-24 left-1/2 z-[9999] w-full max-w-sm -translate-x-1/2 px-4 md:bottom-6">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-neutral-950/95 px-4 py-3 shadow-xl backdrop-blur">
          <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-amber-300">New version available</p>
            <p className="mt-0.5 text-xs text-neutral-400">Save your work, then click Update.</p>
          </div>
          <button
            onClick={() => {
              setUpdateReady(false);
              reloading.current = true;
              hardReload();
            }}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 active:scale-95"
          >
            Update Now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
