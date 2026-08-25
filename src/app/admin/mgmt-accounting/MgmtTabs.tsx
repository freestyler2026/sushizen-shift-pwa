"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER } from "@/lib/ui-tokens";

/**
 * One tab bar for the whole Management Accounting area.
 *
 * Daily P&L lives on its own route but belongs beside the other three views, so
 * the bar is shared: the page you are on switches locally, the rest navigate.
 * Before this, Daily P&L was reachable only from the sidebar and had no way back.
 */
export type MgmtTabKey = "group" | "cost" | "report" | "daily";

export const MGMT_TABS: { key: MgmtTabKey; label: string; href: string }[] = [
  { key: "group",  label: "全社管理",   href: "/admin/mgmt-accounting?tab=group" },
  { key: "cost",   label: "コスト分析", href: "/admin/mgmt-accounting?tab=cost" },
  { key: "report", label: "月次レポート", href: "/admin/mgmt-accounting?tab=report" },
  { key: "daily",  label: "日次P&L",   href: "/admin/mgmt-accounting/daily-pl" },
];

export function MgmtTabBar({
  active,
  onSelect,
}: {
  active: MgmtTabKey;
  /** Provided by the page that owns the first three views; omit to always navigate. */
  onSelect?: (key: MgmtTabKey) => void;
}) {
  const router = useRouter();
  return (
    <div className={TAB_CONTAINER}>
      {MGMT_TABS.map((t) => (
        <button
          key={t.key}
          className={active === t.key ? TAB_ACTIVE : TAB_INACTIVE}
          onClick={() => {
            if (t.key === active) return;
            if (onSelect && t.key !== "daily") onSelect(t.key);
            else router.push(t.href);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Back to the admin dashboard — every page in this area needs one. */
export function DashboardLink() {
  return (
    <Link
      href="/admin"
      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
    >
      ← ダッシュボード
    </Link>
  );
}
