"use client";

import { usePathname } from "next/navigation";
import NavBar from "@/components/NavBar";

const HIDE_NAV_PATHS = new Set(["/", "/login", "/signup", "/setup-pin"]);

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = HIDE_NAV_PATHS.has(pathname);

  if (hideNav) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-neutral-800 bg-black/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <NavBar />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-500">
        Vercel PWA (frontend) • Heroku API (backend)
      </footer>
    </>
  );
}