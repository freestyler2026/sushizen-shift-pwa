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
import SelectDark from "@/components/SelectDark";

const API = "/api/admin/dubai-payroll";

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
  start_date: string;
  end_date: string;
  status: string;
};

type SyncPreviewRow = {
  staff_name: string;
  work_date: string;
  scheduled_store: string;
  actual_time_in: string | null;
  actual_time_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  actual_break_minutes: number;
  is_worked: boolean;
  absent_without_pay: boolean;
};

type SyncResult = {
  synced?: number;
  total_os_rows?: number;
  new_staff_created?: number;
  new_staff?: { staff_name: string; would_create?: boolean }[];
  errors?: { staff_name?: string; work_date?: string; message: string }[];
  preview_only?: boolean;
  would_sync?: number;
  preview?: SyncPreviewRow[];
};

type DtrRow = {
  work_date: string; staff_name: string;
  actual_time_in: string; actual_time_out: string;
  regular_hours: string; overtime_hours: string;
  late_minutes: string; undertime_minutes: string;
  day_type: string;
  is_scheduled_rest_day: boolean; absent_without_pay: boolean; annual_leave_flag: boolean;
};

type UploadResult = {
  inserted: number; updated: number; total: number;
  errors: { row_index: number; staff_name: string; work_date: string; message: string }[];
};

const DAY_TYPE_OPTIONS = [
  "ordinary_day", "rest_day", "public_holiday", "public_holiday_and_rest_day",
];

const DAY_TYPE_LABELS: Record<string, string> = {
  ordinary_day: "Ordinary", rest_day: "Rest Day",
  public_holiday: "Public Holiday", public_holiday_and_rest_day: "Holiday + Rest",
};

// ── CSV Parser ─────────────────────────────────────────────────────────────────

