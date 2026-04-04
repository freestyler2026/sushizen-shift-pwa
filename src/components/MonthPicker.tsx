"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseMonth(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const parsed = parseMonth(value);
  if (!parsed) return "Select month";
  return `${MONTH_NAMES[parsed.month]} ${parsed.year}`;
}

export default function MonthPicker({ value, onChange, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const parsed = parseMonth(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(parsed?.year || new Date().getFullYear());
  const [portalReady, setPortalReady] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (parsed?.year) setYear(parsed.year);
  }, [parsed?.year]);

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

  const months = useMemo(
    () => MONTH_NAMES.map((name, index) => ({ name, key: monthKey(year, index), active: value === monthKey(year, index) })),
    [value, year]
  );

  return (
    <div ref={rootRef} className={`relative ${open ? "z-[120]" : ""} ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-left text-sm text-white transition-all duration-200 outline-none hover:bg-white/10"
      >
        <span className="truncate">{monthLabel(value)}</span>
        <span className="ml-3 text-xs text-zinc-500">{open ? "Close" : "Month"}</span>
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
              onClick={() => setYear((prev) => prev - 1)}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              -1Y
            </button>
            <div className="text-sm font-semibold text-white">{year}</div>
            <button
              type="button"
              onClick={() => setYear((prev) => prev + 1)}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white"
            >
              +1Y
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {months.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onChange(item.key);
                  setOpen(false);
                }}
                className={[
                  "rounded-xl px-3 py-2 text-sm transition-all duration-200",
                  item.active
                    ? "border border-violet-500/30 bg-violet-500/20 font-semibold text-violet-300"
                    : "border border-white/10 bg-white/6 text-zinc-300 hover:border-white/20 hover:bg-white/12 hover:text-white",
                ].join(" ")}
              >
                {item.name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
