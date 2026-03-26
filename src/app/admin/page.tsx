// src/app/admin/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRANCHES, type City as BranchCity, type BranchCode } from "@/lib/branches";
import { getAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
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

async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

function isHQOrAdmin(role: string) {
  const r = String(role || "").toUpperCase();
  return r === "HQ" || r === "ADMIN";
}

// --------------------
// component
// --------------------
export default function AdminPage() {
  const didInit = useRef(false);
  const auth = getAuth();

  const [city, setCity] = useState<BranchCity>((auth?.city as BranchCity) || "dubai");

  const [startDate, setStartDate] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<AdminItem | null>(null);

  const [role, setRole] = useState<"MANAGER" | "HQ">("MANAGER");
  const [action, setAction] = useState<"APPROVE" | "REJECT" | "NEED_INFO">("APPROVE");
  const [note, setNote] = useState("OK");
  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [opMsg, setOpMsg] = useState("");
  const [opLoading, setOpLoading] = useState(false);

  // ---- HQ Export state ----
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >(
    auth?.role || ""
  );
  const [exportCity, setExportCity] = useState<BranchCity>((auth?.city as BranchCity) || "dubai");
  const [exportBranch, setExportBranch] = useState<BranchCode>(
    BRANCHES[(auth?.city as BranchCity) || "dubai"][0]?.code || "BB"
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
      const d = await apiGet<Overview>(`/api/admin/overview${qs({ city })}`);
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
      const d = await apiGet<Overview>(`/api/admin/overview${qs({ city, start_date: startDate })}`);
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
    if (didInit.current) return;
    didInit.current = true;

    try {
      const nm = localStorage.getItem("sushizen_admin_name") || "";
      if (nm && !approverName) setApproverName(nm);
    } catch {}

    fetchLatest();

    return () => {
      clearTokenTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!didInit.current) return;
    setSelected(null);
    setSearch("");
    fetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

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
    const first = BRANCHES[exportCity][0]?.code;
    if (first && exportBranch !== first) setExportBranch(first);
    resetExportState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportCity]);

  const runIntentAndConfirm = async () => {
    if (!selected) return;

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

      await apiPost(
        `/api/shift_change/intent${qs({
          req_id: selected.id,
          role,
          action,
        })}`
      );

      const confirmPath = role === "MANAGER" ? "/api/shift_change/confirm_manager" : "/api/shift_change/confirm_hq";

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
      await fetchLatest();
    } catch (e: any) {
      setOpMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setOpLoading(false);
    }
  };

  const runCounterparty = async (cpAction: "APPROVED" | "REJECTED") => {
    if (!selected) return;

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
          action: cpAction,
          note: cpAction === "APPROVED" ? "I agree" : "I decline",
          pin: p,
        })}`
      );

      setOpMsg("✅ Counterparty updated");
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

  const showExport = useMemo(() => isHQOrAdmin(myRole), [myRole]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Admin Dashboard ({(data?.city || city).toUpperCase()})</div>
            <div className="mt-1 text-xs text-neutral-500">Range: {rangeLabel || "—"}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/analytics"
              className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
            >
              Analytics
            </Link>
            <Link
              href="/admin/absences"
              className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
            >
              Absences
            </Link>
            <Link
              href="/admin/staff"
              className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
            >
              Staff Master
            </Link>
            <Link
              href="/admin/draft"
              className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white"
            >
              Draft
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div>
            <div className="mb-1 text-xs text-neutral-400">City</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as BranchCity)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Week start (Mon)</div>
            <input
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="staff / req_id / type / branch / urgency"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchByDate}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              disabled={loading}
              type="button"
            >
              Refresh
            </button>
            <button
              onClick={fetchLatest}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              disabled={loading}
              type="button"
            >
              Latest week
            </button>
          </div>

          <div className="flex items-end">
            <div className="w-full text-sm text-neutral-400">{loading ? "Loading..." : null}</div>
          </div>
        </div>

        {search.trim() ? (
          <div className="mt-3 text-xs text-neutral-500">
            Search: <span className="text-neutral-200">{search.trim()}</span> • Matches:{" "}
            <span className="text-neutral-200">{filteredTotal}</span>
          </div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-red-300 whitespace-pre-wrap">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Export (HQ only)</div>
            <div className="mt-1 text-xs text-neutral-500">
              2-step export to shared Google Sheets (Monthly Timetable + Headcount).
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            Role: <span className="text-neutral-200">{myRole || "—"}</span>
          </div>
        </div>

        {!showExport ? (
          <div className="mt-3 text-sm text-neutral-500">
            Export is available for <span className="text-neutral-200">HQ/ADMIN</span> only. (Enter your PIN so role can be verified.)
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div>
                <div className="mb-1 text-xs text-neutral-400">City</div>
                <select
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  value={exportCity}
                  onChange={(e) => setExportCity(e.target.value as BranchCity)}
                >
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Branch</div>
                <select
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
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
                <div className="mb-1 text-xs text-neutral-400">Month</div>
                <input
                  type="month"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  value={exportMonth}
                  onChange={(e) => {
                    setExportMonth(e.target.value);
                    resetExportState();
                  }}
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Mode</div>
                <select
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
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

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={doPrepareExport}
                  disabled={prepLoading || !approverName.trim() || !pin.trim()}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                  title={!pin.trim() ? "Enter PIN first" : "Prepare export (preview + token)"}
                >
                  {prepLoading ? "Preparing..." : "Prepare"}
                </button>
              </div>
            </div>

            {prepErr ? <div className="mt-3 text-sm text-red-300 whitespace-pre-wrap">{prepErr}</div> : null}

            {prep?.ok ? (
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Preview</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {prep.preview.city.toUpperCase()} • {prep.preview.branch_code} • {prep.preview.month} • {prep.preview.mode}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400">
                    Token expires in: <span className="text-neutral-200">{tokenRemain ?? prep.expires_in_sec}</span>s
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4 text-sm">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-xs text-neutral-500">Days</div>
                    <div className="text-neutral-200 font-semibold">{prep.preview.days}</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-xs text-neutral-500">Base shift rows</div>
                    <div className="text-neutral-200 font-semibold">{prep.preview.shift_rows}</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-xs text-neutral-500">Staff count</div>
                    <div className="text-neutral-200 font-semibold">{prep.preview.staff_count}</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-xs text-neutral-500">Hour range</div>
                    <div className="text-neutral-200 font-semibold">
                      {prep.preview.hour_range.start}–{prep.preview.hour_range.end}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-neutral-500">
                  Date range: {prep.preview.date_from} → {prep.preview.date_to_exclusive} (to=exclusive)
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-200">
                    <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                    I understand this will overwrite (or create) monthly tabs in the shared export spreadsheet.
                  </label>

                  <button
                    type="button"
                    onClick={doConfirmExport}
                    disabled={confirmLoading || !confirmChecked || (tokenRemain !== null && tokenRemain <= 0)}
                    className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
                    title={!confirmChecked ? "Check the confirmation box" : "Confirm export"}
                  >
                    {confirmLoading ? "Exporting..." : "Confirm Export"}
                  </button>

                  <button
                    type="button"
                    onClick={resetExportState}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40"
                  >
                    Reset
                  </button>
                </div>

                {confirmErr ? <div className="mt-3 text-sm text-red-300 whitespace-pre-wrap">{confirmErr}</div> : null}

                {confirmOk?.ok ? (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-sm font-semibold text-emerald-200">✅ Export done</div>

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
                      <div className="mt-2 text-xs text-neutral-500 space-y-1">
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
        )}
      </div>

      {data ? (
        <>
          {search.trim() && filteredTotal === 0 ? <div className="text-sm text-neutral-500">No matching requests.</div> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {bucketsOrdered.map(([key, items]) => (
              <div key={key} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
                <div className="mb-2 text-sm font-semibold">{bucketTitle(key)}</div>

                {items.length === 0 ? (
                  <div className="text-sm text-neutral-500">No items</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it) => {
                      const b = urgencyBadge(it.urgency_status);

                      return (
                        <button
                          key={it.id}
                          className={[
                            "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                            selected?.id === it.id
                              ? "border-amber-500 bg-amber-950/20 text-amber-100"
                              : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40",
                          ].join(" ")}
                          onClick={() => setSelected(it)}
                          title={it.id}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {it.staff_name} / {it.request_type}
                              </div>
                              <div className="mt-1 text-xs text-neutral-500">
                                {it.work_date} • M:{it.manager_status} • HQ:{it.hq_status}
                              </div>
                            </div>

                            <span className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] ${b.cls}`}>{b.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-neutral-500">No data.</div>
      )}

      {selected ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-2 text-sm font-semibold">Selected: {selected.staff_name}</div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <option value="MANAGER">MANAGER</option>
                <option value="HQ">HQ</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Action</div>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <option value="APPROVE">APPROVE</option>
                <option value="REJECT">REJECT</option>
                <option value="NEED_INFO">NEED_INFO</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">PIN</div>
              <input
                placeholder="PIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-neutral-400">Note</div>
            <input
              placeholder="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
            <input
              placeholder="Approver Name"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={runIntentAndConfirm}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              disabled={opLoading}
              type="button"
            >
              {opLoading ? "Working..." : "Run intent + confirm"}
            </button>

            {selected.request_type === "swap" ? (
              <>
                <button
                  onClick={() => runCounterparty("APPROVED")}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                  disabled={opLoading}
                  type="button"
                >
                  Counterparty APPROVE
                </button>
                <button
                  onClick={() => runCounterparty("REJECTED")}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                  disabled={opLoading}
                  type="button"
                >
                  Counterparty REJECT
                </button>
              </>
            ) : null}
          </div>

          {opMsg ? <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{opMsg}</div> : null}
        </div>
      ) : null}
    </div>
  );
}