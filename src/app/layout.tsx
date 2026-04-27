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
  return (
    <html lang="en">
      <head>
        {/* Catch ChunkLoadError / dynamic import failures before React boots.
            On a new deployment, old cached PWA bundles reference chunk filenames
            that no longer exist → auto-reload fetches the fresh bundle. */}
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