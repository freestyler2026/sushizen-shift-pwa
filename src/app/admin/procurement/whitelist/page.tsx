"use client";

import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type WhitelistRow = {
  id: string;
  scope_type: string;
  scope_key: string;
  vendor_code: string;
  item_code: string;
  store_code: string;
  reason: string;
  approver_name: string;
  approver_role: string;
  start_date: string;
  end_date: string;
  sla_hours: number;
  active: boolean;
};

type RiskRow = {
  id: string;
  snapshot_date: string;
  request_id: string;
  case_id: string;
  item_name: string;
  vendor_name: string;
  store_code: string;
  projected_days_to_stockout: number;
  lead_time_days: number;
  open_po_qty: number;
  consumption_rate: number;
  risk_level: string;
  risk_score: number;
  recommended_action: string;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProcurementWhitelistPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [snapshotDate, setSnapshotDate] = useState(todayIso());
  const [riskLevel, setRiskLevel] = useState("");
  const [scopeType, setScopeType] = useState("ITEM");
  const [scopeKey, setScopeKey] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [storeCode, setStoreCode] = useState("MANILA");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(plusDays(7));
  const [slaHours, setSlaHours] = useState("4");
  const [active, setActive] = useState(true);
  const [whitelistRows, setWhitelistRows] = useState<WhitelistRow[]>([]);
  const [riskRows, setRiskRows] = useState<RiskRow[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [wl, risk] = await Promise.all([
        procurementJson<{ rows: WhitelistRow[] }>(
          "/api/admin/procurement/whitelist?active_only=false&limit=200",
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: RiskRow[] }>(
          `/api/admin/procurement/stockout/risks?snapshot_date=${encodeURIComponent(snapshotDate)}&risk_level=${encodeURIComponent(riskLevel)}&limit=200`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
      ]);
      setWhitelistRows(Array.isArray(wl?.rows) ? wl.rows : []);
      setRiskRows(Array.isArray(risk?.rows) ? risk.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestedBy, riskLevel, snapshotDate]);

  const upsertWhitelist = async () => {
    if (!scopeKey.trim() && !vendorCode.trim() && !itemCode.trim()) {
      setError("scope_key, vendor_code, or item_code is required.");
      return;
    }
    setBusy("upsert");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/whitelist/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: [
              {
                scope_type: scopeType,
                scope_key: scopeKey.trim(),
                vendor_code: vendorCode.trim(),
                item_code: itemCode.trim(),
                store_code: storeCode.trim(),
                reason: reason.trim(),
                start_date: startDate,
                end_date: endDate,
                sla_hours: Number(slaHours || 4),
                active,
              },
            ],
          }),
        },
        requestedBy,
        pin,
      );
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const recompute = async () => {
    setBusy("recompute");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/stockout/recompute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot_date: snapshotDate,
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
          <button type="button" onClick={() => void recompute()} disabled={busy === "recompute"} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/30 disabled:opacity-60">
            {busy === "recompute" ? "Running..." : "Recompute"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-3">
        <select value={scopeType} onChange={(e) => setScopeType(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="ITEM">ITEM</option>
          <option value="VENDOR">VENDOR</option>
          <option value="STORE">STORE</option>
        </select>
        <input value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} placeholder="Scope key" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="Store code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} placeholder="Vendor code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Item code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={slaHours} onChange={(e) => setSlaHours(e.target.value)} placeholder="SLA hours" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Emergency reason" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3" />
        <button type="button" onClick={() => void upsertWhitelist()} disabled={busy === "upsert"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-3">
          {busy === "upsert" ? "Saving..." : "Upsert Whitelist"}
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Emergency Whitelist</div>
        <div className="mt-3 space-y-2">
          {whitelistRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-sm text-neutral-100">{row.scope_type} | {row.scope_key || row.item_code || row.vendor_code || "-"}</div>
              <div className="mt-1 text-xs text-neutral-500">
                Store {row.store_code || "-"} | SLA {row.sla_hours}h | {row.start_date} - {row.end_date} | {row.active ? "ACTIVE" : "INACTIVE"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">Approved by {row.approver_name || "-"} ({row.approver_role || "-"})</div>
              {row.reason ? <div className="mt-2 text-sm text-neutral-300">{row.reason}</div> : null}
            </div>
          ))}
          {!whitelistRows.length ? <div className="text-sm text-neutral-500">No whitelist rows.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Stockout Risk Snapshot</div>
            <div className="mt-1 text-xs text-neutral-500">Filter by risk level after recompute.</div>
          </div>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <option value="">All levels</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="WHITELISTED">WHITELISTED</option>
            <option value="NORMAL">NORMAL</option>
          </select>
        </div>
        <div className="mt-3 space-y-2">
          {riskRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-neutral-100">{row.item_name} | {row.store_code || "-"}</div>
                <div className="text-xs text-neutral-400">{row.risk_level} / Score {Number(row.risk_score || 0).toFixed(1)}</div>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Vendor {row.vendor_name || "-"} | Days to stockout {Number(row.projected_days_to_stockout || 0).toFixed(2)} | LT {Number(row.lead_time_days || 0).toFixed(2)} | Open PO {Number(row.open_po_qty || 0).toFixed(2)} | Use {Number(row.consumption_rate || 0).toFixed(2)}
              </div>
              <div className="mt-2 text-sm text-amber-200">{row.recommended_action || "-"}</div>
            </div>
          ))}
          {!riskRows.length ? <div className="text-sm text-neutral-500">No stockout risk rows.</div> : null}
        </div>
      </div>
    </div>
  );
}
