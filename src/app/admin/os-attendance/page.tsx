"use client";

import {
  CheckCircle, ChevronDown, ChevronRight, Download, Fingerprint,
  Loader2, MapPin, Pencil, Plus, RefreshCw, Trash2, XCircle,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessOsAttendanceAdmin, getAuth } from "@/lib/auth";
import {
  GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE,
  TAB_ACTIVE, TAB_INACTIVE, BADGE_SUCCESS, BADGE_ERROR, BADGE_WARNING,
} from "@/lib/ui-tokens";

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
  check_in_gps_ok: boolean | null;
  check_out_gps_ok: boolean | null;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  note: string;
  visits: Visit[];
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

function sessionStatus(s: AttendanceSession): "clocked_out" | "on_shift" | "not_clocked_in" {
  if (s.check_out_at) return "clocked_out";
  if (s.check_in_at) return "on_shift";
  return "not_clocked_in";
}

function StatusBadge({ s }: { s: AttendanceSession }) {
  const st = sessionStatus(s);
  if (st === "clocked_out") return <span className={BADGE_SUCCESS}><CheckCircle size={10} />Clocked Out</span>;
  if (st === "on_shift") return <span className={BADGE_WARNING}><Loader2 size={10} className="animate-spin" />On Shift</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-white/40">Not Clocked In</span>;
}

function GpsBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-white/30 text-xs">—</span>;
  if (ok) return <span className={BADGE_SUCCESS}><CheckCircle size={10} />In Range</span>;
  return <span className={BADGE_ERROR}><XCircle size={10} />Out of Range</span>;
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
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Set GPS coordinates and geofence radius per branch. Branches without GPS configured skip the location check.</p>
        <div className="flex gap-2">
          <button onClick={() => { void load(); }} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors">
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
            <button onClick={() => setAdding(false)} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
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
                  <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
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
    // Frontend validation: clock-out cannot be before clock-in (same work_date)
    if (form.check_in_time && form.check_out_time && form.check_out_time < form.check_in_time) {
      setErr("Clock-out time cannot be earlier than clock-in time"); return;
    }
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
        const iso = localTimeToIso(session.work_date, form.check_out_time, session.city);
        if (!iso) { setErr("Invalid clock-out time — please re-enter"); setBusy(false); return; }
        body.check_out_at = iso;
      } else {
        body.check_out_at = "";
      }
      const r = await apiFetch(`${API}/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to save changes")); return; }
      const d = await r.json() as { session?: Partial<AttendanceSession> };
      // Merge: d.session has updated times, keep visits from local state, carry note from form
      onSaved({ ...session, ...(d.session ?? {}), visits: session.visits, note: form.note });
    } catch {
      setErr("Failed to save changes — please try again");
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none";

  return (
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
    </div>
  );
}

// ── Daily Report Tab ──────────────────────────────────────────────────────────

const SELECT_CLS = "rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none cursor-pointer";

function DailyReportTab({ city }: { city: string }) {
  // Initialize to today in the city's local timezone
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: cityTz(city) }).format(new Date())
  );
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
  // Stale-fetch guard: increment on each load, discard results from older calls
  const loadCountRef = useRef(0);

  // Reset per-city state when city switches
  useEffect(() => {
    setDate(new Intl.DateTimeFormat("en-CA", { timeZone: cityTz(city) }).format(new Date()));
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
      const params = new URLSearchParams({ city, work_date: date, limit: "500" });
      if (staffFilter) params.set("staff_name", staffFilter);
      if (branchFilter) params.set("branch_code", branchFilter);
      const r = await apiFetch(`${API}/daily-report?${params}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setLoadErr(await extractApiError(r, "Failed to load attendance records")); return; }
      const d = await r.json() as { sessions?: AttendanceSession[] };
      if (id !== loadCountRef.current) return;
      setSessions(d.sessions ?? []);
    } catch {
      if (id !== loadCountRef.current) return;
      setLoadErr("Failed to load attendance records");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, [city, date, staffFilter, branchFilter]);

  useEffect(() => { void load(); }, [load]);

  // Client-side status filter
  const filtered = useMemo(() => {
    if (!statusFilter) return sessions;
    return sessions.filter(s => sessionStatus(s) === statusFilter);
  }, [sessions, statusFilter]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete(s: AttendanceSession) {
    if (!confirm(`Delete attendance record for ${s.staff_name} on ${s.work_date}? This cannot be undone.`)) return;
    setDeletingId(s.id); setLoadErr("");
    try {
      const r = await apiFetch(`${API}/sessions/${s.id}`, { method: "DELETE" });
      if (!r.ok) { setLoadErr(await extractApiError(r, "Failed to delete record")); return; }
      setSessions(prev => prev.filter(x => x.id !== s.id));
      setExpandedIds(prev => { const n = new Set(prev); n.delete(s.id); return n; });
    } catch {
      setLoadErr("Failed to delete record — please try again");
    } finally { setDeletingId(null); }
  }

  function handleSaved(updated: AttendanceSession) {
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    setEditingSession(null);
  }

  // CSV export
  function downloadCsv() {
    const cols = ["Staff Name", "Branch", "Date", "Status", "Clock In", "Clock Out", "Hours Worked", "GPS In", "GPS Out", "Branch Visits", "Note"];
    const rows = filtered.map(s => [
      s.staff_name,
      s.branch_code || "",
      s.work_date,
      sessionStatus(s).replaceAll("_", " "),
      fmtTime(s.check_in_at, cityTz(city)),
      fmtTime(s.check_out_at, cityTz(city)),
      fmtDuration(s.check_in_at, s.check_out_at),
      s.check_in_gps_ok === null ? "" : s.check_in_gps_ok ? "In Range" : "Out of Range",
      s.check_out_gps_ok === null ? "" : s.check_out_gps_ok ? "In Range" : "Out of Range",
      String(s.visits?.length ?? 0),
      s.note || "",
    ]);
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

  const cellCls = "py-3 pr-3 text-sm align-middle";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date */}
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />

        {/* Staff name dropdown */}
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className={SELECT_CLS} disabled={metaBusy}>
          <option value="">All Staff</option>
          {meta.staff_names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Branch dropdown */}
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className={SELECT_CLS} disabled={metaBusy}>
          <option value="">All Branches</option>
          {meta.branch_codes.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Status dropdown */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={SELECT_CLS}>
          <option value="">All Status</option>
          <option value="on_shift">On Shift</option>
          <option value="clocked_out">Clocked Out</option>
          <option value="not_clocked_in">Not Clocked In</option>
        </select>

        <button onClick={() => { void load(); }} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors">
          <RefreshCw size={12} />Refresh
        </button>

        <button onClick={downloadCsv} disabled={filtered.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40">
          <Download size={12} />Download CSV
        </button>
      </div>

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
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Status</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Clock In</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">GPS</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Clock Out</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">GPS</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Hours</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium">Visits</th>
                <th className="pb-2.5 pt-2.5 pr-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(s => {
                const expanded = expandedIds.has(s.id);
                const deleting = deletingId === s.id;
                const visitCount = s.visits?.length ?? 0;
                const hasNote = !!s.note;
                const expandable = visitCount > 0 || hasNote;
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
                      <td className={`${cellCls} font-medium text-white`}>{s.staff_name}</td>
                      <td className={`${cellCls} text-white/50`}>{s.branch_code || "—"}</td>
                      <td className={`${cellCls}`}><StatusBadge s={s} /></td>
                      <td className={`${cellCls} text-white/80`}>{fmtTime(s.check_in_at, cityTz(city))}</td>
                      <td className={`${cellCls}`}><GpsBadge ok={s.check_in_gps_ok} /></td>
                      <td className={`${cellCls} text-white/80`}>{fmtTime(s.check_out_at, cityTz(city))}</td>
                      <td className={`${cellCls}`}><GpsBadge ok={s.check_out_gps_ok} /></td>
                      <td className={`${cellCls} text-white/60`}>{fmtDuration(s.check_in_at, s.check_out_at)}</td>
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
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingSession(s)}
                            className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-white hover:border-white/20 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => { void handleDelete(s); }} disabled={deleting}
                            className="rounded-lg border border-red-500/20 p-1.5 text-red-400/50 hover:text-red-400 hover:border-red-500/40 transition-colors">
                            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail: visits table + note */}
                    {expanded && expandable && (
                      <tr key={`${s.id}-visits`} className="bg-white/2">
                        <td colSpan={11} className="pl-10 pr-3 pb-3 pt-1">
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
                            <p className={`${visitCount > 0 ? "mt-2" : ""} text-xs text-white/40 italic`}>Note: {s.note}</p>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "report" | "gps";

export default function OsAttendanceAdminPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const role = auth?.role ?? "";
  const [tab, setTab] = useState<Tab>("report");
  const [city, setCity] = useState<"dubai" | "manila">("manila");

  // Per CLAUDE.md: always include role checks to avoid locking out HQ/ADMIN users
  // who may not have explicit channel permissions but still need full access.
  const hasAccess = canAccessOsAttendanceAdmin(auth) || role === "HQ" || role === "ADMIN";

  useEffect(() => {
    if (!hasAccess) {
      router.replace("/week");
    }
  }, [hasAccess, router]);

  if (!hasAccess) return null;

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
        <div className="flex gap-2">
          <button onClick={() => setTab("report")} className={tab === "report" ? TAB_ACTIVE : TAB_INACTIVE}>
            Daily Report
          </button>
          <button onClick={() => setTab("gps")} className={tab === "gps" ? TAB_ACTIVE : TAB_INACTIVE}>
            GPS Settings
          </button>
        </div>

        {/* Content */}
        <div className={GLASS_CARD + " p-6"}>
          {tab === "report" && <DailyReportTab city={city} />}
          {tab === "gps" && <GpsTab city={city} />}
        </div>
      </div>
    </main>
  );
}
