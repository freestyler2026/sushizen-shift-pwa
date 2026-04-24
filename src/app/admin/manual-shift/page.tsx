// src/app/admin/manual-shift/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type ShiftCell = { start_hour: number; end_hour: number; role: string };
type GridData = Record<string, Record<string, ShiftCell | null>>; // staffName → dateStr → cell
type EditTarget = { staffName: string; dateStr: string } | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ["CK", "SV", "BA", "HK", "SC", "MGR", "ADMIN", "DRIVER", "TRAINEE"];
const HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => i + 6); // 6..24

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

function todayMonday(): string {
  return mondayOf(new Date().toISOString().slice(0, 10));
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
  return text ? JSON.parse(text) : {};
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ManualShiftPage() {
  const auth = useMemo(() => getAuth(), []);

  const [city, setCity] = useState<City>((auth?.city as City) || "dubai");
  const [branchCode, setBranchCode] = useState(() => BRANCHES[(auth?.city as City) || "dubai"][0].code);
  const [weekStart, setWeekStart] = useState(todayMonday);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [gridData, setGridData] = useState<GridData>({});
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editStart, setEditStart] = useState(9);
  const [editEnd, setEditEnd] = useState(17);
  const [editRole, setEditRole] = useState("CK");
  const [editCustomRole, setEditCustomRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      // Seed grid rows for new names
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
      // Keep existing staff list rows
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
      // Add any staff from existing shifts not already in list
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchCode]);

  // Open cell editor
  function openEdit(staffName: string, dateStr: string) {
    const existing = gridData[staffName]?.[dateStr];
    setEditStart(existing?.start_hour ?? 9);
    setEditEnd(existing?.end_hour ?? 17);
    const role = existing?.role ?? "CK";
    if (ROLE_OPTIONS.includes(role)) {
      setEditRole(role);
      setEditCustomRole("");
    } else {
      setEditRole("OTHER");
      setEditCustomRole(role);
    }
    setEditTarget({ staffName, dateStr });
  }

  function saveEdit() {
    if (!editTarget) return;
    const { staffName, dateStr } = editTarget;
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

  // Flatten grid → rows for API
  const buildRows = useCallback(() => {
    const rows: { work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number }[] = [];
    for (const [staffName, days] of Object.entries(gridData)) {
      for (const [dateStr, cell] of Object.entries(days)) {
        if (cell && cell.role) {
          rows.push({
            work_date: dateStr,
            staff_name: staffName,
            role: cell.role,
            start_hour: cell.start_hour,
            end_hour: cell.end_hour,
          });
        }
      }
    }
    return rows;
  }, [gridData]);

  // Save & Publish
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
        : result.export_result
        ? " + Exported to Sheet ✓"
        : "";
      setSuccess(`✅ Published ${result.rows_copied} shifts to Week/My-Shift${exportNote}`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const branches = BRANCHES[city];

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
            <select
              className={SELECT_CLASS}
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select
              className={SELECT_CLASS}
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
            >
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
      {success && (
        <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {/* Grid */}
      {staffList.length > 0 && (
        <div className={`${GLASS_CARD} overflow-hidden p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="w-40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-neutral-400">
                    Staff
                  </th>
                  {weekDates.map((d) => (
                    <th key={d} className="min-w-[100px] px-2 py-3 text-center text-xs font-semibold text-neutral-300">
                      {formatDate(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.map((name, idx) => (
                  <tr
                    key={name}
                    className={`border-b border-white/5 ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-4 py-2 text-xs font-medium text-neutral-200">{name}</td>
                    {weekDates.map((d) => {
                      const cell = gridData[name]?.[d] ?? null;
                      const isEditing = editTarget?.staffName === name && editTarget?.dateStr === d;
                      return (
                        <td key={d} className="px-1 py-1 text-center align-top">
                          {isEditing ? (
                            <div className="rounded-xl border border-violet-500/40 bg-violet-950/40 p-2 text-left text-xs">
                              <div className="mb-1.5 flex items-center gap-1">
                                <label className="w-10 shrink-0 text-neutral-400">Start</label>
                                <select
                                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                  value={editStart}
                                  onChange={(e) => setEditStart(Number(e.target.value))}
                                >
                                  {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{fmtHour(h)}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="mb-1.5 flex items-center gap-1">
                                <label className="w-10 shrink-0 text-neutral-400">End</label>
                                <select
                                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                  value={editEnd}
                                  onChange={(e) => setEditEnd(Number(e.target.value))}
                                >
                                  {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{fmtHour(h)}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="mb-2 flex items-center gap-1">
                                <label className="w-10 shrink-0 text-neutral-400">Role</label>
                                <select
                                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-white"
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value)}
                                >
                                  {ROLE_OPTIONS.map((r) => (
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
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  className="flex-1 rounded-lg bg-violet-600 py-1 text-xs font-semibold text-white hover:bg-violet-500"
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
                                  onClick={() => setEditTarget(null)}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-400 hover:bg-white/10"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : cell ? (
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

          {/* Add staff row */}
          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={addStaffRow}
              className="text-xs text-neutral-400 hover:text-violet-300"
            >
              + Add staff row manually
            </button>
          </div>
        </div>
      )}

      {/* Publish footer */}
      {staffList.length > 0 && (
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
            Publishes {buildRows().length} shift{buildRows().length !== 1 ? "s" : ""} to Week / My-Shift and exports to Google Sheets.
          </p>
        </div>
      )}

      {/* Empty state */}
      {staffList.length === 0 && (
        <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
          <div className="mb-3 text-4xl">📅</div>
          <p className="text-sm font-medium text-neutral-300">Select city, branch and week, then click "Load Staff & Shifts"</p>
          <p className="mt-1 text-xs text-neutral-500">Existing published shifts for the selected week will be pre-loaded into the grid.</p>
        </div>
      )}
    </div>
  );
}
