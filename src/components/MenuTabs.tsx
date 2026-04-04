"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  FolderOpen,
  LayoutDashboard,
  Layers,
  Package,
  Settings2,
  ShoppingBag,
  Sliders,
  Tag,
} from "lucide-react";
import { TAB_ACTIVE, TAB_CONTAINER, TAB_INACTIVE } from "@/lib/ui-tokens";

const ITEMS = [
  { href: "/admin/menu", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/menu/categories", label: "Categories", icon: FolderOpen },
  { href: "/admin/menu/products", label: "Products", icon: ShoppingBag },
  { href: "/admin/menu/combos", label: "Combos", icon: Layers },
  { href: "/admin/menu/groups", label: "Groups", icon: Package },
  { href: "/admin/menu/tags", label: "Tags", icon: Tag },
  { href: "/admin/menu/modifier-groups", label: "Modifier Groups", icon: Sliders },
  { href: "/admin/menu/modifier-options", label: "Modifier Options", icon: Settings2 },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

export default function MenuTabs() {
  const pathname = usePathname();
  return (
    <div className={TAB_CONTAINER}>
      {ITEMS.map((item) => {
        const active = item.href === "/admin/menu"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? TAB_ACTIVE : TAB_INACTIVE}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
