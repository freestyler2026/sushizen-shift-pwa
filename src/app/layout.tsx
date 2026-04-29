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
  function isChunkErr(msg){ return msg && CHUNK_ERRS.some(function(k){ return msg.indexOf(k) !== -1; }); }
  var reloading = false;
  function doReload(){
    if(reloading) return;
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