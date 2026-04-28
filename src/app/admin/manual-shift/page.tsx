// src/app/admin/manual-shift/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, labelOf, type BranchCode, type City } from "@/lib/branches";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type ShiftCell = { start_hour: number; end_hour: number; role: string };
type GridData = Record<string, Record<string, ShiftCell | null>>; // staffName → dateStr → cell
type EditTarget = { staffName: string; dateStr: string } | null;
type PageView = "edit" | "published";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS_DUBAI = ["CK", "SV", "BA", "HK", "SC", "MGR", "ADMIN", "DRIVER", "TRAINEE", "STAFF", "PIC", "CDP", "DCDP", "Area Manager"];
const ROLE_OPTIONS_MANILA = ["CK", "SV", "BA", "HK", "SC", "MGR", "ADMIN", "DRIVER", "TRAINEE", "STAFF", "PIC", "Cashier"];
function getRoleOptions(city: string) {
  return city === "manila" ? ROLE_OPTIONS_MANILA : ROLE_OPTIONS_DUBAI;
}
const START_HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => i + 6); // 6..24
const END_HOUR_OPTIONS = Array.from({ length: 23 }, (_, i) => i + 6);   // 6..28 (+4:00)

// Special (non-shift) types
const SPECIAL_TYPES = [
  { role: "DAY_OFF",  label: "Day Off",        style: "border-neutral-600/50 bg-neutral-700/30 text-neutral-300" },
  { role: "ABSENT",   label: "Absent",          style: "border-rose-600/50 bg-rose-900/30 text-rose-300" },
  { role: "VL",       label: "VL (Vacation)",   style: "border-sky-600/50 bg-sky-900/30 text-sky-300" },
  { role: "ML",       label: "ML (Medical)",    style: "border-amber-600/50 bg-amber-900/30 text-amber-300" },
  { role: "SL",       label: "SL (Sick)",       style: "border-orange-600/50 bg-orange-900/30 text-orange-300" },
] as const;
type SpecialRole = (typeof SPECIAL_TYPES)[number]["role"];
const SPECIAL_ROLE_SET = new Set<string>(SPECIAL_TYPES.map((s) => s.role));
function isSpecialRole(role: string) { return SPECIAL_ROLE_SET.has(role); }
function specialStyle(role: string) {
  return SPECIAL_TYPES.find((s) => s.role === role)?.style ?? "border-neutral-600/50 bg-neutral-700/30 text-neutral-300";
}
function specialLabel(role: string) {
  return SPECIAL_TYPES.find((s) => s.role === role)?.label ?? role;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function todayMonday(): string {
  return mondayOf(localDateStr(new Date()));
}

function fmtHour(h: number): string {
  if (h === 0) return "0:00";
  if (h >= 24) return `+${h - 24}:00`;
  return `${h}:00`;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(auth) ?? {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const j = text ? JSON.parse(text) : {};
    throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Published View ───────────────────────────────────────────────────────────

function PublishedView({
  gridData,
  weekDates,
  branchLabel,
  weekStart,
  shiftCount,
  onBackToEdit,
}: {
  gridData: GridData;
  weekDates: string[];
  branchLabel: string;
  weekStart: string;
  shiftCount: number;
  onBackToEdit: () => void;
}) {
  // Collect all staff names that have at least one shift this week
  const activeStaff = useMemo(() => {
    return Object.entries(gridData)
      .filter(([, days]) => Object.values(days).some((c) => c != null && c.role))
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
  }, [gridData]);

  // Dates that have at least one shift
  const activeDates = useMemo(
    () => weekDates.filter((d) => activeStaff.some((n) => gridData[n]?.[d])),
    [weekDates, activeStaff, gridData]
  );

  // Role badge color
  const roleColor = (role: string) => {
    const map: Record<string, string> = {
      CK: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      SV: "bg-sky-500/20 text-sky-300 border-sky-500/30",
      MGR: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      DRIVER: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      TRAINEE: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30",
    };
    return map[role] ?? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  };

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            ✅ {shiftCount} shifts published · {branchLabel} · Week of {weekStart}
          </p>
          <p className="mt-0.5 text-xs text-emerald-400/60">
            {activeStaff.length} staff · {activeDates.length} active days
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToEdit}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/10"
        >
          ✏️ Back to Edit
        </button>
      </div>

      {activeDates.length === 0 ? (
        <div className={`${GLASS_CARD} py-12 text-center text-sm text-neutral-500`}>
          No shifts in this week/branch.
        </div>
      ) : (
        <>
          {/* Day-by-day cards */}
          <div className="space-y-3">
            {activeDates.map((d) => {
              const dayStaff = activeStaff
                .map((name) => ({ name, cell: gridData[name]?.[d] ?? null }))
                .filter((s) => s.cell != null);

              return (
                <div key={d} className={`${GLASS_CARD} overflow-hidden p-0`}>
                  {/* Date header */}
                  <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.03] px-5 py-3">
                    <span className="text-sm font-semibold text-white">{formatDateFull(d)}</span>
                    <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs text-neutral-400">
                      {dayStaff.length} staff
                    </span>
                  </div>

                  {/* Staff rows */}
                  <div className="divide-y divide-white/5">
                    {dayStaff.map(({ name, cell }) => (
                      <div key={name} className="flex items-center justify-between px-5 py-3">
                        <span className="text-sm font-medium text-neutral-200">{name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-neutral-400">
                            {fmtHour(cell!.start_hour)} – {fmtHour(cell!.end_hour)}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${roleColor(cell!.role)}`}
                          >
                            {cell!.role}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Staff summary table */}
          <div className={`${GLASS_CARD} overflow-hidden p-0`}>
            <div className="border-b border-white/8 bg-white/[0.03] px-5 py-3">
              <span className="text-sm font-semibold text-white">Staff Overview</span>
              <span className="ml-2 text-xs text-neutral-500">all days side by side</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="px-4 py-2.5 text-left font-semibold text-neutral-400">Staff</th>
                    {activeDates.map((d) => (
                      <th key={d} className="px-3 py-2.5 text-center font-semibold text-neutral-400">
                        {formatDate(d)}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-semibold text-neutral-400">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((name, i) => {
                    const dayCount = activeDates.filter((d) => gridData[name]?.[d]).length;
                    if (dayCount === 0) return null;
                    return (
                      <tr key={name} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-2 font-medium text-neutral-200 whitespace-nowrap">{name}</td>
                        {activeDates.map((d) => {
                          const cell = gridData[name]?.[d];
                          return (
                            <td key={d} className="px-2 py-2 text-center">
                              {cell ? (
                                <div>
                                  <div className="font-mono text-neutral-300">
                                    {fmtHour(cell.start_hour)}–{fmtHour(cell.end_hour)}
                                  </div>
                                  <div className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${roleColor(cell.role)}`}>
                                    {cell.role}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-neutral-700">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300 font-semibold">
                            {dayCount}d
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManualShiftPage() {
  const auth = useMemo(() => getAuth(), []);

  const [city, setCity] = useState<City>((auth?.city as City) || "dubai");
  const [branchCode, setBranchCode] = useState(() => BRANCHES[(auth?.city as City) || "dubai"][0].code);
  const [weekStart, setWeekStart] = useState(todayMonday);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [gridData, setGridData] = useState<GridData>({});
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editMode, setEditMode] = useState<"shift" | "special">("shift");
  const [editStart, setEditStart] = useState(9);
  const [editEnd, setEditEnd] = useState(17);
  const [editRole, setEditRole] = useState("CK");
  const [editCustomRole, setEditCustomRole] = useState("");
  const [editSpecialType, setEditSpecialType] = useState<SpecialRole>("DAY_OFF");
  const [timeError, setTimeError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [view, setView] = useState<PageView>("edit");
  const [publishedCount, setPublishedCount] = useState(0);

  // Week dates Mon–Sun
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Reset branch when city changes
  useEffect(() => {
    setBranchCode(BRANCHES[city][0].code);
    setStaffList([]);
    setGridData({});
    setEditTarget(null);
    setView("edit");
  }, [city]);

  // Load staff list
  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ names?: string[] }>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=5000`
      );
      const names = (data.names || []).sort((a, b) => a.localeCompare(b));
      setStaffList(names);
      setGridData((prev) => {
        const next = { ...prev };
        for (const name of names) {
          if (!next[name]) next[name] = {};
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  // Load existing published shifts for this week/branch
  const loadExistingShifts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ rows?: any[] }>(
        `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}`
      );
      const rows = (data.rows || []).filter((r) => r.branch_code === branchCode);
      const nextGrid: GridData = {};
      for (const name of staffList) nextGrid[name] = {};
      for (const r of rows) {
        if (!nextGrid[r.staff_name]) nextGrid[r.staff_name] = {};
        nextGrid[r.staff_name][r.work_date] = {
          start_hour: Number(r.start_hour),
          end_hour: Number(r.end_hour),
          role: String(r.role || ""),
        };
      }
      setGridData(nextGrid);
      const extraNames = rows.map((r) => r.staff_name).filter((n) => !staffList.includes(n));
      if (extraNames.length > 0) {
        const merged = Array.from(new Set([...staffList, ...extraNames])).sort((a, b) => a.localeCompare(b));
        setStaffList(merged);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, weekStart, branchCode, staffList]);

  // Auto-load existing when week/branch changes (if staff already loaded)
  useEffect(() => {
    if (staffList.length > 0) {
      void loadExistingShifts();
      setView("edit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchCode]);

  function openEdit(staffName: string, dateStr: string) {
    const existing = gridData[staffName]?.[dateStr];
    setTimeError("");
    if (existing && isSpecialRole(existing.role)) {
      setEditMode("special");
      setEditSpecialType(existing.role as SpecialRole);
    } else {
      setEditMode("shift");
      setEditStart(existing?.start_hour ?? 9);
      setEditEnd(existing?.end_hour ?? 17);
      const role = existing?.role ?? getRoleOptions(city)[0];
      if (getRoleOptions(city).includes(role)) {
        setEditRole(role);
        setEditCustomRole("");
      } else {
        setEditRole("OTHER");
        setEditCustomRole(role);
      }
    }
    setEditTarget({ staffName, dateStr });
  }

  function saveEdit() {
    if (!editTarget) return;
    const { staffName, dateStr } = editTarget;
    setTimeError("");

    if (editMode === "special") {
      setGridData((prev) => ({
        ...prev,
        [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: { start_hour: 0, end_hour: 0, role: editSpecialType } },
      }));
      setEditTarget(null);
      return;
    }

    // Shift mode — validate time
    if (editStart >= editEnd) {
      setTimeError(`Start (${fmtHour(editStart)}) must be earlier than End (${fmtHour(editEnd)})`);
      return;
    }
    const role = editRole === "OTHER" ? editCustomRole.trim() : editRole;
    if (!role) return;
    setGridData((prev) => ({
      ...prev,
      [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: { start_hour: editStart, end_hour: editEnd, role } },
    }));
    setEditTarget(null);
  }

  function clearCell(staffName: string, dateStr: string) {
    setGridData((prev) => ({
      ...prev,
      [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: null },
    }));
    setEditTarget(null);
  }

  function addStaffRow() {
    const name = prompt("Enter staff name:");
    if (!name?.trim()) return;
    const n = name.trim();
    if (!staffList.includes(n)) setStaffList((prev) => [...prev, n].sort((a, b) => a.localeCompare(b)));
    setGridData((prev) => ({ ...prev, [n]: prev[n] ?? {} }));
  }

  const buildRows = useCallback(() => {
    const rows: { work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number }[] = [];
    for (const [staffName, days] of Object.entries(gridData)) {
      for (const [dateStr, cell] of Object.entries(days)) {
        if (cell && cell.role) {
          rows.push({ work_date: dateStr, staff_name: staffName, role: cell.role, start_hour: cell.start_hour, end_hour: cell.end_hour });
        }
      }
    }
    return rows;
  }, [gridData]);

  async function handlePublish() {
    setError("");
    setSuccess("");
    const rows = buildRows();
    if (rows.length === 0) {
      setError("No shifts to publish. Please add at least one shift.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ ok: boolean; rows_copied: number; export_result?: any }>(
        "/api/admin/shifts/manual_publish",
        {
          method: "POST",
          body: JSON.stringify({
            city,
            branch_code: branchCode,
            week_start: weekStart,
            rows,
            auto_export: true,
            export_month: weekStart.slice(0, 7),
          }),
        }
      );
      const exportNote = result.export_result?.error
        ? ` (Sheet export error: ${result.export_result.error})`
        : result.export_result ? " + Exported to Sheet ✓" : "";
      setSuccess(`✅ Published ${result.rows_copied} shifts to Week/My-Shift${exportNote}`);
      setPublishedCount(result.rows_copied);
      setView("published"); // ← auto-switch to Published View
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const branches = BRANCHES[city];
  const shiftCount = buildRows().length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Manual Shift Entry</h1>
          <p className={T_CAPTION}>Hand-enter shifts for a week, then publish to Week / My-Shift and export to Google Sheets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/draft" className={SECONDARY_BUTTON}>AI Draft</Link>
          <Link href="/admin" className={SECONDARY_BUTTON}>Admin Dashboard</Link>
        </div>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>City</label>
            <select className={SELECT_CLASS} value={city} onChange={(e) => setCity(e.target.value as City)}>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select className={SELECT_CLASS} value={branchCode} onChange={(e) => setBranchCode(e.target.value as BranchCode)}>
              {branches.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Week (Monday)</label>
            <input
              type="date"
              className={INPUT_CLASS}
              value={weekStart}
              onChange={(e) => setWeekStart(mondayOf(e.target.value || weekStart))}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => { void loadStaff().then(() => loadExistingShifts()); }}
              disabled={loading}
              className={SECONDARY_BUTTON}
            >
              {loading ? "Loading..." : "Load Staff & Shifts"}
            </button>
          </div>
        </div>
        {staffList.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            {staffList.length} staff loaded · {labelOf(city, branchCode)} · Week of {weekStart}
          </p>
        )}
      </div>

      {/* Error / Success */}
      {error && (
        <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* View tabs (only when staff loaded) */}
      {staffList.length > 0 && (
        <div className="flex items-center gap-1 border-b border-white/10 pb-0">
          <button
            type="button"
            onClick={() => setView("edit")}
            className={[
              "px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
              view === "edit"
                ? "border-violet-400 text-white"
                : "border-transparent text-neutral-400 hover:text-white",
            ].join(" ")}
          >
            ✏️ Edit Grid
          </button>
          <button
            type="button"
            onClick={() => setView("published")}
            className={[
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
              view === "published"
                ? "border-emerald-400 text-white"
                : "border-transparent text-neutral-400 hover:text-white",
            ].join(" ")}
          >
            📋 Published View
            {publishedCount > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {publishedCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Edit view ── */}
      {staffList.length > 0 && view === "edit" && (
        <>
          <div className={`${GLASS_CARD} overflow-hidden p-0`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-white/10 bg-[#111827]">
                    <th className="w-40 bg-[#111827] px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-neutral-400">
                      Staff
                    </th>
                    {weekDates.map((d) => (
                      <th key={d} className="min-w-[100px] bg-[#111827] px-2 py-3 text-center text-xs font-semibold text-neutral-300">
                        {formatDate(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((name, idx) => (
                    <tr key={name} className={`border-b border-white/5 ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                      <td className="px-4 py-2 text-xs font-medium text-neutral-200">{name}</td>
                      {weekDates.map((d) => {
                        const cell = gridData[name]?.[d] ?? null;
                        const isEditing = editTarget?.staffName === name && editTarget?.dateStr === d;
                        return (
                          <td key={d} className="px-1 py-1 text-center align-top">
                            {isEditing ? (
                              <div className="rounded-xl border border-violet-500/40 bg-violet-950/40 p-2 text-left text-xs" style={{ minWidth: 170 }}>
                                {/* Mode tabs */}
                                <div className="mb-2 flex rounded-lg border border-white/10 bg-white/5 p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => { setEditMode("shift"); setTimeError(""); }}
                                    className={`flex-1 rounded-md py-1 text-[10px] font-semibold transition ${editMode === "shift" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
                                  >
                                    Shift
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditMode("special"); setTimeError(""); }}
                                    className={`flex-1 rounded-md py-1 text-[10px] font-semibold transition ${editMode === "special" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
                                  >
                                    Day Off / Absent
                                  </button>
                                </div>

                                {editMode === "shift" ? (
                                  <>
                                    <div className="mb-1.5 flex items-center gap-1">
                                      <label className="w-10 shrink-0 text-neutral-400">Start</label>
                                      <select
                                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                        value={editStart}
                                        onChange={(e) => { setEditStart(Number(e.target.value)); setTimeError(""); }}
                                      >
                                        {START_HOUR_OPTIONS.map((h) => (
                                          <option key={h} value={h}>{fmtHour(h)}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="mb-1.5 flex items-center gap-1">
                                      <label className="w-10 shrink-0 text-neutral-400">End</label>
                                      <select
                                        className={`flex-1 rounded-lg border px-1.5 py-1 text-xs text-white ${editStart >= editEnd ? "border-rose-500/70 bg-rose-950/60" : "border-neutral-700 bg-neutral-900"}`}
                                        value={editEnd}
                                        onChange={(e) => { setEditEnd(Number(e.target.value)); setTimeError(""); }}
                                      >
                                        {END_HOUR_OPTIONS.map((h) => (
                                          <option key={h} value={h}>{fmtHour(h)}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {timeError && (
                                      <div className="mb-1.5 rounded-lg bg-rose-900/40 px-2 py-1 text-[10px] text-rose-300">
                                        ⚠ {timeError}
                                      </div>
                                    )}
                                    <div className="mb-2 flex items-center gap-1">
                                      <label className="w-10 shrink-0 text-neutral-400">Role</label>
                                      <select
                                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                      >
                                        {getRoleOptions(city).map((r) => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                        <option value="OTHER">Other...</option>
                                      </select>
                                    </div>
                                    {editRole === "OTHER" && (
                                      <input
                                        className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                        placeholder="Role name"
                                        value={editCustomRole}
                                        onChange={(e) => setEditCustomRole(e.target.value)}
                                      />
                                    )}
                                  </>
                                ) : (
                                  <div className="mb-2 flex flex-col gap-1">
                                    {SPECIAL_TYPES.map((sp) => (
                                      <button
                                        key={sp.role}
                                        type="button"
                                        onClick={() => setEditSpecialType(sp.role)}
                                        className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${editSpecialType === sp.role ? sp.style + " ring-1 ring-white/20" : "border-white/8 bg-white/4 text-neutral-400 hover:bg-white/8"}`}
                                      >
                                        {sp.label}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={saveEdit}
                                    disabled={editMode === "shift" && editStart >= editEnd}
                                    className="flex-1 rounded-lg bg-violet-600 py-1 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => clearCell(name, d)}
                                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-400 hover:bg-white/10"
                                  >
                                    Clear
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditTarget(null); setTimeError(""); }}
                                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-400 hover:bg-white/10"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : cell ? (
                              isSpecialRole(cell.role) ? (
                                <button
                                  type="button"
                                  onClick={() => openEdit(name, d)}
                                  className={`w-full rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold hover:opacity-80 ${specialStyle(cell.role)}`}
                                >
                                  {specialLabel(cell.role)}
                                </button>
                              ) : (
                              <button
                                type="button"
                                onClick={() => openEdit(name, d)}
                                className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1.5 text-center hover:bg-emerald-500/20"
                              >
                                <div className="text-xs font-semibold text-emerald-300">
                                  {fmtHour(cell.start_hour)}–{fmtHour(cell.end_hour)}
                                </div>
                                <div className="text-[10px] text-emerald-400/70">{cell.role}</div>
                              </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEdit(name, d)}
                                className="h-10 w-full rounded-lg border border-dashed border-white/10 text-neutral-600 hover:border-violet-500/40 hover:text-violet-400"
                              >
                                +
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/10 px-4 py-3">
              <button type="button" onClick={addStaffRow} className="text-xs text-neutral-400 hover:text-violet-300">
                + Add staff row manually
              </button>
            </div>
          </div>

          {/* Publish footer */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handlePublish}
              disabled={saving}
              className={`${PRIMARY_BUTTON} min-w-[200px]`}
            >
              {saving ? "Publishing..." : "💾 Save & Publish"}
            </button>
            <p className="text-xs text-neutral-500">
              Publishes {shiftCount} shift{shiftCount !== 1 ? "s" : ""} to Week / My-Shift and exports to Google Sheets.
            </p>
            {shiftCount > 0 && (
              <button
                type="button"
                onClick={() => setView("published")}
                className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                Preview before publishing →
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Published View ── */}
      {staffList.length > 0 && view === "published" && (
        <PublishedView
          gridData={gridData}
          weekDates={weekDates}
          branchLabel={labelOf(city, branchCode)}
          weekStart={weekStart}
          shiftCount={publishedCount || shiftCount}
          onBackToEdit={() => setView("edit")}
        />
      )}

      {/* Empty state */}
      {staffList.length === 0 && (
        <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
          <div className="mb-3 text-4xl">📅</div>
          <p className="text-sm font-medium text-neutral-300">Select city, branch and week, then click &ldquo;Load Staff &amp; Shifts&rdquo;</p>
          <p className="mt-1 text-xs text-neutral-500">Existing published shifts for the selected week will be pre-loaded into the grid.</p>
        </div>
      )}
    </div>
  );
}
