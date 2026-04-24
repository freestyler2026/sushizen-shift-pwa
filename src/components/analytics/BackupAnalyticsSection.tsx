"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Package, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
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

const SECTION_LABELS: Record<string, string> = {
  supplies:  "Condiments & Supplies",
  packaging: "Packaging",
  prep:      "Prepared Ingredients",
  toppings:  "Toppings & Flakes",
  rolls:     "Sushi Rolls",
  free:      "Free Entry",
};
const SECTION_COLORS: Record<string, string> = {
  supplies:  "#60a5fa",
  packaging: "#a78bfa",
  prep:      "#34d399",
  toppings:  "#fb923c",
  rolls:     "#f472b6",
  free:      "#fbbf24",
};

function sectionBadge(s: string) {
  const label = SECTION_LABELS[s] ?? s;
  const color = SECTION_COLORS[s];
  if (s === "free") return <span className={BADGE_WARNING}>{label}</span>;
  if (s === "rolls") return <span className={BADGE_INFO}>{label}</span>;
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

// ─── Summary Stats ────────────────────────────────────────────────────────────
function SummaryStats({ reports }: { reports: BackupReport[] }) {
  const allLines = reports.flatMap((r) => r.lines ?? []);
  const total    = allLines.length;
  const freeForm = allLines.filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot)).length;

  // By section
  const bySection: Record<string, number> = {};
  for (const l of allLines) { const s = l.section || "free"; bySection[s] = (bySection[s] || 0) + 1; }
  const sectionEntries = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
  const maxSection = Math.max(...sectionEntries.map(([, c]) => c), 1);

  // Top 10 items by frequency
  const itemCount: Record<string, number> = {};
  for (const l of allLines) { itemCount[l.item_name_snapshot] = (itemCount[l.item_name_snapshot] || 0) + 1; }
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topChartData = topItems.map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, count, fullName: name }));

  return (
    <div className="space-y-3">
      {/* KPI row */}
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
          <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Needs Review</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">{freeForm}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">free-form entries</p>
        </div>
        {/* By section */}
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

      {/* Top items chart */}
      {topChartData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Most Reported Backup Items</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topChartData} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as {fullName: string; count: number};
                return (
                  <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl">
                    <p className="text-zinc-200 font-medium mb-0.5">{d.fullName}</p>
                    <p className="text-blue-400 font-semibold">{d.count}×</p>
                  </div>
                );
              }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {topChartData.map((_, i) => (
                  <Cell key={i} fill="#60a5fa" fillOpacity={1 - i * 0.07} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function BackupAnalyticsSection({ isAdmin }: { isAdmin: boolean }) {
  const [city, setCity]           = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<string>("");
  const [dateFrom, setDateFrom]   = useState(weekAgoStr);
  const [dateTo, setDateTo]       = useState(todayStr);
  const [reports, setReports]     = useState<BackupReport[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [expanded, setExpanded]   = useState<number | null>(null);
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

      {!loading && reports.length > 0 && <SummaryStats reports={reports} />}

      {/* Reports list */}
      {!loading && (
        <div className="space-y-2">
          {reports.length === 0 && <p className="text-sm text-zinc-500">No reports found for this period.</p>}
          {reports.map((r) => {
            const freeLines = (r.lines ?? []).filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot));
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} className={`overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-blue-500/30 bg-blue-500/5" : "border-white/8 bg-white/3 hover:border-blue-500/20"}`}>
                {/* Header */}
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
