"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BarChart2,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Info,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import DateRangePicker from "@/components/DateRangePicker";
import SelectDark from "@/components/SelectDark";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DANGER_BUTTON,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  SECONDARY_BUTTON,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TEXTAREA_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type AbsenceType =
  | "DAY_OFF"
  | "VACATION_LEAVE"
  | "MATERNITY_LEAVE"
  | "MEDICAL_LEAVE"
  | "INJURY"
  | "HOSPITAL"
  | "ABSENT"
  | "BEREAVEMENT_LEAVE";

type ReasonCategory = "SICK" | "FAMILY" | "PERSONAL" | "OTHER" | "";

type AbsenceRow = {
  work_date: string;
  staff_name: string;
  absence_type: AbsenceType | string;
  note?: string;
  branch_hint?: string;
  reason_category?: ReasonCategory | string;
  source_sheet_name?: string;
  created_at?: string | null;
  /** "" = nobody has said yet. Not the same as NO — the NTE rules need the difference. */
  prior_notice?: AbsenceFlag | string;
  mc_submitted?: AbsenceFlag | string;
  flags_updated_by?: string;
};

/** "" unrecorded · YES · NO · NA (not applicable) */
type AbsenceFlag = "" | "YES" | "NO" | "NA";

const NOTICE_OPTIONS: Array<{ value: AbsenceFlag; label: string }> = [
  { value: "",    label: "—" },
  { value: "YES", label: "Told us" },
  { value: "NO",  label: "No word" },
];

const MC_OPTIONS: Array<{ value: AbsenceFlag; label: string }> = [
  { value: "",    label: "—" },
  { value: "YES", label: "Submitted" },
  { value: "NO",  label: "Not submitted" },
  { value: "NA",  label: "N/A" },
];

function flagClass(v: string | undefined): string {
  if (v === "YES") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (v === "NO") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (v === "NA") return "border-zinc-600/40 bg-zinc-700/20 text-zinc-400";
  return "border-white/10 bg-white/5 text-zinc-500";
}

const REASON_CATEGORIES: Array<{ value: ReasonCategory; label: string; emoji: string; color: string }> = [
  { value: "",         label: "— No category —", emoji: "",   color: "" },
  { value: "SICK",     label: "Sick",             emoji: "🤒", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { value: "FAMILY",   label: "Family",           emoji: "👨‍👩‍👧", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { value: "PERSONAL", label: "Personal",         emoji: "👤", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { value: "OTHER",    label: "Other",            emoji: "📝", color: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
];

type AbsenceListResp = {
  ok?: boolean;
  rows?: AbsenceRow[];
};

type StaffNamesResp = {
  ok?: boolean;
  names?: string[];
};

const API_BASE = "";

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
  // Use local date to avoid UTC offset causing wrong date in Dubai/Manila timezones
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function yesterdayIso() {
  return addDaysIso(todayIso(), -1);
}

function addDaysIso(base: string, days: number) {
  // Parse date parts and use Date.UTC to avoid local timezone shifting the result
  const [y, m, d] = base.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function norm(s: unknown) {
  return String(s ?? "").trim();
}

// 正規休暇を除外し、欠勤（ABSENT / MEDICAL_LEAVE / INJURY / HOSPITAL）のみ表示
const PLANNED_LEAVE_TYPES = new Set(["DAY_OFF", "VACATION_LEAVE", "MATERNITY_LEAVE", "BEREAVEMENT_LEAVE"]);
function isUnplannedAbsence(type: string): boolean {
  return !PLANNED_LEAVE_TYPES.has(norm(type).toUpperCase());
}

function toTitleAbsenceType(t: string) {
  const x = norm(t).toUpperCase();
  const found = ABSENCE_TYPES.find((a) => a.value === x);
  return found?.label || x || "-";
}

function badgeClassForType(t: string) {
  const x = norm(t).toUpperCase();
  if (x === "ABSENT") return BADGE_ERROR;
  if (x === "LATE" || x === "INJURY" || x === "HOSPITAL" || x === "MEDICAL_LEAVE") return BADGE_WARNING;
  if (
    x === "LEAVE" ||
    x === "DAY_OFF" ||
    x === "VACATION_LEAVE" ||
    x === "MATERNITY_LEAVE" ||
    x === "BEREAVEMENT_LEAVE"
  ) {
    return BADGE_INFO;
  }
  if (x === "PRESENT" || x === "APPROVED") return BADGE_SUCCESS;
  return BADGE_INFO;
}

function buildHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("sushizen_shift_auth");
      const obj = raw ? JSON.parse(raw) : null;
      if (obj?.accessToken) h["Authorization"] = `Bearer ${obj.accessToken}`;
    } catch { /* ignore */ }
  }
  return h;
}

async function apiGet<T = any>(path: string, approverPin?: string): Promise<T> {
  // The PIN travels in a header, never the query string, so it stays out of
  // access logs and browser history.
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { ...buildHeaders(), ...(approverPin ? { "X-Approver-Pin": approverPin } : {}) },
  });
  const text = await res.text();

  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const j = JSON.parse(text);
      errMsg = j?.detail || j?.message || errMsg;
    } catch {
      if (text) errMsg = text;
    }
    throw new Error(errMsg);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const j = JSON.parse(text);
      errMsg = j?.detail || j?.message || errMsg;
    } catch {
      if (text) errMsg = text;
    }
    throw new Error(errMsg);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── Note cell: truncated preview + click-to-expand modal ──────────────────

