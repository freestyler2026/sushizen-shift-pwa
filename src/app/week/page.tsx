// src/app/week/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { apiGet, qs, type WeekView, type ShiftRow } from "@/lib/api";
import { mondayOf, isoToday } from "@/lib/date";
import { getAuth, type City } from "@/lib/auth";
import {
  GLASS_CARD,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
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
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";

// -----------------------------
// Absence helpers (robust)
// -----------------------------
const ABSENCE_TYPES = new Set([
  "DAY_OFF",
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
  if (r?.applied?.applied_type === "absence") return true;
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
    const bc = String((r as any).branch_code || "").trim();
    const area = String((r as any).area || "").trim();
    const staff = String(r.staff_name || "").trim();
    if (!staff) continue;

    // guard: header-like rows
    const sU = staff.toUpperCase();
    if (sU === "UNASSIGNED" || sU === "UNKNOWN") continue;
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
// timeline renderer (bar-only + text)
// -----------------------------
function Timeline2Rows({ rows }: { rows: ShiftRow[] }) {
  const ticks = [8, 12, 16, 20, 24, 30];

  const label = rows
    .slice()
    .sort((a, b) => (a.start_hour ?? 0) - (b.start_hour ?? 0))
    .map((r) => rangeText(Number(r.start_hour ?? 0), Number(r.end_hour ?? 0)))
    .join(", ");

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[9px] text-neutral-500 sm:text-[10px]">
        {ticks.map((t) => (
          <div key={t} className="w-0 flex-1 text-center">
            {hourText(t)}
          </div>
        ))}
      </div>

      <div className="relative h-7 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/30">
        <div className="absolute inset-0 flex">
          {Array.from({ length: TL_TOTAL }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-neutral-900/60 last:border-r-0" />
          ))}
        </div>

        {rows.map((r, idx) => {
          const st = Number(r.start_hour ?? 0);
          const en = Number(r.end_hour ?? 0);

          const stC = clamp(st, TL_START, TL_END);
          const enC = clamp(en, TL_START, TL_END);

          const left = ((stC - TL_START) / TL_TOTAL) * 100;
          const widthRaw = ((enC - stC) / TL_TOTAL) * 100;
          const width = Math.max(2, widthRaw);

          const ov = (r as any)?.override;
          const isFinal = ov?.status === "FINAL";
          const isPending = ov?.status === "PENDING";

          const barCls = isFinal
            ? "bg-emerald-500/25 border-emerald-400/50"
            : isPending
            ? "bg-amber-500/25 border-amber-400/60"
            : "bg-sky-500/20 border-sky-400/40";

          const full = rangeText(st, en);

          return (
            <div
              key={`${r.staff_name}-${idx}-${st}-${en}`}
              className={`absolute top-0.5 h-5 rounded-md border ${barCls}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${(r.role || "").toString()} ${full}`}
            />
          );
        })}
      </div>

      <div className="text-[10px] text-neutral-200/90">{label || <span className="text-neutral-500">—</span>}</div>
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

    const badge = badgeForRow(rows[0]);
    const roleText = absence ? absType : (rows[0]?.role || "");

    return (
      <div
        key={staff}
        className={`rounded-lg border p-2 sm:p-2.5 ${
          isMe ? "border-violet-500/30 bg-violet-500/12" : "border-neutral-800 bg-violet-950/20"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold leading-5 sm:text-[15px]">
              {name}
              {isMe ? <span className="ml-2 text-[11px] text-violet-200">(You)</span> : null}
              {containsJP(staff) ? <span className="ml-2 text-[11px] text-red-300">⚠️JP</span> : null}
            </div>

            <div className="mt-0.5 text-[11px] text-neutral-400">{roleText}</div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[11px] text-neutral-500">
              {absence ? "ABSENCE" : `${rows.length} shift${rows.length === 1 ? "" : "s"}`}
            </div>
            <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[9px] ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {absence ? (
          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
            {absNote ? (
              <div className="text-xs text-neutral-300">{absNote}</div>
            ) : (
              <div className="text-xs text-neutral-500">—</div>
            )}
          </div>
        ) : (
          <Timeline2Rows rows={rows} />
        )}
      </div>
    );
  };

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-5xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Week</h1>
          <p className={T_BODY}>
            Logged in as <span className="font-medium text-white">{sanitizeDisplayName(myName) || "-"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={BADGE_SUCCESS}>
            <CalendarRange className="h-3 w-3" />
            {weekLabel(startDate)}
          </span>
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={T_SECTION}>Weekly Schedule</div>
            <div className={T_CAPTION}>Browse the published week and recent approved changes.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="City">
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={city}
              onChange={(e) => {
                didAutoSetRef.current = true;
                setCity(e.target.value as City);
              }}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </Field>

          <Field label="Week (Mon-Sun)">
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
          </Field>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchWeek}
              className={`${BLUSH_PRIMARY} min-h-10 w-full`}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                didAutoSetRef.current = true;
                setStartDate(mondayOf(isoToday()));
              }}
              className={`${BLUSH_SECONDARY} min-h-10`}
            >
              Today
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {loading ? <div className="text-sm text-neutral-400">Loading...</div> : null}
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4`}>
        <div className={T_SECTION}>Recent Approved Changes</div>
        <div className={`mt-1 ${T_CAPTION}`}>
          Changes synced from manager spreadsheet edits and approved by HQ/Admin.
        </div>
        {!changes.length ? (
          <div className="mt-2 text-xs text-neutral-500">No approved changes for this week.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {changes.slice(0, 30).map((ev) => (
              <div key={ev.id} className={`${BLUSH_HIGHLIGHT} px-3 py-2 text-xs`}>
                <div className="text-neutral-200">
                  {ev.work_date} • {ev.branch_code} • {(ev.change_type || "").replaceAll("_", " ")}
                </div>
                <div className="mt-1 text-neutral-400">
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
          <div className={T_SECTION}>All Staff By Branch</div>
          {availableBranches.length ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBranchFilter("ALL")}
                className={`rounded-full border px-3 py-1 text-[11px] transition ${
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
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
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
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
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
          <div className="space-y-4">
            {filteredGrouped.map((day) => (
              <div key={day.date} className={`${BLUSH_GLASS} p-3`}>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{day.date}</div>
                  <span className={BADGE_WARNING}>{day.branches.length} branches</span>
                </div>

                <div className="space-y-3">
                  {day.branches.map((b) => {
                    const staffEntries = Array.from(b.staffMap.entries()).sort((a, z) =>
                      a[0].localeCompare(z[0])
                    );

                    return (
                      <div
                        key={`${day.date}-${b.branch_code || "UNASSIGNED"}`}
                        className={`${BLUSH_HIGHLIGHT} p-2.5 sm:p-3`}
                      >
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{b.branch_code || "UNASSIGNED"}</div>
                          <div className="text-xs text-neutral-500">{staffEntries.length} staff</div>
                        </div>

                        <div className="space-y-2.5">
                          {staffEntries.map(([staff, rows]) => renderStaffRow(staff, rows))}
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

      <div className="text-xs text-neutral-500">
        Timeline is bar-only. Time text is shown below (supports split shifts like “13–19, 21–23”).
      </div>
      </motion.div>
    </div>
  );
}