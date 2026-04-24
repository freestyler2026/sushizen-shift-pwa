"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

// Baked into the JavaScript bundle at build time by next.config.ts.
// If a PWA is running an old cached bundle, this will differ from what
// the server currently reports — triggering an immediate reload on startup.
const BUNDLE_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

async function fetchFrontendVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
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
  const frontendBaseline = useRef<string | null>(null);
  const backendBaseline = useRef<string | null>(null);

  useEffect(() => {
    // On startup: compare the version baked into this bundle against
    // what the server currently reports. If different, the PWA is running
    // stale cached JavaScript — reload immediately to get the new bundle.
    fetchFrontendVersion().then((serverV) => {
      if (serverV && BUNDLE_BUILD_ID !== "dev" && serverV !== BUNDLE_BUILD_ID) {
        window.location.reload();
        return;
      }
      frontendBaseline.current = serverV;
    });

    fetchBackendVersion().then((v) => { backendBaseline.current = v; });

    function check() {
      // Mid-session: detect if a new deploy happened while the app was open
      fetchFrontendVersion().then((v) => {
        if (v && frontendBaseline.current && v !== frontendBaseline.current) {
          window.location.reload();
        }
      });
      fetchBackendVersion().then((v) => {
        if (v && backendBaseline.current && v !== backendBaseline.current) {
          window.location.reload();
        }
      });
    }

    const timer = setInterval(check, POLL_INTERVAL_MS);

    // Also check when the app comes back to the foreground
    function onVisibility() {
      if (document.visibilityState === "visible") {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
