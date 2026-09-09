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
  // 発注カタログの単価。Direct Purchase の手入力が引いているのと同じ表。
  catalog_unit_price?: number | null;
  // カタログ側の単位。仕入れる単位を決めているのはカタログなので、発注行は
  // これで作る（実測: カタログの単位は棚卸しと12/19一致、Par Levelとは11/19。
  // 食い違うときは Par Level 側が浮いている方が多い）。
  catalog_unit?: string | null;
  qty_convertible?: boolean;
  qty_factor?: number | null;
  price_source?: string | null;
  // 発注カタログでの品名。item_name とは別に持つ — item_name は棚卸しの鍵で、
  // 変えると現在庫が引けなくなり、その品が発注対象から消える。
  catalog_item_name?: string | null;
}

// One line of the purchase order being built in the modal. `removed` keeps a
// dropped line visible with an Undo next to it instead of making it vanish —
// a line that disappears takes its own undo button with it (lesson 56).
interface OrderLine {
  id: string;
  supplier: string;
  item_name: string;
  category: string;
  unit: string;
  qty: string;      // as typed, so the field can be empty while editing
  suggested: number;
  removed: boolean;
  unitPrice: number;      // 0 = カタログに単価が無い
  priceSource: string;    // 引けなかった理由。空欄の説明が要るため
  // 発注はカタログの単位で出す。Par Level の単位から機械的に換算できない
  // ときは数量を空にして人に入れてもらう — 8kg を 8PKT として送れば、
  // その発注だけが静かに間違う。
  orderUnit: string;
  needQty: number;        // Par Level の単位での必要量（換算できないときの表示用）
  needUnit: string;
  askQty: boolean;
  // Picked from the catalogue rather than derived from a par level. Marked so
  // the row can say where it came from — it has no par − stock to show.
  added?: boolean;
}

// One row of the ordering catalogue, for the picker in the create-orders modal.
// The par list is a subset of this: 120 of Manila's 269 external-vendor names
// are on it, and the other 149 had no way onto an order at all.
interface CatalogPick {
  item_name: string;
  unit: string;
  unit_price: number;
  supplier_name: string;
  category: string;
  on_par: boolean;
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

// Why a line has no price. Said as the thing that is missing, because the three
// need different fixes: rename, add to the catalogue, or fix the unit.
const PRICE_WHY: Record<string, string> = {
  not_in_catalog: "This name is not in the Procurement catalogue. It may be there under a different name.",
  unit_differs: "The catalogue has a price, but for a different unit — a per-pack rate is not a per-box rate.",
  price_differs_by_supplier: "Suppliers quote different prices for this name, so none was assumed.",
};

// The quantity a line will actually be ordered at. A half-typed or blank field
// reads as 0, which drops the line out of the order rather than sending NaN.
function qtyOf(line: OrderLine): number {
  const n = parseFloat(line.qty);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

  // add vendor inline
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  // catalogue name inline edit — the Procurement catalogue's name for the same
  // item. Kept separate from item_name on purpose: item_name is what the CK
  // count sheet says, and changing it would break the stock link.
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catValue, setCatValue] = useState<string>("");
  const [savingCat, setSavingCat] = useState(false);

