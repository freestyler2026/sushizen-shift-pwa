// src/app/admin/manual-shift/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getAuth, getAuthHeaders, tryRefreshAccessToken } from "@/lib/auth";
import { BRANCHES, labelOf, type BranchCode, type City } from "@/lib/branches";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";
import { useUnsavedGuard } from "@/lib/unsavedGuard";

// ─── White-mode card (overrides global GLASS_CARD for this page only) ────────
const W_CARD = "rounded-2xl border border-gray-200 bg-white shadow-sm";
const W_CTRL = "rounded-2xl border border-gray-200 bg-white shadow-sm p-5";

// ─── Types ───────────────────────────────────────────────────────────────────

type ShiftCell = { start_hour: number; end_hour: number; role: string; branch_code?: string; note?: string };
type GridData = Record<string, Record<string, ShiftCell | ShiftCell[] | null>>; // staffName → dateStr → cell(s)

/** Normalise a grid cell to an array (empty for null/undefined). */
function cellsOf(c: ShiftCell | ShiftCell[] | null | undefined): ShiftCell[] {
  if (!c) return [];
  return Array.isArray(c) ? c : [c];
}
/** One cell of the week's working overlay, as the server keeps it. */
type WeekEdit = {
  staff_name: string;
  work_date: string;
  cells: ShiftCell[];
  edited_by: string;
  edited_at: string;
  rev: number;
  /** Already applied to the published week — no longer pending. */
  published: boolean;
};

type WeekState = {
  ok: boolean;
  published_token: string;
  max_rev: number;
  edits: WeekEdit[];
  pending: number;
  published_changed: boolean;
};

type EditTarget = { staffName: string; dateStr: string } | null;
type PageView = "edit" | "published" | "search" | "monthly";


type SearchResultRow = {
  staff_name: string;
  branch_code: string;
  branch_label: string;
  dates: Record<string, ShiftCell | ShiftCell[] | null>;
};
type MonthlyCell = { count: number };
type MonthlyData = Record<string, Record<string, MonthlyCell>>; // branchCode → weekStart → cell

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

// ─── Time-based color ────────────────────────────────────────────────────────
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
  // Clamp top so the modal fits within the viewport, then cap its height to the remaining space.
  const top = Math.max(16, Math.min(rect.top, vH - 480));
  return { position: "fixed", top, left, width: modalW, zIndex: 9999, maxHeight: vH - top - 16, overflowY: "auto" as const };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = () => {
    const auth = getAuth();
    return fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(getAuthHeaders(auth) ?? {}),
        ...(options.headers ?? {}),
      },
    });
  };
  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) res = await doFetch();
  }
  const text = await res.text();
  if (!res.ok) {
    let j: Record<string, unknown> = {};
    try { j = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { /* non-JSON body (e.g. 502 HTML) */ }
    // FastAPI's detail can be an object — the 409s from the whole-week publish paths
    // (Load from DB, and the old publish a cached tab may still call) carry one.
    // Reading it as a string would surface "[object Object]" to the user.
    const detail = j?.detail;
    const detailMsg = typeof detail === "string"
      ? detail
      : (detail && typeof detail === "object" ? String((detail as Record<string, unknown>).message ?? "") : "");
    throw new Error(detailMsg || (j?.message as string) || text || `HTTP ${res.status}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
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
  // Use filter (not find) so all shifts for a staff+date are returned (supports double shifts)
  const lookup = (name: string, d: string) => bRows.filter((r) => r.staff_name === name && r.work_date === d);

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
              const dayCount = bDates.filter((d) => lookup(name, d).length > 0).length;
              const isDeleting = deletingStaff === name;
              return (
                <tr key={name} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{stripRoleSuffix(name)}</td>
                  {bDates.map((d) => {
                    const rows = lookup(name, d);
                    if (rows.length === 0) return <td key={d} className="px-2 py-2 text-center text-gray-300">—</td>;
                    if (rows.length === 1 && isSpecialRole(rows[0].role)) {
                      return (
                        <td key={d} className="px-2 py-2 text-center">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${specialStyle(rows[0].role)}`}>{specialLabel(rows[0].role)}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={d} className="px-2 py-1.5 text-center">
                        <div className="flex flex-col gap-0.5">
                          {rows.map((row, ri) => {
                            const tc = timeColor(row.start_hour);
                            return (
                              <div key={ri} className={`rounded-lg border px-2 py-1.5 ${tc.cell.split(" ").filter(c => !c.startsWith("hover:")).join(" ")}`}>
                                <div className={`font-mono text-[11px] leading-tight ${tc.time}`}>{fmtHour(row.start_hour)}–{fmtHour(row.end_hour)}</div>
                                <div className={`text-[10px] ${tc.role}`}>{row.role}</div>
                              </div>
                            );
                          })}
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

// ─── The outbox ───────────────────────────────────────────────────────────────
//
// This page used to keep a copy of the whole week in localStorage and publish it
// by replacing the published week. One person's copy could therefore erase
// another's correction, which is why the publish had to be blocked whenever the
// copy could not be proven current — and that block kept refusing the editor's
// own work.
//
// What is kept here now is not the week. It is only the cells this browser has
// edited and not yet had acknowledged by the server: a queue of outstanding
// writes. It exists so a dropped connection in a store does not lose what someone
// just typed. A queue of edits cannot overwrite a cell nobody edited, so there is
// nothing left for a staleness check to protect.

/** One edited cell on its way to the server. An empty `cells` is the cell
 *  explicitly cleared, which is not the same as never having been touched. */
type PendingEdit = {
  city: string;
  branch_code: string;
  week_start: string;
  staff_name: string;
  work_date: string;
  cells: ShiftCell[];
};

/** One key for every queued edit, not one per week. Each entry carries the week
 *  it belongs to, so changing week or branch mid-flush cannot post an edit
 *  against the wrong one. */
const OUTBOX_KEY = "manual-shift-outbox";

function cellKey(staffName: string, dateStr: string) {
  return `${staffName}|${dateStr}`;
}

/** One cell as a single comparable string. Used to tell a real change from a
 *  copy of what is already published — order and formatting must not matter. */
function cellSignature(value: ShiftCell | ShiftCell[] | null | undefined): string {
  return cellsOf(value)
    .map((c) => `${c.start_hour}-${c.end_hour}:${c.role || ""}:${c.note || ""}:${c.branch_code || ""}`)
    .sort()
    .join("+");
}

/** Identity of a queued edit: one pending write per cell per week. A second edit
 *  to the same cell replaces the first rather than queueing behind it. */
function queueKey(e: PendingEdit) {
  return `${e.city}|${e.branch_code}|${e.week_start}|${e.staff_name}|${e.work_date}`;
}

function loadOutbox(): PendingEdit[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingEdit[]) : [];
  } catch { return []; }
}

function saveOutbox(edits: PendingEdit[]) {
  try {
    if (edits.length === 0) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(edits));
  } catch { /* quota exceeded — the edit is still in flight, just not recoverable */ }
}

/** Retire the pre-cell-level saved weeks. Left alone they sit in every browser
 *  holding a stale copy of a week nothing reads any more. */
