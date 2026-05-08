// src/app/week/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type WeekView, type ShiftRow } from "@/lib/api";
import { mondayOf, isoToday } from "@/lib/date";
import { getAuth, canAccessWeekPage, type City } from "@/lib/auth";
import {
  GLASS_CARD,
  SELECT_CLASS,
  BADGE_WARNING,
  DIVIDER,
} from "@/lib/ui-tokens";

// -----------------------------
// helpers
// -----------------------------
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseIsoDate(s: string) {
  const [y, m, d] = (s || "").split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(iso: string, days: number) {
  const dt = parseIsoDate(iso);
  if (!dt) return iso;
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function weekLabel(startIso: string) {
  const endIso = addDays(startIso, 6);
  return `${startIso} to ${endIso}`;
}

// 0..48 -> "HH" or "HH(+1)"
function hourText(h: number) {
  const hh = Number(h || 0);
  const base = hh >= 24 ? hh - 24 : hh;
  const suffix = hh >= 24 ? "(+1)" : "";
  return `${pad2(base)}${suffix}`;
}

function rangeText(st: number, en: number) {
  return `${hourText(st)}–${hourText(en)}`;
}

function normName(s: string) {
  return (s || "").trim().toLowerCase();
}

function containsJP(s: string) {
  return /[-龠]/.test(s || "");
}

function sanitizeDisplayName(s: string) {
  // 常に日本語メモ括弧は除去
  return (s || "").replace(/\([^)]*[^\x00-\x7F][^)]*\)/g, "").trim();
}

function normalizeBranchName(s: string) {
  const raw = String(s || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "businessbay" || compact === "bbay") return "Business Bay";
  return raw;
}

function badgeForRow(r: ShiftRow) {
  const ov = (r as any)?.override;
  if (ov?.status === "FINAL") {
    return { label: "FINAL", cls: "border-emerald-900/60 bg-emerald-950/40 text-emerald-200" };
  }
  if (ov?.status === "PENDING") {
    return { label: "PENDING", cls: "border-amber-900/60 bg-amber-950/40 text-amber-200" };
  }
  return { label: "BASE", cls: "border-neutral-800 bg-neutral-950/40 text-neutral-300" };
}

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";

// -----------------------------
// Absence helpers (robust)
// -----------------------------
const ABSENCE_TYPES = new Set([
  "DAY_OFF",
  "VL",
  "VACATION_LEAVE",
  "MATERNITY_LEAVE",
  "MEDICAL_LEAVE",
  "INJURY",
  "HOSPITAL",
  "ABSENT",
  "BEREAVEMENT_LEAVE",
]);

function isAbsenceRow(r: any) {
  const at = String(r?.role || "").toUpperCase().trim();
  // VL / Vacation Leave branch → always treat as absence regardless of hours
  const bc = String((r as any)?.branch_code || "").toUpperCase().replace(/[\s_]/g, "");
  if (r?.applied?.applied_type === "absence") return true;
  if (bc === "VL" || bc === "VACATIONLEAVE") return true;
  return Number(r?.start_hour ?? 0) === 0 && Number(r?.end_hour ?? 0) === 0 && ABSENCE_TYPES.has(at);
}

function isAbsenceStaff(rows: any[]) {
  if (!rows || rows.length === 0) return false;
  return rows.every((r) => isAbsenceRow(r));
}

function absenceNote(rows: any[]) {
  for (const r of rows || []) {
    const note = r?.applied?.note;
    if (note) return String(note);
  }
  return "";
}

// Human-readable labels for absence types
function absenceDisplayLabel(type: string): string {
  const t = (type || "").toUpperCase().replace(/[\s_]/g, "");
  if (t === "ABSENT") return "Day Off";
  if (t === "DAYOFF") return "Day Off";
  if (t === "VL" || t === "VACATIONLEAVE") return "Vacation Leave";
  if (t === "ML" || t === "MEDICALLEAVE") return "Medical Leave";
  if (t === "SL" || t === "SICKLEAVE") return "Sick Leave";
  if (t === "MATERNITYLEAVE") return "Maternity Leave";
  if (t === "BEREAVEMENTLEAVE") return "Bereavement Leave";
  if (t === "INJURY") return "Injury Leave";
  if (t === "HOSPITAL") return "Hospital Leave";
  return type;
}

