"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type ShiftRow, type DayView } from "@/lib/api";
import { getAuth, type City } from "@/lib/auth";
import MonthPicker from "@/components/MonthPicker";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  DIVIDER,
} from "@/lib/ui-tokens";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";

type RangeView = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  branch_code: string;
  days: DayView[];
};

type ShiftGroup = {
  branch_code: string;
  staff: Array<{
    name: string;
    rows: ShiftRow[];
  }>;
};

const BASE_BRANCH_OPTIONS = [
  { value: "ALL", label: "All stores" },
  { value: "Business Bay", label: "Business Bay" },
  { value: "JLT", label: "JLT" },
  { value: "Arjan", label: "Arjan" },
  { value: "Al Mina", label: "Al Mina" },
  { value: "Al Barsha", label: "Al Barsha" },
  { value: "CK", label: "CK" },
  { value: "Delivery", label: "Delivery" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseMonthKey(k: string) {
  const [y, m] = k.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, 1);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function clampIsoToRange(value: string, min: string, max: string) {
  if (!value) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function stripJPNotes(name: string) {
  return (name || "").replace(/\([^)]*[^\x00-\x7F][^)]*\)/g, "").trim();
}

function hoursLabel(st: number, en: number) {
  const fmt = (h: number) => (h >= 24 ? `${h - 24}:00(+1)` : `${h}:00`);
  return `${fmt(st)} - ${fmt(en)}`;
}

function isAbsenceRow(row: ShiftRow) {
  const role = String(row.role || "").toUpperCase().trim();
  return Number(row.start_hour || 0) === 0 && Number(row.end_hour || 0) === 0 && (
    role === "DAY_OFF" ||
    role === "VACATION_LEAVE" ||
    role === "MATERNITY_LEAVE" ||
    role === "MEDICAL_LEAVE" ||
    role === "INJURY" ||
    role === "HOSPITAL" ||
    role === "ABSENT" ||
    role === "BEREAVEMENT_LEAVE"
  );
}

function groupRowsByBranch(rows: ShiftRow[]): ShiftGroup[] {
  const byBranch = new Map<string, Map<string, ShiftRow[]>>();
  for (const row of rows) {
    const branch = String(row.branch_code || "").trim() || "Unknown";
    const staff = stripJPNotes(String(row.staff_name || "").trim());
    if (!staff) continue;
    if (!byBranch.has(branch)) byBranch.set(branch, new Map());
    const byStaff = byBranch.get(branch)!;
    if (!byStaff.has(staff)) byStaff.set(staff, []);
    byStaff.get(staff)!.push(row);
  }

  return Array.from(byBranch.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([branch_code, byStaff]) => ({
      branch_code,
      staff: Array.from(byStaff.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, staffRows]) => ({
          name,
          rows: staffRows.slice().sort((a, b) => (a.start_hour || 0) - (b.start_hour || 0)),
        })),
    }));
}

