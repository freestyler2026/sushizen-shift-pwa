"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { CONFIDENCES, CONFIDENCE_LABEL, CONFIDENCE_STYLE, confidenceTotals } from "@/lib/investor-confidence";

// HQ only (owner, 2026-11-17): each investor from the guide email to the money
// arriving. The server refuses every other role, ADMIN included; the check on
// this page only spares them an empty screen.

type StepKey = "guide_email" | "fu_email" | "fu_call_1" | "fu_call_2" | "received";
type StepStatus = "pending" | "done" | "skipped";
type Step = { status: StepStatus; done_on: string | null; memo: string; updated_by: string; updated_at: string | null };
type Case = {
  id: number; name: string; planned_amount: number; currency: string; method: string; method_note: string;
  /** The lowest and highest amount talked about; null when not given (HQ, 2026-11-27). */
  min_amount: number | null; max_amount: number | null;
  /** A / B / C, NONE = not investing, "" = not set. */
  confidence: string;
  project: string; email: string; phone: string; notes: string; hold: "" | "ON_HOLD" | "WITHDRAWN";
  received_amount: number | null; received_currency: string; received_account: string; received_ref: string;
  received_diff: number | null; status: string; next_action: { step: StepKey; due: string | null } | null;
  steps: Record<StepKey, Step>; created_by: string; created_at: string | null; updated_at: string | null;
};
type Settings = { fu_email: number; fu_call_1: number; fu_call_2: number };
type Event = { id: number; actor: string; action: string; detail: Record<string, unknown>; created_at: string | null };

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: "guide_email", label: "Guide email sent", short: "Guide email" },
  { key: "fu_email", label: "Follow-up email", short: "FU email" },
  { key: "fu_call_1", label: "Follow-up call 1", short: "FU call 1" },
  { key: "fu_call_2", label: "Follow-up call 2", short: "FU call 2" },
  { key: "received", label: "Funds received", short: "Received" },
];
const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.key, s.label])) as Record<StepKey, string>;
const METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "INTL_WIRE", label: "International wire" },
  { value: "WISE", label: "Wise" },
  { value: "OTHER", label: "Other" },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label]));
const CURRENCIES = ["JPY", "PHP", "USD"];
const STATUS_TEXT: Record<string, string> = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", RECEIVED: "Received", ON_HOLD: "On hold", WITHDRAWN: "Withdrawn",
};
const STATUS_STYLE: Record<string, string> = {
  NOT_STARTED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  IN_PROGRESS: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  RECEIVED: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  ON_HOLD: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  WITHDRAWN: "border-slate-600/40 bg-slate-700/20 text-slate-500",
};
const NEXT_TEXT: Record<StepKey, string> = {
  guide_email: "Send the guide email", fu_email: "Send the follow-up email", fu_call_1: "Make follow-up call 1",
  fu_call_2: "Make follow-up call 2", received: "Check the bank for the funds",
};

