// src/components/NavBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { getAuth, isAdmin } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  match?: "exact" | "prefix";
};

const PRIMARY: NavItem[] = [
  { href: "/week", label: "Week", match: "exact" },
  { href: "/calendar", label: "Calendar", match: "exact" },
  { href: "/request", label: "Request", match: "exact" },
];

const SECONDARY_BASE: NavItem[] = [{ href: "/swap-approve", label: "Swap Approve", match: "exact" }];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", adminOnly: true, match: "exact" },
  { href: "/admin/analytics", label: "Analytics", adminOnly: true, match: "exact" },
  { href: "/admin/attendance", label: "Attendance", adminOnly: true, match: "prefix" },
  { href: "/admin/absences", label: "Absences", adminOnly: true, match: "exact" },
  { href: "/admin/staff", label: "Staff", adminOnly: true, match: "prefix" },
  { href: "/admin/draft", label: "Draft", adminOnly: true, match: "prefix" },
];

function isActive(pathname: string, item: NavItem) {
  const mode = item.match || "exact";
  if (mode === "prefix") return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

function NavBtn({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-xl border px-4 py-2 text-sm transition",
        "whitespace-nowrap",
        active
          ? "border-amber-500 bg-amber-950/25 text-amber-200"
          : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const a = getAuth();
    setShowAdmin(isAdmin(a));
    setDisplayName(a?.staffName || "");
  }, []);

  const secondary = useMemo(() => {
    const base = [...SECONDARY_BASE];
    if (showAdmin) base.push(...ADMIN_ITEMS);
    return base;
  }, [showAdmin]);

  return (
    <div className="w-full">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="text-base font-extrabold tracking-wide text-neutral-100 whitespace-nowrap">
          Sushi ZEN Shift
        </div>

        <div className="hidden sm:block text-xs text-neutral-500">
          {displayName ? (
            <>
              Logged in as: <span className="text-neutral-200">{displayName}</span>
            </>
          ) : (
            <>Not logged in</>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="mt-3 space-y-3 sm:hidden">
        <div className="grid grid-cols-2 gap-2">
          {PRIMARY.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} />
          ))}
          {secondary.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} />
          ))}
        </div>

        <div className="flex">
          <div className="w-full">
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="mt-3 hidden sm:flex items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2">
          {PRIMARY.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} />
          ))}
          {secondary.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} />
          ))}
        </nav>

        <div className="shrink-0">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}