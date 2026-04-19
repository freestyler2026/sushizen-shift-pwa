"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BarChart2,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  Download,
  Info,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import DateRangePicker from "@/components/DateRangePicker";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DANGER_BUTTON,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TEXTAREA_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type AbsenceType =
  | "DAY_OFF"
  | "VACATION_LEAVE"
  | "MATERNITY_LEAVE"
  | "MEDICAL_LEAVE"
  | "INJURY"
  | "HOSPITAL"
  | "ABSENT"
  | "BEREAVEMENT_LEAVE";

type AbsenceRow = {
  work_date: string;
  staff_name: string;
  absence_type: AbsenceType | string;
  note?: string;
  branch_hint?: string;
  source_sheet_name?: string;
  created_at?: string | null;
};

type AbsenceListResp = {
  ok?: boolean;
  rows?: AbsenceRow[];
};

type StaffNamesResp = {
  ok?: boolean;
  names?: string[];
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

const ABSENCE_TYPES: Array<{ value: AbsenceType; label: string }> = [
  { value: "DAY_OFF", label: "Day Off" },
  { value: "VACATION_LEAVE", label: "Vacation Leave" },
  { value: "MATERNITY_LEAVE", label: "Maternity Leave" },
  { value: "MEDICAL_LEAVE", label: "Medical Leave" },
  { value: "INJURY", label: "Injury" },
  { value: "HOSPITAL", label: "Hospital" },
  { value: "ABSENT", label: "Absent" },
  { value: "BEREAVEMENT_LEAVE", label: "Bereavement Leave" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso() {
  return addDaysIso(todayIso(), -1);
}

function addDaysIso(base: string, days: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function norm(s: unknown) {
  return String(s ?? "").trim();
}

// 予定された正規の休みは除外（欠勤のみ表示）
const PLANNED_LEAVE_TYPES = new Set(["DAY_OFF", "VACATION_LEAVE", "MATERNITY_LEAVE", "BEREAVEMENT_LEAVE"]);
function isUnplannedAbsence(type: string): boolean {
  return !PLANNED_LEAVE_TYPES.has(norm(type).toUpperCase());
}

function toTitleAbsenceType(t: string) {
  const x = norm(t).toUpperCase();
  const found = ABSENCE_TYPES.find((a) => a.value === x);
  return found?.label || x || "-";
}

function badgeClassForType(t: string) {
  const x = norm(t).toUpperCase();
  if (x === "ABSENT") return BADGE_ERROR;
  if (x === "LATE" || x === "INJURY" || x === "HOSPITAL" || x === "MEDICAL_LEAVE") return BADGE_WARNING;
  if (
    x === "LEAVE" ||
    x === "DAY_OFF" ||
    x === "VACATION_LEAVE" ||
    x === "MATERNITY_LEAVE" ||
    x === "BEREAVEMENT_LEAVE"
  ) {
    return BADGE_INFO;
  }
  if (x === "PRESENT" || x === "APPROVED") return BADGE_SUCCESS;
  return BADGE_INFO;
}

function buildHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("sushizen_shift_auth");
      const obj = raw ? JSON.parse(raw) : null;
      if (obj?.accessToken) h["Authorization"] = `Bearer ${obj.accessToken}`;
    } catch { /* ignore */ }
  }
  return h;
}

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: buildHeaders(),
  });
  const text = await res.text();

  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const j = JSON.parse(text);
      errMsg = j?.detail || j?.message || errMsg;
    } catch {
      if (text) errMsg = text;
    }
    throw new Error(errMsg);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const j = JSON.parse(text);
      errMsg = j?.detail || j?.message || errMsg;
    } catch {
      if (text) errMsg = text;
    }
    throw new Error(errMsg);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── Absence Report city section ────────────────────────────────────────────

