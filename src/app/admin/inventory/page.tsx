"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessCountTemplatesAdmin, canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { inventoryGet } from "@/lib/inventoryClient";
import { cardVariants, pageVariants, staggerContainerVariants } from "@/lib/motion-tokens";
import { Spinner } from "@/components/ui/Spinner";

type ModuleCard = {
  title: string;
  description: string;
  status: string;
  href: string;
};

type ActivitySummary = {
  lastCountDate?: string;
  lastSpotCheckDate?: string;
  openSpotCheckCount?: number;
  pendingOrderCount?: number;
  lastAdjustmentDate?: string;
};

const MODULES: ModuleCard[] = [
  {
    title: "Ingredients / Products",
    description: "Inventory masters for SKU, supplier links, category setup, and branch-level par settings.",
    status: "Backend ready",
    href: "/admin/inventory/items",
  },
  {
    title: "Sales Menu BOM",
    description: "Menu-to-ingredient mapping used to convert sales into theoretical stock consumption.",
    status: "Backend ready",
    href: "/admin/inventory/recipes",
  },
  {
    title: "POS Sync",
    description: "UrbanPiper orders-by-item CSV sync from Google Drive into branch-aware inventory staging.",
    status: "Backend ready",
    href: "/admin/inventory/pos-sync",
  },
  {
    title: "Transfer Orders",
    description: "Create inter-branch ingredient transfer requests with item, quantity, source, destination, and assigned staff.",
    status: "Backend ready",
    href: "/admin/inventory/transfer-orders",
  },
  {
    title: "Ledger / Balances",
    description: "Stock ledger, daily balance snapshots, and theoretical inventory calculation endpoints.",
    status: "Backend ready",
    href: "/admin/inventory/ledger",
  },
  {
    title: "Full Inventory Count",
    description: "Draft, submit, and close flows for physical inventory checks and spot audits.",
    status: "Backend ready",
    href: "/admin/inventory/counts",
  },
  {
    title: "Count Templates",
    description: "Excel-like supplier-grouped templates used to prepare 15th and month-end stock counts.",
    status: "Backend ready",
    href: "/admin/inventory/count-sheets",
  },
  {
    title: "Quick Spot Check",
    description: "Daily or weekly partial stock verification for managers and CK leads with ledger posting on close.",
    status: "Backend ready",
    href: "/admin/inventory/spot-checks",
  },
  {
    title: "CK Production / Adjustments",
    description: "Production, quantity adjustment, and cost adjustment workflows with ledger posting.",
    status: "Backend ready",
    href: "/admin/inventory/productions",
  },
  {
    title: "Quantity Adjustments",
    description: "Increase or decrease stock for waste, expired items, loss, damage, and manual corrections.",
    status: "Backend ready",
    href: "/admin/inventory/quantity-adjustments",
  },
  {
    title: "Cost Adjustments",
    description: "Update item cost values with branch-aware history and ledger value impact on close.",
    status: "Backend ready",
    href: "/admin/inventory/cost-adjustments",
  },
];

