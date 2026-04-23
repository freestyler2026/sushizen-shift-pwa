"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import { getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  cost: number;
  storage_unit: string;
  status: string;
};

type IngredientOption = {
  id: string;
  name: string;
  sku: string;
  storage_unit: string;
  status: string;
};

type StaffNameDirectory = {
  names?: string[];
};

type DraftOutputItem = {
  key: string;
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  storage_unit: string;
};

type PreviewConsumptionItem = {
  item_id: string;
  item_name: string;
  sku: string;
  storage_unit: string;
  quantity: number;
  available_quantity: number;
  unit_cost: number;
  total_cost: number;
  entry_type: string;
  sort_order: number;
  source_product_item_id?: string;
  source_product_name?: string;
};

type ProductionRow = {
  id: string;
  production_no: string;
  consumption_no: string;
  branch_code: string;
  business_date: string;
  total_cost: number;
  status: string;
  creator_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
  closed_by?: string;
  linked_request_id?: string;
  purpose?: string;
  destination_branch_code?: string;
};

type CkPendingRequestItem = {
  id: string;
  item_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  vendor_name: string;
};

type CkPendingRequest = {
  id: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  needed_by_date: string;
  status: string;
  currency: string;
  total_amount: number;
  items: CkPendingRequestItem[];
};

type ProductionItem = {
  id: string;
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  entry_type: string;
};

const PRODUCTION_OUTPUT_UNITS = ["kg", "g", "pcs", "pkt", "bag", "box", "ml", "L"] as const;

function normalizeProductionOutputUnit(value: string) {
  const unit = String(value || "").trim();
  return PRODUCTION_OUTPUT_UNITS.includes(unit as (typeof PRODUCTION_OUTPUT_UNITS)[number]) ? unit : "pcs";
}

function draftOutputKey(itemId: string, unit: string) {
  return `${itemId}::${unit}`;
}

type ProductionDetail = ProductionRow & {
  items?: ProductionItem[];
};

