"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-auth";

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
