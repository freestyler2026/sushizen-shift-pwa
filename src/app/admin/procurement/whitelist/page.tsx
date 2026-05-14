"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_ERROR,
  BADGE_WARNING,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, ShieldAlert } from "lucide-react";

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

function riskBadge(level: string) {
  const l = String(level || "").toUpperCase();
  if (l === "CRITICAL") return <span className={BADGE_ERROR}>{l}</span>;
  if (l === "HIGH") return <span className={BADGE_WARNING}>{l}</span>;
  if (l === "MEDIUM") return <span className={BADGE_INFO}>{l}</span>;
  if (l === "WHITELISTED") return <span className={BADGE_SUCCESS}>{l}</span>;
  return <span className={BADGE_INFO}>{level || "-"}</span>;
}

export default function ProcurementWhitelistPage() {
  const auth = useMemo(() => getAuth(), []);
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
  const [successMsg, setSuccessMsg] = useState("");

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
    setSuccessMsg("");
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
      setSuccessMsg("Whitelist entry saved.");
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
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/stockout/recompute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot_date: snapshotDate, approver_name: requestedBy, pin }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Stockout risk recomputed.");
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
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
        Emergency whitelist is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Emergency Whitelist</h2>
          <p className="mt-1 text-sm text-zinc-400">Override stockout risk controls and manage emergency procurement exceptions.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <ShieldAlert className="h-3 w-3" />{whitelistRows.length} entries
        </span>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Session / snapshot bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Snapshot Date</label>
            <DatePicker value={snapshotDate} onChange={setSnapshotDate} />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => void load()} className={`${SECONDARY_BUTTON} flex-1 flex items-center justify-center gap-2`}>
              <RefreshCw className="h-4 w-4" />Refresh
            </button>
            <button type="button" onClick={() => void recompute()} disabled={busy === "recompute"} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60">
              {busy === "recompute" ? "…" : "Recompute"}
            </button>
          </div>
        </div>
      </div>

      {/* Whitelist entry form */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-4`}>Add / Update Whitelist Entry</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Scope Type</label>
            <select value={scopeType} onChange={(e) => setScopeType(e.target.value)} className={SELECT_CLASS}>
              <option value="ITEM">ITEM</option>
              <option value="VENDOR">VENDOR</option>
              <option value="STORE">STORE</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Scope Key</label>
            <input value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} placeholder="Scope key" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Store Code</label>
            <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="MANILA" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Vendor Code</label>
            <input value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} placeholder="VEN001" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Item Code</label>
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="ITEM001" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>SLA Hours</label>
            <input value={slaHours} onChange={(e) => setSlaHours(e.target.value)} placeholder="4" className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
            <DateRangePicker
              value={{ from: startDate, to: endDate }}
              onChange={(range) => { setStartDate(range.from); setEndDate(range.to); }}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div className="sm:col-span-3">
            <label className={`${T_LABEL} mb-1.5 block`}>Emergency Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the emergency reason..." rows={3} className={TEXTAREA_CLASS} />
          </div>
          <div className="sm:col-span-3">
            <button type="button" onClick={() => void upsertWhitelist()} disabled={busy === "upsert"} className={`${PRIMARY_BUTTON} w-full`}>
              {busy === "upsert" ? "Saving…" : "Save Whitelist Entry"}
            </button>
          </div>
        </div>
      </div>

      {/* Whitelist list */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>Active Whitelist</p>
        <div className="space-y-2">
          {whitelistRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-white/6 bg-white/3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-white">{row.scope_type}</span>
                <span className="text-sm text-zinc-300">{row.scope_key || row.item_code || row.vendor_code || "-"}</span>
                {row.active ? <span className={BADGE_SUCCESS}>ACTIVE</span> : <span className={BADGE_ERROR}>INACTIVE</span>}
              </div>
              <div className={`mt-1 ${T_CAPTION}`}>
                Store {row.store_code || "-"} | SLA {row.sla_hours}h | {row.start_date} &ndash; {row.end_date}
              </div>
              <div className={T_CAPTION}>Approved by {row.approver_name || "-"} ({row.approver_role || "-"})</div>
              {row.reason && <p className="mt-2 text-sm text-zinc-300">{row.reason}</p>}
            </div>
          ))}
          {!whitelistRows.length && <p className={T_CAPTION}>No whitelist entries.</p>}
        </div>
      </div>

      {/* Stockout risks */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className={T_SECTION}>Stockout Risk Snapshot</p>
            <p className={`mt-0.5 ${T_CAPTION}`}>Filter by risk level after recompute.</p>
          </div>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="w-44 appearance-none cursor-pointer rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50">
            <option value="">All levels</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="WHITELISTED">WHITELISTED</option>
            <option value="NORMAL">NORMAL</option>
          </select>
        </div>
        <div className="space-y-2">
          {riskRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-white/6 bg-white/3 p-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">{row.item_name}</span>
                  <span className={T_CAPTION}>{row.store_code || "-"}</span>
                  {riskBadge(row.risk_level)}
                </div>
                <span className={T_CAPTION}>Score {Number(row.risk_score || 0).toFixed(1)}</span>
              </div>
              <div className={`mt-1 ${T_CAPTION}`}>
                Vendor {row.vendor_name || "-"} | Days to stockout {Number(row.projected_days_to_stockout || 0).toFixed(2)} | LT {Number(row.lead_time_days || 0).toFixed(2)} | Open PO {Number(row.open_po_qty || 0).toFixed(2)} | Use {Number(row.consumption_rate || 0).toFixed(2)}
              </div>
              {row.recommended_action && <p className="mt-2 text-sm text-amber-300">{row.recommended_action}</p>}
            </div>
          ))}
          {!riskRows.length && <p className={T_CAPTION}>No stockout risk rows for this snapshot.</p>}
        </div>
      </div>
    </div>
  );
}