// -----------------------------
// timeline config
// -----------------------------
// 表示範囲：8:00〜翌6:00 (=30)
const TL_START = 8;
const TL_END = 30;
const TL_TOTAL = TL_END - TL_START;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// -----------------------------
// grouping
// -----------------------------
type DayBranchGroup = {
  branch_code: string; // UI name (Business Bay / JLT / ...)
  area: string; // unused in UI (kept for compatibility)
  staffMap: Map<string, ShiftRow[]>;
};

type ShiftChangeEvent = {
  id: string;
  work_date: string;
  branch_code: string;
  target_staff_name: string;
  change_type: string;
  before_json?: {
    staff_name?: string;
    start_hour?: number;
    end_hour?: number;
  };
  after_json?: {
    staff_name?: string;
    start_hour?: number;
    end_hour?: number;
    note?: string;
  };
  created_by?: string;
  created_at?: string;
};

function buildBranchMapForDay(rows: ShiftRow[]): Map<string, DayBranchGroup> {
  const bmap = new Map<string, DayBranchGroup>();

  for (const r of rows) {
    const rawBc = String((r as any).branch_code || "").trim();
    const bc = normalizeBranchName(rawBc);
    const area = String((r as any).area || "").trim();
    const staff = String(r.staff_name || "").trim();
    if (!staff) continue;

    // guard: header-like rows
    const sU = staff.toUpperCase();
    if (sU === "UNASSIGNED" || sU === "UNKNOWN") continue;
    if (rawBc && staff === rawBc) continue;
    if (bc && staff === bc) continue;
    if (area && staff === area) continue;

    if (!bmap.has(bc)) bmap.set(bc, { branch_code: bc, area, staffMap: new Map() });
    const entry = bmap.get(bc)!;
    if (!entry.area && area) entry.area = area;

    if (!entry.staffMap.has(staff)) entry.staffMap.set(staff, []);
    entry.staffMap.get(staff)!.push(r);
  }

  // staffごとに時間でソート
  for (const g of bmap.values()) {
    for (const [s, arr] of g.staffMap.entries()) {
      arr.sort((x, y) => (x.start_hour ?? 0) - (y.start_hour ?? 0));
      g.staffMap.set(s, arr);
    }
  }

  return bmap;
}

function sortBranchName(a: string, b: string) {
  // UI名に合わせた順番（あなたの指定順）
  const order = ["Business Bay", "JLT", "Arjan", "Al Mina", "Al Barsha", "CK", "Delivery", "VL", ""];
  const ia = order.indexOf(a || "");
  const ib = order.indexOf(b || "");
  const ra = ia === -1 ? 999 : ia;
  const rb = ib === -1 ? 999 : ib;
  if (ra !== rb) return ra - rb;
  return (a || "").localeCompare(b || "");
}

// -----------------------------
// Grid layout constants (must be identical for axis row + every staff row)
// col1: name, col2: bar (stretchy), col3: badge+time label
// -----------------------------
const GRID_COLS = "grid grid-cols-[8rem_1fr_5rem]";

// Axis tick positions: every 2 hours from TL_START to TL_END
const AXIS_TICKS: number[] = [];
for (let h = TL_START; h <= TL_END; h += 2) AXIS_TICKS.push(h);

