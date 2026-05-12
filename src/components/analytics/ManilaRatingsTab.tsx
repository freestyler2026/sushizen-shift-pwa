"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_BODY, T_SECTION } from "@/lib/ui-tokens";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken)
    ) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(detail || text || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

const MANILA_AGGREGATORS = ["foodpanda", "grab"] as const;
const MANILA_BRANCHES = ["CK", "Taft", "Paranaque"] as const;

const AGG_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  foodpanda: { bg: "bg-pink-950/40", border: "border-pink-800/40", text: "text-pink-300" },
  grab: { bg: "bg-emerald-950/40", border: "border-emerald-800/40", text: "text-emerald-300" },
};

const RATING_COLOR: Record<number, string> = {
  1: "text-rose-400",
  2: "text-amber-400",
  3: "text-yellow-300",
};

type LowRatingRow = {
  id: number;
  order_date?: string;
  aggregator: string;
  branch: string;
  brand?: string;
  order_id?: string;
  ordered_items?: string;
  amount?: number | null;
  rating: number;
  customer_review?: string;
  issue_category?: string;
  pic?: string;
  date_updated?: string;
};

type LowRatingSummary = Record<string, Record<string, Record<string, number>>>;

type TrendRow = { month: string; aggregator: string; rating: number; count: number };