type ProductionRecipeRow = {
  id?: string;
  product_item_id: string;
  product_item_name?: string;
  ingredient_item_id: string;
  ingredient_item_name: string;
  sku: string;
  ingredient_qty: number;
  ingredient_unit: string;
  yield_factor: number;
  waste_factor: number;
  active: boolean;
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultBranch(city: City) {
  return BRANCHES[city].find((branch) => branch.code === "CK")?.code || BRANCHES[city][0]?.code || "";
}

function number3(value: number) {
  return Number(value || 0).toFixed(3);
}

export default function InventoryProductionsPage() {
  const auth = useMemo(() => getAuth(), []);
  const recipeProductSelectRef = useRef<HTMLSelectElement | null>(null);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [creatorName, setCreatorName] = useState(auth?.staffName || "");
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedQty, setSelectedQty] = useState("1");
  const [selectedUnit, setSelectedUnit] = useState<string>("pcs");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [draftOutputs, setDraftOutputs] = useState<DraftOutputItem[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewConsumptionItem[]>([]);
  const [historyRows, setHistoryRows] = useState<ProductionRow[]>([]);
  const [selectedProductionId, setSelectedProductionId] = useState("");
  const [selectedProduction, setSelectedProduction] = useState<ProductionDetail | null>(null);
  const [recipeProductId, setRecipeProductId] = useState("");
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [recipeQty, setRecipeQty] = useState("1");
  const [recipeUnit, setRecipeUnit] = useState<string>("pcs");
  const [recipeRows, setRecipeRows] = useState<ProductionRecipeRow[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [pendingCkRequests, setPendingCkRequests] = useState<CkPendingRequest[]>([]);
  const [pendingCkLoading, setPendingCkLoading] = useState(false);
  const [linkedRequestId, setLinkedRequestId] = useState("");
  const [productionPurpose, setProductionPurpose] = useState<"STOCK" | "STORE_ORDER">("STOCK");
  const [activeTab, setActiveTab] = useState<"STOCK" | "PENDING">("STOCK");
  const [destinationBranchCode, setDestinationBranchCode] = useState("");
  // Stock quick-entry: productId → qty string
  const [stockQtys, setStockQtys] = useState<Record<string, string>>({});
  const [stockSearch, setStockSearch] = useState("");
  // Completed order ready for delivery note printing
  const [completedOrderForPrint, setCompletedOrderForPrint] = useState<CkPendingRequest | null>(null);
  // Active production checklist (Pending Orders tab)
  const [activeOrderRequest, setActiveOrderRequest] = useState<CkPendingRequest | null>(null);
  const [checklistDone, setChecklistDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setBranchCode(defaultBranch(nextCity));
      setCreatorName(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setSelectedProductionId("");
    setSelectedProduction(null);
    setDraftOutputs([]);
    setPreviewRows([]);
    setRecipeProductId("");
    setRecipeIngredientId("");
    setRecipeRows([]);
  }, [city]);

  async function loadPendingCkRequests(nextCity: City) {
    setPendingCkLoading(true);
    try {
      const res = await inventoryGet<{ rows: CkPendingRequest[] }>(
        `/api/admin/inventory/productions/ck-pending?city=${encodeURIComponent(nextCity)}`,
      );
      setPendingCkRequests(res.rows || []);
    } catch {
      // non-fatal
    } finally {
      setPendingCkLoading(false);
    }
  }

  async function loadHistory(nextCity: City, nextBranch: string, nextMonth: string) {
    const historyRes = await inventoryGet<{ rows: ProductionRow[] }>(
      `/api/admin/inventory/productions?city=${encodeURIComponent(nextCity)}&branch_code=${encodeURIComponent(nextBranch)}&month=${encodeURIComponent(nextMonth)}&limit=500`,
    );
    setHistoryRows(historyRes.rows || []);
  }

  useEffect(() => {
    if (!ready || !allowed) return;
    void loadPendingCkRequests(city);
  }, [allowed, city, ready]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadBasics() {
      setLoading(true);
      setError("");
      try {
        const [productsRes, ingredientsRes, staffRes] = await Promise.all([
          inventoryGet<{ rows: ProductOption[] }>(
            `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=PRODUCTS&limit=500`,
          ),
          inventoryGet<{ rows: IngredientOption[] }>(
            `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=500`,
          ),
          fetch(`/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=5000`, {
            cache: "no-store",
          }).then(async (res) => {
            const text = await res.text();
            if (!res.ok) throw new Error(text || "staff names failed");
            return text ? (JSON.parse(text) as StaffNameDirectory) : {};
          }),
        ]);
        if (cancelled) return;
        const nextProducts = (productsRes.rows || []).filter((item) => item.status !== "DELETED");
        setProductOptions(nextProducts);
        setIngredientOptions((ingredientsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setStaffOptions(Array.isArray(staffRes.names) ? staffRes.names : []);
        await loadHistory(city, branchCode, historyMonth);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBasics();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, historyMonth, ready]);

  useEffect(() => {
    if (!ready || !allowed || !recipeProductId) {
      setRecipeRows([]);
      return;
    }
    let cancelled = false;
    async function loadRecipe() {
      setRecipeLoading(true);
      try {
        const res = await inventoryGet<{ rows: ProductionRecipeRow[] }>(
          `/api/admin/inventory/production-recipes?city=${encodeURIComponent(city)}&product_item_id=${encodeURIComponent(recipeProductId)}&limit=200`,
        );
        if (!cancelled) setRecipeRows(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setRecipeLoading(false);
      }
    }
    void loadRecipe();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready, recipeProductId]);

  useEffect(() => {
    setRecipeIngredientId("");
  }, [recipeProductId]);

  useEffect(() => {
    if (!selectedProductionId || !allowed) {
      setSelectedProduction(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: ProductionDetail }>(
          `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedProduction(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedProductionId]);

  useEffect(() => {
    if (!ready || !allowed) return;
    if (draftOutputs.length === 0) {
      setPreviewRows([]);
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const res = await inventoryPost<{ rows: PreviewConsumptionItem[] }>(
          `/api/admin/inventory/productions/preview?branch_code=${encodeURIComponent(branchCode)}`,
          {
            city,
            items: draftOutputs.map((item, index) => ({
              item_id: item.item_id,
              item_name: item.item_name,
              sku: item.sku,
              quantity: item.quantity,
              unit: item.unit,
              unit_cost: item.unit_cost,
              total_cost: item.quantity * item.unit_cost,
              entry_type: "OUTPUT",
              sort_order: index,
            })),
          },
        );
        if (!cancelled) setPreviewRows(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, draftOutputs, ready]);

  const selectedProduct = useMemo(
    () => productOptions.find((item) => item.id === selectedProductId) || null,
    [productOptions, selectedProductId],
  );
  const selectedRecipeIngredient = useMemo(
    () => ingredientOptions.find((item) => item.id === recipeIngredientId) || null,
    [ingredientOptions, recipeIngredientId],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setSelectedUnit(normalizeProductionOutputUnit(selectedProduct.storage_unit));
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedRecipeIngredient) return;
    setRecipeUnit(normalizeProductionOutputUnit(selectedRecipeIngredient.storage_unit));
  }, [selectedRecipeIngredient]);

  // Print a single or multiple requests in a new window (professional layout)
  function printRequests(requests: CkPendingRequest | CkPendingRequest[]) {
    const list = Array.isArray(requests) ? requests : [requests];
    const printDate = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const pages = list.map((req) => {
      const rows = req.items.map((item) => `
        <tr>
          <td class="check"><span class="checkbox"></span></td>
          <td class="item-name">${item.item_name}</td>
          <td class="qty">${Number(item.qty || 0).toFixed(3)}</td>
          <td class="unit">${item.unit}</td>
          <td class="done"></td>
        </tr>`).join("");

      return `
        <div class="page">
          <div class="header">
            <div class="brand">SUSHI ZEN</div>
            <div class="header-right">
              <div class="doc-title">PRODUCTION ORDER</div>
              <div class="doc-no">${req.request_no}</div>
            </div>
          </div>
          <div class="accent-bar"></div>

          <div class="meta-grid">
            <div class="meta-item">
              <div class="meta-label">Store</div>
              <div class="meta-value store-name">${req.store_code}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Request Date</div>
              <div class="meta-value">${String(req.request_date || "").slice(0, 10)}</div>
            </div>
            ${req.needed_by_date ? `
            <div class="meta-item urgent">
              <div class="meta-label">⚠ Needed By</div>
              <div class="meta-value needed-by">${String(req.needed_by_date).slice(0, 10)}</div>
            </div>` : ""}
            <div class="meta-item">
              <div class="meta-label">Requested By</div>
              <div class="meta-value">${req.requested_by}</div>
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th class="col-check"></th>
                <th class="col-name">Item</th>
                <th class="col-qty">Qty</th>
                <th class="col-unit">Unit</th>
                <th class="col-done">Done ✓</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="footer">
            <div class="signature-block">
              <div class="sig-label">Prepared by</div>
              <div class="sig-line"></div>
            </div>
            <div class="signature-block">
              <div class="sig-label">Checked by</div>
              <div class="sig-line"></div>
            </div>
            <div class="footer-meta">
              <div>Printed: ${printDate}</div>
              <div>Sushi ZEN Workforce OS</div>
            </div>
          </div>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CK Production Order</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #111; font-size: 13px; }
  .page { padding: 32px 36px 28px; page-break-after: always; min-height: 100vh; display: flex; flex-direction: column; }
  .page:last-child { page-break-after: avoid; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: 3px; color: #0f172a; }
  .header-right { text-align: right; }
  .doc-title { font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: 1px; }
  .doc-no { font-size: 11px; color: #64748b; margin-top: 2px; }

  /* Accent bar */
  .accent-bar { height: 4px; background: linear-gradient(90deg, #0f766e, #0369a1); border-radius: 2px; margin-bottom: 20px; }

  /* Meta grid */
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .meta-item { padding: 10px 14px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
  .meta-item:last-child { border-right: none; }
  .meta-item.urgent { background: #fff7ed; }
  .meta-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; }
  .meta-value.store-name { font-size: 16px; font-weight: 800; color: #0f172a; }
  .meta-value.needed-by { color: #c2410c; font-weight: 700; }

  /* Items table */
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; flex: 1; }
  .items-table thead tr { background: #0f172a; color: #fff; }
  .items-table th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .items-table th.col-qty, .items-table th.col-done { text-align: center; }
  .items-table tbody tr:nth-child(even) { background: #f8fafc; }
  .items-table tbody tr:hover { background: #f1f5f9; }
  .items-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .col-check { width: 36px; }
  .col-name { min-width: 240px; }
  .col-qty { width: 90px; text-align: right; font-weight: 700; font-size: 14px; }
  .col-unit { width: 70px; color: #64748b; }
  .col-done { width: 80px; text-align: center; }
  .checkbox { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #94a3b8; border-radius: 3px; }
  .done { display: inline-block; width: 40px; height: 18px; border-bottom: 1.5px solid #94a3b8; }

  /* Footer */
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  .signature-block { flex: 1; margin-right: 32px; }
  .sig-label { font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 20px; }
  .sig-line { border-bottom: 1.5px solid #cbd5e1; width: 180px; }
  .footer-meta { text-align: right; font-size: 10px; color: #94a3b8; line-height: 1.6; }

  @media print {
    @page { margin: 0; size: A4; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 24px 28px 20px; }
  }
</style>
</head>
<body>
${pages}
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  const selectedQtyStep = getInventoryQuantityStep(selectedUnit);
  const recipeQtyStep = getInventoryQuantityStep(recipeUnit);

  const selectedOutputItems = useMemo(
    () => (selectedProduction?.items || []).filter((item) => item.entry_type === "OUTPUT"),
    [selectedProduction],
  );
  const selectedConsumptionItems = useMemo(
    () => (selectedProduction?.items || []).filter((item) => item.entry_type !== "OUTPUT"),
    [selectedProduction],
  );

  function startFromRequest(req: CkPendingRequest) {
    // Enter checklist mode — show all items regardless of productOptions match
    setActiveOrderRequest(req);
    setChecklistDone({});
    setLinkedRequestId(req.id);
    setProductionPurpose("STORE_ORDER");
    setDestinationBranchCode(req.store_code || "");
    setError("");
    setSuccess("");
  }

  function toggleChecklistItem(itemId: string) {
    setChecklistDone((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function completeProductionFromChecklist() {
    if (!activeOrderRequest) return;
    const completed = activeOrderRequest;
    // Pre-fill draftOutputs from matched productOptions
    const newDrafts: DraftOutputItem[] = [];
    for (const item of completed.items) {
      const match = productOptions.find(
        (p) => p.name.trim().toLowerCase() === item.item_name.trim().toLowerCase(),
      );
      if (!match) continue;
      const unit = normalizeProductionOutputUnit(item.unit || match.storage_unit);
      const key = draftOutputKey(match.id, unit);
      newDrafts.push({
        key, item_id: match.id, item_name: match.name, sku: match.sku,
        quantity: Number(Number(item.qty || 0).toFixed(3)),
        unit, unit_cost: Number(item.unit_price || match.cost || 0),
        storage_unit: match.storage_unit || "",
      });
    }
    if (newDrafts.length > 0) setDraftOutputs(newDrafts);
    setActiveOrderRequest(null);
    setChecklistDone({});
    setCompletedOrderForPrint(completed);
    setSuccess("");
  }

  function printCkDeliveryNote(req: CkPendingRequest) {
    const cityLabel = city === "dubai" ? "Dubai" : "Manila";
    const ckName = `${cityLabel} Central Kitchen`;
    const now = new Date();
    const printDate = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const deliveryNo = `DN-${req.request_no}`;

    const rows = req.items.map((item, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="num">${i + 1}</td>
        <td class="name">${item.item_name}</td>
        <td class="qty">${Number(item.qty || 0).toFixed(3)}</td>
        <td class="unit">${item.unit}</td>
        <td class="note"></td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Delivery Note — ${req.request_no}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #111; font-size: 13px; padding: 36px 40px; }

  /* Top header */
  .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .brand { font-size: 26px; font-weight: 900; letter-spacing: 3px; color: #0f172a; }
  .doc-block { text-align: right; }
  .doc-type { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px; text-transform: uppercase; }
  .doc-no { font-size: 12px; color: #64748b; margin-top: 3px; font-family: monospace; }

  /* Gradient bar */
  .bar { height: 4px; background: linear-gradient(90deg, #0f172a, #0e7490, #0f766e); border-radius: 2px; margin-bottom: 24px; }

  /* From / To grid */
  .address-grid { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 0; margin-bottom: 24px; }
  .address-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
  .address-box.to-box { background: #f0fdf4; border-color: #bbf7d0; }
  .address-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .address-name { font-size: 17px; font-weight: 800; color: #0f172a; }
  .address-sub { font-size: 11px; color: #64748b; margin-top: 3px; }
  .arrow-cell { display: flex; align-items: center; justify-content: center; font-size: 22px; color: #94a3b8; }

  /* Meta row */
  .meta-row { display: flex; gap: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .meta-item { flex: 1; padding: 10px 14px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; }

  /* Items table */
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

  /* Totals */
  .total-row { display: flex; justify-content: flex-end; margin-bottom: 28px; }
  .total-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; background: #f1f5f9; text-align: right; }
  .total-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .total-value { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; }

  /* Sign-off */
  .signoff { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 20px; }
  .sign-block { }
  .sign-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 32px; }
  .sign-line { border-bottom: 1.5px solid #cbd5e1; margin-bottom: 6px; }
  .sign-sub { font-size: 10px; color: #94a3b8; }

  /* Footer */
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
      <div class="doc-type">Delivery Note</div>
      <div class="doc-no">${deliveryNo}</div>
    </div>
  </div>
  <div class="bar"></div>

  <div class="address-grid">
    <div class="address-box">
      <div class="address-label">From (Supplier)</div>
      <div class="address-name">${ckName}</div>
      <div class="address-sub">${cityLabel} · Central Kitchen</div>
    </div>
    <div class="arrow-cell">→</div>
    <div class="address-box to-box">
      <div class="address-label">To (Destination)</div>
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
      <div class="meta-label" style="color:#c2410c;">⚠ Needed By</div>
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
      <div class="sign-label">Prepared by (CK)</div>
      <div class="sign-line"></div>
      <div class="sign-sub">Name &amp; Signature</div>
    </div>
    <div class="sign-block">
      <div class="sign-label">Checked by (CK)</div>
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
    <div>Printed: ${printDate} · Sushi ZEN Workforce OS</div>
    <div>${deliveryNo}</div>
  </div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  }

  function bulkAddFromStock() {
    const toAdd: DraftOutputItem[] = [];
    for (const [id, qtyStr] of Object.entries(stockQtys)) {
      const qty = parseFloat(qtyStr);
      if (!qty || qty <= 0) continue;
      const product = productOptions.find((p) => p.id === id);
      if (!product) continue;
      const unit = normalizeProductionOutputUnit(product.storage_unit || "pcs");
      const key = draftOutputKey(id, unit);
      toAdd.push({ key, item_id: id, item_name: product.name, sku: product.sku, quantity: qty, unit, unit_cost: product.cost, storage_unit: product.storage_unit });
    }
    if (toAdd.length === 0) { setError("Please enter a quantity for at least one item."); return; }
    setDraftOutputs((prev) => {
      const merged = [...prev];
      for (const item of toAdd) {
        const idx = merged.findIndex((x) => x.key === item.key);
        if (idx >= 0) merged[idx] = { ...merged[idx], quantity: item.quantity };
        else merged.push(item);
      }
      return merged;
    });
    setStockQtys({});
    setSuccess(`${toAdd.length} item${toAdd.length !== 1 ? "s" : ""} added to production draft.`);
  }

  function addDraftOutput() {
    if (!selectedProduct) return;
    const parsedQty = parseDraftNumber(selectedQty);
    const qty = parsedQty === null ? NaN : parsedQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Please enter a valid quantity.");
      return;
    }
    const unit = normalizeProductionOutputUnit(selectedUnit);
    const key = draftOutputKey(selectedProduct.id, unit);
    setError("");
    setDraftOutputs((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: Number((item.quantity + qty).toFixed(3)) } : item,
        );
      }
      return [
        ...prev,
        {
          key,
          item_id: selectedProduct.id,
          item_name: selectedProduct.name,
          sku: selectedProduct.sku,
          quantity: Number(qty.toFixed(3)),
          unit,
          unit_cost: Number(selectedProduct.cost || 0),
          storage_unit: selectedProduct.storage_unit || "",
        },
      ];
    });
    setSelectedProductId("");
    setSelectedQty("1");
    setSelectedUnit("pcs");
  }

  function removeDraftOutput(key: string) {
    setDraftOutputs((prev) => prev.filter((item) => item.key !== key));
  }

  function addRecipeLine() {
    if (!recipeProductId || !selectedRecipeIngredient) return;
    const parsedQty = parseDraftNumber(recipeQty);
    const qty = parsedQty === null ? NaN : parsedQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Please enter a valid ingredient quantity.");
      return;
    }
    const unit = normalizeProductionOutputUnit(recipeUnit);
    const existing = recipeRows.find((row) => row.ingredient_item_id === selectedRecipeIngredient.id);
    if (existing && existing.ingredient_unit !== unit) {
      setError("This ingredient is already added with a different unit. Remove it first to change the unit.");
      return;
    }
    setError("");
    setRecipeRows((prev) => {
      if (existing) {
        return prev.map((row) =>
          row.ingredient_item_id === selectedRecipeIngredient.id
            ? { ...row, ingredient_qty: Number((row.ingredient_qty + qty).toFixed(3)) }
            : row,
        );
      }
      return [
        ...prev,
        {
          product_item_id: recipeProductId,
          ingredient_item_id: selectedRecipeIngredient.id,
          ingredient_item_name: selectedRecipeIngredient.name,
          sku: selectedRecipeIngredient.sku,
          ingredient_qty: Number(qty.toFixed(3)),
          ingredient_unit: unit,
          yield_factor: 1,
          waste_factor: 0,
          active: true,
        },
      ];
    });
    setRecipeIngredientId("");
    setRecipeQty("1");
  }

  function removeRecipeLine(ingredientItemId: string) {
    setRecipeRows((prev) => prev.filter((row) => row.ingredient_item_id !== ingredientItemId));
  }

  function handleRecipeIngredientFocus(event: React.MouseEvent<HTMLSelectElement> | React.FocusEvent<HTMLSelectElement>) {
    if (recipeProductId) return;
    event.preventDefault();
    setError("Please select a recipe product first.");
    recipeProductSelectRef.current?.focus();
  }

  async function saveRecipe() {
    if (!recipeProductId) {
      setError("Please select a recipe product.");
      return;
    }
    setRecipeSaving(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost("/api/admin/inventory/production-recipes/upsert", {
        city,
        product_item_id: recipeProductId,
        rows: recipeRows.map((row) => ({
          ingredient_item_id: row.ingredient_item_id,
          ingredient_qty: row.ingredient_qty,
          ingredient_unit: row.ingredient_unit,
          yield_factor: row.yield_factor,
          waste_factor: row.waste_factor,
          active: row.active,
        })),
      });
      setSuccess("Production BOM saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRecipeSaving(false);
    }
  }

  async function createProduction() {
    if (!creatorName.trim()) {
      setError("Please select a responsible staff member.");
      return;
    }
    if (!branchCode) {
      setError("Please select a branch.");
      return;
    }
    if (draftOutputs.length === 0) {
      setError("Please add at least one product.");
      return;
    }
    if (previewRows.length === 0) {
      setError("Production BOM is not registered yet. Please register the product recipe first.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: ProductionRow }>("/api/admin/inventory/productions", {
        city,
        branch_code: branchCode,
        business_date: businessDate,
        creator_name: creatorName.trim(),
        notes,
        linked_request_id: linkedRequestId || undefined,
        purpose: productionPurpose,
        destination_branch_code: productionPurpose === "STORE_ORDER" ? destinationBranchCode : "",
      });
      const productionId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/productions/${encodeURIComponent(productionId)}/items`, {
        city,
        items: [
          ...draftOutputs.map((item, index) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            quantity: item.quantity,
            unit: item.unit,
            unit_cost: item.unit_cost,
            total_cost: item.quantity * item.unit_cost,
            entry_type: "OUTPUT",
            sort_order: index,
          })),
          ...previewRows.map((item, index) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            storage_unit: item.storage_unit,
            quantity: item.quantity,
            available_quantity: item.available_quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            entry_type: "INPUT",
            sort_order: draftOutputs.length + index,
          })),
        ],
      });
      await loadHistory(city, branchCode, historyMonth);
      await loadPendingCkRequests(city);
      setDraftOutputs([]);
      setPreviewRows([]);
      setNotes("");
      setLinkedRequestId("");
      setProductionPurpose("STOCK");
      setDestinationBranchCode("");
      setSuccess("Production draft created. Close it from detail when ready.");
      setSelectedProductionId(productionId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeSelectedProduction() {
    if (!selectedProductionId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}/close`, { city });
      await loadHistory(city, branchCode, historyMonth);
      await loadPendingCkRequests(city);
      const res = await inventoryGet<{ row: ProductionDetail }>(
        `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}?city=${encodeURIComponent(city)}`,
      );
      setSelectedProduction(res.row || null);
      setSuccess("Production closed. Product intake and ingredient consumption were posted to ledger.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function duplicateSelectedProduction() {
    if (!selectedProductionId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const duplicated = await inventoryPost<{ row: ProductionRow }>(
        `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}/duplicate`,
        { city },
      );
      await loadHistory(city, branchCode, historyMonth);
      setSelectedProductionId(String(duplicated?.row?.id || ""));
      setSuccess("Selected production duplicated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function printDeliveryNote(production: ProductionDetail) {
    const destLabel = production.destination_branch_code
      ? labelOf(city, production.destination_branch_code)
      : "-";
    const outputItems = (production.items || []).filter((item) => item.entry_type === "OUTPUT");
    const totalCost = outputItems.reduce((sum, item) => sum + Number(item.total_cost || 0), 0);
    const rows = outputItems
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.item_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.sku || "-"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number3(item.quantity)} ${item.unit || ""}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(item.unit_cost || 0).toFixed(2)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(item.total_cost || 0).toFixed(2)}</td>
          </tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>納品書 ${production.production_no}</title>
    <style>
      body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111;margin:0;padding:32px;}
      h1{font-size:22px;margin:0 0 4px;}
      .sub{font-size:13px;color:#666;margin-bottom:24px;}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:24px;font-size:13px;}
      .meta-label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      thead th{background:#f3f4f6;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;}
      thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:right;}
      tfoot td{padding:10px 12px;font-weight:600;}
      .total-row{border-top:2px solid #111;}
      @media print{body{padding:16px;} button{display:none;}}
    </style></head><body>
    <h1>納品書 / Delivery Note</h1>
    <div class="sub">${production.production_no}</div>
    <div class="meta">
      <div><div class="meta-label">納品日 / Date</div><div>${String(production.business_date || "").slice(0, 10)}</div></div>
      <div><div class="meta-label">納品先 / Destination</div><div>${destLabel}</div></div>
      <div><div class="meta-label">担当者 / Person</div><div>${production.creator_name || "-"}</div></div>
      <div><div class="meta-label">ステータス / Status</div><div>${production.status || "-"}</div></div>
      ${production.notes ? `<div style="grid-column:span 2"><div class="meta-label">備考 / Notes</div><div>${production.notes}</div></div>` : ""}
    </div>
    <table>
      <thead><tr>
        <th>商品名 / Product</th><th>SKU</th><th>数量 / Qty</th><th>単価 / Unit Cost</th><th>金額 / Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row">
        <td colspan="4" style="text-align:right;">合計 / Total</td>
        <td style="text-align:right;">${totalCost.toFixed(2)}</td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>window.print();</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  function Number3(v: number) { return Number(v || 0).toFixed(3); }

  if (!ready) return <div className="text-sm text-neutral-500">Loading productions...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">CK Production</div>
            <div className="mt-1 text-sm text-neutral-400">
              Register CK production products and ingredient consumption recipes.
            </div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} production workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as City)}
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <input
            list="inventory-production-staff-list"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="Select responsible staff"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <input
            type="month"
            value={historyMonth}
            onChange={(e) => setHistoryMonth(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>
        <datalist id="inventory-production-staff-list">
          {staffOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {/* Tab selector */}
        <div className="mt-4 flex gap-1 rounded-xl border border-neutral-800 bg-neutral-950/60 p-1">
          <button
            type="button"
            onClick={() => { setActiveTab("STOCK"); setProductionPurpose("STOCK"); setDestinationBranchCode(""); }}
            className={[
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
              activeTab === "STOCK"
                ? "bg-sky-700/60 text-sky-100 shadow"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            📦 Stock
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("PENDING"); setProductionPurpose("STORE_ORDER"); }}
            className={[
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
              activeTab === "PENDING"
                ? "bg-amber-700/60 text-amber-100 shadow"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            🏪 Pending Orders
            {pendingCkRequests.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-200">
                {pendingCkRequests.length}
              </span>
            )}
          </button>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <InventoryRegistrationHelp />

      {/* ── Stock Quick Entry ─────────────────────────────────────────────── */}
      {activeTab === "STOCK" && (
        <section className="no-print rounded-2xl border border-sky-900/40 bg-sky-950/10 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-sky-200">📦 Today&apos;s Production — Stock</div>
              <div className="mt-0.5 text-xs text-neutral-400">Enter quantities for each item produced, then press &quot;Add to Draft&quot;.</div>
            </div>
            <input
              type="search"
              placeholder="Search items..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 w-48"
            />
          </div>

          {productOptions.length === 0 ? (
            <div className="py-4 text-sm text-neutral-500">No production items registered.</div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-neutral-800">
                {/* Header */}
                <div className="grid grid-cols-[1fr_140px_80px] border-b border-neutral-800 bg-black/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  <div>Item</div>
                  <div className="text-right">Qty Produced</div>
                  <div className="pl-3">Unit</div>
                </div>
                {/* Product rows */}
                {productOptions
                  .filter((p) =>
                    !stockSearch.trim() ||
                    p.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
                    (p.sku || "").toLowerCase().includes(stockSearch.toLowerCase())
                  )
                  .map((product) => {
                    const qty = stockQtys[product.id] || "";
                    const hasQty = parseFloat(qty) > 0;
                    return (
                      <div
                        key={product.id}
                        className={[
                          "grid grid-cols-[1fr_140px_80px] items-center border-b border-neutral-800/60 px-4 py-2.5 last:border-0 transition-colors",
                          hasQty ? "bg-sky-900/10" : "",
                        ].join(" ")}
                      >
                        <div>
                          <div className={`text-sm font-medium ${hasQty ? "text-sky-200" : "text-neutral-300"}`}>{product.name}</div>
                          {product.sku ? <div className="text-[11px] text-neutral-500">{product.sku}</div> : null}
                        </div>
                        <div className="pr-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            inputMode="decimal"
                            placeholder="0"
                            value={qty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              setStockQtys((prev) => ({ ...prev, [product.id]: e.target.value }))
                            }
                            className="w-28 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-right text-sm text-white focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                          />
                        </div>
                        <div className="pl-2 text-sm text-neutral-400">{product.storage_unit || "pcs"}</div>
                      </div>
                    );
                  })}
              </div>

              {/* Summary + Add button */}
              {(() => {
                const nonZeroCount = Object.values(stockQtys).filter((v) => parseFloat(v) > 0).length;
                return (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-neutral-400">
                      {nonZeroCount > 0 ? (
                        <span className="font-medium text-sky-300">{nonZeroCount} item{nonZeroCount !== 1 ? "s" : ""} ready</span>
                      ) : (
                        <span className="text-neutral-500">Enter quantities above</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={bulkAddFromStock}
                      disabled={nonZeroCount === 0}
                      className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:from-sky-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add to Draft ({nonZeroCount} item{nonZeroCount !== 1 ? "s" : ""})
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </section>
      )}

      {/* Pending CK Manufacturing Requests — shown only on Pending Orders tab */}
      <section className={`no-print rounded-2xl border border-amber-900/40 bg-amber-950/10 p-5${activeTab !== "PENDING" ? " hidden" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-amber-200">Pending Manufacturing Requests</div>
            <div className="mt-0.5 text-xs text-neutral-400">
              Store orders approved for CK production. <span className="text-green-400 font-medium">Approved</span> = waiting to be made. Press <span className="text-amber-300 font-medium">Start Production</span> to begin.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {linkedRequestId ? (
              <span className="rounded-full bg-amber-900/40 px-3 py-1 text-xs text-amber-300">
                Request Linked
              </span>
            ) : null}
            {pendingCkRequests.length > 0 ? (
              <button
                type="button"
                onClick={() => printRequests(pendingCkRequests)}
                className="rounded-lg border border-violet-700 bg-violet-950/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-900/30"
              >
                Print All
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadPendingCkRequests(city)}
              disabled={pendingCkLoading}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50"
            >
              {pendingCkLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* ── Delivery Note Banner (after completion) ── */}
        {completedOrderForPrint && !activeOrderRequest ? (
          <div className="mt-4 rounded-2xl border-2 border-emerald-500/40 bg-emerald-950/15 p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  <div>
                    <div className="text-base font-bold text-emerald-200">Production Complete!</div>
                    <div className="text-sm text-emerald-300/70 mt-0.5">
                      {completedOrderForPrint.store_code} · {completedOrderForPrint.request_no} · {completedOrderForPrint.items.length} items
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => printCkDeliveryNote(completedOrderForPrint)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400 transition-all"
                >
                  🖨 Print Delivery Note
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedOrderForPrint(null)}
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Active Production Checklist ── */}
        {activeOrderRequest ? (
          <div className="mt-4 rounded-2xl border-2 border-amber-500/40 bg-amber-950/20 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-amber-900/30 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-white">{activeOrderRequest.store_code}</span>
                  <span className="rounded-full bg-blue-900/50 px-2.5 py-0.5 text-xs font-semibold text-blue-200">⚙ Now Making</span>
                </div>
                <div className="mt-0.5 text-sm text-amber-200/70">{activeOrderRequest.request_no} · {activeOrderRequest.requested_by}</div>
                <div className="mt-1 text-xs text-neutral-500">Tap each item when it&apos;s ready. Press Complete when all done.</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-sm text-amber-200">
                  <span className="font-bold text-white">{Object.values(checklistDone).filter(Boolean).length}</span>
                  <span className="text-amber-300/70"> / {activeOrderRequest.items.length} done</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setActiveOrderRequest(null); setChecklistDone({}); setLinkedRequestId(""); setError(""); }}
                  className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {(() => {
              const total = activeOrderRequest.items.length;
              const done = Object.values(checklistDone).filter(Boolean).length;
              const pct = total > 0 ? (done / total) * 100 : 0;
              return (
                <div className="h-1.5 bg-neutral-800">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              );
            })()}

            {/* Item checklist */}
            <div className="divide-y divide-white/5">
              {activeOrderRequest.items.map((item) => {
                const done = !!checklistDone[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleChecklistItem(item.id)}
                    className={[
                      "w-full flex items-center gap-4 px-5 py-4 text-left transition-colors",
                      done ? "bg-emerald-900/20" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    {/* Big checkbox */}
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
                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-base font-semibold ${done ? "line-through text-neutral-500" : "text-white"}`}>
                        {item.item_name}
                      </div>
                    </div>
                    {/* Qty badge */}
                    <div className={`text-right shrink-0 ${done ? "text-neutral-500" : "text-white"}`}>
                      <span className="text-xl font-bold">{Number(item.qty || 0).toFixed(0)}</span>
                      <span className="ml-1 text-sm text-neutral-400">{item.unit}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Complete button */}
            {(() => {
              const total = activeOrderRequest.items.length;
              const done = Object.values(checklistDone).filter(Boolean).length;
              const allDone = done === total && total > 0;
              return (
                <div className="px-5 py-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => void completeProductionFromChecklist()}
                    disabled={!allDone}
                    className={[
                      "w-full rounded-xl py-3 text-base font-bold transition-all",
                      allDone
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400"
                        : "border border-neutral-700 bg-neutral-900 text-neutral-500 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {allDone ? "✓ All Done — Complete Production" : `Check all items (${done}/${total} done)`}
                  </button>
                </div>
              );
            })()}
          </div>
        ) : null}

        {pendingCkLoading && pendingCkRequests.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">Loading...</div>
        ) : pendingCkRequests.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">No pending manufacturing requests.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {pendingCkRequests.filter((req) => req.id !== activeOrderRequest?.id).map((req) => (
              <div
                key={req.id}
                className={[
                  "rounded-2xl border p-5 transition",
                  linkedRequestId === req.id
                    ? "border-amber-600/60 bg-amber-950/40"
                    : "border-amber-900/30 bg-neutral-950/40",
                ].join(" ")}
              >
                {/* Card header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xl font-bold text-neutral-100">{req.store_code}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-neutral-400">{req.request_no}</span>
                      <span className={[
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        req.status === "IN_PRODUCTION" ? "bg-blue-900/40 text-blue-300" : "bg-green-900/40 text-green-300",
                      ].join(" ")}>
                        {req.status === "IN_PRODUCTION" ? "In Production" : "Approved"}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-neutral-500">
                      Requested: <span className="text-neutral-300">{String(req.request_date || "").slice(0, 10)}</span>
                      {req.needed_by_date ? (
                        <> &nbsp;&middot;&nbsp; Due: <span className="font-medium text-amber-300">{String(req.needed_by_date).slice(0, 10)}</span></>
                      ) : null}
                      &nbsp;&middot;&nbsp; {req.requested_by}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => printRequests(req)}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      disabled={linkedRequestId === req.id}
                      onClick={() => startFromRequest(req)}
                      className="rounded-lg border border-amber-600 bg-amber-900/40 px-5 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-800/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linkedRequestId === req.id ? "Selected" : "Start Production"}
                    </button>
                  </div>
                </div>

                {/* Items table */}
                <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/30">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800">
                        <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">Item</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-neutral-500">Qty</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {req.items.map((item) => (
                        <tr key={item.id} className="border-b border-neutral-800/60 last:border-0">
                          <td className="px-4 py-3 text-neutral-200">{item.item_name}</td>
                          <td className="px-4 py-3 text-right font-medium text-neutral-100">{Number(item.qty || 0).toFixed(3)}</td>
                          <td className="px-4 py-3 text-neutral-400">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Add Products</div>
          <div className="text-xs text-neutral-500">{productOptions.length} registered production products</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_140px]">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Select a product</option>
            {productOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={selectedQty}
            onChange={(e) => setSelectedQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              setSelectedQty((current) => stepDraftNumber(current, selectedQtyStep, e.key === "ArrowUp" ? 1 : -1));
            }}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
          >
            {PRODUCTION_OUTPUT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addDraftOutput}
            disabled={!selectedProduct}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            Add Product
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Unit Cost</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftOutputs.map((item) => (
                <tr key={item.key} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{item.item_name}</td>
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">{number3(item.quantity)}</td>
                  <td className="px-3 py-2">{item.unit || "-"}</td>
                  <td className="px-3 py-2">{Number(item.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeDraftOutput(item.key)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftOutputs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    No products have been added yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">CK Product -&gt; Ingredients</div>
            <div className="mt-1 text-xs text-neutral-500">
              {recipeProductId
                ? "Register ingredient BOM per product here."
                : "Start a new registration by selecting a product first. Existing BOMs are not loaded until you choose a product."}
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            {recipeProductId ? (recipeLoading ? "Loading recipe..." : `${recipeRows.length} recipe rows`) : "New registration"}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_140px_140px]">
          <select
            ref={recipeProductSelectRef}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={recipeProductId}
            onChange={(e) => {
              setRecipeProductId(e.target.value);
              setError("");
            }}
          >
            <option value="">Select a recipe product</option>
            {productOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={recipeIngredientId}
            onChange={(e) => setRecipeIngredientId(e.target.value)}
            onMouseDown={handleRecipeIngredientFocus}
            onFocus={handleRecipeIngredientFocus}
          >
            <option value="">{recipeProductId ? "Select an ingredient" : "Select a recipe product first"}</option>
            {ingredientOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={recipeQty}
            onChange={(e) => setRecipeQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              setRecipeQty((current) => stepDraftNumber(current, recipeQtyStep, e.key === "ArrowUp" ? 1 : -1));
            }}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={recipeUnit}
            onChange={(e) => setRecipeUnit(e.target.value)}
          >
            {PRODUCTION_OUTPUT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addRecipeLine}
            disabled={!recipeProductId || !selectedRecipeIngredient}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            Add Ingredient
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Ingredient Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Qty / 1 Output</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {recipeRows.map((row) => (
                <tr key={row.ingredient_item_id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.ingredient_item_name}</td>
                  <td className="px-3 py-2">{row.sku || "-"}</td>
                  <td className="px-3 py-2">{row.ingredient_unit || "-"}</td>
                  <td className="px-3 py-2">{number3(row.ingredient_qty)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRecipeLine(row.ingredient_item_id)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!recipeLoading && recipeRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    {recipeProductId
                      ? "No recipe lines registered yet."
                      : "Select a recipe product to start a new BOM registration."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveRecipe}
            disabled={!recipeProductId || recipeRows.length === 0 || recipeSaving}
            className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60"
          >
            {recipeSaving ? "Saving..." : "Save Production BOM"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Ingredient Preview</div>
          <div className="text-xs text-neutral-500">{previewLoading ? "Preview loading..." : `${previewRows.length} ingredient rows`}</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">From Product</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Need</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((item, index) => {
                const shortage = Number(item.available_quantity || 0) < Number(item.quantity || 0);
                return (
                  <tr key={`${item.item_id}-${index}`} className="border-t border-neutral-800 text-neutral-200">
                    <td className="px-3 py-2">
                      <div>{item.item_name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{item.sku || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{item.source_product_name || "-"}</td>
                    <td className="px-3 py-2">{item.storage_unit || "-"}</td>
                    <td className="px-3 py-2">{number3(item.quantity)}</td>
                    <td className={["px-3 py-2", shortage ? "text-amber-300" : ""].join(" ")}>{number3(item.available_quantity)}</td>
                    <td className="px-3 py-2">{Number(item.total_cost || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {!previewLoading && previewRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    Add products to draft to display ingredient preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={createProduction}
            disabled={saving || draftOutputs.length === 0 || previewRows.length === 0}
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Production Draft"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review production history by month.</div>
          </div>
          <div className="text-xs text-neutral-500">{loading ? "Loading..." : `${historyRows.length} production rows`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Production</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      "border-t border-neutral-800 text-neutral-200 transition",
                      selectedProductionId === row.id ? "bg-emerald-950/20" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedProductionId(row.id)} className="text-left hover:text-white">
                        <div>{row.production_no}</div>
                        <div className="mt-1 text-xs text-neutral-500">{row.consumption_no || "-"}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      {row.purpose === "STORE_ORDER" ? (
                        <span className="text-amber-300">
                          🏪 {row.destination_branch_code ? labelOf(city, row.destination_branch_code) : "Store"}
                        </span>
                      ) : (
                        <span className="text-sky-400">📦 Stock</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.creator_name || "-"}</td>
                    <td className="px-3 py-2">{row.status || "-"}</td>
                  </tr>
                ))}
                {!loading && historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      No production history for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-100">Selected Production</div>
              <div className="flex flex-wrap gap-2">
                {selectedProduction?.purpose === "STORE_ORDER" && selectedProduction.status === "CLOSED" ? (
                  <button
                    type="button"
                    onClick={() => selectedProduction && printDeliveryNote(selectedProduction)}
                    className="rounded-lg border border-violet-700 bg-violet-950/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-900/30"
                  >
                    🖨 納品書 Print
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={duplicateSelectedProduction}
                  disabled={!selectedProductionId || actionLoading}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={closeSelectedProduction}
                  disabled={!selectedProductionId || actionLoading || selectedProduction?.status === "CLOSED"}
                  className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : selectedProduction?.status === "CLOSED" ? "Closed" : "Close"}
                </button>
              </div>
            </div>

            {!selectedProduction ? (
              <div className="mt-3 text-sm text-neutral-500">Select a production record from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-4 text-sm text-neutral-200">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-neutral-500">Production No.</div>
                    <div>{selectedProduction.production_no}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Consumption No.</div>
                    <div>{selectedProduction.consumption_no || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Business Date</div>
                    <div>{String(selectedProduction.business_date || "").slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Branch</div>
                    <div>{labelOf(city, selectedProduction.branch_code)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Person in Charge</div>
                    <div>{selectedProduction.creator_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Status</div>
                    <div>{selectedProduction.status || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Purpose</div>
                    <div className={selectedProduction.purpose === "STORE_ORDER" ? "text-amber-300" : "text-sky-300"}>
                      {selectedProduction.purpose === "STORE_ORDER" ? "🏪 Store Order" : "📦 Stock"}
                    </div>
                  </div>
                  {selectedProduction.purpose === "STORE_ORDER" && (
                    <div>
                      <div className="text-xs text-neutral-500">Destination Store</div>
                      <div>{selectedProduction.destination_branch_code ? labelOf(city, selectedProduction.destination_branch_code) : "-"}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-300">{selectedProduction.notes || "-"}</div>
                </div>

                {selectedProduction.linked_request_id ? (
                  <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2">
                    <div className="text-xs text-amber-400">Manufacturing Request Linked</div>
                    <div className="mt-0.5 text-xs text-neutral-400">Request ID: {String(selectedProduction.linked_request_id).slice(0, 8)}…</div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 text-xs text-neutral-500">Output Products</div>
                  <div className="space-y-2">
                    {selectedOutputItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • Qty {number3(item.quantity)} {item.unit || ""} • Cost {Number(item.total_cost || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {selectedOutputItems.length === 0 ? <div className="text-xs text-neutral-500">No output products linked.</div> : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-neutral-500">Consumed Ingredients</div>
                  <div className="space-y-2">
                    {selectedConsumptionItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • Qty {number3(item.quantity)} {item.unit || ""} • Cost {Number(item.total_cost || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {selectedConsumptionItems.length === 0 ? (
                      <div className="text-xs text-neutral-500">No ingredient consumption lines linked.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
