"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type ShiftRow } from "@/lib/api";
import { getAuth, type City } from "@/lib/auth";

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

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y}-${m}`;
}

function hoursLabel(st: number, en: number) {
  const fmt = (h: number) => (h >= 24 ? `${h - 24}:00(+1)` : `${h}:00`);
  return `${fmt(st)} - ${fmt(en)}`;
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

  const calendarCells = useMemo(() => {
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

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3.5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold sm:text-base">My Shift</div>
            <div className="text-xs text-neutral-400">
              Published monthly schedule for <span className="text-neutral-200">{stripJPNotes(staffName) || "-"}</span>
            </div>
          </div>
          {data ? <div className="text-xs text-neutral-500">{data.shift_days} shift days</div> : null}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-neutral-400">Name</div>
            <select
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
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
            <div className="mb-1 text-xs text-neutral-400">Month</div>
            <select
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {(data?.available_months || [month]).map((item) => (
                <option key={item} value={item}>
                  {monthLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
            <div className="text-[11px] text-neutral-500">Selected day</div>
            <div className="mt-1 text-sm font-medium text-neutral-100">{selectedDate || "-"}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {loading ? <div className="text-sm text-neutral-400">Loading monthly shift...</div> : null}
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-2.5 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-[10px] text-neutral-400 sm:gap-2 sm:text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((item) => (
            <div key={item} className="px-1">
              {item}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell, idx) => {
            if (cell.kind === "blank") {
              return <div key={`blank-${idx}`} className="h-12 rounded-lg border border-transparent" />;
            }

            const rows = rowsByDate.get(cell.iso) || [];
            const isSelected = cell.iso === selectedDate;
            const hasShift = rows.some((row) => !isAbsenceRow(row));
            const hasAbsence = rows.some((row) => isAbsenceRow(row));

            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                className={[
                  "h-12 rounded-xl border px-1 py-1.5 text-left text-[11px]",
                  isSelected
                    ? "border-amber-400 bg-amber-950/25"
                    : "border-neutral-800 bg-neutral-950/30 hover:bg-neutral-900/40",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-100">{cell.date.getDate()}</span>
                  {hasShift ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ) : hasAbsence ? (
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                  ) : (
                    <span className="h-2 w-2" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Day details</div>
            <div className="text-xs text-neutral-400">{selectedDate || "-"}</div>
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          {selectedWorkRows.map((row, idx) => (
            <div key={`${row.work_date}-${row.branch_code}-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-100">{row.branch_code || "Store"}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">{row.role || "Shift"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-medium text-neutral-100">{hoursLabel(row.start_hour, row.end_hour)}</div>
                  {row.applied?.applied_type === "time_change" ? (
                    <div className="text-[11px] text-amber-300">Updated</div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {selectedAbsenceRows.map((row, idx) => (
            <div key={`${row.work_date}-absence-${idx}`} className="rounded-xl border border-rose-900/40 bg-rose-950/10 px-3 py-2.5">
              <div className="text-sm font-semibold text-rose-200">{row.role}</div>
              {row.applied?.note ? <div className="mt-1 text-xs text-neutral-300">{String(row.applied.note)}</div> : null}
            </div>
          ))}

          {!selectedWorkRows.length && !selectedAbsenceRows.length ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/20 px-3 py-3 text-sm text-neutral-500">
              No shift published for this day.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Monthly shifts</div>
            <div className="text-xs text-neutral-400">{monthLabel(month)}</div>
          </div>
          <div className="text-xs text-neutral-500">{monthlyRows.length} entries</div>
        </div>

        <div className="mt-3 space-y-2.5">
          {monthlyRows.map((row, idx) => (
            <div key={`${row.work_date}-${row.branch_code}-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-100">{row.work_date}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {(row.branch_code || "Store")} • {row.role}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {isAbsenceRow(row) ? (
                    <div className="text-sm font-medium text-rose-200">{row.role}</div>
                  ) : (
                    <div className="text-sm font-medium text-neutral-100">{hoursLabel(row.start_hour, row.end_hour)}</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!monthlyRows.length ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/20 px-3 py-3 text-sm text-neutral-500">
              No monthly shifts available.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
