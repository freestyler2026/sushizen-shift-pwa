"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
} from "@/lib/ui-tokens";

type City = "dubai" | "manila";

interface BranchAddr {
  id: string;
  city: string;
  store_code: string;
  display_name: string;
  address: string;
  active: boolean;
  updated_at: string;
}

const EMPTY_FORM = {
  city: "dubai" as City,
  store_code: "",
  display_name: "",
  address: "",
  active: true,
};

export default function DeliveryAddressesPage() {
  const auth = getAuth();
  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [city, setCity] = useState<City>("dubai");
  const [rows, setRows] = useState<BranchAddr[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const a = getAuth();
      const refreshed = await refreshAuthFromApi(a);
      const res = await fetch(`/api/admin/procurement/delivery-addresses?city=${city}`, {
        cache: "no-store",
        headers: getAuthHeaders(refreshed || a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.rows || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId("new");
    setForm({ ...EMPTY_FORM, city });
    setError("");
    setSuccess("");
  };

  const openEdit = (row: BranchAddr) => {
    setEditingId(row.id);
    setForm({
      city: row.city as City,
      store_code: row.store_code,
      display_name: row.display_name,
      address: row.address,
      active: row.active,
    });
    setError("");
    setSuccess("");
  };

  const cancelEdit = () => { setEditingId(null); setError(""); };

  const save = async () => {
    if (!approverName.trim() || !pin.trim()) { setError("Approver name and PIN are required."); return; }
    if (!form.store_code.trim()) { setError("Store code is required."); return; }
    if (!form.address.trim()) { setError("Address is required."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const a = getAuth();
      const refreshed = await refreshAuthFromApi(a);
      const res = await fetch("/api/admin/procurement/delivery-addresses/upsert", {
        method: "POST",
        headers: getAuthHeaders(refreshed || a),
        body: JSON.stringify({ ...form, approver_name: approverName, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`);
      setSuccess(`"${form.store_code.toUpperCase()}" address saved.`);
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: BranchAddr) => {
    if (!approverName.trim() || !pin.trim()) { setError("Enter approver name and PIN before deleting."); return; }
    if (!window.confirm(`Delete address for "${row.store_code}" (${row.city})?`)) return;
    setDeleting(row.id); setError(""); setSuccess("");
    try {
      const a = getAuth();
      const refreshed = await refreshAuthFromApi(a);
      const res = await fetch("/api/admin/procurement/delivery-addresses/delete", {
        method: "POST",
        headers: getAuthHeaders(refreshed || a),
        body: JSON.stringify({ approver_name: approverName, pin, city: row.city, store_code: row.store_code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`);
      setSuccess(`Deleted "${row.store_code}".`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Branch Delivery Addresses</h1>
          <p className={`mt-1 ${T_BODY}`}>
            Manage the delivery addresses auto-filled in Purchase Orders per branch.
          </p>
        </div>
        <button onClick={openNew} className={PRIMARY_BUTTON} type="button">
          + Add Address
        </button>
      </div>

      {/* Auth row */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_LABEL} mb-2`}>Approver credentials</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            className={INPUT_CLASS}
            placeholder="Approver name"
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
          />
          <input
            className={INPUT_CLASS}
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <SelectDark
            className={SELECT_CLASS}
            value={city}
            onChange={(v) => setCity(v as City)}
            options={[
              { value: "dubai", label: "Dubai" },
              { value: "manila", label: "Manila" },
            ]}
          />
          <button onClick={load} className={SECONDARY_BUTTON} type="button" disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
      {success && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</p>}

      {/* Edit / New form */}
      {editingId && (
        <div className={`${GLASS_CARD} p-5 space-y-4`}>
          <h2 className={T_SECTION}>{editingId === "new" ? "Add New Address" : "Edit Address"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className={`${T_LABEL} mb-1`}>City *</p>
              <SelectDark
                className={SELECT_CLASS}
                value={form.city}
                onChange={(v) => setForm((f) => ({ ...f, city: v as City }))}
                options={[
                  { value: "dubai", label: "Dubai" },
                  { value: "manila", label: "Manila" },
                ]}
              />
            </div>
            <div>
              <p className={`${T_LABEL} mb-1`}>Store Code * (e.g. JLT, BB, TAFT)</p>
              <input
                className={INPUT_CLASS}
                placeholder="JLT"
                value={form.store_code}
                onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value.toUpperCase() }))}
                disabled={editingId !== "new"}
              />
            </div>
            <div>
              <p className={`${T_LABEL} mb-1`}>Display Name (optional)</p>
              <input
                className={INPUT_CLASS}
                placeholder="JLT Branch"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id="addr_active"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4"
              />
              <label htmlFor="addr_active" className="text-sm text-zinc-300">Active</label>
            </div>
            <div className="sm:col-span-2">
              <p className={`${T_LABEL} mb-1`}>Delivery Address *</p>
              <textarea
                className={`${TEXTAREA_CLASS} h-20`}
                placeholder="Full delivery address as it should appear on the PO"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={save} className={PRIMARY_BUTTON} disabled={saving} type="button">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={cancelEdit} className={SECONDARY_BUTTON} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={GLASS_CARD}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className={`${TABLE_HEADER} px-4 py-3`}>Store Code</th>
                <th className={`${TABLE_HEADER} px-4 py-3`}>Display Name</th>
                <th className={`${TABLE_HEADER} px-4 py-3`}>Delivery Address</th>
                <th className={`${TABLE_HEADER} px-4 py-3`}>Status</th>
                <th className={`${TABLE_HEADER} px-4 py-3`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                    No addresses registered yet for {city}. Click &quot;Add Address&quot; to start.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className={TABLE_ROW}>
                  <td className={`${TABLE_CELL} px-4 font-mono font-semibold text-violet-300`}>{row.store_code}</td>
                  <td className={`${TABLE_CELL} px-4 text-zinc-300`}>{row.display_name || "—"}</td>
                  <td className={`${TABLE_CELL} px-4 max-w-xs text-zinc-400`}>{row.address}</td>
                  <td className={`${TABLE_CELL} px-4`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.active ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400"}`}>
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={`${TABLE_CELL} px-4`}>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(row)} className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-300 hover:bg-violet-500/20" type="button">
                        Edit
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                        disabled={deleting === row.id}
                        type="button"
                      >
                        {deleting === row.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
