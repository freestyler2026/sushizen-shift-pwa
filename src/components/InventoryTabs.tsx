"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BookOpen,
  Boxes,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  PackageMinus,
  RefreshCw,
  ScanLine,
  ScrollText,
} from "lucide-react";
import { canAccessCountTemplatesAdmin, canAccessInventoryLimited, getAuth } from "@/lib/auth";

const ITEMS = [
  { href: "/admin/inventory", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/inventory/items", label: "Ingredients / Products", icon: Boxes },
  { href: "/admin/inventory/recipes", label: "Sales Menu BOM", icon: BookOpen },
  { href: "/admin/inventory/count-sheets", label: "Count Templates", icon: ClipboardList },
  { href: "/admin/inventory/counts", label: "Full Inventory Count", icon: ListChecks },
  { href: "/admin/inventory/spot-checks", label: "Quick Spot Check", icon: ScanLine },
  { href: "/admin/inventory/transfer-orders", label: "Transfer Orders", icon: ArrowRightLeft },
  { href: "/admin/inventory/productions", label: "CK Production", icon: ChefHat },
  { href: "/admin/inventory/quantity-adjustments", label: "Quantity Adjustments", icon: PackageMinus },
  { href: "/admin/inventory/cost-adjustments", label: "Cost Adjustments", icon: CircleDollarSign },
  { href: "/admin/inventory/pos-sync", label: "POS Sync", icon: RefreshCw },
  { href: "/admin/inventory/ledger", label: "Ledger", icon: ScrollText },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

export default function InventoryTabs() {
  const pathname = usePathname();
  const auth = getAuth();
  const canManageCountTemplates = canAccessCountTemplatesAdmin(auth);
  const limitedInventoryUser = canAccessInventoryLimited(auth);
  const items = limitedInventoryUser
    ? ITEMS.filter((item) =>
      item.href === "/admin/inventory" ||
      item.href === "/admin/inventory/counts" ||
      item.href === "/admin/inventory/spot-checks" ||
      item.href === "/admin/inventory/transfer-orders" ||
      item.href === "/admin/inventory/productions")
    : ITEMS.filter((item) => (item.href === "/admin/inventory/count-sheets" ? canManageCountTemplates : true));

  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-white/5 p-1">
      {items.map((item) => {
        const active = item.href === "/admin/inventory"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm transition-all duration-200 rounded-xl",
              active
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-white/8 font-medium",
            ].join(" ")}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
