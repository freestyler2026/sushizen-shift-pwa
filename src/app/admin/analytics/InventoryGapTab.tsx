"use client";

import { useCallback, useEffect, useState } from "react";
import { inventoryGet } from "@/lib/inventoryClient";
import { labelOf, type City } from "@/lib/branches";

type StoreGapRow = {
  branch_code: string;
  business_date: string;
  count_no: string;
  count_id: string;
  item_count: number;
  shortage_count: number;
  surplus_count: number;
  total_abs_gap: number;
  net_gap: number;
};

type CkGapRow = {
  count_date: string;
  created_by: string;
  item_count: number;
  shortage_count: number;
  surplus_count: number;
  total_abs_gap: number;
  net_gap: number;
};

type GapDetailRow = {
  item_name: string;
  category: string;
  unit: string;
  count_qty: number;
  theoretical_qty: number;
  gap_qty: number;
};

type GapSummaryResponse = {
  store_gaps: StoreGapRow[];
  ck_gaps: CkGapRow[];
};

type DetailKey = { type: "store"; count_id: string; branch_code: string } | { type: "ck"; count_date: string };

const GLASS = "rounded-2xl border border-white/8 bg-white/5 backdrop-blur-sm";

function gapColor(gap: number) {
  if (gap < -0.001) return "text-red-400";
  if (gap > 0.001) return "text-emerald-400";
  return "text-neutral-400";
}

function StatusBadge({ shortages, surpluses }: { shortages: number; surpluses: number }) {
  if (shortages === 0 && surpluses === 0)
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">✓ On Target</span>;
  if (shortages > 0)
    return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">⚠ {shortages} short</span>;
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">↑ {surpluses} surplus</span>;
}

