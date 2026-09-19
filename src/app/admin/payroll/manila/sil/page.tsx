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
  eligible_from: string | null;
}

interface SilResponse {
  year: number;
  entitlement_days: number;
  balances: SilRow[];
  eligible_count: number;
  not_yet_count: number;
  missing_hire_date: number;
  unused_value: number;
  other_entity: { staff_name: string; payroll_entity: string }[];
}

interface PeriodRow { id: number; period_label: string; status: string }

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Whole days from today to `iso`, both read as calendar dates.
 *
 * Not `new Date(iso + "T00:00:00")` — in Manila and Dubai that is the previous
 * day once it goes through UTC, which is how the anniversary used to render a
 * day early. Both sides are reduced to a day number first. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target - today) / 86400000);
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
  const [cashOut, setCashOut] = useState<SilRow | null>(null);
  const [cashOutDays, setCashOutDays] = useState("");
  const [cashOutPeriod, setCashOutPeriod] = useState("");

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
    // This endpoint returns a bare array, not { periods: [...] }. Reading a
    // key that is not there left the cash-out dialog with no periods to offer.
    apiGet<PeriodRow[] | { periods: PeriodRow[] }>(`${API}/periods`)
      .then(r => setPeriods(Array.isArray(r) ? r : (r?.periods ?? [])))
      .catch(() => setPeriods([]));
  }, []);

  async function submitCashOut() {
    if (!cashOut) return;
    const n = Number(cashOutDays);
    if (!(n > 0)) { setError("Enter a number of days greater than zero."); return; }
    if (n > cashOut.remaining_days) { setError(`Only ${cashOut.remaining_days} day(s) are unused.`); return; }
    setBusy(cashOut.id); setError(""); setNotice("");
    try {
      const res = await apiPost<{ amount: number; days: number; paid_via: string; days_still_unused: number }>(
        `${API}/sil-balances/${cashOut.id}/convert`,
        { days: n, period_id: cashOutPeriod ? Number(cashOutPeriod) : null },
      );
      setNotice(`${cashOut.staff_name}: ${res.days} day(s) at ${peso(res.amount)} — ${res.paid_via}.`
        + (res.days_still_unused > 0 ? ` ${res.days_still_unused} day(s) still unused.` : ""));
      setCashOut(null);
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
  const shown = showAll ? rows : rows.filter(r => r.is_eligible || (daysUntil(r.eligible_from) ?? 9999) <= 90);

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

      {data && data.other_entity?.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
          This page covers the Sushi Zen payroll. {data.other_entity.length} active people are on another
          payroll ({[...new Set(data.other_entity.map(o => o.payroll_entity))].join(", ")}) and are not listed
          here: {data.other_entity.map(o => o.staff_name).join(", ")}. Their leave is that payroll&apos;s to track.
        </div>
      )}

      {data && data.missing_hire_date > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {data.missing_hire_date} {data.missing_hire_date === 1 ? "person has" : "people have"} no hire date on their
          payroll profile. The entitlement is counted from the hire date, so they can never reach it — fill the date in
          on <Link href="/admin/payroll/manila/staff-profiles" className="underline">Staff Profiles</Link>.
        </div>
      )}

      {cashOut && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-violet-300/70">Cash out</div>
              <div className="mt-0.5 text-sm text-zinc-200">{cashOut.staff_name}</div>
              <div className="text-[11px] text-zinc-500">
                {cashOut.remaining_days} unused · a day is worth {peso(cashOut.daily_rate)}
              </div>
            </div>
            <label className="text-xs text-zinc-400">
              Days
              <input
                type="number" min="0.5" step="0.5" max={cashOut.remaining_days}
                value={cashOutDays}
                onChange={e => setCashOutDays(e.target.value)}
                className="mt-1 block w-24 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Paid on
              <select
                value={cashOutPeriod}
                onChange={e => setCashOutPeriod(e.target.value)}
                className="mt-1 block rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">— record it only, pay nothing —</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.period_label} ({p.status})</option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Amount</div>
              <div className="mt-0.5 font-semibold text-violet-200">
                {peso((Number(cashOutDays) || 0) * cashOut.daily_rate)}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setCashOut(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5">
                Cancel
              </button>
              <button onClick={() => void submitCashOut()} disabled={busy === cashOut.id}
                className="rounded-lg border border-violet-500/40 bg-violet-600/20 px-3 py-2 text-xs text-violet-200 hover:bg-violet-600/30 disabled:opacity-50">
                {busy === cashOut.id ? "…" : "Cash out"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Choosing a period writes the amount onto it as a manual addition. It reaches the payslip when that
            period is computed — it is not paid by this button alone.
          </p>
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
              const from = r.eligible_from;
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
                    {r.convertible_value ? peso(r.convertible_value) : "—"}
                    {r.converted_amount ? (
                      <div className="text-[10px] text-emerald-400/80">{peso(r.converted_amount)} cashed out</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.is_eligible && r.remaining_days > 0 && (
                      <button
                        onClick={() => { setCashOut(r); setCashOutDays(String(r.remaining_days));
                                         setCashOutPeriod(String(periods.find(p => p.status !== "paid")?.id ?? "")); }}
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