function ShiftGroupsSection({ title, rows }: { title: string; rows: ShiftRow[] }) {
  const groups = useMemo(() => groupRowsByBranch(rows), [rows]);

  return (
    <div className={BLUSH_HIGHLIGHT + " p-3.5"}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.branch_code} className="rounded-xl border border-violet-500/20 bg-violet-950/25 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{group.branch_code}</div>
              <div className="text-xs text-neutral-500">{group.staff.length} staff</div>
            </div>
            <div className="space-y-2">
              {group.staff.map((staff) => {
                const workRows = staff.rows.filter((row) => !isAbsenceRow(row));
                const absenceRows = staff.rows.filter((row) => isAbsenceRow(row));
                return (
                  <div key={`${group.branch_code}-${staff.name}`} className="rounded-lg border border-white/8 bg-black/15 px-2.5 py-2">
                    <div className="text-sm font-medium text-neutral-100">{staff.name}</div>
                    {workRows.map((row, idx) => (
                      <div key={`${staff.name}-work-${idx}`} className="mt-1 text-xs text-neutral-300">
                        {row.role} • {hoursLabel(row.start_hour, row.end_hour)}
                      </div>
                    ))}
                    {absenceRows.map((row, idx) => (
                      <div key={`${staff.name}-absence-${idx}`} className="mt-1 text-xs text-violet-200">
                        {row.role}
                        {row.applied?.note ? ` • ${String(row.applied.note)}` : ""}
                      </div>
                    ))}
                  </div>
                );
              })}
              {!group.staff.length ? <div className="text-sm text-neutral-500">No staff.</div> : null}
            </div>
          </div>
        ))}
        {!groups.length ? <div className="text-sm text-neutral-500">No shift data.</div> : null}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState("ALL");
  const [mKey, setMKey] = useState(() => toMonthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));
  const [rangeStart, setRangeStart] = useState(() => iso(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() => iso(new Date()));

  const [dayLoading, setDayLoading] = useState(false);
  const [dayErr, setDayErr] = useState("");
  const [dayView, setDayView] = useState<DayView | null>(null);

  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeErr, setRangeErr] = useState("");
  const [rangeView, setRangeView] = useState<RangeView | null>(null);

  const monthDate = useMemo(() => parseMonthKey(mKey), [mKey]);
  const todayIso = iso(new Date());
  const apiBranchCode = branchCode === "ALL" ? "" : branchCode;

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fcalendar");
      return;
    }
    setAuthed(auth);
    setCity(auth.city || "dubai");
  }, [router]);

  useEffect(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const startIso = iso(start);
    const endIso = iso(end);
    const todayMonth = toMonthKey(new Date()) === mKey ? todayIso : startIso;

    setSelectedDate((prev) => (prev >= startIso && prev <= endIso ? prev : todayMonth));
    setRangeStart((prev) => (prev >= startIso && prev <= endIso ? prev : startIso));
    setRangeEnd((prev) => (prev >= startIso && prev <= endIso ? prev : endIso));
  }, [mKey, monthDate, todayIso]);

  const fetchDay = useCallback(async (workDate: string) => {
    setDayLoading(true);
    setDayErr("");
    try {
      const res = await apiGet<DayView>(
        `/api/shifts/view${qs({
          city,
          work_date: workDate,
          branch_code: apiBranchCode,
          include_pending: true,
          apply_overrides: true,
        })}`
      );
      setDayView(res);
    } catch (e: any) {
      setDayErr(e?.message || String(e));
      setDayView(null);
    } finally {
      setDayLoading(false);
    }
  }, [apiBranchCode, city]);

  const fetchRange = useCallback(async (dateFrom: string, dateTo: string) => {
    setRangeLoading(true);
    setRangeErr("");
    try {
      const res = await apiGet<RangeView>(
        `/api/shifts/range${qs({
          city,
          date_from: dateFrom,
          date_to: dateTo,
          branch_code: apiBranchCode,
          include_pending: true,
          apply_overrides: true,
        })}`
      );
      setRangeView(res);
    } catch (e: any) {
      setRangeErr(e?.message || String(e));
      setRangeView(null);
    } finally {
      setRangeLoading(false);
    }
  }, [apiBranchCode, city]);

  useEffect(() => {
    if (!authed) return;
    void fetchDay(selectedDate);
  }, [authed, fetchDay, selectedDate]);

  useEffect(() => {
    if (!authed) return;
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
    if (rangeStart.slice(0, 7) !== mKey || rangeEnd.slice(0, 7) !== mKey) return;
    void fetchRange(rangeStart, rangeEnd);
  }, [authed, fetchRange, mKey, rangeEnd, rangeStart]);

  const calCells = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const firstDow = (start.getDay() + 6) % 7;
    const cells: Array<{ kind: "blank" } | { kind: "day"; date: Date; iso: string }> = [];
    for (let i = 0; i < firstDow; i += 1) cells.push({ kind: "blank" });
    for (let d = 1; d <= end.getDate(); d += 1) {
      const dt = new Date(start.getFullYear(), start.getMonth(), d);
      cells.push({ kind: "day", date: dt, iso: iso(dt) });
    }
    while (cells.length % 7 !== 0) cells.push({ kind: "blank" });
    return cells;
  }, [monthDate]);

  const nonEmptyRangeDays = useMemo(() => (rangeView?.days || []).filter((day) => (day.rows || []).length > 0), [rangeView]);
  const branchOptions = useMemo(() => {
    const preferred = BASE_BRANCH_OPTIONS.map((option) => option.value);
    const discovered = new Set<string>();

    for (const row of dayView?.rows || []) {
      const branch = String(row.branch_code || "").trim();
      if (branch) discovered.add(branch);
    }
    for (const day of rangeView?.days || []) {
      for (const row of day.rows || []) {
        const branch = String(row.branch_code || "").trim();
        if (branch) discovered.add(branch);
      }
    }

    const merged = [
      ...BASE_BRANCH_OPTIONS,
      ...Array.from(discovered)
        .filter((branch) => !preferred.includes(branch))
        .sort((a, b) => a.localeCompare(b))
        .map((branch) => ({ value: branch, label: branch })),
    ];

    if (branchCode !== "ALL" && !merged.some((option) => option.value === branchCode)) {
      merged.push({ value: branchCode, label: branchCode });
    }

    return merged;
  }, [branchCode, dayView, rangeView]);

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
          <h1 className={T_PAGE_TITLE}>Calendar</h1>
          <p className={T_BODY}>Browse daily and same-month range shifts by store.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={BADGE_SUCCESS}>
            <CalendarDays className="h-3 w-3" />
            {selectedDate}
          </span>
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4 sm:p-5`}>
        <div className="mb-4">
          <div className={T_SECTION}>Calendar Filters</div>
          <div className={T_CAPTION}>Pick a month, selected day, and same-month range to inspect store schedules.</div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className={`mb-1 ${T_LABEL}`}>City</div>
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className={`mb-1 ${T_LABEL}`}>Store</div>
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
            >
              {branchOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={`mb-1 ${T_LABEL}`}>Month</div>
            <MonthPicker value={mKey} onChange={setMKey} />
          </div>

          <div className={`${BLUSH_HIGHLIGHT} px-3 py-2`}>
            <div className={T_LABEL}>Selected day</div>
            <div className="mt-1 text-sm font-medium text-neutral-100">{selectedDate}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs text-neutral-400">Date range</div>
          <DateRangePicker
            value={{ from: rangeStart, to: rangeEnd }}
            onChange={(range) => {
              const monthStart = `${mKey}-01`;
              const monthEnd = iso(endOfMonth(monthDate));
              const nextFrom = clampIsoToRange(range.from, monthStart, monthEnd);
              const nextTo = clampIsoToRange(range.to, monthStart, monthEnd);
              const from = nextFrom <= nextTo ? nextFrom : nextTo;
              const to = nextTo >= nextFrom ? nextTo : nextFrom;
              setRangeStart(from);
              setRangeEnd(to);
            }}
          />
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4`}>
        <div className="grid grid-cols-7">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((item) => (
            <div key={item} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {item}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {calCells.map((cell, idx) => {
            if (cell.kind === "blank") {
              return <div key={`blank-${idx}`} className="min-h-[80px] rounded-xl border border-transparent" />;
            }

            const isSelected = cell.iso === selectedDate;
            const isToday = cell.iso === todayIso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                className={[
                  "min-h-[80px] rounded-xl border p-2 text-left text-[11px] transition-all duration-150",
                  isToday ? "border-violet-500/25 bg-violet-500/12" : "border-white/5",
                  isSelected ? "border-violet-500/30 bg-violet-500/15 ring-1 ring-rose-400/20" : "hover:border-white/15 hover:bg-violet-950/45",
                ].join(" ")}
              >
                <div className={`font-medium ${isSelected ? "text-violet-200" : isToday ? "text-violet-300" : "text-neutral-100"}`}>{cell.date.getDate()}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={DIVIDER} />

      <div className="space-y-3">
        <div className={`${BLUSH_GLASS} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={T_SECTION}>Selected Day</div>
              <div className={T_CAPTION}>{selectedDate}</div>
            </div>
            <button
              onClick={() => fetchDay(selectedDate)}
              className={BLUSH_PRIMARY}
            >
              <span className="inline-flex items-center gap-2"><RefreshCcw className="h-4 w-4" />Refresh day</span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {dayLoading ? <div className="text-sm text-neutral-400">Loading selected day...</div> : null}
            {dayErr ? <div className="text-sm text-red-300">{dayErr}</div> : null}
          </div>
        </div>
        <ShiftGroupsSection title="Daily shifts" rows={dayView?.rows || []} />
      </div>

      <div className="space-y-3">
        <div className={`${BLUSH_GLASS} p-4`}>
          <div className={T_SECTION}>Selected Range</div>
          <div className={`mt-1 ${T_CAPTION}`}>
            {rangeStart} to {rangeEnd}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {rangeLoading ? <div className="text-sm text-neutral-400">Loading range...</div> : null}
            {rangeErr ? <div className="text-sm text-red-300">{rangeErr}</div> : null}
          </div>
        </div>

        <div className="space-y-3">
          {nonEmptyRangeDays.map((day) => (
            <ShiftGroupsSection key={day.work_date} title={day.work_date} rows={day.rows || []} />
          ))}
          {!rangeLoading && !rangeErr && !nonEmptyRangeDays.length ? (
            <div className={`${BLUSH_GLASS} p-3.5 text-sm text-neutral-500`}>
              No shifts found in this range.
            </div>
          ) : null}
        </div>
      </div>
      </motion.div>
    </div>
  );
}