function relativeDate(isoDate?: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoDate).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export default function AdminInventoryPage() {
  const initialAuth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState(initialAuth?.staffName || "");
  const [city, setCity] = useState((initialAuth?.city || "manila").toUpperCase());
  const [role, setRole] = useState((initialAuth?.role || "").toString().toUpperCase());
  const [summary, setSummary] = useState<ActivitySummary>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  const limitedInventoryUser = role === "STAFF" || role === "MANAGER";
  const canManageCountTemplates = role === "HQ" || role === "ADMIN" || canAccessCountTemplatesAdmin(initialAuth);
  const visibleModules = useMemo(
    () => limitedInventoryUser
      ? MODULES.filter((module) =>
        module.href === "/admin/inventory/counts" ||
        module.href === "/admin/inventory/spot-checks" ||
        module.href === "/admin/inventory/transfer-orders" ||
        module.href === "/admin/inventory/productions")
      : MODULES.filter((module) => (module.href === "/admin/inventory/count-sheets" ? canManageCountTemplates : true)),
    [canManageCountTemplates, limitedInventoryUser],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const auth = getAuth();
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessInventoryWorkspace(resolved));
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setCity((resolved?.city || auth?.city || "manila").toUpperCase());
      setRole((resolved?.role || auth?.role || "").toString().toUpperCase());
      setReady(true);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Fetch activity summary after auth resolves
  useEffect(() => {
    if (!allowed || !city) return;
    const cityLower = city.toLowerCase() as City;
    const defaultBranch = BRANCHES[cityLower]?.[0]?.code || "";
    let cancelled = false;
    setSummaryLoading(true);

    Promise.all([
      inventoryGet<{ rows: { business_date: string }[] }>(
        `/api/admin/inventory/counts?city=${cityLower}&branch_code=${encodeURIComponent(defaultBranch)}&limit=1`,
      ).catch(() => ({ rows: [] as { business_date: string }[] })),
      inventoryGet<{ rows: { business_date: string; status: string }[] }>(
        `/api/admin/inventory/spot-checks?city=${cityLower}&branch_code=${encodeURIComponent(defaultBranch)}&limit=30`,
      ).catch(() => ({ rows: [] as { business_date: string; status: string }[] })),
      inventoryGet<{ rows: unknown[] }>(
        `/api/admin/inventory/productions/ck-pending?city=${cityLower}`,
      ).catch(() => ({ rows: [] as unknown[] })),
      inventoryGet<{ rows: { business_date: string }[] }>(
        `/api/admin/inventory/quantity-adjustments?city=${cityLower}&branch_code=${encodeURIComponent(defaultBranch)}&limit=1`,
      ).catch(() => ({ rows: [] as { business_date: string }[] })),
    ]).then(([countsRes, spotRes, ckRes, adjRes]) => {
      if (cancelled) return;
      const spotRows = spotRes.rows || [];
      setSummary({
        lastCountDate: (countsRes.rows || [])[0]?.business_date,
        lastSpotCheckDate: spotRows[0]?.business_date,
        openSpotCheckCount: spotRows.filter((r) => r.status === "DRAFT").length,
        pendingOrderCount: (ckRes.rows || []).length,
        lastAdjustmentDate: (adjRes.rows || [])[0]?.business_date,
      });
    }).finally(() => {
      if (!cancelled) setSummaryLoading(false);
    });

    return () => { cancelled = true; };
  }, [allowed, city]);

  function getModuleStat(href: string): React.ReactNode {
    if (href === "/admin/inventory/counts") {
      if (summaryLoading) return <span className="text-[11px] text-zinc-600">Loading…</span>;
      if (summary.lastCountDate) return (
        <span className="text-[11px] text-zinc-400">Last count: {relativeDate(summary.lastCountDate)}</span>
      );
      return <span className="text-[11px] text-zinc-600">No counts yet</span>;
    }
    if (href === "/admin/inventory/spot-checks") {
      if (summaryLoading) return <span className="text-[11px] text-zinc-600">Loading…</span>;
      const parts: string[] = [];
      if (summary.lastSpotCheckDate) parts.push(`Last: ${relativeDate(summary.lastSpotCheckDate)}`);
      if (summary.openSpotCheckCount) parts.push(`${summary.openSpotCheckCount} open draft${summary.openSpotCheckCount !== 1 ? "s" : ""}`);
      if (parts.length) return <span className="text-[11px] text-zinc-400">{parts.join(" · ")}</span>;
      return <span className="text-[11px] text-zinc-600">No spot checks yet</span>;
    }
    if (href === "/admin/inventory/productions") {
      if (summaryLoading) return <span className="text-[11px] text-zinc-600">Loading…</span>;
      if (summary.pendingOrderCount) return (
        <span className="text-[11px] font-semibold text-amber-400">
          {summary.pendingOrderCount} pending order{summary.pendingOrderCount !== 1 ? "s" : ""}
        </span>
      );
      return <span className="text-[11px] text-zinc-600">No pending orders</span>;
    }
    if (href === "/admin/inventory/quantity-adjustments") {
      if (summaryLoading) return <span className="text-[11px] text-zinc-600">Loading…</span>;
      if (summary.lastAdjustmentDate) return (
        <span className="text-[11px] text-zinc-400">Last: {relativeDate(summary.lastAdjustmentDate)}</span>
      );
      return null;
    }
    return null;
  }

  if (!ready) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="text-3xl font-light tracking-tight text-white">Inventory</div>
        <div className="mt-2 text-sm leading-relaxed text-zinc-400">You do not have permission to open the inventory workspace.</div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6" variants={pageVariants} initial="hidden" animate="visible">
      <InventoryTabs />

      <motion.section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 backdrop-blur-sm" variants={cardVariants}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-light tracking-tight text-white">Inventory</div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-400">
              Independent workspace for Foodics-style inventory management.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 text-xs text-zinc-500 shadow-lg shadow-black/30 backdrop-blur-sm">
            {staffName ? (
              <>
                {staffName} • {role || "STAFF"} • {city}
              </>
            ) : (
              <>Role session active</>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-500/5 p-4 sm:col-span-3">
            <div className="text-base font-semibold text-white">How to start (Important)</div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-relaxed text-zinc-400">
              <li>Register ingredients and products in Ingredients / Products.</li>
              <li>Register sales-menu ingredient mappings in Sales Menu BOM.</li>
              <li>Register CK product recipes in CK Production.</li>
              <li>Then use Count Templates / Full Inventory Count / Quick Spot Check / Ledger.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 shadow-lg shadow-black/30 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Status</div>
            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 w-fit">
              <span>✓</span>
              <span>Backend connected</span>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-400">Inventory APIs, ledger, BOM, and POS staging are prepared.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 shadow-lg shadow-black/30 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">POS Source</div>
            <div className="mt-2 text-base font-semibold text-white">UrbanPiper orders-by-item</div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-400">Branch-aware CSV sync is set for Dubai inventory staging.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 shadow-lg shadow-black/30 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Next Step</div>
            <div className="mt-2 text-base font-semibold text-white">BOM data input</div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-400">Theoretical stock posting starts after menu recipes are registered.</div>
          </div>
        </div>

        <div className="my-8 border-t border-white/5" />

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="rounded-xl border border-white/15 bg-white/8 px-5 py-2.5 text-sm text-white transition-all duration-200 hover:border-white/25 hover:bg-white/15"
          >
            Back to Admin Dashboard
          </Link>
          <Link
            href="/admin/procurement"
            className="rounded-xl border border-white/15 bg-white/8 px-5 py-2.5 text-sm text-white transition-all duration-200 hover:border-white/25 hover:bg-white/15"
          >
            Open Procurement
          </Link>
        </div>
      </motion.section>

      <InventoryRegistrationHelp />

      <motion.section
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {visibleModules.map((module) => {
          const stat = getModuleStat(module.href);
          return (
            <motion.div key={module.title} variants={cardVariants}>
              <Link href={module.href} className="block rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm transition-all duration-200 hover:border-white/15 hover:bg-white/8">
                <div className="text-base font-semibold text-white">{module.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-400">{module.description}</div>
                {stat && (
                  <div className="mt-3 border-t border-white/5 pt-2">
                    {stat}
                  </div>
                )}
              </Link>
            </motion.div>
          );
        })}
      </motion.section>
    </motion.div>
  );
}
