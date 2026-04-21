"use client";

import { usePathname } from "next/navigation";
import NavBar from "@/components/NavBar";
import AutoReload from "@/components/AutoReload";

const HIDE_NAV_PATHS = new Set(["/", "/login", "/signup", "/setup-pin"]);

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = HIDE_NAV_PATHS.has(pathname);

  if (hideNav) {
    return (
      <main className="min-h-screen px-4 pt-[max(12px,env(safe-area-inset-top))] pb-5 sm:px-6">
        <div className="mx-auto max-w-md sm:max-w-lg">{children}</div>
      </main>
    );
  }

  return (
    <>
      <AutoReload />
      <header className="sticky top-0 z-50 overflow-x-hidden border-b border-white/10 bg-[#0d1117] py-0 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <NavBar />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-500 sm:px-6">
        Vercel PWA (frontend) • Heroku API (backend)
      </footer>
    </>
  );
}