"use client";

import Link from "next/link";

import { RatingEntryTab } from "@/components/admin/RatingEntryTab";
import { SMALL_BUTTON, T_PAGE_TITLE } from "@/lib/ui-tokens";

/**
 * Standalone Ratings entry (same grid as Admin → Ratings tab).
 * Use this URL if the main /admin tab bar shows a cached older bundle.
 */
export default function RatingsEntryPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>Aggregator ratings</h1>
        <Link href="/admin?tab=ratings-entry" className={SMALL_BUTTON}>
          ← Open in Admin Dashboard
        </Link>
      </div>
      <RatingEntryTab />
    </div>
  );
}
