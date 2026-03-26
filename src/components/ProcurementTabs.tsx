"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/procurement", label: "Requests" },
  { href: "/admin/procurement/approval-inbox", label: "Approval Inbox" },
  { href: "/admin/procurement/pos", label: "PO" },
  { href: "/admin/procurement/exceptions", label: "Exceptions" },
  { href: "/admin/procurement/audit", label: "Audit" },
];

export default function ProcurementTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "rounded-xl border px-3 py-2 text-xs transition",
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
