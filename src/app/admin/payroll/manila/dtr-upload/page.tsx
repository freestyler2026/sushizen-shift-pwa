"use client";

import {
  AlertCircle, CheckCircle2, ChevronLeft, ClipboardList,
  Download, FileSpreadsheet, Filter, Info, Loader2, RefreshCw, Upload, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER, PRIMARY_BUTTON } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

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

type ManilaAttRow = {
  id: number;
  staff_name: string;
  work_date: string;
  scheduled_store: string | null;
  scheduled_shift_start: string | null;
  scheduled_shift_end: string | null;
  actual_time_in: string | null;
  actual_time_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  night_regular_hours: number;
  night_overtime_hours: number;
  approved_ot_hours: number | null;
  late_minutes: number;
  undertime_minutes: number;
  day_type: string;
  is_scheduled_rest_day: boolean;
  absent_without_pay: boolean;
  paid_leave_flag: boolean;
  approval_status: string;
};

type SyncPreviewRow = {
  staff_name: string;
  work_date: string;
  day_type: string;
  is_worked: boolean;
  is_scheduled_rest_day: boolean;
  scheduled_store: string;
  scheduled_shift_start: string | null;
  scheduled_shift_end: string | null;
  actual_time_in: string | null;
  actual_time_out: string | null;
  late_minutes: number;
  absent_without_pay: boolean;
  _bayzat_status: string;
};

type SyncApiResult = {
  preview_only?: boolean;
  total_rows?: number;
  total_bayzat_rows?: number;
  would_sync?: number;
  synced?: number;
  new_staff?: { staff_name: string; bayzat_employee_id: string; would_create?: boolean }[];
  new_staff_created?: number;
  unmatched?: { employee_id: string; name_raw: string; work_date: string }[];
  errors?: { employee_id?: string; staff_name?: string; work_date: string; message: string }[];
  preview?: SyncPreviewRow[];
};

type OtApprovalRow = {
  id: string;
  staff_name: string;
  branch_code: string;
  work_date: string;
  request_type: "pre" | "post";
  ot_start_hour: number;
  ot_end_hour: number;
  ot_minutes: number;
  reason: string;
  reviewed_by: string;
  reviewed_at: string | null;
};

type OtSyncResult = {
  synced: number;
  no_dtr: number;
  total_ot_records: number;
  period_id: number;
  date_range: string;
};

function manilaRowStatus(row: ManilaAttRow): string {
  if (row.absent_without_pay) return "Absent";
  if (row.paid_leave_flag) return "Leave";
  if (row.is_scheduled_rest_day && !row.actual_time_in) return "Day Off";
  if (row.actual_time_in || row.regular_hours > 0) return "Worked";
  return "No Data";
}

function downloadManilaAttCsv(rows: ManilaAttRow[], periodLabel: string) {
  const header = ["Date","Staff","Store","Schedule","Clock In","Clock Out","Reg Hrs","OT Hrs","NSD Reg","NSD OT","Late","Day Type","Status"];
  const csvRows = rows.map(r => {
    const sched = r.scheduled_shift_start && r.scheduled_shift_end
      ? `${r.scheduled_shift_start.slice(0,5)}–${r.scheduled_shift_end.slice(0,5)}`
      : "";
    return [
      r.work_date, r.staff_name, r.scheduled_store ?? "",
      sched,
      r.actual_time_in ? fmtTime(r.actual_time_in) : "",
      r.actual_time_out ? fmtTime(r.actual_time_out) : "",
      fmtHours(Number(r.regular_hours)), fmtHours(Number(r.overtime_hours)),
      fmtHours(Number(r.night_regular_hours)), fmtHours(Number(r.night_overtime_hours)),
      r.late_minutes,
      r.day_type, manilaRowStatus(r),
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",");
  });
  const csv = [header.join(","), ...csvRows].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `manila_dtr_${periodLabel.replace(/\s+/g,"_")}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

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

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === "," || ch === "\t") && !inQ) {
      cols.push(cur.trim()); cur = "";
    } else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

function parseDtrCsv(text: string): DtrRow[] {
  const cleaned = text.replace(/^﻿/, "");
  const rawLines = cleaned.trim().split(/\r?\n/).filter(l => {
    const t = l.trim();
    return t && !t.startsWith("#");
  });
  const lines = rawLines[0] && parseCsvLine(rawLines[0])[0]?.toLowerCase() === "work_date"
    ? rawLines.slice(1) : rawLines;
  return lines.map((line, i) => {
    const cols = parseCsvLine(line);
    if (cols.length < 2) throw new Error(`Row ${i + 1}: need at least 2 columns`);
    const [date, name, time_in = "", time_out = "", reg = "8", ot = "0",
           nreg = "0", not_ = "0", late = "0", ut = "0",
           day_type = "ordinary_day", rest_day = "N", awp = "N", leave = "N"] = cols;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${i + 1}: date must be YYYY-MM-DD (got "${date}")`);
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
    return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });
  } catch { return iso.slice(11, 16) || "—"; }
}

