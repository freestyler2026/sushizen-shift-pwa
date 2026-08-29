// src/components/NavBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { channelForRoute } from "@/lib/access-channels";
import type { LucideIcon } from "lucide-react";
import {
  Phone,
  Hand,
  AlertTriangle,
  Siren,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bot,
  Calculator,
  MessageSquare,
  Calendar,
  CalendarClock,
  Fingerprint,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  Headphones,
  Inbox as InboxIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  PackageCheck,
  PackageSearch,
  PenLine,
  Receipt,
  ScrollText,
  ShoppingBag,
  ShoppingCart,
  Shield,
  ShieldCheck,
  Star,
  Tag,
  TicketCheck,
  Trash2,
  ArchiveRestore,
  Truck,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  UtensilsCrossed,
  Warehouse,
  Thermometer,
  Coins,
  FlaskConical,
  Factory,
  PhoneCall,
  Globe,
  MapPin,
  TrendingUp,
  Activity,
  X,
  BookOpen,
  BookCheck,
  Clock,
  History,
  Laptop,
  Building2,
  Bell,
  ShieldAlert,
  ChartLine,
  Timer,
  Gauge,
  Radar,
} from "lucide-react";
import {
  canAccessAbsencesAdmin,
  canAccessAdminDashboard,
  canAccessAdminNav,
  canAccessAiAnalyticsProAdmin,
  canAccessAnalyticsAdmin,
  canAccessAttendanceAdmin,
  canAccessOsAttendanceAdmin,
  canAccessBackofficeEvaluationAdmin,
  canAccessCostAdmin,
  canAccessDailyInventoryAdmin,
  canAccessTravelPathAdmin,
  canAccessDraftAdmin,
  canAccessFinancePage,
  canAccessIncidentReport,
  canAccessIncidentReportAdmin,
  canAccessInventoryAdminNav,
  canAccessPrivateReportAdmin,
  canAccessProcurementAdmin,
  canAccessRenewalsAdmin,
  canAccessRoleManagement,
  canAccessStaffAdmin,
  canAccessStoreEvaluationsAdmin,
  canAccessColdChainAdmin,
  canAccessDailyCheckAdmin,
  canAccessTransportExpenseAdmin,
  canAccessPettyCashAdmin,
  canAccessCashManagementAdmin,
  canAccessMealAllowanceAdmin,
  canAccessProbationAdmin,
  canAccessMarketAnalysisAdmin,
  canAccessStoreOpeningAdmin,
  canAccessPaymentsAdmin,
  canAccessHrClearanceAdmin,
  canAccessAttendancePage,
  canAccessWeekPage,
  canAccessMyShiftPage,
  canAccessCalendarPage,
  canAccessMyPay,
  canAccessPayrollAdmin,
  hasChannelAccess,
  clearAuth,
  getAuth,
  getAuthHeaders,
  refreshAuthFromApi,
} from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { RENEWALS_BADGE_EVENT, getRenewalsDismissedCount, readRenewalsBadgeCount, setRenewalsBadgeCount } from "@/lib/renewals";
import { BADGE_EVENTS } from "@/lib/badgeEvents";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  match?: "exact" | "prefix";
  excludePrefix?: string | string[];
  external?: boolean;
  badgeCount?: number;
  badgeCritical?: boolean;
  badgeWarning?: boolean;
  badgeSuccess?: boolean;
  badgeYellow?: boolean;
  badgePink?: boolean;
  badge2Count?: number;
  badge2Violet?: boolean;
};

const PRIMARY: NavItem[] = [
  { href: "/staff-guide",           label: "Staff Guide",           icon: BookOpen,      match: "prefix" },
  { href: "/handbook",              label: "Employee Handbook",     icon: BookCheck,     match: "prefix" },
  { href: "/attendance",            label: "Time-in / Time-out",    icon: Fingerprint,   match: "exact" },
  { href: "/my-shift",              label: "My Shift",              icon: CalendarClock, match: "exact" },
  { href: "/week",                  label: "Week",                  icon: CalendarDays,  match: "exact" },
  { href: "/calendar",              label: "Calendar",              icon: Calendar,      match: "exact" },
  { href: "/store/expense-request",  label: "Expense Reimbursement", icon: Receipt,       match: "prefix" },
  { href: "/store/overtime-request", label: "Overtime Request",     icon: Clock,         match: "prefix" },
  { href: "/store/my-nte",           label: "My Notices",           icon: FileText,      match: "prefix" },
  { href: "/store/policy-docs",      label: "Company Policies",     icon: BookOpen,      match: "prefix" },
  { href: "/request",                label: "Request",               icon: ClipboardList, match: "exact" },
  { href: "/private-report",        label: "Private Report",        icon: FileText,      match: "exact" },
  { href: "/inbox",                 label: "Inbox",                 icon: InboxIcon,     match: "exact" },
  { href: "/store/report",           label: "Report Something",    icon: Siren,         match: "prefix" },
  { href: "/incidents",             label: "Incident Report",       icon: AlertTriangle, match: "prefix" },
  { href: "/my-pay",                label: "My Pay",                icon: Receipt,       match: "prefix" },
  { href: "/my-assets",             label: "My Assets",             icon: Laptop,        match: "prefix" },
];

const SECONDARY_BASE: NavItem[] = [
  { href: "/zen-music", label: "ZEN Music", icon: Headphones, match: "exact" },
  { href: "/admin/disposal", label: "Disposal Report", icon: Trash2, match: "prefix" },
  { href: "/admin/backup", label: "Backup Report", icon: ArchiveRestore, match: "prefix" },
  { href: "/admin/yield-control", label: "Yield Control", icon: Activity, match: "prefix" },
  { href: "/admin/daily-inventory", label: "Daily Inventory", icon: Warehouse, match: "exact" },
  { href: "/admin/travel-path", label: "Travel Path", icon: ClipboardList, match: "exact" },
  { href: "/store/procurement", label: "Store Procurement", icon: ShoppingCart, match: "prefix" },
  { href: "/store/emergency-request", label: "Emergency Request", icon: Siren,  match: "prefix" },
  { href: "/store/purchase", label: "Direct Purchase", icon: ShoppingBag, match: "prefix" },
  { href: "/store/spot-purchase", label: "Spot Purchase", icon: ShoppingBag, match: "prefix" },
  { href: "/store/ck-production", label: "CK Dispatch", icon: Truck, match: "prefix" },
  { href: "/store/ck-inventory", label: "CK Inventory", icon: FlaskConical, match: "prefix" },
  { href: "/store/ck-production-plan", label: "CK Production Plan", icon: Factory, match: "prefix" },
  { href: "/store/ck-delivery", label: "CK Delivery", icon: Truck, match: "prefix" },
  { href: "/store/ck-ingredient-receiving", label: "CK Ingredient Receiving", icon: PackageSearch, match: "prefix" },
  { href: "/store/receiving", label: "CK Receiving", icon: PackageCheck, match: "prefix" },
  { href: "/store/supplier-receiving", label: "Supplier Receiving", icon: PackageSearch, match: "prefix" },
  { href: "/store/evaluation", label: "Store Evaluation", icon: ClipboardCheck, match: "prefix" },
  { href: "/store/cold-chain", label: "Cold Chain Log", icon: Thermometer, match: "prefix" },
  { href: "/store/management/inbox", label: "Management Inbox", icon: MessageSquare, match: "prefix" },
  { href: "/store/management/rush-check", label: "Rush Hour Check", icon: Timer, match: "prefix" },
  { href: "/store/daily-check", label: "Daily Check", icon: ClipboardList, match: "prefix" },
  { href: "/store/receipt-log", label: "Receipt Log", icon: Receipt, match: "prefix" },
  { href: "/store/transport-expense", label: "Transport Expense", icon: Receipt, match: "prefix" },
  { href: "/store/petty-cash", label: "Petty Cash", icon: Coins, match: "prefix" },
  { href: "/store/cash-report", label: "Cash Report", icon: Banknote, match: "prefix" },
  { href: "/store/cashier-log", label: "Cashier Log", icon: ClipboardList, match: "prefix" },
  { href: "/swap-approve", label: "Swap Approve", icon: ArrowLeftRight, match: "exact" },
  { href: "/change-pin", label: "Change PIN", icon: KeyRound, match: "exact" },
  { href: "/my-contact",             label: "My Phone Number",     icon: Phone,         match: "exact" },
];

