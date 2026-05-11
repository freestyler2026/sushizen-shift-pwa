// src/app/admin/page.tsx
"use client";

import { motion } from "framer-motion";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  ArchiveRestore,
  CalendarPlus,
  CheckCheck,
  Trash2,
  Clock,
  Download,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Shield,
  Tag,
  UserX,
  Users,
} from "lucide-react";
import { BRANCHES, type City as BranchCity, type BranchCode } from "@/lib/branches";
import { canAccessAdminNav, canAccessInventoryWorkspace, canAccessRoleManagement, getAuth, getAuthHeaders, refreshAuthFromApi, type Auth } from "@/lib/auth";
import DateRangePicker from "@/components/DateRangePicker";
import MonthPicker from "@/components/MonthPicker";
import OrderEntryTab from "@/components/admin/OrderEntryTab";
import ManilaOfflineOrderEntryTab from "@/components/admin/ManilaOfflineOrderEntryTab";
import AdminSalesDataInputTab from "@/components/admin/AdminSalesDataInputTab";
import AdminCashierEvalInputTab from "@/components/admin/AdminCashierEvalInputTab";
import AdminCancellationInputTab from "@/components/admin/AdminCancellationInputTab";
import AdminDailyInventoryTab from "@/components/admin/AdminDailyInventoryTab";
import AdminDubaiCancellationInputTab from "@/components/admin/AdminDubaiCancellationInputTab";
import { RatingEntryTab } from "@/components/admin/RatingEntryTab";
import { LowRatingsAdminPanel } from "@/components/lowratings/LowRatingsAdminPanel";
import {
  GLASS_CARD,
  STATUS_CARD,
  HIGHLIGHT_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

// Admin Dashboard sub-tabs: single source of truth (?tab= ↔ in-app view)
type AdminDashView =
  | "requests"
  | "lowRatings"
  | "orderEntry"
  | "ratingEntry"
  | "salesDataInput"
  | "cashierEvalInput"
  | "dailyInventory"
  | "cancellationInput"
  | "dubaiCancellationInput";

type OrderEntrySub = "dubai" | "manila";

/** Spec: requests · low-ratings · ratings-entry · Manila sales tools · order-entry (rating-entry URL key = ratings-entry) */
/** Tab row uses nowrap + overflow-x so trailing tabs stay reachable. */
const ADMIN_DASH_TABS = [
  { view: "requests" as const, label: "Request Check", icon: "📋", tabQuery: null as string | null },
  { view: "lowRatings" as const, label: "Low Ratings Input", icon: "⚠️", tabQuery: "low-ratings" },
  { view: "ratingEntry" as const, label: "Ratings Input", icon: "⭐", tabQuery: "ratings-entry" },
  { view: "salesDataInput" as const, label: "Sales Data Input", icon: "✏️", tabQuery: "sales-data-input" },
  { view: "cashierEvalInput" as const, label: "Cashier Eval Input", icon: "🧾", tabQuery: "cashier-eval-input" },
  { view: "dailyInventory" as const, label: "Daily Inventory Input", icon: "🧺", tabQuery: "daily-inventory" },
  { view: "cancellationInput" as const, label: "Manila Cancellation", icon: "🚫", tabQuery: "cancellation-input" },
  { view: "dubaiCancellationInput" as const, label: "Dubai Cancellation", icon: "🇦🇪", tabQuery: "dubai-cancellation-input" },
  { view: "orderEntry" as const, label: "Number of Orders Input", icon: "📦", tabQuery: "order-entry" },
] as const;

function tabParamToDashView(tab: string | null): AdminDashView {
  if (!tab) return "requests";
  const row = ADMIN_DASH_TABS.find((x) => x.tabQuery === tab);
  return row ? row.view : "requests";
}

// --------------------
// utils
// --------------------
function qs(obj: Record<string, any>) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v);
    if (s === "") return;
    p.append(k, s);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function apiGet<T = any>(path: string, headers?: HeadersInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) {
    // Extract FastAPI's { detail: "..." } field if present; fall back to raw text.
    let msg = text || `GET ${path} failed`;
    try { const j = JSON.parse(text); if (j?.detail) msg = j.detail; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body?: any, headers?: HeadersInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json", ...(headers || {}) } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Extract FastAPI's { detail: "..." } field if present; fall back to raw text.
    let msg = text || `POST ${path} failed`;
    try { const j = JSON.parse(text); if (j?.detail) msg = j.detail; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function addDaysIso(base: string, days: number) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mondayOfIso(base: string) {
  const d = new Date(`${base}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// --------------------
// types
// --------------------
type AdminItem = {
  id: string;
  branch: string;
  staff_name: string;
  work_date: string;
  request_type: string;
  urgency_status: string;
  days_before?: number;
  manager_status: string;
  hq_status: string;
  counterparty_name?: string;
  counterparty_status?: string;
  reason?: string;
};

type Overview = {
  city: string;
  start_date: string;
  end_date: string;
  buckets: {
    red_open: AdminItem[];
    swap_pending_counterparty: AdminItem[];
    pending_manager: AdminItem[];
    pending_hq: AdminItem[];
  };
};

type AuthVerifyResp = {
  ok: boolean;
  staff_name: string;
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type ExportMode = "FINAL" | "DRAFT";
type ExportPrepareReq = {
  city: BranchCity;
  branch_code: BranchCode;
  month: string;
  mode: ExportMode;
  approver_name: string;
  pin: string;
};
type ExportPrepareResp = {
  ok: boolean;
  preview: {
    city: string;
    branch_code: string;
    month: string;
    mode: string;
    date_from: string;
    date_to_exclusive: string;
    shift_rows: number;
    staff_count: number;
    days: number;
    hour_range: { start: number; end: number };
  };
  confirm_token: string;
  expires_in_sec: number;
};
type ExportConfirmReq = {
  confirm_token: string;
  approver_name: string;
  pin: string;
};
type ExportConfirmResp = {
  ok: boolean;
  result?: any;
  sheet_url?: string;
  spreadsheet_id?: string;
  tab_timetable?: string;
  tab_headcount?: string;
  gid_timetable?: number;
  gid_headcount?: number;
  timetable_url?: string;
  headcount_url?: string;
  meta?: any;
};
type AttendanceDriveSyncResp = {
  ok?: boolean;
  duplicate?: boolean;
  message?: string;
};

const BUCKET_ORDER: Array<keyof Overview["buckets"]> = [
  "red_open",
  "swap_pending_counterparty",
  "pending_manager",
  "pending_hq",
];

function bucketTitle(k: string) {
  switch (k) {
    case "red_open":
      return "RED Open (HQ not approved)";
    case "swap_pending_counterparty":
      return "Swap: Counterparty pending";
    case "pending_manager":
      return "Pending: Manager";
    case "pending_hq":
      return "Pending: HQ";
    default:
      return k;
  }
}

function urgencyBadge(u: string) {
  const x = String(u || "").toUpperCase();
  if (x === "RED") {
    return { label: "RED", cls: "border-rose-500/60 bg-rose-950/40 text-rose-200" };
  }
  if (x === "YELLOW") {
    return { label: "YELLOW", cls: "border-amber-500/60 bg-amber-950/40 text-amber-200" };
  }
  return { label: x || "GREEN", cls: "border-emerald-500/50 bg-emerald-950/30 text-emerald-200" };
}

function bucketMeta(key: keyof Overview["buckets"]) {
  switch (key) {
    case "red_open":
      return {
        title: "RED Open",
        subtitle: "HQ not approved",
        icon: AlertTriangle,
        badgeClass: "border-red-500/30 bg-red-500/20 text-red-400",
        emptyIconClass: "text-emerald-500",
        headerIconClass: "text-red-400",
      };
    case "swap_pending_counterparty":
      return {
        title: "Swap: Counterparty Pending",
        subtitle: "",
        icon: ArrowLeftRight,
        badgeClass: "border-violet-500/30 bg-violet-500/20 text-violet-300",
        emptyIconClass: "text-emerald-500",
        headerIconClass: "text-violet-400",
      };
    case "pending_manager":
      return {
        title: "Pending: Manager",
        subtitle: "",
        icon: Clock,
        badgeClass: "border-violet-500/30 bg-violet-500/20 text-violet-300",
        emptyIconClass: "text-emerald-500",
        headerIconClass: "text-violet-400",
      };
    case "pending_hq":
      return {
        title: "Pending: HQ",
        subtitle: "",
        icon: Clock,
        badgeClass: "border-sky-500/30 bg-sky-500/20 text-sky-400",
        emptyIconClass: "text-emerald-500",
        headerIconClass: "text-sky-400",
      };
    default:
      return {
        title: bucketTitle(key),
        subtitle: "",
        icon: Clock,
        badgeClass: "border-white/20 bg-white/10 text-zinc-300",
        emptyIconClass: "text-emerald-500",
        headerIconClass: "text-zinc-300",
      };
  }
}

function RequestCard({
  item,
  isExpanded,
  onToggle,
  role,
  setRole,
  pin,
  setPin,
  note,
  setNote,
  opLoading,
  opMsg,
  canUseHQRole,
  onApprove,
  onReject,
  onNeedInfo,
  onCounterpartyApprove,
  onCounterpartyReject,
}: {
  item: AdminItem;
  isExpanded: boolean;
  onToggle: () => void;
  role: "MANAGER" | "HQ";
  setRole: (next: "MANAGER" | "HQ") => void;
  pin: string;
  setPin: (next: string) => void;
  note: string;
  setNote: (next: string) => void;
  opLoading: boolean;
  opMsg: string;
  canUseHQRole: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedInfo: () => void;
  onCounterpartyApprove: () => void;
  onCounterpartyReject: () => void;
}) {
  const badge = urgencyBadge(item.urgency_status);

  return (
    <div>
      <button
        className={[
          "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
          isExpanded
            ? "rounded-b-none border-amber-500 bg-amber-950/20 text-amber-100"
            : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40",
        ].join(" ")}
        onClick={onToggle}
        type="button"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{item.staff_name} / {item.request_type}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {item.work_date} • M:{item.manager_status} • HQ:{item.hq_status}
            </div>
            {item.counterparty_name ? <div className="text-xs text-neutral-500">↔ {item.counterparty_name}</div> : null}
            {item.reason ? <div className="text-xs text-neutral-400 truncate italic">{item.reason}</div> : null}
          </div>
          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] ${badge.cls}`}>{badge.label}</span>
        </div>
      </button>

      {isExpanded ? (
        <div className="space-y-3 rounded-b-xl border border-t-0 border-amber-500/60 bg-neutral-900/60 px-3 py-3">
          <div className="space-y-0.5 text-xs text-neutral-500">
            <div>
              ID: <span className="font-mono text-neutral-400">{item.id.slice(0, 8)}...</span>
            </div>
            {item.days_before != null ? (
              <div>
                Days before: <span className="text-neutral-300">{item.days_before}</span>
              </div>
            ) : null}
            {item.counterparty_status ? (
              <div>
                Counterparty status: <span className="text-neutral-300">{item.counterparty_status}</span>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-neutral-500">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "MANAGER" | "HQ")}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs"
              >
                <option value="MANAGER">MANAGER</option>
                <option value="HQ" disabled={!canUseHQRole}>
                  HQ
                </option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-neutral-500">PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] text-neutral-500">Note</div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="OK"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={opLoading || !pin.trim()}
              onClick={onApprove}
              className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-50"
            >
              {opLoading ? "..." : "✅ APPROVE"}
            </button>
            <button
              type="button"
              disabled={opLoading || !pin.trim()}
              onClick={onReject}
              className="rounded-lg border border-rose-600/60 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-950/50 disabled:opacity-50"
            >
              {opLoading ? "..." : "❌ REJECT"}
            </button>
            <button
              type="button"
              disabled={opLoading || !pin.trim()}
              onClick={onNeedInfo}
              className="rounded-lg border border-amber-600/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
            >
              ℹ️ NEED_INFO
            </button>
            {item.request_type === "swap" ? (
              <>
                <button
                  type="button"
                  disabled={opLoading || !pin.trim()}
                  onClick={onCounterpartyApprove}
                  className="rounded-lg border border-sky-600/60 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-950/50 disabled:opacity-50"
                >
                  👥 CP APPROVE
                </button>
                <button
                  type="button"
                  disabled={opLoading || !pin.trim()}
                  onClick={onCounterpartyReject}
                  className="rounded-lg border border-neutral-600/60 bg-neutral-950/30 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900/40 disabled:opacity-50"
                >
                  👥 CP REJECT
                </button>
              </>
            ) : null}
          </div>

          {opMsg ? (
            <div className={`text-xs ${opMsg.startsWith("✅") ? "text-emerald-300" : "text-rose-300"}`}>{opMsg}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function hydrateApproverFromAuth(
  currentApproverName: string,
  currentPin: string,
  setApproverName: (value: string) => void,
  setPin: (value: string) => void,
) {
  const auth = getAuth();
  if (!auth) return;
  if (!currentApproverName.trim() && auth.staffName) {
    setApproverName(auth.staffName);
  }
  if (!currentPin.trim() && auth.pin) {
    setPin(auth.pin);
  }
}

function isHQOrAdmin(role: string) {
  const r = String(role || "").toUpperCase();
  return (
    r === "HQ" ||
    r === "ADMIN" ||
    r === "HR_MANAGER" ||
    r === "MANAGEMENT" ||
    r === "DUBAI_MANAGEMENT" ||
    r === "MANILA_MANAGEMENT"
  );
}

function needsManagerDecision(item: AdminItem | null) {
  if (!item) return false;
  return String(item.manager_status || "").toUpperCase() !== "APPROVED";
}

// --------------------
// component
// --------------------
export default function AdminPage() {
  return (
    <Suspense fallback={<div className="text-sm text-neutral-500">Loading admin dashboard...</div>}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAuth = useMemo(() => getAuth(), []);
  const [dashView, setDashView] = useState<AdminDashView>("requests");
  const [orderEntrySub, setOrderEntrySub] = useState<OrderEntrySub>("dubai");
  const [ratingEntrySub, setRatingEntrySub] = useState<"dubai" | "manila">("dubai");
  const [sessionAuth, setSessionAuth] = useState<Auth | null>(initialAuth);
  const auth = sessionAuth || initialAuth;
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [city, setCity] = useState<BranchCity>((initialAuth?.city as BranchCity) || "dubai");

  const [startDate, setStartDate] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<AdminItem | null>(null);

  const [role, setRole] = useState<"MANAGER" | "HQ">("MANAGER");
  const [note, setNote] = useState("OK");
  const [approverName, setApproverName] = useState(initialAuth?.staffName || "");
  const [pin, setPin] = useState(initialAuth?.pin || "");
  const [opMsg, setOpMsg] = useState("");
  const [opLoading, setOpLoading] = useState(false);
  const [attendanceSyncing, setAttendanceSyncing] = useState(false);
  const [attendanceSyncMessage, setAttendanceSyncMessage] = useState("");

  // ---- HQ Export state ----
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >(
    ((initialAuth?.role || "").toUpperCase() as "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | "")
  );
  const [exportCity, setExportCity] = useState<BranchCity>((initialAuth?.city as BranchCity) || "dubai");
  const [exportBranch, setExportBranch] = useState<BranchCode>(
    BRANCHES[(initialAuth?.city as BranchCity) || "dubai"][0]?.code || "BB"
  );
  const [exportMonth, setExportMonth] = useState<string>(monthKey(new Date()));
  const [exportMode, setExportMode] = useState<ExportMode>("FINAL");

  const [prepLoading, setPrepLoading] = useState(false);
  const [prepErr, setPrepErr] = useState("");
  const [prep, setPrep] = useState<ExportPrepareResp | null>(null);

  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [confirmOk, setConfirmOk] = useState<ExportConfirmResp | null>(null);

  const [tokenRemain, setTokenRemain] = useState<number | null>(null);
  const tokenTimerRef = useRef<any>(null);
  const canOpenInventory = useMemo(() => canAccessInventoryWorkspace(sessionAuth || auth), [auth, sessionAuth]);
  const canOpenRoleManagement = useMemo(() => canAccessRoleManagement(sessionAuth || auth), [auth, sessionAuth]);
  const [priceCheckFlagged, setPriceCheckFlagged] = useState<number | null>(null);
  const canOpenPriceCheck = useMemo(() => {
    const r = (sessionAuth?.role || auth?.role || "");
    return ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(r);
  }, [auth, sessionAuth]);

  const clearTokenTimer = () => {
    if (tokenTimerRef.current) {
      clearInterval(tokenTimerRef.current);
      tokenTimerRef.current = null;
    }
  };

  const startTokenTimer = (sec: number) => {
    clearTokenTimer();
    setTokenRemain(sec);
    tokenTimerRef.current = setInterval(() => {
      setTokenRemain((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearTokenTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resetExportState = () => {
    clearTokenTimer();
    setPrep(null);
    setPrepErr("");
    setConfirmChecked(false);
    setConfirmErr("");
    setConfirmOk(null);
    setTokenRemain(null);
  };

  const fetchLatest = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGet<Overview>(`/api/admin/overview${qs({ city })}`, getAuthHeaders(sessionAuth || auth));
      setData(d);
      setStartDate(d.start_date);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchByDate = async () => {
    if (!startDate) return;
    setLoading(true);
    setError("");
    try {
      const d = await apiGet<Overview>(`/api/admin/overview${qs({ city, start_date: startDate })}`, getAuthHeaders(sessionAuth || auth));
      setData(d);
      setStartDate(d.start_date);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const localAuth = getAuth() || initialAuth;
      try {
        const refreshed = await withTimeout(refreshAuthFromApi(localAuth), 4000, localAuth);
        if (cancelled) return;

        const resolved = refreshed || getAuth() || localAuth || null;
        setSessionAuth(resolved);

        if (!resolved?.staffName) {
          setAllowed(false);
          setError("Admin session is missing. Please log in again.");
          setReady(true);
          router.replace("/login?next=%2Fadmin");
          return;
        }

        if (!resolved?.accessToken) {
          setAllowed(false);
          setError("Admin session token is missing. Please log out and log in again.");
          setReady(true);
          return;
        }

        const hasAccess = canAccessAdminNav(resolved);
        if (!hasAccess) {
          setAllowed(false);
          setError("Admin dashboard is available only to authorized admin roles.");
          setReady(true);
          router.replace("/week");
          return;
        }

        setAllowed(true);
        setError("");
        setReady(true);
        try {
          const nm = localStorage.getItem("sushizen_admin_name") || "";
          if (nm) setApproverName((prev) => prev || nm);
        } catch {}
      } catch (e: any) {
        if (cancelled) return;

        const fallback = getAuth() || initialAuth || null;
        const hasAccess = Boolean(fallback?.staffName && fallback?.accessToken && canAccessAdminNav(fallback));

        setSessionAuth(fallback);
        setAllowed(hasAccess);
        setReady(true);
        setError(String(e?.message || e || "Failed to initialize admin dashboard."));

        if (!fallback?.staffName) {
          router.replace("/login?next=%2Fadmin");
          return;
        }
        if (!hasAccess) {
          router.replace("/week");
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
      clearTokenTimer();
    };
  }, [initialAuth, router]);

  useEffect(() => {
    if (!ready || !allowed) return;
    const tab = searchParams.get("tab");
    if (tab === "ai-analytics-pro") {
      router.replace("/admin/ai-analytics-pro");
      return;
    }
    setDashView(tabParamToDashView(tab));
  }, [ready, allowed, searchParams, router]);

  // Price Check flagged count (non-blocking, best-effort)
  useEffect(() => {
    if (!ready || !allowed || !canOpenPriceCheck) return;
    const activeAuth = sessionAuth || auth;
    if (!activeAuth?.accessToken) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/price-check/flagged-count`, {
          headers: { Authorization: `Bearer ${activeAuth.accessToken}` },
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          setPriceCheckFlagged(Number(j?.flagged_count ?? 0));
        }
      } catch {
        // ignore — badge is optional
      }
    })();
  }, [ready, allowed, canOpenPriceCheck, sessionAuth, auth]);

  useEffect(() => {
    if (!ready || !allowed) return;
    const oe = searchParams.get("orderEntry");
    if (oe === "manila") setOrderEntrySub("manila");
    else if (oe === "dubai") setOrderEntrySub("dubai");
  }, [ready, allowed, searchParams]);

  useEffect(() => {
    if (!ready || !allowed || dashView !== "requests") return;
    const t = searchParams.get("tab");
    if (t && ADMIN_DASH_TABS.some((x) => x.tabQuery === t)) return;
    setSelected(null);
    setSearch("");
    void fetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, city, ready, sessionAuth?.accessToken, dashView, searchParams]);

  const setDashTab = (next: AdminDashView) => {
    setDashView(next);
    const row = ADMIN_DASH_TABS.find((x) => x.view === next);
    const q = row?.tabQuery;
    if (!q) router.replace("/admin", { scroll: false });
    else router.replace(`/admin?tab=${encodeURIComponent(q)}`, { scroll: false });
  };

  useEffect(() => {
    const run = async () => {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm || !p) {
        setMyRole("");
        return;
      }
      try {
        const r = await apiPost<AuthVerifyResp>(`/api/auth/verify${qs({ staff_name: nm, pin: p })}`);
        if (r?.ok) setMyRole(r.role || "");
        else setMyRole("");
      } catch {
        setMyRole("");
      }
    };
    run();
  }, [approverName, pin]);

  useEffect(() => {
    if (!isHQOrAdmin(myRole) && role !== "MANAGER") {
      setRole("MANAGER");
    }
  }, [myRole, role]);

  useEffect(() => {
    if (!selected) return;
    const nextRole: "MANAGER" | "HQ" = needsManagerDecision(selected) ? "MANAGER" : "HQ";
    if (nextRole === "HQ" && !isHQOrAdmin(myRole)) {
      setRole("MANAGER");
      return;
    }
    setRole(nextRole);
  }, [selected, myRole]);

  useEffect(() => {
    const first = BRANCHES[exportCity][0]?.code;
    if (first && exportBranch !== first) setExportBranch(first);
    resetExportState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportCity]);

  const runIntentAndConfirm = async (item: AdminItem, targetAction: "APPROVE" | "REJECT" | "NEED_INFO") => {
    if (!window.confirm(`Are you sure you want to ${String(targetAction || "").toLowerCase().replace("_", " ")} this request?`)) return;

    setOpLoading(true);
    setOpMsg("");

    try {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm) throw new Error("approver_name required");
      if (!p) throw new Error("PIN required");

      try {
        localStorage.setItem("sushizen_admin_name", nm);
      } catch {}

      const confirmRole: "MANAGER" | "HQ" = role;
      if (confirmRole === "HQ" && !isHQOrAdmin(myRole)) {
        throw new Error("HQ approval requires HQ or ADMIN role.");
      }

      await apiPost(
        `/api/shift_change/intent${qs({
          req_id: item.id,
          role: confirmRole,
          action: targetAction,
        })}`
      );

      const confirmPath = confirmRole === "MANAGER" ? "/api/shift_change/confirm_manager" : "/api/shift_change/confirm_hq";

      await apiPost(
        `${confirmPath}${qs({
          req_id: item.id,
          action: targetAction === "APPROVE" ? "APPROVED" : targetAction === "REJECT" ? "REJECTED" : "NEED_INFO",
          note,
          approver_name: nm,
          pin: p,
        })}`
      );

      setOpMsg("✅ Done");
      setSelected(null);
      setSearch("");
      await fetchLatest();
      window.dispatchEvent(new CustomEvent("sushizen:requests:badge:refresh"));
    } catch (e: any) {
      setOpMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setOpLoading(false);
    }
  };

  const runCounterparty = async (item: AdminItem, cpAction: "APPROVED" | "REJECTED") => {
    if (!window.confirm(`Are you sure you want to mark the counterparty as ${cpAction.toLowerCase()}?`)) return;

    setOpLoading(true);
    setOpMsg("");

    try {
      const cp = (item.counterparty_name || "").trim();
      if (!cp) throw new Error("counterparty_name missing");
      const p = pin.trim();
      if (!p) throw new Error("PIN required (counterparty)");

      await apiPost(
        `/api/shift_change/counterparty/respond${qs({
          req_id: item.id,
          staff_name: cp,
          approver_name: approverName.trim(),
          action: cpAction,
          note: cpAction === "APPROVED" ? "I agree" : "I decline",
          pin: p,
        })}`
      );

      setOpMsg("✅ Counterparty updated");
      setSelected(null);
      setSearch("");
      await fetchLatest();
      window.dispatchEvent(new CustomEvent("sushizen:requests:badge:refresh"));
    } catch (e: any) {
      setOpMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setOpLoading(false);
    }
  };

  const doPrepareExport = async () => {
    setPrepLoading(true);
    setPrepErr("");
    setConfirmErr("");
    setConfirmOk(null);

    try {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");
      if (!isHQOrAdmin(myRole)) throw new Error("Export is HQ/ADMIN only.");

      const payload: ExportPrepareReq = {
        city: exportCity,
        branch_code: exportBranch,
        month: exportMonth.trim(),
        mode: exportMode,
        approver_name: nm,
        pin: p,
      };

      const r = await apiPost<ExportPrepareResp>("/api/admin/export/month/prepare", payload);
      if (!r?.ok) throw new Error("Prepare failed.");
      setPrep(r);
      setConfirmChecked(false);
      startTokenTimer(Number(r.expires_in_sec || 300));
    } catch (e: any) {
      setPrep(null);
      setPrepErr(e?.message || String(e));
      setTokenRemain(null);
      clearTokenTimer();
    } finally {
      setPrepLoading(false);
    }
  };

  const doConfirmExport = async () => {
    setConfirmLoading(true);
    setConfirmErr("");
    setConfirmOk(null);

    try {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");
      if (!isHQOrAdmin(myRole)) throw new Error("Export is HQ/ADMIN only.");
      if (!prep?.confirm_token) throw new Error("Prepare first (missing confirm_token).");
      if (!confirmChecked) throw new Error("Please check the confirmation box before exporting.");
      if (tokenRemain !== null && tokenRemain <= 0) throw new Error("Token expired. Please Prepare again.");

      const payload: ExportConfirmReq = {
        confirm_token: prep.confirm_token,
        approver_name: nm,
        pin: p,
      };

      const r = await apiPost<ExportConfirmResp>("/api/admin/export/month/confirm", payload);
      setConfirmOk(r);
    } catch (e: any) {
      setConfirmErr(e?.message || String(e));
    } finally {
      setConfirmLoading(false);
    }
  };

  const normalizeAttendanceSyncMessage = (raw: string, fallback: string) => {
    const text = String(raw || "").trim();
    const lower = text.toLowerCase();
    if (!text) return fallback;
    if (lower.includes("invalid pin")) return "PINが正しくありません。";
    if (lower.includes("forbidden") || lower.includes("permission")) return "同期権限がありません（HQ/ADMIN のPIN確認が必要です）。";
    if (lower.includes("attendance drive source not found")) return "同期元設定が見つかりません。";
    if (lower.includes("no attendance files found")) return "Driveフォルダに対象ファイルがありません。";
    if (lower.includes("already imported") || lower.includes("duplicate")) return "最新ファイルは既に取り込み済みです。";
    return text;
  };

  const syncAttendanceNow = async () => {
    if (!approverName.trim() || !pin.trim()) {
      setAttendanceSyncMessage("同期には approver name と PIN が必要です。");
      return;
    }
    setAttendanceSyncing(true);
    setAttendanceSyncMessage("");
    try {
      const res = await apiPost<AttendanceDriveSyncResp>("/api/admin/attendance/drive/sync", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city_hint: city,
      });
      const rawMsg = String(res?.message || "").trim();
      if (res?.duplicate) {
        setAttendanceSyncMessage("最新ファイルは既に取り込み済みです。");
      } else if (rawMsg) {
        setAttendanceSyncMessage(normalizeAttendanceSyncMessage(rawMsg, "Bayzat同期が完了しました。"));
      } else {
        setAttendanceSyncMessage("Bayzat同期が完了しました。");
      }
    } catch (e: any) {
      setAttendanceSyncMessage(normalizeAttendanceSyncMessage(String(e?.message || e || ""), "Bayzat同期に失敗しました。"));
    } finally {
      setAttendanceSyncing(false);
    }
  };

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    return `${data.start_date} → ${data.end_date}`;
  }, [data]);

  const bucketsOrdered = useMemo(() => {
    if (!data) return [] as Array<[string, AdminItem[]]>;

    const q = (search || "").trim().toLowerCase();

    const match = (it: AdminItem) => {
      if (!q) return true;
      const id = String(it.id || "").toLowerCase();
      const staff = String(it.staff_name || "").toLowerCase();
      const rt = String(it.request_type || "").toLowerCase();
      const br = String(it.branch || "").toLowerCase();
      const urg = String(it.urgency_status || "").toLowerCase();
      return id.includes(q) || staff.includes(q) || rt.includes(q) || br.includes(q) || urg.includes(q);
    };

    const map = new Map<string, AdminItem[]>();
    (Object.entries(data.buckets) as Array<[string, AdminItem[]]>).forEach(([k, arr]) => {
      map.set(k, (arr || []).filter(match));
    });

    return BUCKET_ORDER.map((k) => [k, map.get(k) || []] as [string, AdminItem[]]);
  }, [data, search]);

  const filteredTotal = useMemo(() => {
    return bucketsOrdered.reduce((acc, [, items]) => acc + (items?.length || 0), 0);
  }, [bucketsOrdered]);

  useEffect(() => {
    if (!data) {
      setSelected(null);
      return;
    }
    const allItems = BUCKET_ORDER.flatMap((key) => data.buckets?.[key] || []);
    if (!allItems.length) {
      setSelected(null);
      return;
    }
    if (!selected?.id) {
      return;
    }
    const refreshed = allItems.find((item) => item.id === selected.id) || null;
    setSelected(refreshed);
  }, [data, selected?.id]);

  const showExport = useMemo(() => isHQOrAdmin(myRole), [myRole]);
  const bucketMap = useMemo(
    () => new Map<string, AdminItem[]>(bucketsOrdered.map(([key, items]) => [key, items])),
    [bucketsOrdered]
  );
  const redItems = bucketMap.get("red_open") || [];
  const swapItems = bucketMap.get("swap_pending_counterparty") || [];
  const managerItems = bucketMap.get("pending_manager") || [];
  const hqItems = bucketMap.get("pending_hq") || [];
  const weekRangeValue = useMemo(
    () => ({
      from: startDate || "",
      to: startDate ? addDaysIso(startDate, 6) : "",
    }),
    [startDate]
  );
  const toggleSelectedRequest = (item: AdminItem) => {
    const isSame = selected?.id === item.id;
    if (isSame) {
      setSelected(null);
      return;
    }
    hydrateApproverFromAuth(approverName, pin, setApproverName, setPin);
    setSelected(item);
  };

  return (
    !ready ? (
      <div className="text-sm text-neutral-500">Loading admin dashboard...</div>
    ) : !allowed ? (
      <div className="text-sm text-red-300">Admin dashboard is available only to authorized admin roles.</div>
    ) : (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className={T_PAGE_TITLE}>Admin Dashboard</h1>
            <span className={BADGE_INFO}>
              <Building2 className="h-3 w-3" />
              {(data?.city || city).toUpperCase()}
            </span>
          </div>
          <p className={T_BODY}>
            Range: <span className="text-zinc-300">{rangeLabel || "—"}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin/analytics" className={SMALL_BUTTON}>
            <BarChart3 className="mr-1 h-3.5 w-3.5" /> Analytics
          </Link>
          <Link href="/admin/absences" className={SMALL_BUTTON}>
            <UserX className="mr-1 h-3.5 w-3.5" /> Absences
          </Link>
          <Link href="/admin/staff" className={SMALL_BUTTON}>
            <Users className="mr-1 h-3.5 w-3.5" /> Staff Master
          </Link>
          {canOpenRoleManagement ? (
            <Link href="/admin/staff/roles" className={SMALL_BUTTON}>
              <Shield className="mr-1 h-3.5 w-3.5" /> Role Management
            </Link>
          ) : null}
          <Link href="/admin/draft" className={SMALL_BUTTON}>
            <PenLine className="mr-1 h-3.5 w-3.5" /> Draft
          </Link>
          <Link href="/admin/manual-shift" className={SMALL_BUTTON}>
            <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Manual Shift
          </Link>
          <Link href="/admin/disposal" className={SMALL_BUTTON}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Disposal Report
          </Link>
          <Link href="/admin/backup" className={SMALL_BUTTON}>
            <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Backup Report
          </Link>
          {canOpenInventory ? (
            <Link href="/admin/inventory" className={`${SMALL_BUTTON} border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`}>
              <Package className="mr-1 h-3.5 w-3.5" /> Inventory
            </Link>
          ) : null}
          {canOpenPriceCheck ? (
            <Link
              href="/admin/price-check"
              className={`${SMALL_BUTTON} relative ${priceCheckFlagged ? "border-red-500/40 text-red-300 hover:bg-red-500/10" : ""}`}
            >
              <Tag className="mr-1 h-3.5 w-3.5" /> Price Check
              {priceCheckFlagged ? (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {priceCheckFlagged > 9 ? "9+" : priceCheckFlagged}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Price Check alert card */}
      {canOpenPriceCheck && priceCheckFlagged != null && priceCheckFlagged > 0 ? (
        <Link href="/admin/price-check" className="block">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 px-4 py-3 transition-all hover:border-red-500/50 hover:bg-red-950/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <div className="text-sm font-semibold text-red-200">
                    Price Check — {priceCheckFlagged} 件の価格変更を検出
                  </div>
                  <div className="text-xs text-red-400/70">
                    StoreHubの販売価格が基準価格から変更されています。確認してください。
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-xs text-red-400">詳細を見る →</span>
            </div>
          </div>
        </Link>
      ) : null}

      <div className={`${TAB_CONTAINER} w-full max-w-full overflow-x-auto`} role="tablist" aria-label="Admin dashboard sections">
        <div className="flex w-max max-w-none flex-nowrap items-center gap-1 pb-0.5">
          {ADMIN_DASH_TABS.map((tab) => (
            <button
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={dashView === tab.view}
              className={`shrink-0 whitespace-nowrap ${dashView === tab.view ? TAB_ACTIVE : TAB_INACTIVE}`}
              onClick={() => setDashTab(tab.view)}
            >
              <span className="mr-1" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {dashView === "lowRatings" ? (
        <LowRatingsAdminPanel />
      ) : dashView === "ratingEntry" ? (
        <div className="space-y-4">
          <div className={`${TAB_CONTAINER} w-full max-w-full overflow-x-auto`} role="tablist" aria-label="Ratings Input city">
            <div className="flex min-w-min flex-wrap items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={ratingEntrySub === "dubai"}
                className={`shrink-0 whitespace-nowrap ${ratingEntrySub === "dubai" ? TAB_ACTIVE : TAB_INACTIVE}`}
                onClick={() => setRatingEntrySub("dubai")}
              >
                Dubai
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ratingEntrySub === "manila"}
                className={`shrink-0 whitespace-nowrap ${ratingEntrySub === "manila" ? TAB_ACTIVE : TAB_INACTIVE}`}
                onClick={() => setRatingEntrySub("manila")}
              >
                Manila
              </button>
            </div>
          </div>
          <RatingEntryTab city={ratingEntrySub} />
        </div>
      ) : dashView === "salesDataInput" ? (
        <AdminSalesDataInputTab />
      ) : dashView === "cashierEvalInput" ? (
        <AdminCashierEvalInputTab />
      ) : dashView === "dailyInventory" ? (
        <AdminDailyInventoryTab />
      ) : dashView === "cancellationInput" ? (
        <AdminCancellationInputTab />
      ) : dashView === "dubaiCancellationInput" ? (
        <AdminDubaiCancellationInputTab />
      ) : dashView === "orderEntry" ? (
        <div className="space-y-4">
          <div className={`${TAB_CONTAINER} w-full max-w-full overflow-x-auto`} role="tablist" aria-label="Number of Orders Input region">
            <div className="flex min-w-min flex-wrap items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={orderEntrySub === "dubai"}
                className={`shrink-0 whitespace-nowrap ${orderEntrySub === "dubai" ? TAB_ACTIVE : TAB_INACTIVE}`}
                onClick={() => setOrderEntrySub("dubai")}
              >
                Dubai
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={orderEntrySub === "manila"}
                className={`shrink-0 whitespace-nowrap ${orderEntrySub === "manila" ? TAB_ACTIVE : TAB_INACTIVE}`}
                onClick={() => setOrderEntrySub("manila")}
              >
                Manila (Offline)
              </button>
            </div>
          </div>
          {orderEntrySub === "dubai" ? <OrderEntryTab /> : <ManilaOfflineOrderEntryTab />}
        </div>
      ) : (
        <>
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px]">
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <select className={SELECT_CLASS} value={city} onChange={(e) => setCity(e.target.value as BranchCity)}>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div className="min-w-[200px] flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Week Range</label>
            <DateRangePicker
              className="w-full"
              value={weekRangeValue}
              onChange={(range) => setStartDate(mondayOfIso(range.from))}
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="staff / req_id / type / branch / urgency"
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button className={SECONDARY_BUTTON} onClick={fetchByDate} disabled={loading} type="button">
              <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
            </button>
            <button className={PRIMARY_BUTTON} onClick={fetchLatest} disabled={loading} type="button">
              Latest Week
            </button>
            <button
              className={SECONDARY_BUTTON}
              onClick={syncAttendanceNow}
              disabled={attendanceSyncing || !approverName.trim() || !pin.trim()}
              type="button"
              title={!pin.trim() ? "PIN required" : "Sync latest Bayzat attendance data"}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {attendanceSyncing ? "Syncing..." : "Sync Latest Bayzat"}
            </button>
          </div>
        </div>

        {(search.trim() || loading || attendanceSyncMessage) ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {search.trim() ? (
              <span className={T_CAPTION}>
                Search: <span className="text-zinc-200">{search.trim()}</span> • Matches:{" "}
                <span className="text-zinc-200">{filteredTotal}</span>
              </span>
            ) : null}
            {loading ? <span className={BADGE_INFO}>Loading...</span> : null}
            {attendanceSyncMessage ? <span className={BADGE_INFO}>{attendanceSyncMessage}</span> : null}
          </div>
        ) : null}

        {error ? <div className="mt-3 whitespace-pre-wrap text-sm text-red-300">{error}</div> : null}
      </div>

      <div className={`${HIGHLIGHT_CARD} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-400" />
            <div>
              <p className={T_CARD_TITLE}>
                Export <span className="text-violet-400">(HQ only)</span>
              </p>
              <p className={T_CAPTION}>2-step export to shared Google Sheets (Monthly Timetable + Headcount).</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={T_CAPTION}>
              Role: <span className="text-white">{myRole || "—"}</span>
            </span>
            {showExport ? (
              <button className={PRIMARY_BUTTON} type="button" onClick={doPrepareExport} disabled={prepLoading || !approverName.trim() || !pin.trim()}>
                <Download className="mr-1.5 h-4 w-4" /> {prepLoading ? "Preparing..." : "Export"}
              </button>
            ) : (
              <p className={T_CAPTION}>Enter your PIN so role can be verified.</p>
            )}
          </div>
        </div>

        {showExport ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>City</label>
                <select className={SELECT_CLASS} value={exportCity} onChange={(e) => setExportCity(e.target.value as BranchCity)}>
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
                <select
                  className={SELECT_CLASS}
                  value={exportBranch}
                  onChange={(e) => {
                    setExportBranch(e.target.value as BranchCode);
                    resetExportState();
                  }}
                >
                  {BRANCHES[exportCity].map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Month</label>
                <MonthPicker
                  value={exportMonth}
                  onChange={(value) => {
                    setExportMonth(value);
                    resetExportState();
                  }}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Mode</label>
                <select
                  className={SELECT_CLASS}
                  value={exportMode}
                  onChange={(e) => {
                    setExportMode(e.target.value as ExportMode);
                    resetExportState();
                  }}
                >
                  <option value="FINAL">FINAL</option>
                  <option value="DRAFT">DRAFT</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={doPrepareExport}
                  disabled={prepLoading || !approverName.trim() || !pin.trim()}
                  className={SECONDARY_BUTTON}
                  title={!pin.trim() ? "Enter PIN first" : "Prepare export (preview + token)"}
                >
                  {prepLoading ? "Preparing..." : "Prepare"}
                </button>
              </div>
            </div>

            {prepErr ? <div className="mt-3 whitespace-pre-wrap text-sm text-red-300">{prepErr}</div> : null}

            {prep?.ok ? (
              <div className={`${STATUS_CARD} mt-4 p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={T_CARD_TITLE}>Preview</div>
                    <div className={`${T_CAPTION} mt-1`}>
                      {prep.preview.city.toUpperCase()} • {prep.preview.branch_code} • {prep.preview.month} • {prep.preview.mode}
                    </div>
                  </div>
                  <div className={T_CAPTION}>
                    Token expires in: <span className="text-neutral-200">{tokenRemain ?? prep.expires_in_sec}</span>s
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={KPI_CARD}>
                    <p className={KPI_LABEL}>Days</p>
                    <p className={KPI_VALUE}>{prep.preview.days}</p>
                  </div>
                  <div className={KPI_CARD}>
                    <p className={KPI_LABEL}>Base Shift Rows</p>
                    <p className={KPI_VALUE}>{prep.preview.shift_rows}</p>
                  </div>
                  <div className={KPI_CARD}>
                    <p className={KPI_LABEL}>Staff Count</p>
                    <p className={KPI_VALUE}>{prep.preview.staff_count}</p>
                  </div>
                  <div className={KPI_CARD}>
                    <p className={KPI_LABEL}>Hour Range</p>
                    <p className={KPI_VALUE}>
                      {prep.preview.hour_range.start}-{prep.preview.hour_range.end}
                    </p>
                  </div>
                </div>

                <div className={`${T_CAPTION} mt-3`}>
                  Date range: {prep.preview.date_from} → {prep.preview.date_to_exclusive} (to=exclusive)
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-neutral-200">
                    <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                    I understand this will overwrite (or create) monthly tabs in the shared export spreadsheet.
                  </label>

                  <button
                    type="button"
                    onClick={doConfirmExport}
                    disabled={confirmLoading || !confirmChecked || (tokenRemain !== null && tokenRemain <= 0)}
                    className={PRIMARY_BUTTON}
                    title={!confirmChecked ? "Check the confirmation box" : "Confirm export"}
                  >
                    {confirmLoading ? "Exporting..." : "Confirm Export"}
                  </button>

                  <button type="button" onClick={resetExportState} className={SECONDARY_BUTTON}>
                    Reset
                  </button>
                </div>

                {confirmErr ? <div className="mt-3 whitespace-pre-wrap text-sm text-red-300">{confirmErr}</div> : null}

                {confirmOk?.ok ? (
                  <div className={`${GLASS_CARD} mt-3 p-3`}>
                    <div className="text-sm font-semibold text-emerald-200">Export done</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {confirmOk.sheet_url ? (
                        <a className="underline hover:text-white" href={confirmOk.sheet_url} target="_blank" rel="noreferrer">
                          Open Sheet
                        </a>
                      ) : (
                        <>Sheet URL not returned</>
                      )}
                    </div>
                    {confirmOk.timetable_url || confirmOk.headcount_url ? (
                      <div className="mt-2 space-y-1 text-xs text-neutral-500">
                        {confirmOk.timetable_url ? (
                          <div>
                            Timetable:{" "}
                            <a className="underline hover:text-white" href={confirmOk.timetable_url} target="_blank" rel="noreferrer">
                              open
                            </a>
                          </div>
                        ) : null}
                        {confirmOk.headcount_url ? (
                          <div>
                            Headcount:{" "}
                            <a className="underline hover:text-white" href={confirmOk.headcount_url} target="_blank" rel="noreferrer">
                              open
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {confirmOk.tab_timetable || confirmOk.tab_headcount ? (
                      <div className="mt-2 text-xs text-neutral-500">
                        Tabs: <span className="text-neutral-200">{confirmOk.tab_timetable || "—"}</span>,{" "}
                        <span className="text-neutral-200">{confirmOk.tab_headcount || "—"}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {data ? (
        <>
          {search.trim() && filteredTotal === 0 ? <div className="text-sm text-neutral-500">No matching requests.</div> : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {([
              ["red_open", redItems],
              ["swap_pending_counterparty", swapItems],
              ["pending_manager", managerItems],
              ["pending_hq", hqItems],
            ] as Array<[keyof Overview["buckets"], AdminItem[]]>).map(([key, items]) => {
              const meta = bucketMeta(key);
              const Icon = meta.icon;
              return (
                <div key={key} className={GLASS_CARD}>
                  <div className="flex items-center gap-2 border-b border-white/5 p-4">
                    <Icon className={`h-4 w-4 ${meta.headerIconClass}`} />
                    <h2 className={T_SECTION}>{meta.title}</h2>
                    {meta.subtitle ? <span className={T_CAPTION}>{meta.subtitle}</span> : null}
                    {items.length > 0 ? (
                      <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
                        {items.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    {items.length === 0 ? (
                      <p className={`${T_CAPTION} flex items-center gap-2`}>
                        <CheckCheck className={`h-4 w-4 ${meta.emptyIconClass}`} /> No items
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {items.map((item) => (
                          <RequestCard
                            key={item.id}
                            item={item}
                            isExpanded={selected?.id === item.id}
                            onToggle={() => toggleSelectedRequest(item)}
                            role={role}
                            setRole={setRole}
                            pin={pin}
                            setPin={setPin}
                            note={note}
                            setNote={setNote}
                            opLoading={opLoading}
                            opMsg={selected?.id === item.id ? opMsg : ""}
                            canUseHQRole={isHQOrAdmin(myRole)}
                            onApprove={() => void runIntentAndConfirm(item, "APPROVE")}
                            onReject={() => void runIntentAndConfirm(item, "REJECT")}
                            onNeedInfo={() => void runIntentAndConfirm(item, "NEED_INFO")}
                            onCounterpartyApprove={() => void runCounterparty(item, "APPROVED")}
                            onCounterpartyReject={() => void runCounterparty(item, "REJECTED")}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-sm text-neutral-500">No data.</div>
      )}
        </>
      )}

    </motion.div>
    )
  );
}