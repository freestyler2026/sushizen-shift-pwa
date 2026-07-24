"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2, ChevronDown, ChevronRight, Loader2,
  Package, Plus, Send, Truck, X, Camera, AlertTriangle, Clock, RefreshCw, Trash2, TrendingUp,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders, getUploadHeaders, canAccessInventoryAdminNav } from "@/lib/auth";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
  T_CAPTION, T_PAGE_TITLE, T_SECTION,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type DeliveryStatus = "PENDING" | "DISPATCHED" | "CONFIRMED";

type Delivery = {
  id: number;
  plan_id: number | null;
  city: string;
  delivery_date: string;
  to_branch: string;
  status: DeliveryStatus;
  dispatched_by: string;
  dispatched_at: string | null;
  confirmed_by: string;
  confirmed_at: string | null;
  notes: string;
  branch_notes: string;
  created_by: string;
  proc_request_id: string | null;
  proc_request_no: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  received_count?: number;
  items?: DeliveryItem[];
};

type DeliveryItem = {
  id: number;
  delivery_id: number;
  plan_item_id: number | null;
  item_id: number | null;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  notes: string;
  received_qty: number | null;
  received_notes: string;
  production_date: string | null;
  expiry_date: string | null;
  label_photo_url: string;
  label_ok: boolean | null;
  label_issue: string;
  source: "auto" | "manual";
};

type QcPassedItem = {
  id: number;
  item_id: number | null;
  item_name: string;
  category: string;
  qc_actual_qty: number;   // total produced & QC-passed (includes today's stock)
  delivered_qty: number;   // already allocated to other deliveries
  unit: string;
  plan_item_id: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MANILA_BRANCHES = ["Paranaque", "Taft", "Cubao"];
const DUBAI_BRANCHES = ["AL BARSHA", "M CITY"];

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  PENDING: "inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-400",
  DISPATCHED: "inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/25 px-2 py-0.5 text-xs font-semibold text-blue-400",
  CONFIRMED: "inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-xs font-semibold text-emerald-400",
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: "Pending",
  DISPATCHED: "Dispatched",
  CONFIRMED: "Confirmed",
};

