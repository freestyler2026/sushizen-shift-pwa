"use client";

/** What a DTR sync did to pay.
 *
 *  Correcting the DTR did not change anybody's pay: compute_payroll_run was
 *  only ever reached from the payroll screen, so a shift fixed in the morning
 *  left the pay slip — and the SSS basis read off it — on yesterday's figures
 *  until somebody remembered to press Recompute. The sync does it now, and this
 *  says so on the same screen. A rebuild nobody can see is the same failure in
 *  a different place (lessons 55, 58).
 */
export type RecomputeResult = {
  summary?: { recomputed: number; changed: number; held_back: number; no_run: number };
  recomputed?: { staff_name: string; period: string; gross_delta: number; net_delta: number; note?: string }[];
  held_back?: { staff_name: string; period: string; reason: string }[];
  no_run?: { staff_name: string; period?: string; reason: string }[];
  error?: string;
  note?: string;
};

export default function RecomputeSummary({ result }: { result?: RecomputeResult | null }) {
  if (!result) return null;

  // A rebuild that failed must not read like one that succeeded.
  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-3">
        <p className="text-xs text-red-300">
          The DTR was corrected, but the pay built on it was <strong>not</strong> rebuilt.
          Use Recompute on the period. ({result.error})
        </p>
      </div>
    );
  }

  const moved = (result.recomputed ?? []).filter((r) => r.gross_delta || r.net_delta);
  const held = result.held_back ?? [];
  const noRun = result.no_run ?? [];

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-900/10 p-3 space-y-2">
      <p className="text-xs font-semibold text-sky-300">
        Pay rebuilt from these corrections: {result.summary?.changed ?? moved.length} of{" "}
        {result.summary?.recomputed ?? (result.recomputed ?? []).length} pay slips changed
      </p>

      {moved.slice(0, 12).map((r) => (
        <div key={`${r.staff_name}-${r.period}`} className="flex items-baseline justify-between text-xs">
          <span className="text-slate-300">{r.staff_name} · {r.period}</span>
          <span className={`font-mono tabular-nums ${r.net_delta >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
            net {r.net_delta >= 0 ? "+" : ""}{r.net_delta.toFixed(2)}
          </span>
        </div>
      ))}

      {held.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="text-xs font-semibold text-amber-300">
            Not rebuilt ({held.length}) — these need a deliberate Recompute:
          </p>
          {held.slice(0, 8).map((r) => (
            <p key={`${r.staff_name}-${r.period}`} className="text-[11px] text-amber-200/80">
              {r.staff_name} · {r.period} — {r.reason}
            </p>
          ))}
        </div>
      )}

      {noRun.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">
          {noRun.length} person-period(s) have no pay run yet, so there was nothing to rebuild.
          They will pick these corrections up when the period is computed.
        </p>
      )}
    </div>
  );
}
