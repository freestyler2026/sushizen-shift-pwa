// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import LayoutShell from "../components/LayoutShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sushi ZEN Workforce OS",
  description: "Staff shift viewer + change requests",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sushi ZEN Workforce OS",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Baked into the HTML at build time — used by the inline version-check script below.
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
  return (
    <html lang="en">
      <head>
        {/* ── Inline version check (runs before React boots) ─────────────────
            Even when iOS Safari serves a stale cached HTML document, this
            script detects the mismatch by fetching /api/version from the
            server and reloading to a cache-busting URL (?_r=timestamp).
            The BUILD_ID is baked in as a string literal at deploy time so
            that each deploy's HTML carries a unique fingerprint.           */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var BUILD_ID = ${JSON.stringify(buildId)};
  if(!BUILD_ID || BUILD_ID === 'dev') return;
  // Avoid reload loops: if we already reloaded (?_r present), skip.
  var params = new URLSearchParams(window.location.search);
  if(params.get('_r')) return;
  fetch('/api/version?_t=' + Date.now(), {cache:'no-store'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d && d.v && d.v !== BUILD_ID){
        var u = new URL(window.location.href);
        u.searchParams.set('_r', String(Date.now()));
        window.location.replace(u.toString());
      }
    })
    .catch(function(){});
})();
        `}} />
        {/* ── ChunkLoadError handler ──────────────────────────────────────────
            Catches missing JS chunk errors that occur when old cached PWA
            bundles reference chunk filenames that no longer exist after
            a new deployment, and forces a cache-busting reload.            */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var CHUNK_ERRS = ['Loading chunk','ChunkLoadError','Failed to fetch dynamically imported module','Importing a module script failed','error loading dynamically imported module'];
  var GUARD_KEY = 'zen:reload-attempt';
  var GUARD_MS  = 30000;
  function isChunkErr(msg){ return msg && CHUNK_ERRS.some(function(k){ return msg.indexOf(k) !== -1; }); }
  var reloading = false;
  function showFatalError(){
    var body = document.body || document.documentElement;
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0b14;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:9999;font-family:sans-serif;padding:24px;text-align:center';
    el.innerHTML = '<p style="color:#f87171;font-size:18px;font-weight:600">Something went wrong</p><p style="color:#9ca3af;font-size:14px;max-width:320px">The page failed to load and could not recover automatically. Please reload the page manually.</p><button onclick="sessionStorage.removeItem(\'zen:reload-attempt\');location.reload()" style="padding:10px 24px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">Reload Page</button>';
    body.appendChild(el);
  }
  function doReload(){
    if(reloading) return;
    try {
      var last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
      if(Date.now() - last < GUARD_MS){ showFatalError(); return; }
      sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    } catch(e) { /* sessionStorage unavailable — proceed without guard */ }
    reloading = true;
    var url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  }
  window.addEventListener('error', function(e){
    if(isChunkErr(e.message) || isChunkErr(e.filename)){ doReload(); }
  });
  window.addEventListener('unhandledrejection', function(e){
    var msg = e.reason && (e.reason.message || String(e.reason));
    if(isChunkErr(msg)){ doReload(); }
  });
})();
        `}} />
      </head>
      <body className={`${inter.variable} min-h-screen bg-[#0a0b14] text-neutral-100 font-sans`}>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}