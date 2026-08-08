"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  FlaskConical, Loader2, Package, PackageCheck, Play, Plus, RotateCcw, Send, Star,
  Trash2, Users, X,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
  T_CAPTION, T_PAGE_TITLE, T_SECTION,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  TAB_ACTIVE, TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanStatus = "DRAFT" | "PUBLISHED";
type ItemStatus = "PENDING" | "IN_PROGRESS" | "DONE";
type Priority = "HIGH" | "MEDIUM" | "LOW";

type PackingStatus = "PENDING" | "DONE";

type Plan = {
  id: number;
  city: string;
  plan_date: string;
  delivery_date?: string | null;
  status: PlanStatus;
  created_by: string;
  notes: string;
  assigned_staff?: string[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  item_count?: number;
  done_count?: number;
  completed_count?: number;
  items?: PlanItem[];
};

type PlanItem = {
  id: number;
  plan_id: number;
  item_id: number | null;
  item_name: string;
  category: string;
  target_qty: number;
  unit: string;
  priority: Priority;
  notes: string;
  status: ItemStatus;
  started_by: string;
  started_at: string | null;
  completed_by: string;
  completed_at: string | null;
  sort_order: number;
  qc_result: "PASS" | "FAIL" | null;
  qc_actual_qty: number | null;
  qc_notes: string;
  qc_checked_by: string;
  qc_checked_at: string | null;
  packing_status: PackingStatus;
  packing_done_by: string;
  packing_done_at: string | null;
  assigned_staff?: string[];
};

type ReadinessItem = {
  plan_id: number;
  plan_date: string;
  delivery_date: string;
  item_id: number;
  item_name: string;
  category: string;
  target_qty: number;
  unit: string;
  priority: Priority;
  status: ItemStatus;
  qc_result: string | null;
  packing_status: PackingStatus;
};

type ReadinessData = {
  city: string;
  delivery_date: string;
  pending_production: ReadinessItem[];
  pending_qc: ReadinessItem[];
  pending_packing: ReadinessItem[];
  completed: ReadinessItem[];
  total: number;
};

type DeliveryEval = {
  id: number;
  city: string;
  delivery_date: string;
  plan_id: number | null;
  overall_rating: number;
  ready_on_time: boolean;
  ready_time: string;
  pickup_on_time: boolean;
  pickup_time: string;
  delivered_on_time: boolean;
  delivered_time: string;
  missing_items: boolean;
  missing_detail: string;
  temp_ok: boolean;
  temp_notes: string;
  labeling_ok: boolean;
  labeling_notes: string;
  comments: string;
  submitted_by: string;
  submitted_at: string;
};

type ProcessedItem = {
  id: number;
  name: string;
  category: string;
  output_unit: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const PRIORITY_BADGE: Record<Priority, string> = {
  HIGH: "inline-flex items-center rounded-full bg-red-500/15 border border-red-500/25 px-2 py-0.5 text-[10px] font-bold text-red-400",
  MEDIUM: "inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-400",
  LOW: "inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-400",
};

const STATUS_CHIP: Record<ItemStatus, string> = {
  PENDING: "inline-flex items-center rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-400",
  IN_PROGRESS: "inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/25 px-2 py-0.5 text-[10px] font-semibold text-blue-400",
  DONE: "inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-400",
};

const PLAN_STATUS_BADGE: Record<PlanStatus, string> = {
  DRAFT: "inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-400",
  PUBLISHED: "inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-xs font-semibold text-emerald-400",
};

const AVAILABLE_UNITS = ["pc", "g", "kg", "ml", "L", "portion", "tray", "bag", "pack", "box", "unit", "set"];

function isCompleted(item: PlanItem): boolean {
  return item.status === "DONE" && item.qc_result === "PASS" && item.packing_status === "DONE";
}

function canEvalDelivery(auth: ReturnType<typeof getAuth>) {
  if (!auth) return false;
  const r = auth.role || "";
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "HR_MANAGER"].includes(r);
}

function isDeliveryDay(): boolean {
  const dow = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  return [1, 3, 5].includes(dow); // Mon, Wed, Fri
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
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(r);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CKProductionPlanPage() {
  const auth = getAuth();
  const userName = auth?.staffName || "";
  const canManage = isManager(auth);
  const canEval = canEvalDelivery(auth);
  // CK is a Manila operation, so managers default to Manila and can toggle.
  const [city, setCity] = useState<"manila" | "dubai">(
    canManage ? "manila" : ((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"plans" | "readiness" | "eval">("plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);

  // Delivery Readiness tab
  const [readinessDate, setReadinessDate] = useState(todayIso());
  const [readinessData, setReadinessData] = useState<ReadinessData | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);

  // Delivery Eval tab
  const [evalDeliveryDate, setEvalDeliveryDate] = useState(todayIso());
  const [evalOverallRating, setEvalOverallRating] = useState(5);
  const [evalReadyOnTime, setEvalReadyOnTime] = useState(true);
  const [evalReadyTime, setEvalReadyTime] = useState("13:00");
  const [evalPickupOnTime, setEvalPickupOnTime] = useState(true);
  const [evalPickupTime, setEvalPickupTime] = useState("13:30");
  const [evalDeliveredOnTime, setEvalDeliveredOnTime] = useState(true);
  const [evalDeliveredTime, setEvalDeliveredTime] = useState("15:00");
  const [evalMissingItems, setEvalMissingItems] = useState(false);
  const [evalMissingDetail, setEvalMissingDetail] = useState("");
  const [evalTempOk, setEvalTempOk] = useState(true);
  const [evalTempNotes, setEvalTempNotes] = useState("");
  const [evalLabelingOk, setEvalLabelingOk] = useState(true);
  const [evalLabelingNotes, setEvalLabelingNotes] = useState("");
  const [evalComments, setEvalComments] = useState("");
  const [submittingEval, setSubmittingEval] = useState(false);
  const [evalHistory, setEvalHistory] = useState<DeliveryEval[]>([]);
  const [loadingEvalHistory, setLoadingEvalHistory] = useState(false);

  // Packing update
  const [updatingPackingId, setUpdatingPackingId] = useState<number | null>(null);

  // Delivery date inline edit
  const [editingDeliveryDate, setEditingDeliveryDate] = useState(false);
  const [editDeliveryDateVal, setEditDeliveryDateVal] = useState("");

  // New Plan modal
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlanDate, setNewPlanDate] = useState(todayIso());
  const [newDeliveryDate, setNewDeliveryDate] = useState("");
  const [newPlanNotes, setNewPlanNotes] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);
  // ① CK staff in charge (multi-select from the staff master)
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [newPlanStaff, setNewPlanStaff] = useState<string[]>([]);
  const [staffFilter, setStaffFilter] = useState("");

  // Add Item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState("");
  const [addItemName, setAddItemName] = useState("");
  const [addItemCategory, setAddItemCategory] = useState("");
  const [addItemQty, setAddItemQty] = useState("");
  const [addItemUnit, setAddItemUnit] = useState("pc");
  const [addItemPriority, setAddItemPriority] = useState<Priority>("MEDIUM");
  const [addItemNotes, setAddItemNotes] = useState("");
  const [addItemSelectedId, setAddItemSelectedId] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  // Delete confirm
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // Status update loading
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);

  // Publish confirm
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Edit Assignees modal (plan-level)
  const [showEditAssignees, setShowEditAssignees] = useState(false);
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [savingAssignees, setSavingAssignees] = useState(false);

  // Per-item assignee selection
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [showItemAssignModal, setShowItemAssignModal] = useState(false);
  const [itemAssignees, setItemAssignees] = useState<string[]>([]);
  const [itemAssignFilter, setItemAssignFilter] = useState("");
  const [savingItemAssignees, setSavingItemAssignees] = useState(false);

  // Inline quantity edit
  const [editingQtyItemId, setEditingQtyItemId] = useState<number | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState("");
  const [savingQty, setSavingQty] = useState(false);

  // QC Check modal
  const [showQcModal, setShowQcModal] = useState(false);
  const [qcTargetItem, setQcTargetItem] = useState<PlanItem | null>(null);
  const [qcActualQty, setQcActualQty] = useState("");
  const [qcResult, setQcResult] = useState<"PASS" | "FAIL">("PASS");
  const [qcNotes, setQcNotes] = useState("");
  const [submittingQc, setSubmittingQc] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Data Loading ───────────────────────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans?city=${city}&limit=30`);
      setPlans(data.plans || []);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLoadingPlans(false);
    }
  }, [city]);

  const loadPlanDetail = useCallback(async (planId: number) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans/${planId}`);
      setActivePlan(data.plan);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadProcessedItems = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/store/ck-inventory/items?city=${city}`);
      setProcessedItems(data.items || []);
    } catch { /* non-critical */ }
  }, [city]);

  useEffect(() => {
    loadPlans();
    loadProcessedItems();
  }, [loadPlans, loadProcessedItems]);

  // ── Create Plan ────────────────────────────────────────────────────────────
  const loadStaffOptions = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/staff/names?city=${encodeURIComponent(city)}`);
      setStaffOptions(Array.isArray(data?.names) ? data.names : []);
    } catch { /* non-critical */ }
  }, [city]);

  useEffect(() => { void loadStaffOptions(); }, [loadStaffOptions]);

  async function handleCreatePlan() {
    if (!newPlanDate) return;
    setCreatingPlan(true);
    try {
      const data = await apiFetch("/api/store/ck-production-plan/plans", {
        method: "POST",
        body: JSON.stringify({
          city,
          plan_date: newPlanDate,
          delivery_date: newDeliveryDate || null,
          created_by: userName,
          notes: newPlanNotes.trim(),
          assigned_staff: newPlanStaff,
        }),
      });
      setShowNewPlan(false);
      setNewPlanNotes("");
      setNewPlanStaff([]);
      setNewPlanDate(todayIso());
      setNewDeliveryDate("");
      await loadPlans();
      // Auto-select the new plan
      if (data.plan?.id) {
        await loadPlanDetail(data.plan.id);
      }
      showToast("Production plan created");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setCreatingPlan(false);
    }
  }

  // ── Publish Plan ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!activePlan) return;
    setPublishing(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans/${activePlan.id}/publish`, {
        method: "POST",
      });
      setActivePlan(prev => prev ? { ...prev, ...data.plan, items: prev.items } : null);
      setPlans(ps => ps.map(p => p.id === data.plan.id ? { ...p, status: "PUBLISHED" } : p));
      setShowPublishConfirm(false);
      showToast("Plan published — team can now see it");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setPublishing(false);
    }
  }

  // ── Edit Assignees ─────────────────────────────────────────────────────────
  function openEditAssignees() {
    setEditAssignees(activePlan?.assigned_staff || []);
    setAssigneeFilter("");
    setShowEditAssignees(true);
  }

  async function handleSaveAssignees() {
    if (!activePlan) return;
    setSavingAssignees(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans/${activePlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned_staff: editAssignees }),
      });
      setActivePlan(prev => prev ? { ...prev, assigned_staff: data.plan.assigned_staff } : null);
      setPlans(ps => ps.map(p => p.id === activePlan.id ? { ...p, assigned_staff: data.plan.assigned_staff } : p));
      setShowEditAssignees(false);
      showToast("Assignees updated");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setSavingAssignees(false);
    }
  }

  // ── Assign Staff to Selected Items ─────────────────────────────────────────
  async function handleSaveItemAssignees() {
    if (!activePlan) return;
    setSavingItemAssignees(true);
    try {
      await apiFetch(`/api/store/ck-production-plan/plans/${activePlan.id}/items/assign`, {
        method: "PATCH",
        body: JSON.stringify({ item_ids: Array.from(selectedItems), staff: itemAssignees }),
      });
      setActivePlan(prev => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items?.map(item =>
            selectedItems.has(item.id) ? { ...item, assigned_staff: itemAssignees } : item
          ),
        };
      });
      setShowItemAssignModal(false);
      setSelectedItems(new Set());
      showToast("Assignees saved for selected items");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setSavingItemAssignees(false);
    }
  }

  // ── Add Item ───────────────────────────────────────────────────────────────
  function openAddItem() {
    setAddItemSearch("");
    setAddItemName("");
    setAddItemCategory("");
    setAddItemQty("");
    setAddItemUnit("pc");
    setAddItemPriority("MEDIUM");
    setAddItemNotes("");
    setAddItemSelectedId(null);
    setShowAddItem(true);
  }

  const filteredItems = useMemo(() => {
    if (!addItemSearch.trim()) return processedItems.slice(0, 50);
    const q = addItemSearch.toLowerCase();
    return processedItems.filter(i =>
      i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [processedItems, addItemSearch]);

  function selectProcessedItem(item: ProcessedItem) {
    setAddItemSelectedId(item.id);
    setAddItemName(item.name);
    setAddItemCategory(item.category);
    setAddItemUnit(item.output_unit || "pc");
    setAddItemSearch(item.name);
  }

  async function handleAddItem() {
    if (!activePlan || !addItemName.trim()) return;
    setAddingItem(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/plans/${activePlan.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          item_id: addItemSelectedId || 0,
          item_name: addItemName.trim(),
          category: addItemCategory.trim(),
          target_qty: parseFloat(addItemQty) || 0,
          unit: addItemUnit,
          priority: addItemPriority,
          notes: addItemNotes.trim(),
          sort_order: (activePlan.items?.length || 0),
        }),
      });
      setActivePlan(prev => prev ? {
        ...prev,
        items: [...(prev.items || []), data.item],
      } : null);
      setPlans(ps => ps.map(p => p.id === activePlan.id ? { ...p, item_count: (p.item_count || 0) + 1 } : p));
      setShowAddItem(false);
      showToast("Item added");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setAddingItem(false);
    }
  }

  // ── Update Item Status ─────────────────────────────────────────────────────
  async function handleStatusChange(item: PlanItem, newStatus: ItemStatus) {
    setUpdatingItemId(item.id);
    try {
      const data = await apiFetch(
        `/api/store/ck-production-plan/plans/${item.plan_id}/items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus, actor: userName }),
        }
      );
      setActivePlan(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(i => i.id === item.id ? data.item : i),
      } : null);
      // Update done_count in plan list
      if (newStatus === "DONE" || item.status === "DONE") {
        setPlans(ps => ps.map(p => {
          if (p.id !== item.plan_id) return p;
          const delta = newStatus === "DONE" ? 1 : -1;
          return { ...p, done_count: Math.max(0, (p.done_count || 0) + delta) };
        }));
      }
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setUpdatingItemId(null);
    }
  }

  // ── Delete Item ────────────────────────────────────────────────────────────
  async function handleDeleteItem(item: PlanItem) {
    setDeletingItemId(item.id);
    try {
      await apiFetch(
        `/api/store/ck-production-plan/plans/${item.plan_id}/items/${item.id}`,
        { method: "DELETE" }
      );
      setActivePlan(prev => prev ? {
        ...prev,
        items: (prev.items || []).filter(i => i.id !== item.id),
      } : null);
      setPlans(ps => ps.map(p => p.id === item.plan_id ? { ...p, item_count: Math.max(0, (p.item_count || 0) - 1) } : p));
      showToast("Item removed");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setDeletingItemId(null);
    }
  }

  // ── QC Check ──────────────────────────────────────────────────────────────
  function openQcModal(item: PlanItem) {
    setQcTargetItem(item);
    setQcActualQty(item.target_qty > 0 ? String(item.target_qty) : "");
    setQcResult("PASS");
    setQcNotes("");
    setShowQcModal(true);
  }

  async function handleQcSubmit() {
    if (!qcTargetItem || !qcActualQty) return;
    setSubmittingQc(true);
    try {
      const data = await apiFetch(
        `/api/store/ck-production-plan/plans/${qcTargetItem.plan_id}/items/${qcTargetItem.id}/qc`,
        {
          method: "POST",
          body: JSON.stringify({
            actual_qty: parseFloat(qcActualQty),
            unit: qcTargetItem.unit,
            result: qcResult,
            notes: qcNotes.trim(),
            checked_by: userName,
          }),
        }
      );
      // Update the item in activePlan
      setActivePlan(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(i => i.id === qcTargetItem.id ? data.item : i),
      } : null);
      setShowQcModal(false);
      const inv = data.inventory_updated ? " Inventory updated." : "";
      showToast(`QC ${qcResult} recorded.${inv}`, true);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setSubmittingQc(false);
    }
  }

  async function handleQtySave(item: PlanItem) {
    const val = parseFloat(editingQtyVal);
    if (isNaN(val) || val < 0) {
      showToast("Enter a valid quantity (≥ 0).", false);
      return;
    }
    setSavingQty(true);
    try {
      const data = await apiFetch(
        `/api/store/ck-production-plan/plans/${item.plan_id}/items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ target_qty: val, actor: userName }),
        }
      );
      setActivePlan(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(i => i.id === item.id ? data.item : i),
      } : null);
      setEditingQtyItemId(null);
      showToast("Quantity updated.", true);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setSavingQty(false);
    }
  }

  // ── Packing Done ───────────────────────────────────────────────────────────
  async function handlePackingDone(item: PlanItem, newStatus: PackingStatus) {
    setUpdatingPackingId(item.id);
    try {
      const data = await apiFetch(
        `/api/store/ck-production-plan/plans/${item.plan_id}/items/${item.id}/packing`,
        { method: "PATCH", body: JSON.stringify({ packing_status: newStatus, actor: userName }) }
      );
      setActivePlan(prev => prev ? {
        ...prev,
        items: (prev.items || []).map(i => i.id === item.id ? { ...i, ...data.item } : i),
      } : null);
      showToast(newStatus === "DONE" ? "Packing & Labeling marked DONE" : "Packing reset");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setUpdatingPackingId(null);
    }
  }

  async function handleSaveDeliveryDate() {
    if (!activePlan) return;
    try {
      const data = await apiFetch(
        `/api/store/ck-production-plan/plans/${activePlan.id}`,
        { method: "PATCH", body: JSON.stringify({ delivery_date: editDeliveryDateVal || null }) }
      );
      setActivePlan(prev => prev ? { ...prev, delivery_date: data.plan?.delivery_date ?? null } : null);
      setPlans(prev => prev.map(p => p.id === activePlan.id ? { ...p, delivery_date: data.plan?.delivery_date ?? null } : p));
      setEditingDeliveryDate(false);
      showToast("Delivery date updated");
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    }
  }

  // ── Delivery Readiness ─────────────────────────────────────────────────────
  const loadReadiness = useCallback(async (date: string) => {
    setLoadingReadiness(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/readiness?city=${city}&delivery_date=${date}`);
      setReadinessData(data);
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setLoadingReadiness(false);
    }
  }, [city]);

  useEffect(() => {
    if (activeTab === "readiness") loadReadiness(readinessDate);
  }, [activeTab, readinessDate, loadReadiness]);

  // ── Delivery Evaluations ───────────────────────────────────────────────────
  const loadDeliveryEvals = useCallback(async () => {
    setLoadingEvalHistory(true);
    try {
      const data = await apiFetch(`/api/store/ck-production-plan/delivery-evaluations?city=${city}&limit=20`);
      setEvalHistory(data.evaluations || []);
    } catch { /* non-critical */ } finally {
      setLoadingEvalHistory(false);
    }
  }, [city]);

  useEffect(() => {
    if (activeTab === "eval") loadDeliveryEvals();
  }, [activeTab, loadDeliveryEvals]);

  async function handleDeliveryEvalSubmit() {
    if (!evalDeliveryDate) return;
    setSubmittingEval(true);
    try {
      await apiFetch("/api/store/ck-production-plan/delivery-evaluations", {
        method: "POST",
        body: JSON.stringify({
          city,
          delivery_date: evalDeliveryDate,
          overall_rating: evalOverallRating,
          ready_on_time: evalReadyOnTime, ready_time: evalReadyTime,
          pickup_on_time: evalPickupOnTime, pickup_time: evalPickupTime,
          delivered_on_time: evalDeliveredOnTime, delivered_time: evalDeliveredTime,
          missing_items: evalMissingItems, missing_detail: evalMissingDetail,
          temp_ok: evalTempOk, temp_notes: evalTempNotes,
          labeling_ok: evalLabelingOk, labeling_notes: evalLabelingNotes,
          comments: evalComments,
          submitted_by: userName,
        }),
      });
      showToast("Delivery evaluation submitted");
      setEvalComments("");
      setEvalMissingDetail(""); setEvalTempNotes(""); setEvalLabelingNotes("");
      setEvalOverallRating(5);
      setEvalReadyOnTime(true); setEvalPickupOnTime(true); setEvalDeliveredOnTime(true);
      setEvalMissingItems(false); setEvalTempOk(true); setEvalLabelingOk(true);
      await loadDeliveryEvals();
    } catch (e: unknown) {
      showToast((e as Error).message, false);
    } finally {
      setSubmittingEval(false);
    }
  }

  // ── Grouped Items ──────────────────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const items = activePlan?.items || [];
    const map: Record<string, PlanItem[]> = {};
    for (const item of items) {
      const cat = item.category || "Uncategorized";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [activePlan?.items]);

  const planStats = useMemo(() => {
    const items = activePlan?.items || [];
    return {
      total: items.length,
      pending: items.filter(i => i.status === "PENDING").length,
      inProgress: items.filter(i => i.status === "IN_PROGRESS").length,
      done: items.filter(i => i.status === "DONE").length,
      qcPass: items.filter(i => i.qc_result === "PASS").length,
      completed: items.filter(isCompleted).length,
    };
  }, [activePlan?.items]);

  // Red Alert: delivery day + after 14:00 + items not completed
  const showRedAlert = useMemo(() => {
    if (!activePlan || activeTab !== "plans") return false;
    if (!isDeliveryDay()) return false;
    const h = new Date().getHours();
    if (h < 14) return false;
    return planStats.completed < planStats.total && planStats.total > 0;
  }, [activePlan, activeTab, planStats.completed, planStats.total]);

  // Readiness badge: count of incomplete items (for tab notification)
  const readinessBadge = useMemo(() => {
    if (!readinessData) return 0;
    return readinessData.pending_production.length + readinessData.pending_qc.length + readinessData.pending_packing.length;
  }, [readinessData]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-500/25">
            <ClipboardList className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>CK Production Plan</h1>
            <p className={T_CAPTION}>{city === "dubai" ? "Dubai" : "Manila"} Central Kitchen</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
              {(["manila", "dubai"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => { setCity(c); setActivePlan(null); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                    city === c ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {canManage && (
            <button
              className={PRIMARY_BUTTON}
              onClick={() => setShowNewPlan(true)}
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Plan
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={() => setActiveTab("plans")} className={activeTab === "plans" ? TAB_ACTIVE : TAB_INACTIVE}>
          Production Plans
        </button>
        <button onClick={() => setActiveTab("readiness")} className={`${activeTab === "readiness" ? TAB_ACTIVE : TAB_INACTIVE} relative`}>
          Delivery Readiness
          {readinessBadge > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
              {readinessBadge}
            </span>
          )}
        </button>
        {canEval && (
          <button onClick={() => setActiveTab("eval")} className={`${activeTab === "eval" ? TAB_ACTIVE : TAB_INACTIVE} relative`}>
            Delivery Eval
            {evalHistory.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">
                {evalHistory.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${toast.ok ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Red Alert Banner ───────────────────────────────────────────────── */}
      {showRedAlert && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-red-500 bg-red-500/20 p-5 shadow-[0_0_40px_rgba(239,68,68,0.4)]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/30 border border-red-500/50 animate-pulse">
              <AlertTriangle className="h-6 w-6 text-red-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-red-300">DELIVERY DAY ALERT</p>
              <p className="text-sm text-red-400">
                {planStats.total - planStats.completed} item{planStats.total - planStats.completed !== 1 ? "s" : ""} not yet COMPLETED — it&apos;s past 14:00 on a delivery day. Coordinate with the team immediately.
              </p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <p className="text-3xl font-black text-red-400">{planStats.total - planStats.completed}</p>
              <p className="text-xs text-red-500">pending</p>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      {activeTab === "plans" && <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        {/* Left: Plans list */}
        <div className={`${GLASS_CARD} p-4 self-start sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto`}>
          <div className="mb-3 flex items-center justify-between">
            <span className={T_SECTION + " text-base"}>Plans</span>
            {loadingPlans && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>

          {plans.length === 0 && !loadingPlans && (
            <p className={T_CAPTION + " py-4 text-center"}>
              {canManage ? 'No plans yet. Create the first one.' : 'No plans yet.'}
            </p>
          )}

          <div className="space-y-2">
            {plans.map(plan => {
              const isActive = activePlan?.id === plan.id;
              const progress = plan.item_count ? Math.round(((plan.done_count || 0) / plan.item_count) * 100) : 0;
              const isAssignedToMe = userName ? (plan.assigned_staff || []).includes(userName) : false;
              return (
                <button
                  key={plan.id}
                  onClick={() => loadPlanDetail(plan.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-150 ${
                    isActive
                      ? "border-violet-500/40 bg-violet-500/15"
                      : isAssignedToMe
                        ? "border-emerald-500/30 bg-emerald-500/8 hover:border-emerald-500/40 hover:bg-emerald-500/12"
                        : "border-white/8 bg-white/4 hover:border-violet-500/20 hover:bg-violet-500/8"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{fmtDate(plan.plan_date)}</span>
                    <span className={PLAN_STATUS_BADGE[plan.status]}>{plan.status}</span>
                  </div>
                  {plan.delivery_date && (
                    <div className="mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-violet-400" />
                      <span className="text-[10px] text-violet-400">Delivery: {fmtDate(plan.delivery_date)}</span>
                    </div>
                  )}
                  <div className={T_CAPTION + " mt-1"}>
                    {plan.item_count || 0} items · {plan.done_count || 0} done
                    {(plan.completed_count || 0) > 0 && <span className="text-emerald-400"> · {plan.completed_count} completed</span>}
                  </div>
                  {(plan.item_count || 0) > 0 && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {(plan.assigned_staff || []).length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(plan.assigned_staff || []).slice(0, 3).map(name => (
                        <span
                          key={name}
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            name === userName
                              ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                              : "border border-white/10 bg-white/8 text-zinc-400"
                          }`}
                        >
                          {name === userName ? `★ ${name}` : name}
                        </span>
                      ))}
                      {(plan.assigned_staff || []).length > 3 && (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/8 px-1.5 py-0.5 text-[9px] text-zinc-500">
                          +{(plan.assigned_staff || []).length - 3}
                        </span>
                      )}
                    </div>
                  ) : plan.created_by ? (
                    <p className={T_CAPTION + " mt-1 truncate"}>by {plan.created_by}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Plan detail */}
        <div className="min-w-0">
          {loadingDetail ? (
            <div className={`${GLASS_CARD} flex items-center justify-center p-12`}>
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            </div>
          ) : !activePlan ? (
            <div className={`${GLASS_CARD} flex flex-col items-center justify-center p-12 text-center`}>
              <Package className="h-12 w-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400">Select a plan from the left, or create a new one.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Plan header */}
              <div className={`${GLASS_CARD} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={T_SECTION}>{fmtDate(activePlan.plan_date)} Production Plan</h2>
                      <span className={PLAN_STATUS_BADGE[activePlan.status]}>{activePlan.status}</span>
                      {editingDeliveryDate ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={editDeliveryDateVal}
                            onChange={e => setEditDeliveryDateVal(e.target.value)}
                            className="rounded-lg border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                          <button onClick={handleSaveDeliveryDate} className="rounded px-2 py-0.5 text-xs bg-violet-600 text-white hover:bg-violet-500">Save</button>
                          <button onClick={() => setEditingDeliveryDate(false)} className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-white">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditDeliveryDateVal(activePlan.delivery_date || ""); setEditingDeliveryDate(true); }}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-500/25 px-2 py-0.5 text-xs text-violet-400 hover:bg-violet-500/25 transition-colors"
                          title="Click to edit delivery date"
                        >
                          <Calendar className="h-3 w-3" />
                          {activePlan.delivery_date ? `Delivery: ${fmtDate(activePlan.delivery_date)}` : "Set delivery date"}
                        </button>
                      )}
                    </div>
                    {activePlan.created_by && (
                      <p className={T_CAPTION + " mt-1"}>Created by {activePlan.created_by}</p>
                    )}
                    {activePlan.assigned_staff && activePlan.assigned_staff.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={T_CAPTION}>In charge:</span>
                        {activePlan.assigned_staff.map(name => (
                          <span key={name} className="inline-flex rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">{name}</span>
                        ))}
                      </div>
                    )}
                    {activePlan.notes && (
                      <p className="mt-2 text-sm text-zinc-300">{activePlan.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {canManage && activePlan.status === "DRAFT" && (
                      <>
                        <button className={SMALL_BUTTON} onClick={openAddItem}>
                          <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Item</span>
                        </button>
                        <button className={SMALL_BUTTON} onClick={openEditAssignees}>
                          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Edit Assignees</span>
                        </button>
                        <button
                          className={`${SECONDARY_BUTTON} text-sm`}
                          onClick={() => setShowPublishConfirm(true)}
                        >
                          <span className="flex items-center gap-1.5"><Send className="h-4 w-4" /> Publish</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* KPI bar */}
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {[
                    { label: "Total", value: planStats.total, cls: "text-white" },
                    { label: "Pending", value: planStats.pending, cls: "text-zinc-400" },
                    { label: "In Progress", value: planStats.inProgress, cls: "text-blue-400" },
                    { label: "Production", value: planStats.done, cls: "text-emerald-400" },
                    { label: "QC Pass", value: planStats.qcPass, cls: "text-violet-400" },
                    { label: "Completed", value: planStats.completed, cls: "text-teal-400" },
                  ].map(k => (
                    <div key={k.label} className={KPI_CARD}>
                      <p className={KPI_LABEL}>{k.label}</p>
                      <p className={`${KPI_VALUE} text-xl ${k.cls}`}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Overall progress */}
                {planStats.total > 0 && (
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-white/8">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.round((planStats.done / planStats.total) * 100)}%` }}
                      />
                    </div>
                    <p className={T_CAPTION + " mt-1 text-right"}>
                      {Math.round((planStats.done / planStats.total) * 100)}% complete
                    </p>
                  </div>
                )}
              </div>

              {/* Items table — grouped by category */}
              {(activePlan.items || []).length === 0 ? (
                <div className={`${GLASS_CARD} flex flex-col items-center justify-center p-8 text-center`}>
                  <ClipboardList className="h-10 w-10 text-zinc-600 mb-2" />
                  <p className="text-zinc-400 text-sm">No items in this plan yet.</p>
                  {canManage && activePlan.status === "DRAFT" && (
                    <button className={`${SMALL_BUTTON} mt-3`} onClick={openAddItem}>
                      <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add First Item</span>
                    </button>
                  )}
                </div>
              ) : (
                Object.entries(groupedItems).map(([category, items]) => {
                  const collapsed = collapsedCategories.has(category);
                  const catDone = items.filter(i => i.status === "DONE").length;
                  return (
                    <div key={category} className={GLASS_CARD}>
                      {/* Category header */}
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
                          <span className={T_CAPTION}>({items.length} items)</span>
                        </div>
                        <span className={T_CAPTION}>
                          {catDone}/{items.length} done
                        </span>
                      </button>

                      {/* Items */}
                      {!collapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr>
                                <th className={`${TABLE_HEADER} w-8 pl-3 text-center`}>
                                  <input
                                    type="checkbox"
                                    className="accent-violet-500"
                                    checked={items.length > 0 && items.every(i => selectedItems.has(i.id))}
                                    onChange={e => {
                                      setSelectedItems(prev => {
                                        const s = new Set(prev);
                                        items.forEach(i => e.target.checked ? s.add(i.id) : s.delete(i.id));
                                        return s;
                                      });
                                    }}
                                  />
                                </th>
                                <th className={`${TABLE_HEADER} pl-2 text-left`}>Item</th>
                                <th className={`${TABLE_HEADER} text-right`}>Target</th>
                                <th className={`${TABLE_HEADER} text-center`}>Priority</th>
                                <th className={`${TABLE_HEADER} text-center`}>Production</th>
                                <th className={`${TABLE_HEADER} text-center`}>QC</th>
                                <th className={`${TABLE_HEADER} text-center`}>Packing</th>
                                <th className={`${TABLE_HEADER} pr-4 text-right`}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map(item => (
                                <tr key={item.id} className={`${TABLE_ROW} ${isCompleted(item) ? "opacity-50" : ""} ${selectedItems.has(item.id) ? "bg-violet-500/5" : ""}`}>
                                  <td className={`${TABLE_CELL} w-8 pl-3 text-center`}>
                                    <input
                                      type="checkbox"
                                      className="accent-violet-500"
                                      checked={selectedItems.has(item.id)}
                                      onChange={e => {
                                        setSelectedItems(prev => {
                                          const s = new Set(prev);
                                          e.target.checked ? s.add(item.id) : s.delete(item.id);
                                          return s;
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className={`${TABLE_CELL} pl-2`}>
                                    <div>
                                      <p className="font-medium text-white">{item.item_name}</p>
                                      {item.assigned_staff && item.assigned_staff.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {item.assigned_staff.map(name => (
                                            <span key={name} className="inline-flex items-center rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {item.notes && <p className={T_CAPTION}>{item.notes}</p>}
                                      {item.started_by && item.status === "IN_PROGRESS" && (
                                        <p className={T_CAPTION + " text-blue-400"}>Started by {item.started_by}</p>
                                      )}
                                      {item.completed_by && item.status === "DONE" && (
                                        <p className={T_CAPTION + " text-emerald-400"}>Done by {item.completed_by}</p>
                                      )}
                                    </div>
                                  </td>
                                  <td className={`${TABLE_CELL} text-right font-mono`}>
                                    {editingQtyItemId === item.id ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={editingQtyVal}
                                          onChange={e => setEditingQtyVal(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") handleQtySave(item);
                                            if (e.key === "Escape") setEditingQtyItemId(null);
                                          }}
                                          autoFocus
                                          className="w-16 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-right text-xs text-white focus:outline-none focus:border-blue-500"
                                        />
                                        <span className="text-xs text-zinc-400">{item.unit}</span>
                                        <button
                                          onClick={() => handleQtySave(item)}
                                          disabled={savingQty}
                                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                                          title="Save"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingQtyItemId(null)}
                                          className="text-zinc-500 hover:text-zinc-300"
                                          title="Cancel"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingQtyItemId(item.id);
                                          setEditingQtyVal(item.target_qty > 0 ? String(item.target_qty) : "");
                                        }}
                                        className="group inline-flex items-center gap-1 rounded px-1 hover:bg-zinc-700/60"
                                        title="Click to edit quantity"
                                      >
                                        {item.target_qty > 0
                                          ? `${item.target_qty % 1 === 0 ? item.target_qty : item.target_qty.toFixed(1)} ${item.unit}`
                                          : <span className="text-zinc-600">—</span>}
                                        <span className="text-[10px] text-zinc-600 opacity-0 group-hover:opacity-100">✎</span>
                                      </button>
                                    )}
                                  </td>
                                  <td className={`${TABLE_CELL} text-center`}>
                                    <span className={PRIORITY_BADGE[item.priority]}>{item.priority}</span>
                                  </td>
                                  <td className={`${TABLE_CELL} text-center`}>
                                    <span className={STATUS_CHIP[item.status]}>{item.status.replace("_", " ")}</span>
                                  </td>
                                  <td className={`${TABLE_CELL} text-center`}>
                                    {item.qc_result === "PASS" && (
                                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                        ✓ PASS
                                      </span>
                                    )}
                                    {item.qc_result === "FAIL" && (
                                      <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/25 px-2 py-0.5 text-[10px] font-bold text-red-400">
                                        ✗ FAIL
                                      </span>
                                    )}
                                    {!item.qc_result && item.status === "DONE" && (
                                      <span className="text-[10px] text-zinc-600">Pending</span>
                                    )}
                                    {!item.qc_result && item.status !== "DONE" && (
                                      <span className="text-[10px] text-zinc-700">—</span>
                                    )}
                                  </td>
                                  <td className={`${TABLE_CELL} text-center`}>
                                    {item.packing_status === "DONE" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-500/25 px-2 py-0.5 text-[10px] font-bold text-teal-400">
                                        <PackageCheck className="h-3 w-3" /> DONE
                                      </span>
                                    ) : item.qc_result === "PASS" ? (
                                      <span className="text-[10px] text-amber-500/80">Pending</span>
                                    ) : (
                                      <span className="text-[10px] text-zinc-700">—</span>
                                    )}
                                  </td>
                                  <td className={`${TABLE_CELL} pr-4 text-right`}>
                                    <div className="flex items-center justify-end gap-1.5">
                                      {updatingItemId === item.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                                      ) : (
                                        <>
                                          {/* Status action buttons — for published plans or draft */}
                                          {item.status === "PENDING" && (
                                            <button
                                              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/20"
                                              onClick={() => handleStatusChange(item, "IN_PROGRESS")}
                                              title="Start"
                                            >
                                              <Play className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {item.status === "IN_PROGRESS" && (
                                            <>
                                              <button
                                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                                                onClick={() => handleStatusChange(item, "DONE")}
                                                title="Done"
                                              >
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                              </button>
                                              <button
                                                className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-500/20"
                                                onClick={() => handleStatusChange(item, "PENDING")}
                                                title="Reset"
                                              >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          )}
                                          {item.status === "DONE" && (
                                            <>
                                              {!item.qc_result && (
                                                <button
                                                  className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs text-violet-400 hover:bg-violet-500/20"
                                                  onClick={() => openQcModal(item)}
                                                  title="QC Check"
                                                >
                                                  <FlaskConical className="h-3.5 w-3.5" />
                                                </button>
                                              )}
                                              {item.qc_result === "PASS" && item.packing_status !== "DONE" && (
                                                updatingPackingId === item.id ? (
                                                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                                                ) : (
                                                  <button
                                                    className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-xs text-teal-400 hover:bg-teal-500/20"
                                                    onClick={() => handlePackingDone(item, "DONE")}
                                                    title="Mark Packing & Labeling Done"
                                                  >
                                                    <PackageCheck className="h-3.5 w-3.5" />
                                                  </button>
                                                )
                                              )}
                                              <button
                                                className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-500/20"
                                                onClick={() => handleStatusChange(item, "PENDING")}
                                                title="Reset"
                                              >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          )}
                                          {/* Delete — only in DRAFT for managers */}
                                          {canManage && activePlan.status === "DRAFT" && (
                                            deletingItemId === item.id ? (
                                              <div className="flex gap-1">
                                                <button
                                                  className="rounded-lg border border-red-500/40 bg-red-500/20 px-2 py-1 text-xs text-red-400"
                                                  onClick={() => handleDeleteItem(item)}
                                                >
                                                  Confirm
                                                </button>
                                                <button
                                                  className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-2 py-1 text-xs text-zinc-400"
                                                  onClick={() => setDeletingItemId(null)}
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                className="rounded-lg border border-red-500/20 bg-red-500/8 px-2 py-1 text-xs text-red-500/70 hover:bg-red-500/15 hover:text-red-400"
                                                onClick={() => setDeletingItemId(item.id)}
                                                title="Remove"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            )
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
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
      </div>}

      {/* ── Delivery Readiness Tab ─────────────────────────────────────────── */}
      {activeTab === "readiness" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <label className="text-sm text-zinc-400">Delivery Date:</label>
              <input
                type="date"
                className={INPUT_CLASS + " w-auto"}
                value={readinessDate}
                onChange={e => setReadinessDate(e.target.value)}
              />
            </div>
            <button
              className={SECONDARY_BUTTON}
              onClick={() => loadReadiness(readinessDate)}
              disabled={loadingReadiness}
            >
              {loadingReadiness ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </button>
          </div>

          {loadingReadiness ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>
          ) : !readinessData ? (
            <div className={GLASS_CARD + " py-10 text-center"}>
              <p className="text-zinc-500">Select a delivery date and click Refresh.</p>
            </div>
          ) : readinessData.total === 0 ? (
            <div className={GLASS_CARD + " py-10 text-center"}>
              <p className="text-zinc-500">No published plans found for {fmtDate(readinessDate)}.</p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Items", value: readinessData.total, cls: "text-white" },
                  { label: "Pending Prod.", value: readinessData.pending_production.length, cls: "text-amber-400" },
                  { label: "Pending QC", value: readinessData.pending_qc.length, cls: "text-violet-400" },
                  { label: "Pending Pack", value: readinessData.pending_packing.length, cls: "text-blue-400" },
                ].map(k => (
                  <div key={k.label} className={KPI_CARD}>
                    <p className={KPI_LABEL}>{k.label}</p>
                    <p className={`${KPI_VALUE} text-xl ${k.cls}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Completed progress */}
              <div className={GLASS_CARD + " px-4 py-3"}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-emerald-400">Completed</span>
                  <span className="text-sm text-emerald-400">{readinessData.completed.length}/{readinessData.total}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/8">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: `${Math.round((readinessData.completed.length / readinessData.total) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Pending sections */}
              {[
                { title: "⛔ Pending Production", items: readinessData.pending_production, color: "amber" },
                { title: "🔬 Pending QC", items: readinessData.pending_qc, color: "violet" },
                { title: "📦 Pending Packing & Labeling", items: readinessData.pending_packing, color: "blue" },
                { title: "✅ Completed", items: readinessData.completed, color: "emerald" },
              ].filter(s => s.items.length > 0).map(section => (
                <div key={section.title} className={GLASS_CARD}>
                  <div className="px-4 py-3 border-b border-white/8">
                    <span className="font-semibold text-white">{section.title}</span>
                    <span className={T_CAPTION + " ml-2"}>{section.items.length} items</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={`${TABLE_HEADER} pl-4 text-left`}>Item</th>
                          <th className={`${TABLE_HEADER} text-center`}>Category</th>
                          <th className={`${TABLE_HEADER} text-center`}>Priority</th>
                          <th className={`${TABLE_HEADER} text-right pr-4`}>Target Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map(item => (
                          <tr key={`${item.plan_id}-${item.item_id}`} className={TABLE_ROW}>
                            <td className={`${TABLE_CELL} pl-4 font-medium text-white`}>{item.item_name}</td>
                            <td className={`${TABLE_CELL} text-center`}><span className={T_CAPTION}>{item.category || "—"}</span></td>
                            <td className={`${TABLE_CELL} text-center`}><span className={PRIORITY_BADGE[item.priority] || ""}>{item.priority}</span></td>
                            <td className={`${TABLE_CELL} pr-4 text-right font-mono text-zinc-300`}>{item.target_qty > 0 ? `${item.target_qty} ${item.unit}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Delivery Eval Tab ──────────────────────────────────────────────── */}
      {activeTab === "eval" && canEval && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: Form */}
          <div className={GLASS_CARD + " p-6 space-y-5"}>
            <h3 className={T_SECTION}>Submit Delivery Evaluation</h3>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Delivery Date</label>
              <input type="date" className={INPUT_CLASS} value={evalDeliveryDate} onChange={e => setEvalDeliveryDate(e.target.value)} />
            </div>

            {/* Overall Rating */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Overall Rating</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setEvalOverallRating(n)}
                    className={`flex-1 rounded-xl border py-2.5 transition-all ${n <= evalOverallRating ? "border-amber-500/50 bg-amber-500/20 text-amber-400" : "border-white/10 bg-white/5 text-zinc-600"}`}
                  >
                    <Star className={`mx-auto h-5 w-5 ${n <= evalOverallRating ? "fill-amber-400" : ""}`} />
                  </button>
                ))}
              </div>
              <p className={T_CAPTION + " mt-1 text-center"}>{["","Poor","Below Average","Average","Good","Excellent"][evalOverallRating]}</p>
            </div>

            {/* 3 Time checks */}
            {[
              { label: "Delivery Ready On Time", target: "Target: 13:00", onTime: evalReadyOnTime, setOnTime: setEvalReadyOnTime, time: evalReadyTime, setTime: setEvalReadyTime },
              { label: "Driver Pick-up On Time", target: "Target: 13:30", onTime: evalPickupOnTime, setOnTime: setEvalPickupOnTime, time: evalPickupTime, setTime: setEvalPickupTime },
              { label: "Delivered On Time", target: "Target: 15:00", onTime: evalDeliveredOnTime, setOnTime: setEvalDeliveredOnTime, time: evalDeliveredTime, setTime: setEvalDeliveredTime },
            ].map(f => (
              <div key={f.label} className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{f.label}</p>
                    <p className={T_CAPTION}>{f.target}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => f.setOnTime(true)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${f.onTime ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-white/10 text-zinc-500"}`}>Yes</button>
                    <button onClick={() => f.setOnTime(false)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${!f.onTime ? "border-red-500/50 bg-red-500/20 text-red-400" : "border-white/10 text-zinc-500"}`}>No</button>
                  </div>
                </div>
                <div>
                  <label className={T_CAPTION + " mb-1 block"}>Actual time</label>
                  <input type="time" className={INPUT_CLASS} value={f.time} onChange={e => f.setTime(e.target.value)} />
                </div>
              </div>
            ))}

            {/* Issue checks */}
            {[
              { label: "Missing / Wrong / Damaged Items", yes: evalMissingItems, setYes: setEvalMissingItems, detail: evalMissingDetail, setDetail: setEvalMissingDetail, detailLabel: "Details", flip: true },
              { label: "Food Temperature OK", yes: evalTempOk, setYes: setEvalTempOk, detail: evalTempNotes, setDetail: setEvalTempNotes, detailLabel: "Notes", flip: false },
              { label: "Proper Labeling OK", yes: evalLabelingOk, setYes: setEvalLabelingOk, detail: evalLabelingNotes, setDetail: setEvalLabelingNotes, detailLabel: "Notes", flip: false },
            ].map(f => (
              <div key={f.label} className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{f.label}</p>
                  <div className="flex gap-2">
                    <button onClick={() => f.setYes(true)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${f.yes ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-white/10 text-zinc-500"}`}>Yes</button>
                    <button onClick={() => f.setYes(false)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${!f.yes ? "border-red-500/50 bg-red-500/20 text-red-400" : "border-white/10 text-zinc-500"}`}>No</button>
                  </div>
                </div>
                {((f.flip && f.yes) || (!f.flip && !f.yes)) && (
                  <input type="text" className={INPUT_CLASS} placeholder={f.detailLabel + "..."} value={f.detail} onChange={e => f.setDetail(e.target.value)} />
                )}
              </div>
            ))}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Comments / Improvement Points</label>
              <textarea className={TEXTAREA_CLASS} rows={3} placeholder="Any comments or improvement points..." value={evalComments} onChange={e => setEvalComments(e.target.value)} />
            </div>

            <button
              className={PRIMARY_BUTTON + " w-full"}
              onClick={handleDeliveryEvalSubmit}
              disabled={!evalDeliveryDate || submittingEval}
            >
              {submittingEval ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</span> : "Submit Evaluation"}
            </button>
          </div>

          {/* Right: History */}
          <div className={GLASS_CARD + " p-5 self-start"}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={T_SECTION}>Recent Evaluations</h3>
              {loadingEvalHistory && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
            </div>
            {evalHistory.length === 0 ? (
              <p className={T_CAPTION + " py-4 text-center"}>No evaluations yet.</p>
            ) : (
              <div className="space-y-3">
                {evalHistory.map(ev => (
                  <div key={ev.id} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{fmtDate(ev.delivery_date)}</span>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} className={`h-3.5 w-3.5 ${n <= ev.overall_rating ? "fill-amber-400 text-amber-400" : "text-zinc-700"}`} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { ok: ev.ready_on_time, label: "Ready" },
                        { ok: ev.pickup_on_time, label: "Pickup" },
                        { ok: ev.delivered_on_time, label: "Delivery" },
                        { ok: !ev.missing_items, label: "No Missing" },
                        { ok: ev.temp_ok, label: "Temp OK" },
                        { ok: ev.labeling_ok, label: "Label OK" },
                      ].map(f => (
                        <span key={f.label} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                          {f.ok ? "✓" : "✗"} {f.label}
                        </span>
                      ))}
                    </div>
                    {ev.comments && <p className={T_CAPTION + " text-zinc-400"}>{ev.comments}</p>}
                    <p className={T_CAPTION}>by {ev.submitted_by}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── New Plan Modal ─────────────────────────────────────────────────── */}
      {showNewPlan && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-md p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={T_SECTION}>New Production Plan</h3>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowNewPlan(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Production Date</label>
                  <input
                    type="date"
                    className={INPUT_CLASS}
                    value={newPlanDate}
                    onChange={e => setNewPlanDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Delivery Date</label>
                  <input
                    type="date"
                    className={INPUT_CLASS}
                    value={newDeliveryDate}
                    onChange={e => setNewDeliveryDate(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  CK Staff in charge {newPlanStaff.length > 0 && <span className="text-violet-300">({newPlanStaff.length})</span>}
                </label>
                {newPlanStaff.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {newPlanStaff.map(name => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs text-violet-200">
                        {name}
                        <button onClick={() => setNewPlanStaff(s => s.filter(n => n !== name))} className="hover:text-white">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="Type to search staff…"
                  value={staffFilter}
                  onChange={e => setStaffFilter(e.target.value)}
                />
                {staffFilter.trim() && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02]">
                    {staffOptions
                      .filter(n => !newPlanStaff.includes(n) && n.toLowerCase().includes(staffFilter.toLowerCase()))
                      .slice(0, 30)
                      .map(name => (
                        <button
                          key={name}
                          onClick={() => { setNewPlanStaff(s => [...s, name]); setStaffFilter(""); }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-white/5"
                        >
                          {name}
                        </button>
                      ))}
                    {staffOptions.filter(n => !newPlanStaff.includes(n) && n.toLowerCase().includes(staffFilter.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs text-zinc-500">No staff found.</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes (optional)</label>
                <textarea
                  className={TEXTAREA_CLASS}
                  rows={3}
                  placeholder="Any notes about today's plan..."
                  value={newPlanNotes}
                  onChange={e => setNewPlanNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                className={`${SECONDARY_BUTTON} flex-1`}
                onClick={() => setShowNewPlan(false)}
              >
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleCreatePlan}
                disabled={!newPlanDate || creatingPlan}
              >
                {creatingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating...</span> : "Create Plan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add Item Modal ─────────────────────────────────────────────────── */}
      {showAddItem && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-lg p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={T_SECTION}>Add Production Item</h3>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowAddItem(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Search processed items */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Search Item</label>
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="Type to search processed items..."
                  value={addItemSearch}
                  onChange={e => {
                    setAddItemSearch(e.target.value);
                    setAddItemSelectedId(null);
                    setAddItemName(e.target.value);
                  }}
                />
                {addItemSearch && !addItemSelectedId && filteredItems.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-500/10"
                        onClick={() => selectProcessedItem(item)}
                      >
                        <span className="text-zinc-200">{item.name}</span>
                        <span className={T_CAPTION}>{item.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {addItemName && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Category</label>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        placeholder="e.g. Base Roll"
                        value={addItemCategory}
                        onChange={e => setAddItemCategory(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Priority</label>
                      <SelectDark
                        className={SELECT_CLASS}
                        value={addItemPriority}
                        onChange={v => setAddItemPriority(v as Priority)}
                        options={[
                          { value: "HIGH", label: "🔴 HIGH" },
                          { value: "MEDIUM", label: "🟡 MEDIUM" },
                          { value: "LOW", label: "🟢 LOW" },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Target Qty</label>
                      <input
                        type="number"
                        className={INPUT_CLASS}
                        placeholder="0"
                        min="0"
                        step="0.1"
                        value={addItemQty}
                        onChange={e => setAddItemQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Unit</label>
                      <SelectDark
                        className={SELECT_CLASS}
                        value={addItemUnit}
                        onChange={setAddItemUnit}
                        options={[...new Set([addItemUnit, ...AVAILABLE_UNITS])].map(u => ({ value: u, label: u }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes (optional)</label>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      placeholder="Any notes for this item..."
                      value={addItemNotes}
                      onChange={e => setAddItemNotes(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                className={`${SECONDARY_BUTTON} flex-1`}
                onClick={() => setShowAddItem(false)}
              >
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleAddItem}
                disabled={!addItemName.trim() || addingItem}
              >
                {addingItem ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Adding...</span> : "Add Item"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Publish Confirm Modal ──────────────────────────────────────────── */}
      {showPublishConfirm && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-sm p-6`}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25">
                <Send className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className={T_SECTION}>Publish Plan?</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Publishing will make this plan visible to all kitchen staff.
              Once published, you cannot add or remove items.
            </p>
            <div className="flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowPublishConfirm(false)}>
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Publishing...</span> : "Yes, Publish"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Edit Assignees Modal ───────────────────────────────────────────── */}
      {showEditAssignees && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-sm p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-500/25">
                  <Users className="h-5 w-5 text-violet-400" />
                </div>
                <h3 className={T_SECTION}>Edit Assignees</h3>
              </div>
              <button onClick={() => setShowEditAssignees(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Search staff..."
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1 mb-5">
              {staffOptions
                .filter(name => !assigneeFilter.trim() || name.toLowerCase().includes(assigneeFilter.toLowerCase()))
                .map(name => (
                  <label key={name} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAssignees.includes(name)}
                      onChange={e => {
                        setEditAssignees(prev =>
                          e.target.checked ? [...prev, name] : prev.filter(n => n !== name)
                        );
                      }}
                      className="accent-violet-500"
                    />
                    <span className="text-sm text-zinc-200">{name}</span>
                  </label>
                ))}
              {staffOptions.filter(name => !assigneeFilter.trim() || name.toLowerCase().includes(assigneeFilter.toLowerCase())).length === 0 && (
                <p className="text-zinc-500 text-sm px-2">No staff found.</p>
              )}
            </div>
            {editAssignees.length > 0 && (
              <p className="text-xs text-violet-400 mb-3">{editAssignees.length} selected: {editAssignees.join(", ")}</p>
            )}
            <div className="flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowEditAssignees(false)}>
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleSaveAssignees}
                disabled={savingAssignees}
              >
                {savingAssignees
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span>
                  : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Per-item Assign Floating Bar ──────────────────────────────────── */}
      {selectedItems.size > 0 && typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-violet-500/40 bg-[#1a1730]/95 px-5 py-3 shadow-2xl backdrop-blur-md">
          <span className="text-sm font-medium text-violet-300">
            {selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} selected
          </span>
          <button
            className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/20 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-500/30"
            onClick={() => { setItemAssignees([]); setItemAssignFilter(""); setShowItemAssignModal(true); }}
          >
            <Users className="h-3.5 w-3.5" /> Assign Staff
          </button>
          <button
            className="text-zinc-500 hover:text-zinc-300"
            onClick={() => setSelectedItems(new Set())}
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>,
        document.body
      )}

      {/* ── Per-item Assign Modal ─────────────────────────────────────────── */}
      {showItemAssignModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-sm p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/15">
                  <Users className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h3 className={T_SECTION}>Assign to Items</h3>
                  <p className="text-xs text-zinc-400">{selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} selected</p>
                </div>
              </div>
              <button onClick={() => setShowItemAssignModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Search staff..."
              value={itemAssignFilter}
              onChange={e => setItemAssignFilter(e.target.value)}
            />
            <div className="mb-5 max-h-64 space-y-1 overflow-y-auto">
              {staffOptions
                .filter(name => !itemAssignFilter.trim() || name.toLowerCase().includes(itemAssignFilter.toLowerCase()))
                .map(name => (
                  <label key={name} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={itemAssignees.includes(name)}
                      onChange={e => setItemAssignees(prev => e.target.checked ? [...prev, name] : prev.filter(n => n !== name))}
                      className="accent-violet-500"
                    />
                    <span className="text-sm text-zinc-200">{name}</span>
                  </label>
                ))}
              {staffOptions.filter(name => !itemAssignFilter.trim() || name.toLowerCase().includes(itemAssignFilter.toLowerCase())).length === 0 && (
                <p className="px-2 text-sm text-zinc-500">No staff found.</p>
              )}
            </div>
            {itemAssignees.length > 0 && (
              <p className="mb-3 text-xs text-violet-400">{itemAssignees.length} selected: {itemAssignees.join(", ")}</p>
            )}
            <div className="flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setShowItemAssignModal(false)}>
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleSaveItemAssignees}
                disabled={savingItemAssignees}
              >
                {savingItemAssignees
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span>
                  : "Assign"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── QC Check Modal ─────────────────────────────────────────────────── */}
      {showQcModal && qcTargetItem && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${GLASS_CARD} w-full max-w-md p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-500/25">
                  <FlaskConical className="h-4 w-4 text-violet-400" />
                </div>
                <h3 className={T_SECTION}>QC Check</h3>
              </div>
              <button className="rounded-lg p-1 text-zinc-400 hover:text-white" onClick={() => setShowQcModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Item info */}
            <div className="mb-4 rounded-xl border border-white/8 bg-white/4 px-4 py-3">
              <p className="font-semibold text-white">{qcTargetItem.item_name}</p>
              <p className={T_CAPTION}>
                Target: {qcTargetItem.target_qty > 0 ? `${qcTargetItem.target_qty} ${qcTargetItem.unit}` : "—"}
                {qcTargetItem.completed_by && ` · Done by ${qcTargetItem.completed_by}`}
              </p>
            </div>

            <div className="space-y-4">
              {/* Actual qty */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Actual Qty Produced <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className={`${INPUT_CLASS} flex-1`}
                    placeholder="0"
                    min="0"
                    step="0.1"
                    value={qcActualQty}
                    onChange={e => setQcActualQty(e.target.value)}
                  />
                  <span className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-400">
                    {qcTargetItem.unit}
                  </span>
                </div>
              </div>

              {/* PASS / FAIL */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Result</label>
                <div className="flex gap-3">
                  <button
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                      qcResult === "PASS"
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                        : "border-white/10 bg-white/5 text-zinc-500 hover:border-emerald-500/20 hover:text-emerald-500/70"
                    }`}
                    onClick={() => setQcResult("PASS")}
                  >
                    ✓ PASS
                  </button>
                  <button
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                      qcResult === "FAIL"
                        ? "border-red-500/50 bg-red-500/20 text-red-400"
                        : "border-white/10 bg-white/5 text-zinc-500 hover:border-red-500/20 hover:text-red-500/70"
                    }`}
                    onClick={() => setQcResult("FAIL")}
                  >
                    ✗ FAIL
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes (optional)</label>
                <textarea
                  className={TEXTAREA_CLASS}
                  rows={2}
                  placeholder="Any QC notes, issues found..."
                  value={qcNotes}
                  onChange={e => setQcNotes(e.target.value)}
                />
              </div>

              {qcResult === "PASS" && (
                <p className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2 text-xs text-violet-400">
                  ✦ QC PASS will automatically update today&apos;s CK inventory with the actual quantity.
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                className={`${SECONDARY_BUTTON} flex-1`}
                onClick={() => setShowQcModal(false)}
                disabled={submittingQc}
              >
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={handleQcSubmit}
                disabled={!qcActualQty || submittingQc}
              >
                {submittingQc
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</span>
                  : `Submit QC ${qcResult}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
