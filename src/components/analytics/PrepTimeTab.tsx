"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { GLASS_CARD } from "@/lib/ui-tokens";
import { getAuthHeaders } from "@/lib/auth";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...getAuthHeaders(), "Content-Type": "application/json", ...(opts.headers as Record<string, string> || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text ? JSON.parse(text) : {};
}

interface PrepTimeRecord {
  id: number;
  city: string;
  branch_code: string;
  store_code: string;
  author_name: string;
  work_date: string;
  aggregator: string | null;
  order_no: string | null;
  ordered_at_str: string | null;
  ready_by_str: string | null;
  prep_minutes: number;
  prep_score: number;
  prep_grade: string;
  status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  ocr_confidence: string | null;
  created_at: string;
}

interface PrepTimeStat {
  city: string;
  branch_code: string;
  store_code: string;
  total_count: number;
  avg_minutes: number;
  min_minutes: number;
  max_minutes: number;
  avg_score: number;
  count_s: number;
  count_a: number;
  count_b: number;
  count_slow: number;
}

interface HourlyRow {
  work_date: string;
  hour_of_day: number;
  order_count: number;
  avg_prep_min: number;
  slow_count: number;
  fast_count: number;
}

interface Props {
  approverName: string;
  pin: string;
  isHQOrAdmin: boolean;
}

function gradeColor(grade: string) {
  if (grade === "S") return "text-emerald-400";
  if (grade === "A") return "text-green-400";
  if (grade === "B") return "text-yellow-300";
  if (grade === "C") return "text-orange-400";
  if (grade === "D") return "text-red-400";
  return "text-red-600";
}

