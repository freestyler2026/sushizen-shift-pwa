"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BarChart2,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  Download,
  Info,
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

function addDaysIso(base: string, days: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function norm(s: unknown) {
  return String(s ?? "").trim();
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

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || j?.message || `GET failed: ${res.status}`);
    } catch {
      throw new Error(text || `GET failed: ${res.status}`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || j?.message || `POST failed: ${res.status}`);
    } catch {
      throw new Error(text || `POST failed: ${res.status}`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

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

  const [filterStaffName, setFilterStaffName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(addDaysIso(todayIso(), -14));
  const [dateTo, setDateTo] = useState<string>(addDaysIso(todayIso(), 14));
  const [rows, setRows] = useState<AbsenceRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<AbsenceRow | null>(null);

  const handleWorkDateChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setWorkDate(next);
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

  const load = async () => {
    setLoading(true);
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
      setLoading(false);
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
    setBranchHint("");
    setBulkBranchHint("");
  }, [city]);

  useEffect(() => {
    if (!canAuth) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

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
      await load();
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
      await load();
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
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  function downloadCsv() {
    const headers = ["staff", "date", "type", "branch", "note", "source", "created_at"];
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
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

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-3xl space-y-5 px-4 py-8"
      >
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

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/20 to-pink-500/10">
            <CalendarOff className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Absence / Leave Management</h1>
            <p className={T_CAPTION}>Register absences and leave, process bulk entries, review history, and delete manual records.</p>
          </div>
        </div>

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
            Using the current logged-in admin credentials stored on this device.
          </div>
        </motion.div>

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
              <select
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Select staff</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Work Date</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => handleWorkDateChange(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
              <select
                value={absenceType}
                onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
                className={SELECT_CLASS}
              >
                {ABSENCE_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Branch Hint</label>
              <select
                value={branchHint}
                onChange={(e) => setBranchHint(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Select branch</option>
                {branchOptions.map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={TEXTAREA_CLASS}
              placeholder="Optional note"
            />
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Fields marked will override existing records for that date.</p>
            <button
              onClick={upsertSingle}
              disabled={loading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <Save className="h-4 w-4" />
              Save Single Absence
            </button>
          </div>
        </motion.div>

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
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Names</label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={6}
                placeholder={"One name per line\ne.g.\nJohn Smith\nJane Doe"}
                value={bulkSelectedNames.join("\n")}
                onChange={(e) =>
                  setBulkSelectedNames(
                    e.target.value
                      .split("\n")
                      .map((name) => name.trim())
                      .filter(Boolean)
                  )
                }
              />
              <p className={T_CAPTION + " mt-2"}>Use one staff name per line. Names are matched against the city-scoped staff list.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
                <div className="flex gap-2">
                  <DateRangePicker
                    value={{ from: bulkDateFrom, to: bulkDateTo }}
                    onChange={(range) => {
                      handleBulkDateFromChange(range.from);
                      handleBulkDateToChange(range.to);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleBulkDateFromChange(todayIso());
                      handleBulkDateToChange(todayIso());
                    }}
                    className={SMALL_BUTTON + " whitespace-nowrap"}
                  >
                    Range
                  </button>
                </div>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch Hint</label>
                <select
                  value={bulkBranchHint}
                  onChange={(e) => setBulkBranchHint(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">All / Optional</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
                <select
                  value={bulkAbsenceType}
                  onChange={(e) => setBulkAbsenceType(e.target.value as AbsenceType)}
                  className={SELECT_CLASS}
                >
                  {ABSENCE_TYPES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Note</label>
                <textarea
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  rows={2}
                  className={TEXTAREA_CLASS}
                  placeholder="Optional bulk note"
                />
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Bulk applies the same type to all listed staff for the selected range.</p>
            <button
              onClick={upsertBulk}
              disabled={loading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <Upload className="h-4 w-4" />
              Process Bulk
            </button>
          </div>
        </motion.div>

        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={T_SECTION}>History Filters</h2>
              <p className={T_CAPTION}>Current records: {fmtNum(rows.length)}</p>
            </div>
            <button
              onClick={load}
              disabled={loading || !canAuth}
              className={`${SECONDARY_BUTTON} text-sm disabled:opacity-50`}
            >
              Refresh
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-sm md:col-span-2">
              <div className={`${T_LABEL} mb-1.5`}>Staff Filter</div>
              <select
                value={filterStaffName}
                onChange={(e) => setFilterStaffName(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">All staff</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className={`${T_LABEL} mb-1.5`}>Date Range</div>
              <DateRangePicker
                value={{ from: dateFrom, to: dateTo }}
                onChange={(range) => {
                  handleHistoryDateFromChange(range.from);
                  handleHistoryDateToChange(range.to);
                }}
              />
            </label>

            <div className="flex items-end">
              <button
                onClick={load}
                disabled={loading || !canAuth}
                className={`${PRIMARY_BUTTON} w-full disabled:opacity-50`}
              >
                Load History
              </button>
            </div>
          </div>
        </div>

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
            </div>
            <button
              onClick={downloadCsv}
              disabled={!rows.length}
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
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Note</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className={`${TABLE_CELL} px-4 py-12 text-center text-zinc-500`}>
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarOff className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>No absence records found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const manual = norm(r.source_sheet_name).toUpperCase() === "MANUAL";
                    const isPendingDelete =
                      pendingDeleteRow &&
                      norm(pendingDeleteRow.staff_name) === norm(r.staff_name) &&
                      norm(pendingDeleteRow.work_date) === norm(r.work_date) &&
                      norm(pendingDeleteRow.absence_type) === norm(r.absence_type) &&
                      idx === rows.findIndex(
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
                          transition={{ duration: 0.2, delay: idx * 0.025 }}
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
                          <td className={`${TABLE_CELL} px-4 max-w-[160px] truncate text-xs text-zinc-500`}>
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