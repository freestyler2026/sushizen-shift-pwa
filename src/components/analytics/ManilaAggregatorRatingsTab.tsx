"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  TABLE_HEADER,
  TABLE_ROW,
  SMALL_BUTTON,
} from "@/lib/ui-tokens";

// ─── API helper ───────────────────────────────────────────────────────────────

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

async function apiGet<T>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

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

const BRANCH_DISPLAY: Record<string, string> = {
  Paranaque: "Paranaque",
  Taft: "Taft",
  CK: "Cubao (CK)",
};

const AGG_COLOR: Record<string, { dot: string; badge: string; text: string }> = {
  FoodPanda: { dot: "bg-pink-400", badge: "bg-pink-500/15 border-pink-500/25 text-pink-300", text: "text-pink-300" },
  GrabFood:  { dot: "bg-emerald-400", badge: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300", text: "text-emerald-300" },
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-zinc-600";
  if (score >= 4.7) return "text-emerald-400";
  if (score >= 4.3) return "text-violet-400";
  if (score >= 4.0) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-white/3 border-white/8";
  if (score >= 4.7) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 4.3) return "bg-violet-500/10 border-violet-500/20";
  if (score >= 4.0) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManilaAggregatorRatingsTab({
  approverName = "",
  pin = "",
  stepUpReady = false,
}: {
  approverName?: string;
  pin?: string;
  stepUpReady?: boolean;
}) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  // ── Load available dates (no auth required) ───────────────────────────────
  const fetchDates = useCallback(async () => {
    setLoadingDates(true);
    setError(null);
    try {
      const data = await apiGet<{ dates: string[] }>(
        "/api/admin/analytics/manila/aggregator-ratings/available-dates"
      );
      const dates = data.dates ?? [];
      setAvailableDates(dates);
      if (dates.length > 0) setSelectedDate(dates[0]);
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
  const fetchRows = useCallback(
    async (date: string) => {
      if (!date || !canLoad) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          record_date: date,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        const data = await apiGet<{ rows: RatingRow[] }>(
          `/api/admin/analytics/manila/aggregator-ratings/by-date?${qs}`
        );
        setRows(data.rows ?? []);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin, canLoad]
  );

  useEffect(() => {
    if (selectedDate && canLoad) fetchRows(selectedDate);
    else if (!canLoad) setRows([]);
  }, [selectedDate, canLoad, fetchRows]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const currentIdx = availableDates.indexOf(selectedDate);
  const canGoNewer = currentIdx > 0;
  const canGoOlder = currentIdx < availableDates.length - 1;

  // ── Derived data ──────────────────────────────────────────────────────────
  const brands = Array.from(new Set(rows.map((r) => r.brand))).sort();

  const lookup: Record<string, Record<string, Record<string, RatingRow>>> = {};
  for (const r of rows) {
    if (!lookup[r.brand]) lookup[r.brand] = {};
    if (!lookup[r.brand][r.aggregator]) lookup[r.brand][r.aggregator] = {};
    lookup[r.brand][r.aggregator][r.branch] = r;
  }

  const aggStats: Record<string, { avg: number; count: number }> = {};
  for (const agg of AGG_ORDER) {
    const scores = rows.filter((r) => r.aggregator === agg && r.rating_score !== null).map((r) => r.rating_score as number);
    if (scores.length > 0)
      aggStats[agg] = { avg: scores.reduce((a, b) => a + b, 0) / scores.length, count: scores.length };
  }
  const allScores = rows.filter((r) => r.rating_score !== null).map((r) => r.rating_score as number);
  const overallAvg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;

  function fmtDate(d: string) {
    if (!d) return "";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
    } catch { return d; }
  }

  // ── Not verified ──────────────────────────────────────────────────────────
  if (!stepUpReady || !approverName.trim() || !pin.trim()) {
    return (
      <div className={`${GLASS_CARD} p-6`}>
        <p className={T_BODY}>
          Complete Security verification (MFA / PIN step-up) above to load Manila ratings.
        </p>
      </div>
    );
  }

  // ── Loading dates ─────────────────────────────────────────────────────────
  if (loadingDates) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-zinc-500">
        <RefreshCw className="animate-spin w-4 h-4" />
        <span className="text-sm">Loading available dates…</span>
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <div className={`${GLASS_CARD} p-8 text-center`}>
        <p className={T_BODY}>No rating data found.</p>
        <p className="text-xs text-zinc-600 mt-1">Enter ratings via the Rating Input admin panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Date Navigation ──────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} flex items-center justify-between px-5 py-3`}>
        <button
          onClick={() => canGoOlder && setSelectedDate(availableDates[currentIdx + 1])}
          disabled={!canGoOlder}
          className={`${SMALL_BUTTON} flex items-center gap-1`}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Older
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-white">{fmtDate(selectedDate)}</p>
          <p className={`${T_CAPTION} mt-0.5`}>{currentIdx + 1} / {availableDates.length} days</p>
        </div>

        <button
          onClick={() => canGoNewer && setSelectedDate(availableDates[currentIdx - 1])}
          disabled={!canGoNewer}
          className={`${SMALL_BUTTON} flex items-center gap-1`}
        >
          Newer <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Date chips */}
      <div className="flex gap-2 flex-wrap">
        {availableDates.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              d === selectedDate
                ? "bg-violet-500/25 border-violet-500/50 text-violet-300"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-400/30 hover:text-violet-300"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-zinc-500">
          <RefreshCw className="animate-spin w-4 h-4" />
          <span className="text-sm">Loading ratings…</span>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`${KPI_CARD} text-center`}>
              <p className={KPI_LABEL}>Overall Avg</p>
              <div className="mt-2 flex items-center justify-center gap-1">
                <span className={`text-3xl font-bold tabular-nums ${scoreColor(overallAvg)}`}>
                  {overallAvg !== null ? overallAvg.toFixed(2) : "—"}
                </span>
                {overallAvg !== null && <span className="text-amber-400 text-xl">★</span>}
              </div>
              <p className={`${T_CAPTION} mt-1`}>All aggregators · all branches</p>
            </div>

            {AGG_ORDER.map((agg) => {
              const c = AGG_COLOR[agg];
              const stat = aggStats[agg];
              return (
                <div key={agg} className={`${KPI_CARD} text-center`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${c.text}`}>{agg}</p>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <span className={`text-3xl font-bold tabular-nums ${scoreColor(stat?.avg ?? null)}`}>
                      {stat ? stat.avg.toFixed(2) : "—"}
                    </span>
                    {stat && <span className="text-amber-400 text-xl">★</span>}
                  </div>
                  <p className={`${T_CAPTION} mt-1`}>
                    {stat ? `${stat.count} branch${stat.count !== 1 ? "es" : ""}` : "No data"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ── Per-Brand Rating Grid ───────────────────────────────────── */}
          {rows.length === 0 ? (
            <div className={`${GLASS_CARD} py-10 text-center`}>
              <p className={T_BODY}>No ratings recorded for {selectedDate}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {brands.map((brand) => {
                const brandRows = rows.filter((r) => r.brand === brand);
                const brandScores = brandRows.filter((r) => r.rating_score !== null).map((r) => r.rating_score as number);
                const brandAvg = brandScores.length > 0 ? brandScores.reduce((a, b) => a + b, 0) / brandScores.length : null;

                return (
                  <div key={brand} className={`${GLASS_CARD} overflow-hidden`}>
                    {/* Brand header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                      <h3 className={T_SECTION}>{brand}</h3>
                      <div className="flex items-center gap-1">
                        <span className={`text-xl font-bold tabular-nums ${scoreColor(brandAvg)}`}>
                          {brandAvg !== null ? brandAvg.toFixed(2) : "—"}
                        </span>
                        {brandAvg !== null && <span className="text-amber-400">★</span>}
                        <span className={`${T_CAPTION} ml-1`}>avg</span>
                      </div>
                    </div>

                    {/* Grid */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className={`${TABLE_HEADER} text-left px-5 py-2.5 w-36`}>Aggregator</th>
                            {BRANCH_ORDER.map((b) => (
                              <th key={b} className={`${TABLE_HEADER} text-center px-4 py-2.5`}>
                                {BRANCH_DISPLAY[b] ?? b}
                              </th>
                            ))}
                            <th className={`${TABLE_HEADER} text-center px-4 py-2.5`}>Avg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {AGG_ORDER.map((agg) => {
                            const aggRows = brandRows.filter((r) => r.aggregator === agg);
                            if (aggRows.length === 0) return null;
                            const c = AGG_COLOR[agg];
                            const aggScores = aggRows.filter((r) => r.rating_score !== null).map((r) => r.rating_score as number);
                            const aggAvg = aggScores.length > 0 ? aggScores.reduce((a, b) => a + b, 0) / aggScores.length : null;

                            return (
                              <tr key={agg} className={TABLE_ROW}>
                                <td className="px-5 py-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                    {agg}
                                  </span>
                                </td>
                                {BRANCH_ORDER.map((branch) => {
                                  const cell = lookup[brand]?.[agg]?.[branch] ?? null;
                                  const score = cell?.rating_score ?? null;
                                  const review = cell?.review_count ?? "";
                                  return (
                                    <td key={branch} className="px-4 py-3">
                                      <div className={`rounded-xl border px-3 py-2 text-center ${scoreBg(score)}`}>
                                        <div className="flex items-center justify-center gap-0.5">
                                          <span className={`text-lg font-bold tabular-nums ${scoreColor(score)}`}>
                                            {score !== null ? score.toFixed(1) : "—"}
                                          </span>
                                          {score !== null && <span className="text-amber-400 text-sm">★</span>}
                                        </div>
                                        {review && (
                                          <p className={`${T_CAPTION} mt-0.5`}>{review} reviews</p>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-base font-bold tabular-nums ${scoreColor(aggAvg)}`}>
                                    {aggAvg !== null ? aggAvg.toFixed(2) : "—"}
                                  </span>
                                  {aggAvg !== null && <span className="text-amber-400 text-sm ml-0.5">★</span>}
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
