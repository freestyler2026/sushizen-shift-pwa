"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import SelectDark from "@/components/SelectDark";
import { isoToday } from "@/lib/date";

const API = "/api/admin/manila-payroll/gov-loans";

type LoanType = "SSS" | "PAGIBIG";

interface Loan {
  id: number;
  staff_name: string;
  loan_type: LoanType;
  loan_no: string;
  monthly_amortization: number | null;
  first_month: string;
  last_month: string;
  months_total: number;
  total_amount: number | null;
  authority_to_deduct: boolean;
  balance_at_separation: number | null;
  status: "active" | "stopped";
  stop_reason: string;
  note: string;
  created_by: string;
  sss_number: string | null;
  pagibig_mid: string | null;
  last_working_date: string | null;
  paid_amount: number | null;
  paid_months: number;
  draft_amount: number | null;
  final_period?: string | null;
  final_period_status?: string;
  final_taken?: number | null;
}

interface StaffRow { staff_name: string; sss_number: string | null; pagibig_mid: string | null }

interface RemitRow {
  loan_id: number;
  staff_name: string;
  loan_type: LoanType;
  loan_no: string;
  sss_number: string | null;
  pagibig_mid: string | null;
  monthly_amortization: number | null;
  deducted_1h: number | null;
  deducted_2h: number | null;
  deducted: number | null;
  not_collected: number | null;
}

interface Remit {
  month: string;
  periods: { id: number; period_label: string; period_half: number; status: string }[];
  final: boolean;
  rows: RemitRow[];
  totals: { total_sss_loans: number | null; total_pagibig_loans: number | null };
  due: { SSS: string | null; PAGIBIG: string | null };
}

const TYPE_LABEL: Record<LoanType, string> = { SSS: "SSS Loan", PAGIBIG: "Pag-IBIG Loan" };
// Amounts come back null when the viewer may not read pay (the salary mask).
const peso = (n: number | null | undefined) =>
  n == null ? "—" : `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2));

/** The payroll month a day belongs to. The 1st cut-off runs from the 26th, so
 * from the 26th on it is next month's payroll — the same rule as
 * payroll_month() in app/manila_gov_loans.py. */
function payrollMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (d >= 26) return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "2026-10" + n months → "YYYY-MM". Plain arithmetic, no Date: a Date built
 * from a month string slips a day through UTC in Manila. */
function addMonths(ym: string, n: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
function monthsBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m] = s.split("-").map(Number); return y * 12 + m - 1; };
  return p(b) - p(a) + 1;
}
function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${y}`;
}

const STOP_REASONS = ["Paid off early", "Separated", "Entered by mistake"];

