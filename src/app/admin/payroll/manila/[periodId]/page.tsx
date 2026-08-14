"use client";

import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown,
  ChevronUp, Clock, Download, Eye, EyeOff, History, Loader2, MinusCircle, PlusCircle,
  Play, Printer, Send, Trash2, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getAuth, canAccessPayrollAdmin, hasPayrollViewSalary } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

type Period = {
  id: number;
  period_label: string;
  period_half: number;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  first_half_period_id: number | null;
  status: "draft" | "approved" | "paid";
};

type Run = {
  id: number;
  period_id: number;
  staff_name: string;
  salary_type: string;
  daily_rate: number;
  monthly_rate: number | null;
  salary_divisor: number | null;
  days_worked: number | null;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  minimum_wage_compliant: boolean | null;
  status: string;
  computed_at: string | null;
  published_at: string | null;
  published_by: string | null;
};

type PayrollItem = {
  id: number;
  item_type: "earning" | "deduction" | "employer_cost" | "warning";
  item_code: string;
  label: string;
  quantity: number | null;
  unit_rate: number | null;
  amount: number;
  is_taxable: boolean;
  source: string;
  note: string | null;
};

type AttendanceRow = {
  id: number;
  staff_name: string;
  work_date: string;
  day_type: string;
  is_worked: boolean;
  actual_time_in: string | null;
  actual_time_out: string | null;
  late_minutes: number;
  undertime_minutes: number;
  absent_without_pay: boolean;
  paid_leave_flag: boolean;
  period_id: number | null;
  approved_ot_hours: number | null;
  actual_break_minutes: number | null;
  scheduled_shift_start: string | null;
};

type AdjItemType = "MANUAL_ADDITION" | "MANUAL_DEDUCTION" | "INCOME_TAX" | "LOAN_DEDUCTION";

