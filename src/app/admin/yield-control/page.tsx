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
  avg_main_pct: number;
  avg_scrap_pct: number;
  avg_skin_pct: number;
  total_whole_kg: number;
  last_date: string;
  low_main_count: number;
  high_scrap_count: number;
  high_skin_count: number;
}

interface YieldRecord {
  id: number;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  whole_weight_g: number;
  main_portion_g: number;
  scrap_g: number;
  skin_g: number;
  waste_g: number;
  waste_pct: number;
  photo_url: string;
  photo_urls: string[];
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

// ─── Color helpers ────────────────────────────────────────────────────────────

function mainPctColor(pct: number): string {
  if (pct < 65 || pct > 70) return "text-red-400";
  if (pct < 67.5) return "text-yellow-400";
  return "text-emerald-400";
}

function scrapPctColor(pct: number): string {
  if (pct > 12.5) return "text-red-400";
  if (pct > 10) return "text-yellow-400";
  return "text-emerald-400";
}

function skinPctColor(pct: number): string {
  if (pct > 25) return "text-red-400";
  if (pct > 22.5) return "text-yellow-400";
  return "text-emerald-400";
}

function mainPctBadge(pct: number): string {
  if (pct < 65 || pct > 70)
    return "text-red-300 bg-red-500/15 border border-red-500/30";
  if (pct < 67.5)
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
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Main%</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Scrap%</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Skin%</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Whole</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Alerts</th>
            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Last Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const alertCount = r.low_main_count + r.high_scrap_count + r.high_skin_count;
            return (
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
                  <span className={`font-mono font-bold ${mainPctColor(r.avg_main_pct ?? 0)}`}>
                    {(r.avg_main_pct ?? 0).toFixed(1)}%
                  </span>
                </td>
                <td className={`${TABLE_CELL} text-right font-mono ${scrapPctColor(r.avg_scrap_pct ?? 0)}`}>
                  {(r.avg_scrap_pct ?? 0).toFixed(1)}%
                </td>
                <td className={`${TABLE_CELL} text-right font-mono ${skinPctColor(r.avg_skin_pct ?? 0)}`}>
                  {(r.avg_skin_pct ?? 0).toFixed(1)}%
                </td>
                <td className={`${TABLE_CELL} text-right font-mono text-zinc-400`}>{(r.total_whole_kg ?? 0).toFixed(3)} kg</td>
                <td className={`${TABLE_CELL} text-right`}>
                  {alertCount > 0 ? (
                    <span className="font-semibold text-red-400">{alertCount}</span>
                  ) : (
                    <span className="text-zinc-600">–</span>
                  )}
                </td>
                <td className={`${TABLE_CELL} text-right text-zinc-400`}>{r.last_date}</td>
              </tr>
            );
          })}
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
      {filtered.map((r) => {
        const whole = r.whole_weight_g || 0;
        const mainPct = whole > 0 ? r.main_portion_g / whole * 100 : 0;
        const scrapPct = whole > 0 ? r.scrap_g / whole * 100 : 0;
        const skinPct = whole > 0 ? r.skin_g / whole * 100 : 0;
        const hasAlert = mainPct < 65 || mainPct > 70 || scrapPct > 12.5 || skinPct > 25;
        return (
          <div
            key={r.id}
            className={`rounded-xl border p-3 ${
              hasAlert
                ? "border-red-500/25 bg-red-500/5"
                : "border-white/8 bg-white/3"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">{r.report_date}</span>
              <span className="text-xs text-zinc-400">{r.branch_code}</span>
              <span className={BADGE_INFO}>{r.shift}</span>
              <span className="text-xs text-zinc-500">by {r.reported_by}</span>
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${mainPctBadge(mainPct)}`}>
                Main {mainPct.toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-300">
              <div><span className="text-zinc-500">Whole: </span>{whole}g</div>
              <div><span className={`font-semibold ${mainPctColor(mainPct)}`}>Main: {r.main_portion_g}g ({mainPct.toFixed(1)}%)</span></div>
              <div><span className={`font-semibold ${scrapPctColor(scrapPct)}`}>Scrap: {r.scrap_g}g ({scrapPct.toFixed(1)}%)</span></div>
              <div><span className={`font-semibold ${skinPctColor(skinPct)}`}>Skin: {r.skin_g}g ({skinPct.toFixed(1)}%)</span></div>
            </div>
            {(r.photo_url || (r.photo_urls?.length > 0) || r.ai_score !== null) && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {(() => {
                  const urls = Array.isArray(r.photo_urls) && r.photo_urls.length > 0
                    ? r.photo_urls
                    : r.photo_url ? [r.photo_url] : [];
                  const labels = ["Whole Salmon", "Scrap", "Skin", "Main Portion", "Extra"];
                  return urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      {labels[i] ?? `Photo ${i + 1}`}
                    </a>
                  ));
                })()}
                {r.ai_score !== null && (
                  <span className="text-xs text-zinc-400">
                    AI Score: <span className="text-white font-semibold">{r.ai_score}</span>
                    {r.ai_score_note && ` — ${r.ai_score_note}`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
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
    const totalWholeKg = summary.reduce((n, r) => n + (r.total_whole_kg ?? 0), 0);
    const avgMainPct = summary.length > 0
      ? summary.reduce((n, r) => n + (r.avg_main_pct ?? 0), 0) / summary.length
      : 0;
    const alertEvents = summary.reduce(
      (n, r) => n + (r.low_main_count ?? 0) + (r.high_scrap_count ?? 0) + (r.high_skin_count ?? 0),
      0
    );
    return { totalRecords, totalWholeKg, avgMainPct, alertEvents };
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
            <p className="mt-0.5 text-sm text-zinc-500">Store-by-store portioning % tracking</p>
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
              <span className={T_CAPTION}>Avg Main%</span>
              <span className={`text-2xl font-bold ${mainPctColor(kpi.avgMainPct)}`}>
                {kpi.avgMainPct.toFixed(1)}%
              </span>
            </div>
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>Par Deviations</span>
              <span className={`text-2xl font-bold ${kpi.alertEvents > 0 ? "text-red-400" : "text-zinc-400"}`}>
                {kpi.alertEvents}
              </span>
            </div>
            <div className={`${KPI_CARD} flex flex-col gap-1`}>
              <span className={T_CAPTION}>Total Whole Salmon</span>
              <span className="text-2xl font-bold text-zinc-200">
                {kpi.totalWholeKg.toFixed(2)} kg
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
