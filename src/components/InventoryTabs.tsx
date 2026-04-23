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
  Warehouse,
  Layers,
} from "lucide-react";
import { canAccessCountTemplatesAdmin, canAccessDailyInventoryAdmin, canAccessInventoryLimited, getAuth } from "@/lib/auth";

// ── PRIMARY tabs — shown prominently at the top for staff ────────────────────
const PRIMARY_ITEMS = [
  { href: "/admin/daily-inventory",          label: "Daily Inventory Input", icon: Warehouse },
  { href: "/admin/inventory/counts",          label: "Full Inventory Count",  icon: ListChecks },
  { href: "/admin/inventory/transfer-orders", label: "Transfer Orders",       icon: ArrowRightLeft },
  { href: "/admin/inventory/productions",     label: "CK Production",         icon: ChefHat },
  { href: "/admin/inventory/ck-inventory",    label: "CK Inventory",          icon: Layers },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

// ── SECONDARY tabs — admin / advanced ────────────────────────────────────────
const SECONDARY_ITEMS = [
  { href: "/admin/inventory",                    label: "Overview",              icon: LayoutDashboard },
  { href: "/admin/inventory/items",              label: "Ingredients / Products", icon: Boxes },
  { href: "/admin/inventory/recipes",            label: "Sales Menu BOM",         icon: BookOpen },
  { href: "/admin/inventory/count-sheets",       label: "Count Templates",        icon: ClipboardList },
  { href: "/admin/inventory/spot-checks",        label: "Quick Spot Check",       icon: ScanLine },
  { href: "/admin/inventory/quantity-adjustments", label: "Quantity Adjustments", icon: PackageMinus },
  { href: "/admin/inventory/cost-adjustments",   label: "Cost Adjustments",       icon: CircleDollarSign },
  { href: "/admin/inventory/pos-sync",           label: "POS Sync",               icon: RefreshCw },
  { href: "/admin/inventory/ledger",             label: "Ledger",                 icon: ScrollText },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

export default function InventoryTabs() {
  const pathname = usePathname();
  const auth = getAuth();
  const canManageCountTemplates = canAccessCountTemplatesAdmin(auth);
  const limitedInventoryUser = canAccessInventoryLimited(auth);
  const canDailyInv = canAccessDailyInventoryAdmin(auth);

  // Filter primary items
  const primaryItems = PRIMARY_ITEMS.filter((item) => {
    if (item.href === "/admin/daily-inventory" && !canDailyInv) return false;
    return true;
  });

  // Filter secondary items (hidden entirely for limited users)
  const secondaryItems = limitedInventoryUser
    ? []
    : SECONDARY_ITEMS.filter((item) => {
        if (item.href === "/admin/inventory/count-sheets") return canManageCountTemplates;
        return true;
      });

  function isActive(href: string) {
    if (href === "/admin/inventory") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="space-y-2">
      {/* ── PRIMARY row ── */}
      <div className="flex flex-wrap gap-1.5">
        {primaryItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                active
                  ? "bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 shadow-sm shadow-emerald-500/10"
                  : "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/40 hover:text-emerald-200 hover:border-emerald-600/50",
              ].join(" ")}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── SECONDARY row (admin tabs) ── */}
      {secondaryItems.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-2xl border border-white/6 bg-white/3 p-1">
          {secondaryItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all duration-200",
                  active
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/8 font-medium",
                ].join(" ")}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
