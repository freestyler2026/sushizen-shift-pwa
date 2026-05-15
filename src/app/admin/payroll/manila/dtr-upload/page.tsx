"use client";

import {
  AlertCircle, CheckCircle2, ChevronLeft, ClipboardList,
  FileSpreadsheet, Info, Loader2, RefreshCw, Upload, X,
  Database, Eye, UserPlus, AlertTriangle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = {
  id: number;
  period_label: string;
  period_half: number;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: string;
};

type SyncPreviewRow = {
  staff_name: string;
  work_date: string;
  day_type: string;
  is_worked: boolean;
  is_scheduled_rest_day: boolean;
  actual_time_in: string | null;
  actual_time_out: string | null;
  late_minutes: number;
  absent_without_pay: boolean;
  _bayzat_status: string;
};

type SyncResult = {
  synced?: number;
  total_bayzat_rows?: number;
  new_staff_created?: number;
  new_staff?: { staff_name: string; bayzat_employee_id: string }[];
  unmatched?: { employee_id: string; name_raw: string; work_date: string }[];
  errors?: { staff_name?: string; work_date?: string; message: string }[];
  // preview mode
  preview_only?: boolean;
  would_sync?: number;
  preview?: SyncPreviewRow[];
};

type DtrRow = {
  work_date: string; staff_name: string;
  actual_time_in: string; actual_time_out: string;
  regular_hours: string; overtime_hours: string;
  night_regular_hours: string; night_overtime_hours: string;
  late_minutes: string; undertime_minutes: string;
  day_type: string;
  is_scheduled_rest_day: boolean; absent_without_pay: boolean; paid_leave_flag: boolean;
};

type UploadResult = {
  inserted: number; updated: number; total: number;
  errors: { row_index: number; staff_name: string; work_date: string; message: string }[];
};

const DAY_TYPE_OPTIONS = [
  "ordinary_day", "rest_day", "regular_holiday", "regular_holiday_and_rest_day",
  "special_non_working_holiday", "special_holiday_and_rest_day",
];

const DAY_TYPE_LABELS: Record<string, string> = {
  ordinary_day: "Ordinary", rest_day: "Rest Day",
  regular_holiday: "Reg. Holiday", regular_holiday_and_rest_day: "Reg. Holiday + Rest",
  special_non_working_holiday: "Special NW", special_holiday_and_rest_day: "Special + Rest",
};

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseDtrCsv(text: string): DtrRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
  return lines.map((line, i) => {
    const cols = line.split(/[,\t]/).map(c => c.trim());
    if (cols.length < 2) throw new Error(`Row ${i + 1}: need at least 2 columns`);
    const [date, name, time_in = "", time_out = "", reg = "8", ot = "0",
           nreg = "0", not_ = "0", late = "0", ut = "0",
           day_type = "ordinary_day", rest_day = "N", awp = "N", leave = "N"] = cols;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${i + 1}: date must be YYYY-MM-DD`);
    if (!name) throw new Error(`Row ${i + 1}: staff_name is required`);
    const isAWP = awp.toUpperCase() === "Y";
    return {
      work_date: date, staff_name: name,
      actual_time_in: time_in, actual_time_out: time_out,
      regular_hours: isAWP ? "0" : reg, overtime_hours: isAWP ? "0" : ot,
      night_regular_hours: isAWP ? "0" : nreg, night_overtime_hours: isAWP ? "0" : not_,
      late_minutes: late, undertime_minutes: ut,
      day_type: DAY_TYPE_OPTIONS.includes(day_type) ? day_type : "ordinary_day",
      is_scheduled_rest_day: rest_day.toUpperCase() === "Y",
      absent_without_pay: isAWP,
      paid_leave_flag: leave.toUpperCase() === "Y",
    };
  });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return iso.slice(11, 16) || "—"; }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DtrUploadPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) router.replace("/week");
  }, [router]);

  const [periods, setPeriods]               = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [dateFrom, setDateFrom]             = useState("");
  const [dateTo, setDateTo]                 = useState("");
  const [useCustomRange, setUseCustomRange] = useState(false);

  // Sync state
  const [syncing, setSyncing]               = useState(false);
  const [previewing, setPreviewing]         = useState(false);
  const [syncResult, setSyncResult]         = useState<SyncResult | null>(null);
  const [syncError, setSyncError]           = useState("");

  // CSV state
  const [csvText, setCsvText]               = useState("");
  const [csvPreview, setCsvPreview]         = useState<DtrRow[] | null>(null);
  const [parsError, setParsError]           = useState("");
  const [uploading, setUploading]           = useState(false);
  const [uploadResult, setUploadResult]     = useState<UploadResult | null>(null);

  const [activeTab, setActiveTab]           = useState<"sync" | "csv" | "guide">("sync");

  const loadPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    try {
      const r = await apiFetch(`${API}/periods`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as Period[] | { periods: Period[] };
      const list: Period[] = Array.isArray(data) ? data : (data.periods ?? []);
      setPeriods(list.slice().reverse());
    } catch { /* best-effort */ }
    finally { setPeriodsLoading(false); }
  }, []);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  const selectedPeriod = periods.find(p => String(p.id) === selectedPeriodId);

  // Derive effective date range
  function syncPayload(preview: boolean) {
    const base: Record<string, unknown> = {
      preview_only: preview,
      auto_create_staff: true,
    };
    if (selectedPeriodId) base.period_id = parseInt(selectedPeriodId);
    if (useCustomRange) {
      if (dateFrom) base.date_from = dateFrom;
      if (dateTo)   base.date_to   = dateTo;
    }
    return base;
  }

  async function handlePreview() {
    setSyncError(""); setSyncResult(null);
    setPreviewing(true);
    try {
      const r = await apiFetch(`${API}/sync-dtr`, { method: "POST", body: JSON.stringify(syncPayload(true)) });
      if (!r.ok) throw new Error(await r.text());
      setSyncResult(await r.json() as SyncResult);
    } catch (e) { setSyncError(String(e)); }
    finally { setPreviewing(false); }
  }

  async function handleSync() {
    setSyncError(""); setSyncResult(null);
    setSyncing(true);
    try {
      const r = await apiFetch(`${API}/sync-dtr`, { method: "POST", body: JSON.stringify(syncPayload(false)) });
      if (!r.ok) throw new Error(await r.text());
      setSyncResult(await r.json() as SyncResult);
    } catch (e) { setSyncError(String(e)); }
    finally { setSyncing(false); }
  }

  function resetSync() { setSyncResult(null); setSyncError(""); }

  // CSV handlers
  function handleParse() {
    setParsError(""); setCsvPreview(null); setUploadResult(null);
    if (!csvText.trim()) { setParsError("Please paste CSV data first."); return; }
    try {
      const rows = parseDtrCsv(csvText);
      if (rows.length === 0) { setParsError("No rows parsed."); return; }
      setCsvPreview(rows);
    } catch (e) { setParsError(String(e)); }
  }

  async function handleUpload() {
    if (!csvPreview) return;
    setUploading(true); setUploadResult(null);
    try {
      const r = await apiFetch(`${API}/attendance/bulk-upload`, {
        method: "POST",
        body: JSON.stringify({ period_id: selectedPeriodId ? parseInt(selectedPeriodId) : null, rows: csvPreview }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json() as UploadResult;
      setUploadResult(res);
      if (res.errors.length === 0) { setCsvPreview(null); setCsvText(""); }
    } catch (e) { setParsError(`Upload error: ${String(e)}`); }
    finally { setUploading(false); }
  }

  function resetCsv() { setCsvPreview(null); setCsvText(""); setParsError(""); setUploadResult(null); }

  const canSync = selectedPeriodId || (useCustomRange && dateFrom && dateTo);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/payroll/manila"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
              <ChevronLeft size={15} /> Manila Payroll
            </Link>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <ClipboardList size={28} className="text-violet-400" />
              DTR Sync
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Sync Daily Time Records from Bayzat attendance data
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button onClick={() => setActiveTab("sync")} className={activeTab === "sync" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Database size={14} className="inline mr-1.5" />
            Sync from Bayzat
          </button>
          <button onClick={() => setActiveTab("csv")} className={activeTab === "csv" ? TAB_ACTIVE : TAB_INACTIVE}>
            <FileSpreadsheet size={14} className="inline mr-1.5" />
            Manual CSV Upload
          </button>
          <button onClick={() => setActiveTab("guide")} className={activeTab === "guide" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Info size={14} className="inline mr-1.5" />
            CSV Format Guide
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: Sync from Bayzat                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "sync" && (
          <div className="space-y-4">

            {/* Range selector */}
            <div className={GLASS_CARD + " p-5 space-y-4"}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database size={16} className="text-violet-400" />
                Select Date Range
              </h3>

              {/* Period selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Payroll Period
                </label>
                <select
                  value={selectedPeriodId}
                  onChange={e => setSelectedPeriodId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="">— No specific period —</option>
                  {periodsLoading
                    ? <option disabled>Loading…</option>
                    : periods.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.period_label} ({p.start_date} – {p.end_date}) [{p.status}]
                        </option>
                      ))}
                </select>
                {selectedPeriod && (
                  <p className="mt-1 text-xs text-slate-500">
                    Syncs {selectedPeriod.start_date} → {selectedPeriod.end_date} and links rows to this period
                  </p>
                )}
              </div>

              {/* Custom range toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded"
                    checked={useCustomRange} onChange={e => setUseCustomRange(e.target.checked)} />
                  <span className="text-sm text-slate-300">
                    Custom date range
                    <span className="ml-1 text-xs text-slate-500">(for historical data like March / April)</span>
                  </span>
                </label>
                {useCustomRange && (
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">From</label>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">To</label>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
                    </div>
                    {/* Quick presets */}
                    <div className="flex items-end gap-2">
                      {[
                        { label: "Mar 1–15", from: "2026-03-01", to: "2026-03-15" },
                        { label: "Mar 16–31", from: "2026-03-16", to: "2026-03-31" },
                        { label: "Apr 1–15", from: "2026-04-01", to: "2026-04-15" },
                        { label: "Apr 16–30", from: "2026-04-16", to: "2026-04-30" },
                      ].map(preset => (
                        <button key={preset.label}
                          onClick={() => { setDateFrom(preset.from); setDateTo(preset.to); }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition">
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-3 text-xs text-violet-300">
                <Database size={12} className="inline mr-1.5" />
                Bayzat attendance data is already stored in the database (auto-synced daily).
                This sync maps it to Manila payroll records — no file upload needed.
                New staff found in Bayzat will be <strong>auto-created</strong> as staff profiles.
              </div>

              {/* Action buttons */}
              {!syncResult && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePreview}
                    disabled={previewing || syncing || !canSync}
                    className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
                  >
                    {previewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                    Preview Sync
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={syncing || previewing || !canSync}
                    className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}
                  >
                    {syncing ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                    {syncing ? "Syncing…" : "Sync from Bayzat DB"}
                  </button>
                  {!canSync && (
                    <p className="text-xs text-slate-500">Select a period or custom date range first.</p>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {syncError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
                <AlertCircle size={16} /> {syncError}
              </div>
            )}

            {/* Preview result */}
            {syncResult?.preview_only && (
              <div className="space-y-4">
                <div className={GLASS_CARD + " p-5 space-y-4"}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Eye size={16} className="text-violet-400" />
                      Sync Preview — {syncResult.would_sync} rows would be synced
                    </h3>
                    <button onClick={resetSync} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                      <X size={13} /> Close
                    </button>
                  </div>

                  {/* New staff warning */}
                  {(syncResult.new_staff?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 text-xs text-amber-300">
                      <UserPlus size={13} className="mt-0.5 shrink-0" />
                      <span>
                        <strong>{syncResult.new_staff?.length} new staff</strong> not in profiles yet —
                        they will be auto-created: {syncResult.new_staff?.map(s => s.staff_name).join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Unmatched warning */}
                  {(syncResult.unmatched?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-900/10 p-3 text-xs text-red-300">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        <strong>{syncResult.unmatched?.length} records could not be matched</strong> and will be skipped.
                        Go to Staff Profiles → Auto-Match to fix.
                      </span>
                    </div>
                  )}

                  {/* Preview rows */}
                  {(syncResult.preview?.length ?? 0) > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-xs" style={{ minWidth: "700px" }}>
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5">
                            <th className="px-3 py-2 text-left text-slate-400">Date</th>
                            <th className="px-3 py-2 text-left text-slate-400">Staff</th>
                            <th className="px-3 py-2 text-center text-slate-400">Status</th>
                            <th className="px-3 py-2 text-center text-slate-400">Time In</th>
                            <th className="px-3 py-2 text-center text-slate-400">Time Out</th>
                            <th className="px-3 py-2 text-right text-slate-400">Late</th>
                            <th className="px-3 py-2 text-left text-slate-400">Day Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncResult.preview?.slice(0, 100).map((r, i) => (
                            <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${
                              r.absent_without_pay ? "bg-red-900/10" : r.is_scheduled_rest_day ? "bg-slate-800/40" : ""
                            }`}>
                              <td className="px-3 py-1.5 font-mono text-slate-300">{r.work_date}</td>
                              <td className="px-3 py-1.5 font-medium text-white">{r.staff_name}</td>
                              <td className="px-3 py-1.5 text-center">
                                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                                  r._bayzat_status === "Present" ? "bg-emerald-900/40 text-emerald-300" :
                                  r._bayzat_status === "Absent"  ? "bg-red-900/40 text-red-300" :
                                  "bg-slate-700 text-slate-400"
                                }`}>{r._bayzat_status || "—"}</span>
                              </td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-300">{fmtTime(r.actual_time_in)}</td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-300">{fmtTime(r.actual_time_out)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-400">
                                {r.late_minutes > 0 ? <span className="text-amber-300">{r.late_minutes}m</span> : "—"}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                                  {DAY_TYPE_LABELS[r.day_type] ?? r.day_type}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(syncResult.preview?.length ?? 0) > 100 && (
                        <p className="px-3 py-2 text-xs text-slate-500">
                          Showing 100 of {syncResult.preview?.length} rows
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={resetSync}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
                      Back
                    </button>
                    <button onClick={handleSync} disabled={syncing}
                      className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
                      {syncing ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                      Confirm Sync
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sync completed result */}
            {syncResult && !syncResult.preview_only && (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  Sync Complete
                </h3>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: "Records Synced", value: syncResult.synced ?? 0, color: "text-emerald-300", bg: "bg-emerald-900/20 border-emerald-500/20" },
                    { label: "Bayzat Rows", value: syncResult.total_bayzat_rows ?? 0, color: "text-violet-300", bg: "bg-violet-900/20 border-violet-500/20" },
                    { label: "New Staff Created", value: syncResult.new_staff_created ?? 0, color: "text-amber-300", bg: "bg-amber-900/20 border-amber-500/20" },
                    { label: "Errors", value: syncResult.errors?.length ?? 0, color: (syncResult.errors?.length ?? 0) > 0 ? "text-red-300" : "text-slate-500", bg: (syncResult.errors?.length ?? 0) > 0 ? "bg-red-900/20 border-red-500/20" : "bg-slate-800/60 border-white/10" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
                      <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* New staff created */}
                {(syncResult.new_staff?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 text-xs text-amber-300">
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><UserPlus size={13} /> New staff profiles auto-created:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {syncResult.new_staff?.map(s => (
                        <span key={s.staff_name} className="rounded-full border border-amber-500/30 bg-amber-900/20 px-2 py-0.5 text-xs">
                          {s.staff_name} ({s.bayzat_employee_id})
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-amber-400/70">
                      Go to <strong>Staff Profiles</strong> to add salary rates and government IDs for these new employees.
                    </p>
                  </div>
                )}

                {/* Unmatched */}
                {(syncResult.unmatched?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-slate-500/20 bg-slate-800/40 p-3 text-xs text-slate-400">
                    <p className="font-semibold mb-1 flex items-center gap-1.5 text-slate-300">
                      <AlertTriangle size={13} /> {syncResult.unmatched?.length} Bayzat employees skipped (no profile match):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {syncResult.unmatched?.slice(0, 20).map((u, i) => (
                        <span key={i} className="rounded bg-slate-700 px-2 py-0.5">{u.name_raw} ({u.employee_id})</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {(syncResult.errors?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-3 text-xs text-red-300 space-y-1">
                    <p className="font-semibold">Errors:</p>
                    {syncResult.errors?.slice(0, 10).map((e, i) => (
                      <p key={i}>{e.staff_name} {e.work_date}: {e.message}</p>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button onClick={resetSync}
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
                    <RefreshCw size={14} /> Sync Another Range
                  </button>
                  {selectedPeriodId && (
                    <Link href={`/admin/payroll/manila/${selectedPeriodId}`}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 transition-colors">
                      Go to Period → Compute Payroll
                    </Link>
                  )}
                  <Link href="/admin/payroll/manila/staff-profiles"
                    className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/20">
                    <UserPlus size={14} /> View Staff Profiles
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: Manual CSV Upload (fallback)                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "csv" && (
          <div className="space-y-4">
            {/* Period selector for CSV */}
            <div className={GLASS_CARD + " p-4"}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Associate with Payroll Period (optional)
              </p>
              <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-violet-500 focus:outline-none min-w-[280px]">
                <option value="">— No period association —</option>
                {periodsLoading ? <option disabled>Loading…</option>
                  : periods.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.period_label} ({p.start_date} – {p.end_date}) [{p.status}]
                      </option>
                    ))}
              </select>
            </div>

            {!csvPreview && !uploadResult && (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-white">Paste DTR Data (CSV)</label>
                  <button onClick={() => setActiveTab("guide")}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                    <Info size={12} /> Format guide
                  </button>
                </div>
                <textarea value={csvText}
                  onChange={e => { setCsvText(e.target.value); setParsError(""); setUploadResult(null); }}
                  rows={12}
                  placeholder={"# date, staff_name, time_in, time_out, reg_hrs, ot_hrs, nreg, not, late, ut, day_type, rest_day, awp, paid_leave\n2025-01-15, Juan Dela Cruz, 08:00, 17:00, 8, 0, 0, 0, 0, 0, ordinary_day, N, N, N"}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300 font-mono placeholder-slate-700 focus:border-violet-500 focus:outline-none resize-none leading-relaxed"
                />
                {parsError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                    <AlertCircle size={13} /> {parsError}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={handleParse} disabled={!csvText.trim()}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm text-white hover:bg-violet-500 disabled:opacity-40">
                    <FileSpreadsheet size={15} /> Parse & Preview
                  </button>
                </div>
              </div>
            )}

            {csvPreview && !uploadResult && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    {csvPreview.length} rows parsed — review before uploading
                  </p>
                  <button onClick={resetCsv} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
                    <X size={13} /> Clear
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "900px" }}>
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        {["#","Date","Staff Name","Time In","Time Out","Reg Hrs","OT","Late","Day Type","Rest","AWP","Leave"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, i) => (
                        <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${
                          row.absent_without_pay ? "bg-red-900/10" : row.paid_leave_flag ? "bg-blue-900/10" : ""
                        }`}>
                          <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-300">{row.work_date}</td>
                          <td className="px-3 py-1.5 font-medium text-white">{row.staff_name}</td>
                          <td className="px-3 py-1.5 tabular-nums text-slate-400">{row.actual_time_in || "—"}</td>
                          <td className="px-3 py-1.5 tabular-nums text-slate-400">{row.actual_time_out || "—"}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-300">{row.regular_hours}h</td>
                          <td className="px-3 py-1.5 text-right text-amber-300">
                            {parseFloat(row.overtime_hours) > 0 ? `${row.overtime_hours}h` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">
                            {parseInt(row.late_minutes) > 0 ? `${row.late_minutes}m` : "—"}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                              {DAY_TYPE_LABELS[row.day_type] ?? row.day_type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center">{row.is_scheduled_rest_day ? <span className="text-violet-400">R</span> : "—"}</td>
                          <td className="px-3 py-1.5 text-center">{row.absent_without_pay ? <span className="text-red-400 font-semibold">AWP</span> : "—"}</td>
                          <td className="px-3 py-1.5 text-center">{row.paid_leave_flag ? <span className="text-blue-400 font-semibold">SL/VL</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-500">Existing records for the same date + staff will be overwritten.</p>
                  <div className="flex gap-2">
                    <button onClick={resetCsv}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">Back</button>
                    <button onClick={handleUpload} disabled={uploading}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm text-white hover:bg-violet-500 disabled:opacity-40">
                      {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                      {uploading ? "Uploading…" : `Upload ${csvPreview.length} Rows`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {uploadResult && (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Upload Complete
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/20 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-300">{uploadResult.inserted}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Inserted</p>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-900/20 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-300">{uploadResult.updated}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Updated</p>
                  </div>
                  <div className={`rounded-xl border p-3 text-center ${uploadResult.errors.length > 0 ? "border-red-500/20 bg-red-900/20" : "border-white/10 bg-slate-800/60"}`}>
                    <p className={`text-2xl font-bold ${uploadResult.errors.length > 0 ? "text-red-300" : "text-slate-500"}`}>{uploadResult.errors.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Errors</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={resetCsv}
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
                    <RefreshCw size={14} /> Upload More
                  </button>
                  {selectedPeriodId && (
                    <Link href={`/admin/payroll/manila/${selectedPeriodId}`}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500">
                      Go to Period → Compute Payroll
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: CSV Format Guide                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "guide" && (
          <div className={GLASS_CARD + " p-5 space-y-4"}>
            <h3 className="text-sm font-semibold text-white">CSV Format Specification</h3>
            <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-4 text-xs text-blue-200 leading-relaxed">
              <p className="font-semibold text-blue-300 mb-2">Column order (tab or comma separated):</p>
              <code className="block text-slate-300 font-mono bg-slate-800/60 rounded-lg p-3 whitespace-pre">{`date          YYYY-MM-DD      (required)
staff_name    Employee name   (required — must match staff profiles)
time_in       HH:MM 24hr      (optional)
time_out      HH:MM 24hr      (optional)
reg_hours     Decimal         (default: 8.0)
ot_hours      Decimal         (default: 0)
night_reg     NSD reg hrs     (default: 0)
night_ot      NSD OT hrs      (default: 0)
late_min      Integer minutes (default: 0)
ut_min        Integer minutes (default: 0)
day_type      See values      (default: ordinary_day)
rest_day      Y / N          (default: N)
awp           Y / N          (default: N — absent no pay)
paid_leave    Y / N          (default: N)`}</code>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Valid day_type values:</p>
              <div className="flex flex-wrap gap-2">
                {DAY_TYPE_OPTIONS.map(dt => (
                  <code key={dt} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{dt}</code>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between text-xs text-slate-500">
          <Link href="/admin/payroll/manila" className="hover:text-slate-300">← Back to Manila Payroll</Link>
          <span>DTR data is stored in manila_attendance_daily · used for payroll computation</span>
        </div>
      </div>
    </div>
  );
}
