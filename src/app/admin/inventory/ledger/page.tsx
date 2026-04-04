"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import { inventoryGet } from "@/lib/inventoryClient";

type BalanceRow = {
  item_id: string;
  item_name: string;
  sku: string;
  branch_code: string;
  on_hand_qty: number;
  on_hand_value: number;
  business_date: string;
};

type LedgerRow = {
  id: string;
  item_name: string;
  sku: string;
  branch_code: string;
  event_type: string;
  event_ref_no: string;
  delta_qty: number;
  balance_qty_after: number;
  business_date: string;
  created_by: string;
};

export default function InventoryLedgerPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "manila") as "manila" | "dubai");
  const [branchCode, setBranchCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity((resolved?.city || auth?.city || "manila") as "manila" | "dubai");
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [balancesRes, ledgerRes] = await Promise.all([
          inventoryGet<{ rows: BalanceRow[] }>(
            `/api/admin/inventory/balances?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=100`,
          ),
          inventoryGet<{ rows: LedgerRow[] }>(
            `/api/admin/inventory/ledger?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=100`,
          ),
        ]);
        if (cancelled) return;
        setBalances(balancesRes.rows || []);
        setLedgerRows(ledgerRes.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, ready]);

  if (!ready) return <div className="text-sm text-neutral-500">Loading ledger...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Ledger / Balances</div>
            <div className="mt-1 text-sm text-neutral-400">Current on-hand stock and recent inventory movements.</div>
          </div>
          <div className="text-xs text-neutral-500">{loading ? "Loading..." : `${ledgerRows.length} ledger rows`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as "manila" | "dubai")}
          >
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={branchCode}
            onChange={(e) => setBranchCode(e.target.value)}
          >
            <option value="">All branches</option>
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 text-sm font-semibold text-neutral-100">Current Balances</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <tr key={`${row.item_id}-${row.branch_code}`} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.item_name}</td>
                  <td className="px-3 py-2">{row.sku || "-"}</td>
                  <td className="px-3 py-2">{row.branch_code || "-"}</td>
                  <td className="px-3 py-2">{Number(row.on_hand_qty || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{Number(row.on_hand_value || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{row.business_date || "-"}</td>
                </tr>
              ))}
              {!loading && balances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    No balances found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 text-sm font-semibold text-neutral-100">Recent Ledger Entries</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Delta</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">Ref</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.business_date}</td>
                  <td className="px-3 py-2">
                    <div>{row.item_name}</div>
                    <div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}</div>
                  </td>
                  <td className="px-3 py-2">{row.branch_code || "-"}</td>
                  <td className="px-3 py-2">{row.event_type || "-"}</td>
                  <td className="px-3 py-2">{Number(row.delta_qty || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{Number(row.balance_qty_after || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">
                    <div>{row.event_ref_no || "-"}</div>
                    <div className="mt-1 text-xs text-neutral-500">{row.created_by || "-"}</div>
                  </td>
                </tr>
              ))}
              {!loading && ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    No ledger entries found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
