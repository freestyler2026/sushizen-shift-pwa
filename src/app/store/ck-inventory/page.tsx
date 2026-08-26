"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  Loader2, Lock, Unlock, Package, Plus, RefreshCw, Save, X, Trash2, Settings2, Users,
  AlertCircle,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
  T_CAPTION, T_PAGE_TITLE, T_SECTION,
  KPI_CARD,
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
  filled_by?: string;
  filled_at?: string;
  version?: number;
  updated_at?: string;
};

type Session = {
  id: number;
  city: string;
  session_type: SessionType;
  session_date: string;
  notes: string;
  created_by: string;
  contributors?: string;
  is_finalized: boolean;
  finalized_by?: string;
  finalized_at?: string | null;
  reopened_by?: string;
  reopened_at?: string | null;
  reopen_count?: number;
  is_archived?: boolean;
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

function parseContributors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
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

function isManager(auth: ReturnType<typeof getAuth>): boolean {
  const r = auth?.role || "";
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(r);
}

export default function CKInventoryPage() {
  const auth = getAuth();
  const myName = auth?.staffName || "";
  const canManage = isManager(auth);
  const [city, setCity] = useState<"manila" | "dubai">(
    canManage ? "manila" : ((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );

  // ── State ────────────────────────────────────────────────────────────────
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Draft entries: item_id → {quantity, unit, notes, version}
  const [draftEntries, setDraftEntries] = useState<Record<number, { quantity: string; unit: string; notes: string; version: number }>>({});

  // Track which items the current user has edited locally (unsaved)
  const dirtyItemIdsRef = useRef<Set<number>>(new Set());

  // Items the user has explicitly approved to overwrite (clears on session reload)
  const approvedOverwritesRef = useRef<Set<number>>(new Set());

  // Overwrite confirmation when editing an item owned by someone else
  const [overwriteConfirm, setOverwriteConfirm] = useState<{ itemId: number; filledBy: string } | null>(null);

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
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  // Anyone counting stock may close a day; undoing that is a supervisory act.
  const canReopen = ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT",
                     "MANILA_MANAGER", "MANAGER", "CK_MANILA"]
                     .includes((getAuth()?.role || "").toUpperCase());

  // The session that "New Session" would actually open, if any.
  const existingForNew = useMemo(
    () => sessions.find(s => s.session_date === newDate && s.session_type === newType) || null,
    [sessions, newDate, newType],
  );

  // Auto-refresh interval reference
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef<number | null>(null);

  // Manage items
  const [showManageItems, setShowManageItems] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pc");
  const [itemBusy, setItemBusy] = useState(false);
  const canManageItems = canManage && city === "manila";

  // Inline unit editing in Manage CK Items modal
  const [editUnitId, setEditUnitId] = useState<number | null>(null);
  const [editUnitVal, setEditUnitVal] = useState("");
  const [editUnitBusy, setEditUnitBusy] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-inventory/items?city=${encodeURIComponent(city)}`);
      setProcessedItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [city]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-inventory/sessions?city=${encodeURIComponent(city)}&limit=30`);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [city]);

  const loadSession = useCallback(async (sessionId: number, silent = false) => {
    const isNewSession = activeSessionIdRef.current !== sessionId;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await apiFetch(`/api/store/ck-inventory/sessions/${sessionId}`);
      const sess: Session = data?.session;
      if (!sess) throw new Error("Session not found");
      setActiveSession(sess);
      activeSessionIdRef.current = sess.id;
      // Only clear approval state when switching to a different session
      if (isNewSession) approvedOverwritesRef.current = new Set();

      setDraftEntries(prev => {
        const draft: Record<number, { quantity: string; unit: string; notes: string; version: number }> = {};
        // Initialize all items with defaults
        for (const item of processedItems) {
          draft[item.id] = prev[item.id] || { quantity: "", unit: item.output_unit || "pc", notes: "", version: 0 };
        }
        // Override with server entries — but skip items the user is actively editing
        for (const entry of sess.entries || []) {
          const isDirty = dirtyItemIdsRef.current.has(entry.item_id);
          if (!isDirty) {
            draft[entry.item_id] = {
              quantity: entry.quantity > 0 ? String(entry.quantity) : "",
              unit: entry.unit || "pc",
              notes: entry.notes || "",
              version: entry.version ?? 0,
            };
          }
        }
        return draft;
      });
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [processedItems]);

  // ── Auto-refresh every 30s for non-finalized sessions ─────────────────────
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (!activeSession || activeSession.is_finalized) return;

    refreshTimerRef.current = setInterval(async () => {
      const sid = activeSessionIdRef.current;
      if (!sid) return;
      await loadSession(sid, true); // silent refresh
      await loadSessions();
    }, 30_000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.is_finalized, loadSession, loadSessions]);

  // ── Auto-run merge migration once per browser session (managers only) ───────
  useEffect(() => {
    if (!canManage) return;
    const key = `ck_inv_migrated_${city}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    apiFetch("/api/store/ck-inventory/sessions/merge-migrate", { method: "POST" })
      .then((res) => {
        // The merge moves entries between sessions, so anything already on screen is
        // now out of date. Without this the first view of the day showed the
        // pre-merge state and the numbers only appeared after opening another
        // session and coming back — which is exactly how staff described it.
        // Only re-read when something actually moved, to avoid a pointless refetch.
        const moved = Number(res?.entries_moved ?? 0) > 0 || Number(res?.merged_groups ?? 0) > 0;
        if (!moved) return;
        void loadSessions();
        const sid = activeSessionIdRef.current;
        if (sid) void loadSession(sid, true);
      })
      .catch(() => { /* silent — the merge is best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, city]);

  // ── Manage items ─────────────────────────────────────────────────────────
  const createItem = async () => {
    if (!newItemName.trim()) return;
    setItemBusy(true);
    try {
      await apiFetch("/api/store/ck-inventory/items", {
        method: "POST",
        body: JSON.stringify({ city, name: newItemName.trim(), category: newItemCategory.trim(), unit: newItemUnit }),
      });
      setNewItemName(""); setNewItemCategory("");
      await loadItems();
      setSuccessMsg("Item added.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setItemBusy(false); }
  };

  const removeItem = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" from the CK item list? It will also be hidden from Daily Inventory (existing reports are kept).`)) return;
    setItemBusy(true);
    try {
      await apiFetch(`/api/store/ck-inventory/items/${id}?city=${encodeURIComponent(city)}`, { method: "DELETE" });
      await loadItems();
      setSuccessMsg("Item removed.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setItemBusy(false); }
  };

  const saveItemUnit = async (id: number) => {
    const unit = editUnitVal.trim();
    if (!unit) { setEditUnitId(null); return; }
    setEditUnitBusy(true);
    try {
      await apiFetch(`/api/store/ck-inventory/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ city, unit }),
      });
      setProcessedItems(prev => prev.map(it => it.id === id ? { ...it, output_unit: unit } : it));
      setEditUnitId(null);
      setSuccessMsg("Unit updated.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setEditUnitBusy(false); }
  };

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
    const contributors = parseContributors(activeSession.contributors);
    return { filledCount, totalItems, prevCount, contributors };
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

  // ── Entry map for quick lookup ─────────────────────────────────────────────
  const entryMap = useMemo(() => {
    const m: Record<number, InventoryEntry> = {};
    for (const e of activeSession?.entries || []) m[e.item_id] = e;
    return m;
  }, [activeSession]);

  // ── Grouped sessions by date ───────────────────────────────────────────────
  const sessionsByDate = useMemo(() => {
    const groups: Record<string, Session[]> = {};
    for (const s of sessions) {
      const key = `${s.session_date}::${s.session_type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    // Flatten: use the session with the most entries as the "primary" to display
    // (after migration there should be only 1 per key)
    return Object.entries(groups)
      .map(([, group]) => {
        const primary = group.reduce((best, s) =>
          (s.entry_count ?? 0) >= (best.entry_count ?? 0) ? s : best, group[0]);
        const totalItems = group.reduce((sum, s) => sum + (s.entry_count ?? 0), 0);
        const allContributors = [
          ...new Set(
            group.flatMap(s => [
              ...parseContributors(s.contributors),
              s.created_by,
            ]).filter(Boolean)
          ),
        ];
        return { ...primary, entry_count: totalItems, _mergedContributors: allContributors, _allIds: group.map(s => s.id) };
      })
      .sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at));
  }, [sessions]);

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
          created_by: myName,
        }),
      });
      setShowNewSession(false);
      setNewNotes("");
      dirtyItemIdsRef.current = new Set();
      const joined: boolean = data?.joined === true;
      const wasFinalized: boolean = data?.session?.is_finalized === true;
      setSuccessMsg(
        joined
          ? wasFinalized
            ? `Opened the existing ${sessionTypeLabel(newType)} session for ${fmtDate(newDate)} — it is locked. ${canReopen ? "Press Reopen to continue counting." : "Ask a manager to reopen it."}`
            : `Opened the existing ${sessionTypeLabel(newType)} session for ${fmtDate(newDate)}.`
          : "New session created.");
      await loadSessions();
      if (data?.session?.id) await loadSession(data.session.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setCreatingSession(false); }
  };

  const saveEntries = useCallback(async () => {
    if (!activeSession || activeSession.is_finalized) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Only save items the current user has dirtied — preserves other staff's attribution
      const dirtyIds = dirtyItemIdsRef.current;
      const entries = processedItems
        .filter(item => dirtyIds.has(item.id) && draftEntries[item.id]?.quantity !== "")
        .map(item => ({
          item_id: item.id,
          item_name: item.name,
          category: item.category || "",
          quantity: Number(draftEntries[item.id]?.quantity || 0),
          unit: draftEntries[item.id]?.unit || item.output_unit || "pc",
          notes: draftEntries[item.id]?.notes || "",
          filled_by: myName,
          version: draftEntries[item.id]?.version ?? 0,
        }));

      if (entries.length === 0) {
        setSuccessMsg("Nothing to save — no new entries since last save.");
        return;
      }

      const res = await apiFetch(`/api/store/ck-inventory/sessions/${activeSession.id}/entries`, {
        method: "POST",
        body: JSON.stringify({ entries }),
      });

      // Clear dirty tracking after successful save
      dirtyItemIdsRef.current = new Set();

      const conflicts: number[] = res?.conflicts || [];
      if (conflicts.length > 0) {
        setSuccessMsg(`Saved. ${conflicts.length} item(s) were updated by another staff — data refreshed.`);
      } else {
        setSuccessMsg(`Saved ${entries.length} item(s).`);
      }
      // Reload to pick up server versions + other staff changes
      await loadSession(activeSession.id, true);
      await loadSessions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }, [activeSession, processedItems, draftEntries, myName, loadSession, loadSessions]);

  const reopenSession = async () => {
    if (!activeSession) return;
    setReopening(true);
    try {
      await apiFetch(`/api/store/ck-inventory/sessions/${activeSession.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      setShowReopenConfirm(false);
      setReopenReason("");
      setSuccessMsg("Session reopened. Continue entering the count.");
      await loadSession(activeSession.id);
      await loadSessions();
    } catch (e) {
      setError(
        e instanceof Error && /403/.test(e.message)
          ? "Only a manager or HQ can reopen a finalized session. Ask your manager rather than starting a second session for the same day."
          : `Could not reopen: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setReopening(false);
    }
  };

  const finalizeSession = async () => {
    if (!activeSession) return;
    setFinalizing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Save dirty items first (if any), then finalize
      if (dirtyItemIdsRef.current.size > 0) {
        await saveEntries();
      }
      await apiFetch(`/api/store/ck-inventory/sessions/${activeSession.id}/finalize`, { method: "POST" });
      setShowFinalizeConfirm(false);
      setSuccessMsg("Session finalized and locked.");
      await loadSessions();
      await loadSession(activeSession.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setFinalizing(false); }
  };

  const updateEntry = (itemId: number, field: "quantity" | "unit" | "notes", value: string) => {
    dirtyItemIdsRef.current.add(itemId);
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

  const manualRefresh = async () => {
    if (!activeSession) return;
    await loadSession(activeSession.id, false);
    await loadSessions();
    setSuccessMsg("Refreshed.");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>CK Daily Inventory</h1>
            <p className={T_CAPTION + " mt-1"}>
              Record and track CK production inventory — pre/post delivery and daily checks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
                {(["manila", "dubai"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setCity(c); setActiveSession(null); activeSessionIdRef.current = null; }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                      city === c ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {canManageItems && (
              <button onClick={() => setShowManageItems(true)} className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
                <Settings2 className="h-4 w-4" />
                Manage Items
              </button>
            )}
            <button onClick={() => setShowNewSession(true)} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
              <Plus className="h-4 w-4" />
              New Session
            </button>
          </div>
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

          {/* ── Left: Session List (grouped by date) ─────────────────────── */}
          <div className={`${GLASS_CARD} p-4 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto`}>
            <h2 className={`${T_SECTION} mb-3`}>Sessions</h2>

            {sessionsByDate.length === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] py-8 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                <p className={T_CAPTION}>No sessions yet.<br />Create the first one.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessionsByDate.map(sess => {
                  const isActive = activeSession?.id === sess.id ||
                    (sess as unknown as { _allIds: number[] })._allIds?.includes(activeSession?.id ?? -1);
                  const contributors = (sess as unknown as { _mergedContributors: string[] })._mergedContributors || [];
                  return (
                    <button
                      key={`${sess.session_date}-${sess.session_type}`}
                      onClick={() => void loadSession(sess.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        isActive
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
                      {contributors.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <Users className="h-3 w-3 text-zinc-600 shrink-0" />
                          <p className="text-[10px] text-zinc-500 truncate">{contributors.join(", ")}</p>
                        </div>
                      )}
                    </button>
                  );
                })}
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
                      {activeSession.created_by && (
                        <p className={T_CAPTION}>Created by: {activeSession.created_by}</p>
                      )}
                      {/* Who closed it, and whether it has been opened again.
                          Neither was recorded before, so a session found locked
                          half-counted left nobody to ask. */}
                      {activeSession.is_finalized && activeSession.finalized_by && (
                        <p className={T_CAPTION}>
                          Locked by: {activeSession.finalized_by}
                          {activeSession.finalized_at ? ` · ${activeSession.finalized_at.slice(0, 16).replace("T", " ")}` : ""}
                        </p>
                      )}
                      {(activeSession.reopen_count ?? 0) > 0 && (
                        <p className="text-xs text-violet-300/80">
                          Reopened {activeSession.reopen_count === 1 ? "once" : `${activeSession.reopen_count} times`}
                          {activeSession.reopened_by ? ` · last by ${activeSession.reopened_by}` : ""}
                        </p>
                      )}
                      {/* Contributors list */}
                      {kpi && kpi.contributors.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-zinc-500" />
                          <p className="text-xs text-zinc-400">
                            Contributors: {kpi.contributors.join(" · ")}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!activeSession.is_finalized && (
                        <button
                          onClick={() => void manualRefresh()}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
                          title="Refresh session to pick up other staff's entries"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Refresh
                        </button>
                      )}
                      {/* Save is the action people take all day; Finalize is the
                          one they take once. The prominent button has to be the
                          frequent one — it was the other way round, and a day was
                          locked with 13 of 206 items counted. */}
                      {!activeSession.is_finalized && (
                        <button
                          onClick={() => void saveEntries()}
                          disabled={saving}
                          className={`${PRIMARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </button>
                      )}
                      {!activeSession.is_finalized && (
                        <button
                          onClick={() => setShowFinalizeConfirm(true)}
                          disabled={saving}
                          className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-transparent px-4 py-2 text-sm font-medium text-amber-300/90 transition hover:border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Finalize &amp; Lock
                        </button>
                      )}
                      {activeSession.is_finalized && canReopen && (
                        <button
                          onClick={() => setShowReopenConfirm(true)}
                          disabled={reopening}
                          className={`${SECONDARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50`}
                        >
                          {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                          Reopen
                        </button>
                      )}
                    </div>
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
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-28`}>Qty</th>
                                    <th className={`${TABLE_HEADER} px-3 text-left py-2 w-24`}>Unit</th>
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-24`}>Previous</th>
                                    <th className={`${TABLE_HEADER} px-3 text-right py-2 w-16`}>Delta</th>
                                    <th className={`${TABLE_HEADER} px-3 text-left py-2 w-28`}>Filled By</th>
                                    <th className={`${TABLE_HEADER} px-5 text-left py-2`}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(item => {
                                    const draft = draftEntries[item.id] || { quantity: "", unit: item.output_unit || "pc", notes: "", version: 0 };
                                    const serverEntry = entryMap[item.id];
                                    const filledBy = serverEntry?.filled_by || "";
                                    const filledByOther = filledBy && filledBy !== myName;
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
                                              onFocus={() => {
                                                if (filledByOther && !approvedOverwritesRef.current.has(item.id)) {
                                                  setOverwriteConfirm({ itemId: item.id, filledBy });
                                                }
                                              }}
                                              onChange={e => updateEntry(item.id, "quantity", e.target.value)}
                                              placeholder="0"
                                              className={`w-full rounded-lg border px-2 py-1 text-right text-sm text-white placeholder-zinc-600 focus:outline-none tabular-nums ${
                                                filledByOther
                                                  ? "border-amber-500/30 bg-amber-500/5 focus:border-amber-400/60"
                                                  : filledBy === myName && draft.quantity !== ""
                                                  ? "border-emerald-500/30 bg-emerald-500/5 focus:border-emerald-400/60"
                                                  : "border-white/10 bg-white/[0.05] focus:border-violet-500/50"
                                              }`}
                                            />
                                          )}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3`}>
                                          <span className="text-zinc-400 text-sm">{draft.unit || item.output_unit}</span>
                                        </td>
                                        <td className={`${TABLE_CELL} px-3 text-right tabular-nums text-zinc-500`}>
                                          {prevQty !== null ? `${prevQty} ${prev?.unit || ""}` : "—"}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3 text-right tabular-nums font-medium ${deltaColor}`}>
                                          {delta !== null ? (delta > 0 ? `+${Number.isInteger(delta) ? delta : delta.toFixed(1)}` : `${Number.isInteger(delta) ? delta : delta.toFixed(1)}`) : "—"}
                                        </td>
                                        <td className={`${TABLE_CELL} px-3`}>
                                          {filledBy ? (
                                            <span className={`text-[11px] font-medium ${
                                              filledBy === myName ? "text-emerald-400" : "text-amber-400"
                                            }`}>
                                              {filledBy === myName ? "You" : filledBy.split(" ")[0]}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-zinc-600">—</span>
                                          )}
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

      {/* ── Overwrite Confirm Dialog ───────────────────────────────────────── */}
      {overwriteConfirm && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
              <h2 className={T_SECTION}>Overwrite Entry?</h2>
            </div>
            <p className="mb-6 text-sm text-zinc-300">
              This item was filled by <strong className="text-amber-300">{overwriteConfirm.filledBy}</strong>.
              Do you want to overwrite their entry?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setOverwriteConfirm(null)}
                className={`${SECONDARY_BUTTON} flex-1 py-2 text-sm`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (overwriteConfirm) {
                    approvedOverwritesRef.current.add(overwriteConfirm.itemId);
                  }
                  setOverwriteConfirm(null);
                }}
                className="flex-1 rounded-xl border border-amber-500/40 bg-amber-500/20 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 transition"
              >
                Yes, Overwrite
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Manage Items Modal ─────────────────────────────────────────────── */}
      {showManageItems && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowManageItems(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className={T_SECTION}>Manage CK Items</h2>
              <button onClick={() => setShowManageItems(false)} className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className={`${T_CAPTION} mb-4`}>Shared with Daily Inventory (Central Kitchen). Adds/removes apply to both.</p>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-4 space-y-2">
              <input
                type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)}
                placeholder="New item name (e.g. Salmon Lover Sauce)"
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text" value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}
                  placeholder="Section (e.g. SAUCE)"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
                <SelectDark
                  value={newItemUnit}
                  onChange={setNewItemUnit}
                  options={AVAILABLE_UNITS.map(u => ({ value: u, label: u }))}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => void createItem()}
                  disabled={!newItemName.trim() || itemBusy}
                  className={`${PRIMARY_BUTTON} flex items-center gap-1 px-3 py-2 text-sm disabled:opacity-50`}
                >
                  {itemBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {processedItems.length === 0 ? (
                <p className={`${T_CAPTION} py-6 text-center`}>No items yet. Add the first one above.</p>
              ) : (
                Object.entries(groupedItems).map(([category, items]) => (
                  <div key={category} className="mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1 py-1">{category}</p>
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 mb-1 gap-2">
                        <span className="text-sm text-white flex-1 min-w-0 truncate">{item.name}</span>
                        {editUnitId === item.id ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="text"
                              value={editUnitVal}
                              onChange={e => setEditUnitVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") void saveItemUnit(item.id); if (e.key === "Escape") setEditUnitId(null); }}
                              className="w-16 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-center text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button onClick={() => void saveItemUnit(item.id)} disabled={editUnitBusy}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                              {editUnitBusy ? "…" : "✓"}
                            </button>
                            <button onClick={() => setEditUnitId(null)} className="text-zinc-500 hover:text-zinc-300 text-xs px-1">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditUnitId(item.id); setEditUnitVal(item.output_unit); }}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
                            title="Click to edit unit"
                          >
                            ({item.output_unit})
                          </button>
                        )}
                        <button
                          onClick={() => void removeItem(item.id, item.name)}
                          disabled={itemBusy}
                          className="shrink-0 rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

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

            {/* Info banner about shared sessions */}
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2.5">
              <Users className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
              <p className="text-xs text-violet-300">
                If a session already exists for the selected date and type, you will automatically join it instead of creating a new one.
              </p>
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
                <SelectDark
                  value={newType}
                  onChange={v => setNewType(v as SessionType)}
                  options={[
                    { value: "pre_delivery", label: "Pre-Delivery" },
                    { value: "post_delivery", label: "Post-Delivery" },
                    { value: "daily", label: "Daily" },
                  ]}
                  className="w-full rounded-xl border border-white/10 px-3 py-2 text-sm"
                />
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

            {/* Say so BEFORE the button is pressed. The team was creating a second
                session for a date that already had one — up to nine in a day —
                because nothing told them until afterwards. */}
            {existingForNew && (
              <div className={`mt-5 rounded-xl border p-3 ${
                existingForNew.is_finalized
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-sky-500/30 bg-sky-500/10"
              }`}>
                <div className={`text-sm font-semibold ${
                  existingForNew.is_finalized ? "text-amber-200" : "text-sky-200"
                }`}>
                  A {sessionTypeLabel(newType)} session already exists for {fmtDate(newDate)}.
                </div>
                <div className="mt-1 text-xs text-zinc-300/90">
                  {existingForNew.is_finalized ? (
                    <>
                      It is locked
                      {existingForNew.finalized_by ? ` (by ${existingForNew.finalized_by})` : ""}.
                      Continuing opens that same session — {canReopen
                        ? "you can then press Reopen to keep counting."
                        : "ask a manager to reopen it. Do not start a second one for this date."}
                    </>
                  ) : (
                    <>Continuing opens that same session so everyone&rsquo;s counts stay together.</>
                  )}
                </div>
              </div>
            )}

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
                {existingForNew ? "Open Existing Session" : "Create Session"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Reopen Confirm Modal ───────────────────────────────────────────── */}
      {showReopenConfirm && activeSession && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowReopenConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <Unlock className="h-5 w-5 text-violet-300 shrink-0" />
              <h2 className={T_SECTION}>Reopen Session?</h2>
            </div>
            <p className="mb-3 text-sm text-zinc-400">
              This unlocks {activeSession.session_date} so the count can be continued.
              Nothing already entered is removed.
            </p>
            {activeSession.finalized_by && (
              <p className="mb-3 text-xs text-zinc-500">
                Locked by {activeSession.finalized_by}
                {activeSession.finalized_at ? ` at ${activeSession.finalized_at.slice(11, 16)}` : ""}.
              </p>
            )}
            <label className={`block ${T_CAPTION} mb-1`}>Reason (recorded)</label>
            <input
              type="text"
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="e.g. Locked by mistake before the count was finished"
              className="mb-5 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowReopenConfirm(false)} className={`${SECONDARY_BUTTON} flex-1 py-2 text-sm`}>
                Cancel
              </button>
              <button
                onClick={() => void reopenSession()}
                disabled={reopening}
                className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-50`}
              >
                {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                Reopen
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
            {/* State the actual numbers. "It cannot be edited" said nothing about
                how much had been counted, and a day was locked at 13 of 206. */}
            {kpi && kpi.filledCount < kpi.totalItems && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-sm font-semibold text-amber-200">
                  Only {kpi.filledCount} of {kpi.totalItems} items have been counted.
                </div>
                <div className="mt-1 text-xs text-amber-200/80">
                  {kpi.totalItems - kpi.filledCount} items are still blank. If the count is
                  not finished, press Cancel and keep using Save instead.
                </div>
              </div>
            )}
            {kpi && kpi.filledCount >= kpi.totalItems && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                All {kpi.totalItems} items have been counted.
              </div>
            )}
            <p className="mb-6 text-sm text-zinc-400">
              This saves every entry and locks the session. After this only a manager or HQ
              can reopen it — nobody needs to start a second session for the same day.
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
