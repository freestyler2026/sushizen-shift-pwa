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

interface ComplianceComponent {
  key: string;
  label: string;
  weight: number;
  value: number | null;
  counted: boolean;
  /** counted | quiet (nothing happened) | blocked (the feed stopped). */
  status?: "counted" | "quiet" | "blocked";
  blocked_reason?: string;
}

interface BlockedComponent {
  key: string;
  label: string;
  weight: number;
  reason: string;
}

interface ComplianceRow {
  branch: string;
  score: number | null;
  grade: "A" | "B" | "C" | "D" | null;
  components: ComplianceComponent[];
  /** How much of the design's 100 points this number actually rests on. */
  coverage_pct: number;
  measured_components: number;
  /** Of the missing weight, how much is missing because a feed stopped. */
  blocked_weight?: number;
}

interface BranchScore {
  branch: string;
  sent: number;
  responded: number;
  missed: number;
  on_time: number;
  self_reported: number;
  false_claims: number;
  red_total: number;
  yellow_total: number;
  exceptions: number;
  escalated: number;
  avg_response_min: number | null;
  /** Reported, never subtracted — "cannot" is the store asking for help. */
  blocked_count: number;
  response_rate: number | null;
  on_time_rate: number | null;
  score: number | null;
  grade: "A" | "B" | "C" | "D" | null;
  contribution: number;
  quality_high: number;
  reports_filed: number;
  self_fixes: number;
  qc_photos: number;
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
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [blockedComponents, setBlockedComponents] = useState<BlockedComponent[]>([]);
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

      // The design's seven-component number, alongside the response-rate axis
      // this page already had.
      const cs = await fetch(
        `/api/admin/management/manager-score?city=${city}&week_start=${weekStart}`,
        { headers: getAuthHeaders(getAuth()) },
      );
      if (cs.ok) {
        const j = await cs.json();
        setCompliance((j?.rows ?? []) as ComplianceRow[]);
        setBlockedComponents((j?.blocked_components ?? []) as BlockedComponent[]);
      }
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
  const compRow = (branch: string) => compliance.find((c) => c.branch === branch);

