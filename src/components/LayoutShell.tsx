"use client";

import { usePathname } from "next/navigation";
import NavBar from "@/components/NavBar";
import AutoReload from "@/components/AutoReload";
import SessionGuard from "@/components/SessionGuard";

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
      <SessionGuard />

      {/*
        NavBar is rendered once inside this header.
        On mobile: header is visible — shows logo/user row + bottom nav portal.
        On desktop: header is md:hidden (CSS display:none) but NavBar still mounts in
        React's virtual DOM, so its createPortal sidebar still renders to document.body.
        This is intentional — CSS display:none does NOT prevent React component mounting.
      */}
      <header className="sticky top-0 z-50 overflow-x-hidden border-b border-white/10 bg-[#0d1117] py-0 backdrop-blur-xl md:hidden">
        <div className="px-4 sm:px-6">
          <NavBar />
        </div>
      </header>

      {/* pb-20 reserves space for the fixed mobile bottom nav; md:pb-0 removes it on desktop */}
      <main className="mx-auto max-w-6xl px-4 py-4 pb-20 sm:px-6 sm:py-6 md:mx-0 md:ml-60 md:max-w-none md:px-8 md:pb-6">{children}</main>

      <footer className="hidden px-4 pb-8 text-xs text-neutral-500 sm:px-6 md:ml-60 md:block md:px-8">
        Vercel PWA (frontend) • Heroku API (backend)
      </footer>
    </>
  );
}