function fmtHours(h: number) {
  if (!h) return "—";
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
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
  // CSV state
  const [csvText, setCsvText]               = useState("");
  const [csvPreview, setCsvPreview]         = useState<DtrRow[] | null>(null);
  const [parsError, setParsError]           = useState("");
  const [uploading, setUploading]           = useState(false);
  const [uploadResult, setUploadResult]     = useState<UploadResult | null>(null);
  const [insertOnly, setInsertOnly]         = useState(false);

  const [activeTab, setActiveTab]           = useState<"sync" | "ot" | "csv" | "guide">("sync");

  // Sync-from-OS state
  const [syncLoading, setSyncLoading]       = useState(false);
  const [syncResult, setSyncResult]         = useState<SyncApiResult | null>(null);
  const [syncError, setSyncError]           = useState("");
  const [syncConfirming, setSyncConfirming] = useState(false);

  // DTR Records view state
  const [dtrRecords, setDtrRecords]         = useState<ManilaAttRow[]>([]);
  const [dtrLoading, setDtrLoading]         = useState(false);
  const [dtrError, setDtrError]             = useState("");
  const [dtrStaffFilter, setDtrStaffFilter] = useState("");
  const [dtrStoreFilter, setDtrStoreFilter] = useState("");
  const [dtrStatusFilter, setDtrStatusFilter] = useState("");
  // Approved OT inline edit state (DTR Records table)
  const [otEditId, setOtEditId]   = useState<number | null>(null);
  const [otEditVal, setOtEditVal] = useState("");
  const [otSavingId, setOtSavingId] = useState<number | null>(null);

  // OT Approvals tab state
  const [otApprovals, setOtApprovals]       = useState<OtApprovalRow[]>([]);
  const [otApprovalsLoading, setOtApprovalsLoading] = useState(false);
  const [otSyncing, setOtSyncing]           = useState(false);
  const [otSyncResult, setOtSyncResult]     = useState<OtSyncResult | null>(null);
  const [otTabError, setOtTabError]         = useState("");

  const loadDtrRecords = useCallback(async (periodId: string) => {
    if (!periodId) { setDtrRecords([]); setDtrError(""); return; }
    setDtrLoading(true);
    setDtrError("");
    try {
      const r = await apiFetch(`${API}/attendance/${periodId}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as ManilaAttRow[];
      setDtrRecords(Array.isArray(data) ? data : []);
    } catch (e) { setDtrRecords([]); setDtrError(String(e)); }
    finally { setDtrLoading(false); }
  }, []);

  async function saveApprovedOt(recordId: number, val: string) {
    const trimmed = val.trim();
    const hours = trimmed === "" ? null : parseFloat(trimmed);
    if (hours !== null && (isNaN(hours) || hours < 0)) { setOtEditId(null); return; }
    setOtSavingId(recordId);
    try {
      const r = await apiFetch(`${API}/attendance/${recordId}/approved-ot`, {
        method: "PATCH",
        body: JSON.stringify({ approved_ot_hours: hours }),
      });
      if (!r.ok) throw new Error(await r.text());
      setDtrRecords(prev => prev.map(row =>
        row.id === recordId ? { ...row, approved_ot_hours: hours } : row
      ));
    } catch { /* best-effort — row unchanged */ }
    finally { setOtSavingId(null); setOtEditId(null); }
  }

  const loadOtApprovals = useCallback(async (periodId: string) => {
    if (!periodId) { setOtApprovals([]); return; }
    setOtApprovalsLoading(true);
    setOtTabError("");
    try {
      const r = await apiFetch(`${API}/ot-approvals?period_id=${periodId}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as OtApprovalRow[];
      setOtApprovals(Array.isArray(data) ? data : []);
    } catch (e) {
      setOtTabError(String(e));
      setOtApprovals([]);
    } finally {
      setOtApprovalsLoading(false);
    }
  }, []);

  const syncOtApprovals = async () => {
    if (!selectedPeriodId) return;
    setOtSyncing(true);
    setOtTabError("");
    setOtSyncResult(null);
    try {
      const r = await apiFetch(`${API}/sync-ot-approvals?period_id=${selectedPeriodId}`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const result = await r.json() as OtSyncResult;
      setOtSyncResult(result);
      // Refresh DTR records to show updated approved_ot_hours
      void loadDtrRecords(selectedPeriodId);
    } catch (e) {
      setOtTabError(String(e));
    } finally {
      setOtSyncing(false);
    }
  };

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

  useEffect(() => { void loadDtrRecords(selectedPeriodId); }, [selectedPeriodId, loadDtrRecords]);
  useEffect(() => {
    setOtSyncResult(null);
    void loadOtApprovals(selectedPeriodId);
  }, [selectedPeriodId, loadOtApprovals]);

  const selectedPeriod = periods.find(p => String(p.id) === selectedPeriodId);

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
        body: JSON.stringify({ period_id: selectedPeriodId ? parseInt(selectedPeriodId) : null, rows: csvPreview, insert_only: insertOnly }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json() as UploadResult;
      setUploadResult(res);
      if (res.errors.length === 0) { setCsvPreview(null); setCsvText(""); }
      void loadDtrRecords(selectedPeriodId);
    } catch (e) { setParsError(`Upload error: ${String(e)}`); }
    finally { setUploading(false); }
  }

  function resetCsv() { setCsvPreview(null); setCsvText(""); setParsError(""); setUploadResult(null); }

  async function handleSync(previewOnly: boolean) {
    if (!selectedPeriodId) { setSyncError("Please select a payroll period first."); return; }
    setSyncLoading(true); setSyncError(""); setSyncResult(null);
    try {
      const r = await apiFetch(`${API}/sync-dtr`, {
        method: "POST",
        body: JSON.stringify({ period_id: parseInt(selectedPeriodId), preview_only: previewOnly }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as SyncApiResult;
      setSyncResult(data);
      if (!previewOnly) {
        void loadDtrRecords(selectedPeriodId);
        setSyncConfirming(false);
      }
    } catch (e) { setSyncError(`Sync error: ${String(e)}`); }
    finally { setSyncLoading(false); }
  }

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
              DTR Upload — Manila
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload Daily Time Records via CSV
            </p>
          </div>
        </div>

        {/* Shared Period Selector */}
        <div className={GLASS_CARD + " p-4"}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Payroll Period
          </p>
          <SelectDark
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-violet-500 focus:outline-none min-w-[280px]"
            value={selectedPeriodId}
            onChange={(v) => { setSelectedPeriodId(v); setSyncResult(null); setSyncError(""); setSyncConfirming(false); }}
            options={[
              { value: "", label: "— Select a payroll period —" },
              ...(periodsLoading
                ? [{ value: "__loading__", label: "Loading…" }]
                : periods.map(p => ({
                    value: String(p.id),
                    label: `${p.period_label} (${p.start_date} – ${p.end_date}) [${p.status}]`,
                  }))),
            ]}
          />
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button onClick={() => setActiveTab("sync")} className={activeTab === "sync" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Zap size={14} className="inline mr-1.5" />
            Sync from OS Attendance
          </button>
          <button onClick={() => setActiveTab("ot")} className={activeTab === "ot" ? TAB_ACTIVE : TAB_INACTIVE}>
            <CheckCircle2 size={14} className="inline mr-1.5" />
            OT Approvals
            {otApprovals.length > 0 && (
              <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {otApprovals.length}
              </span>
            )}
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
        {/* TAB: Sync from OS Attendance                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "sync" && (
          <div className="space-y-4">
            {!selectedPeriodId ? (
              <div className={GLASS_CARD + " p-6 text-center"}>
                <Zap size={32} className="mx-auto mb-3 text-slate-600" />
                <p className="text-sm text-slate-400">Select a payroll period above to sync OS Attendance data.</p>
              </div>
            ) : (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap size={15} className="text-violet-400" />
                    Sync from OS Attendance (Bayzat)
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Pulls attendance records from OS Attendance for the selected period and writes them directly to DTR.
                    {selectedPeriod && (
                      <span className="ml-1 text-violet-300 font-medium">
                        Range: {selectedPeriod.start_date} – {selectedPeriod.end_date}
                      </span>
                    )}
                  </p>
                </div>

                {syncError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                    <AlertCircle size={13} /> {syncError}
                  </div>
                )}

                {/* Action buttons */}
                {!syncResult && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSync(true)}
                      disabled={syncLoading}
                      className="flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-40">
                      {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Preview Sync
                    </button>
                    <button
                      onClick={() => setSyncConfirming(true)}
                      disabled={syncLoading}
                      className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-40`}>
                      <Zap size={14} /> Sync from OS Attendance
                    </button>
                  </div>
                )}

                {/* Confirm dialog */}
                {syncConfirming && !syncResult && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4 space-y-3">
                    <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                      <AlertCircle size={15} /> Confirm Direct Sync
                    </p>
                    <p className="text-xs text-amber-200">
                      This will write OS Attendance data for {selectedPeriod?.period_label} directly to DTR records.
                      Existing rows will be updated (set to &ldquo;pending&rdquo; approval status).
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setSyncConfirming(false)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSync(false)}
                        disabled={syncLoading}
                        className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm text-white hover:bg-amber-500 disabled:opacity-40">
                        {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                        {syncLoading ? "Syncing…" : "Confirm Sync"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview / Result display */}
                {syncResult && (
                  <div className="space-y-4">
                    {/* Summary stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                        <p className="text-xl font-bold text-white tabular-nums">
                          {syncResult.total_rows ?? syncResult.total_bayzat_rows ?? 0}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">OS Records</p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/20 p-3 text-center">
                        <p className="text-xl font-bold text-emerald-300 tabular-nums">
                          {syncResult.synced ?? syncResult.would_sync ?? 0}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {syncResult.preview_only ? "Would Sync" : "Synced"}
                        </p>
                      </div>
                      <div className={`rounded-xl border p-3 text-center ${
                        (syncResult.unmatched?.length ?? 0) > 0
                          ? "border-amber-500/20 bg-amber-900/20" : "border-white/10 bg-white/5"
                      }`}>
                        <p className={`text-xl font-bold tabular-nums ${
                          (syncResult.unmatched?.length ?? 0) > 0 ? "text-amber-300" : "text-slate-500"
                        }`}>{syncResult.unmatched?.length ?? 0}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Unmatched</p>
                      </div>
                      <div className={`rounded-xl border p-3 text-center ${
                        (syncResult.errors?.length ?? 0) > 0
                          ? "border-red-500/20 bg-red-900/20" : "border-white/10 bg-white/5"
                      }`}>
                        <p className={`text-xl font-bold tabular-nums ${
                          (syncResult.errors?.length ?? 0) > 0 ? "text-red-300" : "text-slate-500"
                        }`}>{syncResult.errors?.length ?? 0}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Errors</p>
                      </div>
                    </div>

                    {/* Success banner for actual sync */}
                    {!syncResult.preview_only && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-900/20 p-3 text-sm text-emerald-300">
                        <CheckCircle2 size={15} /> Sync complete — {syncResult.synced} rows written to DTR records.
                        {(syncResult.new_staff_created ?? 0) > 0 && (
                          <span className="ml-1 text-emerald-400 font-medium">
                            {syncResult.new_staff_created} new staff profile(s) created.
                          </span>
                        )}
                      </div>
                    )}

                    {/* Unmatched staff list */}
                    {(syncResult.unmatched?.length ?? 0) > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 space-y-1">
                        <p className="text-xs font-semibold text-amber-300">
                          Unmatched Staff ({syncResult.unmatched!.length}) — not in Manila staff profiles:
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[...new Set(syncResult.unmatched!.map(u => u.name_raw || u.employee_id))].map(name => (
                            <span key={name} className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200">{name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview table */}
                    {syncResult.preview_only && syncResult.preview && syncResult.preview.length > 0 && (
                      <div className="overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full text-xs" style={{ minWidth: "800px" }}>
                          <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                              {["Date","Staff","Store","Sched","Clock In","Clock Out","Day Type","Bayzat","Status"].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-slate-400">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {syncResult.preview.map((row, i) => (
                              <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${
                                row.absent_without_pay ? "bg-red-900/10" : ""
                              }`}>
                                <td className="px-3 py-1.5 font-mono text-slate-300">{row.work_date}</td>
                                <td className="px-3 py-1.5 font-medium text-white">{row.staff_name}</td>
                                <td className="px-3 py-1.5 text-slate-400">{row.scheduled_store || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-400 tabular-nums">
                                  {row.scheduled_shift_start && row.scheduled_shift_end
                                    ? `${row.scheduled_shift_start.slice(0,5)}–${row.scheduled_shift_end.slice(0,5)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-1.5 tabular-nums text-slate-300">
                                  {row.actual_time_in ? fmtTime(row.actual_time_in) : "—"}
                                </td>
                                <td className="px-3 py-1.5 tabular-nums text-slate-300">
                                  {row.actual_time_out ? fmtTime(row.actual_time_out) : "—"}
                                </td>
                                <td className="px-3 py-1.5">
                                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                                    {DAY_TYPE_LABELS[row.day_type] ?? row.day_type}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-slate-500 text-xs">{row._bayzat_status}</td>
                                <td className="px-3 py-1.5">
                                  {row.absent_without_pay ? (
                                    <span className="text-red-400 font-semibold">AWP</span>
                                  ) : row.is_scheduled_rest_day && !row.is_worked ? (
                                    <span className="text-slate-400">Day Off</span>
                                  ) : row.is_worked ? (
                                    <span className="text-emerald-400">Worked</span>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {syncResult.preview.length >= 200 && (
                          <p className="px-4 py-2 text-xs text-slate-500">Showing first 200 rows.</p>
                        )}
                      </div>
                    )}

                    {/* Action buttons after preview */}
                    <div className="flex gap-3">
                      <button onClick={() => { setSyncResult(null); setSyncError(""); setSyncConfirming(false); }}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
                        {syncResult.preview_only ? "Back" : "Done"}
                      </button>
                      {syncResult.preview_only && (
                        <button
                          onClick={() => handleSync(false)}
                          disabled={syncLoading}
                          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm text-white hover:bg-violet-500 disabled:opacity-40">
                          {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                          {syncLoading ? "Syncing…" : "Sync to DTR"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: OT Approvals                                           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "ot" && (
          <div className="space-y-4">
            {!selectedPeriodId ? (
              <div className={GLASS_CARD + " p-6 text-center"}>
                <CheckCircle2 size={32} className="mx-auto mb-3 text-slate-600" />
                <p className="text-sm text-slate-400">Select a payroll period above to view OT approvals.</p>
              </div>
            ) : (
              <>
                {/* Info banner */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 px-4 py-3 text-xs text-violet-300 flex items-start gap-2">
                  <Info size={13} className="mt-0.5 flex-none" />
                  <span>
                    Approved OT requests from the OS Overtime page are listed below.
                    Click <strong>Sync to DTR</strong> to write approved hours into each staff member&apos;s
                    attendance record. OT is also auto-synced the moment it is approved.
                  </span>
                </div>

                {/* Error */}
                {otTabError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                    <AlertCircle size={12}/> {otTabError}
                  </div>
                )}

                {/* Sync result */}
                {otSyncResult && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 flex flex-wrap gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-300">{otSyncResult.synced}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Records updated</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-300">{otSyncResult.no_dtr}</p>
                      <p className="text-xs text-slate-400 mt-0.5">No DTR record (skipped)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-300">{otSyncResult.total_ot_records}</p>
                      <p className="text-xs text-slate-400 mt-0.5">OT entries in period</p>
                    </div>
                    <div className="flex-1 flex items-center justify-end">
                      <button onClick={() => setOtSyncResult(null)} className="text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void loadOtApprovals(selectedPeriodId)}
                    disabled={otApprovalsLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={otApprovalsLoading ? "animate-spin" : ""}/> Refresh
                  </button>
                  <button
                    onClick={() => void syncOtApprovals()}
                    disabled={otSyncing || otApprovals.length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {otSyncing
                      ? <Loader2 size={12} className="animate-spin"/>
                      : <Zap size={12}/>}
                    Sync to DTR ({otApprovals.length} records)
                  </button>
                </div>

                {/* OT Approvals table */}
                {otApprovalsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-violet-400"/>
                  </div>
                ) : otApprovals.length === 0 ? (
                  <div className={GLASS_CARD + " p-8 text-center"}>
                    <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-600"/>
                    <p className="text-sm text-slate-400">No approved OT requests for this period.</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Go to Admin → Overtime to approve pending requests.
                    </p>
                  </div>
                ) : (
                  <div className={GLASS_CARD + " overflow-hidden"}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: "640px" }}>
                        <thead>
                          <tr className="border-b border-white/10 bg-slate-800/60">
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">Date</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">Staff</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">Branch</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">OT Window</th>
                            <th className="px-3 py-2.5 text-center font-semibold text-slate-400">Hours</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">Reason</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-400">Approved By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {otApprovals.map((row, idx) => {
                            const hrs = row.ot_minutes / 60;
                            const h = Math.floor(hrs);
                            const m = Math.round((hrs - h) * 60);
                            const hrsLabel = m > 0 ? `${h}h ${m}m` : `${h}h`;
                            const startH = Math.floor(row.ot_start_hour);
                            const startM = Math.round((row.ot_start_hour - startH) * 60);
                            const endH   = Math.floor(row.ot_end_hour);
                            const endM   = Math.round((row.ot_end_hour - endH) * 60);
                            const fmt = (hh: number, mm: number) =>
                              `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
                            return (
                              <tr key={row.id} className={`border-b border-white/5 hover:bg-white/5 ${idx % 2 === 0 ? "" : "bg-slate-800/20"}`}>
                                <td className="px-3 py-2 tabular-nums text-slate-300">{row.work_date}</td>
                                <td className="px-3 py-2 text-slate-200 font-medium">{row.staff_name}</td>
                                <td className="px-3 py-2 text-slate-400">{row.branch_code || "—"}</td>
                                <td className="px-3 py-2 tabular-nums text-slate-300">
                                  {fmt(startH, startM)} – {fmt(endH, endM)}
                                  <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-slate-700 text-slate-500">
                                    {row.request_type === "pre" ? "pre" : "post"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="font-bold text-violet-300">{hrsLabel}</span>
                                </td>
                                <td className="px-3 py-2 text-slate-400 max-w-[160px] truncate" title={row.reason}>{row.reason || "—"}</td>
                                <td className="px-3 py-2 text-slate-500">
                                  {row.reviewed_by || "—"}
                                  {row.reviewed_at && (
                                    <span className="block text-[10px] text-slate-600">
                                      {new Date(row.reviewed_at).toLocaleDateString("en-PH")}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: CSV Upload                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "csv" && (
          <div className="space-y-4">

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
                          <td className="px-3 py-1.5 text-right text-emerald-300">{fmtHours(parseFloat(row.regular_hours))}</td>
                          <td className="px-3 py-1.5 text-right text-amber-300">
                            {parseFloat(row.overtime_hours) > 0 ? fmtHours(parseFloat(row.overtime_hours)) : "—"}
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
                <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={insertOnly}
                      onChange={e => setInsertOnly(e.target.checked)}
                      className="w-4 h-4 rounded accent-purple-500"
                    />
                    <span className="text-sm text-slate-300">
                      Insert only — skip rows where (staff + date) already exists
                    </span>
                  </label>
                  {insertOnly && (
                    <p className="text-xs text-amber-400">Manually corrected records will not be overwritten.</p>
                  )}
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
              <code className="block text-slate-300 font-mono bg-slate-800/60 rounded-lg p-3 whitespace-pre">{`date             YYYY-MM-DD      (required)
staff_name       Employee name   (required — must match staff profiles)
time_in          HH:MM 24hr      (optional — enables auto NSD/OT)
time_out         HH:MM 24hr      (optional — enables auto NSD/OT)
reg_hours        Decimal         (default: 8.0)
ot_hours         Decimal         (default: 0)
approved_ot_hours Decimal        (optional — overrides computed OT for payroll)
night_reg        NSD reg hrs     (default: 0 — manual if no time_in/out)
night_ot         NSD OT hrs      (default: 0 — manual if no time_in/out)
late_min         Integer minutes (default: 0)
ut_min           Integer minutes (default: 0)
day_type         See values      (default: ordinary_day)
rest_day         Y / N          (default: N)
awp              Y / N          (default: N — absent no pay)
paid_leave       Y / N          (default: N)`}</code>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-3 text-xs text-emerald-200 leading-relaxed">
              <p className="font-semibold text-emerald-300 mb-1">⭐ Auto Night Differential &amp; Overtime Calculation</p>
              <p>When <code className="text-emerald-100">time_in</code> and <code className="text-emerald-100">time_out</code> are provided, the payroll engine automatically calculates:</p>
              <ul className="mt-1 ml-3 space-y-0.5 list-disc list-inside">
                <li>Night Differential hours (22:00–06:00 Philippine Standard Time)</li>
                <li>Overtime hours (beyond 8 regular hours)</li>
                <li>All multipliers per PH labor law (day type, rest day, holiday)</li>
              </ul>
              <p className="mt-2 text-emerald-300/70">Without actual clock times, enter <code className="text-emerald-100">night_reg</code> / <code className="text-emerald-100">night_ot</code> manually in the CSV.</p>
              <p className="mt-2 text-emerald-300/70">Use <code className="text-emerald-100">approved_ot_hours</code> to record approved OT separately from raw clock-out (e.g. clock-out 24:15 but approved OT = 1h). The engine uses this value for NSD+OT payroll calculation. You can also set it inline in the DTR Records table below.</p>
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

        {/* ── Current DTR Records for this Period ───────────────────────────── */}
        {selectedPeriodId && (
          <div className={GLASS_CARD + " overflow-hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-violet-400" />
                <span className="text-sm font-semibold text-white">Current DTR Records for this Period</span>
                {!dtrLoading && (
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                    {dtrRecords.length} rows
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { void loadDtrRecords(selectedPeriodId); }}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                  <RefreshCw size={11} className={dtrLoading ? "animate-spin" : ""} /> Refresh
                </button>
                {dtrRecords.length > 0 && (
                  <button
                    onClick={() => downloadManilaAttCsv(dtrRecords, selectedPeriod?.period_label ?? selectedPeriodId)}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20">
                    <Download size={11} /> CSV All ({dtrRecords.length})
                  </button>
                )}
              </div>
            </div>

            {/* Filters */}
            {dtrRecords.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2 bg-white/[0.02]">
                <Filter size={13} className="text-slate-500 self-center" />
                <input
                  type="text"
                  placeholder="Staff name…"
                  value={dtrStaffFilter}
                  onChange={e => setDtrStaffFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-violet-500 focus:outline-none w-40"
                />
                <SelectDark
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                  value={dtrStoreFilter}
                  onChange={setDtrStoreFilter}
                  options={[
                    { value: "", label: "All Stores" },
                    ...[...new Set(dtrRecords.map(r => r.scheduled_store).filter(Boolean) as string[])].sort()
                      .map(s => ({ value: s, label: s })),
                  ]}
                />
                <SelectDark
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                  value={dtrStatusFilter}
                  onChange={setDtrStatusFilter}
                  options={[
                    { value: "", label: "All Status" },
                    { value: "Worked", label: "Worked" },
                    { value: "Day Off", label: "Day Off" },
                    { value: "Absent", label: "Absent" },
                    { value: "Leave", label: "Leave" },
                  ]}
                />
              </div>
            )}

            {dtrLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={24} className="animate-spin text-violet-400" />
              </div>
            ) : dtrError ? (
              <div className="flex items-center gap-2 m-4 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                <AlertCircle size={13} /> Failed to load DTR records: {dtrError}
              </div>
            ) : dtrRecords.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm text-slate-500">No DTR records for this period yet.</p>
                <p className="text-xs text-slate-600">
                  Use <span className="text-violet-400 font-medium">Sync from OS Attendance</span> or <span className="text-violet-400 font-medium">Manual CSV Upload</span> above to populate records.
                </p>
              </div>
            ) : (() => {
              const filtered = dtrRecords.filter(r => {
                if (dtrStaffFilter && !r.staff_name.toLowerCase().includes(dtrStaffFilter.toLowerCase())) return false;
                if (dtrStoreFilter && r.scheduled_store !== dtrStoreFilter) return false;
                if (dtrStatusFilter && manilaRowStatus(r) !== dtrStatusFilter) return false;
                return true;
              });
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "900px" }}>
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        {["Date","Staff","Store","Schedule","Clock In","Clock Out","Reg Hrs","OT Hrs","Apprvd OT","Late","Type","Status"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filtered.map((row, idx) => {
                        const status = manilaRowStatus(row);
                        const sched = row.scheduled_shift_start && row.scheduled_shift_end
                          ? `${row.scheduled_shift_start.slice(0,5)}–${row.scheduled_shift_end.slice(0,5)}`
                          : "—";
                        return (
                          <tr key={row.id ?? idx} className={`hover:bg-white/5 ${idx % 2 === 1 ? "bg-white/[0.02]" : ""}`}>
                            <td className="px-3 py-2 font-mono text-slate-400">{row.work_date}</td>
                            <td className="px-3 py-2 font-medium text-white">{row.staff_name}</td>
                            <td className="px-3 py-2 text-slate-400">{row.scheduled_store || "—"}</td>
                            <td className="px-3 py-2 text-slate-400">{sched}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-300">{row.actual_time_in ? fmtTime(row.actual_time_in) : "—"}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-300">{row.actual_time_out ? fmtTime(row.actual_time_out) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtHours(Number(row.regular_hours))}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                              {Number(row.overtime_hours) > 0 ? fmtHours(Number(row.overtime_hours)) : "—"}
                            </td>
                            {/* Approved OT — inline editable */}
                            <td className="px-3 py-2 text-right tabular-nums">
                              {otEditId === row.id ? (
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={otEditVal}
                                  onChange={e => setOtEditVal(e.target.value)}
                                  onBlur={() => saveApprovedOt(row.id, otEditVal)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveApprovedOt(row.id, otEditVal);
                                    if (e.key === "Escape") setOtEditId(null);
                                  }}
                                  className="w-16 rounded border border-violet-500 bg-white/10 px-1 py-0.5 text-right text-xs text-white focus:outline-none"
                                />
                              ) : (
                                <button
                                  onClick={() => { setOtEditId(row.id); setOtEditVal(row.approved_ot_hours != null ? String(row.approved_ot_hours) : ""); }}
                                  title="Click to set approved OT hours"
                                  className={`min-w-[2.5rem] rounded px-1 py-0.5 text-right text-xs hover:bg-white/10 ${
                                    otSavingId === row.id ? "text-slate-500" :
                                    row.approved_ot_hours != null ? "text-violet-400 font-semibold" : "text-slate-600"
                                  }`}
                                >
                                  {otSavingId === row.id ? "…" : row.approved_ot_hours != null ? fmtHours(row.approved_ot_hours) : "—"}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                              {Number(row.late_minutes) > 0 ? `${row.late_minutes}m` : "—"}
                            </td>
                            <td className="px-3 py-2 text-slate-400">{DAY_TYPE_LABELS[row.day_type] ?? row.day_type}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                status === "Worked"  ? "bg-emerald-500/20 text-emerald-400" :
                                status === "Absent"  ? "bg-red-500/20 text-red-400" :
                                status === "Leave"   ? "bg-blue-500/20 text-blue-400" :
                                status === "Day Off" ? "bg-slate-500/20 text-slate-400" :
                                "bg-white/10 text-slate-500"
                              }`}>{status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="py-6 text-center text-sm text-slate-500">No records match filters.</p>
                  )}
                </div>
              );
            })()}
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
