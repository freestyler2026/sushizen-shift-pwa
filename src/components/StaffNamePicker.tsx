"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SelectDark from "@/components/SelectDark";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Which roster to offer. Case-insensitive; "" defers loading until known. */
  city: string;
  /** Limit to one branch's roster when the form is already branch-scoped. */
  branch?: string;
  /**
   * Offer people who have left too. Off by default: most forms are about who
   * is working now, and a picker full of ex-staff is how the wrong Anthony
   * gets chosen. Turn it on where naming a leaver is the point of the field —
   * a Certificate of Employment, or the resignation a requisition replaces.
   * Without it those forms become a dead end for the only case they exist for.
   */
  includeSeparated?: boolean;
  placeholder?: string;
  className?: string;
  variant?: "dark" | "light";
  disabled?: boolean;
  clearable?: boolean;
  "aria-label"?: string;
  id?: string;
};

/**
 * Pick a staff name off the Staff page instead of typing it.
 *
 * Typing is how one person becomes two. The tables that matter are keyed by
 * (city, staff_name, date), so `Karen Jane Q Borja` and `Karen Jane Borja` are
 * two employees to every query downstream — attendance, DTR, payroll, the
 * scoreboards. Measured on 2026-09-22 across every name-bearing table: 13
 * spellings in `shift_draft_rows` (1,434 rows), 10 in `management_credits`
 * (197), 4 each in `base_shift_normalized` and `absences`, and two that had
 * already reached Manila payroll — `Anthony Plaza` carries 31 DTR rows and a
 * profile of its own while `Anthony Ricaplaza` carries 84.
 *
 * The roster comes from `staff_master`, so a name that page does not carry
 * cannot be entered. One exception, and it is the important one: a value the
 * form already holds stays selectable even when it is off the roster, marked
 * as such. Opening an old record must not silently blank the name it was
 * saved with — that would turn a display into an edit.
 */
export default function StaffNamePicker({
  value,
  onChange,
  city,
  branch = "",
  includeSeparated = false,
  placeholder = "Select a name…",
  className = "",
  variant = "dark",
  disabled = false,
  clearable = false,
  "aria-label": ariaLabel,
  id,
}: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  // The list outlives the request that filled it; a slow first fetch must not
  // land on top of a newer city's names.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const load = useCallback(async () => {
    const c = (city || "").trim();
    if (!c) { setNames([]); setState("idle"); return; }
    setState("loading");
    const qs = new URLSearchParams({ city: c, limit: "5000" });
    // /api/staff/names is ACTIVE-only by construction; the staff_master route
    // drops the status filter when status is blank.
    const path = includeSeparated ? "/api/admin/staff_master/names" : "/api/staff/names";
    if (includeSeparated) qs.set("status", "");
    if (branch) qs.set(includeSeparated ? "home_branch" : "branch", branch);
    try {
      const res = await fetch(`${path}?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json() as { names?: string[] };
      if (!aliveRef.current) return;
      setNames(Array.isArray(j.names) ? j.names : []);
      setState("ready");
    } catch {
      if (!aliveRef.current) return;
      setNames([]);
      setState("error");
    }
  }, [city, branch, includeSeparated]);

  useEffect(() => { void load(); }, [load, attempt]);

  const options = useMemo(() => {
    const opts = names.map((n) => ({ value: n, label: n }));
    const held = (value || "").trim();
    if (held && !names.some((n) => n.toLowerCase() === held.toLowerCase())) {
      opts.unshift({ value: held, label: `${held} — not on the Staff page` });
    }
    return opts;
  }, [names, value]);

  if (state === "error") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs text-rose-300">Could not load the staff list.</span>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <SelectDark
      value={value}
      onChange={onChange}
      options={options}
      placeholder={
        !city ? "Select a city first" : state === "loading" ? "Loading names…" : placeholder
      }
      className={className}
      variant={variant}
      clearable={clearable}
      disabled={disabled || state === "loading" || !city}
      aria-label={ariaLabel ?? placeholder}
      id={id}
    />
  );
}
