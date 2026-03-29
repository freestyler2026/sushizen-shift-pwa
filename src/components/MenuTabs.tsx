"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/menu", label: "Overview" },
  { href: "/admin/menu/categories", label: "Categories" },
  { href: "/admin/menu/products", label: "Products" },
  { href: "/admin/menu/combos", label: "Combos" },
  { href: "/admin/menu/groups", label: "Groups" },
  { href: "/admin/menu/tags", label: "Tags" },
  { href: "/admin/menu/modifier-groups", label: "Modifier Groups" },
  { href: "/admin/menu/modifier-options", label: "Modifier Options" },
];

export default function MenuTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.href === "/admin/menu"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "inline-flex items-center rounded-xl border px-3 py-2 text-xs transition",
              active
                ? "border-amber-500 bg-amber-950/25 text-amber-200"
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
