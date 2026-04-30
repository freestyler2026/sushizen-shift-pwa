"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Poll every 8 seconds — fast enough to feel instant without hammering the server.
const POLL_INTERVAL_MS = 8 * 1000;

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
  const earlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function check() {
      if (reloading.current) return;
      fetchFrontendVersion().then((v) => {
        if (reloading.current) return;
        if (v && frontendBaseline.current && v !== frontendBaseline.current) {
          reloading.current = true;
          hardReload();
        }
      });
      fetchBackendVersion().then((v) => {
        if (reloading.current) return;
        if (v && backendBaseline.current && v !== backendBaseline.current) {
          reloading.current = true;
          hardReload();
        }
      });
    }

    // On startup: detect stale bundle immediately (before React hydration delays).
    fetchFrontendVersion().then((serverV) => {
      if (reloading.current) return;
      if (serverV && BUNDLE_BUILD_ID !== "dev" && serverV !== BUNDLE_BUILD_ID) {
        // Old cached bundle — reload now.
        reloading.current = true;
        hardReload();
        return;
      }
      frontendBaseline.current = serverV;

      // Early follow-up: if a new deploy went live in the moments between the
      // browser loading the page and this fetch completing, catch it fast
      // instead of waiting for the first poll interval.
      earlyTimerRef.current = setTimeout(() => check(), 3000);
    });

    fetchBackendVersion().then((v) => { backendBaseline.current = v; });

    // Periodic poll — 8 s feels near-instant to the user.
    const timer = setInterval(check, POLL_INTERVAL_MS);

    // Check when app comes back to foreground.
    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Check on browser window focus.
    window.addEventListener("focus", check);

    return () => {
      clearInterval(timer);
      if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
    };
  }, []);

  // Check on every client-side navigation (tab click, link click, etc.)
  useEffect(() => {
    if (reloading.current) return;
    if (!frontendBaseline.current) return; // not yet initialized

    fetchFrontendVersion().then((v) => {
      if (reloading.current) return;
      if (v && frontendBaseline.current && v !== frontendBaseline.current) {
        reloading.current = true;
        hardReload();
      }
    });
  }, [pathname]);

  return null;
}