type Adjustment = {
  id: number;
  period_id: number;
  staff_name: string;
  item_type: AdjItemType;
  amount: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

type DtrEditLogEntry = {
  id: number;
  dtr_record_id: number;
  staff_name: string;
  work_date: string;
  editor_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_at_phst: string | null;
};

type StaffProfileMin = {
  staff_name: string;
  monthly_rate: string | null;
  daily_rate: string | null;
  sss_number: string | null;
  philhealth_id: string | null;
  pagibig_mid: string | null;
  tin: string | null;
  bank_account_no: string | null;
  gcash_number: string | null;
};

type AttendanceStat = {
  staff_name: string;
  has_dtr: boolean;
  worked_days: number;
  absent_days: number;
  late_days: number;
  total_late_minutes: number;
};

type MissingEntry = { staff_name: string; missing: string[] };
type DtrIssue = {
  type: string;
  severity: "error" | "warning";
  staff_name: string;
  work_date: string;
  detail: string;
  fix: string;
  actual_time_in?: string;
  actual_time_out?: string;
};

const PAYROLL_REQUIRED = [
  { label: "Rate",       check: (p: StaffProfileMin) => !!(p.monthly_rate || p.daily_rate) },
  { label: "SSS No.",    check: (p: StaffProfileMin) => !!p.sss_number },
  { label: "PhilHealth", check: (p: StaffProfileMin) => !!p.philhealth_id },
  { label: "Pag-IBIG",   check: (p: StaffProfileMin) => !!p.pagibig_mid },
  { label: "TIN",        check: (p: StaffProfileMin) => !!p.tin },
  { label: "Bank/GCash", check: (p: StaffProfileMin) => !!(p.bank_account_no || p.gcash_number) },
];

function getMissingFields(p: StaffProfileMin | undefined): string[] {
  if (!p) return ["No profile"];
  return PAYROLL_REQUIRED.filter(f => !f.check(p)).map(f => f.label);
}

const fmtPHP = (v: number | null | undefined) =>
  v == null ? "—" : "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPHPAbs = (v: number | null | undefined) =>
  v == null ? "—" : "₱" + Math.abs(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-slate-700 text-slate-300",
  computed: "bg-blue-900/60 text-blue-300 border border-blue-500/30",
  approved: "bg-emerald-900/60 text-emerald-300 border border-emerald-500/30",
  paid:     "bg-violet-900/60 text-violet-300 border border-violet-500/30",
};

// ─── DTR Correction Modal ─────────────────────────────────────────────────────

// PHT timestamps are stored with +00 label (not actual UTC). Read UTC fields directly
// to get the correct Manila local time without applying a TZ conversion.
function isoToManilaInput(ts: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const yyyy = d.getUTCFullYear();
    const mo   = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd   = String(d.getUTCDate()).padStart(2, "0");
    const hh   = String(d.getUTCHours()).padStart(2, "0");
    const mi   = String(d.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mo}-${dd}T${hh}:${mi}`;
  } catch { return ""; }
}

// Store datetime-local as PHT with +00 label: append Z so the value is treated as UTC
// (the DB convention stores PHT time in a UTC-labelled column).
function manilaInputToISO(manilaStr: string): string {
  if (!manilaStr) return "";
  return new Date(manilaStr + "Z").toISOString();
}

// Auto-calculate late minutes from datetime-local input vs scheduled shift start ("HH:MM:SS").
// Mirrors the backend logic: overnight shifts (shift_start >= 14:00, clock-in < 08:00) = not late.
function calcLateMinutes(timeInValue: string, shiftStart: string | null): number {
  if (!shiftStart || !timeInValue) return 0;
  const timePart = timeInValue.split("T")[1];
  if (!timePart) return 0;
  const [ciH, ciM] = timePart.split(":").map(Number);
  const [ssH, ssM] = shiftStart.split(":").map(Number);
  if (ssH >= 14 && ciH < 8) return 0; // overnight: no late
  return Math.max(0, (ciH * 60 + ciM) - (ssH * 60 + ssM));
}

function DTRModal({
  run,
  periodId,
  period,
  onClose,
  onRecomputed,
}: {
  run: Run;
  periodId: number;
  period?: { start_date: string; end_date: string } | null;
  onClose: () => void;
  onRecomputed: () => void;
}) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // work_date being saved
  const [creating, setCreating] = useState<string | null>(null); // work_date being created
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState("");
  // editing state: work_date → {time_in, time_out, day_type}
  const [edits, setEdits] = useState<Record<string, { time_in: string; time_out: string; day_type: string; late_minutes: string; approved_ot_hours: string; break_minutes: string }>>({});
  // history: record_id whose edit log is being shown
  const [historyRecordId, setHistoryRecordId] = useState<number | null>(null);

  const loadRows = useCallback(() => {
    setLoading(true);
    apiFetch(`${API}/attendance/${periodId}?staff_name=${encodeURIComponent(run.staff_name)}`)
      .then(r => r.json())
      .then(d => {
        setRows(d as AttendanceRow[]);
        const initial: Record<string, { time_in: string; time_out: string; day_type: string; late_minutes: string; approved_ot_hours: string; break_minutes: string }> = {};
        (d as AttendanceRow[]).forEach(row => {
          initial[row.work_date] = {
            time_in:  isoToManilaInput(row.actual_time_in),
            time_out: isoToManilaInput(row.actual_time_out),
            day_type: row.day_type,
            late_minutes: String(row.late_minutes ?? 0),
            approved_ot_hours: row.approved_ot_hours != null ? String(row.approved_ot_hours) : "",
            break_minutes: row.actual_break_minutes != null ? String(row.actual_break_minutes) : "",
          };
        });
        setEdits(initial);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [run.staff_name, periodId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Generate all calendar dates in the period (YYYY-MM-DD strings).
  // Uses local Date constructor (not ISO strings) to avoid UTC off-by-one in +8/+9 timezones.
  const allDates: string[] = useMemo(() => {
    if (!period?.start_date || !period?.end_date) return [];
    const dates: string[] = [];
    const [sy, sm, sd] = period.start_date.split('-').map(Number);
    const [ey, em, ed] = period.end_date.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (cur <= end) {
      const y = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${mo}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [period?.start_date, period?.end_date]);

  const rowMap = useMemo(() => {
    const m: Record<string, AttendanceRow> = {};
    rows.forEach(r => { m[r.work_date] = r; });
    return m;
  }, [rows]);

  const saveRow = async (row: AttendanceRow) => {
    const ed = edits[row.work_date];
    if (!ed) return;
    setSaving(row.work_date);
    setError("");
    const isRestDay = ed.day_type === "rest_day";
    // If both times are cleared, treat as not worked (absent or rest)
    const hasTimeIn  = !!ed.time_in;
    const hasTimeOut = !!ed.time_out;
    const timesCleared = !hasTimeIn && !hasTimeOut;
    const derivedIsWorked = timesCleared ? false : (hasTimeIn ? true : row.is_worked);
    const derivedUndertime = timesCleared ? 0 : row.undertime_minutes;
    const derivedAWP = isRestDay ? false : (timesCleared ? true : row.absent_without_pay);
    try {
      const body: Record<string, unknown> = {
        day_type:             ed.day_type,
        is_worked:            derivedIsWorked,
        is_scheduled_rest_day: isRestDay,
        actual_time_in:  hasTimeIn  ? manilaInputToISO(ed.time_in)  : null,
        actual_time_out: hasTimeOut ? manilaInputToISO(ed.time_out) : null,
        late_minutes:    parseInt(ed.late_minutes || "0", 10) || 0,
        undertime_minutes: derivedUndertime,
        // rest_day → no absent deduction regardless of is_worked; clear the AWP flag
        absent_without_pay: derivedAWP,
        paid_leave_flag: row.paid_leave_flag,
        period_id:  row.period_id ?? periodId,
        approval_status: "approved",
        approved_ot_hours: ed.approved_ot_hours !== "" ? parseFloat(ed.approved_ot_hours) : null,
        actual_break_minutes: ed.break_minutes !== "" ? parseInt(ed.break_minutes, 10) : null,
      };
      const r = await apiFetch(
        `${API}/attendance/${encodeURIComponent(run.staff_name)}/${row.work_date}`,
        { method: "PUT", body: JSON.stringify(body) }
      );
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json() as AttendanceRow;
      setRows(prev => prev.map(x => x.work_date === row.work_date ? { ...x, ...updated } : x));
      setEdits(prev => ({ ...prev, [row.work_date]: { ...prev[row.work_date], day_type: updated.day_type, break_minutes: updated.actual_break_minutes != null ? String(updated.actual_break_minutes) : "" } }));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const createRow = async (workDate: string, dayType: "ordinary_day" | "rest_day") => {
    setCreating(workDate);
    setError("");
    const isRestDay = dayType === "rest_day";
    try {
      const body: Record<string, unknown> = {
        day_type: dayType,
        is_worked: false,
        is_scheduled_rest_day: isRestDay,
        actual_time_in: null,
        actual_time_out: null,
        late_minutes: 0,
        undertime_minutes: 0,
        absent_without_pay: !isRestDay,
        paid_leave_flag: false,
        period_id: periodId,
        approval_status: "approved",
      };
      const r = await apiFetch(
        `${API}/attendance/${encodeURIComponent(run.staff_name)}/${workDate}`,
        { method: "PUT", body: JSON.stringify(body) }
      );
      if (!r.ok) throw new Error(await r.text());
      const created = await r.json() as AttendanceRow;
      setRows(prev => [...prev, created].sort((a, b) => a.work_date.localeCompare(b.work_date)));
      setEdits(prev => ({
        ...prev,
        [workDate]: { time_in: "", time_out: "", day_type: created.day_type, late_minutes: "0", approved_ot_hours: "", break_minutes: "" },
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(null);
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/runs/${run.id}/compute`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      onRecomputed();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-none flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              Edit DTR — {run.staff_name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Correct clock-in / clock-out times. Save each row, then click Recompute.
            </p>
            <p className="text-[10px] text-amber-400/70 mt-1">
              ⏱ All times are in Philippine Standard Time (UTC+8)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
              <AlertCircle size={12}/> {error}
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-400"/>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-slate-500">
                  <th className="py-2 text-left font-medium w-24">Date</th>
                  <th className="py-2 text-left font-medium">Day Type</th>
                  <th className="py-2 text-left font-medium w-12">Status</th>
                  <th className="py-2 text-left font-medium">Time In</th>
                  <th className="py-2 text-left font-medium">Time Out</th>
                  <th className="py-2 text-left font-medium w-16" title="Late arrival in minutes">Late (min)</th>
                  <th className="py-2 text-left font-medium w-16" title="Actual break duration in minutes (blank = use system default 60 min)">Break (min)</th>
                  <th className="py-2 text-left font-medium w-16" title="Approved overtime hours">OT Appr. (h)</th>
                  <th className="py-2 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(allDates.length > 0 ? allDates : rows.map(r => r.work_date)).map(date => {
                  const row = rowMap[date];
                  const isCreating = creating === date;

                  if (!row) {
                    // Date has no record — show placeholder with create buttons
                    return (
                      <tr key={date} className="border-b border-white/5 bg-slate-800/30">
                        <td className="py-2 pr-2 font-mono text-slate-500">{date}</td>
                        <td className="py-2 pr-2 text-slate-600 italic" colSpan={3}>— no record —</td>
                        <td className="py-2 pr-2" />
                        <td className="py-2 pr-2" />
                        <td className="py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => createRow(date, "ordinary_day")}
                              disabled={isCreating}
                              title="Mark as absent (ordinary day, no pay)"
                              className="rounded border border-red-500/30 bg-red-900/20 px-2 py-1 text-red-300 hover:bg-red-900/40 disabled:opacity-40 text-[10px]"
                            >
                              {isCreating ? <Loader2 size={10} className="animate-spin inline" /> : "Absent"}
                            </button>
                            <button
                              onClick={() => createRow(date, "rest_day")}
                              disabled={isCreating}
                              title="Mark as scheduled rest day (no deduction)"
                              className="rounded border border-violet-500/30 bg-violet-900/20 px-2 py-1 text-violet-300 hover:bg-violet-900/40 disabled:opacity-40 text-[10px]"
                            >
                              {isCreating ? <Loader2 size={10} className="animate-spin inline" /> : "Rest Day"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Existing row — show editable fields
                  const ed = edits[row.work_date] ?? { time_in: "", time_out: "", day_type: row.day_type, late_minutes: String(row.late_minutes ?? 0), approved_ot_hours: row.approved_ot_hours != null ? String(row.approved_ot_hours) : "", break_minutes: row.actual_break_minutes != null ? String(row.actual_break_minutes) : "" };
                  const isSaving = saving === row.work_date;
                  const currentDayType = ed.day_type;

                  // Row background color by status
                  let rowBg = "hover:bg-white/5";
                  if (currentDayType === "rest_day") rowBg = "bg-violet-950/20 hover:bg-violet-950/30";
                  else if (!row.is_worked && currentDayType === "ordinary_day") rowBg = "bg-red-950/20 hover:bg-red-950/30";
                  else if (row.is_worked) rowBg = "bg-emerald-950/10 hover:bg-emerald-950/20";

                  return (
                    <tr key={row.work_date} className={`border-b border-white/5 ${rowBg}`}>
                      <td className="py-2 pr-2 font-mono text-slate-300">{row.work_date}</td>
                      <td className="py-2 pr-2">
                        <select
                          value={currentDayType}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [row.work_date]: { ...prev[row.work_date], day_type: e.target.value },
                          }))}
                          className="rounded border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 focus:border-blue-500/60 focus:outline-none"
                        >
                          <option value="ordinary_day">Ordinary</option>
                          <option value="rest_day">Rest Day</option>
                          <option value="regular_holiday">Regular Holiday</option>
                          <option value="special_non_working_holiday">Special Holiday</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        {row.is_worked
                          ? <span className="text-emerald-400 font-semibold">✓</span>
                          : row.paid_leave_flag
                            ? <span className="text-blue-400">SL/VL</span>
                            : <span className="text-red-400/60">Abs</span>}
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="datetime-local"
                          value={ed.time_in}
                          onChange={e => {
                            const newTimeIn = e.target.value;
                            const autoLate = calcLateMinutes(newTimeIn, row.scheduled_shift_start);
                            setEdits(prev => ({
                              ...prev,
                              [row.work_date]: { ...prev[row.work_date], time_in: newTimeIn, late_minutes: String(autoLate) }
                            }));
                          }}
                          className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-white text-xs focus:border-blue-500/60 focus:outline-none"
                          style={{ colorScheme: "dark" }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="datetime-local"
                          value={ed.time_out}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [row.work_date]: { ...prev[row.work_date], time_out: e.target.value }
                          }))}
                          className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-white text-xs focus:border-blue-500/60 focus:outline-none"
                          style={{ colorScheme: "dark" }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          max="480"
                          step="1"
                          value={ed.late_minutes}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [row.work_date]: { ...prev[row.work_date], late_minutes: e.target.value }
                          }))}
                          className="w-14 rounded border border-white/10 bg-slate-800 px-1.5 py-1 text-white text-xs focus:border-amber-500/60 focus:outline-none"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          max="480"
                          step="1"
                          value={ed.break_minutes}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [row.work_date]: { ...prev[row.work_date], break_minutes: e.target.value }
                          }))}
                          className="w-14 rounded border border-white/10 bg-slate-800 px-1.5 py-1 text-white text-xs focus:border-teal-500/60 focus:outline-none"
                          placeholder="60"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.25"
                          value={ed.approved_ot_hours}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [row.work_date]: { ...prev[row.work_date], approved_ot_hours: e.target.value }
                          }))}
                          className="w-16 rounded border border-white/10 bg-slate-800 px-1.5 py-1 text-white text-xs focus:border-violet-500/60 focus:outline-none"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={isSaving}
                            className="rounded-lg border border-blue-500/30 bg-blue-900/30 px-2 py-1 text-blue-300 hover:bg-blue-900/50 disabled:opacity-40 text-xs"
                          >
                            {isSaving ? <Loader2 size={10} className="animate-spin inline" /> : "Save"}
                          </button>
                          <button
                            onClick={() => setHistoryRecordId(row.id)}
                            title="View edit history"
                            className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                          >
                            <History size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
            Close
          </button>
          <button
            onClick={recompute}
            disabled={recomputing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {recomputing ? <Loader2 size={14} className="animate-spin"/> : <Play size={14}/>}
            Recompute Payroll
          </button>
        </div>
      </div>

      {historyRecordId !== null && (
        <DtrHistoryModal
          recordId={historyRecordId}
          onClose={() => setHistoryRecordId(null)}
        />
      )}
    </div>
  );
}

