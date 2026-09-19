"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";

const API = "/api/admin/manila-payroll";

interface SilRow {
  id: number;
  staff_name: string;
  year: number;
  entitlement_days: number;
  used_days: number;
  remaining_days: number;
  is_eligible: boolean;
  hire_date: string | null;
  convertible_days: number | null;
  converted_amount: number | null;
  conversion_status: string | null;
  converted_at: string | null;
  branch_code: string;
  daily_rate: number;
  convertible_value: number;
}

interface SilResponse {
  year: number;
  entitlement_days: number;
  balances: SilRow[];
  eligible_count: number;
  not_yet_count: number;
  missing_hire_date: number;
  unused_value: number;
}

interface PeriodRow { id: number; period_label: string; status: string }

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The anniversary this person's five days fall due on. */
function eligibleFrom(hire: string | null): string | null {
  if (!hire) return null;
  const d = new Date(hire + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d = new Date(iso + "T00:00:00").getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - t) / 86400000);
}

export default function SilPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<SilResponse | null>(null);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (y: number) => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<SilResponse>(`${API}/sil-balances?year=${y}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(year); }, [year, load]);

  useEffect(() => {
    apiGet<{ periods: PeriodRow[] }>(`${API}/periods`)
      .then(r => setPeriods(r.periods || []))
      .catch(() => setPeriods([]));
  }, []);

  async function convert(row: SilRow) {
    const open = periods.find(p => p.status !== "paid") ?? periods[0];
    const days = window.prompt(
      `Cash out how many of ${row.staff_name}'s ${row.remaining_days} unused day(s)?\n` +
      `A day is worth ${peso(row.daily_rate)}.`,
      String(row.remaining_days),
    );
    if (days === null) return;
    const n = Number(days);
    if (!(n > 0)) { setError("Enter a number of days greater than zero."); return; }
    const periodId = window.prompt(
      `Which payroll period should pay it?\n\n` +
      periods.map(p => `${p.id} — ${p.period_label} (${p.status})`).join("\n") +
      `\n\nLeave blank to record the conversion without paying it.`,
      open ? String(open.id) : "",
    );
    if (periodId === null) return;
    setBusy(row.id); setError(""); setNotice("");
    try {
      const res = await apiPost<{ amount: number; days: number; paid_via: string }>(
        `${API}/sil-balances/${row.id}/convert`,
        { days: n, period_id: periodId ? Number(periodId) : null },
      );
      setNotice(`${row.staff_name}: ${res.days} day(s) cashed out at ${peso(res.amount)} — ${res.paid_via}.`);
      await load(year);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.balances ?? [];
  // Everybody appears, but the people whose leave has fallen due are the ones
  // there is anything to do about — the rest are a date in the future.
  const shown = showAll ? rows : rows.filter(r => r.is_eligible || (daysUntil(eligibleFrom(r.hire_date)) ?? 9999) <= 90);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Service Incentive Leave</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Five paid days a year once someone has served a year (Labor Code Art. 95). Whatever is
            unused at the end of the year is convertible to cash.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            aria-label="Year"
          >
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link href="/admin/payroll/manila"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
            ← Manila Payroll
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Entitled now", value: String(data.eligible_count), tone: "text-emerald-300" },
            { label: "Not a year yet", value: String(data.not_yet_count), tone: "text-zinc-300" },
            { label: "No hire date on file", value: String(data.missing_hire_date), tone: data.missing_hire_date ? "text-amber-300" : "text-zinc-300" },
            { label: "Unused days are worth", value: peso(data.unused_value), tone: "text-violet-300" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{c.label}</div>
              <div className={`mt-1 text-lg font-semibold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && data.missing_hire_date > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {data.missing_hire_date} {data.missing_hire_date === 1 ? "person has" : "people have"} no hire date on their
          payroll profile. The entitlement is counted from the hire date, so they can never reach it — fill the date in
          on <Link href="/admin/payroll/manila/staff-profiles" className="underline">Staff Profiles</Link>.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Staff</th>
              <th className="px-3 py-2">Hired</th>
              <th className="px-3 py-2">Entitled</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Left</th>
              <th className="px-3 py-2 text-right">A day is worth</th>
              <th className="px-3 py-2 text-right">Unused is worth</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-500">Loading…</td></tr>}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-500">Nobody reaches a year of service in {year}.</td></tr>
            )}
            {shown.map(r => {
              const from = eligibleFrom(r.hire_date);
              const until = daysUntil(from);
              return (
                <tr key={r.id} className="text-zinc-300">
                  <td className="px-3 py-2">
                    {r.staff_name}
                    {r.branch_code && <span className="ml-2 text-[11px] text-zinc-600">{r.branch_code}</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{r.hire_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.is_eligible ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                        {r.entitlement_days} days
                      </span>
                    ) : from ? (
                      <span className="text-[11px] text-zinc-500">
                        from {from}{until !== null && until >= 0 ? ` · in ${until}d` : ""}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-400/80">no hire date</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.is_eligible ? r.used_days : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.is_eligible ? r.remaining_days : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{r.daily_rate ? peso(r.daily_rate) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.conversion_status === "converted"
                      ? <span className="text-emerald-300">{peso(r.converted_amount ?? 0)} paid</span>
                      : r.convertible_value ? peso(r.convertible_value) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.is_eligible && r.remaining_days > 0 && r.conversion_status !== "converted" && (
                      <button
                        onClick={() => void convert(r)}
                        disabled={busy === r.id}
                        className="rounded-lg border border-violet-500/30 bg-violet-600/10 px-3 py-1 text-xs text-violet-300 hover:bg-violet-600/20 disabled:opacity-50"
                      >
                        {busy === r.id ? "…" : "Cash out"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="text-xs text-zinc-500 underline">
          Show the other {rows.length - shown.length} whose anniversary is more than 90 days away
        </button>
      )}
      {showAll && (
        <button onClick={() => setShowAll(false)} className="text-xs text-zinc-500 underline">
          Show only the ones there is something to do about
        </button>
      )}

      <p className="text-xs text-zinc-600">
        Leave is taken through the staff request screen: a request of type Paid Leave → Annual Leave draws on these
        five days, and approving it takes the days off the balance here. Sick, emergency, unpaid and maternity leave
        do not touch it. Cashing out writes the amount onto a payroll period as a manual addition — that is what puts
        it on a payslip.
      </p>
    </div>
  );
}
