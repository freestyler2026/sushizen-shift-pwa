"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type ShiftRow } from "@/lib/api";
import { getAuth, type City } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
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
        className="mx-auto max-w-5xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>My Shift</h1>
            <p className={T_BODY}>
              Published monthly schedule for <span className="font-medium text-white">{stripJPNotes(staffName) || "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={BADGE_SUCCESS}>
              <CalendarCheck className="h-3 w-3" />
              {data?.shift_days || 0} shift days
            </span>
          </div>
        </div>

        <div className={`${GLASS_CARD} bg-violet-950/30 p-4`}>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Name</label>
              <select
                className={`${SELECT_CLASS} min-w-[200px] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 focus-visible:ring-violet-500/40`}
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

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Month</label>
              <input
                type="month"
                className={`${INPUT_CLASS} min-w-[160px] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 focus-visible:ring-violet-500/40`}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`} onClick={() => changeMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4 text-violet-300" />
              </button>
              <button type="button" className="rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60" onClick={() => setMonth(currentYearMonth())}>
                Today
              </button>
              <button type="button" className={`${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`} onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4 text-violet-300" />
              </button>
            </div>

            <div className="min-w-[180px] flex-1">
              <label className={`${T_LABEL} mb-1.5 block`}>Selected Day</label>
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10 px-4 py-2.5">
                <div className="text-sm font-medium text-white">{selectedDate || "-"}</div>
                <div className={T_CAPTION}>{selectedDate ? dateLabel(selectedDate) : "No day selected"}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {loading ? <div className={T_BODY}>Loading monthly shift...</div> : null}
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
          </div>
        </div>

        <div className={`${GLASS_CARD} bg-violet-950/30 p-4`}>
          <div className="mb-2 grid grid-cols-7">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((item) => (
              <div
                key={item}
                className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
              >
                {item}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
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
                    "min-h-[80px] cursor-pointer rounded-xl border p-2 transition-all duration-150",
                    isToday ? "border-violet-500/25 bg-violet-500/12" : "border-white/5",
                    isSelected ? "border-violet-500/30 bg-violet-500/15 ring-1 ring-violet-500/20" : "hover:border-white/15 hover:bg-violet-950/45",
                    hasShift ? "bg-violet-950/30" : "",
                    hasAbsence && !hasShift ? "bg-white/5 border border-white/8" : "",
                    cell.isOtherMonth ? "opacity-30" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "text-sm font-medium",
                      isToday ? "text-violet-300" : "text-zinc-300",
                      isSelected ? "font-bold text-violet-200" : "",
                    ].join(" ")}
                  >
                    {cell.date.getDate()}
                  </span>
                  {hasShift ? (
                    <div className="mt-1">
                      <div className="truncate text-[10px] font-medium text-emerald-400">{shiftLabel}</div>
                    </div>
                  ) : null}
                  {hasAbsence && !hasShift ? (
                    <div className="mt-1 truncate text-[10px] font-medium text-zinc-400">Off / Leave</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className={DIVIDER} />

        <div className={`${GLASS_CARD} bg-violet-950/30 p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className={T_SECTION}>Day Details</h2>
              <p className={T_CAPTION}>{selectedDate ? dateLabel(selectedDate) : "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedDate !== todayDateIso ? (
                <button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60"
                  onClick={() => {
                    setMonth(currentYearMonth());
                    setSelectedDate(todayDateIso);
                  }}
                >
                  Today
                </button>
              ) : null}
              {selectedAbsenceRows.length ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/20 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                  <CalendarOff className="h-3 w-3" />
                  {selectedAbsenceRows.length} absence entry
                  {selectedAbsenceRows.length === 1 ? "" : "ies"}
                </span>
              ) : null}
            </div>
          </div>

          {selectedDaySummary ? (
            <>
              <div className="mt-4 flex flex-wrap gap-4">
                <div className={`${KPI_CARD} bg-violet-950/30`}>
                  <p className={KPI_LABEL}>Start Time</p>
                  <p className={`${KPI_VALUE} text-violet-300`}>{selectedDaySummary.startTime}</p>
                </div>
                <div className={`${KPI_CARD} bg-violet-950/30`}>
                  <p className={KPI_LABEL}>End Time</p>
                  <p className={`${KPI_VALUE} text-violet-300`}>{selectedDaySummary.endTime}</p>
                </div>
                <div className={`${KPI_CARD} bg-violet-950/30`}>
                  <p className={KPI_LABEL}>Hours</p>
                  <p className={KPI_VALUE}>{selectedDaySummary.totalHours}h</p>
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
                        <div className={T_CARD_TITLE}>{row.branch_code || "Store"}</div>
                        <div className={T_BODY}>{row.role || "Shift"}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium text-white">{hoursLabel(row.start_hour, row.end_hour)}</div>
                        <div className="text-sm font-medium text-emerald-400">{shiftHours(row.start_hour, row.end_hour)}h</div>
                        {row.applied?.applied_type === "time_change" ? <div className="text-[11px] text-amber-400">Updated</div> : null}
                      </div>
                    </div>
                    {row.area ? <div className={`mt-2 ${T_CAPTION}`}>Area: {row.area}</div> : null}
                  </div>
                ))}
              </div>

              {selectedAbsenceRows.length ? (
                <div className="mt-4 space-y-2">
                  {selectedAbsenceRows.map((row, idx) => (
                    <div key={`${row.work_date}-absence-${idx}`} className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5">
                      <div className="text-sm font-semibold text-zinc-400">{row.role}</div>
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

        <div className={`${GLASS_CARD} bg-violet-950/30 p-5`}>
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
            <div className="mt-4 overflow-x-auto">
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
                      className="cursor-pointer border-t border-white/5 transition-colors duration-150 hover:bg-violet-950/45"
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
          )}
        </div>
      </motion.div>
    </div>
  );
}