export default function GovLoansPage() {
  const thisMonth = payrollMonth(isoToday());
  const [loans, setLoans] = useState<Loan[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  // A refused or failed load must not read as "no loans" (lesson 169).
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // register
  const [showAdd, setShowAdd] = useState(false);
  const [fStaff, setFStaff] = useState("");
  const [fType, setFType] = useState<LoanType>("SSS");
  const [fMonthly, setFMonthly] = useState("");
  const [fFirst, setFFirst] = useState(thisMonth);
  const [fLast, setFLast] = useState(addMonths(thisMonth, 23));
  const [fNo, setFNo] = useState("");
  const [fAuth, setFAuth] = useState(false);

  // edit / stop
  const [editId, setEditId] = useState<number | null>(null);
  const [eMonthly, setEMonthly] = useState("");
  const [eLast, setELast] = useState("");
  const [eNo, setENo] = useState("");
  const [eAuth, setEAuth] = useState(false);
  const [eBal, setEBal] = useState("");
  const [stopId, setStopId] = useState<number | null>(null);
  const [sReason, setSReason] = useState("");
  const [sLast, setSLast] = useState("");

  // remittance
  const [rMonth, setRMonth] = useState(addMonths(thisMonth, -1));
  const [remit, setRemit] = useState<Remit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ loans: Loan[]; staff: StaffRow[] }>(API);
      setLoans(r.loans); setStaff(r.staff); setLoaded(true);
    } catch (e) {
      setLoaded(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadRemit = useCallback(async (m: string) => {
    try {
      setRemit(await apiGet<Remit>(`${API}/remittance?month=${m}`));
    } catch (e) {
      setRemit(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void loadRemit(rMonth); }, [rMonth, loadRemit]);

  const picked = staff.find(s => s.staff_name === fStaff);
  const fMonths = fFirst && fLast ? monthsBetween(fFirst, fLast) : 0;
  const fTotal = Number(fMonthly) > 0 && fMonths > 0 ? Number(fMonthly) * fMonths : 0;

  async function run(fn: () => Promise<string>) {
    setBusy(true); setError(""); setNotice("");
    try {
      setNotice(await fn());
      await load();
      await loadRemit(rMonth);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const register = () => run(async () => {
    if (!fStaff) throw new Error("Pick who the loan belongs to.");
    if (!(Number(fMonthly) > 0)) throw new Error("Enter the monthly amortization from the loan statement.");
    if (fMonths < 1) throw new Error("The last month is before the first month.");
    const body = {
      staff_name: fStaff, loan_type: fType, monthly_amortization: Number(fMonthly),
      first_month: fFirst, last_month: fLast, loan_no: fNo,
      authority_to_deduct: fType === "PAGIBIG" ? fAuth : false,
    };
    try {
      await apiPost(API, body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.startsWith("Overlap — ")) throw e;
      if (!window.confirm(msg.slice("Overlap — ".length) + "\n\nRegister it as a second loan?")) {
        throw new Error("Not registered. To change the amount of the existing loan, use Edit on it.");
      }
      await apiPost(API, { ...body, allow_overlap: true });
    }
    const done = `${fStaff}: ${TYPE_LABEL[fType]} registered — ${peso(Number(fMonthly))} a month, `
      + `${monthName(fFirst)} to ${monthName(fLast)}. Recompute any draft period in those months to apply it.`;
    setShowAdd(false); setFStaff(""); setFMonthly(""); setFNo(""); setFAuth(false);
    setFType("SSS"); setFFirst(thisMonth); setFLast(addMonths(thisMonth, 23));
    return done;
  });

  function openEdit(l: Loan) {
    setStopId(null);
    setEditId(l.id); setEMonthly(l.monthly_amortization == null ? "" : String(l.monthly_amortization)); setELast(l.last_month);
    setENo(l.loan_no); setEAuth(l.authority_to_deduct);
    setEBal(l.balance_at_separation == null ? "" : String(l.balance_at_separation));
  }
  const saveEdit = (l: Loan) => run(async () => {
    await apiPatch(`${API}/${l.id}`, {
      monthly_amortization: Number(eMonthly), last_month: eLast, loan_no: eNo,
      authority_to_deduct: eAuth, balance_at_separation: eBal === "" ? null : Number(eBal),
    });
    setEditId(null);
    return `${l.staff_name}: saved. Draft periods pick it up when they are recomputed; paid periods do not change.`;
  });

  function openStop(l: Loan) {
    setEditId(null);
    setStopId(l.id); setSReason("");
    // Default: stop after the month before this one — this month's cut-offs
    // are usually still drafts.
    const def = addMonths(thisMonth, -1);
    setSLast(def < l.first_month ? l.first_month : def > l.last_month ? l.last_month : def);
  }
  const doStop = (l: Loan) => run(async () => {
    if (!sReason) throw new Error("Pick why it stops.");
    await apiPost(`${API}/${l.id}/stop`, { reason: sReason, last_month: sLast });
    setStopId(null);
    return `${l.staff_name}: ${TYPE_LABEL[l.loan_type]} stops after ${monthName(sLast)}. `
      + `To undo, Edit and move the last month back.`;
  });

  const doDelete = (l: Loan) => run(async () => {
    if (!window.confirm(`Delete ${l.staff_name}'s ${TYPE_LABEL[l.loan_type]}? Nothing was deducted in paid payroll.`)) return "";
    await apiDelete(`${API}/${l.id}`);
    return `${l.staff_name}: deleted.` + ((l.draft_amount ?? 0) > 0
      ? ` ${peso(l.draft_amount)} is still on draft payslips — recompute those periods (they show "needs recompute").`
      : "");
  });

  // Grouped by whether months are left to deduct, not by status: a loan
  // stopped after a future month still deducts until then.
  const active = loans.filter(l => l.last_month >= thisMonth);
  const ended = loans.filter(l => !active.includes(l));

  const csv = useMemo(() => {
    if (!remit?.rows.length) return "";
    const head = ["Type", "Staff", "SSS no.", "Pag-IBIG MID", "Loan no.", "Monthly", "1st cut-off", "2nd cut-off", "Deducted", "Not collected"];
    const lines = remit.rows.map(r => [
      TYPE_LABEL[r.loan_type], r.staff_name, r.sss_number ?? "", r.pagibig_mid ?? "", r.loan_no,
      num(r.monthly_amortization), num(r.deducted_1h), num(r.deducted_2h),
      num(r.deducted), num(r.not_collected),
    ]);
    // A cell that starts with = + - @ is run as a formula by spreadsheets.
    const cell = (c: unknown) => {
      const v = String(c);
      return `"${(/^[=+\-@]/.test(v) && isNaN(Number(v)) ? "'" + v : v).replace(/"/g, '""')}"`;
    };
    return [head, ...lines].map(l => l.map(cell).join(",")).join("\n");
  }, [remit]);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gov-loan-remittance-${rMonth}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const input = "mt-1 block w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">SSS &amp; Pag-IBIG Loans</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Register a loan once. Every payroll run deducts it — no need to enter it on each cut-off.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAdd(v => !v); setEditId(null); setStopId(null); }}
            className="rounded-lg border border-violet-500/40 bg-violet-600/20 px-3 py-2 text-sm text-violet-200 hover:bg-violet-600/30"
          >
            + Register a loan
          </button>
          <Link href="/admin/payroll/manila"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
            ← Manila Payroll
          </Link>
        </div>
      </div>

      <details className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
        <summary className="cursor-pointer text-zinc-200">How it deducts</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-400">
          <li>1st cut-off takes half the monthly amortization; the 2nd takes the rest of the month. The month always adds up to the amortization.</li>
          <li>It takes what is left after contributions, tax, and staff house and other company deductions, and never takes the payslip below zero. Whatever could not be taken is shown on the run as &ldquo;Loan Amortization Not Fully Collected&rdquo;, with how much staff house took first — lower that and recompute to let the loan through.</li>
          <li>Pag-IBIG: if pay is short, the employee pays Pag-IBIG directly for that month. SSS: the unpaid part carries a 1% a month penalty.</li>
          <li>Final pay: SSS requires the whole remaining balance to come off final pay. Pag-IBIG allows it only if the employee signed the Authority to Deduct on the loan form. Enter the balance from the agency statement (Edit → Balance at separation) — until you do, the last cut-off takes just the month and the payslip is flagged &ldquo;loan balance?&rdquo;.</li>
          <li>Changes reach draft periods when they are recomputed. Paid periods never change.</li>
        </ul>
      </details>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      {showAdd && (
        <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-600/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Staff
              <div className="mt-1">
                <SelectDark
                  value={fStaff}
                  onChange={setFStaff}
                  options={staff.map(s => s.staff_name)}
                  placeholder="Pick a person"
                  aria-label="Staff"
                />
              </div>
              {picked && (
                <span className="mt-1 block text-[11px] text-zinc-500">
                  SSS {picked.sss_number || "— none on profile"} · Pag-IBIG {picked.pagibig_mid || "— none on profile"}
                </span>
              )}
            </label>
            <div className="text-xs text-zinc-400">
              Type
              <div className="mt-1 flex gap-2">
                {(["SSS", "PAGIBIG"] as LoanType[]).map(t => (
                  <button key={t} type="button"
                    onClick={() => { setFType(t); if (t === "SSS") setFLast(addMonths(fFirst, 23)); }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${fType === t
                      ? "border-violet-400/60 bg-violet-600/30 text-violet-100"
                      : "border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200"}`}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs text-zinc-400">
              Monthly amortization (PHP)
              <input type="number" min="0.01" step="0.01" value={fMonthly}
                     onChange={e => setFMonthly(e.target.value)} className={input} placeholder="from the loan statement" />
            </label>
            <label className="text-xs text-zinc-400">
              Loan no. <span className="text-zinc-600">(for the remittance list)</span>
              <input value={fNo} onChange={e => setFNo(e.target.value)} className={input} />
            </label>
            <label className="text-xs text-zinc-400">
              First deduction month
              <input type="month" value={fFirst}
                     onChange={e => { setFFirst(e.target.value); if (fType === "SSS") setFLast(addMonths(e.target.value, 23)); }}
                     className={input} />
              <span className="mt-1 block text-[11px] text-zinc-500">
                {fType === "SSS" ? "SSS starts the 2nd month after the loan is approved." : "Pag-IBIG MPL starts after a 2-month grace period."}
              </span>
            </label>
            <label className="text-xs text-zinc-400">
              Last deduction month
              <input type="month" value={fLast} min={fFirst} onChange={e => setFLast(e.target.value)} className={input} />
              <span className="mt-1 block text-[11px] text-zinc-500">
                {fMonths > 0 ? `${fMonths} months${fTotal ? ` · ${peso(fTotal)} in total` : ""}` : "Before the first month"}
                {fType === "SSS" && fMonths !== 24 && fMonths > 0 ? " — an SSS salary loan is 24 months" : ""}
              </span>
            </label>
          </div>
          {fType === "PAGIBIG" && (
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={fAuth} onChange={e => setFAuth(e.target.checked)} className="mt-1" />
              <span>
                The employee signed the <b>Authority to Deduct</b> on the loan form
                <span className="block text-[11px] text-zinc-500">Only then can final pay take the remaining balance.</span>
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button disabled={busy} onClick={register}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              Register
            </button>
            <button onClick={() => setShowAdd(false)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-300">
          Being deducted <span className="text-zinc-500">({active.length})</span>
        </h2>
        {loading ? <div className="text-sm text-zinc-500">Loading…</div>
          : !loaded ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
              Could not load the loans (see the message above). Nothing is shown rather than an empty list.
            </div>
          ) : active.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
              {ended.length ? "No loan is being deducted now." : "No loans registered."} Use <b>+ Register a loan</b> for anyone repaying an SSS or Pag-IBIG loan.
            </div>
          ) : (
            renderList(active)
          )}
      </section>

      {ended.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-300">Finished or stopped <span className="text-zinc-500">({ended.length})</span></h2>
          {renderList(ended)}
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">To remit</h2>
            <p className="text-xs text-zinc-500">
              What payroll deducted in one month. SSS: pay with the PRN and the Loan Collection List
              {remit?.due.SSS ? <> by <b className="text-zinc-300">{remit.due.SSS}</b></> : null}.
              Pag-IBIG: by the date on the Fund&apos;s billing.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs text-zinc-400">
              Payroll month
              <input type="month" value={rMonth} onChange={e => setRMonth(e.target.value)} className={input} />
            </label>
            <button disabled={!csv} onClick={downloadCsv}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
              Download CSV
            </button>
          </div>
        </div>
        {remit && (
          <>
            {!remit.final && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {remit.periods.length === 0 ? "No payroll periods for this month yet."
                  : `Not final: ${remit.periods.map(p => `${p.period_label} ${p.status}`).join(", ")}. Figures change until both cut-offs are paid.`}
              </div>
            )}
            {remit.rows.length === 0 ? (
              <div className="text-sm text-zinc-500">Nothing deducted for loans in {monthName(rMonth)}.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr><th className="py-1 pr-3">Staff</th><th className="pr-3">Loan</th><th className="pr-3">ID no.</th>
                      <th className="pr-3 text-right">1st</th><th className="pr-3 text-right">2nd</th>
                      <th className="pr-3 text-right">Deducted</th><th className="text-right">Not collected</th></tr>
                  </thead>
                  <tbody>
                    {remit.rows.map(r => (
                      <tr key={r.loan_id} className="border-t border-white/5 text-zinc-300">
                        <td className="py-1.5 pr-3">{r.staff_name}</td>
                        <td className="pr-3">{TYPE_LABEL[r.loan_type]}{r.loan_no ? ` ${r.loan_no}` : ""}</td>
                        <td className="pr-3 text-zinc-500">{(r.loan_type === "SSS" ? r.sss_number : r.pagibig_mid) || "— missing"}</td>
                        <td className="pr-3 text-right">{peso(r.deducted_1h)}</td>
                        <td className="pr-3 text-right">{peso(r.deducted_2h)}</td>
                        <td className="pr-3 text-right text-zinc-100">{peso(r.deducted)}</td>
                        <td className={`text-right ${(r.not_collected ?? 0) > 0 ? "text-amber-300" : "text-zinc-600"}`}>
                          {(r.not_collected ?? 0) > 0 ? peso(r.not_collected) : "—"}
                        </td>
                      </tr>
                    ))}
                    {([["SSS", remit.totals.total_sss_loans], ["PAGIBIG", remit.totals.total_pagibig_loans]] as [LoanType, number | null][])
                      .filter(([t]) => remit.rows.some(r => r.loan_type === t)).map(([t, v]) => (
                      <tr key={t} className="border-t border-white/10 text-zinc-100">
                        <td className="py-1.5 pr-3 font-medium" colSpan={5}>{TYPE_LABEL[t]} total</td>
                        <td className="pr-3 text-right font-medium">{peso(v)}</td><td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );

  // Render functions, not components: a component declared inside this one is
  // a new type on every render, so React remounts it and the input being typed
  // in loses focus after each keystroke.
  //
  // Cards, not a table: at phone width the six-column table pushed Edit / Stop /
  // Delete off the right edge and squeezed the edit form into one cell
  // (checked in the browser 2026-10-19).
  function renderList(rows: Loan[]) {
    return <div className="space-y-2">{rows.map(l => <Fragment key={l.id}>{renderCard(l)}</Fragment>)}</div>;
  }

  function renderCard(l: Loan) {
    const finished = l.last_month < thisMonth;
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="font-medium text-zinc-100">
              {l.staff_name}
              {l.last_working_date && <span className="ml-2 rounded bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-normal text-rose-200">last day {l.last_working_date}</span>}
            </div>
            <div className="text-xs text-zinc-400">
              {TYPE_LABEL[l.loan_type]}{l.loan_no ? ` · ${l.loan_no}` : ""}
              {l.loan_type === "PAGIBIG" && (l.authority_to_deduct ? " · Authority to Deduct signed" : " · No Authority to Deduct")}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => (editId === l.id ? setEditId(null) : openEdit(l))}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-violet-300 hover:text-violet-100">Edit</button>
            {!finished && (
              <button onClick={() => (stopId === l.id ? setStopId(null) : openStop(l))}
                      className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-amber-300 hover:text-amber-100">Stop</button>
            )}
            {l.paid_amount === 0 && (
              <button disabled={busy} onClick={() => doDelete(l)}
                      className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-rose-300 hover:text-rose-100">Delete</button>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Monthly</div>
            <div>{peso(l.monthly_amortization)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Months</div>
            <div>{monthName(l.first_month)} – {monthName(l.last_month)}</div>
            <div className="text-[10px] text-zinc-500">
              {l.months_total} months{l.status === "stopped" ? ` · stopped: ${l.stop_reason}` : finished ? " · finished" : ""}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Deducted (paid)</div>
            <div>{peso(l.paid_amount)}</div>
            <div className="text-[10px] text-zinc-500">
              {l.paid_months} of {l.months_total} months{(l.draft_amount ?? 0) > 0 ? ` · ${peso(l.draft_amount)} in drafts` : ""}
            </div>
          </div>
        </div>

        {l.last_working_date && (l.loan_type === "SSS" || l.authority_to_deduct) && (
          <p className="mt-2 rounded-lg bg-rose-900/20 px-2.5 py-1.5 text-[11px] leading-snug text-rose-200/90">
            {l.final_period
              ? `Final pay ${l.final_period} (${l.final_period_status}) took ${peso(l.final_taken)}. `
              : "No payroll period holds the last day yet. "}
            {l.balance_at_separation == null ? "Enter the balance from the statement (Edit) so final pay takes it. " : ""}
            {l.final_period_status === "paid" ? "If the balance was not taken, report it to the agency." : ""}
          </p>
        )}

        {editId === l.id && (
          <div className="mt-3 rounded-lg bg-violet-600/10 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">Monthly
                <input type="number" min="0.01" step="0.01" value={eMonthly} onChange={e => setEMonthly(e.target.value)} className={input} /></label>
              <label className="text-xs text-zinc-400">Last month
                <input type="month" value={eLast} min={l.first_month} onChange={e => setELast(e.target.value)} className={input} /></label>
              <label className="text-xs text-zinc-400">Loan no.
                <input value={eNo} onChange={e => setENo(e.target.value)} className={input} /></label>
              <label className="text-xs text-zinc-400">Balance at separation
                <input type="number" min="0" step="0.01" value={eBal} onChange={e => setEBal(e.target.value)} className={input} placeholder="from the statement" />
                <span className="mt-1 block text-[10px] text-zinc-500">Only when leaving, from the agency statement. Empty = the last cut-off takes just the month.</span></label>
              {l.loan_type === "PAGIBIG" && (
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={eAuth} onChange={e => setEAuth(e.target.checked)} /> Authority to Deduct signed</label>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={() => saveEdit(l)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-50">Save</button>
              <button onClick={() => setEditId(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
            </div>
          </div>
        )}

        {stopId === l.id && (
          <div className="mt-3 rounded-lg bg-amber-500/10 p-3">
            <div className="text-xs text-zinc-400">Why</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {STOP_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setSReason(r)}
                  className={`rounded-full border px-3 py-1 text-xs ${sReason === r ? "border-amber-400/60 bg-amber-500/20 text-amber-100" : "border-white/10 text-zinc-400"}`}>{r}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-zinc-400">Last month deducted
                <input type="month" value={sLast} min={l.first_month} max={l.last_month} onChange={e => setSLast(e.target.value)} className={input} /></label>
              <button disabled={busy || !sReason} onClick={() => doStop(l)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-50">Stop</button>
              <button onClick={() => setStopId(null)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400">Cancel</button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {sReason === "Separated" ? "For a resignation, leave it running and enter the balance from the statement (Edit) — the last cut-off then takes it. " : ""}
              Months after {sLast ? monthName(sLast) : "this"} are not deducted. To undo, Edit and move the last month back.
            </p>
          </div>
        )}
      </div>
    );
  }
}
