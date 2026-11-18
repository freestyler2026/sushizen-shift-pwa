"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { SALARY_HIDDEN, isSalaryHidden } from "@/lib/salary";
import { LATE_ABSENT_LABEL } from "@/lib/manila-late-absent";

// 13th month for the year (Peter Villafuerte, HR, 2026-11-17): the basic less
// late / absent / undertime, cut-off by cut-off, added up and divided by twelve.
// Allowances are not in it. Cut-offs paid before the OS (before 2026-07-1H) come
// from the old payslips, imported by HQ.

type Cutoff = {
  source: "os" | "import"; period_label: string; cutoff: string; start_date: string | null; end_date: string | null;
  period_status: string; released: boolean; basic_pay: number | null; late_absent: number | null; basic_earned: number | null;
};
type Row = {
  staff_name: string; cutoffs: Cutoff[]; basic_pay: number | null; late_absent: number | null;
  basic_earned: number | null; thirteenth_month: number | null;
  os_cutoffs: number; imported_cutoffs: number; unpaid_cutoffs: number; unreleased_cutoffs: number; salary_hidden?: boolean;
};
type Report = { year: number; rows: Row[]; first_os_period: string | null };

const money = (n: number | null | undefined) =>
  isSalaryHidden(n) ? SALARY_HIDDEN : `₱${(n as number).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ThirteenthMonthPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiGet<Report>(`/api/admin/manila-payroll/13th-month?year=${year}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load."); setData(null); }
    finally { setLoading(false); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.rows || []).filter((r) => r.staff_name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  const hidden = rows.some((r) => isSalaryHidden(r.thirteenth_month));
  const total = hidden ? null : rows.reduce((s, r) => s + (r.thirteenth_month || 0), 0);
  const withoutImport = (data?.rows || []).filter((r) => r.imported_cutoffs === 0).length;
  const unreleased = (data?.rows || []).filter((r) => r.unreleased_cutoffs > 0).length;

  const toggle = (name: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(name)) n.delete(name); else n.add(name);
    return n;
  });

  async function exportXlsx() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const summary = rows.map((r) => ({
      Employee: r.staff_name,
      "Basic pay": r.basic_pay, [LATE_ABSENT_LABEL]: r.late_absent, "Basic earned": r.basic_earned,
      "13th month (÷12)": r.thirteenth_month,
      "Cut-offs from OS": r.os_cutoffs, "Cut-offs from old payslips": r.imported_cutoffs,
    }));
    const detail = rows.flatMap((r) => r.cutoffs.map((c) => ({
      Employee: r.staff_name, "Payroll period": c.period_label, "Cut-off": c.cutoff,
      Source: c.source === "os" ? "OS" : "Old payslip",
      "Released on OS": c.source === "os" ? (c.released ? "Yes" : "No — check the payslip") : "",
      "Basic pay": c.basic_pay, [LATE_ABSENT_LABEL]: c.late_absent, "Basic earned": c.basic_earned,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "13th month");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Cut-offs");
    XLSX.writeFile(wb, `13th_month_${data.year}.xlsx`);
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/payroll/manila" className="text-xs text-slate-400 hover:text-white">← Manila Payroll</Link>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-white">13th Month</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Basic pay less {LATE_ABSENT_LABEL.toLowerCase()} for every cut-off of the year, added up and divided by 12.
            Allowances, overtime and premiums are not included. Unpaid leave and unpaid holidays count as absences.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
            {[thisYear + 1, thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" aria-label="Search employee"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          <button onClick={exportXlsx} disabled={!data || rows.length === 0}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40">Export Excel</button>
        </div>
      </div>

      {data?.first_os_period && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The OS payroll starts at {data.first_os_period}. Cut-offs before it come from the old payslips once they are imported
          {withoutImport > 0 && year <= Number(data.first_os_period.slice(0, 4)) ? ` — ${withoutImport} employee${withoutImport === 1 ? " has" : "s have"} none imported for ${year} yet` : ""}.
        </p>
      )}
      {unreleased > 0 && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {unreleased} employee{unreleased === 1 ? " has" : "s have"} cut-offs computed in the OS but never released to them
          (marked “not released on OS”) — paid another way, or not yet published. Check those cut-offs against the payslip that was released.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Cut-offs</th>
              <th className="px-3 py-2 text-right">Basic pay</th>
              <th className="px-3 py-2 text-right">Late / absent / UT</th>
              <th className="px-3 py-2 text-right">Basic earned</th>
              <th className="px-3 py-2 text-right">13th month (÷12)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.staff_name}>
                <tr onClick={() => toggle(r.staff_name)} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-white">
                    <span className="mr-2 inline-block w-3 text-slate-500">{open.has(r.staff_name) ? "▾" : "▸"}</span>{r.staff_name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {r.cutoffs.length}
                    {r.unreleased_cutoffs > 0 && <span className="ml-1 text-xs text-red-300">({r.unreleased_cutoffs} not released on OS)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(r.basic_pay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-300">{isSalaryHidden(r.late_absent) ? SALARY_HIDDEN : `(${money(r.late_absent)})`}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(r.basic_earned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-300">{money(r.thirteenth_month)}</td>
                </tr>
                {open.has(r.staff_name) && r.cutoffs.map((c) => (
                  <tr key={`${r.staff_name}-${c.source}-${c.period_label}`} className="bg-white/[0.015] text-xs">
                    <td className="py-1.5 pl-10 pr-3 text-slate-300">
                      {c.cutoff || c.period_label}
                      <span className="ml-2 text-slate-500">{c.source === "os" ? c.period_label : "old payslip"}</span>
                      {!c.released && <span className="ml-2 text-red-300">not released on OS</span>}
                    </td>
                    <td />
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{money(c.basic_pay)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-300/80">{isSalaryHidden(c.late_absent) ? SALARY_HIDDEN : `(${money(c.late_absent)})`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{money(c.basic_earned)}</td>
                    <td />
                  </tr>
                ))}
              </Fragment>
            ))}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No cut-offs for {year}.</td></tr>
            )}
            {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.04]">
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400" colSpan={5}>Total 13th month ({rows.length} employees)</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">{total === null ? SALARY_HIDDEN : money(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