  // unit inline edit
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitValue, setUnitValue] = useState<string>("");
  const [savingUnit, setSavingUnit] = useState(false);

  // add item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ item_name: "", unit: "", par_level: "", category: "", supplier: "", notes: "" });
  const [addingItem, setAddingItem] = useState(false);

  // export template
  const [exportingTemplate, setExportingTemplate] = useState(false);

  // create direct purchase orders modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPin, setCreatePin] = useState("");
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // What will actually be ordered. The modal used to render par − stock straight
  // from the rows, so the only way to change a quantity was to leave, edit the
  // par level, and come back. Now the modal holds its own copy and this is what
  // gets sent — nothing recomputes it at submit time.
  const [draft, setDraft] = useState<OrderLine[]>([]);

  // The ordering catalogue, for adding a line the par list does not carry.
  // Loaded when the modal opens rather than with the page: nobody who is only
  // reading par levels needs 300 catalogue rows.
  const [catalog, setCatalog] = useState<CatalogPick[]>([]);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogErr, setCatalogErr] = useState("");
  // Catalogue rows the order-type filter dropped. In Dubai that is 561 of 573,
  // because those rows carry no order type at all — so "not in the catalogue"
  // would be a lie there, and telling someone to go and register an item they
  // already registered is worse than saying nothing.
  const [catalogExcluded, setCatalogExcluded] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  // Added lines need ids of their own — the par rows' ids are database keys and
  // a catalogue pick has none. A counter, so adding the same item twice gives
  // two lines instead of one that overwrites the other.
  const addSeq = useRef(0);

  // ── fetch rows ────────────────────────────────────────────────────────────
  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels?city=${cityParam(city)}&item_type=${tab}`,
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
    fetch(`/api/admin/ck/par-levels/vendors?city=${cityParam(city)}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => { if (d.vendors) setVendors(d.vendors); })
      .catch(() => {});
  }, [city]);

  // ── unit inline save ──────────────────────────────────────────────────────
  const saveUnit = async (row: ParLevelRow, value: string) => {
    setSavingUnit(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
        {
          method: "PUT",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({ unit: value.trim() || null }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");
      setRows((prev) =>
        prev.map((r) => r.id === row.id ? { ...r, unit: data.row.unit } : r)
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingUnit(false);
      setEditingUnitId(null);
    }
  };

  // ── catalogue name inline save ────────────────────────────────────────────
  const saveCatalogName = async (row: ParLevelRow, value: string) => {
    setSavingCat(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
        {
          method: "PUT",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({ catalog_item_name: value.trim() || null }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");
      // Reload so the price that this name unlocks appears straight away —
      // the point of setting it is to see the figure.
      await loadRows();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingCat(false);
      setEditingCatId(null);
    }
  };

  // ── add item ──────────────────────────────────────────────────────────────
  const handleAddItem = async () => {
    const name = addForm.item_name.trim();
    if (!name) { alert("Item name is required."); return; }
    setAddingItem(true);
    try {
      const auth = getAuth();
      const par = addForm.par_level.trim() === "" ? null : parseFloat(addForm.par_level);
      if (addForm.par_level.trim() !== "" && (isNaN(par as number) || (par as number) < 0)) {
        alert("Please enter a valid non-negative number for Par Level.");
        return;
      }
      const res = await fetch(`/api/admin/ck/par-levels/add`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityParam(city),
          item_type: tab,
          item_name: name,
          unit: addForm.unit.trim() || null,
          par_level: par,
          category: addForm.category.trim() || null,
          supplier: addForm.supplier.trim() || null,
          notes: addForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Add failed");
      setShowAddModal(false);
      setAddForm({ item_name: "", unit: "", par_level: "", category: "", supplier: "", notes: "" });
      await loadRows();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAddingItem(false);
    }
  };

  // ── export template ───────────────────────────────────────────────────────
  const handleExportTemplate = async () => {
    setExportingTemplate(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/export-template?city=${cityParam(city)}`,
        { headers: getAuthHeaders(auth) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `CK_ParLevel_Template_${city}_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "Error exporting template");
    } finally {
      setExportingTemplate(false);
    }
  };

  // ── supplier inline save ──────────────────────────────────────────────────
  const saveSupplier = async (row: ParLevelRow, value: string) => {
    setSavingSup(true);
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
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

  // ── add vendor ────────────────────────────────────────────────────────────
  const addVendor = async () => {
    const name = newVendorName.trim();
    if (!name) return;
    setSavingVendor(true);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/ck/par-levels/vendors`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ name, city: cityParam(city) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add vendor");
      if (data.vendors) setVendors(data.vendors);
      setSuppValue(name);
      setNewVendorName("");
      setAddingVendor(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingVendor(false);
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

      // Exactly the lines shown on screen, with the quantities as edited.
      const bySupplier: Record<string, OrderLine[]> = {};
      for (const line of draft) {
        if (line.removed || qtyOf(line) <= 0) continue;
        if (!bySupplier[line.supplier]) bySupplier[line.supplier] = [];
        bySupplier[line.supplier].push(line);
      }

      const supplierNames = Object.keys(bySupplier);
      if (supplierNames.length === 0) {
        setCreateResult({ ok: false, msg: "Nothing left to order — every line was removed or set to zero." });
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      let successCount = 0;
      const errors: string[] = [];

      for (const vendorName of supplierNames) {
        const items = bySupplier[vendorName].map((line) => ({
          item_name: line.item_name,
          category: line.category || "General",
          qty: qtyOf(line),
          // カタログが決めている単位で発注する
          unit: line.orderUnit || line.unit || "pc",
          // カタログにある単価をそのまま渡す。0のまま送っていたので、
          // 自動生成した明細だけが金額なしで届いていた。
          unit_price: line.unitPrice,
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

        const res = await fetch(`/api/admin/procurement/direct-purchase`, {
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
        // This used to say "Unit prices are set to 0" every time, which stopped
        // being true when the catalogue price started being sent. A message
        // that is wrong on the good path teaches people to skip reading it.
        setCreateResult({
          ok: true,
          msg:
            `${successCount} purchase order${successCount !== 1 ? "s" : ""} created.` +
            (noPriceCount > 0
              ? ` ${noPriceCount} line${noPriceCount !== 1 ? "s" : ""} had no catalogue price and went in at 0 — fill those in before approving.`
              : " Unit prices came from the Procurement catalogue."),
        });
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

  // ── the ordering catalogue, and adding a line from it ─────────────────────
  const loadCatalog = useCallback(async () => {
    setCatalogState("loading");
    setCatalogErr("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/catalog-items?city=${cityParam(city)}`,
        { headers: getAuthHeaders(auth), cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load the catalogue");
      setCatalog(Array.isArray(data.items) ? data.items : []);
      setCatalogExcluded(Number(data.excluded_by_type) || 0);
      setCatalogState("ready");
    } catch (e: any) {
      // Say it, and keep the rest of the modal working. The order that was
      // already built is still sendable without this.
      setCatalogErr(e.message || "Failed to load the catalogue");
      setCatalogState("error");
    }
  }, [city]);

  // A catalogue pick becomes a line with no suggested quantity, because there
  // is no par level behind it to subtract stock from. It is left blank rather
  // than defaulted to 1 — a quantity nobody typed is the one that gets sent by
  // mistake, and a blank line is simply not ordered.
  const addFromCatalog = (c: CatalogPick) => {
    const supplier = (c.supplier_name || "").trim();
    if (!supplier) return;
    addSeq.current += 1;
    const unit = (c.unit || "").trim();
    setDraft((d) => [
      ...d,
      {
        id: `add-${addSeq.current}`,
        supplier,
        item_name: c.item_name,
        category: c.category || "General",
        unit,
        orderUnit: unit,
        needQty: 0,
        needUnit: unit,
        askQty: false,
        qty: "",
        suggested: 0,
        removed: false,
        unitPrice: Number(c.unit_price) || 0,
        priceSource: Number(c.unit_price) > 0 ? "catalog" : "not_in_catalog",
        added: true,
      },
    ]);
    setPickerQ("");
  };

  // Ranked so an exact prefix wins: typing "cream" should not put
  // `Sour Cream 500ml` above `Cream Cheese` because it sorts earlier.
  const pickerResults = (() => {
    const q = pickerQ.trim().toLowerCase();
    const scored = catalog
      .filter((c) => (c.supplier_name || "").trim() !== "")
      .filter((c) => !q || c.item_name.toLowerCase().includes(q) || c.supplier_name.toLowerCase().includes(q))
      .map((c) => {
        const nm = c.item_name.toLowerCase();
        return { c, rank: !q ? 2 : nm.startsWith(q) ? 0 : nm.includes(q) ? 1 : 2 };
      });
    scored.sort((a, b) => a.rank - b.rank || a.c.item_name.localeCompare(b.c.item_name));
    return scored.slice(0, 40).map((x) => x.c);
  })();

  // Suppliers with no name cannot be grouped into an order, so the picker does
  // not offer them. Said out loud rather than silently dropped.
  const unassignedCatalogCount = catalog.filter((c) => (c.supplier_name || "").trim() === "").length;

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

  const buildDraft = (): OrderLine[] =>
    Object.entries(orderGroups).flatMap(([sup, group]) =>
      group.items.map((item) => {
        const suggested = Math.max(0, (item.par_level ?? 0) - (item.current_stock ?? 0));
        const price = Number(item.catalog_unit_price ?? 0) || 0;
        const orderUnit = (price > 0 && item.catalog_unit) ? item.catalog_unit : (item.unit || "");
        const factor = item.qty_convertible ? Number(item.qty_factor ?? 1) : null;
        // Ask for the quantity only when the order unit is genuinely a different
        // measure. Same unit — including when the catalogue does not name one —
        // means par − stock still counts, and blanking it would make somebody
        // retype a number the screen already knew.
        const sameUnit =
          (orderUnit || "").trim().toLowerCase() === (item.unit || "").trim().toLowerCase();
        const askQty = price > 0 && !sameUnit && factor === null;
        return {
          id: item.id,
          supplier: sup,
          item_name: item.item_name,
          category: item.category || "General",
          unit: item.unit || "",
          orderUnit,
          needQty: suggested,
          needUnit: item.unit || "",
          askQty,
          qty: askQty ? "" : String(factor !== null ? +(suggested * factor).toFixed(3) : suggested),
          suggested,
          removed: false,
          unitPrice: price,
          priceSource: String(item.price_source || ""),
        };
      })
    );

  // What the modal will send, grouped for display. Kept in one place so the
  // table, the supplier count and the submit button cannot disagree.
  const draftGroups = (() => {
    const out: Record<string, OrderLine[]> = {};
    for (const line of draft) {
      if (!out[line.supplier]) out[line.supplier] = [];
      out[line.supplier].push(line);
    }
    return out;
  })();
  const draftSuppliers = Object.keys(draftGroups)
    .filter((sup) => draftGroups[sup].some((l) => !l.removed && qtyOf(l) > 0));
  const draftLineCount = draft.filter((l) => !l.removed && qtyOf(l) > 0).length;
  const noPriceCount = draft.filter((l) => !l.removed && qtyOf(l) > 0 && !(l.unitPrice > 0)).length;
  const askQtyCount = draft.filter((l) => !l.removed && l.askQty && qtyOf(l) <= 0).length;

  const setLineQty = (id: string, qty: string) =>
    setDraft((d) => d.map((l) => (l.id === id ? { ...l, qty } : l)));
  const toggleLineRemoved = (id: string) =>
    setDraft((d) => d.map((l) => (l.id === id ? { ...l, removed: !l.removed } : l)));

  // ── seed from Cost Calc ───────────────────────────────────────────────────
  const handleSeed = async () => {
    if (!seedConfirm) { setSeedConfirm(true); return; }
    setSeedConfirm(false);
    setSeeding(true);
    setSeedResult("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/ck/par-levels/seed?city=${cityParam(city)}`,
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
      const res = await fetch(`/api/admin/ck/par-levels/import`, {
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
        `/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
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
        `/api/admin/ck/par-levels/${row.id}?city=${cityParam(city)}`,
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
        `/api/admin/ck/par-levels/generate?city=${cityParam(city)}&plan_type=${planType}`,
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
        `/api/admin/ck/par-levels/push-to-plan?city=${cityParam(city)}&plan_date=${today}`,
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
              onClick={() => {
                setDraft(buildDraft());
                setShowCreateModal(true);
                setCreateResult(null);
                setCreatePin("");
                setPickerOpen(false);
                setPickerQ("");
                if (catalogState === "idle" || catalogState === "error") void loadCatalog();
              }}
              disabled={Object.keys(orderGroups).length === 0}
              className="rounded-xl border border-teal-500/30 bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-400 hover:bg-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title={Object.keys(orderGroups).length === 0 ? "No items with supplier + quantity to order" : ""}
            >
              🛒 Create Direct Purchase Orders ({Object.keys(orderGroups).length} supplier{Object.keys(orderGroups).length !== 1 ? "s" : ""})
            </button>
          )}

          {/* Add Item */}
          <button
            onClick={() => { setShowAddModal(true); setAddForm({ item_name: "", unit: "", par_level: "", category: "", supplier: "", notes: "" }); }}
            className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/25 transition-all"
          >
            + Add Item
          </button>

          {/* Export Template (dynamic — pre-filled with current items) */}
          <button
            onClick={handleExportTemplate}
            disabled={exportingTemplate}
            className="rounded-xl border border-zinc-500/30 bg-zinc-500/10 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-500/20 disabled:opacity-60 transition-all"
          >
            {exportingTemplate ? "Exporting…" : "⬇ Download Template"}
          </button>
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
                        <td className="px-4 py-2.5 text-white font-medium">
                          {row.item_name}
                          {tab === "supplier" && (
                            editingCatId === row.id ? (
                              <div className="mt-1 flex items-center gap-1">
                                <input
                                  type="text"
                                  value={catValue}
                                  onChange={(e) => setCatValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void saveCatalogName(row, catValue);
                                    if (e.key === "Escape") setEditingCatId(null);
                                  }}
                                  autoFocus
                                  placeholder="Name in the Procurement catalogue"
                                  className="w-64 rounded-lg bg-white/10 px-2 py-1 text-xs text-white border border-sky-500/50 outline-none"
                                />
                                <button
                                  onClick={() => void saveCatalogName(row, catValue)}
                                  disabled={savingCat}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/20 text-sky-300 hover:bg-sky-500/35 disabled:opacity-60"
                                >{savingCat ? "…" : "✓"}</button>
                                <button
                                  onClick={() => setEditingCatId(null)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10"
                                >✕</button>
                              </div>
                            ) : row.catalog_item_name ? (
                              <button
                                onClick={() => { setEditingCatId(row.id); setCatValue(row.catalog_item_name || ""); }}
                                className="mt-0.5 block text-left text-[11px] font-normal text-teal-300/80 hover:text-teal-200"
                                title="The name this item has in the Procurement catalogue. Click to change."
                              >≡ {row.catalog_item_name}</button>
                            ) : row.price_source && row.price_source !== "supplier" && row.price_source !== "catalog" ? (
                              <button
                                onClick={() => { setEditingCatId(row.id); setCatValue(""); }}
                                className="mt-0.5 block text-left text-[11px] font-normal text-orange-300/70 hover:text-orange-200"
                                title="No price could be taken from the Procurement catalogue. Set the name it has there and the price follows."
                              >+ no price — set catalogue name</button>
                            ) : null
                          )}
                        </td>

                        {/* Unit — inline editable */}
                        <td className="px-4 py-2.5 text-center">
                          {editingUnitId === row.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="text"
                                value={unitValue}
                                onChange={(e) => setUnitValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveUnit(row, unitValue);
                                  if (e.key === "Escape") setEditingUnitId(null);
                                }}
                                autoFocus
                                placeholder="e.g. kg"
                                className="w-16 rounded-lg bg-white/10 px-2 py-1 text-center text-white text-xs border border-sky-500/50 outline-none"
                              />
                              <button
                                onClick={() => void saveUnit(row, unitValue)}
                                disabled={savingUnit}
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/20 text-sky-300 hover:bg-sky-500/35 disabled:opacity-60"
                              >
                                {savingUnit ? "…" : "✓"}
                              </button>
                              <button
                                onClick={() => setEditingUnitId(null)}
                                className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/35"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingUnitId(row.id); setUnitValue(row.unit || ""); }}
                              className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-sky-500/10 hover:text-sky-300 transition-colors"
                              title="Click to edit unit"
                            >
                              {row.unit || "—"}
                            </button>
                          )}
                        </td>

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
                              <div className="flex flex-col gap-1">
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
                                  <button
                                    onClick={() => { setAddingVendor(v => !v); setNewVendorName(""); }}
                                    title="Add new vendor"
                                    className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-violet-500/15 text-violet-400 hover:bg-violet-500/30"
                                  >
                                    +
                                  </button>
                                </div>
                                {addingVendor && (
                                  <div className="flex items-center gap-1">
                                    <input
                                      autoFocus
                                      value={newVendorName}
                                      onChange={e => setNewVendorName(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") void addVendor(); if (e.key === "Escape") setAddingVendor(false); }}
                                      placeholder="New vendor name…"
                                      className="rounded bg-zinc-800 border border-violet-500/50 px-2 py-0.5 text-xs text-white outline-none w-[150px]"
                                    />
                                    <button
                                      onClick={() => void addVendor()}
                                      disabled={savingVendor || !newVendorName.trim()}
                                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-violet-500/20 text-violet-300 hover:bg-violet-500/35 disabled:opacity-50"
                                    >
                                      {savingVendor ? "…" : "Add"}
                                    </button>
                                    <button
                                      onClick={() => setAddingVendor(false)}
                                      className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/35"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
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

      {/* ── Add Item Modal ───────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:pl-60">
          <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Add Item — {tab === "ck_produced" ? "CK-Produced" : "Supplier Orders"}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10"
              >✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Item Name *</label>
                <input
                  type="text"
                  autoFocus
                  value={addForm.item_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAddItem(); }}
                  placeholder="e.g. PHILADELPHIA CREAM CHEESE"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={addForm.unit}
                    onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="e.g. kg, pc, g"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Par Level</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={addForm.par_level}
                    onChange={(e) => setAddForm((f) => ({ ...f, par_level: e.target.value }))}
                    placeholder="e.g. 10"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>
              {tab === "supplier" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Category</label>
                    <input
                      type="text"
                      value={addForm.category}
                      onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Dairy"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Supplier</label>
                    <select
                      value={addForm.supplier}
                      onChange={(e) => setAddForm((f) => ({ ...f, supplier: e.target.value }))}
                      className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                    >
                      <option value="">— None —</option>
                      {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                <input
                  type="text"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAddItem()}
                disabled={addingItem || !addForm.item_name.trim()}
                className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {addingItem ? "Adding…" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Direct Purchase Orders Modal ─────────────────────────── */}
      {showCreateModal && (
        // The overlay scrolls and the panel is capped at the viewport. Before
        // this, a fifty-line order grew taller than the screen and pushed the
        // PIN field and both buttons off the bottom with nothing to scroll —
        // the only way through was to zoom the browser out.
        //
        // md:pl-60 keeps the panel out from under the sidebar, which sits at
        // z-[60] — above every modal in the app — so at 768–1279px the left
        // column of the table was being covered by the menu.
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 md:pl-60">
          <div className="flex min-h-full items-start justify-center sm:items-center">
            <div className={`${GLASS_CARD} flex max-h-[90vh] w-full max-w-2xl flex-col`}>
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">Create Direct Purchase Orders</h2>
                <button
                  onClick={() => { setShowCreateModal(false); setCreateResult(null); }}
                  className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10"
                >✕</button>
              </div>

              {/* Lines — scrolls on its own so the PIN and buttons stay put */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <p className="mb-3 text-xs text-zinc-400">
                  One order per supplier. Change any quantity below, or remove a line you do not
                  want — a removed line stays here with an <span className="text-zinc-300">Undo</span> next
                  to it until you close this window. Unit prices come from the Procurement
                  catalogue, the same list the Direct Purchase form uses.
                </p>
                {/* Supplier is a heading row, not a column. As a column it was the
                    widest thing in the table and pushed Remove off the right edge
                    on a 768px window, inside a box that clipped it. */}
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 uppercase tracking-wide text-zinc-500">
                        <th className="px-2 py-2 text-left">Item</th>
                        <th className="px-2 py-2 text-center">Qty</th>
                        <th className="px-2 py-2 text-center">Unit</th>
                        <th className="px-2 py-2 text-right">Unit price</th>
                        <th className="px-2 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(draftGroups).flatMap(([sup, lines]) => [
                        <tr key={`sup-${sup}`} className="border-t border-white/10 bg-white/[0.03]">
                          <td colSpan={5} className="px-2 py-1.5 font-medium text-teal-300">
                            {sup}
                            <span className="ml-2 text-[10px] font-normal text-zinc-500">
                              {lines.filter((l) => !l.removed && qtyOf(l) > 0).length} item
                              {lines.filter((l) => !l.removed && qtyOf(l) > 0).length !== 1 ? "s" : ""}
                            </span>
                          </td>
                        </tr>,
                        ...lines.map((line) => (
                          <tr
                            key={line.id}
                            className={`border-t border-white/5 ${line.removed ? "opacity-40" : ""}`}
                          >
                            <td className={`px-2 py-2 align-middle text-white ${line.removed ? "line-through" : ""}`}>
                              {line.item_name}
                              {line.added && (
                                <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                                  added
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                inputMode="decimal"
                                disabled={line.removed || !!createResult?.ok}
                                value={line.qty}
                                onChange={(e) => setLineQty(line.id, e.target.value)}
                                // The list scrolls, and a number field under the
                                // pointer eats the wheel and changes its value.
                                // A quantity that moves while you scroll past it
                                // is how a wrong order gets sent.
                                onWheel={(e) => e.currentTarget.blur()}
                                aria-label={`Quantity for ${line.item_name}`}
                                className="w-16 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-center text-sm font-semibold text-orange-300 outline-none focus:border-teal-500/50 disabled:opacity-50"
                              />
                              {line.removed ? null : line.added ? (
                                qtyOf(line) > 0 ? null : (
                                  <div className="mt-0.5 text-[10px] text-orange-300/90">
                                    enter a quantity
                                  </div>
                                )
                              ) : line.askQty ? (
                                <div className="mt-0.5 text-[10px] text-orange-300/90">
                                  need {fmtNum(line.needQty)} {line.needUnit} — enter {line.orderUnit}
                                </div>
                              ) : qtyOf(line) !== line.suggested ? (
                                <div className="mt-0.5 text-[10px] text-zinc-500">
                                  par − stock: {fmtNum(line.suggested)} {line.needUnit}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-center align-middle text-zinc-400">
                              {line.orderUnit || "—"}
                            </td>
                            <td className="px-2 py-2 text-right align-middle tabular-nums">
                              {line.unitPrice > 0 ? (
                                <span className="text-zinc-200">{fmtNum(line.unitPrice, 2)}</span>
                              ) : (
                                <span className="text-orange-300/80" title={PRICE_WHY[line.priceSource] || "No price on file"}>
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right align-middle">
                              <button
                                onClick={() => toggleLineRemoved(line.id)}
                                disabled={!!createResult?.ok}
                                className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
                              >
                                {line.removed ? "Undo" : "Remove"}
                              </button>
                            </td>
                          </tr>
                        )),
                      ])}
                    </tbody>
                  </table>
                </div>
                {/* Add a line the par list does not carry. Restricted to the
                    catalogue on purpose: 16% of Direct Purchase lines already
                    arrive under a name the catalogue has never heard of, and
                    half of those are an existing item spelt differently. A free
                    text box here would make that worse; picking cannot. */}
                <div className="mt-3">
                  {!pickerOpen ? (
                    <button
                      onClick={() => { setPickerOpen(true); if (catalogState === "idle" || catalogState === "error") void loadCatalog(); }}
                      disabled={!!createResult?.ok}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      + Add item
                    </button>
                  ) : (
                    <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={pickerQ}
                          onChange={(e) => setPickerQ(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") { setPickerOpen(false); setPickerQ(""); } }}
                          placeholder="Search the Procurement catalogue…"
                          aria-label="Search the Procurement catalogue"
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500/50"
                        />
                        <button
                          onClick={() => { setPickerOpen(false); setPickerQ(""); }}
                          className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                        >
                          Done
                        </button>
                      </div>

                      {catalogState === "loading" && (
                        <p className="mt-2 text-xs text-zinc-500">Loading the catalogue…</p>
                      )}
                      {catalogState === "error" && (
                        <p className="mt-2 text-xs text-orange-300/90">
                          {catalogErr} —{" "}
                          <button onClick={() => void loadCatalog()} className="underline hover:text-orange-200">
                            try again
                          </button>
                          . The order above can still be sent without this.
                        </p>
                      )}

                      {catalogState === "ready" && (
                        <>
                          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                            {pickerResults.map((c) => (
                              <button
                                key={`${c.item_name}__${c.supplier_name}`}
                                onClick={() => addFromCatalog(c)}
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-white/10"
                              >
                                <span className="flex-1 truncate text-zinc-100">
                                  {c.item_name}
                                  {c.on_par && (
                                    <span className="ml-2 text-[10px] text-zinc-500">already on the par list</span>
                                  )}
                                </span>
                                <span className="w-40 truncate text-right text-teal-300/90">{c.supplier_name}</span>
                                <span className="w-24 text-right tabular-nums text-zinc-400">
                                  {c.unit_price > 0 ? fmtNum(c.unit_price, 2) : "no price"}
                                </span>
                                <span className="w-14 text-right text-zinc-500">{c.unit || "—"}</span>
                              </button>
                            ))}
                            {pickerResults.length === 0 && (
                              <div className="px-3 py-4 text-xs text-zinc-400">
                                <p className="text-zinc-300">
                                  Nothing in the catalogue matches “{pickerQ.trim()}”.
                                </p>
                                <p className="mt-1.5">
                                  If this is something we buy, it belongs in the item master first —
                                  adding it here would create a second copy of an item that never meets
                                  its own price or its own recipe.
                                </p>
                                <a
                                  href="/admin/cost-calculation"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-block rounded-lg border border-sky-500/30 bg-sky-500/15 px-2.5 py-1 font-medium text-sky-300 hover:bg-sky-500/25"
                                >
                                  Register it in Cost Calculation →
                                </a>
                                <p className="mt-1.5 text-[11px] text-zinc-500">
                                  Opens in a new tab. Come back and search again — this order is kept.
                                </p>
                                {catalogExcluded > 0 && (
                                  <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-orange-300/90">
                                    Before you do: {catalogExcluded} catalogue row
                                    {catalogExcluded !== 1 ? "s are" : " is"} not searchable here,
                                    because {catalogExcluded !== 1 ? "they carry" : "it carries"} no
                                    order type and this list only offers the two the Direct Purchase
                                    form uses. Your item may be one of them and already registered —
                                    check the Procurement catalogue before registering it again.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="mt-2 text-[11px] text-zinc-500">
                            {catalog.length} catalogue rows{pickerQ.trim() && ` · showing ${pickerResults.length}`}
                            {!pickerQ.trim() && pickerResults.length >= 40 && " · type to narrow"}
                            . Price, unit and supplier come from the catalogue, so nothing new is
                            created by picking.
                            {unassignedCatalogCount > 0 &&
                              ` ${unassignedCatalogCount} row${unassignedCatalogCount !== 1 ? "s are" : " is"} not offered — no supplier on file, so there is no order to put it on.`}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {askQtyCount > 0 && (
                  <p className="mt-3 text-xs text-orange-300/90">
                    {askQtyCount} line{askQtyCount !== 1 ? "s" : ""} are priced by a different
                    unit than the par list counts in — the catalogue sells them by the pack.
                    The quantity is left blank rather than guessed at; each row says how much
                    is needed. Lines left blank are not ordered.
                  </p>
                )}
                {noPriceCount > 0 && (
                  <p className="mt-3 text-xs text-orange-300/90">
                    {noPriceCount} of {draftLineCount} line{draftLineCount !== 1 ? "s" : ""} have
                    no price on file and will be created at 0. Hover the dash to see why — usually
                    the item is under a different name in the Procurement catalogue, or is not in
                    it at all. Fill those in on the order before approving.
                  </p>
                )}
                {draftLineCount === 0 && (
                  <p className="mt-3 text-xs text-orange-300">
                    Every line is removed or set to zero. There is nothing to order.
                  </p>
                )}
              </div>

              {/* PIN + actions — always on screen */}
              <div className="space-y-4 border-t border-white/10 px-6 py-4">
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

                {createResult && (
                  <div className={`rounded-lg px-3 py-2 text-sm ${createResult.ok ? "bg-teal-500/10 border border-teal-500/30 text-teal-300" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                    {createResult.msg}
                  </div>
                )}

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
                      disabled={creatingOrders || !createPin.trim() || draftSuppliers.length === 0}
                      className="rounded-xl border border-teal-500/30 bg-teal-500/15 px-5 py-2 text-sm font-semibold text-teal-400 hover:bg-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {creatingOrders
                        ? "Creating…"
                        : `Create ${draftSuppliers.length} Order${draftSuppliers.length !== 1 ? "s" : ""} (${draftLineCount} item${draftLineCount !== 1 ? "s" : ""})`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
