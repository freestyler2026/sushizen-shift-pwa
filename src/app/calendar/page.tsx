"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, qs, type ShiftRow, type DayView } from "@/lib/api";
import { getAuth, type City } from "@/lib/auth";

// API が branch_code / area を返す前提
type ShiftRowEx = ShiftRow & { branch_code?: string; area?: string };

// -----------------------------
// date utils
// -----------------------------
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
function norm(s: string) {
  return (s || "").trim().toLowerCase();
}
function hoursLabel(st: number, en: number) {
  const fmt = (h: number) => (h >= 24 ? `${h - 24}:00(+1)` : `${h}:00`);
  return `${fmt(st)} - ${fmt(en)}`;
}

// JP notes は常に除去
function stripJPNotes(name: string) {
  return (name || "").replace(/\([^)]*[^\x00-\x7F][^)]*\)/g, "").trim();
}

// -----------------------------
// absence dot color mapping
// -----------------------------
type AbsenceType =
  | "DAY_OFF"
  | "VACATION_LEAVE"
  | "MATERNITY_LEAVE"
  | "MEDICAL_LEAVE"
  | "INJURY"
  | "HOSPITAL"
  | "ABSENT"
  | "BEREAVEMENT_LEAVE";

function dotClassForAbsenceType(t: string): string {
  const u = (t || "").toUpperCase() as AbsenceType;
  switch (u) {
    case "DAY_OFF":
      return "bg-sky-400";
    case "VACATION_LEAVE":
      return "bg-violet-400";
    case "MATERNITY_LEAVE":
      return "bg-pink-400";
    case "MEDICAL_LEAVE":
      return "bg-orange-400";
    case "INJURY":
      return "bg-amber-400";
    case "HOSPITAL":
      return "bg-fuchsia-400";
    case "ABSENT":
      return "bg-rose-500";
    case "BEREAVEMENT_LEAVE":
      return "bg-indigo-400";
    default:
      return "bg-rose-400";
  }
}

function labelForAbsenceType(t: string): string {
  const u = (t || "").toUpperCase().trim();
  return u || "ABSENCE";
}

// -----------------------------
// timeline helpers
// -----------------------------
function hourText(h: number) {
  if (h >= 24) return `${h - 24}(+1)`;
  return `${h}`;
}

