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
import { RefreshCw, AlertCircle, CheckCircle, Building2, Plus, Search } from "lucide-react";
import SelectDark from "@/components/SelectDark";

type VendorRow = {
  id: string;
  vendor_code: string;
  city: string;
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
  email: string;
  cc_emails: string;
  catalog_aliases: string;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = {
  vendor_code: "",
  city: "",
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
  email: "",
  cc_emails: "",
  catalog_aliases: "",
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
  const [authChecked, setAuthChecked] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [selectedKey, setSelectedKey] = useState("");  // "vendor_code::city"
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const rowKey = (row: VendorRow) => `${row.vendor_code}::${row.city}`;
  const selectedRow = useMemo(
    () => rows.find((row) => rowKey(row) === selectedKey) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selectedKey],
  );

  const filteredRows = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.registered_name.toLowerCase().includes(q) ||
        (r.trade_name || "").toLowerCase().includes(q) ||
        r.vendor_code.toLowerCase().includes(q),
    );
  }, [rows, nameFilter]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      if (cityFilter.trim()) qs.set("city", cityFilter.trim());
      qs.set("limit", "500");
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
  }, [pin, requestedBy, statusFilter, cityFilter]);

  const resetForm = () => { setSelectedKey(""); setForm(EMPTY_FORM); };

  const editRow = (row: VendorRow) => {
    setSelectedKey(rowKey(row));
    setForm({
      vendor_code: row.vendor_code || "",
      city: row.city || "",
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
      email: row.email || "",
      cc_emails: row.cc_emails || "",
      catalog_aliases: row.catalog_aliases || "",
    });
  };

  const save = async () => {
    if (!form.vendor_code.trim() || !form.registered_name.trim() || !form.city.trim()) {
      setError("Vendor code, city, and registered name are required.");
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
      setSelectedKey(`${form.vendor_code.trim().toUpperCase()}::${form.city.trim().toLowerCase()}`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteVendor = async () => {
    if (!selectedRow) return;
    const label = selectedRow.registered_name || selectedRow.vendor_code;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/vendors/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin, vendor_id: selectedRow.id }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Vendor deleted.");
      resetForm();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      // Immediate check from cached role — prevents false "denied" flash while API refreshes
      const localAuth = auth ?? getAuth();
      const _mkt: "dubai" | "manila" = String(localAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      if (canAccessProcurementAdmin(String(localAuth?.role || ""), _mkt)) {
        setAllowed(true);
        setAuthChecked(true);
      }
      const refreshed = await refreshAuthFromApi(localAuth);
      const resolvedAuth = refreshed || localAuth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      setAuthChecked(true);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authChecked) return null;
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <SelectDark
              value={cityFilter}
              onChange={setCityFilter}
              className={SELECT_CLASS}
              options={[
                { value: "", label: "All cities" },
                { value: "dubai", label: "Dubai" },
                { value: "manila", label: "Manila" },
              ]}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
            <SelectDark
              value={statusFilter}
              onChange={setStatusFilter}
              className={SELECT_CLASS}
              options={[
                { value: "", label: "All statuses" },
                { value: "ACTIVE", label: "ACTIVE" },
                { value: "INACTIVE", label: "INACTIVE" },
                { value: "BLOCKED", label: "BLOCKED" },
              ]}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Name / code…"
                className={`${INPUT_CLASS} pl-8`}
              />
            </div>
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
          {/* Result count + search hint */}
          {rows.length > 0 && (
            <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
              <span>
                {nameFilter.trim()
                  ? `${filteredRows.length} of ${rows.length} vendors`
                  : `${rows.length} vendors`}
              </span>
              {nameFilter.trim() && filteredRows.length === 0 && (
                <span className="text-amber-400">No match — try a different name</span>
              )}
            </div>
          )}
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
          {filteredRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => editRow(row)}
              className={[
                "w-full rounded-2xl border p-4 text-left transition-all",
                rowKey(row) === selectedKey
                  ? "border-violet-500/50 bg-violet-500/10"
                  : "border-white/8 bg-white/4 hover:border-violet-500/30 hover:bg-violet-500/8",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(row.status)}
                {riskBadge(row.risk_level)}
                {row.city && (
                  <span className={BADGE_INFO}>{row.city.charAt(0).toUpperCase() + row.city.slice(1)}</span>
                )}
                <span className="font-mono text-xs text-zinc-500">{row.vendor_code}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-white">{row.registered_name}</p>
              {row.trade_name && row.trade_name !== row.registered_name && (
                <p className={T_CAPTION}>{row.trade_name}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                {row.payment_terms && <span>Terms: {row.payment_terms}</span>}
                {row.email && <span className="text-violet-400">✉ {row.email}</span>}
                {row.bank_name && <span>Bank: {row.bank_name}</span>}
                <span>BIR: {row.bir_registered ? "✓" : "✗"}</span>
                <span>Updated: {String(row.updated_at || "").slice(0, 10)}</span>
              </div>
              {row.notes && <p className="mt-1 text-xs text-zinc-400">{row.notes}</p>}
            </button>
          ))}
        </div>

        {/* Edit / Create form — sticky so it stays in view while scrolling the list */}
        <div className="self-start sticky top-5">
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className={T_CARD_TITLE}>{selectedRow ? "Edit Vendor" : "New Vendor"}</p>
            <div className="flex items-center gap-2">
              {selectedRow && (
                <button
                  type="button"
                  onClick={resetForm}
                  title="Create a new vendor"
                  className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  New Vendor
                </button>
              )}
              <button type="button" onClick={resetForm} className="text-xs text-zinc-500 hover:text-zinc-300">
                Reset
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Vendor Code *</label>
                <input value={form.vendor_code} onChange={(e) => setForm((p) => ({ ...p, vendor_code: e.target.value }))} placeholder="e.g. VENDOR001" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>City *</label>
                {selectedRow ? (
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                    <span className="flex-1 text-sm capitalize text-white">{form.city}</span>
                    <span className="text-[10px] text-zinc-500">🔒 locked</span>
                  </div>
                ) : (
                  <SelectDark
                    value={form.city}
                    onChange={v => setForm((p) => ({ ...p, city: v }))}
                    className={SELECT_CLASS}
                    options={[
                      { value: "", label: "Select city" },
                      { value: "dubai", label: "Dubai" },
                      { value: "manila", label: "Manila" },
                    ]}
                  />
                )}
              </div>
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
                <SelectDark
                  value={form.risk_level}
                  onChange={v => setForm((p) => ({ ...p, risk_level: v }))}
                  className={SELECT_CLASS}
                  options={[
                    { value: "GREEN", label: "GREEN" },
                    { value: "YELLOW", label: "YELLOW" },
                    { value: "RED", label: "RED" },
                    { value: "BLACK", label: "BLACK" },
                  ]}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
                <SelectDark
                  value={form.status}
                  onChange={v => setForm((p) => ({ ...p, status: v }))}
                  className={SELECT_CLASS}
                  options={[
                    { value: "ACTIVE", label: "ACTIVE" },
                    { value: "INACTIVE", label: "INACTIVE" },
                    { value: "BLOCKED", label: "BLOCKED" },
                  ]}
                />
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
              <label className={`${T_LABEL} mb-1.5 block`}>Supplier Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="orders@supplier.com" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>CC Emails <span className="text-zinc-400 font-normal">(comma-separated)</span></label>
              <input type="text" value={form.cc_emails} onChange={(e) => setForm((p) => ({ ...p, cc_emails: e.target.value }))} placeholder="ap@supplier.com, manager@supplier.com" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Catalog Aliases <span className="text-zinc-400 font-normal">(comma-separated, for auto-matching)</span></label>
              <input type="text" value={form.catalog_aliases} onChange={(e) => setForm((p) => ({ ...p, catalog_aliases: e.target.value }))} placeholder="Alt Supplier Name, Another Name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Notes / Watchlist Memo</label>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Context, watchlist flags, special terms…" className={`${TEXTAREA_CLASS} min-h-16`} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2`}
              >
                {busy ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</> : (selectedRow ? "Update Vendor" : "Create Vendor")}
              </button>
              {selectedRow && (
                <button
                  type="button"
                  onClick={() => void deleteVendor()}
                  disabled={busy}
                  className="rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
