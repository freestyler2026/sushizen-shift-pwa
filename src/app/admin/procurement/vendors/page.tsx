"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_CARD_TITLE,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Building2 } from "lucide-react";

type VendorRow = {
  id: string;
  vendor_code: string;
  registered_name: string;
  trade_name: string;
  tin: string;
  bir_registered: boolean;
  registered_address: string;
  bank_account_name: string;
  bank_account_no: string;
  bank_name: string;
  payment_terms: string;
  risk_level: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = {
  vendor_code: "",
  registered_name: "",
  trade_name: "",
  tin: "",
  bir_registered: false,
  registered_address: "",
  bank_account_name: "",
  bank_account_no: "",
  bank_name: "",
  payment_terms: "",
  risk_level: "GREEN",
  status: "ACTIVE",
  notes: "",
};

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE")   return <span className={BADGE_SUCCESS}>ACTIVE</span>;
  if (s === "INACTIVE") return <span className={BADGE_WARNING}>INACTIVE</span>;
  if (s === "BLOCKED")  return <span className={BADGE_ERROR}>BLOCKED</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

function riskBadge(risk: string) {
  const r = String(risk || "").toUpperCase();
  if (r === "RED" || r === "BLACK") return <span className={BADGE_ERROR}>{r}</span>;
  if (r === "YELLOW") return <span className={BADGE_WARNING}>{r}</span>;
  if (r === "GREEN")  return <span className={BADGE_SUCCESS}>{r}</span>;
  return <span className={BADGE_INFO}>{risk || "-"}</span>;
}

export default function ProcurementVendorsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const selectedRow = useMemo(
    () => rows.find((row) => row.vendor_code === selectedCode) || null,
    [rows, selectedCode],
  );

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "300");
      const data = await procurementJson<{ rows: VendorRow[] }>(
        `/api/admin/procurement/vendors?${qs.toString()}`,
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
  }, [pin, requestedBy, statusFilter]);

  const resetForm = () => { setSelectedCode(""); setForm(EMPTY_FORM); };

  const editRow = (row: VendorRow) => {
    setSelectedCode(row.vendor_code);
    setForm({
      vendor_code: row.vendor_code || "",
      registered_name: row.registered_name || "",
      trade_name: row.trade_name || "",
      tin: row.tin || "",
      bir_registered: Boolean(row.bir_registered),
      registered_address: row.registered_address || "",
      bank_account_name: row.bank_account_name || "",
      bank_account_no: row.bank_account_no || "",
      bank_name: row.bank_name || "",
      payment_terms: row.payment_terms || "",
      risk_level: row.risk_level || "GREEN",
      status: row.status || "ACTIVE",
      notes: row.notes || "",
    });
  };

  const save = async () => {
    if (!form.vendor_code.trim() || !form.registered_name.trim()) {
      setError("Vendor code and registered name are required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/vendors/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: [{
              ...form,
              vendor_code: form.vendor_code.trim().toUpperCase(),
              registered_name: form.registered_name.trim(),
              trade_name: form.trade_name.trim(),
              tin: form.tin.trim(),
              registered_address: form.registered_address.trim(),
              bank_account_name: form.bank_account_name.trim(),
              bank_account_no: form.bank_account_no.trim(),
              bank_name: form.bank_name.trim(),
              payment_terms: form.payment_terms.trim(),
              risk_level: form.risk_level.trim().toUpperCase(),
              status: form.status.trim().toUpperCase(),
              notes: form.notes.trim(),
            }],
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(selectedRow ? "Vendor updated." : "Vendor created.");
      await load();
      setSelectedCode(form.vendor_code.trim().toUpperCase());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
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
        Procurement vendors is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Vendor Master</h2>
          <p className="mt-1 text-sm text-zinc-400">Manage vendor profiles, risk levels, and bank details.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <Building2 className="h-3 w-3" />{rows.length} vendors
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

      {/* Session + Filter */}
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
            <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">

        {/* Vendor list */}
        <div className="space-y-2">
          {loading && !rows.length && (
            <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading vendors…</span>
            </div>
          )}
          {!loading && !rows.length && (
            <div className={`${GLASS_CARD} p-8 flex items-center justify-center`}>
              <p className={T_CAPTION}>No vendors found.</p>
            </div>
          )}
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => editRow(row)}
              className={[
                "w-full rounded-2xl border p-4 text-left transition-all",
                selectedCode === row.vendor_code
                  ? "border-violet-500/50 bg-violet-500/10"
                  : "border-white/8 bg-white/4 hover:border-violet-500/30 hover:bg-violet-500/8",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(row.status)}
                {riskBadge(row.risk_level)}
                <span className="font-mono text-xs text-zinc-500">{row.vendor_code}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-white">{row.registered_name}</p>
              {row.trade_name && row.trade_name !== row.registered_name && (
                <p className={T_CAPTION}>{row.trade_name}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                {row.payment_terms && <span>Terms: {row.payment_terms}</span>}
                {row.bank_name && <span>Bank: {row.bank_name}</span>}
                <span>BIR: {row.bir_registered ? "✓" : "✗"}</span>
                <span>Updated: {String(row.updated_at || "").slice(0, 10)}</span>
              </div>
              {row.notes && <p className="mt-1 text-xs text-zinc-400">{row.notes}</p>}
            </button>
          ))}
        </div>

        {/* Edit / Create form */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className={T_CARD_TITLE}>{selectedRow ? "Edit Vendor" : "New Vendor"}</p>
            <button type="button" onClick={resetForm} className="text-xs text-zinc-500 hover:text-zinc-300">
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Vendor Code *</label>
              <input value={form.vendor_code} onChange={(e) => setForm((p) => ({ ...p, vendor_code: e.target.value }))} placeholder="e.g. VENDOR001" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Registered Name *</label>
              <input value={form.registered_name} onChange={(e) => setForm((p) => ({ ...p, registered_name: e.target.value }))} placeholder="Legal business name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Trade Name</label>
              <input value={form.trade_name} onChange={(e) => setForm((p) => ({ ...p, trade_name: e.target.value }))} placeholder="DBA / trade name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>TIN</label>
              <input value={form.tin} onChange={(e) => setForm((p) => ({ ...p, tin: e.target.value }))} placeholder="Tax identification number" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Registered Address</label>
              <textarea value={form.registered_address} onChange={(e) => setForm((p) => ({ ...p, registered_address: e.target.value }))} placeholder="Address" className={`${TEXTAREA_CLASS} min-h-16`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Bank Name</label>
                <input value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} placeholder="Bank" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Account No</label>
                <input value={form.bank_account_no} onChange={(e) => setForm((p) => ({ ...p, bank_account_no: e.target.value }))} placeholder="Account number" className={INPUT_CLASS} />
              </div>
              <div className="col-span-2">
                <label className={`${T_LABEL} mb-1.5 block`}>Account Name</label>
                <input value={form.bank_account_name} onChange={(e) => setForm((p) => ({ ...p, bank_account_name: e.target.value }))} placeholder="Account holder name" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Payment Terms</label>
                <input value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))} placeholder="e.g. Net 30" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Risk Level</label>
                <select value={form.risk_level} onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value }))} className={SELECT_CLASS}>
                  <option value="GREEN">GREEN</option>
                  <option value="YELLOW">YELLOW</option>
                  <option value="RED">RED</option>
                  <option value="BLACK">BLACK</option>
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={SELECT_CLASS}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={form.bir_registered}
                    onChange={(e) => setForm((p) => ({ ...p, bir_registered: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  BIR Registered
                </label>
              </div>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Notes / Watchlist Memo</label>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Context, watchlist flags, special terms…" className={`${TEXTAREA_CLASS} min-h-16`} />
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              {busy ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</> : (selectedRow ? "Update Vendor" : "Create Vendor")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