// ─── DTR History Modal ─────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  actual_time_in:      "Time In",
  actual_time_out:     "Time Out",
  day_type:            "Day Type",
  is_worked:           "Worked",
  late_minutes:        "Late (min)",
  undertime_minutes:   "Undertime (min)",
  absent_without_pay:  "AWP",
  paid_leave_flag:     "Paid Leave",
  actual_break_minutes:"Break (min)",
  approved_ot_hours:   "Approved OT (h)",
  scheduled_shift_start: "Shift Start",
  scheduled_shift_end:   "Shift End",
};

function formatDtrValue(field: string, value: string | null): string {
  if (value === null || value === "None" || value === "none") return "—";
  if (field === "actual_time_in" || field === "actual_time_out") {
    // Show only HH:MM from ISO timestamp
    const m = value.match(/T?(\d{2}:\d{2})/);
    if (m) return m[1];
    return value;
  }
  if (field === "is_worked" || field === "absent_without_pay" || field === "paid_leave_flag") {
    return value === "True" || value === "true" ? "Yes" : "No";
  }
  return value;
}

function DtrHistoryModal({ recordId, onClose }: { recordId: number; onClose: () => void }) {
  const [entries, setEntries] = useState<DtrEditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API}/dtr-edit-log?record_id=${recordId}`)
      .then(r => r.json())
      .then((d: DtrEditLogEntry[]) => setEntries(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [recordId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex-none flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <History size={14} className="text-slate-400" />
            DTR Edit History
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-xs text-red-400 mb-3">{error}</p>
          )}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400"/>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No edit history for this record.</p>
          ) : (
            <div className="space-y-2">
              {entries.map(e => (
                <div key={e.id} className="rounded-lg border border-white/5 bg-slate-800/60 px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-200">
                      {FIELD_LABELS[e.field_name] ?? e.field_name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {e.edited_at_phst ? e.edited_at_phst.replace("T", " ").slice(0, 16) + " PHT" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-400/80 line-through">
                      {formatDtrValue(e.field_name, e.old_value)}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className="text-emerald-400">
                      {formatDtrValue(e.field_name, e.new_value)}
                    </span>
                  </div>
                  {e.editor_name && (
                    <p className="text-[10px] text-slate-500 mt-1">by {e.editor_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-none border-t border-white/10 px-5 py-3 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Manual Adjustment Modal ──────────────────────────────────────────────────

function AdjustmentModal({
  run,
  periodId,
  onClose,
  onRecomputed,
}: {
  run: Run;
  periodId: number;
  onClose: () => void;
  onRecomputed: () => void;
}) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState("");
  // new-item form
  const [newType, setNewType] = useState<AdjItemType>("MANUAL_ADDITION");
  const [newAmount, setNewAmount] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  const loadAdj = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(
        `${API}/adjustments?period_id=${periodId}&staff_name=${encodeURIComponent(run.staff_name)}`
      );
      setAdjustments(await r.json() as Adjustment[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [run.staff_name, periodId]);

  useEffect(() => { void loadAdj(); }, [loadAdj]);

  const addAdjustment = async () => {
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) { setError("Amount must be a positive number"); return; }
    setAdding(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          period_id:  periodId,
          staff_name: run.staff_name,
          item_type:  newType,
          amount:     amt,
          reason:     newReason.trim() || null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setNewAmount("");
      setNewReason("");
      await loadAdj();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  };

  const deleteAdj = async (id: number) => {
    setError("");
    try {
      const r = await apiFetch(`${API}/adjustments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setAdjustments(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      setError(String(e));
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/runs/${run.id}/compute`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      onRecomputed();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-lg max-h-[90vh] rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-none flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <PlusCircle size={16} className="text-violet-400"/>
              Manual Adjustments — {run.staff_name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Add one-off additions, deductions, income tax, or loan repayments.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
              <AlertCircle size={12}/> {error}
            </div>
          )}

          {/* Existing adjustments */}
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-violet-400"/></div>
          ) : adjustments.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-4">No manual adjustments yet.</p>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-hidden">
              {adjustments.map((adj, idx) => (
                <div
                  key={adj.id}
                  className={`flex items-center justify-between px-4 py-3 ${idx < adjustments.length-1 ? "border-b border-white/5" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {adj.item_type === "MANUAL_ADDITION"
                        ? <PlusCircle size={13} className="text-emerald-400 flex-none"/>
                        : <MinusCircle size={13} className="text-red-400 flex-none"/>}
                      <span className={`text-sm font-medium ${adj.item_type === "MANUAL_ADDITION" ? "text-emerald-300" : "text-red-300"}`}>
                        {adj.item_type === "MANUAL_ADDITION" ? "+" : "−"}{fmtPHP(adj.amount)}
                      </span>
                      {adj.item_type !== "MANUAL_ADDITION" && adj.item_type !== "MANUAL_DEDUCTION" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                          {adj.item_type === "INCOME_TAX" ? "Tax" : "Loan"}
                        </span>
                      )}
                    </div>
                    {adj.reason && <p className="text-xs text-slate-500 mt-0.5 ml-5">{adj.reason}</p>}
                    <p className="text-[10px] text-slate-600 mt-0.5 ml-5">
                      {new Date(adj.created_at).toLocaleDateString("en-PH")}
                      {adj.created_by && ` · ${adj.created_by}`}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteAdj(adj.id)}
                    className="ml-3 text-slate-600 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Add Adjustment</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setNewType("MANUAL_ADDITION")}
                className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                  newType === "MANUAL_ADDITION"
                    ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-300"
                    : "border-white/10 bg-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                <PlusCircle size={12}/> Addition
              </button>
              <button
                onClick={() => setNewType("MANUAL_DEDUCTION")}
                className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                  newType === "MANUAL_DEDUCTION"
                    ? "border-red-500/40 bg-red-900/30 text-red-300"
                    : "border-white/10 bg-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                <MinusCircle size={12}/> Deduction
              </button>
              <button
                onClick={() => setNewType("INCOME_TAX")}
                className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                  newType === "INCOME_TAX"
                    ? "border-amber-500/40 bg-amber-900/30 text-amber-300"
                    : "border-white/10 bg-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                <MinusCircle size={12}/> Income Tax
              </button>
              <button
                onClick={() => setNewType("LOAN_DEDUCTION")}
                className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                  newType === "LOAN_DEDUCTION"
                    ? "border-orange-500/40 bg-orange-900/30 text-orange-300"
                    : "border-white/10 bg-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                <MinusCircle size={12}/> Loan Repayment
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-slate-500 mb-1">Amount (PHP)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500/60 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Reason / Note</label>
              <input
                type="text"
                placeholder="e.g. Missed overtime 2025-05-10, Cash advance, etc."
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500/60 focus:outline-none"
              />
            </div>
            <button
              onClick={addAdjustment}
              disabled={adding || !newAmount}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {adding ? <Loader2 size={13} className="animate-spin"/> : <PlusCircle size={13}/>}
              Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
            Close
          </button>
          <button
            onClick={recompute}
            disabled={recomputing}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {recomputing ? <Loader2 size={14} className="animate-spin"/> : <Play size={14}/>}
            Recompute Payroll
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payslip detail (right panel) ────────────────────────────────────────────

