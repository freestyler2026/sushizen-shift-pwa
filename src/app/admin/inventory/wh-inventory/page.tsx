"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import type { City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MasterItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
};

type StockViewRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
  theoretical_qty: number;
  last_count_qty: number;
  last_count_date: string | null;
  adj_qty_total: number;
};

type PendingRequestItem = {
  id: string;
  request_id: string;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
};

type PendingRequest = {
  id: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  needed_by_date: string;
  status: string;
  currency: string;
  total_amount: number;
  items: PendingRequestItem[];
};

type HistoryRow = {
  count_date: string;
  created_by: string;
  item_count: number;
  shortage_count: number;
  surplus_count: number;
  total_abs_gap: number;
};

type Tab = "stock" | "orders" | "count" | "history";

type CountDraft = Record<string, string>; // key: item_id -> qty string

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt3(v: number | null | undefined): string {
  return Number(v ?? 0).toFixed(3);
}

function stockColor(theoretical: number): string {
  if (theoretical <= 0) return "text-rose-400";
  if (theoretical < 1) return "text-amber-300";
  return "text-emerald-300";
}

function stockBadge(theoretical: number): { label: string; cls: string } {
  if (theoretical <= 0) return { label: "OUT", cls: "bg-rose-900/40 text-rose-300 border-rose-800/50" };
  if (theoretical < 1) return { label: "LOW", cls: "bg-amber-900/40 text-amber-300 border-amber-800/50" };
  return { label: "OK", cls: "bg-emerald-900/40 text-emerald-300 border-emerald-800/50" };
}

function gapColorClass(gap: number, hasVal: boolean): string {
  if (!hasVal) return "text-neutral-500";
  if (gap < 0) return "text-rose-400";
  if (gap > 0) return "text-emerald-400";
  return "text-neutral-500";
}

