// src/app/admin/manual-shift/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, hasChannelAccess, tryRefreshAccessToken } from "@/lib/auth";
import { BRANCHES, labelOf, normalizeBranchCode, type BranchCode, type City } from "@/lib/branches";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";
import ModalScrim from "@/components/ModalScrim";
import { useUnsavedGuard } from "@/lib/unsavedGuard";
import {
  countDayOffConflicts,
  describeDayOffConflict,
  type DayOffConflict,
} from "@/lib/day-off-conflicts";
import {
  type CrossBranchOverlap,
  crossBranchOverlapsFrom,
  describeCrossBranchOverlap,
} from "@/lib/cross-branch-overlaps";

// ─── White-mode card (overrides global GLASS_CARD for this page only) ────────
// The shared drive the exports are filed in. Same id as SHIFT_SCHEDULE_DRIVE_ID
// on the server; shown here only as a link for people to open.
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/0APqUBtx2OBdkUk9PVA";

// Publishing changes the schedule; the workbook already on Drive then describes
// the old one. The flag is kept per city+month in localStorage so it survives a
// reload and a tab close — the person who publishes is often not the one who
// exports, and a reminder that dies with the page would be missed by both.
const exportFlagKey = (city: string, ym: string) => `shift_needs_export:${city}:${ym}`;

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
  { role: "UL",       label: "UL (Unpaid)",     style: "border-violet-200 bg-violet-50 text-violet-700" },
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

/** A cell that is work, by the roster's own rule (app/db_approved_day_off._is_work):
 *  not a day-off or leave marker, and hours that are not empty. Kept to the
 *  server's list so this screen and the Staff page count the same shifts. */
