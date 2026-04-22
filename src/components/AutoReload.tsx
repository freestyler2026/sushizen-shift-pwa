"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

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
    // Capture baseline versions on mount
    fetchFrontendVersion().then((v) => { frontendBaseline.current = v; });
    fetchBackendVersion().then((v) => { backendBaseline.current = v; });

    function check() {
      // Check frontend (Vercel) version
      fetchFrontendVersion().then((v) => {
        if (v && frontendBaseline.current && v !== frontendBaseline.current) {
          window.location.reload();
        }
      });
      // Check backend (Heroku) version — reload if dyno was redeployed
      fetchBackendVersion().then((v) => {
        if (v && backendBaseline.current && v !== backendBaseline.current) {
          window.location.reload();
        }
      });
    }

    const timer = setInterval(check, POLL_INTERVAL_MS);

    // Also check immediately when the tab becomes visible again
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
