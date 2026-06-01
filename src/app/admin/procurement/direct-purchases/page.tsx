"use client";

import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  defaultProcurementName,
  defaultProcurementPin,
  procurementJson,
  procurementTokenHeaders,
} from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import {
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
  Star,
  ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type DirectPurchaseItem = {
  id: string;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name: string;
};

type DirectPurchaseRow = {
  id: string;
  request_no: string;
  parent_case_no: string;
  city: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  receipt_url: string;
  new_vendor_flag: boolean;
  data_verified_at: string | null;
  data_verified_by: string;
  created_at: string;
  items: DirectPurchaseItem[];
};

type CatalogItem = { item_name: string; unit: string; benchmark_unit_price: number; category: string };
type VendorEntry  = { name: string; isRegistered: boolean };

const UNITS = ["kg", "g", "L", "mL", "pc", "box", "bag", "bottle", "pack", "tray", "can"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED")   return <span className={BADGE_SUCCESS}>{s}</span>;
  if (s === "REJECTED")   return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "IN_REVIEW")  return <span className={BADGE_WARNING}>IN REVIEW</span>;
  if (s === "SUBMITTED")  return <span className={BADGE_INFO}>SUBMITTED</span>;
  return <span className={BADGE_INFO}>{s || "DRAFT"}</span>;
}

// ─── Inline Edit State ───────────────────────────────────────────────────────

type EditState = {
  vendor_name: string;
  items: { item_name: string; category: string; qty: string; unit: string; unit_price: string }[];
};

