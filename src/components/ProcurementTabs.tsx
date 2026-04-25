"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { TAB_ACTIVE, TAB_INACTIVE } from "@/lib/ui-tokens";

// ─── Access levels ────────────────────────────────────────────────────────────
type AccessLevel = "staff" | "manager" | "inventory" | "full";

const FULL_ROLES    = new Set(["HQ", "ADMIN", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT"]);
const MANAGER_ROLES = new Set(["MANAGER", "DUBAI_MANAGER", "MANILA_MANAGER"]);
const INVENTORY_ROLES = new Set(["INVENTORY_PURCHASING", "INVENTORY", "PURCHASING"]);

function roleToAccessLevel(role: string): AccessLevel {
  const r = (role || "STAFF").toUpperCase().trim();
  if (FULL_ROLES.has(r)) return "full";
  if (MANAGER_ROLES.has(r)) return "manager";
  if (INVENTORY_ROLES.has(r)) return "inventory";
  return "staff";
}

// ─── Tab + group definitions ─────────────────────────────────────────────────
type TabItem = {
  href: string;
  label: string;
  showTo: AccessLevel[];
};

type TabGroup = {
  id: string;
  label: string;
  sublabel: string;
  tabs: TabItem[];
};

const GROUPS: TabGroup[] = [
  {
    id: "operations",
    label: "Operations",
    sublabel: "Daily work",
    tabs: [
      { href: "/admin/procurement",               label: "Requests",          showTo: ["staff", "manager", "inventory", "full"] },
      { href: "/admin/procurement/approval-inbox", label: "Needs My Approval", showTo: ["staff", "manager", "inventory", "full"] },
      { href: "/admin/procurement/quotes",         label: "Quotes",            showTo: ["manager", "full"] },
      { href: "/admin/procurement/pos",            label: "PO",                showTo: ["manager", "full"] },
      { href: "/admin/procurement/receiving",      label: "Confirm Delivery",  showTo: ["manager", "full"] },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    sublabel: "Billing & payments",
    tabs: [
      { href: "/admin/procurement/invoices",     label: "Invoices",     showTo: ["inventory", "full"] },
      { href: "/admin/procurement/claims",       label: "Claims",       showTo: ["full"] },
      { href: "/admin/procurement/payments",     label: "Payments",     showTo: ["inventory", "full"] },
      { href: "/admin/procurement/price-checks", label: "Price Checks", showTo: ["inventory", "full"] },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    sublabel: "KPI & risks",
    tabs: [
      { href: "/admin/procurement/dashboard",  label: "Dashboard",  showTo: ["inventory", "full"] },
      { href: "/admin/procurement/kpi",        label: "KPI",        showTo: ["full"] },
      { href: "/admin/procurement/scorecards", label: "Scorecards", showTo: ["full"] },
      { href: "/admin/procurement/risk-lab",   label: "Stock Risk", showTo: ["full"] },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    sublabel: "Config & audit",
    tabs: [
      { href: "/admin/procurement/vendors",         label: "Vendors",           showTo: ["full"] },
      { href: "/admin/procurement/ingredients",     label: "Ingredients",       showTo: ["full"] },
      { href: "/admin/procurement/approval-matrix", label: "Approval Matrix",   showTo: ["full"] },
      { href: "/admin/procurement/imports",         label: "Imports",           showTo: ["full"] },
      { href: "/admin/procurement/whitelist",       label: "Emergency Vendors", showTo: ["full"] },
      { href: "/admin/procurement/exceptions",      label: "Alerts",            showTo: ["full"] },
      { href: "/admin/procurement/audit",           label: "Audit",             showTo: ["full"] },
    ],
  },
];

// Returns the group id that contains the currently active path
function findActiveGroup(path: string): string | null {
  for (const group of GROUPS) {
    for (const tab of group.tabs) {
      const active =
        tab.href === "/admin/procurement"
          ? path === tab.href
          : path === tab.href || path.startsWith(tab.href + "/");
      if (active) return group.id;
    }
  }
  return null;
}

// ─── Badge summary ────────────────────────────────────────────────────────────
type BadgeSummary = {
  incoming_requests_count: number;
  issue_count: number;
  issue_critical_count: number;
  price_check_pending_count: number;
  price_check_overdue_count: number;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProcurementTabs() {
  const pathname = usePathname();

  const [summary, setSummary] = useState<BadgeSummary | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("full");

  // Open groups — Operations is always open by default; auto-open the active group
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = findActiveGroup(pathname);
    const initial = new Set<string>(["operations"]);
    if (active) initial.add(active);
    return initial;
  });

  // When the URL changes (navigation), ensure the containing group is expanded
  useEffect(() => {
    const active = findActiveGroup(pathname);
    if (!active) return;
    setOpenGroups((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [pathname]);

  // Load badge summary + resolve access level
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const auth = getAuth();
        if (!auth?.accessToken) return;
        const refreshed = await refreshAuthFromApi(auth);
        const role = String(refreshed?.role || auth?.role || "STAFF");
        const city =
          String(refreshed?.city || auth?.city || "manila").toLowerCase() === "dubai"
            ? "dubai"
            : "manila";
        if (!cancelled) setAccessLevel(roleToAccessLevel(role));
        const res = await fetch(
          `/api/admin/procurement/badge-summary?city=${encodeURIComponent(city)}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${refreshed?.accessToken || auth.accessToken}`,
              ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
            },
          },
        );
        if (!res.ok || cancelled) return;
        const json = JSON.parse(await res.text() || "{}");
        setSummary({
          incoming_requests_count:  Number(json?.incoming_requests_count  || 0),
          issue_count:              Number(json?.issue_count              || 0),
          issue_critical_count:     Number(json?.issue_critical_count     || 0),
          price_check_pending_count: Number(json?.price_check_pending_count || 0),
          price_check_overdue_count: Number(json?.price_check_overdue_count || 0),
        });
      } catch { /* keep tabs usable if badge load fails */ }
    }
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // Badge map: href → { count, critical }
  const badgeMap = useMemo<Record<string, { count: number; critical: boolean }>>(() => ({
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
  }), [summary]);

  // Only show groups that have ≥1 tab visible to the current user
  const visibleGroups = useMemo(
    () => GROUPS.filter((g) => g.tabs.some((t) => t.showTo.includes(accessLevel))),
    [accessLevel],
  );

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  const activeGroupId = findActiveGroup(pathname);

  return (
    <div className="space-y-1.5">
      {/* ── Group header buttons ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {visibleGroups.map((group) => {
          const isOpen   = openGroups.has(group.id);
          const isActive = group.id === activeGroupId;

          // Sum badge counts across all tabs in this group
          const groupBadge = group.tabs.reduce(
            (acc, tab) => {
              const b = badgeMap[tab.href];
              return { count: acc.count + (b?.count || 0), critical: acc.critical || (b?.critical ?? false) };
            },
            { count: 0, critical: false },
          );

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={[
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition select-none",
                isActive
                  ? "border-violet-600/60 bg-violet-700/25 font-semibold text-violet-200"
                  : isOpen
                  ? "border-neutral-700 bg-neutral-800 font-medium text-neutral-200"
                  : "border-neutral-800 bg-neutral-900/30 font-medium text-neutral-400 hover:border-neutral-700 hover:text-neutral-200",
              ].join(" ")}
            >
              <span>{group.label}</span>
              <span className="text-[11px] font-normal text-neutral-500">{group.sublabel}</span>
              {groupBadge.count > 0 && (
                <span
                  className={[
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    groupBadge.critical
                      ? "border-rose-700/70 bg-rose-900/30 text-rose-200"
                      : "border-amber-700/60 bg-amber-900/25 text-amber-200",
                  ].join(" ")}
                >
                  {groupBadge.count > 9 ? "9+" : groupBadge.count}
                </span>
              )}
              <span className="text-[10px] text-neutral-600">{isOpen ? "▾" : "▸"}</span>
            </button>
          );
        })}
      </div>

      {/* ── Expanded tab rows ────────────────────────────────────────── */}
      {visibleGroups.map((group) => {
        if (!openGroups.has(group.id)) return null;

        const visibleTabs = group.tabs.filter((t) => t.showTo.includes(accessLevel));
        if (visibleTabs.length === 0) return null;

        return (
          <div
            key={group.id}
            className="flex flex-wrap gap-1 rounded-xl border border-neutral-800 bg-neutral-900/20 px-2.5 py-2"
          >
            {visibleTabs.map((tab) => {
              const active =
                tab.href === "/admin/procurement"
                  ? pathname === tab.href
                  : pathname === tab.href || pathname.startsWith(tab.href + "/");
              const badge = badgeMap[tab.href];
              const count = badge?.count ?? 0;
              const badgeCls = badge?.critical
                ? "border-rose-700/70 bg-rose-900/30 text-rose-200"
                : "border-amber-700/70 bg-amber-900/25 text-amber-200";
              return (
                <Link key={tab.href} href={tab.href} className={active ? TAB_ACTIVE : TAB_INACTIVE}>
                  {tab.label}
                  {count > 0 ? (
                    <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeCls}`}>
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
