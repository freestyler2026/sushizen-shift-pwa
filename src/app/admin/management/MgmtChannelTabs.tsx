"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER } from "@/lib/ui-tokens";

/**
 * One tab bar across the Management Channel admin pages.
 *
 * The four pages were built standalone with no way to get between them: Par
 * Levels is what you open when Pattern Detection raises "Par level review",
 * and neither linked to the other or back to the dashboard.
 */
export type MgmtChannelTabKey = "bo" | "reports" | "owners" | "par" | "patterns" | "people" | "area";

export const MGMT_CHANNEL_TABS: { key: MgmtChannelTabKey; label: string; href: string }[] = [
  { key: "bo",       label: "BO Dashboard",   href: "/admin/management/back-office" },
  { key: "reports",  label: "Required Reports", href: "/admin/management/required-reports" },
  { key: "owners",   label: "Owners",         href: "/admin/management/assignments" },
  { key: "par",      label: "Par Levels",     href: "/admin/management/par-levels" },
  { key: "patterns", label: "Patterns",       href: "/admin/management/patterns" },
  { key: "people",   label: "People",         href: "/admin/management/people" },
  { key: "area",     label: "Weekly Review",  href: "/admin/management/area-review" },
];

export function MgmtChannelTabBar({ active }: { active: MgmtChannelTabKey }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className={TAB_CONTAINER}>
        {MGMT_CHANNEL_TABS.map((t) => (
          <button
            key={t.key}
            className={active === t.key ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => {
              if (t.key !== active) router.push(t.href);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Link
        href="/admin"
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
      >
        ← Dashboard
      </Link>
    </div>
  );
}
