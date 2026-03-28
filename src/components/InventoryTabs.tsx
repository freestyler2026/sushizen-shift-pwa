"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessCountTemplatesAdmin, getAuth } from "@/lib/auth";

const ITEMS = [
  { href: "/admin/inventory", label: "Overview" },
  { href: "/admin/inventory/items", label: "Ingredients / Products" },
  { href: "/admin/inventory/recipes", label: "Sales Menu BOM" },
  { href: "/admin/inventory/count-sheets", label: "Count Templates" },
  { href: "/admin/inventory/counts", label: "Full Inventory Count" },
  { href: "/admin/inventory/spot-checks", label: "Quick Spot Check" },
  { href: "/admin/inventory/transfer-orders", label: "Transfer Orders" },
  { href: "/admin/inventory/productions", label: "CK Production" },
  { href: "/admin/inventory/quantity-adjustments", label: "Quantity Adjustments" },
  { href: "/admin/inventory/cost-adjustments", label: "Cost Adjustments" },
  { href: "/admin/inventory/pos-sync", label: "POS Sync" },
  { href: "/admin/inventory/ledger", label: "Ledger" },
];

export default function InventoryTabs() {
  const pathname = usePathname();
  const canManageCountTemplates = canAccessCountTemplatesAdmin(getAuth());
  const items = ITEMS.filter((item) => (item.href === "/admin/inventory/count-sheets" ? canManageCountTemplates : true));

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.href === "/admin/inventory"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "inline-flex items-center rounded-xl border px-3 py-2 text-xs transition",
              active
                ? "border-emerald-500 bg-emerald-950/25 text-emerald-200"
                : "border-neutral-800 bg-neutral-950/40 text-neutral-300 hover:bg-neutral-900 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
