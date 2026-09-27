"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  ScanLine,
  Utensils,
  ScrollText,
  Warehouse,
  Layers,
} from "lucide-react";
import { canAccessCountTemplatesAdmin, canAccessDailyInventoryAdmin, canAccessInventoryAdmin, getAuth } from "@/lib/auth";

// ── PRIMARY tabs — shown prominently at the top for staff ────────────────────
//
// ⚠️ ここに並べるのは「押したら何かが起きる」ものだけ。押しても何も起きない
// 選択肢が並んでいると、画面全体が信用されなくなる。
//
// 2026-09-27 に本番の全行を数えて外したもの（**コードもルートも消していない。
// 一覧から外しただけ**なので、URL を直接開けば今も使える）:
//   - Transfer Orders … `inv_transfer_orders` / `inv_transfers` が開設以来 **0行**
//   - Quantity Adjustments … `inv_quantity_adjustments` **0行**
//   - Cost Adjustments … `inv_cost_adjustments` **0行**
//
// **Full Inventory Count は外していない。** 行数だけ見ると止まって見えるが、
// 2026-09-08 に TAFT で7件作られている（全部0品目・同じ人が23分で7回）。
// これは「使われていない」ではなく「使おうとして進めなかった」で、
// 外せばその人が次に困る。原因（ヘッダと品目を別々に書いていた）は直した。
//
// 同じ理由で CK Production（2026-06 に6件・全部 DRAFT）と
// Quick Spot Check（2026-03 に4件・CLOSED まで到達）も残す。
const PRIMARY_ITEMS = [
  { href: "/admin/daily-inventory",          label: "Daily Inventory Input", icon: Warehouse },
  { href: "/admin/inventory/counts",          label: "Full Inventory Count",  icon: ListChecks },
  { href: "/admin/inventory/productions",     label: "CK Production",         icon: ChefHat },
  { href: "/admin/inventory/ck-inventory",    label: "CK Inventory",          icon: Layers },
  { href: "/admin/inventory/wh-inventory",    label: "WH Inventory",          icon: Building2 },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

// ── SECONDARY tabs — admin / advanced ────────────────────────────────────────
const SECONDARY_ITEMS = [
  { href: "/admin/inventory",                    label: "Overview",              icon: LayoutDashboard },
  { href: "/admin/inventory/items",              label: "Ingredients / Products", icon: Boxes },
  { href: "/admin/inventory/count-sheets",       label: "Count Templates",        icon: ClipboardList },
  { href: "/admin/inventory/spot-checks",        label: "Quick Spot Check",       icon: ScanLine },
  { href: "/admin/inventory/ingredient-usage",   label: "Ingredients Used by Sales", icon: Utensils },
  { href: "/admin/inventory/pos-sync",           label: "POS Sync",               icon: RefreshCw },
  { href: "/admin/inventory/ledger",             label: "Ledger",                 icon: ScrollText },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

export default function InventoryTabs() {
  const pathname = usePathname();
  const auth = getAuth();
  const canManageCountTemplates = canAccessCountTemplatesAdmin(auth);
  const canDailyInv = canAccessDailyInventoryAdmin(auth);

  // Filter primary items
  const primaryItems = PRIMARY_ITEMS.filter((item) => {
    if (item.href === "/admin/daily-inventory" && !canDailyInv) return false;
    return true;
  });

  // Filter secondary items: only users with inventory.write (admin) see these tabs.
  // Users with only inventory.read (limited) or no inventory permission see none.
  const canSeeSecondary = canAccessInventoryAdmin(auth);
  const secondaryItems = !canSeeSecondary
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
