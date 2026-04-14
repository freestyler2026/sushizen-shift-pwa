"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, CalendarOff, ChevronLeft, ChevronRight, Clock3, MapPin, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type ShiftRow } from "@/lib/api";
import { getAuth, type City } from "@/lib/auth";
import {
  GLASS_CARD,
  SELECT_CLASS,
  T_SECTION,
  T_CAPTION,
  DIVIDER,
} from "@/lib/ui-tokens";

type MyShiftDay = {
  work_date: string;
  count: number;
  rows: ShiftRow[];
};

type MyShiftMonthView = {
  ok: boolean;
  city: string;
  staff_name: string;
  month: string;
  available_months: string[];
  eligible_staff_names: string[];
  shift_days: number;
  monthly_rows: ShiftRow[];
  days: MyShiftDay[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseMonthKey(k: string) {
  const [y, m] = k.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, 1);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function currentYearMonth() {
  return toMonthKey(new Date());
}

function formatHourLabel(hour: number) {
  const value = Number(hour || 0);
  const daySuffix = value >= 24 ? "(+1)" : "";
  const normalized = value >= 24 ? value - 24 : value;
  return `${String(normalized).padStart(2, "0")}:00${daySuffix}`;
}

function hoursLabel(st: number, en: number) {
  return `${formatHourLabel(st)} - ${formatHourLabel(en)}`;
}

function shiftHours(st: number, en: number) {
  const start = Number(st || 0);
  let end = Number(en || 0);
  if (end < start) end += 24;
  return end - start;
}

function dateLabel(value: string) {
  if (!value) return "-";
  const d = parseMonthKey(value.slice(0, 7));
  d.setDate(Number(value.slice(8, 10)) || 1);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function weekdayShort(value: string) {
  if (!value) return "-";
  const d = parseMonthKey(value.slice(0, 7));
  d.setDate(Number(value.slice(8, 10)) || 1);
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
}

function stripJPNotes(name: string) {
  return (name || "").replace(/\([^)]*[^\x00-\x7F][^)]*\)/g, "").trim();
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

export default function MyShiftPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const [city, setCity] = useState<City>("dubai");
  const [staffName, setStaffName] = useState("");
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<MyShiftMonthView | null>(null);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fmy-shift");
      return;
    }
    setAuthed(auth);
    setCity(auth.city || "dubai");
    setStaffName(auth.staffName || "");
  }, [router]);

  useEffect(() => {
    if (!authed?.staffName || !staffName.trim()) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await apiGet<MyShiftMonthView>(
          `/api/shifts/my_month${qs({
            city,
            staff_name: staffName,
            month,
            include_pending: true,
            apply_overrides: true,
          })}`
        );
        if (cancelled) return;

        setData(res);
        const eligible = (res.eligible_staff_names || []).filter(Boolean);
        if (eligible.length && !eligible.includes(staffName)) {
          setStaffName(eligible.includes(authed.staffName) ? authed.staffName : eligible[0]);
          return;
        }

        const today = iso(new Date());
        const nonEmptyDays = (res.days || []).filter((day) => (day.rows || []).length > 0);
        setSelectedDate((prev) => {
          if ((res.days || []).some((day) => day.work_date === prev)) return prev;
          if ((res.days || []).some((day) => day.work_date === today)) return today;
          return nonEmptyDays[0]?.work_date || res.days?.[0]?.work_date || "";
        });
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [authed, city, month, staffName]);

  const monthDate = useMemo(() => parseMonthKey(month), [month]);
  const todayDateIso = useMemo(() => iso(new Date()), []);

  const calendarCells = useMemo(() => {
    const start = startOfMonth(monthDate);
    const firstDow = (start.getDay() + 6) % 7;
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - firstDow);
    const cells: Array<{ date: Date; iso: string; isOtherMonth: boolean }> = [];
    for (let i = 0; i < 42; i += 1) {
      const dt = new Date(gridStart);
      dt.setDate(gridStart.getDate() + i);
      cells.push({
        date: dt,
        iso: iso(dt),
        isOtherMonth: dt.getMonth() !== monthDate.getMonth(),
      });
    }
    return cells;
  }, [monthDate]);

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const day of data?.days || []) {
      map.set(day.work_date, day.rows || []);
    }
    return map;
  }, [data]);

  const selectedRows = rowsByDate.get(selectedDate) || [];
  const selectedWorkRows = selectedRows.filter((row) => !isAbsenceRow(row));
  const selectedAbsenceRows = selectedRows.filter((row) => isAbsenceRow(row));
  const monthlyRows = data?.monthly_rows || [];
  const monthlyShiftRows = monthlyRows.filter((row) => !isAbsenceRow(row));
  const selectedDaySummary = useMemo(() => {
    if (!selectedWorkRows.length) return null;
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;
    let totalHours = 0;
    for (const row of selectedWorkRows) {
      const start = Number(row.start_hour || 0);
      let end = Number(row.end_hour || 0);
      if (end < start) end += 24;
      minStart = Math.min(minStart, start);
      maxEnd = Math.max(maxEnd, end);
      totalHours += end - start;
    }
    return {
      startTime: formatHourLabel(minStart),
      endTime: formatHourLabel(maxEnd),
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [selectedWorkRows]);

  function changeMonth(delta: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
    setMonth(toMonthKey(next));
  }

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="min-h-screen">
      <motion.div
        className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="sticky top-0 z-20 -mx-3 border-b border-white/5 bg-black/40 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:border-none sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-0">
          <div className={`${GLASS_CARD} bg-violet-950/30 p-3 sm:p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white sm:text-2xl">My Shift</h1>
                <p className="mt-1 text-xs text-neutral-500 sm:text-sm">Published monthly schedule</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:text-xs">
                <CalendarCheck className="h-3.5 w-3.5" />
                {data?.shift_days || 0} shift days
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(data?.eligible_staff_names?.length ? data.eligible_staff_names : [staffName]).length <= 1 ? (
                <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/8 bg-neutral-900/70 px-3 py-1.5 text-sm text-white">
                  <User className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <span className="truncate">{stripJPNotes(staffName) || "-"}</span>
                </div>
              ) : (
                <div className="min-w-0 max-w-full">
                  <select
                    className={`${SELECT_CLASS} max-w-full rounded-full border-white/8 bg-neutral-900/70 px-3 py-1.5 text-sm text-white`}
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                  >
                    {(data?.eligible_staff_names?.length ? data.eligible_staff_names : [staffName]).map((name) => (
                      <option key={name} value={name}>
                        {stripJPNotes(name)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="text-center">
                <div className="text-base font-semibold text-white">
                  {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{month}</div>
              </div>

              <button
                type="button"
                className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white active:scale-95"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-white/8 bg-neutral-900/70 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800"
                onClick={() => setMonth(currentYearMonth())}
              >
                This month
              </button>
              <div className="hidden sm:block">
                <input
                  type="month"
                  className={`${SELECT_CLASS} rounded-full border-white/8 bg-neutral-900/70 px-3 py-1.5 text-sm text-white`}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/22 to-purple-500/10 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Selected Day</div>
              <div className="mt-1 text-sm font-semibold text-white">{selectedDate || "-"}</div>
              <div className="mt-0.5 text-xs text-violet-100/75">
                {selectedDate ? dateLabel(selectedDate) : "No day selected"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-[10px] font-medium text-violet-100/85">
                  {selectedWorkRows.length} shift{selectedWorkRows.length === 1 ? "" : "s"}
                </span>
                {selectedAbsenceRows.length ? (
                  <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-[10px] font-medium text-zinc-200/85">
                    {selectedAbsenceRows.length} absence{selectedAbsenceRows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>

            {loading ? <div className="mt-3 text-xs text-neutral-400">Loading monthly shift...</div> : null}
            {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
          </div>
        </div>

        <div className={`${GLASS_CARD} bg-violet-950/30 p-3 sm:p-4`}>
          <div className="mb-2 grid grid-cols-7">
            {["M", "T", "W", "T", "F", "S", "S"].map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:py-2 sm:text-[11px]"
              >
                {item}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarCells.map((cell) => {
              const rows = rowsByDate.get(cell.iso) || [];
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayDateIso;
              const hasShift = rows.some((row) => !isAbsenceRow(row));
              const hasAbsence = rows.some((row) => isAbsenceRow(row));
              const firstShift = rows.find((row) => !isAbsenceRow(row));
              const shiftLabel = firstShift ? `${formatHourLabel(firstShift.start_hour)}-${formatHourLabel(firstShift.end_hour)}` : "";

              return (
                <div
                  key={cell.iso}
                  onClick={() => {
                    setSelectedDate(cell.iso);
                    if (cell.isOtherMonth) setMonth(toMonthKey(cell.date));
                  }}
                  className={[
                    "flex min-h-[68px] cursor-pointer flex-col rounded-2xl border p-2 transition-all duration-150 sm:min-h-[92px]",
                    isToday ? "border-yellow-400/40 bg-violet-500/12 ring-1 ring-yellow-400/30" : "border-white/5",
                    isSelected ? "border-violet-400 bg-violet-600/25 text-white ring-1 ring-violet-400/30" : "hover:border-white/15 hover:bg-violet-950/45",
                    hasShift ? "bg-violet-950/30" : "",
                    hasAbsence && !hasShift ? "border-white/8 bg-white/5" : "",
                    cell.isOtherMonth ? "opacity-30" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={[
                        "text-sm font-semibold leading-none",
                        isToday ? "text-yellow-200" : "text-zinc-300",
                        isSelected ? "text-white" : "",
                      ].join(" ")}
                    >
                      {cell.date.getDate()}
                    </span>
                    {(hasShift || hasAbsence) && !cell.isOtherMonth ? (
                      <span className={`h-2 w-2 rounded-full ${hasShift ? "bg-emerald-400" : "bg-zinc-400"}`} />
                    ) : null}
                  </div>

                  <div className="mt-auto">
                    {hasShift ? (
                      <>
                        <div className="mt-1 text-[10px] font-medium text-emerald-300 sm:hidden">
                          {rows.filter((row) => !isAbsenceRow(row)).length} shift
                        </div>
                        <div className="mt-1 hidden truncate text-[10px] font-medium text-emerald-400 sm:block">
                          {shiftLabel}
                        </div>
                      </>
                    ) : null}
                    {hasAbsence && !hasShift ? (
                      <>
                        <div className="mt-1 text-[10px] font-medium text-zinc-400 sm:hidden">Off</div>
                        <div className="mt-1 hidden truncate text-[10px] font-medium text-zinc-400 sm:block">
                          Off / Leave
                        </div>
                      </>
                    ) : null}
                    {!hasShift && !hasAbsence ? <div className="mt-1 h-3 sm:h-4" /> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-neutral-500 sm:flex sm:flex-wrap sm:gap-3">
            <div className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Shift published
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Off / Leave
            </div>
          </div>
        </div>

        <div className={DIVIDER} />

        <div className={`${GLASS_CARD} bg-violet-950/30 p-4 sm:p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-5 w-1 rounded-full bg-violet-500" />
                <h2 className="text-base font-semibold text-white sm:text-lg">Day Details</h2>
              </div>
              <p className="mt-1 text-xs text-neutral-400 sm:text-sm">{selectedDate ? dateLabel(selectedDate) : "-"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedDate !== todayDateIso ? (
                <button
                  type="button"
                  className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 active:scale-95"
                  onClick={() => {
                    setMonth(currentYearMonth());
                    setSelectedDate(todayDateIso);
                  }}
                >
                  Today
                </button>
              ) : null}
              {selectedAbsenceRows.length ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/20 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  <CalendarOff className="h-3.5 w-3.5" />
                  {selectedAbsenceRows.length} absence entr{selectedAbsenceRows.length === 1 ? "y" : "ies"}
                </span>
              ) : null}
            </div>
          </div>

          {selectedDaySummary ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
                    <Clock3 className="h-3.5 w-3.5" />
                    Start Time
                  </div>
                  <p className="mt-2 text-lg font-bold text-white sm:text-2xl">{selectedDaySummary.startTime}</p>
                </div>
                <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
                    <Clock3 className="h-3.5 w-3.5" />
                    End Time
                  </div>
                  <p className="mt-2 text-lg font-bold text-white sm:text-2xl">{selectedDaySummary.endTime}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/18 to-teal-500/10 p-3 sm:p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200/80">Hours</div>
                  <p className="mt-2 text-lg font-bold text-emerald-300 sm:text-2xl">{selectedDaySummary.totalHours}h</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {selectedWorkRows.map((row, idx) => (
                  <div
                    key={`${row.work_date}-${row.branch_code}-${idx}`}
                    className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] font-medium text-violet-100">
                          <MapPin className="h-3.5 w-3.5 text-violet-300" />
                          {row.branch_code || "Store"}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white sm:text-base">{row.role || "Shift"}</div>
                        {row.area ? <div className="mt-1 text-xs text-neutral-400">Area: {row.area}</div> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-white">{hoursLabel(row.start_hour, row.end_hour)}</div>
                        <div className="mt-1 text-base font-bold text-emerald-300">{shiftHours(row.start_hour, row.end_hour)}h</div>
                        {row.applied?.applied_type === "time_change" ? (
                          <div className="mt-1 text-[11px] font-medium text-amber-300">Updated</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedAbsenceRows.length ? (
                <div className="mt-4 space-y-2">
                  {selectedAbsenceRows.map((row, idx) => (
                    <div key={`${row.work_date}-absence-${idx}`} className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5">
                      <div className="text-sm font-semibold text-zinc-300">{row.role}</div>
                      {row.applied?.note ? <div className="mt-1 text-xs text-neutral-300">{String(row.applied.note)}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <CalendarOff className="h-8 w-8 text-zinc-600" />
              <p className={T_CAPTION}>No shift published for this day.</p>
              {selectedAbsenceRows.length ? (
                <div className="mt-2 space-y-2">
                  {selectedAbsenceRows.map((row, idx) => (
                    <div
                      key={`${row.work_date}-absence-empty-${idx}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-zinc-400"
                    >
                      <CalendarOff className="h-3 w-3" />
                      {row.role}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className={DIVIDER} />

        <div className={`${GLASS_CARD} bg-violet-950/30 p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={T_SECTION}>Monthly Shifts</h2>
            <span className={T_CAPTION}>{monthlyShiftRows.length} entries</span>
          </div>

          {monthlyShiftRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <CalendarOff className="h-6 w-6 text-zinc-600" />
              <p className={T_CAPTION}>No shifts this month.</p>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-2 sm:hidden">
                {monthlyShiftRows.map((row, idx) => (
                  <div
                    key={`${row.work_date}-${row.branch_code}-${idx}`}
                    onClick={() => setSelectedDate(row.work_date)}
                    className={`cursor-pointer rounded-2xl border p-3 transition ${
                      row.work_date === selectedDate
                        ? "border-violet-400/40 bg-violet-600/15 ring-1 ring-violet-400/20"
                        : "border-white/8 bg-white/5 hover:border-violet-400/30 hover:bg-violet-950/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-white">{dateLabel(row.work_date)}</div>
                          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                            {weekdayShort(row.work_date)}
                          </span>
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/15 px-2 py-0.5 text-[11px] text-neutral-300">
                          <MapPin className="h-3 w-3 text-violet-300" />
                          {row.branch_code || "Store"}
                        </div>
                        <div className="mt-2 text-xs text-neutral-400">{row.role || "Shift"}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-white">{hoursLabel(row.start_hour, row.end_hour)}</div>
                        <div className="mt-1 text-base font-bold text-emerald-300">{shiftHours(row.start_hour, row.end_hour)}h</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Date</th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Day</th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Start</th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">End</th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyShiftRows.map((row, idx) => (
                      <tr
                        key={`${row.work_date}-${row.branch_code}-${idx}`}
                        onClick={() => setSelectedDate(row.work_date)}
                        className={`cursor-pointer border-t border-white/5 transition-colors duration-150 ${
                          row.work_date === selectedDate ? "bg-violet-500/10" : "hover:bg-violet-950/45"
                        }`}
                      >
                        <td className="py-3 text-sm text-zinc-200">{row.work_date}</td>
                        <td className="py-3 text-sm text-zinc-400">{weekdayShort(row.work_date)}</td>
                        <td className="py-3 text-sm font-medium text-white">{formatHourLabel(row.start_hour)}</td>
                        <td className="py-3 text-sm font-medium text-white">{formatHourLabel(row.end_hour)}</td>
                        <td className="py-3 text-sm font-medium text-emerald-400">{shiftHours(row.start_hour, row.end_hour)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