function CategoryBadge({ category }: { category?: string | null }) {
  const cat = REASON_CATEGORIES.find(c => c.value === (category || "").toUpperCase());
  if (!cat || !cat.value) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cat.color}`}>
      <span>{cat.emoji}</span>
      <span>{cat.label}</span>
    </span>
  );
}

function NoteCell({ note, category }: { note?: string | null; category?: string | null }) {
  const [open, setOpen] = useState(false);
  const text = note?.trim() || "";
  const hasCategory = !!(category || "").trim();
  if (!text && !hasCategory) return <span className="text-neutral-600">—</span>;
  const isLong = text.length > 48;
  return (
    <>
      <div className="flex flex-col gap-1 min-w-0">
        {hasCategory && <CategoryBadge category={category} />}
        {text && (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={isLong ? "truncate max-w-[130px] inline-block align-bottom" : ""}>
              {text}
            </span>
            {isLong && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-white/8 text-white/45 hover:bg-white/15 hover:text-white/80 transition-colors"
              >
                View
              </button>
            )}
          </span>
        )}
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  Note / Shift
                </p>
                <CategoryBadge category={category} />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap break-words">
              {text}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** Label for the range the displayed rows came from — never for the pickers. */
function rangeLabel(r: { from: string; to: string } | null): string {
  if (!r) return "";
  return r.from === r.to ? r.from : `${r.from} → ${r.to}`;
}

// ── Absence Report city section ────────────────────────────────────────────

function ReportCitySection({
  city,
  rows,
}: {
  city: "dubai" | "manila";
  rows: AbsenceRow[];
}) {
  const isDubai = city === "dubai";
  const flag = isDubai ? "🇦🇪" : "🇵🇭";
  const label = isDubai ? "Dubai" : "Manila";
  const accent = isDubai ? "text-amber-400" : "text-sky-400";
  const dotColor = isDubai ? "bg-amber-400" : "bg-sky-400";
  const headerBg = isDubai ? "bg-amber-500/8" : "bg-sky-500/8";

  const absentCount = rows.filter(r => norm(r.absence_type).toUpperCase() === "ABSENT").length;
  const leaveCount = rows.length - absentCount;

  if (rows.length === 0) {
    return (
      <div className={`rounded-xl border ${isDubai ? "border-amber-500/15" : "border-sky-500/15"} bg-neutral-900/30 p-4`}>
        <div className="flex items-center gap-2 mb-2">
          <span>{flag}</span>
          <span className={`text-sm font-semibold ${accent}`}>{label}</span>
          <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${BADGE_SUCCESS}`}>
            All present
          </span>
        </div>
        <p className="text-xs text-neutral-500 text-center py-2">No absences in this period</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${isDubai ? "border-amber-500/15" : "border-sky-500/15"} overflow-hidden`}>
      {/* City header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerBg}`}>
        <span>{flag}</span>
        <span className={`text-sm font-semibold ${accent}`}>{label}</span>
        <div className="ml-auto flex gap-2">
          {absentCount > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_ERROR}`}>
              {absentCount} Absent
            </span>
          )}
          {leaveCount > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_INFO}`}>
              {leaveCount} Leave
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className={`${TABLE_HEADER} px-4 text-left w-24`}>Date</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Staff</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Branch</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Type</th>
              <th className={`${TABLE_HEADER} px-4 text-left`}>Note / Shift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={TABLE_ROW}>
                <td className={`${TABLE_CELL} px-4 tabular-nums text-xs text-neutral-400`}>
                  {r.work_date || "-"}
                </td>
                <td className={`${TABLE_CELL} px-4 font-medium`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                    {r.staff_name || "-"}
                  </div>
                </td>
                <td className={`${TABLE_CELL} px-4 text-neutral-400`}>
                  {r.branch_hint || <span className="text-neutral-600">—</span>}
                </td>
                <td className={`${TABLE_CELL} px-4`}>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${badgeClassForType(r.absence_type)}`}>
                    {toTitleAbsenceType(r.absence_type)}
                  </span>
                </td>
                <td className={`${TABLE_CELL} px-4 text-xs text-neutral-400`}>
                  <NoteCell note={r.note} category={r.reason_category} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── Leave Cases ─────────────────────────────────────────────────────────────

type LeaveType = { key: string; label: string; days: number | null; maternity: boolean };
type LeaveCase = {
  id: number; staff_name: string; leave_type: string; label: string;
  start_date: string; end_date: string | null; edd: string | null;
  actual_delivery_date: string | null; sss_notified_at: string | null;
  status: string; days_generated: number; maternity: boolean; note: string;
};
type Schedule = {
  end_date: string; total_days: number | null;
  prenatal_days?: number; postnatal_days?: number;
  suggested_end_date?: string; warnings: string[]; blockers: string[];
};

/**
 * A stretch of leave, held as one record.
 *
 * The 105 days may be split around the birth but at least 60 must fall after
 * it, and that is settled against the actual delivery date rather than the
 * estimate. So the arithmetic is shown here before anything is written — a
 * screen that reports a short postnatal period after laying down 105 day rows
 * has reported it too late.
 */
function LeaveCases({ city, staffOptions }: { city: string; staffOptions: string[] }) {
  const [rows, setRows] = useState<LeaveCase[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [staff, setStaff] = useState("");
  const [type, setType] = useState("maternity_105");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [edd, setEdd] = useState("");
  const [delivery, setDelivery] = useState("");
  const [sssAt, setSssAt] = useState("");
  const [note, setNote] = useState("");
  const [sched, setSched] = useState<Schedule | null>(null);

  const spec = types.find(t => t.key === type);
  const isMaternity = !!spec?.maternity;
  const needsEnd = spec ? spec.days === null : false;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leave-cases?city=${encodeURIComponent(city)}`, {
        headers: buildHeaders(), cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setRows(j.rows || []);
      setTypes(j.types || []);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  const body = () => ({
    case_id: editId, city, staff_name: staff, leave_type: type,
    start_date: start, end_date: end, edd,
    actual_delivery_date: delivery, sss_notified_at: sssAt, note,
  });

  // Re-run whenever a date that changes the split changes, so the numbers on
  // screen always describe the form as it stands rather than as it was.
  useEffect(() => {
    if (!start || !type) { setSched(null); return; }
    if (needsEnd && !end) { setSched(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/leave-cases/preview", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify(body()),
        });
        const j = await res.json().catch(() => null);
        if (!cancelled) setSched(res.ok ? (j as Schedule) : null);
      } catch { if (!cancelled) setSched(null); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, start, end, delivery, needsEnd]);

  function reset() {
    setEditId(null); setStaff(""); setType("maternity_105"); setStart("");
    setEnd(""); setEdd(""); setDelivery(""); setSssAt(""); setNote(""); setSched(null);
  }

  function edit(r: LeaveCase) {
    setEditId(r.id); setStaff(r.staff_name); setType(r.leave_type);
    setStart(r.start_date); setEnd(r.end_date || ""); setEdd(r.edd || "");
    setDelivery(r.actual_delivery_date || ""); setSssAt(r.sss_notified_at || "");
    setNote(r.note || ""); setOpen(true);
  }

  async function save(endOverride?: string) {
    if (!staff || !start) { setMsg({ kind: "err", text: "Staff and start date are required." }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/leave-cases", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ ...body(), end_date: endOverride ?? end }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: `${staff}: ${j.absence_days} day(s) recorded, ${j.start_date} → ${j.end_date}.` });
      reset(); setOpen(false); await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  async function withdraw(r: LeaveCase) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/leave-cases/${r.id}`, {
        method: "DELETE", headers: buildHeaders(),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: `${r.staff_name}: ${j.days_removed} day(s) withdrawn.` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  const active = rows.filter(r => r.status === "active");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className={GLASS_CARD + " p-5"}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-violet-400" />
        <h2 className={T_SECTION}>Leave Cases</h2>
        <span className={T_CAPTION}>
          Maternity and other long leave. The days are written from the case, not entered one by one.
        </span>
        <button
          onClick={() => { reset(); setOpen(o => !o); }}
          className={`${SMALL_BUTTON} ml-auto`}
        >
          {open ? "Close" : "New case"}
        </button>
      </div>

      {msg && (
        <div className={`mb-3 rounded-lg border p-2.5 text-sm ${
          msg.kind === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
          {msg.text}
        </div>
      )}

      {open && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className={T_LABEL + " mb-1"}>Staff</div>
              <SelectDark value={staff} onChange={setStaff} options={staffOptions} placeholder="Select staff" />
            </div>
            <div className="sm:col-span-2">
              <div className={T_LABEL + " mb-1"}>Type</div>
              <SelectDark
                value={type}
                onChange={setType}
                options={types.map(t => ({ value: t.key, label: t.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <div className={T_LABEL + " mb-1"}>Leave starts</div>
              <input type="date" className={INPUT_CLASS} value={start}
                     onChange={e => setStart(e.target.value)} />
            </div>
            {needsEnd && (
              <div>
                <div className={T_LABEL + " mb-1"}>Leave ends</div>
                <input type="date" className={INPUT_CLASS} value={end}
                       onChange={e => setEnd(e.target.value)} />
              </div>
            )}
            {isMaternity && (
              <>
                <div>
                  <div className={T_LABEL + " mb-1"}>Expected date (EDD)</div>
                  <input type="date" className={INPUT_CLASS} value={edd}
                         onChange={e => setEdd(e.target.value)} />
                </div>
                <div>
                  <div className={T_LABEL + " mb-1"}>Actual delivery</div>
                  <input type="date" className={INPUT_CLASS} value={delivery}
                         onChange={e => setDelivery(e.target.value)} />
                  <div className={T_CAPTION + " mt-1"}>Fill in later; the split is settled against this.</div>
                </div>
                <div>
                  <div className={T_LABEL + " mb-1"}>SSS notified</div>
                  <input type="date" className={INPUT_CLASS} value={sssAt}
                         onChange={e => setSssAt(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div>
            <div className={T_LABEL + " mb-1"}>Note</div>
            <input className={INPUT_CLASS} value={note} onChange={e => setNote(e.target.value)}
                   placeholder="Doctor's certificate ref, application date, anything HR will need later" />
          </div>

          {sched && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <div className="text-zinc-200">
                <span className="tabular-nums">{sched.total_days}</span> day(s) ·{" "}
                <span className="tabular-nums">{start}</span> →{" "}
                <span className="tabular-nums">{sched.end_date}</span>
                {sched.prenatal_days !== undefined && (
                  <span className="text-zinc-400">
                    {" "}· before the birth <span className="tabular-nums">{sched.prenatal_days}</span>,
                    after <span className="tabular-nums">{sched.postnatal_days}</span>
                  </span>
                )}
              </div>
              {sched.blockers.map((b, i) => (
                <div key={i} className="mt-1.5 text-red-300">{b}</div>
              ))}
              {sched.warnings.map((w, i) => (
                <div key={i} className="mt-1.5 text-amber-300">{w}</div>
              ))}
              {sched.suggested_end_date && (
                <button
                  onClick={() => save(sched.suggested_end_date)}
                  disabled={busy}
                  className={`${SMALL_BUTTON} mt-2 border-amber-400/40 text-amber-200`}
                >
                  Extend to {sched.suggested_end_date} and save
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => save()}
            disabled={busy || !staff || !start || !!sched?.blockers?.length}
            className={PRIMARY_BUTTON + " w-full disabled:opacity-40"}
          >
            {busy ? "Saving…" : editId ? "Update case and re-write the days" : "Create case and write the days"}
          </button>
        </div>
      )}

      {active.length === 0 ? (
        <p className={T_CAPTION}>No leave cases for this city.</p>
      ) : (
        <div className="space-y-2">
          {active.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="min-w-[10rem] flex-1">
                <div className="text-sm font-medium text-white">{r.staff_name}</div>
                <div className={T_CAPTION}>{r.label}</div>
              </div>
              <div className="text-xs tabular-nums text-zinc-300">
                {r.start_date} → {r.end_date || "—"}
                <span className="ml-2 text-zinc-500">{r.days_generated} days</span>
              </div>
              {r.maternity && (
                <div className="text-xs text-zinc-400">
                  {r.actual_delivery_date
                    ? <>born {r.actual_delivery_date}</>
                    : r.edd ? <>due {r.edd}</> : null}
                  {!r.sss_notified_at && (
                    <span className="ml-2 rounded border border-amber-500/40 px-1.5 py-0.5 text-amber-300">
                      SSS not notified
                    </span>
                  )}
                </div>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => edit(r)} className={SMALL_BUTTON}>Edit</button>
                <button onClick={() => withdraw(r)} disabled={busy}
                        className={`${SMALL_BUTTON} border-red-500/30 text-red-300`}>
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminAbsencesPage() {
  const auth = getAuth();

  const initialCity: City = auth?.city === "manila" ? "manila" : "dubai";
  const [city, setCity] = useState<City>(initialCity);
  const [approverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [staffName, setStaffName] = useState<string>("");
  const [workDate, setWorkDate] = useState<string>(todayIso());
  const [absenceType, setAbsenceType] = useState<AbsenceType>("ABSENT");
  const [note, setNote] = useState<string>("");
  const [branchHint, setBranchHint] = useState<string>("");
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>("");

  const [bulkSelectedNames, setBulkSelectedNames] = useState<string[]>([]);
  const [bulkNameSearch, setBulkNameSearch] = useState<string>("");
  const [bulkDateFrom, setBulkDateFrom] = useState<string>(todayIso());
  const [bulkDateTo, setBulkDateTo] = useState<string>(todayIso());
  const [bulkAbsenceType, setBulkAbsenceType] = useState<AbsenceType>("DAY_OFF");
  const [bulkNote, setBulkNote] = useState<string>("");
  const [bulkBranchHint, setBulkBranchHint] = useState<string>("");
  const [bulkReasonCategory, setBulkReasonCategory] = useState<ReasonCategory>("");

  // Absence Report state (both cities, configurable date range)
  const [reportDateFrom, setReportDateFrom] = useState<string>(yesterdayIso());
  const [reportDateTo, setReportDateTo] = useState<string>(todayIso());
  const [reportDubai, setReportDubai] = useState<AbsenceRow[] | null>(null);
  const [reportManila, setReportManila] = useState<AbsenceRow[] | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  // The range the rows on screen actually came from. The heading used to read
  // the pickers instead, so pressing Today relabelled yesterday's rows as
  // today's until someone thought to press Load Report.
  const [reportLoadedRange, setReportLoadedRange] = useState<{ from: string; to: string } | null>(null);

  // History state
  const [filterStaffName, setFilterStaffName] = useState<string>("");
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(addDaysIso(todayIso(), -14));
  const [dateTo, setDateTo] = useState<string>(addDaysIso(todayIso(), 14));
  const [rows, setRows] = useState<AbsenceRow[] | null>(null); // null = never loaded
  const [historyLoading, setHistoryLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<AbsenceRow | null>(null);

  // ── Staleness tracking ───────────────────────────────────────────────────
  type CheckStatus = { city: string; checked_by: string | null; checked_at: string | null; weekdays_since: number; stale: boolean };
  const [checkStatus, setCheckStatus] = useState<CheckStatus[]>([]);
  const [marking, setMarking] = useState(false);
  const [markMsg, setMarkMsg] = useState<string | null>(null);

  const handleReportDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setReportDateFrom(next);
    if (reportDateTo && next > reportDateTo) setReportDateTo(next);
  };

  const handleReportDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setReportDateTo(next);
    if (reportDateFrom && next < reportDateFrom) setReportDateFrom(next);
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

  const filteredBulkOptions = useMemo(() => {
    const q = bulkNameSearch.trim().toLowerCase();
    if (!q) return staffOptions;
    return staffOptions.filter((n) => n.toLowerCase().includes(q));
  }, [staffOptions, bulkNameSearch]);
  const canAuth = useMemo(() => !!norm(approverName) && !!norm(pin), [approverName, pin]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (!filterBranch) return rows;
    return rows.filter(r => norm(r.branch_hint).toLowerCase() === filterBranch.toLowerCase());
  }, [rows, filterBranch]);

  const loadStaffOptions = useCallback(async (nextCity: string) => {
    const nm = norm(approverName);
    const p = norm(pin);
    if (!nm || !p) {
      setStaffOptions([]);
      return;
    }
    try {
      const res = await apiGet<StaffNamesResp>(
        `/api/admin/staff_master/names?city=${encodeURIComponent(nextCity)}&status=ACTIVE&limit=5000&approver_name=${encodeURIComponent(nm)}`,
        p
      );
      setStaffOptions(Array.isArray(res?.names) ? res.names : []);
    } catch {
      setStaffOptions([]);
    }
  }, [approverName, pin]);

  const loadReport = useCallback(async () => {
    const nm = norm(approverName);
    const p = norm(pin);
    if (!nm || !p) return;

    setReportLoading(true);
    setReportError(null);

    const makeQs = (c: string) => {
      const qs = new URLSearchParams();
      qs.set("city", c);
      qs.set("date_from", reportDateFrom);
      qs.set("date_to", addDaysIso(reportDateTo, 1));
      qs.set("approver_name", nm);
      qs.set("limit", "500");
      return qs.toString();
    };

    try {
      const [rd, rm] = await Promise.all([
        apiGet<AbsenceListResp>(`/api/admin/absences?${makeQs("dubai")}`, p),
        apiGet<AbsenceListResp>(`/api/admin/absences?${makeQs("manila")}`, p),
      ]);
      setReportDubai(Array.isArray(rd?.rows) ? rd.rows.filter(r => isUnplannedAbsence(r.absence_type)) : []);
      setReportManila(Array.isArray(rm?.rows) ? rm.rows.filter(r => isUnplannedAbsence(r.absence_type)) : []);
      setReportLoadedRange({ from: reportDateFrom, to: reportDateTo });
    } catch (e: any) {
      setReportError(e?.message || String(e));
      setReportDubai(null);
      setReportManila(null);
      setReportLoadedRange(null);
    } finally {
      setReportLoading(false);
    }
  }, [approverName, pin, reportDateFrom, reportDateTo]);

  const loadHistory = async () => {
    setHistoryLoading(true);
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
      qs.set("limit", "1000");
      if (norm(filterStaffName)) qs.set("staff_name", norm(filterStaffName));

      const res = await apiGet<AbsenceListResp>(`/api/admin/absences?${qs.toString()}`, p);
      const list = Array.isArray(res?.rows) ? res.rows : [];
      setRows(list);
      setMsg({ kind: "ok", text: `Loaded ${list.length} rows.` });
    } catch (e: any) {
      setRows([]);
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!city) return;
    loadStaffOptions(city);
  }, [city, loadStaffOptions]);

  useEffect(() => {
    setStaffName("");
    setBulkSelectedNames([]);
    setBulkNameSearch("");
    setFilterStaffName("");
    setFilterBranch("");
    setBranchHint("");
    setBulkBranchHint("");
    setRows(null);
  }, [city]);

  // Auto-load the report when auth becomes ready, and again whenever the range
  // changes — the range buttons read as "show me this", so leaving the old rows
  // up until someone presses Load Report is a screen that disagrees with itself.
  // Debounced because the range picker sets `from` and `to` in separate updates
  // and the pair in between is a range nobody asked for.
  useEffect(() => {
    if (!canAuth) return;
    const t = setTimeout(() => { loadReport(); }, 400);
    return () => clearTimeout(t);
  }, [canAuth, loadReport]);

  // Fetch absence review staleness on mount
  useEffect(() => {
    const a = getAuth();
    if (!a?.hasSession && !a?.accessToken) return;
    fetch(`/api/admin/absences/check-status`, {
      headers: a?.accessToken ? { Authorization: `Bearer ${a.accessToken}` } : {},
      cache: "no-store",
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { cities?: CheckStatus[] } | null) => { if (d?.cities) setCheckStatus(d.cities); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAsReviewed() {
    const nm = norm(approverName);
    const p = norm(pin);
    if (!nm || !p) { setMarkMsg("Set Approver Name and PIN in the Scope section first."); return; }
    setMarking(true); setMarkMsg(null);
    try {
      await Promise.all(
        ["manila", "dubai"].map(c =>
          apiPost("/api/admin/absences/mark-checked", { city: c, approver_name: nm, pin: p })
        )
      );
      const d = await apiGet<{ cities: CheckStatus[] }>("/api/admin/absences/check-status");
      if (d?.cities) setCheckStatus(d.cities);
      setMarkMsg("Marked as reviewed ✓");
      window.dispatchEvent(new CustomEvent("sushizen:absences:stale:refresh"));
      setTimeout(() => setMarkMsg(null), 3000);
    } catch (e: any) {
      setMarkMsg(e?.message || "Failed to mark as reviewed.");
    } finally {
      setMarking(false);
    }
  }

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
        reason_category: reasonCategory,
        approver_name: nm,
        pin: p,
      });

      // Clear form after successful save so the user can see it was recorded
      setStaffName("");
      setNote("");
      setBranchHint("");
      setMsg({ kind: "ok", text: `✓ Saved: ${sn} / ${wd} / ${absenceType}` });
      await loadReport();
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
            reason_category: bulkReasonCategory,
            approver_name: nm,
            pin: p,
          });
          count += 1;
        }
      }

      setMsg({ kind: "ok", text: `Bulk saved ${count} rows.` });
      await loadReport();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  /** Record whether the person gave notice, or handed in an MC.
   *
   * Kept off /upsert deliberately: that path rebuilds the row from the sheet,
   * and these two facts are usually learned days after the absence itself. */
  const saveFlags = async (
    r: AbsenceRow,
    patch: { prior_notice?: AbsenceFlag; mc_submitted?: AbsenceFlag },
  ) => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      await apiPost("/api/admin/absences/flags", {
        city,
        staff_name: norm(r.staff_name),
        work_date: norm(r.work_date),
        absence_type: norm(r.absence_type).toUpperCase(),
        approver_name: nm,
        pin: p,
        ...patch,
      });

      setMsg({ kind: "ok", text: `Saved for ${r.staff_name} / ${r.work_date}.` });
      if (rows !== null) await loadHistory();
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
      await loadReport();
      if (rows !== null) await loadHistory();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  function downloadCsv() {
    const target = filteredRows ?? [];
    const headers = ["staff", "date", "type", "branch", "reason_category", "note", "source", "created_at"];
    const lines = [
      headers.join(","),
      ...target.map((r) => {
        const noteVal = norm(r.note);
        return [
          norm(r.staff_name),
          norm(r.work_date),
          toTitleAbsenceType(r.absence_type),
          norm(r.branch_hint),
          norm(r.reason_category),
          noteVal.includes(",") ? `"${noteVal.replace(/"/g, '""')}"` : noteVal,
          norm(r.source_sheet_name),
          norm(r.created_at),
        ].join(",");
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absence-history-${city}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const reportTotal = (reportDubai?.length ?? 0) + (reportManila?.length ?? 0);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-5xl space-y-5 px-4 py-8"
      >
        {/* Nav */}
        <div className="mb-2 flex items-center gap-2">
          <Link href="/admin">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Admin
            </button>
          </Link>
          <Link href="/admin/attendance">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <UserCheck className="h-3.5 w-3.5" />
              Attendance
            </button>
          </Link>
          <Link href="/admin/analytics">
            <button className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
              <BarChart2 className="h-3.5 w-3.5" />
              Analytics
            </button>
          </Link>
        </div>

        {/* Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/20 to-pink-500/10">
            <CalendarOff className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Absence / Leave Management</h1>
            <p className={T_CAPTION}>View absence reports, register absences and leave, process bulk entries, and review history.</p>
          </div>
        </div>

        {/* ── Staleness Alert Banner ───────────────────────────────────────── */}
        {checkStatus.length > 0 && (
          checkStatus.some(cs => cs.stale) ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-sm font-semibold text-amber-300">Absence page has not been reviewed recently</p>
                  {checkStatus.map(cs => (
                    <p key={cs.city} className="text-xs">
                      <span className="font-medium text-white/80">{cs.city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}</span>
                      <span className="text-white/40 mx-1.5">—</span>
                      {cs.stale ? (
                        <span className="text-amber-400">
                          {cs.weekdays_since >= 999 ? "Never reviewed" : `${cs.weekdays_since} weekday${cs.weekdays_since !== 1 ? "s" : ""} without a review`}
                        </span>
                      ) : (
                        <span className="text-emerald-400">
                          Up to date{cs.checked_by ? ` · ${cs.checked_by}` : ""}
                          {cs.checked_at ? ` · ${new Date(cs.checked_at).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}` : ""}
                        </span>
                      )}
                    </p>
                  ))}
                  {markMsg && (
                    <p className={`text-xs ${markMsg.includes("✓") ? "text-emerald-400" : "text-amber-400"}`}>{markMsg}</p>
                  )}
                </div>
                <button
                  onClick={() => { void markAsReviewed(); }}
                  disabled={marking || !canAuth}
                  title={!canAuth ? "Set Approver Name and PIN in the Scope section first" : ""}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
                >
                  {marking ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {marking ? "Saving…" : "Mark as Reviewed"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1">
                {checkStatus.map(cs => (
                  <p key={cs.city} className="text-xs text-white/50">
                    <span className="font-medium text-white/70">{cs.city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}</span>
                    {cs.checked_by ? ` · ${cs.checked_by}` : ""}
                    {cs.checked_at ? ` · ${new Date(cs.checked_at).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}` : ""}
                  </p>
                ))}
              </div>
              <button
                onClick={() => { void markAsReviewed(); }}
                disabled={marking || !canAuth}
                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1 text-xs text-white/40 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
              >
                {marking ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {marking ? "Saving…" : "Mark as Reviewed"}
              </button>
            </div>
          )
        )}

        {/* ── Absence Report (both cities, configurable date range) ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.02 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-rose-400" />
              <h2 className={T_SECTION}>Absence Report</h2>
            </div>
            <p className={T_CAPTION}>Dubai 🇦🇪 + Manila 🇵🇭 — name, branch, type, note/shift</p>
          </div>

          {/* Controls */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
              <div className="flex items-center gap-2">
                <DateRangePicker
                  value={{ from: reportDateFrom, to: reportDateTo }}
                  onChange={(range) => {
                    setReportDateFrom(range.from);
                    setReportDateTo(range.to || range.from);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setReportDateFrom(yesterdayIso());
                    setReportDateTo(yesterdayIso());
                  }}
                  className={SMALL_BUTTON + " whitespace-nowrap"}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReportDateFrom(todayIso());
                    setReportDateTo(todayIso());
                  }}
                  className={SMALL_BUTTON + " whitespace-nowrap"}
                >
                  Today
                </button>
              </div>
            </div>
            <button
              onClick={loadReport}
              disabled={reportLoading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reportLoading ? "animate-spin" : ""}`} />
              {reportLoading ? "Loading…" : "Load Report"}
            </button>
          </div>

          {/* Auth prompt */}
          {!canAuth && (
            <div className="rounded-lg bg-neutral-800/40 px-4 py-3 text-center text-sm text-neutral-400">
              Enter Approver Name and PIN in the Scope section below, then load.
            </div>
          )}

          {/* Results */}
          {reportDubai !== null && reportManila !== null && (
            reportTotal === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                <p className="text-sm text-neutral-400">No absences recorded for this period</p>
                <p className={T_CAPTION}>{rangeLabel(reportLoadedRange)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {rangeLabel(reportLoadedRange)}
                  </span>
                  <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_ERROR}`}>
                    {reportTotal} total
                  </span>
                </div>
                <ReportCitySection city="dubai" rows={reportDubai} />
                <ReportCitySection city="manila" rows={reportManila} />
              </div>
            )
          )}

          {reportDubai === null && !reportLoading && canAuth && (
            <div className="rounded-lg bg-neutral-800/30 px-4 py-4 text-center text-sm text-neutral-500">
              {reportError
                ? <span className="text-red-400">{reportError}</span>
                : <>Click <strong className="text-neutral-300">Load Report</strong> to fetch absence data for both cities.</>
              }
            </div>
          )}
        </motion.div>

        {/* Feedback banner */}
        <AnimatePresence>
          {msg ? (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className={
                msg.kind === "ok"
                  ? BADGE_SUCCESS + " w-full justify-start rounded-xl px-4 py-3 text-sm"
                  : BADGE_ERROR + " w-full justify-start rounded-xl px-4 py-3 text-sm"
              }
            >
              {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {msg.text}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Auth / Scope ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Scope / Approval Context</h2>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>City</label>
              <SelectDark
                value={city}
                onChange={(v) => setCity((v === "manila" ? "manila" : "dubai") as City)}
                options={[{ value: "dubai", label: "Dubai" }, { value: "manila", label: "Manila" }]}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
              <input className={INPUT_CLASS} readOnly value={approverName || "-"} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
              <input
                className={INPUT_CLASS}
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN if needed"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            Using the current logged-in admin credentials stored on this device. City scope applies to upsert / delete operations.
          </div>
        </motion.div>

        {/* ── Single Upsert ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-rose-400" />
            <h2 className={T_SECTION}>Single Upsert</h2>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Name</label>
              <SelectDark
                value={staffName}
                onChange={setStaffName}
                options={staffOptions}
                placeholder="Select staff"
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Work Date</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) setWorkDate(next);
                }}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
              <SelectDark
                value={absenceType}
                onChange={(v) => setAbsenceType(v as AbsenceType)}
                options={ABSENCE_TYPES.map((x) => ({ value: x.value, label: x.label }))}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
              <SelectDark
                value={branchHint}
                onChange={setBranchHint}
                options={branchOptions.map((b) => ({ value: b.code, label: b.name }))}
                placeholder="Select branch"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Reason Category</label>
            <SelectDark
              value={reasonCategory}
              onChange={(v) => setReasonCategory(v as ReasonCategory)}
              options={REASON_CATEGORIES.map((c) => ({ value: c.value, label: c.emoji ? `${c.emoji} ${c.label}` : c.label }))}
            />
          </div>
          <div className="mb-4">
            <label className={`${T_LABEL} mb-1.5 block`}>Note / Shift info</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={TEXTAREA_CLASS}
              placeholder="Paste Discord message or write details here…"
            />
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Overrides existing record for the same date.</p>
            <button
              onClick={upsertSingle}
              disabled={loading || !canAuth}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </motion.div>

        {/* ── Bulk Entry ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className={GLASS_CARD + " p-5"}
        >
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Bulk Entry</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>
                Staff Names
                {bulkSelectedNames.length > 0 && (
                  <span className="ml-2 text-violet-400">{bulkSelectedNames.length} selected</span>
                )}
              </label>

              {/* Selected chips */}
              {bulkSelectedNames.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {bulkSelectedNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-xs text-violet-200"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => setBulkSelectedNames((prev) => prev.filter((n) => n !== name))}
                        className="ml-0.5 text-violet-400 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBulkSelectedNames([])}
                    className="text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* Search box */}
              <input
                type="text"
                value={bulkNameSearch}
                onChange={(e) => setBulkNameSearch(e.target.value)}
                placeholder={staffOptions.length ? "Search staff…" : "Loading staff list…"}
                disabled={!staffOptions.length}
                className={INPUT_CLASS + " mb-1.5"}
              />

              {/* Scrollable checklist */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950">
                {staffOptions.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-neutral-500">Loading…</p>
                ) : filteredBulkOptions.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-neutral-500">No matches</p>
                ) : (
                  filteredBulkOptions.map((name) => {
                    const selected = bulkSelectedNames.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setBulkSelectedNames((prev) =>
                            selected ? prev.filter((n) => n !== name) : [...prev, name]
                          )
                        }
                        className={[
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5",
                          selected ? "bg-violet-500/10 text-violet-200" : "text-neutral-300",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                            selected
                              ? "border-violet-400 bg-violet-500/30"
                              : "border-neutral-600",
                          ].join(" ")}
                        >
                          {selected && <Check className="h-2.5 w-2.5 text-violet-300" />}
                        </div>
                        {name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
                <div className="flex gap-2">
                  <DateRangePicker
                    value={{ from: bulkDateFrom, to: bulkDateTo }}
                    onChange={(range) => {
                      setBulkDateFrom(range.from);
                      setBulkDateTo(range.to || range.from);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { setBulkDateFrom(yesterdayIso()); setBulkDateTo(yesterdayIso()); }}
                    className={SMALL_BUTTON + " whitespace-nowrap"}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBulkDateFrom(todayIso()); setBulkDateTo(todayIso()); }}
                    className={SMALL_BUTTON + " whitespace-nowrap"}
                  >
                    Today
                  </button>
                </div>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
                <SelectDark
                  value={bulkBranchHint}
                  onChange={setBulkBranchHint}
                  options={branchOptions.map((b) => ({ value: b.code, label: b.name }))}
                  placeholder="All / Optional"
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Absence Type</label>
                <SelectDark
                  value={bulkAbsenceType}
                  onChange={(v) => setBulkAbsenceType(v as AbsenceType)}
                  options={ABSENCE_TYPES.map((x) => ({ value: x.value, label: x.label }))}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Reason Category</label>
                <SelectDark
                  value={bulkReasonCategory}
                  onChange={(v) => setBulkReasonCategory(v as ReasonCategory)}
                  options={REASON_CATEGORIES.map((c) => ({ value: c.value, label: c.emoji ? `${c.emoji} ${c.label}` : c.label }))}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Note / Shift info</label>
                <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} rows={2} className={TEXTAREA_CLASS} placeholder="Optional" />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-4">
            <p className={T_CAPTION}>Same type applied to all staff for the selected range.</p>
            <button onClick={upsertBulk} disabled={loading || !canAuth} className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}>
              <Upload className="h-4 w-4" />
              Process Bulk
            </button>
          </div>
        </motion.div>

        {/* ── Leave Cases ───────────────────────────────────────────────── */}
        <LeaveCases city={city} staffOptions={staffOptions} />

        {/* ── History Filters ──────────────────────────────────────────── */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={T_SECTION}>History (single city)</h2>
              <p className={T_CAPTION}>
                {filteredRows === null
                  ? "Select filters and click Load History"
                  : filterBranch
                  ? `${fmtNum(filteredRows.length)} / ${fmtNum(rows?.length ?? 0)} records (branch filtered)`
                  : `${fmtNum(rows?.length ?? 0)} records`}
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff</label>
              <SelectDark
                value={filterStaffName}
                onChange={setFilterStaffName}
                options={staffOptions}
                placeholder="All staff"
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
              <SelectDark
                value={filterBranch}
                onChange={setFilterBranch}
                options={branchOptions.map((b) => ({ value: b.code, label: b.name }))}
                placeholder="All branches"
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
              <DateRangePicker
                value={{ from: dateFrom, to: dateTo }}
                onChange={(range) => {
                  setDateFrom(range.from);
                  setDateTo(range.to || range.from);
                }}
              />
            </div>
            <div className="flex items-end">
              <button onClick={loadHistory} disabled={historyLoading || !canAuth} className={`${PRIMARY_BUTTON} w-full disabled:opacity-50`}>
                {historyLoading ? "Loading…" : "Load History"}
              </button>
            </div>
          </div>
        </div>

        {/* ── History Table ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={GLASS_CARD + " overflow-hidden"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-violet-400" />
              <h2 className={T_SECTION}>History</h2>
              {filterBranch && (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300 border border-violet-500/20">
                  {branchOptions.find(b => b.code === filterBranch)?.name || filterBranch}
                </span>
              )}
            </div>
            <button
              onClick={downloadCsv}
              disabled={!filteredRows?.length}
              className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-50`}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/3">
                <tr>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Date</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Type</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Note / Shift</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>Told us?</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}>MC</th>
                  <th className={`${TABLE_HEADER} px-4 text-left`}></th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={8} className={`${TABLE_CELL} px-4 py-12 text-center text-zinc-500`}>
                      Loading…
                    </td>
                  </tr>
                ) : rows === null ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarDays className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>Select filters above and click Load History.</p>
                      </div>
                    </td>
                  </tr>
                ) : (filteredRows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarOff className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>No records found for this filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  (filteredRows ?? []).map((r, idx) => {
                    const manual = norm(r.source_sheet_name).toUpperCase() === "MANUAL";
                    const isPendingDelete =
                      pendingDeleteRow &&
                      norm(pendingDeleteRow.staff_name) === norm(r.staff_name) &&
                      norm(pendingDeleteRow.work_date) === norm(r.work_date) &&
                      norm(pendingDeleteRow.absence_type) === norm(r.absence_type) &&
                      idx === (filteredRows ?? []).findIndex(
                        (x) =>
                          norm(x.staff_name) === norm(r.staff_name) &&
                          norm(x.work_date) === norm(r.work_date) &&
                          norm(x.absence_type) === norm(r.absence_type)
                      );
                    return (
                      <>
                        <motion.tr
                          key={`${r.work_date}-${r.staff_name}-${r.absence_type}-${idx}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.02 }}
                          className={TABLE_ROW}
                        >
                          <td className={`${TABLE_CELL} px-4 font-medium`}>{r.staff_name || "-"}</td>
                          <td className={`${TABLE_CELL} px-4 tabular-nums`}>{r.work_date || "-"}</td>
                          <td className={`${TABLE_CELL} px-4`}>
                            <span className={badgeClassForType(r.absence_type)}>
                              {toTitleAbsenceType(r.absence_type)}
                            </span>
                          </td>
                          <td className={`${TABLE_CELL} px-4 text-zinc-400`}>{r.branch_hint || "-"}</td>
                          <td className={`${TABLE_CELL} px-4 text-xs text-zinc-400`}>
                            <NoteCell note={r.note} category={r.reason_category} />
                          </td>
                          <td className={`${TABLE_CELL} px-4`}>
                            <select
                              aria-label={`Prior notice for ${r.staff_name} on ${r.work_date}`}
                              disabled={loading}
                              value={(r.prior_notice as AbsenceFlag) || ""}
                              onChange={(e) =>
                                saveFlags(r, { prior_notice: e.target.value as AbsenceFlag })
                              }
                              className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${flagClass(r.prior_notice)}`}
                            >
                              {NOTICE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${TABLE_CELL} px-4`}>
                            <select
                              aria-label={`Medical certificate for ${r.staff_name} on ${r.work_date}`}
                              disabled={loading}
                              value={(r.mc_submitted as AbsenceFlag) || ""}
                              onChange={(e) =>
                                saveFlags(r, { mc_submitted: e.target.value as AbsenceFlag })
                              }
                              className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${flagClass(r.mc_submitted)}`}
                            >
                              {MC_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${TABLE_CELL} px-4`}>
                            {manual ? (
                              <button
                                onClick={() => setPendingDeleteRow(isPendingDelete ? null : r)}
                                disabled={loading}
                                className={`${DANGER_BUTTON} flex items-center gap-1 px-2.5 py-1 text-xs disabled:opacity-50`}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            ) : (
                              <span className={T_CAPTION}>Protected</span>
                            )}
                          </td>
                        </motion.tr>
                        {isPendingDelete ? (
                          <tr className="border-t border-red-500/10 bg-red-500/5">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-zinc-300">
                                  Delete absence for <strong className="text-white">{r.staff_name}</strong> on{" "}
                                  <strong className="text-white">{r.work_date}</strong>? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button className={SECONDARY_BUTTON + " px-3 py-1.5 text-sm"} onClick={() => setPendingDeleteRow(null)}>
                                    Cancel
                                  </button>
                                  <button
                                    className={DANGER_BUTTON + " flex items-center gap-1.5 px-3 py-1.5 text-sm"}
                                    onClick={async () => {
                                      const row = pendingDeleteRow;
                                      setPendingDeleteRow(null);
                                      if (row) await deleteRow(row);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Confirm Delete
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
