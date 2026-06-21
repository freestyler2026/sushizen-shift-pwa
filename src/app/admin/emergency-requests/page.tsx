"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, BarChart3,
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
  T_CAPTION,
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
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
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

const ALLOWED_ROLES = new Set(["ADMIN", "HQ", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

const ROOT_CAUSE_LABELS: Record<string, string> = {
  supplier_short_delivered: "Supplier Short-Delivered",
  unexpected_high_demand: "Unexpected High Demand",
  damage_spoilage: "Damage / Spoilage",
  inventory_error: "Inventory Count Error",
  other: "Other",
};

// ─── Badge helpers ────────────────────────────────────────────────────────────

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
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | "complete" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function doAction(action: "approve" | "reject" | "complete") {
    setLoading(true);
    setError("");
    try {
      let body: Record<string, unknown> = { approved_by: actorName };
      if (action === "approve") body = { approved_by: actorName, final_amount: parseFloat(approveAmount) || null };
      if (action === "reject") body = { approved_by: actorName, rejection_reason: rejectReason };
      if (action === "complete") body = { completed_by: actorName, final_amount: parseFloat(completeAmount) || null, completion_notes: completeNotes };
      const res = await fetch(`/api/admin/emergency-requests/${req.id}/${action}`, {
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

  const isPending = req.status === "pending";
  const isApproved = req.status === "approved";

  return (
    <div className={`rounded-xl border ${req.urgency === "emergency_immediate" ? "border-red-500/25 bg-red-500/5" : "border-amber-500/15 bg-white/4"} p-4 space-y-3`}>
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
        </div>
      </div>

      {/* Items summary */}
      <div className="flex flex-wrap gap-1">
        {req.items.map((it, i) => (
          <span key={i} className="rounded-lg bg-white/6 border border-white/8 px-2 py-0.5 text-xs text-zinc-200">
            {it.item_name} ×{it.qty}{it.unit}
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
          {req.rejection_reason && <p className="text-red-400"><span className="text-zinc-500">Rejected:</span> {req.rejection_reason}</p>}
          {req.completion_notes && <p><span className="text-zinc-500">Completion:</span> {req.completion_notes}</p>}
          <p className="text-zinc-500">Submitted {req.created_at}</p>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Action buttons */}
      {isPending && !confirmAction && (
        <div className="flex gap-2">
          <button className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("approve")}>
            <CheckCircle2 className="h-4 w-4 inline mr-1" />Approve
          </button>
          <button className={`flex-1 ${DANGER_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("reject")}>
            <XCircle className="h-4 w-4 inline mr-1" />Reject
          </button>
        </div>
      )}

      {isApproved && !confirmAction && (
        <button className={`w-full ${SECONDARY_BUTTON} py-2 text-sm`} onClick={() => setConfirmAction("complete")}>
          Mark as Completed
        </button>
      )}

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

  const totalAmount = requests.reduce((s, r) => s + Number(r.total_estimated_amount), 0);
  const approvedAmount = requests
    .filter((r) => r.status === "approved" || r.status === "completed")
    .reduce((s, r) => s + Number(r.final_amount ?? r.total_estimated_amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Requests</p>
          <p className={KPI_VALUE}>{requests.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Pending</p>
          <p className={`${KPI_VALUE} text-amber-400`}>{byStatus.pending || 0}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Estimated</p>
          <p className={KPI_VALUE}>₱{totalAmount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Approved Amount</p>
          <p className={`${KPI_VALUE} text-emerald-400`}>₱{approvedAmount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminEmergencyRequestsPage() {
  const router = useRouter();
  const auth = getAuth();
  const role = (auth?.role || "").toUpperCase();

  const [tab, setTab] = useState<"pending" | "all" | "analytics">("pending");
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

  const pending = requests.filter((r) => r.status === "pending");
  const emergencies = pending.filter((r) => r.urgency === "emergency_immediate");

  const filtered = tab === "pending" ? pending : requests;

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

        {/* Emergency alert */}
        {emergencies.length > 0 && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-300">
              {emergencies.length} immediate emergency request{emergencies.length > 1 ? "s" : ""} awaiting approval
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button className={tab === "pending" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("pending")}>
            Pending {pending.length > 0 && <span className="ml-1.5 rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.5">{pending.length}</span>}
          </button>
          <button className={tab === "all" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("all")}>All Requests</button>
          <button className={tab === "analytics" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("analytics")}>
            <BarChart3 className="h-3.5 w-3.5 inline mr-1" />Analytics
          </button>
        </div>

        {tab === "analytics" ? (
          <AnalyticsView requests={requests} />
        ) : (
          <div className="space-y-3">
            {loading && <p className={T_BODY}>Loading…</p>}
            {!loading && filtered.length === 0 && (
              <div className={`${GLASS_CARD} p-6 text-center`}>
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className={T_BODY}>{tab === "pending" ? "No pending requests." : "No requests yet."}</p>
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
