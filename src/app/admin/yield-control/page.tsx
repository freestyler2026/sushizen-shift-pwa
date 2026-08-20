// src/app/admin/yield-control/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City } from "@/lib/branches";
import {
  BADGE_INFO,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_CARD_TITLE,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_ROW,
  KPI_CARD,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

interface YieldSummaryRow {
  branch_code: string;
  record_count: number;
  avg_waste_pct: number;
  min_waste_pct: number;
  max_waste_pct: number;
  total_waste_kg: number;
  total_whole_kg: number;
  last_date: string;
  high_waste_count: number;
}

interface YieldRecord {
  id: number;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  whole_weight_g: number;
  main_portion_g: number;
  topping_g: number;
  waste_g: number;
  waste_pct: number;
  photo_url: string;
  ai_score: number | null;
  ai_score_note: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}

async function apiFetch<T>(path: string): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    headers: { ...(getAuthHeaders(auth) ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { const j = JSON.parse(text); detail = j?.detail || j?.message || text; } catch { /* noop */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

// ─── Waste color helpers ──────────────────────────────────────────────────────

function wastePctColor(pct: number): string {
  if (pct >= 5) return "text-red-400";
  if (pct >= 3) return "text-yellow-400";
  return "text-emerald-400";
}

function wastePctBadge(pct: number): string {
  if (pct >= 5)
    return "text-red-300 bg-red-500/15 border border-red-500/30";
  if (pct >= 3)
    return "text-yellow-300 bg-yellow-500/12 border border-yellow-500/25";
  return "text-emerald-300 bg-emerald-500/12 border border-emerald-500/25";
}

// ─── Branch summary table ─────────────────────────────────────────────────────

function SummaryTable({
  rows,
  selectedBranch,
  onSelectBranch,
}: {
  rows: YieldSummaryRow[];
  selectedBranch: string;
  onSelectBranch: (b: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No data for selected period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8">
            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Branch</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Records</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Waste%</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Min</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Max</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Waste</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Whole</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Alerts</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Last Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.branch_code}
              className={`${TABLE_ROW} cursor-pointer transition-colors ${
                selectedBranch === r.branch_code ? "bg-violet-500/10" : "hover:bg-white/3"
              }`}
              onClick={() => onSelectBranch(selectedBranch === r.branch_code ? "" : r.branch_code)}
            >
              <td className={`${TABLE_CELL} font-semibold text-white`}>{r.branch_code}</td>
              <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{r.record_count}</td>
              <td className={`${TABLE_CELL} text-right`}>
                <span className={`font-mono font-bold ${wastePctColor(r.avg_waste_pct)}`}>
                  {r.avg_waste_pct.toFixed(1)}%
                </span>
              </td>
              <td className={`${TABLE_CELL} text-right font-mono ${wastePctColor(r.min_waste_pct)}`}>
                {r.min_waste_pct.toFixed(1)}%
              </td>
              <td className={`${TABLE_CELL} text-right font-mono ${wastePctColor(r.max_waste_pct)}`}>
                {r.max_waste_pct.toFixed(1)}%
              </td>
              <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{r.total_waste_kg.toFixed(3)} kg</td>
              <td className={`${TABLE_CELL} text-right font-mono text-zinc-400`}>{r.total_whole_kg.toFixed(3)} kg</td>
              <td className={`${TABLE_CELL} text-right`}>
                {r.high_waste_count > 0 ? (
                  <span className="font-semibold text-red-400">{r.high_waste_count}</span>
                ) : (
                  <span className="text-zinc-600">–</span>
                )}
              </td>
              <td className={`${TABLE_CELL} text-right text-zinc-400`}>{r.last_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Records list ─────────────────────────────────────────────────────────────

function RecordsList({ records, branchFilter }: { records: YieldRecord[]; branchFilter: string }) {
  const filtered = branchFilter ? records.filter((r) => r.branch_code === branchFilter) : records;

  if (filtered.length === 0) {
    return <p className="text-sm text-zinc-500">No records found.</p>;
  }

  return (
    <div className="space-y-2">
      {filtered.map((r) => (
        <div
          key={r.id}
          className={`rounded-xl border p-3 ${
            r.waste_pct >= 5
              ? "border-red-500/25 bg-red-500/5"
              : r.waste_pct >= 3
              ? "border-yellow-500/20 bg-yellow-500/4"
              : "border-white/8 bg-white/3"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-white">{r.report_date}</span>
            <span className="text-xs text-zinc-400">{r.branch_code}</span>
            <span className={BADGE_INFO}>{r.shift}</span>
            <span className="text-xs text-zinc-500">by {r.reported_by}</span>
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${wastePctBadge(r.waste_pct)}`}>
              {r.waste_pct.toFixed(1)}% waste
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-300">
            <div><span className="text-zinc-500">Whole: </span>{r.whole_weight_g}g</div>
            <div><span className="text-zinc-500">Main: </span>{r.main_portion_g}g</div>
            <div><span className="text-zinc-500">Topping: </span>{r.topping_g}g</div>
            <div><span className="text-zinc-500">Waste: </span>{r.waste_g}g</div>
          </div>
          {(r.photo_url || r.ai_score !== null) && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {r.photo_url && (
                <a href={r.photo_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  View Photo
                </a>
              )}
              {r.ai_score !== null && (
                <span className="text-xs text-zinc-400">
                  AI Score: <span className="text-white font-semibold">{r.ai_score}</span>
                  {r.ai_score_note && ` — ${r.ai_score_note}`}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function YieldControlPage() {
  const [city, setCity] = useState<City>("dubai");
  const [dateFrom, setDateFrom] = useState(() => daysAgo(30));
  const [dateTo, setDateTo] = useState(todayStr);
  const [selectedBranch, setSelectedBranch] = useState("");

  const [summary, setSummary] = useState<YieldSummaryRow[]>([]);
  const [records, setRecords] = useState<YieldRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [sumData, recData] = await Promise.all([
        apiFetch<{ summary: YieldSummaryRow[] }>(
          `/api/admin/salmon/yield-summary?city=${city}&date_from=${dateFrom}&date_to=${dateTo}`
        ),
        apiFetch<{ records: YieldRecord[] }>(
          `/api/admin/salmon/yield-records?city=${city}&date_from=${dateFrom}&date_to=${dateTo}&limit=200`
        ),
      ]);
      setSummary(sumData.summary ?? []);
      setRecords(recData.records ?? []);
      setSelectedBranch("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // KPI aggregates from summary
  const kpi = useMemo(() => {
    const totalRecords = summary.reduce((n, r) => n + r.record_count, 0);
    const totalWasteKg = summary.reduce((n, r) => n + r.total_waste_kg, 0);
    const totalWholeKg = summary.reduce((n, r) => n + r.total_whole_kg, 0);
    const overallWastePct = totalWholeKg > 0 ? (totalWasteKg / totalWholeKg) * 100 : 0;
    const highWasteBranches = summary.filter((r) => r.avg_waste_pct >= 5).length;
    const alertEvents = summary.reduce((n, r) => n + r.high_waste_count, 0);
    return { totalRecords, totalWasteKg, overallWastePct, highWasteBranches, alertEvents };
  }, [summary]);

  const filteredRecords = selectedBranch
    ? records.filter((r) => r.branch_code === selectedBranch)
    : records;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 px-3 pt-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={T_PAGE_TITLE}>Salmon Yield Control</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Store-by-store waste% tracking</p>
          </div>
          <Link href="/admin/backup" className={`${SECONDARY_BUTTON} shrink-0`}>Backup Report</Link>
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>City</label>
              <SelectDark
                className={`${SELECT_CLASS} py-2.5`}
                value={city}
                onChange={(v) => { setCity(v as City); setSelectedBranch(""); }}
                options={[
                  { value: "dubai", label: "Dubai" },
                  { value: "manila", label: "Manila" },
                ]}
              />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className={`${INPUT_CLASS} py-2.5`} />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className={`${INPUT_CLASS} py-2.5`} />
            </div>
            <button onClick={load} className={`${PRIMARY_BUTTON} py-2.5`}>
              {loading ? "Loading..." : "Load"}
            </button>
            {selectedBranch && (
              <button onClick={() => setSelectedBranch("")} className={`${SMALL_BUTTON}`}>
                Clear filter: {selectedBranch}
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* KPI cards */}
        {!loading && summary.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>Total Records</span>
              <span className="text-2xl font-bold text-white">{kpi.totalRecords}</span>
            </div>
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>Overall Waste%</span>
              <span className={`text-2xl font-bold ${wastePctColor(kpi.overallWastePct)}`}>
                {kpi.overallWastePct.toFixed(1)}%
              </span>
            </div>
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>High Waste Events</span>
              <span className={`text-2xl font-bold ${kpi.alertEvents > 0 ? "text-red-400" : "text-zinc-400"}`}>
                {kpi.alertEvents}
              </span>
            </div>
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>Total Waste</span>
              <span className="text-2xl font-bold text-orange-300">
                {kpi.totalWasteKg.toFixed(2)} kg
              </span>
            </div>
          </div>
        )}

        {/* Branch summary table */}
        <div className={`${GLASS_CARD} p-4 sm:p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={T_CARD_TITLE}>Branch Summary</h2>
            {selectedBranch && (
              <span className="text-xs text-violet-400">
                Filtering records by <strong>{selectedBranch}</strong> — click row again to clear
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : (
            <SummaryTable
              rows={summary}
              selectedBranch={selectedBranch}
              onSelectBranch={setSelectedBranch}
            />
          )}
        </div>

        {/* Individual records */}
        <div className={`${GLASS_CARD} p-4 sm:p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={T_CARD_TITLE}>
              Records
              {selectedBranch && <span className="text-violet-400 ml-2">— {selectedBranch}</span>}
            </h2>
            <span className={T_CAPTION}>{filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}</span>
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : (
            <RecordsList records={records} branchFilter={selectedBranch} />
          )}
        </div>

      </div>
    </main>
  );
}
