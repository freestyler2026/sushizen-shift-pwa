"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Bookmark compatibility: Low Ratings lives under Admin Dashboard → /admin?tab=low-ratings */
export default function LowRatingsLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=low-ratings");
  }, [router]);
  return (
    <div className="py-12 text-center text-sm text-zinc-500">
      Redirecting to Admin Dashboard…
    </div>
  );
}
