"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { exitImpersonation, getImpersonationInfo, type ImpersonationInfo } from "@/lib/impersonation";

export default function ImpersonationBanner() {
  const router = useRouter();
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    // Check on mount and on storage events (in case another tab changes state)
    function check() {
      setInfo(getImpersonationInfo());
    }
    check();
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  if (!info) return null;

  function handleExit() {
    exitImpersonation();
    router.push("/admin/staff/roles");
    // Reload so the page re-reads the restored admin auth
    window.location.href = "/admin/staff/roles";
  }

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/90 px-4 py-2 text-amber-200 backdrop-blur-xl">
      <div className="flex items-center gap-2 min-w-0">
        <UserX className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate text-sm font-medium">
          Viewing as <span className="font-bold text-amber-100">{info.impersonating}</span>
        </span>
        <span className="hidden text-xs text-amber-400/70 sm:inline">
          · logged in as {info.impersonatedBy}
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 active:scale-95"
      >
        Exit
      </button>
    </div>
  );
}