function TimelineDay({
  title,
  groups,
  myName,
}: {
  title: string;
  groups: Array<{
    branch_code: string;
    area: string;
    staff: Array<{ name: string; rows: ShiftRowEx[] }>;
  }>;
  myName: string;
}) {
  // fixed range
  const startH = 8;
  const endH = 30; // 06(+1)
  const total = Math.max(1, endH - startH);
  const ticks = [8, 12, 16, 20, 24, 28, 30];

  const isAbsenceRow = (r: ShiftRowEx) => {
    const at = String(r.role || "").toUpperCase().trim();
    if ((r as any)?.applied?.applied_type === "absence") return true;
    return Number(r.start_hour ?? 0) === 0 && Number(r.end_hour ?? 0) === 0 && (
      at === "DAY_OFF" ||
      at === "VACATION_LEAVE" ||
      at === "MATERNITY_LEAVE" ||
      at === "MEDICAL_LEAVE" ||
      at === "INJURY" ||
      at === "HOSPITAL" ||
      at === "ABSENT" ||
      at === "BEREAVEMENT_LEAVE"
    );
  };

  const timeText = (rows: ShiftRowEx[]) => {
    const shifts = rows.filter((r) => !isAbsenceRow(r));
    if (!shifts.length) return "";
    return shifts
      .slice()
      .sort((a, b) => (a.start_hour ?? 0) - (b.start_hour ?? 0))
      .map((r) => hoursLabel(r.start_hour, r.end_hour))
      .join(", ");
  };

  const barClass = (r: ShiftRowEx) => {
    const isFinal = r.override?.status === "FINAL";
    const isPending = r.override?.status === "PENDING";
    if (isFinal) return "bg-emerald-500/25 border-emerald-400/60";
    if (isPending) return "bg-amber-500/25 border-amber-400/60";
    return "bg-sky-500/20 border-sky-400/40";
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">
          Range: {hourText(startH)}–{hourText(endH)}
        </div>
      </div>

      {/* ✅ hour scale (only once, not per branch) */}
      <div className="mb-4 grid grid-cols-[140px_1fr] gap-2">
        <div className="text-xs text-neutral-500" />
        <div className="relative h-6 rounded-lg border border-neutral-800 bg-neutral-950/30">
          {ticks.map((h) => {
            const left = ((h - startH) / total) * 100;
            return (
              <div
                key={h}
                className="absolute top-0 h-full border-l border-neutral-800/70"
                style={{ left: `${left}%` }}
              >
                <div className="absolute -top-5 -translate-x-1/2 text-[10px] text-neutral-500">
                  {hourText(h)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {groups.map((b) => (
        <div key={b.branch_code} className="mb-6 last:mb-0">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{b.branch_code}</div>
            <div className="text-xs text-neutral-500">{b.staff.length} staff</div>
          </div>

          <div className="space-y-3">
            {b.staff.map((s) => {
              const isMe = norm(s.name) === norm(myName);

              const shifts = s.rows.filter((r) => !isAbsenceRow(r));
              const absRows = s.rows.filter((r) => isAbsenceRow(r));
              const absType = absRows.length ? String(absRows[0].role || "").toUpperCase().trim() : "";
              const absNote = absRows.length ? String((absRows[0] as any)?.applied?.note || "") : "";

              return (
                <div key={s.name} className="grid grid-cols-[140px_1fr] gap-2">
                  <div className="min-w-0">
                    <div
                      className={`truncate text-sm font-medium ${isMe ? "text-amber-300" : "text-neutral-200"}`}
                      title={s.name}
                    >
                      {s.name}
                      {isMe ? <span className="ml-2 text-[11px]">(You)</span> : null}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {absRows.length ? absType : (s.rows[0]?.role || "")}
                    </div>
                  </div>

                  {/* ✅ two rows: bars only + numbers only */}
                  <div>
                    <div
                      className={`relative h-10 rounded-lg border ${
                        isMe ? "border-amber-800/60 bg-amber-950/10" : "border-neutral-800 bg-neutral-950/30"
                      }`}
                    >
                      {/* inner grid */}
                      <div className="absolute inset-0 flex overflow-hidden rounded-lg">
                        {Array.from({ length: endH - startH }).map((_, i) => (
                          <div key={i} className="flex-1 border-r border-neutral-900/60 last:border-r-0" />
                        ))}
                      </div>

                      {/* bars only */}
                      {shifts.map((r, idx) => {
                        const st = Number(r.start_hour ?? 0);
                        const en = Number(r.end_hour ?? 0);

                        const stC = Math.max(startH, Math.min(endH, st));
                        const enC = Math.max(startH, Math.min(endH, en));

                        const left = ((stC - startH) / total) * 100;
                        const width = ((enC - stC) / total) * 100;
                        const w = Math.max(2, width);

                        return (
                          <div
                            key={idx}
                            className={`absolute top-1 h-8 rounded-md border ${barClass(r)}`}
                            style={{ left: `${left}%`, width: `${w}%` }}
                            title={`${r.role} ${hourText(st)}–${hourText(en)}`}
                          />
                        );
                      })}

                      {/* absence marker */}
                      {absRows.length ? (
                        <div
                          className="absolute top-1 left-0 h-8 w-[3px] rounded bg-rose-400/70"
                          title={absNote || absType}
                        />
                      ) : null}
                    </div>

                    {/* numbers only */}
                    <div className="mt-2 text-[12px] text-neutral-200/90">
                      {absRows.length ? (
                        <span className="text-rose-200">
                          {absType}
                          {absNote ? <span className="text-neutral-400"> • {absNote}</span> : null}
                        </span>
                      ) : (
                        timeText(s.rows) || <span className="text-neutral-500">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// -----------------------------
// page
// -----------------------------
export default function CalendarPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const myNameRaw = authed?.staffName || "";
  const myName = stripJPNotes(myNameRaw);

  const [city, setCity] = useState<City>("dubai");

  const [mKey, setMKey] = useState(() => toMonthKey(new Date()));
  const monthDate = useMemo(() => parseMonthKey(mKey), [mKey]);

  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");

  // month highlight
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthErr, setMonthErr] = useState("");
  const [myWorkDays, setMyWorkDays] = useState<Set<string>>(new Set());
  const [myAbsenceByDay, setMyAbsenceByDay] = useState<Record<string, string>>({});
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  // selected day
  const [dayLoading, setDayLoading] = useState(false);
  const [dayErr, setDayErr] = useState("");
  const [dayView, setDayView] = useState<DayView | null>(null);

  // init auth + city
  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login?next=%2Fcalendar");
      return;
    }
    setAuthed(a);
    setCity(a.city || "dubai");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // max_date -> month + selectedDate
  useEffect(() => {
    const run = async () => {
      if (!authed) return;
      try {
        const r = await apiGet<{ ok: boolean; city: string; max_date: string | null }>(
          `/api/shifts/max_date${qs({ city })}`
        );
        if (r?.max_date) {
          const d = new Date(r.max_date + "T00:00:00");
          setMKey(toMonthKey(d));
          setSelectedDate(r.max_date);
        }
      } catch {
        // ignore
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, city]);

  // fetch selected day
  const fetchDay = async (d: string) => {
    setDayLoading(true);
    setDayErr("");
    try {
      const dv = await apiGet<DayView>(
        `/api/shifts/view${qs({
          city,
          work_date: d,
          include_pending: true,
          apply_overrides: true,
        })}`
      );
      setDayView(dv);
    } catch (e: any) {
      setDayErr(e?.message || String(e));
      setDayView(null);
    } finally {
      setDayLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    fetchDay(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, city, selectedDate]);

  // month highlight (work + absence_by_day)
  useEffect(() => {
    abortRef.current.aborted = false;

    const run = async () => {
      if (!authed || !myName.trim()) {
        setMyWorkDays(new Set());
        setMyAbsenceByDay({});
        return;
      }

      setMonthLoading(true);
      setMonthErr("");

      try {
        const r = await apiGet<{
          ok: boolean;
          city: string;
          staff_name: string;
          month: string;
          shift_days: string[];
          absence_by_day: Record<string, string>;
        }>(
          `/api/shifts/my_calendar_days${qs({
            city,
            staff_name: myNameRaw,
            month: mKey,
          })}`
        );

        if (abortRef.current.aborted) return;

        setMyWorkDays(new Set(r.shift_days || []));
        setMyAbsenceByDay(r.absence_by_day || {});
      } catch (e: any) {
        if (!abortRef.current.aborted) {
          setMonthErr(e?.message || String(e));
          setMyWorkDays(new Set());
          setMyAbsenceByDay({});
        }
      } finally {
        if (!abortRef.current.aborted) setMonthLoading(false);
      }
    };

    run();
    return () => {
      abortRef.current.aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, city, mKey, myNameRaw, myName]);

  // calendar cells
  const calCells = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    const firstDow = (start.getDay() + 6) % 7; // Mon=0
    const daysInMonth = end.getDate();

    const cells: Array<{ kind: "blank" } | { kind: "day"; date: Date; iso: string }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ kind: "blank" });

    for (let d = 1; d <= daysInMonth; d++) {
      const dt2 = new Date(start.getFullYear(), start.getMonth(), d);
      cells.push({ kind: "day", date: dt2, iso: iso(dt2) });
    }
    while (cells.length % 7 !== 0) cells.push({ kind: "blank" });

    return cells;
  }, [monthDate]);

  // selected-day grouping: branch -> staff
  const grouped = useMemo(() => {
    const rows = (dayView?.rows || []) as ShiftRowEx[];
    const byBranch = new Map<string, { area: string; byStaff: Map<string, ShiftRowEx[]> }>();

    for (const r0 of rows) {
      const r = { ...r0, staff_name: stripJPNotes(r0.staff_name || "") };
      const bc = (r.branch_code || "").trim() || "UNKNOWN";
      const ar = (r.area || "").trim();
      const staff = (r.staff_name || "").trim();
      if (!staff) continue;

      if (!byBranch.has(bc)) byBranch.set(bc, { area: ar, byStaff: new Map() });
      const entry = byBranch.get(bc)!;
      if (!entry.area && ar) entry.area = ar;

      if (!entry.byStaff.has(staff)) entry.byStaff.set(staff, []);
      entry.byStaff.get(staff)!.push(r);
    }

    const branchKeys = Array.from(byBranch.keys()).sort((a, b) => {
      if (a === "UNKNOWN") return 1;
      if (b === "UNKNOWN") return -1;
      return a.localeCompare(b);
    });

    return branchKeys.map((bc) => {
      const entry = byBranch.get(bc)!;
      const staffKeys = Array.from(entry.byStaff.keys()).sort((a, b) => a.localeCompare(b));
      return {
        branch_code: bc,
        area: entry.area,
        staff: staffKeys.map((s) => ({
          name: s,
          rows: entry.byStaff.get(s)!.slice().sort((x, y) => x.start_hour - y.start_hour),
        })),
      };
    });
  }, [dayView]);

  const myRows = useMemo(() => {
    const rows = (dayView?.rows || []) as ShiftRowEx[];
    const key = norm(myName);
    return rows
      .map((r) => ({ ...r, staff_name: stripJPNotes(r.staff_name || "") }))
      .filter((r) => norm(r.staff_name) === key)
      .sort((a, b) => a.start_hour - b.start_hour);
  }, [dayView, myName]);

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  const todayIso = iso(new Date());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Calendar</div>
            <div className="text-xs text-neutral-400">
              Logged in as: <span className="text-neutral-200">{myName || "-"}</span>
            </div>
          </div>
          {/* ✅ Logout is handled by NavBar (avoid duplicates) */}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-neutral-400">City</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Month</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              type="month"
              value={mKey}
              onChange={(e) => setMKey(e.target.value)}
            />
          </div>

          <div className="flex items-end justify-end gap-2">
            <button
              onClick={() => setViewMode("timeline")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                viewMode === "timeline"
                  ? "border-amber-500 bg-amber-950/25"
                  : "border-neutral-800 bg-neutral-950/30 hover:bg-neutral-900/40"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                viewMode === "list"
                  ? "border-amber-500 bg-amber-950/25"
                  : "border-neutral-800 bg-neutral-950/30 hover:bg-neutral-900/40"
              }`}
            >
              List
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {monthLoading ? <div className="text-sm text-neutral-400">Loading month…</div> : null}
          {monthErr ? <div className="text-sm text-red-300">{monthErr}</div> : null}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Work
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Day off
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> Vacation
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-400" /> Maternity
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-orange-400" /> Medical
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Injury
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Hospital
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Absent
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="grid grid-cols-7 gap-2 text-xs text-neutral-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
            <div key={x} className="px-1">
              {x}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {calCells.map((c, idx) => {
            if (c.kind === "blank") {
              return <div key={`b-${idx}`} className="h-12 rounded-lg border border-transparent" />;
            }

            const isToday = c.iso === todayIso;
            const isSelected = c.iso === selectedDate;

            const hasWork = myWorkDays.has(c.iso);
            const absType = myAbsenceByDay[c.iso];
            const hasAbs = !!absType;

            const cls = [
              "h-12 rounded-xl border px-2 py-2 text-sm cursor-pointer select-none",
              isSelected
                ? "border-amber-400 bg-amber-950/25"
                : isToday
                ? "border-yellow-400 bg-yellow-950/20"
                : "border-neutral-800 bg-neutral-950/30 hover:bg-neutral-900/40",
            ].join(" ");

            const tip = hasWork ? "Work day" : hasAbs ? `Absence: ${labelForAbsenceType(absType)}` : "";
            const absDotCls = dotClassForAbsenceType(absType);

            return (
              <div key={c.iso} className={cls} onClick={() => setSelectedDate(c.iso)} title={tip}>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-100">{c.date.getDate()}</div>

                  {hasWork ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ) : hasAbs ? (
                    <span className={`h-2 w-2 rounded-full ${absDotCls}`} />
                  ) : (
                    <span className="h-2 w-2" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Selected day</div>
            <div className="text-xs text-neutral-400">{selectedDate}</div>
          </div>

          <button
            onClick={() => fetchDay(selectedDate)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900"
          >
            Refresh day
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {dayLoading ? <div className="text-sm text-neutral-400">Loading…</div> : null}
          {dayErr ? <div className="text-sm text-red-300">{dayErr}</div> : null}
        </div>

        {/* My shift */}
        <div className="mt-4">
          <div className="text-sm font-semibold">My shift</div>
          <div className="mt-2 space-y-2">
            {myRows.length ? (
              myRows.map((r, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <div className="text-sm font-medium">{stripJPNotes(r.staff_name)}</div>
                  <div className="text-xs text-neutral-400">
                    {r.role} • {hoursLabel(r.start_hour, r.end_hour)} • {(r.branch_code || r.area || "—")}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-neutral-500">No shift.</div>
            )}
          </div>
        </div>

        {/* All staff */}
        <div className="mt-6">
          <div className="text-sm font-semibold">All staff (by branch)</div>

          {!dayView ? (
            <div className="mt-2 text-sm text-neutral-500">No data.</div>
          ) : viewMode === "timeline" ? (
            <div className="mt-3">
              <TimelineDay title={`Selected day • ${selectedDate}`} groups={grouped} myName={myName} />
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {grouped.map((b) => (
                <div key={b.branch_code} className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{b.branch_code}</div>
                    <div className="text-xs text-neutral-400">{b.area || ""}</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {b.staff.map((s) => {
                      const isMe = norm(s.name) === norm(myName);
                      const times = s.rows.map((r) => hoursLabel(r.start_hour, r.end_hour)).join(", ");
                      const role = s.rows[0]?.role || "";

                      return (
                        <div
                          key={s.name}
                          className={[
                            "rounded-xl border px-3 py-2",
                            isMe ? "border-amber-700/60 bg-amber-950/20" : "border-neutral-800 bg-neutral-900/30",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {s.name} {isMe ? <span className="text-[11px] text-amber-300">(You)</span> : null}
                              </div>
                              <div className="text-xs text-neutral-400">{times || "—"}</div>
                            </div>
                            <div className="shrink-0 text-xs text-neutral-500">{role}</div>
                          </div>
                        </div>
                      );
                    })}
                    {!b.staff.length ? <div className="text-sm text-neutral-500">No staff.</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Tip: Month highlight uses /api/shifts/my_calendar_days. Green dot = work. Absence dots are colored by type.
        </div>
      </div>
    </div>
  );
}