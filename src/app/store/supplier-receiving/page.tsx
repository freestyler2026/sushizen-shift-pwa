"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, PackageCheck, CheckCircle, AlertTriangle, PackageX } from "lucide-react";
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

type ReceiveEntry = {
  qty_received: number;
  receive_note: string;
  status: "received" | "partial" | "issue";
};

export default function SupplierReceivingPage() {
  const auth = getAuth();
  const userCity = String(auth?.city || "").toLowerCase();

  // Default store based on city/branch; Manila staff see PAR by default
  const defaultStore: Store = "PAR";

  const [store, setStore] = useState<Store>(defaultStore);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [entries, setEntries] = useState<Record<number, ReceiveEntry>>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Load today's sent orders for this store
      const params = new URLSearchParams({
        store,
        date_from: today,
        date_to: today,
        limit: "20",
      });
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      // Show sent + partial + issue orders (pending receipt)
      const pending: Order[] = (data.orders ?? []).filter((o: Order) =>
        ["sent", "partial", "issue"].includes(o.status)
      );
      setOrders(pending);
      if (pending.length > 0) {
        setActiveOrderId(pending[0].id);
        // Pre-load items for the first order so the form renders immediately
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

  useEffect(() => {
    load();
    setEntries({});
  }, [load]);

  async function loadDetail(orderId: number) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const order: Order = data.order;
      // Merge items into the orders list so the render has them
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, items: order.items } : o)));
      // Pre-fill entries from existing received data
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
    } catch {
      return null;
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/20 p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h1 className={T_PAGE_TITLE}>Supplier Receiving</h1>
          <button onClick={load} className={SECONDARY_BUTTON + " flex items-center gap-2"}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
            {/* Order selector (if multiple) */}
            {orders.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => selectOrder(o.id)}
                    className={activeOrderId === o.id ? TAB_ACTIVE : TAB_INACTIVE}
                  >
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

                {/* Per-item receiving form */}
                <div className="space-y-3">
                  {(activeOrder.items ?? []).map((item) => {
                    const entry = entries[item.id] ?? {
                      qty_received: item.qty_ordered,
                      receive_note: "",
                      status: "received",
                    };
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
                              type="number"
                              min="0"
                              step="0.1"
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

                {/* Overall status preview */}
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
      </div>
    </div>
  );
}
