"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  X,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type DraftRow = {
  id: string;
  work_date: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
  source?: string;
  updated_at?: string;
};

type Props = {
  rows: DraftRow[];
  month: string; // "YYYY-MM"
  versionId: string;
  loading?: boolean;
  onUpdateRow: (id: string, fields: {
    work_date: string;
    staff_name: string;
    role: string;
    start_hour: number;
    end_hour: number;
  }) => Promise<void>;
  onDeleteRow: (id: string) => Promise<void>;
  onAddRow: (date: string, staffName: string, role: string, startHour: number, endHour: number) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HOURS = Array.from({ length: 22 }, (_, i) => i + 8); // 8..29

function fmtHourLabel(h: number): string {
  if (h >= 24) return `${String(h - 24).padStart(2, "0")}+`;
  return String(h).padStart(2, "0");
}

function fmtShift(s: number, e: number): string {
  const fh = (h: number) => {
    if (h >= 24) return `${String(h - 24).padStart(2, "0")}(+1)`;
    return String(h).padStart(2, "0");
  };
  return `${fh(s)}–${fh(e)}`;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_COLORS: Record<number, string> = {
  0: "text-rose-400",   // Sun
  5: "text-amber-400",  // Fri
  6: "text-rose-400",   // Sat
};

// ---------------------------------------------------------------------------
// Role → color
// ---------------------------------------------------------------------------
function roleBarColor(staffName: string, role: string): string {
  const s = `${staffName} ${role}`.toUpperCase();
  if (s.includes("PIC") || s.includes("(L)")) return "bg-violet-500";
  if (s.includes("(S)"))  return "bg-sky-500";
  if (s.includes("(N)"))  return "bg-amber-500";
  if (s.includes("(R)"))  return "bg-rose-500";
  return "bg-slate-500";
}

function roleBadgeCls(staffName: string, role: string): string {
  const s = `${staffName} ${role}`.toUpperCase();
  if (s.includes("PIC") || s.includes("(L)")) return "bg-violet-500/20 text-violet-300";
  if (s.includes("(S)"))  return "bg-sky-500/20 text-sky-300";
  if (s.includes("(N)"))  return "bg-amber-500/20 text-amber-300";
  if (s.includes("(R)"))  return "bg-rose-500/20 text-rose-300";
  return "bg-slate-500/20 text-slate-300";
}

function shortRole(staffName: string, role: string): string {
  if (role && role.trim()) return role.trim();
  const s = staffName.toUpperCase();
  if (s.includes("PIC")) return "PIC";
  if (s.includes("(L)")) return "L";
  if (s.includes("(S)")) return "S";
  if (s.includes("(N)")) return "N";
  if (s.includes("(R)")) return "R";
  return "";
}

// ---------------------------------------------------------------------------
// Headcount per hour
// ---------------------------------------------------------------------------
function computeHeadcount(rows: DraftRow[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const h of HOURS) counts[h] = 0;
  for (const r of rows) {
    for (let h = Math.max(r.start_hour, 8); h < Math.min(r.end_hour, 30); h++) {
      if (h in counts) counts[h]++;
    }
  }
  return counts;
}

function headcountCellStyle(count: number, maxCount: number): string {
  if (count === 0) return "text-zinc-700";
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio >= 0.8) return "text-emerald-300 font-bold";
  if (ratio >= 0.5) return "text-emerald-400 font-semibold";
  return "text-emerald-500";
}

// ---------------------------------------------------------------------------
// Week utilities
// ---------------------------------------------------------------------------
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function mondayOf(dateStr: string): string {
  const d = parseDate(dateStr);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}
function weekDates(mondayStr: string): string[] {
  const out: string[] = [];
  const d = parseDate(mondayStr);
  for (let i = 0; i < 7; i++) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function addWeeks(mondayStr: string, n: number): string {
  const d = parseDate(mondayStr);
  d.setDate(d.getDate() + n * 7);
  return isoDate(d);
}
function monthDates(month: string): string[] {
  const out: string[] = [];
  const start = parseDate(`${month}-01`);
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = new Date(y, m, 1);
  while (d.getMonth() === m) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function firstWeekOfMonth(month: string): string {
  return mondayOf(`${month}-01`);
}

// Hour options for dropdowns (8..30)
const HOUR_OPTIONS = Array.from({ length: 23 }, (_, i) => i + 8); // 8..30

function fmtHourOpt(h: number): string {
  if (h >= 24) return `${String(h - 24).padStart(2, "0")}:00 (+1)`;
  return `${String(h).padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------
// Single shift row component
// ---------------------------------------------------------------------------
function ShiftRow({
  row,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  busy,
}: {
  row: DraftRow;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (start: number, end: number, staffName: string, role: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [editStart, setEditStart] = useState(row.start_hour);
  const [editEnd,   setEditEnd]   = useState(row.end_hour);
  const [editStaff, setEditStaff] = useState(row.staff_name);
  const [editRole,  setEditRole]  = useState(row.role || "");

  function handleStartEdit() {
    setEditStart(row.start_hour);
    setEditEnd(row.end_hour);
    setEditStaff(row.staff_name);
    setEditRole(row.role || "");
    onStartEdit();
  }

  const barColor = roleBarColor(row.staff_name, row.role);
  const badge    = roleBadgeCls(row.staff_name, row.role);
  const roleShort = shortRole(row.staff_name, row.role);

  return (
    <tr className={`group transition-colors ${isEditing ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}>
      {/* Staff name — sticky */}
      <td className="sticky left-0 z-10 max-w-[148px] min-w-[120px] bg-[#141428] px-3 py-1.5 text-xs font-medium text-white group-hover:bg-[#1a1a38]">
        <span className="block truncate" title={row.staff_name}>{row.staff_name}</span>
      </td>

      {/* Role badge */}
      <td className="min-w-[38px] px-1 py-1.5 text-center">
        {roleShort && (
          <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${badge}`}>{roleShort}</span>
        )}
      </td>

      {/* Hour cells */}
      {isEditing ? (
        /* Edit mode: span all hour columns with controls */
        <td colSpan={HOURS.length} className="px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-400">Start</span>
              <select
                value={editStart}
                onChange={(e) => setEditStart(Number(e.target.value))}
                className="h-7 rounded border border-white/20 bg-[#1e1e32] px-1 text-xs text-white"
              >
                {HOUR_OPTIONS.filter((h) => h < editEnd).map((h) => (
                  <option key={h} value={h}>{fmtHourOpt(h)}</option>
                ))}
              </select>
            </div>
            <span className="text-zinc-600">→</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-400">End</span>
              <select
                value={editEnd}
                onChange={(e) => setEditEnd(Number(e.target.value))}
                className="h-7 rounded border border-white/20 bg-[#1e1e32] px-1 text-xs text-white"
              >
                {HOUR_OPTIONS.filter((h) => h > editStart).map((h) => (
                  <option key={h} value={h}>{fmtHourOpt(h)}</option>
                ))}
              </select>
            </div>
            {/* Preview bar */}
            <div className="flex h-5 flex-1 overflow-hidden rounded-sm bg-white/5" style={{ minWidth: 80 }}>
              {HOURS.map((h) => {
                const on = h >= editStart && h < editEnd;
                return (
                  <div key={h} className={`h-full flex-1 ${on ? barColor : ""}`} />
                );
              })}
            </div>
            <span className="min-w-[68px] text-[11px] font-mono text-sky-300">
              {fmtShift(editStart, editEnd)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={editStaff}
              onChange={(e) => setEditStaff(e.target.value)}
              className="h-6 w-32 rounded border border-white/15 bg-[#1e1e32] px-1.5 text-xs text-white"
              placeholder="Staff name"
            />
            <input
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="h-6 w-16 rounded border border-white/15 bg-[#1e1e32] px-1.5 text-xs text-white"
              placeholder="Role"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave(editStart, editEnd, editStaff, editRole)}
              className="flex h-6 items-center gap-1 rounded bg-emerald-600/80 px-2 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Save
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex h-6 items-center gap-1 rounded bg-white/8 px-2 text-[11px] text-zinc-400 hover:bg-white/12"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </td>
      ) : (
        /* Display mode: colored cells */
        HOURS.map((h) => {
          const on = h >= row.start_hour && h < row.end_hour;
          const isStart = h === row.start_hour;
          const isEnd   = h === row.end_hour - 1;
          return (
            <td key={h} className="p-0" style={{ width: 28, minWidth: 28 }}>
              {on ? (
                <button
                  type="button"
                  title={`Edit: ${fmtShift(row.start_hour, row.end_hour)}`}
                  onClick={handleStartEdit}
                  className={`
                    h-6 w-full transition-opacity hover:opacity-80
                    ${barColor}
                    ${isStart ? "rounded-l-sm" : ""}
                    ${isEnd   ? "rounded-r-sm" : ""}
                    opacity-80
                  `}
                />
              ) : (
                <div className="h-6 w-full" />
              )}
            </td>
          );
        })
      )}

      {/* Shift label */}
      {!isEditing && (
        <td className="min-w-[72px] px-2 py-1.5 font-mono text-[11px] text-zinc-300">
          {fmtShift(row.start_hour, row.end_hour)}
        </td>
      )}

      {/* Actions */}
      {!isEditing && (
        <td className="px-1 py-1.5">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={handleStartEdit}
              title="Edit"
              className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-violet-400"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12l-9 9L2 14l.38-2.62 9-9z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              disabled={busy}
              className="rounded p-1 text-zinc-600 hover:bg-white/10 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add-row mini form
// ---------------------------------------------------------------------------
function AddRowForm({
  date: _date, // eslint-disable-line @typescript-eslint/no-unused-vars
  staffOptions,
  onAdd,
  onClose,
  busy,
}: {
  date: string;
  staffOptions: string[];
  onAdd: (staffName: string, role: string, start: number, end: number) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [staff,  setStaff]  = useState(staffOptions[0] || "");
  const [role,   setRole]   = useState("");
  const [start,  setStart]  = useState(9);
  const [end,    setEnd]    = useState(18);

  return (
    <tr className="border-t border-dashed border-white/10 bg-sky-500/5">
      <td className="sticky left-0 z-10 bg-[#141428] px-3 py-2" colSpan={2}>
        <span className="text-[10px] font-semibold text-sky-400">Add</span>
      </td>
      <td colSpan={HOURS.length + 2} className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {staffOptions.length > 0 ? (
            <select
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className="h-7 rounded border border-white/15 bg-[#1e1e32] px-1.5 text-xs text-white"
            >
              {staffOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">(Enter manually)</option>
            </select>
          ) : (
            <input
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              placeholder="Staff name"
              className="h-7 w-36 rounded border border-white/15 bg-[#1e1e32] px-1.5 text-xs text-white"
            />
          )}
          {staff === "__custom__" && (
            <input
              value=""
              onChange={(e) => setStaff(e.target.value)}
              placeholder="Type staff name"
              autoFocus
              className="h-7 w-36 rounded border border-sky-500/40 bg-[#1e1e32] px-1.5 text-xs text-white"
            />
          )}
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="h-7 w-16 rounded border border-white/15 bg-[#1e1e32] px-1.5 text-xs text-white"
          />
          <select
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="h-7 rounded border border-white/15 bg-[#1e1e32] px-1 text-xs text-white"
          >
            {HOUR_OPTIONS.filter((h) => h < end).map((h) => (
              <option key={h} value={h}>{fmtHourOpt(h)}</option>
            ))}
          </select>
          <span className="text-zinc-600 text-xs">→</span>
          <select
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="h-7 rounded border border-white/15 bg-[#1e1e32] px-1 text-xs text-white"
          >
            {HOUR_OPTIONS.filter((h) => h > start).map((h) => (
              <option key={h} value={h}>{fmtHourOpt(h)}</option>
            ))}
          </select>
          <span className="font-mono text-[11px] text-sky-300">{fmtShift(start, end)}</span>
          <button
            type="button"
            disabled={busy || !staff.trim() || staff === "__custom__"}
            onClick={() => onAdd(staff.trim(), role.trim(), start, end)}
            className="flex h-7 items-center gap-1 rounded bg-sky-600/80 px-2.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Add
          </button>
          <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Day section
// ---------------------------------------------------------------------------
function DaySection({
  date,
  rows,
  staffOptions,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  busy,
}: {
  date: string;
  rows: DraftRow[];
  staffOptions: string[];
  onUpdateRow: Props["onUpdateRow"];
  onDeleteRow: Props["onDeleteRow"];
  onAddRow: (date: string, staffName: string, role: string, start: number, end: number) => Promise<void>;
  busy: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd,   setShowAdd]   = useState(false);

  const headcount  = useMemo(() => computeHeadcount(rows), [rows]);
  const maxCount   = useMemo(() => Math.max(...Object.values(headcount), 1), [headcount]);

  const d    = parseDate(date);
  const dow  = d.getDay();
  const label = `${DOW_LABELS[dow]} ${date.slice(5).replace("-", "/")}`;

  const handleSave = useCallback(async (
    row: DraftRow,
    start: number,
    end: number,
    staffName: string,
    role: string,
  ) => {
    await onUpdateRow(row.id, {
      work_date: row.work_date,
      staff_name: staffName,
      role,
      start_hour: start,
      end_hour: end,
    });
    setEditingId(null);
  }, [onUpdateRow]);

  const handleAdd = useCallback(async (
    staffName: string, role: string, start: number, end: number
  ) => {
    await onAddRow(date, staffName, role, start, end);
    setShowAdd(false);
  }, [date, onAddRow]);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-[#141428]">
      {/* Day header */}
      <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${DOW_COLORS[dow] || "text-white"}`}>{label}</span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Users className="h-3 w-3" />
            {rows.length} shift{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd((v) => !v); setEditingId(null); }}
          className="flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Shift
        </button>
      </div>

      {/* Timeline table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ tableLayout: "fixed", minWidth: "max-content" }}>
          {/* Column group for widths */}
          <colgroup>
            <col style={{ width: 148 }} /> {/* staff name */}
            <col style={{ width: 38 }}  /> {/* role */}
            {HOURS.map((h) => <col key={h} style={{ width: 28 }} />)}
            <col style={{ width: 80 }}  /> {/* label */}
            <col style={{ width: 56 }}  /> {/* actions */}
          </colgroup>

          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-white/8 bg-[#141428] px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Staff
              </th>
              <th className="border-b border-white/8 bg-[#141428] px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Role
              </th>
              {HOURS.map((h) => (
                <th
                  key={h}
                  className={`border-b border-white/8 bg-[#141428] py-1.5 text-center text-[9px] font-medium ${h >= 24 ? "text-zinc-600" : "text-zinc-500"}`}
                >
                  {fmtHourLabel(h)}
                </th>
              ))}
              <th className="border-b border-white/8 bg-[#141428] px-2 py-1.5 text-left text-[10px] font-semibold text-zinc-500">
                Hours
              </th>
              <th className="border-b border-white/8 bg-[#141428]" />
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HOURS.length + 4} className="px-4 py-4 text-center text-xs text-zinc-600">
                  No shifts for this day yet
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ShiftRow
                  key={row.id}
                  row={row}
                  isEditing={editingId === row.id}
                  onStartEdit={() => setEditingId(row.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(start, end, staffName, role) => handleSave(row, start, end, staffName, role)}
                  onDelete={() => { void onDeleteRow(row.id); }}
                  busy={busy}
                />
              ))
            )}

            {/* Add row form */}
            {showAdd && (
              <AddRowForm
                date={date}
                staffOptions={staffOptions}
                onAdd={handleAdd}
                onClose={() => setShowAdd(false)}
                busy={busy}
              />
            )}
          </tbody>

          {/* Headcount footer */}
          <tfoot>
            <tr className="border-t border-white/8 bg-white/[0.015]">
              <td className="sticky left-0 z-10 bg-[#141428] px-3 py-1.5 text-[10px] font-semibold text-zinc-500">
                Count
              </td>
              <td /> {/* role col */}
              {HOURS.map((h) => {
                const cnt = headcount[h] ?? 0;
                return (
                  <td key={h} className="py-1.5 text-center">
                    <span className={`text-[10px] tabular-nums ${headcountCellStyle(cnt, maxCount)}`}>
                      {cnt > 0 ? cnt : ""}
                    </span>
                  </td>
                );
              })}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: ShiftScheduleView
// ---------------------------------------------------------------------------
export default function ShiftScheduleView({
  rows,
  month,
  versionId: _unusedVersionId, // eslint-disable-line @typescript-eslint/no-unused-vars
  loading = false,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
}: Props) {
  const [weekStart, setWeekStart] = useState<string>(() => firstWeekOfMonth(month));
  const [busy, setBusy] = useState(false);

  // All dates in current month
  const allMonthDates = useMemo(() => new Set(monthDates(month)), [month]);

  // Current week's dates — only show dates within the month
  const currentWeekDates = useMemo(
    () => weekDates(weekStart).filter((d) => allMonthDates.has(d)),
    [weekStart, allMonthDates]
  );

  // Rows grouped by date
  const byDate = useMemo(() => {
    const m = new Map<string, DraftRow[]>();
    for (const r of [...rows].sort((a, b) => a.start_hour - b.start_hour)) {
      if (!m.has(r.work_date)) m.set(r.work_date, []);
      m.get(r.work_date)!.push(r);
    }
    return m;
  }, [rows]);

  // Unique staff names for dropdown
  const staffOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.staff_name).filter(Boolean))).sort(),
    [rows]
  );

  // Week navigation
  function prevWeek() { setWeekStart((w) => addWeeks(w, -1)); }
  function nextWeek() { setWeekStart((w) => addWeeks(w, +1)); }

  // All weeks in month for quick jump
  const monthWeekStarts = useMemo(() => {
    const s = new Set<string>();
    for (const d of monthDates(month)) s.add(mondayOf(d));
    return Array.from(s).sort();
  }, [month]);

  const weekLabel = useMemo(() => {
    const dates = currentWeekDates;
    if (!dates.length) return "";
    const first = dates[0];
    const last  = dates[dates.length - 1];
    return `${first.slice(5).replace("-", "/")} – ${last.slice(5).replace("-", "/")}`;
  }, [currentWeekDates]);

  const totalShifts = useMemo(
    () => currentWeekDates.reduce((s, d) => s + (byDate.get(d)?.length ?? 0), 0),
    [currentWeekDates, byDate]
  );

  // Wrap callbacks with busy state
  const handleUpdate = useCallback(async (
    id: string,
    fields: Parameters<Props["onUpdateRow"]>[1]
  ) => {
    setBusy(true);
    try { await onUpdateRow(id, fields); } finally { setBusy(false); }
  }, [onUpdateRow]);

  const handleDelete = useCallback(async (id: string) => {
    setBusy(true);
    try { await onDeleteRow(id); } finally { setBusy(false); }
  }, [onDeleteRow]);

  const handleAdd = useCallback(async (
    date: string, staffName: string, role: string, start: number, end: number
  ) => {
    setBusy(true);
    try { await onAddRow(date, staffName, role, start, end); } finally { setBusy(false); }
  }, [onAddRow]);

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            disabled={loading || busy}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-white">
            {weekLabel || "Select week"}
          </span>
          <button
            type="button"
            onClick={nextWeek}
            disabled={loading || busy}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {(loading || busy) && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          )}
        </div>

        {/* Week quick jump */}
        <div className="flex flex-wrap gap-1">
          {monthWeekStarts.map((ws, i) => (
            <button
              key={ws}
              type="button"
              onClick={() => setWeekStart(ws)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                ws === weekStart
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 bg-white/3 text-zinc-400 hover:border-white/20 hover:text-white"
              }`}
            >
              Week {i + 1}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="text-xs text-zinc-500">
          {totalShifts} shift{totalShifts !== 1 ? "s" : ""} / {currentWeekDates.length} day{currentWeekDates.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* No data state */}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] py-10 text-center text-sm text-zinc-500">
          このブランチのドラフトデータがありません。先にドラフトを生成してください。
        </div>
      )}

      {/* Day sections */}
      {currentWeekDates.map((date) => (
        <DaySection
          key={date}
          date={date}
          rows={byDate.get(date) || []}
          staffOptions={staffOptions}
          onUpdateRow={handleUpdate}
          onDeleteRow={handleDelete}
          onAddRow={handleAdd}
          busy={busy}
        />
      ))}

      {/* Instruction hint */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-center text-[11px] text-zinc-600">
        💡 Click a shift bar to edit its time. Press &ldquo;Save&rdquo; to apply changes immediately.
      </div>
    </div>
  );
}
