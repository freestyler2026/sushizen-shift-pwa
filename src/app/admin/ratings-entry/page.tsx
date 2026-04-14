"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Bookmark compatibility: Ratings entry → /admin?tab=ratings-entry */
export default function RatingsEntryLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=ratings-entry");
  }, [router]);
  return (
    <div className="py-12 text-center text-sm text-zinc-500">
      Redirecting to Admin Dashboard…
    </div>
  );
}
