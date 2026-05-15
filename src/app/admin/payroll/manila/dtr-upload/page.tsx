"use client";

import {
  AlertCircle, CheckCircle2, ChevronLeft, ClipboardList,
  FileSpreadsheet, Info, Loader2, RefreshCw, Upload, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER } from "@/lib/ui-tokens";

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
  work_date: string;
  staff_name: string;
  actual_time_in: string;
  actual_time_out: string;
  regular_hours: string;
  overtime_hours: string;
  night_regular_hours: string;
  night_overtime_hours: string;
  late_minutes: string;
  undertime_minutes: string;
  day_type: string;
  is_scheduled_rest_day: boolean;
  absent_without_pay: boolean;
  paid_leave_flag: boolean;
};

type UploadResult = {
  inserted: number;
  updated: number;
  total: number;
  errors: { row_index: number; staff_name: string; work_date: string; message: string }[];
};

const DAY_TYPE_OPTIONS = [
  "ordinary_day",
  "rest_day",
  "regular_holiday",
  "regular_holiday_and_rest_day",
  "special_non_working_holiday",
  "special_holiday_and_rest_day",
];

const DAY_TYPE_LABELS: Record<string, string> = {
  ordinary_day:                  "Ordinary",
  rest_day:                      "Rest Day",
  regular_holiday:               "Reg. Holiday",
  regular_holiday_and_rest_day:  "Reg. Holiday + Rest",
  special_non_working_holiday:   "Special NW Holiday",
  special_holiday_and_rest_day:  "Special + Rest",
};

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseDtrCsv(text: string): DtrRow[] {
  const lines = text
    .trim()
    .split("\n")
    .filter(l => l.trim() && !l.trim().startsWith("#"));

  return lines.map((line, i) => {
    const cols = line.split(/[,\t]/).map(c => c.trim());
    if (cols.length < 2) throw new Error(`Row ${i + 1}: need at least 2 columns (date, staff_name)`);

    const [date, name, time_in = "", time_out = "", reg = "8", ot = "0",
           nreg = "0", not_ = "0", late = "0", ut = "0",
           day_type = "ordinary_day", rest_day = "N", awp = "N", leave = "N"] = cols;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${i + 1}: date must be YYYY-MM-DD, got "${date}"`);
    if (!name) throw new Error(`Row ${i + 1}: staff_name is required`);

    const isAWP  = awp.toUpperCase()  === "Y";
    const isLeave = leave.toUpperCase() === "Y";

    return {
      work_date:            date,
      staff_name:           name,
      actual_time_in:       time_in,
      actual_time_out:      time_out,
      regular_hours:        isAWP ? "0" : reg,
      overtime_hours:       isAWP ? "0" : ot,
      night_regular_hours:  isAWP ? "0" : nreg,
      night_overtime_hours: isAWP ? "0" : not_,
      late_minutes:         late,
      undertime_minutes:    ut,
      day_type:             DAY_TYPE_OPTIONS.includes(day_type) ? day_type : "ordinary_day",
      is_scheduled_rest_day: rest_day.toUpperCase() === "Y",
      absent_without_pay:   isAWP,
      paid_leave_flag:      isLeave,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DtrUploadPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) router.replace("/week");
  }, [router]);

  const [periods, setPeriods]         = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

  const [csvText, setCsvText]         = useState("");
  const [preview, setPreview]         = useState<DtrRow[] | null>(null);
  const [parsError, setParsError]     = useState("");
  const [uploading, setUploading]     = useState(false);
  const [result, setResult]           = useState<UploadResult | null>(null);

  const [activeTab, setActiveTab]     = useState<"paste" | "guide">("paste");

  // Load periods
  const loadPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    try {
      const r = await apiFetch(`${API}/periods`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { periods: Period[] };
      setPeriods((data.periods ?? []).slice().reverse()); // newest first
    } catch {
      // periods load is best-effort
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  // Parse CSV → preview
  function handleParse() {
    setParsError(""); setPreview(null); setResult(null);
    if (!csvText.trim()) { setParsError("Please paste CSV data first."); return; }
    try {
      const rows = parseDtrCsv(csvText);
      if (rows.length === 0) { setParsError("No rows parsed."); return; }
      setPreview(rows);
    } catch (e) { setParsError(String(e)); }
  }

  // Upload
  async function handleUpload() {
    if (!preview) return;
    setUploading(true); setResult(null);
    try {
      const r = await apiFetch(`${API}/attendance/bulk-upload`, {
        method: "POST",
        body: JSON.stringify({
          period_id: selectedPeriodId ? parseInt(selectedPeriodId) : null,
          rows: preview,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json() as UploadResult;
      setResult(res);
      if (res.errors.length === 0) {
        setPreview(null);
        setCsvText("");
      }
    } catch (e) {
      setParsError(`Upload error: ${String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setPreview(null); setCsvText(""); setParsError(""); setResult(null);
  }

  const selectedPeriod = periods.find(p => String(p.id) === selectedPeriodId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/admin/payroll/manila"
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
                <ChevronLeft size={15} /> Manila Payroll
              </Link>
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <ClipboardList size={28} className="text-violet-400" />
              DTR Upload
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Bulk import Daily Time Records into the attendance system
            </p>
          </div>
        </div>

        {/* Period selector */}
        <div className={GLASS_CARD + " p-4"}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Associate with Payroll Period (optional)
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedPeriodId}
              onChange={e => setSelectedPeriodId(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-violet-500 focus:outline-none min-w-[260px]"
            >
              <option value="">— No period association —</option>
              {periodsLoading
                ? <option disabled>Loading periods…</option>
                : periods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.period_label} ({p.start_date} – {p.end_date}) [{p.status}]
                    </option>
                  ))
              }
            </select>
            {selectedPeriod && (
              <span className="text-xs text-slate-400">
                {selectedPeriod.start_date} → {selectedPeriod.end_date}
              </span>
            )}
            <p className="text-xs text-slate-600 ml-auto">
              If selected, records are linked to that period for payroll computation.
            </p>
          </div>
        </div>

        {/* Tabs: Paste CSV / Format Guide */}
        <div className={TAB_CONTAINER}>
          <button
            onClick={() => setActiveTab("paste")}
            className={activeTab === "paste" ? TAB_ACTIVE : TAB_INACTIVE}
          >
            <FileSpreadsheet size={14} className="inline mr-1.5" />
            Paste CSV
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            className={activeTab === "guide" ? TAB_ACTIVE : TAB_INACTIVE}
          >
            <Info size={14} className="inline mr-1.5" />
            Format Guide
          </button>
        </div>

        {/* ── Format Guide tab ──────────────────────────────────────────── */}
        {activeTab === "guide" && (
          <div className={GLASS_CARD + " p-5 space-y-4"}>
            <h3 className="text-sm font-semibold text-white">CSV Format Specification</h3>

            <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-4 text-xs text-blue-200 leading-relaxed space-y-2">
              <p className="font-semibold text-blue-300">Column order (tab or comma separated):</p>
              <code className="block text-slate-300 font-mono bg-slate-800/60 rounded-lg p-3 whitespace-pre">
{`date          YYYY-MM-DD          (required)
staff_name    Employee name        (required — must match staff profiles)
time_in       HH:MM 24hr           (optional, e.g. 08:00)
time_out      HH:MM 24hr           (optional, e.g. 17:30)
reg_hours     Decimal              (default: 8.0 if not AWP)
ot_hours      Decimal              (default: 0)
night_reg     Decimal NSD reg hrs  (default: 0)
night_ot      Decimal NSD OT hrs   (default: 0)
late_min      Integer minutes      (default: 0)
ut_min        Integer minutes      (default: 0)
day_type      See valid values     (default: ordinary_day)
rest_day      Y / N               (default: N)
awp           Y / N — absent NP   (default: N)
paid_leave    Y / N               (default: N)`}
              </code>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">Valid day_type values:</p>
              <div className="flex flex-wrap gap-2">
                {DAY_TYPE_OPTIONS.map(dt => (
                  <code key={dt} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{dt}</code>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Example rows:</p>
              <code className="block text-xs text-slate-300 font-mono bg-slate-800/60 rounded-lg p-3 whitespace-pre leading-relaxed">
{`# Lines starting with # are ignored
# date, staff_name, time_in, time_out, reg_hrs, ot_hrs, nreg, not, late, ut, day_type, rest, awp, leave
2025-01-15, Juan Dela Cruz, 08:00, 17:00, 8, 0, 0, 0, 0, 0, ordinary_day, N, N, N
2025-01-15, Maria Santos, 08:00, 20:00, 8, 3, 0, 0, 0, 0, ordinary_day, N, N, N
2025-01-16, Juan Dela Cruz, , , 0, 0, 0, 0, 0, 0, ordinary_day, N, Y, N
2025-01-16, Maria Santos, , , 0, 0, 0, 0, 0, 0, ordinary_day, N, N, Y
2025-01-17, Juan Dela Cruz, 08:00, 17:00, 8, 2, 0, 2, 0, 0, special_non_working_holiday, N, N, N`}
              </code>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 text-xs text-amber-300">
              <AlertCircle size={13} className="inline mr-1.5" />
              <strong>Existing records are updated</strong> (ON CONFLICT UPDATE). Uploading the same date/staff replaces the previous values.
              Night hours (NSD) are not auto-computed — enter them explicitly if applicable.
            </div>
          </div>
        )}

        {/* ── Paste CSV tab ─────────────────────────────────────────────── */}
        {activeTab === "paste" && (
          <div className="space-y-4">
            {!preview && !result && (
              <div className={GLASS_CARD + " p-5 space-y-4"}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-white">Paste DTR Data (CSV)</label>
                  <button
                    onClick={() => setActiveTab("guide")}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <Info size={12} /> Format guide
                  </button>
                </div>
                <textarea
                  value={csvText}
                  onChange={e => { setCsvText(e.target.value); setParsError(""); setResult(null); }}
                  rows={12}
                  placeholder={"# date, staff_name, time_in, time_out, reg_hrs, ot_hrs, nreg, not, late, ut, day_type, rest_day, awp, paid_leave\n2025-01-15, Juan Dela Cruz, 08:00, 17:00, 8, 0, 0, 0, 0, 0, ordinary_day, N, N, N\n2025-01-15, Maria Santos, 08:00, 20:00, 8, 3, 0, 0, 0, 0, ordinary_day, N, N, N"}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300 font-mono placeholder-slate-700 focus:border-violet-500 focus:outline-none resize-none leading-relaxed"
                />

                {parsError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                    <AlertCircle size={13} /> {parsError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleParse}
                    disabled={!csvText.trim()}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    <FileSpreadsheet size={15} /> Parse & Preview
                  </button>
                </div>
              </div>
            )}

            {/* ── Preview table ──────────────────────────────────────── */}
            {preview && !result && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-400" />
                      {preview.length} rows parsed — review before uploading
                    </p>
                    {selectedPeriod && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Will be linked to: <span className="text-violet-300">{selectedPeriod.period_label}</span>
                      </p>
                    )}
                  </div>
                  <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
                    <X size={13} /> Clear
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "1000px" }}>
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-3 py-2 text-left text-slate-400">#</th>
                        <th className="px-3 py-2 text-left text-slate-400">Date</th>
                        <th className="px-3 py-2 text-left text-slate-400">Staff Name</th>
                        <th className="px-3 py-2 text-center text-slate-400">Time In</th>
                        <th className="px-3 py-2 text-center text-slate-400">Time Out</th>
                        <th className="px-3 py-2 text-right text-slate-400">Reg Hrs</th>
                        <th className="px-3 py-2 text-right text-slate-400">OT Hrs</th>
                        <th className="px-3 py-2 text-right text-slate-400">NSD</th>
                        <th className="px-3 py-2 text-right text-slate-400">Late</th>
                        <th className="px-3 py-2 text-left text-slate-400">Day Type</th>
                        <th className="px-3 py-2 text-center text-slate-400">Rest</th>
                        <th className="px-3 py-2 text-center text-slate-400">AWP</th>
                        <th className="px-3 py-2 text-center text-slate-400">Leave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${
                          row.absent_without_pay ? "bg-red-900/10" : row.paid_leave_flag ? "bg-blue-900/10" : ""
                        }`}>
                          <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-300">{row.work_date}</td>
                          <td className="px-3 py-1.5 font-medium text-white">{row.staff_name}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-slate-400">{row.actual_time_in || <span className="text-slate-700">—</span>}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-slate-400">{row.actual_time_out || <span className="text-slate-700">—</span>}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-emerald-300">{row.regular_hours}h</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-amber-300">
                            {parseFloat(row.overtime_hours) > 0 ? `${row.overtime_hours}h` : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                            {(parseFloat(row.night_regular_hours) + parseFloat(row.night_overtime_hours)) > 0
                              ? `${(parseFloat(row.night_regular_hours) + parseFloat(row.night_overtime_hours)).toFixed(1)}h`
                              : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                            {parseInt(row.late_minutes) > 0 ? `${row.late_minutes}m` : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="rounded-full px-1.5 py-0.5 text-xs bg-slate-800 text-slate-400">
                              {DAY_TYPE_LABELS[row.day_type] ?? row.day_type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center text-slate-500">
                            {row.is_scheduled_rest_day ? <span className="text-violet-400">R</span> : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.absent_without_pay ? <span className="text-red-400 font-semibold">AWP</span> : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.paid_leave_flag ? <span className="text-blue-400 font-semibold">SL/VL</span> : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-500">
                    <span className="text-amber-400">Note:</span> Existing records for the same date + staff will be <strong>overwritten</strong>.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={reset}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                    >
                      {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                      {uploading ? "Uploading…" : `Upload ${preview.length} Rows`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Upload result ─────────────────────────────────────── */}
            {result && (
              <div className="space-y-4">
                <div className={GLASS_CARD + " p-5"}>
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    Upload Complete
                  </h3>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="rounded-xl bg-emerald-900/20 border border-emerald-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-300">{result.inserted}</p>
                      <p className="text-xs text-slate-400 mt-0.5">New records inserted</p>
                    </div>
                    <div className="rounded-xl bg-blue-900/20 border border-blue-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-blue-300">{result.updated}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Existing records updated</p>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${result.errors.length > 0 ? "bg-red-900/20 border-red-500/20" : "bg-slate-800/60 border-white/10"}`}>
                      <p className={`text-2xl font-bold ${result.errors.length > 0 ? "text-red-300" : "text-slate-500"}`}>{result.errors.length}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Errors</p>
                    </div>
                  </div>

                  {result.errors.length > 0 && (
                    <div className="rounded-xl border border-red-500/20 bg-red-900/10 overflow-hidden">
                      <div className="border-b border-red-500/20 px-3 py-2">
                        <p className="text-xs font-semibold text-red-300">Row Errors — fix and re-upload these rows</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-red-500/10">
                            <th className="px-3 py-2 text-left text-red-400/70">Row</th>
                            <th className="px-3 py-2 text-left text-red-400/70">Staff</th>
                            <th className="px-3 py-2 text-left text-red-400/70">Date</th>
                            <th className="px-3 py-2 text-left text-red-400/70">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.errors.map((e, i) => (
                            <tr key={i} className="border-b border-red-500/10">
                              <td className="px-3 py-1.5 text-slate-500">{e.row_index + 1}</td>
                              <td className="px-3 py-1.5 text-slate-300">{e.staff_name}</td>
                              <td className="px-3 py-1.5 font-mono text-slate-400">{e.work_date}</td>
                              <td className="px-3 py-1.5 text-red-300">{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={reset}
                      className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors"
                    >
                      <RefreshCw size={14} /> Upload More
                    </button>
                    {selectedPeriodId && (
                      <Link
                        href={`/admin/payroll/manila/${selectedPeriodId}`}
                        className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 transition-colors"
                      >
                        Go to Period → Compute Payroll
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
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
