"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function getInvestorSession(): { loggedIn: boolean; loginAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("sushizen_investor_session");
    if (!raw) return null;
    const s = JSON.parse(raw) as { loggedIn: boolean; loginAt: number };
    if (s.loggedIn && Date.now() - s.loginAt < 24 * 60 * 60 * 1000) return s;
    return null;
  } catch {
    return null;
  }
}

export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/investor" && !getInvestorSession()) {
      router.replace("/investor");
    }
  }, [pathname, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {children}
    </div>
  );
}