// Admin routes here must match ACCESS_CHANNELS (group admin) in backend `app/access_control.py`.
const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard, adminOnly: true, match: "exact" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, adminOnly: true, match: "prefix" },
  { href: "/admin/procurement", label: "Procurement", icon: Truck, adminOnly: true, match: "prefix" },
  { href: "/admin/emergency-requests", label: "Emergency Requests", icon: Siren, adminOnly: true, match: "prefix" },
  { href: "/admin/spot-purchase", label: "Spot Purchase", icon: ShoppingBag, adminOnly: true, match: "prefix" },
  { href: "/admin/supplier-confirmations", label: "Supplier Confirmations", icon: PhoneCall, adminOnly: true, match: "prefix" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true, match: "exact" },
  { href: "/admin/cancellations", label: "Cancellation Report", icon: TicketCheck, adminOnly: true, match: "exact" },
  { href: "/admin/finance", label: "Management P&L", icon: Receipt, adminOnly: true, match: "prefix" },
  { href: "/admin/ar-payouts", label: "AR Payouts", icon: Banknote, adminOnly: true, match: "prefix" },
  { href: "/admin/mgmt-accounting", label: "Management Accounting", icon: ChartLine, adminOnly: true, match: "prefix" },
  { href: "/admin/cost-calculation", label: "Cost Calculation", icon: Calculator, adminOnly: true, match: "prefix" },
  { href: "/admin/private-reports", label: "Private Reports", icon: FileBarChart, adminOnly: true, match: "exact" },
  { href: "/admin/ai-analytics-pro", label: "AI Analytics Pro", icon: Bot, adminOnly: true, match: "exact" },
  { href: "/admin/business-events", label: "Business Events Log", icon: Globe, adminOnly: true, match: "prefix" },
  // { href: "/admin/attendance", label: "Attendance", icon: UserCheck, adminOnly: true, match: "prefix" }, // Bayzat contract ended
  { href: "/admin/os-attendance", label: "OS Attendance", icon: Fingerprint, adminOnly: true, match: "prefix" },
  { href: "/admin/absences", label: "Absences", icon: UserX, adminOnly: true, match: "exact" },
  { href: "/admin/renewals", label: "Renewals", icon: ScrollText, adminOnly: true, match: "prefix" },
  { href: "/admin/staff", label: "Staff", icon: Users, adminOnly: true, match: "prefix", excludePrefix: "/admin/staff/roles" },
  { href: "/admin/staff/roles", label: "Role Management", icon: Shield, adminOnly: true, match: "prefix" },
  { href: "/admin/security", label: "Security", icon: ShieldAlert, adminOnly: true, match: "prefix" },
  { href: "/admin/handbook", label: "Employee Handbook", icon: BookCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/staff-ranks", label: "Staff Ranks (L0-L10)", icon: TrendingUp, adminOnly: true, match: "prefix" },
  { href: "/admin/staff/contacts", label: "Emergency Contacts", icon: Phone, adminOnly: true, match: "exact" },
  { href: "/admin/draft", label: "Draft", icon: PenLine, adminOnly: true, match: "prefix" },
  { href: "/admin/manual-shift", label: "Manual Shift", icon: CalendarPlus, adminOnly: true, match: "prefix" },
  { href: "/admin/shift-audit", label: "Shift Audit Log", icon: History, adminOnly: true, match: "prefix" },
  { href: "/admin/backoffice-evaluation", label: "Backoffice Eval", icon: ClipboardCheck, adminOnly: true, match: "exact" },
  { href: "/admin/store-evaluations", label: "Store Evaluations", icon: BarChart3, adminOnly: true, match: "prefix" },
  { href: "/admin/cold-chain", label: "Cold Chain", icon: Thermometer, adminOnly: true, match: "prefix" },
  { href: "/admin/ck-label-compliance", label: "CK Label Compliance", icon: ShieldCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/ck/par-levels", label: "CK Par Levels", icon: Factory, adminOnly: true, match: "prefix" },
  { href: "/admin/store-par-levels", label: "Store Par Levels", icon: ShoppingCart, adminOnly: true, match: "prefix" },
  { href: "/admin/store-supplier-orders", label: "Store Supplier Orders", icon: ShoppingBag, adminOnly: true, match: "prefix" },
  { href: "/admin/daily-check", label: "Daily Check", icon: ClipboardList, adminOnly: true, match: "prefix" },
  { href: "/admin/expense-requests", label: "Expense Requests",  icon: Receipt, adminOnly: true, match: "prefix" },
  { href: "/admin/overtime",         label: "Overtime Requests", icon: Clock,   adminOnly: true, match: "prefix" },
  { href: "/admin/transport-expense", label: "Transport Expense", icon: Receipt, adminOnly: true, match: "prefix" },
  { href: "/admin/petty-cash", label: "Petty Cash", icon: Coins, adminOnly: true, match: "prefix" },
  { href: "/admin/cash-management", label: "Cash Management", icon: Banknote, adminOnly: true, match: "prefix" },
  { href: "/admin/meal-allowance", label: "Meal Allowance", icon: Banknote, adminOnly: true, match: "prefix" },
  { href: "/admin/probation", label: "Probation", icon: UserCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/employee-cases", label: "Notice to Explain", icon: FileText, adminOnly: true, match: "prefix" },
  { href: "/admin/nte", label: "NTE Management", icon: ShieldAlert, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/recruitment", label: "HR Recruitment", icon: UserPlus, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/onboarding", label: "HR Onboarding", icon: ClipboardCheck, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/performance", label: "HR Performance", icon: Star, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/separation", label: "HR Offboarding", icon: UserMinus, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/clearance", label: "HR Clearance", icon: ScrollText, adminOnly: true, match: "prefix" },
  { href: "/admin/coe", label: "COE — Certificate of Employment", icon: ScrollText, adminOnly: true, match: "prefix" },
  { href: "/admin/hr/policy-docs", label: "HR Policy Documents", icon: FileText, adminOnly: true, match: "prefix" },
  { href: "/admin/assets", label: "Company Assets", icon: Laptop, adminOnly: true, match: "prefix" },
  { href: "/admin/incidents", label: "Incident Reports", icon: AlertTriangle, adminOnly: true, match: "prefix" },
  { href: "/admin/incidents/unowned", label: "Waiting for Someone", icon: Hand, adminOnly: true, match: "exact" },
  { href: "/admin/price-check", label: "Price Check", icon: Tag, adminOnly: true, match: "prefix" },
  { href: "/admin/baseroll-prep", label: "Base Roll Prep", icon: UtensilsCrossed, adminOnly: true, match: "prefix" },
  { href: "/admin/daily-report", label: "Daily Report", icon: CalendarDays, adminOnly: true, match: "prefix" },
  { href: "/admin/management/back-office", label: "BO Dashboard", icon: ShieldAlert, adminOnly: true, match: "prefix" },
  { href: "/admin/management/par-levels", label: "Backup Par Levels", icon: Gauge, adminOnly: true, match: "prefix" },
  { href: "/admin/management/patterns", label: "Pattern Detection", icon: Radar, adminOnly: true, match: "prefix" },
  { href: "/admin/management/people", label: "People", icon: Users, adminOnly: true, match: "prefix" },
  { href: "/admin/finance/vendors", label: "Vendors", icon: Building2, adminOnly: true, match: "prefix" },
  { href: "/admin/finance/documents", label: "Filing Ledger", icon: Receipt, adminOnly: true, match: "prefix" },
  { href: "/admin/management/area-review", label: "Area Manager Review", icon: TrendingUp, adminOnly: true, match: "prefix" },
  { href: "/admin/discord-inbox", label: "Discord Inbox", icon: MessageSquare, adminOnly: true, match: "prefix" },
  { href: "/admin/payroll", label: "Payroll", icon: Banknote, adminOnly: true, match: "prefix" },
  { href: "/admin/market-analysis", label: "Market Analysis", icon: MapPin, adminOnly: true, match: "prefix" },
  { href: "/admin/store-opening", label: "Store Opening", icon: Building2, adminOnly: true, match: "prefix" },
  { href: "/admin/payments", label: "Payment Schedule", icon: Coins, adminOnly: true, match: "prefix" },
  { href: "/admin/discord-alerts", label: "Discord Alerts", icon: Bell, adminOnly: true, match: "prefix" },
  { href: "/admin/aggregator-price-monitor", label: "Aggregator Price Monitor", icon: Activity, adminOnly: true, match: "prefix" },
  { href: "/investor", label: "FOCO Investor Portal", icon: TrendingUp, adminOnly: true, match: "prefix", external: true },
];

// Primary bottom-tab hrefs — these 4 always appear in the bottom nav bar.
// Defined at module scope so useMemo hooks get a stable reference.
const MOBILE_PRIMARY_HREFS = ["/attendance", "/my-shift", "/request", "/inbox"];

function isActive(pathname: string, item: NavItem) {
  const mode = item.match || "exact";
  if (mode === "prefix") {
    if (item.excludePrefix) {
      const excl = Array.isArray(item.excludePrefix) ? item.excludePrefix : [item.excludePrefix];
      if (excl.some(p => pathname === p || pathname.startsWith(p + "/"))) return false;
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }
  return pathname === item.href;
}


function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const badge = Number(item.badgeCount || 0);
  const showDot = badge <= 0 && (item.badgeYellow || item.badgePink || item.badgeWarning);
  const cls = [
    "mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    active
      ? "bg-violet-600/20 text-white font-medium"
      : "text-neutral-400 hover:bg-white/6 hover:text-white",
  ].join(" ");
  const inner = (
    <>
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span
          className={[
            "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            item.badgeCritical
              ? "bg-rose-500/20 text-rose-200"
              : item.badgeWarning
              ? "bg-orange-500 text-white"
              : item.badgeSuccess
              ? "bg-emerald-500 text-white"
              : item.badgeYellow
              ? "bg-amber-500 text-white"
              : item.badgePink
              ? "bg-pink-500 text-white"
              : active
              ? "bg-violet-500/20 text-violet-200"
              : "bg-white/8 text-neutral-300",
          ].join(" ")}
        >
          {badge > 99 ? "99+" : String(badge)}
        </span>
      )}
      {Number(item.badge2Count || 0) > 0 && (
        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-violet-500 text-white">
          {Number(item.badge2Count) > 99 ? "99+" : String(item.badge2Count)}
        </span>
      )}
      {showDot && (
        <span
          className={[
            "h-2 w-2 rounded-full",
            item.badgeYellow ? "bg-amber-500" : item.badgePink ? "bg-pink-500" : "bg-orange-500",
          ].join(" ")}
        />
      )}
    </>
  );
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <Link href={item.href} className={cls}>{inner}</Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [resolvedAuth, setResolvedAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [displayName, setDisplayName] = useState("");
  const [procurementBadgeCount, setProcurementBadgeCount] = useState(0);
  const [procurementBadgeCritical, setProcurementBadgeCritical] = useState(false);
  const [eprBadge, setEprBadge] = useState(0);
  const [renewalBadge, setRenewalBadge] = useState(0);
  const [incidentBadge, setIncidentBadge] = useState(0);
  const [adminIncidentBadge, setAdminIncidentBadge] = useState(0);
  const [unownedBadge, setUnownedBadge] = useState(0);
  const [mgmtBadge, setMgmtBadge] = useState(0);
  const [mgmtCritical, setMgmtCritical] = useState(false);
  const [priceCheckBadge, setPriceCheckBadge] = useState(0);
  const [adminRequestBadge, setAdminRequestBadge] = useState(0);
  const [privateReportBadge, setPrivateReportBadge] = useState(0);
  const [inboxBadge, setInboxBadge] = useState(0);
  const [otBadge, setOtBadge] = useState(0);
  const [nteBadge, setNteBadge] = useState(0);
  const [pettyCashBadge, setPettyCashBadge] = useState(0);
  const [expenseBadge, setExpenseBadge] = useState(0);
  const [transportBadge, setTransportBadge] = useState(0);
  const [spotPurchaseBadge, setSpotPurchaseBadge] = useState(0);
  const [nteCasesBadge, setNteCasesBadge] = useState(0);
  const [supplierBadge, setSupplierBadge] = useState(0);
  const [absenceStaleBadge, setAbsenceStaleBadge] = useState(false);
  const [storeOpeningBadge, setStoreOpeningBadge] = useState(0);
  const [paymentBadgeCount, setPaymentBadgeCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function canSeeAdminItem(href: string, auth: ReturnType<typeof getAuth>) {
    if (!auth) return false;
    const role = String(auth.role || "").toUpperCase();
    if (href === "/admin/finance") return canAccessFinancePage(auth);
    if (role === "HQ" || role === "ADMIN") return true;
    if (href === "/admin") return canAccessAdminDashboard(auth);
    if (href === "/admin/ai-analytics-pro") return canAccessAiAnalyticsProAdmin(auth);
    if (href === "/admin/business-events") return canAccessAiAnalyticsProAdmin(auth);
    if (href === "/admin/inventory") return canAccessInventoryAdminNav(auth);
    if (href === "/admin/daily-inventory") return canAccessDailyInventoryAdmin(auth);
    if (href === "/admin/travel-path") return canAccessTravelPathAdmin(auth);
    if (href === "/admin/private-reports") return canAccessPrivateReportAdmin(auth);
    if (href === "/admin/procurement") return canAccessProcurementAdmin(auth, auth.city);
    if (href === "/admin/cost-calculation") return canAccessCostAdmin(auth);
    if (href === "/admin/analytics") return canAccessAnalyticsAdmin(auth);
    if (href === "/admin/cancellations") return canAccessAnalyticsAdmin(auth);
    if (href === "/admin/attendance") return canAccessAttendanceAdmin(auth);
    if (href === "/admin/os-attendance") return canAccessOsAttendanceAdmin(auth);
    if (href === "/admin/absences") return canAccessAbsencesAdmin(auth);
    if (href === "/admin/renewals") return canAccessRenewalsAdmin(auth);
    if (href === "/admin/staff") return canAccessStaffAdmin(auth);
    if (href === "/admin/staff/contacts") return canAccessStaffAdmin(auth);
    if (href === "/admin/staff/roles") return canAccessRoleManagement(auth);
    if (href === "/admin/security") return ["HQ", "ADMIN"].includes(role) || channelAccessForRoute("/admin/security", auth);
    if (href === "/admin/staff-ranks") return canAccessStaffAdmin(auth);
    if (href === "/admin/draft") return canAccessDraftAdmin(auth);
    if (href === "/admin/shift-audit") return ["ADMIN", "HQ"].includes(role) || channelAccessForRoute("/admin/shift-audit", auth);
    if (href === "/admin/backoffice-evaluation") return canAccessBackofficeEvaluationAdmin(auth);
    if (href === "/admin/store-evaluations") return canAccessStoreEvaluationsAdmin(auth);
    if (href === "/admin/cold-chain") return canAccessColdChainAdmin(auth);
    if (href === "/admin/ck-label-compliance") return ["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/ck-label-compliance", auth);
    if (href === "/admin/daily-check") return canAccessDailyCheckAdmin(auth);
    if (href === "/admin/expense-requests") return ["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "HR_MANAGER"].includes(role) || channelAccessForRoute("/admin/expense-requests", auth);
    if (href === "/admin/overtime") return ["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "MANAGER"].includes(role) || channelAccessForRoute("/admin/overtime", auth);
    if (href === "/admin/transport-expense") return canAccessTransportExpenseAdmin(auth);
    if (href === "/admin/petty-cash") return canAccessPettyCashAdmin(auth);
    if (href === "/admin/cash-management") return canAccessCashManagementAdmin(auth);
    if (href === "/admin/meal-allowance") return canAccessMealAllowanceAdmin(auth);
    if (href === "/admin/probation") return canAccessProbationAdmin(auth);
    if (href === "/admin/employee-cases") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/employee-cases", auth);
    // Preparing a request is HR work; issuing needs channel.admin.coe.approve,
    // which the API enforces. Seeing the page is not the same as signing one.
    if (href === "/admin/coe") return ["HQ", "ADMIN", "HR_MANAGER"].includes(role) || channelAccessForRoute("/admin/coe", auth);
    if (href === "/admin/nte") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/nte", auth);
    if (href === "/admin/hr/recruitment") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/hr/recruitment", auth);
    if (href === "/admin/hr/onboarding") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/hr/onboarding", auth);
    if (href === "/admin/hr/performance") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/hr/performance", auth);
    if (href === "/admin/hr/separation") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/hr/separation", auth);
    if (href === "/admin/hr/clearance") return canAccessHrClearanceAdmin(auth);
    if (href === "/admin/hr/policy-docs") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/hr/policy-docs", auth);
    if (href === "/admin/assets") return ["HQ", "ADMIN", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER", "DUBAI_MANAGEMENT"].includes(role) || channelAccessForRoute("/admin/assets", auth);
    if (href === "/admin/emergency-requests") return ["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(role) || channelAccessForRoute("/admin/emergency-requests", auth);
    if (href === "/admin/supplier-confirmations") return canAccessProcurementAdmin(auth, "manila");
    if (href === "/admin/incidents") return canAccessIncidentReportAdmin(auth);
    if (href === "/admin/incidents/unowned") return canAccessIncidentReportAdmin(auth);
    // Deliberately no role list and no canAccessAdminNav fallback: this is the one
    // route where the Role Management toggle is the whole answer. canAccessAdminNav
    // is true for anyone holding any admin channel, so it made "Manual Shift: off"
    // mean nothing. HQ still cannot be locked out — it carries "*".
    if (href === "/admin/manual-shift") return hasChannelAccess("admin.manual_shift", ["view", "publish"], auth);
    if (href === "/admin/price-check") return ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role) || channelAccessForRoute("/admin/price-check", auth);
    if (href === "/admin/baseroll-prep") return ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role) || channelAccessForRoute("/admin/baseroll-prep", auth);
    if (href === "/admin/daily-report") return canAccessAnalyticsAdmin(auth);
    if (href === "/admin/discord-inbox") return canAccessAdminNav(auth);
    if (href === "/admin/payroll") return canAccessPayrollAdmin(auth);
    if (href === "/admin/market-analysis") return canAccessMarketAnalysisAdmin(auth);
    if (href === "/admin/store-opening") return canAccessStoreOpeningAdmin(auth);
    if (href === "/admin/payments") return canAccessPaymentsAdmin(auth);
    if (href === "/admin/store-par-levels") return ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role) || channelAccessForRoute("/admin/store-par-levels", auth);
    if (href === "/admin/store-supplier-orders") return ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role) || hasChannelAccess("admin.store_supplier_orders", ["view"], auth);
    if (href === "/admin/ar-payouts") return ["HQ", "ADMIN"].includes(role) || (auth?.permissions || []).includes("channel.admin.ar_payouts.view");
    if (href === "/admin/mgmt-accounting") return ["HQ", "ADMIN"].includes(role) || channelAccessForRoute("/admin/mgmt-accounting", auth);
    // Anything not named above is decided by Role Management. Previously this
    // was `return false`, so every page nobody remembered to add here was
    // invisible no matter what an admin ticked — and each new page silently
    // joined them.
    return channelAccessForRoute(href, auth);
  }

  /** Does this person hold the view permission for the channel that governs
   *  this route? Unknown route (no channel registered) stays closed. */
  function channelAccessForRoute(href: string, auth: ReturnType<typeof getAuth>) {
    const meta = channelForRoute(href);
    if (!meta) return false;
    return hasChannelAccess(meta.channel, ["view"], auth);
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
        const res = await fetch(`/api/renewals/alerts/badge`, {
          method: "GET",
          cache: "no-store",
          headers: getAuthHeaders(auth),
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverCount = Number(data?.badge_count ?? 0);
        const dismissed = getRenewalsDismissedCount();
        // Auto-reset dismissed count if it equals or exceeds server count (avoids "phantom dismissed" state).
        const effectiveDismissed = dismissed > serverCount ? 0 : dismissed;
        const next = Math.max(0, serverCount - effectiveDismissed);
        if (!cancelled) {
          setRenewalBadge(next > 0 ? next : 0);
          setRenewalsBadgeCount(next);
        }
      } catch {}
    };
    void fetchBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchBadge(); }, 60_000);
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
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchIncidentBadge(); }, 60_000);
    const onRefresh = () => void fetchIncidentBadge();
    window.addEventListener(BADGE_EVENTS.incidents, onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(BADGE_EVENTS.incidents, onRefresh);
    };
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
        // Reports with nobody's name on them. This is the number that let
        // eight sit unread: nothing showed the silence unless you opened a page.
        const un = await fetch(`${API_BASE}/api/admin/incidents/unowned-badge?city=${encodeURIComponent(cityParam)}`, {
          method: "GET", cache: "no-store", headers: getAuthHeaders(auth),
        });
        if (un.ok && !cancelled) setUnownedBadge(Number((await un.json())?.badge_count ?? 0));
        // Store exceptions nobody has acted on. 535 of these accumulated while the
        // channel looked quiet, because an empty inbox and an ignored one looked
        // identical from every screen.
        const mg = await fetch(`${API_BASE}/api/admin/management/badge?city=${encodeURIComponent(cityParam)}`, {
          method: "GET", cache: "no-store", headers: getAuthHeaders(auth),
        });
        if (mg.ok && !cancelled) {
          const m = await mg.json();
          setMgmtBadge(Number(m?.badge_count ?? 0));
          setMgmtCritical(Boolean(m?.critical));
        }
      } catch {}
    };
    void fetchAdminIncidentBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchAdminIncidentBadge(); }, 60_000);
    const onRefresh = () => void fetchAdminIncidentBadge();
    window.addEventListener(BADGE_EVENTS.adminIncidents, onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(BADGE_EVENTS.adminIncidents, onRefresh);
    };
  }, []);

  // Admin requests badge (Pending: Manager count) — no auth required, matches /api/admin/overview pattern
  useEffect(() => {
    let cancelled = false;
    const fetchAdminRequestBadge = async () => {
      try {
        const auth = getAuth();
        // Only poll if logged in as admin-capable user
        if (!auth?.hasSession && !auth?.accessToken) { if (!cancelled) setAdminRequestBadge(0); return; }
        const city = String(auth.city || "dubai").toLowerCase();
        const res = await fetch(`${API_BASE}/api/admin/requests/badge?city=${encodeURIComponent(city)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAdminRequestBadge(Number(data?.badge_count ?? 0));
      } catch {}
    };
    void fetchAdminRequestBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchAdminRequestBadge(); }, 30_000);
    // Immediately re-poll when a request is approved/rejected on the Admin Dashboard
    const onRefresh = () => void fetchAdminRequestBadge();
    window.addEventListener("sushizen:requests:badge:refresh", onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("sushizen:requests:badge:refresh", onRefresh);
    };
  }, []);

  // Private reports badge (unreplied reports)
  useEffect(() => {
    let cancelled = false;
    const fetchPrivateReportBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth?.hasSession && !auth?.accessToken) { if (!cancelled) setPrivateReportBadge(0); return; }
        const res = await fetch(`${API_BASE}/api/admin/private_reports/badge`, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPrivateReportBadge(Number(data?.badge_count ?? 0));
      } catch {}
    };
    void fetchPrivateReportBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchPrivateReportBadge(); }, 30_000);
    const onRefresh = () => void fetchPrivateReportBadge();
    window.addEventListener(BADGE_EVENTS.privateReports, onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(BADGE_EVENTS.privateReports, onRefresh);
    };
  }, []);

  // Inbox badge — unread count (includes shift requests + private report replies)
  useEffect(() => {
    let cancelled = false;
    const fetchInboxBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth?.hasSession && !auth?.accessToken) { if (!cancelled) setInboxBadge(0); return; }
        const res = await fetch(`${API_BASE}/api/private_reports/my_inbox?limit=200`, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setInboxBadge(Number(data?.unread_count ?? 0));
      } catch {}
    };
    void fetchInboxBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchInboxBadge(); }, 30_000);
    const onRefresh = () => void fetchInboxBadge();
    window.addEventListener(BADGE_EVENTS.inbox, onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(BADGE_EVENTS.inbox, onRefresh);
    };
  }, []);

  // NTE notification badge: unread notices for staff
  useEffect(() => {
    let cancelled = false;
    const fetchNteBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth?.hasSession && !auth?.accessToken) return;
        const res = await fetch(`/api/store/conduct/notifications/badge`, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setNteBadge(Number(data?.count ?? 0));
      } catch {}
    };
    void fetchNteBadge();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void fetchNteBadge(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Price-check badge: fetch on event (confirm/run) AND poll every 30 min so badge stays fresh
  useEffect(() => {
    let cancelled = false;
    const fetchPriceCheckBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth?.hasSession && !auth?.accessToken) return;
        const role = String(auth.role || "").toUpperCase();
        if (!["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role)) return;
        const pcRes = await fetch(`${API_BASE}/api/admin/price-check/flagged-count`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (pcRes.ok) {
          const pcJson = await pcRes.json();
          if (!cancelled) setPriceCheckBadge(Number(pcJson?.flagged_count || 0));
        }
      } catch {}
    };
    const onRefresh = () => void fetchPriceCheckBadge();
    window.addEventListener(BADGE_EVENTS.priceCheck, onRefresh);
    // Poll every 30 minutes so badge reflects background job results without page reload
    const pollTimer = setInterval(() => void fetchPriceCheckBadge(), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener(BADGE_EVENTS.priceCheck, onRefresh);
      clearInterval(pollTimer);
    };
  }, []);

  // Poll the 6 admin badges (petty cash, expense, transport, spot purchase, NTE, supplier) every 60s
  useEffect(() => {
    async function pollGroupBadges() {
      const auth = getAuth();
      if (!auth?.hasSession && !auth?.accessToken) return;
      const r = String(auth.role || "").toUpperCase();
      const h = { cache: "no-store" as const, headers: { Authorization: `Bearer ${auth.accessToken}` } };
      if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER"].includes(r)) {
        fetch("/api/admin/petty-cash/badge?city=manila", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setPettyCashBadge(Number(j.badge_count || 0))).catch(() => {});
        fetch("/api/admin/transport/badge?city=manila", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setTransportBadge(Number(j.badge_count || 0))).catch(() => {});
        fetch("/api/admin/conduct/badge?city=manila", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setNteCasesBadge(Number(j.badge_count || 0))).catch(() => {});
      }
      if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT", "HR_MANAGER"].includes(r)) {
        fetch("/api/admin/expense-requests/pending-count", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setExpenseBadge(Number(j.count || 0))).catch(() => {});
      }
      if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(r)) {
        fetch("/api/admin/spot-purchase/pending-count", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setSpotPurchaseBadge(Number(j.count || 0))).catch(() => {});
      }
      if (["ADMIN", "HQ", "MANILA_MANAGEMENT"].includes(r)) {
        fetch("/api/admin/supplier-confirmations/badge?city=manila", h)
          .then(res => res.ok ? res.json() : null).then(j => j && setSupplierBadge(Number(j.badge_count || 0))).catch(() => {});
      }
    }
    void pollGroupBadges();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void pollGroupBadges(); }, 60_000);
    return () => clearInterval(id);
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
      // Show nav items immediately from localStorage before the async refresh completes.
      // This prevents the brief "staff-only" flash while refreshAuthFromApi is in flight.
      if (!cancelled) {
        setResolvedAuth(a);
        setDisplayName(a.staffName || "");
      }
      const resolved = await refreshAuthFromApi(a);
      if (!cancelled) {
        setResolvedAuth(resolved || a);
        setDisplayName(resolved?.staffName || a.staffName || "");
      }
      const accessToken = resolved?.accessToken || a.accessToken;
      if (!accessToken && !resolved?.hasSession && !a.hasSession) return;

      // Procurement badge — runs only if user has procurement access; never blocks other badges
      try {
        if (canAccessProcurementAdmin(resolved || a, (resolved?.city || a.city || "manila") === "dubai" ? "dubai" : "manila")) {
          const city = String(resolved?.city || a.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
          const sumRes = await fetch(`/api/admin/procurement/badge-summary?city=${encodeURIComponent(city)}`, {
            method: "GET",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...(resolved?.stepUpToken ? { "X-Step-Up-Token": resolved.stepUpToken } : {}),
            },
          });
          if (sumRes.ok) {
            const sumText = await sumRes.text();
            const sumJson = JSON.parse(sumText || "{}");
            if (!cancelled) {
              const total = Number(sumJson?.total_badge_count || 0);
              setProcurementBadgeCount(total);
              setProcurementBadgeCritical(
                Number(sumJson?.price_check_overdue_count || 0) > 0 || Number(sumJson?.issue_critical_count || 0) > 0,
              );
            }
          }
        }
      } catch {
        if (!cancelled) {
          setProcurementBadgeCount(0);
          setProcurementBadgeCritical(false);
        }
      }

      // EPR pending badge (non-blocking)
      try {
        const authForEpr = resolved || a;
        const eprRole = String(authForEpr?.role || "").toUpperCase();
        if (["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(eprRole)) {
          const eprRes = await fetch("/api/admin/emergency-requests/badge-count", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authForEpr?.accessToken}` },
          });
          if (eprRes.ok) {
            const eprJson = await eprRes.json();
            if (!cancelled) setEprBadge(Number(eprJson?.count || 0));
          }
        }
      } catch {
        // optional badge
      }

      // OT pending badge (non-blocking)
      try {
        const authForOt = resolved || a;
        const otRole = String(authForOt?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "MANAGER"].includes(otRole)) {
          const otRes = await fetch(`${API_BASE}/api/admin/overtime/pending-count`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authForOt?.accessToken}` },
          });
          if (otRes.ok) {
            const otJson = await otRes.json();
            if (!cancelled) setOtBadge(Number(otJson?.count || 0));
          }
        }
      } catch {
        // optional badge
      }

      // Price Check badge (non-blocking)
      try {
        const authForPriceCheck = resolved || a;
        const role = String(authForPriceCheck?.role || "").toUpperCase();
        if (["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role)) {
          const pcRes = await fetch(`${API_BASE}/api/admin/price-check/flagged-count`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authForPriceCheck?.accessToken}` },
          });
          if (pcRes.ok) {
            const pcJson = await pcRes.json();
            if (!cancelled) setPriceCheckBadge(Number(pcJson?.flagged_count || 0));
          }
        }
      } catch {
        // badge is optional — ignore
      }

      // Petty Cash PENDING badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER"].includes(roleB)) {
          const res = await fetch(`/api/admin/petty-cash/badge?city=manila`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setPettyCashBadge(Number(j?.badge_count || 0));
          }
        }
      } catch { /* optional */ }

      // Expense Requests PENDING badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT", "HR_MANAGER"].includes(roleB)) {
          const res = await fetch(`/api/admin/expense-requests/pending-count`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setExpenseBadge(Number(j?.count || 0));
          }
        }
      } catch { /* optional */ }

      // Transport Expense PENDING badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER"].includes(roleB)) {
          const res = await fetch(`/api/admin/transport/badge?city=manila`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setTransportBadge(Number(j?.badge_count || 0));
          }
        }
      } catch { /* optional */ }

      // Spot Purchase PENDING badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(roleB)) {
          const res = await fetch(`/api/admin/spot-purchase/pending-count`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setSpotPurchaseBadge(Number(j?.count || 0));
          }
        }
      } catch { /* optional */ }

      // NTE (Notice to Explain) ACTIVE cases badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(roleB)) {
          const res = await fetch(`/api/admin/conduct/badge?city=manila`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setNteCasesBadge(Number(j?.badge_count || 0));
          }
        }
      } catch { /* optional */ }

      // Supplier Confirmations pending badge (non-blocking)
      try {
        const authB = resolved || a;
        const roleB = String(authB?.role || "").toUpperCase();
        if (["ADMIN", "HQ", "MANILA_MANAGEMENT"].includes(roleB)) {
          const res = await fetch(`/api/admin/supplier-confirmations/badge?city=manila`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${authB?.accessToken}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) setSupplierBadge(Number(j?.badge_count || 0));
          }
        }
      } catch { /* optional */ }

      // ── Non-proxied badges (fetched here, AFTER refreshAuthFromApi refreshes sz_access) ──
      // Use relative paths (/api/...) so the Vercel CDN rewrite forwards the sz_access
      // httpOnly cookie to Heroku. The backend accepts the cookie as auth fallback.
      // Fetching them here (after cookie refresh) avoids the race where the badge
      // useEffect polls before loadAuth completes.

      // Renewals alerts badge
      try {
        const authR = resolved || a;
        if (canAccessRenewalsAdmin(authR)) {
          const res = await fetch(`/api/renewals/alerts/badge`, {
            method: "GET", cache: "no-store", headers: getAuthHeaders(authR),
          });
          if (res.ok) {
            const data = await res.json();
            const serverCount = Number(data?.badge_count ?? 0);
            const dismissed = getRenewalsDismissedCount();
            const effectiveDismissed = dismissed > serverCount ? 0 : dismissed;
            const next = Math.max(0, serverCount - effectiveDismissed);
            if (!cancelled) { setRenewalBadge(next); setRenewalsBadgeCount(next); }
          }
        }
      } catch { /* optional */ }

      // Incident badge (staff side)
      try {
        const authI = resolved || a;
        if (canAccessIncidentReport(authI)) {
          const res = await fetch(`${API_BASE}/api/incidents/badge`, {
            cache: "no-store", headers: getAuthHeaders(authI),
          });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setIncidentBadge(Number(data?.badge_count ?? 0));
          }
        }
      } catch { /* optional */ }

      // Inbox badge (private_reports/my_inbox — direct to Heroku via Vercel rewrite)
      try {
        const authInbox = resolved || a;
        if (authInbox?.hasSession || authInbox?.accessToken) {
          const res = await fetch(`${API_BASE}/api/private_reports/my_inbox?limit=200`, {
            cache: "no-store", headers: getAuthHeaders(authInbox),
          });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setInboxBadge(Number(data?.unread_count ?? 0));
          }
        }
      } catch { /* optional */ }
    }

    void loadAuth();
    const onStorage = () => void loadAuth();
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Absence staleness badge — polls hourly; red dot when either city unreviewd 2+ weekdays
  useEffect(() => {
    let cancelled = false;
    const fetchAbsenceStale = async () => {
      try {
        const auth = getAuth();
        const role = (auth?.role || "").toUpperCase();
        if ((!auth?.hasSession && !auth?.accessToken) || (role !== "HQ" && role !== "ADMIN" && !canAccessAbsencesAdmin(auth))) {
          if (!cancelled) setAbsenceStaleBadge(false);
          return;
        }
        const res = await fetch(`${API_BASE}/api/admin/absences/check-status`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { cities?: { stale: boolean }[] };
        const anyStale = (data.cities ?? []).some(c => c.stale);
        if (!cancelled) setAbsenceStaleBadge(anyStale);
      } catch { /* non-critical */ }
    };
    void fetchAbsenceStale();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchAbsenceStale();
    }, 60 * 60 * 1000); // every hour
    const onRefresh = () => void fetchAbsenceStale();
    window.addEventListener("sushizen:absences:stale:refresh", onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("sushizen:absences:stale:refresh", onRefresh);
    };
  }, []);

  // Store Opening overdue badge — poll every 15 min
  useEffect(() => {
    let cancelled = false;
    const fetchStoreOpeningBadge = async () => {
      try {
        const auth = getAuth();
        if ((!auth?.hasSession && !auth?.accessToken) || !canAccessStoreOpeningAdmin(auth)) {
          if (!cancelled) setStoreOpeningBadge(0);
          return;
        }
        const res = await fetch(`${API_BASE}/api/admin/store-opening/badge`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStoreOpeningBadge(Number(data?.badge_count ?? 0));
      } catch { /* non-critical */ }
    };
    void fetchStoreOpeningBadge();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchStoreOpeningBadge();
    }, 15 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Payment Schedule alert badge — polls every 60s
  useEffect(() => {
    let cancelled = false;
    const fetchPaymentBadge = async () => {
      try {
        const auth = getAuth();
        if (!auth?.hasSession && !auth?.accessToken) {
          if (!cancelled) setPaymentBadgeCount(0);
          return;
        }
        const res = await fetch(`${API_BASE}/api/admin/payments/badge-count`, {
          cache: "no-store",
          headers: getAuthHeaders(auth),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPaymentBadgeCount(Number(data?.count ?? 0));
      } catch { /* non-critical */ }
    };
    void fetchPaymentBadge();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchPaymentBadge();
    }, 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const staffItems = useMemo(() => {
    return [...PRIMARY, ...SECONDARY_BASE]
      .filter((item) => {
        if (item.href === "/attendance") return canAccessAttendancePage(resolvedAuth);
        if (item.href === "/my-shift") return canAccessMyShiftPage(resolvedAuth);
        if (item.href === "/week") return canAccessWeekPage(resolvedAuth);
        if (item.href === "/calendar") return canAccessCalendarPage(resolvedAuth);
        if (item.href === "/my-pay") return canAccessMyPay(resolvedAuth);
        if (item.href === "/store/evaluation") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"].includes(r)
            || channelAccessForRoute("/store/evaluation", resolvedAuth);
        }
        if (item.href === "/store/ck-inventory") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER"].includes(r)
            || canAccessInventoryAdminNav(resolvedAuth)
            || channelAccessForRoute("/store/ck-inventory", resolvedAuth);
        }
        if (item.href === "/store/ck-production-plan") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER", "STAFF"].includes(r)
            || canAccessInventoryAdminNav(resolvedAuth)
            || channelAccessForRoute("/store/ck-production-plan", resolvedAuth);
        }
        if (item.href === "/store/ck-delivery") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER", "STAFF"].includes(r)
            || canAccessInventoryAdminNav(resolvedAuth)
            || channelAccessForRoute("/store/ck-delivery", resolvedAuth);
        }
        if (item.href === "/store/ck-ingredient-receiving") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "HR_MANAGER", "STAFF"].includes(r)
            || canAccessInventoryAdminNav(resolvedAuth)
            || channelAccessForRoute("/store/ck-ingredient-receiving", resolvedAuth);
        }
        if (item.href === "/store/supplier-receiving") {
          const r = String(resolvedAuth?.role || "").toUpperCase();
          return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER", "STAFF"].includes(r)
            || channelAccessForRoute("/store/supplier-receiving", resolvedAuth);
        }
        return true;
      })
      .map((item) =>
        item.href === "/incidents"
          ? { ...item, badgeCount: incidentBadge, badgeWarning: incidentBadge > 0 }
          : item.href === "/inbox"
          ? { ...item, badgeCount: inboxBadge, badgeWarning: inboxBadge > 0 }
          : item.href === "/store/my-nte"
          ? { ...item, badgeCount: nteBadge, badgeWarning: nteBadge > 0 }
          : item,
      );
  }, [resolvedAuth, incidentBadge, inboxBadge, nteBadge]);

  const adminItems = useMemo(() => {
    return ADMIN_ITEMS
      .filter((item) => canSeeAdminItem(item.href, resolvedAuth))
      .map((item) =>
        item.href === "/admin"
          ? { ...item, badge2Count: adminRequestBadge, badge2Violet: adminRequestBadge > 0 }
          : item.href === "/admin/private-reports"
            ? { ...item, badgeCount: privateReportBadge, badgePink: privateReportBadge > 0 }
            : item.href === "/admin/procurement"
          ? { ...item, badgeCount: procurementBadgeCount, badgeCritical: procurementBadgeCritical, badgeSuccess: true }
          : item.href === "/admin/emergency-requests"
          ? { ...item, badgeCount: eprBadge, badgeWarning: eprBadge > 0 }
          : item.href === "/admin/renewals"
            ? { ...item, badgeCount: renewalBadge, badgeWarning: true }
          : item.href === "/admin/incidents"
            ? { ...item, badgeCount: adminIncidentBadge, badgeWarning: adminIncidentBadge > 0 }
          : item.href === "/admin/incidents/unowned"
            ? { ...item, badgeCount: unownedBadge, badgeCritical: unownedBadge > 0 }
          : item.href === "/admin/management/back-office"
            ? { ...item, badgeCount: mgmtBadge, badgeCritical: mgmtCritical, badgeWarning: !mgmtCritical && mgmtBadge > 0 }
          : item.href === "/admin/price-check"
            ? { ...item, badgeCount: priceCheckBadge, badgeCritical: priceCheckBadge > 0 }
          : item.href === "/admin/overtime"
            ? { ...item, badgeCount: otBadge, badgeWarning: otBadge > 0 }
          : item.href === "/admin/petty-cash"
            ? { ...item, badgeCount: pettyCashBadge, badgeYellow: pettyCashBadge > 0 }
          : item.href === "/admin/expense-requests"
            ? { ...item, badgeCount: expenseBadge, badgeYellow: expenseBadge > 0 }
          : item.href === "/admin/transport-expense"
            ? { ...item, badgeCount: transportBadge, badgeYellow: transportBadge > 0 }
          : item.href === "/admin/spot-purchase"
            ? { ...item, badgeCount: spotPurchaseBadge, badgeYellow: spotPurchaseBadge > 0 }
          : item.href === "/admin/employee-cases"
            ? { ...item, badgeCount: nteCasesBadge, badgeWarning: nteCasesBadge > 0 }
          : item.href === "/admin/supplier-confirmations"
            ? { ...item, badgeCount: supplierBadge, badgeYellow: supplierBadge > 0 }
          : item.href === "/admin/absences"
            ? { ...item, badgeWarning: absenceStaleBadge }
          : item.href === "/admin/store-opening"
            ? { ...item, badgeCount: storeOpeningBadge, badgeYellow: storeOpeningBadge > 0 }
          : item.href === "/admin/payments"
            ? { ...item, badgeCount: paymentBadgeCount, badgeCritical: paymentBadgeCount > 0 }
          : item,
      );
  }, [resolvedAuth, procurementBadgeCount, procurementBadgeCritical, renewalBadge, adminIncidentBadge, unownedBadge, mgmtBadge, mgmtCritical, priceCheckBadge, adminRequestBadge, privateReportBadge, eprBadge, otBadge, pettyCashBadge, expenseBadge, transportBadge, spotPurchaseBadge, nteCasesBadge, supplierBadge, absenceStaleBadge, storeOpeningBadge, paymentBadgeCount]);

  const navItems = useMemo(() => [...staffItems, ...adminItems], [staffItems, adminItems]);

  // Mobile bottom nav: show these 4 items as primary tabs
  const mobilePrimaryItems = useMemo(
    () => MOBILE_PRIMARY_HREFS.map((h) => navItems.find((i) => i.href === h)).filter(Boolean) as NavItem[],
    [navItems],
  );
  // "All pages" grid shows EVERY accessible page so users can always find anything.
  // Primary tab items are intentionally included here too — the bottom tabs are just
  // convenience shortcuts, not the only way to reach those pages.
  const mobileMoreItems = useMemo(() => navItems, [navItems]);
  // "More" red dot only watches non-primary-tab items; primary tabs already show
  // their own badges in the bottom nav so we avoid a misleading double-signal.
  const moreHasBadge = useMemo(
    () => navItems
      .filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href))
      .some((i) => (i.badgeCount || 0) > 0 || i.badgeCritical),
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
      {/* ── Top header: logo + user + logout (mobile only — desktop uses sidebar) ── */}
      <div className="flex h-11 items-center justify-between gap-2 md:hidden">
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

      <div className="border-b border-white/10 md:hidden" />

      {/* ── Mobile bottom nav + overlay: portal to body to escape backdrop-filter containing block ── */}
      {mounted && createPortal(
        <>
        {/* ── Desktop sidebar: hidden on mobile ── */}
        <nav className="fixed left-0 top-0 z-[60] hidden h-screen w-60 flex-col border-r border-white/10 bg-[#0d1117] md:flex">
          {/* Logo + brand */}
          <Link
            href="/my-shift"
            className="flex h-14 shrink-0 items-center gap-2 border-b border-white/8 px-4 transition-colors hover:bg-white/4"
          >
            <div className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-xs font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              ZEN
            </div>
            <p className="truncate text-[13px] font-semibold text-white">Sushi ZEN Workforce OS</p>
          </Link>

          {/* User info */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-white/8 px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-medium text-white">
              {userInitials}
            </div>
            <span className="flex-1 truncate text-xs text-neutral-300">{displayName || "Staff portal"}</span>
          </div>

          {/* Scrollable nav items */}
          <div className="relative flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto py-2 [&::-webkit-scrollbar]:hidden">
            {staffItems.length > 0 && (
              <div className="mb-1">
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                  Staff
                </p>
                {staffItems.map((item) => (
                  <SidebarItem key={item.href} item={item} active={isActive(pathname, item)} />
                ))}
              </div>
            )}
            {adminItems.length > 0 && (
              <div className="mt-2">
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                  Admin
                </p>
                {adminItems.map((item) => (
                  <SidebarItem key={item.href} item={item} active={isActive(pathname, item)} />
                ))}
              </div>
            )}
          </div>
          {/* Fade gradient — hints that more items are below */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0d1117] to-transparent" />
          </div>

          {/* Logout */}
          <div className="shrink-0 border-t border-white/8 px-2 py-2">
            <button
              onClick={doLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-white/8 hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </nav>

        {/* ── Mobile bottom nav ── */}
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
            {/* Red dot if any non-primary-tab item has a badge */}
            {moreHasBadge && (
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
                const mobileCls = [
                  "relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-colors",
                  active
                    ? "bg-violet-900/30 text-violet-300"
                    : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white",
                ].join(" ");
                const mobileInner = (
                  <>
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] leading-tight">{item.label}</span>
                  </>
                );
                return item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMoreOpen(false)}
                    className={mobileCls}
                  >{mobileInner}</a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={mobileCls}
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