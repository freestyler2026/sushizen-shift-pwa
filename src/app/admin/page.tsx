// src/app/admin/page.tsx
"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CheckCheck,
  ChevronRight,
  Clock,
  Download,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Shield,
  UserX,
  Users,
} from "lucide-react";
import { BRANCHES, type City as BranchCity, type BranchCode } from "@/lib/branches";
import { canAccessAdminNav, canAccessInventoryWorkspace, canAccessRoleManagement, getAuth, getAuthHeaders, refreshAuthFromApi, type Auth } from "@/lib/auth";
import DateRangePicker from "@/components/DateRangePicker";
import MonthPicker from "@/components/MonthPicker";
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
} from "@/lib/ui-tokens";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

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
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
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
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
    }
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
  selected,
  onSelect,
}: {
  item: AdminItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const badge = urgencyBadge(item.urgency_status);

  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all duration-150 ${
        selected
          ? "border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/20"
          : "border-white/8 bg-white/4 hover:bg-white/8"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">
          {item.staff_name} / <span className="text-zinc-400">{item.request_type}</span>
        </p>
        <p className={T_CAPTION}>
          {item.work_date} · M:{item.manager_status} · HQ:{item.hq_status}
        </p>
      </div>
      <div className="ml-3 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        <button type="button" className={SMALL_BUTTON} onClick={onSelect} aria-label={`Open ${item.id}`}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function isHQOrAdmin(role: string) {
  const r = String(role || "").toUpperCase();
  return r === "HQ" || r === "ADMIN";
}

// --------------------
// component
// --------------------
export default function AdminPage() {
  const router = useRouter();
  const initialAuth = useMemo(() => getAuth(), []);
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
  const [action, setAction] = useState<"APPROVE" | "REJECT" | "NEED_INFO">("APPROVE");
  const [note, setNote] = useState("OK");
  const [approverName, setApproverName] = useState(initialAuth?.staffName || "");
  const [pin, setPin] = useState(initialAuth?.pin || "");
  const [opMsg, setOpMsg] = useState("");
  const [opLoading, setOpLoading] = useState(false);

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
    setSelected(null);
    setSearch("");
    void fetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, city, ready, sessionAuth?.accessToken]);

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
    if (isHQOrAdmin(myRole) && role !== "HQ") {
      setRole("HQ");
      return;
    }
    if (!isHQOrAdmin(myRole) && role !== "MANAGER") {
      setRole("MANAGER");
    }
  }, [myRole, role]);

  useEffect(() => {
    const first = BRANCHES[exportCity][0]?.code;
    if (first && exportBranch !== first) setExportBranch(first);
    resetExportState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportCity]);

  const runIntentAndConfirm = async () => {
    if (!selected) return;
    if (!window.confirm(`Are you sure you want to ${String(action || "").toLowerCase().replace("_", " ")} this request?`)) return;

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

      const confirmRole: "MANAGER" | "HQ" = isHQOrAdmin(myRole) ? "HQ" : "MANAGER";

      await apiPost(
        `/api/shift_change/intent${qs({
          req_id: selected.id,
          role: confirmRole,
          action,
        })}`
      );

      const confirmPath = confirmRole === "MANAGER" ? "/api/shift_change/confirm_manager" : "/api/shift_change/confirm_hq";

      await apiPost(
        `${confirmPath}${qs({
          req_id: selected.id,
          action: action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "NEED_INFO",
          note,
          approver_name: nm,
          pin: p,
        })}`
      );

      setOpMsg("✅ Done");
      setSelected(null);
      setSearch("");
      await fetchLatest();
    } catch (e: any) {
      setOpMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setOpLoading(false);
    }
  };

  const runCounterparty = async (cpAction: "APPROVED" | "REJECTED") => {
    if (!selected) return;
    if (!window.confirm(`Are you sure you want to mark the counterparty as ${cpAction.toLowerCase()}?`)) return;

    setOpLoading(true);
    setOpMsg("");

    try {
      const cp = (selected.counterparty_name || "").trim();
      if (!cp) throw new Error("counterparty_name missing");
      const p = pin.trim();
      if (!p) throw new Error("PIN required (counterparty)");

      await apiPost(
        `/api/shift_change/counterparty/respond${qs({
          req_id: selected.id,
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
  const decisionRoleLabel = isHQOrAdmin(myRole) ? "HQ" : "Manager";
  const primaryActionLabel =
    action === "APPROVE"
      ? `Approve Request as ${decisionRoleLabel}`
      : action === "REJECT"
        ? `Reject Request as ${decisionRoleLabel}`
        : `Send Back for More Info as ${decisionRoleLabel}`;
  const primaryActionButtonClass =
    action === "APPROVE"
      ? "border-emerald-700 bg-emerald-950/40 hover:bg-emerald-900/40"
      : action === "REJECT"
        ? "border-rose-700 bg-rose-950/40 hover:bg-rose-900/40"
        : "border-amber-700 bg-amber-950/40 hover:bg-amber-900/40";
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
          {canOpenInventory ? (
            <Link href="/admin/inventory" className={`${SMALL_BUTTON} border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`}>
              <Package className="mr-1 h-3.5 w-3.5" /> Inventory
            </Link>
          ) : null}
        </div>
      </div>

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
          </div>
        </div>

        {(search.trim() || loading) ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {search.trim() ? (
              <span className={T_CAPTION}>
                Search: <span className="text-zinc-200">{search.trim()}</span> • Matches:{" "}
                <span className="text-zinc-200">{filteredTotal}</span>
              </span>
            ) : null}
            {loading ? <span className={BADGE_INFO}>Loading...</span> : null}
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
                            selected={selected?.id === item.id}
                            onSelect={() => setSelected(item)}
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

      {selected ? (
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className={T_SECTION}>Selected Request</h2>
              <p className={T_CAPTION}>
                {selected.staff_name} / {selected.request_type} / {selected.work_date}
              </p>
            </div>
            <span className={BADGE_INFO}>{selected.id}</span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className={SELECT_CLASS}>
                {!isHQOrAdmin(myRole) ? <option value="MANAGER">MANAGER</option> : null}
                <option value="HQ" disabled={!isHQOrAdmin(myRole)}>
                  HQ
                </option>
              </select>
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value as any)} className={SELECT_CLASS}>
                <option value="APPROVE">APPROVE</option>
                <option value="REJECT">REJECT</option>
                <option value="NEED_INFO">NEED_INFO</option>
              </select>
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
              <input placeholder="PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>

          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Note</label>
            <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
          </div>

          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input placeholder="Approver Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} className={INPUT_CLASS} />
          </div>

          <div className="space-y-3">
            <div className={`${STATUS_CARD} p-4`}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Primary Decision</div>
              <div className="mb-3 text-xs text-neutral-500">
                This button uses the selected action above and applies the main decision to this request.
              </div>
              <button
                onClick={runIntentAndConfirm}
                className={`rounded-xl border px-4 py-2 text-sm text-white disabled:opacity-60 ${primaryActionButtonClass}`}
                disabled={opLoading}
                type="button"
              >
                {opLoading ? "Processing..." : primaryActionLabel}
              </button>
            </div>

            {selected.request_type === "swap" ? (
              <div className={`${STATUS_CARD} p-4`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Swap Counterparty Response</div>
                <div className="mb-3 text-xs text-neutral-500">
                  Use these only to record the other staff member&apos;s reply to the swap request.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runCounterparty("APPROVED")}
                    className="rounded-xl border border-sky-700 bg-sky-950/30 px-4 py-2 text-sm text-white hover:bg-sky-900/30 disabled:opacity-60"
                    disabled={opLoading}
                    type="button"
                  >
                    Record Counterparty Approval
                  </button>
                  <button
                    onClick={() => runCounterparty("REJECTED")}
                    className="rounded-xl border border-rose-700 bg-rose-950/30 px-4 py-2 text-sm text-white hover:bg-rose-900/30 disabled:opacity-60"
                    disabled={opLoading}
                    type="button"
                  >
                    Record Counterparty Rejection
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {opMsg ? <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{opMsg}</div> : null}
        </div>
      ) : null}
    </motion.div>
    )
  );
}