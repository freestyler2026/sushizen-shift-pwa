"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { TAB_ACTIVE, TAB_CONTAINER, TAB_INACTIVE } from "@/lib/ui-tokens";

// ─── Access levels ────────────────────────────────────────────────────────────
// staff     → STAFF (and any unrecognised role)
// manager   → MANAGER / DUBAI_MANAGER / MANILA_MANAGER
// inventory → INVENTORY_PURCHASING / INVENTORY / PURCHASING (Manila finance roles)
// full      → HQ / ADMIN / DUBAI_MANAGEMENT / MANILA_MANAGEMENT
type AccessLevel = "staff" | "manager" | "inventory" | "full";

const FULL_ROLES = new Set(["HQ", "ADMIN", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT"]);
const MANAGER_ROLES = new Set(["MANAGER", "DUBAI_MANAGER", "MANILA_MANAGER"]);
const INVENTORY_ROLES = new Set(["INVENTORY_PURCHASING", "INVENTORY", "PURCHASING"]);

function roleToAccessLevel(role: string): AccessLevel {
  const r = (role || "STAFF").toUpperCase().trim();
  if (FULL_ROLES.has(r)) return "full";
  if (MANAGER_ROLES.has(r)) return "manager";
  if (INVENTORY_ROLES.has(r)) return "inventory";
  return "staff";
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
type TabItem = {
  href: string;
  label: string;
  showTo: AccessLevel[];
};

const ALL_TABS: TabItem[] = [
  // Visible to everyone with procurement access
  { href: "/admin/procurement",              label: "Requests",          showTo: ["staff", "manager", "inventory", "full"] },
  { href: "/admin/procurement/approval-inbox", label: "Needs My Approval", showTo: ["staff", "manager", "inventory", "full"] },
  // Manager+ (order fulfilment flow)
  { href: "/admin/procurement/quotes",       label: "Quotes",            showTo: ["manager", "full"] },
  { href: "/admin/procurement/pos",          label: "PO",                showTo: ["manager", "full"] },
  { href: "/admin/procurement/receiving",    label: "Confirm Delivery",  showTo: ["manager", "full"] },
  // Inventory & Purchasing (finance/payment flow)
  { href: "/admin/procurement/dashboard",   label: "Dashboard",         showTo: ["inventory", "full"] },
  { href: "/admin/procurement/invoices",     label: "Invoices",          showTo: ["inventory", "full"] },
  { href: "/admin/procurement/payments",     label: "Payments",          showTo: ["inventory", "full"] },
  { href: "/admin/procurement/price-checks", label: "Price Checks",      showTo: ["inventory", "full"] },
  // Full access only (management / HQ / admin)
  { href: "/admin/procurement/claims",       label: "Claims",            showTo: ["full"] },
  { href: "/admin/procurement/imports",      label: "Imports",           showTo: ["full"] },
  { href: "/admin/procurement/vendors",      label: "Vendors",           showTo: ["full"] },
  { href: "/admin/procurement/ingredients",  label: "Ingredients",       showTo: ["full"] },
  { href: "/admin/procurement/approval-matrix", label: "Approval Matrix", showTo: ["full"] },
  { href: "/admin/procurement/kpi",          label: "KPI",               showTo: ["full"] },
  { href: "/admin/procurement/scorecards",   label: "Scorecards",        showTo: ["full"] },
  { href: "/admin/procurement/risk-lab",     label: "Stock Risk",        showTo: ["full"] },
  { href: "/admin/procurement/whitelist",    label: "Emergency Vendors", showTo: ["full"] },
  { href: "/admin/procurement/exceptions",   label: "Alerts",            showTo: ["full"] },
  { href: "/admin/procurement/audit",        label: "Audit",             showTo: ["full"] },
];

// ─── Badge summary type ───────────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProcurementTabs() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<BadgeSummary | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("full"); // default to full until auth loads

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      try {
        const auth = getAuth();
        if (!auth?.accessToken) return;
        const refreshed = await refreshAuthFromApi(auth);
        const role = String(refreshed?.role || auth?.role || "STAFF");
        const city = String(refreshed?.city || auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
        if (!cancelled) setAccessLevel(roleToAccessLevel(role));
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
        // keep tabs usable even if badge summary or auth fails
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

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => t.showTo.includes(accessLevel)),
    [accessLevel],
  );

  return (
    <div className={TAB_CONTAINER}>
      {visibleTabs.map((item) => {
        const active = item.href === "/admin/procurement"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const badge = (badgeMap as Record<string, { count: number; critical: boolean } | undefined>)[item.href];
        const count = Number(badge?.count || 0);
        const badgeCls = badge?.critical
          ? "border-rose-700/70 bg-rose-900/30 text-rose-200"
          : "border-amber-700/70 bg-amber-900/25 text-amber-200";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {item.label}
            {count > 0 ? (
              <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeCls}`}>
                {badgeText(count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
