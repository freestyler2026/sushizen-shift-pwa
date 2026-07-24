"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  FlaskConical, Loader2, Package, Play, Plus, RotateCcw, Send, Trash2, X,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
  T_CAPTION, T_PAGE_TITLE, T_SECTION,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanStatus = "DRAFT" | "PUBLISHED";
type ItemStatus = "PENDING" | "IN_PROGRESS" | "DONE";
type Priority = "HIGH" | "MEDIUM" | "LOW";

type Plan = {
  id: number;
  city: string;
  plan_date: string;
  status: PlanStatus;
  created_by: string;
  notes: string;
  assigned_staff?: string[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  item_count?: number;
  done_count?: number;
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
  // CK is a Manila operation, so managers default to Manila and can toggle.
  const [city, setCity] = useState<"manila" | "dubai">(
    canManage ? "manila" : ((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);

  // New Plan modal
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlanDate, setNewPlanDate] = useState(todayIso());
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
          created_by: userName,
          notes: newPlanNotes.trim(),
          assigned_staff: newPlanStaff,
        }),
      });
      setShowNewPlan(false);
      setNewPlanNotes("");
      setNewPlanStaff([]);
      setNewPlanDate(todayIso());
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
    };
  }, [activePlan?.items]);

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

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${toast.ok ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
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
                  <div className={T_CAPTION + " mt-1"}>
                    {plan.item_count || 0} items · {plan.done_count || 0} done
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
        <div>
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
                <div className="mt-4 grid grid-cols-5 gap-3">
                  {[
                    { label: "Total", value: planStats.total, cls: "text-white" },
                    { label: "Pending", value: planStats.pending, cls: "text-zinc-400" },
                    { label: "In Progress", value: planStats.inProgress, cls: "text-blue-400" },
                    { label: "Done", value: planStats.done, cls: "text-emerald-400" },
                    { label: "QC Pass", value: planStats.qcPass, cls: "text-violet-400" },
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
                                <th className={`${TABLE_HEADER} pl-4 text-left`}>Item</th>
                                <th className={`${TABLE_HEADER} text-right`}>Target</th>
                                <th className={`${TABLE_HEADER} text-center`}>Priority</th>
                                <th className={`${TABLE_HEADER} text-center`}>Status</th>
                                <th className={`${TABLE_HEADER} text-center`}>QC</th>
                                <th className={`${TABLE_HEADER} pr-4 text-right`}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map(item => (
                                <tr key={item.id} className={`${TABLE_ROW} ${item.status === "DONE" ? "opacity-60" : ""}`}>
                                  <td className={`${TABLE_CELL} pl-4`}>
                                    <div>
                                      <p className="font-medium text-white">{item.item_name}</p>
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
                                    {item.target_qty > 0 ? `${item.target_qty % 1 === 0 ? item.target_qty : item.target_qty.toFixed(1)} ${item.unit}` : <span className="text-zinc-600">—</span>}
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
      </div>

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
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Plan Date</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={newPlanDate}
                  onChange={e => setNewPlanDate(e.target.value)}
                />
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
                  className={`${INPUT_CLASS} mb-1`}
                  placeholder="Search staff to add…"
                  value={staffFilter}
                  onChange={e => setStaffFilter(e.target.value)}
                />
                <div className="max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02]">
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
                  {staffOptions.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">No staff list loaded.</p>}
                </div>
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
