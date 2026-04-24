"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import {
  BADGE_INFO, BADGE_WARNING,
  GLASS_CARD, INPUT_CLASS, SELECT_CLASS, SMALL_BUTTON,
  T_LABEL, TABLE_CELL, TABLE_ROW,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackupLine {
  id: number;
  section: string;
  item_type: string;
  item_name_snapshot: string;
  item_category: string;
  quantity: number;
  unit: string;
  notes: string;
}

interface BackupReport {
  id: number;
  city: string;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  notes: string;
  status: string;
  created_at: string;
  lines: BackupLine[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
}

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
  if (!res.ok) {
    const j = text ? JSON.parse(text) : {};
    throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
  }
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

function sectionBadge(s: string) {
  const label = SECTION_LABELS[s] ?? s;
  if (s === "rolls") return <span className={BADGE_INFO}>{label}</span>;
  if (s === "free")  return <span className={BADGE_WARNING}>{label}</span>;
  return <span className="text-[11px] bg-white/8 text-zinc-400 px-2 py-0.5 rounded-full">{label}</span>;
}

// ─── Edit Line Form ───────────────────────────────────────────────────────────

function EditLineForm({
  line, onSave, onCancel,
}: {
  line: BackupLine;
  onSave: (updated: BackupLine) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(line.item_name_snapshot);
  const [qty, setQty] = useState(String(line.quantity));
  const [unit, setUnit] = useState(line.unit);
  const [notes, setNotes] = useState(line.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/api/admin/backup/line/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          item_name_snapshot: name.trim(),
          quantity: parseFloat(qty) || 0,
          unit: unit.trim(),
          notes: notes.trim(),
        }),
      });
      onSave({ ...line, item_name_snapshot: name.trim(), quantity: parseFloat(qty) || 0, unit: unit.trim(), notes: notes.trim() });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={`${T_LABEL} block mb-1`}>Item Name</label>
          <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} block mb-1`}>Qty</label>
          <input type="number" inputMode="decimal" className={INPUT_CLASS} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} block mb-1`}>Unit</label>
          <input className={INPUT_CLASS} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} block mb-1`}>Notes</label>
          <input className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats({ reports }: { reports: BackupReport[] }) {
  const allLines = reports.flatMap((r) => r.lines ?? []);
  const total = allLines.length;

  // Group by section
  const bySection: Record<string, number> = {};
  for (const l of allLines) {
    const s = l.section || "free";
    bySection[s] = (bySection[s] || 0) + 1;
  }

  // Free-form (section === "free" or no item_category)
  const freeForm = allLines.filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot)).length;

  // Top 8 items by frequency
  const itemCount: Record<string, number> = {};
  for (const l of allLines) { itemCount[l.item_name_snapshot] = (itemCount[l.item_name_snapshot] || 0) + 1; }
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
      <div className={`${GLASS_CARD} p-4 text-center`}>
        <p className="text-xs text-zinc-500 mb-1">Reports</p>
        <p className="text-2xl font-bold text-white">{reports.length}</p>
      </div>
      <div className={`${GLASS_CARD} p-4 text-center`}>
        <p className="text-xs text-zinc-500 mb-1">Total Lines</p>
        <p className="text-2xl font-bold text-white">{total}</p>
      </div>
      <div className={`${GLASS_CARD} p-4 text-center`}>
        <p className="text-xs text-zinc-500 mb-1">Free-form</p>
        <p className="text-2xl font-bold text-amber-400">{freeForm}</p>
      </div>
      <div className={`${GLASS_CARD} p-4`}>
        <p className="text-xs text-zinc-500 mb-2">By Section</p>
        <div className="space-y-1">
          {Object.entries(bySection).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
            <div key={s} className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 truncate">{SECTION_LABELS[s] ?? s}</span>
              <span className="text-xs font-semibold text-white">{count}</span>
            </div>
          ))}
        </div>
      </div>
      {topItems.length > 0 && (
        <div className={`${GLASS_CARD} p-4 col-span-2 sm:col-span-4`}>
          <p className="text-xs text-zinc-500 mb-2">Top Backup Items</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {topItems.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-1 text-xs">
                <span className="text-zinc-300 truncate">{name}</span>
                <span className="shrink-0 font-semibold text-violet-400">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export default function BackupAnalyticsSection({ isAdmin }: { isAdmin: boolean }) {
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(weekAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [reports, setReports] = useState<BackupReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ city, date_from: dateFrom, date_to: dateTo, limit: "200" });
      if (branchCode) p.set("branch_code", branchCode);
      const data = await apiFetch<{ reports: BackupReport[] }>(`/api/admin/backup/reports?${p}`);
      setReports(data.reports ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, branchCode, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleLineSaved = (reportId: number, updated: BackupLine) => {
    setReports((prev) => prev.map((r) =>
      r.id !== reportId ? r : { ...r, lines: r.lines.map((l) => l.id === updated.id ? updated : l) }
    ));
    setEditingLine(null);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`${GLASS_CARD} p-4`}>
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

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}

      {!loading && reports.length > 0 && <SummaryStats reports={reports} />}

      {/* Reports list */}
      <div className="space-y-2">
        {reports.map((r) => {
          const freeLines = (r.lines ?? []).filter((l) => l.section === "free" || (!l.item_category && l.item_name_snapshot));
          return (
            <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              {/* Header row */}
              <div
                className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => { setExpanded(expanded === r.id ? null : r.id); setEditingLine(null); }}>
                <span className="font-mono text-xs text-zinc-500">#{r.id}</span>
                <span className="text-sm font-semibold text-white">{r.report_date}</span>
                <span className="text-xs text-zinc-400">{r.branch_code}</span>
                <span className={BADGE_INFO}>{r.shift}</span>
                <span className="text-xs text-zinc-400">by {r.reported_by}</span>
                {freeLines.length > 0 && (
                  <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                    {freeLines.length} needs review
                  </span>
                )}
                <span className="text-xs text-zinc-500 ml-auto">{r.lines?.length ?? 0} items</span>
              </div>

              {expanded === r.id && (
                <div className="border-t border-white/8 px-4 py-3 space-y-2">
                  {r.notes && <p className="text-xs text-zinc-400 italic mb-2">{r.notes}</p>}
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Section</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Item</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-right">Qty</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left pl-2">Unit</th>
                        {isAdmin && <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-center w-16">Edit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(r.lines ?? []).map((l) => (
                        <>
                          <tr key={l.id} className={TABLE_ROW}>
                            <td className={`${TABLE_CELL} w-24`}>{sectionBadge(l.section)}</td>
                            <td className={TABLE_CELL}>
                              <span className={(l.section === "free" || !l.item_category) ? "text-amber-300" : "text-white"}>
                                {l.item_name_snapshot}
                              </span>
                              {(l.section === "free" || !l.item_category) && l.item_name_snapshot && (
                                <span className="ml-1.5 text-[10px] text-amber-500 font-semibold">FREE</span>
                              )}
                            </td>
                            <td className={`${TABLE_CELL} text-right font-mono`}>{l.quantity}</td>
                            <td className={`${TABLE_CELL} pl-2 text-zinc-400`}>{l.unit}</td>
                            {isAdmin && (
                              <td className={`${TABLE_CELL} text-center`}>
                                <button
                                  onClick={() => setEditingLine(editingLine === l.id ? null : l.id)}
                                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors px-2 py-1">
                                  {editingLine === l.id ? "x" : "Edit"}
                                </button>
                              </td>
                            )}
                          </tr>
                          {isAdmin && editingLine === l.id && (
                            <tr key={`edit_${l.id}`}>
                              <td colSpan={5} className="pb-3 pt-1">
                                <EditLineForm
                                  line={l}
                                  onSave={(updated) => handleLineSaved(r.id, updated)}
                                  onCancel={() => setEditingLine(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!loading && reports.length === 0 && (
          <p className="text-sm text-zinc-500">No reports found for this period.</p>
        )}
      </div>
    </div>
  );
}
