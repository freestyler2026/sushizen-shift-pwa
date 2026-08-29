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
};

type GapResp = {
  ok: boolean;
  rows: Gap[];
  total: number;
  missing_position: number;
  missing_hire_date: number;
  missing_company: number;
};

/** Manila's first restaurant began fitting out in August 2025. Anything earlier
 *  is a typo — one such row (2025-02-24) was already on the roster. */
const EARLIEST_HIRE = "2025-08-01";

export default function EmploymentDetailsPage() {
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
      const res = await fetch(`/api/admin/staff/employment-gaps?city=manila`, {
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as GapResp;
      if (!res.ok) throw new Error((data as any)?.detail || `HTTP ${res.status}`);
      setRows(data.rows || []);
      setSummary(data);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

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

  const save = async (r: Gap) => {
    const d = draft[r.staff_name] || {};
    const body: Record<string, unknown> = { city: "manila", display_name: r.staff_name };
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
      setMsg({ kind: "ok", text: `Saved ${r.staff_name}.` });
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
          <h1 className={T_PAGE_TITLE}>Employment Details — what is still missing</h1>
          <p className={T_CAPTION}>
            These three fields are printed on a Certificate of Employment. Fill them in from the contract, whoever you can.
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["People with gaps", summary.total],
            ["No position", summary.missing_position],
            ["No hire date", summary.missing_hire_date],
            ["No company", summary.missing_company],
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className={T_LABEL + " mb-1"}>Position</div>
                      <input
                        value={d.position ?? r.position}
                        onChange={(e) => set(r.staff_name, { position: e.target.value })}
                        placeholder={r.position ? "" : "Not on record"}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <div className={T_LABEL + " mb-1"}>Hire Date</div>
                      <input
                        type="date"
                        min={EARLIEST_HIRE}
                        value={d.hire_date ?? r.hire_date}
                        onChange={(e) => set(r.staff_name, { hire_date: e.target.value })}
                        className={INPUT_CLASS}
                      />
                      {r.roster_hire_date && r.roster_hire_date !== r.hire_date ? (
                        <p className="mt-1 text-[11px] text-amber-300/80">
                          The roster says {r.roster_hire_date}. Saving lines both up.
                        </p>
                      ) : null}
                    </div>
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
