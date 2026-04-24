// src/components/NavBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bot,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  Inbox as InboxIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  PenLine,
  ScrollText,
  ShoppingCart,
  Shield,
  Trash2,
  Truck,
  UserCheck,
  UserX,
  Users,
  UtensilsCrossed,
  Warehouse,
  X,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import {
  canAccessAbsencesAdmin,
  canAccessAdminDashboard,
  canAccessAdminNav,
  canAccessAiAnalyticsProAdmin,
  canAccessAnalyticsAdmin,
  canAccessAttendanceAdmin,
  canAccessBackofficeEvaluationAdmin,
  canAccessCostAdmin,
  canAccessDailyInventoryAdmin,
  canAccessDraftAdmin,
  canAccessIncidentReport,
  canAccessIncidentReportAdmin,
  canAccessInventoryAdminNav,
  canAccessMenuAdmin,
  canAccessPrivateReportAdmin,
  canAccessProcurementAdmin,
  canAccessRenewalsAdmin,
  canAccessRoleManagement,
  canAccessStaffAdmin,
  clearAuth,
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
  { href: "/incidents", label: "Incident Report", icon: AlertTriangle, match: "prefix" },
  { href: "/store/procurement", label: "Store Procurement", icon: ShoppingCart, match: "prefix" },
  { href: "/swap-approve", label: "Swap Approve", icon: ArrowLeftRight, match: "exact" },
  { href: "/change-pin", label: "Change PIN", icon: KeyRound, match: "exact" },
];

