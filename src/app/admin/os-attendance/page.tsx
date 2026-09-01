"use client";

import {
  AlertTriangle, BarChart2, CheckCircle, ChevronDown, ChevronRight,
  Clock, Download, Fingerprint, Loader2, MapPin, Pencil, Plus,
  RefreshCw, Trash2, Upload, XCircle, User,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { canAccessOsAttendanceAdmin, getAuth, type Auth } from "@/lib/auth";
import {
  GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE,
  TAB_ACTIVE, TAB_INACTIVE, BADGE_SUCCESS, BADGE_ERROR, BADGE_WARNING,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const API = "/api/admin/attendance";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  // Only set Content-Type for requests that carry a body
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string> | undefined ?? {}) },
  });
}

// Extract a human-readable error message from a non-ok API response
async function extractApiError(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json() as { detail?: string; message?: string };
    return j.detail || j.message || fallback;
  } catch {
    return fallback;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchGps = {
  city: string;
  branch_code: string;
  lat: number;
  lng: number;
  radius_m: number;
  label: string;
  updated_at: string;
};

type Visit = {
  id: string;
  branch_code: string | null;
  visit_start: string | null;
  visit_end: string | null;
  gps_ok: boolean | null;
  distance_m: number | null;
};

type AttendanceSession = {
  id: string;
  city: string;
  branch_code: string;
  staff_name: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_in_gps_ok: boolean | null;
  check_out_gps_ok: boolean | null;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  note: string;
  visits: Visit[];
  // Feature 3: late arrival + schedule (populated by backend when schedule data is available)
  scheduled_start_hour?: number | null;
  scheduled_end_hour?: number | null;
  late_minutes?: number | null;
  // Feature 4: synthetic no-show rows (client-side only, no real session)
  is_no_show?: boolean;
  is_day_off?: boolean;
  absence_type?: string | null;
  // Feature 6: source of the attendance record
  source?: "webauthn" | "bayzat";
  // Break records — populated by Daily Report API
  breaks?: { id: string; break_in_at: string | null; break_out_at: string | null; duration_min: number | null }[];
  break_min?: number;
};

type SessionMeta = { staff_names: string[]; branch_codes: string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

// City → IANA timezone. Dubai = UTC+4 (no DST), Manila = UTC+8 (no DST).
function cityTz(city: string): string {
  return city === "dubai" ? "Asia/Dubai" : "Asia/Manila";
}
function cityOffset(city: string): string {
  return city === "dubai" ? "+04:00" : "+08:00";
}

// Format ISO → local time string for display (e.g. "09:30 AM")
function fmtTime(iso: string | null, tz = "Asia/Manila") {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-PH", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz,
    });
  } catch { return "—"; }
}

function fmtDuration(inAt: string | null, outAt: string | null): string {
  if (!inAt || !outAt) return "—";
  const mins = Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000);
  if (mins < 0) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function minutesBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

function fmtTotalMins(m: number): string {
  if (m === 0) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

// ISO → "HH:MM" in local timezone for time input — formatToParts for cross-browser leading-zero safety
function isoToLocalTm(iso: string | null, tz = "Asia/Manila"): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-PH", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
    }).formatToParts(d);
    const h = parts.find(p => p.type === "hour")?.value ?? "00";
    const m = parts.find(p => p.type === "minute")?.value ?? "00";
    // Some browsers (iOS Safari) return "24" for midnight with hour12:false — normalize to "00"
    const hNum = parseInt(h, 10);
    return `${String(hNum >= 24 ? hNum - 24 : hNum).padStart(2, "0")}:${m.padStart(2, "0")}`;
  } catch { return ""; }
}

// Combine work_date (YYYY-MM-DD) + HH:MM in city local time → UTC ISO
function localTimeToIso(date: string, hhmm: string, city = "manila"): string {
  if (!hhmm || !date) return "";
  try {
    const d = new Date(`${date}T${hhmm}:00${cityOffset(city)}`);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  } catch { return ""; }
}

// Add one calendar day to a YYYY-MM-DD string
function nextDateStr(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sessionStatus(s: AttendanceSession): "clocked_out" | "on_shift" | "not_clocked_in" {
  if (s.check_out_at) return "clocked_out";
  if (s.check_in_at) return "on_shift";
  return "not_clocked_in";
}

function StatusBadge({ s }: { s: AttendanceSession }) {
  if (s.is_no_show) {
    if (s.is_day_off) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs text-blue-400">Day Off</span>;
    }
    if (s.absence_type) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Absence</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400">No Show</span>;
  }
  const st = sessionStatus(s);
  if (st === "clocked_out") return <span className={BADGE_SUCCESS}><CheckCircle size={10} />Clocked Out</span>;
  if (st === "on_shift") return <span className={BADGE_WARNING}><Loader2 size={10} className="animate-spin" />On Shift</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-white/40">Not Clocked In</span>;
}

function SourceBadge({ source }: { source?: "webauthn" | "bayzat" }) {
  if (!source || source === "webauthn") return null;
  return (
    <span className="ml-1 inline-flex items-center rounded-full bg-blue-500/10 border border-blue-500/20 px-1.5 py-0 text-xs text-blue-400">
      Bayzat
    </span>
  );
}

function LateBadge({ mins }: { mins: number | null | undefined }) {
  if (!mins || mins < 5) return null;
  return (
    <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0 text-xs text-amber-400">
      Late {mins}m
    </span>
  );
}

function GpsBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-white/30 text-xs">—</span>;
  if (ok) return <span className={BADGE_SUCCESS}><CheckCircle size={10} />In Range</span>;
  return <span className={BADGE_ERROR}><XCircle size={10} />Out of Range</span>;
}

// ── Staff Report Tab ──────────────────────────────────────────────────────────

interface BreakRecord {
  id: string;
  break_in_at: string | null;
  break_out_at: string | null;
  duration_min: number | null;
}

interface SessionRow {
  work_date: string;
  branch_code: string;
  check_in_at: string | null;
  check_out_at: string | null;
  work_min: number | null;
  break_min: number;
  net_work_min: number | null;
  breaks: BreakRecord[];
  violations: string[];
  has_open_break: boolean;
  /** Why a day has no punches. Absent from older responses. */
  day_status?: string;
  note?: string;
  scheduled_start?: number | null;
  scheduled_end?: number | null;
}

/** A day with no punch used to produce no row, so the dates either side sat
    together and an absence looked like an ordinary gap in the calendar. */
const DAY_STATUS: Record<string, { label: string; cls: string }> = {
  absent:        { label: "absent",          cls: "bg-red-900/60 text-red-300" },
  no_record:     { label: "no record",       cls: "bg-red-900/60 text-red-300" },
  day_off:       { label: "day off",         cls: "bg-zinc-800 text-zinc-400" },
  awol:          { label: "AWOL",            cls: "bg-red-900/60 text-red-300" },
  resigned:      { label: "resigned",        cls: "bg-zinc-800 text-zinc-400" },
  double_account:{ label: "double account",  cls: "bg-amber-900/60 text-amber-300" },
  no_punch:      { label: "no punch",        cls: "bg-orange-900/60 text-orange-300" },
  rest_day:      { label: "rest day",        cls: "bg-zinc-800 text-zinc-400" },
  paid_leave:    { label: "paid leave",      cls: "bg-sky-900/60 text-sky-300" },
  off:           { label: "off",             cls: "bg-zinc-800 text-zinc-500" },
};

