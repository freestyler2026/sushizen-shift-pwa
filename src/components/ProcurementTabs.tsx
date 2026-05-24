"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
      { href: "/admin/procurement/hub",               label: "Hub",               showTo: ["manager", "full"] },
      { href: "/admin/procurement",                  label: "Requests",          showTo: ["staff", "manager", "inventory", "full"] },
      { href: "/admin/procurement/approval-inbox",   label: "Needs My Approval", showTo: ["staff", "manager", "inventory", "full"] },
      { href: "/admin/procurement/price-search",     label: "Item Price Search", showTo: ["staff", "manager", "inventory", "full"] },
      { href: "/admin/procurement/quotes",           label: "Quotes",            showTo: ["manager", "full"] },
      { href: "/admin/procurement/pos",              label: "PO",                showTo: ["manager", "full"] },
      { href: "/admin/procurement/ck-orders",        label: "CK Orders",         showTo: ["manager", "full"] },
      { href: "/admin/procurement/receiving",        label: "Confirm Delivery",  showTo: ["manager", "full"] },
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
  action_needed_count: number;
  issue_count: number;
  issue_critical_count: number;
  price_check_pending_count: number;
  price_check_overdue_count: number;
  invoice_integrity_alert_count: number;
  invoice_integrity_critical_count: number;
  invoice_price_alert_count: number;
  invoice_price_critical_count: number;
  invoice_alert_total: number;
  invoice_alert_has_critical: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProcurementTabs() {
  const pathname = usePathname();

  const [summary, setSummary] = useState<BadgeSummary | null>(null);
  // Initialise synchronously from cached auth so tabs render with correct access
  // from the very first paint (avoids a "full" flash before loadBadge resolves).
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(() => {
    const auth = getAuth();
    return roleToAccessLevel(String(auth?.role || "STAFF"));
  });

  // Exactly one group is open at a time — default to active group or "operations"
  const [selectedGroup, setSelectedGroup] = useState<string>(
    () => findActiveGroup(pathname) ?? "operations",
  );

  // When the URL changes (navigation), switch to the group that owns the new page
  useEffect(() => {
    const active = findActiveGroup(pathname);
    if (active) setSelectedGroup(active);
  }, [pathname]);

  // Load badge summary + resolve access level
  const loadBadge = useCallback(async () => {
    try {
      const auth = getAuth();
      if (!auth?.accessToken) return;
      const refreshed = await refreshAuthFromApi(auth);
      const role = String(refreshed?.role || auth?.role || "STAFF");
      const city =
        String(refreshed?.city || auth?.city || "manila").toLowerCase() === "dubai"
          ? "dubai"
          : "manila";
      setAccessLevel(roleToAccessLevel(role));
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
      if (!res.ok) return;
      const json = JSON.parse(await res.text() || "{}");
      setSummary({
        incoming_requests_count:          Number(json?.incoming_requests_count          || 0),
        action_needed_count:              Number(json?.action_needed_count              || 0),
        issue_count:                      Number(json?.issue_count                      || 0),
        issue_critical_count:             Number(json?.issue_critical_count             || 0),
        price_check_pending_count:        Number(json?.price_check_pending_count        || 0),
        price_check_overdue_count:        Number(json?.price_check_overdue_count        || 0),
        invoice_integrity_alert_count:    Number(json?.invoice_integrity_alert_count    || 0),
        invoice_integrity_critical_count: Number(json?.invoice_integrity_critical_count || 0),
        invoice_price_alert_count:        Number(json?.invoice_price_alert_count        || 0),
        invoice_price_critical_count:     Number(json?.invoice_price_critical_count     || 0),
        invoice_alert_total:              Number(json?.invoice_alert_total              || 0),
        invoice_alert_has_critical:       Boolean(json?.invoice_alert_has_critical),
      });
    } catch { /* keep tabs usable if badge load fails */ }
  }, []);

  useEffect(() => {
    void loadBadge();
    const timer = window.setInterval(() => void loadBadge(), 15_000);
    // Listen for immediate refresh requests (e.g., after approve/reject)
    const onRefresh = () => void loadBadge();
    window.addEventListener("procurement-badge-refresh", onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("procurement-badge-refresh", onRefresh);
    };
  }, [loadBadge]);

  // Badge map: href → { count, critical }
  const badgeMap = useMemo<Record<string, { count: number; critical: boolean }>>(() => ({
    "/admin/procurement/hub": {
      count: Number(summary?.action_needed_count || 0),
      critical: Number(summary?.action_needed_count || 0) > 0,
    },
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
    "/admin/procurement/invoices": {
      count: Number(summary?.invoice_alert_total || summary?.invoice_integrity_alert_count || 0),
      critical: Boolean(summary?.invoice_alert_has_critical) || Number(summary?.invoice_integrity_critical_count || 0) > 0,
    },
  }), [summary]);

  // Only show groups that have ≥1 tab visible to the current user
  const visibleGroups = useMemo(
    () => GROUPS.filter((g) => g.tabs.some((t) => t.showTo.includes(accessLevel))),
    [accessLevel],
  );

  const activeGroupId = findActiveGroup(pathname);

  // The single expanded group (user's explicit selection, or URL-derived)
  const openGroupId = selectedGroup;

  return (
    <div className="space-y-1.5">
      {/* ── Group header buttons ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {visibleGroups.map((group) => {
          const isOpen   = group.id === openGroupId;
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
              onClick={() => setSelectedGroup(group.id)}
              className={[
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition select-none",
                isOpen
                  ? isActive
                    ? "border-violet-500/70 bg-violet-700/30 font-semibold text-violet-100 shadow-sm"
                    : "border-violet-700/50 bg-violet-900/20 font-semibold text-violet-300"
                  : isActive
                  ? "border-violet-800/40 bg-neutral-800/60 font-medium text-violet-400 hover:border-violet-600/50 hover:text-violet-200"
                  : "border-neutral-800 bg-neutral-900/30 font-medium text-neutral-400 hover:border-neutral-700 hover:text-neutral-200",
              ].join(" ")}
            >
              <span>{group.label}</span>
              <span className={`text-[11px] font-normal ${isOpen ? "text-neutral-400" : "text-neutral-600"}`}>{group.sublabel}</span>
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
              <span className={`text-[10px] ${isOpen ? "text-violet-400" : "text-neutral-600"}`}>{isOpen ? "▾" : "▸"}</span>
            </button>
          );
        })}
      </div>

      {/* ── Expanded tab row — only the selected group ───────────────── */}
      {visibleGroups.map((group) => {
        if (group.id !== openGroupId) return null;

        const visibleTabs = group.tabs.filter((t) => t.showTo.includes(accessLevel));
        if (visibleTabs.length === 0) return null;

        return (
          <div
            key={group.id}
            className="flex flex-wrap gap-1 rounded-xl border border-violet-900/30 bg-neutral-900/30 px-2.5 py-2"
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
