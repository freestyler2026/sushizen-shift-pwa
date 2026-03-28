"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessCountTemplatesAdmin, canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";

type ModuleCard = {
  title: string;
  description: string;
  status: string;
  href: string;
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
  {
    title: "Count Sheets / Order Consumptions",
    description: "Reusable count templates and read-only order consumption records from POS sales.",
    status: "Backend ready",
    href: "/admin/inventory/count-sheets",
  },
];

export default function AdminInventoryPage() {
  const initialAuth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState(initialAuth?.staffName || "");
  const [city, setCity] = useState((initialAuth?.city || "manila").toUpperCase());
  const [role, setRole] = useState((initialAuth?.role || "").toString().toUpperCase());
  const limitedInventoryUser = role === "STAFF" || role === "MANAGER";
  const canManageCountTemplates = role === "HQ" || role === "ADMIN" || canAccessCountTemplatesAdmin(initialAuth);
  const visibleModules = useMemo(
    () => limitedInventoryUser
      ? MODULES.filter((module) =>
        module.href === "/admin/inventory/counts" ||
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
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading inventory menu...</div>;
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-lg font-semibold text-neutral-100">Inventory</div>
        <div className="mt-2 text-sm text-neutral-400">You do not have permission to open the inventory workspace.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Inventory</div>
            <div className="mt-1 text-sm text-neutral-400">
              Independent workspace for Foodics-style inventory management.
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">
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
          <div className="rounded-2xl border border-sky-800/60 bg-sky-950/15 p-4 sm:col-span-3">
            <div className="text-sm font-semibold text-sky-100">How to start (Important)</div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-sky-50/90">
              <li>Register ingredients and products in Ingredients / Products.</li>
              <li>Register sales-menu ingredient mappings in Sales Menu BOM.</li>
              <li>Register CK product recipes in CK Production.</li>
              <li>Then use Count Templates / Full Inventory Count / Quick Spot Check / Ledger.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Status</div>
            <div className="mt-1 text-sm font-medium text-emerald-200">Backend connected</div>
            <div className="mt-1 text-xs text-neutral-400">Inventory APIs, ledger, BOM, and POS staging are prepared.</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">POS Source</div>
            <div className="mt-1 text-sm font-medium text-neutral-100">UrbanPiper orders-by-item</div>
            <div className="mt-1 text-xs text-neutral-400">Branch-aware CSV sync is set for Dubai inventory staging.</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Next Step</div>
            <div className="mt-1 text-sm font-medium text-amber-200">BOM data input</div>
            <div className="mt-1 text-xs text-neutral-400">Theoretical stock posting starts after menu recipes are registered.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
          >
            Back to Admin Dashboard
          </Link>
          <Link
            href="/admin/procurement"
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
          >
            Open Procurement
          </Link>
        </div>
      </section>

      <InventoryRegistrationHelp />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleModules.map((module) => (
          <Link key={module.title} href={module.href} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 transition hover:border-emerald-700/70 hover:bg-neutral-900/35">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-neutral-100">{module.title}</div>
              <span className="rounded-full border border-emerald-700/60 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-200">
                {module.status}
              </span>
            </div>
            <div className="mt-2 text-xs leading-5 text-neutral-400">{module.description}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
