"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, Zap, ChevronDown, ChevronRight,
  CheckCircle, Clock, Send, PackageCheck, PackageX, AlertTriangle, Trash2,
  BarChart2, ShieldCheck,
} from "lucide-react";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  KPI_CARD,
} from "@/lib/ui-tokens";
import { getAuthHeaders, getAuth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

const STORES = ["PAR", "CUB", "TAFT"] as const;
type Store = (typeof STORES)[number];
const STORE_LABELS: Record<Store, string> = { PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft" };

type OrderStatus = "draft" | "confirmed" | "approved" | "sent" | "received" | "partial" | "issue";

interface OrderListItem {
  id: number;
  store: Store;
  supplier_name: string;
  order_date: string;
  status: OrderStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  item_count: number;
  total_qty_ordered: number;
  total_qty_received: number;
}

interface OrderItem {
  id: number;
  order_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  qty_ordered: number;
  qty_received: number | null;
  receive_note: string | null;
  received_at: string | null;
}

interface OrderDetail extends OrderListItem {
  items: OrderItem[];
}

interface PerformanceRow {
  store: string;
  supplier_name: string;
  total_orders: number;
  on_time_count: number;
  partial_count: number;
  issue_count: number;
  on_time_rate: number | null;
}

type Tab = "orders" | "performance";

const STATUS_STYLE: Record<OrderStatus, string> = {
  draft: BADGE_INFO,
  confirmed: "inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 text-xs font-medium text-blue-300",
  approved: "inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-300",
  sent: "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-2.5 py-0.5 text-xs font-medium text-amber-300",
  received: BADGE_SUCCESS,
  partial: BADGE_WARNING,
  issue: BADGE_ERROR,
};

const STATUS_ICON: Record<OrderStatus, React.ReactNode> = {
  draft: <Clock className="h-3 w-3" />,
  confirmed: <CheckCircle className="h-3 w-3" />,
  approved: <ShieldCheck className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  received: <PackageCheck className="h-3 w-3" />,
  partial: <PackageX className="h-3 w-3" />,
  issue: <AlertTriangle className="h-3 w-3" />,
};

export default function StoreSupplierOrdersPage() {
  const auth = getAuth();
  const userRole = (auth?.role ?? "").toUpperCase();
  const canApprove = userRole === "HQ" || userRole === "ADMIN";

  const [tab, setTab] = useState<Tab>("orders");
  const [store, setStore] = useState<Store>("PAR");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateDate, setGenerateDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [perf, setPerf] = useState<PerformanceRow[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store, limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [store, statusFilter, dateFrom, dateTo]);

  const loadPerf = useCallback(async () => {
    setPerfLoading(true);
    try {
      const params = new URLSearchParams({ store, days: "90" });
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/performance?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setPerf(data.performance ?? []);
    } catch {
      setPerf([]);
    } finally {
      setPerfLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (tab === "orders") loadOrders();
    else loadPerf();
  }, [tab, loadOrders, loadPerf]);

  async function toggleExpand(orderId: number) {
    if (expanded === orderId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(orderId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setDetail(data.order);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleStatusChange(orderId: number, newStatus: OrderStatus) {
    try {
      await fetch(`${API_BASE}/api/admin/store-supplier/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadOrders();
      if (expanded === orderId) {
        setDetail((d) => d ? { ...d, status: newStatus } : d);
      }
    } catch {
      setError("Status update failed.");
    }
  }

  async function handleDelete(orderId: number) {
    try {
      await fetch(`${API_BASE}/api/admin/store-supplier/orders/${orderId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setDeleteConfirm(null);
      setExpanded(null);
      setDetail(null);
      await loadOrders();
    } catch {
      setError("Delete failed.");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateMsg(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ store, order_date: generateDate }),
      });
      const data = await res.json();
      setGenerateMsg(data.message ?? `Created ${data.created} order(s)`);
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  const onTimeRate = (row: PerformanceRow) =>
    row.on_time_rate != null ? `${row.on_time_rate}%` : "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/20 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={T_PAGE_TITLE}>Store Supplier Orders</h1>
          <div className="flex gap-2">
            <button onClick={tab === "orders" ? loadOrders : loadPerf} className={SECONDARY_BUTTON + " flex items-center gap-2"}>
              <RefreshCw className={`h-4 w-4 ${(loading || perfLoading) ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Top tabs */}
        <div className="flex gap-2">
          <button onClick={() => setTab("orders")} className={tab === "orders" ? TAB_ACTIVE : TAB_INACTIVE}>Orders</button>
          <button onClick={() => setTab("performance")} className={tab === "performance" ? TAB_ACTIVE : TAB_INACTIVE}>
            <BarChart2 className="inline h-4 w-4 mr-1.5" />Supplier Performance
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

        {/* ── ORDERS TAB ─────────────────────────────────────────────── */}
        {tab === "orders" && (
          <>
            {/* Generate panel */}
            <div className={GLASS_CARD + " p-4 flex flex-wrap items-center gap-3"}>
              <span className="text-sm text-zinc-400 font-medium">Generate Orders for:</span>
              <input
                type="date"
                className={INPUT_CLASS + " max-w-[160px]"}
                value={generateDate}
                onChange={(e) => setGenerateDate(e.target.value)}
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={PRIMARY_BUTTON + " flex items-center gap-2"}
              >
                <Zap className="h-4 w-4" />
                {generating ? "Generating…" : "Generate Now"}
              </button>
              {generateMsg && (
                <span className="text-sm text-emerald-400">{generateMsg}</span>
              )}
            </div>

            {/* Filters */}
            <div className={GLASS_CARD + " p-4 flex flex-wrap gap-3 items-center"}>
              <select className={SELECT_CLASS + " max-w-[160px]"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="approved">Approved</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
                <option value="partial">Partial</option>
                <option value="issue">Issue</option>
              </select>
              <input type="date" className={INPUT_CLASS + " max-w-[150px]"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-zinc-500 text-sm">to</span>
              <input type="date" className={INPUT_CLASS + " max-w-[150px]"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <span className={BADGE_INFO}>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Order list */}
            {loading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No orders found. Use &ldquo;Generate Now&rdquo; to create draft orders.</div>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => (
                  <div key={order.id} className={GLASS_CARD + " overflow-hidden"}>
                    {/* Order row */}
                    <button
                      onClick={() => toggleExpand(order.id)}
                      className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors"
                    >
                      {expanded === order.id
                        ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
                      <span className="font-semibold text-white min-w-[120px]">{order.supplier_name}</span>
                      <span className="text-sm text-zinc-400">{order.order_date}</span>
                      <span className={STATUS_STYLE[order.status]}>
                        {STATUS_ICON[order.status]} {order.status}
                      </span>
                      <span className="text-xs text-zinc-500 ml-auto">{order.item_count} item{order.item_count !== 1 ? "s" : ""}</span>
                      <span className="text-xs text-zinc-500">by {order.created_by}</span>
                    </button>

                    {/* Expanded detail */}
                    {expanded === order.id && (
                      <div className="border-t border-white/5 px-4 py-4 space-y-4">
                        {detailLoading ? (
                          <div className="text-sm text-zinc-500">Loading items…</div>
                        ) : detail && detail.id === order.id ? (
                          <>
                            {/* Items table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-white/5">
                                    <th className="px-3 py-2 text-left text-xs text-zinc-500">Item</th>
                                    <th className="px-3 py-2 text-right text-xs text-zinc-500">Ordered</th>
                                    <th className="px-3 py-2 text-right text-xs text-zinc-500">Received</th>
                                    <th className="px-3 py-2 text-left text-xs text-zinc-500">Note</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.items.map((item) => (
                                    <tr key={item.id} className="border-b border-white/5 last:border-0">
                                      <td className="px-3 py-2">
                                        <div className="text-white">{item.item_name}</div>
                                        <div className="text-xs text-zinc-500">{item.item_code}</div>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-amber-400 font-semibold">
                                        {item.qty_ordered} {item.unit}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {item.qty_received != null
                                          ? <span className="text-emerald-400 font-semibold">{item.qty_received} {item.unit}</span>
                                          : <span className="text-zinc-600">—</span>}
                                      </td>
                                      <td className="px-3 py-2 text-xs text-zinc-400">{item.receive_note ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1 items-center">
                              {/* draft → confirmed (any manager) */}
                              {order.status === "draft" && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "confirmed")}
                                  className={PRIMARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5"}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" /> Mark as Confirmed
                                </button>
                              )}

                              {/* confirmed → approved: HQ/ADMIN only */}
                              {order.status === "confirmed" && canApprove && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "approved")}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium py-1.5 px-3 transition-colors"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" /> Approve
                                </button>
                              )}
                              {/* confirmed: non-HQ sees waiting label */}
                              {order.status === "confirmed" && !canApprove && (
                                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium py-1.5 px-3">
                                  <Clock className="h-3.5 w-3.5" /> Awaiting HQ Approval
                                </span>
                              )}

                              {/* approved → sent (any manager) */}
                              {order.status === "approved" && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "sent")}
                                  className={PRIMARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5"}
                                >
                                  <Send className="h-3.5 w-3.5" /> Mark as Sent
                                </button>
                              )}

                              {/* Delete draft */}
                              {order.status === "draft" && (
                                deleteConfirm === order.id ? (
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => handleDelete(order.id)} className={DANGER_BUTTON + " text-sm py-1.5 px-3"}>
                                      Confirm Delete
                                    </button>
                                    <button onClick={() => setDeleteConfirm(null)} className={SECONDARY_BUTTON + " text-sm py-1.5 px-3"}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(order.id)}
                                    className={SECONDARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5 text-red-400 border-red-500/20 hover:bg-red-500/10"}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete Draft
                                  </button>
                                )
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PERFORMANCE TAB ────────────────────────────────────────── */}
        {tab === "performance" && (
          <>
            {perfLoading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : perf.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No completed orders yet for performance data.</div>
            ) : (
              <div className={GLASS_CARD + " overflow-x-auto"}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Total Orders</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">On-Time</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Partial</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Issues</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">On-Time Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-3 font-semibold text-white">{row.supplier_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{row.total_orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{row.on_time_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-400">{row.partial_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-400">{row.issue_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <span className={
                            row.on_time_rate == null ? "text-zinc-500" :
                            row.on_time_rate >= 80 ? "text-emerald-400" :
                            row.on_time_rate >= 50 ? "text-amber-400" : "text-red-400"
                          }>
                            {onTimeRate(row)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-zinc-600">Last 90 days · {STORE_LABELS[store]}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
