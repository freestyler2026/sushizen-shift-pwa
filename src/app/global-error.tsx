"use client";

import { useEffect } from "react";

const CHUNK_ERRS = [
  "Loading chunk",
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
];

function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error)?.message || String(err);
  return CHUNK_ERRS.some((k) => msg.includes(k));
}

function hardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Auto-reload on chunk errors (stale PWA cache after a new deployment)
    if (isChunkError(error)) {
      hardReload();
      return;
    }
    // For any other error, attempt a reload after a short delay
    const timer = setTimeout(hardReload, 3000);
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
        }}
      >
        <p style={{ color: "#9ca3af", fontSize: "14px" }}>更新を読み込み中...</p>
        <button
          onClick={hardReload}
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
          今すぐ再読み込み
        </button>
      </body>
    </html>
  );
}
