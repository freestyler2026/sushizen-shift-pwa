"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City } from "@/lib/branches";
import {
  BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  GLASS_CARD, INPUT_CLASS, SELECT_CLASS, SMALL_BUTTON,
  T_CARD_TITLE, T_LABEL, TABLE_CELL, TABLE_ROW,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type DisposalReason = "eod_leftover" | "spoilage" | "staff_meal" | "other";

const REASON_LABELS: Record<DisposalReason, string> = {
  eod_leftover: "End-of-Day Leftover",
  spoilage:     "Spoilage",
  staff_meal:   "Staff Meal",
  other:        "Other",
};

interface DisposalLine {
  id: number;
  item_type: string;
  item_name_snapshot: string;
  item_category: string;
  quantity: number;
  unit: string;
  disposal_reason: string;
  notes: string;
}

interface DisposalReport {
  id: number;
  city: string;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  notes: string;
  status: string;
  created_at: string;
  lines: DisposalLine[];
}

interface SearchItem {
  id: number;
  item_type: "menu_item" | "ingredient";
  category: string;
  name: string;
  default_unit: string;
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

function reasonBadge(r: string) {
  if (r === "spoilage")     return <span className={BADGE_ERROR}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
  if (r === "staff_meal")   return <span className={BADGE_SUCCESS}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
  if (r === "eod_leftover") return <span className={BADGE_WARNING}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
  return <span className={BADGE_INFO}>{r}</span>;
}

// ─── Item Search (for Edit) ───────────────────────────────────────────────────

function ItemSearchInline({ city, onSelect }: { city: City; onSelect: (item: SearchItem) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const search = useCallback(async (val: string) => {
    if (!val.trim()) { setResults([]); setOpen(false); return; }
    try {
      const data = await apiFetch<{ items: SearchItem[] }>(
        `/api/admin/disposal/items/search?city=${city}&q=${encodeURIComponent(val)}&limit=10`
      );
      setResults(data.items ?? []); setOpen(true);
    } catch { setResults([]); }
  }, [city]);

  return (
    <div ref={wrapRef} className="relative">
      <input className="w-full rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-violet-400"
        value={q} placeholder="Search to link proper item..."
        onChange={(e) => {
          setQ(e.target.value);
          if (debRef.current) clearTimeout(debRef.current);
          debRef.current = setTimeout(() => search(e.target.value), 250);
        }} />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
          {results.map((item) => (
            <button key={`${item.item_type}_${item.id}`} type="button"
              onMouseDown={() => { onSelect(item); setQ(""); setResults([]); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-500/15 transition-colors">
              <span className="text-[10px] text-zinc-500 w-10 uppercase">{item.item_type === "menu_item" ? "MENU" : "INGR"}</span>
              <span className="flex-1 text-white">{item.name}</span>
              <span className="text-xs text-violet-400">{item.default_unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Line Form ───────────────────────────────────────────────────────────

function EditLineForm({
  line, city, onSave, onCancel,
}: {
  line: DisposalLine; city: City;
  onSave: (updated: DisposalLine) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(line.item_name_snapshot);
  const [qty, setQty] = useState(String(line.quantity));
  const [unit, setUnit] = useState(line.unit);
  const [reason, setReason] = useState(line.disposal_reason);
  const [notes, setNotes] = useState(line.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/api/admin/disposal/line/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          item_name_snapshot: name.trim(),
          quantity: parseFloat(qty) || 0,
          unit: unit.trim(),
          disposal_reason: reason,
          notes: notes.trim(),
        }),
      });
      onSave({ ...line, item_name_snapshot: name.trim(), quantity: parseFloat(qty) || 0, unit: unit.trim(), disposal_reason: reason, notes: notes.trim() });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const linkItem = async (item: SearchItem) => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/api/admin/disposal/line/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          item_name_snapshot: item.name,
          item_category: item.category,
          item_id: item.id,
          item_type: item.item_type,
          unit: item.default_unit,
        }),
      });
      onSave({ ...line, item_name_snapshot: item.name, item_category: item.category, unit: item.default_unit });
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
          <label className={`${T_LABEL} block mb-1`}>Link to DB Item</label>
          <ItemSearchInline city={city} onSelect={linkItem} />
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
          <label className={`${T_LABEL} block mb-1`}>Reason</label>
          <select className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value)}>
            {(Object.keys(REASON_LABELS) as DisposalReason[]).map((r) => (
              <option key={r} value={r}>{REASON_LABELS[r]}</option>
            ))}
          </select>
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

function SummaryStats({ reports }: { reports: DisposalReport[] }) {
  const allLines = reports.flatMap((r) => r.lines ?? []);
  const total = allLines.length;
  const byReason = Object.keys(REASON_LABELS).map((r) => ({
    reason: r, label: REASON_LABELS[r as DisposalReason],
    count: allLines.filter((l) => l.disposal_reason === r).length,
  })).filter((x) => x.count > 0);

  // Top 8 items by frequency
  const itemCount: Record<string, number> = {};
  for (const l of allLines) { itemCount[l.item_name_snapshot] = (itemCount[l.item_name_snapshot] || 0) + 1; }
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Free-form (no item_id in line — we can infer from item_category being empty or notes hint)
  const freeForm = allLines.filter((l) => !l.item_category && l.item_name_snapshot).length;

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
        <p className="text-xs text-zinc-500 mb-2">By Reason</p>
        <div className="space-y-1">
          {byReason.map((x) => (
            <div key={x.reason} className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 truncate">{x.label}</span>
              <span className="text-xs font-semibold text-white">{x.count}</span>
            </div>
          ))}
        </div>
      </div>
      {topItems.length > 0 && (
        <div className={`${GLASS_CARD} p-4 col-span-2 sm:col-span-4`}>
          <p className="text-xs text-zinc-500 mb-2">Top Disposal Items</p>
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

export default function DisposalAnalyticsSection({ isAdmin }: { isAdmin: boolean }) {
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(weekAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [reports, setReports] = useState<DisposalReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ city, date_from: dateFrom, date_to: dateTo, limit: "200" });
      if (branchCode) p.set("branch_code", branchCode);
      const data = await apiFetch<{ reports: DisposalReport[] }>(`/api/admin/disposal/reports?${p}`);
      setReports(data.reports ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, branchCode, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleLineSaved = (reportId: number, updated: DisposalLine) => {
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
          const freeLines = (r.lines ?? []).filter((l) => !l.item_category && l.item_name_snapshot);
          return (
            <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              {/* Header row */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
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
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Item</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-right">Qty</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left pl-2">Unit</th>
                        <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Reason</th>
                        {isAdmin && <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-center w-16">Edit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(r.lines ?? []).map((l) => (
                        <>
                          <tr key={l.id} className={TABLE_ROW}>
                            <td className={TABLE_CELL}>
                              <span className={!l.item_category ? "text-amber-300" : "text-white"}>
                                {l.item_name_snapshot}
                              </span>
                              {!l.item_category && (
                                <span className="ml-1.5 text-[10px] text-amber-500 font-semibold">FREE</span>
                              )}
                            </td>
                            <td className={`${TABLE_CELL} text-right font-mono`}>{l.quantity}</td>
                            <td className={`${TABLE_CELL} pl-2 text-zinc-400`}>{l.unit}</td>
                            <td className={TABLE_CELL}>{reasonBadge(l.disposal_reason)}</td>
                            {isAdmin && (
                              <td className={`${TABLE_CELL} text-center`}>
                                <button
                                  onClick={() => setEditingLine(editingLine === l.id ? null : l.id)}
                                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors px-2 py-1">
                                  {editingLine === l.id ? "×" : "Edit"}
                                </button>
                              </td>
                            )}
                          </tr>
                          {isAdmin && editingLine === l.id && (
                            <tr key={`edit_${l.id}`}>
                              <td colSpan={5} className="pb-3 pt-1">
                                <EditLineForm
                                  line={l} city={city}
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
