"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, BarChart3, Truck, Package,
  PackageCheck, Banknote,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
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
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EPRItem {
  item_name: string;
  qty: number;
  unit: string;
  estimated_unit_price: number;
  estimated_total: number;
  notes: string;
  current_stock?: number;
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

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

const ROOT_CAUSE_LABELS: Record<string, string> = {
  supplier_short_delivered: "Supplier Short-Delivered",
  unexpected_high_demand: "Unexpected High Demand",
  damage_spoilage: "Damage / Spoilage",
  inventory_error: "Inventory Count Error",
  other: "Other",
};

type TabKey = "pending" | "approved" | "dispatched" | "received" | "completed" | "all" | "analytics";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(req: EPRRequest): boolean {
  if (["received", "completed", "rejected"].includes(req.status)) return false;
  const created = new Date(req.created_at).getTime();
  return Date.now() - created > 24 * 60 * 60 * 1000;
}

function urgencyBadge(u: string) {
  if (u === "emergency_immediate") return <span className={BADGE_ERROR}><AlertTriangle className="h-3 w-3" />Emergency</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Urgent 24h</span>;
}

function statusBadge(s: string) {
  if (s === "approved")   return <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" />Approved</span>;
  if (s === "rejected")   return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  if (s === "arranging")  return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 text-xs font-medium text-blue-300"><Package className="h-3 w-3" />Arranging</span>;
  if (s === "dispatched") return <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-300"><Truck className="h-3 w-3" />Dispatched</span>;
  if (s === "received")   return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-medium text-emerald-300"><PackageCheck className="h-3 w-3" />Received</span>;
  if (s === "completed")  return <span className={BADGE_INFO}><Banknote className="h-3 w-3" />Completed</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400"><Clock className="h-3 w-3" />Pending</span>;
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  actorName,
  onAction,
}: {
  req: EPRRequest;
  actorName: string;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approveAmount, setApproveAmount] = useState(String(req.total_estimated_amount));
  const [rejectReason, setRejectReason] = useState("");
  const [completeAmount, setCompleteAmount] = useState(String(req.final_amount ?? req.total_estimated_amount));
  const [completeNotes, setCompleteNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("in_house");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "approve" | "reject" | "arrange" | "dispatch" | "receive" | "complete" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function doAction(action: "approve" | "reject" | "arrange" | "dispatch" | "receive" | "complete") {
    setLoading(true);
    setError("");
    try {
      const endpoint = action === "receive"
        ? `/api/store/emergency-request/${req.id}/receive`
        : `/api/admin/emergency-requests/${req.id}/${action}`;
      let body: Record<string, unknown> = {};

      if (action === "approve") {
        body = { approved_by: actorName, final_amount: parseFloat(approveAmount) || null };
      } else if (action === "reject") {
        body = { approved_by: actorName, rejection_reason: rejectReason };
      } else if (action === "arrange") {
        body = { arranged_by: actorName };
      } else if (action === "dispatch") {
        body = {
          dispatched_by: actorName,
          delivery_method: deliveryMethod,
          delivery_cost: deliveryMethod === "lalamove" ? (parseFloat(deliveryCost) || null) : null,
        };
      } else if (action === "receive") {
        body = { received_by: actorName };
      } else if (action === "complete") {
        body = { completed_by: actorName, final_amount: parseFloat(completeAmount) || null, completion_notes: completeNotes };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) { onAction(); }
      else setError(data.detail || "Action failed");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  }

  const overdue = isOverdue(req);
  const borderClass = overdue
    ? "border-red-500/50 bg-red-500/8"
    : req.urgency === "emergency_immediate"
    ? "border-red-500/25 bg-red-500/5"
    : "border-amber-500/15 bg-white/4";

  return (
    <div className={`rounded-xl border ${borderClass} p-4 space-y-3`}>
      {/* Overdue alert */}
      {overdue && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <p className="text-xs font-semibold text-red-300">⚠️ Overdue — 24h elapsed without completion</p>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white">{req.store}</p>
            <p className="text-xs text-zinc-400">{req.request_date} · by {req.requested_by}</p>
          </div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {urgencyBadge(req.urgency)}
            {statusBadge(req.status)}
            {req.approval_level && (
              <span className={req.approval_level === "hq" ? BADGE_ERROR : BADGE_WARNING}>
                {req.approval_level === "hq" ? "HQ Required" : "Ops Mgr"}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-white">₱{Number(req.total_estimated_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
          {req.final_amount != null && req.final_amount !== req.total_estimated_amount && (
            <p className="text-xs text-emerald-400">Final: ₱{Number(req.final_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
          )}
          {req.delivery_cost != null && (
            <p className="text-xs text-violet-400">Delivery: ₱{Number(req.delivery_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
          )}
        </div>
      </div>

      {/* Items summary */}
      <div className="flex flex-wrap gap-1">
        {req.items.map((it, i) => (
          <span key={i} className="rounded-lg bg-white/6 border border-white/8 px-2 py-0.5 text-xs text-zinc-200">
            {it.item_name} ×{it.qty}{it.unit}
            {it.current_stock != null && it.current_stock > 0 && <span className="text-zinc-500 ml-1">(Stock:{it.current_stock})</span>}
            {it.estimated_total > 0 && <span className="text-zinc-400"> ₱{Number(it.estimated_total).toFixed(0)}</span>}
          </span>
        ))}
      </div>

      {/* Root cause */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-zinc-400">
          {ROOT_CAUSE_LABELS[req.root_cause] || req.root_cause}
          {req.supplier_name && <span className="ml-1 text-zinc-500">· {req.supplier_name}</span>}
        </p>
        <button className="text-xs text-violet-400 hover:text-violet-200 flex items-center gap-0.5" onClick={() => setExpanded((x) => !x)}>
          {expanded ? <><ChevronUp className="h-3 w-3" />Less</> : <><ChevronDown className="h-3 w-3" />Details</>}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="rounded-xl border border-white/6 bg-white/3 p-3 space-y-1 text-xs text-zinc-300">
          {req.root_cause_notes && <p><span className="text-zinc-500">Notes:</span> {req.root_cause_notes}</p>}
          {req.approved_by && <p><span className="text-zinc-500">Approved by:</span> {req.approved_by} {req.approved_at ? `at ${req.approved_at}` : ""}</p>}
          {req.arranging_by && <p><span className="text-zinc-500">Arranging by:</span> {req.arranging_by} {req.arranging_at ? `at ${req.arranging_at}` : ""}</p>}
          {req.dispatched_by && (
            <p>
              <span className="text-zinc-500">Dispatched by:</span> {req.dispatched_by} {req.dispatched_at ? `at ${req.dispatched_at}` : ""}
              {req.delivery_method && <span className="ml-1 text-violet-400">({req.delivery_method === "lalamove" ? "Lalamove" : "In-house"})</span>}
            </p>
          )}
          {req.received_by && <p><span className="text-zinc-500">Received by:</span> {req.received_by} {req.received_at ? `at ${req.received_at}` : ""}</p>}
          {req.rejection_reason && <p className="text-red-400"><span className="text-zinc-500">Rejected:</span> {req.rejection_reason}</p>}
          {req.completion_notes && <p><span className="text-zinc-500">Completion:</span> {req.completion_notes}</p>}
          <p className="text-zinc-500">Submitted {req.created_at}</p>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Action buttons */}
      {req.status === "pending" && !confirmAction && (
        <div className="flex gap-2">
          <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("approve")}>
            <CheckCircle2 className="h-4 w-4 inline mr-1" />Approve
          </button>
          <button className={`flex-1 ${DANGER_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("reject")}>
            <XCircle className="h-4 w-4 inline mr-1" />Reject
          </button>
        </div>
      )}

      {req.status === "approved" && !confirmAction && (
        <button className={`w-full ${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("arrange")}>
          <Package className="h-4 w-4 inline mr-1" />Start Arranging
        </button>
      )}

      {req.status === "arranging" && !confirmAction && (
        <button className={`w-full ${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("dispatch")}>
          <Truck className="h-4 w-4 inline mr-1" />Mark Dispatched
        </button>
      )}

      {req.status === "dispatched" && !confirmAction && (
        <button className={`w-full ${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("receive")}>
          <PackageCheck className="h-4 w-4 inline mr-1" />Mark as Received
        </button>
      )}

      {req.status === "received" && !confirmAction && (
        <button className={`w-full ${PRIMARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("complete")}>
          <Banknote className="h-4 w-4 inline mr-1" />Mark Completed
        </button>
      )}

      {/* Confirm panels */}
      {confirmAction === "approve" && (
        <div className="space-y-2">
          <label className={T_LABEL}>Final Approved Amount (PHP)</label>
          <input type="number" className={INPUT_CLASS} value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} />
          <div className="flex gap-2">
            <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("approve")}>
              {loading ? "…" : "Confirm Approve"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirmAction === "reject" && (
        <div className="space-y-2">
          <label className={T_LABEL}>Rejection Reason</label>
          <textarea className={TEXTAREA_CLASS} rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this rejected?" />
          <div className="flex gap-2">
            <button className={`flex-1 ${DANGER_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("reject")}>
              {loading ? "…" : "Confirm Reject"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirmAction === "arrange" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Confirm you are starting arrangement (contacting WH/CK/supplier)?</p>
          <div className="flex gap-2">
            <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("arrange")}>
              {loading ? "…" : "Confirm — Start Arranging"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirmAction === "dispatch" && (
        <div className="space-y-2">
          <label className={T_LABEL}>Delivery Method</label>
          <SelectDark
            value={deliveryMethod}
            onChange={setDeliveryMethod}
            options={[
              { value: "in_house", label: "In-house Driver" },
              { value: "lalamove", label: "Lalamove (3rd party)" },
            ]}
          />
          {deliveryMethod === "lalamove" && (
            <>
              <label className={T_LABEL}>Lalamove Cost (PHP)</label>
              <input type="number" min={0} step="0.01" className={INPUT_CLASS} value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} placeholder="0.00" />
            </>
          )}
          <div className="flex gap-2">
            <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("dispatch")}>
              {loading ? "…" : "Confirm Dispatch"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirmAction === "receive" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Confirm store has received this delivery?</p>
          <div className="flex gap-2">
            <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("receive")}>
              {loading ? "…" : "Confirm Receipt"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirmAction === "complete" && (
        <div className="space-y-2">
          <label className={T_LABEL}>Final Amount (PHP)</label>
          <input type="number" className={INPUT_CLASS} value={completeAmount} onChange={(e) => setCompleteAmount(e.target.value)} />
          <label className={T_LABEL}>Completion Notes</label>
          <textarea className={TEXTAREA_CLASS} rows={2} value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} placeholder="What was procured? How?" />
          <div className="flex gap-2">
            <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} disabled={loading} onClick={() => doAction("complete")}>
              {loading ? "…" : "Mark Completed"}
            </button>
            <button className={`${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function AnalyticsView({ requests }: { requests: EPRRequest[] }) {
  const byStatus = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const byRootCause = requests.reduce<Record<string, number>>((acc, r) => {
    const label = ROOT_CAUSE_LABELS[r.root_cause] || r.root_cause;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const byStore = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.store] = (acc[r.store] || 0) + 1;
    return acc;
  }, {});

  const approvedAmount = requests
    .filter((r) => ["approved", "arranging", "dispatched", "received", "completed"].includes(r.status))
    .reduce((s, r) => s + Number(r.final_amount ?? r.total_estimated_amount), 0);
  const totalDeliveryCost = requests
    .filter((r) => r.delivery_cost != null)
    .reduce((s, r) => s + Number(r.delivery_cost), 0);
  const overdueCount = requests.filter(isOverdue).length;

  const statusOrder = ["pending", "approved", "arranging", "dispatched", "received", "completed", "rejected"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Requests</p>
          <p className={KPI_VALUE}>{requests.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Overdue (24h+)</p>
          <p className={`${KPI_VALUE} ${overdueCount > 0 ? "text-red-400" : "text-emerald-400"}`}>{overdueCount}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Approved Amount</p>
          <p className={`${KPI_VALUE} text-emerald-400`}>₱{approvedAmount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Delivery Cost</p>
          <p className={`${KPI_VALUE} text-violet-400`}>₱{totalDeliveryCost.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`${GLASS_CARD} p-4 space-y-2`}>
          <p className={T_SECTION}>By Status</p>
          {statusOrder.filter((s) => byStatus[s]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex-1">{statusBadge(s)}</div>
              <div className="w-6 text-right text-xs text-zinc-400">{byStatus[s]}</div>
            </div>
          ))}
        </div>

        <div className={`${GLASS_CARD} p-4 space-y-2`}>
          <p className={T_SECTION}>By Store</p>
          {Object.entries(byStore).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="flex-1 text-sm text-zinc-300">{k}</div>
              <div className="w-24 h-2 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.round(v / requests.length * 100)}%` }} />
              </div>
              <div className="w-6 text-right text-xs text-zinc-400">{v}</div>
            </div>
          ))}
        </div>

        <div className={`${GLASS_CARD} p-4 space-y-2`}>
          <p className={T_SECTION}>By Root Cause</p>
          {Object.entries(byRootCause).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="flex-1 text-sm text-zinc-300">{k}</div>
              <div className="w-24 h-2 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round(v / requests.length * 100)}%` }} />
              </div>
              <div className="w-6 text-right text-xs text-zinc-400">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminEmergencyRequestsPage() {
  const router = useRouter();
  const auth = getAuth();
  const role = (auth?.role || "").toUpperCase();

  const [tab, setTab] = useState<TabKey>("pending");
  const [requests, setRequests] = useState<EPRRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const actorName = auth?.staffName || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/emergency-requests?limit=200", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) setRequests(data.requests || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!auth || !ALLOWED_ROLES.has(role)) {
    router.push("/");
    return null;
  }

  const pending    = requests.filter((r) => r.status === "pending");
  const approved   = requests.filter((r) => ["approved", "arranging"].includes(r.status));
  const dispatched = requests.filter((r) => r.status === "dispatched");
  const received   = requests.filter((r) => r.status === "received");
  const completed  = requests.filter((r) => r.status === "completed");
  const overdue    = requests.filter(isOverdue);

  const filtered =
    tab === "pending"    ? pending    :
    tab === "approved"   ? approved   :
    tab === "dispatched" ? dispatched :
    tab === "received"   ? received   :
    tab === "completed"  ? completed  :
    tab === "all"        ? requests   : requests;

  const tabs: { key: TabKey; label: string; count?: number; alertColor?: string }[] = [
    { key: "pending",    label: "Pending",    count: pending.length,    alertColor: pending.length > 0 ? "bg-amber-500" : undefined },
    { key: "approved",   label: "Approved",   count: approved.length,   alertColor: approved.length > 0 ? "bg-blue-500" : undefined },
    { key: "dispatched", label: "Dispatched", count: dispatched.length, alertColor: dispatched.length > 0 ? "bg-violet-500" : undefined },
    { key: "received",   label: "Received",   count: received.length,   alertColor: received.length > 0 ? "bg-emerald-500" : undefined },
    { key: "completed",  label: "Completed" },
    { key: "all",        label: "All" },
    { key: "analytics",  label: "Analytics" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
            <h1 className={T_PAGE_TITLE}>Emergency Requests</h1>
          </div>
          <button className={SECONDARY_BUTTON} onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Overdue alert banner */}
        {overdue.length > 0 && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-300">
              {overdue.length} request{overdue.length > 1 ? "s" : ""} overdue (24h+ without completion) — action required
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className={`${TAB_CONTAINER} flex-wrap`}>
          {tabs.map(({ key, label, count, alertColor }) => (
            <button
              key={key}
              className={`${tab === key ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1`}
              onClick={() => setTab(key)}
            >
              {key === "analytics" && <BarChart3 className="h-3.5 w-3.5" />}
              {label}
              {count !== undefined && count > 0 && (
                <span className={`ml-0.5 rounded-full ${alertColor || "bg-zinc-600"} text-white text-[10px] px-1.5 py-0.5`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "analytics" ? (
          <AnalyticsView requests={requests} />
        ) : (
          <div className="space-y-3">
            {loading && <p className={T_BODY}>Loading…</p>}
            {!loading && filtered.length === 0 && (
              <div className={`${GLASS_CARD} p-6 text-center`}>
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className={T_BODY}>No requests in this category.</p>
              </div>
            )}
            {filtered.map((req) => (
              <RequestCard key={req.id} req={req} actorName={actorName} onAction={load} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
