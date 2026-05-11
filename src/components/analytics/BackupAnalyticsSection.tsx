"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { getLabelStandards, type StandardSpec } from "@/lib/backup-standards";
import {
  BADGE_INFO, BADGE_WARNING,
  GLASS_CARD, INPUT_CLASS, SELECT_CLASS, SMALL_BUTTON,
  T_LABEL, TABLE_CELL, TABLE_ROW,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BackupLine {
  id: number; section: string; item_type: string; item_name_snapshot: string;
  item_category: string; quantity: number; unit: string; notes: string;
}
interface BackupReport {
  id: number; city: string; branch_code: string; report_date: string;
  reported_by: string; shift: string; notes: string; status: string;
  created_at: string; lines: BackupLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(auth) ?? {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) { const j = text ? JSON.parse(text) : {}; throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`); }
  return (text ? JSON.parse(text) : {}) as T;
}

function isShortage(std: StandardSpec, quantity: number): boolean {
  return quantity < std.min;
}

const SECTION_LABELS: Record<string, string> = {
  supplies:     "Condiments & Supplies",
  packaging:    "Packaging",
  prep:         "Prepared Ingredients",
  toppings:     "Toppings & Flakes",
  hot_section:  "Hot Section",
  rolls:        "Sushi Rolls",
  base_roll:    "Base Roll",
  free:         "Free Entry",
};
const SECTION_COLORS: Record<string, string> = {
  supplies:     "#60a5fa",
  packaging:    "#a78bfa",
  prep:         "#34d399",
  toppings:     "#fb923c",
  hot_section:  "#f87171",
  rolls:        "#f472b6",
  base_roll:    "#c084fc",
  free:         "#fbbf24",
};

function sectionBadge(s: string) {
  const label = SECTION_LABELS[s] ?? s;
  const color = SECTION_COLORS[s];
  if (s === "free") return <span className={BADGE_WARNING}>{label}</span>;
  if (s === "rolls" || s === "base_roll") return <span className={BADGE_INFO}>{label}</span>;
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border" style={{ backgroundColor: `${color}18`, borderColor: `${color}30`, color }}>{label}</span>;
}

// ─── Edit Line Form ───────────────────────────────────────────────────────────
function EditLineForm({ line, onSave, onCancel }: { line: BackupLine; onSave: (updated: BackupLine) => void; onCancel: () => void }) {
  const [name, setName]     = useState(line.item_name_snapshot);
  const [qty, setQty]       = useState(String(line.quantity));
  const [unit, setUnit]     = useState(line.unit);
  const [notes, setNotes]   = useState(line.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/api/admin/backup/line/${line.id}`, { method: "PATCH", body: JSON.stringify({ item_name_snapshot: name.trim(), quantity: parseFloat(qty) || 0, unit: unit.trim(), notes: notes.trim() }) });
      onSave({ ...line, item_name_snapshot: name.trim(), quantity: parseFloat(qty) || 0, unit: unit.trim(), notes: notes.trim() });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">Edit Line</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={`${T_LABEL} block mb-1`}>Item Name</label><input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={`${T_LABEL} block mb-1`}>Qty</label><input type="number" inputMode="decimal" className={INPUT_CLASS} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><label className={`${T_LABEL} block mb-1`}>Unit</label><input className={INPUT_CLASS} value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        <div><label className={`${T_LABEL} block mb-1`}>Notes</label><input className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">{saving ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function KpiCards({ reports, city }: { reports: BackupReport[]; city: City }) {
  const allLines = reports.flatMap((r) => r.lines ?? []);
  const total    = allLines.length;
  const freeForm = allLines.filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot)).length;
  const standards = getLabelStandards(city);

  const shortageLines = allLines.filter((l) => {
    const std = standards[l.item_name_snapshot];
    return std && isShortage(std, l.quantity);
  });
  const shortageRate = total > 0 ? Math.round((shortageLines.length / allLines.filter(l => standards[l.item_name_snapshot]).length) * 100) : 0;

  // By section
  const bySection: Record<string, number> = {};
  for (const l of allLines) { const s = l.section || "free"; bySection[s] = (bySection[s] || 0) + 1; }
  const sectionEntries = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
  const maxSection = Math.max(...sectionEntries.map(([, c]) => c), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className={`${GLASS_CARD} p-4 relative overflow-hidden`}>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-violet-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Reports</p>
        <p className="mt-2 text-3xl font-bold text-white">{reports.length}</p>
      </div>
      <div className={`${GLASS_CARD} p-4 relative overflow-hidden`}>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total Lines</p>
        <p className="mt-2 text-3xl font-bold text-white">{total}</p>
      </div>
      <div className={`${GLASS_CARD} p-4 relative overflow-hidden`}>
        <div className={`absolute inset-x-0 top-0 h-0.5 ${shortageRate > 30 ? "bg-red-500" : shortageRate > 10 ? "bg-yellow-500" : "bg-green-500"}`} />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Shortage Rate</p>
        <p className={`mt-2 text-3xl font-bold ${shortageRate > 30 ? "text-red-400" : shortageRate > 10 ? "text-yellow-400" : "text-green-400"}`}>
          {shortageRate}%
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{shortageLines.length} lines below std</p>
      </div>
      <div className={`${GLASS_CARD} p-4`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">By Section</p>
        <div className="space-y-2">
          {sectionEntries.slice(0, 5).map(([s, count]) => {
            const color = SECTION_COLORS[s] ?? "#a1a1aa";
            return (
              <div key={s} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 truncate">{SECTION_LABELS[s] ?? s}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{count}</span>
                </div>
                <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((count / maxSection) * 100)}%`, backgroundColor: color, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ② Shortage Heatmap ──────────────────────────────────────────────────────
function ShortageHeatmap({ reports, city }: { reports: BackupReport[]; city: City }) {
  const standards = getLabelStandards(city);
  const branches = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => set.add(r.branch_code));
    return [...set].sort();
  }, [reports]);

  // Per item per branch: {total, shortages}
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, { total: number; shortages: number }>> = {};
    for (const report of reports) {
      for (const line of report.lines ?? []) {
        const std = standards[line.item_name_snapshot];
        if (!std) continue;
        if (!m[line.item_name_snapshot]) m[line.item_name_snapshot] = {};
        if (!m[line.item_name_snapshot][report.branch_code]) {
          m[line.item_name_snapshot][report.branch_code] = { total: 0, shortages: 0 };
        }
        m[line.item_name_snapshot][report.branch_code].total++;
        if (isShortage(std, line.quantity)) m[line.item_name_snapshot][report.branch_code].shortages++;
      }
    }
    return m;
  }, [reports, standards]);

  // Sort items by total shortage count across all branches
  const sortedItems = useMemo(() =>
    Object.entries(matrix)
      .map(([item, branchData]) => ({
        item,
        totalShortages: Object.values(branchData).reduce((s, b) => s + b.shortages, 0),
        totalReports: Object.values(branchData).reduce((s, b) => s + b.total, 0),
      }))
      .filter((x) => x.totalShortages > 0)
      .sort((a, b) => b.totalShortages - a.totalShortages)
      .slice(0, 20),
    [matrix]
  );

  if (sortedItems.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        No shortage data — all items met their standards in this period.
      </p>
    );
  }

  function cellColor(branchData: { total: number; shortages: number } | undefined): string {
    if (!branchData || branchData.total === 0) return "bg-white/4 text-zinc-600";
    const rate = branchData.shortages / branchData.total;
    if (rate === 0) return "bg-green-500/20 text-green-300";
    if (rate < 0.3) return "bg-yellow-500/15 text-yellow-300";
    if (rate < 0.6) return "bg-orange-500/20 text-orange-300";
    return "bg-red-500/25 text-red-300";
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-xs">
        <thead className="bg-white/5">
          <tr>
            <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-left w-48 sticky left-0 bg-zinc-900/80">
              Item
            </th>
            {branches.map((b) => (
              <th key={b} className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center min-w-[64px]">
                {b}
              </th>
            ))}
            <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center min-w-[56px]">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sortedItems.map(({ item, totalShortages, totalReports }) => (
            <tr key={item} className="hover:bg-white/3 transition-colors">
              <td className="px-3 py-2 text-zinc-300 truncate max-w-[12rem] sticky left-0 bg-zinc-950/80 font-medium" title={item}>
                {item}
              </td>
              {branches.map((b) => {
                const bd = matrix[item]?.[b];
                return (
                  <td key={b} className={`px-3 py-2 text-center font-mono font-semibold rounded-sm ${cellColor(bd)}`}>
                    {bd ? `${bd.shortages}/${bd.total}` : "—"}
                  </td>
                );
              })}
              <td className={`px-3 py-2 text-center font-mono font-semibold ${totalShortages > 0 ? "text-red-300" : "text-green-300"}`}>
                {totalShortages}/{totalReports}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/8 text-[10px] text-zinc-500">
        <span>Legend:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/25 inline-block" />0%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/20 inline-block" />&lt;30%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/25 inline-block" />30–60%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30 inline-block" />&gt;60%</span>
        <span className="ml-auto italic">shortages / total reports</span>
      </div>
    </div>
  );
}

// ─── ③ Chronic Shortage Ranking ──────────────────────────────────────────────
function ChronicShortageRanking({ reports, city }: { reports: BackupReport[]; city: City }) {
  const standards = getLabelStandards(city);

  const ranking = useMemo(() => {
    const itemStats: Record<string, { total: number; shortages: number; avgQty: number; std: StandardSpec }> = {};

    for (const report of reports) {
      for (const line of report.lines ?? []) {
        const std = standards[line.item_name_snapshot];
        if (!std) continue;
        if (!itemStats[line.item_name_snapshot]) {
          itemStats[line.item_name_snapshot] = { total: 0, shortages: 0, avgQty: 0, std };
        }
        const s = itemStats[line.item_name_snapshot];
        s.total++;
        s.avgQty = (s.avgQty * (s.total - 1) + line.quantity) / s.total;
        if (isShortage(std, line.quantity)) s.shortages++;
      }
    }

    return Object.entries(itemStats)
      .map(([item, s]) => ({
        item,
        total: s.total,
        shortages: s.shortages,
        shortageRate: s.total > 0 ? s.shortages / s.total : 0,
        avgQty: Math.round(s.avgQty * 10) / 10,
        std: s.std,
      }))
      .filter((x) => x.shortages > 0)
      .sort((a, b) => b.shortages - a.shortages || b.shortageRate - a.shortageRate)
      .slice(0, 15);
  }, [reports, standards]);

  if (ranking.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        No chronic shortages found in this period. 🎉
      </p>
    );
  }

  const chartData = ranking.slice(0, 10).map((r) => ({
    name: r.item.length > 22 ? r.item.slice(0, 20) + "…" : r.item,
    fullName: r.item,
    shortages: r.shortages,
    rate: Math.round(r.shortageRate * 100),
  }));

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
          <XAxis type="number" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { fullName: string; shortages: number; rate: number };
            return (
              <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl">
                <p className="text-zinc-200 font-medium mb-1">{d.fullName}</p>
                <p className="text-red-400 font-semibold">{d.shortages}× below standard</p>
                <p className="text-zinc-400">{d.rate}% shortage rate</p>
              </div>
            );
          }} />
          <Bar dataKey="shortages" radius={[0, 4, 4, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.rate > 60 ? "#f87171" : d.rate > 30 ? "#fb923c" : "#fbbf24"} fillOpacity={0.85 - i * 0.04} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Detailed table */}
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-4 py-2.5 text-left">#</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-4 py-2.5 text-left">Item</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center">Shortage Rate</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center">Times Below Std</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center">Avg Reported</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-left">Standard</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, idx) => {
              const ratePct = Math.round(r.shortageRate * 100);
              const rateColor = ratePct > 60 ? "text-red-400" : ratePct > 30 ? "text-orange-400" : "text-yellow-400";
              return (
                <tr key={r.item} className={TABLE_ROW}>
                  <td className={`${TABLE_CELL} px-4 text-zinc-600 font-mono`}>{idx + 1}</td>
                  <td className={`${TABLE_CELL} px-4 text-zinc-200 font-medium`}>{r.item}</td>
                  <td className={`${TABLE_CELL} px-3 text-center`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`font-bold tabular-nums ${rateColor}`}>{ratePct}%</span>
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-red-500/60" style={{ width: `${ratePct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className={`${TABLE_CELL} px-3 text-center font-mono tabular-nums text-red-300`}>
                    {r.shortages}<span className="text-zinc-600">/{r.total}</span>
                  </td>
                  <td className={`${TABLE_CELL} px-3 text-center font-mono tabular-nums text-zinc-300`}>
                    {r.std.type === "pct" ? `${r.avgQty}%` : r.avgQty}
                  </td>
                  <td className={`${TABLE_CELL} px-3 text-zinc-500 text-xs`}>{r.std.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Stats (KPI cards + shortage analysis) ───────────────────────────
function SummaryStats({ reports, city }: { reports: BackupReport[]; city: City }) {
  const hasStandards = Object.keys(getLabelStandards(city)).length > 0;
  const [analyticsTab, setAnalyticsTab] = useState<"heatmap" | "ranking">("ranking");

  return (
    <div className="space-y-3">
      <KpiCards reports={reports} city={city} />

      {/* ② ③ Shortage Analysis (replaces "Most Reported") */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {hasStandards ? "Shortage Analysis" : "Most Reported Items"}
            </p>
          </div>
          {hasStandards && (
            <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
              <button
                onClick={() => setAnalyticsTab("ranking")}
                className={`px-3 py-1.5 font-medium transition-colors ${analyticsTab === "ranking" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white hover:bg-white/8"}`}
              >
                Shortage Ranking
              </button>
              <button
                onClick={() => setAnalyticsTab("heatmap")}
                className={`px-3 py-1.5 font-medium transition-colors ${analyticsTab === "heatmap" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white hover:bg-white/8"}`}
              >
                Branch Heatmap
              </button>
            </div>
          )}
        </div>

        {hasStandards ? (
          analyticsTab === "ranking" ? (
            <ChronicShortageRanking reports={reports} city={city} />
          ) : (
            <ShortageHeatmap reports={reports} city={city} />
          )
        ) : (
          // Dubai fallback: original Most Reported chart
          <MostReportedFallback reports={reports} />
        )}
      </div>
    </div>
  );
}

// ─── Dubai fallback (original Most Reported chart) ───────────────────────────
function MostReportedFallback({ reports }: { reports: BackupReport[] }) {
  const allLines = reports.flatMap((r) => r.lines ?? []);
  const itemCount: Record<string, number> = {};
  for (const l of allLines) { itemCount[l.item_name_snapshot] = (itemCount[l.item_name_snapshot] || 0) + 1; }
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topChartData = topItems.map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, count, fullName: name }));

  if (topChartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={topChartData} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as { fullName: string; count: number };
          return (
            <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl">
              <p className="text-zinc-200 font-medium mb-0.5">{d.fullName}</p>
              <p className="text-blue-400 font-semibold">{d.count}×</p>
            </div>
          );
        }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {topChartData.map((_, i) => <Cell key={i} fill="#60a5fa" fillOpacity={1 - i * 0.07} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function BackupAnalyticsSection({ isAdmin }: { isAdmin: boolean }) {
  const [city, setCity]             = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<string>("");
  const [dateFrom, setDateFrom]     = useState(weekAgoStr);
  const [dateTo, setDateTo]         = useState(todayStr);
  const [reports, setReports]       = useState<BackupReport[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [expanded, setExpanded]     = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ city, date_from: dateFrom, date_to: dateTo, limit: "200" });
      if (branchCode) p.set("branch_code", branchCode);
      const data = await apiFetch<{ reports: BackupReport[] }>(`/api/admin/backup/reports?${p}`);
      setReports(data.reports ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [city, branchCode, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleLineSaved = (reportId: number, updated: BackupLine) => {
    setReports((prev) => prev.map((r) => r.id !== reportId ? r : { ...r, lines: r.lines.map((l) => l.id === updated.id ? updated : l) }));
    setEditingLine(null);
  };

  const totalNeedsReview = reports.reduce((s, r) => s + (r.lines ?? []).filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot)).length, 0);

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Backup Report Analytics</span>
          {totalNeedsReview > 0 && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-3 w-3" />{totalNeedsReview} needs review
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={`${T_LABEL} block mb-1`}>City</label>
            <select className={`${SELECT_CLASS} w-32`} value={city} onChange={(e) => { setCity(e.target.value as City); setBranchCode(""); }}>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1`}>Branch</label>
            <select className={`${SELECT_CLASS} w-40`} value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
              <option value="">All branches</option>
              {BRANCHES[city].map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="min-w-0 overflow-hidden">
            <label className={`${T_LABEL} block mb-1`}>From</label>
            <input type="date" className={`${INPUT_CLASS} w-36`} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="min-w-0 overflow-hidden">
            <label className={`${T_LABEL} block mb-1`}>To</label>
            <input type="date" className={`${INPUT_CLASS} w-36`} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button onClick={load} className={SMALL_BUTTON}>Reload</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {loading && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}

      {!loading && reports.length > 0 && <SummaryStats reports={reports} city={city} />}

      {/* Reports list */}
      {!loading && (
        <div className="space-y-2">
          {reports.length === 0 && <p className="text-sm text-zinc-500">No reports found for this period.</p>}
          {reports.map((r) => {
            const freeLines = (r.lines ?? []).filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot));
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} className={`overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-blue-500/30 bg-blue-500/5" : "border-white/8 bg-white/3 hover:border-blue-500/20"}`}>
                <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                  onClick={() => { setExpanded(isExpanded ? null : r.id); setEditingLine(null); }}>
                  <span className="font-mono text-xs text-zinc-600">#{r.id}</span>
                  <span className="text-sm font-bold text-white">{r.report_date}</span>
                  <span className="rounded-md bg-white/8 px-2 py-0.5 text-xs font-medium text-zinc-300">{r.branch_code}</span>
                  <span className={BADGE_INFO}>{r.shift}</span>
                  <span className="text-xs text-zinc-500">by {r.reported_by}</span>
                  {freeLines.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/25 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                      <AlertTriangle className="h-2.5 w-2.5" />{freeLines.length} review
                    </span>
                  )}
                  <span className="ml-auto text-xs text-zinc-600">{r.lines?.length ?? 0} items</span>
                  <svg className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-2">
                    {r.notes && <p className="text-xs italic text-zinc-400 mb-2">{r.notes}</p>}
                    <div className="overflow-x-auto rounded-xl border border-white/8">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-4 py-2.5 text-left">Section</th>
                            <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-4 py-2.5 text-left">Item</th>
                            <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-right">Qty</th>
                            <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-left">Unit</th>
                            {isAdmin && <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-3 py-2.5 text-center w-16">Edit</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(r.lines ?? []).map((l) => (
                            <>
                              <tr key={l.id} className={TABLE_ROW}>
                                <td className={`${TABLE_CELL} px-4 w-36`}>{sectionBadge(l.section)}</td>
                                <td className={`${TABLE_CELL} px-4`}>
                                  <span className={(l.section === "free" || !l.item_category) ? "text-amber-300 font-medium" : "text-zinc-200"}>
                                    {l.item_name_snapshot}
                                  </span>
                                  {(l.section === "free" || !l.item_category) && l.item_name_snapshot && (
                                    <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-500">FREE</span>
                                  )}
                                </td>
                                <td className={`${TABLE_CELL} px-3 text-right font-mono font-semibold text-white`}>{l.quantity}</td>
                                <td className={`${TABLE_CELL} px-3 text-zinc-400`}>{l.unit}</td>
                                {isAdmin && (
                                  <td className={`${TABLE_CELL} px-3 text-center`}>
                                    <button onClick={() => setEditingLine(editingLine === l.id ? null : l.id)}
                                      className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${editingLine === l.id ? "bg-violet-500/20 text-violet-300" : "text-violet-400 hover:text-violet-300"}`}>
                                      {editingLine === l.id ? "✕" : "Edit"}
                                    </button>
                                  </td>
                                )}
                              </tr>
                              {isAdmin && editingLine === l.id && (
                                <tr key={`edit_${l.id}`}>
                                  <td colSpan={5} className="px-4 pb-3 pt-1">
                                    <EditLineForm line={l} onSave={(u) => handleLineSaved(r.id, u)} onCancel={() => setEditingLine(null)} />
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
