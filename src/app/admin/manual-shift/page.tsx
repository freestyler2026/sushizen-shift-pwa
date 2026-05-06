// src/app/admin/manual-shift/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, labelOf, type BranchCode, type City } from "@/lib/branches";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-tokens";

// ─── White-mode card (overrides global GLASS_CARD for this page only) ────────
const W_CARD = "rounded-2xl border border-gray-200 bg-white shadow-sm";
const W_CTRL = "rounded-2xl border border-gray-200 bg-white shadow-sm p-5";

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
// 30-minute steps: 6:00, 6:30, 7:00, … 24:00
const START_HOUR_OPTIONS = Array.from({ length: 37 }, (_, i) => 6 + i * 0.5); // 6..24
// 30-minute steps: 6:00, 6:30, … 29:00 (+5:00)
const END_HOUR_OPTIONS = Array.from({ length: 47 }, (_, i) => 6 + i * 0.5);   // 6..29

// ─── Time-based color (like Bayzat) ──────────────────────────────────────────
type TimeColors = { cell: string; time: string; role: string; dot: string };

function timeColor(startHour: number): TimeColors {
  if (startHour < 11)
    return { cell: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100", time: "text-emerald-800 font-semibold", role: "text-emerald-600", dot: "bg-emerald-400" };
  if (startHour < 15)
    return { cell: "border-sky-200 bg-sky-50 hover:bg-sky-100", time: "text-sky-800 font-semibold", role: "text-sky-600", dot: "bg-sky-400" };
  if (startHour < 19)
    return { cell: "border-amber-200 bg-amber-50 hover:bg-amber-100", time: "text-amber-800 font-semibold", role: "text-amber-600", dot: "bg-amber-400" };
  if (startHour < 24)
    return { cell: "border-rose-200 bg-rose-50 hover:bg-rose-100", time: "text-rose-800 font-semibold", role: "text-rose-600", dot: "bg-rose-400" };
  return { cell: "border-violet-200 bg-violet-50 hover:bg-violet-100", time: "text-violet-800 font-semibold", role: "text-violet-600", dot: "bg-violet-400" };
}

// ─── Special (non-shift) types ────────────────────────────────────────────────
const SPECIAL_TYPES = [
  { role: "DAY_OFF",  label: "Day Off",        style: "border-gray-300 bg-gray-100 text-gray-600" },
  { role: "ABSENT",   label: "Absent",          style: "border-red-200 bg-red-50 text-red-700" },
  { role: "VL",       label: "VL (Vacation)",   style: "border-sky-200 bg-sky-50 text-sky-700" },
  { role: "ML",       label: "ML (Medical)",    style: "border-amber-200 bg-amber-50 text-amber-700" },
  { role: "SL",       label: "SL (Sick)",       style: "border-orange-200 bg-orange-50 text-orange-700" },
] as const;
type SpecialRole = (typeof SPECIAL_TYPES)[number]["role"];
const SPECIAL_ROLE_SET = new Set<string>(SPECIAL_TYPES.map((s) => s.role));
function isSpecialRole(role: string) { return SPECIAL_ROLE_SET.has(role); }
function specialStyle(role: string) {
  return SPECIAL_TYPES.find((s) => s.role === role)?.style ?? "border-gray-300 bg-gray-100 text-gray-600";
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

function todayMonday(): string {
  return mondayOf(localDateStr(new Date()));
}

/** Strip trailing role annotations like (S), (R), (AL), (CDP), etc. from staff names. */
function stripRoleSuffix(name: string): string {
  return name.replace(/(\s*\([^)]*\))+\s*$/, "").trim();
}

function fmtHour(h: number): string {
  const mins = (h % 1) === 0.5 ? "30" : "00";
  const base = Math.floor(h);
  if (base === 0 && mins === "00") return "0:00";
  if (base >= 24) return `+${base - 24}:${mins}`;
  return `${base}:${mins}`;
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

// ─── Color legend ─────────────────────────────────────────────────────────────
function ColorLegend() {
  const bands = [
    { label: "Morning (6–11)", dot: "bg-emerald-400", text: "text-emerald-700" },
    { label: "Midday (11–15)", dot: "bg-sky-400",     text: "text-sky-700" },
    { label: "Afternoon (15–19)", dot: "bg-amber-400", text: "text-amber-700" },
    { label: "Evening (19–24)", dot: "bg-rose-400",   text: "text-rose-700" },
    { label: "Night (24+)", dot: "bg-violet-400",     text: "text-violet-700" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      {bands.map((b) => (
        <div key={b.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${b.dot}`} />
          <span className={`text-[11px] font-medium ${b.text}`}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Published View ───────────────────────────────────────────────────────────

type PublishedRow = {
  work_date: string;
  branch_code: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
};

/** One branch section — fetches its own data with branch_code filter to avoid cross-branch contamination */
function BranchSection({
  city, weekStart, weekDates, bc,
}: { city: string; weekStart: string; weekDates: string[]; bc: string }) {
  const [bRows, setBRows] = useState<PublishedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingStaff, setDeletingStaff] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ rows?: PublishedRow[] }>(
      `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}&branch_code=${encodeURIComponent(bc)}`
    )
      .then((d) => setBRows(d.rows || []))
      .catch(() => setBRows([]))
      .finally(() => setLoading(false));
  }, [city, weekStart, bc]);

  /** Delete all shifts for a staff member in this branch/week. */
  async function deleteStaffRow(staffName: string) {
    const shiftsForStaff = bRows.filter((r) => r.staff_name === staffName);
    if (shiftsForStaff.length === 0) return;
    if (!window.confirm(`Delete all ${shiftsForStaff.length} shift(s) for "${stripRoleSuffix(staffName)}"?`)) return;
    setDeletingStaff(staffName);
    try {
      for (const r of shiftsForStaff) {
        await apiFetch("/api/admin/shifts/delete_published_row", {
          method: "POST",
          body: JSON.stringify({ city, branch_code: bc, work_date: r.work_date, staff_name: staffName }),
        });
      }
      setBRows((prev) => prev.filter((r) => r.staff_name !== staffName));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingStaff(null);
    }
  }

  if (loading) {
    return (
      <div className={`${W_CARD} overflow-hidden p-0`}>
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 tracking-wide">{bc}</span>
          <span className="text-sm font-semibold text-gray-700">{labelOf(city as City, bc as BranchCode)}</span>
          <span className="text-xs text-gray-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (bRows.length === 0) return null;

  const staff = [...new Set(bRows.map((r) => r.staff_name))].sort((a, b) => a.localeCompare(b));
  const bDates = weekDates.filter((d) => bRows.some((r) => r.work_date === d));
  const lookup = (name: string, d: string) => bRows.find((r) => r.staff_name === name && r.work_date === d) ?? null;

  return (
    <div className={`${W_CARD} overflow-hidden p-0`}>
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 tracking-wide">{bc}</span>
          <span className="text-sm font-semibold text-gray-800">{labelOf(city as City, bc as BranchCode)}</span>
        </div>
        <span className="text-xs text-gray-400">{bRows.length} shifts · {staff.length} staff</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="sticky left-0 bg-gray-50 px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Staff</th>
              {bDates.map((d) => (
                <th key={d} className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">{formatDate(d)}</th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold text-gray-500">Days</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((name, i) => {
              const dayCount = bDates.filter((d) => lookup(name, d)).length;
              const isDeleting = deletingStaff === name;
              return (
                <tr key={name} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{stripRoleSuffix(name)}</td>
                  {bDates.map((d) => {
                    const row = lookup(name, d);
                    if (!row) return <td key={d} className="px-2 py-2 text-center text-gray-300">—</td>;
                    if (isSpecialRole(row.role)) {
                      return (
                        <td key={d} className="px-2 py-2 text-center">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${specialStyle(row.role)}`}>{specialLabel(row.role)}</span>
                        </td>
                      );
                    }
                    const tc = timeColor(row.start_hour);
                    return (
                      <td key={d} className="px-2 py-1.5 text-center">
                        <div className={`rounded-lg border px-2 py-1.5 ${tc.cell.split(" ").filter(c => !c.startsWith("hover:")).join(" ")}`}>
                          <div className={`font-mono text-[11px] leading-tight ${tc.time}`}>{fmtHour(row.start_hour)}–{fmtHour(row.end_hour)}</div>
                          <div className={`text-[10px] ${tc.role}`}>{row.role}</div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700 font-semibold text-[11px]">{dayCount}d</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      title="Delete all shifts for this staff member"
                      disabled={isDeleting}
                      onClick={() => void deleteStaffRow(name)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-100 disabled:opacity-40 transition"
                    >
                      {isDeleting ? "…" : "🗑 Delete"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PublishedView({
  city, weekStart, weekDates, onBackToEdit,
}: { city: string; weekStart: string; weekDates: string[]; onBackToEdit: () => void }) {
  const canonicalBranches = BRANCHES[city as City]?.map((b) => b.code) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700">📋 Published Schedule — Week of {weekStart}</p>
          <p className="mt-0.5 text-xs text-emerald-600/70">All branches · {city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}</p>
        </div>
        <button type="button" onClick={onBackToEdit}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          ✏️ Back to Edit
        </button>
      </div>
      {canonicalBranches.map((bc) => (
        <BranchSection key={bc} city={city} weekStart={weekStart} weekDates={weekDates} bc={bc} />
      ))}
    </div>
  );
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function draftKey(city: string, branch: string, week: string) {
  return `manual-shift-draft::${city}::${branch}::${week}`;
}
function saveDraft(city: string, branch: string, week: string, grid: GridData) {
  try {
    const compact: GridData = {};
    for (const [name, days] of Object.entries(grid)) {
      const filled = Object.fromEntries(Object.entries(days).filter(([, v]) => v != null));
      if (Object.keys(filled).length > 0) compact[name] = filled as Record<string, ShiftCell>;
    }
    localStorage.setItem(draftKey(city, branch, week), JSON.stringify(compact));
  } catch { /* quota exceeded — silently ignore */ }
}
function loadDraft(city: string, branch: string, week: string): GridData {
  try {
    const raw = localStorage.getItem(draftKey(city, branch, week));
    return raw ? (JSON.parse(raw) as GridData) : {};
  } catch { return {}; }
}
function clearDraft(city: string, branch: string, week: string) {
  try { localStorage.removeItem(draftKey(city, branch, week)); } catch { /* ignore */ }
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
  const [view, setView] = useState<PageView>("edit");
  const [publishedCount, setPublishedCount] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [deletingCell, setDeletingCell] = useState<{ staffName: string; dateStr: string } | null>(null);
  const [deletingStaffGrid, setDeletingStaffGrid] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const branchButtonRef = useRef<HTMLButtonElement>(null);
  const branchListRef = useRef<HTMLDivElement>(null);
  const controlsCardRef = useRef<HTMLDivElement>(null);
  const staffListRef = useRef<string[]>([]);
  const [branchDropdownRect, setBranchDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const localCellCount = useMemo(
    () => Object.values(gridData).reduce((sum, days) => sum + Object.values(days).filter(Boolean).length, 0),
    [gridData]
  );

  useEffect(() => { staffListRef.current = staffList; }, [staffList]);

  useEffect(() => {
    if (staffList.length > 0 && !loading) {
      saveDraft(city, branchCode, weekStart, gridData);
      setHasDraft(localCellCount > 0);
    }
  }, [gridData, city, branchCode, weekStart, staffList.length, localCellCount, loading]);

  useEffect(() => {
    setBranchCode(BRANCHES[city][0].code);
    setStaffList([]);
    setGridData({});
    setEditTarget(null);
    setView("edit");
  }, [city]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ names?: string[] }>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&home_branch=${encodeURIComponent(branchCode)}&exclude_role=HQ&limit=5000`
      );
      const names = (data.names || []).sort((a, b) => a.localeCompare(b));
      setStaffList(names);
      staffListRef.current = names;
      setGridData((prev) => {
        const next = { ...prev };
        for (const name of names) {
          if (!next[name]) next[name] = {};
        }
        return next;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, branchCode]);

  const loadExistingShifts = useCallback(async (forceOverwrite = false) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ rows?: any[] }>(
        `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}&branch_code=${encodeURIComponent(branchCode)}`
      );
      const rows = (data.rows || []);

      setGridData((prev) => {
        const nextGrid: GridData = {};

        const findKey = (serverName: string): string => {
          const stripped = stripRoleSuffix(serverName);
          return Object.keys(prev).find(k => stripRoleSuffix(k) === stripped) ?? serverName;
        };

        const serverNames = rows.map((r: any) => findKey(r.staff_name as string));
        const baseNames = forceOverwrite
          ? Array.from(new Set([...staffListRef.current, ...serverNames]))
          : Array.from(new Set([...Object.keys(prev), ...serverNames]));
        for (const name of baseNames) {
          nextGrid[name] = forceOverwrite ? {} : { ...(prev[name] ?? {}) };
        }
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const key = serverNames[i];
          if (!nextGrid[key]) nextGrid[key] = {};
          if (forceOverwrite || nextGrid[key][r.work_date] == null) {
            nextGrid[key][r.work_date] = {
              start_hour: Number(r.start_hour),
              end_hour: Number(r.end_hour),
              role: String(r.role || ""),
            };
          }
        }
        return nextGrid;
      });

      const currentStaff = staffListRef.current;
      const extraNames = rows
        .map((r: any) => r.staff_name as string)
        .filter((n: string) => {
          const stripped = stripRoleSuffix(n);
          return !currentStaff.some(s => stripRoleSuffix(s) === stripped);
        });
      if (extraNames.length > 0) {
        const merged = Array.from(new Set([...currentStaff, ...extraNames])).sort((a, b) => a.localeCompare(b));
        setStaffList(merged);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, weekStart, branchCode]);

  useEffect(() => {
    if (staffList.length === 0) return;
    const savedDraft = loadDraft(city, branchCode, weekStart);
    void (async () => {
      await loadStaff();
      await loadExistingShifts(true);
      if (Object.keys(savedDraft).length > 0) {
        setGridData((prev) => {
          const next: GridData = {};
          for (const [name, days] of Object.entries(prev)) next[name] = { ...days };
          for (const [name, days] of Object.entries(savedDraft)) {
            if (!next[name]) continue;
            for (const [date, cell] of Object.entries(days)) {
              if (cell != null) next[name][date] = cell;
            }
          }
          return next;
        });
      }
      setView("edit");
    })();
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
      setHasDraft(true);
      setEditTarget(null);
      return;
    }

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
    setHasDraft(true);
    setEditTarget(null);
  }

  function clearCell(staffName: string, dateStr: string) {
    setGridData((prev) => ({
      ...prev,
      [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: null },
    }));
    setEditTarget(null);
  }

  async function deletePublishedShift(staffName: string, dateStr: string) {
    setDeletingCell({ staffName, dateStr });
    try {
      await apiFetch("/api/admin/shifts/delete_published_row", {
        method: "POST",
        body: JSON.stringify({ city, branch_code: branchCode, work_date: dateStr, staff_name: staffName }),
      });
    } catch {
      // Shift may not have been published yet — still clear locally
    } finally {
      setDeletingCell(null);
    }
    clearCell(staffName, dateStr);
  }

  async function deleteStaffFromGrid(staffName: string) {
    const datesWithShifts = weekDates.filter((d) => gridData[staffName]?.[d]);
    const totalShifts = datesWithShifts.length;
    if (!window.confirm(`Delete all ${totalShifts} shift(s) for "${stripRoleSuffix(staffName)}" and remove from grid?`)) return;
    setDeletingStaffGrid(staffName);
    try {
      for (const d of datesWithShifts) {
        try {
          await apiFetch("/api/admin/shifts/delete_published_row", {
            method: "POST",
            body: JSON.stringify({ city, branch_code: branchCode, work_date: d, staff_name: staffName }),
          });
        } catch {
          // May not be published yet — continue
        }
      }
    } finally {
      setDeletingStaffGrid(null);
    }
    setStaffList((prev) => prev.filter((n) => n !== staffName));
    setGridData((prev) => {
      const next = { ...prev };
      delete next[staffName];
      return next;
    });
    if (editTarget?.staffName === staffName) setEditTarget(null);
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
      if (result.export_result?.error) {
        setError(`Sheet export error: ${result.export_result.error}`);
      }
      setPublishedCount(result.rows_copied);
      clearDraft(city, branchCode, weekStart);
      setHasDraft(false);
      setView("published");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const branches = BRANCHES[city];
  const shiftCount = buildRows().length;

  const handleBackToEdit = useCallback(() => {
    setView("edit");
    setGridData((prev) => {
      const saved = loadDraft(city, branchCode, weekStart);
      if (!saved || Object.keys(saved).length === 0) return prev;
      const next = { ...prev };
      for (const [name, days] of Object.entries(saved)) {
        next[name] = { ...(next[name] ?? {}), ...days };
      }
      return next;
    });
  }, [city, branchCode, weekStart]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const inButton = branchButtonRef.current?.contains(e.target as Node);
      const inList = branchListRef.current?.contains(e.target as Node);
      if (!inButton && !inList) {
        setBranchDropdownOpen(false);
      }
    }
    if (branchDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [branchDropdownOpen]);

  // ─── White-mode input overrides ───────────────────────────────────────────
  const W_INPUT = "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
  const W_SELECT = "w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    // White background — this page only
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-gray-900">Manual Shift Entry</h1>
            <p className="mt-1 text-xs text-gray-500">Hand-enter shifts for a week, then publish to Week / My-Shift and export to Google Sheets.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/draft" className={SECONDARY_BUTTON}>AI Draft</Link>
            <Link href="/admin" className={SECONDARY_BUTTON}>Admin Dashboard</Link>
          </div>
        </div>

        {/* Color legend */}
        <div className={`${W_CARD} px-5 py-3`}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Shift Color by Start Time</p>
          <ColorLegend />
        </div>

        {/* Controls */}
        <div ref={controlsCardRef} className={W_CTRL}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">City</label>
              <select className={W_SELECT} autoComplete="off" value={city} onChange={(e) => setCity(e.target.value as City)}>
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Branch</label>
              <div ref={branchDropdownRef} className="relative">
                <button
                  ref={branchButtonRef}
                  type="button"
                  onClick={() => {
                    const rect = branchButtonRef.current?.getBoundingClientRect();
                    if (rect) {
                      setBranchDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                    }
                    setBranchDropdownOpen((o) => !o);
                  }}
                  className={W_SELECT + " flex items-center justify-between gap-2"}
                >
                  <span>{branches.find((b) => b.code === branchCode)?.name ?? branchCode}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${branchDropdownOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {branchDropdownOpen && branchDropdownRect && typeof document !== "undefined" && createPortal(
                <div
                  ref={branchListRef}
                  style={{ position: "fixed", top: branchDropdownRect.top, left: branchDropdownRect.left, width: branchDropdownRect.width, zIndex: 9999 }}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                >
                  {branches.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => { setBranchCode(b.code as BranchCode); setBranchDropdownOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-gray-50 ${b.code === branchCode ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700"}`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Week (Monday)</label>
              <input
                type="date"
                className={W_INPUT}
                value={weekStart}
                onChange={(e) => setWeekStart(mondayOf(e.target.value || weekStart))}
              />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  const savedDraft = loadDraft(city, branchCode, weekStart);
                  await loadStaff();
                  await loadExistingShifts(true);
                  if (Object.keys(savedDraft).length > 0) {
                    setGridData((prev) => {
                      const next: GridData = {};
                      for (const [name, days] of Object.entries(prev)) next[name] = { ...days };
                      for (const [name, days] of Object.entries(savedDraft)) {
                        if (!next[name]) continue;
                        for (const [date, cell] of Object.entries(days)) {
                          if (cell != null) next[name][date] = cell;
                        }
                      }
                      return next;
                    });
                  }
                }}
                disabled={loading}
                className={SECONDARY_BUTTON}
              >
                {loading ? "Loading..." : "Load Staff & Shifts"}
              </button>
              {staffList.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Reload from server? All locally entered shifts that have not been published will be lost.")) return;
                    clearDraft(city, branchCode, weekStart);
                    setHasDraft(false);
                    await loadStaff();
                    void loadExistingShifts(true);
                  }}
                  disabled={loading}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-50"
                >
                  ↺ Reload from Server
                </button>
              )}
            </div>
          </div>
          {staffList.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xs text-gray-400">
                {staffList.length} staff · {labelOf(city, branchCode)} · Week of {weekStart}
              </p>
              {hasDraft && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  ● Unsaved draft
                </span>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* View tabs */}
        {staffList.length > 0 && (
          <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
            <button
              type="button"
              onClick={() => setView("edit")}
              className={[
                "px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
                view === "edit"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-400 hover:text-gray-700",
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
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-400 hover:text-gray-700",
              ].join(" ")}
            >
              📋 Published View
              {publishedCount > 0 && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {publishedCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── Edit view ── */}
        {staffList.length > 0 && view === "edit" && (
          <>
            <div className={`${W_CARD} overflow-hidden p-0`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="w-40 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                        Staff
                      </th>
                      {weekDates.map((d) => (
                        <th key={d} className="min-w-[110px] bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-gray-600">
                          {formatDate(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((name, idx) => (
                      <tr key={name} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-3 py-2 text-xs font-medium text-gray-700">
                          <div className="flex items-center justify-between gap-1">
                            <span>{stripRoleSuffix(name)}</span>
                            <button
                              type="button"
                              title="Delete all shifts for this staff member"
                              disabled={deletingStaffGrid === name}
                              onClick={() => void deleteStaffFromGrid(name)}
                              className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-100 disabled:opacity-40 transition"
                            >
                              {deletingStaffGrid === name ? "…" : "🗑"}
                            </button>
                          </div>
                        </td>
                        {weekDates.map((d) => {
                          const cell = gridData[name]?.[d] ?? null;
                          const isEditing = editTarget?.staffName === name && editTarget?.dateStr === d;
                          return (
                            <td key={d} className="px-1 py-1 text-center align-top">
                              {isEditing ? (
                                // Edit popup — keep dark for contrast
                                <div className="rounded-xl border border-violet-500/40 bg-violet-950/90 p-2 text-left text-xs shadow-xl" style={{ minWidth: 170 }}>
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
                                    {cell && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!window.confirm(`Delete shift for ${name} on ${formatDate(d)}?`)) return;
                                          void deletePublishedShift(name, d);
                                        }}
                                        disabled={deletingCell?.staffName === name && deletingCell?.dateStr === d}
                                        className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2 py-1 text-xs text-rose-400 hover:bg-rose-900/30 disabled:opacity-40"
                                        title="Delete this shift (removes from server)"
                                      >
                                        {deletingCell?.staffName === name && deletingCell?.dateStr === d ? "…" : "🗑"}
                                      </button>
                                    )}
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
                                  <div className="group relative">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(name, d)}
                                      className={`w-full rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold hover:opacity-80 transition ${specialStyle(cell.role)}`}
                                    >
                                      {specialLabel(cell.role)}
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete shift"
                                      disabled={!!(deletingCell?.staffName === name && deletingCell?.dateStr === d)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!window.confirm(`Delete shift for ${name} on ${formatDate(d)}?`)) return;
                                        void deletePublishedShift(name, d);
                                      }}
                                      className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white group-hover:flex"
                                    >
                                      {deletingCell?.staffName === name && deletingCell?.dateStr === d ? "…" : "×"}
                                    </button>
                                  </div>
                                ) : (() => {
                                  const tc = timeColor(cell.start_hour);
                                  return (
                                    <div className="group relative">
                                      <button
                                        type="button"
                                        onClick={() => openEdit(name, d)}
                                        className={`w-full rounded-lg border px-1.5 py-1.5 text-center transition ${tc.cell}`}
                                      >
                                        <div className={`text-xs leading-tight ${tc.time}`}>
                                          {fmtHour(cell.start_hour)}–{fmtHour(cell.end_hour)}
                                        </div>
                                        <div className={`text-[10px] ${tc.role}`}>{cell.role}</div>
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete shift"
                                        disabled={!!(deletingCell?.staffName === name && deletingCell?.dateStr === d)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!window.confirm(`Delete shift for ${name} on ${formatDate(d)}?`)) return;
                                          void deletePublishedShift(name, d);
                                        }}
                                        className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white group-hover:flex"
                                      >
                                        {deletingCell?.staffName === name && deletingCell?.dateStr === d ? "…" : "×"}
                                      </button>
                                    </div>
                                  );
                                })()
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openEdit(name, d)}
                                  className="h-10 w-full rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-indigo-300 hover:text-indigo-400 transition"
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
              <div className="border-t border-gray-100 px-4 py-3">
                <button type="button" onClick={addStaffRow} className="text-xs text-gray-400 hover:text-indigo-500 transition">
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
              <p className="text-xs text-gray-400">
                Publishes {shiftCount} shift{shiftCount !== 1 ? "s" : ""} to Week / My-Shift and exports to Google Sheets.
              </p>
              {shiftCount > 0 && (
                <button
                  type="button"
                  onClick={() => setView("published")}
                  className="text-xs text-emerald-600 hover:text-emerald-500 underline underline-offset-2"
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
            city={city}
            weekStart={weekStart}
            weekDates={weekDates}
            onBackToEdit={handleBackToEdit}
          />
        )}

        {/* Empty state */}
        {staffList.length === 0 && (
          <div className={`${W_CARD} flex flex-col items-center justify-center py-16 text-center`}>
            <div className="mb-3 text-4xl">📅</div>
            <p className="text-sm font-medium text-gray-600">Select city, branch and week, then click &ldquo;Load Staff &amp; Shifts&rdquo;</p>
            <p className="mt-1 text-xs text-gray-400">Existing published shifts for the selected week will be pre-loaded into the grid.</p>
          </div>
        )}

      </div>
    </div>
  );
}
