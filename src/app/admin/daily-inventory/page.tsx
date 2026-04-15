"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getAuth, isAdmin } from "@/lib/auth";
import AdminDailyInventoryTab from "@/components/admin/AdminDailyInventoryTab";

export default function DailyInventoryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (!isAdmin(a)) {
      router.replace("/week");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white">
      <AdminDailyInventoryTab />
    </main>
  );
}