const NOT_WORKING_ROLES = /^(DAY_?OFF|OFF|REST(_?DAY)?|VL|SL|EL|ML|UL|LEAVE|ABSENT|AWOL|SUSPENDED)$/i;
function isWorkCell(role: string | undefined | null, start?: number, end?: number): boolean {
  if (NOT_WORKING_ROLES.test(String(role || "").trim().replace(/ /g, "_"))) return false;
  if (start === undefined || end === undefined) return true;
  return Number(end) > Number(start);
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

type ApiError = Error & { status?: number; detail?: Record<string, unknown> };

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
    const err = new Error(detailMsg || (j?.message as string) || text || `HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    if (detail && typeof detail === "object") err.detail = detail as Record<string, unknown>;
    throw err;
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
  const deleteBusyRef = useRef(false);

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
    // The clock-in check below takes a moment before the confirm appears; a
    // second click in that gap must not start a second delete.
    if (deleteBusyRef.current) return;
    const shiftsForStaff = bRows.filter((r) => r.staff_name === staffName);
    if (shiftsForStaff.length === 0) return;
    deleteBusyRef.current = true;
    setDeletingStaff(staffName);
    try {
      await deleteStaffRowInner(staffName, shiftsForStaff);
    } finally {
      deleteBusyRef.current = false;
      setDeletingStaff(null);
    }
  }

  async function deleteStaffRowInner(staffName: string, shiftsForStaff: typeof bRows) {
    // Days already clocked in are named before anything goes (the server refuses them otherwise).
    let workedDays: WorkedInfo[] = [];
    try {
      const d = await fetchWeekAttendance(city, weekStart);
      const mine = new Set(shiftsForStaff.map((r) => workedKey(staffName, r.work_date)));
      workedDays = (d.days || []).filter((w) => mine.has(workedKey(w.staff_name, w.work_date)));
    } catch {
      // Without the list the server would refuse partway through, after deleting the
      // earlier days -- unless every day is after today, where nothing can be worked.
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: city === "dubai" ? "Asia/Dubai" : "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      if (!shiftsForStaff.every((r) => r.work_date > today)) {
        alert("Could not check who has clocked in this week, so nothing was deleted. Try again.");
        return;
      }
    }
    const workedText = workedDays.length > 0
      ? `\n\nAlready clocked in on ${workedDays.length} of these days: ` +
        workedDays.map((w) => `${formatDate(w.work_date)} (${workedLabel(w)})`).join(", ") +
        ". Late, early and pay for those days are measured against this schedule."
      : "";
    if (!window.confirm(`Delete all ${shiftsForStaff.length} shift(s) for "${stripRoleSuffix(staffName)}"?${workedText}`)) return;
    const workedDates = new Set(workedDays.map((w) => w.work_date));
    const done = new Set<string>();
    try {
      for (const r of shiftsForStaff) {
        await apiFetch("/api/admin/shifts/delete_published_row", {
          method: "POST",
          body: JSON.stringify({ city, branch_code: bc, work_date: r.work_date, staff_name: staffName,
                                 confirm_worked: workedDates.has(r.work_date) }),
        });
        done.add(r.work_date);
      }
      setBRows((prev) => prev.filter((r) => r.staff_name !== staffName));
    } catch (e: unknown) {
      setBRows((prev) => prev.filter((r) => !(r.staff_name === staffName && done.has(r.work_date))));
      const worked = workedCellsFrom(e as ApiError)[0];
      alert(worked
        ? `${stripRoleSuffix(staffName)} clocked in on ${formatDate(worked.work_date)} after this list was opened, `
          + `so the delete stopped there (${done.size} day${done.size === 1 ? "" : "s"} deleted). Press delete again to see the days.`
        : `${e instanceof Error ? e.message : String(e)}${done.size > 0 ? ` (${done.size} shift(s) were already deleted.)` : ""}`);
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
  /** The person was told this staff member already clocked in that day and chose to change it. */
  confirm_worked?: boolean;
};

/** A day the staff member has already clocked in (GET /api/admin/shifts/week_attendance).
 *  Back Office asked to be warned before changing such a day (2026-10-25): while
 *  preparing tomorrow for several branches a click can land on today. 886 changes
 *  to worked days in 60 days were mostly deliberate (payroll, reconciliation), so
 *  the page asks once per cell and the server refuses a change it was not asked about. */
/** check_in / check_out are null for someone without attendance access: the server
 *  says the day was worked, not when. */
type WorkedInfo = { staff_name: string; work_date: string; check_in: string | null; check_out: string | null; working: boolean;
  /** An older day whose session was never closed — a forgotten clock-out, not someone at work. */
  no_clock_out?: boolean };
type WorkedAskItem = { staffName: string; dateStr: string; info: WorkedInfo; before: string; after: string };
type WorkedAnswer = "change" | "skip" | "cancel";
/** single/bulk: an edit on this page. replay: queued edits the server refused.
 *  publish / import: pending cells, or the sheet, about to replace worked days. */
type WorkedAskMode = "single" | "bulk" | "replay" | "publish" | "import";

/** The week's clock-ins. One copy of the request, shared by the grid and the Published view's delete. */
function fetchWeekAttendance(city: string, weekStart: string) {
  return apiFetch<{ days?: WorkedInfo[] }>(
    `/api/admin/shifts/week_attendance?city=${encodeURIComponent(city)}&week_start=${encodeURIComponent(weekStart)}`);
}

/** A "change anyway" answer belongs to one cell of one branch's week. Keyed by
 *  name and date alone, a yes given at one branch skipped the question for the
 *  same person and day at another (clock-ins are per city, not per branch). */
function confirmKey(city: string, branchCode: string, weekStart: string, staffName: string, dateStr: string): string {
  return `${city}|${branchCode}|${weekStart}|${workedKey(staffName, dateStr)}`;
}

function workedKey(name: string, dateStr: string): string {
  return `${stripRoleSuffix(name).replace(/\s+/g, " ").trim().toLowerCase()}|${dateStr}`;
}

/** The days a 409 "worked_day" refusal names (app/shift_worked_days.py). */
function workedCellsFrom(err: ApiError | undefined): WorkedInfo[] {
  if (err?.status !== 409 || err?.detail?.code !== "worked_day") return [];
  return Array.isArray(err.detail.cells) ? (err.detail.cells as WorkedInfo[]) : [];
}

/** The longer line in the question. */
function workedDetail(w: WorkedInfo): string {
  if (w.working) return w.check_in ? `Working now — clocked in ${w.check_in}` : "Working now";
  if (w.no_clock_out) return w.check_in ? `Clocked in ${w.check_in} — no clock-out recorded` : "Clocked in — no clock-out recorded";
  return w.check_in ? `Worked — in ${w.check_in}${w.check_out ? `, out ${w.check_out}` : ""}` : "Worked";
}

function workedLabel(w: WorkedInfo): string {
  if (w.working) return w.check_in ? `working · in ${w.check_in}` : "working";
  if (w.no_clock_out) return w.check_in ? `in ${w.check_in} · no clock-out` : "no clock-out";
  return w.check_in ? `worked ${w.check_in}${w.check_out ? `–${w.check_out}` : ""}` : "worked";
}

function describeCellValue(v: ShiftCell | ShiftCell[] | null | undefined): string {
  const cs = cellsOf(v);
  if (cs.length === 0) return "no shift";
  return cs.map((c) => (isSpecialRole(c.role) || (c.start_hour === 0 && c.end_hour === 0))
    ? specialLabel(c.role || "DAY_OFF")
    : `${fmtHour(c.start_hour)}–${fmtHour(c.end_hour)}`).join(" + ");
}

/** What a worked day is measured against: the hours, and the branch when it is
 *  not this sheet's own. A note or a role label alone is not a change to ask about. */
/** Day-off and leave markers without underscores: the same set as the server's
 *  _NOT_WORKING (app/shift_worked_days.py). A cell with one of these is compared by
 *  its type, whatever its hours; plain "off" words are one day off. */
const WORKED_SIG_OFF = new Set(["DAYOFF", "OFF", "REST", "RESTDAY", "DO", "RD", "VL", "UL", "SL", "ML", "EL", "AL", "PL",
  "CL", "HL", "LEAVE", "ABSENCE", "ABSENT", "VACATIONLEAVE", "MEDICALLEAVE", "MATERNITYLEAVE", "BEREAVEMENTLEAVE",
  "INJURY", "HOSPITAL", "AWOL", "SUSPENDED"]);
const WORKED_SIG_PLAIN_OFF = new Set(["OFF", "REST", "RESTDAY", "DO", "RD"]);

function workedSig(v: ShiftCell | ShiftCell[] | null | undefined, home: string, city: City): string {
  // Hours as numbers (fmtHour shows 9.3 as 9:00); a day off or leave by its type
  // (Day Off and VL pay differently); the branch as a code -- the published week
  // comes back with names ("Business Bay") where a painted cell has "BB".
  const code = (b: string) => String(normalizeBranchCode(city, b)).toUpperCase();
  const homeCode = code(home);
  return cellsOf(v).map((c) => {
    const r = String(c.role || "").toUpperCase().replace(/[_\s]/g, "");
    if (WORKED_SIG_OFF.has(r)) return `OFF:${WORKED_SIG_PLAIN_OFF.has(r) ? "DAYOFF" : r}`;
    if (Number(c.start_hour) === 0 && Number(c.end_hour) === 0) return "OFF:DAYOFF";
    const b = c.branch_code ? code(c.branch_code) : "";
    return `${Number(c.start_hour)}-${Number(c.end_hour)}${b && b !== homeCode ? `@${b}` : ""}`;
  }).sort().join("+");
}

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

/** The same identity, but only over the fields the old saved draft actually
 *  holds: work_date, staff_name, role, start_hour, end_hour. It has no
 *  branch_code and no note.
 *
 *  Comparing full signatures made every published cell that carried a
 *  branch_code look different from its own draft copy — 84 of the 98 cells in
 *  one TAFT week — so the migration below carried the whole week across as
 *  pending changes. The screen then offered "Publish 98 changes" when five had
 *  been edited, and left ninety-three stale copies of other people's cells
 *  sitting in the queue. */
function cellDraftSignature(value: ShiftCell | ShiftCell[] | null | undefined): string {
  return cellsOf(value)
    .map((c) => `${c.start_hour}-${c.end_hour}:${c.role || ""}`)
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
  const router = useRouter();

  // This page had no guard, so the URL opened for anyone signed in — the grid was
  // empty until the API refused, which reads as a broken page rather than a closed
  // door. Same rule as the menu: whatever Role Management says.
  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login?next=%2Fadmin%2Fmanual-shift");
      return;
    }
    if (!hasChannelAccess("admin.manual_shift", ["view", "publish"], a)) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [city, setCity] = useState<City>((auth?.city as City) || "dubai");
  const [branchCode, setBranchCode] = useState(() => BRANCHES[(auth?.city as City) || "dubai"][0].code);
  const [weekStart, setWeekStart] = useState(todayMonday);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<
    { name: string; url: string; version: number; shiftDays: number; notShown: string[] } | null>(null);
  const [exportError, setExportError] = useState("");
  const [needsExport, setNeedsExport] = useState(false);
  const [showExportPrompt, setShowExportPrompt] = useState(false);
  const [showExportDone, setShowExportDone] = useState(false);
  const [staffList, setStaffList] = useState<string[]>([]);

  // The week on screen decides the month exported. A week that straddles two
  // months belongs to the one it starts in, which is how the sheets are named.
  // The month to export is picked, not inferred. Deriving it from the visible
  // week meant the file that came out depended on where the grid happened to be
  // scrolled to, which is not something anyone should have to keep track of.
  // It follows the week when the week moves, and can then be overridden.
  const [exportMonth, setExportMonth] = useState(() => weekStart.slice(0, 7));
  useEffect(() => { setExportMonth(weekStart.slice(0, 7)); }, [weekStart]);
  const exportMonthLabel = exportMonth;

  // The month that was published is the one whose workbook is now stale.
  const publishedMonthLabel = useMemo(() => weekStart.slice(0, 7), [weekStart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setNeedsExport(!!window.localStorage.getItem(exportFlagKey(city, publishedMonthLabel)));
    } catch { /* private mode: the banner just will not persist */ }
  }, [city, publishedMonthLabel]);

  // The server's answer, which covers every way the schedule changes and every
  // browser -- the local flag above only knows what this browser published.
  type ExcelStatus = { stale: boolean | null; exported_at?: string | null; exported_by?: string;
                       file_name?: string; changed_branches?: string[] };
  const [excelStatus, setExcelStatus] = useState<ExcelStatus | null>(null);
  const loadExcelStatus = useCallback(async () => {
    try {
      const d = await apiFetch<ExcelStatus>(
        `/api/admin/shifts/excel_export_status?city=${encodeURIComponent(city)}&month=${encodeURIComponent(publishedMonthLabel)}`,
      );
      setExcelStatus(d);
    } catch { setExcelStatus(null); }
  }, [city, publishedMonthLabel]);
  useEffect(() => { void loadExcelStatus(); }, [loadExcelStatus]);

  const markNeedsExport = useCallback(() => {
    setNeedsExport(true);
    try { window.localStorage.setItem(exportFlagKey(city, publishedMonthLabel), "1"); } catch {}
  }, [city, publishedMonthLabel]);

  const runExport = useCallback(async () => {
    setExporting(true); setExportError(""); setExportResult(null);
    try {
      const [y, m] = exportMonth.split("-");
      const res = await fetch("/api/admin/shifts/export-excel", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city, year: Number(y), month: Number(m) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExportError(String(data?.detail || `Export failed (${res.status}).`));
        return;
      }
      setExportResult({
        name: data?.file?.name || "", url: data?.file?.url || "",
        version: data?.version || 0, shiftDays: data?.shift_days || 0,
        notShown: Array.isArray(data?.not_shown) ? data.not_shown : [],
      });
      setShowExportDone(true);
      void loadExcelStatus();
      if (exportMonth === publishedMonthLabel) {
        setNeedsExport(false);
        setShowExportPrompt(false);
        try { window.localStorage.removeItem(exportFlagKey(city, publishedMonthLabel)); } catch {}
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setExporting(false);
    }
  }, [city, exportMonth, publishedMonthLabel, loadExcelStatus]);

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
  // Set only by a 409 from publish: the week rosters somebody on an approved day off.
  const [publishBlockedBy, setPublishBlockedBy] = useState<DayOffConflict[]>([]);
  // Same idea, other check: the person is already published at another branch
  // for those hours. Kept apart so each panel says what it is about.
  const [overlapBlockedBy, setOverlapBlockedBy] = useState<CrossBranchOverlap[]>([]);
  // Whether the day-off check was already waived for the publish that then hit
  // the overlap check, so 'publish anyway' does not lose the first answer.
  const dayOffWaivedRef = useRef(false);
  const workedWaivedRef = useRef<{ staff_name: string; work_date: string }[]>([]);
  const publishingRef = useRef(false);
  const [view, setView] = useState<PageView>("edit");
  const [publishedCount, setPublishedCount] = useState(0);

  // ─── Cell-level sync ──────────────────────────────────────────────────────
  // Edits this browser has not yet had acknowledged. Held in a ref because the
  // flush loop reads it outside React's render cycle, and mirrored to state only
  // so the header can say whether everything is saved.
  const outboxRef = useRef<Map<string, PendingEdit>>(new Map());
  const [outboxSize, setOutboxSize] = useState(0);
  /** Edits waiting for the week's clock-ins or for an answer: not in the outbox yet,
   *  but lost just the same if a deploy reloads the page. */
  const [commitsWaiting, setCommitsWaiting] = useState(0);
  // Days already clocked in, for the marks on the grid and the question before a change.
  const [worked, setWorked] = useState<Map<string, WorkedInfo>>(new Map());
  const workedRef = useRef(worked);
  workedRef.current = worked;
  const gridDataRef = useRef(gridData);
  gridDataRef.current = gridData;
  /** Cells the person has already said yes to on this page; asked once each. */
  const confirmedWorkedRef = useRef<Set<string>>(new Set());
  const [workedAsk, setWorkedAsk] = useState<null | { items: WorkedAskItem[]; mode: WorkedAskMode }>(null);
  const workedAskResolve = useRef<((a: WorkedAnswer) => void) | null>(null);
  // One question at a time. A second one (the retry loop's 409 while the person
  // is answering about their own edit) used to replace the first, whose caller
  // then waited forever.
  const askChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const askWorked = useCallback((items: WorkedAskItem[], mode: WorkedAskMode) => {
    const p = askChainRef.current.then(() => new Promise<WorkedAnswer>((resolve) => {
      workedAskResolve.current = resolve;
      setWorkedAsk({ items, mode });
    }));
    askChainRef.current = p.catch(() => undefined);
    return p;
  }, []);
  /** The week whose clock-ins are in `worked`, so a change is never checked against another week's. */
  const workedForRef = useRef("");
  /** The week whose clock-ins were last asked for, answered or not. An edit waits
   *  for that request once per week, not on every edit while it keeps failing. */
  const workedTriedRef = useRef("");
  /** Edits apply in the order they were made. Each one may wait for the clock-ins
   *  and a question, and two edits to the same cell must not land out of order. */
  const commitChainRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Per cell, the value last asked for and which commit asked: two removals are
   *  both null, so the commit's own number decides whose entry to clear. */
  const intendedRef = useRef<Record<string, { v: ShiftCell | ShiftCell[] | null; t: number }>>({});
  const commitSeqRef = useRef(0);
  const sheetKeyRef = useRef("");
  sheetKeyRef.current = `${city}|${branchCode}|${weekStart}`;
  const loadWorkedRef = useRef<() => Promise<void>>(async () => {});
  const answerWorked = (a: WorkedAnswer) => {
    const r = workedAskResolve.current;
    workedAskResolve.current = null;
    setWorkedAsk(null);
    r?.(a);
  };
  const refreshWeekRef = useRef<() => Promise<void>>(async () => {});
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
  const publishedDraftSigRef = useRef<Record<string, string>>({});
  /** The published hours and branch of each cell, by workedKey. A worked day is
   *  measured against what is published, so "same hours" is judged against this
   *  and not against the screen, which also shows unpublished edits. */
  const publishedWorkedSigRef = useRef<{ sheet: string; sigs: Record<string, string> }>({ sheet: "", sigs: {} });

  // A new deploy hard-reloads the page. Edits are saved as they are made now, so
  // the only thing a reload can lose is what has not reached the server yet.
  useUnsavedGuard("manual-shift", outboxSize > 0 || commitsWaiting > 0);
  const [removedStaff, setRemovedStaff] = useState<string[]>([]);
  // Picking somebody to add to the grid. `here` marks this branch's own staff,
  // which is where the list starts; the rest of the city follows, because
  // people cover at branches that are not their own.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerNames, setPickerNames] = useState<{ name: string; here: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  // Taken off this branch's grid and kept that way. removedStaff above is the
  // in-page copy, wiped on every week change; this is the stored one.
  const [hiddenStaff, setHiddenStaff] = useState<{ staff_name: string; hidden_by: string }[]>([]);
  const hiddenStaffRef = useRef<string[]>([]);
  hiddenStaffRef.current = hiddenStaff.map((h) => h.staff_name);
  const [showHidden, setShowHidden] = useState(false);
  const removedStaffRef = useRef<string[]>([]);
  // The week and sheet on screen now -- read after an await, where the
  // closure's own city/branch/week are still the ones from the click.
  const viewKeyRef = useRef("");
  viewKeyRef.current = `${city}|${branchCode}|${weekStart}`;
  // One removal at a time: a second click during the first one's awaits
  // started a second dry run against a half-removed row.
  const removingRef = useRef(false);
  const [removingStaff, setRemovingStaff] = useState<string | null>(null);
  removedStaffRef.current = removedStaff;
  const [approvedDayOffs, setApprovedDayOffs] = useState<Set<string>>(new Set());
  // Day-off requests the staff filed, against what this roster still says.
  //
  // approvedDayOffs above comes from shift_sheet_sync_proposals -- the sheet
  // sync -- and never saw these. Patrick Danel Santiago asked on 2026-08-30
  // for 2026-09-20, his manager approved it, and the cell showed nothing.
  // Keyed `${staff}|${date}` to whether it was answered.
  const [dayOffConflicts, setDayOffConflicts] = useState<Map<string, "approved_but_rostered" | "undecided_and_rostered">>(new Map());
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
  const flushOnce = useCallback(async (): Promise<boolean> => {
    if (outboxRef.current.size === 0) return false;
    // A question about worked days is on screen; send nothing until it is answered.
    if (workedAskResolve.current) return false;
    const refusedWorked: { edit: PendingEdit; info: WorkedInfo }[] = [];
    const groups = new Map<string, PendingEdit[]>();
    for (const e of outboxRef.current.values()) {
      const g = `${e.city}|${e.branch_code}|${e.week_start}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(e);
    }
    let failed = false;
    let lastError = "";
    for (const [g, edits] of groups) {
      const [c, bc, ws] = g.split("|");
      try {
        await apiFetch("/api/admin/shifts/week_cells", {
          method: "POST",
          body: JSON.stringify({
            city: c, branch_code: bc, week_start: ws,
            edits: edits.map((e) => ({ staff_name: e.staff_name, work_date: e.work_date, cells: e.cells,
                                       confirm_worked: !!e.confirm_worked })),
          }),
        });
        for (const e of edits) {
          // Only drop the queued edit if it is still the one we sent. A newer
          // edit to the same cell must not be dropped by an older flush.
          const k = queueKey(e);
          if (outboxRef.current.get(k) === e) outboxRef.current.delete(k);
        }
      } catch (err: unknown) {
        const apiErr = err as ApiError;
        if (workedCellsFrom(apiErr).length > 0) {
          // Edits queued before this rule (or from another tab) for days already
          // clocked in. Asked about below instead of retried forever.
          // Matched on workedKey: the server may spell the name without the
          // grid's role suffix ("Amar BK" for "Amar BK (CK)").
          const cells = workedCellsFrom(apiErr);
          let matched = 0;
          for (const c of cells) {
            const ck = workedKey(c.staff_name, c.work_date);
            const e = edits.find((x) => workedKey(x.staff_name, x.work_date) === ck);
            if (e) { refusedWorked.push({ edit: e, info: c }); matched++; }
          }
          if (matched > 0) continue;
          // A refusal that names no queued edit cannot be asked about; say so
          // rather than retry it silently every five seconds.
          failed = true;
          lastError = `already clocked in on ${cells.map((c) => `${stripRoleSuffix(c.staff_name)} ${c.work_date}`).join(", ")}`;
          continue;
        }
        // Every failure used to read as a dropped connection, and the banner
        // promised the edits would go "as soon as the connection comes back".
        // For anything the server actually refuses that is never true: the same
        // request goes out every five seconds for as long as the tab is open,
        // and Publish stays blocked because the queue never empties. Say what
        // came back instead, so the next person does not spend an afternoon
        // reloading and logging in again.
        failed = true;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    setSyncError(
      !failed ? ""
        : lastError
        ? `Not saved — the server refused this edit: ${lastError}`
        : "Not saved yet — retrying. Keep this page open.",
    );
    syncOutboxSize();
    if (refusedWorked.length > 0) {
      const answer = await askWorked(refusedWorked.map(({ edit, info }) => ({
        staffName: edit.staff_name, dateStr: edit.work_date, info,
        before: "as published", after: describeCellValue(edit.cells),
      })), "replay");
      const discarded: PendingEdit[] = [];
      for (const { edit } of refusedWorked) {
        const k = queueKey(edit);
        const cur = outboxRef.current.get(k);
        // Only the edit the question showed. A newer edit to the same cell, made
        // while this was being asked, stays unconfirmed and is asked about itself.
        if (cur !== edit) continue;
        if (answer === "change") {
          confirmedWorkedRef.current.add(confirmKey(edit.city, edit.branch_code, edit.week_start,
                                                    edit.staff_name, edit.work_date));
          outboxRef.current.set(k, { ...cur, confirm_worked: true });
        } else {
          outboxRef.current.delete(k);
          discarded.push(edit);
        }
      }
      syncOutboxSize();
      if (answer === "change") return true;   // send them again, confirmed
      // Never reached the server, so it is not an unpublished change. The whole
      // overlay goes back on in the refresh below, re-marking any cell someone
      // else still has an edit on.
      const dsk = sheetKeyRef.current;
      const gone = discarded
        .filter((e) => `${e.city}|${e.branch_code}|${e.week_start}` === dsk)
        .map((e) => cellKey(e.staff_name, e.work_date));
      if (gone.length > 0) {
        setUnpublishedCells((prev) => { const n = new Set(prev); for (const k of gone) n.delete(k); return n; });
        setCellEditors((prev) => { const n = { ...prev }; for (const k of gone) delete n[k]; return n; });
      }
      await refreshWeekRef.current();         // put the published cells back on screen
      // The refresh paints the published week; the other edits refused in the same
      // batch are still queued and were never saved, so put them back on screen.
      const sk = sheetKeyRef.current;
      const mine = Array.from(outboxRef.current.values()).filter((e) => `${e.city}|${e.branch_code}|${e.week_start}` === sk);
      if (mine.length > 0) {
        setGridData((prev) => {
          const next: GridData = { ...prev };
          for (const e of mine) {
            const v = e.cells.length === 0 ? null : e.cells.length === 1 ? e.cells[0] : e.cells;
            next[e.staff_name] = { ...(next[e.staff_name] ?? {}), [e.work_date]: v };
          }
          return next;
        });
        setUnpublishedCells((prev) => {
          const n = new Set(prev);
          for (const e of mine) n.add(cellKey(e.staff_name, e.work_date));
          return n;
        });
      }
      // The server refused the whole batch for the discarded cells; the rest of it
      // was never refused and goes again now, before Publish or Load from DB look.
      return outboxRef.current.size > 0;
    }
    return false;
  }, [syncOutboxSize, askWorked]);

  // One flush at a time. Two in flight (an edit's flush and the 5s retry) both got
  // the same refusal and asked the same question twice; a "Discard" on the repeat
  // then dropped the edit just confirmed. A call made while one runs waits for it,
  // and the running one goes round again so nothing queued meanwhile is missed.
  // Publish and Discard await this, so they see the queue settled.
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const flushAgainRef = useRef(false);
  const flushOutbox = useCallback((): Promise<void> => {
    if (flushInFlightRef.current) {
      flushAgainRef.current = true;
      return flushInFlightRef.current;
    }
    const run = (async () => {
      try {
        let again = true;
        while (again) {
          flushAgainRef.current = false;
          const resend = await flushOnce();
          again = (resend || flushAgainRef.current) && outboxRef.current.size > 0;
        }
      } finally {
        flushInFlightRef.current = null;
      }
    })();
    flushInFlightRef.current = run;
    return run;
  }, [flushOnce]);

  /** The single place a cell changes. Everything that edits the grid goes
   *  through here, so nothing can change a cell without it being saved. */
  const commitCells = useCallback((
    input: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }[],
    opts?: { bulk?: boolean; onWorkedAnswer?: (a: WorkedAnswer) => void },
  ): Promise<number> => {
    // What the person has asked each cell to become, before the chain applies it.
    // The editor builds its next value from this: the removal of a segment still
    // waiting on its question must not come back with the next Save.
    const sheet = `${city}|${branchCode}|${weekStart}`;
    const token = ++commitSeqRef.current;
    for (const ch of input) intendedRef.current[`${sheet}|${cellKey(ch.staffName, ch.dateStr)}`] = { v: ch.value, t: token };
    setCommitsWaiting((n) => n + 1);
    const run = commitChainRef.current.then(() => commitNow(input, opts)).finally(() => {
      for (const ch of input) {
        const k = `${sheet}|${cellKey(ch.staffName, ch.dateStr)}`;
        if (intendedRef.current[k]?.t === token) delete intendedRef.current[k];
      }
      setCommitsWaiting((n) => n - 1);
    });
    commitChainRef.current = run.catch(() => 0);
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, branchCode, weekStart, auth?.staffName, syncOutboxSize, flushOutbox, askWorked]);

  const commitNow = async (
    input: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }[],
    opts?: { bulk?: boolean; onWorkedAnswer?: (a: WorkedAnswer) => void },
  ): Promise<number> => {
    let changes = input;
    if (changes.length === 0) return 0;
    const sheet = `${city}|${branchCode}|${weekStart}`;
    // The week's clock-ins, if this week's have not arrived yet (an old draft is
    // carried in on load, racing the attendance request). Asked once per week:
    // if the request fails, later edits go straight on and the server still asks.
    const wk = `${city}|${weekStart}`;
    if (workedForRef.current !== wk && workedTriedRef.current !== wk) {
      workedTriedRef.current = wk;
      // At most 8 s: every later edit, Publish and Discard queue behind this one.
      try {
        await Promise.race([loadWorkedRef.current(), new Promise((r) => window.setTimeout(r, 8000))]);
      } catch { /* the server still asks */ }
    }
    // The person may have moved to another branch or week while that was waiting.
    // The edit belongs to the old sheet: it is queued for that sheet, not painted on
    // this one, and the server asks about it if its day was worked.
    const queueOnly = (list: typeof changes, confirmed: (ch: { staffName: string; dateStr: string }) => boolean) => {
      for (const ch of list) {
        const e: PendingEdit = { city, branch_code: branchCode, week_start: weekStart, staff_name: ch.staffName,
          work_date: ch.dateStr, cells: cellsOf(ch.value), confirm_worked: confirmed(ch) };
        outboxRef.current.set(queueKey(e), e);
      }
      syncOutboxSize();
      void flushOutbox();
      return list.length;
    };
    if (sheetKeyRef.current !== sheet) return queueOnly(changes, () => false);
    const ck = (ch: { staffName: string; dateStr: string }) => confirmKey(city, branchCode, weekStart, ch.staffName, ch.dateStr);
    const isWorked = (ch: { staffName: string; dateStr: string }) => workedRef.current.has(workedKey(ch.staffName, ch.dateStr));
    const moves = (ch: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }) =>
      workedSig(gridDataRef.current[ch.staffName]?.[ch.dateStr], branchCode, city) !== workedSig(ch.value, branchCode, city);
    // Against what is published, which is what the day is measured against. The
    // screen may show an hours change saved before the clock-in; a note added to
    // that cell now would otherwise carry the hours change through unasked.
    const leavesPublished = (ch: { staffName: string; dateStr: string; value: ShiftCell | ShiftCell[] | null }) =>
      // Not loaded for this sheet yet (just switched): unknown, so it counts as a change.
      publishedWorkedSigRef.current.sheet !== sheet
      || (publishedWorkedSigRef.current.sigs[workedKey(ch.staffName, ch.dateStr)] ?? workedSig(null, branchCode, city))
        !== workedSig(ch.value, branchCode, city);
    // A day already clocked in: ask before changing it -- once per cell for an
    // edit by hand; every time for a bulk load, whose answer covers all of them.
    const bulkYes = new Set<string>();
    const needs = changes.filter((ch) => isWorked(ch) && (moves(ch) || leavesPublished(ch))
      && (opts?.bulk || !confirmedWorkedRef.current.has(ck(ch))));
    if (needs.length > 0) {
      const answer = await askWorked(needs.map((ch) => ({
        staffName: ch.staffName, dateStr: ch.dateStr,
        info: workedRef.current.get(workedKey(ch.staffName, ch.dateStr))!,
        before: describeCellValue(gridDataRef.current[ch.staffName]?.[ch.dateStr]),
        after: describeCellValue(ch.value),
      })), opts?.bulk ? "bulk" : "single");
      opts?.onWorkedAnswer?.(answer);
      if (answer === "cancel") return 0;
      const asked = new Set(needs.map(ck));
      // Moved to another sheet while the question was open: this grid and these
      // clock-ins belong to the other sheet, so only the answer itself is used.
      if (sheetKeyRef.current !== sheet) {
        // A cell confirmed earlier on the old sheet keeps its yes either way.
        const yes = (ch: { staffName: string; dateStr: string }) => confirmedWorkedRef.current.has(ck(ch));
        if (answer === "skip") return queueOnly(changes.filter((ch) => !asked.has(ck(ch))), yes);
        for (const k of asked) confirmedWorkedRef.current.add(k);
        return queueOnly(changes, yes);
      }
      // "Keep worked days as they are" keeps all of them, notes and labels too --
      // and a pending value saved before the clock-in, which differs from what is published.
      if (answer === "skip") changes = changes.filter((ch) => !(isWorked(ch)
        && (cellSignature(gridDataRef.current[ch.staffName]?.[ch.dateStr]) !== cellSignature(ch.value)
            || leavesPublished(ch))));
      // A bulk yes covers this load's values only; a hand edit's yes lasts for the cell
      // until the week is published or discarded.
      else if (opts?.bulk) for (const k of asked) bulkYes.add(k);
      else for (const k of asked) confirmedWorkedRef.current.add(k);
      if (changes.length === 0) return 0;
    }
    // Same hours as published on a worked day (a note, a role label): nothing the
    // day is measured against changes, so it goes without a question. For this
    // edit only -- a later change of hours to the same cell is still asked about.
    const sameHours = new Set(changes.filter((ch) => isWorked(ch) && !leavesPublished(ch)).map(ck));
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
        confirm_worked: confirmedWorkedRef.current.has(ck(ch)) || sameHours.has(ck(ch)) || bulkYes.has(ck(ch)),
      };
      outboxRef.current.set(queueKey(e), e);
    }
    syncOutboxSize();
    void flushOutbox();
    return changes.length;
  };

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
    // Somebody typed in by hand is on no roster and, until their first publish,
    // in no published row either -- so the grid has no line for them and this
    // used to drop their cells on the floor. The work was never lost: it sat in
    // shift_week_edits, unreachable from the one screen that could publish it.
    // Bibek Tamang had seven days saved that way and read as gone (2026-10-19).
    //
    // The overlay is the server's answer about this exact week. If it holds a
    // cell for a name, the name belongs on the grid. A row taken out on purpose
    // still stays out.
    //
    // A hidden name's edits are still applied to the grid. Hiding a row does
    // not unpublish anything, and the clears that "Remove from sheet" queues
    // are exactly what tells the render below that the row is now empty. A
    // hidden name only gets a line back for a cell that actually holds a shift.
    const sessionRemoved = new Set(removedStaffRef.current);
    const hiddenNow = new Set(hiddenStaffRef.current);
    const newNames = Array.from(new Set(
      changes
        .filter((ch) => ch.staffName && !sessionRemoved.has(ch.staffName)
          && !staffListRef.current.includes(ch.staffName)
          && (!hiddenNow.has(ch.staffName) || ch.value != null))
        .map((ch) => ch.staffName),
    ));
    if (newNames.length > 0) {
      const merged = Array.from(new Set([...staffListRef.current, ...newNames]))
        .sort((a, b) => a.localeCompare(b));
      staffListRef.current = merged;
      setStaffList(merged);
    }
    if (changes.length > 0) {
      setGridData((prev) => {
        const next: GridData = {};
        for (const [name, days] of Object.entries(prev)) next[name] = { ...days };
        for (const ch of changes) {
          if (sessionRemoved.has(ch.staffName)) continue;
          if (!next[ch.staffName]) next[ch.staffName] = {};
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
      const removedNow = new Set([...removedStaffRef.current, ...hiddenStaffRef.current]);
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

  const loadHiddenStaff = useCallback(async () => {
    if (!branchCode) return;
    try {
      const d = await apiFetch<{ hidden?: { staff_name: string; hidden_by: string }[] }>(
        `/api/admin/manual-shift/hidden-staff?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}`
      );
      const list = d.hidden || [];
      setHiddenStaff(list);
      hiddenStaffRef.current = list.map((h) => h.staff_name);
    } catch {
      // A failed lookup must not empty the grid — better to show a name that
      // was hidden than to hide one that was not.
    }
  }, [city, branchCode]);

  const loadExistingShifts = useCallback(async (forceOverwrite = false, cancelledRef?: { current: boolean }) => {
    setLoading(true);
    setError("");
    // A different week's conflicts are not this week's.
    setPublishBlockedBy([]);
    setOverlapBlockedBy([]);
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
        // Same cells, compared only on what a legacy draft can hold.
        publishedDraftSigRef.current = Object.fromEntries(
          Object.entries(byCell).map(([k, v]) => [k, cellDraftSignature(v)])
        );
        const byWorked: Record<string, ShiftCell[]> = {};
        for (const r of rows as any[]) {
          (byWorked[workedKey(String(r.staff_name), String(r.work_date))] ??= []).push({
            start_hour: Number(r.start_hour), end_hour: Number(r.end_hour), role: String(r.role || ""),
            branch_code: r.branch_code ? String(r.branch_code) : undefined,
          });
        }
        publishedWorkedSigRef.current = {
          sheet: `${city}|${branchCode}|${weekStart}`,
          sigs: Object.fromEntries(Object.entries(byWorked).map(([k, v]) => [k, workedSig(v, branchCode, city)])),
        };
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
        // A name pulled in from the published week stays on the grid even when
        // it is hidden from this sheet. Hiding used to drop it here, and the
        // shifts it still had went on being published, shown to the staff
        // member, exported to the spreadsheet and fed into next month's draft
        // -- from the one screen that could no longer show or delete them.
        // Sharon Namale was hidden from ARJ on 2026-10-11 with 18 ARJ shifts
        // left, at the same hours as her AB ones; four people who had left kept
        // 84 published rows between them the same way. The render below drops a hidden
        // row once its week is empty, so a deliberate removal still disappears.
        // Only a row taken out in this session is held back here.
        const sessionRemoved = new Set(removedStaffRef.current);
        const merged = Array.from(new Set([...currentStaff, ...extraNames]))
          .filter((n) => !sessionRemoved.has(n))
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
      // Before the roster, so the first render already excludes them.
      await loadHiddenStaff();
      if (cancelledRef.current) return;
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
            //
            // Compared on the draft's own fields. The draft has no branch_code,
            // so a full-signature comparison called every published cell that
            // had one a difference, and carried the entire week.
            if (cellDraftSignature(value) === (publishedDraftSigRef.current[k] ?? "")) continue;
            carried.push({ staffName: rName, dateStr: rDate, value });
          }
          // "Keep worked days as they are" on an old week leaves nothing to carry,
          // so the overlay stays empty and the same question came back on every
          // open. Remembered here for this week (per browser).
          const keptKey = `manual-shift:draft-kept:${city}|${branchCode}|${weekStart}`;
          let kept = false;
          try { kept = window.localStorage.getItem(keptKey) === "1"; } catch { /* storage off: ask again */ }
          if (!cancelledRef.current && carried.length > 0 && !kept) {
            void commitCells(carried, {
              bulk: true,
              onWorkedAnswer: (a) => {
                if (a !== "skip") return;
                try { window.localStorage.setItem(keptKey, "1"); } catch { /* storage off: ask again */ }
              },
            }).then((n) => {
              if (n > 0) setNotice(`${n} cell${n === 1 ? "" : "s"} from the old saved draft moved into this week — publish when ready.`);
            });
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

  // Day-off requests against what this roster still says.
  //
  // Its own effect, not folded into the loader above: that one returns early
  // while staffList is empty, which is exactly the state on the first
  // "Load Staff & Shifts" of a session. The window is wide because the week on
  // screen can be months from today, and the scan is bounded by the request
  // table, which holds tens of rows.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const cf = await apiFetch<{ items: { staff_name: string; work_date: string; kind: string }[] }>(
          `/api/admin/shift-conflicts?city=${encodeURIComponent(city)}&days_back=180&days_ahead=180`
        );
        if (dead) return;
        const m = new Map<string, "approved_but_rostered" | "undecided_and_rostered">();
        (cf.items ?? []).forEach((r) => {
          if (r.kind === "approved_but_rostered" || r.kind === "undecided_and_rostered") {
            m.set(`${r.staff_name}|${r.work_date}`, r.kind);
          }
        });
        setDayOffConflicts(m);
      } catch {
        // Optional overlay — a failed scan must not stop the week loading.
      }
    })();
    return () => { dead = true; };
  }, [city]);

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
    // The published week moved (someone published, Load from DB, a row deleted):
    // a yes was given against what it said before, and the server has taken its
    // copy back too (app/shift_worked_days.py), so ask again.
    confirmedWorkedRef.current.clear();
    await loadExistingShifts(true);
    try { await reapplyWholeOverlay(); } catch { /* keep the published week on screen */ }
  }, [loadExistingShifts, reapplyWholeOverlay]);
  refreshWeekRef.current = refreshWeek;

  // Who has clocked in this week. Reloaded every minute: people clock in all day.
  const weekKeyRef = useRef("");
  weekKeyRef.current = `${city}|${weekStart}`;
  const workedInFlightRef = useRef<{ key: string; p: Promise<{ days?: WorkedInfo[] }> } | null>(null);
  const loadWorked = useCallback(async () => {
    const key = `${city}|${weekStart}`;
    // The minute poll and an edit waiting for the marks share one request.
    if (workedInFlightRef.current?.key !== key) {
      const p = fetchWeekAttendance(city, weekStart);
      workedInFlightRef.current = { key, p };
      p.finally(() => { if (workedInFlightRef.current?.p === p) workedInFlightRef.current = null; }).catch(() => {});
    }
    const d = await workedInFlightRef.current!.p;
    if (weekKeyRef.current !== key) return;
    const m = new Map<string, WorkedInfo>();
    for (const w of d.days || []) m.set(workedKey(w.staff_name, w.work_date), w);
    workedRef.current = m;
    workedForRef.current = key;
    setWorked(m);
  }, [city, weekStart]);
  loadWorkedRef.current = loadWorked;
  useEffect(() => {
    if (view !== "edit") return;
    const load = async () => {
      try { await loadWorked(); } catch { /* the marks are a help; the server still asks before a worked day changes */ }
    };
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [loadWorked, view]);

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
    const existing = cellsOf(latestCell(staffName, dateStr));
    const next = editShiftIndex === null
      ? [...existing, newShift]
      : existing.map((s, i) => (i === editShiftIndex ? newShift : s));
    commitCell(staffName, dateStr, next.length === 1 ? next[0] : next);
    closeEdit();
  }

  /** A grid cell found by the server's spelling of the name ("Amar BK" vs "Amar BK (CK)"). */
  function gridCellByWorkedKey(name: string, dateStr: string) {
    const want = workedKey(name, dateStr);
    const hit = Object.keys(gridDataRef.current).find((n) => workedKey(n, dateStr) === want);
    return hit ? gridDataRef.current[hit]?.[dateStr] : undefined;
  }

  /** The cell as the person last asked for it: an edit still waiting on its
   *  question is not on the grid yet, and the next edit must build on it. */
  function latestCell(staffName: string, dateStr: string) {
    const k = `${city}|${branchCode}|${weekStart}|${cellKey(staffName, dateStr)}`;
    return k in intendedRef.current ? intendedRef.current[k].v : gridData[staffName]?.[dateStr];
  }

  function removeShiftSegment(staffName: string, dateStr: string, index: number) {
    const next = cellsOf(latestCell(staffName, dateStr)).filter((_, i) => i !== index);
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

  async function deleteStaffFromGrid(staffName: string) {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemovingStaff(staffName);
    try {
      await removeStaffFromGridInner(staffName);
    } finally {
      removingRef.current = false;
      setRemovingStaff(null);
    }
  }

  async function removeStaffFromGridInner(staffName: string) {
    // Where the page was when this began. The removal awaits the server for
    // seconds; moving to another week or branch meanwhile used to apply the
    // local half (hiding the row, dropping its cells) to whatever was then on
    // screen.
    const startedFor = `${city}|${branchCode}|${weekStart}`;
    const datesWithShifts = weekDates.filter((d) => gridData[staffName]?.[d]);

    // A sheet is often where a rotating person's whole schedule is written,
    // not where they work. Francis Ibana's September lives on the CK sheet —
    // 30 of 31 days — while the cells themselves say TAFT, PAR and CK. Removing
    // him from CK to "tidy up" would have deleted the month.
    //
    // So before clearing a row, say which branches its cells actually name.
    const otherBranches = Array.from(new Set(
      datesWithShifts
        .flatMap((d) => {
          const cell = gridData[staffName]?.[d];
          const list = Array.isArray(cell) ? cell : cell ? [cell] : [];
          return list.map((c) => (c.branch_code || "").toUpperCase());
        })
        .filter((b) => b && b !== branchCode.toUpperCase())
    ));
    if (otherBranches.length > 0 && !window.confirm(
      `Careful — these shifts are not ${branchCode} work.\n\n` +
      `"${stripRoleSuffix(staffName)}" has shifts on this sheet assigned to ` +
      `${otherBranches.join(", ")}. This sheet is being used to write their ` +
      `rotation, not to say where they work.\n\n` +
      `Clearing the row deletes those shifts too. Continue?`
    )) return;

    // What they still have published on this sheet after today. Hiding the row
    // used to leave all of it in place: still on their own schedule, still on
    // the spreadsheet, still feeding next month's draft -- and no longer on
    // this grid, the one place it could be deleted.
    type AheadRow = { work_date: string; role: string; branch_code?: string | null;
                      start_hour?: number; end_hour?: number };
    // Anything typed for this person and still queued in this browser goes to
    // the server first, so the removal below sees it -- otherwise the queue
    // would send it afterwards and bring the cell back as a pending edit.
    // An edit can still be waiting in the commit chain (for the week's clock-ins)
    // before it reaches the queue, so settle that first, as Publish does.
    await commitChainRef.current;
    await flushOutbox();
    if (Array.from(outboxRef.current.values()).some(
      (e) => e.staff_name === staffName && e.city === city && e.branch_code === branchCode)) {
      setError(`${stripRoleSuffix(staffName)}'s latest edits have not reached the server yet, so nothing `
        + `was removed. Wait for them to save, then try again.`);
      return;
    }
    let ahead: AheadRow[] = [];
    let fromDate = "";
    let pendingCount = 0;
    let serverWeeks: string[] = [];
    try {
      const d = await apiFetch<{ published_rows?: AheadRow[]; payroll_blocker?: string | null; from_date?: string;
                                 pending_edits?: number; weeks?: string[] }>(
        "/api/admin/shifts/remove_staff_from_branch",
        { method: "POST", body: JSON.stringify({
            city, branch_code: branchCode, staff_name: staffName, dry_run: true }) },
      );
      ahead = d.published_rows || [];
      fromDate = d.from_date || "";
      pendingCount = Number(d.pending_edits || 0);
      serverWeeks = d.weeks || [];
      // Somebody who has left but is still on payroll: clearing their scheduled
      // days turns recorded absences into paid rest days. Nothing is removed --
      // not this week either -- until their payroll has stopped.
      if (d.payroll_blocker) {
        setError(`${stripRoleSuffix(staffName)} was not removed. ${d.payroll_blocker}`);
        return;
      }
    } catch (e: unknown) {
      setError(
        `Could not check ${stripRoleSuffix(staffName)}'s other weeks, so nothing was removed. `
        + (e instanceof Error ? e.message : String(e)),
      );
      return;
    }
    const aheadWork = ahead.filter((r) => isWorkCell(r.role, r.start_hour, r.end_hour));
    const lastDay = aheadWork.length > 0 ? aheadWork[aheadWork.length - 1].work_date : "";
    const aheadElsewhere = Array.from(new Set(
      aheadWork
        .map((r) => (r.branch_code || "").toUpperCase())
        .filter((b) => b && b !== branchCode.toUpperCase()),
    ));
    // Today and earlier are days already worked (or missed): attendance and
    // payroll read them from the schedule, so they stay. Only the days the
    // server removes -- from tomorrow, in the store's time -- are cleared here.
    // Clearing the whole week used to delete the shifts already worked this
    // week too, once somebody published.
    const toClear = fromDate ? datesWithShifts.filter((d) => d >= fromDate) : [];
    const keptPast = datesWithShifts.length - toClear.length;
    const futureText = (aheadWork.length > 0
      ? `From ${fromDate}, ${aheadWork.length} published shift(s) through ${lastDay} come off ` +
        `the published schedule now, so they stop showing on their own schedule and on ` +
        `the spreadsheet.` +
        (aheadElsewhere.length > 0 ? ` Some are written for ${aheadElsewhere.join(", ")} — those go too.` : "")
      : `They have no published shifts on this sheet from ${fromDate || "tomorrow"}.`)
      + (pendingCount > 0 ? ` ${pendingCount} unpublished edit(s) for them from that day are dropped too.` : "");
    const pastText = keptPast > 0
      ? `\n\nToday and earlier stay as they are (${keptPast} day(s) on the week shown) — ` +
        `attendance and pay read them.`
      : "";

    if (!window.confirm(
      `Remove "${stripRoleSuffix(staffName)}" from the ${branchCode} sheet?\n\n` +
      futureText + pastText + `\n\n` +
      `They stay off this sheet from now on — not just this week. Their other ` +
      `branches are unaffected, and you can put them back from the list above the grid.`
    )) return;
    // The server removes everything from tomorrow -- published rows and
    // pending edits, every week -- and marks each emptied cell as applied. The
    // page only mirrors that. Clearing the cells through the edit queue as
    // well rewrote them as *unpublished* edits: an "N unpublished" count and a
    // Publish button for nothing, on a row that was no longer on screen.
    if (serverWeeks.length > 0) {
      try {
        const r = await apiFetch<{ rows_deleted?: number; weeks?: string[] }>(
          "/api/admin/shifts/remove_staff_from_branch",
          { method: "POST", body: JSON.stringify({
              city, branch_code: branchCode, staff_name: staffName, dry_run: false }) },
        );
        void loadExcelStatus();
        setNotice(
          `${stripRoleSuffix(staffName)}: ${r.rows_deleted ?? 0} published row(s) from tomorrow `
          + `removed from ${branchCode} (${(r.weeks || []).length} week(s)).`,
        );
      } catch (e: unknown) {
        // Nothing more is done here -- not the hiding, not the local clear --
        // so the screen does not claim a removal the server refused (a status
        // change since the check, say). Weeks are removed one at a time, so
        // some may already be gone; the reload shows which.
        setError(
          `${stripRoleSuffix(staffName)} was not fully removed: `
          + (e instanceof Error ? e.message : String(e))
          + ` — reload the week to see what is still published, and try again.`,
        );
        return;
      }
    }
    const sameView = startedFor === viewKeyRef.current;
    const sameSheet = startedFor.split("|").slice(0, 2).join("|")
      === viewKeyRef.current.split("|").slice(0, 2).join("|");
    if (sameView && toClear.length > 0) {
      const gone = new Set(toClear.map((d) => cellKey(staffName, d)));
      setGridData((prev) => {
        const next: GridData = { ...prev, [staffName]: { ...(prev[staffName] ?? {}) } };
        for (const d of toClear) next[staffName][d] = null;
        return next;
      });
      setUnpublishedCells((prev) => new Set(Array.from(prev).filter((k) => !gone.has(k))));
    }
    // With days already worked this week the row stays listed -- marked as
    // removed -- so those days remain visible here; it drops out by itself in
    // the next week, which has nothing for it.
    if (sameView && keptPast === 0) {
      setStaffList((prev) => prev.filter((n) => n !== staffName));
      setRemovedStaff((prev) => (prev.includes(staffName) ? prev : [...prev, staffName]));
      setGridData((prev) => {
        const next = { ...prev };
        delete next[staffName];
        return next;
      });
    }
    // Store it, or the row is back as soon as the week changes.
    try {
      const d = await apiFetch<{ hidden?: { staff_name: string; hidden_by: string }[] }>(
        "/api/admin/manual-shift/hidden-staff",
        { method: "POST", body: JSON.stringify({
            city: startedFor.split("|")[0], branch_code: startedFor.split("|")[1],
            staff_name: staffName, hidden: true }) });
      // The list is this sheet's; another sheet on screen keeps its own.
      if (d.hidden && sameSheet) {
        setHiddenStaff(d.hidden); hiddenStaffRef.current = d.hidden.map((h) => h.staff_name);
      }
    } catch (e: unknown) {
      setError(
        `${stripRoleSuffix(staffName)}'s shifts from tomorrow were removed, but they could not be kept `
        + `off this sheet: ${e instanceof Error ? e.message : String(e)}. Their row will show again on the `
        + `next load — remove it again then.`,
      );
    }
    if (editTarget?.staffName === staffName) closeEdit();
  }

  async function restoreStaffToGrid(staffName: string) {
    try {
      const d = await apiFetch<{ hidden?: { staff_name: string; hidden_by: string }[] }>(
        "/api/admin/manual-shift/hidden-staff",
        { method: "POST", body: JSON.stringify({
            city, branch_code: branchCode, staff_name: staffName, hidden: false }) });
      if (d.hidden) { setHiddenStaff(d.hidden); hiddenStaffRef.current = d.hidden.map((h) => h.staff_name); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setRemovedStaff((prev) => prev.filter((n) => n !== staffName));
    setStaffList((prev) => (prev.includes(staffName)
      ? prev : [...prev, staffName].sort((a, b) => a.localeCompare(b))));
    setGridData((prev) => ({ ...prev, [staffName]: prev[staffName] ?? {} }));
  }

  /**
   * Add somebody to the grid, from the staff register rather than by typing.
   *
   * This used to be `prompt("Enter staff name:")`. A name typed here becomes
   * the key the published row is written under, and **a shift filed under a
   * name the register does not hold reaches nobody** -- My Shift looks the
   * person up by the name on their account. Over the last 120 days fifteen
   * such names carry 175 published rows: `Bibek B K` against a register that
   * says `Bibek BK` (23 rows, still in the future), `Aris John De Ocampo`
   * against `Aris Jhon De Ocampo`, `Joanna Mae D. Saraos`, `Joven R, Bermejo
   * Jr.`, and a row simply called `NEW`.
   *
   * There is no free-text way in any more. Somebody who is not in the register
   * cannot see a shift, cannot clock in and is not paid from it, so a row for
   * them is not a schedule -- it is a note nobody reads. The dialog links to
   * where they get registered instead.
   */
  function addStaffRow() {
    setPickerOpen(true);
    setPickerQuery("");
    void loadPickerNames();
  }

  const loadPickerNames = useCallback(async () => {
    setPickerLoading(true);
    setPickerError("");
    try {
      // Two calls: this branch, then the whole city. People are rostered at a
      // branch that is not their own -- five of them last month -- so the list
      // cannot stop at the home branch, but that is the half worth showing
      // first.
      // `exclude_role=HQ` because the grid's own load excludes them: HQ is not
      // rostered at a branch, and a picker that offers who the grid deliberately
      // left out is a second rule.
      const q = `city=${city}&status=ACTIVE&exclude_role=HQ&limit=2000`;
      const [here, all] = await Promise.all([
        apiFetch<{ names?: string[] }>(
          `/api/admin/staff_master/names?${q}&home_branch=${encodeURIComponent(branchCode)}`),
        apiFetch<{ names?: string[] }>(`/api/admin/staff_master/names?${q}`),
      ]);
      const mine = new Set(here.names ?? []);
      const rows = (all.names ?? []).map((nm) => ({ name: nm, here: mine.has(nm) }));
      rows.sort((a, b) => (a.here === b.here
        ? a.name.localeCompare(b.name)
        : (a.here ? -1 : 1)));
      setPickerNames(rows);
    } catch (e: unknown) {
      // A dialog that offers nothing and says nothing is the worst of it.
      setPickerError(e instanceof Error ? e.message : String(e));
      setPickerNames([]);
    } finally {
      setPickerLoading(false);
    }
  }, [city, branchCode]);

  function chooseStaffForGrid(name: string) {
    const n = name.trim();
    if (!n) return;
    setPickerOpen(false);
    // Hidden on the server, not merely absent from this page. Adding the row
    // back without clearing that leaves it looking present and gone again on
    // the next load.
    // removedStaff is this session only; the hidden list is the server's, which
    // is what a later session sees. Checking only the first let a person hidden
    // last week be "added" and vanish again on the next load.
    if (removedStaff.includes(n) || hiddenStaffRef.current.includes(n)) { void restoreStaffToGrid(n); return; }
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
      // An edit still waiting for the clock-ins would otherwise land after the import.
      await commitChainRef.current;
      await flushOutbox();
      // Two separate refusals, each with its own question for the user: someone
      // else published this week recently, and the sheet rosters somebody on a day
      // already approved off. Either can arrive first, and answering one must not
      // silently answer the other.
      let force = false;
      let allowApprovedDayOff = false;
      let confirmWorkedCells: { staff_name: string; work_date: string }[] = [];
      const loadFromDb = () =>
        apiFetch<{ ok: boolean; rows_copied: number }>(
          "/api/admin/shifts/publish_from_base",
          {
            method: "POST",
            body: JSON.stringify({
              city, branch_code: branchCode, week_start: weekStart,
              force, allow_approved_day_off: allowApprovedDayOff, confirm_worked_cells: confirmWorkedCells,
              // An older server reads only this; the current one uses the cells when given.
              confirm_worked: confirmWorkedCells.length > 0,
            }),
          }
        );
      let res: { ok: boolean; rows_copied: number } | null = null;
      // Day off, worked days, a recent publish -- and worked days again if someone
      // clocks in meanwhile: room for each question once more.
      for (let attempt = 0; attempt < 6 && res === null; attempt += 1) {
        try {
          res = await loadFromDb();
        } catch (refused: unknown) {
          const err = refused as ApiError;
          const conflicts = err?.status === 409 && Array.isArray(err?.detail?.day_off_conflicts)
            ? (err.detail!.day_off_conflicts as DayOffConflict[])
            : [];
          if (conflicts.length > 0 && !allowApprovedDayOff) {
            const lines = conflicts.slice(0, 8).map(describeDayOffConflict).join("\n");
            const more = conflicts.length > 8 ? `\n…and ${conflicts.length - 8} more` : "";
            if (!window.confirm(
              `The imported sheet rosters somebody on a day they have already been given off `
              + `(${countDayOffConflicts(conflicts)}):\n\n${lines}${more}\n\n`
              + `OK — load anyway, because the day off no longer stands.\n`
              + `Cancel — leave the week alone and fix the sheet first.`
            )) { setError(""); return; }
            allowApprovedDayOff = true;
            continue;
          }
          const workedCells = workedCellsFrom(err);
          if (workedCells.length > 0) {
            const answer = await askWorked(workedCells.map((info) => ({
              staffName: info.staff_name, dateStr: info.work_date, info,
              before: describeCellValue(gridCellByWorkedKey(info.staff_name, info.work_date)),
              after: "as on the sheet",
            })), "import");
            if (answer !== "change") { setError(""); return; }
            confirmWorkedCells = [...confirmWorkedCells,
              ...workedCells.map((c) => ({ staff_name: c.staff_name, work_date: c.work_date }))];
            continue;
          }
          const msg = refused instanceof Error ? refused.message : String(refused);
          if (!force && /published this week/i.test(msg)) {
            if (!window.confirm(`${msg}\n\nReplace the whole week anyway?`)) {
              setError("");
              return;
            }
            force = true;
            continue;
          }
          throw refused;
        }
      }
      if (!res) { setError("Load from DB failed"); return; }
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
      // to carry over -- reload and let the overlay lie back on top. A yes given
      // against the old week no longer stands (the server took its copy back).
      confirmedWorkedRef.current.clear();
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
      setError("");
      const n = await commitCells(changes, { bulk: true });
      const kept = changes.length - n;
      if (n === 0 && kept > 0) alert(`Every day in this draft is already clocked in, so nothing was changed.`);
      if (n > 0) alert(`Loaded ${res.rows.length} draft shifts into the grid for ${labelOf(city, branchCode)}.`
        + (kept > 0 ? ` ${kept} day${kept === 1 ? "" : "s"} already clocked in kept as they were.` : "")
        + `\n\nReview and publish when ready.`);
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

  type PublishOpts = { allowApprovedDayOff?: boolean; allowCrossBranch?: boolean;
                       confirmWorkedCells?: { staff_name: string; work_date: string }[] };
  /** One publish at a time: a second click while the first waits for edits to
   *  settle used to send two publishes. */
  async function handlePublish(opts: PublishOpts = {}) {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setSaving(true);   // "Publishing..." from the click, while waiting edits settle
    try { await publishNow(opts); } finally { publishingRef.current = false; setSaving(false); }
  }

  async function publishNow(opts: PublishOpts = {}) {
    const allowApprovedDayOff = Boolean(opts.allowApprovedDayOff);
    const allowCrossBranch = Boolean(opts.allowCrossBranch);
    // The worked days the person said yes to, by name and date. A day that clocks
    // in while the question is open is asked about on the next try.
    const confirmWorkedCells = opts.confirmWorkedCells ?? [];
    setError("");
    setPublishBlockedBy([]);
    setOverlapBlockedBy([]);
    // Everything typed must be on the server before the server is asked to publish
    // it -- the browser no longer sends the week, so an unsent edit would simply
    // not be published. That includes an edit still waiting for the clock-ins.
    await commitChainRef.current;
    await flushOutbox();
    if (outboxRef.current.size > 0) {
      // Name the cells. "Some edits" sent people looking at the network when
      // the stuck entry was one cell the server would never take.
      const stuck = Array.from(outboxRef.current.values())
        .slice(0, 4)
        .map((e) => `${e.staff_name} ${e.work_date}`)
        .join(", ");
      const more = outboxRef.current.size > 4 ? ` and ${outboxRef.current.size - 4} more` : "";
      setError(
        `${outboxRef.current.size} edit${outboxRef.current.size === 1 ? "" : "s"} could not be saved, `
        + `so publishing would leave them out: ${stuck}${more}.`
        + (syncError ? ` ${syncError}` : ""),
      );
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
            allow_approved_day_off: allowApprovedDayOff,
            allow_cross_branch_overlap: allowCrossBranch,
            confirm_worked_cells: confirmWorkedCells,
            confirm_worked: confirmWorkedCells.length > 0,   // for an older server; see Load from DB
          }),
        }
      );
      if (result.export_result?.error) {
        setError(`Sheet export error: ${result.export_result.error}`);
      }
      setPublishedCount(result.rows_written);
      confirmedWorkedRef.current.clear();   // a yes was for this round of changes
      setUnpublishedCells(new Set());
      setCellEditors({});
      publishedTokenRef.current = result.published_token ?? publishedTokenRef.current;
      // The token above stops the poll from reporting this publish as a change,
      // so the published hours the worked-day question compares against would
      // stay pre-publish. Everything on the grid was just published.
      {
        const sigs: Record<string, string> = {};
        for (const [name, days] of Object.entries(gridDataRef.current)) {
          for (const [d, v] of Object.entries(days ?? {})) {
            if (v == null) continue;
            sigs[workedKey(name, d)] = workedSig(v, branchCode, city);
          }
        }
        publishedWorkedSigRef.current = { sheet: `${city}|${branchCode}|${weekStart}`, sigs };
      }
      setView("published");
      // The schedule just changed, so the workbook on Drive is now out of date.
      markNeedsExport();
      void loadExcelStatus();
      setShowExportPrompt(true);
    } catch (e: unknown) {
      const err = e as ApiError;
      const blocked = err?.status === 409 && Array.isArray(err?.detail?.day_off_conflicts)
        ? (err.detail!.day_off_conflicts as DayOffConflict[])
        : [];
      const overlaps = err?.status === 409 ? crossBranchOverlapsFrom(err?.detail) : [];
      const workedCells = workedCellsFrom(err);
      if (workedCells.length > 0) {
        // Cells saved before the day was worked, published after it was.
        const answer = await askWorked(workedCells.map((info) => ({
          staffName: info.staff_name, dateStr: info.work_date, info,
          before: "as published",
          after: describeCellValue(gridCellByWorkedKey(info.staff_name, info.work_date)),
        })), "publish");
        if (answer === "change") {
          await publishNow({ ...opts, confirmWorkedCells: [...confirmWorkedCells,
            ...workedCells.map((c) => ({ staff_name: c.staff_name, work_date: c.work_date }))] });
        } else {
          setError(`Not published. ${workedCells.slice(0, 3).map((c) => `${stripRoleSuffix(c.staff_name)} ${formatDate(c.work_date)}`).join(", ")}`
            + `${workedCells.length > 3 ? ` and ${workedCells.length - 3} more` : ""} changed before they clocked in. `
            + `Put those cells back, or publish again and choose Publish anyway.`);
        }
        return;
      }
      if (blocked.length > 0) {
        // Not an error the person caused by publishing — a day off that was
        // approved while this week was being edited. Name it, and leave the way out.
        setPublishBlockedBy(blocked);
      } else if (overlaps.length > 0) {
        dayOffWaivedRef.current = allowApprovedDayOff;
        workedWaivedRef.current = confirmWorkedCells;
        setOverlapBlockedBy(overlaps);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
      await commitChainRef.current;   // an edit still waiting would land after the discard
      await flushOutbox();
      await apiFetch("/api/admin/shifts/discard_week_cells", {
        method: "POST",
        body: JSON.stringify({ city, branch_code: branchCode, week_start: weekStart }),
      });
      confirmedWorkedRef.current.clear();
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

  // Hidden from this sheet, but still holding shifts this week. Hiding a row
  // only ever meant "do not list them here when they have nothing" -- it never
  // removed a published shift, and a shift that is published has to be visible
  // on the one screen that can change it. Otherwise this grid and everything
  // that reads the published schedule (the staff's own week, the spreadsheet,
  // next month's draft) disagree, and nothing here says why.
  const hiddenSet = useMemo(() => new Set(hiddenStaff.map((h) => h.staff_name)), [hiddenStaff]);
  // Tomorrow in the store's time -- the first day "Remove from sheet" takes
  // off. Today and earlier are days worked: they stay on the grid (attendance
  // and pay read them) and are nothing to clear.
  // Worked out on every render, not memoised on the city: a page left open
  // past the store's midnight kept yesterday's "tomorrow".
  const storeTomorrow = (() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: city === "dubai" ? "Asia/Dubai" : "Asia/Manila",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();
  const hiddenButScheduled = useMemo(
    () => staffList
      .filter((n) => hiddenSet.has(n))
      .map((n) => {
        const held = weekDates.filter((d) => cellsOf(gridData[n]?.[d]).length > 0);
        // The banner counts shifts still to come; a day off is not one.
        const work = held.filter((d) => d >= storeTomorrow && cellsOf(gridData[n]?.[d])
          .some((c) => isWorkCell(c.role, c.start_hour, c.end_hour)));
        return { name: n, any: held.length, days: work.length };
      })
      .filter((x) => x.any > 0),
    [staffList, hiddenSet, weekDates, gridData, storeTomorrow],
  );
  // Only the ones with shifts still ahead need doing anything about.
  const hiddenWithShiftsAhead = useMemo(
    () => hiddenButScheduled.filter((x) => x.days > 0),
    [hiddenButScheduled],
  );
  const gridStaff = useMemo(() => {
    const keep = new Set(hiddenButScheduled.map((x) => x.name));
    return staffList.filter((n) => !hiddenSet.has(n) || keep.has(n));
  }, [staffList, hiddenSet, hiddenButScheduled]);

  // Derive the shifts in the cell currently being edited (for delete button + segment list)
  // As last asked for: a removed segment still waiting on its question is already gone here.
  const editingCellRaw = editTarget ? (latestCell(editTarget.staffName, editTarget.dateStr) ?? null) : null;
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
          <div className="flex flex-wrap items-center gap-2">
            {/* Export writes a NEW file each time, so the month keeps its history.
                Re-export after any change here — editing the workbook does not
                come back into the system. */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-1">
              <label htmlFor="export-month"
                     className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Month
              </label>
              <input
                id="export-month"
                type="month"
                value={exportMonth}
                onChange={(e) => e.target.value && setExportMonth(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900"
              />
              {exportMonth !== publishedMonthLabel && (
                <button
                  type="button"
                  onClick={() => setExportMonth(publishedMonthLabel)}
                  className="text-[11px] text-violet-700 underline"
                  title={`Back to the month of the week on screen (${publishedMonthLabel})`}
                >
                  ↩ {publishedMonthLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={runExport}
              disabled={exporting}
              title={`Write ${exportMonthLabel} to Google Drive as a new Excel file`}
              className={`${PRIMARY_BUTTON} disabled:opacity-50`}
            >
              {exporting ? "Exporting…" : `Export Excel (${exportMonthLabel})`}
            </button>
            <a
              href={DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SECONDARY_BUTTON}
            >
              Drive folder
            </a>
            <Link href="/admin/draft" className={SECONDARY_BUTTON}>AI Draft</Link>
            <Link href="/admin" className={SECONDARY_BUTTON}>Admin Dashboard</Link>
          </div>
        </div>

        {/* Stays until the export actually happens. A message that can be waved
            away is waved away; this one has the button in it and only the
            export clears it. */}
        {(needsExport || excelStatus?.stale === true) && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-900">
                <span className="font-semibold">The Excel on Drive is out of date.</span>{" "}
                {publishedMonthLabel} changed after the last export
                {excelStatus?.stale && excelStatus.file_name
                  ? ` (${excelStatus.file_name}${excelStatus.exported_by ? `, by ${excelStatus.exported_by}` : ""})`
                  : ""}
                {excelStatus?.stale && (excelStatus.changed_branches?.length ?? 0) > 0
                  ? ` — ${excelStatus.changed_branches!.join(", ")}`
                  : ""}
                . Export again, and post the new schedule image where the stores look — the one already
                posted still shows the old shifts.
              </p>
              <button
                type="button"
                onClick={runExport}
                disabled={exporting}
                className={`${PRIMARY_BUTTON} disabled:opacity-50`}
              >
                {exporting ? "Exporting…" : "Export now"}
              </button>
            </div>
          </div>
        )}

        {(exportResult || exportError) && (
          <div className={`${W_CARD} px-5 py-3 text-sm`}>
            {exportError ? (
              <p className="text-red-600">{exportError}</p>
            ) : exportResult ? (
              <p className="text-gray-700">
                Saved{" "}
                <a href={exportResult.url} target="_blank" rel="noopener noreferrer"
                   className="font-semibold text-violet-700 underline">
                  {exportResult.name}
                </a>{" "}
                to the Drive folder — version {exportResult.version}, {exportResult.shiftDays} shift days.
                <span className="ml-2 text-xs text-gray-500">
                  Editing that file does not change this page. Export again after any change here.
                </span>
              </p>
            ) : null}
            {exportResult && exportResult.notShown.length > 0 && (
              /* The workbook says this too, on its GUIDE tab. It is repeated here
                 because the person who exports may never open the file. */
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-900">
                  {exportResult.notShown.length} item(s) could not be drawn in the grid:
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                  {exportResult.notShown.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* What happened, and the two things anyone wants next: open this file, or
            go and look at the folder. Shown after the export rather than before,
            so the answer is about a file that exists. */}
        {/* Who to add to the week. The register is the only way in — a name
            typed by hand becomes a row nobody can see. */}
        {pickerOpen && (
          <ModalScrim className="bg-black/40">
            <div className="mx-auto my-4 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
                 role="dialog" aria-modal="true" aria-labelledby="add-staff-title">
              <h2 id="add-staff-title" className="text-lg font-semibold text-gray-900">
                Add staff to this week
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {labelOf(city, branchCode)} · week of {weekStart}
              </p>

              <input
                autoFocus
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search a name…"
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-indigo-400"
              />

              {pickerLoading && <p className="mt-3 text-sm text-gray-500">Loading the staff list…</p>}
              {pickerError && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="text-xs text-rose-700">{pickerError}</p>
                  <button type="button" onClick={() => void loadPickerNames()}
                          className="mt-1 text-xs font-semibold text-rose-700 underline">
                    Try again
                  </button>
                </div>
              )}

              {!pickerLoading && !pickerError && (() => {
                const q = pickerQuery.trim().toLowerCase();
                const shown = pickerNames.filter((r) => !q || r.name.toLowerCase().includes(q));
                if (!shown.length) {
                  return (
                    <p className="mt-4 text-sm text-gray-600">
                      {pickerNames.length
                        ? <>Nobody in {city === "manila" ? "Manila" : "Dubai"} matches “{pickerQuery.trim()}”.</>
                        : <>No active staff found for {city === "manila" ? "Manila" : "Dubai"}.</>}
                    </p>
                  );
                }
                return (
                  <div className="mt-3 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-gray-100">
                    {shown.map((r, i) => {
                      // A hidden person can still be listed (a red row with shifts left), so
                      // "on the grid" means shown and not hidden -- else they read as already
                      // there and could not be put back from here.
                      const hidden = removedStaff.includes(r.name) || hiddenSet.has(r.name);
                      const onGrid = gridStaff.includes(r.name) && !hidden;
                      const prevHere = i > 0 ? shown[i - 1].here : null;
                      return (
                        <div key={r.name}>
                          {(i === 0 || prevHere !== r.here) && (
                            <p className="bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                              {r.here ? labelOf(city, branchCode) : "Other branches"}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={onGrid}
                            onClick={() => chooseStaffForGrid(r.name)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition ${
                              onGrid ? "cursor-default text-gray-300"
                                     : "text-gray-800 hover:bg-indigo-50"}`}
                          >
                            <span>{r.name}</span>
                            {onGrid && <span className="text-[11px] text-gray-400">already on the grid</span>}
                            {hidden && <span className="text-[11px] text-amber-600">hidden — put back</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                Somebody missing? They have to be on the{" "}
                <Link href="/admin/staff" className="font-semibold text-violet-700 underline">
                  Staff page
                </Link>{" "}
                first. A shift filed under a name the register does not hold does not
                reach the person — it will not show in their My Shift and they cannot
                clock in against it.
              </p>

              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => setPickerOpen(false)} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
          </ModalScrim>
        )}

        {showExportDone && exportResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
               role="dialog" aria-modal="true" aria-labelledby="export-done-title">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 id="export-done-title" className="text-lg font-semibold text-gray-900">
                Saved to the Drive folder
              </h2>
              <p className="mt-2 break-all text-sm font-semibold text-gray-800">
                {exportResult.name}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Version {exportResult.version} · {exportResult.shiftDays} shift days ·
                nothing already in the folder was overwritten.
              </p>

              {exportResult.notShown.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-900">
                    {exportResult.notShown.length} item(s) could not be drawn in the grid:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                    {exportResult.notShown.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              <p className="mt-4 text-sm text-gray-700">Open the Excel now?</p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setShowExportDone(false)}
                        className={SECONDARY_BUTTON}>
                  No
                </button>
                {/* A real link, not window.open — a popup blocker cannot eat it. */}
                <a href={exportResult.url} target="_blank" rel="noopener noreferrer"
                   onClick={() => setShowExportDone(false)}
                   className={PRIMARY_BUTTON}>
                  Yes, open it
                </a>
              </div>
              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                Every version of every month is in the{" "}
                <a href={DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer"
                   className="font-semibold text-violet-700 underline">
                  Drive folder
                </a>.
              </p>
            </div>
          </div>
        )}

        {showExportPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
               role="dialog" aria-modal="true" aria-labelledby="export-prompt-title">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 id="export-prompt-title" className="text-lg font-semibold text-gray-900">
                Published — export the Excel?
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                The schedule for {publishedMonthLabel} has changed. The workbook in the Drive folder
                still shows the previous version, and the stores work from that file.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Exporting writes a new version — nothing already in the folder is overwritten.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExportPrompt(false)}
                  className={SECONDARY_BUTTON}
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={runExport}
                  disabled={exporting}
                  className={`${PRIMARY_BUTTON} disabled:opacity-50`}
                >
                  {exporting ? "Exporting…" : "Export now"}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                “Not now” keeps the reminder on the page until the export is done.
              </p>
            </div>
          </div>
        )}

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
                  // Same order as the week-change load: the hidden list first, or
                  // this first load showed hidden rows as ordinary ones and only a
                  // week change applied it.
                  await loadHiddenStaff();
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
                {gridStaff.length} staff · {labelOf(city, branchCode)} · Week of {weekStart}
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

            {/* Who is off this sheet, and how to put them back. The old removal
                undid itself on the next week change, which made an accidental
                delete recoverable by luck. Now the removal holds, so the way
                back has to be visible instead. */}
            {hiddenStaff.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
                  <span className="font-semibold">
                    {hiddenStaff.length} removed from the {branchCode} sheet
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHidden((v) => !v)}
                    className="rounded border border-amber-300 bg-white px-2 py-0.5 text-amber-800 hover:bg-amber-100"
                  >
                    {showHidden ? "Hide" : "Show"}
                  </button>
                  <span className="text-amber-700/70">
                    They stay off this sheet until you put them back. Their other sheets are unaffected.
                  </span>
                </div>
                {showHidden && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hiddenStaff.map((h) => (
                      <button
                        key={h.staff_name}
                        type="button"
                        onClick={() => void restoreStaffToGrid(h.staff_name)}
                        title={h.hidden_by ? `Removed by ${h.hidden_by}` : undefined}
                        className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
                      >
                        {stripRoleSuffix(h.staff_name)} ↩ put back
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hiddenWithShiftsAhead.length > 0 && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900">
                <div className="font-semibold">
                  Removed from the {branchCode} sheet, but still scheduled here from {storeTomorrow}:
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {hiddenWithShiftsAhead.map((x) => (
                    <span key={x.name}>
                      <strong>{stripRoleSuffix(x.name)}</strong> — {x.days} day{x.days === 1 ? "" : "s"}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-red-800/80">
                  Published shifts still show on their own schedule and on the spreadsheet.
                  Use 🗑 on their row to take them off from tomorrow, or put them back on the sheet if they still work here.
                </div>
              </div>
            )}

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
                    {gridStaff.map((name, idx) => (
                      <tr key={name} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-3 py-2 text-xs font-medium text-gray-700">
                          <div className="flex items-center justify-between gap-1">
                            <span>
                              {stripRoleSuffix(name)}
                              {hiddenSet.has(name) && (
                                <span
                                  className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700"
                                  title="Removed from this sheet, but these shifts are still published"
                                >
                                  removed
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              title="Delete all shifts for this staff member"
                              onClick={() => deleteStaffFromGrid(name)}
                              disabled={removingStaff !== null}
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
                          const publishedIsAlreadyDayOff = normalizedShifts.length === 1 && normalizedShifts[0].role === "DAY_OFF";
                          const hasApprovedDayOff = approvedDayOffs.has(`${name}|${d}`);
                          // The badge stands in for an empty cell, never over a
                          // published one. It used to override whatever was
                          // published, so Joanna Mae Saraos read "Day Off
                          // approved" on 2026-09-01 while 9:00-18:00 was live and
                          // showing on her own My Shift — the manager who had
                          // just set it could not see that it had worked, and
                          // would not have expected her in.
                          const isApprovedDayOff = hasApprovedDayOff && normalizedShifts.length === 0;
                          // Still worth saying: an approved day-off nobody has
                          // applied to this cell yet. Shown beside the shift
                          // rather than instead of it.
                          const dayOffPending = hasApprovedDayOff && normalizedShifts.length > 0 && !publishedIsAlreadyDayOff;
                          // The staff member's own request, against this cell.
                          // Rose above the sheet-sync proposal because it is the
                          // one somebody is waiting on an answer to.
                          const conflict = normalizedShifts.length > 0 && !publishedIsAlreadyDayOff
                            ? dayOffConflicts.get(`${name}|${d}`)
                            : undefined;
                          const workedHere = worked.get(workedKey(name, d));
                          return (
                            <td key={d} className={"relative px-1 py-1 text-center align-top" + (workedHere ? " bg-emerald-50/70" : "")}>
                              {workedHere && (
                                <span
                                  title={`${stripRoleSuffix(name)} ${workedHere.working ? "is working now" : "has worked this day"}${workedHere.check_in ? ` (clocked in ${workedHere.check_in})` : ""}. Changing this day asks you first.`}
                                  className={"pointer-events-none absolute bottom-0 right-0.5 z-10 rounded px-1 text-[8px] font-bold "
                                    + (workedHere.working ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800")}
                                >
                                  {workedLabel(workedHere)}
                                </span>
                              )}
                              {conflict ? (
                                <span
                                  title={conflict === "approved_but_rostered"
                                    ? "This day off was approved and the roster still has them working. Approving does not move the shift — change the cell."
                                    : "This day off has been asked for and not answered yet. The roster still has them working."}
                                  className={"absolute left-1 top-0.5 z-10 rounded px-1 text-[8px] font-bold uppercase tracking-wide "
                                    + (conflict === "approved_but_rostered"
                                      ? "bg-rose-500 text-white"
                                      : "bg-amber-400/90 text-amber-950")}
                                >
                                  {conflict === "approved_but_rostered" ? "day off approved" : "day off asked"}
                                </span>
                              ) : dayOffPending && (
                                <span
                                  title="An approved Day Off request exists for this day, but the published schedule below is what the staff member sees. Change the cell if the day off should apply."
                                  className="absolute left-1 top-0.5 z-10 rounded bg-amber-400/90 px-1 text-[8px] font-bold uppercase tracking-wide text-amber-950"
                                >
                                  day off req
                                </span>
                              )}
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
                  + Add staff to this week
                </button>
              </div>
            </div>

            {/* A day off was approved for somebody this week still has a shift on. */}
            {publishBlockedBy.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-700">
                  Not published — already given off ({countDayOffConflicts(publishBlockedBy)})
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {publishBlockedBy.map((c, i) => (
                    <p key={`pb${i}`} className="text-xs text-rose-700/90">
                      {describeDayOffConflict(c)}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs text-rose-600/80">
                  Set those cells to Day Off and publish again — nothing has been published yet,
                  so the rest of your changes are still here.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishBlockedBy([])}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Let me fix the cells
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePublish({ allowApprovedDayOff: true })}
                    disabled={saving}
                    className="rounded-lg border border-rose-400 bg-rose-100 px-3 py-1.5 text-xs text-rose-700 transition hover:bg-rose-200 disabled:opacity-50"
                  >
                    {saving ? "Publishing…" : "Publish anyway — the day off no longer stands"}
                  </button>
                </div>
              </div>
            )}

            {overlapBlockedBy.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-700">
                  Not published — already working at another branch ({overlapBlockedBy.length})
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {overlapBlockedBy.map((o, i) => (
                    <p key={`ob${i}`} className="text-xs text-rose-700/90">
                      {describeCrossBranchOverlap(o)}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs text-rose-600/80">
                  Moving someone here does not take them off the other branch. Remove those shifts on
                  the other branch&apos;s sheet first, or clear them here. Nothing has been published yet,
                  so the rest of your changes are still here.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOverlapBlockedBy([])}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Let me fix it
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePublish({
                      allowApprovedDayOff: dayOffWaivedRef.current,
                      allowCrossBranch: true,
                      confirmWorkedCells: workedWaivedRef.current,
                    })}
                    disabled={saving}
                    className="rounded-lg border border-rose-400 bg-rose-100 px-3 py-1.5 text-xs text-rose-700 transition hover:bg-rose-200 disabled:opacity-50"
                  >
                    {saving ? "Publishing…" : "Publish anyway — they really work both"}
                  </button>
                </div>
              </div>
            )}

            {/* Publish footer */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handlePublish()}
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

      {workedAsk && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="worked-ask-title">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="worked-ask-title" className="text-base font-bold text-gray-900">
              {workedAsk.items.length === 1
                ? `${stripRoleSuffix(workedAsk.items[0].staffName)} has already clocked in on this day`
                : `${workedAsk.items.length} of these days are already clocked in`}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {workedAsk.mode === "replay"
                ? "These changes were waiting to be saved. Late, early and pay for these days are measured against this schedule."
                : workedAsk.mode === "publish"
                ? "These changes were saved without this question, and publishing applies them now. Late, early and pay for these days are measured against this schedule."
                : workedAsk.mode === "import"
                ? "Loading from DB replaces these days with the imported sheet. Late, early and pay for these days are measured against this schedule."
                : "Late, early and pay for this day are measured against this schedule. Check it is the day you meant."}
            </p>
            <ul className="mt-3 space-y-2">
              {workedAsk.items.slice(0, 20).map((it) => (
                <li key={`${it.staffName}|${it.dateStr}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-gray-900">{stripRoleSuffix(it.staffName)} · {formatDate(it.dateStr)}</div>
                  <div className="text-emerald-800">{workedDetail(it.info)}</div>
                  <div className="text-gray-700">{it.before} → <span className="font-semibold">{it.after}</span></div>
                </li>
              ))}
              {workedAsk.items.length > 20 && <li className="text-xs text-gray-500">and {workedAsk.items.length - 20} more</li>}
            </ul>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {workedAsk.mode === "bulk" ? (
                <>
                  <button type="button" onClick={() => answerWorked("change")} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Overwrite them too</button>
                  <button type="button" autoFocus onClick={() => answerWorked("skip")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Keep worked days as they are</button>
                </>
              ) : (
                <>
                  <button type="button" autoFocus onClick={() => answerWorked("cancel")} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    {workedAsk.mode === "replay" ? "Discard these changes" : "Cancel"}
                  </button>
                  <button type="button" onClick={() => answerWorked("change")} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                    {workedAsk.mode === "publish" ? "Publish anyway" : workedAsk.mode === "import" ? "Load anyway" : "Change anyway"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

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
