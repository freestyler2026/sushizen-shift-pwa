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

type ShiftCell = { start_hour: number; end_hour: number; role: string; note?: string };
type GridData = Record<string, Record<string, ShiftCell | null>>; // staffName → dateStr → cell
type EditTarget = { staffName: string; dateStr: string } | null;
type PageView = "edit" | "published";

type BayzatRow = {
  work_date: string;
  bayzat_name: string;
  staff_name: string;
  branch_code: string;
  start_hour: number;
  end_hour: number;
  role: string;
  type: "shift" | "day_off";
  matched: boolean;
};
type BayzatResult = {
  ok: boolean;
  city: string;
  total_rows: number;
  unmatched_count: number;
  unmatched_names: string[];
  rows: BayzatRow[];
};

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

/** Position the edit modal near the clicked cell, keeping it within the viewport. */
function getModalStyle(rect: DOMRect, modalW = 340): React.CSSProperties {
  const vW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vH = typeof window !== "undefined" ? window.innerHeight : 800;
  // Prefer right of cell; fall back to left; then centre
  let left = rect.right + 8;
  if (left + modalW > vW - 16) {
    left = rect.left - modalW - 8;
    if (left < 16) left = Math.max(16, Math.min(rect.left - modalW / 2 + rect.width / 2, vW - modalW - 16));
  }
  // Clamp top so the modal doesn't overflow the bottom
  const top = Math.max(16, Math.min(rect.top, vH - 480));
  return { position: "fixed", top, left, width: modalW, zIndex: 9999 };
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
  const [editCellRect, setEditCellRect] = useState<DOMRect | null>(null);
  const [editMode, setEditMode] = useState<"shift" | "special">("shift");
  const [editStart, setEditStart] = useState(9);
  const [editEnd, setEditEnd] = useState(17);
  const [editRole, setEditRole] = useState("CK");
  const [editCustomRole, setEditCustomRole] = useState("");
  const [editSpecialType, setEditSpecialType] = useState<SpecialRole>("DAY_OFF");
  const [editNote, setEditNote] = useState("");
  const [timeError, setTimeError] = useState("");
  const [bayzatResult, setBayzatResult] = useState<BayzatResult | null>(null);
  const [bayzatImporting, setBayzatImporting] = useState(false);
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
  const bayzatFileRef = useRef<HTMLInputElement>(null);
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

  function closeEdit() {
    setEditTarget(null);
    setEditCellRect(null);
    setTimeError("");
  }

  function openEdit(staffName: string, dateStr: string, e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditCellRect(rect);
    const existing = gridData[staffName]?.[dateStr];
    setTimeError("");
    setEditNote(existing?.note ?? "");
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
    const note = editNote.trim() || undefined;

    if (editMode === "special") {
      setGridData((prev) => ({
        ...prev,
        [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: { start_hour: 0, end_hour: 0, role: editSpecialType, note } },
      }));
      setHasDraft(true);
      closeEdit();
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
      [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: { start_hour: editStart, end_hour: editEnd, role, note } },
    }));
    setHasDraft(true);
    closeEdit();
  }

  function clearCell(staffName: string, dateStr: string) {
    setGridData((prev) => ({
      ...prev,
      [staffName]: { ...(prev[staffName] ?? {}), [dateStr]: null },
    }));
    closeEdit();
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
    if (editTarget?.staffName === staffName) closeEdit();
  }

  function addStaffRow() {
    const name = prompt("Enter staff name:");
    if (!name?.trim()) return;
    const n = name.trim();
    if (!staffList.includes(n)) setStaffList((prev) => [...prev, n].sort((a, b) => a.localeCompare(b)));
    setGridData((prev) => ({ ...prev, [n]: prev[n] ?? {} }));
  }

  // ─── Bayzat Import ───────────────────────────────────────────────────────────

  async function handleBayzatFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBayzatImporting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("city", city);
      form.append("file", file);
      const auth = getAuth();
      // Strip Content-Type from headers — FormData requires the browser to set
      // multipart/form-data with the boundary automatically. If we pass
      // Content-Type: application/json (from getAuthHeaders), the server
      // receives the wrong content type and returns 422.
      const allHeaders = getAuthHeaders(auth) as Record<string, string>;
      const { "Content-Type": _ignored, ...formHeaders } = allHeaders;
      void _ignored;
      const res = await fetch("/api/admin/shifts/bayzat_parse", {
        method: "POST",
        body: form,
        headers: formHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Parse failed" }));
        const detail = err?.detail;
        setError(typeof detail === "string" ? detail : Array.isArray(detail) ? "Bayzat parse failed (422)" : "Bayzat parse failed");
        return;
      }
      const data = (await res.json()) as BayzatResult;
      setBayzatResult(data);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "Upload failed");
    } finally {
      setBayzatImporting(false);
      e.target.value = ""; // allow re-selecting the same file
    }
  }

  function applyBayzatToGrid(rows: BayzatRow[], targetBranch: string, targetWeekStart: string) {
    const weekEnd = addDays(targetWeekStart, 6);
    const filtered = rows.filter(
      (r) =>
        r.branch_code === targetBranch &&
        r.work_date >= targetWeekStart &&
        r.work_date <= weekEnd
    );

    // Add staff names not yet in the grid
    const newNames = [...new Set(filtered.map((r) => r.staff_name).filter(Boolean))].filter(
      (n) => !staffList.includes(n)
    );
    if (newNames.length > 0) {
      setStaffList((prev) => [...new Set([...prev, ...newNames])].sort((a, b) => a.localeCompare(b)));
      setGridData((prev) => {
        const next = { ...prev };
        for (const n of newNames) if (!next[n]) next[n] = {};
        return next;
      });
    }

    // Apply cells
    setGridData((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        if (!r.staff_name) continue;
        if (!next[r.staff_name]) next[r.staff_name] = {};
        next[r.staff_name][r.work_date] = {
          start_hour: r.start_hour,
          end_hour: r.end_hour,
          role: r.role || "STAFF",
        };
      }
      return next;
    });
    setHasDraft(true);
    setBayzatResult(null);
  }

  const buildRows = useCallback(() => {
    const rows: { work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number; note: string }[] = [];
    for (const [staffName, days] of Object.entries(gridData)) {
      for (const [dateStr, cell] of Object.entries(days)) {
        if (cell && cell.role) {
          rows.push({ work_date: dateStr, staff_name: staffName, role: cell.role, start_hour: cell.start_hour, end_hour: cell.end_hour, note: cell.note || "" });
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

  // Derive the cell currently being edited (for delete button in modal)
  const editingCell = editTarget ? (gridData[editTarget.staffName]?.[editTarget.dateStr] ?? null) : null;

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
              {/* Hidden file input for Bayzat xlsx */}
              <input
                ref={bayzatFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleBayzatFile}
              />
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
              <button
                type="button"
                onClick={() => bayzatFileRef.current?.click()}
                disabled={bayzatImporting}
                title="Import shift schedule from a Bayzat Excel export"
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              >
                {bayzatImporting ? "Parsing…" : "📥 Bayzat Import"}
              </button>
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
                          return (
                            <td key={d} className="px-1 py-1 text-center align-top">
                              {cell ? (
                                isSpecialRole(cell.role) ? (
                                  <div className="group relative">
                                    <button
                                      type="button"
                                      onClick={(e) => openEdit(name, d, e)}
                                      className={`w-full rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold hover:opacity-80 transition ${specialStyle(cell.role)}`}
                                    >
                                      {specialLabel(cell.role)}
                                      {cell.note && (
                                        <span className="block truncate text-[9px] opacity-60">{cell.note}</span>
                                      )}
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
                                        onClick={(e) => openEdit(name, d, e)}
                                        className={`w-full rounded-lg border px-1.5 py-1.5 text-center transition ${tc.cell}`}
                                      >
                                        <div className={`text-xs leading-tight ${tc.time}`}>
                                          {fmtHour(cell.start_hour)}–{fmtHour(cell.end_hour)}
                                        </div>
                                        <div className={`text-[10px] ${tc.role}`}>{cell.role}</div>
                                        {cell.note && (
                                          <div className="mt-0.5 truncate text-[9px] opacity-50">{cell.note}</div>
                                        )}
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
                                  onClick={(e) => openEdit(name, d, e)}
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

      {/* ── Edit Modal (portal) ─────────────────────────────────────────────── */}
      {editTarget && editCellRect && typeof document !== "undefined" && createPortal(
        <>
          {/* Transparent backdrop — click to close */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={closeEdit}
          />

          {/* Modal */}
          <div
            className="fixed z-[9999] rounded-2xl border border-violet-500/40 bg-[#1e1730] shadow-2xl"
            style={getModalStyle(editCellRect)}
          >
            {/* Inner scroll container in case viewport is very short */}
            <div className="max-h-[90vh] overflow-y-auto p-5">

              {/* Header */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold leading-tight text-white">
                    {stripRoleSuffix(editTarget.staffName)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">{formatDate(editTarget.dateStr)}</p>
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-400 hover:bg-white/10 transition"
                >
                  ✕
                </button>
              </div>

              {/* Mode tabs */}
              <div className="mb-4 flex rounded-xl border border-white/10 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => { setEditMode("shift"); setTimeError(""); }}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${editMode === "shift" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  Shift
                </button>
                <button
                  type="button"
                  onClick={() => { setEditMode("special"); setTimeError(""); }}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${editMode === "special" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  Day Off / Absent
                </button>
              </div>

              {/* Shift fields */}
              {editMode === "shift" ? (
                <>
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">Start</label>
                    <select
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                      value={editStart}
                      onChange={(e) => { setEditStart(Number(e.target.value)); setTimeError(""); }}
                    >
                      {START_HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{fmtHour(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">End</label>
                    <select
                      className={`flex-1 rounded-lg border px-2.5 py-2 text-xs text-white focus:outline-none ${editStart >= editEnd ? "border-rose-500/70 bg-rose-950/60" : "border-neutral-700 bg-neutral-900 focus:border-violet-500"}`}
                      value={editEnd}
                      onChange={(e) => { setEditEnd(Number(e.target.value)); setTimeError(""); }}
                    >
                      {END_HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{fmtHour(h)}</option>
                      ))}
                    </select>
                  </div>
                  {timeError && (
                    <div className="mb-2.5 rounded-lg bg-rose-900/40 px-3 py-2 text-[11px] text-rose-300">
                      ⚠ {timeError}
                    </div>
                  )}
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">Role</label>
                    <select
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
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
                      className="mb-2.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
                      placeholder="Role name"
                      value={editCustomRole}
                      onChange={(e) => setEditCustomRole(e.target.value)}
                    />
                  )}
                </>
              ) : (
                <div className="mb-2.5 flex flex-col gap-2">
                  {SPECIAL_TYPES.map((sp) => (
                    <button
                      key={sp.role}
                      type="button"
                      onClick={() => setEditSpecialType(sp.role)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition ${editSpecialType === sp.role ? sp.style + " ring-1 ring-white/20" : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"}`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Note field */}
              <div className="mb-4 mt-1">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Note
                </label>
                <textarea
                  className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/40 transition"
                  rows={3}
                  placeholder="Add a note for this shift…"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editMode === "shift" && editStart >= editEnd}
                  className="flex-1 rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 transition"
                >
                  Save
                </button>
                {editingCell && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Delete shift for ${editTarget.staffName} on ${formatDate(editTarget.dateStr)}?`)) return;
                      void deletePublishedShift(editTarget.staffName, editTarget.dateStr);
                    }}
                    disabled={!!(deletingCell?.staffName === editTarget.staffName && deletingCell?.dateStr === editTarget.dateStr)}
                    className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-900/30 disabled:opacity-40 transition"
                    title="Delete this shift"
                  >
                    {deletingCell?.staffName === editTarget.staffName && deletingCell?.dateStr === editTarget.dateStr ? "…" : "🗑"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-neutral-400 hover:bg-white/10 transition"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Bayzat Import Preview Modal ─────────────────────────────────────── */}
      {bayzatResult && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4 rounded-t-2xl shrink-0">
              <div>
                <p className="font-semibold text-gray-900">📥 Bayzat Import — Preview</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {bayzatResult.total_rows} rows parsed · {city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBayzatResult(null)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 transition"
              >✕ Close</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
              {[
                { value: bayzatResult.total_rows, label: "Total rows in file", color: "text-gray-900" },
                {
                  value: bayzatResult.rows.filter(
                    (r) => r.branch_code === branchCode &&
                      r.work_date >= weekStart && r.work_date <= addDays(weekStart, 6)
                  ).length,
                  label: `${labelOf(city, branchCode)} · this week`,
                  color: "text-indigo-600",
                },
                {
                  value: bayzatResult.unmatched_count,
                  label: "Unmatched staff names",
                  color: bayzatResult.unmatched_count > 0 ? "text-amber-600" : "text-gray-900",
                },
              ].map((s) => (
                <div key={s.label} className="px-6 py-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* Unmatched names warning */}
              {bayzatResult.unmatched_names.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-amber-700">
                    ⚠ Staff names not found in Staff Master — will be added as-is
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {bayzatResult.unmatched_names.map((n) => (
                      <span key={n} className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview for current branch + week */}
              {(() => {
                const weekEnd = addDays(weekStart, 6);
                const preview = bayzatResult.rows.filter(
                  (r) => r.branch_code === branchCode && r.work_date >= weekStart && r.work_date <= weekEnd
                );
                const previewStaff = [...new Set(preview.map((r) => r.staff_name))].sort();

                return (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-gray-700">
                      Shifts to apply: {labelOf(city, branchCode)} · Week of {weekStart}
                    </p>
                    {preview.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                        No data for this branch + week in the file.<br />
                        <span className="text-xs">Check that the correct city and branch are selected, or choose a different week.</span>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-gray-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Staff</th>
                              {weekDates.map((d) => (
                                <th key={d} className="px-2 py-2 text-center font-semibold text-gray-500">{formatDate(d)}</th>
                              ))}
                              <th className="px-3 py-2 text-center font-semibold text-gray-500">Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewStaff.map((name, i) => {
                              const staffRows = preview.filter((r) => r.staff_name === name);
                              const role = staffRows.find((r) => r.type === "shift")?.role || "";
                              return (
                                <tr key={name} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                                    {stripRoleSuffix(name)}
                                    {!bayzatResult.rows.find((r) => r.staff_name === name)?.matched && (
                                      <span className="ml-1 text-[9px] text-amber-600">●new</span>
                                    )}
                                  </td>
                                  {weekDates.map((d) => {
                                    const r = staffRows.find((x) => x.work_date === d);
                                    if (!r) return <td key={d} className="px-2 py-2 text-center text-gray-300">—</td>;
                                    if (r.type === "day_off") {
                                      return (
                                        <td key={d} className="px-2 py-2 text-center">
                                          <span className="rounded-lg bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                                            Day Off
                                          </span>
                                        </td>
                                      );
                                    }
                                    const tc = timeColor(r.start_hour);
                                    return (
                                      <td key={d} className="px-1.5 py-1.5 text-center">
                                        <div className={`rounded-lg border px-1.5 py-1 ${tc.cell.split(" ").filter((c) => !c.startsWith("hover:")).join(" ")}`}>
                                          <div className={`text-[10px] font-semibold leading-tight ${tc.time}`}>
                                            {fmtHour(r.start_hour)}–{fmtHour(r.end_hour)}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-2 text-center">
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-100">
                                      {role || "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Other branches/weeks in the file */}
              {(() => {
                const branches = [...new Set(bayzatResult.rows.map((r) => r.branch_code).filter(Boolean))].sort();
                const weeks = [...new Set(bayzatResult.rows.map((r) => {
                  const d = new Date(r.work_date + "T00:00:00");
                  const day = d.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  d.setDate(d.getDate() + diff);
                  return d.toISOString().slice(0, 10);
                }))].sort();
                return (
                  <div className="text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-600">File contains: </span>
                    {branches.join(", ")} · {weeks.length} week{weeks.length !== 1 ? "s" : ""} ({weeks[0]} → {weeks[weeks.length - 1]})
                  </div>
                );
              })()}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 flex items-center gap-3 border-t border-gray-100 px-6 py-4 rounded-b-2xl bg-gray-50">
              <button
                type="button"
                onClick={() => applyBayzatToGrid(bayzatResult.rows, branchCode, weekStart)}
                disabled={bayzatResult.rows.filter(
                  (r) => r.branch_code === branchCode &&
                    r.work_date >= weekStart && r.work_date <= addDays(weekStart, 6)
                ).length === 0}
                className={`${PRIMARY_BUTTON} flex-1 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                ✅ Apply to Grid ({bayzatResult.rows.filter(
                  (r) => r.branch_code === branchCode &&
                    r.work_date >= weekStart && r.work_date <= addDays(weekStart, 6)
                ).length} rows)
              </button>
              <button
                type="button"
                onClick={() => setBayzatResult(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