  const scored = branches.filter((b) => b.score !== null);
  const groupScore = scored.length
    ? Math.round(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length)
    : null;
  const totalMissed = branches.reduce((a, b) => a + b.missed, 0);
  const totalExceptions = branches.reduce((a, b) => a + b.exceptions, 0);
  const totalContribution = branches.reduce((a, b) => a + (b.contribution || 0), 0);
  const totalFalseClaims = branches.reduce((a, b) => a + (b.false_claims || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <MgmtChannelTabBar active="area" />

      {/* Said once at the top, not four times down the table: a feed that has
          stopped is one problem affecting every branch, and repeating it per
          row reads as four. Without this the missing weight is invisible --
          the score drops an unmeasurable component and renormalises, which is
          the right rule and exactly what hides a dead source. */}
      {blockedComponents.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
          <div className="font-semibold">
            {blockedComponents.reduce((n, b) => n + b.weight, 0)} of 100 points cannot be
            measured — this is not a score of zero, it is no data.
          </div>
          <ul className="mt-1.5 space-y-0.5 text-amber-200/90">
            {blockedComponents.map((b) => (
              <li key={b.key}>
                <span className="font-medium">{b.label} ({b.weight}%)</span> — {b.reason}
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-amber-200/70">
            Every branch below is scored on the components that remain, so the numbers are
            comparable with each other but not with weeks before the source stopped.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Area Manager Weekly Review</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            Two axes kept apart. <strong className="text-zinc-200">Compliance</strong> is
            the share of sent instructions answered inside their SLA — it measures the
            manager, so a hard operational week can still score 100.{" "}
            <strong className="text-zinc-200">Contribution</strong> is what the branch did
            well: reports filed, A/S scores, problems it found and fixed itself.
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
          <div className={KPI_LABEL}>Contribution</div>
          <div className={KPI_VALUE + " text-violet-300"}>
            {Math.round(totalContribution).toLocaleString()}
          </div>
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
                  <th className={TABLE_HEADER + " text-right"}>Compliance</th>
                  <th className={TABLE_HEADER + " text-right"}>Score</th>
                  <th className={TABLE_HEADER + " text-right"}>Sent</th>
                  <th className={TABLE_HEADER + " text-right"}>Responded</th>
                  <th className={TABLE_HEADER + " text-right"}>Missed</th>
                  <th className={TABLE_HEADER + " text-right"}>Contribution</th>
                  <th className={TABLE_HEADER + " text-right"}>A / S</th>
                  <th className={TABLE_HEADER + " text-right"}>Self-fixes</th>
                  <th className={TABLE_HEADER + " text-right"}>Help asked</th>
                  <th className={TABLE_HEADER + " text-right pr-2"}>Unverified claims</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch} className={TABLE_ROW}>
                    <td className="py-3 pl-2 text-sm font-medium text-white">{b.branch}</td>
                    <td className="py-3 text-right">
                      {(() => {
                        const c = compRow(b.branch);
                        if (!c || c.score === null) return <span className="text-xs text-zinc-600">—</span>;
                        return (
                          <span
                            title={c.components
                              .map((x) => `${x.label} ${x.weight}%: ${
                                x.value !== null ? x.value + "%"
                                : x.status === "blocked" ? `not measurable — ${x.blocked_reason}`
                                : "nothing to measure this week"}`)
                              .join("\n")}
                            className="cursor-help"
                          >
                            <span className="text-sm font-semibold text-white tabular-nums">{c.score}</span>
                            {/* A score built from three components is a different
                                claim from one built from seven, so it says which. */}
                            <span className="ml-1 text-[10px] text-zinc-500">
                              {c.measured_components}/7
                            </span>
                            {/* Weight missing because a feed stopped reads
                                differently from weight missing because the
                                week was quiet, so it is marked. */}
                            {(c.blocked_weight ?? 0) > 0 && (
                              <span className="ml-1 text-[10px] font-semibold text-amber-300">
                                −{c.blocked_weight}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
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
                    <td className="py-3 text-right text-sm font-semibold text-violet-300 tabular-nums">
                      {Math.round(b.contribution || 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-sm text-emerald-300 tabular-nums">
                      {(b.quality_high || 0).toLocaleString()}
                    </td>
                    <td
                      className={`py-3 text-right text-sm tabular-nums ${
                        b.self_fixes ? "text-emerald-300 font-semibold" : "text-zinc-600"
                      }`}
                    >
                      {b.self_fixes || "—"}
                    </td>
                    <td className="py-3 text-right text-sm text-sky-300 tabular-nums">
                      {b.blocked_count || "—"}
                    </td>
                    <td
                      className={`py-3 text-right text-sm tabular-nums pr-2 ${
                        b.false_claims ? "text-red-300 font-semibold" : "text-zinc-600"
                      }`}
                    >
                      {b.false_claims || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={T_CAPTION + " mt-4 leading-relaxed"}>
          <strong className="text-zinc-400">Score</strong> = instructions answered inside
          their SLA ÷ instructions sent. 🔴 allows 90 minutes, 🟠 allows 4 hours. Excluded
          from both sides: tasks BO never sent (that is BO’s backlog, not a manager’s
          miss) and problems the store reported itself (a branch that raises its own
          issues must not score below one that stays quiet).
          <br />
          <strong className="text-zinc-400">Help asked</strong> counts “Cannot” answers.
          It is reported, never subtracted — it is the store asking for help, and
          penalising it only stops people using it.
          <br />
          <strong className="text-zinc-400">Unverified claims</strong> are answers of
          “submitted” where the report never appeared. This is the one column that points
          at effort not actually made.
          <br />
          <strong className="text-zinc-400">Grades</strong>: A ≥ 95 · B ≥ 85 · C ≥ 70 · D below 70.
        </div>
      </div>
    </div>
  );
}