function buildEditState(row: DirectPurchaseRow): EditState {
  return {
    vendor_name: row.items[0]?.vendor_name || "",
    items: row.items.map((i) => ({
      item_name:  i.item_name,
      category:   i.category || "General",
      qty:        String(i.qty),
      unit:       i.unit,
      unit_price: String(i.unit_price),
    })),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DirectPurchasesAdminPage() {
  const auth = getAuth();

  // ── Session ──
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin]                 = useState(defaultProcurementPin());
  const [allowed, setAllowed]         = useState(false);

  // ── Filter ──
  const [cityFilter,   setCityFilter]   = useState("manila");
  const [statusFilter, setStatusFilter] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");   // "" | "false" | "true"

  // ── Data ──
  const [rows, setRows]       = useState<DirectPurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // ── Expand/edit ──
  const [expandedId, setExpandedId] = useState("");
  const [editingId,  setEditingId]  = useState("");
  const [editState,  setEditState]  = useState<EditState | null>(null);
  const [editBusy,   setEditBusy]   = useState(false);
  const [editError,  setEditError]  = useState("");

  // ── Verify ──
  const [verifyBusy, setVerifyBusy] = useState("");

  // ── Catalog ──
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [vendors, setVendors]   = useState<VendorEntry[]>([]);
  const [activeSuggestField, setActiveSuggestField] = useState<string>("");  // "vendor" | "item-{idx}"

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const refreshed     = await refreshAuthFromApi(auth);
      const resolvedAuth  = refreshed || auth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) {
        await load("manila", "", "");
        void loadCatalog();
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load list ───────────────────────────────────────────────────────────
  const load = useCallback(async (city: string, status: string, dv: string) => {
    setError(""); setLoading(true);
    try {
      const qs = new URLSearchParams({
        city, status,
        ...(dv ? { data_verified: dv } : {}),
        limit: "200",
      }).toString();
      const data = await procurementJson<{ rows: DirectPurchaseRow[] }>(
        `/api/admin/procurement/direct-purchases?${qs}`,
        { method: "GET" },
        requestedBy, pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [requestedBy, pin]);

  // ─── Load catalog for edit typeahead ─────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ approver_name: requestedBy, pin, city: cityFilter }).toString();
      const [vRes, iRes] = await Promise.all([
        fetch(`/api/admin/procurement/direct-purchase/vendors?${qs}`,      { headers, cache: "no-store" }),
        fetch(`/api/admin/procurement/direct-purchase/item-catalog?${qs}`, { headers, cache: "no-store" }),
      ]);
      if (vRes.ok) {
        const vj = await vRes.json();
        const reg: VendorEntry[] = (vj?.vendors as string[] || []).map((n: string) => ({ name: n, isRegistered: true }));
        const unreg: VendorEntry[] = (vj?.unregistered as string[] || []).map((n: string) => ({ name: n, isRegistered: false }));
        setVendors([...reg, ...unreg]);
      }
      if (iRes.ok) {
        const ij = await iRes.json();
        setCatalog(Array.isArray(ij?.items) ? ij.items : []);
      }
    } catch { /* optional */ }
  }, [requestedBy, pin, cityFilter]);

  const handleFilterChange = (city: string, status: string, dv: string) => {
    setCityFilter(city); setStatusFilter(status); setVerifiedFilter(dv);
    void load(city, status, dv);
  };

  // ─── Edit handlers ────────────────────────────────────────────────────────
  const startEdit = (row: DirectPurchaseRow) => {
    setEditingId(row.id);
    setEditState(buildEditState(row));
    setExpandedId(row.id);
    setEditError("");
  };

  const cancelEdit = () => { setEditingId(""); setEditState(null); setEditError(""); };

  const updateEditItem = (idx: number, field: string, value: string) =>
    setEditState((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });

  const addEditItem = () =>
    setEditState((prev) => prev
      ? { ...prev, items: [...prev.items, { item_name: "", category: "General", qty: "", unit: "kg", unit_price: "" }] }
      : prev,
    );

  const removeEditItem = (idx: number) =>
    setEditState((prev) => prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev);

  const selectCatalogForEdit = (idx: number, cat: CatalogItem) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        item_name:  cat.item_name,
        unit:       cat.unit,
        unit_price: cat.benchmark_unit_price > 0 ? String(cat.benchmark_unit_price) : items[idx].unit_price,
        category:   cat.category || items[idx].category,
      };
      return { ...prev, items };
    });
    setActiveSuggestField("");
  };

  const saveEdit = async (requestId: string) => {
    if (!editState) return;
    if (!editState.vendor_name.trim()) { setEditError("Vendor name is required."); return; }
    const validItems = editState.items.filter((i) => i.item_name.trim() && parseFloat(i.qty) > 0);
    if (!validItems.length) { setEditError("At least one item with name and quantity is required."); return; }
    setEditBusy(true); setEditError("");
    try {
      const itemsPayload = validItems.map((it) => ({
        item_name:  it.item_name.trim(),
        category:   it.category.trim() || "General",
        qty:        parseFloat(it.qty) || 0,
        unit:       it.unit || "pc",
        unit_price: parseFloat(it.unit_price) || 0,
      }));
      await procurementJson(
        `/api/admin/procurement/direct-purchases/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin, vendor_name: editState.vendor_name, items: itemsPayload }),
        },
        requestedBy, pin,
      );
      cancelEdit();
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  };

  // ─── Verify handler ───────────────────────────────────────────────────────
  const handleVerify = async (requestId: string) => {
    setVerifyBusy(requestId);
    try {
      await procurementJson(
        `/api/admin/procurement/direct-purchases/${requestId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin }),
        },
        requestedBy, pin,
      );
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifyBusy("");
    }
  };

  // ─── Guard ───────────────────────────────────────────────────────────────
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Direct Purchases admin is only available to authorized procurement roles.
      </div>
    );
  }

  const editTotal = editState
    ? editState.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0), 0)
    : 0;

  const pendingCount = rows.filter((r) => !r.data_verified_at).length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className={T_PAGE_TITLE}>Direct Purchase Review</h2>
          <p className="mt-1 text-sm text-zinc-400">Review and correct vendor/item data submitted by procurement staff.</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className={`${BADGE_WARNING}`}>{pendingCount} pending review</span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
            <ShoppingBag className="h-3 w-3" />{rows.length} total
          </span>
        </div>
      </div>

      {/* Session + Filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <select value={cityFilter} onChange={(e) => handleFilterChange(e.target.value, statusFilter, verifiedFilter)} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
            <select value={statusFilter} onChange={(e) => handleFilterChange(cityFilter, e.target.value, verifiedFilter)} className={SELECT_CLASS}>
              <option value="">All</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Verification</label>
            <select value={verifiedFilter} onChange={(e) => handleFilterChange(cityFilter, statusFilter, e.target.value)} className={SELECT_CLASS}>
              <option value="">All</option>
              <option value="false">Pending review</option>
              <option value="true">Verified</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => void load(cityFilter, statusFilter, verifiedFilter)} disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <ShoppingBag className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No direct purchases found.</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const isEditing  = editingId  === row.id;
          const createdDt  = row.created_at
            ? new Date(row.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—";

          return (
            <div key={row.id} className={`rounded-2xl border transition-all ${row.data_verified_at ? "border-white/8 bg-white/4" : "border-amber-500/20 bg-amber-500/5"}`}>

              {/* Row header */}
              <button type="button" className="w-full px-4 py-4 text-left"
                onClick={() => setExpandedId(isExpanded ? "" : row.id)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{row.request_no || row.parent_case_no}</span>
                      {statusBadge(row.status)}
                      {row.data_verified_at
                        ? <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" /> Verified</span>
                        : <span className={BADGE_WARNING}>Needs Review</span>
                      }
                      {row.new_vendor_flag && <span className={BADGE_WARNING}>New Vendor</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>By <span className="text-zinc-300">{row.requested_by}</span></span>
                      <span>Date <span className="text-zinc-300">{row.request_date || createdDt}</span></span>
                      <span>Vendor <span className="text-zinc-200 font-medium">{row.items[0]?.vendor_name || "—"}</span></span>
                      <span>Total <span className="font-semibold text-amber-300">PHP {Number(row.total_amount || 0).toFixed(2)}</span></span>
                    </div>
                    {row.data_verified_at && (
                      <p className="text-[10px] text-emerald-500">
                        Verified by {row.data_verified_by} · {new Date(row.data_verified_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!row.data_verified_at && !isEditing && (
                      <button type="button" onClick={() => startEdit(row)}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {!row.data_verified_at && !isEditing && (
                      <button type="button"
                        onClick={() => void handleVerify(row.id)}
                        disabled={verifyBusy === row.id}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`}>
                        {verifyBusy === row.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Mark Verified
                      </button>
                    )}
                    <span className="text-xs text-zinc-500">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>
              </button>

              {/* Expanded: view mode */}
              {isExpanded && !isEditing && (
                <div className="border-t border-white/8 px-4 pb-4 space-y-3">
                  {/* Receipt photo */}
                  {row.receipt_url && (
                    <div className="mt-3">
                      <a href={row.receipt_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 transition">
                        <ExternalLink className="h-3.5 w-3.5" /> View Receipt Photo
                      </a>
                    </div>
                  )}
                  {/* Items table */}
                  <div className="mt-2 overflow-x-auto rounded-xl border border-white/8">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#0c1024]/70 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Vendor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.items.map((item, idx) => (
                          <tr key={idx} className="border-t border-white/8">
                            <td className="px-3 py-2 font-medium text-zinc-100">{item.item_name}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.category || "—"}</td>
                            <td className="px-3 py-2 text-right text-white">{item.qty}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.unit}</td>
                            <td className="px-3 py-2 text-right text-zinc-300">{Number(item.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-300">{Number(item.line_total).toFixed(2)}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.vendor_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expanded: EDIT mode */}
              {isExpanded && isEditing && editState && (
                <div className="border-t border-white/8 px-4 pb-5 space-y-4">
                  <p className="mt-3 text-sm font-semibold text-amber-300">Editing — correct vendor and item data</p>

                  {editError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />{editError}
                    </div>
                  )}

                  {/* Vendor edit */}
                  <div className="relative">
                    <label className={`${T_LABEL} mb-1.5 block`}>Vendor Name</label>
                    <input
                      value={editState.vendor_name}
                      onChange={(e) => { setEditState((p) => p ? { ...p, vendor_name: e.target.value } : p); setActiveSuggestField("vendor"); }}
                      onFocus={() => setActiveSuggestField("vendor")}
                      onBlur={() => setTimeout(() => setActiveSuggestField(""), 160)}
                      placeholder="Correct vendor name…"
                      className={INPUT_CLASS}
                    />
                    {activeSuggestField === "vendor" && vendors.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {vendors
                          .filter((v) => !editState.vendor_name || v.name.toLowerCase().includes(editState.vendor_name.toLowerCase()))
                          .slice(0, 10)
                          .map((v) => (
                            <button key={v.name} type="button"
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); setEditState((p) => p ? { ...p, vendor_name: v.name } : p); setActiveSuggestField(""); }}>
                              {v.isRegistered && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                              <span>{v.name}</span>
                              {v.isRegistered && <span className="ml-auto text-[10px] text-zinc-500">Registered</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Items edit */}
                  <div className="space-y-3">
                    <label className={`${T_LABEL} block`}>Items</label>
                    {editState.items.map((item, idx) => {
                      const itemSuggestions = item.item_name.length > 0
                        ? catalog.filter((c) => c.item_name.toLowerCase().includes(item.item_name.toLowerCase())).slice(0, 6)
                        : [];
                      const suggestKey = `item-${idx}`;
                      return (
                        <div key={idx} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-zinc-500">Item {idx + 1}</span>
                            {editState.items.length > 1 && (
                              <button type="button" onClick={() => removeEditItem(idx)}
                                className="text-zinc-600 hover:text-red-400 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Item name + catalog suggest */}
                          <div className="relative">
                            <input
                              value={item.item_name}
                              onChange={(e) => { updateEditItem(idx, "item_name", e.target.value); setActiveSuggestField(suggestKey); }}
                              onFocus={() => setActiveSuggestField(suggestKey)}
                              onBlur={() => setTimeout(() => setActiveSuggestField(""), 160)}
                              placeholder="Item name"
                              className={INPUT_CLASS}
                            />
                            {activeSuggestField === suggestKey && itemSuggestions.length > 0 && (
                              <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                                {itemSuggestions.map((s) => (
                                  <button key={s.item_name} type="button"
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                                    onMouseDown={(e) => { e.preventDefault(); selectCatalogForEdit(idx, s); }}>
                                    <Star className="h-3 w-3 text-amber-400 shrink-0" />
                                    <span className="flex-1">{s.item_name}</span>
                                    <span className="text-[10px] text-zinc-500">{s.unit}{s.benchmark_unit_price > 0 && ` · ₱${s.benchmark_unit_price}`}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <input type="number" value={item.qty}
                              onChange={(e) => updateEditItem(idx, "qty", e.target.value)}
                              placeholder="Qty" min="0" step="0.1" className={INPUT_CLASS} />
                            <select value={item.unit} onChange={(e) => updateEditItem(idx, "unit", e.target.value)} className={SELECT_CLASS}>
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input type="number" value={item.unit_price}
                              onChange={(e) => updateEditItem(idx, "unit_price", e.target.value)}
                              placeholder="Unit price" min="0" step="1" className={INPUT_CLASS} />
                          </div>
                        </div>
                      );
                    })}

                    <button type="button" onClick={addEditItem}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                      + Add item
                    </button>

                    {/* Running total */}
                    <div className="flex justify-end text-sm">
                      <span className="text-zinc-400 mr-3">New total:</span>
                      <span className="font-semibold text-amber-300">PHP {editTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => void saveEdit(row.id)} disabled={editBusy}
                      className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}>
                      {editBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editBusy ? "Saving…" : "Save Changes"}
                    </button>
                    <button type="button" onClick={cancelEdit} disabled={editBusy} className={SECONDARY_BUTTON}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
