"use client";

import { useState, useEffect, useCallback } from "react";
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

function confidenceBadge(conf: string | null) {
  if (conf === "high") return <span className="text-xs text-emerald-400">● high</span>;
  if (conf === "medium") return <span className="text-xs text-yellow-400">● med</span>;
  return <span className="text-xs text-slate-500">● low</span>;
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

export default function PrepTimeTab({ approverName, pin, isHQOrAdmin }: Props) {
  const [subTab, setSubTab] = useState<"dashboard" | "pending">("dashboard");
  const [cityFilter, setCityFilter] = useState<"" | "dubai" | "manila">("");
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());

  const [stats, setStats] = useState<PrepTimeStat[]>([]);
  const [records, setRecords] = useState<PrepTimeRecord[]>([]);
  const [pending, setPending] = useState<PrepTimeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Backfill state
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // Edit state for pending records
  const [editing, setEditing] = useState<Record<number, Partial<PrepTimeRecord>>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const params = useCallback(() => {
    const p: Record<string, string> = {
      approver_name: approverName,
      pin,
      date_from: dateFrom,
      date_to: dateTo,
    };
    if (cityFilter) p.city = cityFilter;
    return new URLSearchParams(p).toString();
  }, [approverName, pin, dateFrom, dateTo, cityFilter]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, recsRes] = await Promise.all([
        apiFetch(`/api/admin/prep-time/stats?${params()}`),
        apiFetch(`/api/admin/prep-time/records?status=confirmed&limit=100&${params()}`),
      ]);
      setStats(statsRes.stats || []);
      setRecords(recsRes.records || []);
    } finally {
      setLoading(false);
    }
  }, [params]);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/admin/prep-time/records?status=pending&limit=100&approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`
      );
      setPending(res.records || []);
    } finally {
      setLoading(false);
    }
  }, [approverName, pin]);

  useEffect(() => {
    if (subTab === "dashboard") loadDashboard();
    else loadPending();
  }, [subTab, loadDashboard, loadPending]);

  const handleConfirm = async (rec: PrepTimeRecord, status: "confirmed" | "rejected") => {
    setSaving(rec.id);
    const edit = editing[rec.id] || {};
    try {
      await apiFetch(`/api/admin/prep-time/records/${rec.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          confirmed_by: approverName,
          prep_minutes: edit.prep_minutes ?? rec.prep_minutes,
          ordered_at_str: edit.ordered_at_str ?? rec.ordered_at_str ?? "",
          ready_by_str: edit.ready_by_str ?? rec.ready_by_str ?? "",
          aggregator: edit.aggregator ?? rec.aggregator ?? "",
          order_no: edit.order_no ?? rec.order_no ?? "",
          approver_name: approverName,
          pin,
        }),
      });
      setPending((prev) => prev.filter((r) => r.id !== rec.id));
      setEditing((prev) => { const n = { ...prev }; delete n[rec.id]; return n; });
    } finally {
      setSaving(null);
    }
  };

  const setEdit = (id: number, field: keyof PrepTimeRecord, value: string | number) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const p = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approverName,
        pin,
      });
      if (cityFilter) p.set("city", cityFilter);
      const res = await apiFetch(`/api/admin/prep-time/backfill?${p.toString()}`, { method: "POST" });
      setBackfillResult(
        `Done — ${res.receipts_found} receipt(s) found from ${res.processed} QC photos scanned. ` +
        `(${res.skipped_already_done} already done, ${res.skipped_expired_url} expired URLs)`
      );
      if (res.receipts_found > 0) {
        await loadDashboard();
        setSubTab("pending");
      }
    } catch (e: unknown) {
      setBackfillResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="flex gap-2">
        {(["dashboard", "pending"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subTab === t
                ? "bg-white/20 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {t === "dashboard" ? "Dashboard" : `Pending Confirmation${pending.length > 0 ? ` (${pending.length})` : ""}`}
          </button>
        ))}
      </div>

      {subTab === "dashboard" && (
        <>
          {/* Filters */}
          <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3 items-end`}>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">City</label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value as "" | "dubai" | "manila")}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
              >
                <option value="">All Cities</option>
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
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
              <h3 className="text-sm font-semibold text-white/80 mb-3">Store Summary (confirmed records)</h3>
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
                  {stats.map((s) => (
                    <tr key={`${s.city}-${s.branch_code}`} className="border-b border-white/5 hover:bg-white/5">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent confirmed records */}
          {records.length > 0 && (
            <div className={`${GLASS_CARD} p-4 overflow-x-auto`}>
              <h3 className="text-sm font-semibold text-white/80 mb-3">Recent Confirmed Records</h3>
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
                    <th className="pb-2">Confirmed by</th>
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
                      <td className="py-1.5 text-xs text-white/40">{r.confirmed_by || "—"}</td>
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
        </>
      )}

      {subTab === "pending" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/50">
              OCR-extracted records awaiting manual confirmation. Review and correct if needed before confirming.
            </p>
            <button
              onClick={loadPending}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!loading && pending.length === 0 && (
            <div className="text-center text-white/40 text-sm py-12">
              No pending records — all OCR data has been reviewed.
            </div>
          )}

          <div className="space-y-3">
            {pending.map((rec) => {
              const ed = editing[rec.id] || {};
              const displayMin = ed.prep_minutes ?? rec.prep_minutes;
              return (
                <div key={rec.id} className={`${GLASS_CARD} p-4 space-y-3`}>
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-semibold text-white">{rec.branch_code || rec.store_code}</span>
                    <span className="text-white/50">{rec.work_date}</span>
                    <span className="text-white/70">{rec.author_name}</span>
                    {confidenceBadge(rec.ocr_confidence)}
                    <span className="text-white/40 text-xs ml-auto">ID #{rec.id}</span>
                  </div>

                  {/* Editable fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Aggregator</label>
                      <select
                        value={ed.aggregator ?? rec.aggregator ?? ""}
                        onChange={(e) => setEdit(rec.id, "aggregator", e.target.value)}
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="grabfood">GrabFood</option>
                        <option value="careem">Careem</option>
                        <option value="keeta">Keeta</option>
                        <option value="foodpanda">Foodpanda</option>
                        <option value="talabat">Talabat</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Order No</label>
                      <input
                        value={ed.order_no ?? rec.order_no ?? ""}
                        onChange={(e) => setEdit(rec.id, "order_no", e.target.value)}
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                        placeholder="GF-192"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Ordered At</label>
                      <input
                        value={ed.ordered_at_str ?? rec.ordered_at_str ?? ""}
                        onChange={(e) => setEdit(rec.id, "ordered_at_str", e.target.value)}
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                        placeholder="7:59 PM"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Ready By</label>
                      <input
                        value={ed.ready_by_str ?? rec.ready_by_str ?? ""}
                        onChange={(e) => setEdit(rec.id, "ready_by_str", e.target.value)}
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                        placeholder="8:20 PM"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Prep (min)</label>
                      <input
                        type="number"
                        value={displayMin}
                        onChange={(e) => setEdit(rec.id, "prep_minutes", parseInt(e.target.value) || rec.prep_minutes)}
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono w-full"
                        min={1}
                        max={180}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/40">Score / Grade</label>
                      <div className="flex items-center gap-2 h-7">
                        {scoreBar(rec.prep_score)}
                        <span className={`text-xs font-bold ${gradeColor(rec.prep_grade)}`}>{rec.prep_grade}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={saving === rec.id}
                      onClick={() => handleConfirm(rec, "confirmed")}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
                    >
                      {saving === rec.id ? "Saving…" : "✓ Confirm"}
                    </button>
                    <button
                      disabled={saving === rec.id}
                      onClick={() => handleConfirm(rec, "rejected")}
                      className="px-4 py-1.5 rounded-lg bg-red-700/60 hover:bg-red-600/60 disabled:opacity-50 text-xs font-medium text-white transition-colors"
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
