"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toIso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIso(value: string) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthLabel(value: Date) {
  return `${MONTH_NAMES[value.getMonth()]} ${value.getFullYear()}`;
}

function displayDate(value: string) {
  const parsed = parseIso(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}`;
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIso(new Date(month.getFullYear(), month.getMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DatePicker({ value, onChange, className = "", placeholder = "Select date" }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parseIso(value) || startOfDay(new Date())));
  const [portalReady, setPortalReady] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) {
      setViewMonth(startOfMonth(parseIso(value) || startOfDay(new Date())));
    }
  }, [open, value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 320;
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      setPopoverPos({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const todayIso = toIso(startOfDay(new Date()));

  return (
    <div ref={rootRef} className={`relative ${open ? "z-[120]" : ""} ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-left text-sm text-white transition-all duration-200 outline-none hover:bg-white/10"
      >
        <span className="truncate">{value ? displayDate(value) : placeholder}</span>
        <span className="ml-3 text-xs text-zinc-500">{open ? "Close" : "Date"}</span>
      </button>

      {open && portalReady ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[320px] rounded-2xl border border-white/10 bg-[#171717]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              Prev
            </button>
            <div className="text-sm font-semibold text-white">{monthLabel(viewMonth)}</div>
            <button
              type="button"
              onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              Next
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-1 py-2 text-center text-[10px] font-semibold tracking-[0.15em] text-zinc-500">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((iso, index) =>
              iso ? (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={[
                    "h-10 rounded-xl text-sm transition-all duration-150",
                    iso === value
                      ? "border border-amber-500/40 bg-amber-500/20 font-semibold text-amber-300"
                      : iso === todayIso
                        ? "border border-sky-500/25 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15"
                        : "border border-transparent text-zinc-300 hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                >
                  {Number(iso.slice(-2))}
                </button>
              ) : (
                <div key={`empty-${index}`} className="h-10" />
              ),
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
