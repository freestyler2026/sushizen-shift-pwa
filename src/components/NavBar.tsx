// src/components/NavBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  Package,
  PenLine,
  ScrollText,
  ShoppingCart,
  Star,
  Shield,
  Truck,
  UserCheck,
  UserX,
  Users,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import {
  canAccessAdminNav,
  canAccessBackofficeEvaluationAdmin,
  canAccessCostAdmin,
  canAccessInventoryWorkspace,
  canAccessMenuAdmin,
  canAccessPrivateReportAdmin,
  canAccessProcurementAdmin,
  canAccessRoleManagement,
  getAuth,
  getAuthHeaders,
  refreshAuthFromApi,
} from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { RENEWALS_BADGE_EVENT, readRenewalsBadgeCount, setRenewalsBadgeCount } from "@/lib/renewals";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  match?: "exact" | "prefix";
  badgeCount?: number;
  badgeCritical?: boolean;
  badgeWarning?: boolean;
  badgeSuccess?: boolean;
  badgeYellow?: boolean;
  badgePink?: boolean;
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
  { href: "/admin/daily-inventory", label: "Daily Inventory Input", icon: Warehouse, adminOnly: true, match: "exact" },
  { href: "/admin/ratings-entry", label: "Ratings entry", icon: Star, adminOnly: true, match: "exact" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, adminOnly: true, match: "prefix" },
  { href: "/admin/menu", label: "Menu Builder", icon: UtensilsCrossed, adminOnly: true, match: "prefix" },
  { href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" },
  { href: "/admin/procurement", label: "Procurement", icon: Truck, adminOnly: true, match: "prefix" },
  { href: "/admin/cost-calculation", label: "Cost Calculation", icon: Calculator, adminOnly: true, match: "prefix" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true, match: "exact" },
  { href: "/admin/attendance", label: "Attendance", icon: UserCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/absences", label: "Absences", icon: UserX, adminOnly: true, match: "exact" },
  { href: "/admin/renewals", label: "Renewals", icon: ScrollText, adminOnly: true, match: "prefix" },
  { href: "/admin/staff", label: "Staff", icon: Users, adminOnly: true, match: "prefix" },
  { href: "/admin/staff/roles", label: "Role Management", icon: Shield, adminOnly: true, match: "prefix" },
  { href: "/admin/draft", label: "Draft", icon: PenLine, adminOnly: true, match: "prefix" },
  { href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" },
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
  badge = 0,
  badgeCritical = false,
  badgeWarning = false,
  badgeSuccess = false,
  badgeYellow = false,
  badgePink = false,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  badgeCritical?: boolean;
  badgeWarning?: boolean;
  badgeSuccess?: boolean;
  badgeYellow?: boolean;
  badgePink?: boolean;
}) {
  const shown = Number(badge || 0);
  const badgeText = shown > 99 ? "99+" : String(shown);
  const showDotOnly = shown <= 0 && (badgeYellow || badgePink);
  const shouldShowBadge = shown > 0 || showDotOnly;
  return (
    <Link
      href={href}
      className={[
        "group text-sm px-3 h-10 flex items-center whitespace-nowrap border-b-2 transition-colors duration-150",
        active
          ? "border-violet-400 text-white font-medium"
          : "border-transparent text-neutral-400 hover:text-white",
      ].join(" ")}
    >
      <span className="flex items-center gap-1.5">
        {label}
      </span>
      {shouldShowBadge ? (
        <span
          className={[
            showDotOnly
              ? "ml-2 inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-150"
              : "ml-2 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors duration-150",
            badgeCritical
              ? "bg-rose-500/20 text-rose-200"
              : badgeWarning
                ? "bg-orange-500 text-white"
                : badgeSuccess
                  ? "bg-emerald-500 text-white"
                  : badgeYellow
                    ? "bg-amber-500 text-white"
                    : badgePink
                      ? "bg-pink-500 text-white"
              : active
                ? "bg-violet-500/20 text-violet-200"
                : "bg-white/8 text-neutral-300 group-hover:bg-white/12 group-hover:text-white",
          ].join(" ")}
        >
          {showDotOnly ? null : badgeText}
        </span>
      ) : null}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [resolvedAuth, setResolvedAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [displayName, setDisplayName] = useState("");
  const [procurementBadgeCount, setProcurementBadgeCount] = useState(0);
  const [procurementBadgeCritical, setProcurementBadgeCritical] = useState(false);
  const [renewalBadge, setRenewalBadge] = useState(0);

  function canSeeAdminItem(href: string, auth: ReturnType<typeof getAuth>) {
    if (!auth) return false;
    if (href === "/admin") return canAccessAdminNav(auth);
    if (href === "/admin/ratings-entry") return canAccessAdminNav(auth);
    if (href === "/admin/inventory") return canAccessInventoryWorkspace(auth);
    if (href === "/admin/daily-inventory") return canAccessAdminNav(auth);
    if (href === "/admin/menu") return canAccessMenuAdmin(auth);
    if (href === "/admin/private-reports") return canAccessPrivateReportAdmin(auth);
    if (href === "/admin/procurement") return canAccessProcurementAdmin(auth, auth.city);
    if (href === "/admin/cost-calculation") return canAccessCostAdmin(auth);
    if (href === "/admin/analytics") return canAccessAdminNav(auth);
    if (href === "/admin/attendance") return canAccessAdminNav(auth);
    if (href === "/admin/absences") return canAccessAdminNav(auth);
    if (href === "/admin/renewals") return canAccessAdminNav(auth);
    if (href === "/admin/staff") return canAccessAdminNav(auth);
    if (href === "/admin/staff/roles") return canAccessRoleManagement(auth);
    if (href === "/admin/draft") return canAccessAdminNav(auth);
    if (href === "/admin/backoffice-evaluation") return canAccessBackofficeEvaluationAdmin(auth);
    return false;
  }

  useEffect(() => {
    setRenewalBadge(readRenewalsBadgeCount());
    let cancelled = false;
    const onBadgeEvent = (event: Event) => {
      const next = Number((event as CustomEvent<{ badgeCount?: number }>).detail?.badgeCount ?? 0);
      if (!cancelled) setRenewalBadge(next > 0 ? next : 0);
    };
    const onStorage = () => {
      if (!cancelled) setRenewalBadge(readRenewalsBadgeCount());
    };
    const fetchBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth || !canAccessAdminNav(auth)) {
          if (!cancelled) {
            setRenewalBadge(0);
            setRenewalsBadgeCount(0);
          }
          return;
        }
        const res = await fetch(`${API_BASE}/api/renewals/alerts/badge`, {
          method: "GET",
          cache: "no-store",
          headers: getAuthHeaders(auth),
        });
        if (!res.ok) return;
        const data = await res.json();
        const next = Number(data?.badge_count ?? 0);
        if (!cancelled) {
          setRenewalBadge(next > 0 ? next : 0);
          setRenewalsBadgeCount(next);
        }
      } catch {}
    };
    void fetchBadge();
    const id = window.setInterval(fetchBadge, 60_000);
    window.addEventListener(RENEWALS_BADGE_EVENT, onBadgeEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(RENEWALS_BADGE_EVENT, onBadgeEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      const a = getAuth();
      if (!a) {
        if (!cancelled) {
          setResolvedAuth(null);
          setDisplayName("");
          setProcurementBadgeCount(0);
          setProcurementBadgeCritical(false);
        }
        return;
      }
      const resolved = await refreshAuthFromApi(a);
      if (!cancelled) {
        setResolvedAuth(resolved || a);
        setDisplayName(resolved?.staffName || a.staffName || "");
      }
      try {
        const accessToken = resolved?.accessToken || a.accessToken;
        if (!accessToken) return;
        if (!canAccessProcurementAdmin(resolved || a, (resolved?.city || a.city || "manila") === "dubai" ? "dubai" : "manila")) return;
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
    return ADMIN_ITEMS
      .filter((item) => canSeeAdminItem(item.href, resolvedAuth))
      .map((item) =>
        item.href === "/admin"
          ? { ...item, badgeYellow: true }
          : item.href === "/admin/private-reports"
            ? { ...item, badgePink: true }
            : item.href === "/admin/procurement"
          ? { ...item, badgeCount: procurementBadgeCount, badgeCritical: procurementBadgeCritical, badgeSuccess: true }
          : item.href === "/admin/renewals"
            ? { ...item, badgeCount: renewalBadge, badgeWarning: true }
          : item,
      );
  }, [resolvedAuth, procurementBadgeCount, procurementBadgeCritical, renewalBadge]);

  const navItems = useMemo(() => [...staffItems, ...adminItems], [staffItems, adminItems]);
  const userInitials = useMemo(() => {
    const trimmed = String(displayName || "").trim();
    if (!trimmed) return "SZ";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "SZ";
  }, [displayName]);

  return (
    <div>
      <div className="flex h-11 items-center justify-between px-0">
        <Link href="/my-shift" className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="rounded bg-violet-600 px-1.5 py-0.5 text-xs font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              ZEN
            </div>
            <p className="truncate text-[13px] font-semibold text-white sm:text-sm">Sushi ZEN Workforce OS</p>
          </div>
        </Link>

        <div className="ml-3 flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-medium text-white">
            {userInitials}
          </div>
          <span className="max-w-[96px] truncate text-xs text-neutral-400 sm:max-w-[180px]">
            {displayName || "Staff portal"}
          </span>
        </div>
      </div>

      <div className="border-b border-white/10" />

      <div className="flex h-10 items-center">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-10px),transparent)] [&::-webkit-scrollbar]:hidden">
          <div className="flex h-10 min-w-max items-center gap-0 pr-2">
            {navItems.map((item) => (
              <NavBtn
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(pathname, item)}
                badge={item.badgeCount}
                badgeCritical={item.badgeCritical}
                badgeWarning={item.badgeWarning}
                badgeSuccess={item.badgeSuccess}
                badgeYellow={item.badgeYellow}
                badgePink={item.badgePink}
              />
            ))}
            <div className="ml-1 border-l border-white/10 pl-2 md:hidden">
              <LogoutButton className="inline-flex rounded px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/10 hover:text-white" />
            </div>
          </div>
        </div>
        <div className="hidden items-center border-l border-white/10 pl-3 md:flex">
          <LogoutButton className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/10 hover:text-white" />
        </div>
      </div>
    </div>
  );
}