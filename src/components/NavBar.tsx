// src/components/NavBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import {
  canAccessAdminNav,
  canAccessBackofficeEvaluationAdmin,
  canAccessInventoryAdmin,
  canAccessPrivateReportAdmin,
  getAuth,
  refreshAuthFromApi,
} from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  match?: "exact" | "prefix";
  badgeCount?: number;
  badgeCritical?: boolean;
};

const PRIMARY: NavItem[] = [
  { href: "/my-shift", label: "My Shift", match: "exact" },
  { href: "/week", label: "Week", match: "exact" },
  { href: "/request", label: "Request", match: "exact" },
  { href: "/private-report", label: "Private Report", match: "exact" },
];

const SECONDARY_BASE: NavItem[] = [
  { href: "/calendar", label: "Calendar", match: "exact" },
  { href: "/inbox", label: "Inbox", match: "exact" },
  { href: "/store/procurement", label: "Store Procurement", match: "prefix" },
  { href: "/swap-approve", label: "Swap Approve", match: "exact" },
  { href: "/change-pin", label: "Change PIN", match: "exact" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", adminOnly: true, match: "exact" },
  { href: "/admin/inventory", label: "Inventory", adminOnly: true, match: "prefix" },
  { href: "/admin/private-reports", label: "Private Reports", adminOnly: true, match: "exact" },
  { href: "/admin/procurement", label: "Procurement", adminOnly: true, match: "prefix" },
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

function NavBtn({
  href,
  label,
  active,
  compact = false,
  badgeCount = 0,
  badgeCritical = false,
}: {
  href: string;
  label: string;
  active: boolean;
  compact?: boolean;
  badgeCount?: number;
  badgeCritical?: boolean;
}) {
  const shown = Number(badgeCount || 0);
  const badgeText = shown > 9 ? "9+" : String(shown);
  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl border text-sm transition",
        compact ? "min-h-10 px-2.5 py-1.5 text-center text-[11px]" : "min-h-10 px-3.5 py-2 text-sm",
        active
          ? "border-amber-500 bg-amber-950/25 text-amber-200"
          : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40 hover:text-white",
      ].join(" ")}
    >
      {label}
      {shown > 0 ? (
        <span
          className={[
            "rounded-full border px-1.5 py-0.5 text-[10px] leading-none",
            badgeCritical ? "border-rose-700/70 bg-rose-900/30 text-rose-200" : "border-amber-700/70 bg-amber-900/25 text-amber-200",
          ].join(" ")}
        >
          {badgeText}
        </span>
      ) : null}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showInventoryAdmin, setShowInventoryAdmin] = useState(false);
  const [showPrivateReportAdmin, setShowPrivateReportAdmin] = useState(false);
  const [showBackofficeEvalAdmin, setShowBackofficeEvalAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [procurementBadgeCount, setProcurementBadgeCount] = useState(0);
  const [procurementBadgeCritical, setProcurementBadgeCritical] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      const a = getAuth();
      if (!a) {
        if (!cancelled) {
          setShowAdmin(false);
          setShowInventoryAdmin(false);
          setShowPrivateReportAdmin(false);
          setShowBackofficeEvalAdmin(false);
          setDisplayName("");
          setProcurementBadgeCount(0);
          setProcurementBadgeCritical(false);
        }
        return;
      }
      const resolved = await refreshAuthFromApi(a);
      if (!cancelled) {
        setShowAdmin(canAccessAdminNav(resolved));
        setShowInventoryAdmin(canAccessInventoryAdmin(resolved));
        setShowPrivateReportAdmin(canAccessPrivateReportAdmin(resolved));
        setShowBackofficeEvalAdmin(canAccessBackofficeEvaluationAdmin(resolved));
        setDisplayName(resolved?.staffName || a.staffName || "");
      }
      try {
        const accessToken = resolved?.accessToken || a.accessToken;
        if (!accessToken) return;
        const city = String(resolved?.city || a.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
        const sumRes = await fetch(`/api/admin/procurement/badge-summary?city=${encodeURIComponent(city)}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(resolved?.stepUpToken ? { "X-Step-Up-Token": resolved.stepUpToken } : {}),
          },
        });
        if (!sumRes.ok) return;
        const sumText = await sumRes.text();
        const sumJson = JSON.parse(sumText || "{}");
        if (!cancelled) {
          const total = Number(sumJson?.total_badge_count || 0);
          setProcurementBadgeCount(total);
          setProcurementBadgeCritical(
            Number(sumJson?.price_check_overdue_count || 0) > 0 || Number(sumJson?.issue_critical_count || 0) > 0,
          );
        }
      } catch {
        if (!cancelled) {
          setProcurementBadgeCount(0);
          setProcurementBadgeCritical(false);
        }
      }
    }

    loadAuth();
    const onStorage = () => loadAuth();
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const secondary = useMemo(() => {
    const base = [...SECONDARY_BASE];
    if (showAdmin) {
      base.push(
        ...ADMIN_ITEMS.map((item) =>
          item.href === "/admin/procurement"
            ? { ...item, badgeCount: procurementBadgeCount, badgeCritical: procurementBadgeCritical }
            : item,
        ),
      );
      if (showBackofficeEvalAdmin && !base.some((x) => x.href === "/admin/backoffice-evaluation")) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", adminOnly: true, match: "exact" });
      }
    } else if (showInventoryAdmin) {
      base.push({ href: "/admin/inventory", label: "Inventory", adminOnly: true, match: "prefix" });
      if (showPrivateReportAdmin) {
        base.push({ href: "/admin/private-reports", label: "Private Reports", adminOnly: true, match: "exact" });
      }
      if (showBackofficeEvalAdmin) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", adminOnly: true, match: "exact" });
      }
    } else if (showPrivateReportAdmin) {
      base.push({ href: "/admin/private-reports", label: "Private Reports", adminOnly: true, match: "exact" });
      if (showBackofficeEvalAdmin) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", adminOnly: true, match: "exact" });
      }
    } else if (showBackofficeEvalAdmin) {
      base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", adminOnly: true, match: "exact" });
    }
    return base;
  }, [showAdmin, showInventoryAdmin, showPrivateReportAdmin, showBackofficeEvalAdmin, procurementBadgeCount, procurementBadgeCritical]);

  const activeMore = useMemo(() => secondary.some((item) => isActive(pathname, item)), [pathname, secondary]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2.5">
        <Link href="/my-shift" className="block min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/50 p-1 shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl sm:p-1.5">
              <Image src="/logo.png" alt="Sushi ZEN logo" width={44} height={44} className="h-full w-full object-contain" priority />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-wide text-neutral-100 sm:text-base">Sushi ZEN Shift</div>
              <div className="truncate text-[10px] text-neutral-500 sm:text-xs">
                {displayName ? (
                  <>
                    Logged in as <span className="text-neutral-300">{displayName}</span>
                  </>
                ) : (
                  "Staff portal"
                )}
              </div>
            </div>
          </div>
        </Link>

        <LogoutButton className="ml-auto min-h-8 shrink-0 px-2.5 py-1 text-[11px] sm:min-h-9" />
      </div>

      <div className="mt-2.5 space-y-2 sm:hidden">
        <div className="grid grid-cols-3 gap-1.5">
          {PRIMARY.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} compact badgeCount={x.badgeCount} badgeCritical={x.badgeCritical} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMobileMoreOpen((prev) => !prev)}
          className={[
            "flex min-h-10 w-full items-center justify-between rounded-xl border px-3 py-1.5 text-xs transition",
            mobileMoreOpen || activeMore
              ? "border-amber-500 bg-amber-950/25 text-amber-200"
              : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40 hover:text-white",
          ].join(" ")}
        >
          <span>More</span>
          <span className="text-xs">{mobileMoreOpen ? "Hide" : "Open"}</span>
        </button>

        {mobileMoreOpen ? (
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-1.5">
            {secondary.map((x) => (
              <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} compact badgeCount={x.badgeCount} badgeCritical={x.badgeCritical} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 hidden sm:block">
        <nav className="flex flex-wrap items-center gap-2">
          {PRIMARY.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} badgeCount={x.badgeCount} badgeCritical={x.badgeCritical} />
          ))}
          {secondary.map((x) => (
            <NavBtn key={x.href} href={x.href} label={x.label} active={isActive(pathname, x)} badgeCount={x.badgeCount} badgeCritical={x.badgeCritical} />
          ))}
        </nav>
      </div>
    </div>
  );
}