function fmtHour(h?: number | null): string {
  if (h === null || h === undefined) return "";
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

interface StaffReport {
  staff_name: string;
  summary: { work_days: number; total_work_min: number; total_break_min: number };
  sessions: SessionRow[];
}

function fmtMin(min: number | null): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTs(ts: string | null, city: string): string {
  if (!ts) return "—";
  const tz = city === "dubai" ? "Asia/Dubai" : "Asia/Manila";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(new Date(ts));
}

function StaffReportTab({ city }: { city: string }) {
  const [staffInput, setStaffInput] = useState("");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<StaffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [staffList, setStaffList] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch staff names from recent sessions for autocomplete
  useEffect(() => {
    async function load() {
      try {
        const r = await apiFetch(`${API}/sessions?city=${city}&limit=200`);
        if (!r.ok) return;
        const d = await r.json() as { sessions?: { staff_name: string }[] };
        const names = [...new Set((d.sessions ?? []).map((s) => s.staff_name))].sort();
        setStaffList(names);
      } catch { /* best-effort */ }
    }
    void load();
  }, [city]);

  async function fetchReport(name: string) {
    if (!name.trim()) return;
    setLoading(true); setErr(""); setReport(null);
    try {
      const params = new URLSearchParams({ city, staff_name: name, from_date: fromDate, to_date: toDate });
      const r = await apiFetch(`${API}/staff-report?${params}`);
      if (!r.ok) { setErr(await r.text()); return; }
      setReport(await r.json() as StaffReport);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }

  const filtered = staffInput
    ? staffList.filter((s) => s.toLowerCase().includes(staffInput.toLowerCase()))
    : staffList;

  return (
    <div className="space-y-5">
      {/* Search controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <label className="text-xs text-zinc-500 mb-1 block">Staff Name</label>
          <input
            value={staffInput}
            onChange={(e) => { setStaffInput(e.target.value); setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search staff..."
            className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500/50 focus:outline-none"
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
              {filtered.slice(0, 20).map((name) => (
                <button key={name} onMouseDown={() => { setStaffInput(name); setShowSuggestions(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800">
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
        </div>
        <button
          onClick={() => { void fetchReport(staffInput); }}
          disabled={loading || !staffInput.trim()}
          className={PRIMARY_BUTTON + " py-2 px-5 text-sm disabled:opacity-40"}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* Summary KPIs */}
      {report && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Days Worked", value: String(report.summary.work_days) },
              { label: "Total Work", value: fmtMin(report.summary.total_work_min) },
              { label: "Total Break", value: fmtMin(report.summary.total_break_min) },
              // The count that matters before payroll: days the person was
              // rostered and did not punch. It used to be invisible.
              { label: "No Punch", value: String(
                  report.sessions.filter((x) => x.day_status && x.day_status !== "worked"
                    && x.day_status !== "rest_day" && x.day_status !== "off"
                    && x.day_status !== "day_off" && x.day_status !== "resigned").length) },
            ].map(({ label, value }) => (
              <div key={label} className={`${GLASS_CARD} p-4 text-center`}>
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Sessions table */}
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="py-3 pr-3 text-left pl-3">Date</th>
                  <th className="py-3 pr-3 text-left">Branch</th>
                  <th className="py-3 pr-3 text-left">Clock In</th>
                  <th className="py-3 pr-3 text-left">Break In</th>
                  <th className="py-3 pr-3 text-left">Break Out</th>
                  <th className="py-3 pr-3 text-left">Clock Out</th>
                  <th className="py-3 pr-3 text-left">Work</th>
                  <th className="py-3 pr-3 text-left">Break</th>
                  <th className="py-3 pr-3 text-left">Net Work</th>
                  <th className="py-3 text-left">Flags</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((s, i) => {
                  const hasViolation = s.violations.length > 0;
                  const st = s.day_status && s.day_status !== "worked" ? DAY_STATUS[s.day_status] : undefined;
                  const needsAttention = s.day_status === "absent" || s.day_status === "no_record"
                    || s.day_status === "awol";
                  const rowBg = hasViolation || needsAttention
                    ? "bg-red-950/20" : i % 2 === 0 ? "bg-zinc-900/30" : "";
                  const firstBreak = s.breaks[0] ?? null;
                  return (
                    <tr key={s.work_date} className={`border-b border-white/5 ${rowBg}`}>
                      <td className="py-2.5 pr-3 pl-3 text-zinc-300 font-medium">{s.work_date}</td>
                      <td className="py-2.5 pr-3 text-zinc-400">{s.branch_code || "—"}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-300">{fmtTs(s.check_in_at, city)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-300">{firstBreak ? fmtTs(firstBreak.break_in_at, city) : "—"}</td>
                      <td className={`py-2.5 pr-3 tabular-nums ${s.has_open_break ? "text-red-400 font-semibold" : "text-zinc-300"}`}>
                        {firstBreak ? (firstBreak.break_out_at ? fmtTs(firstBreak.break_out_at, city) : "🔴 open") : "—"}
                      </td>
                      <td className={`py-2.5 pr-3 tabular-nums ${!s.check_out_at && s.check_in_at ? "text-orange-400" : "text-zinc-300"}`}>
                        {fmtTs(s.check_out_at, city)}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-400">{fmtMin(s.work_min)}</td>
                      <td className={`py-2.5 pr-3 tabular-nums ${s.violations.some((v) => v.includes("break_overrun")) ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
                        {s.break_min > 0 ? fmtMin(s.break_min) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-white font-semibold">{fmtMin(s.net_work_min)}</td>
                      <td className="py-2.5">
                        {st && (
                          <span
                            className={`inline-block mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}
                            title={[
                              s.note ? `Note: ${s.note}` : "",
                              s.scheduled_start != null
                                ? `Scheduled ${fmtHour(s.scheduled_start)}–${fmtHour(s.scheduled_end)}`
                                : "No shift published",
                            ].filter(Boolean).join(" · ")}
                          >
                            {st.label}
                          </span>
                        )}
                        {s.violations.map((v, vi) => (
                          <span key={vi} className={`inline-block mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            v.includes("overrun") ? "bg-red-900/60 text-red-300" :
                            v.includes("missing_checkout") ? "bg-orange-900/60 text-orange-300" :
                            "bg-amber-900/60 text-amber-300"
                          }`}>
                            {v.replace(/_/g, " ")}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {report.sessions.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-zinc-500">No records found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Multiple breaks per day — expand */}
          {report.sessions.some((s) => s.breaks.length > 1) && (
            <div className="rounded-xl border border-white/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">All Break Records (multiple breaks)</p>
              {report.sessions.filter((s) => s.breaks.length > 1).map((s) => (
                <div key={s.work_date} className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-300">{s.work_date}</p>
                  {s.breaks.map((b, bi) => (
                    <div key={bi} className="flex gap-4 text-xs text-zinc-400 pl-2">
                      <span>Break {bi + 1}</span>
                      <span>In: {fmtTs(b.break_in_at, city)}</span>
                      <span className={!b.break_out_at ? "text-red-400 font-semibold" : ""}>Out: {b.break_out_at ? fmtTs(b.break_out_at, city) : "🔴 open"}</span>
                      <span>{b.duration_min !== null ? fmtMin(b.duration_min) : "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!report && !loading && !err && (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
          <User size={28} className="opacity-40" />
          <p className="text-sm">Select a staff member and date range to view their attendance report</p>
        </div>
      )}
    </div>
  );
}


// ── GPS Settings Tab ──────────────────────────────────────────────────────────

type GpsEditState = { lat: string; lng: string; radius_m: string; label: string };

function GpsTab({ city }: { city: string }) {
  const [list, setList] = useState<BranchGps[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<GpsEditState>({ lat: "", lng: "", radius_m: "100", label: "" });
  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [err, setErr] = useState("");
  // Tracks which branch_code is mid-delete so only that row shows a spinner
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
  // Stale-fetch guard: increment on each load, discard results from older calls
  const loadCountRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadCountRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps?city=${city}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load GPS settings")); return; }
      const d = await r.json() as { branches?: BranchGps[] };
      if (id !== loadCountRef.current) return;
      setList(d.branches ?? []);
    } catch {
      if (id !== loadCountRef.current) return;
      setErr("Failed to load GPS settings");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  // Reset UI state when city changes to prevent stale edit/add forms from old city
  useEffect(() => {
    setEditing(null);
    setAdding(false);
    setErr("");
    setList([]);
    setForm({ lat: "", lng: "", radius_m: "100", label: "" });
    setNewBranch("");
  }, [city]);

  function startEdit(g: BranchGps) {
    setAdding(false);
    setEditing(g.branch_code);
    setForm({ lat: String(g.lat), lng: String(g.lng), radius_m: String(g.radius_m), label: g.label });
    setErr("");
  }

  async function save(branch_code: string) {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radius_m = parseInt(form.radius_m);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius_m)) {
      setErr("Please enter valid numbers for latitude, longitude, and radius"); return;
    }
    if (lat < -90 || lat > 90) { setErr("Latitude must be between −90 and 90"); return; }
    if (lng < -180 || lng > 180) { setErr("Longitude must be between −180 and 180"); return; }
    if (radius_m <= 0 || radius_m > 10000) { setErr("Radius must be between 1 and 10,000 metres"); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps/${city}/${branch_code}`, {
        method: "PUT",
        body: JSON.stringify({ lat, lng, radius_m, label: form.label }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to save GPS settings")); return; }
      setEditing(null);
      await load();
    } catch {
      setErr("Network error — please check your connection and try again");
    } finally { setBusy(false); }
  }

  async function del(branch_code: string) {
    if (!confirm(`Delete GPS settings for ${branch_code}? This cannot be undone.`)) return;
    setDeletingBranch(branch_code);
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps/${city}/${branch_code}`, { method: "DELETE" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to delete GPS settings")); return; }
      await load();
    } catch {
      setErr("Network error — please check your connection and try again");
    } finally { setBusy(false); setDeletingBranch(null); }
  }

  async function addNew() {
    if (!newBranch.trim()) { setErr("Enter a branch code"); return; }
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radius_m = parseInt(form.radius_m);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius_m)) {
      setErr("Please enter valid numbers for latitude, longitude, and radius"); return;
    }
    if (lat < -90 || lat > 90) { setErr("Latitude must be between −90 and 90"); return; }
    if (lng < -180 || lng > 180) { setErr("Longitude must be between −180 and 180"); return; }
    if (radius_m <= 0 || radius_m > 10000) { setErr("Radius must be between 1 and 10,000 metres"); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps/${city}/${newBranch.trim().toUpperCase()}`, {
        method: "PUT",
        body: JSON.stringify({ lat, lng, radius_m, label: form.label }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to add branch GPS")); return; }
      setAdding(false); setNewBranch(""); setForm({ lat: "", lng: "", radius_m: "100", label: "" });
      await load();
    } catch {
      setErr("Network error — please check your connection and try again");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Set GPS coordinates and geofence radius per branch. Branches without GPS configured skip the location check.</p>
        <div className="flex gap-2">
          <button onClick={() => { void load(); }} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
            <RefreshCw size={12} />Refresh
          </button>
          <button onClick={() => { setAdding(true); setEditing(null); setForm({ lat: "", lng: "", radius_m: "100", label: "" }); setNewBranch(""); setErr(""); }}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
            <Plus size={12} />Add Branch
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {adding && (
        <div className={`${GLASS_CARD} p-4 border-violet-500/30 space-y-3`}>
          <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">New Branch GPS</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Branch Code</label>
              <input value={newBranch} onChange={e => setNewBranch(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="e.g. MNL-01" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Label (optional)</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="e.g. Manila Main" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Latitude</label>
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="14.5995" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Longitude</label>
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="120.9842" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Geofence Radius (m)</label>
              <input value={form.radius_m} onChange={e => setForm(f => ({ ...f, radius_m: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="100" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setErr(""); }} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
            <button onClick={() => { void addNew(); }} disabled={busy} className={PRIMARY_BUTTON + " text-sm py-1.5 px-4"}>Save</button>
          </div>
        </div>
      )}

      {busy && list.length === 0 && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/30" size={24} /></div>}

      <div className="space-y-2">
        {list.map(g => (
          <div key={g.branch_code} className={`${GLASS_CARD} p-4`}>
            {editing === g.branch_code ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">{g.branch_code}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Label</label>
                    <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Radius (m)</label>
                    <input value={form.radius_m} onChange={e => setForm(f => ({ ...f, radius_m: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Latitude</label>
                    <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Longitude</label>
                    <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                </div>
                {err && <p className="text-xs text-red-400">{err}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setEditing(null); setErr(""); }} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
                  <button onClick={() => { void save(g.branch_code); }} disabled={busy} className={PRIMARY_BUTTON + " text-sm py-1.5 px-4"}>Save</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{g.branch_code}</span>
                      {g.label && <span className="text-xs text-white/50">{g.label}</span>}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {g.lat.toFixed(6)}, {g.lng.toFixed(6)} · Radius {g.radius_m}m
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(g)} disabled={busy} className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => { void del(g.branch_code); }} disabled={busy} className="rounded-lg border border-red-500/20 p-1.5 text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-40">
                    {deletingBranch === g.branch_code ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!busy && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-white/30">
            <MapPin size={32} />
            <p className="text-sm">No GPS settings configured</p>
            <p className="text-xs">Use &quot;Add Branch&quot; to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit Session Modal ────────────────────────────────────────────────────────

type EditForm = { check_in_time: string; check_out_time: string; note: string };

function EditModal({
  session,
  onClose,
  onSaved,
}: {
  session: AttendanceSession;
  onClose: () => void;
  onSaved: (updated: AttendanceSession) => void;
}) {
  const tz = cityTz(session.city);
  const cityLabel = session.city === "dubai" ? "Dubai" : "Manila";
  const [form, setForm] = useState<EditForm>({
    check_in_time: isoToLocalTm(session.check_in_at, tz),
    check_out_time: isoToLocalTm(session.check_out_at, tz),
    note: session.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setBusy(true); setErr("");
    try {
      const body: Record<string, string> = { note: form.note };
      if (form.check_in_time) {
        const iso = localTimeToIso(session.work_date, form.check_in_time, session.city);
        if (!iso) { setErr("Invalid clock-in time — please re-enter"); setBusy(false); return; }
        body.check_in_at = iso;
      } else {
        body.check_in_at = "";
      }
      if (form.check_out_time) {
        // Overnight shift: if clock-out HH:MM < clock-in HH:MM, clock-out is the next calendar day
        const checkoutDate =
          form.check_in_time && form.check_out_time < form.check_in_time
            ? nextDateStr(session.work_date)
            : session.work_date;
        const iso = localTimeToIso(checkoutDate, form.check_out_time, session.city);
        if (!iso) { setErr("Invalid clock-out time — please re-enter"); setBusy(false); return; }
        body.check_out_at = iso;
      } else {
        body.check_out_at = "";
      }
      let r: Response;
      if (session.is_no_show) {
        // No Show: create a brand-new session via POST
        r = await apiFetch(`${API}/sessions`, {
          method: "POST",
          body: JSON.stringify({
            city: session.city,
            staff_name: session.staff_name,
            work_date: session.work_date,
            branch_code: session.branch_code ?? "",
            ...body,
          }),
        });
      } else {
        // Existing session: update via PATCH
        r = await apiFetch(`${API}/sessions/${session.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      if (!r.ok) { setErr(await extractApiError(r, "Failed to save changes")); return; }
      const d = await r.json() as { session?: Partial<AttendanceSession> };
      // Merge: d.session has updated times, keep visits from local state, carry note from form
      onSaved({ ...session, ...(d.session ?? {}), visits: session.visits, note: form.note });
    } catch {
      setErr("Failed to save changes — please try again");
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-5`} onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Edit Attendance Record</p>
          <p className="text-white font-semibold mt-1">{session.staff_name}</p>
          <p className="text-xs text-white/40">{session.work_date} · {session.branch_code || "—"}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Clock In ({cityLabel} time)</label>
            <input type="time" value={form.check_in_time}
              onChange={e => setForm(f => ({ ...f, check_in_time: e.target.value }))}
              className={inp} />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">Clock Out ({cityLabel} time)</label>
            <input type="time" value={form.check_out_time}
              onChange={e => setForm(f => ({ ...f, check_out_time: e.target.value }))}
              className={inp} />
            {form.check_in_time && form.check_out_time && form.check_out_time < form.check_in_time && (
              <p className="mt-1 text-xs text-amber-400">Overnight shift — saved as next day ({nextDateStr(session.work_date)})</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/50 mb-1 block">Reason / Note (optional)</label>
          <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            rows={2}
            className={inp + " resize-none"}
            placeholder="e.g. System error, manual correction" />
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => { void handleSave(); }} disabled={busy} className={PRIMARY_BUTTON + " text-sm py-1.5 px-4"}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Daily Report Tab ──────────────────────────────────────────────────────────


function DailyReportTab({ city }: { city: string }) {
  // Initialize to today in the city's local timezone
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: cityTz(city) }).format(new Date());
  const [date, setDate] = useState(() => todayStr);
  const [rangeMode, setRangeMode] = useState(false);
  const [dateTo, setDateTo] = useState(() => todayStr);
  const [staffFilter, setStaffFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "on_shift" | "clocked_out" | "not_clocked_in">("");
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [meta, setMeta] = useState<SessionMeta>({ staff_names: [], branch_codes: [] });
  const [busy, setBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingSession, setEditingSession] = useState<AttendanceSession | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [csvImportBranch, setCsvImportBranch] = useState("CUBAO");
  const [csvImportBusy, setCsvImportBusy] = useState(false);
  const [csvImportMsg, setCsvImportMsg] = useState("");
  const csvImportRef = useRef<HTMLInputElement>(null);
  // Stale-fetch guard: increment on each load, discard results from older calls
  const loadCountRef = useRef(0);
  const router = useRouter();

  // KPI summary — computed from unfiltered sessions so totals always show the full-day picture
  const kpis = useMemo(() => {
    const onShift   = sessions.filter(s => !s.is_no_show && sessionStatus(s) === "on_shift").length;
    const out       = sessions.filter(s => !s.is_no_show && sessionStatus(s) === "clocked_out").length;
    const notIn     = sessions.filter(s => s.is_no_show || sessionStatus(s) === "not_clocked_in").length;
    const totalMins = sessions
      .filter(s => !s.is_no_show && s.check_in_at && s.check_out_at)
      .reduce((acc, s) => acc + minutesBetween(s.check_in_at, s.check_out_at), 0);
    return { onShift, out, notIn, totalMins };
  }, [sessions]);

  // Reset per-city state when city switches
  useEffect(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: cityTz(city) }).format(new Date());
    setDate(today);
    setDateTo(today);
    setRangeMode(false);
    setStaffFilter("");
    setBranchFilter("");
    setStatusFilter("");
    setExpandedIds(new Set());
    setEditingSession(null);
    setSessions([]);
    // Clear meta so old city's staff/branch names don't linger in dropdowns during the new fetch
    setMeta({ staff_names: [], branch_codes: [] });
  }, [city]);

  // Load dropdown options (staff names + branch codes for filter selects)
  useEffect(() => {
    setMetaBusy(true);
    apiFetch(`${API}/session-meta?city=${city}`)
      .then(async r => {
        if (!r.ok) return;
        const d = await r.json() as { staff_names?: string[]; branch_codes?: string[] };
        setMeta({ staff_names: d.staff_names ?? [], branch_codes: d.branch_codes ?? [] });
      })
      .catch(() => {})
      .finally(() => setMetaBusy(false));
  }, [city]);

  const load = useCallback(async () => {
    const id = ++loadCountRef.current;
    setBusy(true); setLoadErr("");
    // Clear stale results immediately so old data doesn't linger during load
    setSessions([]);
    setExpandedIds(new Set());
    try {
      const params = new URLSearchParams({ city, limit: rangeMode ? "5000" : "500" });
      if (rangeMode) {
        params.set("date_from", date);
        params.set("date_to", dateTo);
      } else {
        params.set("work_date", date);
      }
      if (staffFilter) params.set("staff_name", staffFilter);
      if (branchFilter) params.set("branch_code", branchFilter);

      // Fetch sessions + no-shows in parallel (no-shows only for single-day view)
      const sessionsFetch = apiFetch(`${API}/daily-report?${params}`);
      const noShowsFetch = !rangeMode
        ? apiFetch(`${API}/no-shows?city=${city}&work_date=${date}${staffFilter ? `&staff_name=${encodeURIComponent(staffFilter)}` : ""}`)
        : Promise.resolve(null);

      const [r, nsR] = await Promise.all([sessionsFetch, noShowsFetch]);
      if (id !== loadCountRef.current) return;

      if (!r.ok) {
        if (r.status === 401) { router.replace("/login"); return; }
        setLoadErr(await extractApiError(r, "Failed to load attendance records")); return;
      }
      const d = await r.json() as { sessions?: AttendanceSession[] };
      if (id !== loadCountRef.current) return;

      const realSessions: AttendanceSession[] = d.sessions ?? [];

      // Build synthetic no-show rows (only for single-day; range mode skips)
      let noShowRows: AttendanceSession[] = [];
      if (nsR?.ok) {
        try {
          const nsD = await nsR.json() as { no_shows?: { staff_name: string; branch_code: string; scheduled_start_hour: number; scheduled_end_hour?: number | null; absence_type?: string | null; is_day_off?: boolean }[] };
          const existingNames = new Set(realSessions.map(s => s.staff_name.toLowerCase()));
          noShowRows = (nsD.no_shows ?? [])
            .filter(ns => !existingNames.has(ns.staff_name.toLowerCase()))
            .map(ns => ({
              id: `no-show-${ns.staff_name}`,
              city,
              branch_code: ns.branch_code ?? "",
              staff_name: ns.staff_name,
              work_date: date,
              check_in_at: null,
              check_out_at: null,
              check_in_lat: null,
              check_in_lng: null,
              check_out_lat: null,
              check_out_lng: null,
              check_in_gps_ok: null,
              check_out_gps_ok: null,
              check_in_distance_m: null,
              check_out_distance_m: null,
              note: "",
              visits: [],
              scheduled_start_hour: ns.scheduled_start_hour,
              scheduled_end_hour: ns.scheduled_end_hour ?? null,
              late_minutes: null,
              is_no_show: true,
              is_day_off: ns.is_day_off ?? false,
              absence_type: ns.absence_type ?? null,
            }));
        } catch { /* no-shows are best-effort — silently ignore parse errors */ }
      }

      setSessions([...realSessions, ...noShowRows]);
    } catch {
      if (id !== loadCountRef.current) return;
      setLoadErr("Failed to load attendance records");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, [city, date, dateTo, rangeMode, staffFilter, branchFilter, router]);

  useEffect(() => { void load(); }, [load]);

  // Client-side status filter (no-show rows get treated as "not_clocked_in")
  const filtered = useMemo(() => {
    if (!statusFilter) return sessions;
    if (statusFilter === "not_clocked_in") {
      return sessions.filter(s => s.is_no_show || sessionStatus(s) === "not_clocked_in");
    }
    return sessions.filter(s => !s.is_no_show && sessionStatus(s) === statusFilter);
  }, [sessions, statusFilter]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleDelete(s: AttendanceSession) {
    if (!confirm(`Delete attendance record for ${s.staff_name} on ${s.work_date}?\n\nThis cannot be undone.`)) return;
    setDeletingId(s.id); setLoadErr("");
    try {
      const url = s.source === "bayzat"
        ? `${API}/bayzat/${s.id}`
        : `${API}/sessions/${s.id}`;
      const r = await apiFetch(url, { method: "DELETE" });
      if (!r.ok) { setLoadErr(await extractApiError(r, "Failed to delete record")); return; }
      setSessions(prev => prev.filter(x => x.id !== s.id));
      setExpandedIds(prev => { const n = new Set(prev); n.delete(s.id); return n; });
    } catch {
      setLoadErr("Failed to delete record — please try again");
    } finally { setDeletingId(null); }
  }

  function handleSaved(updated: AttendanceSession) {
    setSessions(prev => prev.map(s => {
      if (s.id === updated.id) return updated;
      // No-show row replaced by a newly created real session
      if (s.is_no_show && s.staff_name === updated.staff_name && s.work_date === updated.work_date) {
        return { ...updated, is_no_show: false };
      }
      return s;
    }));
    setEditingSession(null);
  }

  // CSV export
  function downloadCsv() {
    const cols = ["Staff Name", "Branch", "Date", "Status", "Schedule Start", "Schedule End", "Clock In", "Clock Out", "Hours Worked", "Break In", "Break Out", "Break (min)", "GPS In", "GPS Out", "Branch Visits", "Note"];
    const rows = filtered.map(s => {
      const firstBreak = s.breaks?.[0] ?? null;
      const breakMin = s.break_min != null && s.break_min > 0 ? String(s.break_min) : "";
      return [
        s.staff_name,
        s.branch_code || "",
        s.work_date,
        sessionStatus(s).replaceAll("_", " "),
        s.scheduled_start_hour != null ? fmtShiftHour(s.scheduled_start_hour) : "",
        s.scheduled_end_hour != null ? fmtShiftHour(s.scheduled_end_hour) : "",
        fmtTime(s.check_in_at, cityTz(city)),
        fmtTime(s.check_out_at, cityTz(city)),
        fmtDuration(s.check_in_at, s.check_out_at),
        firstBreak ? fmtTime(firstBreak.break_in_at, cityTz(city)) : "",
        firstBreak?.break_out_at ? fmtTime(firstBreak.break_out_at, cityTz(city)) : (firstBreak ? "open" : ""),
        breakMin,
        s.check_in_gps_ok === null ? "" : s.check_in_gps_ok ? "In Range" : "Out of Range",
        s.check_out_gps_ok === null ? "" : s.check_out_gps_ok ? "In Range" : "Out of Range",
        String(s.visits?.length ?? 0),
        s.note || "",
      ];
    });
    // Use \r\n (RFC 4180) so Windows Excel parses rows correctly.
    // Prepend UTF-8 BOM (﻿) so Excel opens Japanese staff names without garbling.
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance_${city}_${date}.csv`;
    // Must append to DOM before click — Firefox ignores click() on detached elements
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revoke to ensure the browser has queued the download before the URL is freed
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleCsvImportFile(file: File) {
    setCsvImportBusy(true);
    setCsvImportMsg("");
    try {
      const auth = getAuth();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("branch", csvImportBranch);
      fd.append("city", city);
      const res = await fetch("/api/admin/attendance/import-bayzat-timesheet-csv", {
        method: "POST",
        headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try { detail = (JSON.parse(text) as { detail?: string }).detail || text; } catch { /* raw */ }
        setCsvImportMsg(`Import failed: ${detail}`);
        return;
      }
      const d = JSON.parse(text) as { ok?: boolean; imported?: number; skipped?: number; duplicate?: boolean; import_batch_id?: string; skipped_details?: { name: string; reason: string }[] };
      if (d.duplicate) {
        setCsvImportMsg("This file was already imported previously.");
        return;
      }
      let msg = `Imported ${d.imported ?? 0} records, skipped ${d.skipped ?? 0}.`;
      if ((d.skipped_details ?? []).length > 0) {
        const reasons = (d.skipped_details ?? []).map(x => `${x.name}: ${x.reason}`).join("; ");
        msg += ` Skipped: ${reasons}`;
      }
      setCsvImportMsg(msg);
      void load();
    } catch (e) {
      setCsvImportMsg(`Import failed: ${String(e)}`);
    } finally {
      setCsvImportBusy(false);
      if (csvImportRef.current) csvImportRef.current.value = "";
    }
  }

  const cellCls = "py-3 pr-3 text-sm align-middle";

  return (
    <div className="space-y-4">

      {/* ── KPI Summary Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/40 mb-1">On Shift</p>
          <p className="text-2xl font-medium text-amber-400">{busy ? "—" : kpis.onShift}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/40 mb-1">Clocked Out</p>
          <p className="text-2xl font-medium text-emerald-400">{busy ? "—" : kpis.out}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/40 mb-1">Not Clocked In</p>
          <p className="text-2xl font-medium text-white/50">{busy ? "—" : kpis.notIn}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/40 mb-1">Total Hours</p>
          <p className="text-2xl font-medium text-violet-300">{busy ? "—" : fmtTotalMins(kpis.totalMins)}</p>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Date mode toggle */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
          <button
            onClick={() => setRangeMode(false)}
            className={`px-3 py-1.5 transition-colors ${!rangeMode ? "bg-violet-500/20 text-violet-300" : "text-white/50 hover:text-white"}`}>
            Single Day
          </button>
          <button
            onClick={() => setRangeMode(true)}
            className={`px-3 py-1.5 border-l border-white/10 transition-colors ${rangeMode ? "bg-violet-500/20 text-violet-300" : "text-white/50 hover:text-white"}`}>
            Date Range
          </button>
        </div>

        {/* Date picker(s) */}
        {!rangeMode ? (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
        ) : (
          <div className="flex items-center gap-1.5">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
            <span className="text-white/30 text-xs">to</span>
            <input type="date" value={dateTo} min={date} onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
          </div>
        )}

        {/* Staff name dropdown */}
        <SelectDark
          value={staffFilter}
          onChange={setStaffFilter}
          options={[
            { value: "", label: "All Staff" },
            ...meta.staff_names.map(n => ({ value: n, label: n })),
          ]}
        />

        {/* Branch dropdown */}
        <SelectDark
          value={branchFilter}
          onChange={setBranchFilter}
          options={[
            { value: "", label: "All Branches" },
            ...meta.branch_codes.map(b => ({ value: b, label: b })),
          ]}
        />

        {/* Status dropdown */}
        <SelectDark
          value={statusFilter}
          onChange={v => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: "", label: "All Status" },
            { value: "on_shift", label: "On Shift" },
            { value: "clocked_out", label: "Clocked Out" },
            { value: "not_clocked_in", label: "Not Clocked In" },
          ]}
        />

        <button onClick={() => { void load(); }} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
          <RefreshCw size={12} />Refresh
        </button>

        <button onClick={downloadCsv} disabled={filtered.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
          <Download size={12} />Download CSV
        </button>
      </div>

      {/* Bayzat CSV Import removed — Bayzat contract ended 2026-07 */}

      <p className="text-xs text-white/30">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>

      {loadErr && <p className="text-xs text-red-400">{loadErr}</p>}

      {busy && (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={24} /></div>
      )}

      {!busy && !loadErr && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-white/30">
          <Fingerprint size={32} />
          {sessions.length > 0
            ? <p className="text-sm">No records match the selected filter</p>
            : <p className="text-sm">No attendance records for this date</p>
          }
        </div>
      )}

      {!busy && !loadErr && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/8">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/3 text-xs text-white/40">
                <th className="pb-2.5 pt-2.5 pl-3 text-left font-medium w-6"></th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Staff</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Branch</th>
                {rangeMode && <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Date</th>}
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Status</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Schedule</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Clock In</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">GPS</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Clock Out</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">GPS</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Hours</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Break</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Visits</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(s => {
                const expanded = expandedIds.has(s.id);
                const deleting = deletingId === s.id;
                const visitCount = s.visits?.length ?? 0;
                const breakCount = s.breaks?.length ?? 0;
                const hasNote = !!s.note;
                const expandable = visitCount > 0 || hasNote || breakCount > 0;
                return (
                  <Fragment key={s.id}>
                    <tr className="hover:bg-white/3 transition-colors group">
                      {/* Expand toggle — show when visits OR note present */}
                      <td className={`${cellCls} pl-3 text-white/30`}>
                        {expandable && (
                          <button onClick={() => toggleExpand(s.id)} className="hover:text-white transition-colors">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </td>
                      <td className={`${cellCls} font-medium text-white`}>
                        {s.staff_name}
                        <SourceBadge source={s.source} />
                      </td>
                      <td className={`${cellCls} text-white/50`}>{s.branch_code || "—"}</td>
                      {rangeMode && <td className={`${cellCls} text-white/40 text-xs`}>{s.work_date}</td>}
                      <td className={`${cellCls}`}><StatusBadge s={s} /></td>
                      <td className={`${cellCls} tabular-nums text-white/50 text-xs`}>
                        {s.scheduled_start_hour != null && s.scheduled_end_hour != null
                          ? `${fmtShiftHour(s.scheduled_start_hour)}–${fmtShiftHour(s.scheduled_end_hour)}`
                          : "—"}
                      </td>
                      <td className={`${cellCls} text-white/80`}>
                        {fmtTime(s.check_in_at, cityTz(city))}
                        <LateBadge mins={s.late_minutes} />
                      </td>
                      <td className={`${cellCls}`}><GpsBadge ok={s.check_in_gps_ok} /></td>
                      <td className={`${cellCls} text-white/80`}>{fmtTime(s.check_out_at, cityTz(city))}</td>
                      <td className={`${cellCls}`}>
                        <GpsBadge ok={s.check_out_gps_ok} />
                        {s.check_out_lat != null && s.check_out_lng != null && s.check_out_gps_ok === false && (
                          <a
                            href={`https://www.google.com/maps?q=${s.check_out_lat},${s.check_out_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-sky-400 hover:text-sky-300 underline underline-offset-2"
                          >
                            <MapPin size={10} />map
                          </a>
                        )}
                      </td>
                      <td className={`${cellCls} text-white/60`}>{fmtDuration(s.check_in_at, s.check_out_at)}</td>
                      <td className={`${cellCls}`}>
                        {breakCount > 0 ? (
                          <button onClick={() => toggleExpand(s.id)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${s.breaks!.some(b => !b.break_out_at) ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 font-semibold" : "bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25"}`}>
                            {s.breaks!.some(b => !b.break_out_at) ? "🔴 break open" : fmtTotalMins(Math.round(s.break_min ?? 0))}
                          </button>
                        ) : <span className="text-white/20 text-xs">—</span>}
                      </td>
                      <td className={`${cellCls}`}>
                        {visitCount > 0 ? (
                          <button onClick={() => toggleExpand(s.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-500/25 px-2 py-0.5 text-xs text-violet-300 hover:bg-violet-500/25 transition-colors">
                            {visitCount} visit{visitCount !== 1 ? "s" : ""}
                          </button>
                        ) : hasNote ? (
                          <button onClick={() => toggleExpand(s.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-white/40 hover:bg-white/10 transition-colors">
                            note
                          </button>
                        ) : <span className="text-white/20 text-xs">—</span>}
                      </td>
                      <td className={`${cellCls} pr-3`}>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingSession(s)}
                            className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-white hover:border-white/20 transition-colors">
                            <Pencil size={12} />
                          </button>
                          {!s.is_no_show && sessionStatus(s) !== "on_shift" && (
                            <button onClick={() => { void handleDelete(s); }} disabled={deleting}
                              className="rounded-lg border border-red-500/30 p-1.5 text-red-400/60 hover:text-red-400 hover:border-red-500/60 transition-colors">
                              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail: breaks table + visits table + note */}
                    {expanded && expandable && (
                      <tr key={`${s.id}-detail`} className="bg-white/2">
                        <td colSpan={rangeMode ? 13 : 12} className="pl-10 pr-3 pb-3 pt-1 space-y-2">
                          {breakCount > 0 && (
                            <div className="rounded-lg border border-amber-500/20 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-amber-500/5 border-b border-amber-500/15 text-amber-300/60">
                                    <th className="py-1.5 pl-3 text-left font-medium">#</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">Break In</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">Break Out</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">Duration</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {s.breaks!.map((b, bi) => (
                                    <tr key={b.id}>
                                      <td className="py-1.5 pl-3 text-white/30 text-xs">{bi + 1}</td>
                                      <td className="py-1.5 pr-3 text-white/70">{fmtTime(b.break_in_at, cityTz(city))}</td>
                                      <td className={`py-1.5 pr-3 font-semibold ${!b.break_out_at ? "text-red-400" : "text-white/70"}`}>
                                        {b.break_out_at ? fmtTime(b.break_out_at, cityTz(city)) : "🔴 open (not closed)"}
                                      </td>
                                      <td className="py-1.5 pr-3 text-white/50">
                                        {b.duration_min != null ? fmtTotalMins(Math.round(b.duration_min)) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {visitCount > 0 && (
                            <div className="rounded-lg border border-white/8 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-white/3 border-b border-white/8 text-white/30">
                                    <th className="py-1.5 pl-3 text-left font-medium">Visit Branch</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">Start</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">End</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">Duration</th>
                                    <th className="py-1.5 pr-3 text-left font-medium">GPS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {s.visits.map(v => (
                                    <tr key={v.id}>
                                      <td className="py-1.5 pl-3 text-white/70 font-medium">{v.branch_code || "—"}</td>
                                      <td className="py-1.5 pr-3 text-white/60">{fmtTime(v.visit_start, cityTz(city))}</td>
                                      <td className="py-1.5 pr-3 text-white/60">{fmtTime(v.visit_end, cityTz(city))}</td>
                                      <td className="py-1.5 pr-3 text-white/50">{fmtDuration(v.visit_start, v.visit_end)}</td>
                                      <td className="py-1.5 pr-3"><GpsBadge ok={v.gps_ok} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {s.note && (
                            <p className="text-xs text-white/40 italic">Note: {s.note}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingSession && (
        <EditModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Corrections Tab ───────────────────────────────────────────────────────────

type Correction = {
  id: string;
  city: string;
  staff_name: string;
  work_date: string;
  session_id: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function CorrectionsTab({ city }: { city: string }) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [historyItems, setHistoryItems] = useState<Correction[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setBusy(true); setErr("");
    try {
      const [pendingR, historyR] = await Promise.all([
        apiFetch(`${API}/corrections?city=${city}&status=pending&limit=100`),
        apiFetch(`${API}/corrections?city=${city}&status=&limit=50`),
      ]);
      if (pendingR.ok) {
        const d = await pendingR.json() as { corrections?: Correction[]; pending_count?: number };
        setCorrections(d.corrections ?? []);
        setPendingCount(d.pending_count ?? 0);
      }
      if (historyR.ok) {
        const d = await historyR.json() as { corrections?: Correction[] };
        setHistoryItems((d.corrections ?? []).filter(c => c.status !== "pending"));
      }
    } catch {
      setErr("Failed to load corrections");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(id: string, status: "approved" | "rejected") {
    setReviewingId(id); setErr("");
    try {
      const r = await apiFetch(`${API}/corrections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, apply: true }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to update correction")); return; }
      // Move from pending list to history
      const updated = corrections.find(c => c.id === id);
      if (updated) {
        const updatedRow = { ...updated, status };
        setCorrections(prev => prev.filter(c => c.id !== id));
        setHistoryItems(prev => [updatedRow, ...prev]);
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      setErr("Failed to update correction — please try again");
    } finally {
      setReviewingId(null);
    }
  }

  function fmtRequestedTime(c: Correction): string {
    const tz = cityTz(city);
    const parts: string[] = [];
    if (c.requested_check_in) parts.push(`In: ${fmtTime(c.requested_check_in, tz)}`);
    if (c.requested_check_out) parts.push(`Out: ${fmtTime(c.requested_check_out, tz)}`);
    return parts.join(" · ") || "—";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">
          {pendingCount > 0
            ? <span className="text-amber-400 font-medium">{pendingCount} pending request{pendingCount !== 1 ? "s" : ""}</span>
            : "No pending requests"}
        </p>
        <button onClick={() => { void load(); }} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {busy && corrections.length === 0 && (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={24} /></div>
      )}

      {!busy && corrections.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-white/30">
          <CheckCircle size={32} />
          <p className="text-sm">No pending correction requests</p>
        </div>
      )}

      {corrections.length > 0 && (
        <div className="space-y-2">
          {corrections.map(c => (
            <div key={c.id} className={`${GLASS_CARD} p-4 space-y-2`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{c.staff_name}</p>
                  <p className="text-xs text-white/40">{c.work_date}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Pending</span>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2 space-y-1">
                <p className="text-xs text-white/50">Requested times: <span className="text-white/80">{fmtRequestedTime(c)}</span></p>
                {c.reason && <p className="text-xs text-white/50">Reason: <span className="text-white/70 italic">{c.reason}</span></p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { void review(c.id, "approved"); }}
                  disabled={reviewingId === c.id}
                  className="flex-1 rounded-lg bg-emerald-700/30 border border-emerald-500/20 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-700/50 transition-colors disabled:opacity-40">
                  {reviewingId === c.id ? <Loader2 size={12} className="animate-spin mx-auto" /> : "Approve & Apply"}
                </button>
                <button
                  onClick={() => { void review(c.id, "rejected"); }}
                  disabled={reviewingId === c.id}
                  className="flex-1 rounded-lg bg-red-900/20 border border-red-500/20 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 transition-colors disabled:opacity-40">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History section */}
      {historyItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors mt-4"
          >
            {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Review history ({historyItems.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {historyItems.map(c => (
                <div key={c.id} className="rounded-lg bg-white/3 border border-white/5 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/60">{c.staff_name} · {c.work_date}</p>
                    <span className={`text-xs ${c.status === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                      {c.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">{fmtRequestedTime(c)}</p>
                  {c.reviewed_by && <p className="text-xs text-white/20 mt-0.5">By: {c.reviewed_by}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shift Compliance Tab ──────────────────────────────────────────────────────

type ComplianceStatus = "ON_TIME" | "LATE" | "NOT_CHECKED_IN" | "NO_SHOW" | "PENDING" | "DAY_OFF";

type ComplianceRow = {
  branch_code: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
  session_id: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number | null;
  status: ComplianceStatus;
  meal_allowance_ok: boolean | null;
};

type ComplianceSummary = {
  on_time: number;
  late: number;
  not_checked_in: number;
  no_show: number;
  pending: number;
  day_off: number;
};

function fmtShiftHour(h: number): string {
  const base = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (base >= 24) return `+${base - 24}:${String(mins).padStart(2, "0")}`;
  return `${base}:${String(mins).padStart(2, "0")}`;
}

const STATUS_META: Record<ComplianceStatus, { label: string; icon: string; cls: string }> = {
  ON_TIME:        { label: "On Time",        icon: "✓", cls: "text-emerald-400" },
  LATE:           { label: "Late",           icon: "⚠", cls: "text-amber-400"  },
  NOT_CHECKED_IN: { label: "Not Clocked In", icon: "⏰", cls: "text-orange-400" },
  NO_SHOW:        { label: "No Show",        icon: "✕", cls: "text-red-400"    },
  PENDING:        { label: "Pending",        icon: "⏳", cls: "text-zinc-400"  },
  DAY_OFF:        { label: "Day Off / Leave", icon: "○", cls: "text-blue-400"  },
};

function ShiftComplianceTab({ city }: { city: string }) {
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: cityTz(city) }).format(new Date())
  );
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch(`${API}/shift-compliance?city=${city}&date=${date}`);
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load compliance data")); return; }
      const d = await r.json() as { rows: ComplianceRow[]; summary: ComplianceSummary };
      setRows(d.rows ?? []);
      setSummary(d.summary ?? null);
    } catch {
      setErr("Network error loading compliance data");
    } finally {
      setLoading(false);
    }
  }, [city, date]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const displayRows = issuesOnly
    ? rows.filter(r => r.status !== "ON_TIME" && r.status !== "PENDING" && r.status !== "DAY_OFF")
    : rows;

  const issueCount = rows.filter(r => r.status !== "ON_TIME" && r.status !== "PENDING" && r.status !== "DAY_OFF").length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
        />
        <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={e => setIssuesOnly(e.target.checked)}
            className="rounded"
          />
          Issues Only {issueCount > 0 && <span className="text-amber-400 font-semibold">({issueCount})</span>}
        </label>
        <button onClick={fetchData} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Summary chips */}
      {summary && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {summary.on_time > 0 && (
            <span className="text-emerald-400">✓ {summary.on_time} On Time</span>
          )}
          {summary.late > 0 && (
            <span className="text-amber-400">⚠ {summary.late} Late</span>
          )}
          {summary.not_checked_in > 0 && (
            <span className="text-orange-400">⏰ {summary.not_checked_in} Not Clocked In</span>
          )}
          {summary.no_show > 0 && (
            <span className="text-red-400">✕ {summary.no_show} No Show</span>
          )}
          {summary.pending > 0 && (
            <span className="text-zinc-400">⏳ {summary.pending} Pending</span>
          )}
          {(summary.day_off ?? 0) > 0 && (
            <span className="text-blue-400">○ {summary.day_off} Day Off / Leave</span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-zinc-400 text-sm py-4">Loading…</p>
      ) : err ? (
        <p className="text-red-400 text-sm py-4">{err}</p>
      ) : displayRows.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4">
          {rows.length === 0
            ? "No published shifts found for this date. Publish a shift in Manual Shift Entry first."
            : "No issues found — all staff are on time."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Staff</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Branch</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Role</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Scheduled</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Clocked In</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Status</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Late</th>
                <th className="pb-2 pt-2 pr-4 text-left font-medium">Meal Allow.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayRows.map((row, i) => {
                const st = STATUS_META[row.status];
                return (
                  <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${row.status === "NO_SHOW" ? "bg-red-950/10" : row.status === "NOT_CHECKED_IN" ? "bg-orange-950/10" : ""}`}>
                    <td className="py-2.5 pr-4 text-white font-medium">{row.staff_name}</td>
                    <td className="py-2.5 pr-4 text-zinc-300">{row.branch_code}</td>
                    <td className="py-2.5 pr-4 text-zinc-400 text-xs">{row.role}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-zinc-300">
                      {fmtShiftHour(row.start_hour)}–{fmtShiftHour(row.end_hour)}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-zinc-300">
                      {row.check_in_at ? fmtTs(row.check_in_at, city) : "—"}
                    </td>
                    <td className={`py-2.5 pr-4 font-semibold text-xs ${st.cls}`}>
                      {st.icon} {st.label}
                    </td>
                    <td className={`py-2.5 pr-4 tabular-nums text-xs ${row.late_minutes !== null && row.late_minutes > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"}`}>
                      {row.late_minutes !== null && row.late_minutes > 0 ? `+${row.late_minutes}m` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs">
                      {row.meal_allowance_ok === true ? (
                        <span className="text-emerald-400">✓ Eligible</span>
                      ) : row.meal_allowance_ok === false ? (
                        <span className="text-red-400">✕ No</span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/20 pt-1">
        Meal allowance eligibility is tentative (based on clock-in time only). Final determination happens at clock-out.
        Grace period: {5} min.
      </p>
    </div>
  );
}

// ── Late Alerts Tab ───────────────────────────────────────────────────────────

const LATE_API = "/api/admin/late-alerts";

function lateApiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers ?? {}) } });
}

type AlertRecipient = {
  id: number;
  display_name: string;
  discord_user_id: string;
  city: string | null;
  is_active: boolean;
};

type LateAlert = {
  id: number;
  city: string;
  branch_code: string;
  staff_name: string;
  work_date: string;
  scheduled_start: number;
  alert_type: "OPENING" | "REGULAR";
  threshold_min: number;
  alert_sent_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  ack_method: string | null;
};

type PublishedShift = {
  city: string;
  work_date: string;
  branch_code: string;
  staff_name: string;
  role: string;
  shift_time: string | null;
  start_hour: number | null;
  clocked_in: boolean;
  is_work_shift: boolean;
};

function fmtStartHour(h: number) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const CITY_TZ: Record<string, string> = { manila: "Asia/Manila", dubai: "Asia/Dubai" };
const CITY_TZ_LABEL: Record<string, string> = { manila: "MNL", dubai: "DXB" };

function fmtAlertTime(isoStr: string, city: string) {
  const tz = CITY_TZ[city.toLowerCase()] ?? "UTC";
  const label = CITY_TZ_LABEL[city.toLowerCase()] ?? "UTC";
  const time = new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${time} ${label}`;
}

function LateAlertsTab() {
  const [alerts, setAlerts] = useState<LateAlert[]>([]);
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [acknowledging, setAcknowledging] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDiscordId, setNewDiscordId] = useState("");
  const [newCity, setNewCity] = useState<"" | "dubai" | "manila">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [alertCity, setAlertCity] = useState<"all" | "dubai" | "manila">("all");
  const [showResolved, setShowResolved] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<PublishedShift[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function loadData() {
    setLoading(true);
    try {
      const [ar, rr] = await Promise.all([
        lateApiFetch(`${LATE_API}/today?date=${today}`),
        lateApiFetch(`${LATE_API}/recipients`),
      ]);
      if (ar.ok) {
        const d = await ar.json() as { items: LateAlert[] };
        setAlerts(d.items ?? []);
      }
      if (rr.ok) {
        const d = await rr.json() as { items: AlertRecipient[] };
        setRecipients(d.items ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, [today]);

  async function handleAck(alertId: number) {
    setAcknowledging(alertId);
    const r = await lateApiFetch(`${LATE_API}/${alertId}/acknowledge`, { method: "POST" });
    if (r.ok) await loadData();
    setAcknowledging(null);
  }

  async function handleExpireAll() {
    if (!confirm("Dismiss all pending late alerts for today? This cannot be undone.")) return;
    setExpiring(true);
    const r = await lateApiFetch(`${LATE_API}/expire-all`, {
      method: "POST",
      body: JSON.stringify({ date: today }),
    });
    if (r.ok) {
      const d = await r.json() as { total: number };
      alert(`Dismissed ${d.total} alert(s).`);
      await loadData();
    }
    setExpiring(false);
  }

  async function handleLoadSchedule() {
    if (showSchedule) { setShowSchedule(false); return; }
    setScheduleLoading(true);
    setShowSchedule(true);
    const r = await lateApiFetch(`${LATE_API}/schedule`);
    if (r.ok) {
      const d = await r.json() as { items: PublishedShift[] };
      setSchedule(d.items ?? []);
    }
    setScheduleLoading(false);
  }

  async function handleRemove(recipientId: number) {
    if (!confirm("Remove this recipient?")) return;
    await lateApiFetch(`${LATE_API}/recipients/${recipientId}`, { method: "DELETE" });
    await loadData();
  }

  async function handleAdd() {
    if (!newName.trim() || !newDiscordId.trim()) { setError("Name and Discord ID are required."); return; }
    setSaving(true);
    setError("");
    const r = await lateApiFetch(`${LATE_API}/recipients`, {
      method: "POST",
      body: JSON.stringify({
        display_name: newName.trim(),
        discord_user_id: newDiscordId.trim(),
        city: newCity || null,
      }),
    });
    if (r.ok) {
      setShowAddForm(false);
      setNewName(""); setNewDiscordId(""); setNewCity("");
      await loadData();
    } else {
      const d = await r.json().catch(() => ({})) as { detail?: string };
      setError(d.detail ?? "Failed to add.");
    }
    setSaving(false);
  }

  const filteredAlerts = alerts
    .filter(a => alertCity === "all" || a.city.toLowerCase() === alertCity)
    .filter(a => showResolved || !a.acknowledged_by);

  const resolvedCount = alerts
    .filter(a => alertCity === "all" || a.city.toLowerCase() === alertCity)
    .filter(a => !!a.acknowledged_by).length;

  const pendingCount = filteredAlerts.filter(a => !a.acknowledged_by && a.alert_sent_at).length;

  const cityLabel = (c: string) => c === "dubai" ? "Dubai 🇦🇪" : "Manila 🇵🇭";

  return (
    <div className="space-y-8">
      {/* ── Channel Description ── */}
      <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-white/50 leading-relaxed space-y-1">
        <p>
          <span className="font-semibold text-white/70">Late Alerts</span> monitors clock-in compliance for all published shifts.
          A staff member appears here when they have not clocked in within the threshold after their scheduled start time.
        </p>
        <p>
          <span className="inline-flex items-center gap-1 font-semibold text-red-400">🔴 OPENING</span>
          {" "}— the earliest-scheduled person per branch. Alert fires <span className="text-white/70 font-medium">20 minutes</span> after their shift start.
          {" "}<span className="inline-flex items-center gap-1 font-semibold text-amber-400">REGULAR</span>
          {" "}— all other shifts. Alert fires <span className="text-white/70 font-medium">30 minutes</span> after shift start.
          🔔 OPENING alerts trigger a Discord DM automatically. REGULAR alerts are recorded here for visibility only — no DM is sent. Checked every 5 minutes.
        </p>
      </div>

      {/* ── Alert Status ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
            Late Alerts — {today}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* City filter */}
            {(["all", "manila", "dubai"] as const).map(c => (
              <button key={c} onClick={() => setAlertCity(c)}
                className={alertCity === c
                  ? "rounded-lg bg-violet-500/20 border border-violet-500/40 px-3 py-1 text-xs font-semibold text-violet-300"
                  : "rounded-lg border border-white/10 px-3 py-1 text-xs text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"}>
                {c === "all" ? "All" : c === "dubai" ? "Dubai 🇦🇪" : "Manila 🇵🇭"}
              </button>
            ))}
            <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
            {resolvedCount > 0 && (
              <button
                onClick={() => setShowResolved(v => !v)}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                {showResolved ? `Hide resolved (${resolvedCount})` : `Show resolved (${resolvedCount})`}
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={handleExpireAll}
                disabled={expiring}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
              >
                {expiring ? <Loader2 size={11} className="animate-spin" /> : null}
                Dismiss All Pending ({pendingCount})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/40 py-4">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/3 p-6 text-center text-sm text-white/30">
            No late alerts{alertCity !== "all" ? ` for ${alertCity}` : ""} today.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="py-2.5 px-4 text-white/40 font-medium">City</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Branch</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Staff</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Shift</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Type</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Alerted</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Status</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map(a => {
                  const isOpening = a.alert_type === "OPENING";
                  const isPending = !a.acknowledged_by && !!a.alert_sent_at;
                  const isOpeningPending = isOpening && isPending;
                  return (
                  <tr
                    key={a.id}
                    className={[
                      "border-b transition-colors",
                      isOpening
                        ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                        : "border-white/5 hover:bg-white/3",
                    ].join(" ")}
                    style={isOpening ? { boxShadow: "inset 3px 0 0 #ef4444" } : undefined}
                  >
                    <td className="py-2.5 px-4 text-xs text-white/50">{cityLabel(a.city)}</td>
                    <td className={`py-2.5 px-4 font-mono ${isOpening ? "text-white font-semibold" : "text-white/80"}`}>{a.branch_code}</td>
                    <td className={`py-2.5 px-4 font-medium ${isOpening ? "text-white text-base" : "text-white"}`}>
                      {isOpening && <span className="mr-1.5 text-red-400">🚨</span>}
                      {a.staff_name}
                    </td>
                    <td className={`py-2.5 px-4 tabular-nums ${isOpening ? "text-white/80 font-semibold" : "text-white/60"}`}>{fmtStartHour(a.scheduled_start)}</td>
                    <td className="py-2.5 px-4">
                      {isOpening
                        ? <span className={`inline-flex items-center gap-1 text-xs font-bold text-red-300 bg-red-500/20 border border-red-500/40 rounded-full px-2.5 py-1 tracking-wide uppercase${isOpeningPending ? " animate-pulse" : ""}`}>
                            🔴 OPENING
                          </span>
                        : <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">REGULAR</span>}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-white/40 text-xs">
                      {a.alert_sent_at ? fmtAlertTime(a.alert_sent_at, a.city) : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      {a.acknowledged_by ? (
                        <span className="text-xs text-emerald-400">
                          ✓ {a.acknowledged_by}
                          {a.ack_method === "DISCORD_DM" ? " (DM)" : ""}
                        </span>
                      ) : a.alert_sent_at ? (
                        <span className={`text-xs font-medium ${isOpening ? "text-red-400" : "text-amber-400"}`}>
                          {isOpening ? "⚡ Pending" : "Pending"}
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">Not sent</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {!a.acknowledged_by && a.alert_sent_at && (
                        <button
                          onClick={() => handleAck(a.id)}
                          disabled={acknowledging === a.id}
                          className={`text-xs font-medium disabled:opacity-40 transition-colors whitespace-nowrap ${isOpening ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"}`}
                        >
                          {acknowledging === a.id ? <Loader2 size={12} className="animate-spin inline" /> : "Mark Handled"}
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/20">
            Opening shift (earliest per branch): 20 min threshold. Other shifts: 30 min. Checked every 5 min.
          </p>
          <button
            onClick={handleLoadSchedule}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            {showSchedule ? "Hide" : "View"} Published Schedule
          </button>
        </div>

        {/* ── Published Schedule (what the late-alert engine reads) ── */}
        {showSchedule && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/2 p-4">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
              Published Shifts — {today} (what the alert engine monitors)
            </h3>
            {scheduleLoading ? (
              <div className="flex items-center gap-2 text-sm text-white/40 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : schedule.length === 0 ? (
              <p className="text-xs text-white/30">No published shifts found for today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[620px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="pb-2 pr-4 text-white/30 font-medium">City</th>
                      <th className="pb-2 pr-4 text-white/30 font-medium">Branch</th>
                      <th className="pb-2 pr-4 text-white/30 font-medium">Staff</th>
                      <th className="pb-2 pr-4 text-white/30 font-medium">Role</th>
                      <th className="pb-2 pr-4 text-white/30 font-medium">Shift</th>
                      <th className="pb-2 pr-4 text-white/30 font-medium">Clocked In</th>
                      <th className="pb-2 text-white/30 font-medium">Monitored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((s, i) => (
                      <tr key={i} className={`border-b border-white/5 ${!s.is_work_shift ? "opacity-40" : ""}`}>
                        <td className="py-1.5 pr-4 text-white/50">{cityLabel(s.city)}</td>
                        <td className="py-1.5 pr-4 font-mono text-white/70">{s.branch_code}</td>
                        <td className="py-1.5 pr-4 text-white/80">{s.staff_name}</td>
                        <td className="py-1.5 pr-4 text-white/40">{s.role || "—"}</td>
                        <td className="py-1.5 pr-4 tabular-nums text-white/70">{s.shift_time ?? "—"}</td>
                        <td className="py-1.5 pr-4">
                          {s.clocked_in
                            ? <span className="text-emerald-400">✓ Yes</span>
                            : <span className="text-white/30">No</span>}
                        </td>
                        <td className="py-1.5">
                          {s.is_work_shift
                            ? <span className="text-violet-400">Yes</span>
                            : <span className="text-white/20">Skip ({s.role})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recipient Management ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
            Discord DM Recipients
          </h2>
          <button onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-600/30 transition-colors">
            <Plus size={13} /> Add Recipient
          </button>
        </div>

        {showAddForm && (
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Display Name</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                  placeholder="e.g. Rafael"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Discord User ID</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                  placeholder="e.g. 844419400240070656"
                  value={newDiscordId}
                  onChange={e => setNewDiscordId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">City (optional)</label>
                <SelectDark
                  value={newCity}
                  onChange={v => setNewCity(v as "" | "dubai" | "manila")}
                  options={[
                    { value: "", label: "All cities" },
                    { value: "dubai", label: "Dubai only" },
                    { value: "manila", label: "Manila only" },
                  ]}
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Save
              </button>
              <button onClick={() => { setShowAddForm(false); setError(""); }}
                className="rounded-lg border border-white/10 px-4 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {recipients.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/3 p-4 text-center text-sm text-white/30">
            No recipients configured.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="py-2.5 px-4 text-white/40 font-medium">Name</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Discord ID</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">City</th>
                  <th className="py-2.5 px-4 text-white/40 font-medium">Status</th>
                  <th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id} className={`border-b border-white/5 transition-colors ${r.is_active ? "hover:bg-white/3" : "opacity-40"}`}>
                    <td className="py-2.5 px-4 text-white font-medium">{r.display_name}</td>
                    <td className="py-2.5 px-4 text-white/40 font-mono text-xs">{r.discord_user_id}</td>
                    <td className="py-2.5 px-4 text-white/50 text-xs capitalize">{r.city ?? "All"}</td>
                    <td className="py-2.5 px-4">
                      {r.is_active
                        ? <span className="text-xs text-emerald-400">Active</span>
                        : <span className="text-xs text-white/30">Inactive</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r.is_active && (
                        <button onClick={() => handleRemove(r.id)}
                          className="text-white/30 hover:text-red-400 transition-colors p-1 rounded">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Attendance Period Reports Tab ─────────────────────────────────────────────

interface ReportSummary {
  total_sessions: number;
  total_no_shows: number;
  total_late_incidents: number;
  total_out_of_range: number;
  nte_recommended_count: number;
  period_days: number;
}

interface ReportListItem {
  id: number;
  city: string;
  report_type: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  summary: ReportSummary;
}

interface StaffRow {
  staff_name: string;
  branch: string;
  late_count: number;
  avg_late_min: number;
  no_show_count: number;
  out_of_range_count: number;
  session_count: number;
  total_hours: number;
  flags: string[];
  nte_recommended: boolean;
}

interface ReportDetail extends ReportListItem {
  by_staff: StaffRow[];
  by_branch: { branch: string; late_count: number; no_show_count: number; out_of_range_count: number; session_count: number }[];
  flagged_staff: StaffRow[];
}

function ReportsTab({ city }: { city: string }) {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStart, setGenStart] = useState("");
  const [genEnd, setGenEnd] = useState("");
  const [genError, setGenError] = useState("");
  const [filterType, setFilterType] = useState<"" | "monthly" | "weekly">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `city=${city}${filterType ? `&report_type=${filterType}` : ""}`;
      const r = await apiFetch(`${API}/reports?${qs}`);
      if (r.ok) {
        const d = await r.json() as { reports: ReportListItem[] };
        setReports(d.reports ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [city, filterType]);

  useEffect(() => { load(); setDetail(null); }, [load]);

  async function openReport(id: number) {
    setDetailLoading(true);
    try {
      const r = await apiFetch(`${API}/reports/${id}`);
      if (r.ok) setDetail(await r.json() as ReportDetail);
    } finally {
      setDetailLoading(false);
    }
  }

  async function generate() {
    if (!genStart || !genEnd) { setGenError("Enter start and end dates."); return; }
    if (genStart > genEnd) { setGenError("Start must be before end."); return; }
    setGenError(""); setGenerating(true);
    try {
      const r = await apiFetch(`${API}/reports/generate`, {
        method: "POST",
        body: JSON.stringify({ city, period_start: genStart, period_end: genEnd }),
      });
      if (r.ok) {
        await load();
        const d = await r.json() as ReportDetail;
        setDetail(d);
      } else {
        const e = await r.json().catch(() => ({})) as { detail?: string };
        setGenError(e.detail ?? "Generation failed.");
      }
    } finally {
      setGenerating(false);
    }
  }

  function downloadCsv(id: number, label: string) {
    const auth = getAuth();
    const url = `/api/admin/attendance/reports/${id}/csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = label + ".csv";
    if (auth?.accessToken) {
      // Fetch with auth then trigger download
      apiFetch(`${API}/reports/${id}/csv`).then(async (r) => {
        const blob = await r.blob();
        a.href = URL.createObjectURL(blob);
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
    } else {
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }

  const NTE_COLOR = "text-red-500 font-semibold";

  return (
    <div className="space-y-6">
      {/* Generate panel */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-white/80">Generate Report</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Start Date</label>
            <input
              type="date"
              value={genStart}
              onChange={(e) => setGenStart(e.target.value)}
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">End Date</label>
            <input
              type="date"
              value={genEnd}
              onChange={(e) => setGenEnd(e.target.value)}
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className={PRIMARY_BUTTON + " flex items-center gap-1.5"}
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        {genError && <p className="text-xs text-red-400">{genError}</p>}
        <p className="text-xs text-white/40">
          Monthly reports run automatically on the 1st/2nd of each month. Weekly reports run every Monday.
          Use this panel to regenerate past periods.
        </p>
      </div>

      {/* Filter + list */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/60">Filter:</span>
        {(["", "monthly", "weekly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={filterType === t ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {t === "" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-white/40 hover:text-white transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && <p className="text-sm text-white/40 text-center py-6">Loading…</p>}

      {!loading && reports.length === 0 && (
        <p className="text-sm text-white/40 text-center py-6">No reports yet. Generate one above.</p>
      )}

      {!loading && reports.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/50 text-xs">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">No-shows</th>
                <th className="px-3 py-2 text-right">Late</th>
                <th className="px-3 py-2 text-right">GPS ⚠</th>
                <th className="px-3 py-2 text-right">NTE</th>
                <th className="px-3 py-2 text-right">Generated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((rep) => {
                const s = rep.summary ?? {} as ReportSummary;
                const isOpen = detail?.id === rep.id;
                return (
                  <Fragment key={rep.id}>
                    <tr
                      className={`border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${isOpen ? "bg-white/8" : ""}`}
                      onClick={() => isOpen ? setDetail(null) : openReport(rep.id)}
                    >
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rep.report_type === "monthly" ? "bg-indigo-500/20 text-indigo-300" : "bg-teal-500/20 text-teal-300"}`}>
                          {rep.report_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-white/80 text-xs">
                        {rep.period_start} → {rep.period_end}
                      </td>
                      <td className="px-3 py-2 text-right">{s.total_sessions ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{s.total_no_shows ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{s.total_late_incidents ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{s.total_out_of_range ?? "—"}</td>
                      <td className={`px-3 py-2 text-right ${(s.nte_recommended_count ?? 0) > 0 ? NTE_COLOR : ""}`}>
                        {s.nte_recommended_count ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-white/40 text-xs">
                        {rep.generated_at ? new Date(rep.generated_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadCsv(rep.id, `attendance_${rep.city}_${rep.period_start}`); }}
                          className="text-white/40 hover:text-white transition-colors"
                          title="Download CSV"
                        >
                          <Download size={13} />
                        </button>
                      </td>
                    </tr>

                    {/* Detail expansion */}
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="bg-white/5 px-4 py-4">
                          {detailLoading ? (
                            <div className="flex justify-center py-6">
                              <Loader2 size={20} className="animate-spin text-white/40" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-5">
                              {/* By branch */}
                              {(detail.by_branch ?? []).length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-white/60 mb-2">By Branch</p>
                                  <div className="flex flex-wrap gap-3">
                                    {detail.by_branch.map((b) => (
                                      <div key={b.branch} className="rounded-lg bg-white/8 px-3 py-2 text-xs space-y-0.5 min-w-[120px]">
                                        <p className="font-semibold text-white/90">{b.branch || "—"}</p>
                                        <p className="text-white/50">Sessions: {b.session_count}</p>
                                        <p className="text-white/50">No-shows: {b.no_show_count}</p>
                                        <p className="text-white/50">Late: {b.late_count}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Per-staff table */}
                              <div>
                                <p className="text-xs font-semibold text-white/60 mb-2">
                                  All Staff ({detail.by_staff?.length ?? 0})
                                </p>
                                <div className="overflow-x-auto rounded border border-white/10">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-white/10 text-left text-white/40">
                                        <th className="px-2 py-1.5">Name</th>
                                        <th className="px-2 py-1.5">Branch</th>
                                        <th className="px-2 py-1.5 text-right">Sessions</th>
                                        <th className="px-2 py-1.5 text-right">Late</th>
                                        <th className="px-2 py-1.5 text-right">Avg Late</th>
                                        <th className="px-2 py-1.5 text-right">No-show</th>
                                        <th className="px-2 py-1.5 text-right">GPS ⚠</th>
                                        <th className="px-2 py-1.5 text-right">Hours</th>
                                        <th className="px-2 py-1.5">Flags</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(detail.by_staff ?? []).map((s) => (
                                        <tr
                                          key={s.staff_name}
                                          className={`border-b border-white/5 ${s.nte_recommended ? "bg-red-500/10" : ""}`}
                                        >
                                          <td className="px-2 py-1.5 font-medium text-white/90">{s.staff_name}</td>
                                          <td className="px-2 py-1.5 text-white/50">{s.branch || "—"}</td>
                                          <td className="px-2 py-1.5 text-right">{s.session_count}</td>
                                          <td className={`px-2 py-1.5 text-right ${s.late_count >= 5 ? "text-red-400 font-semibold" : s.late_count >= 3 ? "text-amber-400" : ""}`}>
                                            {s.late_count}
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-white/60">{s.avg_late_min > 0 ? `${s.avg_late_min}m` : "—"}</td>
                                          <td className={`px-2 py-1.5 text-right ${s.no_show_count >= 2 ? "text-red-400 font-semibold" : ""}`}>
                                            {s.no_show_count}
                                          </td>
                                          <td className={`px-2 py-1.5 text-right ${s.out_of_range_count >= 3 ? "text-amber-400" : ""}`}>
                                            {s.out_of_range_count}
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-white/60">{s.total_hours > 0 ? `${s.total_hours}h` : "—"}</td>
                                          <td className="px-2 py-1.5">
                                            {s.flags.length > 0 ? (
                                              <span className="inline-flex gap-1 flex-wrap">
                                                {s.flags.map((f) => (
                                                  <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{f}</span>
                                                ))}
                                              </span>
                                            ) : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Attendance Summary Tab ────────────────────────────────────────────────────

type SummaryRow = {
  staff_name: string;
  branch_code: string;
  worked_days: number;
  absent_count: number;
  late_count: number;
  total_late_min: number;
  no_clockout_count: number;
};

type SortKey = "absent" | "late" | "late_min" | "name";

function AttendanceSummaryTab({ city }: { city: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [branchFilter, setBranchFilter] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("absent");
  const [sortAsc, setSortAsc] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function fetchSummary() {
    setLoading(true); setErr(""); setFetched(false);
    try {
      const p = new URLSearchParams({ city, date_from: fromDate, date_to: toDate });
      if (branchFilter.trim()) p.set("branch_code", branchFilter.trim().toUpperCase());
      const r = await apiFetch(`${API}/absent-late-summary?${p}`);
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load summary")); return; }
      const data = await r.json() as { summary: SummaryRow[] };
      setRows(data.summary ?? []);
      setFetched(true);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void fetchSummary(); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const fn: (a: SummaryRow, b: SummaryRow) => number =
      sortKey === "absent"   ? (a, b) => b.absent_count - a.absent_count :
      sortKey === "late"     ? (a, b) => b.late_count - a.late_count :
      sortKey === "late_min" ? (a, b) => b.total_late_min - a.total_late_min :
                               (a, b) => a.staff_name.localeCompare(b.staff_name);
    return [...rows].sort(sortAsc ? (a, b) => -fn(a, b) : fn);
  }, [rows, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-white/20 ml-0.5">↕</span>;
    return <span className="text-violet-400 ml-0.5">{sortAsc ? "↑" : "↓"}</span>;
  }

  function downloadCsv() {
    const header = "Staff,Branch,Worked Days,Absences,Late Count,Late Minutes,No Clockout";
    const lines = sorted.map(r =>
      [r.staff_name, r.branch_code, r.worked_days, r.absent_count,
       r.late_count, r.total_late_min, r.no_clockout_count].join(",")
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-summary-${fromDate}-${toDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalAbsent = rows.reduce((s, r) => s + r.absent_count, 0);
  const totalLate   = rows.reduce((s, r) => s + r.late_count, 0);
  const flaggedStaff = rows.filter(r => r.absent_count >= 3 || r.late_count >= 5).length;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">From</p>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">To</p>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Branch</p>
          <input type="text" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            placeholder="All" maxLength={10}
            className="w-24 rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-white placeholder:text-zinc-600" />
        </div>
        <button onClick={fetchSummary} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 px-4 py-1.5 text-sm font-semibold text-violet-300 hover:bg-violet-500/30 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {loading ? "Loading…" : "Refresh"}
        </button>
        {fetched && rows.length > 0 && (
          <button onClick={downloadCsv}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 hover:border-violet-400/20 hover:text-violet-200 transition-colors">
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* KPI cards */}
      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Staff", value: rows.length, icon: <User size={14} />, color: "text-white" },
            { label: "Total Absences", value: totalAbsent, icon: <AlertTriangle size={14} />, color: totalAbsent > 0 ? "text-red-400" : "text-white" },
            { label: "Total Late", value: totalLate, icon: <Clock size={14} />, color: totalLate > 0 ? "text-amber-400" : "text-white" },
            { label: "Flagged Staff", value: flaggedStaff, icon: <BarChart2 size={14} />, color: flaggedStaff > 0 ? "text-orange-400" : "text-white" },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">{k.icon}{k.label}</div>
              <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {fetched && rows.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-8">No attendance data for the selected period.</p>
      )}
      {fetched && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort("name")} className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Staff <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Branch</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Worked</th>
                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort("absent")} className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Absent <SortIcon k="absent" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort("late")} className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Late <SortIcon k="late" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort("late_min")} className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Late Time <SortIcon k="late_min" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-500">No C/O</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const absentFlag = row.absent_count >= 3;
                const lateFlag   = row.late_count >= 5;
                const lateMinFmt = row.total_late_min === 0 ? "—"
                  : row.total_late_min < 60 ? `${row.total_late_min}m`
                  : `${Math.floor(row.total_late_min / 60)}h ${row.total_late_min % 60}m`;
                return (
                  <tr key={row.staff_name} className={`border-b border-white/5 transition-colors hover:bg-white/3 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}>
                    <td className="px-4 py-2.5 font-medium text-white">{row.staff_name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{row.branch_code || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{row.worked_days}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.absent_count > 0 ? (
                        <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${absentFlag ? "bg-red-500/20 text-red-300" : "bg-zinc-700/50 text-zinc-300"}`}>
                          {row.absent_count}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.late_count > 0 ? (
                        <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${lateFlag ? "bg-amber-500/20 text-amber-300" : "bg-zinc-700/50 text-zinc-300"}`}>
                          {row.late_count}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${row.total_late_min >= 60 ? "text-amber-400" : "text-zinc-400"}`}>
                      {lateMinFmt}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-zinc-500">
                      {row.no_clockout_count > 0 ? row.no_clockout_count : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {absentFlag && lateFlag ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                          <AlertTriangle size={9} /> High Risk
                        </span>
                      ) : absentFlag ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                          Absent ▲
                        </span>
                      ) : lateFlag ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          Late ▲
                        </span>
                      ) : (
                        <span className="text-zinc-700 text-[10px]">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-zinc-600">
            {rows.length} staff · Flagged: Absent ≥ 3 days (red) or Late ≥ 5 times (amber)
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "report" | "staff_report" | "summary" | "gps" | "corrections" | "compliance" | "late_alerts" | "reports";

export default function OsAttendanceAdminPage() {
  const router = useRouter();
  // useState(null) avoids SSR/hydration mismatch; useEffect reads localStorage after mount
  const [auth, setAuthState] = useState<Auth | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [city, setCity] = useState<"dubai" | "manila">("manila");
  const [pendingCorrections, setPendingCorrections] = useState(0);

  // Read auth from localStorage after mount (bypasses SSR where localStorage is unavailable)
  useEffect(() => {
    const a = getAuth();
    setAuthState(a);
    if (!a) { router.replace("/login"); return; }
    const r = String(a.role ?? "").toUpperCase();
    if (!canAccessOsAttendanceAdmin(a) && r !== "HQ" && r !== "ADMIN") {
      router.replace("/week");
    }
  }, [router]);

  // Poll pending correction count for badge
  useEffect(() => {
    async function fetchCount() {
      try {
        const r = await apiFetch(`${API}/corrections?city=${city}&status=pending&limit=1`);
        if (r.ok) {
          const d = await r.json() as { pending_count?: number };
          setPendingCorrections(d.pending_count ?? 0);
        }
      } catch { /* badge is best-effort */ }
    }
    void fetchCount();
  }, [city]);

  const role = auth?.role ?? "";
  // Per CLAUDE.md: always include role checks to avoid locking out HQ/ADMIN users
  // who may not have explicit channel permissions but still need full access.
  const hasAccess = !auth || canAccessOsAttendanceAdmin(auth) || role === "HQ" || role === "ADMIN";

  if (!auth || !hasAccess) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">OS ATTENDANCE ADMIN</p>
            <h1 className={T_PAGE_TITLE}>OS Attendance</h1>
            <p className="text-sm text-white/40 mt-1">WebAuthn + GPS clock-in/out management · Branch GPS configuration</p>
          </div>
          <div className="flex gap-2">
            {(["manila", "dubai"] as const).map(c => (
              <button key={c} onClick={() => setCity(c)}
                className={city === c
                  ? "rounded-lg bg-violet-500/20 border border-violet-500/40 px-4 py-1.5 text-sm font-semibold text-violet-300"
                  : "rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/50 hover:text-white hover:border-white/20 transition-colors"}>
                {c === "manila" ? "Manila" : "Dubai"}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("report")} className={tab === "report" ? TAB_ACTIVE : TAB_INACTIVE}>
            Daily Report
          </button>
          <button onClick={() => setTab("staff_report")} className={`${tab === "staff_report" ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            <User size={13} />
            Staff Report
          </button>
          <button onClick={() => setTab("summary")} className={`${tab === "summary" ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            <BarChart2 size={13} />
            Summary
          </button>
          <button onClick={() => setTab("corrections")} className={`${tab === "corrections" ? TAB_ACTIVE : TAB_INACTIVE} relative`}>
            Corrections
            {pendingCorrections > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white min-w-[18px] h-[18px] px-1">
                {pendingCorrections}
              </span>
            )}
          </button>
          <button onClick={() => setTab("gps")} className={tab === "gps" ? TAB_ACTIVE : TAB_INACTIVE}>
            GPS Settings
          </button>
          <button onClick={() => setTab("compliance")} className={tab === "compliance" ? TAB_ACTIVE : TAB_INACTIVE}>
            Shift Compliance
          </button>
          <button onClick={() => setTab("late_alerts")} className={`${tab === "late_alerts" ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            🔔 Late Alerts
          </button>
          <button onClick={() => setTab("reports")} className={`${tab === "reports" ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            📊 Reports
          </button>
        </div>

        {/* Content */}
        <div className={GLASS_CARD + " p-6"}>
          {tab === "report" && <DailyReportTab city={city} />}
          {tab === "staff_report" && <StaffReportTab city={city} />}
          {tab === "summary" && <AttendanceSummaryTab key={city} city={city} />}
          {tab === "corrections" && <CorrectionsTab city={city} />}
          {tab === "gps" && <GpsTab city={city} />}
          {tab === "compliance" && <ShiftComplianceTab key={city} city={city} />}
          {tab === "late_alerts" && <LateAlertsTab />}
          {tab === "reports" && <ReportsTab key={city} city={city} />}
        </div>
      </div>
    </main>
  );
}