const input = "rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500";
const btn = "rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40";
const primary = "rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await getAuthHeaders()), ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Request failed (${res.status})`);
  return data;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(n: number | null | undefined, cur: string) {
  if (n == null) return "—";
  const sym = cur === "JPY" ? "¥" : cur === "PHP" ? "₱" : cur === "USD" ? "$" : "";
  const digits = cur === "JPY" ? 0 : 2;
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** "¥1,000,000 – ¥5,000,000", one end alone, or "" without a range. */
function range(c: { min_amount: number | null; max_amount: number | null; currency: string }) {
  if (c.min_amount == null && c.max_amount == null) return "";
  if (c.min_amount != null && c.max_amount != null) return `${money(c.min_amount, c.currency)} – ${money(c.max_amount, c.currency)}`;
  return c.min_amount != null ? `from ${money(c.min_amount, c.currency)}` : `up to ${money(c.max_amount, c.currency)}`;
}

function ConfidenceBadge({ value }: { value: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLE[value || ""]}`}>{CONFIDENCE_LABEL[value || ""]}</span>;
}

function shortDate(iso: string | null) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** Overdue, due today, or neither -- from the case's next action. */
function urgency(c: Case, now: string): "overdue" | "today" | null {
  const due = c.next_action?.due;
  if (!due) return null;
  if (due < now) return "overdue";
  if (due === now) return "today";
  return null;
}

export default function InvestorFundingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isHQ = mounted && String(getAuth()?.role || "").toUpperCase() === "HQ";

  const [cases, setCases] = useState<Case[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [confFilter, setConfFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/admin/investor-funding");
      setCases(d.cases);
      setSettings(d.settings);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isHQ) load(); }, [isHQ, load]);

  const now = today();
  const replaceCase = (c: Case) => setCases((list) => list.map((x) => (x.id === c.id ? c : x)));

  const summary = useMemo(() => {
    const live = cases.filter((c) => c.hold !== "WITHDRAWN");
    const byCur: Record<string, { planned: number; received: number }> = {};
    for (const c of live) {
      byCur[c.currency] ||= { planned: 0, received: 0 };
      byCur[c.currency].planned += c.planned_amount;
    }
    for (const c of live) {
      if (c.status === "RECEIVED" && c.received_amount != null) {
        byCur[c.received_currency] ||= { planned: 0, received: 0 };
        byCur[c.received_currency].received += c.received_amount;
      }
    }
    return {
      byCur,
      inProgress: cases.filter((c) => c.status === "IN_PROGRESS" || c.status === "NOT_STARTED").length,
      received: cases.filter((c) => c.status === "RECEIVED").length,
      needsAction: cases.filter((c) => urgency(c, now)).length,
    };
  }, [cases, now]);

  const byConfidence = useMemo(() => confidenceTotals(cases), [cases]);

  const shown = cases.filter((c) => {
    if (confFilter !== null && (c.confidence || "") !== confFilter) return false;
    if (filter === "ALL") return true;
    if (filter === "ACTION") return urgency(c, now) !== null;
    return c.status === filter;
  });

  if (!mounted) return null;
  if (!isHQ) {
    return <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300">This page is for HQ only.</p>;
  }

  const open = cases.find((c) => c.id === openId) || null;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Investor Funding</h1>
          <p className="text-sm text-slate-400">Each investor from the guide email to the funds arriving. HQ only.</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className={primary}>{adding ? "Close" : "Add investor"}</button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Planned</p>
          {Object.keys(summary.byCur).length === 0 && <p className="mt-1 text-lg text-slate-500">—</p>}
          {Object.entries(summary.byCur).filter(([, v]) => v.planned > 0).map(([cur, v]) => (
            <p key={cur} className="mt-1 text-lg font-semibold tabular-nums text-white">{money(v.planned, cur)}</p>
          ))}
          <p className="mt-1 text-xs text-slate-500">Excludes withdrawn</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Received</p>
          {Object.entries(summary.byCur).filter(([, v]) => v.received > 0).length === 0 && <p className="mt-1 text-lg text-slate-500">—</p>}
          {Object.entries(summary.byCur).filter(([, v]) => v.received > 0).map(([cur, v]) => (
            <p key={cur} className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{money(v.received, cur)}</p>
          ))}
          <p className="mt-1 text-xs text-slate-500">{summary.received} investor{summary.received === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Waiting for funds</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-200">{summary.inProgress}</p>
        </div>
        <button onClick={() => setFilter("ACTION")} className={`rounded-xl border p-4 text-left ${summary.needsAction ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-white/[0.03]"}`}>
          <p className="text-xs uppercase tracking-wider text-slate-400">Needs action</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${summary.needsAction ? "text-red-300" : "text-slate-500"}`}>{summary.needsAction}</p>
          <p className="mt-1 text-xs text-slate-500">Follow-up due today or overdue</p>
        </button>
      </div>

      {/* By confidence (HQ, 2026-11-27). Low and high use the planned amount
          when an investor has no range, so nobody drops out of either total. */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]" data-testid="by-confidence">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-2">By confidence</th>
              <th className="px-3 py-2 text-right">Investors</th>
              <th className="px-3 py-2 text-right">Minimum</th>
              <th className="px-3 py-2 text-right">Planned</th>
              <th className="px-3 py-2 text-right">Maximum</th>
            </tr>
          </thead>
          <tbody>
            {byConfidence.map((r) => {
              const curs = Object.entries(r.byCur);
              const total = r.key === "ABC";
              return (
                <tr key={r.key} onClick={total ? undefined : () => setConfFilter(confFilter === r.key ? null : r.key)}
                  className={`border-t border-white/5 ${total ? "bg-white/[0.04] font-semibold" : "cursor-pointer hover:bg-white/[0.03]"} ${confFilter === r.key ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-4 py-2">{total ? <span className="text-white">A + B + C</span> : <ConfidenceBadge value={r.key} />}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{r.people}</td>
                  {(["min", "planned", "max"] as const).map((k) => (
                    <td key={k} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${k === "planned" ? "text-white" : "text-slate-300"}`}>
                      {curs.length === 0 ? <span className="text-slate-600">—</span>
                        : curs.map(([cur, v]) => <div key={cur}>{money(v[k], cur)}</div>)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 pb-3 pt-1 text-xs text-slate-500">
          Excludes withdrawn. Where an investor has no minimum or maximum, the planned amount is counted. Click a row to show only those investors.
        </p>
      </div>

      {settings && <FollowUpDays settings={settings} onSaved={(s) => { setSettings(s); load(); }} />}

      {adding && <AddInvestor onAdded={(c) => { setCases((l) => [...l, c]); setAdding(false); setOpenId(c.id); }} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[["ALL", "All"], ["ACTION", "Needs action"], ["NOT_STARTED", "Not started"], ["IN_PROGRESS", "In progress"],
          ["RECEIVED", "Received"], ["ON_HOLD", "On hold"], ["WITHDRAWN", "Withdrawn"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={chip(filter === k)}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Confidence:</span>
        <button onClick={() => setConfFilter(null)} className={chip(confFilter === null)}>Any</button>
        {CONFIDENCES.map((c) => (
          <button key={c.value || "unset"} onClick={() => setConfFilter(c.value)} className={chip(confFilter === c.value)}>{c.label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">Investor</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2 text-right">Planned</th>
              <th className="px-3 py-2">Method</th>
              {STEPS.map((s) => <th key={s.key} className="px-3 py-2">{s.short}</th>)}
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const u = urgency(c, now);
              return (
                <tr key={c.id} onClick={() => setOpenId(c.id)}
                  className={`cursor-pointer border-t border-white/5 align-top hover:bg-white/[0.03] ${c.hold === "WITHDRAWN" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-white">{c.name}</p>
                    {c.project && <p className="text-xs text-slate-400">{c.project}</p>}
                  </td>
                  <td className="px-3 py-2"><ConfidenceBadge value={c.confidence} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white">
                    {money(c.planned_amount, c.currency)}
                    {range(c) && <p className="text-xs font-normal text-slate-400">{range(c)}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{METHOD_LABEL[c.method] || c.method}</td>
                  {STEPS.map((s) => <td key={s.key} className="px-3 py-2"><StepCell step={c.steps[s.key]} due={c.next_action?.step === s.key ? c.next_action.due : null} now={now} /></td>)}
                  <td className="px-3 py-2"><span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>{STATUS_TEXT[c.status]}</span></td>
                  <td className="px-3 py-2">
                    {c.next_action ? (
                      <div>
                        <p className="text-slate-200">{NEXT_TEXT[c.next_action.step]}</p>
                        {c.next_action.due && (
                          <p className={`text-xs ${u === "overdue" ? "font-semibold text-red-300" : u === "today" ? "font-semibold text-amber-300" : "text-slate-400"}`}>
                            {u === "overdue" ? "Overdue · " : u === "today" ? "Today · " : "By "}{c.next_action.due}
                          </p>
                        )}
                      </div>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                {cases.length === 0 ? "No investors yet. Add the first one with Add investor." : "No investors match this filter."}
              </td></tr>
            )}
            {loading && <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <Detail c={open} onClose={() => setOpenId(null)} onSaved={replaceCase} />}
    </div>
  );
}

function StepCell({ step, due, now }: { step: Step; due: string | null; now: string }) {
  if (step.status === "done") {
    return <span className="whitespace-nowrap text-emerald-300" title={step.memo || undefined}>✓ {shortDate(step.done_on)}{step.memo ? " •" : ""}</span>;
  }
  if (step.status === "skipped") return <span className="text-slate-500">Skipped</span>;
  if (due) {
    const late = due < now;
    return <span className={`whitespace-nowrap text-xs ${late ? "text-red-300" : due === now ? "text-amber-300" : "text-slate-400"}`}>Due {shortDate(due)}</span>;
  }
  return <span className="text-slate-600">—</span>;
}

function FollowUpDays({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(settings);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings), [settings]);

  async function save() {
    setSaving(true); setError("");
    try {
      const d = await api("/api/admin/investor-funding/settings", { method: "PUT", body: JSON.stringify(form) });
      onSaved(d.settings);
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  const fields: [keyof Settings, string][] = [["fu_email", "Follow-up email"], ["fu_call_1", "Follow-up call 1"], ["fu_call_2", "Follow-up call 2"]];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
      <span className="text-slate-400">Days after the guide email:</span>
      {fields.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5 text-slate-200">
          {label}
          {editing ? (
            <input type="number" min={0} max={365} value={form[k]} aria-label={`${label} (days)`}
              onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
              className="w-16 rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white" />
          ) : <b className="tabular-nums text-white">{settings[k]}</b>}
          <span className="text-slate-500">days</span>
        </span>
      ))}
      {editing ? (
        <span className="flex gap-2">
          <button onClick={save} disabled={saving} className={btn}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={() => { setEditing(false); setForm(settings); setError(""); }} className={btn}>Cancel</button>
        </span>
      ) : <button onClick={() => setEditing(true)} className={btn}>Change</button>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}

const EMPTY_FORM = { name: "", planned_amount: "", min_amount: "", max_amount: "", confidence: "", currency: "JPY", method: "BANK_TRANSFER", method_note: "", project: "", email: "", phone: "", notes: "" };

/** Minimum, maximum and confidence: the same three fields when adding and editing. */
function RangeFields({ form, setForm }: {
  form: { min_amount: string; max_amount: string; confidence: string; currency: string };
  setForm: (f: { min_amount: string; max_amount: string; confidence: string }) => void;
}) {
  return (
    <>
      <label className="space-y-1 text-xs text-slate-400">Minimum amount ({form.currency})
        <input inputMode="decimal" value={form.min_amount} placeholder="Optional"
          onChange={(e) => setForm({ ...form, min_amount: e.target.value })} className={`${input} w-full`} />
      </label>
      <label className="space-y-1 text-xs text-slate-400">Maximum amount ({form.currency})
        <input inputMode="decimal" value={form.max_amount} placeholder="Optional"
          onChange={(e) => setForm({ ...form, max_amount: e.target.value })} className={`${input} w-full`} />
      </label>
      <label className="space-y-1 text-xs text-slate-400">Confidence
        <SelectDark value={form.confidence} onChange={(v) => setForm({ ...form, confidence: v })} aria-label="Confidence"
          options={CONFIDENCES.map((c) => ({ value: c.value, label: c.label }))} />
      </label>
    </>
  );
}

function AddInvestor({ onAdded }: { onAdded: (c: Case) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const d = await api("/api/admin/investor-funding/cases", { method: "POST", body: JSON.stringify(form) });
      setForm(EMPTY_FORM);
      onAdded(d.case);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add."); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-xs text-slate-400">Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Planned amount
          <div className="flex gap-2">
            <input required inputMode="decimal" value={form.planned_amount} placeholder="21000000"
              onChange={(e) => setForm({ ...form, planned_amount: e.target.value })} className={`${input} w-full`} />
            <SelectDark value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCIES} aria-label="Currency" className="w-24" />
          </div>
        </label>
        <RangeFields form={form} setForm={(f) => setForm({ ...form, ...f })} />
        <label className="space-y-1 text-xs text-slate-400">Transfer method
          <SelectDark value={form.method} onChange={(v) => setForm({ ...form, method: v })} options={METHODS} aria-label="Transfer method" />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Project / store
          <input value={form.project} placeholder="Gateway Mall" onChange={(e) => setForm({ ...form, project: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} w-full`} />
        </label>
      </div>
      <label className="block space-y-1 text-xs text-slate-400">Method note
        <input value={form.method_note} placeholder="Bank, account, who sends it…" onChange={(e) => setForm({ ...form, method_note: e.target.value })} className={`${input} w-full`} />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={saving} className={primary}>{saving ? "Adding…" : "Add investor"}</button>
    </form>
  );
}

function Detail({ c, onClose, onSaved }: { c: Case; onClose: () => void; onSaved: (c: Case) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try { setEvents((await api(`/api/admin/investor-funding/cases/${c.id}/history`)).events); } catch { /* shown empty */ }
  }, [c.id]);
  useEffect(() => { if (historyOpen) loadHistory(); }, [historyOpen, loadHistory, c.updated_at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${c.name} details`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl space-y-5 overflow-y-auto border-l border-white/10 bg-slate-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{c.name}</h2>
            <p className="text-sm text-slate-400">{money(c.planned_amount, c.currency)}{range(c) ? ` (${range(c)})` : ""} · {METHOD_LABEL[c.method]}{c.project ? ` · ${c.project}` : ""}</p>
            <p className="mt-1 text-xs text-slate-400">Confidence <ConfidenceBadge value={c.confidence} /></p>
          </div>
          <button onClick={onClose} className={btn}>Close</button>
        </div>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Steps</h3>
          {STEPS.map((s) => <StepEditor key={`${c.id}-${s.key}-${c.steps[s.key].updated_at}`} c={c} stepKey={s.key} onSaved={onSaved} />)}
        </section>

        <CaseEditor key={c.id} c={c} onSaved={onSaved} />

        <section className="space-y-2">
          <button onClick={() => setHistoryOpen((v) => !v)} className={btn}>{historyOpen ? "Hide history" : "Show history"}</button>
          {historyOpen && (
            <ul className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-slate-300">
                  <span className="text-slate-500">{e.created_at ? new Date(e.created_at).toLocaleString() : ""} · {e.actor}</span>
                  <p className="mt-0.5">{describe(e)}</p>
                </li>
              ))}
              {events.length === 0 && <li className="text-slate-500">No changes recorded.</li>}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function describe(e: Event): string {
  const d = e.detail as Record<string, any>;
  if (e.action === "case_created") return "Investor added";
  if (e.action === "step_updated") {
    const label = STEP_LABEL[d.step as StepKey] || d.step;
    const a = d.after || {}, b = d.before || {};
    const what = a.status === "done" ? `done${a.done_on ? ` on ${a.done_on}` : ""}` : a.status;
    const parts = [`${label}: ${what}`];
    if (a.received_amount != null) parts.push(`received ${money(a.received_amount, a.received_currency)}`);
    if ((a.memo || "") !== (b.memo || "") && a.memo) parts.push(`memo "${a.memo}"`);
    return parts.join(" · ");
  }
  if (e.action === "case_updated") {
    const after = d.after || {};
    return `Changed ${Object.keys(after).join(", ")}`;
  }
  return e.action;
}

function StepEditor({ c, stepKey, onSaved }: { c: Case; stepKey: StepKey; onSaved: (c: Case) => void }) {
  const step = c.steps[stepKey];
  const isReceipt = stepKey === "received";
  const [status, setStatus] = useState<StepStatus>(step.status);
  const [doneOn, setDoneOn] = useState(step.done_on || today());
  const [memo, setMemo] = useState(step.memo);
  const [rAmount, setRAmount] = useState(c.received_amount != null ? String(c.received_amount) : String(c.planned_amount));
  const [rCur, setRCur] = useState(c.received_currency || c.currency);
  const [rAccount, setRAccount] = useState(c.received_account);
  const [rRef, setRRef] = useState(c.received_ref);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty = status !== step.status || (status === "done" && doneOn !== (step.done_on || "")) || memo !== step.memo
    || (isReceipt && status === "done" && (rAmount !== String(c.received_amount ?? "") || rCur !== c.received_currency
      || rAccount !== c.received_account || rRef !== c.received_ref));

  async function save() {
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { status, memo, done_on: status === "done" ? doneOn : null };
      if (isReceipt && status === "done") Object.assign(body, { received_amount: rAmount, received_currency: rCur, received_account: rAccount, received_ref: rRef });
      const d = await api(`/api/admin/investor-funding/cases/${c.id}/steps/${stepKey}`, { method: "PUT", body: JSON.stringify(body) });
      onSaved(d.case);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  const due = c.next_action?.step === stepKey ? c.next_action.due : null;
  const options = isReceipt ? [{ value: "pending", label: "Not yet" }, { value: "done", label: "Received" }]
    : [{ value: "pending", label: "Not yet" }, { value: "done", label: "Done" }, { value: "skipped", label: "Not needed" }];

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${step.status === "done" ? "border-emerald-400/25 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-[10rem] flex-1 text-sm font-medium text-white">{STEP_LABEL[stepKey]}</p>
        {due && step.status === "pending" && <span className="text-xs text-slate-400">Due {due}</span>}
        <SelectDark value={status} onChange={(v) => setStatus(v as StepStatus)} options={options} aria-label={`${STEP_LABEL[stepKey]} status`} className="w-36" />
        {status === "done" && (
          <input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} aria-label={`${STEP_LABEL[stepKey]} date`}
            className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white [color-scheme:dark]" />
        )}
      </div>
      {isReceipt && status === "done" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-400">Amount received
            <div className="flex gap-2">
              <input inputMode="decimal" value={rAmount} onChange={(e) => setRAmount(e.target.value)} className={`${input} w-full`} />
              <SelectDark value={rCur} onChange={setRCur} options={CURRENCIES} aria-label="Received currency" className="w-24" />
            </div>
          </label>
          <label className="space-y-1 text-xs text-slate-400">Received in (account)
            <input value={rAccount} onChange={(e) => setRAccount(e.target.value)} placeholder="BDO Peso account…" className={`${input} w-full`} />
          </label>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Bank reference
            <input value={rRef} onChange={(e) => setRRef(e.target.value)} className={`${input} w-full`} />
          </label>
          {step.status === "done" && c.received_diff != null && c.received_diff !== 0 && (
            <p className={`text-xs sm:col-span-2 ${c.received_diff < 0 ? "text-amber-300" : "text-slate-300"}`}>
              {c.received_diff < 0 ? "Short of" : "Over"} the planned amount by {money(Math.abs(c.received_diff), c.currency)}.
            </p>
          )}
          {step.status === "done" && c.received_currency && c.received_currency !== c.currency && (
            <p className="text-xs text-slate-400 sm:col-span-2">Received in {c.received_currency}, planned in {c.currency} — not compared.</p>
          )}
        </div>
      )}
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="Memo"
        className={`${input} w-full resize-y`} aria-label={`${STEP_LABEL[stepKey]} memo`} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{step.updated_by ? `Last change by ${step.updated_by}${step.updated_at ? `, ${new Date(step.updated_at).toLocaleString()}` : ""}` : ""}</p>
        <button onClick={save} disabled={!dirty || saving} className={btn}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

function CaseEditor({ c, onSaved }: { c: Case; onSaved: (c: Case) => void }) {
  const [form, setForm] = useState({
    name: c.name, planned_amount: String(c.planned_amount), currency: c.currency, method: c.method, method_note: c.method_note,
    min_amount: c.min_amount != null ? String(c.min_amount) : "", max_amount: c.max_amount != null ? String(c.max_amount) : "",
    confidence: c.confidence || "",
    project: c.project, email: c.email, phone: c.phone, notes: c.notes, hold: c.hold as string,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const d = await api(`/api/admin/investor-funding/cases/${c.id}`, { method: "PATCH", body: JSON.stringify(form) });
      onSaved(d.case);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Investor</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-400">Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Planned amount
          <div className="flex gap-2">
            <input inputMode="decimal" value={form.planned_amount} onChange={(e) => setForm({ ...form, planned_amount: e.target.value })} className={`${input} w-full`} />
            <SelectDark value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCIES} aria-label="Currency" className="w-24" />
          </div>
        </label>
        <RangeFields form={form} setForm={(f) => setForm({ ...form, ...f })} />
        <label className="space-y-1 text-xs text-slate-400">Transfer method
          <SelectDark value={form.method} onChange={(v) => setForm({ ...form, method: v })} options={METHODS} aria-label="Transfer method" />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Project / store
          <input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Method note
          <input value={form.method_note} onChange={(e) => setForm({ ...form, method_note: e.target.value })} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">On hold / withdrawn
          <SelectDark value={form.hold} onChange={(v) => setForm({ ...form, hold: v })} aria-label="Hold"
            options={[{ value: "", label: "Active" }, { value: "ON_HOLD", label: "On hold" }, { value: "WITHDRAWN", label: "Withdrawn" }]} />
        </label>
      </div>
      <label className="block space-y-1 text-xs text-slate-400">Notes
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${input} w-full resize-y`} />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={primary}>{saving ? "Saving…" : "Save investor"}</button>
        {saved && <span className="text-xs text-emerald-300">Saved</span>}
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </section>
  );
}
