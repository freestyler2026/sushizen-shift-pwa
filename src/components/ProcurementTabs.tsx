"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";

const ITEMS = [
  { href: "/admin/procurement/dashboard", label: "Dashboard" },
  { href: "/admin/procurement", label: "Requests" },
  { href: "/admin/procurement/imports", label: "Imports" },
  { href: "/admin/procurement/vendors", label: "Vendors" },
  { href: "/admin/procurement/items", label: "Items" },
  { href: "/admin/procurement/approval-matrix", label: "Approval Matrix" },
  { href: "/admin/procurement/approval-inbox", label: "Approval Inbox" },
  { href: "/admin/procurement/quotes", label: "Quotes" },
  { href: "/admin/procurement/pos", label: "PO" },
  { href: "/admin/procurement/receiving", label: "Receiving" },
  { href: "/admin/procurement/claims", label: "Claims" },
  { href: "/admin/procurement/invoices", label: "Invoices" },
  { href: "/admin/procurement/payments", label: "Payments" },
  { href: "/admin/procurement/price-checks", label: "Price Checks" },
  { href: "/admin/procurement/kpi", label: "KPI" },
  { href: "/admin/procurement/scorecards", label: "Scorecards" },
  { href: "/admin/procurement/risk-lab", label: "Risk Lab" },
  { href: "/admin/procurement/whitelist", label: "Whitelist" },
  { href: "/admin/procurement/exceptions", label: "Exceptions" },
  { href: "/admin/procurement/audit", label: "Audit" },
];

type BadgeSummary = {
  incoming_requests_count: number;
  issue_count: number;
  issue_critical_count: number;
  price_check_pending_count: number;
  price_check_overdue_count: number;
};

function badgeText(v: number): string {
  const n = Number(v || 0);
  if (n <= 0) return "";
  if (n > 9) return "9+";
  return String(n);
}

export default function ProcurementTabs() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<BadgeSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      try {
        const auth = getAuth();
        if (!auth?.accessToken) return;
        const refreshed = await refreshAuthFromApi(auth);
        const city = String(refreshed?.city || auth.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
        const res = await fetch(`/api/admin/procurement/badge-summary?city=${encodeURIComponent(city)}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${refreshed?.accessToken || auth.accessToken}`,
            ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
          },
        });
        if (!res.ok) return;
        const text = await res.text();
        const json = JSON.parse(text || "{}");
        if (!cancelled) {
          setSummary({
            incoming_requests_count: Number(json?.incoming_requests_count || 0),
            issue_count: Number(json?.issue_count || 0),
            issue_critical_count: Number(json?.issue_critical_count || 0),
            price_check_pending_count: Number(json?.price_check_pending_count || 0),
            price_check_overdue_count: Number(json?.price_check_overdue_count || 0),
          });
        }
      } catch {
        // keep tabs usable even if badge summary fails
      }
    }
    void loadSummary();
    const timer = window.setInterval(() => void loadSummary(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const badgeMap = useMemo(
    () => ({
      "/admin/procurement/approval-inbox": {
        count: Number(summary?.incoming_requests_count || 0),
        critical: false,
      },
      "/admin/procurement/exceptions": {
        count: Number(summary?.issue_count || 0),
        critical: Number(summary?.issue_critical_count || 0) > 0,
      },
      "/admin/procurement/price-checks": {
        count: Number(summary?.price_check_pending_count || 0),
        critical: Number(summary?.price_check_overdue_count || 0) > 0,
      },
    }),
    [summary],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.href === "/admin/procurement"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const badge = (badgeMap as any)[item.href];
        const count = Number(badge?.count || 0);
        const badgeCls = badge?.critical
          ? "border-rose-700/70 bg-rose-900/30 text-rose-200"
          : "border-amber-700/70 bg-amber-900/25 text-amber-200";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition",
              active
                ? "border-amber-500 bg-amber-950/25 text-amber-200"
                : "border-neutral-800 bg-neutral-950/40 text-neutral-300 hover:bg-neutral-900 hover:text-white",
            ].join(" ")}
          >
            {item.label}
            {count > 0 ? (
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${badgeCls}`}>
                {badgeText(count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
