"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.v ?? null;
  } catch {
    return null;
  }
}

export default function AutoReload() {
  const baseline = useRef<string | null>(null);

  useEffect(() => {
    // Capture the version this page was built with
    fetchVersion().then((v) => {
      baseline.current = v;
    });

    function check() {
      fetchVersion().then((v) => {
        if (v && baseline.current && v !== baseline.current) {
          window.location.reload();
        }
      });
    }

    // Poll on an interval
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