function parseDtrCsv(text: string): DtrRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
  return lines.map((line, i) => {
    const cols = line.split(/[,\t]/).map(c => c.trim());
    if (cols.length < 2) throw new Error(`Row ${i + 1}: need at least 2 columns`);
    const [date, name, time_in = "", time_out = "", reg = "8", ot = "0",
           late = "0", ut = "0", day_type = "ordinary_day",
           rest_day = "N", awp = "N", leave = "N"] = cols;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${i + 1}: date must be YYYY-MM-DD`);
    if (!name) throw new Error(`Row ${i + 1}: staff_name is required`);
    const isAWP = awp.toUpperCase() === "Y";
    return {
      work_date: date, staff_name: name,
      actual_time_in: time_in, actual_time_out: time_out,
      regular_hours: isAWP ? "0" : reg,
      overtime_hours: isAWP ? "0" : ot,
      late_minutes: late, undertime_minutes: ut,
      day_type: DAY_TYPE_OPTIONS.includes(day_type) ? day_type : "ordinary_day",
      is_scheduled_rest_day: rest_day.toUpperCase() === "Y",
      absent_without_pay: isAWP,
      annual_leave_flag: leave.toUpperCase() === "Y",
    };
  });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dubai" });
  } catch { return iso.slice(11, 16) || "—"; }
}

function fmtHours(h: number) {
  if (!h) return "—";
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DubaiDtrUploadPage() {
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

  const [syncing, setSyncing]               = useState(false);
  const [previewing, setPreviewing]         = useState(false);
  const [syncResult, setSyncResult]         = useState<SyncResult | null>(null);
  const [syncError, setSyncError]           = useState("");

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
      const data = await r.json() as { periods: Period[] };
      setPeriods((data.periods ?? []).slice().reverse());
    } catch { /* best-effort */ }
    finally { setPeriodsLoading(false); }
  }, []);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  const selectedPeriod = periods.find(p => String(p.id) === selectedPeriodId);

  function syncPayload(preview: boolean) {
    const base: Record<string, unknown> = { preview_only: preview, auto_create_staff: true };
    if (selectedPeriodId) base.period_id = parseInt(selectedPeriodId);
    if (useCustomRange) {
      if (dateFrom) base.date_from = dateFrom;
      if (dateTo)   base.date_to   = dateTo;
    }
    return base;
  }

  async function handlePreview() {
    setSyncError(""); setSyncResult(null); setPreviewing(true);
    try {
      const r = await apiFetch(`${API}/sync-dtr`, { method: "POST", body: JSON.stringify(syncPayload(true)) });
      if (!r.ok) throw new Error(await r.text());
      setSyncResult(await r.json() as SyncResult);
    } catch (e) { setSyncError(String(e)); }
    finally { setPreviewing(false); }
  }

  async function handleSync() {
    setSyncError(""); setSyncResult(null); setSyncing(true);
    try {
      const r = await apiFetch(`${API}/sync-dtr`, { method: "POST", body: JSON.stringify(syncPayload(false)) });
      if (!r.ok) throw new Error(await r.text());
      setSyncResult(await r.json() as SyncResult);
    } catch (e) { setSyncError(String(e)); }
    finally { setSyncing(false); }
  }

  function resetSync() { setSyncResult(null); setSyncError(""); }

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
            <Link href="/admin/payroll/dubai"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
              <ChevronLeft size={15} /> Dubai Payroll
            </Link>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <ClipboardList size={28} className="text-sky-400" />
              DTR Sync — Dubai
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Sync Daily Time Records from OS Attendance data
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button onClick={() => setActiveTab("sync")} className={activeTab === "sync" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Database size={14} className="inline mr-1.5" />
            Sync from OS Attendance
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

        {/* ── TAB: Sync from OS Attendance ──────────────────────────────────── */}
        {activeTab === "sync" && (
          <div className="space-y-4">

            <div className={GLASS_CARD + " p-5 space-y-4"}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database size={16} className="text-sky-400" />
                Select Date Range
              </h3>

              {/* Period selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Payroll Period
                </label>
                <SelectDark
                  value={selectedPeriodId}
                  onChange={setSelectedPeriodId}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
                  options={[
                    { value: "", label: "— No specific period —" },
                    ...(periodsLoading
                      ? []
                      : periods.map(p => ({
                          value: String(p.id),
                          label: `${p.period_label} (${p.start_date} – ${p.end_date}) [${p.status}]`,
                        }))),
                  ]}
                />
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
                    <span className="ml-1 text-xs text-slate-500">(for historical data or partial months)</span>
                  </span>
                </label>
                {useCustomRange && (
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">From</label>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">To</label>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none" />
                    </div>
                    {/* Quick presets */}
                    <div className="flex items-end gap-2 flex-wrap">
                      {[
                        { label: "Jul 10–15", from: "2026-07-10", to: "2026-07-15" },
                        { label: "Jul 10–23", from: "2026-07-10", to: "2026-07-23" },
                        { label: "Jul 16–31", from: "2026-07-16", to: "2026-07-31" },
                        { label: "Aug 1–15",  from: "2026-08-01", to: "2026-08-15" },
                        { label: "Aug 16–31", from: "2026-08-16", to: "2026-08-31" },
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
              <div className="rounded-xl border border-sky-500/20 bg-sky-900/10 p-3 text-xs text-sky-300">
                <Database size={12} className="inline mr-1.5" />
                OS Attendance data is stored in the database when staff clock in/out via the app.
                This sync reads those records and maps them to Dubai payroll DTR — no file upload needed.
                Hours worked and break time are computed automatically.
                New staff found will be <strong>auto-created</strong> as staff profiles.
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
                    {syncing ? "Syncing…" : "Sync from OS Attendance"}
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
                      <Eye size={16} className="text-sky-400" />
                      Sync Preview — {syncResult.would_sync} rows would be synced
                      <span className="text-xs text-slate-500 font-normal">
                        (from {syncResult.total_os_rows} OS Attendance records)
                      </span>
                    </h3>
                    <button onClick={resetSync} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                      <X size={13} /> Close
                    </button>
                  </div>

                  {(syncResult.new_staff?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 text-xs text-amber-300">
                      <UserPlus size={13} className="mt-0.5 shrink-0" />
                      <span>
                        <strong>{syncResult.new_staff?.length} new staff</strong> not in profiles yet —
                        they will be auto-created: {syncResult.new_staff?.map(s => s.staff_name).join(", ")}
                      </span>
                    </div>
                  )}

                  {(syncResult.errors?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-900/10 p-3 text-xs text-red-300">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span><strong>{syncResult.errors?.length} errors</strong> — first: {syncResult.errors?.[0]?.message}</span>
                    </div>
                  )}

                  {(syncResult.preview?.length ?? 0) > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-xs" style={{ minWidth: "680px" }}>
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5">
                            <th className="px-3 py-2 text-left text-slate-400">Date</th>
                            <th className="px-3 py-2 text-left text-slate-400">Staff</th>
                            <th className="px-3 py-2 text-left text-slate-400">Branch</th>
                            <th className="px-3 py-2 text-center text-slate-400">Clock In</th>
                            <th className="px-3 py-2 text-center text-slate-400">Clock Out</th>
                            <th className="px-3 py-2 text-right text-slate-400">Break</th>
                            <th className="px-3 py-2 text-right text-slate-400">Reg Hrs</th>
                            <th className="px-3 py-2 text-right text-slate-400">OT Hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncResult.preview?.slice(0, 100).map((r, i) => (
                            <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${
                              r.absent_without_pay ? "bg-red-900/10" : ""
                            }`}>
                              <td className="px-3 py-1.5 font-mono text-slate-300">{r.work_date}</td>
                              <td className="px-3 py-1.5 font-medium text-white">{r.staff_name}</td>
                              <td className="px-3 py-1.5 text-slate-400">{r.scheduled_store || "—"}</td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-300">{fmtTime(r.actual_time_in)}</td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-300">{fmtTime(r.actual_time_out)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-400">
                                {r.actual_break_minutes > 0 ? `${r.actual_break_minutes}m` : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right text-emerald-300">{fmtHours(r.regular_hours)}</td>
                              <td className="px-3 py-1.5 text-right">
                                {r.overtime_hours > 0
                                  ? <span className="text-amber-300">{fmtHours(r.overtime_hours)}</span>
                                  : <span className="text-slate-600">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(syncResult.preview?.length ?? 0) > 100 && (
                        <p className="px-4 py-2 text-xs text-slate-500">Showing first 100 of {syncResult.preview?.length} rows</p>
                      )}
                    </div>
                  )}

                  {/* Confirm button */}
                  <div className="flex items-center gap-3">
                    <button onClick={handleSync} disabled={syncing}
                      className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}>
                      {syncing ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                      {syncing ? "Syncing…" : "Confirm & Sync"}
                    </button>
                    <button onClick={resetSync} className="text-sm text-slate-400 hover:text-white">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Success result */}
            {syncResult && !syncResult.preview_only && (
              <div className={GLASS_CARD + " p-5 space-y-3"}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    Sync complete
                  </h3>
                  <button onClick={resetSync} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <RefreshCw size={13} /> New sync
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Records synced",      value: syncResult.synced ?? 0,             color: "text-emerald-300" },
                    { label: "OS Attendance rows",  value: syncResult.total_os_rows ?? 0,      color: "text-slate-300" },
                    { label: "New staff created",   value: syncResult.new_staff_created ?? 0,  color: "text-sky-300" },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
                      <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                      <div className="mt-1 text-xs text-slate-500">{stat.label}</div>
                    </div>
                  ))}
                </div>
                {(syncResult.errors?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-3 text-xs text-red-300">
                    <AlertTriangle size={12} className="inline mr-1" />
                    {syncResult.errors?.length} error(s) — first: {syncResult.errors?.[0]?.message}
                  </div>
                )}
                {selectedPeriodId && (
                  <Link href={`/admin/payroll/dubai?period_id=${selectedPeriodId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-200">
                    View Dubai Payroll →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Manual CSV Upload ─────────────────────────────────────────── */}
        {activeTab === "csv" && (
          <div className="space-y-4">

            {/* Period selector */}
            <div className={GLASS_CARD + " p-5 space-y-3"}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Link to Payroll Period (optional)
              </label>
              <SelectDark
                value={selectedPeriodId}
                onChange={setSelectedPeriodId}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
                options={[
                  { value: "", label: "— No specific period —" },
                  ...periods.map(p => ({
                    value: String(p.id),
                    label: `${p.period_label} (${p.start_date} – ${p.end_date})`,
                  })),
                ]}
              />
            </div>

            {/* CSV textarea */}
            {!csvPreview && !uploadResult && (
              <div className={GLASS_CARD + " p-5 space-y-3"}>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-sky-400" />
                  Paste CSV Data
                </h3>
                <textarea
                  value={csvText}
                  onChange={e => { setCsvText(e.target.value); setParsError(""); }}
                  placeholder={"2026-08-01,John Smith,09:00,18:00,8,0,0,0,ordinary_day,N,N,N\n2026-08-01,Jane Doe,09:05,18:00,7.9,0,5,0,ordinary_day,N,N,N"}
                  rows={10}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs font-mono text-slate-300 focus:border-sky-500 focus:outline-none"
                />
                {parsError && (
                  <div className="flex items-center gap-2 text-xs text-red-300">
                    <AlertCircle size={13} /> {parsError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={handleParse} disabled={!csvText.trim()}
                    className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors">
                    <Eye size={15} /> Preview
                  </button>
                </div>
              </div>
            )}

            {/* CSV preview */}
            {csvPreview && !uploadResult && (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Eye size={16} className="text-sky-400" />
                    {csvPreview.length} rows ready to upload
                  </h3>
                  <button onClick={resetCsv} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <X size={13} /> Clear
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs" style={{ minWidth: "680px" }}>
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-3 py-2 text-left text-slate-400">Date</th>
                        <th className="px-3 py-2 text-left text-slate-400">Staff</th>
                        <th className="px-3 py-2 text-center text-slate-400">In</th>
                        <th className="px-3 py-2 text-center text-slate-400">Out</th>
                        <th className="px-3 py-2 text-right text-slate-400">Reg</th>
                        <th className="px-3 py-2 text-right text-slate-400">OT</th>
                        <th className="px-3 py-2 text-right text-slate-400">Late</th>
                        <th className="px-3 py-2 text-left text-slate-400">Day Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.slice(0, 50).map((r, i) => (
                        <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${r.absent_without_pay ? "bg-red-900/10" : ""}`}>
                          <td className="px-3 py-1.5 font-mono text-slate-300">{r.work_date}</td>
                          <td className="px-3 py-1.5 font-medium text-white">{r.staff_name}</td>
                          <td className="px-3 py-1.5 text-center font-mono text-slate-300">{r.actual_time_in || "—"}</td>
                          <td className="px-3 py-1.5 text-center font-mono text-slate-300">{r.actual_time_out || "—"}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-300">{r.regular_hours}h</td>
                          <td className="px-3 py-1.5 text-right">
                            {parseFloat(r.overtime_hours) > 0
                              ? <span className="text-amber-300">{r.overtime_hours}h</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400">
                            {parseInt(r.late_minutes) > 0 ? <span className="text-amber-300">{r.late_minutes}m</span> : "—"}
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
                  {csvPreview.length > 50 && (
                    <p className="px-4 py-2 text-xs text-slate-500">Showing first 50 of {csvPreview.length} rows</p>
                  )}
                </div>
                {parsError && (
                  <div className="flex items-center gap-2 text-xs text-red-300">
                    <AlertCircle size={13} /> {parsError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={handleUpload} disabled={uploading}
                    className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}>
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {uploading ? "Uploading…" : `Upload ${csvPreview.length} rows`}
                  </button>
                  <button onClick={resetCsv} className="text-sm text-slate-400 hover:text-white">Cancel</button>
                </div>
              </div>
            )}

            {/* Upload result */}
            {uploadResult && (
              <div className={GLASS_CARD + " p-5 space-y-3"}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    Upload complete
                  </h3>
                  <button onClick={resetCsv} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <RefreshCw size={13} /> New upload
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Inserted",       value: uploadResult.inserted, color: "text-emerald-300" },
                    { label: "Updated",        value: uploadResult.updated,  color: "text-sky-300" },
                    { label: "Errors",         value: uploadResult.errors.length, color: uploadResult.errors.length > 0 ? "text-red-300" : "text-slate-500" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
                      <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                      <div className="mt-1 text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                {uploadResult.errors.length > 0 && (
                  <div className="space-y-1">
                    {uploadResult.errors.slice(0, 5).map((e, i) => (
                      <div key={i} className="text-xs text-red-300">
                        Row {e.row_index + 1} ({e.staff_name} / {e.work_date}): {e.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: CSV Format Guide ─────────────────────────────────────────── */}
        {activeTab === "guide" && (
          <div className={GLASS_CARD + " p-6 space-y-5"}>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Info size={16} className="text-sky-400" />
              Dubai DTR CSV Format
            </h3>
            <p className="text-xs text-slate-400">One row per staff member per day. Columns must be comma- or tab-separated in this order:</p>

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-xs" style={{ minWidth: "600px" }}>
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-3 py-2 text-left text-slate-400">#</th>
                    <th className="px-3 py-2 text-left text-slate-400">Column</th>
                    <th className="px-3 py-2 text-left text-slate-400">Format</th>
                    <th className="px-3 py-2 text-left text-slate-400">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ["1", "work_date",           "YYYY-MM-DD",         "2026-08-01"],
                    ["2", "staff_name",           "Text",               "John Smith"],
                    ["3", "actual_time_in",       "HH:MM (24h)",        "09:00"],
                    ["4", "actual_time_out",      "HH:MM (24h)",        "18:00"],
                    ["5", "regular_hours",        "Number",             "8"],
                    ["6", "overtime_hours",       "Number",             "1.5"],
                    ["7", "late_minutes",         "Integer",            "5"],
                    ["8", "undertime_minutes",    "Integer",            "0"],
                    ["9", "day_type",             "See below",          "ordinary_day"],
                    ["10","is_scheduled_rest_day","Y / N",              "N"],
                    ["11","absent_without_pay",   "Y / N",              "N"],
                    ["12","annual_leave_flag",    "Y / N",              "N"],
                  ].map(([n, col, fmt, ex]) => (
                    <tr key={n} className="hover:bg-white/3">
                      <td className="px-3 py-2 text-slate-500">{n}</td>
                      <td className="px-3 py-2 font-mono text-sky-300">{col}</td>
                      <td className="px-3 py-2 text-slate-400">{fmt}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Valid day_type values</h4>
              <div className="flex flex-wrap gap-2">
                {DAY_TYPE_OPTIONS.map(d => (
                  <span key={d} className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300">{d}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Example CSV</h4>
              <pre className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre">{
`# Dubai DTR — Aug 2026 1st Half
2026-08-01,John Smith,09:00,18:00,8,0,0,0,ordinary_day,N,N,N
2026-08-01,Jane Doe,09:05,18:00,7.9,0,5,0,ordinary_day,N,N,N
2026-08-02,John Smith,,,0,0,0,0,ordinary_day,N,Y,N
2026-08-03,John Smith,09:00,20:00,8,2,0,0,ordinary_day,N,N,N`
              }</pre>
              <p className="mt-2 text-xs text-slate-500">Lines starting with # are ignored. Columns 3–12 are optional (default to empty/0/N).</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          <Link href="/admin/payroll/dubai" className="hover:text-slate-300">← Back to Dubai Payroll</Link>
        </div>
      </div>
    </div>
  );
}