function PayslipDetail({
  run,
  items,
  itemsLoading,
  periodId,
  onApprove,
  onPublish,
  onUnpublish,
  onDelete,
  onClose,
  onRecomputed,
  period,
  profileMonthlyRate,
  canSeeSalary,
}: {
  run: Run;
  items: PayrollItem[];
  itemsLoading: boolean;
  periodId: number;
  onApprove: (id: number) => void;
  onPublish: (id: number) => void;
  onUnpublish: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onClose: () => void;
  onRecomputed: () => void;
  period: Period | null;
  profileMonthlyRate?: number | null;
  canSeeSalary: boolean;
}) {
  const [showDTR, setShowDTR]         = useState(false);
  const [showAdj, setShowAdj]         = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  async function deleteManualItem(item: PayrollItem) {
    if (!confirm(`Delete manual ${item.item_type === "earning" ? "addition" : "deduction"}: "${item.label}" (₱${Math.abs(item.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })})?`)) return;
    setDeletingId(item.id);
    try {
      // Fetch all adjustments for this staff/period to find the matching one
      const adjType = item.item_type === "earning" ? "MANUAL_ADDITION" : "MANUAL_DEDUCTION";
      const res = await apiFetch(`${API}/adjustments?period_id=${periodId}&staff_name=${encodeURIComponent(run.staff_name)}`);
      if (!res.ok) throw new Error("Failed to load adjustments");
      const adjs: { id: number; item_type: string; amount: number }[] = await res.json();
      const match = adjs.find(a => a.item_type === adjType && Math.abs(a.amount - Math.abs(item.amount)) < 0.01);
      if (!match) { alert("Could not find matching adjustment record. Please use the Adjust button to delete it."); return; }
      const del = await apiFetch(`${API}/adjustments/${match.id}`, { method: "DELETE" });
      if (!del.ok) throw new Error("Delete failed");
      // Recompute to reflect the deletion
      const recomp = await apiFetch(`${API}/runs/${run.id}/compute`, { method: "POST" });
      if (!recomp.ok) throw new Error("Recompute failed");
      onRecomputed();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error deleting adjustment");
    } finally {
      setDeletingId(null);
    }
  }

  function itemFormula(code: string): string | null {
    const mr = run.monthly_rate;
    switch (code) {
      case "PHILHEALTH_EE": {
        if (!mr) return "monthly basic × 5% ÷ 2 (50% per cut-off, EE share)";
        const clamped = Math.max(Math.min(mr, 100000), 10000);
        const ee = clamped * 0.05 / 2;
        return `min(max(₱${mr.toLocaleString("en-PH")}, ₱10k), ₱100k) × 5% ÷ 2 = ${fmtPHP(ee)} (50% this cut-off)`;
      }
      case "PHILHEALTH_ER":    return "Employer mirrors employee contribution (50% this cut-off)";
      case "SSS_EE":           return "SSS MSC table (EE share) × 50% — split across both cut-offs";
      case "SSS_ER":           return "SSS MSC table (ER 9.5% + EC) × 50% — split across both cut-offs";
      case "SSS_EC":           return "Employees' Compensation — employer cost only";
      case "SSS_WISP_EE":      return "WISP portion: MSC > ₱20,000 (EE share) × 50%";
      case "SSS_WISP_ER":      return "WISP portion: MSC > ₱20,000 (ER share) × 50%";
      case "PAGIBIG_EE":       return mr ? `min(₱${mr.toLocaleString("en-PH")} + COLA, ₱10,000) × 2% ÷ 2 (50% this cut-off)` : "2% of base up to ₱10,000 ÷ 2";
      case "PAGIBIG_ER":       return "Employer contribution = 2% of same base × 50%";
      case "PAGIBIG_VOLUNTARY_EE": return "Voluntary Pag-IBIG × 50% (split across both cut-offs)";
      case "BIR_WITHHOLDING":  return "TRAIN 2023 table: monthly WHT ÷ 2 (50% per cut-off)";
      default: return null;
    }
  }

  // 13TH_MONTH_ACCRUAL is a reference-only line (paid Dec 2H) — excluded from
  // displayed earnings so it doesn't inflate the visible Gross Pay figure.
  // ND items are always emitted (even ₱0) so they appear on payslip even with
  // incomplete DTR — include them regardless of amount.
  const ND_CODES = new Set(["NIGHT_DIFF_REGULAR", "NIGHT_DIFF_OT"]);
  const warnings      = items.filter(i => i.item_type === "warning");
  const earnings      = items.filter(i => i.item_type === "earning" && i.item_code !== "13TH_MONTH_ACCRUAL" && (i.amount > 0 || ND_CODES.has(i.item_code)));
  const deductions    = items.filter(i => i.item_type === "deduction");
  const employerCosts = items.filter(i => i.item_type === "employer_cost");

  const earningsTotal   = earnings.reduce((s, i) => s + i.amount, 0);
  const deductionsTotal = deductions.reduce((s, i) => s + Math.abs(i.amount), 0);

  // Computation basis string
  const basisParts: string[] = [];
  if (run.monthly_rate != null && run.salary_divisor != null && run.days_worked != null) {
    basisParts.push(
      `₱${run.monthly_rate.toLocaleString("en-PH")} ÷ ${run.salary_divisor} × ${run.days_worked} day(s) = ₱${((run.monthly_rate / run.salary_divisor) * run.days_worked).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    );
  } else if (run.daily_rate && run.days_worked != null) {
    basisParts.push(`₱${run.daily_rate.toLocaleString("en-PH")}/day × ${run.days_worked} day(s)`);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {showDTR && (
        <DTRModal
          run={run}
          periodId={periodId}
          period={period}
          onClose={() => setShowDTR(false)}
          onRecomputed={() => { setShowDTR(false); onRecomputed(); }}
        />
      )}
      {showAdj && (
        <AdjustmentModal
          run={run}
          periodId={periodId}
          onClose={() => setShowAdj(false)}
          onRecomputed={() => { setShowAdj(false); onRecomputed(); }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex-none border-b border-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-y-2">
          <div>
            <h2 className="text-lg font-semibold text-white">{run.staff_name}</h2>
            {period && (
              <p className="text-xs text-violet-300/80 font-medium mt-0.5">
                {period.period_label} &nbsp;·&nbsp; {period.start_date} → {period.end_date}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {run.salary_type === "monthly" ? "Monthly" : "Daily"}
              &nbsp;·&nbsp;Monthly Rate: {canSeeSalary ? fmtPHP(run.monthly_rate) : <span className="font-mono text-slate-600">₱ ****</span>}
              &nbsp;·&nbsp;Divisor: {run.salary_divisor != null ? Number(run.salary_divisor).toFixed(2) : "—"}
              &nbsp;·&nbsp;Days Worked: {run.days_worked ?? "—"}
              {canSeeSalary && run.monthly_rate != null && run.salary_divisor != null && (
                <>&nbsp;·&nbsp;<span className="text-violet-300/80">Hourly: {fmtPHP(run.monthly_rate / run.salary_divisor / 8)}/hr</span></>
              )}
            </p>
            {canSeeSalary && basisParts.length > 0 && (
              <p className="text-xs text-violet-300/70 mt-1 font-mono">
                Basic Pay: {basisParts.join(" + ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2 shrink-0 flex-wrap justify-end">
            {/* DTR correction button */}
            <button
              onClick={() => setShowDTR(true)}
              className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-900/20 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-900/40"
              title="Edit clock-in / clock-out times"
            >
              <Clock size={12}/> Edit DTR
            </button>
            {/* Manual adjustment button */}
            <button
              onClick={() => setShowAdj(true)}
              className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-900/20 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-900/40"
              title="Add manual addition or deduction"
            >
              <PlusCircle size={12}/> Adjust
            </button>
            {run.status === "computed" && (
              <button
                onClick={() => onApprove(run.id)}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/50"
              >
                <CheckCircle2 size={12} /> Approve
              </button>
            )}
            {/* Publish / Unpublish */}
            {run.published_at ? (
              <button
                onClick={() => onUnpublish(run.id)}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/40"
                title="Unpublish"
              >
                <EyeOff size={12} /> Unpublish
              </button>
            ) : (
              <button
                onClick={() => onPublish(run.id)}
                disabled={!["approved","paid","computed"].includes(run.status)}
                className="flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-900/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Publish to staff My Pay"
              >
                <Send size={12} /> Publish
              </button>
            )}
            <button
              onClick={() => onDelete(run.id, run.staff_name)}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-900/20 p-1.5 text-xs text-red-400 hover:bg-red-900/40"
              title="Delete this payroll run"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 p-1.5 text-xs text-slate-300 hover:bg-slate-700"
              title="Print / Save as PDF"
            >
              <Printer size={12} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        {profileMonthlyRate != null && run.monthly_rate != null &&
         Math.abs(profileMonthlyRate - run.monthly_rate) > 1 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-900/20 px-3 py-2 text-xs text-orange-300">
            <AlertTriangle size={12} />
            {canSeeSalary
              ? <>Salary mismatch: this run used ₱{run.monthly_rate.toLocaleString("en-PH")} but the Staff Profile now shows ₱{profileMonthlyRate.toLocaleString("en-PH")}. Click &quot;Compute All&quot; to recompute with the updated rate.</>
              : <>Salary mismatch detected — amounts hidden. Click &quot;Compute All&quot; to recompute with the updated rate.</>}
          </div>
        )}

        {run.minimum_wage_compliant === false && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle size={12} /> Daily rate is below minimum wage (₱695/day)
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-900/20 px-3 py-2 text-xs text-orange-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold">{w.label}</span>
                  {w.note && <p className="mt-0.5 text-orange-400/70">{w.note}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Published badge */}
        {run.published_at && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
            <Eye size={12} />
            Published to staff — {new Date(run.published_at).toLocaleString("en-US")}
            {run.published_by && <span className="text-emerald-400/60 ml-1">by {run.published_by}</span>}
          </div>
        )}

        {/* ── Formula banner: Gross Pay − Deductions = Net Pay ── */}
        <div className="mt-4 flex items-stretch gap-1 rounded-xl overflow-hidden border border-white/10 text-center">
          {/* Gross */}
          <div className="flex-1 bg-slate-800/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Gross Pay</p>
            <p className="text-base font-bold text-white tabular-nums">{canSeeSalary ? fmtPHP(run.gross_pay) : <span className="font-mono text-slate-500">₱ ****</span>}</p>
          </div>
          {/* Minus sign */}
          <div className="flex items-center justify-center bg-slate-900/60 px-2 text-xl font-light text-slate-500 select-none">
            −
          </div>
          {/* Deductions */}
          <div className="flex-1 bg-slate-800/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Total Deductions</p>
            <p className="text-base font-bold text-red-300 tabular-nums">{canSeeSalary ? fmtPHPAbs(run.total_deductions) : <span className="font-mono text-slate-500">₱ ****</span>}</p>
          </div>
          {/* Equals sign */}
          <div className="flex items-center justify-center bg-slate-900/60 px-2 text-xl font-light text-slate-500 select-none">
            =
          </div>
          {/* Net pay */}
          <div className="flex-1 bg-gradient-to-br from-violet-900/70 to-purple-900/70 border-l border-violet-500/20 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-300 mb-1">Net Pay</p>
            <p className="text-base font-bold text-emerald-300 tabular-nums">{canSeeSalary ? fmtPHP(run.net_pay) : <span className="font-mono text-slate-500">₱ ****</span>}</p>
          </div>
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {itemsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-violet-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            Not yet computed. Click &quot;Compute All&quot; to generate payroll.
          </p>
        ) : (
          <>
            {/* ── Earnings ── */}
            {earnings.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/80">
                    Earnings
                  </p>
                  <span className="text-xs text-slate-500">Subtotal</span>
                </div>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {earnings.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        idx < earnings.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/5`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-slate-200">{item.label}</p>
                          {item.source === "manual" && (
                            <span className="rounded-full border border-violet-500/30 bg-violet-900/20 px-1.5 py-0.5 text-[9px] text-violet-400 uppercase tracking-wide">Manual</span>
                          )}
                        </div>
                        {item.quantity != null && item.unit_rate != null && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.quantity} day(s) × {canSeeSalary ? `₱${item.unit_rate.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "₱ ****"}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs text-slate-500 mt-0.5">{item.note}</p>
                        )}
                        {item.is_taxable && (
                          <span className="text-[10px] text-slate-600">Taxable</span>
                        )}
                      </div>
                      <div className="ml-4 flex items-center gap-2 shrink-0">
                        <span className="tabular-nums text-sm font-semibold text-emerald-300">
                          {canSeeSalary ? fmtPHP(item.amount) : "₱ ****"}
                        </span>
                        {item.source === "manual" && (
                          <button
                            onClick={() => deleteManualItem(item)}
                            disabled={deletingId === item.id}
                            className="text-slate-600 hover:text-red-400 disabled:opacity-50"
                            title="Delete this manual addition"
                          >
                            {deletingId === item.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Earnings subtotal */}
                  <div className="flex items-center justify-between bg-emerald-900/20 border-t border-emerald-500/20 px-4 py-2.5">
                    <p className="text-xs font-bold text-emerald-400/80 uppercase tracking-wide">Total Earnings</p>
                    <span className="tabular-nums text-sm font-bold text-emerald-300">{canSeeSalary ? fmtPHP(earningsTotal) : "₱ ****"}</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Deductions ── */}
            {deductions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-400/80">
                    Deductions
                  </p>
                  <span className="text-xs text-slate-500">Amount Deducted</span>
                </div>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {deductions.map((item, idx) => {
                    const formula = itemFormula(item.item_code);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start justify-between px-4 py-3 ${
                          idx < deductions.length - 1 ? "border-b border-white/5" : ""
                        } hover:bg-white/5`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-slate-200">{item.label}</p>
                            {item.source === "manual" && (
                              <span className="rounded-full border border-red-500/30 bg-red-900/20 px-1.5 py-0.5 text-[9px] text-red-400 uppercase tracking-wide">Manual</span>
                            )}
                          </div>
                          {formula && canSeeSalary && (
                            <p className="text-[10px] text-slate-500 mt-0.5 font-mono leading-relaxed">{formula}</p>
                          )}
                          {item.note && (
                            <p className="text-xs text-slate-500 mt-0.5">{item.note}</p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center gap-2 shrink-0">
                          <span className="tabular-nums text-sm font-semibold text-red-300">
                            {canSeeSalary ? `(${fmtPHPAbs(item.amount)})` : "(****)"}
                          </span>
                          {item.source === "manual" && (
                            <button
                              onClick={() => deleteManualItem(item)}
                              disabled={deletingId === item.id}
                              className="text-slate-600 hover:text-red-400 disabled:opacity-50"
                              title="Delete this manual deduction"
                            >
                              {deletingId === item.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Deductions subtotal */}
                  <div className="flex items-center justify-between bg-red-900/20 border-t border-red-500/20 px-4 py-2.5">
                    <p className="text-xs font-bold text-red-400/80 uppercase tracking-wide">Total Deductions</p>
                    <span className="tabular-nums text-sm font-bold text-red-300">{canSeeSalary ? `(${fmtPHP(deductionsTotal)})` : "(****)"}</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Net pay recap ── */}
            {(earnings.length > 0 || deductions.length > 0) && (
              <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-900/40 to-purple-900/40 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-violet-300/70 uppercase tracking-wide font-semibold mb-0.5">Net Pay</p>
                    {canSeeSalary && (
                      <p className="text-[11px] text-slate-500">
                        {fmtPHP(earningsTotal)} − {fmtPHP(deductionsTotal)}
                      </p>
                    )}
                  </div>
                  <p className="text-2xl font-black text-emerald-300 tabular-nums">{canSeeSalary ? fmtPHP(run.net_pay) : "₱ ****"}</p>
                </div>
              </div>
            )}

            {/* ── Employer costs (reference) ── */}
            {employerCosts.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                  Employer Costs (not deducted from employee — reference only)
                </p>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {employerCosts.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        idx < employerCosts.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/5`}
                    >
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <span className="text-xs text-slate-500 tabular-nums">{canSeeSalary ? fmtPHP(item.amount) : "₱ ****"}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-slate-800/60 border-t border-white/5 px-4 py-2">
                    <p className="text-xs text-slate-600 uppercase tracking-wide">Total Employer Costs</p>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {canSeeSalary ? fmtPHP(employerCosts.reduce((s, i) => s + i.amount, 0)) : "₱ ****"}
                    </span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ManilaPayrollPeriodPage() {
  const router   = useRouter();
  const params   = useParams();
  const periodId = Number(params.periodId);

  const [period, setPeriod]       = useState<Period | null>(null);
  const [runs, setRuns]           = useState<Run[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [computing, setComputing] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [items, setItems]         = useState<PayrollItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [sortBy, setSortBy]       = useState<"name"|"net">("name");
  const [sortDir, setSortDir]     = useState<"asc"|"desc">("asc");
  const [profiles, setProfiles]   = useState<Map<string, StaffProfileMin>>(new Map());
  const [attSummary, setAttSummary] = useState<AttendanceStat[]>([]);
  const [showAttSummary, setShowAttSummary] = useState(false);
  const [computeCheckEntries, setComputeCheckEntries] = useState<MissingEntry[]>([]);
  const [dtrIssues, setDtrIssues] = useState<{ errors: DtrIssue[]; warnings: DtrIssue[] } | null>(null);

  const loadRef = useRef(0);

  const loadPeriod = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const [pr, rr] = await Promise.all([
        apiFetch(`${API}/periods`),
        apiFetch(`${API}/periods/${periodId}/runs`),
      ]);
      if (seq !== loadRef.current) return;
      if (!pr.ok) throw new Error(await pr.text());
      const periods = await pr.json() as Period[];
      const p = periods.find(x => x.id === periodId);
      setPeriod(p ?? null);
      if (!rr.ok) throw new Error(await rr.text());
      const newRuns = await rr.json() as Run[];
      setRuns(newRuns);
      setSelectedRun(prev => {
        if (!prev) return newRuns[0] ?? null; // auto-select first staff on initial load
        return newRuns.find(r => r.id === prev.id) ?? null;
      });
      // Load supplementary data in background (non-blocking)
      if (newRuns.length > 0) {
        apiFetch(`${API}/staff-profiles?active_only=false`)
          .then(r => r.ok ? r.json() : [])
          .then((d: StaffProfileMin[]) => {
            if (seq !== loadRef.current) return;
            const m = new Map<string, StaffProfileMin>();
            d.forEach(sp => m.set(sp.staff_name, sp));
            setProfiles(m);
          })
          .catch(() => {});
        apiFetch(`${API}/periods/${periodId}/attendance-summary`)
          .then(r => r.ok ? r.json() : [])
          .then((d: AttendanceStat[]) => {
            if (seq !== loadRef.current) return;
            setAttSummary(d);
          })
          .catch(() => {});
      }
    } catch (e) {
      if (seq !== loadRef.current) return;
      setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { void loadPeriod(); }, [loadPeriod]);

  // Auth guard + salary visibility
  const canSeeSalary = hasPayrollViewSalary(getAuth());
  useEffect(() => {
    const auth = getAuth();
    if (!auth || !canAccessPayrollAdmin(auth)) {
      router.replace("/week");
    }
  }, [router]);

  // Load items when run selected
  useEffect(() => {
    if (!selectedRun) { setItems([]); return; }
    const ctrl = new AbortController();
    setItemsLoading(true);
    apiFetch(`${API}/runs/${selectedRun.id}/items`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setItems(d as PayrollItem[]))
      .catch(e => { if ((e as { name?: string }).name !== "AbortError") setError(String(e)); })
      .finally(() => setItemsLoading(false));
    return () => ctrl.abort();
  }, [selectedRun]);

  const computeAll = async () => {
    setComputing(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/periods/${periodId}/compute`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadPeriod();
    } catch (e) {
      setError(String(e));
    } finally {
      setComputing(false);
    }
  };

  const computeAllWithCheck = async () => {
    // 1. Check DTR issues first
    try {
      const r = await apiFetch(`${API}/periods/${periodId}/dtr-check`);
      if (r.ok) {
        const data = await r.json() as { errors: DtrIssue[]; warnings: DtrIssue[]; ok: boolean };
        if (data.errors.length > 0 || data.warnings.length > 0) {
          setDtrIssues(data);
          return;
        }
      }
    } catch { /* ignore check failure, proceed */ }

    // 2. Check missing profile data
    if (profiles.size > 0) {
      const missing: MissingEntry[] = runs
        .map(r => ({ staff_name: r.staff_name, missing: getMissingFields(profiles.get(r.staff_name)) }))
        .filter(x => x.missing.length > 0);
      if (missing.length > 0) {
        setComputeCheckEntries(missing);
        return;
      }
    }
    await computeAll();
  };

  const approveRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/approve`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadPeriod();
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, status: "approved" } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const publishRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/publish`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { run: Run };
      setRuns(prev => prev.map(ru => ru.id === runId ? { ...ru, published_at: data.run.published_at, published_by: data.run.published_by } : ru));
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, published_at: data.run.published_at, published_by: data.run.published_by } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const unpublishRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/unpublish`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      setRuns(prev => prev.map(ru => ru.id === runId ? { ...ru, published_at: null, published_by: null } : ru));
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, published_at: null, published_by: null } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteRun = async (runId: number, staffName: string) => {
    if (!confirm(`Delete payroll run for "${staffName}" from this period?\n\nThis cannot be undone. Re-run "Compute All" to regenerate.`)) return;
    try {
      const r = await apiFetch(`${API}/runs/${runId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setRuns(prev => prev.filter(ru => ru.id !== runId));
      if (selectedRun?.id === runId) setSelectedRun(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const publishAll = async () => {
    if (!period) return;
    if (!confirm(`Publish all computed/approved payslips for this period to staff My Pay?`)) return;
    try {
      const r = await apiFetch(`${API}/periods/${periodId}/publish-all`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { published_count: number };
      await loadPeriod();
      alert(`${data.published_count} payslip(s) published to staff.`);
    } catch (e) {
      setError(String(e));
    }
  };

  // After DTR edit or adjustment → reload period + items
  const handleRecomputed = useCallback(async () => {
    await loadPeriod();
    if (selectedRun) {
      setItemsLoading(true);
      try {
        const r = await apiFetch(`${API}/runs/${selectedRun.id}/items`);
        setItems(await r.json() as PayrollItem[]);
      } catch { /* ignore */ }
      finally { setItemsLoading(false); }
    }
  }, [loadPeriod, selectedRun]);

  // Sort runs
  const sortedRuns = [...runs].sort((a, b) => {
    const va: string|number = sortBy === "name" ? a.staff_name : a.net_pay;
    const vb: string|number = sortBy === "name" ? b.staff_name : b.net_pay;
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const toggleSort = (col: "name"|"net") => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Summary totals
  const totals = runs.reduce((acc, r) => ({
    gross: acc.gross + r.gross_pay,
    ded:   acc.ded   + r.total_deductions,
    net:   acc.net   + r.net_pay,
  }), { gross: 0, ded: 0, net: 0 });

  const nonCompliant = runs.filter(r => r.minimum_wage_compliant === false);

  return (
    <>
      {/* DTR Issues modal */}
      {dtrIssues && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-red-500/20 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-1">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <h3 className="text-base font-semibold text-white">DTR Issues Detected</h3>
            </div>
            <p className="text-sm text-slate-400 mb-1">
              Fix errors before computing payroll. Warnings are auto-corrected by Compute All.
            </p>
            {(dtrIssues.errors.length + dtrIssues.warnings.length) > 0 && (
              <p className="text-xs text-slate-500 mb-3">
                {dtrIssues.errors.length > 0 && <span className="text-red-400">{dtrIssues.errors.length} error{dtrIssues.errors.length > 1 ? "s" : ""}</span>}
                {dtrIssues.errors.length > 0 && dtrIssues.warnings.length > 0 && <span className="text-slate-600"> · </span>}
                {dtrIssues.warnings.length > 0 && <span className="text-amber-400">{dtrIssues.warnings.length} warning{dtrIssues.warnings.length > 1 ? "s" : ""}</span>}
              </p>
            )}
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {dtrIssues.errors.map((issue, i) => (
                <div key={i} className="rounded-lg border border-red-500/20 bg-red-950/30 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{issue.staff_name} — {issue.work_date}</p>
                      <p className="text-xs text-red-300 mt-0.5">{issue.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">ERROR</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Fix: {issue.fix}</p>
                </div>
              ))}
              {dtrIssues.warnings.map((issue, i) => (
                <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{issue.staff_name} — {issue.work_date}</p>
                      <p className="text-xs text-amber-300 mt-0.5">{issue.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">WARNING</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Auto-fix: {issue.fix}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setDtrIssues(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              {dtrIssues.errors.length === 0 && (
                <button
                  onClick={() => { setDtrIssues(null); void computeAll(); }}
                  className={PRIMARY_BUTTON + " text-sm"}
                >
                  Compute Anyway (warnings only)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Missing profile data modal */}
      {computeCheckEntries.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <h3 className="text-base font-semibold text-white">Missing Payroll Data</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              The following staff are missing required payroll information. Computation may produce incorrect results.
            </p>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-white/5 bg-slate-800/60">
              {computeCheckEntries.map(e => (
                <div key={e.staff_name} className="flex items-start gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{e.staff_name}</p>
                    <p className="text-xs text-amber-400 mt-0.5">Missing: {e.missing.join(", ")}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setComputeCheckEntries([])}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <Link
                href="/admin/payroll/manila/staff-profiles"
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-900/30 px-4 py-2 text-sm text-blue-300 hover:bg-blue-900/50"
                onClick={() => setComputeCheckEntries([])}
              >
                <Users size={14} /> Go to Staff Profiles
              </Link>
              <button
                onClick={() => { setComputeCheckEntries([]); void computeAll(); }}
                className={PRIMARY_BUTTON + " text-sm"}
              >
                Compute Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #payroll-print-area, #payroll-print-area * { visibility: visible !important; }
          #payroll-print-area {
            position: fixed !important; inset: 0 !important;
            padding: 32px !important; background: #fff !important;
            color: #1e293b !important;
          }
        }
      `}} />

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="flex h-screen overflow-hidden">

          {/* ── Left: period + run list ── */}
          <div className="flex w-[52%] flex-col overflow-hidden border-r border-white/5">
            <div className="flex-none p-5">

              {/* Nav */}
              <Link href="/admin/payroll/manila" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
                <ArrowLeft size={14} /> Back to Periods
              </Link>

              {period && (
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-light text-white">{period.period_label}</h1>
                    <p className="text-sm text-slate-400">
                      {period.start_date} → {period.end_date}
                      {period.period_half === 2 && " · Statutory deductions 50% (SSS/PhilHealth/Pag-IBIG/BIR)"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/admin/payroll/manila/staff-profiles"
                      className="flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-800/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/40"
                    >
                      <Users size={14} /> Staff Profiles
                    </Link>
                    {runs.length > 0 && runs.some(r => !r.published_at && ["approved","paid","computed"].includes(r.status)) && (
                      <button
                        onClick={publishAll}
                        className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-900/30 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-900/50"
                      >
                        <Send size={14} /> Publish All
                      </button>
                    )}
                    <button
                      onClick={computeAllWithCheck}
                      disabled={computing}
                      className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
                    >
                      {computing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Play size={14} />}
                      Compute All
                    </button>
                  </div>
                </div>
              )}

              {/* Summary KPIs with formula */}
              {runs.length > 0 && (
                <div className="mt-4 flex items-stretch gap-1 rounded-xl border border-white/5 overflow-hidden text-center">
                  <div className="flex-1 bg-slate-800/60 px-3 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Gross Pay</p>
                    <p className="text-sm font-bold text-white mt-1 tabular-nums">{canSeeSalary ? fmtPHP(totals.gross) : <span className="font-mono text-slate-600">****</span>}</p>
                  </div>
                  <div className="flex items-center justify-center bg-slate-900/50 px-2 text-slate-600 font-light text-lg select-none">−</div>
                  <div className="flex-1 bg-slate-800/60 px-3 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Deductions</p>
                    <p className="text-sm font-bold text-red-300 mt-1 tabular-nums">{canSeeSalary ? fmtPHPAbs(totals.ded) : <span className="font-mono text-slate-600">****</span>}</p>
                  </div>
                  <div className="flex items-center justify-center bg-slate-900/50 px-2 text-slate-600 font-light text-lg select-none">=</div>
                  <div className="flex-1 bg-violet-900/30 border-l border-violet-500/20 px-3 py-3">
                    <p className="text-[10px] text-violet-400/70 uppercase tracking-wider">Total Net Pay</p>
                    <p className="text-sm font-bold text-emerald-300 mt-1 tabular-nums">{canSeeSalary ? fmtPHP(totals.net) : <span className="font-mono text-slate-600">****</span>}</p>
                  </div>
                </div>
              )}

              {/* Staff count */}
              {runs.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  {runs.length} staff member(s)
                  {nonCompliant.length > 0 && (
                    <span className="text-amber-400 ml-2">
                      ⚠ {nonCompliant.length} below minimum wage
                    </span>
                  )}
                </p>
              )}

              {/* Minimum wage warning */}
              {nonCompliant.length > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  Below minimum wage (₱695/day): {nonCompliant.map(r => r.staff_name).join(", ")}
                </div>
              )}

              {/* Attendance Overview collapsible */}
              {attSummary.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/3">
                  <button
                    onClick={() => setShowAttSummary(v => !v)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Attendance Overview
                    </span>
                    <span className="text-slate-500 text-xs">{showAttSummary ? "▲" : "▼"}</span>
                  </button>
                  {showAttSummary && (
                    <div className="overflow-x-auto border-t border-white/5">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-slate-500 uppercase tracking-wider">
                            <th className="px-3 py-1.5 text-left font-medium">Staff</th>
                            <th className="px-2 py-1.5 text-right font-medium">Worked</th>
                            <th className="px-2 py-1.5 text-right font-medium">Absent</th>
                            <th className="px-2 py-1.5 text-right font-medium">Late</th>
                            <th className="px-2 py-1.5 text-right font-medium">DTR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attSummary.map(a => (
                            <tr key={a.staff_name} className="border-b border-white/5 hover:bg-white/5">
                              <td className="px-3 py-1.5 text-slate-200">{a.staff_name}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">{a.worked_days}</td>
                              <td className={`px-2 py-1.5 text-right tabular-nums ${a.absent_days > 0 ? "text-red-300" : "text-slate-500"}`}>{a.absent_days}</td>
                              <td className={`px-2 py-1.5 text-right tabular-nums ${a.late_days > 0 ? "text-amber-300" : "text-slate-500"}`}>{a.late_days}</td>
                              <td className="px-2 py-1.5 text-right">
                                {a.has_dtr
                                  ? <span className="text-emerald-400">✓</span>
                                  : <span className="text-red-400">✗</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Government Reports — only available for 2nd-half periods */}
              {period && period.period_half === 2 && runs.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/3 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Government Reports
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "SSS R-3",         path: "sss-r3",         color: "border-blue-500/30 text-blue-300 hover:bg-blue-900/20" },
                      { label: "PhilHealth RF-1",  path: "philhealth-rf1", color: "border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/20" },
                      { label: "Pag-IBIG MCRF",   path: "pagibig-mcrf",   color: "border-red-500/30 text-red-300 hover:bg-red-900/20" },
                      { label: "BIR 1601-C",      path: "bir-1601c",      color: "border-amber-500/30 text-amber-300 hover:bg-amber-900/20" },
                    ].map(({ label, path, color }) => (
                      <button
                        key={path}
                        onClick={() => {
                          apiFetch(`${API}/reports/${path}/${periodId}`)
                            .then(async r => {
                              if (!r.ok) throw new Error(await r.text());
                              return r.blob();
                            })
                            .then(blob => {
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(blob);
                              a.download = `${label.replace(/\s+/g, "_")}_${period!.period_label.replace(/\s+/g, "_")}.xlsx`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(a.href);
                            })
                            .catch(e => setError(String(e)));
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${color}`}
                      >
                        <Download size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-sm text-red-300">
                <AlertCircle size={14} /> {error}
                <button onClick={() => setError("")} className="ml-auto"><X size={14}/></button>
              </div>
            )}

            {/* Run list */}
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-violet-400" />
                </div>
              ) : runs.length === 0 ? (
                <div className={GLASS_CARD + " p-8 text-center"}>
                  <p className="text-slate-400 text-sm">No results yet. Click &quot;Compute All&quot; to generate payroll.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-slate-500">
                      <th className="py-2 w-5" />
                      <th className="py-2 text-left cursor-pointer select-none hover:text-white"
                          onClick={() => toggleSort("name")}>
                        <span className="flex items-center gap-1">
                          Staff {sortBy==="name" && (sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>)}
                        </span>
                      </th>
                      <th className="py-2 text-right text-xs text-slate-500">Gross</th>
                      <th className="py-2 text-right text-xs text-red-400/70">Deductions</th>
                      <th className="py-2 text-right cursor-pointer select-none hover:text-white"
                          onClick={() => toggleSort("net")}>
                        <span className="flex items-center justify-end gap-1 text-emerald-400/70">
                          Net Pay {sortBy==="net" && (sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>)}
                        </span>
                      </th>
                      <th className="py-2 text-center text-xs text-slate-500">Status</th>
                      <th className="py-2 text-center text-xs text-violet-400/70">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRuns.map(run => (
                      <tr
                        key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className={`group cursor-pointer border-b border-white/5 hover:bg-violet-900/10 transition-colors ${
                          selectedRun?.id === run.id ? "bg-violet-900/20 border-l-2 border-l-violet-500" : "border-l-2 border-l-transparent"
                        }`}
                      >
                        <td className="py-2.5 relative w-5">
                          <button
                            onClick={e => { e.stopPropagation(); deleteRun(run.id, run.staff_name); }}
                            className="absolute inset-0 flex items-center justify-center text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                            title="Delete this payroll run"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                        <td className="py-2.5 text-left">
                          <div className="flex items-center gap-2">
                            {run.minimum_wage_compliant === false && (
                              <AlertTriangle size={12} className="text-amber-400 flex-none" />
                            )}
                            <span className={selectedRun?.id === run.id ? "text-violet-300 font-medium" : "text-white"}>{run.staff_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-slate-300 tabular-nums">{canSeeSalary ? fmtPHP(run.gross_pay) : <span className="font-mono text-slate-600">****</span>}</td>
                        <td className="py-2.5 text-right text-red-300/80 tabular-nums text-xs">
                          {canSeeSalary ? `(${fmtPHPAbs(run.total_deductions)})` : <span className="font-mono text-slate-600">(****)</span>}
                        </td>
                        <td className="py-2.5 text-right font-bold text-emerald-300 tabular-nums">{canSeeSalary ? fmtPHP(run.net_pay) : <span className="font-mono text-slate-600">****</span>}</td>
                        <td className="py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[run.status] ?? STATUS_BADGE.draft}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {run.published_at
                            ? <span title="Published"><Eye size={13} className="inline text-emerald-400" /></span>
                            : <span title="Unpublished"><EyeOff size={13} className="inline text-slate-600" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Table footer totals */}
                  <tfoot>
                    <tr className="border-t-2 border-white/10">
                      <td />
                      <td className="py-2.5 text-xs font-semibold text-slate-400">Total ({runs.length})</td>
                      <td className="py-2.5 text-right text-sm font-bold text-white tabular-nums">{canSeeSalary ? fmtPHP(totals.gross) : <span className="font-mono text-slate-600">****</span>}</td>
                      <td className="py-2.5 text-right text-sm font-bold text-red-300 tabular-nums">{canSeeSalary ? `(${fmtPHP(totals.ded)})` : <span className="font-mono text-slate-600">(****)</span>}</td>
                      <td className="py-2.5 text-right text-sm font-bold text-emerald-300 tabular-nums">{canSeeSalary ? fmtPHP(totals.net) : <span className="font-mono text-slate-600">****</span>}</td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* ── Right: payslip detail ── */}
          <div className="flex w-[48%] flex-col overflow-hidden" id="payroll-print-area">
            {!selectedRun ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
                <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-6 max-w-xs">
                  <p className="text-sm text-slate-300 font-medium">← Select a staff member</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Click any row in the staff table on the left to view their payslip breakdown.
                  </p>
                  <p className="text-xs text-slate-600 mt-3">
                    Use <span className="text-blue-400">Edit DTR</span> to correct clock-in/out times.<br/>
                    Use <span className="text-violet-400">Adjust</span> to add manual additions or deductions.
                  </p>
                </div>
              </div>
            ) : (
              <PayslipDetail
                run={selectedRun}
                items={items}
                itemsLoading={itemsLoading}
                periodId={periodId}
                onApprove={approveRun}
                onPublish={publishRun}
                onUnpublish={unpublishRun}
                onDelete={deleteRun}
                onClose={() => setSelectedRun(null)}
                onRecomputed={handleRecomputed}
                period={period}
                profileMonthlyRate={
                  profiles.size > 0
                    ? (Number(profiles.get(selectedRun.staff_name)?.monthly_rate) || null)
                    : null
                }
                canSeeSalary={canSeeSalary}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
