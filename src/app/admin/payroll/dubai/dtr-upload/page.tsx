"use client";

import {
  AlertCircle, CheckCircle2, ChevronLeft, ClipboardList,
  FileSpreadsheet, Info, Loader2, RefreshCw, Upload, X, Eye, Download,
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
  actual_time_in: string | null;
  actual_time_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  actual_break_minutes: number;
  is_worked: boolean;
  absent_without_pay: boolean;
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

type AttendanceRow = {
  id: number | null;
  staff_name: string;
  work_date: string;
  scheduled_store: string | null;
  scheduled_shift: string | null;
  actual_time_in: string | null;
  actual_time_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  actual_break_minutes: number;
  late_minutes: number;
  is_worked: boolean;
  is_scheduled_rest_day: boolean;
  absent_without_pay: boolean;
  annual_leave_flag: boolean;
  day_type: string;
  approval_status: string;
  absence_type: string | null;
  absence_note: string | null;
  is_generated: boolean;
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

function fmtTimeCsv(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dubai" });
  } catch { return iso.slice(11, 16) || ""; }
}

function fmtHours(h: number) {
  if (!h) return "—";
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}

function fmtLate(mins: number) {
  // Dubai grace period: 15 minutes — only flag if > 15 min late
  if (!mins || mins <= 15) return "—";
  return `Late ${mins}m`;
}

function rowStatus(row: AttendanceRow): string {
  if (row.annual_leave_flag) return "Annual Leave";
  if (row.absent_without_pay) return "Absent (AWP)";
  if (row.absence_type) return `Absent (${row.absence_type})`;
  if (row.approval_status === "no_clockin") return "No Clock-in";
  if (row.is_scheduled_rest_day) return "Day Off";
  return row.is_worked ? "Worked" : (DAY_TYPE_LABELS[row.day_type] ?? row.day_type);
}

function downloadDtrCsv(rows: AttendanceRow[], periodId: string) {
  const headers = [
    "Date", "Staff", "Store", "Scheduled", "Clock In", "Clock Out",
    "Break (min)", "Reg Hrs", "OT Hrs", "Late (min)", "Type", "Status",
  ];
  const csvRows = rows.map(r => [
    r.work_date,
    r.staff_name,
    r.scheduled_store ?? "",
    r.scheduled_shift ?? "",
    r.actual_time_in ? fmtTime(r.actual_time_in) : "",
    r.actual_time_out ? fmtTime(r.actual_time_out) : "",
    String(r.actual_break_minutes ?? 0),
    String(r.regular_hours ?? 0),
    String(r.overtime_hours ?? 0),
    r.late_minutes > 15 ? String(r.late_minutes) : "0",
    r.absent_without_pay ? "AWP" : (DAY_TYPE_LABELS[r.day_type] ?? r.day_type),
    r.approval_status ?? "pending",
  ]);
  const csv = [headers, ...csvRows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dtr_period${periodId}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

  const [dlDateFrom, setDlDateFrom]         = useState("");
  const [dlDateTo, setDlDateTo]             = useState("");
  const [dlUseCustomRange, setDlUseCustomRange] = useState(false);
  const [downloading, setDownloading]       = useState(false);
  const [downloadError, setDownloadError]   = useState("");
  const [downloadCount, setDownloadCount]   = useState<number | null>(null);

  const [csvText, setCsvText]               = useState("");
  const [csvPreview, setCsvPreview]         = useState<DtrRow[] | null>(null);
  const [parsError, setParsError]           = useState("");
  const [uploading, setUploading]           = useState(false);
  const [uploadResult, setUploadResult]     = useState<UploadResult | null>(null);

  const [activeTab, setActiveTab]           = useState<"csv" | "guide">("csv");

  const [dtrRecords, setDtrRecords]         = useState<AttendanceRow[]>([]);
  const [dtrLoading, setDtrLoading]         = useState(false);

  // DTR filter + pagination state
  const [dtrStaffFilter, setDtrStaffFilter] = useState("");
  const [dtrDateFrom, setDtrDateFrom]       = useState("");
  const [dtrPage, setDtrPage]               = useState(0);
  const [dtrDateTo, setDtrDateTo]           = useState("");
  const [dtrStoreFilter, setDtrStoreFilter] = useState("");
  const [dtrStatusFilter, setDtrStatusFilter] = useState("");

  useEffect(() => {
    if (!selectedPeriodId) { setDtrRecords([]); return; }
    setDtrLoading(true);
    apiFetch(`${API}/attendance-full?period_id=${selectedPeriodId}`)
      .then(r => r.json())
      .then(d => setDtrRecords(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => {})
      .finally(() => setDtrLoading(false));
  }, [selectedPeriodId]);

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

  async function downloadOsAttendance() {
    setDownloadError(""); setDownloadCount(null); setDownloading(true);
    try {
      const payload: Record<string, unknown> = { preview_only: true, auto_create_staff: false };
      if (selectedPeriodId) payload.period_id = parseInt(selectedPeriodId);
      if (dlUseCustomRange) {
        if (dlDateFrom) payload.date_from = dlDateFrom;
        if (dlDateTo)   payload.date_to   = dlDateTo;
      }
      const r = await apiFetch(`${API}/sync-dtr`, { method: "POST", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { preview?: SyncPreviewRow[]; would_sync?: number };
      const rows = data.preview ?? [];
      if (rows.length === 0) { setDownloadError("No attendance data found for this range."); return; }

      const header = "work_date,staff_name,actual_time_in,actual_time_out,regular_hours,overtime_hours,late_minutes,undertime_minutes,day_type,is_scheduled_rest_day,absent_without_pay,annual_leave_flag";
      const csvRows = rows.map(row => {
        const isOff = !row.is_worked && !row.absent_without_pay;
        return [
          row.work_date,
          row.staff_name,
          isOff ? "" : fmtTimeCsv(row.actual_time_in),
          isOff ? "" : fmtTimeCsv(row.actual_time_out),
          isOff ? "0" : String(row.regular_hours ?? 0),
          isOff ? "0" : String(row.overtime_hours ?? 0),
          "0",
          "0",
          isOff ? "rest_day" : "ordinary_day",
          isOff ? "Y" : "N",
          row.absent_without_pay ? "Y" : "N",
          "N",
        ].join(",");
      });

      const label = selectedPeriod
        ? selectedPeriod.period_label.replace(/\s+/g, "_")
        : dlUseCustomRange && dlDateFrom && dlDateTo
          ? `${dlDateFrom}_to_${dlDateTo}`
          : "export";
      const blob = new Blob(["﻿" + header + "\n" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `os_attendance_dtr_${label}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setDownloadCount(rows.length);
    } catch (e) { setDownloadError(String(e)); }
    finally { setDownloading(false); }
  }

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

  const canDownload = !!(selectedPeriodId || (dlUseCustomRange && dlDateFrom && dlDateTo));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/payroll/dubai"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
              <ChevronLeft size={15} /> Dubai Payroll
            </Link>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <ClipboardList size={28} className="text-sky-400" />
              DTR Upload — Dubai
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload Daily Time Records via CSV
            </p>
          </div>
        </div>

        {/* ── Step 1: Download OS Attendance ────────────────────────────────── */}
        <div className={GLASS_CARD + " p-5 space-y-4"}>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Download size={16} className="text-sky-400" />
            Step 1 — Download OS Attendance Data
          </h3>
          <p className="text-xs text-slate-400">
            Fetch clock-in/out records from the OS and download as a DTR CSV.
            Review and correct the file, then upload below.
          </p>

          {/* Period selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Payroll Period
            </label>
            <SelectDark
              value={selectedPeriodId}
              onChange={v => { setSelectedPeriodId(v); setDownloadCount(null); setDownloadError(""); }}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
              options={[
                { value: "", label: "— Select period —" },
                ...(periodsLoading ? [] : periods.map(p => ({
                  value: String(p.id),
                  label: `${p.period_label} (${p.start_date} – ${p.end_date}) [${p.status}]`,
                }))),
              ]}
            />
            {selectedPeriod && (
              <p className="mt-1 text-xs text-slate-500">
                {selectedPeriod.start_date} → {selectedPeriod.end_date}
              </p>
            )}
          </div>

          {/* Custom date range toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded"
                checked={dlUseCustomRange}
                onChange={e => { setDlUseCustomRange(e.target.checked); setDownloadCount(null); setDownloadError(""); }} />
              <span className="text-sm text-slate-300">
                Custom date range
                <span className="ml-1 text-xs text-slate-500">(override period dates)</span>
              </span>
            </label>
            {dlUseCustomRange && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">From</label>
                  <input type="date" value={dlDateFrom}
                    onChange={e => { setDlDateFrom(e.target.value); setDownloadCount(null); }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">To</label>
                  <input type="date" value={dlDateTo}
                    onChange={e => { setDlDateTo(e.target.value); setDownloadCount(null); }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none [color-scheme:dark]" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Jul 1–9",   from: "2026-07-01", to: "2026-07-09" },
                    { label: "Jul 1–15",  from: "2026-07-01", to: "2026-07-15" },
                    { label: "Jul 16–31", from: "2026-07-16", to: "2026-07-31" },
                    { label: "Aug 1–15",  from: "2026-08-01", to: "2026-08-15" },
                    { label: "Aug 16–31", from: "2026-08-16", to: "2026-08-31" },
                  ].map(p => (
                    <button key={p.label}
                      onClick={() => { setDlDateFrom(p.from); setDlDateTo(p.to); setDownloadCount(null); }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={downloadOsAttendance}
              disabled={downloading || !canDownload}
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}
            >
              {downloading
                ? <><Loader2 size={15} className="animate-spin" /> Fetching…</>
                : <><Download size={15} /> Download OS Attendance CSV</>}
            </button>
            {!canDownload && (
              <p className="text-xs text-slate-500">Select a period or set a custom date range first.</p>
            )}
            {downloadCount !== null && !downloading && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-300">
                <CheckCircle2 size={13} />
                {downloadCount} rows downloaded — review the file, then upload below.
              </div>
            )}
          </div>

          {downloadError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
              <AlertCircle size={13} /> {downloadError}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">Step 2 — Upload Corrected CSV</div>
        <div className={TAB_CONTAINER}>
          <button onClick={() => setActiveTab("csv")} className={activeTab === "csv" ? TAB_ACTIVE : TAB_INACTIVE}>
            <FileSpreadsheet size={14} className="inline mr-1.5" />
            CSV Upload
          </button>
          <button onClick={() => setActiveTab("guide")} className={activeTab === "guide" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Info size={14} className="inline mr-1.5" />
            CSV Format Guide
          </button>
        </div>

        {/* ── TAB: CSV Upload ───────────────────────────────────────────────── */}
        {activeTab === "csv" && (
          <div className="space-y-4">

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

        {/* ── Current DTR Records ──────────────────────────────────────────── */}
        {selectedPeriodId && (() => {
          const PAGE_SIZE = 300;
          const dtrStores = [...new Set(dtrRecords.map(r => r.scheduled_store).filter(Boolean) as string[])].sort();
          const filtered = dtrRecords.filter(row => {
            if (dtrStaffFilter && !row.staff_name.toLowerCase().includes(dtrStaffFilter.toLowerCase())) return false;
            if (dtrDateFrom && row.work_date < dtrDateFrom) return false;
            if (dtrDateTo && row.work_date > dtrDateTo) return false;
            if (dtrStoreFilter && row.scheduled_store !== dtrStoreFilter) return false;
            if (dtrStatusFilter) {
              if (dtrStatusFilter === "worked" && !row.is_worked) return false;
              if (dtrStatusFilter === "rest_day" && !row.is_scheduled_rest_day) return false;
              if (dtrStatusFilter === "awp" && !row.absent_without_pay) return false;
              if (dtrStatusFilter === "annual_leave" && !row.annual_leave_flag) return false;
              if (dtrStatusFilter === "late" && row.late_minutes <= 15) return false;
              if (dtrStatusFilter === "no_clockin" && row.approval_status !== "no_clockin") return false;
              if (dtrStatusFilter === "generated" && !row.is_generated) return false;
            }
            return true;
          });
          const hasFilter = !!(dtrStaffFilter || dtrDateFrom || dtrDateTo || dtrStoreFilter || dtrStatusFilter);
          const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          const safePage = Math.min(dtrPage, totalPages - 1);
          const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

          return (
            <div className={GLASS_CARD + " overflow-hidden"}>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ClipboardList size={15} className="text-sky-400" />
                  Current DTR Records for this Period
                  {dtrRecords.length > 0 && (
                    <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-normal text-sky-300">
                      {hasFilter ? `${filtered.length} / ${dtrRecords.length}` : `${dtrRecords.length}`} rows
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {dtrRecords.length > 0 && (
                    <>
                      {hasFilter && (
                        <button
                          onClick={() => downloadDtrCsv(filtered, selectedPeriodId)}
                          title={`Download filtered rows (${filtered.length})`}
                          className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
                        >
                          <FileSpreadsheet size={13} />
                          CSV ({filtered.length})
                        </button>
                      )}
                      <button
                        onClick={() => downloadDtrCsv(dtrRecords, selectedPeriodId)}
                        title={`Download all rows (${dtrRecords.length})`}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                      >
                        <FileSpreadsheet size={13} />
                        CSV All ({dtrRecords.length})
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setDtrLoading(true);
                      apiFetch(`${API}/attendance-full?period_id=${selectedPeriodId}`)
                        .then(r => r.json())
                        .then(d => setDtrRecords(Array.isArray(d.rows) ? d.rows : []))
                        .catch(() => {})
                        .finally(() => setDtrLoading(false));
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={14} className={dtrLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Filter bar */}
              {!dtrLoading && dtrRecords.length > 0 && (
                <div className="border-b border-white/8 bg-white/2 px-5 py-3 flex flex-wrap gap-2 items-center">
                  <input
                    placeholder="Staff name..."
                    value={dtrStaffFilter}
                    onChange={e => { setDtrStaffFilter(e.target.value); setDtrPage(0); }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-sky-500/50 w-36"
                  />
                  <input
                    type="date"
                    value={dtrDateFrom}
                    onChange={e => { setDtrDateFrom(e.target.value); setDtrPage(0); }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500/50 w-36 [color-scheme:dark]"
                  />
                  <span className="text-xs text-slate-500">–</span>
                  <input
                    type="date"
                    value={dtrDateTo}
                    onChange={e => { setDtrDateTo(e.target.value); setDtrPage(0); }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500/50 w-36 [color-scheme:dark]"
                  />
                  <select
                    value={dtrStoreFilter}
                    onChange={e => { setDtrStoreFilter(e.target.value); setDtrPage(0); }}
                    className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500/50"
                  >
                    <option value="">All Stores</option>
                    {dtrStores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={dtrStatusFilter}
                    onChange={e => { setDtrStatusFilter(e.target.value); setDtrPage(0); }}
                    className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500/50"
                  >
                    <option value="">All Status</option>
                    <option value="worked">Worked</option>
                    <option value="rest_day">Day Off</option>
                    <option value="awp">Absent (AWP)</option>
                    <option value="annual_leave">Annual Leave</option>
                    <option value="late">Late (&gt;15 min)</option>
                    <option value="no_clockin">No Clock-in</option>
                    <option value="generated">Generated rows only</option>
                  </select>
                  {hasFilter && (
                    <button
                      onClick={() => { setDtrStaffFilter(""); setDtrDateFrom(""); setDtrDateTo(""); setDtrStoreFilter(""); setDtrStatusFilter(""); setDtrPage(0); }}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      <X size={11} /> Clear
                    </button>
                  )}
                </div>
              )}

              {/* Table */}
              {dtrLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : dtrRecords.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No DTR records yet for this period. Upload a CSV above.
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">No records match the current filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "960px" }}>
                    <thead>
                      <tr className="border-b border-white/8 bg-white/3">
                        {["Date", "Staff", "Store", "Schedule", "Clock In", "Clock Out", "Break", "Reg Hrs", "OT Hrs", "Late", "Type", "Status"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {pageRows.map((row, idx) => {
                        const lateDisplay = fmtLate(row.late_minutes ?? 0);
                        const status = rowStatus(row);
                        const isGenerated = row.is_generated;
                        return (
                          <tr
                            key={row.id ?? `gen-${idx}`}
                            className={`transition-colors ${
                              isGenerated
                                ? "bg-white/[0.015] hover:bg-white/[0.04]"
                                : "hover:bg-white/3"
                            } ${row.absent_without_pay || row.absence_type ? "opacity-70" : ""}`}
                          >
                            <td className={`px-3 py-2 font-mono ${isGenerated ? "text-slate-500" : "text-slate-300"}`}>{row.work_date}</td>
                            <td className={`px-3 py-2 font-medium ${isGenerated ? "text-slate-400" : "text-white"}`}>{row.staff_name}</td>
                            <td className="px-3 py-2 text-slate-400">{row.scheduled_store ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-violet-300/80">{row.scheduled_shift ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-slate-300">{row.actual_time_in ? fmtTime(row.actual_time_in) : "—"}</td>
                            <td className="px-3 py-2 font-mono text-slate-300">{row.actual_time_out ? fmtTime(row.actual_time_out) : "—"}</td>
                            <td className="px-3 py-2 text-slate-400">{row.actual_break_minutes ? `${row.actual_break_minutes}m` : "—"}</td>
                            <td className="px-3 py-2 text-emerald-300">{row.regular_hours ? fmtHours(Number(row.regular_hours)) : "—"}</td>
                            <td className="px-3 py-2 text-amber-300">{row.overtime_hours ? fmtHours(Number(row.overtime_hours)) : "—"}</td>
                            <td className={`px-3 py-2 font-medium ${lateDisplay !== "—" ? "text-red-400" : "text-slate-600"}`}>
                              {lateDisplay}
                            </td>
                            <td className="px-3 py-2 text-slate-400">{DAY_TYPE_LABELS[row.day_type] ?? row.day_type}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                                status === "Worked"           ? "bg-emerald-900/30 text-emerald-300" :
                                status === "Day Off"          ? "bg-slate-700 text-slate-300" :
                                status === "Absent (AWP)"     ? "bg-red-900/30 text-red-300" :
                                status === "Annual Leave"     ? "bg-sky-900/30 text-sky-300" :
                                status === "No Clock-in"      ? "bg-orange-900/30 text-orange-300" :
                                status.startsWith("Absent (") ? "bg-red-900/20 text-red-400" :
                                                                "bg-zinc-800 text-zinc-400"
                              }`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-white/8 bg-white/2 px-5 py-3">
                      <span className="text-xs text-slate-500">
                        Page {safePage + 1} of {totalPages} — rows {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDtrPage(0)}
                          disabled={safePage === 0}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >«</button>
                        <button
                          onClick={() => setDtrPage(p => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >‹ Prev</button>
                        <span className="px-2 text-xs text-slate-300 font-medium">{safePage + 1}</span>
                        <button
                          onClick={() => setDtrPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={safePage >= totalPages - 1}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >Next ›</button>
                        <button
                          onClick={() => setDtrPage(totalPages - 1)}
                          disabled={safePage >= totalPages - 1}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >»</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          <Link href="/admin/payroll/dubai" className="hover:text-slate-300">← Back to Dubai Payroll</Link>
        </div>
      </div>
    </div>
  );
}
