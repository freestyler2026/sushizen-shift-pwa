"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  PackageSearch,
  RefreshCw,
  Truck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
} from "@/lib/ui-tokens";

type LineItem = {
  item_name: string;
  qty: number;
  unit: string;
};

type IngredientPoRow = {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  line_items_json: LineItem[];
  delivery_date?: string;
  dispatched_at?: string;
  has_shortage: boolean;
  request_no: string;
  pending_status: "not_dispatched" | "in_transit" | "short_delivered";
};

function StatusBadge({ status }: { status: IngredientPoRow["pending_status"] }) {
  if (status === "in_transit")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-900/40 border border-sky-700/50 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
        <Truck className="h-3 w-3" /> In Transit
      </span>
    );
  if (status === "short_delivered")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
        <AlertTriangle className="h-3 w-3" /> Short Delivered
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
      <PackageSearch className="h-3 w-3" /> Not Dispatched
    </span>
  );
}

export default function CkIngredientReceivingPage() {
  const [rows, setRows] = useState<IngredientPoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ city: "manila", store_code: "CK" });
      const res = await fetch(`/api/store/procurement/pending-deliveries?${qs}`, {
        method: "GET",
        cache: "no-store",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const notDispatched = rows.filter((r) => r.pending_status === "not_dispatched");
  const inTransit = rows.filter((r) => r.pending_status === "in_transit");
  const short = rows.filter((r) => r.pending_status === "short_delivered");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>CK Ingredient Receiving</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Supplier orders placed by CK that have not yet arrived at the Central Kitchen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={`${SMALL_BUTTON} flex shrink-0 items-center gap-2`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Stats */}
      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-zinc-300">{notDispatched.length}</p>
            <p className={T_CAPTION}>Not Dispatched</p>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-sky-400">{inTransit.length}</p>
            <p className={T_CAPTION}>In Transit</p>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-amber-400">{short.length}</p>
            <p className={T_CAPTION}>Short Delivered</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !loading && (
        <div className={`${GLASS_CARD} flex flex-col items-center gap-2 p-10`}>
          <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
          <p className={T_CAPTION}>No pending ingredient deliveries. All caught up!</p>
        </div>
      )}

      {/* PO List */}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const isOpen = expanded.has(row.id);
            const items = Array.isArray(row.line_items_json) ? row.line_items_json : [];
            return (
              <div key={row.id} className={`${GLASS_CARD} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => toggleExpand(row.id)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{row.po_no}</span>
                      <StatusBadge status={row.pending_status} />
                    </div>
                    <p className="truncate text-sm text-zinc-300">{row.vendor_name}</p>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {row.delivery_date && (
                        <p className="text-xs text-amber-400">
                          Delivery: {row.delivery_date}
                        </p>
                      )}
                      {row.dispatched_at && (
                        <p className="text-xs text-sky-400">
                          Dispatched: {row.dispatched_at.slice(0, 10)}
                        </p>
                      )}
                      <p className={T_CAPTION}>{items.length} item{items.length !== 1 ? "s" : ""}</p>
                      <p className={T_CAPTION}>Ref: {row.request_no}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      ₱{(row.amount ?? 0).toLocaleString()}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </button>

                {/* Line items */}
                {isOpen && items.length > 0 && (
                  <div className="border-t border-white/8 px-4 pb-4 pt-3">
                    <p className={`${T_SECTION} mb-2`}>Order Items</p>
                    <div className="space-y-1.5">
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-white/6 bg-white/3 px-3 py-2"
                        >
                          <p className="text-sm text-zinc-200">{item.item_name}</p>
                          <p className="text-sm font-medium text-zinc-400">
                            {item.qty} {item.unit}
                          </p>
                        </div>
                      ))}
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
