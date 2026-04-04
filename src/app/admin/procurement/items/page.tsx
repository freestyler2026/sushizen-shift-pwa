"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type ItemRow = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  unit: string;
  benchmark_unit_price: number;
  tolerance_pct: number;
  preferred_vendor_code: string;
  high_risk_flag: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = {
  item_code: "",
  item_name: "",
  category: "",
  unit: "",
  benchmark_unit_price: "0",
  tolerance_pct: "0.15",
  preferred_vendor_code: "",
  high_risk_flag: false,
  active: true,
};

export default function ProcurementItemsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [activeOnly, setActiveOnly] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedRow = useMemo(
    () => rows.find((row) => row.item_code === selectedCode) || null,
    [rows, selectedCode],
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("active_only", activeOnly ? "true" : "false");
      qs.set("limit", "500");
      const data = await procurementJson<{ rows: ItemRow[] }>(
        `/api/admin/procurement/items?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [activeOnly, pin, requestedBy]);

  const resetForm = () => {
    setSelectedCode("");
    setForm(EMPTY_FORM);
  };

  const editRow = (row: ItemRow) => {
    setSelectedCode(row.item_code);
    setForm({
      item_code: row.item_code || "",
      item_name: row.item_name || "",
      category: row.category || "",
      unit: row.unit || "",
      benchmark_unit_price: String(row.benchmark_unit_price ?? 0),
      tolerance_pct: String(row.tolerance_pct ?? 0.15),
      preferred_vendor_code: row.preferred_vendor_code || "",
      high_risk_flag: Boolean(row.high_risk_flag),
      active: Boolean(row.active),
    });
  };

  const save = async () => {
    if (!form.item_code.trim() || !form.item_name.trim()) {
      setError("item_code and item_name are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/items/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: [
              {
                item_code: form.item_code.trim().toUpperCase(),
                item_name: form.item_name.trim(),
                category: form.category.trim(),
                unit: form.unit.trim(),
                benchmark_unit_price: Number(form.benchmark_unit_price || 0),
                tolerance_pct: Number(form.tolerance_pct || 0.15),
                preferred_vendor_code: form.preferred_vendor_code.trim().toUpperCase(),
                high_risk_flag: form.high_risk_flag,
                active: form.active,
              },
            ],
          }),
        },
        requestedBy,
        pin,
      );
      await load();
      setSelectedCode(form.item_code.trim().toUpperCase());
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
        <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
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
                selectedCode === row.item_code
                  ? "border-amber-500 bg-amber-950/20"
                  : "border-neutral-800 bg-neutral-900/20 hover:bg-neutral-900/30",
              ].join(" ")}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-neutral-100">{row.item_name}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {row.item_code} | {row.category || "-"} | {row.unit || "-"} | {row.active ? "ACTIVE" : "INACTIVE"}
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  {Number(row.benchmark_unit_price || 0).toFixed(2)} / tol {Math.round(Number(row.tolerance_pct || 0) * 100)}%
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Preferred vendor {row.preferred_vendor_code || "-"} | High risk {row.high_risk_flag ? "YES" : "NO"} | Updated {String(row.updated_at || "").slice(0, 16).replace("T", " ")}
              </div>
            </button>
          ))}
          {!rows.length ? <div className="text-sm text-neutral-500">No item benchmarks found.</div> : null}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{selectedRow ? "Edit Benchmark" : "New Benchmark"}</div>
              <div className="mt-1 text-xs text-neutral-500">Benchmark price, tolerance, preferred vendor, and high-risk flag.</div>
            </div>
            <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
              Reset
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <input value={form.item_code} onChange={(e) => setForm((prev) => ({ ...prev, item_code: e.target.value }))} placeholder="Item code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <input value={form.item_name} onChange={(e) => setForm((prev) => ({ ...prev, item_name: e.target.value }))} placeholder="Item name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="Unit" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.benchmark_unit_price} onChange={(e) => setForm((prev) => ({ ...prev, benchmark_unit_price: e.target.value }))} placeholder="Benchmark unit price" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.tolerance_pct} onChange={(e) => setForm((prev) => ({ ...prev, tolerance_pct: e.target.value }))} placeholder="Tolerance pct (0.15 = 15%)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={form.preferred_vendor_code} onChange={(e) => setForm((prev) => ({ ...prev, preferred_vendor_code: e.target.value }))} placeholder="Preferred vendor code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2" />
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              <input type="checkbox" checked={form.high_risk_flag} onChange={(e) => setForm((prev) => ({ ...prev, high_risk_flag: e.target.checked }))} />
              High-risk item
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
              Active
            </label>
            <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
              {busy ? "Saving..." : selectedRow ? "Update Benchmark" : "Create Benchmark"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
