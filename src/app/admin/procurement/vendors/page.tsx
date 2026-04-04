"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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

export default function ProcurementVendorsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedRow = useMemo(
    () => rows.find((row) => row.vendor_code === selectedCode) || null,
    [rows, selectedCode],
  );

  const load = useCallback(async () => {
    setError("");
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
    }
  }, [pin, requestedBy, statusFilter]);

  const resetForm = () => {
    setSelectedCode("");
    setForm(EMPTY_FORM);
  };

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
      setError("vendor_code and registered_name are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/vendors/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: [
              {
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
              },
            ],
          }),
        },
        requestedBy,
        pin,
      );
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => editRow(row)}
              className={[
                "w-full rounded-2xl border p-4 text-left",
                selectedCode === row.vendor_code
                  ? "border-amber-500 bg-amber-950/20"
                  : "border-neutral-800 bg-neutral-900/20 hover:bg-neutral-900/30",
              ].join(" ")}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-neutral-100">{row.registered_name}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {row.vendor_code} | {row.trade_name || "-"} | {row.status} | Risk {row.risk_level || "-"}
                  </div>
                </div>
                <div className="text-xs text-neutral-500">{row.payment_terms || "No payment terms"}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                BIR {row.bir_registered ? "REGISTERED" : "NOT REGISTERED"} | Bank {row.bank_name || "-"} | Updated {String(row.updated_at || "").slice(0, 16).replace("T", " ")}
              </div>
              {row.notes ? <div className="mt-2 text-sm text-neutral-300">{row.notes}</div> : null}
            </button>
          ))}
          {!rows.length ? <div className="text-sm text-neutral-500">No vendors found.</div> : null}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{selectedRow ? "Edit Vendor" : "New Vendor"}</div>
              <div className="mt-1 text-xs text-neutral-500">Vendor master, risk level, payment terms, and bank details.</div>
            </div>
            <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
              Reset
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <input value={form.vendor_code} onChange={(e) => setForm((prev) => ({ ...prev, vendor_code: e.target.value }))} placeholder="Vendor code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <input value={form.registered_name} onChange={(e) => setForm((prev) => ({ ...prev, registered_name: e.target.value }))} placeholder="Registered name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <input value={form.trade_name} onChange={(e) => setForm((prev) => ({ ...prev, trade_name: e.target.value }))} placeholder="Trade name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <input value={form.tin} onChange={(e) => setForm((prev) => ({ ...prev, tin: e.target.value }))} placeholder="TIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <textarea value={form.registered_address} onChange={(e) => setForm((prev) => ({ ...prev, registered_address: e.target.value }))} placeholder="Registered address" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input value={form.bank_account_name} onChange={(e) => setForm((prev) => ({ ...prev, bank_account_name: e.target.value }))} placeholder="Bank account name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.bank_account_no} onChange={(e) => setForm((prev) => ({ ...prev, bank_account_no: e.target.value }))} placeholder="Bank account no" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.bank_name} onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))} placeholder="Bank name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.payment_terms} onChange={(e) => setForm((prev) => ({ ...prev, payment_terms: e.target.value }))} placeholder="Payment terms" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <select value={form.risk_level} onChange={(e) => setForm((prev) => ({ ...prev, risk_level: e.target.value }))} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                <option value="GREEN">GREEN</option>
                <option value="YELLOW">YELLOW</option>
                <option value="RED">RED</option>
                <option value="BLACK">BLACK</option>
              </select>
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              <input type="checkbox" checked={form.bir_registered} onChange={(e) => setForm((prev) => ({ ...prev, bir_registered: e.target.checked }))} />
              BIR registered
            </label>
            <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes / watchlist memo / vendor context" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
              {busy ? "Saving..." : selectedRow ? "Update Vendor" : "Create Vendor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
