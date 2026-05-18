"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, ChefHat, Package } from "lucide-react";

type PoRow = {
  id: string;
  request_id: string;
  parent_case_no: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  status: string;
  prepared_by: string;
  delivery_date: string;
  line_items_json: LineItem[];
  created_at: string;
};

type LineItem = {
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name?: string;
};

function poStatusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ISSUED" || s === "SENT" || s === "DELIVERED") return <span className={BADGE_SUCCESS}>{s}</span>;
  if (s === "FAILED") return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "DRAFT") return <span className={BADGE_WARNING}>DRAFT</span>;
  return <span className={BADGE_INFO}>{status || "PENDING"}</span>;
}

export default function CkOrdersPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await procurementJson<{ rows: PoRow[] }>(
        `/api/admin/procurement/pos?is_ck=true&limit=200`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [pin, requestedBy]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        CK Orders is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>CK Orders Inbox</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Incoming purchase orders from stores to Central Kitchen.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
          <ChefHat className="h-3 w-3" />{rows.length} orders
        </span>
      </div>

      {/* Auth bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>Session</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Your name"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading CK orders…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <Package className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No incoming CK orders found.</p>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const items = Array.isArray(row.line_items_json) ? row.line_items_json : [];
          const createdDate = row.created_at
            ? new Date(row.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—";
          return (
            <div
              key={row.id}
              className="rounded-2xl border border-white/8 bg-white/4 transition-all"
            >
              {/* Row header */}
              <button
                type="button"
                className="w-full px-4 py-4 text-left"
                onClick={() => setExpandedId(isExpanded ? "" : row.id)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">
                        {row.po_no || row.parent_case_no}
                      </span>
                      {poStatusBadge(row.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>Issued <span className="text-zinc-300">{createdDate}</span></span>
                      {row.delivery_date && (
                        <span>Deliver by <span className="text-zinc-300">{row.delivery_date}</span></span>
                      )}
                      {row.prepared_by && (
                        <span>By <span className="text-zinc-300">{row.prepared_by}</span></span>
                      )}
                      <span>
                        Amount <span className="font-semibold text-amber-300">PHP {Number(row.amount || 0).toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/procurement/cases/${row.request_id}`}
                      className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Case →
                    </Link>
                    <span className="text-xs text-zinc-500">{isExpanded ? "▲" : "▼"} {items.length} item{items.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </button>

              {/* Expanded items */}
              {isExpanded && items.length > 0 && (
                <div className="border-t border-white/8 px-4 pb-4">
                  <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#0c1024]/70 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} className="border-t border-white/8">
                            <td className="px-3 py-2 font-medium text-zinc-100">{item.item_name || "—"}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.category || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-white">{Number(item.qty || 0)}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.unit || "—"}</td>
                            <td className="px-3 py-2 text-right text-zinc-300">{Number(item.unit_price || 0).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-300">{Number(item.line_total || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {isExpanded && items.length === 0 && (
                <div className="border-t border-white/8 px-4 py-3">
                  <p className="text-xs text-zinc-500">No item details available. Open the case to see full details.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
