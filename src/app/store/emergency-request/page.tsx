"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_BODY,
  BADGE_SUCCESS,
  BADGE_ERROR,
  BADGE_WARNING,
  BADGE_INFO,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EPRItem {
  item_name: string;
  qty: number;
  unit: string;
  estimated_unit_price: number;
  estimated_total: number;
  notes: string;
}

interface EPRRequest {
  id: number;
  city: string;
  store: string;
  requested_by: string;
  request_date: string;
  urgency: string;
  items: EPRItem[];
  total_estimated_amount: number;
  root_cause: string;
  root_cause_notes: string;
  supplier_name: string;
  status: string;
  approval_level: string;
  approved_by: string;
  approved_at: string | null;
  rejection_reason: string;
  final_amount: number | null;
  completed_by: string;
  completed_at: string | null;
  completion_notes: string;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const URGENCY_OPTIONS = [
  { value: "urgent_24h", label: "Urgent — Within 24h", color: "amber" },
  { value: "emergency_immediate", label: "Emergency — Immediate", color: "red" },
];

const ROOT_CAUSE_OPTIONS = [
  { value: "supplier_short_delivered", label: "Supplier Short-Delivered" },
  { value: "unexpected_high_demand", label: "Unexpected High Demand" },
  { value: "damage_spoilage", label: "Damage / Spoilage" },
  { value: "inventory_error", label: "Inventory Count Error" },
  { value: "other", label: "Other" },
];

const UNIT_OPTIONS = ["pc", "kg", "g", "L", "mL", "pack", "box", "bag", "bottle", "tray"];

const MANILA_STORES = ["Taft", "Paranaque", "Cubao"];

function urgencyBadge(u: string) {
  if (u === "emergency_immediate") return <span className={BADGE_ERROR}><AlertTriangle className="h-3 w-3" />Emergency</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Urgent 24h</span>;
}

function statusBadge(s: string) {
  if (s === "approved") return <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" />Approved</span>;
  if (s === "rejected") return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  if (s === "completed") return <span className={BADGE_INFO}>Completed</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400">Pending</span>;
}

function approvalLevelLabel(level: string) {
  if (level === "hq") return "HQ Approval Required";
  if (level === "ops_manager") return "Ops Manager Approval Required";
  return "";
}

// ─── Empty item factory ───────────────────────────────────────────────────────

function emptyItem(): EPRItem {
  return { item_name: "", qty: 1, unit: "pc", estimated_unit_price: 0, estimated_total: 0, notes: "" };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EmergencyRequestPage() {
  const router = useRouter();
  const auth = getAuth();

  const [tab, setTab] = useState<"form" | "history">("form");
  const [store, setStore] = useState("");
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
  const [urgency, setUrgency] = useState("urgent_24h");
  const [rootCause, setRootCause] = useState("supplier_short_delivered");
  const [rootCauseNotes, setRootCauseNotes] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [items, setItems] = useState<EPRItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [history, setHistory] = useState<EPRRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const city = (auth?.city || "manila").toLowerCase();

  const totalEstimated = items.reduce((s, i) => s + (Number(i.estimated_total) || 0), 0);
  const approvalLevel = totalEstimated > 5000 ? "hq" : "ops_manager";

  // ─── Load history ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/store/emergency-request/my?city=${encodeURIComponent(city)}&store=${encodeURIComponent(store)}`,
        { headers: getAuthHeaders() },
      );
      const data = await res.json();
      if (data.ok) setHistory(data.requests || []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [city, store]);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  // ─── Item helpers ─────────────────────────────────────────────────────────
  function updateItem(idx: number, field: keyof EPRItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx], [field]: value };
      if (field === "qty" || field === "estimated_unit_price") {
        item.estimated_total = Math.round(Number(item.qty) * Number(item.estimated_unit_price) * 100) / 100;
      }
      if (field === "estimated_total") {
        item.estimated_total = Number(value);
      }
      next[idx] = item;
      return next;
    });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!store.trim()) { setToast({ msg: "Select your store.", ok: false }); return; }
    if (!requestedBy.trim()) { setToast({ msg: "Enter your name.", ok: false }); return; }
    if (items.length === 0 || items.every((i) => !i.item_name.trim())) {
      setToast({ msg: "Add at least one item.", ok: false }); return;
    }
    const validItems = items.filter((i) => i.item_name.trim());
    setSubmitting(true);
    try {
      const res = await fetch("/api/store/emergency-request", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          store: store.trim(),
          requested_by: requestedBy.trim(),
          urgency,
          items: validItems,
          total_estimated_amount: totalEstimated,
          root_cause: rootCause,
          root_cause_notes: rootCauseNotes.trim(),
          supplier_name: supplierName.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ msg: "Request submitted. Awaiting approval.", ok: true });
        setItems([emptyItem()]);
        setRootCauseNotes("");
        setSupplierName("");
        setTab("history");
        setTimeout(loadHistory, 300);
      } else {
        setToast({ msg: data.detail || "Submission failed.", ok: false });
      }
    } catch {
      setToast({ msg: "Network error.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth) {
    router.push("/");
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
          <h1 className={T_PAGE_TITLE}>Emergency Procurement</h1>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.ok ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "bg-red-500/15 text-red-300 border border-red-500/25"}`}>
            {toast.msg}
          </div>
        )}

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button className={tab === "form" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("form")}>New Request</button>
          <button className={tab === "history" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("history")}>My Requests</button>
        </div>

        {/* ── Form Tab ── */}
        {tab === "form" && (
          <div className="space-y-4">
            <div className={`${GLASS_CARD} p-5 space-y-4`}>
              <p className={T_SECTION}>Request Details</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Store *</label>
                  <select className={`mt-1 ${SELECT_CLASS}`} value={store} onChange={(e) => setStore(e.target.value)}>
                    <option value="">Select store</option>
                    {MANILA_STORES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={T_LABEL}>Requested By *</label>
                  <input className={`mt-1 ${INPUT_CLASS}`} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Urgency *</label>
                  <select className={`mt-1 ${SELECT_CLASS}`} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={T_LABEL}>Supplier (optional)</label>
                  <input className={`mt-1 ${INPUT_CLASS}`} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Vendor name" />
                </div>
              </div>

              <div>
                <label className={T_LABEL}>Root Cause *</label>
                <select className={`mt-1 ${SELECT_CLASS}`} value={rootCause} onChange={(e) => setRootCause(e.target.value)}>
                  {ROOT_CAUSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className={T_LABEL}>Notes on Root Cause</label>
                <textarea className={`mt-1 ${TEXTAREA_CLASS}`} rows={2} value={rootCauseNotes} onChange={(e) => setRootCauseNotes(e.target.value)} placeholder="What happened? Which supplier, which order?" />
              </div>
            </div>

            {/* Items */}
            <div className={`${GLASS_CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <p className={T_SECTION}>Items Needed</p>
                <button className={SECONDARY_BUTTON} onClick={() => setItems((p) => [...p, emptyItem()])}>
                  <Plus className="h-4 w-4 inline mr-1" />Add Item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      className={`${INPUT_CLASS} flex-1`}
                      placeholder="Item name *"
                      value={item.item_name}
                      onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                    />
                    <button className={DANGER_BUTTON} onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className={T_LABEL}>Qty</label>
                      <input type="number" min={0.01} step="0.01" className={`mt-0.5 ${INPUT_CLASS}`} value={item.qty} onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className={T_LABEL}>Unit</label>
                      <select className={`mt-0.5 ${SELECT_CLASS}`} value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)}>
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={T_LABEL}>Unit Price (PHP)</label>
                      <input type="number" min={0} step="0.01" className={`mt-0.5 ${INPUT_CLASS}`} value={item.estimated_unit_price} onChange={(e) => updateItem(idx, "estimated_unit_price", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className={T_LABEL}>Total (PHP)</label>
                      <input type="number" min={0} step="0.01" className={`mt-0.5 ${INPUT_CLASS}`} value={item.estimated_total} onChange={(e) => updateItem(idx, "estimated_total", parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  <input className={INPUT_CLASS} placeholder="Notes (optional)" value={item.notes} onChange={(e) => updateItem(idx, "notes", e.target.value)} />
                </div>
              ))}

              {/* Total & Approval Level */}
              <div className={`rounded-xl border ${approvalLevel === "hq" ? "border-red-500/30 bg-red-500/8" : "border-amber-500/30 bg-amber-500/8"} p-3 flex justify-between items-center`}>
                <div>
                  <p className="text-xs font-semibold text-zinc-400">Total Estimated</p>
                  <p className="text-xl font-bold text-white">₱{totalEstimated.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                  <p className={`text-xs mt-0.5 ${approvalLevel === "hq" ? "text-red-400" : "text-amber-400"}`}>{approvalLevelLabel(approvalLevel)}</p>
                </div>
                {approvalLevel === "hq"
                  ? <AlertTriangle className="h-8 w-8 text-red-400" />
                  : <Clock className="h-8 w-8 text-amber-400" />
                }
              </div>
            </div>

            <button className={`w-full ${PRIMARY_BUTTON}`} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Emergency Request"}
            </button>
          </div>
        )}

        {/* ── History Tab ── */}
        {tab === "history" && (
          <div className={`${GLASS_CARD} p-5 space-y-3`}>
            <div className="flex items-center justify-between">
              <p className={T_SECTION}>My Requests</p>
              <button className={SECONDARY_BUTTON} onClick={loadHistory} disabled={loadingHistory}>
                <RefreshCw className={`h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingHistory && <p className={T_BODY}>Loading…</p>}
            {!loadingHistory && history.length === 0 && (
              <p className={T_BODY}>No requests yet.</p>
            )}

            {history.map((req) => (
              <div key={req.id} className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{req.store} — {req.request_date}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">By {req.requested_by}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {urgencyBadge(req.urgency)}
                    {statusBadge(req.status)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-xs text-zinc-300">
                  {req.items.map((it, i) => (
                    <span key={i} className="rounded-lg bg-white/5 border border-white/8 px-2 py-0.5">{it.item_name} ×{it.qty}{it.unit}</span>
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-zinc-500">
                    {ROOT_CAUSE_OPTIONS.find((o) => o.value === req.root_cause)?.label || req.root_cause}
                  </p>
                  <p className="text-sm font-semibold text-white">₱{Number(req.total_estimated_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                </div>
                {req.status === "rejected" && req.rejection_reason && (
                  <p className="text-xs text-red-400">Rejected: {req.rejection_reason}</p>
                )}
                {req.status === "approved" && (
                  <p className="text-xs text-emerald-400">Approved by {req.approved_by}</p>
                )}
                {req.status === "completed" && req.completion_notes && (
                  <p className="text-xs text-violet-400">Completed: {req.completion_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
