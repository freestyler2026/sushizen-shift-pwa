"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Bookmark compatibility: Number of Orders entry → /admin?tab=order-entry */
export default function OrderEntryLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=order-entry");
  }, [router]);
  return (
    <div className="py-12 text-center text-sm text-zinc-500">
      Redirecting to Admin Dashboard…
    </div>
  );
}
