"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  INPUT_CLASS,
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

interface Person {
  branch: string;
  name: string;
  scored: number;
  good: number;
  bad: number;
  avg_score: number | null;
  bad_pct: number | null;
  branch_median_pct: number | null;
  /** Negative is better than the branch median. Null when there is too little data. */
  delta_pct: number | null;
  enough_data: boolean;
  credits: number;
  self_fixes: number;
  sla_responses: number;
  reports_filed: number;
}

interface PeopleExclusion {
  city: string;
  staff_name: string;
  reason: string;
  excluded_by: string;
  excluded_at: string;
}

interface PeopleResult {
  city: string;
  days: number;
  from: string;
  to: string;
  min_scored: number;
  people: Person[];
  /** Who is hidden from this list. Named, so the page is not just short. */
  excluded?: PeopleExclusion[];
}

type SortKey = "credits" | "delta" | "volume";

export default function PeoplePage() {
  const router = useRouter();
  const [city, setCity] = useState("manila");
  const [data, setData] = useState<PeopleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("credits");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fmanagement%2Fpeople");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/management/people?city=${city}&days=30`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    load();
  }, [load]);

  const people = data?.people ?? [];
  const excluded = data?.excluded ?? [];
  // HQ only, matching the backend. Hiding the control for everyone else is a
  // convenience, not the guard -- the endpoint refuses regardless.
  //
  // Read after mount, never during the first render: this page is prerendered
  // and served from the edge cache, where there is no localStorage, so deciding
  // anything from getAuth() on render disagrees with the server's HTML and
  // trips React #418.
  const [isHQ, setIsHQ] = useState(false);
  useEffect(() => {
    setIsHQ(String(getAuth()?.role || "").toUpperCase() === "HQ");
  }, []);
  const [busyName, setBusyName] = useState("");
  const [actionError, setActionError] = useState("");

  async function hidePerson(name: string) {
    if (!window.confirm(
      `Hide "${name}" from this page?\n\n` +
      "Their QC scores are kept — this only removes the row, and any HQ member " +
      "can put it back from the list at the bottom of this page.")) return;
    setBusyName(name); setActionError("");
    try {
      const res = await fetch("/api/admin/management/people/exclusions", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city, staff_name: name, reason: "" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `Failed (${res.status})`);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally { setBusyName(""); }
  }

  async function restorePerson(name: string) {
    setBusyName(name); setActionError("");
    try {
      const res = await fetch(
        `/api/admin/management/people/exclusions?city=${encodeURIComponent(city)}` +
        `&staff_name=${encodeURIComponent(name)}`,
        { method: "DELETE", headers: getAuthHeaders(getAuth()) });
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `Failed (${res.status})`);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally { setBusyName(""); }
  }
  const branches = useMemo(
    () => Array.from(new Set(people.map((p) => p.branch).filter(Boolean))).sort(),
    [people],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = people.filter(
      (p) =>
        (branchFilter === "all" || p.branch === branchFilter) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
    const sorted = [...rows];
    if (sort === "credits") sorted.sort((a, b) => b.credits - a.credits);
    if (sort === "volume") sorted.sort((a, b) => b.scored - a.scored);
    if (sort === "delta")
      sorted.sort((a, b) => {
        // Unranked people sit at the bottom rather than at the "best" end.
        if (a.delta_pct === null) return 1;
        if (b.delta_pct === null) return -1;
        return a.delta_pct - b.delta_pct;
      });
    return sorted;
  }, [people, branchFilter, query, sort]);

  const ranked = people.filter((p) => p.delta_pct !== null);
  const totalCredits = people.reduce((a, p) => a + p.credits, 0);
  const totalSelfFixes = people.reduce((a, p) => a + p.self_fixes, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <MgmtChannelTabBar active="people" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>People</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            Last 30 days. Two separate things:{" "}
            <strong className="text-zinc-200">contribution</strong> — how much of the work
            this person did — and{" "}
            <strong className="text-zinc-200">quality vs their own branch</strong>. They
            are kept apart on purpose, because the people who do the most also collect the
            most mistakes.
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

      <div className="rounded-2xl border border-sky-500/25 bg-sky-500/8 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-sky-100/90 leading-relaxed space-y-1.5">
          <div>
            <strong>Quality is compared within a branch only.</strong> Manila’s median bad
            rate is 7.8% and Dubai’s is 3.4% — whether that is a real quality gap or a
            difference in how photos are taken and scored is not knowable from this data,
            so a cross-city ranking would just mark one city’s staff down for their city.
          </div>
          <div>
            <strong>Before using this for anything personal:</strong> the name here is
            whoever posted the QC photo, which is not guaranteed to be whoever made the
            product. Confirm that holds at the branch first.
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-start gap-2">
          <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Could not load: {error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>People</div>
          <div className={KPI_VALUE}>{people.length}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Enough data to rank</div>
          <div className={KPI_VALUE}>{ranked.length}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Contribution</div>
          <div className={KPI_VALUE}>{Math.round(totalCredits).toLocaleString()}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Found &amp; fixed themselves</div>
          <div className={KPI_VALUE + (totalSelfFixes ? " text-emerald-300" : "")}>
            {totalSelfFixes}
          </div>
        </div>
      </div>

      <div className={GLASS_CARD + " p-4 space-y-4"}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <SelectDark
              value={branchFilter}
              onChange={setBranchFilter}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((b) => ({ value: b, label: b })),
              ]}
            />
          </div>
          <div className="w-52">
            <SelectDark
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={[
                { value: "credits", label: "Sort: contribution" },
                { value: "delta", label: "Sort: quality vs branch" },
                { value: "volume", label: "Sort: items scored" },
              ]}
            />
          </div>
          <input
            className={INPUT_CLASS + " max-w-xs"}
            placeholder="Search name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className={T_CAPTION + " py-10 text-center"}>Loading…</div>
        ) : visible.length === 0 ? (
          <div className={T_BODY + " py-10 text-center"}>Nobody matches this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-left">
                  <th className={TABLE_HEADER + " pl-2"}>Branch</th>
                  <th className={TABLE_HEADER}>Name</th>
                  <th className={TABLE_HEADER + " text-right"}>Contribution</th>
                  <th className={TABLE_HEADER + " text-right"}>Items scored</th>
                  <th className={TABLE_HEADER + " text-right"}>A / S</th>
                  <th className={TABLE_HEADER + " text-right"}>Bad %</th>
                  <th className={TABLE_HEADER + " text-right"}>vs branch</th>
                  <th className={TABLE_HEADER + " text-right"}>Self-fixes</th>
                  <th className={TABLE_HEADER + " text-right pr-2"}>Replies</th>
                  {isHQ && <th className={TABLE_HEADER + " text-right pr-2"} />}
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => {
                  const better = p.delta_pct !== null && p.delta_pct < 0;
                  const worse = p.delta_pct !== null && p.delta_pct > 2;
                  return (
                    <tr key={`${p.branch}-${p.name}-${i}`} className={TABLE_ROW}>
                      <td className="py-2.5 pl-2 text-xs text-zinc-500">{p.branch || "—"}</td>
                      <td className="py-2.5 text-sm text-zinc-100">{p.name}</td>
                      <td className="py-2.5 text-right text-sm font-semibold text-violet-300 tabular-nums">
                        {p.credits.toFixed(0)}
                      </td>
                      <td className="py-2.5 text-right text-sm text-zinc-300 tabular-nums">
                        {p.scored.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-sm text-emerald-300 tabular-nums">
                        {p.good.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-sm text-zinc-400 tabular-nums">
                        {p.bad_pct !== null ? `${p.bad_pct}%` : "—"}
                      </td>
                      <td className="py-2.5 text-right text-sm tabular-nums">
                        {p.delta_pct === null ? (
                          <span
                            className={T_CAPTION}
                            title={`Fewer than ${data?.min_scored ?? 30} scored items — not enough to rank`}
                          >
                            not ranked
                          </span>
                        ) : (
                          <span
                            className={
                              better
                                ? "text-emerald-300 font-semibold"
                                : worse
                                ? "text-amber-300 font-semibold"
                                : "text-zinc-400"
                            }
                          >
                            {p.delta_pct > 0 ? "+" : ""}
                            {p.delta_pct.toFixed(1)}pt
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 text-right text-sm tabular-nums ${
                          p.self_fixes ? "text-emerald-300 font-semibold" : "text-zinc-600"
                        }`}
                      >
                        {p.self_fixes || "—"}
                      </td>
                      <td className="py-2.5 text-right text-sm text-zinc-400 tabular-nums pr-2">
                        {p.sla_responses || "—"}
                      </td>
                      {isHQ && (
                        <td className="py-2.5 pr-2 text-right">
                          <button
                            type="button"
                            onClick={() => void hidePerson(p.name)}
                            disabled={busyName === p.name}
                            title={`Hide ${p.name} from this page (reversible)`}
                            className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50"
                          >
                            {busyName === p.name ? "…" : "Hide"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {actionError}
          </div>
        )}

        {/* The undo, on the page, always visible -- not only to whoever pressed
            Hide. A hidden name that cannot be found again is a deletion with
            extra steps. */}
        {excluded.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className={T_CAPTION}>
              Hidden from this page ({excluded.length}) — their QC scores are kept. They
              are left out of the branch median too, so an HQ or test account no longer
              moves the comparison everyone else is measured against.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {excluded.map((e) => (
                <span
                  key={e.staff_name}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300"
                  title={`Hidden by ${e.excluded_by} on ${e.excluded_at.slice(0, 10)}${e.reason ? ` — ${e.reason}` : ""}`}
                >
                  {e.staff_name}
                  {isHQ && (
                    <button
                      type="button"
                      onClick={() => void restorePerson(e.staff_name)}
                      disabled={busyName === e.staff_name}
                      className="font-semibold text-violet-300 underline underline-offset-2 hover:text-violet-200 disabled:opacity-50"
                    >
                      {busyName === e.staff_name ? "…" : "Restore"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={T_CAPTION + " leading-relaxed"}>
          <strong className="text-zinc-400">Contribution</strong> = reports filed, A/S
          product scores, replies inside SLA, problems found and fixed by the store, and QC
          photos submitted. It is a measure of how much work this person did, not how well.
          <br />
          <strong className="text-zinc-400">vs branch</strong> = this person’s bad rate
          minus their branch’s median. Negative is better than their peers. Anyone with
          fewer than {data?.min_scored ?? 30} scored items is shown but not ranked —
          judging someone on a handful of items is worse than not judging them.
        </div>
      </div>
    </div>
  );
}