export function ManilaRatingsTab({
  dateFrom,
  dateTo,
  approverName,
  pin,
  stepUpReady,
}: {
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
}) {
  const [rows, setRows] = useState<LowRatingRow[]>([]);
  const [summary, setSummary] = useState<LowRatingSummary>({});
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [filterAgg, setFilterAgg] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [searchText, setSearchText] = useState("");
  const [reviewModalText, setReviewModalText] = useState<string | null>(null);

  const baseQs = useMemo(() => {
    const qs = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
    });
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    return qs;
  }, [approverName, pin, dateFrom, dateTo]);

  const load = useCallback(async () => {
    if (!approverName.trim() || !pin.trim() || !stepUpReady) {
      setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const listQs = new URLSearchParams(baseQs);
      if (filterAgg) listQs.set("aggregator", filterAgg);
      if (filterBranch) listQs.set("branch", filterBranch);
      if (filterRating) listQs.set("rating", filterRating);
      listQs.set("limit", String(PAGE_SIZE));
      listQs.set("offset", String((page - 1) * PAGE_SIZE));

      const summaryQs = new URLSearchParams(baseQs);
      const trendQs = new URLSearchParams(baseQs);
      if (filterAgg) trendQs.set("aggregator", filterAgg);
      if (filterBranch) trendQs.set("branch", filterBranch);

      const [listRes, summaryRes, trendRes] = await Promise.all([
        apiGet<{ rows: LowRatingRow[]; total: number }>(`/api/admin/analytics/manila/low-ratings?${listQs.toString()}`),
        apiGet<{ summary: LowRatingSummary }>(`/api/admin/analytics/manila/low-ratings/summary?${summaryQs.toString()}`),
        apiGet<{ rows: TrendRow[] }>(`/api/admin/analytics/manila/low-ratings/trend?${trendQs.toString()}`),
      ]);

      setRows(listRes.rows || []);
      setTotal(Number(listRes.total) || 0);
      setSummary(summaryRes.summary || {});
      setTrend(trendRes.rows || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load ratings");
    } finally {
      setLoading(false);
    }
  }, [baseQs, filterAgg, filterBranch, filterRating, page, approverName, pin, stepUpReady]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filterAgg, filterBranch, filterRating, dateFrom, dateTo]);

  const totalCount = useMemo(
    () =>
      Object.values(summary).reduce(
        (a, branches) =>
          a +
          Object.values(branches).reduce(
            (b, ratings) => b + Object.values(ratings).reduce((c, n) => c + n, 0),
            0,
          ),
        0,
      ),
    [summary],
  );

  const byAgg = useMemo(
    () =>
      MANILA_AGGREGATORS.map((agg) => ({
        agg,
        count: Object.values(summary[agg] || {}).reduce(
          (a, ratings) => a + Object.values(ratings).reduce((b, n) => b + n, 0),
          0,
        ),
      })),
    [summary],
  );

  const byRating = useMemo(
    () =>
      [1, 2, 3].map((r) => ({
        rating: r,
        count: Object.values(summary).reduce(
          (a, branches) =>
            a + Object.values(branches).reduce((b, ratings) => b + (ratings[String(r)] || 0), 0),
          0,
        ),
      })),
    [summary],
  );

  const filtered = useMemo(() => {
    if (!searchText.trim()) return rows;
    const q = searchText.toLowerCase();
    return rows.filter((r) =>
      [r.ordered_items, r.customer_review, r.order_id, r.branch].some((f) =>
        String(f || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, searchText]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!stepUpReady) {
    return (
      <div className={`${GLASS_CARD} p-6`}>
        <p className={T_BODY}>Complete Security verification (MFA / PIN step-up) above to load Manila low ratings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="sales-manila-low-ratings">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Total Low Ratings</p>
          <p className="mt-1 text-2xl font-bold text-white">{totalCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-neutral-500">Manila · Foodpanda + Grab</p>
        </div>
        {byAgg.map(({ agg, count }) => {
          const c = AGG_COLOR[agg] || AGG_COLOR.foodpanda;
          return (
            <div key={agg} className={`rounded-2xl border ${c.border} ${c.bg} p-4`}>
              <p className={`text-xs uppercase tracking-wider ${c.text}`}>
                {agg === "foodpanda" ? "Foodpanda" : "Grab"}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{count.toLocaleString()}</p>
              <p className="mt-1 text-xs text-neutral-500">Low ratings</p>
            </div>
          );
        })}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500">By score</p>
          <div className="mt-2 space-y-1">
            {byRating.map(({ rating, count }) => (
              <div key={rating} className="flex items-center justify-between">
                <span className={`text-xs font-medium ${RATING_COLOR[rating] || "text-neutral-400"}`}>
                  {"⭐".repeat(rating)} {rating}
                </span>
                <span className="text-sm font-bold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${GLASS_CARD} p-4`}>
        <h3 className={`${T_SECTION} mb-3`}>Branch × aggregator</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="pb-2 pr-4 text-left font-medium text-neutral-500">Branch</th>
                {MANILA_AGGREGATORS.map((agg) => (
                  <th key={agg} className="px-3 pb-2 text-center font-medium text-neutral-500">
                    {agg === "foodpanda" ? "Foodpanda" : "Grab"}
                  </th>
                ))}
                <th className="px-3 pb-2 text-center font-medium text-neutral-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {MANILA_BRANCHES.map((branch) => {
                const branchTotal = MANILA_AGGREGATORS.reduce(
                  (a, agg) =>
                    a + Object.values(summary[agg]?.[branch] || {}).reduce((b, n) => b + n, 0),
                  0,
                );
                return (
                  <tr key={branch} className="border-t border-neutral-800/40">
                    <td className="py-2 pr-4 font-medium text-neutral-300">{branch}</td>
                    {MANILA_AGGREGATORS.map((agg) => {
                      const cnt = Object.values(summary[agg]?.[branch] || {}).reduce((a, n) => a + n, 0);
                      const pct = totalCount > 0 ? cnt / totalCount : 0;
                      return (
                        <td key={agg} className="px-3 py-2 text-center">
                          <span
                            className="inline-block rounded px-2 py-0.5 text-sm font-medium"
                            style={{
                              background: cnt > 0 ? `rgba(244,114,182,${0.1 + pct * 2})` : "transparent",
                              color: cnt > 0 ? "#fff" : "#525252",
                            }}
                          >
                            {cnt || "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-sm font-bold text-white">{branchTotal || "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-neutral-700">
                <td className="py-2 pr-4 text-xs font-medium text-neutral-500">Total</td>
                {MANILA_AGGREGATORS.map((agg) => {
                  const cnt = byAgg.find((a) => a.agg === agg)?.count || 0;
                  return (
                    <td key={agg} className="px-3 py-2 text-center text-sm font-bold text-white">
                      {cnt}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center text-sm font-bold text-white">{totalCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {trend.length > 0 ? (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Monthly trend</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="pb-2 pr-3 text-left text-neutral-500">Month</th>
                  <th className="pb-2 pr-3 text-left text-neutral-500">Aggregator</th>
                  <th className="pb-2 pr-3 text-left text-neutral-500">Rating</th>
                  <th className="pb-2 text-right text-neutral-500">Count</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t, i) => (
                  <tr key={`${t.month}-${t.aggregator}-${t.rating}-${i}`} className="border-t border-neutral-800/40">
                    <td className="py-1.5 pr-3 text-neutral-300">{t.month}</td>
                    <td className="py-1.5 pr-3 text-neutral-400">{t.aggregator}</td>
                    <td className="py-1.5 pr-3">{t.rating}</td>
                    <td className="py-1.5 text-right text-neutral-200">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select
          value={filterAgg}
          onChange={(e) => setFilterAgg(e.target.value)}
          className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200"
        >
          <option value="">All aggregators</option>
          <option value="foodpanda">Foodpanda</option>
          <option value="grab">Grab</option>
        </select>
        <select
          value={filterBranch}
          onChange={(e) => setFilterBranch(e.target.value)}
          className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200"
        >
          <option value="">All branches</option>
          {MANILA_BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={filterRating}
          onChange={(e) => setFilterRating(e.target.value)}
          className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200"
        >
          <option value="">All ratings</option>
          <option value="1">1★</option>
          <option value="2">2★</option>
          <option value="3">3★</option>
        </select>
        <input
          type="text"
          placeholder="Search review / items / order ID…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="min-w-[200px] flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200"
        />
        <button type="button" onClick={() => void load()} className={SECONDARY_BUTTON + " text-sm"} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/20">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <span className="text-sm font-medium text-neutral-300">
            Records
            <span className="ml-2 text-xs text-neutral-500">
              {loading ? "Loading…" : `${total.toLocaleString()} total`}
            </span>
          </span>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800 disabled:opacity-40"
            >
              ‹
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-950/60">
              <tr>
                {["Date", "Aggregator", "Branch", "Rating", "Items", "Review", "Amount", "PIC"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-neutral-600">
                    No records found
                  </td>
                </tr>
              ) : null}
              {filtered.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-t border-neutral-800/40 ${i % 2 === 0 ? "" : "bg-neutral-950/20"}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{row.order_date || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`font-medium ${
                        String(row.aggregator).toLowerCase().includes("food") ? "text-pink-400" : "text-emerald-400"
                      }`}
                    >
                      {String(row.aggregator).toLowerCase().includes("food") ? "Foodpanda" : "Grab"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{row.branch}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`font-bold ${RATING_COLOR[row.rating] || "text-neutral-400"}`}>
                      {"⭐".repeat(row.rating)} {row.rating}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-neutral-400" title={row.ordered_items}>
                    {row.ordered_items || "—"}
                  </td>
                  <td
                    className="max-w-[260px] px-3 py-2 text-neutral-300 cursor-pointer hover:text-violet-300 transition-colors"
                    title="Click to read full review"
                    onClick={() => {
                      const t = String(row.customer_review || "").trim();
                      if (t) setReviewModalText(t);
                    }}
                  >
                    {row.customer_review ? <span className="line-clamp-2">{row.customer_review}</span> : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-400">
                    {row.amount != null ? `₱${Number(row.amount).toLocaleString()}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{row.pic || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reviewModalText !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setReviewModalText(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-200">Customer Review</h3>
              <button
                type="button"
                onClick={() => setReviewModalText(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-neutral-100 whitespace-pre-wrap break-words">
              {reviewModalText}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
