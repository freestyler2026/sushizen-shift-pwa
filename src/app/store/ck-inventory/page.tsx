"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  Loader2, Lock, Package, Plus, Save, X,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
  T_CAPTION, T_PAGE_TITLE, T_SECTION,
  BADGE_SUCCESS, KPI_CARD,
} from "@/lib/ui-tokens";

// ── Types ──────────────────────────────────────────────────────────────────

type SessionType = "pre_delivery" | "post_delivery" | "daily";

type ProcessedItem = {
  id: number;
  name: string;
  category: string;
  output_unit: string;
};

type InventoryEntry = {
  item_id: number;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  notes: string;
  updated_at?: string;
};

type Session = {
  id: number;
  city: string;
  session_type: SessionType;
  session_date: string;
  notes: string;
  created_by: string;
  is_finalized: boolean;
  created_at: string;
  updated_at: string;
  entry_count?: number;
  total_quantity?: number;
  entries?: InventoryEntry[];
  prev_quantities?: Record<number, { quantity: number; unit: string }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function sessionTypeLabel(t: SessionType | string) {
  if (t === "pre_delivery") return "Pre-Delivery";
  if (t === "post_delivery") return "Post-Delivery";
  return "Daily";
}

function sessionTypeBadge(t: SessionType | string) {
  if (t === "pre_delivery") return "bg-blue-500/15 text-blue-300 border-blue-500/25";
  if (t === "post_delivery") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  return "bg-violet-500/15 text-violet-300 border-violet-500/25";
}

const AVAILABLE_UNITS = ["pc", "g", "kg", "ml", "L", "portion", "tray", "bag", "pack", "box"];

async function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers = { "Content-Type": "application/json", ...getAuthHeaders(auth) };
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers || {}) } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = txt;
    try { msg = JSON.parse(txt)?.detail || txt; } catch { /* */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CKInventoryPage() {
  const auth = getAuth();
  const city = (auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";

  // ── State ────────────────────────────────────────────────────────────────
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Draft entries: item_id → {quantity, unit, notes}
  const [draftEntries, setDraftEntries] = useState<Record<number, { quantity: string; unit: string; notes: string }>>({});

  // Collapsed categories
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  // New session modal
  const [showNewSession, setShowNewSession] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [newType, setNewType] = useState<SessionType>("daily");
  const [newNotes, setNewNotes] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);

  // Finalize confirm
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-inventory/items?city=${encodeURIComponent(city)}`);
      setProcessedItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-inventory/sessions?city=${encodeURIComponent(city)}&limit=30`);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city]);

  const loadSession = useCallback(async (sessionId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/store/ck-inventory/sessions/${sessionId}`);
      const sess: Session = data?.session;
      if (!sess) throw new Error("Session not found");
      setActiveSession(sess);

      // Initialize draft entries from existing entries
      const draft: Record<number, { quantity: string; unit: string; notes: string }> = {};
      // First, populate all processed items with defaults
      for (const item of processedItems) {
        draft[item.id] = { quantity: "", unit: item.output_unit || "pc", notes: "" };
      }
      // Override with saved entries
      for (const entry of sess.entries || []) {
        draft[entry.item_id] = {
          quantity: entry.quantity > 0 ? String(entry.quantity) : "",
          unit: entry.unit || "pc",
          notes: entry.notes || "",
        };
      }
      setDraftEntries(draft);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [processedItems]);

  useEffect(() => {
    void loadItems();
    void loadSessions();
  }, [loadItems, loadSessions]);

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    if (!activeSession || !processedItems.length) return null;
    const filledCount = Object.values(draftEntries).filter(e => e.quantity !== "" && Number(e.quantity) >= 0).length;
    const totalItems = processedItems.length;
    const prevMap = activeSession.prev_quantities || {};
    const prevCount = Object.keys(prevMap).length;
    return { filledCount, totalItems, prevCount };
  }, [activeSession, processedItems, draftEntries]);

  // ── Grouped items ─────────────────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const groups: Record<string, ProcessedItem[]> = {};
    for (const item of processedItems) {
      const cat = item.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [processedItems]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const createSession = async () => {
    if (!newDate) return;
    setCreatingSession(true);
    setError(null);
    try {
      const data = await apiFetch("/api/store/ck-inventory/sessions", {
        method: "POST",
        body: JSON.stringify({
          city,
          session_type: newType,
          session_date: newDate,
          notes: newNotes,
          created_by: auth?.staffName || "",
        }),
      });
      setShowNewSession(false);
      setNewNotes("");
      await loadSessions();
      if (data?.session?.id) await loadSession(data.session.id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreatingSession(false);
    }
  };

  const saveEntries = useCallback(async () => {
    if (!activeSession || activeSession.is_finalized) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const entries = processedItems
        .filter(item => draftEntries[item.id]?.quantity !== "")
        .map(item => ({
          item_id: item.id,
          item_name: item.name,
          category: item.category || "",
          quantity: Number(draftEntries[item.id]?.quantity || 0),
          unit: draftEntries[item.id]?.unit || item.output_unit || "pc",
          notes: draftEntries[item.id]?.notes || "",
        }));

      await apiFetch(`/api/store/ck-inventory/sessions/${activeSession.id}/entries`, {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
      setSuccessMsg(`Saved ${entries.length} items.`);
      await loadSessions();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [activeSession, processedItems, draftEntries, loadSessions]);

  const finalizeSession = async () => {
    if (!activeSession) return;
    setFinalizing(true);
    setError(null);
    try {
      // Save first, then finalize
      await saveEntries();
      await apiFetch(`/api/store/ck-inventory/sessions/${activeSession.id}/finalize`, { method: "POST" });
      setShowFinalizeConfirm(false);
      setSuccessMsg("Session finalized and locked.");
      await loadSessions();
      await loadSession(activeSession.id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setFinalizing(false);
    }
  };

  const updateEntry = (itemId: number, field: "quantity" | "unit" | "notes", value: string) => {
    setDraftEntries(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>CK Daily Inventory</h1>
            <p className={T_CAPTION + " mt-1"}>
              Record and track CK production inventory — pre/post delivery and daily checks.
            </p>
          </div>
          <button
            onClick={() => setShowNewSession(true)}
            className={`${PRIMARY_BUTTON} flex items-center gap-2`}
          >
            <Plus className="h-4 w-4" />
            New Session
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">

          {/* ── Left: Session List ─────────────────────────────────────────── */}
          <div className={`${GLASS_CARD} p-4 h-fit sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto`}>
            <h2 className={`${T_SECTION} mb-3`}>Sessions</h2>

            {sessions.length === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] py-8 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                <p className={T_CAPTION}>No sessions yet.<br />Create the first one.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map(sess => (
                  <button
                    key={sess.id}
                    onClick={() => void loadSession(sess.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      activeSession?.id === sess.id
                        ? "border-violet-500/40 bg-violet-500/10"
                        : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{fmtDate(sess.session_date)}</div>
                        <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sessionTypeBadge(sess.session_type)}`}>
                          {sessionTypeLabel(sess.session_type)}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        {sess.is_finalized ? (
                          <Lock className="h-3.5 w-3.5 text-zinc-500 mt-0.5" />
                        ) : (
                          <span className="text-[10px] text-amber-400">Draft</span>
                        )}
                        <div className="text-[10px] text-zinc-500 mt-0.5">{sess.entry_count || 0} items</div>
                      </div>
                    </div>
                    {sess.notes && (
                      <p className="mt-1.5 text-[11px] text-zinc-500 truncate">{sess.notes}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Active Session ──────────────────────────────────────── */}
          <div>
            {!activeSession ? (
              <div className={`${GLASS_CARD} py-24 text-center`}>
                <Package className="mx-auto h-12 w-12 text-zinc-700 mb-3" />
                <p className="text-zinc-500">Select a session from the left,<br />or create a new one.</p>
              </div>
            ) : loading ? (
              <div className={`${GLASS_CARD} py-24 flex items-center justify-center gap-2`}>
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                <span className="text-zinc-400">Loading session…</span>
              </div>
            ) : (
              <>
                {/* Session header */}
                <div className={`${GLASS_CARD} p-5 mb-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className={T_SECTION}>{fmtDate(activeSession.session_date)}</h2>
                        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${sessionTypeBadge(activeSession.session_type)}`}>
                          {sessionTypeLabel(activeSession.session_type)}
                        </span>
                        {activeSession.is_finalized && (
                          <span className="flex items-center gap-1 rounded border border-zinc-600/40 bg-zinc-700/20 px-2 py-0.5 text-[11px] text-zinc-400">
                            <Lock className="h-3 w-3" /> Finalized
                          </span>
                        )}
                      </div>
                      {activeSession.notes && (
                        <p className={T_CAPTION}>{activeSession.notes}</p>
                      )}
                      {activeSession.created_by && (
                        <p className={T_CAPTION}>Created by: {activeSession.created_by}</p>
                      )}
                    </div>

                    {!activeSession.is_finalized && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void saveEntries()}
                          disabled={saving}
                          className={`${SECONDARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save Draft
                        </button>
                        <button
                          onClick={() => setShowFinalizeConfirm(true)}
                          disabled={saving}
                          className={`${PRIMARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Finalize
                        </button>
                      </div>
                    )}
                  </div>

                  {/* KPI row */}
                  {kpi && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className={KPI_CARD}>
                        <div className={T_CAPTION}>Total Items</div>
                        <div className="mt-1 text-xl font-semibold text-white">{kpi.totalItems}</div>
                      </div>
                      <div className={KPI_CARD}>
                        <div className={T_CAPTION}>Filled In</div>
                        <div className={`mt-1 text-xl font-semibold ${kpi.filledCount === kpi.totalItems ? "text-emerald-400" : "text-amber-400"}`}>
                          {kpi.filledCount}
                        </div>
                      </div>
                      <div className={KPI_CARD}>
                        <div className={T_CAPTION}>Prev Session</div>
                        <div className={`mt-1 text-xl font-semibold ${kpi.prevCount > 0 ? "text-sky-400" : "text-zinc-500"}`}>
                          {kpi.prevCount > 0 ? `${kpi.prevCount} items` : "None"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Item groups */}
                {processedItems.length === 0 ? (
                  <div className={`${GLASS_CARD} py-16 text-center`}>
                    <p className={T_CAPTION}>No processed items found for {city}.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(groupedItems).map(([category, items]) => {
                      const isCollapsed = collapsedCats.has(category);
                      const filledInGroup = items.filter(i => draftEntries[i.id]?.quantity !== "").length;
                      return (
                        <div key={category} className={GLASS_CARD}>
                          {/* Category header */}
                          <button
                            onClick={() => toggleCategory(category)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors rounded-2xl"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? <ChevronRight className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                              <span className="font-semibold text-white">{category}</span>
                              <span className={T_CAPTION}>({items.length} items)</span>
                            </div>
                            <span className={`text-xs font-medium ${filledInGroup === items.length ? "text-emerald-400" : "text-amber-400"}`}>
                              {filledInGroup}/{items.length} filled
                            </span>
                          </button>

                          {!isCollapsed && (
                            <div className="border-t border-white/5">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className={`${TABLE_HEADER} px-5 text-left py-2`}>Item</th>
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-32`}>Qty</th>
                                    <th className={`${TABLE_HEADER} px-3 text-left py-2 w-28`}>Unit</th>
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-24`}>Previous</th>
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-20`}>Delta</th>
                                    <th className={`${TABLE_HEADER} px-5 text-left py-2`}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(item => {
                                    const draft = draftEntries[item.id] || { quantity: "", unit: item.output_unit || "pc", notes: "" };
                                    const currentQty = draft.quantity !== "" ? Number(draft.quantity) : null;
                                    const prev = activeSession.prev_quantities?.[item.id];
                                    const prevQty = prev?.quantity ?? null;
                                    const delta = currentQty !== null && prevQty !== null ? currentQty - prevQty : null;
                                    const deltaColor = delta === null ? "" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-zinc-500";
                                    const isFinalized = activeSession.is_finalized;
                                    return (
                                      <tr key={item.id} className={TABLE_ROW}>
                                        <td className={`${TABLE_CELL} px-5 font-medium`}>{item.name}</td>
                                        <td className={`${TABLE_CELL} px-3`}>
                                          {isFinalized ? (
                                            <span className="block text-right tabular-nums text-white">
                                              {currentQty !== null ? currentQty : "—"}
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.1"
                                              value={draft.quantity}
                                              onChange={e => updateEntry(item.id, "quantity", e.target.value)}
                                              placeholder="0"
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-right text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none tabular-nums"
                                            />
                                          )}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3`}>
                                          {isFinalized ? (
                                            <span className="text-zinc-400">{draft.unit}</span>
                                          ) : (
                                            <select
                                              value={draft.unit}
                                              onChange={e => updateEntry(item.id, "unit", e.target.value)}
                                              className="w-full rounded-lg border border-white/10 bg-neutral-800 px-2 py-1 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                                            >
                                              {[...new Set([draft.unit, ...AVAILABLE_UNITS])].map(u => (
                                                <option key={u} value={u}>{u}</option>
                                              ))}
                                            </select>
                                          )}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3 text-right tabular-nums text-zinc-500`}>
                                          {prevQty !== null ? `${prevQty} ${prev?.unit || ""}` : "—"}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3 text-right tabular-nums font-medium ${deltaColor}`}>
                                          {delta !== null ? (delta > 0 ? `+${Number.isInteger(delta) ? delta : delta.toFixed(1)}` : `${Number.isInteger(delta) ? delta : delta.toFixed(1)}`) : "—"}
                                        </td>
                                        <td className={`${TABLE_CELL} px-5`}>
                                          {isFinalized ? (
                                            <span className="text-zinc-500">{draft.notes || "—"}</span>
                                          ) : (
                                            <input
                                              type="text"
                                              value={draft.notes}
                                              onChange={e => updateEntry(item.id, "notes", e.target.value)}
                                              placeholder="Optional note"
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Bottom Save bar */}
                    {!activeSession.is_finalized && (
                      <div className="sticky bottom-4 flex justify-end gap-3 pt-2">
                        <div className="flex gap-2 rounded-2xl border border-white/10 bg-neutral-900/90 p-2 backdrop-blur-sm shadow-2xl">
                          <button
                            onClick={() => void saveEntries()}
                            disabled={saving}
                            className={`${SECONDARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save Draft
                          </button>
                          <button
                            onClick={() => setShowFinalizeConfirm(true)}
                            disabled={saving}
                            className={`${PRIMARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Finalize & Lock
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── New Session Modal ─────────────────────────────────────────────── */}
      {showNewSession && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowNewSession(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={T_SECTION}>New Inventory Session</h2>
              <button onClick={() => setShowNewSession(false)} className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block ${T_CAPTION} mb-1`}>Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className={`block ${T_CAPTION} mb-1`}>Session Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as SessionType)}
                  className="w-full rounded-xl border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                >
                  <option value="pre_delivery">Pre-Delivery</option>
                  <option value="post_delivery">Post-Delivery</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
              <div>
                <label className={`block ${T_CAPTION} mb-1`}>Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="e.g. After Monday delivery"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowNewSession(false)} className={`${SECONDARY_BUTTON} flex-1 py-2 text-sm`}>
                Cancel
              </button>
              <button
                onClick={() => void createSession()}
                disabled={!newDate || creatingSession}
                className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-50`}
              >
                {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Session
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Finalize Confirm Modal ─────────────────────────────────────────── */}
      {showFinalizeConfirm && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowFinalizeConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-amber-400 shrink-0" />
              <h2 className={T_SECTION}>Finalize Session?</h2>
            </div>
            <p className="mb-6 text-sm text-zinc-400">
              This will save all entries and lock the session. It cannot be edited after finalization.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowFinalizeConfirm(false)} className={`${SECONDARY_BUTTON} flex-1 py-2 text-sm`}>
                Cancel
              </button>
              <button
                onClick={() => void finalizeSession()}
                disabled={finalizing}
                className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-50`}
              >
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Finalize
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
