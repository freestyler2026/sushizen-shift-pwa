"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

const MODULES = [
  {
    title: "Categories",
    description: "Register the product folders used to organize the sales menu.",
    href: "/admin/menu/categories",
  },
  {
    title: "Products",
    description: "Create sales products, assign categories, and open product detail for ingredient setup.",
    href: "/admin/menu/products",
  },
  {
    title: "Phase 1 Scope",
    description: "Product detail includes ingredients editor and cost summary. Modifiers, tags, prices, combos, and groups follow in later phases.",
    href: "/admin/menu/products",
  },
];

export default function AdminMenuPage() {
  const initialAuth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState(initialAuth?.staffName || "");
  const [city, setCity] = useState((initialAuth?.city || "manila").toUpperCase());
  const [role, setRole] = useState((initialAuth?.role || "").toString().toUpperCase());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const auth = getAuth();
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setCity((resolved?.city || auth?.city || "manila").toUpperCase());
      setRole((resolved?.role || auth?.role || "").toString().toUpperCase());
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading menu workspace...</div>;
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-lg font-semibold text-neutral-100">Menu Builder</div>
        <div className="mt-2 text-sm text-neutral-400">You do not have permission to open the menu workspace.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Menu Builder</div>
            <div className="mt-1 text-sm text-neutral-400">
              Independent workspace for sales menu registration. Phase 1 covers categories, products, and product ingredients.
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">
            {staffName ? `${staffName} • ${role || "STAFF"} • ${city}` : "Role session active"}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-800/60 bg-amber-950/15 p-4 sm:col-span-3">
            <div className="text-sm font-semibold text-amber-100">Phase 1 workflow</div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-amber-50/90">
              <li>Create menu categories first.</li>
              <li>Create products and assign each product to a category.</li>
              <li>Open product detail and add ingredient lines from inventory items.</li>
              <li>Review the automatic cost summary before later phases expand tags, modifiers, and prices.</li>
            </ol>
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
            href="/admin/inventory"
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
          >
            Open Inventory
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {MODULES.map((module) => (
          <Link
            key={module.title}
            href={module.href}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 transition hover:border-amber-700/70 hover:bg-neutral-900/35"
          >
            <div className="text-sm font-semibold text-neutral-100">{module.title}</div>
            <div className="mt-2 text-xs leading-5 text-neutral-400">{module.description}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
