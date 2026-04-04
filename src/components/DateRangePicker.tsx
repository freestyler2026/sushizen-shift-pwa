"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type RangeValue = {
  from: string;
  to: string;
};

type PresetId =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "this_year"
  | "last_7_days"
  | "last_15_days"
  | "last_30_days"
  | "last_90_days"
  | "custom";

type Preset = {
  id: PresetId;
  label: string;
  getRange?: (today: Date) => RangeValue;
};

type Props = {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  className?: string;
};

const PRESETS: Preset[] = [
  { id: "today", label: "Today", getRange: (today) => ({ from: toIso(today), to: toIso(today) }) },
  {
    id: "yesterday",
    label: "Yesterday",
    getRange: (today) => {
      const day = addDays(today, -1);
      return { from: toIso(day), to: toIso(day) };
    },
  },
  {
    id: "this_week",
    label: "This week",
    getRange: (today) => ({ from: toIso(startOfWeek(today)), to: toIso(today) }),
  },
  {
    id: "this_month",
    label: "This month",
    getRange: (today) => ({ from: toIso(startOfMonth(today)), to: toIso(today) }),
  },
  {
    id: "this_year",
    label: "This year",
    getRange: (today) => ({ from: toIso(startOfYear(today)), to: toIso(today) }),
  },
  {
    id: "last_7_days",
    label: "Last 7 days",
    getRange: (today) => ({ from: toIso(addDays(today, -6)), to: toIso(today) }),
  },
  {
    id: "last_15_days",
    label: "Last 15 days",
    getRange: (today) => ({ from: toIso(addDays(today, -14)), to: toIso(today) }),
  },
  {
    id: "last_30_days",
    label: "Last 30 days",
    getRange: (today) => ({ from: toIso(addDays(today, -29)), to: toIso(today) }),
  },
  {
    id: "last_90_days",
    label: "Last 90 days",
    getRange: (today) => ({ from: toIso(addDays(today, -89)), to: toIso(today) }),
  },
  { id: "custom", label: "Custom" },
];

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

