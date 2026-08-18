"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, PackageCheck, CheckCircle, AlertTriangle, PackageX,
  CalendarClock, Clock, ClipboardList,
} from "lucide-react";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
  BADGE_WARNING,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_ERROR,
} from "@/lib/ui-tokens";
import { getAuthHeaders, getAuth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

const STORES = ["PAR", "CUB", "TAFT"] as const;
type Store = (typeof STORES)[number];
const STORE_LABELS: Record<Store, string> = { PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft" };

type OrderStatus = "draft" | "confirmed" | "sent" | "received" | "partial" | "issue";

interface OrderItem {
  id: number;
  item_code: string;
  item_name: string;
  unit: string;
  qty_ordered: number;
  qty_received: number | null;
  receive_note: string | null;
}

interface Order {
  id: number;
  store: Store;
  supplier_name: string;
  order_date: string;
  status: OrderStatus;
  items: OrderItem[];
}

// EDD review order (from /ck-pending endpoint)
interface EddOrder {
  id: number;
  store: Store;
  supplier_name: string;
  order_date: string;
  status: string;
  delivery_date: string | null;
  expected_delivery_date: string;
  edd_note: string | null;
  edd_submitted_by: string | null;
  ck_stock_data: { item_name: string; ck_qty: number; unit: string }[] | null;
  ck_stock_submitted_at: string | null;
  ck_stock_submitted_by: string | null;
  ck_decision: string | null;
  ck_decision_by: string | null;
  item_count: number;
  items?: OrderItem[];  // loaded on demand
}

type ReceiveEntry = {
  qty_received: number;
  receive_note: string;
  status: "received" | "partial" | "issue";
};

type CKStockEntry = {
  ck_qty: number;
};

type PageTab = "receive" | "edd_review";

export default function SupplierReceivingPage() {
  const auth = getAuth();
  const isManager = ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(auth?.role ?? "");

  const defaultStore: Store = "PAR";

  const [store, setStore] = useState<Store>(defaultStore);
  const [pageTab, setPageTab] = useState<PageTab>("receive");

  // ── Receiving tab state ──────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [entries, setEntries] = useState<Record<number, ReceiveEntry>>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── EDD Review tab state ─────────────────────────────────────────────────────
  const [eddOrders, setEddOrders] = useState<EddOrder[]>([]);
  const [eddLoading, setEddLoading] = useState(false);
  const [activeEddId, setActiveEddId] = useState<number | null>(null);
  const [ckStockEntries, setCkStockEntries] = useState<Record<string, CKStockEntry>>({});
  const [ckStockSaving, setCkStockSaving] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [eddSuccessMsg, setEddSuccessMsg] = useState<string | null>(null);
  const [eddError, setEddError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ── Receiving tab ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const params = new URLSearchParams({ store, date_from: today, date_to: today, limit: "20" });
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const pending: Order[] = (data.orders ?? [])
        .filter((o: Order) => ["sent", "partial", "issue"].includes(o.status))
        .map((o: Order) => ({ ...o, items: o.items ?? [] }));
      setOrders(pending);
      if (pending.length > 0) {
        setActiveOrderId(pending[0].id);
        const res2 = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${pending[0].id}`, {
          headers: getAuthHeaders(),
        });
        const d2 = await res2.json();
        const firstOrder: Order = d2.order;
        setOrders((prev) => prev.map((o) => (o.id === pending[0].id ? { ...o, items: firstOrder.items } : o)));
        const prefill: Record<number, ReceiveEntry> = {};
        for (const item of firstOrder.items) {
          prefill[item.id] = {
            qty_received: item.qty_received ?? item.qty_ordered,
            receive_note: item.receive_note ?? "",
            status: "received",
          };
        }
        setEntries(prefill);
      } else {
        setActiveOrderId(null);
      }
    } catch {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [store, today]);

  useEffect(() => { load(); setEntries({}); }, [load]);

  async function loadDetail(orderId: number) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const order: Order = data.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, items: order.items } : o)));
      const prefill: Record<number, ReceiveEntry> = {};
      for (const item of order.items) {
        prefill[item.id] = {
          qty_received: item.qty_received ?? item.qty_ordered,
          receive_note: item.receive_note ?? "",
          status: "received",
        };
      }
      setEntries(prefill);
      return order;
    } catch { return null; }
  }

  async function selectOrder(orderId: number) {
    setActiveOrderId(orderId);
    setEntries({});
    await loadDetail(orderId);
  }

  function setEntry(itemId: number, field: keyof ReceiveEntry, value: string | number) {
    setEntries((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value } as ReceiveEntry,
    }));
  }

  function computeOverallStatus(): "received" | "partial" | "issue" {
    const vals = Object.values(entries);
    if (vals.some((e) => e.status === "issue")) return "issue";
    if (vals.some((e) => e.status === "partial")) return "partial";
    return "received";
  }

  async function handleSubmit() {
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) return;
    setSaving(true);
    setError(null);
    try {
      const items = Object.entries(entries).map(([itemId, e]) => ({
        item_id: Number(itemId),
        qty_received: e.qty_received,
        receive_note: e.receive_note || null,
      }));
      const overallStatus = computeOverallStatus();
      await fetch(`${API_BASE}/api/admin/store-supplier/orders/${activeOrder.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ items, status: overallStatus }),
      });
      setSuccessMsg(`Order from ${activeOrder.supplier_name} marked as ${overallStatus}.`);
      await load();
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // ── EDD Review tab ────────────────────────────────────────────────────────────
  const loadEddOrders = useCallback(async () => {
    setEddLoading(true);
    setEddError(null);
    setEddSuccessMsg(null);
    try {
      const params = new URLSearchParams({ store });
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/ck-pending?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const list: EddOrder[] = data.orders ?? [];
      setEddOrders(list);
      if (list.length > 0 && !activeEddId) {
        setActiveEddId(list[0].id);
        await loadEddDetail(list[0]);
      }
    } catch {
      setEddError("Failed to load EDD review orders.");
    } finally {
      setEddLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  async function loadEddDetail(eddOrder: EddOrder) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${eddOrder.id}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const fullOrder = data.order;
      const items: OrderItem[] = fullOrder.items ?? [];
      setEddOrders((prev) => prev.map((o) => o.id === eddOrder.id ? { ...o, items } : o));
      // Pre-fill stock entries from existing ck_stock_data if present
      const prefill: Record<string, CKStockEntry> = {};
      if (eddOrder.ck_stock_data) {
        for (const s of eddOrder.ck_stock_data) {
          prefill[s.item_name] = { ck_qty: s.ck_qty };
        }
      } else {
        for (const item of items) {
          prefill[item.item_name] = { ck_qty: 0 };
        }
      }
      setCkStockEntries(prefill);
    } catch { /* non-critical */ }
  }

  async function selectEddOrder(eo: EddOrder) {
    setActiveEddId(eo.id);
    setCkStockEntries({});
    await loadEddDetail(eo);
  }

  useEffect(() => {
    if (pageTab === "edd_review") loadEddOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab, store]);

  async function handleSubmitCKStock() {
    const activeEdd = eddOrders.find((o) => o.id === activeEddId);
    if (!activeEdd || !activeEdd.items) return;
    setCkStockSaving(true);
    setEddError(null);
    try {
      const stockItems = activeEdd.items.map((item) => ({
        item_name: item.item_name,
        ck_qty: ckStockEntries[item.item_name]?.ck_qty ?? 0,
        unit: item.unit,
      }));
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${activeEdd.id}/ck-stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ items: stockItems }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEddError(d.detail ?? "Failed to submit stock entry.");
        return;
      }
      setEddSuccessMsg("Stock quantities submitted. Awaiting CK Manager decision.");
      await loadEddOrders();
    } catch {
      setEddError("Submission failed. Please try again.");
    } finally {
      setCkStockSaving(false);
    }
  }

  async function handleCKDecision(decision: "approved" | "immediate_requested") {
    const activeEdd = eddOrders.find((o) => o.id === activeEddId);
    if (!activeEdd) return;
    setDecisionSaving(true);
    setEddError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${activeEdd.id}/ck-decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEddError(d.detail ?? "Failed to record decision.");
        return;
      }
      setEddSuccessMsg(
        decision === "approved"
          ? "EDD approved. Delivery scheduled."
          : "Immediate delivery requested. Aliana has been notified via Discord."
      );
      await loadEddOrders();
    } catch {
      setEddError("Failed to record decision.");
    } finally {
      setDecisionSaving(false);
    }
  }

  const activeEdd = eddOrders.find((o) => o.id === activeEddId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/20 p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h1 className={T_PAGE_TITLE}>Supplier Receiving</h1>
          <button
            onClick={() => pageTab === "receive" ? load() : loadEddOrders()}
            className={SECONDARY_BUTTON + " flex items-center gap-2"}
          >
            <RefreshCw className={`h-4 w-4 ${(loading || eddLoading) ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Page tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPageTab("receive")} className={pageTab === "receive" ? TAB_ACTIVE : TAB_INACTIVE}>
            <PackageCheck className="h-3.5 w-3.5 inline mr-1.5" />
            Receive Today&apos;s Orders
          </button>
          <button onClick={() => setPageTab("edd_review")} className={pageTab === "edd_review" ? TAB_ACTIVE : TAB_INACTIVE}>
            <CalendarClock className="h-3.5 w-3.5 inline mr-1.5" />
            EDD Review
            {eddOrders.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-blue-500 text-white text-[10px] font-bold px-1">
                {eddOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Store tabs */}
        <div className="flex gap-2 flex-wrap">
          {STORES.map((s) => (
            <button key={s} onClick={() => setStore(s)} className={store === s ? TAB_ACTIVE : TAB_INACTIVE}>
              {STORE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* ── RECEIVE TAB ─────────────────────────────────────────────────── */}
        {pageTab === "receive" && (
          <>
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}
            {successMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                <CheckCircle className="inline h-4 w-4 mr-1.5" />{successMsg}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : orders.length === 0 ? (
              <div className={GLASS_CARD + " p-8 text-center"}>
                <PackageCheck className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No pending deliveries for {STORE_LABELS[store]} today.</p>
                <p className="text-zinc-600 text-xs mt-1">Orders with status &ldquo;Sent&rdquo; will appear here once the manager confirms the order has been dispatched.</p>
              </div>
            ) : (
              <>
                {orders.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {orders.map((o) => (
                      <button key={o.id} onClick={() => selectOrder(o.id)} className={activeOrderId === o.id ? TAB_ACTIVE : TAB_INACTIVE}>
                        {o.supplier_name}
                      </button>
                    ))}
                  </div>
                )}

                {activeOrder && (
                  <div className={GLASS_CARD + " p-5 space-y-4"}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-white">{activeOrder.supplier_name}</h2>
                        <p className="text-xs text-zinc-500">{activeOrder.order_date} · {STORE_LABELS[activeOrder.store]}</p>
                      </div>
                      <span className={BADGE_WARNING}>Pending Receive</span>
                    </div>

                    <div className="space-y-3">
                      {(activeOrder.items ?? []).map((item) => {
                        const entry = entries[item.id] ?? { qty_received: item.qty_ordered, receive_note: "", status: "received" };
                        return (
                          <div key={item.id} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium text-white">{item.item_name}</span>
                                <span className="ml-2 text-xs text-zinc-500">{item.item_code}</span>
                              </div>
                              <span className={BADGE_INFO}>Ordered: {item.qty_ordered} {item.unit}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="mb-1 block text-xs text-zinc-500">Received qty</label>
                                <input
                                  type="number" min="0" step="0.1"
                                  className={INPUT_CLASS + " text-center"}
                                  value={entry.qty_received}
                                  onChange={(e) => setEntry(item.id, "qty_received", parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-zinc-500">Condition</label>
                                <select
                                  className={SELECT_CLASS}
                                  value={entry.status}
                                  onChange={(e) => setEntry(item.id, "status", e.target.value)}
                                >
                                  <option value="received">OK</option>
                                  <option value="partial">Partial</option>
                                  <option value="issue">Issue</option>
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-zinc-500">Note</label>
                                <input
                                  className={INPUT_CLASS}
                                  placeholder="Optional"
                                  value={entry.receive_note}
                                  onChange={(e) => setEntry(item.id, "receive_note", e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <span>Overall status will be:</span>
                      <span className={
                        computeOverallStatus() === "received" ? "text-emerald-400 font-semibold" :
                        computeOverallStatus() === "partial" ? "text-amber-400 font-semibold" :
                        "text-red-400 font-semibold"
                      }>
                        {computeOverallStatus()}
                      </span>
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={saving || Object.keys(entries).length === 0}
                      className={PRIMARY_BUTTON + " w-full flex items-center justify-center gap-2"}
                    >
                      <PackageCheck className="h-4 w-4" />
                      {saving ? "Submitting…" : "Submit Receiving"}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── EDD REVIEW TAB ──────────────────────────────────────────────── */}
        {pageTab === "edd_review" && (
          <>
            {eddError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{eddError}</div>
            )}
            {eddSuccessMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                <CheckCircle className="inline h-4 w-4 mr-1.5" />{eddSuccessMsg}
              </div>
            )}

            {eddLoading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : eddOrders.length === 0 ? (
              <div className={GLASS_CARD + " p-8 text-center"}>
                <CalendarClock className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No pending EDD reviews for {STORE_LABELS[store]}.</p>
                <p className="text-zinc-600 text-xs mt-1">
                  When purchasing sets an Expected Delivery Date on an overdue order, it will appear here for CK review.
                </p>
              </div>
            ) : (
              <>
                {/* Order selector */}
                {eddOrders.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {eddOrders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => selectEddOrder(o)}
                        className={activeEddId === o.id ? TAB_ACTIVE : TAB_INACTIVE}
                      >
                        {o.supplier_name}
                        {o.ck_stock_submitted_at && !o.ck_decision && (
                          <span className="ml-1 text-amber-400">·</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeEdd && (
                  <div className={GLASS_CARD + " p-5 space-y-4"}>
                    {/* Order header */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-white">{activeEdd.supplier_name}</h2>
                        <p className="text-xs text-zinc-500">{activeEdd.order_date} · {STORE_LABELS[activeEdd.store]}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5 text-sm text-blue-300">
                          <CalendarClock className="h-4 w-4" />
                          <span className="font-medium">EDD: {activeEdd.expected_delivery_date}</span>
                        </div>
                        {activeEdd.edd_note && (
                          <span className="text-xs text-zinc-400 italic">"{activeEdd.edd_note}"</span>
                        )}
                      </div>
                    </div>

                    {/* ── State A: Stock not entered yet → CK staff enters stock ── */}
                    {!activeEdd.ck_stock_submitted_at && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                          <ClipboardList className="h-4 w-4 text-blue-400" />
                          Enter Current Stock Quantities
                        </div>
                        <p className="text-xs text-zinc-500">
                          Before the CK Manager decides, enter how much stock is currently in the kitchen.
                          This helps determine if the EDD is acceptable or immediate delivery is needed.
                        </p>

                        {!activeEdd.items || activeEdd.items.length === 0 ? (
                          <div className="py-4 text-center text-zinc-500 text-sm">Loading items…</div>
                        ) : (
                          <div className="space-y-2">
                            {activeEdd.items.map((item) => {
                              const entry = ckStockEntries[item.item_name] ?? { ck_qty: 0 };
                              return (
                                <div key={item.id} className="rounded-xl border border-white/8 bg-white/3 p-3 flex items-center justify-between gap-3">
                                  <div>
                                    <span className="text-sm font-medium text-white">{item.item_name}</span>
                                    <div className="text-xs text-zinc-500 mt-0.5">Ordered: {item.qty_ordered} {item.unit}</div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <label className="text-xs text-zinc-500">Current stock:</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      className={INPUT_CLASS + " w-24 text-center text-sm"}
                                      value={entry.ck_qty}
                                      onChange={(e) =>
                                        setCkStockEntries((prev) => ({
                                          ...prev,
                                          [item.item_name]: { ck_qty: parseFloat(e.target.value) || 0 },
                                        }))
                                      }
                                    />
                                    <span className="text-xs text-zinc-500">{item.unit}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          onClick={handleSubmitCKStock}
                          disabled={ckStockSaving || !activeEdd.items || activeEdd.items.length === 0}
                          className={PRIMARY_BUTTON + " w-full flex items-center justify-center gap-2"}
                        >
                          <ClipboardList className="h-4 w-4" />
                          {ckStockSaving ? "Submitting…" : "Submit Stock Entry"}
                        </button>
                      </div>
                    )}

                    {/* ── State B: Stock entered, awaiting manager decision ── */}
                    {activeEdd.ck_stock_submitted_at && !activeEdd.ck_decision && (
                      <div className="space-y-3">
                        {/* Stock summary */}
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                          <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium mb-2">
                            <CheckCircle className="h-4 w-4" />
                            Stock submitted by {activeEdd.ck_stock_submitted_by}
                          </div>
                          {activeEdd.ck_stock_data && activeEdd.ck_stock_data.length > 0 && (
                            <div className="space-y-1">
                              {activeEdd.ck_stock_data.map((s, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                                  <span>{s.item_name}</span>
                                  <span className="text-zinc-400 tabular-nums">{s.ck_qty} {s.unit}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manager decision — only for manager role */}
                        {isManager ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-zinc-300">CK Manager Decision:</p>
                            <p className="text-xs text-zinc-500">
                              Based on the stock levels above and EDD of <strong className="text-blue-300">{activeEdd.expected_delivery_date}</strong>,
                              choose your action:
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => handleCKDecision("approved")}
                                disabled={decisionSaving}
                                className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 p-3 transition-colors disabled:opacity-50 text-center"
                              >
                                <CheckCircle className="h-5 w-5" />
                                <span className="text-sm font-semibold">Approve EDD</span>
                                <span className="text-xs text-zinc-400">Stock is sufficient until {activeEdd.expected_delivery_date}</span>
                              </button>
                              <button
                                onClick={() => handleCKDecision("immediate_requested")}
                                disabled={decisionSaving}
                                className="flex flex-col items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 p-3 transition-colors disabled:opacity-50 text-center"
                              >
                                <AlertTriangle className="h-5 w-5" />
                                <span className="text-sm font-semibold">Request Immediate Delivery</span>
                                <span className="text-xs text-zinc-400">Stock is too low — need delivery ASAP</span>
                              </button>
                            </div>
                            {decisionSaving && <p className="text-xs text-zinc-500 text-center">Recording decision…</p>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-amber-300">
                            <Clock className="h-4 w-4" />
                            Waiting for CK Manager to review and decide.
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── State C: Decision recorded ── */}
                    {activeEdd.ck_decision && (
                      <div className={`rounded-xl border p-4 text-center ${
                        activeEdd.ck_decision === "approved"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-red-500/30 bg-red-500/10"
                      }`}>
                        {activeEdd.ck_decision === "approved" ? (
                          <>
                            <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                            <p className="text-emerald-300 font-semibold">EDD Approved</p>
                            <p className="text-xs text-zinc-400 mt-1">
                              Delivery scheduled for {activeEdd.expected_delivery_date} — no follow-up needed.
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">Decided by {activeEdd.ck_decision_by}</p>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                            <p className="text-red-300 font-semibold">Immediate Delivery Requested</p>
                            <p className="text-xs text-zinc-400 mt-1">
                              Aliana has been notified via Discord to follow up with {activeEdd.supplier_name}.
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">Requested by {activeEdd.ck_decision_by}</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