// -----------------------------
// ShiftBar — pure bar, no label (used inside the grid bar column)
// -----------------------------
function ShiftBar({ rows }: { rows: ShiftRow[] }) {
  return (
    <div className="relative h-5 overflow-hidden rounded border border-neutral-800 bg-neutral-950/30">
      {/* per-hour dividers */}
      <div className="pointer-events-none absolute inset-0 flex">
        {Array.from({ length: TL_TOTAL }).map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              borderRight: i < TL_TOTAL - 1 ? "1px dashed rgba(255,255,255,0.07)" : "none",
            }}
          />
        ))}
      </div>
      {rows.map((r, idx) => {
        const st = Number(r.start_hour ?? 0);
        const en = Number(r.end_hour ?? 0);
        const stC = clamp(st, TL_START, TL_END);
        const enC = clamp(en, TL_START, TL_END);
        const left = ((stC - TL_START) / TL_TOTAL) * 100;
        const width = Math.max(2, ((enC - stC) / TL_TOTAL) * 100);
        const ov = (r as any)?.override;
        const isFinal = ov?.status === "FINAL";
        const isPending = ov?.status === "PENDING";
        const barCls = isFinal
          ? "bg-emerald-500/25 border-emerald-400/50"
          : isPending
          ? "bg-amber-500/25 border-amber-400/60"
          : "bg-sky-500/20 border-sky-400/40";
        return (
          <div
            key={`${r.staff_name}-${idx}-${st}-${en}`}
            className={`absolute top-0.5 h-4 rounded border ${barCls}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${(r.role || "").toString()} ${rangeText(st, en)}`}
          />
        );
      })}
    </div>
  );
}

// -----------------------------
// TimeAxisRow — hour label header, same GRID_COLS as staff rows
// -----------------------------
function TimeAxisRow() {
  return (
    <div className={`${GRID_COLS} items-end gap-x-2 px-3 pb-1`}>
      {/* col1: empty (name placeholder) */}
      <div />
      {/* col2: axis labels */}
      <div className="relative h-4 overflow-hidden">
        {AXIS_TICKS.map((h, i) => {
          const pct = ((h - TL_START) / TL_TOTAL) * 100;
          const base = h >= 24 ? h - 24 : h;
          const plus = h >= 24 ? "⁺" : "";
          const isFirst = i === 0;
          const isLast = i === AXIS_TICKS.length - 1;
          return (
            <span
              key={h}
              className="absolute select-none text-[8px] leading-none text-white"
              style={{
                left: `${pct}%`,
                transform: isFirst
                  ? "none"
                  : isLast
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
              }}
            >
              {pad2(base)}{plus}
            </span>
          );
        })}
      </div>
      {/* col3: empty (badge placeholder) */}
      <div />
    </div>
  );
}

