// src/components/NavBar.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  Inbox as InboxIcon,
  KeyRound,
  LayoutDashboard,
  Menu,
  Package,
  PenLine,
  ShoppingCart,
  Truck,
  UserCheck,
  UserX,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import {
  canAccessAdminNav,
  canAccessBackofficeEvaluationAdmin,
  canAccessInventoryWorkspace,
  canAccessMenuAdmin,
  canAccessPrivateReportAdmin,
  getAuth,
  refreshAuthFromApi,
} from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  match?: "exact" | "prefix";
  badgeCount?: number;
  badgeCritical?: boolean;
};

const PRIMARY: NavItem[] = [
  { href: "/my-shift", label: "My Shift", icon: CalendarClock, match: "exact" },
  { href: "/week", label: "Week", icon: CalendarDays, match: "exact" },
  { href: "/request", label: "Request", icon: ClipboardList, match: "exact" },
  { href: "/private-report", label: "Private Report", icon: FileText, match: "exact" },
];

const SECONDARY_BASE: NavItem[] = [
  { href: "/calendar", label: "Calendar", icon: Calendar, match: "exact" },
  { href: "/inbox", label: "Inbox", icon: InboxIcon, match: "exact" },
  { href: "/store/procurement", label: "Store Procurement", icon: ShoppingCart, match: "prefix" },
  { href: "/swap-approve", label: "Swap Approve", icon: ArrowLeftRight, match: "exact" },
  { href: "/change-pin", label: "Change PIN", icon: KeyRound, match: "exact" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard, adminOnly: true, match: "exact" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, adminOnly: true, match: "prefix" },
  { href: "/admin/menu", label: "Menu Builder", icon: UtensilsCrossed, adminOnly: true, match: "prefix" },
  { href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" },
  { href: "/admin/procurement", label: "Procurement", icon: Truck, adminOnly: true, match: "prefix" },
  { href: "/admin/cost-calculation", label: "Cost Calculation", icon: Calculator, adminOnly: true, match: "prefix" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true, match: "exact" },
  { href: "/admin/attendance", label: "Attendance", icon: UserCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/absences", label: "Absences", icon: UserX, adminOnly: true, match: "exact" },
  { href: "/admin/staff", label: "Staff", icon: Users, adminOnly: true, match: "prefix" },
  { href: "/admin/draft", label: "Draft", icon: PenLine, adminOnly: true, match: "prefix" },
];

function isActive(pathname: string, item: NavItem) {
  const mode = item.match || "exact";
  if (mode === "prefix") return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

function NavBtn({
  href,
  label,
  icon: Icon,
  active,
  dimmed = false,
  badgeCount = 0,
  badgeCritical = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  dimmed?: boolean;
  badgeCount?: number;
  badgeCritical?: boolean;
}) {
  const shown = Number(badgeCount || 0);
  const badgeText = shown > 9 ? "9+" : String(shown);
  return (
    <Link
      href={href}
      className={[
        "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-150",
        active
          ? "border border-violet-500/30 bg-violet-500/20 text-violet-300 font-semibold"
          : dimmed
            ? "border border-transparent font-medium text-zinc-500 hover:bg-violet-500/10 hover:text-violet-200"
            : "border border-transparent font-medium text-zinc-400 hover:bg-violet-500/10 hover:text-violet-200",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      {shown > 0 ? (
        <span
          className={[
            "absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
            badgeCritical ? "bg-red-500 text-white" : "bg-violet-500/25 border border-violet-500/40 text-violet-300",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showInventoryAdmin, setShowInventoryAdmin] = useState(false);
  const [showMenuAdmin, setShowMenuAdmin] = useState(false);
  const [showPrivateReportAdmin, setShowPrivateReportAdmin] = useState(false);
  const [showBackofficeEvalAdmin, setShowBackofficeEvalAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [procurementBadgeCount, setProcurementBadgeCount] = useState(0);
  const [procurementBadgeCritical, setProcurementBadgeCritical] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      const a = getAuth();
      if (!a) {
        if (!cancelled) {
          setShowAdmin(false);
          setShowInventoryAdmin(false);
          setShowMenuAdmin(false);
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
        setShowInventoryAdmin(canAccessInventoryWorkspace(resolved));
        setShowMenuAdmin(canAccessMenuAdmin(resolved));
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

  const staffItems = useMemo(() => [...PRIMARY, ...SECONDARY_BASE], []);

  const adminItems = useMemo(() => {
    const base: NavItem[] = [];
    if (showAdmin) {
      base.push(
        ...ADMIN_ITEMS.map((item) =>
          item.href === "/admin/procurement"
            ? { ...item, badgeCount: procurementBadgeCount, badgeCritical: procurementBadgeCritical }
            : item,
        ),
      );
      if (showBackofficeEvalAdmin && !base.some((x) => x.href === "/admin/backoffice-evaluation")) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" });
      }
    } else if (showInventoryAdmin || showMenuAdmin) {
      base.push({ href: "/admin/inventory", label: "Inventory", icon: Package, adminOnly: true, match: "prefix" });
      if (showMenuAdmin) {
        base.push({ href: "/admin/menu", label: "Menu Builder", icon: UtensilsCrossed, adminOnly: true, match: "prefix" });
      }
      if (showPrivateReportAdmin) {
        base.push({ href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" });
      }
      if (showBackofficeEvalAdmin) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" });
      }
    } else if (showPrivateReportAdmin) {
      base.push({ href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" });
      if (showBackofficeEvalAdmin) {
        base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" });
      }
    } else if (showBackofficeEvalAdmin) {
      base.push({ href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" });
    }
    return base;
  }, [showAdmin, showInventoryAdmin, showMenuAdmin, showPrivateReportAdmin, showBackofficeEvalAdmin, procurementBadgeCount, procurementBadgeCritical]);

  const mobileItems = useMemo(() => [...staffItems, ...adminItems], [staffItems, adminItems]);

  return (
    <header className="sticky top-0 z-50 border-b border-violet-500/10 bg-[#0a0b14]/85 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href="/my-shift" className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="logo" width={28} height={28} className="rounded-lg" priority />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-white">Sushi ZEN Workforce OS</p>
                <p className="truncate text-[10px] leading-tight text-zinc-500">
                  Logged in as {displayName || "Staff portal"}
                </p>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <LogoutButton className="shrink-0 rounded-lg border border-violet-400/15 bg-violet-500/8 px-3 py-1.5 text-xs text-zinc-400 hover:border-violet-400/30 hover:bg-violet-500/15 hover:text-violet-200 transition-all duration-150" />
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/15 bg-violet-500/8 text-zinc-400 hover:text-violet-200 hover:bg-violet-500/15 transition-all duration-150"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <nav className="hidden pb-2 md:block">
          <div className="hidden flex-wrap items-center gap-0.5 py-1 md:flex">
            {staffItems.map((item) => (
              <NavBtn
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item)}
                badgeCount={item.badgeCount}
                badgeCritical={item.badgeCritical}
              />
            ))}
          </div>

          {adminItems.length ? <div className="mx-0 h-px bg-white/5" /> : null}

          <div className="hidden flex-wrap items-center gap-0.5 py-1 md:flex">
            {adminItems.map((item) => (
              <NavBtn
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item)}
                dimmed
                badgeCount={item.badgeCount}
                badgeCritical={item.badgeCritical}
              />
            ))}
          </div>
        </nav>

        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="md:hidden overflow-hidden border-t border-violet-500/10 bg-[#0a0b14]/95 backdrop-blur-xl"
            >
              <div className="mx-auto grid max-w-6xl grid-cols-2 gap-1 px-4 py-3">
                {mobileItems.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(pathname, link);
                  const shown = Number(link.badgeCount || 0);
                  const badgeText = shown > 9 ? "9+" : String(shown);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={
                        active
                          ? "flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-3 py-2.5 text-sm font-semibold text-violet-300"
                          : "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-violet-500/10 hover:text-violet-200 transition-all duration-150"
                      }
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{link.label}</span>
                      {shown > 0 ? (
                        <span
                          className={
                            link.badgeCritical
                              ? "ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              : "ml-auto rounded-full bg-violet-500/25 border border-violet-500/40 px-1.5 py-0.5 text-[10px] font-bold text-violet-300"
                          }
                        >
                          {badgeText}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}