function scoreBar(score: number) {
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 80 ? "bg-green-500" :
    pct >= 70 ? "bg-yellow-400" :
    pct >= 60 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${gradeColor(pct >= 90 ? "S" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : "D")}`}>
        {score}
      </span>
    </div>
  );
}

function prepMinColor(avg: number) {
  if (avg <= 10) return "text-emerald-400 bg-emerald-500/10";
  if (avg <= 20) return "text-green-400 bg-green-500/10";
  if (avg <= 25) return "text-yellow-300 bg-yellow-500/10";
  if (avg <= 35) return "text-orange-400 bg-orange-500/10";
  return "text-red-400 bg-red-500/10";
}

// Local calendar date, not UTC. toISOString() shifts to UTC, so for anyone east
// of it "today" became yesterday for part of the morning and that day's records
// fell outside the range.
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const today = () => ymd(new Date());

/** Days of context the tab always opens with, even at the start of a month. */
const MIN_DEFAULT_DAYS = 14;

/**
 * Month to date — but never a window so short there is nothing to look at.
 *
 * The range used to be exactly the 1st through today, so on the 1st of every
 * month the tab opened showing a single day. Early on that day most stores have
 * not recorded anything yet, and because the store selector is built from the
 * loaded rows, those stores vanished from the dropdown entirely — which reads
 * as "Taft is gone" rather than "nothing yet this morning".
 */
const defaultFrom = () => {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const floor = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (MIN_DEFAULT_DAYS - 1));
  return ymd(first < floor ? first : floor);
};

/** Wide window used only to populate the store list, so it never loses a store. */
const optionsFrom = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 89));
};

/**
 * ordered_at_str is whatever OCR read off the aggregator screenshot, and the shape
 * varies by platform. Across the 46 distinct formats in prep_time_records it is
 * sometimes a bare 12-hour time ("7:59 PM"), often a full datetime
 * ("2024/07/11 07:13:51 PM", "24/07/2025 19:52"), and occasionally garbled
 * ("07:04 2025 20:00" — a broken date followed by the real 20:00 order time).
 *
 * Anchoring to the FIRST time in the string got both of those wrong: a leading date
 * meant no match at all, so 1,406 of Dubai's 4,461 records (32%) were dropped from
 * this chart entirely, and "07:04 2025 20:00" was read as an 07:00 order when the
 * store was shut — that single row is the phantom Cubao 07:00 bar.
 *
 * Reading the LAST time instead handles all of them: a date always precedes its
 * time, and the trailing token is the real order time in the garbled case. Only two
 * records in the table stay unparseable, both genuine entry errors
 * ("10:02 18 PM", "1 pm for Mar, Juncton Co").
 */
function parseOrderHour(raw: string): number | null {
  // Lazy prefix + a tail that admits no digits or colons, so the capture lands on
  // the last clock time — with the meridiem that belongs to it, not one from a
  // different token earlier in the string.
  const m = /^.*?(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?[^0-9:]*$/.exec(raw);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (Number.isNaN(h)) return null;
  const mer = (m[3] || "").toLowerCase();
  // An hour above 12 is already 24-hour form; a stray "PM" on it is noise.
  if (h <= 12) {
    if (mer === "pm" && h !== 12) h += 12;
    else if (mer === "am" && h === 12) h = 0;
  }
  return h >= 0 && h <= 23 ? h : null;
}

export default function PrepTimeTab({ approverName, pin, isHQOrAdmin }: Props) {
  const [cityFilter, setCityFilter] = useState<"" | "dubai" | "manila">("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(today());

  const [stats, setStats] = useState<PrepTimeStat[]>([]);
  // Every store that has recorded a prep time in the last 90 days, so the
  // dropdown keeps offering a store whose records simply have not arrived yet
  // today. Read from the same endpoint as `stats` rather than the static branch
  // list, because the two disagree on Cubao's code (BRANCHES says CUB, the
  // records say CUBAO) and a mismatch would show the store twice.
  const [knownStores, setKnownStores] = useState<PrepTimeStat[]>([]);
  const [records, setRecords] = useState<PrepTimeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Hourly history state
  const [hourlyRows, setHourlyRows] = useState<HourlyRow[]>([]);
  const [savingHourly, setSavingHourly] = useState(false);
  const [hourlyMsg, setHourlyMsg] = useState<string | null>(null);

  // Backfill state
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // Delete state (HQ only)
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  const params = useCallback(() => {
    const p: Record<string, string> = {
      approver_name: approverName,
      pin,
      date_from: dateFrom,
      date_to: dateTo,
    };
    if (cityFilter) p.city = cityFilter;
    if (branchFilter) p.branch_code = branchFilter;
    return new URLSearchParams(p).toString();
  }, [approverName, pin, dateFrom, dateTo, cityFilter, branchFilter]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const recLimit = branchFilter ? 500 : 100;
      const [statsRes, recsRes] = await Promise.all([
        apiFetch(`/api/admin/prep-time/stats?${params()}`),
        apiFetch(`/api/admin/prep-time/records?limit=${recLimit}&${params()}`),
      ]);
      setStats(statsRes.stats || []);
      setRecords(recsRes.records || []);
    } finally {
      setLoading(false);
    }
  }, [params, branchFilter]);

  // Refreshed when the city changes, not on every date change — the store list
  // must not follow the window it is meant to outlive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p: Record<string, string> = {
          approver_name: approverName, pin,
          date_from: optionsFrom(), date_to: today(),
        };
        if (cityFilter) p.city = cityFilter;
        const res = await apiFetch(`/api/admin/prep-time/stats?${new URLSearchParams(p).toString()}`);
        if (!cancelled) setKnownStores(res.stats || []);
      } catch {
        if (!cancelled) setKnownStores([]); // fall back to whatever is in range
      }
    })();
    return () => { cancelled = true; };
  }, [approverName, pin, cityFilter]);

  // Load hourly history from server when branch selected
  const loadHourlyHistory = useCallback(async () => {
    if (!branchFilter) { setHourlyRows([]); return; }
    const p = new URLSearchParams({
      city: branchCity || cityFilter || "manila",
      branch_code: branchFilter,
      date_from: dateFrom,
      date_to: dateTo,
    });
    try {
      const res = await apiFetch(`/api/admin/prep-time/hourly?${p.toString()}`);
      setHourlyRows(res.rows || []);
    } catch {
      setHourlyRows([]);
    }
  }, [branchFilter, branchCity, cityFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadHourlyHistory();
  }, [loadHourlyHistory]);

  // Derive monthly breakdown from records when a store is selected
  const monthlyStats = useMemo(() => {
    if (!branchFilter || records.length === 0) return [];
    const byMonth: Record<string, {
      month: string; count: number;
      total_minutes: number; total_score: number;
      count_s: number; count_a: number; count_b: number; count_slow: number;
    }> = {};
    for (const r of records) {
      const month = r.work_date.substring(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { month, count: 0, total_minutes: 0, total_score: 0, count_s: 0, count_a: 0, count_b: 0, count_slow: 0 };
      }
      const m = byMonth[month];
      m.count++;
      m.total_minutes += r.prep_minutes;
      m.total_score += r.prep_score;
      if (r.prep_minutes <= 10) m.count_s++;
      else if (r.prep_minutes <= 20) m.count_a++;
      else if (r.prep_minutes <= 30) m.count_b++;
      else m.count_slow++;
    }
    return Object.values(byMonth)
      .map(m => ({
        ...m,
        avg_minutes: Math.round(m.total_minutes / m.count * 10) / 10,
        avg_score: Math.round(m.total_score / m.count * 10) / 10,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [branchFilter, records]);

  // Hourly pattern derived from records in memory (real-time, before saving)
  const hourlyPattern = useMemo(() => {
    // parseOrderHour is the single authority on what is parseable — pre-filtering on
    // "starts with a time" here is what dropped every leading-date record.
    const validRecs = records.filter(r => r.ordered_at_str && parseOrderHour(r.ordered_at_str) != null);
    if (validRecs.length === 0) return [];
    const byHour: Record<number, { total_min: number; count: number; slow: number; fast: number }> = {};
    for (const r of validRecs) {
      const h = parseOrderHour(r.ordered_at_str!);
      if (h == null) continue;
      if (!byHour[h]) byHour[h] = { total_min: 0, count: 0, slow: 0, fast: 0 };
      byHour[h].total_min += r.prep_minutes;
      byHour[h].count++;
      if (r.prep_minutes > 30) byHour[h].slow++;
      if (r.prep_minutes <= 10) byHour[h].fast++;
    }
    return Object.entries(byHour)
      .map(([h, v]) => ({
        hour: parseInt(h, 10),
        order_count: v.count,
        avg_prep_min: Math.round(v.total_min / v.count * 10) / 10,
        slow_pct: Math.round(v.slow / v.count * 100),
        fast_pct: Math.round(v.fast / v.count * 100),
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [records]);

  // Aggregate hourly history from server-stored rows by (hour_of_day) across all saved dates
  const storedHourlyPattern = useMemo(() => {
    if (hourlyRows.length === 0) return [];
    const byHour: Record<number, { weighted_min: number; total_orders: number; slow: number; fast: number }> = {};
    for (const r of hourlyRows) {
      const h = r.hour_of_day;
      if (!byHour[h]) byHour[h] = { weighted_min: 0, total_orders: 0, slow: 0, fast: 0 };
      byHour[h].weighted_min += r.avg_prep_min * r.order_count;
      byHour[h].total_orders += r.order_count;
      byHour[h].slow += r.slow_count;
      byHour[h].fast += r.fast_count;
    }
    return Object.entries(byHour)
      .map(([h, v]) => ({
        hour: parseInt(h, 10),
        order_count: v.total_orders,
        avg_prep_min: Math.round(v.weighted_min / v.total_orders * 10) / 10,
        slow_pct: Math.round(v.slow / v.total_orders * 100),
        fast_pct: Math.round(v.fast / v.total_orders * 100),
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [hourlyRows]);

  // Branch options derived from stats
  // Stores in the chosen window first, then any other store that records prep
  // times, marked so the absence is stated rather than left to be inferred from
  // a missing row.
  const branchOptions = useMemo(() => {
    const inRange = new Set(stats.map(s => s.branch_code).filter(Boolean));
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const s of [...stats, ...knownStores]) {
      if (!s.branch_code || seen.has(s.branch_code)) continue;
      seen.add(s.branch_code);
      opts.push({
        value: s.branch_code,
        label: inRange.has(s.branch_code)
          ? `${s.branch_code} (${s.city})`
          : `${s.branch_code} (${s.city}) — no records in this range`,
      });
    }
    return opts;
  }, [stats, knownStores]);

  const handleSaveHourlyHistory = async () => {
    if (!branchFilter) return;
    setSavingHourly(true);
    setHourlyMsg(null);
    try {
      const p = new URLSearchParams({
        city: branchCity || cityFilter || "manila",
        branch_code: branchFilter,
        date_from: dateFrom,
        date_to: dateTo,
      });
      const res = await apiFetch(`/api/admin/prep-time/aggregate-hourly?${p.toString()}`, { method: "POST" });
      setHourlyMsg(`Saved ${res.buckets_upserted ?? 0} hourly buckets to history.`);
      await loadHourlyHistory();
    } catch (e: unknown) {
      setHourlyMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingHourly(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    let totalFound = 0;
    let totalProcessed = 0;
    let totalDone = 0;
    let totalExpired = 0;
    let pass = 0;
    try {
      const p = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approverName,
        pin,
        batch: "10",
      });
      if (cityFilter) p.set("city", cityFilter);
      while (pass < 5) {
        pass++;
        const res = await apiFetch(`/api/admin/prep-time/backfill?${p.toString()}`, { method: "POST" });
        totalFound += res.receipts_found || 0;
        totalProcessed += res.processed || 0;
        totalDone += res.skipped_already_done || 0;
        totalExpired += res.skipped_expired_url || 0;
        if ((res.processed || 0) === 0) break;
      }
      setBackfillResult(
        `Done — ${totalFound} receipt(s) found from ${totalProcessed} QC photos scanned. ` +
        `(${totalDone} already done, ${totalExpired} expired URLs)`
      );
      if (totalFound > 0) loadDashboard();
    } catch (e: unknown) {
      setBackfillResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackfilling(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await apiFetch(
        `/api/admin/prep-time/records/${id}?approver_name=${encodeURIComponent(approverName)}`,
        { method: "DELETE", headers: { "X-Approver-Pin": pin } }
      );
      setRecords((prev) => prev.filter((r) => r.id !== id));
      apiFetch(`/api/admin/prep-time/stats?${params()}`)
        .then((res) => setStats(res.stats || []))
        .catch(() => {});
    } catch (e: unknown) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3 items-end`}>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">City</label>
          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value as "" | "dubai" | "manila"); setBranchFilter(""); setBranchCity(""); }}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Cities</option>
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Store</label>
          <select
            value={branchFilter}
            onChange={(e) => {
              const code = e.target.value;
              setBranchFilter(code);
              const found = stats.find(s => s.branch_code === code);
              setBranchCity(found ? found.city : "");
            }}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Stores</option>
            {branchOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
          />
        </div>
        <button
          onClick={loadDashboard}
          className="px-4 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm text-white transition-colors"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          onClick={handleBackfill}
          disabled={backfilling}
          className="px-4 py-1.5 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 disabled:opacity-50 text-sm text-white transition-colors"
        >
          {backfilling ? "Scanning…" : "🔍 Scan QC Photos"}
        </button>
      </div>
      {backfillResult && (
        <p className={`text-xs px-3 py-2 rounded-lg ${backfillResult.startsWith("Error") ? "bg-red-900/40 text-red-300" : "bg-sky-900/40 text-sky-200"}`}>
          {backfillResult}
        </p>
      )}

      {/* Per-store stats table */}
      {stats.length > 0 && (
        <div className={`${GLASS_CARD} p-4 overflow-x-auto`}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-white/80">Store Summary</h3>
            {branchFilter && (
              <button
                onClick={() => { setBranchFilter(""); setBranchCity(""); }}
                className="text-xs px-2 py-0.5 rounded-full bg-sky-600/50 text-sky-200 hover:bg-sky-500/50 transition-colors"
              >
                {branchFilter} ✕
              </button>
            )}
            {!branchFilter && <span className="text-xs text-white/30">Click a row to drill down</span>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs border-b border-white/10">
                <th className="pb-2 pr-4">Branch</th>
                <th className="pb-2 pr-4">City</th>
                <th className="pb-2 pr-4 text-right">Count</th>
                <th className="pb-2 pr-4 text-right">Avg Min</th>
                <th className="pb-2 pr-4 text-right">Min / Max</th>
                <th className="pb-2 pr-4">Avg Score</th>
                <th className="pb-2 pr-4 text-right">≤10m (S)</th>
                <th className="pb-2 pr-4 text-right">11-20m (A)</th>
                <th className="pb-2 pr-4 text-right">21-30m (B)</th>
                <th className="pb-2 text-right">&gt;30m</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const isSelected = branchFilter === s.branch_code;
                return (
                  <tr
                    key={`${s.city}-${s.branch_code}`}
                    onClick={() => {
                      if (isSelected) { setBranchFilter(""); setBranchCity(""); }
                      else { setBranchFilter(s.branch_code); setBranchCity(s.city); }
                    }}
                    className={`border-b border-white/5 cursor-pointer transition-colors ${isSelected ? "bg-sky-900/40" : "hover:bg-white/5"}`}
                  >
                    <td className="py-2 pr-4 font-medium text-white">{s.branch_code || s.store_code}</td>
                    <td className="py-2 pr-4 text-white/60 capitalize">{s.city}</td>
                    <td className="py-2 pr-4 text-right font-mono text-white/80">{s.total_count}</td>
                    <td className="py-2 pr-4 text-right font-mono text-white">{s.avg_minutes}m</td>
                    <td className="py-2 pr-4 text-right font-mono text-white/50 text-xs">{s.min_minutes}–{s.max_minutes}m</td>
                    <td className="py-2 pr-4">{scoreBar(Math.round(s.avg_score))}</td>
                    <td className="py-2 pr-4 text-right font-mono text-emerald-400">{s.count_s}</td>
                    <td className="py-2 pr-4 text-right font-mono text-green-400">{s.count_a}</td>
                    <td className="py-2 pr-4 text-right font-mono text-yellow-400">{s.count_b}</td>
                    <td className="py-2 text-right font-mono text-red-400">{s.count_slow}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly trend — shown only when a store is selected */}
      {branchFilter && monthlyStats.length > 0 && (
        <div className={`${GLASS_CARD} p-4 overflow-x-auto`}>
          <h3 className="text-sm font-semibold text-white/80 mb-3">
            {branchFilter} — Monthly Trend
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs border-b border-white/10">
                <th className="pb-2 pr-4">Month</th>
                <th className="pb-2 pr-4 text-right">Count</th>
                <th className="pb-2 pr-4 text-right">Avg Min</th>
                <th className="pb-2 pr-4">Avg Score</th>
                <th className="pb-2 pr-4 text-right">≤10m (S)</th>
                <th className="pb-2 pr-4 text-right">11-20m (A)</th>
                <th className="pb-2 pr-4 text-right">21-30m (B)</th>
                <th className="pb-2 text-right">&gt;30m</th>
              </tr>
            </thead>
            <tbody>
              {monthlyStats.map((m) => (
                <tr key={m.month} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-4 font-medium text-white">{m.month}</td>
                  <td className="py-2 pr-4 text-right font-mono text-white/80">{m.count}</td>
                  <td className="py-2 pr-4 text-right font-mono text-white">{m.avg_minutes}m</td>
                  <td className="py-2 pr-4">{scoreBar(Math.round(m.avg_score))}</td>
                  <td className="py-2 pr-4 text-right font-mono text-emerald-400">{m.count_s}</td>
                  <td className="py-2 pr-4 text-right font-mono text-green-400">{m.count_a}</td>
                  <td className="py-2 pr-4 text-right font-mono text-yellow-400">{m.count_b}</td>
                  <td className="py-2 text-right font-mono text-red-400">{m.count_slow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Hourly Pattern (shown when branch selected and records have ordered_at_str) ── */}
      {branchFilter && hourlyPattern.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white/80">
                {branchFilter} — Hourly Pattern
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                Derived from {records.filter(r => r.ordered_at_str).length} records with order time.
                {storedHourlyPattern.length > 0
                  ? ` ${hourlyRows.length} hourly snapshots saved to history.`
                  : " No hourly history saved yet."}
              </p>
            </div>
            {isHQOrAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveHourlyHistory}
                  disabled={savingHourly}
                  className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500/80 disabled:opacity-50 text-xs text-white transition-colors"
                >
                  {savingHourly ? "Saving…" : "💾 Save to History"}
                </button>
              </div>
            )}
          </div>

          {hourlyMsg && (
            <p className={`text-xs px-3 py-2 mb-3 rounded-lg ${hourlyMsg.startsWith("Error") ? "bg-red-900/40 text-red-300" : "bg-violet-900/40 text-violet-200"}`}>
              {hourlyMsg}
            </p>
          )}

          {/* Color legend */}
          <div className="flex items-center gap-4 mb-3 text-[11px] text-white/40">
            <span><span className="text-emerald-400 font-medium">≤10m</span> Fast (S)</span>
            <span><span className="text-green-400 font-medium">11-20m</span> Good (A)</span>
            <span><span className="text-yellow-300 font-medium">21-25m</span> OK (B)</span>
            <span><span className="text-orange-400 font-medium">26-35m</span> Slow — draft +1</span>
            <span><span className="text-red-400 font-medium">&gt;35m</span> Very slow — draft +2</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs border-b border-white/10">
                  <th className="pb-2 pr-4">Hour</th>
                  <th className="pb-2 pr-4 text-right">Orders</th>
                  <th className="pb-2 pr-4 text-right">Avg Prep</th>
                  <th className="pb-2 pr-4 text-right">Slow %</th>
                  <th className="pb-2 text-right">Fast %</th>
                </tr>
              </thead>
              <tbody>
                {hourlyPattern.map((h) => (
                  <tr key={h.hour} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 pr-4 font-mono text-white/70 text-xs">
                      {String(h.hour).padStart(2, "0")}:00
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono text-white/60 text-xs">
                      {h.order_count}
                    </td>
                    <td className="py-1.5 pr-4 text-right">
                      <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${prepMinColor(h.avg_prep_min)}`}>
                        {h.avg_prep_min}m
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono text-xs text-red-400">
                      {h.slow_pct > 0 ? `${h.slow_pct}%` : "—"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-emerald-400">
                      {h.fast_pct > 0 ? `${h.fast_pct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Hourly History (saved snapshots, grouped by hour) ── */}
      {branchFilter && storedHourlyPattern.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className="text-sm font-semibold text-white/80 mb-1">
            {branchFilter} — Hourly History (Saved)
          </h3>
          <p className="text-xs text-white/40 mb-3">
            Aggregated from {hourlyRows.length} saved snapshots — used by Phase C draft planner.
            Re-save after adding more data to keep the planner up to date.
          </p>

          {/* DOW breakdown — grouped from saved rows */}
          <HourlyHistoryDOWTable rows={hourlyRows} />
        </div>
      )}

      {/* Recent records */}
      {records.length > 0 && (
        <div className={`${GLASS_CARD} p-4 overflow-x-auto`}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-white/80">Recent Records</h3>
            {isHQOrAdmin && (
              <span className="text-xs text-white/30">HQ: click 🗑 to delete incorrect entries</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs border-b border-white/10">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Branch</th>
                <th className="pb-2 pr-3">Staff</th>
                <th className="pb-2 pr-3">Order</th>
                <th className="pb-2 pr-3">Times</th>
                <th className="pb-2 pr-3 text-right">Min</th>
                <th className="pb-2 pr-3">Score</th>
                <th className="pb-2">Source</th>
                {isHQOrAdmin && <th className="pb-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-1.5 pr-3 text-white/60 text-xs">{r.work_date}</td>
                  <td className="py-1.5 pr-3 text-white font-medium">{r.branch_code}</td>
                  <td className="py-1.5 pr-3 text-white/80 text-xs max-w-[120px] truncate">{r.author_name}</td>
                  <td className="py-1.5 pr-3 text-white/60 text-xs">
                    <span className="capitalize">{r.aggregator}</span>
                    {r.order_no && <span className="ml-1 text-white/40">{r.order_no}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-white/50 font-mono">
                    {r.ordered_at_str} → {r.ready_by_str}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-white">{r.prep_minutes}m</td>
                  <td className="py-1.5 pr-3">{scoreBar(r.prep_score)}</td>
                  <td className="py-1.5 text-xs text-white/40">{r.confirmed_by || "OCR"}</td>
                  {isHQOrAdmin && (
                    <td className="py-1.5 text-center">
                      <button
                        disabled={deleting.has(r.id)}
                        onClick={() => handleDelete(r.id)}
                        className="text-white/20 hover:text-red-400 disabled:opacity-30 transition-colors text-base leading-none"
                        title="Delete record (HQ only)"
                      >
                        {deleting.has(r.id) ? "…" : "🗑"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && stats.length === 0 && records.length === 0 && (
        <div className="text-center text-white/40 text-sm py-12">
          No prep time data for the selected period.<br />
          Data is captured automatically when QC photos are posted to Discord.
        </div>
      )}
    </div>
  );
}

// ── Hourly History DOW breakdown sub-component ────────────────────────────────
function HourlyHistoryDOWTable({ rows }: { rows: HourlyRow[] }) {
  // Group saved hourly rows by (day_of_week, hour_of_day)
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const byDowHour = useMemo(() => {
    const map: Record<string, { weighted_min: number; total: number; slow: number }> = {};
    for (const r of rows) {
      const d = new Date(r.work_date + "T12:00:00Z");
      const dow = d.getUTCDay(); // 0=Sun
      const key = `${dow}-${r.hour_of_day}`;
      if (!map[key]) map[key] = { weighted_min: 0, total: 0, slow: 0 };
      map[key].weighted_min += r.avg_prep_min * r.order_count;
      map[key].total += r.order_count;
      map[key].slow += r.slow_count;
    }
    return map;
  }, [rows]);

  const hours = Array.from(
    new Set(rows.map(r => r.hour_of_day))
  ).sort((a, b) => a - b);

  const dows = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

  if (hours.length === 0) return null;

  function cellVal(dow: number, hour: number) {
    const v = byDowHour[`${dow}-${hour}`];
    if (!v || v.total === 0) return null;
    return {
      avg: Math.round(v.weighted_min / v.total * 10) / 10,
      n: v.total,
    };
  }

  function cellClass(avg: number) {
    if (avg <= 10) return "text-emerald-400 bg-emerald-500/10";
    if (avg <= 20) return "text-green-400 bg-green-500/10";
    if (avg <= 25) return "text-yellow-300 bg-yellow-500/10";
    if (avg <= 35) return "text-orange-400 bg-orange-500/10";
    return "text-red-400 bg-red-500/15 font-bold";
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr className="text-white/40 border-b border-white/10">
            <th className="pb-2 pr-3 text-left font-normal">Hour</th>
            {dows.map(d => (
              <th key={d} className="pb-2 px-2 font-medium text-center text-white/60">
                {DOW_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map(h => (
            <tr key={h} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-1.5 pr-3 font-mono text-white/50">
                {String(h).padStart(2, "0")}:00
              </td>
              {dows.map(d => {
                const v = cellVal(d, h);
                return (
                  <td key={d} className="py-1.5 px-2 text-center">
                    {v ? (
                      <span className={`font-mono px-1.5 py-0.5 rounded ${cellClass(v.avg)}`} title={`${v.n} orders`}>
                        {v.avg}m
                      </span>
                    ) : (
                      <span className="text-white/15">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-white/30">
        Orange (26-35m) = draft planner adds +1 staff · Red (&gt;35m) = +2 staff for that hour
      </p>
    </div>
  );
}