function ReportCitySection({
  city,
  rows,
}: {
  city: "dubai" | "manila";
  rows: AbsenceRow[];
}) {
  const isDubai = city === "dubai";
  const flag = isDubai ? "🇦🇪" : "🇵🇭";
  const label = isDubai ? "Dubai" : "Manila";
  const accent = isDubai ? "text-amber-400" : "text-sky-400";
  const dotColor = isDubai ? "bg-amber-400" : "bg-sky-400";
  const headerBg = isDubai ? "bg-amber-500/8" : "bg-sky-500/8";

  const absentCount = rows.filter(r => norm(r.absence_type).toUpperCase() === "ABSENT").length;
  const leaveCount = rows.length - absentCount;

  if (rows.length === 0) {
    return (
      <div className={`rounded-xl border ${isDubai ? "border-amber-500/15" : "border-sky-500/15"} bg-neutral-900/30 p-4`}>
        <div className="flex items-center gap-2 mb-2">
          <span>{flag}</span>
          <span className={`text-sm font-semibold ${accent}`}>{label}</span>
          <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${BADGE_SUCCESS}`}>
            All present
          </span>
        </div>
        <p className="text-xs text-neutral-500 text-center py-2">No absences in this period</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${isDubai ? "border-amber-500/15" : "border-sky-500/15"} overflow-hidden`}>
      {/* City header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerBg}`}>
        <span>{flag}</span>
        <span className={`text-sm font-semibold ${accent}`}>{label}</span>
        <div className="ml-auto flex gap-2">
          {absentCount > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_ERROR}`}>
              {absentCount} Absent
            </span>
          )}
          {leaveCount > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_INFO}`}>
              {leaveCount} Leave
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className={`${TABLE_HEADER} px-4 text-left w-24`}>Date</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Staff</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Branch</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Type</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Note / Shift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={TABLE_ROW}>
                <td className={`${TABLE_CELL} px-4 tabular-nums text-xs text-neutral-400`}>
                  {r.work_date || "-"}
                </td>
                <td className={`${TABLE_CELL} px-4 font-medium`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                    {r.staff_name || "-"}
                  </div>
                </td>
                <td className={`${TABLE_CELL} px-4 text-neutral-400`}>
                  {r.branch_hint || <span className="text-neutral-600">—</span>}
                </td>
                <td className={`${TABLE_CELL} px-4`}>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${badgeClassForType(r.absence_type)}`}>
                    {toTitleAbsenceType(r.absence_type)}
                  </span>
                </td>
                <td className={`${TABLE_CELL} px-4 text-xs text-neutral-400 max-w-[180px] truncate`}>
                  {r.note || <span className="text-neutral-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminAbsencesPage() {
  const auth = getAuth();

  const initialCity: City = auth?.city === "manila" ? "manila" : "dubai";
  const [city, setCity] = useState<City>(initialCity);
  const [approverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [staffName, setStaffName] = useState<string>("");
  const [workDate, setWorkDate] = useState<string>(todayIso());
  const [absenceType, setAbsenceType] = useState<AbsenceType>("ABSENT");
  const [note, setNote] = useState<string>("");
  const [branchHint, setBranchHint] = useState<string>("");

  const [bulkSelectedNames, setBulkSelectedNames] = useState<string[]>([]);
  const [bulkDateFrom, setBulkDateFrom] = useState<string>(todayIso());
  const [bulkDateTo, setBulkDateTo] = useState<string>(todayIso());
  const [bulkAbsenceType, setBulkAbsenceType] = useState<AbsenceType>("DAY_OFF");
  const [bulkNote, setBulkNote] = useState<string>("");
  const [bulkBranchHint, setBulkBranchHint] = useState<string>("");

  // Absence Report state (both cities, configurable date range)
  const [reportDateFrom, setReportDateFrom] = useState<string>(yesterdayIso());
  const [reportDateTo, setReportDateTo] = useState<string>(todayIso());
  const [reportDubai, setReportDubai] = useState<AbsenceRow[] | null>(null);
  const [reportManila, setReportManila] = useState<AbsenceRow[] | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // History state
  const [filterStaffName, setFilterStaffName] = useState<string>("");
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(addDaysIso(todayIso(), -14));
  const [dateTo, setDateTo] = useState<string>(addDaysIso(todayIso(), 14));
  const [rows, setRows] = useState<AbsenceRow[] | null>(null); // null = never loaded
  const [historyLoading, setHistoryLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<AbsenceRow | null>(null);

  const handleReportDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setReportDateFrom(next);
    if (reportDateTo && next > reportDateTo) setReportDateTo(next);
  };

  const handleReportDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setReportDateTo(next);
    if (reportDateFrom && next < reportDateFrom) setReportDateFrom(next);
  };

  const handleBulkDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setBulkDateFrom(next);
    if (bulkDateTo && next > bulkDateTo) setBulkDateTo(next);
  };

  const handleBulkDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setBulkDateTo(next);
    if (bulkDateFrom && next < bulkDateFrom) setBulkDateFrom(next);
  };

  const handleHistoryDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateFrom(next);
    if (dateTo && next > dateTo) setDateTo(next);
  };

  const handleHistoryDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateTo(next);
    if (dateFrom && next < dateFrom) setDateFrom(next);
  };

  const branchOptions = useMemo(() => BRANCHES[city] || [], [city]);
  const canAuth = useMemo(() => !!norm(approverName) && !!norm(pin), [approverName, pin]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (!filterBranch) return rows;
    return rows.filter(r => norm(r.branch_hint).toLowerCase() === filterBranch.toLowerCase());
  }, [rows, filterBranch]);

  const loadStaffOptions = useCallback(async (nextCity: string) => {
    const nm = norm(approverName);
    const p = norm(pin);
    if (!nm || !p) {
      setStaffOptions([]);
      return;
    }
    try {
      const res = await apiGet<StaffNamesResp>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(nextCity)}&status=ACTIVE&limit=5000&approver_name=${encodeURIComponent(nm)}&pin=${encodeURIComponent(p)}`
      );
      setStaffOptions(Array.isArray(res?.names) ? res.names : []);
    } catch {
      setStaffOptions([]);
    }
  }, [approverName, pin]);

  const loadReport = useCallback(async () => {
    const nm = norm(approverName);
    const p = norm(pin);
    if (!nm || !p) return;

    setReportLoading(true);
    setReportError(null);

    const makeQs = (c: string) => {
      const qs = new URLSearchParams();
      qs.set("city", c);
      qs.set("date_from", reportDateFrom);
      qs.set("date_to", addDaysIso(reportDateTo, 1));
      qs.set("approver_name", nm);
      qs.set("pin", p);
      qs.set("limit", "500");
      return qs.toString();
    };

    try {
      const [rd, rm] = await Promise.all([
        apiGet<AbsenceListResp>(`/api/admin/absences?${makeQs("dubai")}`),
        apiGet<AbsenceListResp>(`/api/admin/absences?${makeQs("manila")}`),
      ]);
      setReportDubai(Array.isArray(rd?.rows) ? rd.rows.filter(r => isUnplannedAbsence(r.absence_type)) : []);
      setReportManila(Array.isArray(rm?.rows) ? rm.rows.filter(r => isUnplannedAbsence(r.absence_type)) : []);
    } catch (e: any) {
      setReportError(e?.message || String(e));
      setReportDubai(null);
      setReportManila(null);
    } finally {
      setReportLoading(false);
    }
  }, [approverName, pin, reportDateFrom, reportDateTo]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setMsg(null);

    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      const qs = new URLSearchParams();
      qs.set("city", city);
      qs.set("date_from", dateFrom);
      qs.set("date_to", addDaysIso(dateTo, 1));
      qs.set("approver_name", nm);
      qs.set("pin", p);
      qs.set("limit", "1000");
      if (norm(filterStaffName)) qs.set("staff_name", norm(filterStaffName));

      const res = await apiGet<AbsenceListResp>(`/api/admin/absences?${qs.toString()}`);
      const list = Array.isArray(res?.rows) ? res.rows : [];
      setRows(list);
      setMsg({ kind: "ok", text: `Loaded ${list.length} rows.` });
    } catch (e: any) {
      setRows([]);
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!city) return;
    loadStaffOptions(city);
  }, [city, loadStaffOptions]);

  useEffect(() => {
    setStaffName("");
    setBulkSelectedNames([]);
    setFilterStaffName("");
    setFilterBranch("");
    setBranchHint("");
    setBulkBranchHint("");
    setRows(null);
  }, [city]);

  // Auto-load report when auth becomes ready
  useEffect(() => {
    if (!canAuth) return;
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuth]);

  const upsertSingle = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const nm = norm(approverName);
      const p = norm(pin);
      const sn = norm(staffName);
      const wd = norm(workDate);

      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");
      if (!sn) throw new Error("Staff name is required.");
      if (!wd) throw new Error("Work date is required.");

      await apiPost("/api/admin/absences/upsert", {
        city,
        staff_name: sn,
        work_date: wd,
        absence_type: absenceType,
        note: norm(note),
        branch_hint: norm(branchHint),
        approver_name: nm,
        pin: p,
      });

      setMsg({ kind: "ok", text: `Saved ${sn} / ${wd} / ${absenceType}.` });
      await loadReport();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const upsertBulk = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      const names = bulkSelectedNames.map((x) => norm(x)).filter(Boolean);

      if (!names.length) throw new Error("Select at least one staff member.");
      if (!norm(bulkDateFrom) || !norm(bulkDateTo)) throw new Error("Bulk date range is required.");

      const start = new Date(`${bulkDateFrom}T00:00:00`);
      const end = new Date(`${bulkDateTo}T00:00:00`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Bulk date range is invalid.");
      }
      if (end < start) throw new Error("Bulk date range is invalid.");

      let count = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = new Date(d).toISOString().slice(0, 10);
        for (const sn of names) {
          await apiPost("/api/admin/absences/upsert", {
            city,
            staff_name: sn,
            work_date: wd,
            absence_type: bulkAbsenceType,
            note: norm(bulkNote),
            branch_hint: norm(bulkBranchHint),
            approver_name: nm,
            pin: p,
          });
          count += 1;
        }
      }

      setMsg({ kind: "ok", text: `Bulk saved ${count} rows.` });
      await loadReport();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const deleteRow = async (r: AbsenceRow) => {
    setLoading(true);
    setMsg(null);

    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      await apiPost("/api/admin/absences/delete", {
        city,
        staff_name: norm(r.staff_name),
        work_date: norm(r.work_date),
        absence_type: norm(r.absence_type).toUpperCase(),
        source_sheet_name: norm(r.source_sheet_name) || "MANUAL",
        approver_name: nm,
        pin: p,
      });

      setMsg({
        kind: "ok",
        text: `Deleted ${r.staff_name} / ${r.work_date} / ${r.absence_type}.`,
      });
      await loadReport();
      if (rows !== null) await loadHistory();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  function downloadCsv() {
    const target = filteredRows ?? [];
    const headers = ["staff", "date", "type", "branch", "note", "source", "created_at"];
    const lines = [
      headers.join(","),
      ...target.map((r) =>
        [
          norm(r.staff_name),
          norm(r.work_date),
          toTitleAbsenceType(r.absence_type),
          norm(r.branch_hint),
          norm(r.note).includes(",") ? `"${norm(r.note).replace(/"/g, '""')}"` : norm(r.note),
          norm(r.source_sheet_name),
          norm(r.created_at),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absence-history-${city}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const reportTotal = (reportDubai?.length ?? 0) + (reportManila?.length ?? 0);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-5xl space-y-5 px-4 py-8"
      >
        {/* Nav */}
        <div className="mb-2 flex items-center gap-2">
          <Link href="/admin">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Admin
            </button>
          </Link>
          <Link href="/admin/attendance">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <UserCheck className="h-3.5 w-3.5" />
              Attendance
            </button>
          </Link>
          <Link href="/admin/analytics">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <BarChart2 className="h-3.5 w-3.5" />
              Analytics
            </button>
          </Link>
        </div>

        {/* Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/20 to-pink-500/10">
            <CalendarOff className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Absence / Leave Management</h1>
            <p className={T_CAPTION}>View absence reports, register absences and leave, process bulk entries, and review history.</p>
          </div>
        </div>

        {/* ── Absence Report (both cities, configurable date range) ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.02 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-rose-400" />
              <h2 className={T_SECTION}>Absence Report</h2>
            </div>
            <p className={T_CAPTION}>Dubai 🇦🇪 + Manila 🇵🇭 — name, branch, type, note/shift</p>
          </div>

          {/* Controls */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
              <div className="flex items-center gap-2">
                <DateRangePicker
                  value={{ from: reportDateFrom, to: reportDateTo }}
                  onChange={(range) => {
                    setReportDateFrom(range.from);
                    setReportDateTo(range.to || range.from);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setReportDateFrom(yesterdayIso());
                    setReportDateTo(yesterdayIso());
                  }}
                  className={SMALL_BUTTON + " whitespace-nowrap"}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReportDateFrom(todayIso());
                    setReportDateTo(todayIso());
                  }}
                  className={SMALL_BUTTON + " whitespace-nowrap"}
                >
                  Today
                </button>
              </div>
            </div>
            <button
              onClick={loadReport}
              disabled={reportLoading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reportLoading ? "animate-spin" : ""}`} />
              {reportLoading ? "Loading…" : "Load Report"}
            </button>
          </div>

          {/* Auth prompt */}
          {!canAuth && (
            <div className="rounded-lg bg-neutral-800/40 px-4 py-3 text-center text-sm text-neutral-400">
              Enter Approver Name and PIN in the Scope section below, then load.
            </div>
          )}

          {/* Results */}
          {reportDubai !== null && reportManila !== null && (
            reportTotal === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                <p className="text-sm text-neutral-400">No absences recorded for this period</p>
                <p className={T_CAPTION}>{reportDateFrom === reportDateTo ? reportDateFrom : `${reportDateFrom} → ${reportDateTo}`}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {reportDateFrom === reportDateTo ? reportDateFrom : `${reportDateFrom} → ${reportDateTo}`}
                  </span>
                  <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_ERROR}`}>
                    {reportTotal} total
                  </span>
                </div>
                <ReportCitySection city="dubai" rows={reportDubai} />
                <ReportCitySection city="manila" rows={reportManila} />
              </div>
            )
          )}

          {reportDubai === null && !reportLoading && canAuth && (
            <div className="rounded-lg bg-neutral-800/30 px-4 py-4 text-center text-sm text-neutral-500">
              {reportError
                ? <span className="text-red-400">{reportError}</span>
                : <>Click <strong className="text-neutral-300">Load Report</strong> to fetch absence data for both cities.</>
              }
            </div>
          )}
        </motion.div>

        {/* Feedback banner */}
        <AnimatePresence>
          {msg ? (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className={
                msg.kind === "ok"
                  ? BADGE_SUCCESS + " w-full justify-start rounded-xl px-4 py-3 text-sm"
                  : BADGE_ERROR + " w-full justify-start rounded-xl px-4 py-3 text-sm"
              }
            >
              {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {msg.text}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Auth / Scope ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Scope / Approval Context</h2>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>City</label>
              <select
                value={city}
                onChange={(e) => setCity((e.target.value === "manila" ? "manila" : "dubai") as City)}
                className={SELECT_CLASS}
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
              <input className={INPUT_CLASS} readOnly value={approverName || "-"} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
              <input
                className={INPUT_CLASS}
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN if needed"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            Using the current logged-in admin credentials stored on this device. City scope applies to upsert / delete operations.
          </div>
        </motion.div>

        {/* ── Single Upsert ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-rose-400" />
            <h2 className={T_SECTION}>Single Upsert</h2>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Name</label>
              <select value={staffName} onChange={(e) => setStaffName(e.target.value)} className={SELECT_CLASS}>
                <option value="">Select staff</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Work Date</label>
              <input type="date" value={workDate} onChange={(e) => handleBulkDateFromChange(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
              <select value={absenceType} onChange={(e) => setAbsenceType(e.target.value as AbsenceType)} className={SELECT_CLASS}>
                {ABSENCE_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
              <select value={branchHint} onChange={(e) => setBranchHint(e.target.value)} className={SELECT_CLASS}>
                <option value="">Select branch</option>
                {branchOptions.map((branch) => (
                  <option key={branch.code} value={branch.code}>{branch.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Note / Shift info</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={TEXTAREA_CLASS}
              placeholder="e.g. AM shift, 09:00-18:00, coverage needed"
            />
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Overrides existing record for the same date.</p>
            <button
              onClick={upsertSingle}
              disabled={loading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </motion.div>

        {/* ── Bulk Entry ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Bulk Entry</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Names (one per line)</label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={6}
                placeholder={"John Smith\nJane Doe"}
                value={bulkSelectedNames.join("\n")}
                onChange={(e) =>
                  setBulkSelectedNames(
                    e.target.value.split("\n").map((n) => n.trim()).filter(Boolean)
                  )
                }
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
                <div className="flex gap-2">
                  <DateRangePicker
                    value={{ from: bulkDateFrom, to: bulkDateTo }}
                    onChange={(range) => {
                      setBulkDateFrom(range.from);
                      setBulkDateTo(range.to || range.from);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { handleBulkDateFromChange(todayIso()); handleBulkDateToChange(todayIso()); }}
                    className={SMALL_BUTTON + " whitespace-nowrap"}
                  >
                    Today
                  </button>
                </div>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
                <select value={bulkBranchHint} onChange={(e) => setBulkBranchHint(e.target.value)} className={SELECT_CLASS}>
                  <option value="">All / Optional</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
                <select value={bulkAbsenceType} onChange={(e) => setBulkAbsenceType(e.target.value as AbsenceType)} className={SELECT_CLASS}>
                  {ABSENCE_TYPES.map((x) => (
                    <option key={x.value} value={x.value}>{x.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Note / Shift info</label>
                <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} rows={2} className={TEXTAREA_CLASS} placeholder="Optional" />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Same type applied to all staff for the selected range.</p>
            <button onClick={upsertBulk} disabled={loading || !canAuth} className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}>
              <Upload className="h-4 w-4" />
              Process Bulk
            </button>
          </div>
        </motion.div>

        {/* ── History Filters ──────────────────────────────────────────── */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={T_SECTION}>History (single city)</h2>
              <p className={T_CAPTION}>
                {filteredRows === null
                  ? "Select filters and click Load History"
                  : filterBranch
                  ? `${fmtNum(filteredRows.length)} / ${fmtNum(rows?.length ?? 0)} records (branch filtered)`
                  : `${fmtNum(rows?.length ?? 0)} records`}
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff</label>
              <select value={filterStaffName} onChange={(e) => setFilterStaffName(e.target.value)} className={SELECT_CLASS}>
                <option value="">All staff</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={SELECT_CLASS}>
                <option value="">All branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch.code} value={branch.code}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
              <DateRangePicker
                value={{ from: dateFrom, to: dateTo }}
                onChange={(range) => {
                  setDateFrom(range.from);
                  setDateTo(range.to || range.from);
                }}
              />
            </div>
            <div className="flex items-end">
              <button onClick={loadHistory} disabled={historyLoading || !canAuth} className={`${PRIMARY_BUTTON} w-full disabled:opacity-50`}>
                {historyLoading ? "Loading…" : "Load History"}
              </button>
            </div>
          </div>
        </div>

        {/* ── History Table ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={GLASS_CARD + " overflow-hidden"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-violet-400" />
              <h2 className={T_SECTION}>History</h2>
              {filterBranch && (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300 border border-violet-500/20">
                  {branchOptions.find(b => b.code === filterBranch)?.name || filterBranch}
                </span>
              )}
            </div>
            <button
              onClick={downloadCsv}
              disabled={!filteredRows?.length}
              className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-50`}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/3">
                <tr>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Date</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Type</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Note / Shift</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}></th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={6} className={`${TABLE_CELL} px-4 py-12 text-center text-zinc-500`}>
                      Loading…
                    </td>
                  </tr>
                ) : rows === null ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarDays className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>Select filters above and click Load History.</p>
                      </div>
                    </td>
                  </tr>
                ) : (filteredRows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarOff className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>No records found for this filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  (filteredRows ?? []).map((r, idx) => {
                    const manual = norm(r.source_sheet_name).toUpperCase() === "MANUAL";
                    const isPendingDelete =
                      pendingDeleteRow &&
                      norm(pendingDeleteRow.staff_name) === norm(r.staff_name) &&
                      norm(pendingDeleteRow.work_date) === norm(r.work_date) &&
                      norm(pendingDeleteRow.absence_type) === norm(r.absence_type) &&
                      idx === (filteredRows ?? []).findIndex(
                        (x) =>
                          norm(x.staff_name) === norm(r.staff_name) &&
                          norm(x.work_date) === norm(r.work_date) &&
                          norm(x.absence_type) === norm(r.absence_type)
                      );
                    return (
                      <>
                        <motion.tr
                          key={`${r.work_date}-${r.staff_name}-${r.absence_type}-${idx}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.02 }}
                          className={TABLE_ROW}
                        >
                          <td className={`${TABLE_CELL} px-4 font-medium`}>{r.staff_name || "-"}</td>
                          <td className={`${TABLE_CELL} px-4 tabular-nums`}>{r.work_date || "-"}</td>
                          <td className={`${TABLE_CELL} px-4`}>
                            <span className={badgeClassForType(r.absence_type)}>
                              {toTitleAbsenceType(r.absence_type)}
                            </span>
                          </td>
                          <td className={`${TABLE_CELL} px-4 text-zinc-400`}>{r.branch_hint || "-"}</td>
                          <td className={`${TABLE_CELL} px-4 max-w-[180px] truncate text-xs text-zinc-400`}>
                            {r.note || "-"}
                          </td>
                          <td className={`${TABLE_CELL} px-4`}>
                            {manual ? (
                              <button
                                onClick={() => setPendingDeleteRow(isPendingDelete ? null : r)}
                                disabled={loading}
                                className={`${DANGER_BUTTON} flex items-center gap-1 px-2.5 py-1 text-xs disabled:opacity-50`}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            ) : (
                              <span className={T_CAPTION}>Protected</span>
                            )}
                          </td>
                        </motion.tr>
                        {isPendingDelete ? (
                          <tr className="border-t border-red-500/10 bg-red-500/5">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-zinc-300">
                                  Delete absence for <strong className="text-white">{r.staff_name}</strong> on{" "}
                                  <strong className="text-white">{r.work_date}</strong>? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button className={SECONDARY_BUTTON + " px-3 py-1.5 text-sm"} onClick={() => setPendingDeleteRow(null)}>
                                    Cancel
                                  </button>
                                  <button
                                    className={DANGER_BUTTON + " flex items-center gap-1.5 px-3 py-1.5 text-sm"}
                                    onClick={async () => {
                                      const row = pendingDeleteRow;
                                      setPendingDeleteRow(null);
                                      if (row) await deleteRow(row);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Confirm Delete
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