// Admin routes here must match ACCESS_CHANNELS (group admin) in backend `app/access_control.py`.
const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard, adminOnly: true, match: "exact" },
  { href: "/admin/daily-inventory", label: "Daily Inventory", icon: Warehouse, adminOnly: true, match: "exact" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, adminOnly: true, match: "prefix" },
  { href: "/admin/menu", label: "Menu Builder", icon: UtensilsCrossed, adminOnly: true, match: "prefix" },
  { href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" },
  { href: "/admin/procurement", label: "Procurement", icon: Truck, adminOnly: true, match: "prefix" },
  { href: "/admin/cost-calculation", label: "Cost Calculation", icon: Calculator, adminOnly: true, match: "prefix" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true, match: "exact" },
  { href: "/admin/ai-analytics-pro", label: "AI Analytics Pro", icon: Bot, adminOnly: true, match: "exact" },
  { href: "/admin/attendance", label: "Attendance", icon: UserCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/absences", label: "Absences", icon: UserX, adminOnly: true, match: "exact" },
  { href: "/admin/renewals", label: "Renewals", icon: ScrollText, adminOnly: true, match: "prefix" },
  { href: "/admin/staff", label: "Staff", icon: Users, adminOnly: true, match: "prefix" },
  { href: "/admin/staff/roles", label: "Role Management", icon: Shield, adminOnly: true, match: "prefix" },
  { href: "/admin/draft", label: "Draft", icon: PenLine, adminOnly: true, match: "prefix" },
  { href: "/admin/manual-shift", label: "Manual Shift", icon: CalendarPlus, adminOnly: true, match: "prefix" },
  { href: "/admin/disposal", label: "Disposal Report", icon: Trash2, adminOnly: true, match: "prefix" },
  { href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" },
  { href: "/admin/incidents", label: "Incident Reports", icon: AlertTriangle, adminOnly: true, match: "prefix" },
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
  const router = useRouter();
  const [resolvedAuth, setResolvedAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [displayName, setDisplayName] = useState("");
  const [procurementBadgeCount, setProcurementBadgeCount] = useState(0);
  const [procurementBadgeCritical, setProcurementBadgeCritical] = useState(false);
  const [renewalBadge, setRenewalBadge] = useState(0);
  const [incidentBadge, setIncidentBadge] = useState(0);
  const [adminIncidentBadge, setAdminIncidentBadge] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function canSeeAdminItem(href: string, auth: ReturnType<typeof getAuth>) {
    if (!auth) return false;
    const role = String(auth.role || "").toUpperCase();
    if (role === "HQ" || role === "ADMIN") return true;
    if (href === "/admin") return canAccessAdminDashboard(auth);
    if (href === "/admin/ai-analytics-pro") return canAccessAiAnalyticsProAdmin(auth);
    if (href === "/admin/inventory") return canAccessInventoryAdminNav(auth);
    if (href === "/admin/daily-inventory") return canAccessDailyInventoryAdmin(auth);
    if (href === "/admin/menu") return canAccessMenuAdmin(auth);
    if (href === "/admin/private-reports") return canAccessPrivateReportAdmin(auth);
    if (href === "/admin/procurement") return canAccessProcurementAdmin(auth, auth.city);
    if (href === "/admin/cost-calculation") return canAccessCostAdmin(auth);
    if (href === "/admin/analytics") return canAccessAnalyticsAdmin(auth);
    if (href === "/admin/attendance") return canAccessAttendanceAdmin(auth);
    if (href === "/admin/absences") return canAccessAbsencesAdmin(auth);
    if (href === "/admin/renewals") return canAccessRenewalsAdmin(auth);
    if (href === "/admin/staff") return canAccessStaffAdmin(auth);
    if (href === "/admin/staff/roles") return canAccessRoleManagement(auth);
    if (href === "/admin/draft") return canAccessDraftAdmin(auth);
    if (href === "/admin/backoffice-evaluation") return canAccessBackofficeEvaluationAdmin(auth);
    if (href === "/admin/incidents") return canAccessIncidentReportAdmin(auth);
    if (href === "/admin/disposal") return canAccessAdminNav(auth);
    if (href === "/admin/manual-shift") return canAccessAdminNav(auth);
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
        if (!auth || !canAccessRenewalsAdmin(auth)) {
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

  // Incident badge polling (staff side: unread reply notifications)
  useEffect(() => {
    let cancelled = false;
    const fetchIncidentBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth || !canAccessIncidentReport(auth)) {
          if (!cancelled) setIncidentBadge(0);
          return;
        }
        const res = await fetch(`${API_BASE}/api/incidents/badge`, {
          method: "GET",
          cache: "no-store",
          headers: getAuthHeaders(auth),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setIncidentBadge(Number(data?.badge_count ?? 0));
      } catch {}
    };
    void fetchIncidentBadge();
    const id = window.setInterval(fetchIncidentBadge, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Admin incident badge polling (unprocessed count)
  useEffect(() => {
    let cancelled = false;
    const fetchAdminIncidentBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth || !canAccessIncidentReportAdmin(auth)) {
          if (!cancelled) setAdminIncidentBadge(0);
          return;
        }
        const cityParam = String(auth.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
        const res = await fetch(`${API_BASE}/api/admin/incidents/badge?city=${encodeURIComponent(cityParam)}`, {
          method: "GET",
          cache: "no-store",
          headers: getAuthHeaders(auth),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAdminIncidentBadge(Number(data?.badge_count ?? 0));
      } catch {}
    };
    void fetchAdminIncidentBadge();
    const id = window.setInterval(fetchAdminIncidentBadge, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
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

  const staffItems = useMemo(() => {
    return [...PRIMARY, ...SECONDARY_BASE].map((item) =>
      item.href === "/incidents"
        ? { ...item, badgeCount: incidentBadge, badgeWarning: incidentBadge > 0 }
        : item,
    );
  }, [incidentBadge]);

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
          : item.href === "/admin/incidents"
            ? { ...item, badgeCount: adminIncidentBadge, badgeWarning: adminIncidentBadge > 0 }
          : item,
      );
  }, [resolvedAuth, procurementBadgeCount, procurementBadgeCritical, renewalBadge, adminIncidentBadge]);

  const navItems = useMemo(() => [...staffItems, ...adminItems], [staffItems, adminItems]);

  // Mobile bottom nav: show these 4 items as primary tabs
  const MOBILE_PRIMARY_HREFS = ["/my-shift", "/week", "/request", "/inbox"];
  const mobilePrimaryItems = useMemo(
    () => MOBILE_PRIMARY_HREFS.map((h) => navItems.find((i) => i.href === h)).filter(Boolean) as NavItem[],
    [navItems],
  );
  const mobileMoreItems = useMemo(
    () => navItems.filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href)),
    [navItems],
  );

  const doLogout = () => {
    clearAuth();
    try { localStorage.removeItem("sushizen_shift_role_v1"); } catch {}
    document.cookie = "sushizen_authed=; path=/; max-age=0";
    router.replace("/login");
  };
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
    <>
      {/* ── Top header: logo + user + logout ── */}
      <div className="flex h-11 items-center justify-between gap-2">
        <Link href="/my-shift" className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-xs font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            ZEN
          </div>
          <p className="truncate text-[13px] font-semibold text-white sm:text-sm">
            <span className="md:hidden">ZEN Workforce</span>
            <span className="hidden md:inline">Sushi ZEN Workforce OS</span>
          </p>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-medium text-white">
            {userInitials}
          </div>
          <span className="hidden max-w-[96px] truncate text-xs text-neutral-400 sm:block sm:max-w-[180px]">
            {displayName || "Staff portal"}
          </span>
          {/* Logout icon — always visible on mobile, hidden on desktop (desktop has button in tab row) */}
          <button
            onClick={doLogout}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-white/10" />

      {/* ── Desktop tab bar: hidden on mobile ── */}
      <div className="hidden md:flex h-10 items-center">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [&::-webkit-scrollbar]:hidden">
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
          </div>
        </div>
        <div className="flex items-center border-l border-white/10 pl-3">
          <LogoutButton className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/10 hover:text-white" />
        </div>
      </div>

      {/* ── Mobile bottom nav + overlay: portal to body to escape backdrop-filter containing block ── */}
      {mounted && createPortal(
        <>
        <nav
          className="fixed bottom-0 left-0 right-0 z-[70] border-t border-white/10 bg-[#0d1117] md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
        <div className="flex h-14 items-stretch">
          {mobilePrimaryItems.map((item) => {
            const active = isActive(pathname, item);
            const badge = item.badgeCount || 0;
            const hasDot = !badge && (item.badgeYellow || item.badgePink || item.badgeWarning);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                  active ? "text-violet-400" : "text-neutral-500",
                ].join(" ")}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] leading-none">{item.label}</span>
                {badge > 0 && (
                  <span className="absolute right-[20%] top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {hasDot && (
                  <span className="absolute right-[22%] top-2.5 h-2 w-2 rounded-full bg-amber-400" />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={[
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              moreOpen ? "text-violet-400" : "text-neutral-500",
            ].join(" ")}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] leading-none">More</span>
            {/* Red dot if any "more" item has a badge */}
            {mobileMoreItems.some((i) => (i.badgeCount || 0) > 0 || i.badgeCritical) && (
              <span className="absolute right-[22%] top-2.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </nav>

      {/* ── More menu overlay ── */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          {/* Sheet slides up from the bottom nav */}
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0d1117] p-4 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3.5rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-200">All pages</span>
              <button onClick={() => setMoreOpen(false)} className="text-neutral-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {mobileMoreItems.map((item) => {
                const active = isActive(pathname, item);
                const badge = item.badgeCount || 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={[
                      "relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-colors",
                      active
                        ? "bg-violet-900/30 text-violet-300"
                        : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] leading-tight">{item.label}</span>
                    {badge > 0 && (
                      <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
        </>,
        document.body,
      )}
    </>
  );
}