function dropLegacyWeekDraft(city: string, branch: string, week: string) {
  try { localStorage.removeItem(`manual-shift-draft::${city}::${branch}::${week}`); } catch { /* ignore */ }
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
  const [editShiftIndex, setEditShiftIndex] = useState<number | null>(null);
  const [editBranchCode, setEditBranchCode] = useState<string>(branchCode);
  const [dbImporting, setDbImporting] = useState(false);
  const [draftImporting, setDraftImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<PageView>("edit");
  const [publishedCount, setPublishedCount] = useState(0);

  // ─── Cell-level sync ──────────────────────────────────────────────────────
  // Edits this browser has not yet had acknowledged. Held in a ref because the
  // flush loop reads it outside React's render cycle, and mirrored to state only
  // so the header can say whether everything is saved.
  const outboxRef = useRef<Map<string, PendingEdit>>(new Map());
  const [outboxSize, setOutboxSize] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [notice, setNotice] = useState("");
  /** Cells edited but not yet published — anyone's, not just this browser's. */
  const [unpublishedCells, setUnpublishedCells] = useState<Set<string>>(new Set());
  /** Who last touched each unpublished cell, so a second editor is visible
   *  rather than silent. */
  const [cellEditors, setCellEditors] = useState<Record<string, { by: string; at: string }>>({});
  const revRef = useRef(0);
  const publishedTokenRef = useRef("");
  /** The published week exactly as last loaded, so a carried-over draft cell can
   *  be compared against it. Without this the migration below cannot tell a real
   *  edit from a saved copy of what is already published. */
  const publishedGridRef = useRef<Record<string, string>>({});

  // A new deploy hard-reloads the page. Edits are saved as they are made now, so
  // the only thing a reload can lose is what has not reached the server yet.
  useUnsavedGuard("manual-shift", outboxSize > 0);
  const [removedStaff, setRemovedStaff] = useState<string[]>([]);
  const removedStaffRef = useRef<string[]>([]);
  removedStaffRef.current = removedStaff;
  const [approvedDayOffs, setApprovedDayOffs] = useState<Set<string>>(new Set());
  const [paintMode, setPaintMode] = useState(false);
  const [paintStart, setPaintStart] = useState(9);
  const [paintEnd, setPaintEnd] = useState(17);
  const [paintRole, setPaintRole] = useState("CK");
  const [paintSplit, setPaintSplit] = useState(false);
  const [paintStart2, setPaintStart2] = useState(16);
  const [paintEnd2, setPaintEnd2] = useState(21);

  // ─── Employee Search state ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRan, setSearchRan] = useState(false);
  const searchTokenRef = useRef(0);
  const monthlyTokenRef = useRef(0);

  // ─── Monthly View state ───────────────────────────────────────────────────
  const [monthVal, setMonthVal] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData>({});
  const [monthlyWeeks, setMonthlyWeeks] = useState<string[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

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

  useEffect(() => { staffListRef.current = staffList; }, [staffList]);

  // ─── Sending edits ────────────────────────────────────────────────────────

  const syncOutboxSize = useCallback(() => {
    setOutboxSize(outboxRef.current.size);
    saveOutbox(Array.from(outboxRef.current.values()));
  }, []);

  /** Send everything queued. Grouped by week so a queue built across a week
   *  change still lands in the right place. What fails stays queued. */
  const flushOutbox = useCallback(async () => {
    if (outboxRef.current.size === 0) return;
    const groups = new Map<string, PendingEdit[]>();
    for (const e of outboxRef.current.values()) {
      const g = `${e.city}|${e.branch_code}|${e.week_start}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(e);
    }
    let failed = false;
    for (const [g, edits] of groups) {
      const [c, bc, ws] = g.split("|");
      try {
        await apiFetch("/api/admin/shifts/week_cells", {
          method: "POST",
          body: JSON.stringify({
            city: c, branch_code: bc, week_start: ws,
            edits: edits.map((e) => ({ staff_name: e.staff_name, work_date: e.work_date, cells: e.cells })),
          }),
        });
        for (const e of edits) {
          // Only drop the queued edit if it is still the one we sent. A newer
          // edit to the same cell must not be dropped by an older flush.
          const k = queueKey(e);
          if (outboxRef.current.get(k) === e) outboxRef.current.delete(k);
        }
      } catch {
        failed = true;
      }
    }
    setSyncError(failed ? "Not saved yet — retrying. Keep this page open." : "");
    syncOutboxSize();
  }, [syncOutboxSize]);

  /** The single place a cell changes. Everything that edits the grid goes
   *  through here, so nothing can change a cell without it being saved. */
  const commitCells = useCallback((
    changes: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }[],
  ) => {
    if (changes.length === 0) return;
    setGridData((prev) => {
      const next: GridData = {};
      for (const [name, days] of Object.entries(prev)) next[name] = { ...days };
      for (const ch of changes) {
        next[ch.staffName] = { ...(next[ch.staffName] ?? {}), [ch.dateStr]: ch.value };
      }
      return next;
    });
    const now = new Date().toISOString();
    const me = auth?.staffName || "you";
    setUnpublishedCells((prev) => {
      const s = new Set(prev);
      for (const ch of changes) s.add(cellKey(ch.staffName, ch.dateStr));
      return s;
    });
    setCellEditors((prev) => {
      const nx = { ...prev };
      for (const ch of changes) nx[cellKey(ch.staffName, ch.dateStr)] = { by: me, at: now };
      return nx;
    });
    for (const ch of changes) {
      const e: PendingEdit = {
        city, branch_code: branchCode, week_start: weekStart,
        staff_name: ch.staffName, work_date: ch.dateStr,
        cells: cellsOf(ch.value),
      };
      outboxRef.current.set(queueKey(e), e);
    }
    syncOutboxSize();
    void flushOutbox();
  }, [city, branchCode, weekStart, auth?.staffName, syncOutboxSize, flushOutbox]);

  const commitCell = useCallback(
    (staffName: string, dateStr: string, value: ShiftCell | ShiftCell[] | null) =>
      commitCells([{ staffName, dateStr, value }]),
    [commitCells],
  );

  /** Lay the week's unpublished edits over the grid. Returns the cells it touched.
   *
   *  A cell still queued in this browser is skipped: what the server echoes back
   *  is what we sent a moment ago, and applying it would undo a newer keystroke. */
  const applyOverlay = useCallback((edits: WeekEdit[]): Set<string> => {
    const touched = new Set<string>();
    const changes: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }[] = [];
    const editors: Record<string, { by: string; at: string }> = {};
    const published: string[] = [];
    for (const e of edits) {
      const k = cellKey(e.staff_name, e.work_date);
      const queued = outboxRef.current.has(
        `${city}|${branchCode}|${weekStart}|${e.staff_name}|${e.work_date}`
      );
      if (queued) continue;
      const cells = (e.cells || []).map((c) => ({
        start_hour: Number(c.start_hour),
        end_hour: Number(c.end_hour),
        role: String(c.role || ""),
        note: c.note ? String(c.note) : undefined,
        branch_code: c.branch_code ? String(c.branch_code) : undefined,
      }));
      changes.push({
        staffName: e.staff_name,
        dateStr: e.work_date,
        value: cells.length === 0 ? null : cells.length === 1 ? cells[0] : cells,
      });
      if (e.published) published.push(k);
      else {
        touched.add(k);
        editors[k] = { by: e.edited_by || "", at: e.edited_at || "" };
      }
    }
    if (changes.length > 0) {
      setGridData((prev) => {
        const next: GridData = {};
        for (const [name, days] of Object.entries(prev)) next[name] = { ...days };
        for (const ch of changes) {
          // A cell for somebody not on this branch's roster would be a phantom row.
          if (!next[ch.staffName]) continue;
          next[ch.staffName][ch.dateStr] = ch.value;
        }
        return next;
      });
    }
    setUnpublishedCells((prev) => {
      const s = new Set(prev);
      for (const k of touched) s.add(k);
      for (const k of published) s.delete(k);
      return s;
    });
    if (Object.keys(editors).length > 0) setCellEditors((prev) => ({ ...prev, ...editors }));
    return touched;
  }, [city, branchCode, weekStart]);

  // Recover anything left queued by a closed tab or a dropped connection.
  useEffect(() => {
    const saved = loadOutbox();
    if (saved.length > 0) {
      for (const e of saved) outboxRef.current.set(queueKey(e), e);
      setOutboxSize(outboxRef.current.size);
      void flushOutbox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry loop for a failed send. Idle when the queue is empty.
  useEffect(() => {
    if (outboxSize === 0) return;
    const t = window.setInterval(() => { void flushOutbox(); }, 5000);
    return () => window.clearInterval(t);
  }, [outboxSize, flushOutbox]);

  useEffect(() => {
    setBranchCode(BRANCHES[city][0].code);
    setStaffList([]);
    setGridData({});
    setEditTarget(null);
    setView("edit");
    setPublishedCount(0);
    setSearchResults([]);
    setSearchRan(false);
    setMonthlyData({});
    setMonthlyWeeks([]);
  }, [city]);

  const loadStaff = useCallback(async (cancelledRef?: { current: boolean }): Promise<boolean> => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ names?: string[] }>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&home_branch=${encodeURIComponent(branchCode)}&exclude_role=HQ&limit=5000`
      );
      if (cancelledRef?.current) return false;
      // Rows taken out of the grid this session stay out. The roster still lists
      // them, so without this the removal is undone by the next load.
      const removedNow = new Set(removedStaffRef.current);
      const names = (data.names || [])
        .filter((n) => !removedNow.has(n))
        .sort((a, b) => a.localeCompare(b));
      setStaffList(names);
      staffListRef.current = names;
      setGridData((prev) => {
        const next = { ...prev };
        for (const name of names) {
          if (!next[name]) next[name] = {};
        }
        return next;
      });
      return true;
    } catch (e: unknown) {
      if (!cancelledRef?.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, [city, branchCode]);

  const loadExistingShifts = useCallback(async (forceOverwrite = false, cancelledRef?: { current: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ rows?: any[]; state_token?: string; content_hash?: string }>(
        `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}&branch_code=${encodeURIComponent(branchCode)}`
      );
      if (cancelledRef?.current) return "";
      const rows = (data.rows || []);
      const serverToken = data.state_token ?? "";
      publishedTokenRef.current = serverToken;
      {
        const byCell: Record<string, ShiftCell[]> = {};
        for (const r of rows as any[]) {
          const k = cellKey(String(r.staff_name), String(r.work_date));
          (byCell[k] ??= []).push({
            start_hour: Number(r.start_hour), end_hour: Number(r.end_hour),
            role: String(r.role || ""),
            note: r.note ? String(r.note) : undefined,
            branch_code: r.branch_code ? String(r.branch_code) : undefined,
          });
        }
        publishedGridRef.current = Object.fromEntries(
          Object.entries(byCell).map(([k, v]) => [k, cellSignature(v)])
        );
      }

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
        // Group rows by staff+date to support split shifts
        const grouped: Record<string, ShiftCell[]> = {};
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const key = `${serverNames[i]}|${r.work_date}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({
            start_hour: Number(r.start_hour),
            end_hour: Number(r.end_hour),
            role: String(r.role || ""),
            note: r.note ? String(r.note) : undefined,
            branch_code: r.branch_code ? String(r.branch_code) : undefined,
          });
        }
        for (const [key, shifts] of Object.entries(grouped)) {
          const sepIdx = key.lastIndexOf("|");
          const staffKey = key.slice(0, sepIdx);
          const workDate = key.slice(sepIdx + 1);
          if (!nextGrid[staffKey]) nextGrid[staffKey] = {};
          if (forceOverwrite || nextGrid[staffKey][workDate] == null) {
            const sorted = shifts.slice().sort((a, b) => a.start_hour - b.start_hour);
            nextGrid[staffKey][workDate] = sorted.length === 1 ? sorted[0] : sorted;
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
        const removedNow = new Set(removedStaffRef.current);
        const merged = Array.from(new Set([...currentStaff, ...extraNames]))
          .filter((n) => !removedNow.has(n))
          .sort((a, b) => a.localeCompare(b));
        setStaffList(merged);
      }
      return serverToken;
    } catch (e: unknown) {
      if (!cancelledRef?.current) setError(e instanceof Error ? e.message : String(e));
      return "";
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, [city, weekStart, branchCode]);

  useEffect(() => {
    if (staffList.length === 0) return;
    // cancelledRef is shared with loadStaff/loadExistingShifts so they can check
    // it before each setState call — prevents stale fetches from overwriting newer results.
    const cancelledRef = { current: false };
    dropLegacyWeekDraft(city, branchCode, weekStart);
    setRemovedStaff([]);
    removedStaffRef.current = [];
    setUnpublishedCells(new Set());
    setCellEditors({});
    revRef.current = 0;
    setPublishedCount(0);
    void (async () => {
      const staffOk = await loadStaff(cancelledRef);
      if (cancelledRef.current) return;
      if (!staffOk) return; // staff load failed — keep the error visible
      await loadExistingShifts(true, cancelledRef);
      if (cancelledRef.current) return;

      // The week's unpublished edits — everyone's, not this browser's. They lay
      // over the published week; a cell with no edit is whatever is published.
      let overlaid = new Set<string>();
      try {
        const state = await apiFetch<WeekState>(
          `/api/admin/shifts/week_state?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}` +
          `&week_start=${encodeURIComponent(weekStart)}&since_rev=0&published_token=${encodeURIComponent(publishedTokenRef.current)}`
        );
        if (!cancelledRef.current) {
          revRef.current = state.max_rev ?? 0;
          overlaid = applyOverlay(state.edits ?? []);
        }
      } catch {
        // Without the overlay the page still shows the published week, which is
        // true — just missing what has not been published yet.
      }

      // Work saved with the old "Save Draft" button lived in a separate table and
      // was only ever applied to the screen. Publishing now sends the overlay, so
      // that work would quietly not be published. Move it across, once, and only
      // into cells the overlay does not already cover.
      if (!cancelledRef.current && revRef.current === 0) {
        try {
          const draftData = await apiFetch<{ version_id: string | null; rows: any[] }>(
            `/api/admin/shifts/draft_week?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&week_start=${encodeURIComponent(weekStart)}`
          );
          const carried: { staffName: string; dateStr: string; value: ShiftCell }[] = [];
          const seen = new Set<string>();
          for (const r of (draftData.rows || []) as any[]) {
            const rName = String(r.staff_name);
            const rDate = String(r.work_date);
            const k = cellKey(rName, rDate);
            if (overlaid.has(k) || seen.has(k)) continue;
            if (!staffListRef.current.includes(rName)) continue;
            seen.add(k);
            const value: ShiftCell = {
              start_hour: Number(r.start_hour),
              end_hour: Number(r.end_hour),
              role: String(r.role || "STAFF"),
              note: r.note ? String(r.note) : undefined,
            };
            // Most saved drafts are a copy of what is already published. Carrying
            // those across would report dozens of changes when nothing changed,
            // and ask for a publish that does nothing.
            if (cellSignature(value) === (publishedGridRef.current[k] ?? "")) continue;
            carried.push({ staffName: rName, dateStr: rDate, value });
          }
          if (!cancelledRef.current && carried.length > 0) {
            commitCells(carried);
            setNotice(`${carried.length} cell${carried.length === 1 ? "" : "s"} from the old saved draft moved into this week — publish when ready.`);
          }
        } catch {
          // No old draft, or it could not be read. Nothing to carry across.
        }
      }
      // Fetch approved Day-Off proposals so empty cells can show "Day Off" badge
      try {
        const restData = await apiFetch<{ ok: boolean; items: { staff_name: string; work_date: string; note: string }[] }>(
          `/api/admin/shifts/week-rest-proposals?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&week_start=${encodeURIComponent(weekStart)}`
        );
        if (!cancelledRef.current && restData.ok && restData.items?.length > 0) {
          setApprovedDayOffs(new Set(restData.items.map((r) => `${r.staff_name}|${r.work_date}`)));
        } else if (!cancelledRef.current) {
          setApprovedDayOffs(new Set());
        }
      } catch {
        // Approved day-offs overlay is optional — ignore errors silently
      }
      if (cancelledRef.current) return;
      setView("edit");
    })();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchCode]);

  // ─── Seeing other people's edits ──────────────────────────────────────────
  //
  // Polling, not a socket: the page is open for minutes at a time and a few
  // seconds of lag on someone else's cell is not worth a persistent connection.

  /** Fetch the week's overlay from the beginning and lay all of it back on.
   *  Needed after the published week is reloaded, because that rebuilds the grid
   *  from published rows alone -- without this the cells someone has edited but
   *  not published would silently snap back to their published values. */
  const reapplyWholeOverlay = useCallback(async () => {
    const state = await apiFetch<WeekState>(
      `/api/admin/shifts/week_state?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}` +
      `&week_start=${encodeURIComponent(weekStart)}&since_rev=0&published_token=${encodeURIComponent(publishedTokenRef.current)}`
    );
    revRef.current = state.max_rev ?? 0;
    applyOverlay(state.edits ?? []);
  }, [city, branchCode, weekStart, applyOverlay]);

  /** Published week + overlay, in that order. Every refresh path uses this so
   *  none of them can reload one without the other. */
  const refreshWeek = useCallback(async () => {
    await loadExistingShifts(true);
    try { await reapplyWholeOverlay(); } catch { /* keep the published week on screen */ }
  }, [loadExistingShifts, reapplyWholeOverlay]);

  useEffect(() => {
    if (staffList.length === 0 || view !== "edit") return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) return;
      try {
        const state = await apiFetch<WeekState>(
          `/api/admin/shifts/week_state?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}` +
          `&week_start=${encodeURIComponent(weekStart)}&since_rev=${revRef.current}` +
          `&published_token=${encodeURIComponent(publishedTokenRef.current)}`
        );
        if (stopped) return;
        if (state.published_changed) {
          // Someone published, or another page changed a row. Reloading the
          // published week rebuilds the grid, so the whole overlay goes back on.
          await refreshWeek();
          return;
        }
        revRef.current = Math.max(revRef.current, state.max_rev ?? 0);
        if (state.edits?.length) applyOverlay(state.edits);
      } catch {
        // A failed poll is not worth telling anyone about — the next one is in
        // five seconds, and the page is still showing true data meanwhile.
      }
    };
    const t = window.setInterval(() => { void tick(); }, 5000);
    return () => { stopped = true; window.clearInterval(t); };
  }, [city, branchCode, weekStart, staffList.length, view, applyOverlay, refreshWeek]);

  function closeEdit() {
    setEditTarget(null);
    setEditCellRect(null);
    setTimeError("");
  }

  function applyPaint(staffName: string, dateStr: string) {
    if (paintStart >= paintEnd) return;
    const b = branchCode || undefined;
    const block1: ShiftCell = { start_hour: paintStart, end_hour: paintEnd, role: paintRole, branch_code: b };
    const value: ShiftCell | ShiftCell[] =
      paintSplit && paintStart2 < paintEnd2
        ? [block1, { start_hour: paintStart2, end_hour: paintEnd2, role: paintRole, branch_code: b }]
        : block1;
    commitCell(staffName, dateStr, value);
  }

  function loadShiftIntoForm(shift: ShiftCell | null, index: number | null) {
    setEditShiftIndex(index);
    setTimeError("");
    setEditNote(shift?.note ?? "");
    setEditBranchCode(shift?.branch_code ?? branchCode);
    if (shift && isSpecialRole(shift.role)) {
      setEditMode("special");
      setEditSpecialType(shift.role as SpecialRole);
    } else {
      setEditMode("shift");
      setEditStart(shift?.start_hour ?? 9);
      setEditEnd(shift?.end_hour ?? 17);
      const role = shift?.role ?? getRoleOptions(city)[0];
      if (getRoleOptions(city).includes(role)) {
        setEditRole(role);
        setEditCustomRole("");
      } else {
        setEditRole("OTHER");
        setEditCustomRole(role);
      }
    }
  }

  function openEdit(staffName: string, dateStr: string, e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditCellRect(rect);
    const raw = gridData[staffName]?.[dateStr];
    const shifts = cellsOf(raw);
    // Load first shift for editing if exists, otherwise open blank form
    loadShiftIntoForm(shifts[0] ?? null, shifts.length > 0 ? 0 : null);
    setEditTarget({ staffName, dateStr });
  }

  function saveEdit() {
    if (!editTarget) return;
    const { staffName, dateStr } = editTarget;
    setTimeError("");
    const note = editNote.trim() || undefined;

    if (editMode === "special") {
      commitCell(staffName, dateStr, { start_hour: 0, end_hour: 0, role: editSpecialType, note });
      closeEdit();
      return;
    }

    if (editStart >= editEnd) {
      setTimeError(`Start (${fmtHour(editStart)}) must be earlier than End (${fmtHour(editEnd)})`);
      return;
    }
    const role = editRole === "OTHER" ? editCustomRole.trim() : editRole;
    if (!role) return;
    const newShift: ShiftCell = { start_hour: editStart, end_hour: editEnd, role, branch_code: editBranchCode || undefined, note };
    const existing = cellsOf(gridData[staffName]?.[dateStr]);
    const next = editShiftIndex === null
      ? [...existing, newShift]
      : existing.map((s, i) => (i === editShiftIndex ? newShift : s));
    commitCell(staffName, dateStr, next.length === 1 ? next[0] : next);
    closeEdit();
  }

  function removeShiftSegment(staffName: string, dateStr: string, index: number) {
    const next = cellsOf(gridData[staffName]?.[dateStr]).filter((_, i) => i !== index);
    commitCell(staffName, dateStr, next.length === 0 ? null : next.length === 1 ? next[0] : next);
  }

  function clearCell(staffName: string, dateStr: string) {
    commitCell(staffName, dateStr, null);
    closeEdit();
  }

  /** Deleting a cell.
   *
   *  This used to remove the row from the published week straight away, which
   *  rewrote the week on the server while this page's basis stamp stayed where it
   *  was -- so the editor's next publish was refused as somebody else's change,
   *  when the somebody else was themselves a minute earlier. A deletion is now an
   *  edit like any other: the cell is recorded as empty, and it leaves the
   *  published week when the week is published.
   */
  function deletePublishedShift(staffName: string, dateStr: string) {
    commitCell(staffName, dateStr, null);
  }

  function deleteStaffFromGrid(staffName: string) {
    const datesWithShifts = weekDates.filter((d) => gridData[staffName]?.[d]);
    const totalShifts = datesWithShifts.length;
    if (!window.confirm(
      `Clear all ${totalShifts} shift(s) for "${stripRoleSuffix(staffName)}" and remove the row?\n\n` +
      `They leave the published schedule when you publish this week.`
    )) return;
    if (datesWithShifts.length > 0) {
      commitCells(datesWithShifts.map((d) => ({ staffName, dateStr: d, value: null })));
    }
    setStaffList((prev) => prev.filter((n) => n !== staffName));
    setRemovedStaff((prev) => (prev.includes(staffName) ? prev : [...prev, staffName]));
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


  // ─── Load from DB (base_shift_normalized → published) ───────────────────────
  async function handleLoadFromDb() {
    if (!branchCode) { setError("Branch not selected"); return; }
    if (!window.confirm(
      `Load shifts from DB for ${labelOf(city, branchCode)} — week of ${weekStart}?\n\n` +
      `This replaces the published schedule for this branch and week.`
    )) return;

    // Unpublished edits are not part of the published week, so the import cannot
    // touch them — they simply get applied on top the next time anyone publishes,
    // which quietly undoes part of the import. Say so, and offer the way out.
    let discardFirst = false;
    if (unpublishedCells.size > 0) {
      discardFirst = window.confirm(
        `This week also has ${unpublishedCells.size} unpublished change${unpublishedCells.size === 1 ? "" : "s"}.\n\n` +
        `OK — throw them away, so the imported schedule stands as it is.\n` +
        `Cancel — keep them; they will be applied on top the next time this week is published.`
      );
    }

    setDbImporting(true);
    setError("");
    try {
      const loadFromDb = async (force: boolean) =>
        apiFetch<{ ok: boolean; rows_copied: number }>(
          "/api/admin/shifts/publish_from_base",
          {
            method: "POST",
            body: JSON.stringify({ city, branch_code: branchCode, week_start: weekStart, force }),
          }
        );
      let res: { ok: boolean; rows_copied: number };
      try {
        res = await loadFromDb(false);
      } catch (first: unknown) {
        // The server refuses when someone else published this week in the last few
        // hours, because loading from DB throws their corrections away. Name them and
        // let the user decide rather than doing it silently.
        const msg = first instanceof Error ? first.message : String(first);
        if (!/published this week/i.test(msg)) throw first;
        if (!window.confirm(`${msg}\n\nReplace the whole week anyway?`)) {
          setError("");
          return;
        }
        res = await loadFromDb(true);
      }
      if (!res.ok) { setError("Load from DB failed"); return; }
      if (discardFirst) {
        await apiFetch("/api/admin/shifts/discard_week_cells", {
          method: "POST",
          body: JSON.stringify({ city, branch_code: branchCode, week_start: weekStart }),
        });
        setUnpublishedCells(new Set());
        setCellEditors({});
      }
      // publish_from_base writes the published week itself, so there is nothing
      // to carry over -- reload and let the overlay lie back on top.
      const staffOk = await loadStaff();
      if (!staffOk) return;
      await loadExistingShifts(true);
      setError("");
      alert(`Loaded ${res.rows_copied} shifts from DB for ${labelOf(city, branchCode)}.`);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "Load from DB failed");
    } finally {
      setDbImporting(false);
    }
  }

  // ─── Load from AI Draft ───────────────────────────────────────────────────────
  async function handleLoadFromDraft() {
    if (!branchCode) { setError("Branch not selected"); return; }

    // Only warn if staff actually have shift cells — empty staff rows (loaded from
    // staff master) do not count as "existing data" that would be overwritten.
    const hasExistingData = Object.values(gridData).some(
      (days) => Object.keys(days ?? {}).length > 0
    );
    if (hasExistingData) {
      if (!window.confirm(
        `Load AI Draft shifts into ${labelOf(city, branchCode)} for week of ${weekStart}?\n\n` +
        `Cells the draft covers are replaced. Cells it does not cover are left alone.\n` +
        `Nothing reaches the published schedule until you press Publish.`
      )) return;
    }

    setDraftImporting(true);
    setError("");
    try {
      const res = await apiFetch<{
        ok: boolean;
        version_id: string;
        rows: Array<{ work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number }>;
      }>(
        `/api/admin/draft/rows_for_week?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&week_start=${encodeURIComponent(weekStart)}`
      );

      if (!res.ok || !res.rows?.length) {
        setError("No draft rows found for this branch and week.");
        return;
      }

      // Draft rows go into the week's overlay like any other edit, so they are
      // saved on the server the moment they land and are published with the rest.
      const byCell = new Map<string, { staffName: string; dateStr: string; value: ShiftCell[] }>();
      for (const r of res.rows) {
        const k = cellKey(r.staff_name, r.work_date);
        const cell: ShiftCell = { start_hour: r.start_hour, end_hour: r.end_hour, role: r.role || "STAFF" };
        const found = byCell.get(k);
        if (found) found.value.push(cell);
        else byCell.set(k, { staffName: r.staff_name, dateStr: r.work_date, value: [cell] });
      }
      const changes = Array.from(byCell.values()).map((c) => {
        const sorted = c.value.slice().sort((a, b) => a.start_hour - b.start_hour);
        return { staffName: c.staffName, dateStr: c.dateStr, value: sorted.length === 1 ? sorted[0] : sorted };
      });
      const staffOk = await loadStaff();
      if (!staffOk) return;
      commitCells(changes);
      setError("");
      alert(`Loaded ${res.rows.length} draft shifts into the grid for ${labelOf(city, branchCode)}.\n\nReview and publish when ready.`);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "Load from Draft failed");
    } finally {
      setDraftImporting(false);
    }
  }


  const buildRows = useCallback(() => {
    const rows: { work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number; note: string; branch_code?: string }[] = [];
    for (const [staffName, days] of Object.entries(gridData)) {
      for (const [dateStr, cell] of Object.entries(days)) {
        for (const c of cellsOf(cell)) {
          // Include shifts with valid times even if role is empty.
          // Fall back to "STAFF" so the row isn't silently dropped on publish.
          if (c.role || c.start_hour || c.end_hour) {
            rows.push({ work_date: dateStr, staff_name: staffName, role: c.role || "STAFF", start_hour: c.start_hour, end_hour: c.end_hour, note: c.note || "", branch_code: c.branch_code || undefined });
          }
        }
      }
    }
    return rows;
  }, [gridData]);

  async function handlePublish() {
    setError("");
    // Everything typed must be on the server before the server is asked to publish
    // it -- the browser no longer sends the week, so an unsent edit would simply
    // not be published.
    await flushOutbox();
    if (outboxRef.current.size > 0) {
      setError("Some edits have not reached the server yet. Wait a moment and publish again.");
      return;
    }
    if (unpublishedCells.size === 0) {
      setError("Nothing to publish — no cells have changed since the last publish.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<{
        ok: boolean; cells_applied: number; rows_written: number;
        export_result?: { error?: string } | null; published_token?: string;
      }>(
        "/api/admin/shifts/publish_week_cells",
        {
          method: "POST",
          body: JSON.stringify({
            city,
            branch_code: branchCode,
            week_start: weekStart,
            auto_export: true,
            export_month: weekStart.slice(0, 7),
          }),
        }
      );
      if (result.export_result?.error) {
        setError(`Sheet export error: ${result.export_result.error}`);
      }
      setPublishedCount(result.rows_written);
      setUnpublishedCells(new Set());
      setCellEditors({});
      publishedTokenRef.current = result.published_token ?? publishedTokenRef.current;
      setView("published");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    if (unpublishedCells.size === 0) return;
    if (!window.confirm(
      `Throw away ${unpublishedCells.size} unpublished change${unpublishedCells.size === 1 ? "" : "s"} for this week?\n\n` +
      `The grid goes back to the published schedule. This affects everyone editing this week, not just you.`
    )) return;
    setError("");
    setSaving(true);
    try {
      await flushOutbox();
      await apiFetch("/api/admin/shifts/discard_week_cells", {
        method: "POST",
        body: JSON.stringify({ city, branch_code: branchCode, week_start: weekStart }),
      });
      setUnpublishedCells(new Set());
      setCellEditors({});
      await refreshWeek();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ─── Employee Search ──────────────────────────────────────────────────────
  async function handleEmployeeSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    const token = ++searchTokenRef.current;
    setSearchLoading(true);
    setSearchResults([]);
    setSearchRan(false);
    try {
      const branchList = BRANCHES[city];
      const fetched = await Promise.all(
        branchList.map(async (b) => {
          try {
            const data = await apiFetch<{ rows?: any[] }>(
              `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}&branch_code=${encodeURIComponent(b.code)}`
            );
            return { branch: b, rows: (data.rows || []) as any[] };
          } catch {
            return { branch: b, rows: [] as any[] };
          }
        })
      );
      if (token !== searchTokenRef.current) return; // superseded by a newer search
      const qLower = q.toLowerCase();
      const matched: SearchResultRow[] = [];
      for (const { branch, rows } of fetched) {
        const staffMap = new Map<string, Record<string, ShiftCell | ShiftCell[]>>();
        for (const r of rows) {
          const name = String(r.staff_name);
          if (!stripRoleSuffix(name).toLowerCase().includes(qLower) && !name.toLowerCase().includes(qLower)) continue;
          if (!staffMap.has(name)) staffMap.set(name, {});
          const dateMap = staffMap.get(name)!;
          const shift: ShiftCell = {
            start_hour: Number(r.start_hour),
            end_hour: Number(r.end_hour),
            role: String(r.role || ""),
            note: r.note ? String(r.note) : undefined,
          };
          const existing = dateMap[r.work_date];
          if (existing) {
            dateMap[r.work_date] = Array.isArray(existing) ? [...existing, shift] : [existing, shift];
          } else {
            dateMap[r.work_date] = shift;
          }
        }
        for (const [name, dates] of staffMap) {
          matched.push({ staff_name: name, branch_code: branch.code, branch_label: branch.name, dates });
        }
      }
      matched.sort((a, b) =>
        stripRoleSuffix(a.staff_name).localeCompare(stripRoleSuffix(b.staff_name)) ||
        a.branch_label.localeCompare(b.branch_label)
      );
      setSearchResults(matched);
      setSearchRan(true);
    } finally {
      if (token === searchTokenRef.current) setSearchLoading(false);
    }
  }

  // ─── Monthly View ─────────────────────────────────────────────────────────
  async function handleLoadMonthly() {
    const token = ++monthlyTokenRef.current;
    setMonthlyLoading(true);
    setMonthlyData({});
    try {
      const [year, month] = monthVal.split("-").map(Number);
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      const mondays: string[] = [];
      const cur = new Date(firstDay);
      const dow = cur.getDay();
      cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
      while (cur <= lastDay) {
        mondays.push(localDateStr(cur));
        cur.setDate(cur.getDate() + 7);
      }
      if (token !== monthlyTokenRef.current) return;
      setMonthlyWeeks(mondays);

      const branchList = BRANCHES[city];
      const combos: Array<{ bCode: string; week: string }> = [];
      for (const b of branchList) {
        for (const w of mondays) {
          combos.push({ bCode: b.code, week: w });
        }
      }

      const results = await Promise.all(
        combos.map(async ({ bCode, week }) => {
          try {
            const data = await apiFetch<{ rows?: any[] }>(
              `/api/published/week?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(week)}&branch_code=${encodeURIComponent(bCode)}`
            );
            const rows = (data.rows || []) as any[];
            const staffSet = new Set(rows.map((r: any) => String(r.staff_name)));
            return { bCode, week, count: staffSet.size };
          } catch {
            return { bCode, week, count: 0 };
          }
        })
      );

      if (token !== monthlyTokenRef.current) return;
      const data: MonthlyData = {};
      for (const { bCode, week, count } of results) {
        if (!data[bCode]) data[bCode] = {};
        data[bCode][week] = { count };
      }
      setMonthlyData(data);
    } finally {
      if (token === monthlyTokenRef.current) setMonthlyLoading(false);
    }
  }

  function handleEditWeek(bCode: string, week: string) {
    setBranchCode(bCode as BranchCode);
    setWeekStart(week);
    setView("edit");
    // Don't clear staffList/gridData here — if previously populated, the
    // [weekStart, branchCode] effect will auto-reload the correct data.
  }

  const branches = BRANCHES[city];
  const shiftCount = useMemo(() => buildRows().length, [buildRows]);

  // The grid was never thrown away to get here, and unpublished edits live on the
  // server, so going back to editing is just switching the view.
  const handleBackToEdit = useCallback(() => setView("edit"), []);

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

  // Derive the shifts in the cell currently being edited (for delete button + segment list)
  const editingCellRaw = editTarget ? (gridData[editTarget.staffName]?.[editTarget.dateStr] ?? null) : null;
  const editingCellShifts = cellsOf(editingCellRaw);

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
              <SelectDark
                className={W_SELECT}
                variant="light"
                value={city}
                onChange={v => setCity(v as City)}
                options={[
                  { value: "dubai", label: "Dubai" },
                  { value: "manila", label: "Manila" },
                ]}
              />
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
              <div className="flex items-stretch gap-1.5">
                {/* Stepping a week at a time is the common move; the picker stays for
                    jumping somewhere distant. addDays keeps it on a Monday. */}
                <button
                  type="button"
                  title="Previous week"
                  aria-label="Previous week"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 transition hover:border-indigo-300 hover:text-indigo-600"
                >
                  ‹
                </button>
                <input
                  type="date"
                  className={W_INPUT}
                  value={weekStart}
                  onChange={(e) => setWeekStart(mondayOf(e.target.value || weekStart))}
                />
                <button
                  type="button"
                  title="Next week"
                  aria-label="Next week"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 transition hover:border-indigo-300 hover:text-indigo-600"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  const staffOk = await loadStaff();
                  if (!staffOk) return; // staff load failed — error is already displayed, do not clear it
                  await refreshWeek();
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
                    const staffOk = await loadStaff();
                    if (staffOk) await refreshWeek();
                  }}
                  disabled={loading}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-50"
                >
                  ↺ Refresh
                </button>
              )}
              {staffList.length > 0 && (
                <button
                  type="button"
                  onClick={handleLoadFromDb}
                  disabled={dbImporting || loading}
                  title="Load this week's shifts from the base schedule already in the database"
                  className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                >
                  {dbImporting ? "Loading…" : "🗄️ Load from DB"}
                </button>
              )}
              {staffList.length > 0 && (
                <button
                  type="button"
                  onClick={handleLoadFromDraft}
                  disabled={draftImporting || loading}
                  title="Load AI-generated draft shifts for this week into the grid for editing"
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                >
                  {draftImporting ? "Loading…" : "🤖 Load AI Draft"}
                </button>
              )}
            </div>
          </div>
          {staffList.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xs text-gray-400">
                {staffList.length} staff · {labelOf(city, branchCode)} · Week of {weekStart}
              </p>
              {outboxSize > 0 ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  ● Saving {outboxSize} cell{outboxSize !== 1 ? "s" : ""}…
                </span>
              ) : (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  ✓ Saved
                </span>
              )}
              {unpublishedCells.size > 0 && (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                  ◈ {unpublishedCells.size} cell{unpublishedCells.size !== 1 ? "s" : ""} edited — not yet published
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

        {syncError && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-semibold">{syncError}</div>
            <div className="mt-0.5">
              Your edits are held on this device and will be sent as soon as the connection
              comes back. Nothing has been lost.
            </div>
          </div>
        )}

        {notice && (
          <div className="rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 flex items-start justify-between gap-3">
            <div>{notice}</div>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="shrink-0 rounded-lg border border-indigo-300 px-2 py-1 text-xs hover:bg-indigo-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View tabs — always visible */}
        <div className="flex items-center gap-0.5 border-b border-gray-200 pb-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setView("edit")}
            className={[
              "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
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
              "whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
              view === "published"
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-gray-400 hover:text-gray-700",
            ].join(" ")}
          >
            📋 Published View
            {publishedCount > 0 && staffList.length > 0 && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {publishedCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setView("search"); setPaintMode(false); }}
            className={[
              "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
              view === "search"
                ? "border-violet-500 text-violet-600"
                : "border-transparent text-gray-400 hover:text-gray-700",
            ].join(" ")}
          >
            🔍 Employee Search
          </button>
          <button
            type="button"
            onClick={() => { setView("monthly"); setPaintMode(false); }}
            className={[
              "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
              view === "monthly"
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-gray-400 hover:text-gray-700",
            ].join(" ")}
          >
            📅 Monthly View
          </button>
        </div>

        {/* ── Edit view ── */}
        {staffList.length > 0 && view === "edit" && (
          <>
            {/* Paint Mode toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPaintMode((p) => !p)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  paintMode
                    ? "border-violet-400 bg-violet-500 text-white shadow-md shadow-violet-500/25"
                    : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                🎨 Paint Mode {paintMode ? "ON" : "OFF"}
              </button>
              {paintMode && (
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-300/50 bg-violet-50 px-3 py-1.5">
                    <span className="text-xs font-semibold text-violet-600">Template:</span>
                    <label className="text-xs text-gray-500">Start</label>
                    <SelectDark
                      value={String(paintStart)}
                      onChange={v => setPaintStart(Number(v))}
                      variant="light"
                      className="rounded-lg px-2 py-1 text-xs"
                      options={START_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                    />
                    <label className="text-xs text-gray-500">End</label>
                    <SelectDark
                      value={String(paintEnd)}
                      onChange={v => setPaintEnd(Number(v))}
                      variant="light"
                      className="rounded-lg px-2 py-1 text-xs"
                      options={END_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                    />
                    <label className="text-xs text-gray-500">Role</label>
                    <SelectDark
                      value={paintRole}
                      onChange={setPaintRole}
                      variant="light"
                      className="rounded-lg px-2 py-1 text-xs"
                      options={getRoleOptions(city).map((r) => ({ value: r, label: r }))}
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-medium text-violet-700">
                      <input
                        type="checkbox"
                        checked={paintSplit}
                        onChange={(e) => setPaintSplit(e.target.checked)}
                        className="accent-violet-500"
                      />
                      Split
                    </label>
                    {paintSplit && (
                      <>
                        <span className="text-xs font-semibold text-violet-400">+</span>
                        <label className="text-xs text-gray-500">Start</label>
                        <SelectDark
                          value={String(paintStart2)}
                          onChange={v => setPaintStart2(Number(v))}
                          variant="light"
                          className="rounded-lg px-2 py-1 text-xs"
                          options={START_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                        />
                        <label className="text-xs text-gray-500">End</label>
                        <SelectDark
                          value={String(paintEnd2)}
                          onChange={v => setPaintEnd2(Number(v))}
                          variant="light"
                          className="rounded-lg px-2 py-1 text-xs"
                          options={END_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                        />
                      </>
                    )}
                  </div>
                  <span className="text-xs text-violet-500">Click any cell to stamp shift</span>
                </>
              )}
            </div>

            <div className={`${W_CARD} overflow-hidden p-0`} style={paintMode ? { cursor: "cell" } : {}}>
              {/* The header was already `sticky top-0`, but sticky resolves against the
                  nearest scrollport — here the horizontal-scroll wrapper, which grew to
                  fit its rows and so never scrolled vertically. Nothing ever stuck and
                  the day/date row scrolled away behind the staff list. Giving the
                  wrapper a viewport-bound height makes it the element that scrolls in
                  both directions, so the header can hold its place. */}
              <div className="max-h-[calc(100vh-19rem)] overflow-auto">
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
                              onClick={() => deleteStaffFromGrid(name)}
                              className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-100 disabled:opacity-40 transition"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                        {weekDates.map((d) => {
                          const cellRaw = gridData[name]?.[d] ?? null;
                          const shifts = cellsOf(cellRaw);
                          // Edited but not published yet. The ring is the only thing
                          // that distinguishes it from what staff can already see.
                          const isDraft = unpublishedCells.has(cellKey(name, d));
                          const editor = cellEditors[cellKey(name, d)];
                          const editedBy = editor?.by
                            ? `Edited by ${editor.by}${editor.at ? ` at ${new Date(editor.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""} — not published yet`
                            : undefined;
                          // Treat 0:00-0:00 published shift as Day Off (normalize role)
                          const normalizedShifts = shifts.map((s) =>
                            s.start_hour === 0 && s.end_hour === 0 && !isSpecialRole(s.role)
                              ? { ...s, role: "DAY_OFF" }
                              : s
                          );
                          // Approved Day Off overrides published shifts (approval updates draft only, not published)
                          const publishedIsAlreadyDayOff = normalizedShifts.length === 1 && normalizedShifts[0].role === "DAY_OFF";
                          const isApprovedDayOff = !publishedIsAlreadyDayOff && approvedDayOffs.has(`${name}|${d}`);
                          return (
                            <td key={d} className="px-1 py-1 text-center align-top">
                              {isApprovedDayOff ? (
                                <button
                                  type="button"
                                  onClick={(e) => openEdit(name, d, e)}
                                  title="Day Off (Approved proposal — original shift overridden)"
                                  className="w-full rounded-lg border border-gray-300 bg-gray-100 px-1.5 py-2 text-center text-[10px] font-semibold text-gray-500 hover:opacity-80 transition"
                                >
                                  Day Off
                                  <span className="ml-1 rounded bg-gray-200 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-400">approved</span>
                                </button>
                              ) : normalizedShifts.length > 0 ? (
                                normalizedShifts.length === 1 && isSpecialRole(normalizedShifts[0].role) ? (
                                  <div className="group relative">
                                    <button
                                      type="button"
                                      onClick={(e) => paintMode ? applyPaint(name, d) : openEdit(name, d, e)}
                                      title={editedBy}
                                      className={`w-full rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold hover:opacity-80 transition ${specialStyle(normalizedShifts[0].role)}${isDraft ? " ring-2 ring-indigo-400 ring-inset" : ""}${paintMode ? " ring-2 ring-violet-400 ring-inset" : ""}`}
                                    >
                                      {specialLabel(normalizedShifts[0].role)}
                                      {normalizedShifts[0].note && (
                                        <span className="block truncate text-[9px] opacity-60">{normalizedShifts[0].note}</span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete shift"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!window.confirm(`Clear the shift for ${name} on ${formatDate(d)}?\n\nIt leaves the published schedule when you publish this week.`)) return;
                                        deletePublishedShift(name, d);
                                      }}
                                      className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white group-hover:flex"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : (
                                  <div className="group relative flex flex-col gap-0.5">
                                    {normalizedShifts.map((c, idx) => {
                                      const tc = timeColor(c.start_hour);
                                      return (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={(e) => paintMode ? applyPaint(name, d) : openEdit(name, d, e)}
                                          title={editedBy}
                                          className={`w-full rounded-lg border px-1.5 py-1.5 text-center transition ${tc.cell}${isDraft ? " ring-2 ring-indigo-400 ring-inset" : ""}${paintMode ? " ring-2 ring-violet-400 ring-inset" : ""}`}
                                        >
                                          <div className={`text-xs leading-tight ${tc.time}`}>
                                            {fmtHour(c.start_hour)}–{fmtHour(c.end_hour)}
                                          </div>
                                          <div className={`text-[10px] ${tc.role}`}>{c.role}</div>
                                          {c.branch_code && (
                                            <div className="mt-0.5 truncate text-[9px] font-semibold text-indigo-300 opacity-80">{c.branch_code}</div>
                                          )}
                                          {c.note && (
                                            <div className="mt-0.5 truncate text-[9px] opacity-50">{c.note}</div>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {!paintMode && (
                                      <button
                                        type="button"
                                        title="Add split shift"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                          setEditCellRect(rect);
                                          loadShiftIntoForm(null, null);
                                          setEditTarget({ staffName: name, dateStr: d });
                                        }}
                                        className="w-full rounded border border-dashed border-gray-200 py-0.5 text-[10px] text-gray-300 hover:border-indigo-300 hover:text-indigo-400 transition"
                                      >
                                        +
                                      </button>
                                    )}
                                    {/* For multi-shift cells, hide the × button — use the edit popup's per-segment ✕ buttons to avoid accidentally deleting all shifts */}
                                    {normalizedShifts.length === 1 && (
                                      <button
                                        type="button"
                                        title="Clear shift"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!window.confirm(`Clear the shift for ${name} on ${formatDate(d)}?\n\nIt leaves the published schedule when you publish this week.`)) return;
                                          deletePublishedShift(name, d);
                                        }}
                                        className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white group-hover:flex"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => paintMode ? applyPaint(name, d) : openEdit(name, d, e)}
                                  className={`h-10 w-full rounded-lg border border-dashed transition ${paintMode ? "border-violet-300 text-violet-400 hover:bg-violet-50" : "border-gray-200 text-gray-300 hover:border-indigo-300 hover:text-indigo-400"}`}
                                >
                                  {paintMode ? "🎨" : "+"}
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePublish}
                disabled={saving || unpublishedCells.size === 0}
                className={`${PRIMARY_BUTTON} min-w-[180px]`}
              >
                {saving
                  ? "Publishing..."
                  : unpublishedCells.size === 0
                    ? "🚀 Nothing to publish"
                    : `🚀 Publish ${unpublishedCells.size} change${unpublishedCells.size !== 1 ? "s" : ""}`}
              </button>
              {unpublishedCells.size > 0 && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saving}
                  title="Throw away this week's unpublished changes"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Discard changes
                </button>
              )}
              <p className="w-full text-xs text-gray-400 sm:w-auto">
                Every edit is saved as you make it, and stays out of sight until you publish.
                Publishing applies only the cells that changed — it never rewrites the rest of
                the week — then sends to Week / My-Shift and exports to Google Sheets.
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

        {/* Empty state for Edit/Published only */}
        {staffList.length === 0 && (view === "edit" || view === "published") && (
          <div className={`${W_CARD} flex flex-col items-center justify-center py-16 text-center`}>
            <div className="mb-3 text-4xl">📅</div>
            <p className="text-sm font-medium text-gray-600">Select city, branch and week, then click &ldquo;Load Staff &amp; Shifts&rdquo;</p>
            <p className="mt-1 text-xs text-gray-400">The published schedule loads first, with anyone&rsquo;s unpublished edits laid on top.</p>
          </div>
        )}

        {/* ── Employee Search View ── */}
        {view === "search" && (
          <div className="space-y-4">
            <div className={W_CTRL}>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Search an employee&apos;s schedule across all {city === "dubai" ? "Dubai" : "Manila"} branches for the selected week
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Staff Name</label>
                  <input
                    type="text"
                    placeholder="Type name to search…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleEmployeeSearch(); }}
                    className={W_INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleEmployeeSearch()}
                  disabled={searchLoading || !searchQuery.trim()}
                  className={`${PRIMARY_BUTTON} min-w-[120px]`}
                >
                  {searchLoading ? "Searching…" : "🔍 Search"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Week: <span className="font-medium text-gray-600">{weekStart}</span> · Change the week selector above to search a different week.
              </p>
            </div>

            {searchLoading && (
              <div className={`${W_CARD} flex items-center justify-center py-12`}>
                <p className="text-sm text-gray-400">Searching across all branches…</p>
              </div>
            )}

            {!searchLoading && searchRan && searchResults.length === 0 && (
              <div className={`${W_CARD} flex flex-col items-center justify-center py-12 text-center`}>
                <div className="mb-2 text-3xl">🔍</div>
                <p className="text-sm font-medium text-gray-600">No results found for &ldquo;{searchQuery}&rdquo;</p>
                <p className="mt-1 text-xs text-gray-400">Try a different name or select a different week</p>
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div className={`${W_CARD} overflow-hidden p-0`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500 whitespace-nowrap">Staff</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500 whitespace-nowrap">Branch</th>
                        {weekDates.map((d) => (
                          <th key={d} className="min-w-[90px] px-2 py-3 text-center text-xs font-semibold text-gray-600">{formatDate(d)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((row, idx) => (
                        <tr key={`${row.staff_name}|${row.branch_code}`} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                          <td className="sticky left-0 z-10 bg-inherit px-4 py-2 text-xs font-semibold text-gray-800 whitespace-nowrap">
                            {stripRoleSuffix(row.staff_name)}
                          </td>
                          <td className="px-4 py-2 text-xs whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleEditWeek(row.branch_code, weekStart)}
                              className="text-indigo-600 hover:text-indigo-500 hover:underline font-medium"
                              title={`Open ${row.branch_label} – ${weekStart} in Edit mode`}
                            >
                              {row.branch_label}
                            </button>
                          </td>
                          {weekDates.map((d) => {
                            const raw = row.dates[d];
                            const shifts = cellsOf(raw);
                            if (shifts.length === 0) return (
                              <td key={d} className="px-2 py-2 text-center text-[11px] text-gray-300">—</td>
                            );
                            return (
                              <td key={d} className="px-1 py-1 text-center align-top">
                                {shifts.map((s, si) => {
                                  if (isSpecialRole(s.role)) {
                                    return (
                                      <div key={si} className={`rounded-lg border px-1.5 py-1 text-[10px] font-semibold mb-0.5 ${specialStyle(s.role)}`}>
                                        {specialLabel(s.role)}
                                      </div>
                                    );
                                  }
                                  const tc = timeColor(s.start_hour);
                                  return (
                                    <div key={si} className={`rounded-lg border px-1.5 py-1 mb-0.5 ${tc.cell.split(" ").filter((c) => !c.startsWith("hover:")).join(" ")}`}>
                                      <div className={`text-[10px] font-semibold leading-tight ${tc.time}`}>{fmtHour(s.start_hour)}–{fmtHour(s.end_hour)}</div>
                                      {s.role && <div className={`text-[9px] ${tc.role}`}>{s.role}</div>}
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} · Click a branch name to open that week in Edit mode
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Monthly View ── */}
        {view === "monthly" && (
          <div className="space-y-4">
            <div className={W_CTRL}>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Monthly overview — all {city === "dubai" ? "Dubai" : "Manila"} branches · click a cell to edit that week
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Month</label>
                  <input
                    type="month"
                    value={monthVal}
                    onChange={(e) => setMonthVal(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleLoadMonthly()}
                  disabled={monthlyLoading}
                  className={`${PRIMARY_BUTTON} min-w-[140px]`}
                >
                  {monthlyLoading ? "Loading…" : "📅 Load Month"}
                </button>
              </div>
            </div>

            {monthlyLoading && (
              <div className={`${W_CARD} flex items-center justify-center py-12`}>
                <p className="text-sm text-gray-400">Loading schedules for all branches…</p>
              </div>
            )}

            {!monthlyLoading && monthlyWeeks.length > 0 && Object.keys(monthlyData).length > 0 && (
              <div className={`${W_CARD} overflow-hidden p-0`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="sticky left-0 z-10 bg-gray-50 w-44 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">Branch</th>
                        {monthlyWeeks.map((w) => (
                          <th key={w} className="min-w-[100px] px-2 py-3 text-center text-xs font-semibold text-gray-600">
                            <div>{formatDate(w)}</div>
                            <div className="text-[10px] text-gray-400 font-normal">– {formatDate(addDays(w, 6))}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {BRANCHES[city].map((b, idx) => (
                        <tr key={b.code} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                          <td className="sticky left-0 z-10 bg-inherit px-4 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">{b.name}</td>
                          {monthlyWeeks.map((w) => {
                            const count = monthlyData[b.code]?.[w]?.count ?? 0;
                            return (
                              <td key={w} className="px-1.5 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleEditWeek(b.code, w)}
                                  title={`Edit ${b.name} – week of ${w}`}
                                  className={`w-full rounded-xl border px-2 py-2.5 text-xs transition hover:ring-2 hover:ring-offset-1 ${
                                    count > 0
                                      ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:ring-indigo-300"
                                      : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-white hover:ring-gray-300"
                                  }`}
                                >
                                  {count > 0 ? (
                                    <>
                                      <div className="text-lg font-bold leading-none">{count}</div>
                                      <div className="mt-0.5 text-[9px] text-indigo-500">staff</div>
                                    </>
                                  ) : (
                                    <div className="text-gray-300 text-sm">—</div>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-gray-100 px-4 py-2.5">
                  <p className="text-xs text-gray-400">
                    Numbers show distinct staff scheduled · Click any cell to open that branch + week in Edit mode
                  </p>
                </div>
              </div>
            )}

            {!monthlyLoading && monthlyWeeks.length === 0 && (
              <div className={`${W_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                <div className="mb-3 text-4xl">📅</div>
                <p className="text-sm font-medium text-gray-600">Select a month and click &ldquo;Load Month&rdquo;</p>
                <p className="mt-1 text-xs text-gray-400">Shows staff count per branch per week. Click a cell to open Edit mode.</p>
              </div>
            )}
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
            <div className="p-5">

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

              {/* Existing shift segments list */}
              {editingCellShifts.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Shifts on this day</p>
                  {editingCellShifts.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${editShiftIndex === i ? "border-violet-500/50 bg-violet-900/30" : "border-white/10 bg-white/5"}`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white">{fmtHour(s.start_hour)}–{fmtHour(s.end_hour)}</span>
                        <span className="ml-2 text-[10px] text-neutral-400">{s.role}</span>
                        {s.branch_code && (
                          <span className="ml-1.5 rounded bg-indigo-900/60 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">{s.branch_code}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => loadShiftIntoForm(s, i)}
                          className="rounded-md px-2 py-1 text-[10px] text-violet-400 hover:bg-violet-900/30 transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeShiftSegment(editTarget.staffName, editTarget.dateStr, i);
                            if (editShiftIndex === i) loadShiftIntoForm(null, null);
                            else if (editShiftIndex !== null && editShiftIndex > i) setEditShiftIndex(editShiftIndex - 1);
                          }}
                          className="rounded-md px-2 py-1 text-[10px] text-rose-400 hover:bg-rose-900/30 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => loadShiftIntoForm(null, null)}
                    className="w-full rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] text-neutral-500 hover:border-violet-500/40 hover:text-violet-400 transition"
                  >
                    + Add another shift segment
                  </button>
                </div>
              )}

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
                    <SelectDark
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                      value={String(editStart)}
                      onChange={v => { setEditStart(Number(v)); setTimeError(""); }}
                      options={START_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                    />
                  </div>
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">End</label>
                    <SelectDark
                      className={`flex-1 rounded-lg border px-2.5 py-2 text-xs text-white focus:outline-none ${editStart >= editEnd ? "border-rose-500/70 bg-rose-950/60" : "border-neutral-700 bg-neutral-900 focus:border-violet-500"}`}
                      value={String(editEnd)}
                      onChange={v => { setEditEnd(Number(v)); setTimeError(""); }}
                      options={END_HOUR_OPTIONS.map((h) => ({ value: String(h), label: fmtHour(h) }))}
                    />
                  </div>
                  {timeError && (
                    <div className="mb-2.5 rounded-lg bg-rose-900/40 px-3 py-2 text-[11px] text-rose-300">
                      ⚠ {timeError}
                    </div>
                  )}
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">Role</label>
                    <SelectDark
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                      value={editRole}
                      onChange={setEditRole}
                      options={[
                        ...getRoleOptions(city).map((r) => ({ value: r, label: r })),
                        { value: "OTHER", label: "Other..." },
                      ]}
                    />
                  </div>
                  {editRole === "OTHER" && (
                    <input
                      className="mb-2.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
                      placeholder="Role name"
                      value={editCustomRole}
                      onChange={(e) => setEditCustomRole(e.target.value)}
                    />
                  )}
                  <div className="mb-2.5 flex items-center gap-3">
                    <label className="w-12 shrink-0 text-[11px] font-medium text-neutral-400">Branch</label>
                    <SelectDark
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                      value={editBranchCode}
                      onChange={setEditBranchCode}
                      options={BRANCHES[city].map((b) => ({ value: b.code, label: b.name }))}
                    />
                  </div>
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
                {editingCellShifts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Clear all shifts for ${editTarget.staffName} on ${formatDate(editTarget.dateStr)}?\n\nThey leave the published schedule when you publish this week.`)) return;
                      clearCell(editTarget.staffName, editTarget.dateStr);
                    }}
                    className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-900/30 disabled:opacity-40 transition"
                    title="Delete all shifts for this day"
                  >
                    🗑
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


    </div>
  );
}
