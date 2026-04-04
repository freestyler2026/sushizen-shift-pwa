"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import MenuTabs from "@/components/MenuTabs";
import { canAccessAdminNav, canAccessMenuAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

export default function MenuLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const resolved = refreshed || auth;
      if (!resolved?.staffName || !resolved?.accessToken) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/admin/menu")}`);
        return;
      }
      const nextAllowed = canAccessAdminNav(resolved) && canAccessMenuAdmin(resolved);
      setAllowed(nextAllowed);
      setReady(true);
      if (!nextAllowed) {
        router.replace("/week");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth, pathname, router]);

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading Menu Builder...</div>;
  }

  if (!allowed) {
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;
  }

  return (
    <div className="space-y-6">
      <MenuTabs />
      {children}
    </div>
  );
}