function addDays(value: Date, days: number) {
  const next = startOfDay(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfYear(value: Date) {
  return new Date(value.getFullYear(), 0, 1);
}

function startOfWeek(value: Date) {
  const next = startOfDay(value);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  return next;
}

function monthLabel(value: Date) {
  return `${MONTH_NAMES[value.getMonth()]} ${value.getFullYear()}`;
}

function displayDate(value: string) {
  const parsed = parseIso(value);
  if (!parsed) return "";
  return `${parsed.getDate()} ${MONTH_NAMES[parsed.getMonth()].slice(0, 3)}, ${parsed.getFullYear()}`;
}

function compareIso(a: string, b: string) {
  return a.localeCompare(b);
}

function sameRange(a: RangeValue, b: RangeValue) {
  return a.from === b.from && a.to === b.to;
}

function resolvePresetRange(id: PresetId) {
  const today = startOfDay(new Date());
  const preset = PRESETS.find((row) => row.id === id);
  if (!preset?.getRange) return { from: "", to: "" };
  return preset.getRange(today);
}

function matchPreset(value: RangeValue): PresetId {
  if (!value.from || !value.to) return "custom";
  for (const preset of PRESETS) {
    if (!preset.getRange) continue;
    if (sameRange(value, preset.getRange(startOfDay(new Date())))) return preset.id;
  }
  return "custom";
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

export default function DateRangePicker({ value, onChange, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<PresetId>(() => matchPreset(value));
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [viewMonth, setViewMonth] = useState(() => {
    const parsed = parseIso(value.from) || addMonths(startOfDay(new Date()), -1);
    return startOfMonth(parsed);
  });
  const [portalReady, setPortalReady] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 240 });

  useEffect(() => {
    if (!open) {
      setDraftPreset(matchPreset(value));
      setDraftFrom(value.from);
      setDraftTo(value.to);
      const parsed = parseIso(value.from) || addMonths(startOfDay(new Date()), -1);
      setViewMonth(startOfMonth(parsed));
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

  const buttonLabel = useMemo(() => {
    const presetId = matchPreset(value);
    const preset = PRESETS.find((row) => row.id === presetId);
    if (preset && preset.id !== "custom") return preset.label;
    if (value.from && value.to) return `${displayDate(value.from)} - ${displayDate(value.to)}`;
    return "Select range";
  }, [value]);

  const months = useMemo(() => [viewMonth, addMonths(viewMonth, 1)], [viewMonth]);
  const isCustomOpen = draftPreset === "custom";

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const desiredWidth = isCustomOpen ? Math.min(window.innerWidth - 16, 860) : 240;
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - desiredWidth - 8),
      );
      setPopoverPos({
        top: rect.bottom + 8,
        left,
        width: desiredWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isCustomOpen, open]);

  function applyPreset(id: PresetId) {
    setDraftPreset(id);
    if (id === "custom") return;
    onChange(resolvePresetRange(id));
    setOpen(false);
  }

  function onPickDay(iso: string) {
    setDraftPreset("custom");
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(iso);
      setDraftTo("");
      return;
    }
    if (compareIso(iso, draftFrom) < 0) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
      return;
    }
    setDraftTo(iso);
  }

  function applyCustom() {
    if (!draftFrom) return;
    onChange({ from: draftFrom, to: draftTo || draftFrom });
    setOpen(false);
  }

  function isSelected(iso: string) {
    if (!draftFrom) return false;
    const end = draftTo || draftFrom;
    return compareIso(iso, draftFrom) >= 0 && compareIso(iso, end) <= 0;
  }

  function isRangeEdge(iso: string) {
    return iso === draftFrom || iso === (draftTo || draftFrom);
  }

  return (
    <div ref={rootRef} className={`relative ${open ? "z-[120]" : ""} ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-left text-sm text-white transition-all duration-200 outline-none hover:bg-white/10"
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="ml-3 text-xs text-zinc-500">{open ? "Close" : "Range"}</span>
      </button>
      {open && portalReady ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 text-white shadow-2xl shadow-black/40 backdrop-blur-sm"
          style={{ top: popoverPos.top, left: popoverPos.left, width: popoverPos.width }}
        >
          <div className={`grid ${isCustomOpen ? "grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)]" : "grid-cols-1"}`}>
            <div className={`bg-white/5 p-2 ${isCustomOpen ? "border-b border-white/10 xl:border-b-0 xl:border-r xl:border-white/10" : ""}`}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`block w-full rounded-xl px-4 py-2 text-left text-sm transition-all duration-200 ${
                    draftPreset === preset.id
                      ? "border border-violet-500/30 bg-violet-500/20 font-semibold text-violet-300"
                      : "text-zinc-400 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {isCustomOpen ? (
              <div className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setViewMonth((prev) => addMonths(prev, -1))} className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white">
                      Prev
                    </button>
                    <button type="button" onClick={() => setViewMonth((prev) => addMonths(prev, 1))} className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/12 hover:text-white">
                      Next
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {months.map((month) => (
                      <div key={`${month.getFullYear()}-${month.getMonth()}`}>
                        <div className="mb-3 text-center text-lg font-semibold text-white">{monthLabel(month)}</div>
                        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                          {WEEKDAYS.map((day) => (
                            <div key={day}>{day}</div>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-2">
                          {buildMonthCells(month).map((iso, index) =>
                            iso ? (
                              <button
                                key={iso}
                                type="button"
                                onClick={() => onPickDay(iso)}
                                className={`aspect-square rounded-lg text-sm transition-all duration-150 ${
                                  isRangeEdge(iso)
                                    ? "bg-amber-500 text-black"
                                    : isSelected(iso)
                                      ? "bg-amber-500/20 text-amber-300"
                                      : "text-zinc-300 hover:bg-white/8 hover:text-white"
                                }`}
                              >
                                {parseIso(iso)?.getDate()}
                              </button>
                            ) : (
                              <div key={`empty-${index}`} className="aspect-square" />
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 border-t border-white/10 pt-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-col gap-2 text-sm xl:flex-row xl:items-center">
                      <input
                        type="text"
                        value={draftFrom ? displayDate(draftFrom) : ""}
                        readOnly
                        placeholder="Start"
                        className="rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-white placeholder:text-zinc-500 outline-none"
                      />
                      <span className="hidden text-zinc-500 xl:inline">-</span>
                      <input
                        type="text"
                        value={draftTo ? displayDate(draftTo) : ""}
                        readOnly
                        placeholder="End"
                        className="rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-white placeholder:text-zinc-500 outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/15 bg-white/8 px-5 py-2.5 text-sm text-white transition-all duration-200 hover:border-white/25 hover:bg-white/15">
                        Cancel
                      </button>
                      <button type="button" onClick={applyCustom} disabled={!draftFrom} className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-50">
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
