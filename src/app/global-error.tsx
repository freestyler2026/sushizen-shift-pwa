"use client";

import { useEffect, useState } from "react";

const CHUNK_ERRS = [
  "Loading chunk",
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
];
const RELOAD_GUARD_KEY = "zen:reload-attempt";
const RELOAD_GUARD_MS = 30_000;

function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error)?.message || String(err);
  return CHUNK_ERRS.some((k) => msg.includes(k));
}

function guardedHardReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false; // guard fired
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — proceed
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [loopGuarded, setLoopGuarded] = useState(false);

  useEffect(() => {
    if (isChunkError(error)) {
      // Stale PWA bundle — reload immediately, unless we're looping
      if (!guardedHardReload()) setLoopGuarded(true);
      return;
    }
    // For any other error, attempt a reload after a short delay
    const timer = setTimeout(() => {
      if (!guardedHardReload()) setLoopGuarded(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0a0b14",
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          margin: 0,
          fontFamily: "sans-serif",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        {loopGuarded ? (
          <>
            <p style={{ color: "#f87171", fontSize: "18px", fontWeight: 600 }}>Something went wrong</p>
            <p style={{ color: "#9ca3af", fontSize: "14px", maxWidth: "320px" }}>
              The page failed to load and could not recover automatically. Please reload the page manually.
            </p>
            <button
              onClick={() => {
                try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ok */ }
                window.location.reload();
              }}
              style={{
                padding: "10px 24px",
                background: "#6366f1",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Reload Page
            </button>
          </>
        ) : (
          <>
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>Loading update...</p>
            <button
              onClick={() => { if (!guardedHardReload()) setLoopGuarded(true); }}
              style={{
                padding: "10px 24px",
                background: "#6366f1",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Reload Now
            </button>
          </>
        )}
      </body>
    </html>
  );
}