const AVAILABLE_UNITS = ["pc", "g", "kg", "ml", "L", "portion", "tray", "bag", "pack", "box", "unit", "set"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtQty(q: number) {
  return q % 1 === 0 ? String(q) : q.toFixed(1);
}

async function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers = { "Content-Type": "application/json", ...getAuthHeaders(auth) };
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers || {}) } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = txt;
    try { msg = JSON.parse(txt)?.detail || txt; } catch { /* */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

function isManager(auth: ReturnType<typeof getAuth>) {
  if (!auth) return false;
  const r = auth.role || "";
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(r) || canAccessInventoryAdminNav(auth);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CKDeliveryPage() {
  const auth = getAuth();
  const userName = auth?.staffName || "";
  const canManage = isManager(auth);
  // CK is a Manila operation, so managers default to Manila and can toggle.
  const [city, setCity] = useState<"manila" | "dubai">(
    canManage ? "manila" : ((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );
  const branches = city === "dubai" ? DUBAI_BRANCHES : MANILA_BRANCHES;

  // ── State ─────────────────────────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState<DeliveryStatus | "">("");
  const [filterBranch, setFilterBranch] = useState("");

  // New Delivery modal
  const [showNewDelivery, setShowNewDelivery] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [newBranch, setNewBranch] = useState(branches[0] || "");
  const [newNotes, setNewNotes] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [plans, setPlans] = useState<{ id: number; plan_date: string; status: string; item_count: number; done_count: number }[]>([]);

  // Add Items modal
  const [showAddItems, setShowAddItems] = useState(false);
  const [qcPassedItems, setQcPassedItems] = useState<QcPassedItem[]>([]);
  const [selectedQcItemIds, setSelectedQcItemIds] = useState<Set<number>>(new Set());
  const [qcItemQtys, setQcItemQtys] = useState<Record<number, string>>({});
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemCategory, setManualItemCategory] = useState("");
  const [manualItemQty, setManualItemQty] = useState("");
  const [manualItemUnit, setManualItemUnit] = useState("pc");
  const [addingItems, setAddingItems] = useState(false);

  // Dispatch confirm
  const [showDispatchConfirm, setShowDispatchConfirm] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Confirm Receipt modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receiptQtys, setReceiptQtys] = useState<Record<number, string>>({});
  const [receiptNotes, setReceiptNotes] = useState<Record<number, string>>({});
  // ② Label verification at receiving: "" (unset) | "ok" | "problem", + issue code.
  const [receiptLabelOk, setReceiptLabelOk] = useState<Record<number, "" | "ok" | "problem">>({});
  const [receiptLabelIssue, setReceiptLabelIssue] = useState<Record<number, string>>({});
  const [branchNotes, setBranchNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Collapsed categories in detail view
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Page tab ──────────────────────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<"deliveries" | "pending" | "cost-summary">("deliveries");

  // ── Pending for branch state ───────────────────────────────────────────────
  type PendingItem = { item_id: number; item_name: string; category: string; qty: number; unit: string; received_qty: number | null; notes: string };
  type PendingDelivery = { delivery_id: number; plan_id: number | null; status: string; dispatched_by: string; dispatched_at: string | null; confirmed_by: string; confirmed_at: string | null; notes: string; items: PendingItem[] };
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [pendingBranch, setPendingBranch] = useState("");
  const [pendingLoading, setPendingLoading] = useState(false);

  // ── Cost Summary tab state ─────────────────────────────────────────────────
  type CostRow = { id: number; delivery_date: string; to_branch: string; status: string; proc_request_no: string; created_by: string; total_cost: number; item_count: number };
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [costLoading, setCostLoading] = useState(false);
  const [costFromDate, setCostFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [costToDate, setCostToDate] = useState(todayIso());
  const [costBranch, setCostBranch] = useState("");
  const [costStatus, setCostStatus] = useState("");

  const loadCostSummary = useCallback(async () => {
    setCostLoading(true);
    try {
      const params = new URLSearchParams({ city, from_date: costFromDate, to_date: costToDate });
      if (costBranch) params.set("branch", costBranch);
      if (costStatus) params.set("status", costStatus);
      const data = await apiFetch(`/api/store/ck-delivery/cost-summary?${params}`);
      setCostRows((data as { rows?: CostRow[] }).rows || []);
    } catch { /* ignore */ }
    finally { setCostLoading(false); }
  }, [city, costFromDate, costToDate, costBranch, costStatus]);

  const costGrandTotal = useMemo(() => costRows.reduce((s, r) => s + r.total_cost, 0), [costRows]);
  const costByBranch = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of costRows) map[r.to_branch] = (map[r.to_branch] || 0) + r.total_cost;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [costRows]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const detailRef = useRef<HTMLDivElement>(null);

  // On mobile (single-column), auto-scroll to detail panel when a delivery is selected.
  // Depend only on the ID so that data updates (label saves, qty changes) don't re-trigger scroll.
  useEffect(() => {
    if (activeDelivery && detailRef.current && window.innerWidth < 768) {
      detailRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeDelivery?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Data Loading ───────────────────────────────────────────────────────────
  const loadDeliveries = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ city, limit: "40" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterBranch) params.set("branch", filterBranch);
      const data = await apiFetch(`/api/store/ck-delivery/deliveries?${params}`);
      setDeliveries(data.deliveries || []);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLoadingList(false);
    }
  }, [city, filterStatus, filterBranch]);

  const loadDeliveryDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/api/store/ck-delivery/deliveries/${id}`);
      setActiveDelivery(data.delivery);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  // Load production plans for the city so deliveries can be linked via a dropdown
  // (instead of typing an internal plan ID). This is what feeds QC-passed items.
  const loadPlans = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans?city=${encodeURIComponent(city)}&limit=30`);
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch { /* non-critical */ }
  }, [city]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // Reset the new-delivery branch when the city toggles (branch lists differ).
  useEffect(() => { setNewBranch(branches[0] || ""); setActiveDelivery(null); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending for branch ────────────────────────────────────────────────────
  const loadPending = useCallback(async (branchOverride?: string) => {
    const b = branchOverride ?? pendingBranch;
    if (!b.trim()) return;
    setPendingLoading(true);
    try {
      const res = await fetch(
        `/api/store/ck-delivery/pending-for-branch?city=${encodeURIComponent(city)}&branch=${encodeURIComponent(b)}`,
        { headers: getAuthHeaders() },
      );
      const data = await res.json();
      if (data.ok) setPendingDeliveries(data.deliveries || []);
    } catch {
      // ignore
    } finally {
      setPendingLoading(false);
    }
  }, [city, pendingBranch]);

  useEffect(() => {
    if (pageTab === "pending" && pendingBranch) loadPending();
  }, [pageTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create Delivery ────────────────────────────────────────────────────────
  async function handleCreateDelivery() {
    if (!newDate || !newBranch) return;
    setCreatingDelivery(true);
    try {
      const data = await apiFetch("/api/store/ck-delivery/deliveries", {
        method: "POST",
        body: JSON.stringify({
          plan_id: parseInt(newPlanId) || 0,
          city,
          delivery_date: newDate,
          to_branch: newBranch,
          created_by: userName,
          notes: newNotes.trim(),
        }),
      });
      setShowNewDelivery(false);
      setNewNotes("");
      setNewPlanId("");
      setNewDate(todayIso());
      await loadDeliveries();
      if (data.delivery?.id) {
        await loadDeliveryDetail(data.delivery.id);
      }
      showToast("Delivery record created");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setCreatingDelivery(false);
    }
  }

  // ── Load QC-passed items from all plans matching the delivery date ────────
  async function openAddItems() {
    setSelectedQcItemIds(new Set());
    setManualItemName("");
    setManualItemCategory("");
    setManualItemQty("");
    setManualItemUnit("pc");
    setQcPassedItems([]);
    setQcItemQtys({});

    const deliveryDate = activeDelivery?.delivery_date;
    const matchingPlans = plans.filter(p => p.plan_date === deliveryDate);
    // Fall back to the linked plan if no date-matched plans found
    const planIdsToLoad = matchingPlans.length > 0
      ? matchingPlans.map(p => p.id)
      : activeDelivery?.plan_id ? [activeDelivery.plan_id] : [];

    if (planIdsToLoad.length > 0) {
      try {
        const results = await Promise.all(
          planIdsToLoad.map(id => apiFetch(`/api/store/ck-production-plan/plans/${id}`))
        );
        const seen = new Set<number>();
        const allItems: QcPassedItem[] = [];
        for (const data of results) {
          const items: QcPassedItem[] = (data.plan?.items || [])
            .filter((i: { qc_result: string | null }) => i.qc_result === "PASS")
            .map((i: { id: number; item_name: string; category: string; qc_actual_qty: number; delivered_qty: number; unit: string }) => ({
              id: i.id,
              item_name: i.item_name,
              category: i.category,
              qc_actual_qty: i.qc_actual_qty || 0,
              delivered_qty: i.delivered_qty || 0,
              unit: i.unit,
              plan_item_id: i.id,
            }));
          for (const item of items) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              allItems.push(item);
            }
          }
        }
        setQcPassedItems(allItems);
        const defaults: Record<number, string> = {};
        for (const it of allItems) {
          const remaining = Math.max(0, it.qc_actual_qty - it.delivered_qty);
          defaults[it.id] = remaining > 0 ? String(remaining) : "";
        }
        setQcItemQtys(defaults);
      } catch { /* non-critical */ }
    }
    setShowAddItems(true);
  }

  async function handleAddItems() {
    if (!activeDelivery) return;
    const items: {
      plan_item_id: number; item_id: number; item_name: string;
      category: string; qty: number; unit: string; notes: string;
    }[] = [];

    // QC-passed items from plan — use the per-branch quantity entered. We show
    // "made / left" as guidance and warn when it exceeds what's left, but do NOT
    // hard-cap: stores may deliver from existing stock beyond the QC-produced amount.
    for (const item of qcPassedItems) {
      if (selectedQcItemIds.has(item.id)) {
        const qty = parseFloat(qcItemQtys[item.id] || "0") || 0;
        if (qty <= 0) continue;
        items.push({
          plan_item_id: item.plan_item_id,
          item_id: item.item_id || 0,
          item_name: item.item_name,
          category: item.category,
          qty,
          unit: item.unit,
          notes: "",
        });
      }
    }
    // Manual item
    if (manualItemName.trim()) {
      items.push({
        plan_item_id: 0,
        item_id: 0,
        item_name: manualItemName.trim(),
        category: manualItemCategory.trim(),
        qty: parseFloat(manualItemQty) || 0,
        unit: manualItemUnit,
        notes: "",
      });
    }
    if (items.length === 0) return;
    setAddingItems(true);
    try {
      await apiFetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      await loadDeliveryDetail(activeDelivery.id);
      setDeliveries(ds => ds.map(d => d.id === activeDelivery.id ? { ...d, item_count: (d.item_count || 0) + items.length } : d));
      setShowAddItems(false);
      showToast(`${items.length} item(s) added to delivery`);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setAddingItems(false);
    }
  }

  // ── Production-date labels (required before dispatch) ───────────────────────
  const [labelBusy, setLabelBusy] = useState<number | null>(null);

  async function saveItemLabel(itemId: number, productionDate: string, expiryDate: string) {
    if (!activeDelivery) return;
    try {
      await apiFetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/items/${itemId}/label`, {
        method: "PATCH",
        body: JSON.stringify({ production_date: productionDate, expiry_date: expiryDate }),
      });
      setActiveDelivery(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(it => it.id === itemId
          ? { ...it, production_date: productionDate || null, expiry_date: expiryDate || null } : it),
      } : null);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    }
  }

  async function uploadLabelPhoto(itemId: number, fileObj: File) {
    if (!activeDelivery) return;
    setLabelBusy(itemId);
    try {
      const fd = new FormData();
      fd.append("branch", activeDelivery.to_branch || "");
      fd.append("delivery_date", activeDelivery.delivery_date || "");
      fd.append("file", fileObj);
      const res = await fetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/items/${itemId}/label-photo`, {
        method: "POST", headers: getUploadHeaders(getAuth()), body: fd, cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Upload failed");
      setActiveDelivery(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(it => it.id === itemId ? { ...it, label_photo_url: data.photo_url } : it),
      } : null);
      showToast("Label photo saved");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLabelBusy(null);
    }
  }

  // ── Delete Item ────────────────────────────────────────────────────────────
  async function handleDeleteItem(itemId: number) {
    if (!activeDelivery) return;
    if (!confirm("Delete this item from the delivery?")) return;
    try {
      await apiFetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/items/${itemId}`, { method: "DELETE" });
      setActiveDelivery(prev => prev ? {
        ...prev,
        items: (prev.items || []).filter(i => i.id !== itemId),
      } : null);
      setDeliveries(ds => ds.map(d => d.id === activeDelivery.id
        ? { ...d, item_count: Math.max(0, (d.item_count || 1) - 1) }
        : d));
      showToast("Item deleted");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    }
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  async function handleDispatch() {
    if (!activeDelivery) return;
    setDispatching(true);
    try {
      const data = await apiFetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ dispatched_by: userName }),
      });
      setActiveDelivery(prev => prev ? { ...prev, ...data.delivery, items: prev.items } : null);
      setDeliveries(ds => ds.map(d => d.id === data.delivery.id ? { ...d, status: "DISPATCHED" } : d));
      setShowDispatchConfirm(false);
      showToast("Delivery dispatched — branch can now confirm receipt");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setDispatching(false);
    }
  }

  // ── Confirm Receipt ────────────────────────────────────────────────────────
  function openConfirmModal() {
    const items = activeDelivery?.items || [];
    const qtys: Record<number, string> = {};
    const notes: Record<number, string> = {};
    const labelOk: Record<number, "" | "ok" | "problem"> = {};
    const labelIssue: Record<number, string> = {};
    for (const item of items) {
      qtys[item.id] = item.qty > 0 ? String(item.qty) : "";
      notes[item.id] = "";
      labelOk[item.id] = "";
      labelIssue[item.id] = "";
    }
    setReceiptQtys(qtys);
    setReceiptNotes(notes);
    setReceiptLabelOk(labelOk);
    setReceiptLabelIssue(labelIssue);
    setBranchNotes("");
    setShowConfirmModal(true);
  }

  async function handleConfirmReceipt() {
    if (!activeDelivery) return;
    const items = activeDelivery.items || [];
    const item_receipts = items.map(i => {
      const lo = receiptLabelOk[i.id];
      return {
        item_id: i.id,
        received_qty: parseFloat(receiptQtys[i.id] || "0") || 0,
        received_notes: receiptNotes[i.id] || "",
        label_ok: lo === "ok" ? true : lo === "problem" ? false : null,
        label_issue: lo === "problem" ? (receiptLabelIssue[i.id] || "OTHER") : "",
      };
    });
    const flaggedCount = items.filter(i => receiptLabelOk[i.id] === "problem").length;
    setConfirming(true);
    try {
      const data = await apiFetch(`/api/store/ck-delivery/deliveries/${activeDelivery.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          confirmed_by: userName,
          branch_notes: branchNotes.trim(),
          item_receipts,
        }),
      });
      setActiveDelivery(data.delivery);
      setDeliveries(ds => ds.map(d => d.id === data.delivery.id ? { ...d, status: "CONFIRMED", received_count: items.length } : d));
      setShowConfirmModal(false);
      showToast(flaggedCount > 0
        ? `Receipt confirmed. ${flaggedCount} item(s) flagged — an incident was raised for HQ & CK.`
        : "Receipt confirmed. Thank you!");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setConfirming(false);
    }
  }

  // ── Grouped Items ──────────────────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const items = activeDelivery?.items || [];
    const map: Record<string, DeliveryItem[]> = {};
    for (const item of items) {
      const cat = item.category || "Uncategorized";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [activeDelivery?.items]);

  const deliveryStats = useMemo(() => {
    if (!activeDelivery) return { total: 0, received: 0 };
    const items = activeDelivery.items || [];
    return {
      total: items.length,
      received: items.filter(i => i.received_qty !== null).length,
    };
  }, [activeDelivery]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/25">
            <Truck className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>CK Delivery</h1>
            <p className={T_CAPTION}>{city === "dubai" ? "Dubai" : "Manila"} · Branch delivery tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
              {(["manila", "dubai"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                    city === c ? "bg-blue-500/20 text-blue-200" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {canManage && (
            <button className={PRIMARY_BUTTON} onClick={() => setShowNewDelivery(true)}>
              <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Delivery</span>
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${toast.ok ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Page tabs */}
      <div className={TAB_CONTAINER}>
        <button className={pageTab === "deliveries" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setPageTab("deliveries")}>
          <Truck className="h-3.5 w-3.5 inline mr-1.5" />CK Delivery
        </button>
        <button className={pageTab === "pending" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setPageTab("pending")}>
          <Clock className="h-3.5 w-3.5 inline mr-1.5" />Pending for My Branch
        </button>
        {canManage && (
          <button className={pageTab === "cost-summary" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => { setPageTab("cost-summary"); void loadCostSummary(); }}>
            <TrendingUp className="h-3.5 w-3.5 inline mr-1.5" />Cost Summary
          </button>
        )}
      </div>

      {/* ── Pending for Branch view ── */}
      {pageTab === "pending" && (
        <div className="space-y-4">
          <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-3`}>
            <SelectDark
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
              value={pendingBranch}
              onChange={v => { setPendingBranch(v); loadPending(v); }}
              options={[
                { value: "", label: "Select branch" },
                ...(city === "dubai" ? DUBAI_BRANCHES : MANILA_BRANCHES).map((b) => ({ value: b, label: b })),
              ]}
            />
            <button className={SECONDARY_BUTTON} onClick={() => loadPending()} disabled={pendingLoading || !pendingBranch}>
              <RefreshCw className={`h-4 w-4 ${pendingLoading ? "animate-spin" : ""}`} />
            </button>
            <span className={T_CAPTION}>Today&apos;s deliveries for your branch</span>
          </div>

          {pendingLoading && <p className="text-sm text-zinc-400">Loading…</p>}

          {!pendingLoading && pendingDeliveries.length === 0 && pendingBranch && (
            <div className={`${GLASS_CARD} p-6 text-center`}>
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">No CK deliveries scheduled for today.</p>
            </div>
          )}

          {!pendingLoading && !pendingBranch && (
            <div className={`${GLASS_CARD} p-6 text-center`}>
              <p className="text-sm text-zinc-400">Select your branch to see today&apos;s delivery status.</p>
            </div>
          )}

          {pendingDeliveries.map((d) => {
            const totalItems = d.items.length;
            const receivedItems = d.items.filter((i) => i.received_qty != null).length;
            const allReceived = totalItems > 0 && receivedItems === totalItems;
            const statusColors: Record<string, string> = {
              PENDING: "border-zinc-500/30 bg-zinc-500/5",
              DISPATCHED: "border-amber-500/30 bg-amber-500/5",
              CONFIRMED: "border-emerald-500/30 bg-emerald-500/5",
            };
            return (
              <div key={d.delivery_id} className={`rounded-xl border p-4 space-y-3 ${statusColors[d.status] || "border-white/10 bg-white/4"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.status === "CONFIRMED" || allReceived
                      ? <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" />Received</span>
                      : d.status === "DISPATCHED"
                      ? <span className={BADGE_WARNING}><Truck className="h-3 w-3" />In Transit</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400"><Clock className="h-3 w-3" />Not Dispatched</span>
                    }
                    {d.dispatched_by && <span className="text-xs text-zinc-500">by {d.dispatched_by}</span>}
                  </div>
                  <span className="text-xs text-zinc-500">{receivedItems}/{totalItems} items received</span>
                </div>

                {/* Progress bar */}
                {totalItems > 0 && (
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${allReceived ? "bg-emerald-500" : d.status === "DISPATCHED" ? "bg-amber-500" : "bg-zinc-600"}`}
                      style={{ width: `${Math.round(receivedItems / totalItems * 100)}%` }}
                    />
                  </div>
                )}

                {/* Item list */}
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left text-zinc-500 pb-1 font-semibold uppercase tracking-wide">Item</th>
                      <th className="text-right text-zinc-500 pb-1 font-semibold uppercase tracking-wide">Ordered</th>
                      <th className="text-right text-zinc-500 pb-1 font-semibold uppercase tracking-wide">Received</th>
                      <th className="text-right text-zinc-500 pb-1 font-semibold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((item) => {
                      const rec = item.received_qty;
                      const short = rec != null && rec < item.qty;
                      return (
                        <tr key={item.item_id} className="border-t border-white/5">
                          <td className="py-1.5 text-zinc-200">{item.item_name}</td>
                          <td className="py-1.5 text-right text-zinc-400">{item.qty} {item.unit}</td>
                          <td className={`py-1.5 text-right ${rec != null ? (short ? "text-amber-400" : "text-emerald-400") : "text-zinc-600"}`}>
                            {rec != null ? `${rec} ${item.unit}` : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {rec == null && d.status === "DISPATCHED" && <span className="text-amber-400">Awaiting</span>}
                            {rec == null && d.status === "PENDING" && <span className="text-zinc-500">Not sent</span>}
                            {rec != null && short && <span className="text-amber-400">Short</span>}
                            {rec != null && !short && <span className="text-emerald-400">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {d.status === "PENDING" && (
                  <p className="text-xs text-zinc-500">CK has not dispatched this delivery yet. Contact CK if urgent.</p>
                )}
                {d.status === "DISPATCHED" && d.dispatched_at && (
                  <p className="text-xs text-zinc-500">Dispatched at {d.dispatched_at.slice(0, 16)}. Confirm receipt on the CK Delivery tab.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cost Summary tab ── */}
      {pageTab === "cost-summary" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-3`}>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Period:</span>
            <input type="date" value={costFromDate} onChange={e => setCostFromDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50" />
            <span className="text-xs text-zinc-500">—</span>
            <input type="date" value={costToDate} onChange={e => setCostToDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50" />
            <SelectDark
              value={costBranch}
              onChange={setCostBranch}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
              options={[
                { value: "", label: "All Branches" },
                ...branches.map(b => ({ value: b, label: b })),
              ]}
            />
            <SelectDark
              value={costStatus}
              onChange={setCostStatus}
              className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
              options={[
                { value: "", label: "All Statuses" },
                { value: "CONFIRMED", label: "Confirmed" },
                { value: "DISPATCHED", label: "Dispatched" },
                { value: "PENDING", label: "Pending" },
              ]}
            />
            <button className={PRIMARY_BUTTON} onClick={() => void loadCostSummary()} disabled={costLoading}>
              {costLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Load
            </button>
          </div>

          {/* KPI row */}
          {costRows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Total Cost (PHP)</p>
                <p className={KPI_VALUE}>₱ {costGrandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Deliveries</p>
                <p className={KPI_VALUE}>{costRows.length}</p>
              </div>
              {costByBranch.slice(0, 2).map(([branch, total]) => (
                <div key={branch} className={KPI_CARD}>
                  <p className={KPI_LABEL}>{branch}</p>
                  <p className={KPI_VALUE}>₱ {total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className={GLASS_CARD}>
            {costLoading && <div className="p-6 text-center text-sm text-zinc-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</div>}
            {!costLoading && costRows.length === 0 && (
              <div className="p-6 text-center text-sm text-zinc-500">No deliveries found. Select a period and press Load.</div>
            )}
            {!costLoading && costRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8">
                      <th className={`${TABLE_HEADER} text-left`}>Date</th>
                      <th className={`${TABLE_HEADER} text-left`}>Branch</th>
                      <th className={`${TABLE_HEADER} text-left`}>Order #</th>
                      <th className={`${TABLE_HEADER} text-right`}>Items</th>
                      <th className={`${TABLE_HEADER} text-right`}>Total Cost (PHP)</th>
                      <th className={`${TABLE_HEADER} text-left`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costRows.map(row => (
                      <tr key={row.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}>{row.delivery_date}</td>
                        <td className={TABLE_CELL}>{row.to_branch}</td>
                        <td className={TABLE_CELL}>{row.proc_request_no || <span className="text-zinc-600">—</span>}</td>
                        <td className={`${TABLE_CELL} text-right tabular-nums`}>{row.item_count}</td>
                        <td className={`${TABLE_CELL} text-right tabular-nums font-medium ${row.total_cost > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                          {row.total_cost > 0
                            ? `₱ ${row.total_cost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td className={TABLE_CELL}>
                          <span className={STATUS_BADGE[row.status as "PENDING" | "DISPATCHED" | "CONFIRMED"] || ""}>
                            {STATUS_LABEL[row.status as "PENDING" | "DISPATCHED" | "CONFIRMED"] || row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Grand total row */}
                    <tr className="border-t-2 border-white/15">
                      <td className={`${TABLE_CELL} font-bold text-zinc-200`} colSpan={4}>Grand Total</td>
                      <td className={`${TABLE_CELL} text-right tabular-nums font-bold text-emerald-300`}>
                        ₱ {costGrandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={TABLE_CELL} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main CK Delivery view (existing) ── */}
      {pageTab === "deliveries" && <>

      {/* Filters */}
      <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-3`}>
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Filter:</span>
        {(["", "PENDING", "DISPATCHED", "CONFIRMED"] as const).map(s => (
          <button
            key={s}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${filterStatus === s ? "border border-violet-500/40 bg-violet-500/20 text-violet-300" : "border border-white/8 bg-white/4 text-zinc-400 hover:text-zinc-200"}`}
            onClick={() => { setFilterStatus(s); }}
          >
            {s === "" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
        <SelectDark
          className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
          value={filterBranch}
          onChange={setFilterBranch}
          options={[
            { value: "", label: "All Branches" },
            ...branches.map(b => ({ value: b, label: b })),
          ]}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
        {/* Left: Deliveries list */}
        <div className={`${GLASS_CARD} p-4 self-start sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto`}>
          <div className="mb-3 flex items-center justify-between">
            <span className={T_SECTION + " text-base"}>Deliveries</span>
            {loadingList && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>

          {deliveries.length === 0 && !loadingList && (
            <p className={T_CAPTION + " py-4 text-center"}>
              {canManage ? "No deliveries yet. Create one." : "No deliveries yet."}
            </p>
          )}

          <div className="space-y-2">
            {deliveries.map(d => {
              const isActive = activeDelivery?.id === d.id;
              const progress = d.item_count ? Math.round(((d.received_count || 0) / d.item_count) * 100) : 0;
              return (
                <button
                  key={d.id}
                  onClick={() => loadDeliveryDetail(d.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-150 ${
                    isActive
                      ? "border-blue-500/40 bg-blue-500/15"
                      : "border-white/8 bg-white/4 hover:border-blue-500/20 hover:bg-blue-500/8"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{fmtDate(d.delivery_date)}</p>
                      <p className="text-xs text-blue-300 font-medium">{d.to_branch}</p>
                    </div>
                    <span className={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</span>
                  </div>
                  <p className={T_CAPTION + " mt-1"}>
                    {d.item_count || 0} items
                    {d.status === "CONFIRMED" && d.received_count ? ` · ${d.received_count} received` : ""}
                    {d.proc_request_no ? ` · ${d.proc_request_no}` : ""}
                  </p>
                  {d.status === "CONFIRMED" && (d.item_count || 0) > 0 && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {d.created_by && <p className={T_CAPTION + " mt-1 truncate"}>by {d.created_by}</p>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Delivery detail */}
        <div ref={detailRef}>
          {loadingDetail ? (
            <div className={`${GLASS_CARD} flex items-center justify-center p-12`}>
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : !activeDelivery ? (
            <div className={`${GLASS_CARD} flex flex-col items-center justify-center p-12 text-center`}>
              <Package className="h-12 w-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400">Select a delivery from the left, or create a new one.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Delivery header */}
              <div className={`${GLASS_CARD} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={T_SECTION}>
                        <Truck className="inline h-4 w-4 mr-1 text-blue-400" />
                        {fmtDate(activeDelivery.delivery_date)} → {activeDelivery.to_branch}
                      </h2>
                      <span className={STATUS_BADGE[activeDelivery.status]}>{STATUS_LABEL[activeDelivery.status]}</span>
                    </div>
                    <p className={T_CAPTION + " mt-1"}>Created by {activeDelivery.created_by || "—"}</p>
                    {activeDelivery.proc_request_no && (
                      <p className={T_CAPTION + " mt-0.5"}>
                        From order: <span className="text-amber-400 font-medium">{activeDelivery.proc_request_no}</span>
                      </p>
                    )}
                    {activeDelivery.notes && (
                      <p className="mt-1 text-sm text-zinc-300">{activeDelivery.notes}</p>
                    )}
                    {activeDelivery.dispatched_by && (
                      <p className={T_CAPTION + " mt-1 text-blue-400"}>
                        Dispatched by {activeDelivery.dispatched_by}
                        {activeDelivery.dispatched_at ? ` · ${activeDelivery.dispatched_at.slice(0, 16).replace("T", " ")}` : ""}
                      </p>
                    )}
                    {activeDelivery.confirmed_by && (
                      <p className={T_CAPTION + " mt-1 text-emerald-400"}>
                        ✓ Confirmed by {activeDelivery.confirmed_by}
                        {activeDelivery.confirmed_at ? ` · ${activeDelivery.confirmed_at.slice(0, 16).replace("T", " ")}` : ""}
                      </p>
                    )}
                    {activeDelivery.branch_notes && (
                      <p className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-sm text-emerald-300">
                        Branch note: {activeDelivery.branch_notes}
                      </p>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {(activeDelivery.status === "PENDING" || activeDelivery.status === "DISPATCHED") && (
                      <a
                        href={`/store/ck-delivery/${activeDelivery.id}/note`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-zinc-600/40 bg-zinc-700/30 px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700/50"
                      >
                        <span className="flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          Delivery Note
                        </span>
                      </a>
                    )}
                    {canManage && activeDelivery.status === "PENDING" && (
                      <>
                        <button className={SMALL_BUTTON} onClick={openAddItems}>
                          <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Items</span>
                        </button>
                        {(activeDelivery.items || []).length > 0 && (
                          <button
                            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm font-semibold text-blue-400 hover:bg-blue-500/20"
                            onClick={() => setShowDispatchConfirm(true)}
                          >
                            <span className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Dispatch</span>
                          </button>
                        )}
                      </>
                    )}
                    {activeDelivery.status === "DISPATCHED" && (
                      <button
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20"
                        onClick={openConfirmModal}
                      >
                        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm Receipt</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI bar */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Items", value: deliveryStats.total, cls: "text-white" },
                    { label: "Received", value: deliveryStats.received, cls: "text-emerald-400" },
                    { label: "Branch", value: activeDelivery.to_branch, cls: "text-blue-400" },
                  ].map(k => (
                    <div key={k.label} className={KPI_CARD}>
                      <p className={KPI_LABEL}>{k.label}</p>
                      <p className={`${KPI_VALUE} text-xl ${k.cls}`}>{k.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Production-date labels — required before dispatch */}
              {canManage && activeDelivery.status === "PENDING" && (activeDelivery.items || []).length > 0 && (
                <div className={`${GLASS_CARD} p-4`}>
                  <div className="mb-1 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">Production-date labels</h3>
                  </div>
                  <p className={`${T_CAPTION} mb-3`}>Required for every item before dispatch: production date, expiry / best-before date, and a photo of the label.</p>
                  <div className="space-y-2">
                    {(activeDelivery.items || []).map(item => {
                      const complete = !!item.production_date && !!item.expiry_date && !!item.label_photo_url;
                      return (
                        <div key={item.id} className={`rounded-xl border p-3 ${complete ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">{item.item_name}</span>
                            {complete
                              ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
                              : <span className="text-xs text-amber-400">Incomplete</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={`${T_CAPTION} mb-0.5 block`}>Production date</label>
                              <input type="date" className={`${INPUT_CLASS} w-full`}
                                value={item.production_date || todayIso()}
                                min={daysAgoIso(14)}
                                onChange={e => void saveItemLabel(item.id, e.target.value, item.expiry_date || "")} />
                            </div>
                            <div>
                              <label className={`${T_CAPTION} mb-0.5 block`}>Expiry / best-before</label>
                              <input type="date" className={`${INPUT_CLASS} w-full`}
                                value={item.expiry_date || todayIso()}
                                min={todayIso()}
                                onChange={e => void saveItemLabel(item.id, item.production_date || "", e.target.value)} />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            {item.label_photo_url ? (
                              <a href={item.label_photo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Label photo saved
                              </a>
                            ) : (
                              <label className={`${SMALL_BUTTON} inline-flex cursor-pointer items-center gap-1.5`}>
                                {labelBusy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                                Add label photo
                                <input type="file" accept="image/*" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadLabelPhoto(item.id, f); e.target.value = ""; }} />
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items table — grouped by category */}
              {(activeDelivery.items || []).length === 0 ? (
                <div className={`${GLASS_CARD} flex flex-col items-center justify-center p-8 text-center`}>
                  <Package className="h-10 w-10 text-zinc-600 mb-2" />
                  <p className="text-zinc-400 text-sm">No items added yet.</p>
                  {canManage && activeDelivery.status === "PENDING" && (
                    <button className={`${SMALL_BUTTON} mt-3`} onClick={openAddItems}>
                      <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Items</span>
                    </button>
                  )}
                </div>
              ) : (
                Object.entries(groupedItems).map(([category, items]) => {
                  const collapsed = collapsedCategories.has(category);
                  return (
                    <div key={category} className={GLASS_CARD}>
                      <button
                        className="flex w-full items-center justify-between p-4 text-left"
                        onClick={() => setCollapsedCategories(prev => {
                          const s = new Set(prev);
                          if (s.has(category)) { s.delete(category); } else { s.add(category); }
                          return s;
                        })}
                      >
                        <div className="flex items-center gap-2">
                          {collapsed ? <ChevronRight className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                          <span className="font-semibold text-white">{category}</span>
                          <span className={T_CAPTION}>({items.length})</span>
                        </div>
                        <span className={T_CAPTION}>
                          {items.filter(i => i.received_qty !== null).length}/{items.length} received
                        </span>
                      </button>

                      {!collapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr>
                                <th className={`${TABLE_HEADER} pl-4 text-left`}>Item</th>
                                <th className={`${TABLE_HEADER} px-3 text-right`}>Sent Qty</th>
                                <th className={`${TABLE_HEADER} px-3 text-right`}>Received</th>
                                <th className={`${TABLE_HEADER} pl-4 pr-4 text-left`}>Notes</th>
                                {canManage && activeDelivery.status === "PENDING" && (
                                  <th className={`${TABLE_HEADER} pr-3`} />
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map(item => (
                                <tr key={item.id} className={TABLE_ROW}>
                                  <td className={`${TABLE_CELL} pl-4`}>
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-medium text-white">{item.item_name}</p>
                                      {activeDelivery.proc_request_id && (
                                        item.source === "auto"
                                          ? <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">From Order</span>
                                          : <span className="inline-flex items-center rounded-full bg-zinc-700/60 border border-zinc-600/40 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">Manual</span>
                                      )}
                                    </div>
                                    {item.notes && <p className={T_CAPTION}>{item.notes}</p>}
                                  </td>
                                  <td className={`${TABLE_CELL} px-3 text-right font-mono text-zinc-300`}>
                                    {item.qty > 0 ? `${fmtQty(item.qty)} ${item.unit}` : <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className={`${TABLE_CELL} px-3 text-right font-mono`}>
                                    {item.received_qty !== null ? (
                                      <span className="text-emerald-400">
                                        ✓ {fmtQty(item.received_qty)} {item.unit}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-600">—</span>
                                    )}
                                  </td>
                                  <td className={`${TABLE_CELL} pl-4 pr-4 text-xs text-zinc-500`}>
                                    {item.received_notes || "—"}
                                  </td>
                                  {canManage && activeDelivery.status === "PENDING" && (
                                    <td className={`${TABLE_CELL} pr-3 text-right`}>
                                      <button
                                        onClick={() => void handleDeleteItem(item.id)}
                                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                                        aria-label="Delete item"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── New Delivery Modal ──────────────────────────────────────────────── */}
      {showNewDelivery && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-md p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={T_SECTION}>New Delivery</h3>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowNewDelivery(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Delivery Date</label>
                  <input
                    type="date"
                    className={INPUT_CLASS}
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">To Branch</label>
                  <SelectDark
                    className={SELECT_CLASS}
                    value={newBranch}
                    onChange={setNewBranch}
                    options={branches.map(b => ({ value: b, label: b }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Linked Production Plan <span className="text-zinc-600">(for QC-passed items)</span>
                </label>
                <SelectDark
                  className={INPUT_CLASS}
                  value={newPlanId}
                  onChange={setNewPlanId}
                  options={[
                    { value: "", label: "— No plan (manual items only) —" },
                    ...plans.map(p => ({
                      value: String(p.id),
                      label: `${fmtDate(p.plan_date)} · ${p.status} · ${p.done_count}/${p.item_count} done`,
                    })),
                  ]}
                />
                <p className={T_CAPTION + " mt-1"}>
                  {plans.length === 0
                    ? "No production plans found for this city. Create a plan first to auto-populate QC-passed items."
                    : "Pick the plan whose QC-passed items should be available to add."}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes (optional)</label>
                <textarea
                  className={TEXTAREA_CLASS}
                  rows={2}
                  placeholder="Any dispatch notes..."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowNewDelivery(false)}>Cancel</button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleCreateDelivery}
                disabled={!newDate || !newBranch || creatingDelivery}
              >
                {creatingDelivery
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating...</span>
                  : "Create Delivery"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add Items Modal ─────────────────────────────────────────────────── */}
      {showAddItems && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-lg p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={T_SECTION}>Add Items</h3>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowAddItems(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* QC-passed items from linked plan */}
              {qcPassedItems.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    QC-Passed Items from Plan
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-white/8 p-2">
                    {qcPassedItems.map(item => {
                      const selected = selectedQcItemIds.has(item.id);
                      const remaining = Math.max(0, item.qc_actual_qty - item.delivered_qty);
                      const entered = parseFloat(qcItemQtys[item.id] || "0") || 0;
                      const over = entered > remaining;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-lg px-3 py-2 text-sm transition-all ${
                            selected ? "border border-violet-500/40 bg-violet-500/15" : "border border-transparent bg-white/3"
                          }`}
                        >
                          <button
                            className="flex w-full items-center justify-between text-left"
                            onClick={() => setSelectedQcItemIds(prev => {
                              const s = new Set(prev);
                              if (s.has(item.id)) { s.delete(item.id); } else { s.add(item.id); }
                              return s;
                            })}
                          >
                            <div>
                              <span className="text-zinc-200">{item.item_name}</span>
                              <span className={T_CAPTION + " ml-2"}>{item.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-zinc-400">
                                made {fmtQty(item.qc_actual_qty)} · left {fmtQty(remaining)} {item.unit}
                              </span>
                              {selected && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />}
                            </div>
                          </button>
                          {selected && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-zinc-500">Deliver to {activeDelivery?.to_branch}:</span>
                              <input
                                type="number" min="0" step="0.1"
                                className={`${INPUT_CLASS} h-8 w-24 py-1 text-sm ${over ? "border-amber-500/50" : ""}`}
                                value={qcItemQtys[item.id] || ""}
                                onChange={e => setQcItemQtys(p => ({ ...p, [item.id]: e.target.value }))}
                              />
                              <span className="text-[11px] text-zinc-500">{item.unit}</span>
                              {over && (
                                <span className="text-[11px] text-amber-400">
                                  over made by {fmtQty(entered - remaining)} — from stock? (allowed)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className={T_CAPTION + " mt-1"}>{selectedQcItemIds.size} selected</p>
                </div>
              )}

              {/* Manual item */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {qcPassedItems.length > 0 ? "Or Add Manual Item" : "Add Item"}
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    placeholder="Item name"
                    value={manualItemName}
                    onChange={e => setManualItemName(e.target.value)}
                  />
                  {manualItemName && (
                    <>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        placeholder="Category (optional)"
                        value={manualItemCategory}
                        onChange={e => setManualItemCategory(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          className={INPUT_CLASS}
                          placeholder="Qty"
                          min="0"
                          step="0.1"
                          value={manualItemQty}
                          onChange={e => setManualItemQty(e.target.value)}
                        />
                        <SelectDark
                          className={SELECT_CLASS}
                          value={manualItemUnit}
                          onChange={setManualItemUnit}
                          options={AVAILABLE_UNITS.map(u => ({ value: u, label: u }))}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowAddItems(false)}>Cancel</button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleAddItems}
                disabled={selectedQcItemIds.size === 0 && !manualItemName.trim() || addingItems}
              >
                {addingItems
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Adding...</span>
                  : `Add ${selectedQcItemIds.size + (manualItemName.trim() ? 1 : 0)} Item(s)`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Dispatch Confirm Modal ──────────────────────────────────────────── */}
      {showDispatchConfirm && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-sm p-6`}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/25">
                <Truck className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className={T_SECTION}>Dispatch Delivery?</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Mark this delivery as dispatched to{" "}
              <span className="font-semibold text-white">{activeDelivery?.to_branch}</span>.
              The branch will be able to confirm receipt.
            </p>
            <div className="flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowDispatchConfirm(false)}>
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 font-semibold text-white transition-all hover:from-blue-400 hover:to-cyan-400 disabled:opacity-60"
                onClick={handleDispatch}
                disabled={dispatching}
              >
                {dispatching
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Dispatching...</span>
                  : "Yes, Dispatch"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Confirm Receipt Modal ───────────────────────────────────────────── */}
      {showConfirmModal && activeDelivery && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto`}>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className={T_SECTION}>Confirm Receipt</h3>
              </div>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowConfirmModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className={T_CAPTION + " mb-4"}>
              Enter the received quantity and check each item&apos;s label &amp; production date. Flagging a problem (spoiled, no label, expired) raises an incident for HQ &amp; CK.
            </p>

            <div className="space-y-3">
              {(activeDelivery.items || []).map(item => (
                <div key={item.id} className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.item_name}</p>
                      <p className={T_CAPTION}>Sent: {fmtQty(item.qty)} {item.unit}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className={`${INPUT_CLASS} text-sm py-2`}
                        placeholder="Received qty"
                        min="0"
                        step="0.1"
                        value={receiptQtys[item.id] || ""}
                        onChange={e => setReceiptQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />
                      <span className="text-xs text-zinc-500 whitespace-nowrap">{item.unit}</span>
                    </div>
                    <input
                      type="text"
                      className={`${INPUT_CLASS} text-sm py-2`}
                      placeholder="Notes (optional)"
                      value={receiptNotes[item.id] || ""}
                      onChange={e => setReceiptNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>

                  {/* ② Label & production-date verification */}
                  <div className="mt-2 border-t border-white/8 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400">
                        Label check
                        {item.production_date && <span className="ml-1 text-zinc-500">· prod {item.production_date}</span>}
                        {item.expiry_date && <span className="ml-1 text-zinc-500">· exp {item.expiry_date}</span>}
                      </span>
                      <div className="flex gap-1">
                        <button type="button"
                          onClick={() => setReceiptLabelOk(p => ({ ...p, [item.id]: "ok" }))}
                          className={`rounded px-2 py-1 text-[11px] font-medium ${receiptLabelOk[item.id] === "ok" ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:bg-white/5"}`}>
                          OK
                        </button>
                        <button type="button"
                          onClick={() => setReceiptLabelOk(p => ({ ...p, [item.id]: "problem" }))}
                          className={`rounded px-2 py-1 text-[11px] font-medium ${receiptLabelOk[item.id] === "problem" ? "bg-red-500/20 text-red-300" : "text-zinc-400 hover:bg-white/5"}`}>
                          Problem
                        </button>
                      </div>
                    </div>
                    {receiptLabelOk[item.id] === "problem" && (
                      <SelectDark
                        className={`${INPUT_CLASS} mt-2 text-sm py-2`}
                        value={receiptLabelIssue[item.id] || ""}
                        onChange={v => setReceiptLabelIssue(p => ({ ...p, [item.id]: v }))}
                        options={[
                          { value: "", label: "Select issue…" },
                          { value: "SPOILED", label: "Spoiled / bad odor" },
                          { value: "NO_LABEL", label: "No label" },
                          { value: "NO_DATE", label: "No production date" },
                          { value: "EXPIRED", label: "Expired" },
                          { value: "OTHER", label: "Other" },
                        ]}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Branch Notes (optional)
              </label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={2}
                placeholder="Any issues, comments about this delivery..."
                value={branchNotes}
                onChange={e => setBranchNotes(e.target.value)}
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowConfirmModal(false)} disabled={confirming}>
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 font-semibold text-white transition-all hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60"
                onClick={handleConfirmReceipt}
                disabled={confirming}
              >
                {confirming
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</span>
                  : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      </> /* end pageTab === "deliveries" */}
    </div>
  );
}
