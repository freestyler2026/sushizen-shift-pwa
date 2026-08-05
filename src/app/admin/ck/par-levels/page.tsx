"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { getAuth, getAuthHeaders, getUploadHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

// ── types ─────────────────────────────────────────────────────────────────────
interface ParLevelRow {
  id: string;
  city: string;
  item_type: "ck_produced" | "supplier";
  item_name: string;
  unit: string | null;
  par_level: number | null;
  current_stock: number | null;
  category: string | null;
  supplier: string | null;
  notes: string | null;
  updated_at: string;
}

interface ImportResult {
  ok: boolean;
  parsed_total: number;
  upserted_with_par: number;
  inserted: number;
  updated: number;
  errors: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────
const CITIES = ["Manila", "Dubai"] as const;
type City = (typeof CITIES)[number];
const cityParam = (c: City) => c.toLowerCase();

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// ── component ─────────────────────────────────────────────────────────────────
export default function CkParLevelsPage() {
  const [city, setCity] = useState<City>("Manila");
  const [tab, setTab] = useState<"ck_produced" | "supplier">("ck_produced");
  const [rows, setRows] = useState<ParLevelRow[]>([]);
  const [stockDate, setStockDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // seed state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string>("");
  const [seedConfirm, setSeedConfirm] = useState(false);

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // search filter
  const [search, setSearch] = useState("");

  // delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // generate plan
  const [generating, setGenerating] = useState(false);

  // push to production plan
  const [pushingToPlan, setPushingToPlan] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; msg: string; planId?: number } | null>(null);

  // vendor list for supplier dropdown
  const [vendors, setVendors] = useState<string[]>([]);

  // supplier inline edit
  const [editingSupId, setEditingSupId] = useState<string | null>(null);
  const [suppValue, setSuppValue] = useState<string>("");
  const [savingSup, setSavingSup] = useState(false);

  // create direct purchase orders modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPin, setCreatePin] = useState("");
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── fetch rows ────────────────────────────────────────────────────────────
  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels?city=${cityParam(city)}&item_type=${tab}`,
        { headers: getAuthHeaders(auth) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load");
      setRows(data.rows || []);
      setStockDate(data.stock_date || null);
    } catch (e: any) {
      setError(e.message || "Error loading par levels");
    } finally {
      setLoading(false);
    }
  }, [city, tab]);

  useEffect(() => {
    loadRows();
    setSeedResult("");
    setImportResult(null);
  }, [loadRows]);

  // ── load vendors ──────────────────────────────────────────────────────────
  useEffect(() => {
    const auth = getAuth();
    fetch(`${API_BASE}/api/admin/ck/par-levels/vendors?city=${cityParam(city)}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => { if (d.vendors) setVendors(d.vendors); })
      .catch(() => {});
  }, [city]);

  // ── supplier inline save ──────────────────────────────────────────────────
  const saveSupplier = async (row: ParLevelRow, value: string) => {
    setSavingSup(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
        {
          method: "PUT",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({ supplier: value || null }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");
      setRows((prev) =>
        prev.map((r) => r.id === row.id ? { ...r, supplier: data.row.supplier } : r)
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingSup(false);
      setEditingSupId(null);
    }
  };

  // ── create direct purchase orders ─────────────────────────────────────────
  const handleCreateOrders = async () => {
    if (!createPin.trim()) { alert("Please enter your PIN."); return; }
    setCreatingOrders(true);
    setCreateResult(null);
    try {
      const auth = getAuth();
      if (!auth) throw new Error("Not authenticated");

      // Group items by supplier where TO ORDER > 0
      const toOrder = rows.filter((r) => {
        const sup = (r.supplier || "").trim();
        if (!sup || sup === "—" || sup === "-" || r.par_level == null || r.current_stock == null) return false;
        return Math.max(0, r.par_level - r.current_stock) > 0;
      });

      const bySupplier: Record<string, ParLevelRow[]> = {};
      for (const r of toOrder) {
        const sup = r.supplier!;
        if (!bySupplier[sup]) bySupplier[sup] = [];
        bySupplier[sup].push(r);
      }

      const supplierNames = Object.keys(bySupplier);
      if (supplierNames.length === 0) {
        setCreateResult({ ok: false, msg: "No items with supplier and quantity to order." });
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      let successCount = 0;
      const errors: string[] = [];

      for (const vendorName of supplierNames) {
        const items = bySupplier[vendorName].map((r) => ({
          item_name: r.item_name,
          category: r.category || "General",
          qty: Math.max(0, (r.par_level ?? 0) - (r.current_stock ?? 0)),
          unit: r.unit || "pc",
          unit_price: 0,
        }));

        const fd = new FormData();
        fd.append("approver_name", auth.staffName || "");
        fd.append("pin", createPin);
        fd.append("city", cityParam(city));
        fd.append("store_code", "CK");
        fd.append("vendor_name", vendorName);
        fd.append("request_date", today);
        fd.append("notes", `Auto-created from CK Par Level (${today})`);
        fd.append("items_json", JSON.stringify(items));

        const res = await fetch(`${API_BASE}/api/admin/procurement/direct-purchase`, {
          method: "POST",
          headers: getUploadHeaders(auth),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          errors.push(`${vendorName}: ${data.detail || "Failed"}`);
        } else {
          successCount++;
        }
      }

      if (errors.length === 0) {
        setCreateResult({ ok: true, msg: `${successCount} purchase order${successCount !== 1 ? "s" : ""} created successfully. Unit prices are set to 0 — please update before approving.` });
      } else if (successCount > 0) {
        setCreateResult({ ok: false, msg: `${successCount} created, ${errors.length} failed: ${errors.join("; ")}` });
      } else {
        setCreateResult({ ok: false, msg: errors.join("; ") });
      }
      setCreatePin("");
    } catch (e: any) {
      setCreateResult({ ok: false, msg: e.message });
    } finally {
      setCreatingOrders(false);
    }
  };

  // ── create order summary ──────────────────────────────────────────────────
  const orderGroups = (() => {
    const toOrder = rows.filter((r) => {
      if (tab !== "supplier") return false;
      const sup = (r.supplier || "").trim();
      if (!sup || sup === "—" || sup === "-" || r.par_level == null || r.current_stock == null) return false;
      return Math.max(0, r.par_level - r.current_stock) > 0;
    });
    const bySupplier: Record<string, { items: ParLevelRow[]; totalItems: number }> = {};
    for (const r of toOrder) {
      const sup = r.supplier!;
      if (!bySupplier[sup]) bySupplier[sup] = { items: [], totalItems: 0 };
      bySupplier[sup].items.push(r);
      bySupplier[sup].totalItems++;
    }
    return bySupplier;
  })();

  // ── seed from Cost Calc ───────────────────────────────────────────────────
  const handleSeed = async () => {
    if (!seedConfirm) { setSeedConfirm(true); return; }
    setSeedConfirm(false);
    setSeeding(true);
    setSeedResult("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/seed?city=${cityParam(city)}`,
        { method: "POST", headers: getAuthHeaders(auth) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Seed failed");
      setSeedResult(
        `Seeded: ${data.ck_produced_seeded} CK-Produced + ${data.supplier_seeded} Supplier items added.`
      );
      await loadRows();
    } catch (e: any) {
      setSeedResult(`Error: ${e.message}`);
    } finally {
      setSeeding(false);
    }
  };

  // ── upload Excel ─────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    try {
      const auth = getAuth();
      const form = new FormData();
      form.append("file", file);
      form.append("city", ""); // both cities
      const res = await fetch(`${API_BASE}/api/admin/ck/par-levels/import`, {
        method: "POST",
        headers: getUploadHeaders(auth),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setImportResult(data);
      await loadRows();
    } catch (e: any) {
      setImportResult({ ok: false, parsed_total: 0, upserted_with_par: 0, inserted: 0, updated: 0, errors: [e.message] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── inline edit ───────────────────────────────────────────────────────────
  const startEdit = (row: ParLevelRow) => {
    setEditingId(row.id);
    setEditVal(row.par_level != null ? String(row.par_level) : "");
  };

  const saveEdit = async (row: ParLevelRow) => {
    setSaving(true);
    try {
      const auth = getAuth();
      const par = editVal.trim() === "" ? null : parseFloat(editVal);
      if (editVal.trim() !== "" && isNaN(par as number)) {
        alert("Please enter a valid number.");
        setSaving(false);
        return;
      }
      if (par != null && par < 0) {
        alert("Par level cannot be negative.");
        setSaving(false);
        return;
      }
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
        {
          method: "PUT",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({ par_level: par }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, par_level: data.row.par_level } : r
        )
      );
      setEditingId(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── delete item ───────────────────────────────────────────────────────────
  const handleDelete = async (row: ParLevelRow) => {
    if (deleteConfirmId !== row.id) {
      setDeleteConfirmId(row.id);
      return;
    }
    setDeleting(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
        { method: "DELETE", headers: getAuthHeaders(auth) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  // ── generate plan / purchase order ───────────────────────────────────────
  const handleGenerate = async (planType: "production" | "purchase") => {
    setGenerating(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/generate?city=${cityParam(city)}&plan_type=${planType}`,
        { headers: getAuthHeaders(auth) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "Generate failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = planType === "production"
        ? `CK_ProductionPlan_${city}_${today}.xlsx`
        : `CK_PurchaseOrder_${city}_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "Error generating file");
    } finally {
      setGenerating(false);
    }
  };

  // ── push to production plan ───────────────────────────────────────────────
  const handlePushToPlan = async () => {
    setPushingToPlan(true);
    setPushResult(null);
    try {
      const auth = getAuth();
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(
        `${API_BASE}/api/admin/ck/par-levels/push-to-plan?city=${cityParam(city)}&plan_date=${today}`,
        { method: "POST", headers: getAuthHeaders(auth) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Push failed");
      setPushResult({
        ok: true,
        msg: `Production Plan created — ${data.items_added} items added${data.stock_date ? ` (stock as of ${data.stock_date})` : ""}`,
        planId: data.plan_id,
      });
    } catch (e: any) {
      setPushResult({ ok: false, msg: e.message || "Error pushing to production plan" });
    } finally {
      setPushingToPlan(false);
    }
  };

  // ── filtered rows ─────────────────────────────────────────────────────────
  const filtered = rows.filter((r) =>
    !search || r.item_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const withPar = rows.filter((r) => r.par_level != null).length;
  const withoutPar = rows.length - withPar;
  const withStock = rows.filter((r) => r.current_stock != null).length;

  const gapLabel = tab === "ck_produced" ? "To Produce" : "To Order";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0a0a0f] p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>CK Par Level Management</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Set target stock levels for CK-Produced items and Supplier orders.
            </p>
          </div>

          {/* City toggle */}
          <div className="flex gap-2">
            {CITIES.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={city === c ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-4 gap-4">
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <div className="text-2xl font-bold text-white">{rows.length}</div>
            <div className="text-xs text-zinc-400 mt-1">Total Items</div>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <div className="text-2xl font-bold text-emerald-400">{withPar}</div>
            <div className="text-xs text-zinc-400 mt-1">Par Level Set</div>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <div className="text-2xl font-bold text-amber-400">{withoutPar}</div>
            <div className="text-xs text-zinc-400 mt-1">Not Set</div>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <div className="text-2xl font-bold text-sky-400">{withStock}</div>
            <div className="text-xs text-zinc-400 mt-1">
              {stockDate
                ? `Stock (${new Date(stockDate).toLocaleDateString()})`
                : "Stock Linked"}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className={`${GLASS_CARD} p-4 flex flex-wrap items-center gap-3`}>
          {/* Tabs */}
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => setTab("ck_produced")}
              className={tab === "ck_produced" ? TAB_ACTIVE : TAB_INACTIVE}
            >
              🏭 CK-Produced
            </button>
            <button
              onClick={() => setTab("supplier")}
              className={tab === "supplier" ? TAB_ACTIVE : TAB_INACTIVE}
            >
              🚚 Supplier Orders
            </button>
          </div>

          {/* Seed button */}
          {seedConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">Seed {city} from Cost Calc?</span>
              <button onClick={handleSeed} disabled={seeding} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 disabled:opacity-60">Yes, Seed</button>
              <button onClick={() => setSeedConfirm(false)} className="rounded-lg bg-zinc-500/20 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-500/30">Cancel</button>
            </div>
          ) : (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="rounded-xl border border-blue-500/30 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-60 transition-all"
            >
              {seeding ? "Seeding…" : "⟳ Seed from Cost Calc"}
            </button>
          )}

          {/* Upload Excel */}
          <label className={`cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 transition-all">
              {uploading ? "Uploading…" : "⬆ Upload Excel"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleUpload}
            />
          </label>

          {/* Generate Plan button */}
          <button
            onClick={() => handleGenerate(tab === "ck_produced" ? "production" : "purchase")}
            disabled={generating || rows.filter(r => r.par_level != null).length === 0}
            className="rounded-xl border border-violet-500/30 bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-400 hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {generating ? "Generating…" : tab === "ck_produced" ? "📋 Production Plan" : "📋 Purchase Order"}
          </button>

          {/* Push to Production Plan (CK-Produced tab only) */}
          {tab === "ck_produced" && (
            <button
              onClick={handlePushToPlan}
              disabled={pushingToPlan || rows.filter((r) => r.par_level != null).length === 0}
              className="rounded-xl border border-orange-500/30 bg-orange-500/15 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {pushingToPlan ? "Pushing…" : "🚀 Push to Production Plan"}
            </button>
          )}

          {/* Create Direct Purchase Orders (Supplier tab only) */}
          {tab === "supplier" && (
            <button
              onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreatePin(""); }}
              disabled={Object.keys(orderGroups).length === 0}
              className="rounded-xl border border-teal-500/30 bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-400 hover:bg-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title={Object.keys(orderGroups).length === 0 ? "No items with supplier + quantity to order" : ""}
            >
              🛒 Create Direct Purchase Orders ({Object.keys(orderGroups).length} supplier{Object.keys(orderGroups).length !== 1 ? "s" : ""})
            </button>
          )}

          {/* Download template link */}
          <a
            href="/CK_ParLevel_Template.xlsx"
            className="rounded-xl border border-zinc-500/30 bg-zinc-500/10 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-500/20 transition-all"
          >
            ⬇ Download Template
          </a>
        </div>

        {/* Push result */}
        {pushResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-4 ${pushResult.ok ? "border-orange-500/30 bg-orange-500/10 text-orange-300" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
            <span>{pushResult.msg}</span>
            {pushResult.ok && (
              <a
                href="/store/ck-production-plan"
                className="shrink-0 rounded-lg bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-300 hover:bg-orange-500/30 transition-all"
              >
                Open Plan →
              </a>
            )}
          </div>
        )}

        {/* Seed result */}
        {seedResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${seedResult.startsWith("Error") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
            {seedResult}
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${importResult.ok && importResult.errors.length === 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
            <div className="font-semibold">
              Import complete — {importResult.upserted_with_par} rows with Par Level saved
              ({importResult.inserted} new, {importResult.updated} updated)
            </div>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Search */}
        <div className={GLASS_CARD + " p-3"}>
          <input
            type="text"
            placeholder="Search by item name or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none border border-white/10 focus:border-violet-500/50"
          />
        </div>

        {/* Table */}
        <div className={GLASS_CARD + " overflow-hidden"}>
          {/* Stock date banner */}
          {stockDate && (
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
              <span className="text-xs text-sky-400/80">
                Current stock linked from CK Inventory session on{" "}
                <span className="font-semibold text-sky-300">
                  {new Date(stockDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-zinc-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-sm">
              No items found. Click <span className="text-blue-400">⟳ Seed from Cost Calc</span> to populate the list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-zinc-500 uppercase tracking-wide">
                    {tab === "supplier" && (
                      <th className="px-4 py-3 text-left">Category</th>
                    )}
                    <th className="px-4 py-3 text-left">Item Name</th>
                    <th className="px-4 py-3 text-center">Unit</th>
                    <th className="px-4 py-3 text-center">Par Level</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-center">{gapLabel}</th>
                    {tab === "supplier" && (
                      <th className="px-4 py-3 text-left">Supplier</th>
                    )}
                    <th className="px-4 py-3 text-right text-xs">Updated</th>
                    <th className="px-2 py-3 text-center text-xs w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => {
                    const isEditing = editingId === row.id;

                    // Gap calculation
                    const gap =
                      row.par_level != null && row.current_stock != null
                        ? Math.max(0, row.par_level - row.current_stock)
                        : null;

                    const gapColor =
                      gap == null
                        ? "text-zinc-600"
                        : gap === 0
                        ? "text-emerald-400"
                        : tab === "ck_produced"
                        ? "text-indigo-400"
                        : "text-orange-400";

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-white/5 transition-colors ${idx % 2 === 0 ? "bg-white/[0.01]" : ""} hover:bg-white/[0.03]`}
                      >
                        {tab === "supplier" && (
                          <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.category || "—"}</td>
                        )}
                        <td className="px-4 py-2.5 text-white font-medium">{row.item_name}</td>
                        <td className="px-4 py-2.5 text-center text-zinc-400 text-xs">{row.unit || "—"}</td>

                        {/* Par Level — inline editable */}
                        <td className="px-4 py-2.5 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(row);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                autoFocus
                                className="w-24 rounded-lg bg-white/10 px-2 py-1 text-center text-white text-sm border border-violet-500/50 outline-none"
                              />
                              <button
                                onClick={() => saveEdit(row)}
                                disabled={saving}
                                className="rounded-lg bg-violet-500/30 px-2 py-1 text-violet-300 text-xs hover:bg-violet-500/50 disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-lg bg-zinc-500/20 px-2 py-1 text-zinc-400 text-xs hover:bg-zinc-500/40"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(row)}
                              className={`rounded-lg px-3 py-1 text-sm font-semibold whitespace-nowrap transition-all ${
                                row.par_level != null
                                  ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                                  : "bg-amber-500/10 text-amber-500/70 hover:bg-amber-500/20"
                              }`}
                            >
                              {row.par_level != null
                                ? fmtNum(row.par_level)
                                : "— Set —"}
                            </button>
                          )}
                        </td>

                        {/* Current Stock — read-only, from CK Inventory */}
                        <td className="px-4 py-2.5 text-center">
                          {row.current_stock != null ? (
                            <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-sm font-semibold text-sky-300">
                              {fmtNum(row.current_stock)}
                            </span>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Gap: To Produce / To Order */}
                        <td className={`px-4 py-2.5 text-center text-sm font-semibold ${gapColor}`}>
                          {gap != null ? (
                            gap === 0 ? (
                              <span className="text-emerald-400 text-xs">✓ OK</span>
                            ) : (
                              fmtNum(gap)
                            )
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>

                        {tab === "supplier" && (
                          <td className="px-4 py-2.5 text-xs">
                            {editingSupId === row.id ? (
                              <div className="flex items-center gap-1">
                                <select
                                  autoFocus
                                  value={suppValue}
                                  onChange={(e) => setSuppValue(e.target.value)}
                                  className="rounded bg-zinc-800 border border-teal-500/50 px-2 py-0.5 text-xs text-white outline-none max-w-[160px]"
                                >
                                  <option value="">— None —</option>
                                  {vendors.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => saveSupplier(row, suppValue)}
                                  disabled={savingSup}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-teal-500/20 text-teal-300 hover:bg-teal-500/35 disabled:opacity-60"
                                >
                                  {savingSup ? "…" : "✓"}
                                </button>
                                <button
                                  onClick={() => setEditingSupId(null)}
                                  className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/35"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingSupId(row.id); setSuppValue(row.supplier || ""); }}
                                className={`rounded px-2 py-0.5 text-xs transition-colors hover:bg-teal-500/10 ${row.supplier ? "text-teal-300" : "text-zinc-600 hover:text-teal-500"}`}
                                title="Click to assign supplier"
                              >
                                {row.supplier || "— Assign —"}
                              </button>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right text-zinc-600 text-xs">
                          {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {deleteConfirmId === row.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(row)}
                                disabled={deleting}
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/35 disabled:opacity-60"
                              >
                                {deleting ? "…" : "Yes"}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/35"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(row)}
                              className="rounded p-1 text-zinc-700 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-white/5 px-4 py-2 text-right text-xs text-zinc-600">
                {filtered.length} items shown {search && `(filtered from ${rows.length})`}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Create Direct Purchase Orders Modal ─────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-lg p-6 space-y-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Direct Purchase Orders</h2>
              <button
                onClick={() => { setShowCreateModal(false); setCreateResult(null); }}
                className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10"
              >✕</button>
            </div>

            {/* Order summary by supplier */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Orders will be created per supplier for items with quantity to order. Unit prices will be set to 0 — update them in Procurement before approving.
              </p>
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 text-zinc-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">Supplier</th>
                      <th className="px-3 py-2 text-center">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(orderGroups).map(([sup, group], i) => (
                      <tr key={sup} className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/[0.01]" : ""}`}>
                        <td className="px-3 py-2 text-teal-300 font-medium">{sup}</td>
                        <td className="px-3 py-2 text-center text-white">{group.totalItems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PIN input */}
            <div className="space-y-1.5">
              <label className="block text-xs text-zinc-400">Your PIN (required to create orders)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="Enter PIN"
                value={createPin}
                onChange={(e) => setCreatePin(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateOrders(); }}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-teal-500/50"
              />
            </div>

            {/* Result */}
            {createResult && (
              <div className={`rounded-lg px-3 py-2 text-sm ${createResult.ok ? "bg-teal-500/10 border border-teal-500/30 text-teal-300" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                {createResult.msg}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreateModal(false); setCreateResult(null); }}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/10 transition-all"
              >
                {createResult?.ok ? "Close" : "Cancel"}
              </button>
              {!createResult?.ok && (
                <button
                  onClick={handleCreateOrders}
                  disabled={creatingOrders || !createPin.trim()}
                  className="rounded-xl border border-teal-500/30 bg-teal-500/15 px-5 py-2 text-sm font-semibold text-teal-400 hover:bg-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {creatingOrders ? "Creating…" : `Create ${Object.keys(orderGroups).length} Order${Object.keys(orderGroups).length !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
