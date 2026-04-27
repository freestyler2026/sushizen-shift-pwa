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
  DIVIDER,
} from "@/lib/ui-tokens";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";

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
    role === "VL" ||
    role === "VACATION_LEAVE" ||
    role === "MATERNITY_LEAVE" ||
    role === "MEDICAL_LEAVE" ||
    role === "INJURY" ||
    role === "HOSPITAL" ||
    role === "ABSENT" ||
    role === "BEREAVEMENT_LEAVE"
  );
}

function dedupeShiftRows(rows: ShiftRow[]): ShiftRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.start_hour}|${row.end_hour}|${row.role || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
          rows: dedupeShiftRows(staffRows).sort((a, b) => (a.start_hour || 0) - (b.start_hour || 0)),
        })),
    }));
}

function ShiftGroupsSection({ title, rows }: { title: string; rows: ShiftRow[] }) {
  const groups = useMemo(() => groupRowsByBranch(rows), [rows]);

  return (
    <div className={BLUSH_HIGHLIGHT + " p-3 sm:p-4"}>
      <div className="text-sm font-semibold text-white sm:text-base">{title}</div>
      <div className="mt-3 space-y-2.5 sm:space-y-3">
        {groups.map((group) => (
          <div key={group.branch_code} className="rounded-2xl border border-violet-500/20 bg-violet-950/25 p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{group.branch_code}</div>
              <div className="text-[11px] text-neutral-500">{group.staff.length} staff</div>
            </div>
            <div className="space-y-2">
              {group.staff.map((staff) => {
                const workRows = staff.rows.filter((row) => !isAbsenceRow(row));
                const absenceRows = staff.rows.filter((row) => isAbsenceRow(row));
                return (
                  <div key={`${group.branch_code}-${staff.name}`} className="rounded-xl border border-white/8 bg-black/15 px-3 py-2.5">
                    <div className="text-sm font-medium text-neutral-100">{staff.name}</div>
                    {workRows.map((row, idx) => (
                      <div key={`${staff.name}-work-${idx}`} className="mt-1.5 text-xs leading-relaxed text-neutral-300">
                        {row.role} • {hoursLabel(row.start_hour, row.end_hour)}
                      </div>
                    ))}
                    {absenceRows.map((row, idx) => (
                      <div key={`${staff.name}-absence-${idx}`} className="mt-1.5 text-xs leading-relaxed text-violet-200">
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
        className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white sm:text-2xl">Calendar</h1>
            <p className="mt-1 text-xs text-neutral-400 sm:text-sm">Browse daily and same-month range shifts by store.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white"
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200">
              <CalendarDays className="h-3 w-3" />
              {selectedDate}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const d = parseMonthKey(mKey);
              d.setMonth(d.getMonth() - 1);
              setMKey(toMonthKey(d));
            }}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
            aria-label="Previous month"
          >
            {"<"}
          </button>
          <div className="text-center">
            <div className="text-base font-semibold text-white sm:text-lg">
              {monthDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500 sm:hidden">{selectedDate}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const d = parseMonthKey(mKey);
              d.setMonth(d.getMonth() + 1);
              setMKey(toMonthKey(d));
            }}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
            aria-label="Next month"
          >
            {">"}
          </button>
        </div>
        <div className="mt-3 hidden sm:block">
          <MonthPicker value={mKey} onChange={setMKey} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">Store</div>
            <select
              className={`${SELECT_CLASS} rounded-2xl px-3 py-2.5 text-sm focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
          <div className="rounded-2xl border border-violet-500/20 bg-violet-950/25 px-3 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-violet-300">Selected Day</div>
            <div className="mt-1 text-sm font-medium text-white">{selectedDate}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">Date Range</div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-2">
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
      </div>

      <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-neutral-500">
          {["M", "T", "W", "T", "F", "S", "S"].map((item, idx) => (
            <div key={`${item}-${idx}`} className="py-1">
              {item}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calCells.map((cell, idx) => {
            if (cell.kind === "blank") {
              return <div key={`blank-${idx}`} className="h-14 rounded-2xl border border-transparent sm:min-h-[88px]" />;
            }

            const isSelected = cell.iso === selectedDate;
            const isToday = cell.iso === todayIso;
            const dayRows = (rangeView?.days || []).find((day) => day.work_date === cell.iso)?.rows || [];
            const hasWork = dayRows.some((row) => !isAbsenceRow(row));
            const hasAbs = dayRows.some((row) => isAbsenceRow(row));
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                className={[
                  "h-14 rounded-2xl border px-1 py-1.5 text-white transition active:scale-95 sm:min-h-[88px]",
                  isSelected ? "border-violet-400 bg-violet-600 text-white" : "border-white/8 bg-black/10 hover:border-white/15 hover:bg-violet-950/45",
                  isToday ? "ring-1 ring-yellow-400" : "",
                ].join(" ")}
              >
                <div className="flex h-full flex-col items-center justify-center gap-0.5">
                  <span className={`text-sm font-medium leading-none ${!isSelected && isToday ? "text-yellow-300" : !isSelected ? "text-neutral-100" : ""}`}>
                    {cell.date.getDate()}
                  </span>
                  {hasWork ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : hasAbs ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                  ) : (
                    <span className="h-1.5 w-1.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-neutral-400 sm:flex sm:flex-wrap sm:gap-3">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Work shift
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
            Absence
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            Selected
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-yellow-400" />
            Today
          </div>
        </div>
      </div>

      <div className={DIVIDER} />

      <div className="space-y-3">
        <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-white">Selected Day</div>
              <div className="mt-1 text-xs text-neutral-500">{selectedDate}</div>
            </div>
            <button
              onClick={() => fetchDay(selectedDate)}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/20 hover:from-violet-400 hover:to-purple-400 active:scale-[0.98] disabled:opacity-60 sm:px-4 sm:text-sm"
            >
              <span className="inline-flex items-center gap-2"><RefreshCcw className="h-4 w-4" />Refresh day</span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {dayLoading ? <div className="text-xs text-neutral-400 sm:text-sm">Loading selected day...</div> : null}
            {dayErr ? <div className="text-xs text-red-300 sm:text-sm">{dayErr}</div> : null}
          </div>
        </div>
        <ShiftGroupsSection title="Daily shifts" rows={dayView?.rows || []} />
      </div>

      <div className="space-y-3">
        <div className={`${BLUSH_GLASS} p-3 sm:p-4`}>
          <div className="text-sm font-semibold text-white">Selected Range</div>
          <div className="mt-1 text-xs text-neutral-500 sm:text-sm">
            {rangeStart} to {rangeEnd}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rangeLoading ? <div className="text-xs text-neutral-400 sm:text-sm">Loading range...</div> : null}
            {rangeErr ? <div className="text-xs text-red-300 sm:text-sm">{rangeErr}</div> : null}
          </div>
        </div>

        <div className="space-y-3">
          {nonEmptyRangeDays.map((day) => (
            <ShiftGroupsSection key={day.work_date} title={day.work_date} rows={day.rows || []} />
          ))}
          {!rangeLoading && !rangeErr && !nonEmptyRangeDays.length ? (
            <div className={`${BLUSH_GLASS} rounded-2xl p-3.5 text-sm text-neutral-500`}>
              No shifts found in this range.
            </div>
          ) : null}
        </div>
      </div>
      </motion.div>
    </div>
  );
}