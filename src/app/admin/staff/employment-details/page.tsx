// src/app/admin/staff/employment-details/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Check } from "lucide-react";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type Gap = {
  staff_name: string;
  city: string;
  branch_code: string | null;
  status: string;
  company: string;
  position: string;
  hire_date: string;
  roster_hire_date: string | null;
  /** What the person answered on My Details. A claim, not the record. */
  claimed_hire_date: string | null;
  claimed_at: string | null;
};

type GapResp = {
  ok: boolean;
  rows: Gap[];
  total: number;
  missing_position: number;
  missing_hire_date: number;
  missing_company: number;
  awaiting_confirmation: number;
};

/** A typo here is not cosmetic: leave is counted from this date, so a wrong
 *  year silently buys or withholds days. Manila fitted out its first site in
 *  August 2025 — one row already read 2025-02-24 — and Dubai opened in 2022. */
const EARLIEST_HIRE: Record<string, string> = {
  manila: "2025-08-01",
  dubai: "2022-01-01",
};
const TODAY = new Date().toISOString().slice(0, 10);

export default function EmploymentDetailsPage() {
  const [city, setCity] = useState("manila");
  const [rows, setRows] = useState<Gap[] | null>(null);
  const [summary, setSummary] = useState<GapResp | null>(null);
  const [branch, setBranch] = useState("BO");
  const [loading, setLoading] = useState(false);
  const [savingFor, setSavingFor] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Gap>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/staff/employment-gaps?city=${encodeURIComponent(city)}`,
        { headers: { "Content-Type": "application/json" }, cache: "no-store" },
      );
      const data = (await res.json()) as GapResp;
      if (!res.ok) throw new Error((data as any)?.detail || `HTTP ${res.status}`);
      setRows(data.rows || []);
      setSummary(data);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.branch_code || "?"));
    return Array.from(set).sort();
  }, [rows]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => (r.branch_code || "?") === branch),
    [rows, branch]
  );

  const save = async (r: Gap, override?: Partial<Gap>) => {
    const d = { ...(draft[r.staff_name] || {}), ...(override || {}) };
    const body: Record<string, unknown> = { city: r.city, display_name: r.staff_name };
    if (d.position !== undefined) body.position = d.position;
    if (d.hire_date !== undefined) body.hire_date = d.hire_date;
    if (d.company !== undefined) body.company = d.company;
    if (Object.keys(body).length <= 2) return;

    setSavingFor(r.staff_name);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/staff/employment-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.detail || `HTTP ${res.status}`);
      // The date reaching the roster but not the payroll profile is a
      // half-applied change: leave accrual reads the payroll profile, and
      // sixteen roster members have no such row.
      const t = (data as any)?.updated || {};
      setMsg(
        t.payroll_profile_updated === false
          ? {
              kind: "err",
              text: `${r.staff_name}: saved to the roster, but there is no payroll profile to write the hire date to. Leave will not accrue until one exists.`,
            }
          : { kind: "ok", text: `Saved ${r.staff_name}.` },
      );
      setDraft((p) => {
        const n = { ...p };
        delete n[r.staff_name];
        return n;
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: `${r.staff_name}: ${e?.message || e}` });
    } finally {
      setSavingFor("");
    }
  };

  const set = (name: string, patch: Partial<Gap>) =>
    setDraft((p) => ({ ...p, [name]: { ...(p[name] || {}), ...patch } }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-6xl space-y-6 px-4 py-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-500/10">
          <FileText className="h-5 w-5 text-sky-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Employment Details（役職・入社日・会社）</h1>
          <p className={T_CAPTION}>
            The hire date is also what leave is counted from, so it is confirmed here and
            nowhere else. Staff give their own answer on My Details; accept it against the
            contract.
          </p>
        </div>
      </div>

      {/* This is a work list, not a form to complete. Filling a row you cannot
          source is the failure this whole feature exists to avoid. */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className="text-[13px] text-neutral-300">
          <b>You do not have to finish this today.</b> Save only the people you could
          confirm against a contract. A hire date you guessed is printed on the
          certificate exactly as typed.
          <span className="text-neutral-400">
            {" "}
            Leaving a row blank breaks nothing — the COE screen names what is missing when someone tries to issue one.
          </span>
        </p>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["People with gaps", summary.total],
            ["No position", summary.missing_position],
            ["No hire date", summary.missing_hire_date],
            ["No company", summary.missing_company],
            ["Staff answered, awaiting you", summary.awaiting_confirmation],
          ].map(([label, n]) => (
            <div key={String(label)} className={`${GLASS_CARD} p-4`}>
              <div className={T_CAPTION}>{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-100">{n as number}</div>
            </div>
          ))}
        </div>
      ) : null}

      {msg ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-200"
              : "border-rose-900/50 bg-rose-950/20 text-rose-200"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className={`${GLASS_CARD} space-y-4 p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={T_SECTION}>City</span>
          {[
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ].map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCity(c.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                city === c.value
                  ? "border-violet-500/40 bg-violet-950/30 text-violet-200"
                  : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/20"
              }`}
            >
              {c.label}
            </button>
          ))}
          <span className="ml-2 text-[11px] text-neutral-500">
            {city === "dubai"
              ? "Dubai needs the hire date only — a Certificate of Employment is a Philippine document."
              : "Position and company are printed on the COE."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={T_SECTION}>Branch</span>
          {branches.map((b) => {
            const n = (rows ?? []).filter((r) => (r.branch_code || "?") === b).length;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBranch(b)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  branch === b
                    ? "border-sky-500/40 bg-sky-950/30 text-sky-200"
                    : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/20"
                }`}
              >
                {b} ({n})
              </button>
            );
          })}
        </div>

        {loading && rows === null ? (
          <p className={`${T_CAPTION} py-8 text-center`}>Loading…</p>
        ) : shown.length === 0 ? (
          <p className={`${T_CAPTION} py-8 text-center`}>
            Nothing missing at this branch.
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => {
              const d = draft[r.staff_name] || {};
              const dirty = Object.keys(d).length > 0;
              return (
                <div
                  key={r.staff_name}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-neutral-100">
                        {r.staff_name}
                      </span>
                      {r.status !== "ACTIVE" ? (
                        <span className="ml-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          {r.status}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={!dirty || savingFor === r.staff_name}
                      onClick={() => save(r)}
                      className={`${PRIMARY_BUTTON} flex items-center gap-1.5 text-xs disabled:opacity-40`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {savingFor === r.staff_name ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <div className={`grid grid-cols-1 gap-3 ${r.city === "dubai" ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}>
                    {r.city !== "dubai" ? (
                    <div>
                      <div className={T_LABEL + " mb-1"}>Position</div>
                      <input
                        value={d.position ?? r.position}
                        onChange={(e) => set(r.staff_name, { position: e.target.value })}
                        placeholder={r.position ? "" : "Not on record"}
                        className={INPUT_CLASS}
                      />
                    </div>
                    ) : null}
                    <div>
                      <div className={T_LABEL + " mb-1"}>Hire Date</div>
                      <input
                        type="date"
                        min={EARLIEST_HIRE[r.city] ?? "2020-01-01"}
                        max={TODAY}
                        value={d.hire_date ?? r.hire_date}
                        onChange={(e) => set(r.staff_name, { hire_date: e.target.value })}
                        className={INPUT_CLASS}
                      />
                      {/* What the person said, and one click to accept it. Kept
                          visibly separate from the field: their answer is a
                          claim until HR has it against the contract, because
                          this date decides how much leave they are owed. */}
                      {r.claimed_hire_date ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-950/15 px-2 py-1.5">
                          <span className="text-[11px] text-amber-200/90">
                            They said <b className="tabular-nums">{r.claimed_hire_date}</b>
                          </span>
                          <button
                            type="button"
                            disabled={savingFor === r.staff_name}
                            onClick={() => save(r, { hire_date: r.claimed_hire_date! })}
                            className="rounded-md border border-amber-400/40 px-2 py-0.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:opacity-40"
                          >
                            Use this
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-neutral-500">
                          No answer from them yet.
                        </p>
                      )}
                      {r.roster_hire_date && r.roster_hire_date !== r.hire_date ? (
                        <p className="mt-1 text-[11px] text-amber-300/80">
                          The roster says {r.roster_hire_date}. Saving lines both up.
                        </p>
                      ) : null}
                    </div>
                    {r.city !== "dubai" ? (
                    <div>
                      <div className={T_LABEL + " mb-1"}>Company</div>
                      <SelectDark
                        value={d.company ?? r.company}
                        onChange={(v) => set(r.staff_name, { company: v })}
                        className={SELECT_CLASS}
                        options={[
                          { value: "", label: "— Not set —" },
                          { value: "SUSHIZEN", label: "SUSHIZEN" },
                          { value: "7CZ", label: "7CZ ANGEL CORP." },
                        ]}
                      />
                    </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
