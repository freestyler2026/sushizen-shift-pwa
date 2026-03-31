"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { normalizeCalendarDateInput } from "@/lib/dateInput";

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
  if (x === "DAY_OFF") return "border-sky-900/40 bg-sky-950/20 text-sky-200";
  if (x === "VACATION_LEAVE") return "border-violet-900/40 bg-violet-950/20 text-violet-200";
  if (x === "MATERNITY_LEAVE") return "border-pink-900/40 bg-pink-950/20 text-pink-200";
  if (x === "MEDICAL_LEAVE") return "border-orange-900/40 bg-orange-950/20 text-orange-200";
  if (x === "INJURY") return "border-amber-900/40 bg-amber-950/20 text-amber-200";
  if (x === "HOSPITAL") return "border-fuchsia-900/40 bg-fuchsia-950/20 text-fuchsia-200";
  if (x === "ABSENT") return "border-rose-900/40 bg-rose-950/20 text-rose-200";
  if (x === "BEREAVEMENT_LEAVE") return "border-indigo-900/40 bg-indigo-950/20 text-indigo-200";
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
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
  const approverName = auth?.staffName || "";
  const pin = auth?.pin || "";

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

  async function loadStaffOptions(nextCity: string) {
    try {
      const res = await apiGet<StaffNamesResp>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(nextCity)}&status=ACTIVE&limit=5000`
      );
      setStaffOptions(Array.isArray(res?.names) ? res.names : []);
    } catch {
      setStaffOptions([]);
    }
  }

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
  }, [city]);

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

  const msgCls =
    msg?.kind === "err"
      ? "border-red-900/40 bg-red-950/20 text-red-200"
      : msg?.kind === "ok"
        ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200"
        : "border-amber-900/40 bg-amber-950/20 text-amber-200";

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/admin"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            ← Back to Admin
          </Link>

          <Link
            href="/admin/attendance"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Attendance
          </Link>

          <Link
            href="/admin/analytics"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Analytics
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Absence / Leave Management</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Register absences and leave, process bulk entries, review history, and delete manual records.
          </p>
        </div>

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 shadow-2xl">
          <div className="mb-4 text-sm font-semibold text-neutral-200">Scope / Approval Context</div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-sm">
              <div className="mb-2 text-neutral-300">City</div>
              <select
                value={city}
                onChange={(e) => setCity((e.target.value === "manila" ? "manila" : "dubai") as City)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            <div className="text-sm">
              <div className="mb-2 text-neutral-300">Approver Name</div>
              <div className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white">
                {approverName || "-"}
              </div>
            </div>

            <div className="text-sm">
              <div className="mb-2 text-neutral-300">PIN</div>
              <div className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white">
                {pin ? "••••" : "-"}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Using the current logged-in admin credentials stored on this device.
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 shadow-2xl">
          <div className="mb-4 text-sm font-semibold text-neutral-200">Single Upsert</div>

          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-sm md:col-span-2">
              <div className="mb-2 text-neutral-300">Staff Name</div>
              <select
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              >
                <option value="">Select staff</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-2 text-neutral-300">Work Date</div>
              <input
                type="date"
                value={workDate}
                onChange={(e) => handleWorkDateChange(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              />
            </label>

            <label className="text-sm">
              <div className="mb-2 text-neutral-300">Absence Type</div>
              <select
                value={absenceType}
                onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              >
                {ABSENCE_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-2 text-neutral-300">Branch Hint</div>
              <select
                value={branchHint}
                onChange={(e) => setBranchHint(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              >
                <option value="">Select branch</option>
                {branchOptions.map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block text-sm">
            <div className="mb-2 text-neutral-300">Note</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              placeholder="Optional note"
            />
          </label>

          <div className="mt-4">
            <button
              onClick={upsertSingle}
              disabled={loading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              Save Single Absence
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 shadow-2xl">
          <div className="mb-4 text-sm font-semibold text-neutral-200">Bulk Upsert</div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm md:col-span-2">
              <div className="mb-2 text-neutral-300">Staff Names</div>
              <select
                multiple
                value={bulkSelectedNames}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setBulkSelectedNames(values);
                }}
                className="h-56 w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              >
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-neutral-500">
                Hold Command on Mac to select multiple staff.
              </div>
            </label>

            <div className="space-y-4">
              <label className="block text-sm">
                <div className="mb-2 text-neutral-300">Date From</div>
                <input
                  type="date"
                  value={bulkDateFrom}
                  onChange={(e) => handleBulkDateFromChange(e.target.value)}
                  max={bulkDateTo || undefined}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-neutral-300">Date To</div>
                <input
                  type="date"
                  value={bulkDateTo}
                  onChange={(e) => handleBulkDateToChange(e.target.value)}
                  min={bulkDateFrom || undefined}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-neutral-300">Absence Type</div>
                <select
                  value={bulkAbsenceType}
                  onChange={(e) => setBulkAbsenceType(e.target.value as AbsenceType)}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                >
                  {ABSENCE_TYPES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <div className="mb-2 text-neutral-300">Branch Hint</div>
                <select
                  value={bulkBranchHint}
                  onChange={(e) => setBulkBranchHint(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                >
                  <option value="">All / Optional</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-neutral-300">Note</div>
                <textarea
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                  placeholder="Optional bulk note"
                />
              </label>

              <button
                onClick={upsertBulk}
                disabled={loading}
                className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
              >
                Save Bulk Absences
              </button>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 shadow-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-200">Absence History</div>
            <button
              onClick={load}
              disabled={loading || !canAuth}
              className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-white transition hover:bg-neutral-900 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-sm md:col-span-2">
              <div className="mb-2 text-neutral-300">Staff Filter</div>
              <select
                value={filterStaffName}
                onChange={(e) => setFilterStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
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
              <div className="mb-2 text-neutral-300">Date From</div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleHistoryDateFromChange(e.target.value)}
                max={dateTo || undefined}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              />
            </label>

            <label className="text-sm">
              <div className="mb-2 text-neutral-300">Date To</div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleHistoryDateToChange(e.target.value)}
                min={dateFrom || undefined}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
              />
            </label>

            <div className="flex items-end">
              <button
                onClick={load}
                disabled={loading || !canAuth}
                className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
              >
                Load History
              </button>
            </div>
          </div>
        </section>

        {msg ? (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${msgCls}`}>{msg.text}</div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-950/70 text-left text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-5 text-neutral-400">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-5 text-neutral-400">
                      No absence rows found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const manual = norm(r.source_sheet_name).toUpperCase() === "MANUAL";
                    return (
                      <tr
                        key={`${r.work_date}-${r.staff_name}-${r.absence_type}-${idx}`}
                        className="border-t border-neutral-800 align-top"
                      >
                        <td className="px-4 py-3">{r.work_date || "-"}</td>
                        <td className="px-4 py-3 font-medium text-white">{r.staff_name || "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs ${badgeClassForType(
                              r.absence_type
                            )}`}
                          >
                            {toTitleAbsenceType(r.absence_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{r.branch_hint || "-"}</td>
                        <td className="px-4 py-3 text-neutral-300">{r.note || "-"}</td>
                        <td className="px-4 py-3">{r.source_sheet_name || "-"}</td>
                        <td className="px-4 py-3 text-neutral-400">{r.created_at || "-"}</td>
                        <td className="px-4 py-3">
                          {manual ? (
                            <button
                              onClick={() => deleteRow(r)}
                              disabled={loading}
                              className="rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-950/40 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-xs text-neutral-500">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}