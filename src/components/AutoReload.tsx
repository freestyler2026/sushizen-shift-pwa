"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hasUnsavedEdits, UNSAVED_EVENT } from "@/lib/unsavedGuard";

// Poll every 30 seconds — deploys take minutes to propagate; 3s was needlessly aggressive.
// Visibility/focus/pageshow events handle the "tab comes back" case instantly.
const POLL_INTERVAL_MS = 30 * 1000;

// Baked into the JavaScript bundle at build time by next.config.ts.
// If a PWA is running an old cached bundle, this will differ from what
// the server currently reports — triggering an immediate reload on startup.
const BUNDLE_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

async function fetchFrontendVersion(): Promise<string | null> {
  try {
    // Timestamp prevents any HTTP cache from serving a stale response.
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

function hardReload() {
  // Append a cache-busting param so the browser fetches a fresh document.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

export default function AutoReload() {
  const pathname = usePathname();
  const frontendBaseline = useRef<string | null>(null);
  const backendBaseline = useRef<string | null>(null);
  const reloading = useRef(false);
  const pendingReload = useRef(false);
  const earlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckMs = useRef<number>(0);

  useEffect(() => {
    // Reload now, UNLESS the user has unsaved edits (e.g. mid-input on the
    // Number of Orders / Ratings grids). In that case defer: remember a reload
    // is due and apply it the moment the edits are saved (see check() + the
    // UNSAVED_EVENT listener). AutoReload must never wipe in-progress input.
    function triggerReload() {
      if (reloading.current) return;
      if (hasUnsavedEdits()) {
        pendingReload.current = true;
        return;
      }
      reloading.current = true;
      hardReload();
    }

    function check() {
      if (reloading.current) return;
      // Skip polling when the tab is hidden — visibility/focus events will trigger
      // a check the moment the user returns, so no requests are wasted in background.
      if (document.visibilityState !== "visible") return;
      // A deploy was detected earlier but deferred for unsaved edits — apply it
      // as soon as the edits are gone.
      if (pendingReload.current && !hasUnsavedEdits()) {
        reloading.current = true;
        hardReload();
        return;
      }
      lastCheckMs.current = Date.now();
      fetchFrontendVersion().then((v) => {
        if (reloading.current) return;
        if (!v) return; // fetch failed — skip this tick
        if (!frontendBaseline.current) {
          // Initial startup fetch failed but this poll succeeded — set baseline now
          // so subsequent polls can detect changes.
          frontendBaseline.current = v;
          return;
        }
        if (v !== frontendBaseline.current) {
          triggerReload();
        }
      });
      fetchBackendVersion().then((v) => {
        if (reloading.current) return;
        if (!v) return;
        if (!backendBaseline.current) {
          backendBaseline.current = v;
          return;
        }
        if (v !== backendBaseline.current) {
          triggerReload();
        }
      });
    }

    // On startup: detect stale bundle immediately (before React hydration delays).
    fetchFrontendVersion().then((serverV) => {
      if (reloading.current) return;
      // Skip comparison if either side is "dev" (local environment — no stable ID).
      if (serverV && serverV !== "dev" && BUNDLE_BUILD_ID !== "dev" && serverV !== BUNDLE_BUILD_ID) {
        // Old cached bundle — reload now (deferred if the user has unsaved edits).
        triggerReload();
        if (reloading.current) return;
      }
      // IMPORTANT: only set baseline if we got a valid value.
      // If serverV is null (network error), leave baseline as null so the
      // first successful poll can set it — do NOT permanently disable polling.
      if (serverV) frontendBaseline.current = serverV;

      // Early follow-up: if a new deploy went live in the moments between the
      // browser loading the page and this fetch completing, catch it fast
      // instead of waiting for the first poll interval.
      earlyTimerRef.current = setTimeout(() => check(), 2000);
    });

    fetchBackendVersion().then((v) => { if (v) backendBaseline.current = v; });

    // Periodic poll.
    const timer = setInterval(check, POLL_INTERVAL_MS);

    // Check when app comes back to foreground.
    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Check on browser window focus.
    window.addEventListener("focus", check);

    // iOS Safari PWA: when a page is restored from bfcache (e.g. app icon tap after
    // backgrounding), neither mount nor visibilitychange may fire reliably. The
    // pageshow event with persisted=true is the most reliable signal on iOS.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) check();
    }
    window.addEventListener("pageshow", onPageShow);

    // When unsaved edits clear (user saved), apply any deferred reload at once
    // instead of waiting for the next poll.
    function onUnsavedChange() {
      if (reloading.current) return;
      if (pendingReload.current && !hasUnsavedEdits()) {
        reloading.current = true;
        hardReload();
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
  }, []);

  // Check on every client-side navigation (tab click, link click, etc.)
  // Throttled: skip if a check ran within the last POLL_INTERVAL_MS to avoid
  // hammering /api/version on every tab click when many staff are active.
  useEffect(() => {
    if (reloading.current) return;
    if (!frontendBaseline.current) return; // not yet initialized
    if (Date.now() - lastCheckMs.current < POLL_INTERVAL_MS) return;

    lastCheckMs.current = Date.now();
    fetchFrontendVersion().then((v) => {
      if (reloading.current) return;
      if (v && frontendBaseline.current && v !== frontendBaseline.current) {
        if (hasUnsavedEdits()) {
          pendingReload.current = true;
          return;
        }
        reloading.current = true;
        hardReload();
      }
    });
  }, [pathname]);

  return null;
}
