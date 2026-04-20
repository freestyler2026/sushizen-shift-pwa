"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatingRow {
  record_date: string;
  brand: string;
  aggregator: string;
  branch: string;
  rating_score: number | null;
  review_count: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCH_ORDER = ["Paranaque", "Taft", "CK"];
const AGG_ORDER = ["FoodPanda", "GrabFood"];

const AGG_COLORS: Record<string, string> = {
  FoodPanda: "bg-pink-100 text-pink-800 border-pink-200",
  GrabFood: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const AGG_BADGE: Record<string, string> = {
  FoodPanda: "bg-pink-500",
  GrabFood: "bg-emerald-500",
};

const BRANCH_DISPLAY: Record<string, string> = {
  Paranaque: "Paranaque",
  Taft: "Taft",
  CK: "Cubao (CK)",
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 4.7) return "text-emerald-600 font-semibold";
  if (score >= 4.3) return "text-blue-600 font-semibold";
  if (score >= 4.0) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-gray-50";
  if (score >= 4.7) return "bg-emerald-50 border-emerald-200";
  if (score >= 4.3) return "bg-blue-50 border-blue-200";
  if (score >= 4.0) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function ScoreStar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-sm">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      <span className={`text-lg ${scoreColor(score)}`}>{score.toFixed(1)}</span>
      <span className="text-amber-400 text-sm">★</span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManilaAggregatorRatingsTab({
  approverName = "",
  pin = "",
}: {
  approverName?: string;
  pin?: string;
}) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load available dates ──────────────────────────────────────────────────
  const fetchDates = useCallback(async () => {
    setLoadingDates(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/admin/analytics/manila/aggregator-ratings/available-dates"
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const dates: string[] = data.dates ?? [];
      setAvailableDates(dates);
      if (dates.length > 0) {
        setSelectedDate(dates[0]); // always default to latest
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDates(false);
    }
  }, []);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  // ── Load rows for selected date ───────────────────────────────────────────
  const fetchRows = useCallback(async (date: string) => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ record_date: date });
      if (approverName) qs.set("approver_name", approverName);
      if (pin) qs.set("pin", pin);
      const res = await fetch(
        `/api/admin/analytics/manila/aggregator-ratings/by-date?${qs.toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [approverName, pin]);

  useEffect(() => {
    if (selectedDate) fetchRows(selectedDate);
  }, [selectedDate, fetchRows]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const currentIdx = availableDates.indexOf(selectedDate);
  const canGoNewer = currentIdx > 0;
  const canGoOlder = currentIdx < availableDates.length - 1;

  const goNewer = () => {
    if (canGoNewer) setSelectedDate(availableDates[currentIdx - 1]);
  };
  const goOlder = () => {
    if (canGoOlder) setSelectedDate(availableDates[currentIdx + 1]);
  };

  // ── Derive brands from rows ────────────────────────────────────────────────
  const brands = Array.from(new Set(rows.map((r) => r.brand))).sort();

  // Build lookup: brand → aggregator → branch → row
  const lookup: Record<string, Record<string, Record<string, RatingRow>>> = {};
  for (const r of rows) {
    if (!lookup[r.brand]) lookup[r.brand] = {};
    if (!lookup[r.brand][r.aggregator]) lookup[r.brand][r.aggregator] = {};
    lookup[r.brand][r.aggregator][r.branch] = r;
  }

  // ── Compute per-aggregator averages for summary cards ─────────────────────
  const aggAverages: Record<string, { avg: number; count: number }> = {};
  for (const agg of AGG_ORDER) {
    const scores = rows
      .filter((r) => r.aggregator === agg && r.rating_score !== null)
      .map((r) => r.rating_score as number);
    if (scores.length > 0) {
      aggAverages[agg] = {
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      };
    }
  }

  // Overall average
  const allScores = rows
    .filter((r) => r.rating_score !== null)
    .map((r) => r.rating_score as number);
  const overallAvg =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : null;

  // ── Format date display ───────────────────────────────────────────────────
  function fmtDate(d: string) {
    if (!d) return "";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingDates) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw className="animate-spin w-5 h-5 mr-2" />
        Loading available dates…
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No rating data found.</p>
        <p className="text-xs mt-1 text-gray-300">
          Enter ratings via the Rating Input admin panel, then return here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Date Navigation Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
        <button
          onClick={goOlder}
          disabled={!canGoOlder}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Older
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-semibold text-gray-800">
            {fmtDate(selectedDate)}
          </span>
          <span className="text-xs text-gray-400">
            {currentIdx + 1} / {availableDates.length} days
          </span>
        </div>

        <button
          onClick={goNewer}
          disabled={!canGoNewer}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Newer
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Date quick-pick */}
      <div className="flex gap-2 flex-wrap">
        {availableDates.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              d === selectedDate
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-700"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="animate-spin w-5 h-5 mr-2" />
          Loading ratings…
        </div>
      ) : (
        <>
          {/* ── Summary KPI Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                Overall Avg
              </p>
              <div className="flex items-center justify-center gap-1">
                <span
                  className={`text-3xl font-bold ${scoreColor(overallAvg)}`}
                >
                  {overallAvg !== null ? overallAvg.toFixed(2) : "—"}
                </span>
                {overallAvg !== null && (
                  <span className="text-amber-400 text-xl">★</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                All aggregators · all branches
              </p>
            </div>

            {AGG_ORDER.map((agg) => {
              const stat = aggAverages[agg];
              return (
                <div
                  key={agg}
                  className={`border rounded-xl px-5 py-4 shadow-sm text-center ${AGG_COLORS[agg] ?? "bg-white border-gray-200"}`}
                >
                  <p className="text-xs uppercase tracking-wide mb-1 opacity-70">
                    {agg}
                  </p>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`text-3xl font-bold ${scoreColor(stat?.avg ?? null)}`}>
                      {stat ? stat.avg.toFixed(2) : "—"}
                    </span>
                    {stat && (
                      <span className="text-amber-400 text-xl">★</span>
                    )}
                  </div>
                  <p className="text-xs opacity-60 mt-1">
                    {stat ? `${stat.count} branch${stat.count !== 1 ? "es" : ""}` : "No data"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ── Ratings Grid per Brand ────────────────────────────────── */}
          {rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No ratings recorded for {selectedDate}.
            </div>
          ) : (
            <div className="space-y-5">
              {brands.map((brand) => {
                const brandRows = rows.filter((r) => r.brand === brand);
                const brandScores = brandRows
                  .filter((r) => r.rating_score !== null)
                  .map((r) => r.rating_score as number);
                const brandAvg =
                  brandScores.length > 0
                    ? brandScores.reduce((a, b) => a + b, 0) / brandScores.length
                    : null;

                return (
                  <div
                    key={brand}
                    className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
                  >
                    {/* Brand header */}
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-800">{brand}</h3>
                      <div className="flex items-center gap-1">
                        <span className={`text-lg font-bold ${scoreColor(brandAvg)}`}>
                          {brandAvg !== null ? brandAvg.toFixed(2) : "—"}
                        </span>
                        {brandAvg !== null && (
                          <span className="text-amber-400">★</span>
                        )}
                        <span className="text-xs text-gray-400 ml-1">avg</span>
                      </div>
                    </div>

                    {/* Grid: aggregator rows × branch cols */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium w-32">
                              Aggregator
                            </th>
                            {BRANCH_ORDER.map((b) => (
                              <th
                                key={b}
                                className="text-center px-4 py-2.5 text-xs text-gray-500 font-medium"
                              >
                                {BRANCH_DISPLAY[b] ?? b}
                              </th>
                            ))}
                            <th className="text-center px-4 py-2.5 text-xs text-gray-400 font-medium">
                              Avg
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {AGG_ORDER.map((agg, aggIdx) => {
                            const aggRows = brandRows.filter(
                              (r) => r.aggregator === agg
                            );
                            if (aggRows.length === 0) return null;

                            const aggScores = aggRows
                              .filter((r) => r.rating_score !== null)
                              .map((r) => r.rating_score as number);
                            const aggAvg =
                              aggScores.length > 0
                                ? aggScores.reduce((a, b) => a + b, 0) /
                                  aggScores.length
                                : null;

                            return (
                              <tr
                                key={agg}
                                className={
                                  aggIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                                }
                              >
                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${AGG_COLORS[agg] ?? ""}`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${AGG_BADGE[agg] ?? "bg-gray-400"}`}
                                    />
                                    {agg}
                                  </span>
                                </td>
                                {BRANCH_ORDER.map((branch) => {
                                  const cell =
                                    lookup[brand]?.[agg]?.[branch] ?? null;
                                  const score = cell?.rating_score ?? null;
                                  const review = cell?.review_count ?? "";
                                  return (
                                    <td key={branch} className="px-4 py-3">
                                      <div
                                        className={`rounded-lg border px-3 py-2 text-center ${scoreBg(score)}`}
                                      >
                                        <ScoreStar score={score} />
                                        {review && (
                                          <p className="text-xs text-gray-400 mt-0.5">
                                            {review} reviews
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`text-base font-bold ${scoreColor(aggAvg)}`}
                                  >
                                    {aggAvg !== null ? aggAvg.toFixed(2) : "—"}
                                  </span>
                                  {aggAvg !== null && (
                                    <span className="text-amber-400 text-sm ml-0.5">
                                      ★
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
