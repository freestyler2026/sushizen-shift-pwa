"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Clock, CheckCircle2, XCircle, RefreshCw, Truck, Package, PackageCheck, Banknote, Search } from "lucide-react";
import SelectDark from "@/components/SelectDark";
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
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EPRItem {
  item_name: string;
  qty: number;
  unit: string;
  estimated_unit_price: number;
  estimated_total: number;
  notes: string;
  current_stock: number;
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
  arranging_by: string;
  arranging_at: string | null;
  dispatched_by: string;
  dispatched_at: string | null;
  delivery_method: string;
  delivery_cost: number | null;
  received_by: string;
  received_at: string | null;
  created_at: string;
}

interface CatalogItem {
  item_name: string;
  unit: string;
  unit_price: number;
  supplier_name: string;
  catalog_category: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const URGENCY_OPTIONS = [
  { value: "urgent_24h", label: "Urgent — Within 24h" },
  { value: "emergency_immediate", label: "Emergency — Immediate" },
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
  if (s === "approved")   return <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" />Approved</span>;
  if (s === "rejected")   return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  if (s === "arranging")  return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 text-xs font-medium text-blue-300"><Package className="h-3 w-3" />Arranging</span>;
  if (s === "dispatched") return <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-300"><Truck className="h-3 w-3" />Dispatched — Awaiting Receipt</span>;
  if (s === "received")   return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-medium text-emerald-300"><PackageCheck className="h-3 w-3" />Received</span>;
  if (s === "completed")  return <span className={BADGE_INFO}><Banknote className="h-3 w-3" />Completed</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400"><Clock className="h-3 w-3" />Pending</span>;
}

function approvalLevelLabel(level: string) {
  if (level === "hq") return "HQ Approval Required";
  if (level === "ops_manager") return "Ops Manager Approval Required";
  return "";
}

function emptyItem(): EPRItem {
  return { item_name: "", qty: 1, unit: "pc", estimated_unit_price: 0, estimated_total: 0, notes: "", current_stock: 0 };
}

// ─── Catalog Autocomplete Input ───────────────────────────────────────────────

function CatalogItemInput({
  value,
  city,
  onChange,
  onSelect,
}: {
  value: string;
  city: string;
  onChange: (v: string) => void;
  onSelect: (item: CatalogItem) => void;
}) {
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/emergency-requests/catalog-search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`,
          { headers: getAuthHeaders() },
        );
        const data = await res.json();
        if (data.ok && data.items?.length > 0) {
          setSuggestions(data.items);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <input
          className={`${INPUT_CLASS} pl-8`}
          placeholder="Item name * (type to search catalog)"
          value={value}
          onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/6 text-left border-b border-white/5 last:border-0"
              onMouseDown={() => { onSelect(s); setOpen(false); setSuggestions([]); }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{s.item_name}</p>
                <p className="text-xs text-zinc-500">{s.catalog_category} · {s.supplier_name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-emerald-400">₱{Number(s.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-zinc-500">{s.unit}</p>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="w-full px-3 py-2 text-xs text-zinc-500 hover:bg-white/4 text-left"
            onMouseDown={() => { setOpen(false); }}
          >
            Use as typed: &quot;{value}&quot;
          </button>
        </div>
      )}
    </div>
  );
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
  const [receivingId, setReceivingId] = useState<number | null>(null);

  const city = (auth?.city || "manila").toLowerCase();
  const actorName = auth?.staffName || "";

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

  function selectCatalogItem(idx: number, cat: CatalogItem) {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      item.item_name = cat.item_name;
      item.unit = cat.unit || item.unit;
      item.estimated_unit_price = cat.unit_price;
      item.estimated_total = Math.round(Number(item.qty) * cat.unit_price * 100) / 100;
      next[idx] = item;
      return next;
    });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // ─── Receive ──────────────────────────────────────────────────────────────
  async function handleReceive(reqId: number) {
    setReceivingId(reqId);
    try {
      const res = await fetch(`/api/store/emergency-request/${reqId}/receive`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ received_by: actorName }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ msg: "Receipt confirmed. Thank you!", ok: true });
        loadHistory();
      } else {
        setToast({ msg: data.detail || "Failed to confirm receipt.", ok: false });
      }
    } catch {
      setToast({ msg: "Network error.", ok: false });
    } finally {
      setReceivingId(null);
    }
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
                  <SelectDark
                    className={`mt-1 ${SELECT_CLASS}`}
                    value={store}
                    onChange={setStore}
                    options={[
                      { value: "", label: "Select store" },
                      ...MANILA_STORES.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Requested By *</label>
                  <input className={`mt-1 ${INPUT_CLASS}`} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Urgency *</label>
                  <SelectDark
                    className={`mt-1 ${SELECT_CLASS}`}
                    value={urgency}
                    onChange={setUrgency}
                    options={URGENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Supplier (optional)</label>
                  <input className={`mt-1 ${INPUT_CLASS}`} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Vendor name" />
                </div>
              </div>

              <div>
                <label className={T_LABEL}>Root Cause *</label>
                <SelectDark
                  className={`mt-1 ${SELECT_CLASS}`}
                  value={rootCause}
                  onChange={setRootCause}
                  options={ROOT_CAUSE_OPTIONS}
                />
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
                    <CatalogItemInput
                      value={item.item_name}
                      city={city}
                      onChange={(v) => updateItem(idx, "item_name", v)}
                      onSelect={(cat) => selectCatalogItem(idx, cat)}
                    />
                    <button className={DANGER_BUTTON} onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <label className={T_LABEL}>Stock</label>
                      <input type="number" min={0} step="0.01" className={`mt-0.5 ${INPUT_CLASS}`} value={item.current_stock} onChange={(e) => updateItem(idx, "current_stock", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div>
                      <label className={T_LABEL}>Qty</label>
                      <input type="number" min={0.01} step="0.01" className={`mt-0.5 ${INPUT_CLASS}`} value={item.qty} onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className={T_LABEL}>Unit</label>
                      <SelectDark
                        className={`mt-0.5 ${SELECT_CLASS}`}
                        value={item.unit}
                        onChange={(v) => updateItem(idx, "unit", v)}
                        options={UNIT_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className={T_LABEL}>Unit Price</label>
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
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {urgencyBadge(req.urgency)}
                    {statusBadge(req.status)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 text-xs text-zinc-300">
                  {req.items.map((it, i) => (
                    <span key={i} className="rounded-lg bg-white/5 border border-white/8 px-2 py-0.5">
                      {it.item_name} ×{it.qty}{it.unit}
                      {it.current_stock > 0 && <span className="text-zinc-500 ml-1">(Stock:{it.current_stock})</span>}
                    </span>
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
                  <p className="text-xs text-emerald-400">✓ Approved by {req.approved_by}. Procurement is arranging.</p>
                )}
                {req.status === "arranging" && (
                  <p className="text-xs text-blue-400">📦 Procurement is arranging delivery ({req.arranging_by}).</p>
                )}
                {req.status === "dispatched" && (
                  <div className="space-y-2">
                    <p className="text-xs text-violet-400">
                      🚚 On the way — dispatched by {req.dispatched_by}
                      {req.delivery_method === "lalamove" ? " via Lalamove" : " (in-house)"}
                      {req.delivery_cost != null && ` · Delivery: ₱${Number(req.delivery_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                    </p>
                    <button
                      className={`w-full ${PRIMARY_BUTTON} py-2 text-sm`}
                      disabled={receivingId === req.id}
                      onClick={() => handleReceive(req.id)}
                    >
                      <PackageCheck className="h-4 w-4 inline mr-1" />
                      {receivingId === req.id ? "Confirming…" : "Confirm Receipt"}
                    </button>
                  </div>
                )}
                {req.status === "received" && (
                  <p className="text-xs text-emerald-400">✅ Received by {req.received_by} — awaiting payroll/completion.</p>
                )}
                {req.status === "completed" && req.completion_notes && (
                  <p className="text-xs text-violet-400">✓ Completed: {req.completion_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
