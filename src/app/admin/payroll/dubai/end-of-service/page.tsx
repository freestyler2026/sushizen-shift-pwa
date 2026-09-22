"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";

interface EosRow {
  staff_name: string;
  branch_code: string;
  role_title: string;
  currency: string;
  basic_salary: number;
  basic_salary_missing: boolean;
  service_start: string | null;
  service_start_source: string;
  service_start_is_floor: boolean;
  years_of_service: number;
  gratuity_days: number;
  gratuity_amount: number;
  gratuity_capped: boolean;
  eligible: boolean;
  leave_days_earned: number;
  leave_days_taken: number;
  leave_days_left: number;
  leave_value: number;
}

interface EosResponse {
  as_of: string;
  staff: EosRow[];
  total_gratuity: number;
  total_leave_value: number;
  total_liability: number;
  estimated_service_count: number;
  leave_records_begin: string | null;
  leave_ever_recorded: boolean;
  basic_salary_missing_count: number;
  rules: string;
}

const aed = (n: number) =>
  `AED ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DubaiEndOfServicePage() {
  const [data, setData] = useState<EosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"gratuity" | "name" | "service">("gratuity");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setData(await apiGet<EosResponse>("/api/admin/payroll/dubai/end-of-service"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = [...(data?.staff ?? [])].sort((a, b) =>
    sort === "name" ? a.staff_name.localeCompare(b.staff_name)
    : sort === "service" ? b.years_of_service - a.years_of_service
    : b.gratuity_amount - a.gratuity_amount);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">End of Service &amp; Leave — Dubai</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            What the company would owe if everyone left today. Gratuity accrues every day somebody
            works and falls due the day they go, so this is a standing liability, not a forecast.
          </p>
        </div>
        <Link href="/admin/payroll/dubai"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
          ← Dubai Payroll
        </Link>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="text-sm text-zinc-500">Loading…</div>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-violet-300/70">Gratuity accrued</div>
              <div className="mt-1 text-2xl font-semibold text-violet-200">{aed(data.total_gratuity)}</div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {data.staff.filter(r => r.eligible).length} of {data.staff.length} have passed a year
                {data.basic_salary_missing_count > 0 &&
                  ` · ${data.basic_salary_missing_count} have no basic wage on file`}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Leave accrued</div>
              {data.leave_ever_recorded ? (
                <>
                  <div className="mt-1 text-2xl font-semibold text-zinc-300">{aed(data.total_leave_value)}</div>
                  <div className="mt-1 text-[11px] text-amber-400/80">an upper bound — see below</div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-2xl font-semibold text-zinc-600">not measurable</div>
                  <div className="mt-1 text-[11px] text-amber-400/80">no leave has ever been recorded</div>
                </>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">As of</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-300">{data.as_of}</div>
              <div className="mt-1 text-[11px] text-zinc-500">recomputed on every visit</div>
            </div>
          </div>

          {/* Both figures are wrong in a known direction. Saying which is the
              difference between a number somebody can use and one they cannot. */}
          <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
            <p>
              <strong className="text-amber-200">The gratuity is a floor.</strong>{" "}
              No one has a hire date on their payroll profile, so length of service is counted from the
              first month each person appears in the imported payroll
              {data.estimated_service_count > 0 && <> — {data.estimated_service_count} of {data.staff.length} people</>}.
              Anyone employed before that import counts as shorter-serving than they are, and the real
              figure is higher. Filling in hire dates is what fixes it.
            </p>
            <p>
              <strong className="text-amber-200">Nobody&apos;s leave has ever been recorded.</strong>{" "}
              The Dubai DTR upload can mark a day as annual leave and no row in the table has ever been marked,
              so the leave column below is the entitlement somebody has built up — not a balance. It cannot be
              netted down until leave taken is entered, and putting a money figure on it would be fiction.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Sort by</span>
            {(["gratuity", "service", "name"] as const).map(k => (
              <button key={k} onClick={() => setSort(k)}
                className={"rounded-md px-2 py-1 " + (sort === k ? "bg-white/10 text-zinc-200" : "hover:bg-white/5")}>
                {k === "gratuity" ? "amount owed" : k === "service" ? "length of service" : "name"}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Serving since</th>
                  <th className="px-3 py-2 text-right">Years</th>
                  <th className="px-3 py-2 text-right">Basic</th>
                  <th className="px-3 py-2 text-right">Gratuity days</th>
                  <th className="px-3 py-2 text-right">Gratuity owed</th>
                  <th className="px-3 py-2 text-right">Leave left</th>
                  <th className="px-3 py-2 text-right">Leave worth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(r => (
                  <tr key={r.staff_name} className="text-zinc-300">
                    <td className="px-3 py-2">
                      {r.staff_name}
                      {r.branch_code && <span className="ml-2 text-[11px] text-zinc-600">{r.branch_code}</span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {r.service_start ?? "unknown"}
                      {r.service_start_is_floor && (
                        <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300"
                              title={r.service_start_source}>at least</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.years_of_service.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                      {r.basic_salary_missing
                        ? <span className="text-[11px] text-amber-400/80">not on file</span>
                        : r.basic_salary.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.eligible ? r.gratuity_days : <span className="text-[11px] text-zinc-600">under a year</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {!r.eligible ? "—"
                        : r.basic_salary_missing
                          ? <span className="text-[11px] text-amber-400/80">needs a basic wage</span>
                          : aed(r.gratuity_amount)}
                      {r.gratuity_capped && <span className="ml-1 text-[10px] text-amber-400">capped</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                      {r.leave_days_left.toFixed(1)}
                      <span className="text-[11px] text-zinc-600"> /{r.leave_days_earned.toFixed(0)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                      {data.leave_ever_recorded ? aed(r.leave_value)
                        : <span className="text-[11px] text-zinc-600">nothing recorded</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-zinc-600">{data.rules}</p>
        </>
      )}
    </div>
  );
}
