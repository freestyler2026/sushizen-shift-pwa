"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw, Zap, ChevronDown, ChevronRight,
  CheckCircle, Clock, Send, PackageCheck, PackageX, AlertTriangle, Trash2, Plus,
  BarChart2, ShieldCheck, Pencil, Mail, Users, Bell, FileCheck, TrendingUp, TrendingDown,
  CalendarClock, X, FileDown, Camera, ExternalLink,
} from "lucide-react";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { getAuthHeaders, getAuth } from "@/lib/auth";

const STORES = ["PAR", "CUB", "TAFT"] as const;
type Store = (typeof STORES)[number];
const STORE_LABELS: Record<Store, string> = { PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft" };

type OrderStatus = "draft" | "confirmed" | "approved" | "sent" | "received" | "partial" | "issue";

interface OrderListItem {
  id: number;
  store: Store;
  supplier_name: string;
  order_date: string;
  status: OrderStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  item_count: number;
  total_qty_ordered: number;
  total_qty_received: number;
  email_sent_at: string | null;
  email_error: string | null;
}

interface OrderItem {
  id: number;
  order_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  qty_ordered: number;
  qty_received: number | null;
  receive_note: string | null;
  received_at: string | null;
  unit_price: number | null;
  unit_price_actual: number | null;
  price_variance_pct: number | null;
  price_flagged: boolean;
  current_stock?: number | null;
}

interface OrderDetail extends OrderListItem {
  delivery_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  received_by: string | null;
  invoice_checked_at: string | null;
  invoice_checked_by: string | null;
  // EDD escalation fields
  expected_delivery_date: string | null;
  edd_note: string | null;
  edd_submitted_at: string | null;
  edd_submitted_by: string | null;
  ck_stock_submitted_at: string | null;
  ck_decision: string | null;
  ck_decision_by: string | null;
  ck_decision_at: string | null;
  invoice_photo_url: string | null;
  items: OrderItem[];
}

interface AlertData {
  overdue: { id: number; store: string; supplier_name: string; order_date: string; delivery_date: string; status: string }[];
  edd_submitted: { id: number; store: string; supplier_name: string; expected_delivery_date: string; ck_stock_submitted_at: string | null }[];
  urgent_requested: { id: number; store: string; supplier_name: string; expected_delivery_date: string; ck_decision_by: string }[];
  uninvoiced: { id: number; store: string; supplier_name: string; order_date: string; status: string; updated_at: string }[];
  flagged_items: { id: number; store: string; supplier_name: string; order_date: string; status: string }[];
}

interface PerformanceRow {
  store: string;
  supplier_name: string;
  total_orders: number;
  on_time_count: number;
  partial_count: number;
  issue_count: number;
  on_time_rate: number | null;
}

type Tab = "orders" | "catalog" | "suppliers" | "performance";

interface SupplierEmailRow {
  supplier_name: string;
  email: string;
  cc_emails: string;
  updated_at: string | null;
}

interface CatalogItem {
  id: number;
  store: string;
  item_code: string;
  item_name: string;
  category: string;
  unit: string;
  par_level: number;
  par_level_weekday: number | null;
  par_level_weekend: number | null;
  supplier_name: string;
  is_active: boolean;
  notes: string | null;
  daily_inv_item_code: string | null;
  unit_price: number | null;
}

interface DailyInvItem {
  item_code: string;
  item_name: string;
  unit: string;
  supplier_name: string;
  source_type: "supplier" | "ck";
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  draft: BADGE_INFO,
  confirmed: "inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 text-xs font-medium text-blue-300",
  approved: "inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-300",
  sent: "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-2.5 py-0.5 text-xs font-medium text-amber-300",
  received: BADGE_SUCCESS,
  partial: BADGE_WARNING,
  issue: BADGE_ERROR,
};

const STATUS_ICON: Record<OrderStatus, React.ReactNode> = {
  draft: <Clock className="h-3 w-3" />,
  confirmed: <CheckCircle className="h-3 w-3" />,
  approved: <ShieldCheck className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  received: <PackageCheck className="h-3 w-3" />,
  partial: <PackageX className="h-3 w-3" />,
  issue: <AlertTriangle className="h-3 w-3" />,
};

export default function StoreSupplierOrdersPage() {
  const auth = getAuth();
  const userRole = (auth?.role ?? "").toUpperCase();
  const canApprove = userRole === "HQ" || userRole === "ADMIN";
  const isManager = ["MANILA_MANAGEMENT", "HQ", "ADMIN"].includes(userRole);

  const [tab, setTab] = useState<Tab>("orders");
  const [store, setStore] = useState<Store>("PAR");
  const storeRef = useRef<Store>("PAR");
  storeRef.current = store;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateDate, setGenerateDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [generateInvDate, setGenerateInvDate] = useState<string | null>(null);
  const [generateDebug, setGenerateDebug] = useState<{item_name:string;stock_found:boolean;stock:number;par:number;par_source:string;order_qty:number}[]|null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [qtyUpdating, setQtyUpdating] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [perf, setPerf] = useState<PerformanceRow[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  const [suppliers, setSuppliers] = useState<SupplierEmailRow[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null); // supplier_name being edited
  const [emailDraft, setEmailDraft] = useState<{ email: string; cc_emails: string }>({ email: "", cc_emails: "" });
  const [emailSaving, setEmailSaving] = useState(false);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [dailyInvItems, setDailyInvItems] = useState<DailyInvItem[]>([]);
  const [editingCatalogId, setEditingCatalogId] = useState<number | null>(null);
  const [catalogLinkCode, setCatalogLinkCode] = useState<string>("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ item_code: "", item_name: "", supplier_name: "Central Kitchen", unit: "kg", par_level: "", par_level_weekday: "", par_level_weekend: "", daily_inv_item_code: "", unit_price: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [deleteConfirmCatalog, setDeleteConfirmCatalog] = useState<number | null>(null);

  type InlineEditState =
    | { id: number; field: "unit_price"; value: string }
    | { id: number; field: "par"; wkday: string; wkend: string; def: string }
    | null;
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const skipInlineSaveRef = useRef(false);

  const [sendEmailResult, setSendEmailResult] = useState<{ orderId: number; sent: boolean; error: string | null } | null>(null);

  // Post-order flow state
  const [alerts, setAlerts] = useState<AlertData | null>(null);
  const [deliveryDateEdit, setDeliveryDateEdit] = useState<{ orderId: number; value: string } | null>(null);
  const [deliveryDateSaving, setDeliveryDateSaving] = useState(false);

  // PO date edit state
  const [orderDateEdit, setOrderDateEdit] = useState<{ orderId: number; value: string } | null>(null);
  const [orderDateSaving, setOrderDateSaving] = useState(false);

  // EDD escalation state
  const [eddEdit, setEddEdit] = useState<{ orderId: number; date: string; note: string } | null>(null);
  const [eddSaving, setEddSaving] = useState(false);

  // Receive modal
  const [receiveModal, setReceiveModal] = useState<{
    orderId: number;
    store: string;
    orderDate: string;
    items: { item_id: number; item_name: string; unit: string; qty_ordered: number; qty_received: string; receive_note: string }[];
    invoiceNumber: string;
    receiveStatus: "received" | "partial" | "issue";
    invoicePhotoUrl: string;
    invoicePhotoFile: File | null;
    invoicePhotoUploading: boolean;
  } | null>(null);
  const [receiveSaving, setReceiveSaving] = useState(false);

  // Invoice check state
  const [actualPrices, setActualPrices] = useState<Record<number, string>>({});
  const [actualPriceSaving, setActualPriceSaving] = useState<number | null>(null);
  const [invoiceCheckSaving, setInvoiceCheckSaving] = useState(false);
  const [poPdfDownloading, setPoPdfDownloading] = useState<number | null>(null);

  async function handleDownloadPoPdf(orderId: number, store: string, supplierName: string) {
    setPoPdfDownloading(orderId);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/po-pdf`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail ?? `PDF download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO_SSO-${orderId}_${store}_${supplierName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`PDF download error: ${e}`);
    } finally {
      setPoPdfDownloading(null);
    }
  }

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/store-supplier/alerts", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAlerts({
          overdue: data.overdue ?? [],
          edd_submitted: data.edd_submitted ?? [],
          urgent_requested: data.urgent_requested ?? [],
          uninvoiced: data.uninvoiced ?? [],
          flagged_items: data.flagged_items ?? [],
        });
      }
    } catch { /* non-critical */ }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store, limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/store-supplier/orders?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [store, statusFilter, dateFrom, dateTo]);

  const loadPerf = useCallback(async () => {
    setPerfLoading(true);
    try {
      const params = new URLSearchParams({ store, days: "90" });
      const res = await fetch(`/api/admin/store-supplier/performance?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setPerf(data.performance ?? []);
    } catch {
      setPerf([]);
    } finally {
      setPerfLoading(false);
    }
  }, [store]);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/emails/${store}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
    } catch {
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  }, [store]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setShowAddForm(false);
    setDeleteConfirmCatalog(null);
    try {
      const [catRes, supplierInvRes, ckInvRes] = await Promise.all([
        fetch(`/api/admin/store-supplier/catalog/${store}`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/store-supplier/daily-inv-items?source_type=supplier`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/store-supplier/daily-inv-items?source_type=ck`, { headers: getAuthHeaders() }),
      ]);
      const catData = await catRes.json();
      const supplierInvData = await supplierInvRes.json();
      const ckInvData = await ckInvRes.json();
      setCatalogItems(catData.items ?? []);
      setDailyInvItems([
        ...(supplierInvData.items ?? []),
        ...(ckInvData.items ?? []),
      ]);
    } catch {
      setCatalogItems([]);
      setError("Failed to load catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (tab === "orders") loadOrders();
    else if (tab === "suppliers") loadSuppliers();
    else if (tab === "catalog") loadCatalog();
    else loadPerf();
  }, [tab, loadOrders, loadPerf, loadSuppliers, loadCatalog]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  useEffect(() => { setInlineEdit(null); }, [store]);

  async function toggleExpand(orderId: number) {
    if (expanded === orderId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(orderId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setDetail(data.order);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleStatusChange(orderId: number, newStatus: OrderStatus) {
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? `Failed to update status (${res.status})`);
        return;
      }
      if (newStatus === "sent") {
        setSendEmailResult({
          orderId,
          sent: !!data.email_sent,
          error: data.email_error ?? null,
        });
      }
      await loadOrders();
      if (expanded === orderId) {
        setDetail((d) => d ? { ...d, status: newStatus } : d);
      }
    } catch {
      setError("Status update failed.");
    }
  }

  async function handleDelete(orderId: number) {
    try {
      await fetch(`/api/admin/store-supplier/orders/${orderId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setDeleteConfirm(null);
      setExpanded(null);
      setDetail(null);
      await loadOrders();
    } catch {
      setError("Delete failed.");
    }
  }

  async function handleUpdateOrderDate(orderId: number, dateStr: string) {
    setOrderDateSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/order-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ order_date: dateStr }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail ?? `Failed to update PO date (${res.status})`);
        return;
      }
      setOrderDateEdit(null);
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await detailRes.json();
      setDetail(data.order);
      await loadOrders();
    } catch {
      setError("Failed to update PO date.");
    } finally {
      setOrderDateSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateMsg(null);
    setGenerateInvDate(null);
    setGenerateDebug(null);
    setShowDebug(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-supplier/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ store, order_date: generateDate }),
      });
      const data = await res.json();
      setGenerateMsg(data.message ?? `Created ${data.created} order(s)`);
      setGenerateInvDate(data.inventory_date_used ?? null);
      setGenerateDebug(data.item_debug ?? null);
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpdateItemQty(orderId: number, itemId: number) {
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty < 0) return;
    setQtyUpdating(true);
    try {
      const patchRes = await fetch(`/api/admin/store-supplier/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ qty_ordered: qty }),
      });
      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}));
        setError(errData.detail ?? `Failed to update quantity (${patchRes.status})`);
        setQtyUpdating(false);
        return;
      }
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setDetail(data.order);
      setEditingItemId(null);
    } catch {
      setError("Failed to update quantity.");
    } finally {
      setQtyUpdating(false);
    }
  }

  const onTimeRate = (row: PerformanceRow) =>
    row.on_time_rate != null ? `${row.on_time_rate}%` : "—";

  async function saveCatalogLink(item: CatalogItem) {
    setCatalogSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/catalog/${store}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          item_code: item.item_code,
          item_name: item.item_name,
          category: item.category,
          unit: item.unit,
          par_level: item.par_level,
          par_level_weekday: item.par_level_weekday,
          par_level_weekend: item.par_level_weekend,
          supplier_name: item.supplier_name,
          is_active: item.is_active,
          notes: item.notes,
          daily_inv_item_code: catalogLinkCode || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Save failed (${res.status})`);
      }
      setEditingCatalogId(null);
      await loadCatalog();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save catalog item link.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function saveNewCatalogItem() {
    if (!addForm.item_code.trim() || !addForm.item_name.trim() || !addForm.supplier_name.trim() || !addForm.par_level) {
      setError("Item Code, Item Name, Supplier, and Default Par Level are required.");
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/catalog/${store}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          item_code: addForm.item_code.trim().toUpperCase(),
          item_name: addForm.item_name.trim(),
          supplier_name: addForm.supplier_name.trim(),
          category: addForm.supplier_name.trim().toLowerCase().includes("central kitchen") ? "CK" : "GENERAL",
          unit: addForm.unit.trim() || "kg",
          par_level: parseFloat(addForm.par_level) || 0,
          par_level_weekday: addForm.par_level_weekday ? parseFloat(addForm.par_level_weekday) : null,
          par_level_weekend: addForm.par_level_weekend ? parseFloat(addForm.par_level_weekend) : null,
          daily_inv_item_code: addForm.daily_inv_item_code || null,
          unit_price: addForm.unit_price ? parseFloat(addForm.unit_price) : null,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Save failed (${res.status})`);
      }
      setAddForm({ item_code: "", item_name: "", supplier_name: "Central Kitchen", unit: "kg", par_level: "", par_level_weekday: "", par_level_weekend: "", daily_inv_item_code: "", unit_price: "" });
      setShowAddForm(false);
      await loadCatalog();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add catalog item.");
    } finally {
      setAddSaving(false);
    }
  }

  async function deleteCatalogItem(itemId: number) {
    try {
      const res = await fetch(`/api/admin/store-supplier/catalog/${store}/${itemId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Delete failed (${res.status})`);
      }
      setDeleteConfirmCatalog(null);
      await loadCatalog();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete catalog item.");
    }
  }

  async function saveInlineEdit(editState: NonNullable<InlineEditState>) {
    if (inlineSaving || skipInlineSaveRef.current) { skipInlineSaveRef.current = false; return; }
    const savedStore = storeRef.current;
    const item = catalogItems.find(i => i.id === editState.id);
    if (!item) return;
    setInlineSaving(true);
    try {
      const body: Record<string, unknown> = {
        item_code: item.item_code,
        item_name: item.item_name,
        category: item.category,
        unit: item.unit,
        par_level: item.par_level,
        par_level_weekday: item.par_level_weekday,
        par_level_weekend: item.par_level_weekend,
        supplier_name: item.supplier_name,
        is_active: item.is_active,
        notes: item.notes,
        daily_inv_item_code: item.daily_inv_item_code,
        unit_price: item.unit_price,
      };
      if (editState.field === "unit_price") {
        body.unit_price = editState.value.trim() === "" ? null : parseFloat(editState.value);
      } else {
        body.par_level = parseFloat(editState.def) || 0;
        body.par_level_weekday = editState.wkday.trim() === "" ? null : parseFloat(editState.wkday);
        body.par_level_weekend = editState.wkend.trim() === "" ? null : parseFloat(editState.wkend);
      }
      const res = await fetch(`/api/admin/store-supplier/catalog/${store}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Save failed (${res.status})`);
      }
      if (storeRef.current === savedStore) {
        setInlineEdit(current =>
          current?.id === editState.id && current?.field === editState.field ? null : current
        );
        await loadCatalog();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setInlineSaving(false);
    }
  }

  async function handleSetDeliveryDate(orderId: number, dateStr: string) {
    setDeliveryDateSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/delivery-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ delivery_date: dateStr }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? "Failed to set delivery date.");
        return;
      }
      setDeliveryDateEdit(null);
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${orderId}`, { headers: getAuthHeaders() });
      const detailData = await detailRes.json();
      setDetail(detailData.order);
      await loadOrders();
      await loadAlerts();
    } catch {
      setError("Failed to set delivery date.");
    } finally {
      setDeliveryDateSaving(false);
    }
  }

  async function handleSubmitEDD(orderId: number, dateStr: string, note: string) {
    setEddSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/edd`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ expected_delivery_date: dateStr, edd_note: note || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? "Failed to submit EDD.");
        return;
      }
      setEddEdit(null);
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${orderId}`, { headers: getAuthHeaders() });
      const detailData = await detailRes.json();
      setDetail(detailData.order);
      await loadAlerts();
    } catch {
      setError("Failed to submit EDD.");
    } finally {
      setEddSaving(false);
    }
  }

  function openReceiveModal(order: OrderDetail) {
    setReceiveModal({
      orderId: order.id,
      store: order.store,
      orderDate: order.order_date,
      items: order.items.map((it) => ({
        item_id: it.id,
        item_name: it.item_name,
        unit: it.unit,
        qty_ordered: it.qty_ordered,
        qty_received: it.qty_received != null ? String(it.qty_received) : String(it.qty_ordered),
        receive_note: it.receive_note ?? "",
      })),
      invoiceNumber: order.invoice_number ?? "",
      receiveStatus: "received",
      invoicePhotoUrl: "",
      invoicePhotoFile: null,
      invoicePhotoUploading: false,
    });
  }

  async function handleInvoicePhotoChange(file: File) {
    if (!receiveModal) return;
    setReceiveModal({ ...receiveModal, invoicePhotoFile: file, invoicePhotoUploading: true, invoicePhotoUrl: "" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("store", receiveModal.store);
      fd.append("order_date", receiveModal.orderDate);
      const res = await fetch(`/api/admin/store-supplier/orders/${receiveModal.orderId}/upload-invoice-photo`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Photo upload failed.");
        setReceiveModal((m) => m ? { ...m, invoicePhotoFile: null, invoicePhotoUploading: false } : m);
        return;
      }
      setReceiveModal((m) => m ? { ...m, invoicePhotoUrl: data.photo_url ?? "", invoicePhotoUploading: false } : m);
    } catch {
      setError("Photo upload failed.");
      setReceiveModal((m) => m ? { ...m, invoicePhotoFile: null, invoicePhotoUploading: false } : m);
    }
  }

  async function handleConfirmReceipt() {
    if (!receiveModal) return;
    if (!receiveModal.invoicePhotoUrl) {
      setError("Please upload an invoice photo before confirming receipt.");
      return;
    }
    setReceiveSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${receiveModal.orderId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          items: receiveModal.items.map((it) => ({
            item_id: it.item_id,
            qty_received: parseFloat(it.qty_received) || 0,
            receive_note: it.receive_note || null,
          })),
          status: receiveModal.receiveStatus,
          invoice_number: receiveModal.invoiceNumber.trim() || null,
          invoice_photo_url: receiveModal.invoicePhotoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Failed to confirm receipt.");
        return;
      }
      setReceiveModal(null);
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${receiveModal.orderId}`, { headers: getAuthHeaders() });
      const detailData = await detailRes.json();
      setDetail(detailData.order);
      await loadOrders();
      await loadAlerts();
    } catch {
      setError("Failed to confirm receipt.");
    } finally {
      setReceiveSaving(false);
    }
  }

  async function handleSetActualPrice(orderId: number, itemId: number, priceStr: string) {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    setActualPriceSaving(itemId);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/items/${itemId}/actual-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ unit_price_actual: price }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? "Failed to save actual price.");
        return;
      }
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${orderId}`, { headers: getAuthHeaders() });
      const detailData = await detailRes.json();
      setDetail(detailData.order);
      await loadAlerts();
    } catch {
      setError("Failed to save actual price.");
    } finally {
      setActualPriceSaving(null);
    }
  }

  async function handleInvoiceCheck(orderId: number) {
    setInvoiceCheckSaving(true);
    try {
      const res = await fetch(`/api/admin/store-supplier/orders/${orderId}/invoice-check`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Failed to mark invoice checked.");
        return;
      }
      const detailRes = await fetch(`/api/admin/store-supplier/orders/${orderId}`, { headers: getAuthHeaders() });
      const detailData = await detailRes.json();
      setDetail(detailData.order);
      await loadAlerts();
    } catch {
      setError("Failed to mark invoice checked.");
    } finally {
      setInvoiceCheckSaving(false);
    }
  }

  async function saveSupplierEmail(supplierName: string) {
    setEmailSaving(true);
    try {
      await fetch(`/api/admin/store-supplier/emails/${store}/${encodeURIComponent(supplierName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(emailDraft),
      });
      setEditingEmail(null);
      await loadSuppliers();
    } catch {
      setError("Failed to save supplier email.");
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/20 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={T_PAGE_TITLE}>Store Supplier Orders</h1>
          <div className="flex gap-2">
            <button onClick={tab === "orders" ? loadOrders : tab === "suppliers" ? loadSuppliers : tab === "catalog" ? loadCatalog : loadPerf} className={SECONDARY_BUTTON + " flex items-center gap-2"}>
              <RefreshCw className={`h-4 w-4 ${(loading || perfLoading || suppliersLoading || catalogLoading) ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Top tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab("orders")} className={tab === "orders" ? TAB_ACTIVE : TAB_INACTIVE}>Orders</button>
          {isManager && (
            <>
              <button onClick={() => setTab("catalog")} className={tab === "catalog" ? TAB_ACTIVE : TAB_INACTIVE}>
                <Pencil className="inline h-4 w-4 mr-1.5" />Catalog
              </button>
              <button onClick={() => setTab("suppliers")} className={tab === "suppliers" ? TAB_ACTIVE : TAB_INACTIVE}>
                <Users className="inline h-4 w-4 mr-1.5" />Supplier Emails
              </button>
            </>
          )}
          <button onClick={() => setTab("performance")} className={tab === "performance" ? TAB_ACTIVE : TAB_INACTIVE}>
            <BarChart2 className="inline h-4 w-4 mr-1.5" />Supplier Performance
          </button>
        </div>

        {/* Store tabs */}
        <div className="flex gap-2 flex-wrap">
          {STORES.map((s) => (
            <button key={s} onClick={() => setStore(s)} className={store === s ? TAB_ACTIVE : TAB_INACTIVE}>
              {STORE_LABELS[s]}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        {sendEmailResult && (
          <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${
            sendEmailResult.sent
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <Mail className="h-4 w-4 shrink-0" />
            {sendEmailResult.sent
              ? `Email sent to supplier for order #${sendEmailResult.orderId}.`
              : sendEmailResult.error
                ? `Email not sent for order #${sendEmailResult.orderId}: ${sendEmailResult.error}`
                : `No email configured for this supplier (order #${sendEmailResult.orderId}). Set it in Supplier Emails tab.`
            }
            <button onClick={() => setSendEmailResult(null)} className="ml-auto text-zinc-500 hover:text-zinc-300">✕</button>
          </div>
        )}

        {/* ── Alert banner ──────────────────────────────────────────── */}
        {alerts && (
          alerts.overdue.length > 0 ||
          alerts.edd_submitted.length > 0 ||
          alerts.urgent_requested.length > 0 ||
          alerts.uninvoiced.length > 0 ||
          alerts.flagged_items.length > 0
        ) && (
          <div className="space-y-2">
            {/* Overdue with no EDD — Mariano must act */}
            {alerts.overdue.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <div>
                  <span className="font-semibold text-red-300">⚠ Overdue — EDD Required ({alerts.overdue.length})</span>
                  <div className="mt-1 text-xs text-red-400/80">
                    {alerts.overdue.map((o) => (
                      <span key={o.id} className="mr-3">{o.store} · {o.supplier_name} (due {o.delivery_date})</span>
                    ))}
                    <span className="ml-1 text-red-500">— Open order and set Expected Delivery Date</span>
                  </div>
                </div>
              </div>
            )}
            {/* EDD submitted — waiting for CK review */}
            {alerts.edd_submitted.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                <CalendarClock className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                <div>
                  <span className="font-semibold text-blue-300">EDD Submitted — Awaiting CK Review ({alerts.edd_submitted.length})</span>
                  <div className="mt-1 text-xs text-blue-400/80">
                    {alerts.edd_submitted.map((o) => (
                      <span key={o.id} className="mr-3">
                        {o.store} · {o.supplier_name} → EDD {o.expected_delivery_date}
                        {o.ck_stock_submitted_at ? " ✓ Stock entered" : " · Awaiting CK stock entry"}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Urgent requested — Aliana must follow up */}
            {alerts.urgent_requested.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-300" />
                <div>
                  <span className="font-semibold text-red-200">🚨 Urgent Delivery Requested ({alerts.urgent_requested.length}) — Follow up with supplier</span>
                  <div className="mt-1 text-xs text-red-300/80">
                    {alerts.urgent_requested.map((o) => (
                      <span key={o.id} className="mr-3">{o.store} · {o.supplier_name} (requested by {o.ck_decision_by})</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {alerts.flagged_items.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
                <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 text-orange-400" />
                <div>
                  <span className="font-semibold text-orange-300">Price Variance Flagged ({alerts.flagged_items.length} order{alerts.flagged_items.length !== 1 ? "s" : ""})</span>
                  <div className="mt-1 text-xs text-orange-400/80">
                    {alerts.flagged_items.map((o) => (
                      <span key={o.id} className="mr-3">{o.store} · {o.supplier_name} · #{o.id}</span>
                    ))}
                    <span className="ml-1">— Check Invoice section to review</span>
                  </div>
                </div>
              </div>
            )}
            {alerts.uninvoiced.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                <Bell className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-semibold text-amber-300">Invoice Check Pending ({alerts.uninvoiced.length} order{alerts.uninvoiced.length !== 1 ? "s" : ""} &gt;3 days)</span>
                  <div className="mt-1 text-xs text-amber-400/80">
                    {alerts.uninvoiced.map((o) => (
                      <span key={o.id} className="mr-3">{o.store} · {o.supplier_name} · #{o.id}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ─────────────────────────────────────────────── */}
        {tab === "orders" && (
          <>
            {/* Generate panel */}
            <div className={GLASS_CARD + " p-4 flex flex-wrap items-center gap-3"}>
              <span className="text-sm text-zinc-400 font-medium">Delivery Date:</span>
              <input
                type="date"
                className={INPUT_CLASS + " max-w-[160px]"}
                value={generateDate}
                onChange={(e) => setGenerateDate(e.target.value)}
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={PRIMARY_BUTTON + " flex items-center gap-2"}
              >
                <Zap className="h-4 w-4" />
                {generating ? "Generating…" : "Generate Now"}
              </button>
              {generateMsg && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-emerald-400">{generateMsg}</span>
                  {generateInvDate
                    ? <span className="text-xs text-zinc-400">Inventory ref: {generateInvDate}</span>
                    : <span className="text-xs text-amber-400">⚠ No inventory data found — full par levels used</span>
                  }
                  {generateDebug && (
                    <button onClick={() => setShowDebug(v => !v)} className="text-xs text-blue-400 underline text-left">
                      {showDebug ? "Hide" : "Show"} stock debug ({generateDebug.filter(i => !i.stock_found).length} items with no inventory match)
                    </button>
                  )}
                </div>
              )}
              {showDebug && generateDebug && (
                <div className="w-full overflow-x-auto mt-2">
                  <table className="text-xs w-full border-collapse">
                    <thead><tr className="text-zinc-400">
                      <th className="text-left pr-2">Item</th>
                      <th className="text-right pr-2">Stock</th>
                      <th className="text-right pr-2">Par</th>
                      <th className="text-right pr-2">Par src</th>
                      <th className="text-right">Order</th>
                    </tr></thead>
                    <tbody>{generateDebug.map((d, i) => (
                      <tr key={i} className={d.stock_found ? "" : "text-amber-400"}>
                        <td className="pr-2">{d.stock_found ? "" : "⚠ "}{d.item_name}</td>
                        <td className="text-right pr-2">{d.stock}</td>
                        <td className="text-right pr-2">{d.par}</td>
                        <td className="text-right pr-2">{d.par_source}</td>
                        <td className="text-right">{d.order_qty > 0 ? d.order_qty : "-"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className={GLASS_CARD + " p-4 flex flex-wrap gap-3 items-center"}>
              <select className={SELECT_CLASS + " max-w-[160px]"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="approved">Approved</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
                <option value="partial">Partial</option>
                <option value="issue">Issue</option>
              </select>
              <input type="date" className={INPUT_CLASS + " max-w-[150px]"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-zinc-500 text-sm">to</span>
              <input type="date" className={INPUT_CLASS + " max-w-[150px]"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <span className={BADGE_INFO}>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Order list */}
            {loading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No orders found. Use &ldquo;Generate Now&rdquo; to create draft orders.</div>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => (
                  <div key={order.id} className={GLASS_CARD + " overflow-hidden"}>
                    {/* Order row */}
                    <button
                      onClick={() => toggleExpand(order.id)}
                      className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors"
                    >
                      {expanded === order.id
                        ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
                      <span className="font-semibold text-white min-w-[120px]">{order.supplier_name}</span>
                      <span className="text-sm text-zinc-400">{order.order_date}</span>
                      <span className={STATUS_STYLE[order.status]}>
                        {STATUS_ICON[order.status]} {order.status}
                      </span>
                      <span className="text-xs text-zinc-500 ml-auto">{order.item_count} item{order.item_count !== 1 ? "s" : ""}</span>
                      {order.email_sent_at && (
                        <span title={`Email sent ${order.email_sent_at}`} className="text-emerald-400">
                          <Mail className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="text-xs text-zinc-500">by {order.created_by}</span>
                    </button>

                    {/* Expanded detail */}
                    {expanded === order.id && (
                      <div className="border-t border-white/5 px-4 py-4 space-y-4">
                        {detailLoading ? (
                          <div className="text-sm text-zinc-500">Loading items…</div>
                        ) : detail && detail.id === order.id ? (
                          <>
                            {/* Items table */}
                            {(() => {
                              const canEditQty =
                                (detail.status === "draft" || detail.status === "confirmed") ? isManager
                                : detail.status === "approved" ? canApprove
                                : false;
                              return (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-white/5">
                                        <th className="px-3 py-2 text-left text-xs text-zinc-500">Item</th>
                                        <th className="px-3 py-2 text-right text-xs text-zinc-500">Stock</th>
                                        <th className="px-3 py-2 text-right text-xs text-zinc-500">Ordered{canEditQty && <span className="ml-1 text-zinc-600">(editable)</span>}</th>
                                        <th className="px-3 py-2 text-right text-xs text-zinc-500">Unit Price</th>
                                        <th className="px-3 py-2 text-right text-xs text-zinc-500">Total</th>
                                        <th className="px-3 py-2 text-right text-xs text-zinc-500">Received</th>
                                        <th className="px-3 py-2 text-left text-xs text-zinc-500">Note</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.items.map((item) => (
                                        <tr key={item.id} className="border-b border-white/5 last:border-0">
                                          <td className="px-3 py-2">
                                            <div className="text-white">{item.item_name}</div>
                                            <div className="text-xs text-zinc-500">{item.item_code}</div>
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                                            {item.current_stock != null
                                              ? <span className="text-zinc-300">{Number(item.current_stock)} {item.unit}</span>
                                              : <span className="text-zinc-600">—</span>}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums">
                                            {editingItemId === item.id ? (
                                              <div className="flex items-center gap-1 justify-end">
                                                <input
                                                  type="number"
                                                  className={INPUT_CLASS + " w-20 py-0.5 px-2 text-sm text-right"}
                                                  value={editQty}
                                                  onChange={(e) => setEditQty(e.target.value)}
                                                  min="0"
                                                  step="0.001"
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleUpdateItemQty(detail.id, item.id);
                                                    if (e.key === "Escape") setEditingItemId(null);
                                                  }}
                                                />
                                                <button
                                                  onClick={() => handleUpdateItemQty(detail.id, item.id)}
                                                  disabled={qtyUpdating}
                                                  className="text-emerald-400 hover:text-emerald-300 text-xs font-bold px-1"
                                                >
                                                  {qtyUpdating ? "…" : "✓"}
                                                </button>
                                                <button
                                                  onClick={() => setEditingItemId(null)}
                                                  className="text-zinc-500 hover:text-zinc-400 text-xs px-1"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-1 justify-end group">
                                                <span className="text-amber-400 font-semibold">{item.qty_ordered} {item.unit}</span>
                                                {canEditQty && (
                                                  <button
                                                    onClick={() => { setEditingItemId(item.id); setEditQty(String(item.qty_ordered)); }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
                                                    title="Edit quantity"
                                                  >
                                                    <Pencil className="h-3 w-3" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                                            {item.unit_price != null
                                              ? <span className="text-zinc-300">₱{Number(item.unit_price).toFixed(2)}</span>
                                              : <span className="text-zinc-600">—</span>}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                                            {item.unit_price != null
                                              ? <span className="text-amber-300 font-medium">₱{(Number(item.unit_price) * Number(item.qty_ordered)).toFixed(2)}</span>
                                              : <span className="text-zinc-600">—</span>}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums">
                                            {item.qty_received != null
                                              ? <span className="text-emerald-400 font-semibold">{item.qty_received} {item.unit}</span>
                                              : <span className="text-zinc-600">—</span>}
                                          </td>
                                          <td className="px-3 py-2 text-xs text-zinc-400">{item.receive_note ?? "—"}</td>
                                        </tr>
                                      ))}
                                      {(() => {
                                        const grandTotal = detail.items.reduce((sum, it) =>
                                          it.unit_price != null ? sum + Number(it.unit_price) * Number(it.qty_ordered) : sum, 0);
                                        return grandTotal > 0 ? (
                                          <tr className="border-t border-white/10 bg-white/3">
                                            <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-zinc-400">Grand Total</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-amber-300">₱{grandTotal.toFixed(2)}</td>
                                            <td colSpan={2} />
                                          </tr>
                                        ) : null;
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })()}

                            {/* PO Date row (editable before sent) */}
                            {isManager && (
                              <div className="flex flex-wrap items-center gap-3 py-1 border-t border-white/5 text-sm">
                                <CalendarClock className="h-4 w-4 text-zinc-500 shrink-0" />
                                <span className="text-zinc-400 text-xs font-medium">PO Date:</span>
                                {orderDateEdit?.orderId === order.id ? (
                                  <>
                                    <input
                                      type="date"
                                      className={INPUT_CLASS + " py-0.5 max-w-[150px] text-xs"}
                                      value={orderDateEdit.value}
                                      onChange={(e) => setOrderDateEdit({ orderId: order.id, value: e.target.value })}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleUpdateOrderDate(order.id, orderDateEdit.value)}
                                      disabled={orderDateSaving || !orderDateEdit.value}
                                      className="text-emerald-400 hover:text-emerald-300 text-xs font-bold px-1"
                                    >
                                      {orderDateSaving ? "…" : "✓"}
                                    </button>
                                    <button onClick={() => setOrderDateEdit(null)} className="text-zinc-500 hover:text-zinc-400 text-xs px-1">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs font-medium text-zinc-300">{detail.order_date}</span>
                                    {["draft", "confirmed", "approved"].includes(detail.status) && (
                                      <button
                                        onClick={() => setOrderDateEdit({ orderId: order.id, value: detail.order_date })}
                                        className="text-zinc-600 hover:text-zinc-400"
                                        title="Edit PO date"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            {/* Download PO PDF */}
                            {!["draft"].includes(detail.status) && (
                              <div className="flex items-center gap-3 py-1 border-t border-white/5">
                                <button
                                  onClick={() => handleDownloadPoPdf(order.id, order.store, order.supplier_name)}
                                  disabled={poPdfDownloading === order.id}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-medium py-1.5 px-3 transition-colors disabled:opacity-50"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                  {poPdfDownloading === order.id ? "Generating…" : "Download PO"}
                                </button>
                                <span className="text-xs text-zinc-600">PO SSO-{order.id}</span>
                              </div>
                            )}

                            {/* Delivery date row */}
                            {(isManager || detail.status === "sent") && (
                              <div className="flex flex-wrap items-center gap-3 py-1 border-t border-white/5 text-sm">
                                <CalendarClock className="h-4 w-4 text-zinc-500 shrink-0" />
                                <span className="text-zinc-400 text-xs font-medium">Expected Delivery:</span>
                                {deliveryDateEdit?.orderId === order.id ? (
                                  <>
                                    <input
                                      type="date"
                                      className={INPUT_CLASS + " py-0.5 max-w-[150px] text-xs"}
                                      value={deliveryDateEdit.value}
                                      onChange={(e) => setDeliveryDateEdit({ orderId: order.id, value: e.target.value })}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSetDeliveryDate(order.id, deliveryDateEdit.value)}
                                      disabled={deliveryDateSaving || !deliveryDateEdit.value}
                                      className="text-emerald-400 hover:text-emerald-300 text-xs font-bold px-1"
                                    >
                                      {deliveryDateSaving ? "…" : "✓"}
                                    </button>
                                    <button onClick={() => setDeliveryDateEdit(null)} className="text-zinc-500 hover:text-zinc-400 text-xs px-1">✕</button>
                                  </>
                                ) : detail.delivery_date ? (
                                  <>
                                    <span className={`text-xs font-medium ${
                                      order.status === "sent" && detail.delivery_date < new Date().toISOString().slice(0, 10)
                                        ? "text-red-400" : "text-zinc-300"
                                    }`}>
                                      {detail.delivery_date}
                                      {order.status === "sent" && detail.delivery_date < new Date().toISOString().slice(0, 10) && (
                                        <span className="ml-1 text-red-400 text-xs">(overdue)</span>
                                      )}
                                    </span>
                                    {isManager && (
                                      <button
                                        onClick={() => setDeliveryDateEdit({ orderId: order.id, value: detail.delivery_date! })}
                                        className="text-zinc-600 hover:text-zinc-400"
                                        title="Edit delivery date"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                  </>
                                ) : isManager ? (
                                  <button
                                    onClick={() => setDeliveryDateEdit({ orderId: order.id, value: new Date().toISOString().slice(0, 10) })}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 italic flex items-center gap-1"
                                  >
                                    <Pencil className="h-3 w-3" /> Set date
                                  </button>
                                ) : (
                                  <span className="text-xs text-zinc-600">Not set</span>
                                )}
                              </div>
                            )}

                            {/* ── EDD Escalation Section (sent + overdue orders) ── */}
                            {detail.status === "sent" && detail.delivery_date && detail.delivery_date < new Date().toISOString().slice(0, 10) && (
                              <div className="border-t border-white/5 pt-3 space-y-3">
                                <div className="flex items-center gap-2 text-sm">
                                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                                  <span className="font-semibold text-red-300">Order Overdue — Expected Delivery Date</span>
                                </div>

                                {/* If no EDD yet — show input */}
                                {!detail.expected_delivery_date || eddEdit?.orderId === order.id ? (
                                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                                    <p className="text-xs text-zinc-400">
                                      {detail.expected_delivery_date
                                        ? "Update the expected delivery date:"
                                        : "When will this order be delivered? Set an EDD so CK can plan inventory."}
                                    </p>
                                    <div className="flex flex-wrap gap-2 items-end">
                                      <div>
                                        <label className="block text-xs text-zinc-500 mb-1">Expected Date</label>
                                        <input
                                          type="date"
                                          className={INPUT_CLASS + " max-w-[160px] text-xs py-1"}
                                          value={eddEdit?.orderId === order.id ? eddEdit.date : (detail.expected_delivery_date ?? new Date().toISOString().slice(0, 10))}
                                          onChange={(e) => setEddEdit((prev) => prev?.orderId === order.id
                                            ? { ...prev, date: e.target.value }
                                            : { orderId: order.id, date: e.target.value, note: detail.edd_note ?? "" }
                                          )}
                                          autoFocus={!detail.expected_delivery_date}
                                        />
                                      </div>
                                      <div className="flex-1 min-w-[180px]">
                                        <label className="block text-xs text-zinc-500 mb-1">Note (optional)</label>
                                        <input
                                          className={INPUT_CLASS + " text-xs py-1"}
                                          placeholder="e.g. Supplier confirmed Wednesday"
                                          value={eddEdit?.orderId === order.id ? eddEdit.note : (detail.edd_note ?? "")}
                                          onChange={(e) => setEddEdit((prev) => prev?.orderId === order.id
                                            ? { ...prev, note: e.target.value }
                                            : { orderId: order.id, date: detail.expected_delivery_date ?? new Date().toISOString().slice(0, 10), note: e.target.value }
                                          )}
                                        />
                                      </div>
                                      <button
                                        onClick={() => {
                                          const ed = eddEdit?.orderId === order.id ? eddEdit : null;
                                          const dateVal = ed?.date || detail.expected_delivery_date || new Date().toISOString().slice(0, 10);
                                          const noteVal = ed?.note ?? detail.edd_note ?? "";
                                          handleSubmitEDD(order.id, dateVal, noteVal);
                                        }}
                                        disabled={eddSaving}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-1.5 px-3 transition-colors disabled:opacity-50"
                                      >
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {eddSaving ? "Saving…" : detail.expected_delivery_date ? "Update EDD" : "Set EDD"}
                                      </button>
                                      {detail.expected_delivery_date && (
                                        <button onClick={() => setEddEdit(null)} className="text-xs text-zinc-500 hover:text-zinc-300 px-1">Cancel</button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  /* EDD is set — show status */
                                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                                    <div className="flex flex-wrap items-center gap-3 text-sm">
                                      <span className="text-blue-300 font-medium">📅 EDD: {detail.expected_delivery_date}</span>
                                      {detail.edd_note && <span className="text-xs text-zinc-400 italic">&ldquo;{detail.edd_note}&rdquo;</span>}
                                      <span className="text-xs text-zinc-500">by {detail.edd_submitted_by}</span>
                                      {isManager && (
                                        <button
                                          onClick={() => setEddEdit({ orderId: order.id, date: detail.expected_delivery_date!, note: detail.edd_note ?? "" })}
                                          className="text-zinc-600 hover:text-zinc-400"
                                          title="Update EDD"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                    {/* CK review status */}
                                    {detail.ck_decision ? (
                                      <div className={`flex items-center gap-2 text-xs font-medium rounded-lg px-2.5 py-1.5 w-fit ${
                                        detail.ck_decision === "approved"
                                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                          : "bg-red-500/10 text-red-300 border border-red-500/20"
                                      }`}>
                                        {detail.ck_decision === "approved"
                                          ? <><CheckCircle className="h-3.5 w-3.5" /> CK Approved — delivery scheduled</>
                                          : <><AlertTriangle className="h-3.5 w-3.5" /> CK Requested Immediate Delivery — contact supplier</>
                                        }
                                        <span className="text-zinc-500 ml-1">({detail.ck_decision_by})</span>
                                      </div>
                                    ) : detail.ck_stock_submitted_at ? (
                                      <div className="flex items-center gap-2 text-xs text-amber-300">
                                        <Clock className="h-3.5 w-3.5" />
                                        CK stock entered — awaiting CK Manager decision
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                                        <Clock className="h-3.5 w-3.5" />
                                        Waiting for CK to enter stock quantities at /store/supplier-receiving
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Invoice / receipt info (received/partial orders) */}
                            {(detail.status === "received" || detail.status === "partial") && (
                              <div className="space-y-3 border-t border-white/5 pt-3">
                                {/* Receipt summary */}
                                <div className="flex flex-wrap gap-4 text-xs">
                                  {detail.invoice_number && (
                                    <span className="flex items-center gap-1 text-zinc-300">
                                      <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
                                      Invoice: <strong className="text-white">{detail.invoice_number}</strong>
                                    </span>
                                  )}
                                  {detail.invoice_photo_url && (
                                    <a href={detail.invoice_photo_url} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                                      <Camera className="h-3.5 w-3.5" /> View Invoice Photo
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                  {detail.received_by && (
                                    <span className="text-zinc-500">Received by: <strong className="text-zinc-300">{detail.received_by}</strong></span>
                                  )}
                                  {detail.invoice_checked_at ? (
                                    <span className="flex items-center gap-1 text-emerald-400">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      Invoice verified by {detail.invoice_checked_by} on {new Date(detail.invoice_checked_at).toLocaleDateString()}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-amber-400">
                                      <Bell className="h-3.5 w-3.5" />
                                      Invoice not yet verified by back office
                                    </span>
                                  )}
                                </div>

                                {/* Actual price entry table (managers only, until invoice checked) */}
                                {isManager && (
                                  <div>
                                    <p className="text-xs font-medium text-zinc-400 mb-2">Invoice Price Matching</p>
                                    <div className="overflow-x-auto rounded-lg border border-white/5">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-white/5 bg-white/3">
                                            <th className="px-3 py-2 text-left text-zinc-500">Item</th>
                                            <th className="px-3 py-2 text-right text-zinc-500">PO Price</th>
                                            <th className="px-3 py-2 text-right text-zinc-500">Invoice Price</th>
                                            <th className="px-3 py-2 text-right text-zinc-500">Variance</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {detail.items.map((item) => {
                                            const priceKey = actualPrices[item.id];
                                            return (
                                              <tr key={item.id} className={`border-b border-white/5 last:border-0 ${item.price_flagged ? "bg-red-500/5" : ""}`}>
                                                <td className="px-3 py-2 text-white">{item.item_name}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                                                  {item.unit_price != null ? `₱${Number(item.unit_price).toFixed(2)}` : "—"}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                  {detail.invoice_checked_at ? (
                                                    <span className="text-zinc-300">
                                                      {item.unit_price_actual != null ? `₱${Number(item.unit_price_actual).toFixed(2)}` : "—"}
                                                    </span>
                                                  ) : (
                                                    <div className="flex items-center justify-end gap-1">
                                                      <span className="text-zinc-500">₱</span>
                                                      <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        className="w-24 rounded border border-white/10 bg-slate-800 px-2 py-0.5 text-right text-xs text-white outline-none focus:border-violet-400"
                                                        placeholder={item.unit_price_actual != null ? String(Number(item.unit_price_actual).toFixed(2)) : "0.00"}
                                                        value={priceKey ?? (item.unit_price_actual != null ? String(Number(item.unit_price_actual).toFixed(2)) : "")}
                                                        onChange={(e) => setActualPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                                                        onBlur={(e) => {
                                                          if (e.target.value.trim()) handleSetActualPrice(detail.id, item.id, e.target.value);
                                                        }}
                                                        disabled={actualPriceSaving === item.id}
                                                      />
                                                      {actualPriceSaving === item.id && <span className="text-zinc-500">…</span>}
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                  {item.price_variance_pct != null ? (
                                                    <span className={`flex items-center justify-end gap-1 font-medium ${
                                                      item.price_flagged ? "text-red-400" : "text-emerald-400"
                                                    }`}>
                                                      {item.price_variance_pct > 0
                                                        ? <TrendingUp className="h-3 w-3" />
                                                        : <TrendingDown className="h-3 w-3" />}
                                                      {item.price_variance_pct > 0 ? "+" : ""}{Number(item.price_variance_pct).toFixed(1)}%
                                                      {item.price_flagged && <AlertTriangle className="h-3 w-3" />}
                                                    </span>
                                                  ) : <span className="text-zinc-600">—</span>}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    {!detail.invoice_checked_at && (
                                      <div className="flex items-center gap-3 mt-3">
                                        <button
                                          onClick={() => handleInvoiceCheck(order.id)}
                                          disabled={invoiceCheckSaving}
                                          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium py-1.5 px-3 transition-colors"
                                        >
                                          <FileCheck className="h-3.5 w-3.5" />
                                          {invoiceCheckSaving ? "Saving…" : "Mark Invoice Checked"}
                                        </button>
                                        <span className="text-xs text-zinc-500">Enter actual prices above, then mark as verified.</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1 items-center">
                              {/* draft → confirmed (any manager) */}
                              {order.status === "draft" && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "confirmed")}
                                  className={PRIMARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5"}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" /> Mark as Confirmed
                                </button>
                              )}

                              {/* confirmed → approved: HQ/ADMIN only */}
                              {order.status === "confirmed" && canApprove && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "approved")}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium py-1.5 px-3 transition-colors"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" /> Approve
                                </button>
                              )}
                              {/* confirmed: non-HQ sees waiting label */}
                              {order.status === "confirmed" && !canApprove && (
                                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium py-1.5 px-3">
                                  <Clock className="h-3.5 w-3.5" /> Awaiting HQ Approval
                                </span>
                              )}

                              {/* approved → sent (any manager) */}
                              {order.status === "approved" && (
                                <button
                                  onClick={() => handleStatusChange(order.id, "sent")}
                                  className={PRIMARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5"}
                                >
                                  <Send className="h-3.5 w-3.5" /> Mark as Sent
                                </button>
                              )}

                              {/* sent → receive (all roles with view access) */}
                              {order.status === "sent" && (
                                <button
                                  onClick={() => detail && openReceiveModal(detail)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-1.5 px-3 transition-colors"
                                >
                                  <PackageCheck className="h-3.5 w-3.5" /> Confirm Receipt
                                </button>
                              )}

                              {/* Delete draft */}
                              {order.status === "draft" && (
                                deleteConfirm === order.id ? (
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => handleDelete(order.id)} className={DANGER_BUTTON + " text-sm py-1.5 px-3"}>
                                      Confirm Delete
                                    </button>
                                    <button onClick={() => setDeleteConfirm(null)} className={SECONDARY_BUTTON + " text-sm py-1.5 px-3"}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(order.id)}
                                    className={SECONDARY_BUTTON + " text-sm py-1.5 px-3 flex items-center gap-1.5 text-red-400 border-red-500/20 hover:bg-red-500/10"}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete Draft
                                  </button>
                                )
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CATALOG TAB ────────────────────────────────────────────── */}
        {tab === "catalog" && (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-400">
                Link each catalog item to its corresponding <strong className="text-white">Daily Inventory item code</strong> so Generate Orders can subtract current stock from the par level. Add CK items here with <strong className="text-white">Supplier = &quot;Central Kitchen&quot;</strong>.
              </p>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className={PRIMARY_BUTTON + " flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"}
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            {/* ── Add Item inline form ── */}
            {showAddForm && (
              <div className={GLASS_CARD + " p-4 space-y-3"}>
                <p className="text-xs font-medium text-zinc-300">New Catalog Item</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500">Item Code *</label>
                    <input
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="e.g. CK-SPICY-MAYO"
                      value={addForm.item_code}
                      onChange={(e) => setAddForm((f) => ({ ...f, item_code: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Item Name *</label>
                    <input
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="e.g. Spicy Miso Mayo"
                      value={addForm.item_name}
                      onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Supplier *</label>
                    <input
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="Central Kitchen"
                      value={addForm.supplier_name}
                      onChange={(e) => setAddForm((f) => ({ ...f, supplier_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Unit</label>
                    <input
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="kg / pcs / L"
                      value={addForm.unit}
                      onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Default Par *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="0"
                      value={addForm.par_level}
                      onChange={(e) => setAddForm((f) => ({ ...f, par_level: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Weekday Par</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="(optional)"
                      value={addForm.par_level_weekday}
                      onChange={(e) => setAddForm((f) => ({ ...f, par_level_weekday: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Weekend Par</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="(optional)"
                      value={addForm.par_level_weekend}
                      onChange={(e) => setAddForm((f) => ({ ...f, par_level_weekend: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Unit Price (₱, optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={INPUT_CLASS + " mt-1 text-xs"}
                      placeholder="e.g. 180.00"
                      value={addForm.unit_price}
                      onChange={(e) => setAddForm((f) => ({ ...f, unit_price: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-zinc-500">Daily Inv Link (optional)</label>
                    <select
                      className={SELECT_CLASS + " mt-1 text-xs w-full"}
                      value={addForm.daily_inv_item_code}
                      onChange={(e) => setAddForm((f) => ({ ...f, daily_inv_item_code: e.target.value }))}
                    >
                      <option value="">(none — use par only)</option>
                      {dailyInvItems.filter(d => d.source_type === "supplier").length > 0 && (
                        <optgroup label="── Supplier Items ──">
                          {dailyInvItems.filter(d => d.source_type === "supplier").map((d) => (
                            <option key={d.item_code} value={d.item_code}>{d.item_code} — {d.item_name}</option>
                          ))}
                        </optgroup>
                      )}
                      {dailyInvItems.filter(d => d.source_type === "ck").length > 0 && (
                        <optgroup label="── CK Items ──">
                          {dailyInvItems.filter(d => d.source_type === "ck").map((d) => (
                            <option key={d.item_code} value={d.item_code}>{d.item_code} — {d.item_name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveNewCatalogItem}
                    disabled={addSaving}
                    className={PRIMARY_BUTTON + " text-xs px-4 py-1.5"}
                  >
                    {addSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className={SECONDARY_BUTTON + " text-xs px-4 py-1.5"}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {catalogLoading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : catalogItems.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No catalog items for {STORE_LABELS[store]}. Use &quot;Add Item&quot; above to add CK items.</div>
            ) : (
              <div className={GLASS_CARD + " overflow-x-auto"}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Item</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Unit Price</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Par (wkday / wkend / default)</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Daily Inv Link</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {catalogItems.map((item) => (
                      <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{item.item_name}</div>
                          <div className="text-xs text-zinc-500">{item.item_code} · {item.unit}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{item.supplier_name}</td>
                        {/* ── Unit Price (inline editable) ── */}
                        <td
                          className="px-4 py-3 text-right tabular-nums text-xs cursor-pointer group"
                          onClick={() => {
                            if (inlineEdit?.id === item.id && inlineEdit.field === "unit_price") return;
                            setInlineEdit({ id: item.id, field: "unit_price", value: item.unit_price?.toString() ?? "" });
                          }}
                        >
                          {inlineEdit?.id === item.id && inlineEdit.field === "unit_price" ? (
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <span className="text-zinc-500">₱</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-24 rounded border border-violet-500/50 bg-slate-800 px-2 py-0.5 text-right text-xs text-white outline-none focus:border-violet-400"
                                value={inlineEdit.value}
                                autoFocus
                                onChange={e => setInlineEdit(prev => prev?.field === "unit_price" ? { ...prev, value: e.target.value } : prev)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                                  if (e.key === "Escape") { skipInlineSaveRef.current = true; e.currentTarget.blur(); setInlineEdit(null); }
                                }}
                                onBlur={() => { if (inlineEdit) saveInlineEdit(inlineEdit); }}
                                disabled={inlineSaving}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {item.unit_price != null
                                ? <span className="text-amber-300 font-medium">₱{Number(item.unit_price).toFixed(2)}</span>
                                : <span className="text-zinc-600 group-hover:text-zinc-400 italic">click to add</span>}
                              <Pencil className="h-2.5 w-2.5 text-zinc-600 opacity-0 group-hover:opacity-100 ml-0.5 shrink-0" />
                            </div>
                          )}
                        </td>
                        {/* ── Par levels (inline editable) ── */}
                        <td
                          className="px-4 py-3 text-xs tabular-nums text-zinc-300 cursor-pointer group"
                          onClick={() => {
                            if (inlineEdit?.id === item.id && inlineEdit.field === "par") return;
                            setInlineEdit({
                              id: item.id, field: "par",
                              wkday: item.par_level_weekday?.toString() ?? "",
                              wkend: item.par_level_weekend?.toString() ?? "",
                              def: item.par_level.toString(),
                            });
                          }}
                        >
                          {inlineEdit?.id === item.id && inlineEdit.field === "par" ? (
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="number" min="0" step="0.01" placeholder="wkday"
                                title="Weekday par"
                                className="w-14 rounded border border-violet-500/50 bg-slate-800 px-1 py-0.5 text-xs text-center text-white outline-none focus:border-violet-400"
                                value={inlineEdit.wkday}
                                autoFocus
                                onChange={e => setInlineEdit(prev => prev?.field === "par" ? { ...prev, wkday: e.target.value } : prev)}
                                onKeyDown={e => { if (e.key === "Escape") setInlineEdit(null); }}
                                disabled={inlineSaving}
                              />
                              <span className="text-zinc-600">/</span>
                              <input
                                type="number" min="0" step="0.01" placeholder="wkend"
                                title="Weekend par"
                                className="w-14 rounded border border-violet-500/50 bg-slate-800 px-1 py-0.5 text-xs text-center text-white outline-none focus:border-violet-400"
                                value={inlineEdit.wkend}
                                onChange={e => setInlineEdit(prev => prev?.field === "par" ? { ...prev, wkend: e.target.value } : prev)}
                                onKeyDown={e => { if (e.key === "Escape") setInlineEdit(null); }}
                                disabled={inlineSaving}
                              />
                              <span className="text-zinc-600">/</span>
                              <input
                                type="number" min="0" step="0.01" placeholder="default"
                                title="Default par"
                                className="w-14 rounded border border-violet-500/50 bg-slate-800 px-1 py-0.5 text-xs text-center text-white outline-none focus:border-violet-400"
                                value={inlineEdit.def}
                                onChange={e => setInlineEdit(prev => prev?.field === "par" ? { ...prev, def: e.target.value } : prev)}
                                onKeyDown={e => { if (e.key === "Escape") setInlineEdit(null); }}
                                disabled={inlineSaving}
                              />
                              <button
                                onClick={() => saveInlineEdit(inlineEdit)}
                                disabled={inlineSaving}
                                className="rounded bg-violet-600 px-2 py-0.5 text-xs text-white hover:bg-violet-500 disabled:opacity-50"
                              >{inlineSaving ? "…" : "✓"}</button>
                              <button
                                onClick={() => setInlineEdit(null)}
                                className="text-xs text-zinc-500 hover:text-white px-1"
                              >✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>{item.par_level_weekday != null ? item.par_level_weekday : "—"} / {item.par_level_weekend != null ? item.par_level_weekend : "—"} / {item.par_level}</span>
                              <Pencil className="h-2.5 w-2.5 text-zinc-600 opacity-0 group-hover:opacity-100 ml-0.5 shrink-0" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingCatalogId === item.id ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                className={SELECT_CLASS + " min-w-[200px] text-xs"}
                                value={catalogLinkCode}
                                onChange={(e) => setCatalogLinkCode(e.target.value)}
                                autoFocus
                              >
                                <option value="">(none — use par only)</option>
                                {dailyInvItems.filter(d => d.source_type === "supplier").length > 0 && (
                                  <optgroup label="── Supplier Items ──">
                                    {dailyInvItems.filter(d => d.source_type === "supplier").map((d) => (
                                      <option key={d.item_code} value={d.item_code}>
                                        {d.item_code} — {d.item_name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {dailyInvItems.filter(d => d.source_type === "ck").length > 0 && (
                                  <optgroup label="── CK Items ──">
                                    {dailyInvItems.filter(d => d.source_type === "ck").map((d) => (
                                      <option key={d.item_code} value={d.item_code}>
                                        {d.item_code} — {d.item_name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              <button
                                onClick={() => saveCatalogLink(item)}
                                disabled={catalogSaving}
                                className={PRIMARY_BUTTON + " text-xs px-3 py-1"}
                              >
                                {catalogSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingCatalogId(null)}
                                className={SECONDARY_BUTTON + " text-xs px-3 py-1"}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className={item.daily_inv_item_code ? "text-emerald-400 text-xs font-mono" : "text-zinc-600 text-xs italic"}>
                              {item.daily_inv_item_code ?? "not linked"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingCatalogId !== item.id && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingCatalogId(item.id);
                                  setCatalogLinkCode(item.daily_inv_item_code ?? "");
                                }}
                                className={SECONDARY_BUTTON + " flex items-center gap-1.5 text-xs px-3 py-1"}
                              >
                                <Pencil className="h-3 w-3" /> Link
                              </button>
                              {deleteConfirmCatalog === item.id ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-red-400">Delete?</span>
                                  <button
                                    onClick={() => deleteCatalogItem(item.id)}
                                    className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmCatalog(null)}
                                    className={SECONDARY_BUTTON + " text-xs px-2 py-1"}
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmCatalog(item.id)}
                                  className="text-xs px-2 py-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── SUPPLIER EMAILS TAB ────────────────────────────────────── */}
        {tab === "suppliers" && (
          <>
            <p className="text-sm text-zinc-400">
              Configure email addresses for each supplier. When an order is marked as <strong className="text-amber-300">Sent</strong>, a purchase order email is automatically sent to the supplier.
            </p>
            {suppliersLoading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : suppliers.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No suppliers in catalog for {STORE_LABELS[store]}.</div>
            ) : (
              <div className={GLASS_CARD + " overflow-x-auto"}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Supplier</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">To Email</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">CC (comma-separated)</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Updated</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((row) => (
                      <tr key={row.supplier_name} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-3 font-semibold text-white">{row.supplier_name}</td>
                        {editingEmail === row.supplier_name ? (
                          <>
                            <td className="px-4 py-2">
                              <input
                                type="email"
                                className={INPUT_CLASS + " w-full min-w-[180px]"}
                                value={emailDraft.email}
                                onChange={(e) => setEmailDraft((d) => ({ ...d, email: e.target.value }))}
                                placeholder="supplier@example.com"
                                autoFocus
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                className={INPUT_CLASS + " w-full min-w-[180px]"}
                                value={emailDraft.cc_emails}
                                onChange={(e) => setEmailDraft((d) => ({ ...d, cc_emails: e.target.value }))}
                                placeholder="cc1@example.com, cc2@example.com"
                              />
                            </td>
                            <td className="px-4 py-2 text-zinc-500 text-xs">—</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveSupplierEmail(row.supplier_name)}
                                  disabled={emailSaving}
                                  className={PRIMARY_BUTTON + " text-xs px-3 py-1"}
                                >
                                  {emailSaving ? "Saving…" : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingEmail(null)}
                                  className={SECONDARY_BUTTON + " text-xs px-3 py-1"}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              {row.email ? (
                                <span className="text-emerald-400 flex items-center gap-1.5">
                                  <Mail className="h-3.5 w-3.5" />{row.email}
                                </span>
                              ) : (
                                <span className="text-zinc-600 italic">not set</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-400 text-xs">{row.cc_emails || "—"}</td>
                            <td className="px-4 py-3 text-zinc-600 text-xs">{row.updated_at ? row.updated_at.slice(0, 10) : "—"}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => {
                                  setEditingEmail(row.supplier_name);
                                  setEmailDraft({ email: row.email, cc_emails: row.cc_emails });
                                }}
                                className={SECONDARY_BUTTON + " flex items-center gap-1.5 text-xs px-3 py-1"}
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── PERFORMANCE TAB ────────────────────────────────────────── */}
        {tab === "performance" && (
          <>
            {perfLoading ? (
              <div className="py-12 text-center text-zinc-500">Loading…</div>
            ) : perf.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No completed orders yet for performance data.</div>
            ) : (
              <div className={GLASS_CARD + " overflow-x-auto"}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Total Orders</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">On-Time</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Partial</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">Issues</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500">On-Time Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-3 font-semibold text-white">{row.supplier_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{row.total_orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{row.on_time_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-400">{row.partial_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-400">{row.issue_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <span className={
                            row.on_time_rate == null ? "text-zinc-500" :
                            row.on_time_rate >= 80 ? "text-emerald-400" :
                            row.on_time_rate >= 50 ? "text-amber-400" : "text-red-400"
                          }>
                            {onTimeRate(row)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-zinc-600">Last 90 days · {STORE_LABELS[store]}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Receive Confirmation Modal ──────────────────────────────────────── */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-emerald-400" /> Confirm Receipt
              </h2>
              <button onClick={() => setReceiveModal(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Invoice photo (required) */}
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" /> Invoice Photo <span className="text-red-400 ml-0.5">*</span>
                </label>
                {receiveModal.invoicePhotoUrl ? (
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-xs text-emerald-300 truncate">Photo uploaded</span>
                    <a href={receiveModal.invoicePhotoUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-zinc-400 hover:text-zinc-200">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      className="text-zinc-500 hover:text-zinc-300 text-xs"
                      onClick={() => setReceiveModal((m) => m ? { ...m, invoicePhotoUrl: "", invoicePhotoFile: null } : m)}
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <label className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/3 hover:bg-white/5 py-3 cursor-pointer transition-colors">
                    {receiveModal.invoicePhotoUploading ? (
                      <><RefreshCw className="h-4 w-4 text-zinc-400 animate-spin" /><span className="text-xs text-zinc-400">Uploading…</span></>
                    ) : (
                      <><Camera className="h-4 w-4 text-zinc-400" /><span className="text-xs text-zinc-400">Tap to upload invoice photo</span></>
                    )}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      disabled={receiveModal.invoicePhotoUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInvoicePhotoChange(f); }}
                    />
                  </label>
                )}
              </div>
              {/* Invoice number */}
              <div>
                <label className="text-xs text-zinc-400 font-medium">Invoice Number</label>
                <input
                  className={INPUT_CLASS + " mt-1 text-sm"}
                  placeholder="e.g. INV-2026-0814"
                  value={receiveModal.invoiceNumber}
                  onChange={(e) => setReceiveModal((m) => m ? { ...m, invoiceNumber: e.target.value } : m)}
                />
              </div>
              {/* Receive status */}
              <div className="flex gap-2">
                {(["received", "partial", "issue"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setReceiveModal((m) => m ? { ...m, receiveStatus: s } : m)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                      receiveModal.receiveStatus === s
                        ? s === "received" ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                          : s === "partial" ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                          : "border-red-500/50 bg-red-500/20 text-red-300"
                        : "border-white/10 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {/* Items */}
              <div className="space-y-2">
                {receiveModal.items.map((it, idx) => (
                  <div key={it.item_id} className="rounded-lg bg-white/3 border border-white/5 p-3">
                    <div className="text-xs font-medium text-white mb-2">{it.item_name}</div>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500">Qty Received ({it.unit})</label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          className={INPUT_CLASS + " mt-0.5 text-sm"}
                          value={it.qty_received}
                          onChange={(e) => setReceiveModal((m) => {
                            if (!m) return m;
                            const items = [...m.items];
                            items[idx] = { ...items[idx], qty_received: e.target.value };
                            return { ...m, items };
                          })}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500">Note (optional)</label>
                        <input
                          className={INPUT_CLASS + " mt-0.5 text-sm"}
                          placeholder="e.g. Short delivery"
                          value={it.receive_note}
                          onChange={(e) => setReceiveModal((m) => {
                            if (!m) return m;
                            const items = [...m.items];
                            items[idx] = { ...items[idx], receive_note: e.target.value };
                            return { ...m, items };
                          })}
                        />
                      </div>
                      <div className="text-xs text-zinc-500 mt-4">/ {it.qty_ordered}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-white/10">
              <button
                onClick={handleConfirmReceipt}
                disabled={receiveSaving || !receiveModal.invoicePhotoUrl || receiveModal.invoicePhotoUploading}
                className={PRIMARY_BUTTON + " flex items-center gap-2"}
                title={!receiveModal.invoicePhotoUrl ? "Upload invoice photo first" : undefined}
              >
                <PackageCheck className="h-4 w-4" />
                {receiveSaving ? "Saving…" : "Confirm Receipt"}
              </button>
              <button onClick={() => setReceiveModal(null)} className={SECONDARY_BUTTON}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
