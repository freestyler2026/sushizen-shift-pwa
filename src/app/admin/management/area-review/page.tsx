"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import SelectDark from "@/components/SelectDark";

interface BranchScore {
  branch: string;
  sent: number;
  responded: number;
  missed: number;
  red_total: number;
  yellow_total: number;
  exceptions: number;
  escalated: number;
  avg_response_min: number | null;
  cannot_count: number;
  response_rate: number | null;
  on_time_rate: number | null;
  score: number | null;
  grade: "A" | "B" | "C" | "D" | null;
}

interface WeekResult {
  city: string;
  week_start: string;
  week_end: string;
  branches: BranchScore[];
}

/** Monday of the week containing `d`. */
function mondayOf(d: Date): string {
  const c = new Date(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c.toISOString().slice(0, 10);
}

function shiftWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const GRADE_STYLE: Record<string, string> = {
  A: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  B: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  C: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  D: "text-red-300 bg-red-500/15 border-red-500/30",
};

export default function AreaReviewPage() {
  const router = useRouter();
  const [city, setCity] = useState("manila");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [data, setData] = useState<WeekResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fmanagement%2Farea-review");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/management/area-review?city=${city}&week_start=${weekStart}`,
        { headers: getAuthHeaders(getAuth()) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [city, weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const branches = data?.branches ?? [];
  const scored = branches.filter((b) => b.score !== null);
  const groupScore = scored.length
    ? Math.round(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length)
    : null;
  const totalMissed = branches.reduce((a, b) => a + b.missed, 0);
  const totalExceptions = branches.reduce((a, b) => a + b.exceptions, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <MgmtChannelTabBar active="area" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Area Manager Weekly Review</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            The score measures the <strong className="text-zinc-200">manager</strong>, not
            the store: it is the share of sent instructions answered inside their SLA. A
            branch can have a hard week operationally and still score 100.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32">
            <SelectDark
              value={city}
              onChange={setCity}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
          </div>
          <button onClick={load} disabled={loading} className={SMALL_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className={GLASS_CARD + " p-3 flex items-center justify-between"}>
        <button onClick={() => setWeekStart((w) => shiftWeeks(w, -1))} className={SMALL_BUTTON}>
          <ChevronLeft className="h-4 w-4 inline" /> Previous
        </button>
        <div className="text-center">
          <div className={T_LABEL}>Week</div>
          <div className="text-sm font-semibold text-white tabular-nums">
            {data ? `${data.week_start} → ${data.week_end}` : weekStart}
          </div>
        </div>
        <button
          onClick={() => setWeekStart((w) => shiftWeeks(w, 1))}
          disabled={weekStart >= mondayOf(new Date())}
          className={SMALL_BUTTON + " disabled:opacity-30"}
        >
          Next <ChevronRight className="h-4 w-4 inline" />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-start gap-2">
          <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Could not load this week: {error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Group score</div>
          <div className={KPI_VALUE}>{groupScore ?? "—"}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Exceptions</div>
          <div className={KPI_VALUE}>{totalExceptions}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Missed by manager</div>
          <div className={KPI_VALUE + (totalMissed ? " text-red-300" : "")}>{totalMissed}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Branches scored</div>
          <div className={KPI_VALUE}>{scored.length}</div>
        </div>
      </div>

      <div className={GLASS_CARD + " p-4"}>
        {loading ? (
          <div className={T_CAPTION + " py-10 text-center"}>Loading…</div>
        ) : branches.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className={T_BODY}>No tasks were raised in this week.</div>
            <div className={T_CAPTION}>
              Nothing to score — this is not the same as a perfect week.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="text-left">
                  <th className={TABLE_HEADER + " pl-2"}>Branch</th>
                  <th className={TABLE_HEADER + " text-center"}>Grade</th>
                  <th className={TABLE_HEADER + " text-right"}>Score</th>
                  <th className={TABLE_HEADER + " text-right"}>Sent</th>
                  <th className={TABLE_HEADER + " text-right"}>Responded</th>
                  <th className={TABLE_HEADER + " text-right"}>Missed</th>
                  <th className={TABLE_HEADER + " text-right"}>“Cannot”</th>
                  <th className={TABLE_HEADER + " text-right"}>Avg reply</th>
                  <th className={TABLE_HEADER + " text-right pr-2"}>🔴 / 🟠</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch} className={TABLE_ROW}>
                    <td className="py-3 pl-2 text-sm font-medium text-white">{b.branch}</td>
                    <td className="py-3 text-center">
                      {b.grade ? (
                        <span
                          className={`inline-block w-7 rounded border text-xs font-bold py-0.5 ${GRADE_STYLE[b.grade]}`}
                        >
                          {b.grade}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-sm font-semibold text-white tabular-nums">
                      {b.score ?? "—"}
                    </td>
                    <td className="py-3 text-right text-sm text-zinc-300 tabular-nums">{b.sent}</td>
                    <td className="py-3 text-right text-sm text-zinc-300 tabular-nums">
                      {b.responded}
                    </td>
                    <td
                      className={`py-3 text-right text-sm tabular-nums ${
                        b.missed ? "text-red-300 font-semibold" : "text-zinc-500"
                      }`}
                    >
                      {b.missed}
                    </td>
                    <td
                      className={`py-3 text-right text-sm tabular-nums ${
                        b.cannot_count ? "text-amber-300" : "text-zinc-500"
                      }`}
                    >
                      {b.cannot_count}
                    </td>
                    <td className="py-3 text-right text-sm text-zinc-400 tabular-nums">
                      {b.avg_response_min !== null ? `${b.avg_response_min}m` : "—"}
                    </td>
                    <td className="py-3 text-right text-sm text-zinc-400 tabular-nums pr-2">
                      {b.red_total} / {b.yellow_total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={T_CAPTION + " mt-4 leading-relaxed"}>
          <strong className="text-zinc-400">Score</strong> = instructions answered inside
          their SLA ÷ instructions sent. 🔴 allows 90 minutes, 🟠 allows 4 hours. Tasks BO
          never sent are excluded — an unsent task is BO’s backlog, not a manager’s miss.
          <br />
          <strong className="text-zinc-400">Grades</strong>: A ≥ 95 · B ≥ 85 · C ≥ 70 · D below 70.
        </div>
      </div>
    </div>
  );
}