// -----------------------------
// component
// -----------------------------
export default function WeekPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const myName = authed?.staffName || "";

  const [city, setCity] = useState<City>("dubai");
  const [startDate, setStartDate] = useState(mondayOf(isoToday()));
  const [latestWeekStart, setLatestWeekStart] = useState(mondayOf(isoToday()));

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WeekView | null>(null);
  const [changes, setChanges] = useState<ShiftChangeEvent[]>([]);
  const [error, setError] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // ✅ 最新週の自動ジャンプは「1回だけ」
  const didAutoSetRef = useRef(false);

  // auth restore
  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login?next=%2Fweek");
      return;
    }
    if (!canAccessWeekPage(a)) {
      router.replace("/my-shift");
      return;
    }
    setAuthed(a);
    setCity((a.city || "dubai") as City);
  }, [router]);

  // max_date -> latest week monday (once)
  useEffect(() => {
    const run = async () => {
      if (!authed) return;
      if (didAutoSetRef.current) return;

      try {
        const r = await apiGet<{ ok: boolean; city: string; max_date: string | null }>(
          `/api/shifts/max_date${qs({ city })}`
        );
        if (!r?.max_date) return;

        const md = new Date(r.max_date + "T00:00:00");
        const dow = md.getDay();
        const diff = (dow + 6) % 7; // Mon=0
        md.setDate(md.getDate() - diff);

        const y = md.getFullYear();
        const m = String(md.getMonth() + 1).padStart(2, "0");
        const d = String(md.getDate()).padStart(2, "0");
        const latest = `${y}-${m}-${d}`;

        setStartDate(latest);
        setLatestWeekStart(latest);
        didAutoSetRef.current = true;
      } catch {
        // ignore
      }
    };

    run();
  }, [authed, city]);

  const weekOptions = useMemo(() => {
    const hardMin = "2025-11-03";
    const latest = latestWeekStart || mondayOf(isoToday());
    const end = addDays(latest, 28); // allow a few future weeks

    const out: string[] = [];
    let cursor = hardMin;
    let guard = 0;
    while (cursor <= end && guard < 400) {
      out.push(cursor);
      cursor = addDays(cursor, 7);
      guard += 1;
    }

    if (startDate && !out.includes(startDate)) {
      out.push(startDate);
    }
    out.sort((a, b) => b.localeCompare(a)); // newest first
    return out;
  }, [latestWeekStart, startDate]);

  const fetchWeek = async () => {
    setLoading(true);
    setError("");
    try {
      const w = await apiGet<WeekView>(
        `/api/shifts/week${qs({
          city,
          start_date: startDate,
          include_pending: true,
          apply_overrides: true,
        })}`
      );
      setData(w);
      const ch = await apiGet<{ ok: boolean; items: ShiftChangeEvent[] }>(
        `/api/shifts/changes${qs({
          city,
          date_from: startDate,
          date_to: addDays(startDate, 6),
          limit: 80,
        })}`
      );
      setChanges(Array.isArray(ch?.items) ? ch.items : []);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
      setChanges([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    fetchWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, city, startDate]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => {
      const bmap = buildBranchMapForDay(d.rows || []);
      const branches = Array.from(bmap.values()).sort((x, y) =>
        sortBranchName(x.branch_code, y.branch_code)
      );
      return { date: d.work_date, branches };
    });
  }, [data]);

  const myBranches = useMemo(() => {
    const myKey = normName(myName);
    const set = new Set<string>();
    for (const day of grouped) {
      for (const branch of day.branches) {
        for (const staff of branch.staffMap.keys()) {
          if (normName(staff) === myKey && branch.branch_code) {
            set.add(branch.branch_code);
          }
        }
      }
    }
    return Array.from(set).sort(sortBranchName);
  }, [grouped, myName]);

  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    for (const day of grouped) {
      for (const branch of day.branches) {
        if (branch.branch_code) set.add(branch.branch_code);
      }
    }
    return Array.from(set).sort(sortBranchName);
  }, [grouped]);

  const filteredGrouped = useMemo(() => {
    if (branchFilter === "ALL") return grouped;
    if (branchFilter === "__MY__") {
      const allowed = new Set(myBranches);
      return grouped
        .map((day) => ({ ...day, branches: day.branches.filter((branch) => allowed.has(branch.branch_code)) }))
        .filter((day) => day.branches.length > 0);
    }
    return grouped
      .map((day) => ({ ...day, branches: day.branches.filter((branch) => branch.branch_code === branchFilter) }))
      .filter((day) => day.branches.length > 0);
  }, [branchFilter, grouped, myBranches]);

  const renderStaffRow = (staff: string, rows: ShiftRow[]) => {
    const isMe = normName(staff) === normName(myName);
    const name = sanitizeDisplayName(staff);

    const absence = isAbsenceStaff(rows);
    const absType = String(rows[0]?.role || "").toUpperCase().trim();
    const absNote = absenceNote(rows);
    const absLabel = absenceDisplayLabel(absType);

    const badge = badgeForRow(rows[0]);
    const roleText = absence ? absLabel : (rows[0]?.role || "");

    const timeLabel = rows
      .slice()
      .sort((a, b) => (a.start_hour ?? 0) - (b.start_hour ?? 0))
      .map((r) => rangeText(Number(r.start_hour ?? 0), Number(r.end_hour ?? 0)))
      .join(", ");

    const noteText = rows
      .filter((r) => r.note)
      .map((r) => r.note)
      .join(" · ");

    return (
      <div
        key={staff}
        className={`relative overflow-hidden rounded-lg border ${
          isMe ? "border-amber-700/50 bg-amber-950/10" : "border-neutral-800 bg-neutral-900/20"
        }`}
      >
        {isMe ? <div className="absolute left-0 top-0 h-full w-0.5 bg-amber-500" /> : null}
        {/* Grid: [name 8rem] [bar 1fr] [badge+time 5rem] */}
        <div className={`${GRID_COLS} items-center gap-x-2 px-3 py-1.5`}>
          {/* col1: Name + role */}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-xs font-semibold text-white">{name}</span>
              {isMe ? <span className="shrink-0 text-[9px] font-medium text-amber-300">YOU</span> : null}
              {containsJP(staff) ? <span className="shrink-0 text-[9px] text-red-300">JP</span> : null}
            </div>
            <div className="truncate text-[10px] text-neutral-500">{roleText}</div>
          </div>

          {/* col2: ShiftBar or absence text */}
          {absence ? (
            <div className="text-[10px] text-neutral-400">{absNote || absLabel}</div>
          ) : (
            <div>
              <ShiftBar rows={rows} />
              {noteText && (
                <div className="mt-0.5 truncate text-[10px] italic text-neutral-500">{noteText}</div>
              )}
            </div>
          )}

          {/* col3: Badge + time range (right-aligned, stacked) */}
          <div className="flex flex-col items-end gap-0.5">
            <span className={`shrink-0 rounded border px-1 py-0 text-[9px] leading-4 ${badge.cls}`}>
              {badge.label}
            </span>
            {!absence && (
              <span className="text-right text-[9px] leading-tight text-neutral-400">{timeLabel}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="shrink-0 text-lg font-bold text-white">Week</h1>
            <select
              value={city}
              onChange={(e) => {
                didAutoSetRef.current = true;
                setCity(e.target.value as City);
              }}
              className="min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-white"
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <button
            onClick={fetchWeek}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">
          Logged in as <span className="text-neutral-300">{sanitizeDisplayName(myName) || "-"}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const d = new Date(startDate + "T00:00:00");
              d.setDate(d.getDate() - 7);
              didAutoSetRef.current = true;
              setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
            }}
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="text-base font-semibold text-white">
              {(() => {
                const s = new Date(startDate + "T00:00:00");
                const e = new Date(startDate + "T00:00:00");
                e.setDate(e.getDate() + 6);
                const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
              })()}
            </div>
            {loading ? (
              <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
                <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-neutral-700 border-t-violet-400" />
                Loading…
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              const d = new Date(startDate + "T00:00:00");
              d.setDate(d.getDate() + 7);
              didAutoSetRef.current = true;
              setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
            }}
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {error ? <div className="mt-2 text-xs text-red-400">{error}</div> : null}

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="hidden sm:block">
            <select
              className={`${SELECT_CLASS} h-full rounded-lg border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white`}
              value={startDate}
              onChange={(e) => {
                didAutoSetRef.current = true;
                setStartDate(e.target.value);
              }}
            >
              {weekOptions.map((ws) => (
                <option key={ws} value={ws}>
                  {weekLabel(ws)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              didAutoSetRef.current = true;
              setStartDate(mondayOf(isoToday()));
            }}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800 active:scale-95"
          >
            Today
          </button>
        </div>

        <div className="mt-2 sm:hidden">
          <select
            className={`${SELECT_CLASS} rounded-lg border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white`}
            value={startDate}
            onChange={(e) => {
              didAutoSetRef.current = true;
              setStartDate(e.target.value);
            }}
          >
            {weekOptions.map((ws) => (
              <option key={ws} value={ws}>
                {weekLabel(ws)}
              </option>
            ))}
          </select>
        </div>

        {!error && loading ? (
          <div className="mt-2 text-xs text-neutral-500 sm:hidden">
            Updating week…
          </div>
        ) : null}
      </div>

      <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
        <div className="text-sm font-semibold text-white">Recent Approved Changes</div>
        <div className="mt-1 text-xs text-neutral-500 sm:text-sm">
          Changes synced from manager spreadsheet edits and approved by HQ/Admin.
        </div>
        {!changes.length ? (
          <div className="mt-2 text-xs text-neutral-500">No approved changes for this week.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {changes.slice(0, 30).map((ev) => (
              <div key={ev.id} className={`${BLUSH_HIGHLIGHT} rounded-xl px-3 py-2 text-xs`}>
                <div className="text-neutral-200/95">
                  {ev.work_date} • {normalizeBranchName(ev.branch_code)} • {(ev.change_type || "").replaceAll("_", " ")}
                </div>
                <div className="mt-1 text-neutral-400/90">
                  {(ev.before_json?.staff_name || "-")} {rangeText(Number(ev.before_json?.start_hour || 0), Number(ev.before_json?.end_hour || 0))}
                  {" -> "}
                  {(ev.after_json?.staff_name || "-")} {rangeText(Number(ev.after_json?.start_hour || 0), Number(ev.after_json?.end_hour || 0))}
                </div>
                {ev.after_json?.note ? <div className="mt-1 text-neutral-500">note: {ev.after_json.note}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={DIVIDER} />

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">All Staff By Branch</div>
            <div className="text-[11px] text-neutral-500">Swipe horizontally to filter by branch.</div>
          </div>
          {availableBranches.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setBranchFilter("ALL")}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
                  branchFilter === "ALL"
                    ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                    : "border-neutral-800 bg-violet-950/30 text-neutral-300 hover:bg-violet-950/45"
                }`}
              >
                All stores
              </button>
              {myBranches.length ? (
                <button
                  type="button"
                  onClick={() => setBranchFilter("__MY__")}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
                    branchFilter === "__MY__"
                      ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                      : "border-neutral-800 bg-violet-950/30 text-neutral-300 hover:bg-violet-950/45"
                  }`}
                >
                  My store
                </button>
              ) : null}
              {availableBranches.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => setBranchFilter(branch)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
                    branchFilter === branch
                      ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                      : "border-neutral-800 bg-violet-950/30 text-neutral-300 hover:bg-violet-950/45"
                  }`}
                >
                  {branch}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!data ? (
          <div className="text-sm text-neutral-500">No data.</div>
        ) : (
          <div className="space-y-2">
            {filteredGrouped.map((day) => (
              <div key={day.date} className={`${BLUSH_GLASS} p-2 sm:p-2.5`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-violet-500" />
                    <span className="truncate text-sm font-bold text-white">{day.date}</span>
                  </div>
                  <span className={`${BADGE_WARNING} shrink-0`}>{day.branches.length} branches</span>
                </div>

                <div className="space-y-1.5">
                  {day.branches.map((b) => {
                    const staffEntries = Array.from(b.staffMap.entries()).sort((a, z) =>
                      a[0].localeCompare(z[0])
                    );

                    return (
                      <div
                        key={`${day.date}-${b.branch_code || "UNASSIGNED"}`}
                        className={`${BLUSH_HIGHLIGHT} p-2`}
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                            {b.branch_code || "UNASSIGNED"}
                          </span>
                          <span className="rounded-full bg-neutral-800 px-1.5 py-0 text-[10px] text-neutral-500">
                            {staffEntries.length}
                          </span>
                        </div>

                        <div>
                          <TimeAxisRow />
                          <div className="space-y-1">
                            {staffEntries.map(([staff, rows]) => renderStaffRow(staff, rows))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!filteredGrouped.length ? <div className="text-sm text-neutral-500">No branch data for this filter.</div> : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-950/20 px-3 py-2 text-[11px] text-neutral-500">
        Timeline is bar-only. Time text is shown below and supports split shifts like “13–19, 21–23”.
      </div>
      </motion.div>
    </div>
  );
}