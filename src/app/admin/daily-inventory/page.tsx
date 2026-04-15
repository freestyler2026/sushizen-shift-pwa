"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AdminDailyInventoryTab from "@/components/admin/AdminDailyInventoryTab";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { SMALL_BUTTON, T_PAGE_TITLE } from "@/lib/ui-tokens";

export default function AdminDailyInventoryPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = getAuth();
      if (!a?.accessToken) {
        router.replace(`/login?next=${encodeURIComponent("/admin/daily-inventory")}`);
        return;
      }
      const r = await refreshAuthFromApi(a);
      const ok = canAccessInventoryWorkspace(r || a);
      if (cancelled) return;
      setAllowed(ok);
      if (!ok) router.replace("/week");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (allowed === null) {
    return <div className="p-4 text-sm text-zinc-400">Loading…</div>;
  }
  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>Daily Inventory Input</h1>
        <Link href="/admin" className={SMALL_BUTTON}>
          Admin Dashboard
        </Link>
      </div>
      <InventoryTabs />
      <AdminDailyInventoryTab />
    </div>
  );
}