function gapLabel(gap: number, hasVal: boolean): string {
  if (!hasVal) return "—";
  if (gap > 0) return `+${fmt3(gap)}`;
  if (gap < 0) return `${fmt3(gap)}`;
  return "0.000";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function printWhDeliveryNote(req: PendingRequest, city: string) {
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const whName = `${cityLabel} Warehouse`;
  const now = new Date();
  const printDate = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const deliveryNo = `WH-DN-${req.request_no}`;

  const rows = req.items
    .map(
      (item, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="num">${i + 1}</td>
        <td class="name">${item.item_name}</td>
        <td class="qty">${Number(item.qty || 0).toFixed(3)}</td>
        <td class="unit">${item.unit}</td>
        <td class="note"></td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WH Delivery Note — ${req.request_no}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #111; font-size: 13px; padding: 36px 40px; }
  .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .brand { font-size: 26px; font-weight: 900; letter-spacing: 3px; color: #0f172a; }
  .doc-block { text-align: right; }
  .doc-type { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px; text-transform: uppercase; }
  .doc-no { font-size: 12px; color: #64748b; margin-top: 3px; font-family: monospace; }
  .bar { height: 4px; background: linear-gradient(90deg, #0f172a, #7c3aed, #0e7490); border-radius: 2px; margin-bottom: 24px; }
  .address-grid { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 0; margin-bottom: 24px; }
  .address-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
  .address-box.to-box { background: #f0fdf4; border-color: #bbf7d0; }
  .address-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .address-name { font-size: 17px; font-weight: 800; color: #0f172a; }
  .address-sub { font-size: 11px; color: #64748b; margin-top: 3px; }
  .arrow-cell { display: flex; align-items: center; justify-content: center; font-size: 22px; color: #94a3b8; }
  .meta-row { display: flex; gap: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .meta-item { flex: 1; padding: 10px 14px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  thead tr { background: #0f172a; color: #fff; }
  th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  th.right { text-align: right; }
  tbody tr.even { background: #f8fafc; }
  td { padding: 11px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  td.num { width: 36px; color: #94a3b8; font-size: 11px; }
  td.name { font-size: 14px; font-weight: 500; }
  td.qty { width: 100px; text-align: right; font-size: 15px; font-weight: 700; }
  td.unit { width: 60px; color: #64748b; }
  td.note { width: 140px; border-bottom: 1px solid #cbd5e1; }
  .total-row { display: flex; justify-content: flex-end; margin-bottom: 28px; }
  .total-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; background: #f1f5f9; text-align: right; }
  .total-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .total-value { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
  .sign-block { }
  .sign-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 32px; }
  .sign-line { border-bottom: 1.5px solid #cbd5e1; margin-bottom: 6px; }
  .sign-sub { font-size: 10px; color: #94a3b8; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  @media print {
    @page { margin: 0; size: A4; }
    body { padding: 24px 28px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="top-bar">
    <div class="brand">SUSHI ZEN</div>
    <div class="doc-block">
      <div class="doc-type">Warehouse Delivery Note</div>
      <div class="doc-no">${deliveryNo}</div>
    </div>
  </div>
  <div class="bar"></div>
  <div class="address-grid">
    <div class="address-box">
      <div class="address-label">From (Warehouse)</div>
      <div class="address-name">${whName}</div>
      <div class="address-sub">${cityLabel} · Dubai Warehouse</div>
    </div>
    <div class="arrow-cell">→</div>
    <div class="address-box to-box">
      <div class="address-label">To (Branch)</div>
      <div class="address-name">${req.store_code}</div>
      <div class="address-sub">Requested by: ${req.requested_by}</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Delivery Date</div>
      <div class="meta-value">${printDate}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Request No.</div>
      <div class="meta-value">${req.request_no}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Order Date</div>
      <div class="meta-value">${String(req.request_date || "").slice(0, 10)}</div>
    </div>
    ${req.needed_by_date ? `<div class="meta-item" style="background:#fff7ed;border-color:#fed7aa;">
      <div class="meta-label" style="color:#c2410c;">&#9888; Needed By</div>
      <div class="meta-value" style="color:#c2410c;">${String(req.needed_by_date).slice(0, 10)}</div>
    </div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item Description</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th>Note / Condition</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total-row">
    <div class="total-box">
      <div class="total-label">Total Items</div>
      <div class="total-value">${req.items.length} line${req.items.length !== 1 ? "s" : ""}</div>
    </div>
  </div>
  <div class="signoff">
    <div class="sign-block">
      <div class="sign-label">Prepared by (WH)</div>
      <div class="sign-line"></div>
      <div class="sign-sub">Name &amp; Signature</div>
    </div>
    <div class="sign-block">
      <div class="sign-label">Received by (Store)</div>
      <div class="sign-line"></div>
      <div class="sign-sub">Name &amp; Signature</div>
    </div>
  </div>
  <div class="footer">
    <div>Printed: ${printDate} &middot; Sushi ZEN Workforce OS</div>
    <div>${deliveryNo}</div>
  </div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WhInventoryPage() {
  const auth = useMemo(() => getAuth(), []);

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [city, setCity] = useState<City>("dubai");

  const [tab, setTab] = useState<Tab>("stock");

  // Tab: WH Stock
  const [stockRows, setStockRows] = useState<StockViewRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [stockQ, setStockQ] = useState("");
  const [stockCatFilter, setStockCatFilter] = useState("");

  // Add Item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addUnit, setAddUnit] = useState("pc");
  const [addCost, setAddCost] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Tab: Order From Branch
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState("");
  // Checklist state: active order being confirmed
  const [activeOrder, setActiveOrder] = useState<PendingRequest | null>(null);
  const [checklistDone, setChecklistDone] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [completedOrderForPrint, setCompletedOrderForPrint] = useState<PendingRequest | null>(null);

  // Tab: New Count
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState("");
  const [stockViewForCount, setStockViewForCount] = useState<StockViewRow[]>([]);
  const [stockViewLoading, setStockViewLoading] = useState(false);
  const [countQ, setCountQ] = useState("");
  const [countDate, setCountDate] = useState(todayIso());
  const [countDraft, setCountDraft] = useState<CountDraft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Tab: History
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const theoreticalLookup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sv of stockViewForCount) {
      map[sv.id] = sv.theoretical_qty;
    }
    return map;
  }, [stockViewForCount]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = ((resolved?.city || auth?.city || "dubai") as City);
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------

  const loadStock = useCallback(async (c: City) => {
    setStockLoading(true);
    setStockError("");
    try {
      const res = await inventoryGet<{ rows: StockViewRow[] }>(
        `/api/admin/inventory/wh-stock?city=${encodeURIComponent(c)}`,
      );
      setStockRows(res.rows || []);
    } catch (e: unknown) {
      setStockError(e instanceof Error ? e.message : String(e));
    } finally {
      setStockLoading(false);
    }
  }, []);

  const loadPending = useCallback(async (c: City) => {
    setPendingLoading(true);
    setPendingError("");
    try {
      const res = await inventoryGet<{ rows: PendingRequest[] }>(
        `/api/admin/inventory/wh-stock/pending?city=${encodeURIComponent(c)}`,
      );
      setPendingRequests(res.rows || []);
    } catch (e: unknown) {
      setPendingError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadMaster = useCallback(async (c: City) => {
    setMasterLoading(true);
    setMasterError("");
    try {
      const res = await inventoryGet<{ rows: MasterItem[] }>(
        `/api/admin/inventory/wh-stock/master?city=${encodeURIComponent(c)}`,
      );
      setMasterItems(res.rows || []);
    } catch (e: unknown) {
      setMasterError(e instanceof Error ? e.message : String(e));
    } finally {
      setMasterLoading(false);
    }
  }, []);

  const loadStockViewForCount = useCallback(async (c: City) => {
    setStockViewLoading(true);
    try {
      const res = await inventoryGet<{ rows: StockViewRow[] }>(
        `/api/admin/inventory/wh-stock?city=${encodeURIComponent(c)}`,
      );
      setStockViewForCount(res.rows || []);
    } catch {
      // non-fatal
    } finally {
      setStockViewLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (c: City) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await inventoryGet<{ rows: HistoryRow[] }>(
        `/api/admin/inventory/wh-stock/history?city=${encodeURIComponent(c)}`,
      );
      setHistoryRows(res.rows || []);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load on ready
  useEffect(() => {
    if (!ready || !allowed) return;
    void loadStock(city);
  }, [ready, allowed, city, loadStock]);

  // Load per tab switch
  useEffect(() => {
    if (!ready || !allowed) return;
    if (tab === "orders" && pendingRequests.length === 0) void loadPending(city);
    if (tab === "count" && masterItems.length === 0) {
      void loadMaster(city);
      void loadStockViewForCount(city);
    }
    if (tab === "history" && historyRows.length === 0) void loadHistory(city);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allowed, tab]);

  // Reload on city change
  useEffect(() => {
    if (!ready || !allowed) return;
    if (tab === "stock") void loadStock(city);
    if (tab === "orders") { setPendingRequests([]); void loadPending(city); }
    if (tab === "count") {
      setMasterItems([]);
      setCountDraft({});
      setStockViewForCount([]);
      void loadMaster(city);
      void loadStockViewForCount(city);
    }
    if (tab === "history") { setHistoryRows([]); void loadHistory(city); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // ---------------------------------------------------------------------------
  // Derived filtered data
  // ---------------------------------------------------------------------------

  const filteredStock = useMemo(() => {
    let rows = stockRows;
    if (stockCatFilter) {
      rows = rows.filter((r) => r.category === stockCatFilter);
    }
    if (stockQ.trim()) {
      const lq = stockQ.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(lq) || r.category.toLowerCase().includes(lq),
      );
    }
    return rows;
  }, [stockRows, stockQ, stockCatFilter]);

  const stockCategories = useMemo(
    () => Array.from(new Set(stockRows.map((r) => r.category))).sort(),
    [stockRows],
  );

  const filteredMaster = useMemo(() => {
    if (!countQ.trim()) return masterItems;
    const lq = countQ.trim().toLowerCase();
    return masterItems.filter(
      (r) => r.name.toLowerCase().includes(lq) || r.category.toLowerCase().includes(lq),
    );
  }, [masterItems, countQ]);

  // ---------------------------------------------------------------------------
  // Checklist / Delivery actions
  // ---------------------------------------------------------------------------

  function startChecklist(req: PendingRequest) {
    setActiveOrder(req);
    setChecklistDone({});
    setConfirmError("");
    setCompletedOrderForPrint(null);
  }

  function toggleChecklistItem(itemId: string) {
    setChecklistDone((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function completeDelivery() {
    if (!activeOrder) return;
    setConfirming(true);
    setConfirmError("");
    try {
      await inventoryPost<{ ok: boolean }>("/api/admin/inventory/wh-stock/deliver", {
        city,
        request_id: activeOrder.id,
        adj_date: todayIso(),
        destination_branch: activeOrder.store_code,
        items: activeOrder.items.map((item) => ({
          item_id: "",
          item_name: item.item_name,
          unit: item.unit,
          qty: Number(item.qty || 0),
        })),
      });
      setCompletedOrderForPrint(activeOrder);
      setPendingRequests((prev) => prev.filter((r) => r.id !== activeOrder.id));
      setActiveOrder(null);
      setChecklistDone({});
    } catch (e: unknown) {
      setConfirmError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save count
  // ---------------------------------------------------------------------------

  async function handleSaveCount() {
    setSaveError("");
    setSaveSuccess("");
    const items = masterItems
      .map((item) => {
        const raw = countDraft[item.id] ?? "0";
        const count_qty = parseFloat(raw) || 0;
        return {
          item_id: item.id,
          item_name: item.name,
          category: item.category,
          unit: item.unit,
          count_qty,
        };
      })
      .filter((it) => it.item_id.length > 0);

    if (items.length === 0) {
      setSaveError("No items to save.");
      return;
    }
    if (!countDate) {
      setSaveError("Please select a count date.");
      return;
    }

    setSaving(true);
    try {
      const res = await inventoryPost<{ ok: boolean; count: number }>(
        "/api/admin/inventory/wh-stock/count",
        {
          city,
          count_date: countDate,
          created_by: staffName,
          items,
        },
      );
      setSaveSuccess(`Saved ${res.count} items. Switching to WH Stock...`);
      setCountDraft({});
      setTimeout(() => {
        setSaveSuccess("");
        setTab("stock");
        void loadStock(city);
      }, 1800);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Add Item
  // ---------------------------------------------------------------------------

  function openAddModal() {
    setAddName("");
    setAddCategory(stockCatFilter || "");
    setAddUnit("pc");
    setAddCost("");
    setAddError("");
    setShowAddModal(true);
  }

  async function handleAddItem() {
    if (!addName.trim()) { setAddError("Item name is required."); return; }
    setAddSaving(true);
    setAddError("");
    try {
      await inventoryPost("/api/admin/inventory/items", {
        city,
        name: addName.trim(),
        category_name: addCategory.trim(),
        storage_unit: addUnit.trim(),
        cost: parseFloat(addCost) || 0,
        item_type: "ITEM",
      });
      setShowAddModal(false);
      await loadStock(city);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Guard
  // ---------------------------------------------------------------------------

  if (!ready) return <div className="py-8 text-center text-sm text-neutral-500">Loading...</div>;
  if (!allowed) return <div className="py-8 text-center text-sm text-rose-400">You do not have permission to access inventory.</div>;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <InventoryTabs />

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">WH Inventory</h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            Warehouse stocktaking, branch order fulfilment, and stock tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value as City)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/30 p-1">
        {(
          [
            { id: "stock", label: "WH Stock" },
            { id: "orders", label: "Order From Branch" },
            { id: "count", label: "New Count" },
            { id: "history", label: "History" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-violet-700 text-white shadow"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab: WH Stock                                                       */}
      {/* ------------------------------------------------------------------ */}
      {tab === "stock" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={stockQ}
              onChange={(e) => setStockQ(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
            />
            <button
              type="button"
              disabled={stockLoading}
              onClick={() => loadStock(city)}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
            >
              {stockLoading ? "Loading..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-600 transition"
            >
              + Add Item
            </button>
          </div>

          {stockError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {stockError}
            </div>
          )}

          {/* Category chips */}
          {stockCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStockCatFilter("")}
                className={[
                  "rounded-full border px-3 py-1 text-xs transition",
                  !stockCatFilter
                    ? "border-violet-600/50 bg-violet-900/20 text-violet-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200",
                ].join(" ")}
              >
                All
              </button>
              {stockCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setStockCatFilter(stockCatFilter === cat ? "" : cat)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    stockCatFilter === cat
                      ? "border-violet-600/50 bg-violet-900/20 text-violet-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200",
                  ].join(" ")}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Item Name</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">Last Count</th>
                  <th className="px-4 py-2.5 text-right">Adjustments</th>
                  <th className="px-4 py-2.5 text-right">Theoretical</th>
                  <th className="px-4 py-2.5">Last Count Date</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((row) => {
                  const badge = stockBadge(row.theoretical_qty);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-neutral-800 text-neutral-200 transition hover:bg-neutral-900/30"
                    >
                      <td className="px-4 py-2.5 font-medium">{row.name}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-400">{row.category || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-400">{row.unit || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-neutral-300">
                        {fmt3(row.last_count_qty)}
                        <span className="ml-1 text-neutral-600">{row.unit}</span>
                      </td>
                      <td className={[
                        "px-4 py-2.5 text-right font-mono text-xs",
                        row.adj_qty_total < 0 ? "text-rose-300" : row.adj_qty_total > 0 ? "text-emerald-300" : "text-neutral-600",
                      ].join(" ")}>
                        {row.adj_qty_total >= 0 ? "+" : ""}{fmt3(row.adj_qty_total)}
                      </td>
                      <td className={["px-4 py-2.5 text-right font-mono text-sm font-semibold", stockColor(row.theoretical_qty)].join(" ")}>
                        {fmt3(row.theoretical_qty)}
                        <span className="ml-1 text-xs font-normal text-neutral-500">{row.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">
                        {row.last_count_date ? String(row.last_count_date).slice(0, 10) : "Never"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={["rounded-full border px-2.5 py-0.5 text-xs font-medium", badge.cls].join(" ")}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!stockLoading && filteredStock.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                      {stockRows.length === 0
                        ? "No items found. Make sure inv_items has active ITEM-type entries for this city."
                        : "No items match the search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-right text-xs text-neutral-600">{filteredStock.length} items shown</div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Order From Branch                                               */}
      {/* ------------------------------------------------------------------ */}
      {tab === "orders" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-neutral-400">
              Approved WH orders from branches waiting for warehouse fulfilment.
            </p>
            <button
              type="button"
              disabled={pendingLoading}
              onClick={() => loadPending(city)}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
            >
              {pendingLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {pendingError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {pendingError}
            </div>
          )}

          {/* Delivery note banner after completion */}
          {completedOrderForPrint && !activeOrder && (
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-950/15 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#10003;</span>
                  <div>
                    <div className="text-base font-bold text-emerald-200">Delivery Confirmed!</div>
                    <div className="mt-0.5 text-sm text-emerald-300/70">
                      {completedOrderForPrint.store_code} &middot; {completedOrderForPrint.request_no} &middot; {completedOrderForPrint.items.length} items
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => printWhDeliveryNote(completedOrderForPrint, city)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-400 hover:to-teal-400"
                  >
                    Print Delivery Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletedOrderForPrint(null)}
                    className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-400 transition hover:text-neutral-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active order checklist */}
          {activeOrder && (
            <div className="overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-amber-950/20">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 bg-amber-900/30 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-white">{activeOrder.store_code}</span>
                    <span className="rounded-full bg-blue-900/50 px-2.5 py-0.5 text-xs font-semibold text-blue-200">Packing</span>
                  </div>
                  <div className="mt-0.5 text-sm text-amber-200/70">{activeOrder.request_no} &middot; {activeOrder.requested_by}</div>
                  <div className="mt-1 text-xs text-neutral-500">Tap each item when packed. Press Complete &amp; Deliver when all done.</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-sm text-amber-200">
                    <span className="font-bold text-white">{Object.values(checklistDone).filter(Boolean).length}</span>
                    <span className="text-amber-300/70"> / {activeOrder.items.length} done</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setActiveOrder(null); setChecklistDone({}); setConfirmError(""); }}
                    className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {(() => {
                const total = activeOrder.items.length;
                const done = Object.values(checklistDone).filter(Boolean).length;
                const pct = total > 0 ? (done / total) * 100 : 0;
                return (
                  <div className="h-1.5 bg-neutral-800">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                );
              })()}

              {/* Item checklist */}
              <div className="divide-y divide-white/5">
                {activeOrder.items.map((item) => {
                  const done = !!checklistDone[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleChecklistItem(item.id)}
                      className={[
                        "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors",
                        done ? "bg-emerald-900/20" : "hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className={[
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        done
                          ? "border-emerald-400 bg-emerald-500/30 text-emerald-300"
                          : "border-neutral-600 text-transparent",
                      ].join(" ")}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-5 w-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-base font-semibold ${done ? "line-through text-neutral-500" : "text-white"}`}>
                          {item.item_name}
                        </div>
                      </div>
                      <div className={`shrink-0 text-right ${done ? "text-neutral-500" : "text-white"}`}>
                        <span className="text-xl font-bold">{Number(item.qty || 0).toFixed(0)}</span>
                        <span className="ml-1 text-sm text-neutral-400">{item.unit}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Complete button */}
              {(() => {
                const total = activeOrder.items.length;
                const done = Object.values(checklistDone).filter(Boolean).length;
                const allDone = done === total && total > 0;
                return (
                  <div className="border-t border-white/10 px-5 py-4">
                    {confirmError && (
                      <div className="mb-3 rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
                        {confirmError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void completeDelivery()}
                      disabled={!allDone || confirming}
                      className={[
                        "w-full rounded-xl py-3 text-base font-bold transition-all",
                        allDone && !confirming
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400"
                          : "cursor-not-allowed border border-neutral-700 bg-neutral-900 text-neutral-500",
                      ].join(" ")}
                    >
                      {confirming
                        ? "Confirming..."
                        : allDone
                        ? "Complete & Deliver"
                        : `Check all items (${done}/${total} done)`}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Pending order cards */}
          {!activeOrder && (
            <div className="space-y-4">
              {pendingRequests.length === 0 && !pendingLoading && (
                <div className="rounded-2xl border border-neutral-800 px-4 py-10 text-center text-neutral-500">
                  No pending WH orders. Orders must be flagged as WH orders and approved.
                </div>
              )}
              {pendingRequests.map((req) => (
                <div key={req.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/20">
                  {/* Card header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/50 px-5 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-white">{req.store_code}</span>
                        <span className="rounded-full bg-violet-900/40 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                          {req.request_no}
                        </span>
                        {req.needed_by_date && (
                          <span className="rounded-full bg-amber-900/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                            Needed by {String(req.needed_by_date).slice(0, 10)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Requested by {req.requested_by} &middot; {String(req.request_date || "").slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => printWhDeliveryNote(req, city)}
                        className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100"
                      >
                        Print Order
                      </button>
                      <button
                        type="button"
                        onClick={() => startChecklist(req)}
                        className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-violet-600 transition"
                      >
                        Confirm Delivery
                      </button>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-600">
                        <tr>
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">Category</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {req.items.map((item) => (
                          <tr key={item.id} className="border-t border-neutral-800/50 hover:bg-neutral-900/20">
                            <td className="px-4 py-2 font-medium text-neutral-200">{item.item_name}</td>
                            <td className="px-4 py-2 text-xs text-neutral-500">{item.category || "—"}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-neutral-100">
                              {Number(item.qty || 0).toFixed(3)}
                            </td>
                            <td className="px-4 py-2 text-xs text-neutral-500">{item.unit}</td>
                          </tr>
                        ))}
                        {req.items.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-center text-xs text-neutral-600">No items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: New Count                                                       */}
      {/* ------------------------------------------------------------------ */}
      {tab === "count" && (
        <section className="space-y-4">
          {/* Count header controls */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Count Date</label>
              <input
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Staff</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Your name"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Search Items</label>
              <input
                type="text"
                value={countQ}
                onChange={(e) => setCountQ(e.target.value)}
                placeholder="Filter by name or category..."
                className="w-56 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                {masterItems.length} items{stockViewLoading ? " · loading theoretical..." : ""}
                {" "}· {Object.keys(countDraft).filter((k) => parseFloat(countDraft[k] || "0") !== 0).length} entered
              </span>
              <button
                type="button"
                disabled={masterLoading}
                onClick={() => {
                  setMasterItems([]);
                  setCountDraft({});
                  setStockViewForCount([]);
                  void loadMaster(city);
                  void loadStockViewForCount(city);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 disabled:opacity-50"
              >
                Reload
              </button>
            </div>
          </div>

          {masterError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {masterError}
            </div>
          )}

          {/* Items table */}
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Item Name</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">Theoretical</th>
                  <th className="px-4 py-2.5 text-right">Count Qty</th>
                  <th className="px-4 py-2.5 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaster.map((item) => {
                  const val = countDraft[item.id] ?? "";
                  const numVal = parseFloat(val || "0");
                  const theoretical = theoreticalLookup[item.id] ?? 0;
                  const gap = numVal - theoretical;
                  const hasVal = val !== "";
                  return (
                    <tr
                      key={item.id}
                      className={[
                        "border-t border-neutral-800 transition",
                        numVal > 0 ? "bg-violet-950/10" : "hover:bg-neutral-900/20",
                      ].join(" ")}
                    >
                      <td className="px-4 py-2 font-medium text-neutral-100">{item.name}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{item.category || "—"}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{item.unit || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-neutral-500">
                        {stockViewLoading ? "..." : fmt3(theoretical)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={val}
                          onChange={(e) =>
                            setCountDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-right text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                        />
                      </td>
                      <td className={["px-4 py-2 text-right font-mono text-xs font-semibold", gapColorClass(gap, hasVal)].join(" ")}>
                        {gapLabel(gap, hasVal)}
                      </td>
                    </tr>
                  );
                })}
                {!masterLoading && filteredMaster.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      {masterItems.length === 0
                        ? "No WH items loaded. Click Reload to fetch items."
                        : "No items match the search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Save controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
            {saveError && (
              <div className="w-full rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="w-full rounded-xl border border-emerald-800/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
                {saveSuccess}
              </div>
            )}
            <div className="ml-auto">
              <button
                type="button"
                disabled={saving || masterItems.length === 0}
                onClick={() => void handleSaveCount()}
                className="rounded-xl bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Count"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add Item Modal                                                       */}
      {/* ------------------------------------------------------------------ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
              <div>
                <div className="text-base font-semibold text-neutral-100">Add WH Item</div>
                <div className="mt-0.5 text-xs text-neutral-500 capitalize">{city} warehouse</div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition"
              >
                Cancel
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4 p-6">
              {addError && (
                <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
                  {addError}
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400">Item Name <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Takeaway Bag (Large)"
                  autoFocus
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400">Category</label>
                <input
                  type="text"
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  placeholder="e.g. 包材"
                  list="wh-categories"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                />
                <datalist id="wh-categories">
                  {stockCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* Unit + Cost row */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-400">Unit</label>
                  <input
                    type="text"
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    placeholder="pc"
                    list="wh-units"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                  />
                  <datalist id="wh-units">
                    <option value="pc" />
                    <option value="kg" />
                    <option value="g" />
                    <option value="L" />
                    <option value="ml" />
                    <option value="set" />
                    <option value="box" />
                    <option value="bag" />
                    <option value="roll" />
                    <option value="bottle" />
                  </datalist>
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-400">Cost (optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addCost}
                    onChange={(e) => setAddCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-neutral-800 px-6 py-4">
              <button
                type="button"
                disabled={addSaving || !addName.trim()}
                onClick={() => void handleAddItem()}
                className="rounded-xl bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {addSaving ? "Adding..." : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: History                                                         */}
      {/* ------------------------------------------------------------------ */}
      {tab === "history" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-neutral-400">Past WH stocktaking sessions.</p>
            <button
              type="button"
              disabled={historyLoading}
              onClick={() => loadHistory(city)}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {historyError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {historyError}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Count Date</th>
                  <th className="px-4 py-2.5">Counted By</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Shortages</th>
                  <th className="px-4 py-2.5 text-right">Surpluses</th>
                  <th className="px-4 py-2.5 text-right">Total Abs Gap</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr
                    key={`${row.count_date}-${row.created_by}`}
                    className="border-t border-neutral-800 text-neutral-200 transition hover:bg-neutral-900/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-sm">{String(row.count_date).slice(0, 10)}</td>
                    <td className="px-4 py-2.5 text-neutral-300">{row.created_by || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{row.item_count}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-rose-300">
                      {row.shortage_count > 0 ? row.shortage_count : <span className="text-neutral-600">0</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-emerald-300">
                      {row.surplus_count > 0 ? row.surplus_count : <span className="text-neutral-600">0</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-amber-300">
                      {Number(row.total_abs_gap || 0).toFixed(3)}
                    </td>
                  </tr>
                ))}
                {!historyLoading && historyRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No count history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