export default function InventoryGapTab({ city }: { city: City }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<GapSummaryResponse | null>(null);
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);
  const [detailRows, setDetailRows] = useState<GapDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await inventoryGet<GapSummaryResponse & { ok: boolean }>(
        `/api/admin/inventory/gap-summary?city=${encodeURIComponent(city)}`
      );
      setSummary({ store_gaps: res.store_gaps || [], ck_gaps: res.ck_gaps || [] });
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  async function loadDetail(key: DetailKey) {
    setDetailKey(key);
    setDetailRows([]);
    setDetailLoading(true);
    try {
      let url = `/api/admin/inventory/gap-detail?city=${encodeURIComponent(city)}`;
      if (key.type === "store") url += `&count_id=${encodeURIComponent(key.count_id)}&source=store`;
      else url += `&count_date=${encodeURIComponent(key.count_date)}&source=ck`;
      const res = await inventoryGet<{ rows: GapDetailRow[] }>(url);
      setDetailRows(res.rows || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setDetailLoading(false); }
  }

  const detailTitle = detailKey
    ? detailKey.type === "store"
      ? `${labelOf(city, detailKey.branch_code)} — Gap Detail`
      : `Central Kitchen — ${detailKey.count_date}`
    : "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Inventory Gap Analysis</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Theoretical inventory vs actual counts — per branch and CK.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-violet-400/15 bg-violet-950/30 px-4 py-2 text-sm text-white transition hover:bg-violet-950/45 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">❌ {error}</div> : null}

      {/* Store gaps */}
      <div className={GLASS + " p-5"}>
        <div className="mb-4 text-sm font-semibold text-white">🏪 Store Branches — Latest Count Gap</div>
        {loading ? (
          <div className="py-4 text-sm text-neutral-500">Loading...</div>
        ) : (summary?.store_gaps?.length ?? 0) === 0 ? (
          <div className="py-4 text-sm text-neutral-500">
            No submitted counts found. Staff need to complete Full Inventory Count at each branch first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 text-left">Branch</th>
                  <th className="px-3 py-2 text-left">Count Date</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Total Gap</th>
                  <th className="px-3 py-2 text-right">Net Gap</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary?.store_gaps.map((row) => (
                  <tr key={row.count_id} className="border-b border-white/5 transition hover:bg-white/3">
                    <td className="px-3 py-3 font-medium text-white">{labelOf(city, row.branch_code)}</td>
                    <td className="px-3 py-3 text-neutral-300">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-3 text-right text-neutral-300">{row.item_count}</td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge shortages={row.shortage_count} surpluses={row.surplus_count} />
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${row.total_abs_gap > 0 ? "text-amber-300" : "text-neutral-400"}`}>
                      {Number(row.total_abs_gap || 0).toFixed(2)}
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${gapColor(row.net_gap)}`}>
                      {Number(row.net_gap || 0) > 0 ? "+" : ""}{Number(row.net_gap || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => void loadDetail({ type: "store", count_id: row.count_id, branch_code: row.branch_code })}
                        className="rounded-lg border border-violet-400/20 bg-violet-950/30 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-900/40 transition"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CK gaps */}
      <div className={GLASS + " p-5"}>
        <div className="mb-4 text-sm font-semibold text-white">🏭 Central Kitchen — Stock Count Gap History</div>
        {loading ? (
          <div className="py-4 text-sm text-neutral-500">Loading...</div>
        ) : (summary?.ck_gaps?.length ?? 0) === 0 ? (
          <div className="py-4 text-sm text-neutral-500">
            No CK count sessions yet. Use CK Inventory → New Count to enter physical stock.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 text-left">Count Date</th>
                  <th className="px-3 py-2 text-left">Recorded By</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Total Gap</th>
                  <th className="px-3 py-2 text-right">Net Gap</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary?.ck_gaps.map((row) => (
                  <tr key={String(row.count_date)} className="border-b border-white/5 transition hover:bg-white/3">
                    <td className="px-3 py-3 font-medium text-white">{String(row.count_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-3 text-neutral-300">{row.created_by || "-"}</td>
                    <td className="px-3 py-3 text-right text-neutral-300">{row.item_count}</td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge shortages={row.shortage_count} surpluses={row.surplus_count} />
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${row.total_abs_gap > 0 ? "text-amber-300" : "text-neutral-400"}`}>
                      {Number(row.total_abs_gap || 0).toFixed(2)}
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${gapColor(row.net_gap)}`}>
                      {Number(row.net_gap || 0) > 0 ? "+" : ""}{Number(row.net_gap || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => void loadDetail({ type: "ck", count_date: String(row.count_date || "").slice(0, 10) })}
                        className="rounded-lg border border-violet-400/20 bg-violet-950/30 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-900/40 transition"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailKey && (
        <div className={GLASS + " p-5"}>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">{detailTitle}</div>
            <button type="button" onClick={() => { setDetailKey(null); setDetailRows([]); }} className="text-xs text-neutral-500 underline hover:text-neutral-300">
              Close
            </button>
          </div>
          {detailLoading ? (
            <div className="py-4 text-sm text-neutral-500">Loading detail...</div>
          ) : detailRows.length === 0 ? (
            <div className="py-4 text-sm text-neutral-500">No items found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Counted</th>
                    <th className="px-3 py-2 text-right">Theoretical</th>
                    <th className="px-3 py-2 text-right">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-2 text-neutral-200">{row.item_name}</td>
                      <td className="px-3 py-2 text-neutral-400">{row.category || "-"}</td>
                      <td className="px-3 py-2 text-right text-neutral-300">{Number(row.count_qty || 0).toFixed(3)} {row.unit}</td>
                      <td className="px-3 py-2 text-right text-neutral-300">{Number(row.theoretical_qty || 0).toFixed(3)} {row.unit}</td>
                      <td className={`px-3 py-2 text-right font-medium ${gapColor(row.gap_qty)}`}>
                        {Number(row.gap_qty || 0) > 0 ? "+" : ""}{Number(row.gap_qty || 0).toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
