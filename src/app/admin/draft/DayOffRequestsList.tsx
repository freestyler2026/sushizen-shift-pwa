"use client";

import { useMemo } from "react";
import { GLASS_CARD } from "@/lib/ui-tokens";
import { isWorkCell, type DayOffDay } from "@/lib/day-off-conflicts";

type Row = { staff_name: string; work_date: string; role: string; start_hour: number; end_hour: number };

/**
 * Every day off asked for in the month, approved ones included. The approval
 * screen drops a request the moment it is decided, so the only trace of an
 * approved day off was the chip on a grid cell -- there was no list to check
 * the draft against (Yusuke, 2026-10-21). Refused requests are not here:
 * working that day is the right answer.
 */
export default function DayOffRequestsList({ days, rows, month }: { days: DayOffDay[]; rows: Row[]; month: string }) {
  const items = useMemo(() => {
    const inDraft = new Map<string, { work: boolean }>();
    const names = new Set<string>();
    for (const r of rows) {
      const n = String(r.staff_name || "").trim().toLowerCase();
      names.add(n);
      const k = `${n}|${String(r.work_date || "").slice(0, 10)}`;
      const work = isWorkCell(r.role, r.start_hour, r.end_hour);
      inDraft.set(k, { work: (inDraft.get(k)?.work ?? false) || work });
    }
    return [...days]
      .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.staff_name.localeCompare(b.staff_name))
      .map((d) => {
        const n = d.staff_name.trim().toLowerCase();
        const cell = inDraft.get(`${n}|${d.work_date}`);
        const draft = !names.has(n) ? "other" : cell?.work ? "rostered" : "off";
        return { ...d, draft };
      });
  }, [days, rows]);

  const approved = items.filter((x) => x.stage === "approved").length;
  const asked = items.length - approved;
  const clash = items.filter((x) => x.stage === "approved" && x.draft === "rostered").length;

  return (
    <details className={`${GLASS_CARD} mb-4 p-4`}>
      <summary className="cursor-pointer select-none text-sm text-white">
        <span className="font-semibold">Day-off requests in {month}</span>
        <span className="ml-2 text-xs text-white/60">
          {approved} approved · {asked} waiting for an answer
          {clash > 0 && <span className="ml-2 font-semibold text-rose-300">· {clash} still rostered on an approved day off</span>}
        </span>
      </summary>
      <p className="mt-2 text-xs text-white/50">
        All branches in the city. Refused requests are not listed. &ldquo;This draft&rdquo; is the branch open above;
        a person who is not in it shows &ldquo;Not in this branch&rdquo;.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-white/50">No day off has been asked for in {month}.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white/40">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Staff</th>
                <th className="py-1 pr-3 font-medium">Type</th>
                <th className="py-1 pr-3 font-medium">Request</th>
                <th className="py-1 font-medium">This draft</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={`${x.staff_name}|${x.work_date}|${i}`} className="border-t border-white/5">
                  <td className="py-1 pr-3 font-mono tabular-nums text-white/80">{x.work_date}</td>
                  <td className="py-1 pr-3 text-white">{x.staff_name}</td>
                  <td className="py-1 pr-3 text-white/60">{String(x.request_type || "day off").replace(/_/g, " ")}</td>
                  <td className="py-1 pr-3">
                    {x.stage === "approved"
                      ? <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">Approved</span>
                      : <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-200">Waiting</span>}
                  </td>
                  <td className="py-1">
                    {x.draft === "rostered"
                      ? <span className={x.stage === "approved" ? "font-semibold text-rose-300" : "text-white/70"}>Rostered</span>
                      : x.draft === "off"
                        ? <span className="text-white/60">Day off</span>
                        : <span className="text-white/30">Not in this branch</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
