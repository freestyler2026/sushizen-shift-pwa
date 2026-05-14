"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_CARD_TITLE,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_ERROR,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Package } from "lucide-react";

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
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [activeOnly, setActiveOnly] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
    setSuccessMsg("");
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
      setSuccessMsg("Item benchmark saved.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Item benchmarks are only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Item Benchmarks</h2>
          <p className="mt-1 text-sm text-zinc-400">Benchmark prices, tolerance thresholds, and preferred vendors per item.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <Package className="h-3 w-3" />{rows.length} items
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

      {/* Session bar */}
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
          <div className="flex items-end gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Active only
            </label>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className="h-4 w-4" />Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">

        {/* Item list */}
        <div className="space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => editRow(row)}
              className={[
                "w-full rounded-2xl border p-4 text-left transition-colors",
                selectedCode === row.item_code
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-white/8 bg-white/4 hover:bg-white/6",
              ].join(" ")}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{row.item_name}</div>
                  <div className={T_CAPTION}>{row.item_code} | {row.category || "-"} | {row.unit || "-"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {row.active ? <span className={BADGE_SUCCESS}>ACTIVE</span> : <span className={BADGE_ERROR}>INACTIVE</span>}
                  {row.high_risk_flag && <span className={BADGE_WARNING}>HIGH RISK</span>}
                </div>
              </div>
              <div className={`mt-1.5 ${T_CAPTION}`}>
                Benchmark {Number(row.benchmark_unit_price || 0).toFixed(2)} | Tolerance {Math.round(Number(row.tolerance_pct || 0) * 100)}% | Vendor {row.preferred_vendor_code || "-"}
              </div>
            </button>
          ))}
          {!rows.length && (
            <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
              <p className={T_CAPTION}>No item benchmarks found.</p>
            </div>
          )}
        </div>

        {/* Edit / Create form */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className={T_CARD_TITLE}>{selectedRow ? "Edit Benchmark" : "New Benchmark"}</p>
              <p className={`mt-0.5 ${T_CAPTION}`}>Benchmark price, tolerance, preferred vendor, and risk flag.</p>
            </div>
            <button type="button" onClick={resetForm} className={SECONDARY_BUTTON}>Reset</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Item Code</label>
              <input value={form.item_code} onChange={(e) => setForm((prev) => ({ ...prev, item_code: e.target.value }))} placeholder="ITEM001" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Item Name</label>
              <input value={form.item_name} onChange={(e) => setForm((prev) => ({ ...prev, item_name: e.target.value }))} placeholder="Item name" className={INPUT_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Category</label>
                <input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Unit</label>
                <input value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="kg / pcs" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Benchmark Unit Price</label>
                <input value={form.benchmark_unit_price} onChange={(e) => setForm((prev) => ({ ...prev, benchmark_unit_price: e.target.value }))} placeholder="0" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Tolerance (0.15 = 15%)</label>
                <input value={form.tolerance_pct} onChange={(e) => setForm((prev) => ({ ...prev, tolerance_pct: e.target.value }))} placeholder="0.15" className={INPUT_CLASS} />
              </div>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Preferred Vendor Code</label>
              <input value={form.preferred_vendor_code} onChange={(e) => setForm((prev) => ({ ...prev, preferred_vendor_code: e.target.value }))} placeholder="VEN001" className={INPUT_CLASS} />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={form.high_risk_flag} onChange={(e) => setForm((prev) => ({ ...prev, high_risk_flag: e.target.checked }))} />
                High-risk item
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
                Active
              </label>
            </div>
            <button type="button" onClick={() => void save()} disabled={busy} className={`${PRIMARY_BUTTON} w-full`}>
              {busy ? "Saving…" : selectedRow ? "Update Benchmark" : "Create Benchmark"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
