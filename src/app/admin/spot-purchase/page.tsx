"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, getUploadHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DANGER_BUTTON,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TEXTAREA_CLASS,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type SPRItem = {
  name: string;
  qty: number;
  unit: string;
  vendor: string;
  item_url: string;
  unit_price: number | null;
  notes: string;
  photo_url: string;
};

type SPRRequest = {
  id: number;
  request_no: string;
  status: string;
  location: string;
  needed_by_date: string;
  purpose: string;
  items: SPRItem[];
  total_budget: number | null;
  requested_by: string;
  requested_at: string;
  approval_notes: string;
  rejection_reason: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  purchased_by: string | null;
  purchased_at: string | null;
  receipt_url: string;
  receipt_notes: string;
};

type TabKey = "PENDING" | "APPROVED" | "PURCHASED" | "ALL";

const APPROVER_ROLES = new Set(["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "PENDING":   return <span className={BADGE_WARNING}>Pending</span>;
    case "APPROVED":  return <span className={BADGE_INFO}>Approved</span>;
    case "PURCHASED": return <span className={BADGE_SUCCESS}>Purchased</span>;
    case "REJECTED":  return <span className={BADGE_ERROR}>Rejected</span>;
    default:          return <span className={BADGE_INFO}>{status}</span>;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSpotPurchasePage() {
  const router = useRouter();
  const initialAuth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [auth, setAuthState] = useState(initialAuth);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    refreshAuthFromApi(getAuth()).then((refreshed) => {
      if (cancelled) return;
      const resolved = refreshed || getAuth() || initialAuth;
      if (!resolved?.staffName) {
        router.replace(`/login?next=${encodeURIComponent("/admin/spot-purchase")}`);
        return;
      }
      const role = resolved.role || "";
      if (!APPROVER_ROLES.has(role)) {
        setReady(true);
        setAllowed(false);
        return;
      }
      setAuthState(resolved);
      setAllowed(true);
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      const fallback = getAuth() || initialAuth;
      if (!fallback?.staffName) {
        router.replace(`/login?next=${encodeURIComponent("/admin/spot-purchase")}`);
        return;
      }
      const role = fallback?.role || "";
      setAuthState(fallback);
      setAllowed(APPROVER_ROLES.has(role));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 flex items-center justify-center">
        <p className="text-zinc-400">Access denied.</p>
      </main>
    );
  }

  return <SpotPurchaseAdmin auth={auth} />;
}

// ─── Admin App ────────────────────────────────────────────────────────────────

function SpotPurchaseAdmin({ auth }: { auth: ReturnType<typeof getAuth> }) {
  const [tab, setTab] = useState<TabKey>("PENDING");
  const [requests, setRequests] = useState<SPRRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Action state per request
  const [approveNotes, setApproveNotes] = useState<Record<number, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [actionMode, setActionMode] = useState<Record<number, "approve" | "reject" | "complete" | null>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [actionError, setActionError] = useState<Record<number, string>>({});

  // Complete form
  const [completePurchasedBy, setCompletePurchasedBy] = useState<Record<number, string>>({});
  const [completeNotes, setCompleteNotes] = useState<Record<number, string>>({});
  const receiptInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [receiptFile, setReceiptFile] = useState<Record<number, File | null>>({});

  async function loadRequests(statusFilter: TabKey) {
    setLoading(true);
    try {
      const qs = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/admin/spot-purchase/requests${qs}`, {
        headers: getAuthHeaders(auth),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests(tab);
    setExpandedId(null);
  }, [tab]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function doApprove(id: number) {
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/spot-purchase/requests/${id}/approve`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: auth?.staffName || "", notes: approveNotes[id] || "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        throw new Error(err.detail || "Failed");
      }
      setActionMode((p) => ({ ...p, [id]: null }));
      loadRequests(tab);
    } catch (e: unknown) {
      setActionError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function doReject(id: number) {
    if (!(rejectReason[id] || "").trim()) {
      setActionError((p) => ({ ...p, [id]: "Rejection reason is required" }));
      return;
    }
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/spot-purchase/requests/${id}/reject`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ rejected_by: auth?.staffName || "", reason: rejectReason[id] || "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        throw new Error(err.detail || "Failed");
      }
      setActionMode((p) => ({ ...p, [id]: null }));
      loadRequests(tab);
    } catch (e: unknown) {
      setActionError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function doComplete(id: number) {
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError((p) => ({ ...p, [id]: "" }));
    try {
      const form = new FormData();
      form.append("purchased_by", completePurchasedBy[id] || auth?.staffName || "");
      form.append("receipt_notes", completeNotes[id] || "");
      if (receiptFile[id]) form.append("receipt_file", receiptFile[id] as File);
      const res = await fetch(`/api/admin/spot-purchase/requests/${id}/complete`, {
        method: "POST",
        headers: getUploadHeaders(auth),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        throw new Error(err.detail || "Failed");
      }
      setActionMode((p) => ({ ...p, [id]: null }));
      setReceiptFile((p) => ({ ...p, [id]: null }));
      loadRequests(tab);
    } catch (e: unknown) {
      setActionError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Counts are reflected by the requests array length when each tab is active

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 p-4 pb-20">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className={T_PAGE_TITLE}>Spot Purchase</h1>
            <p className={T_CAPTION + " mt-0.5"}>Kitchen equipment &amp; appliance requests</p>
          </div>
          <button className={SMALL_BUTTON} onClick={() => loadRequests(tab)}>Refresh</button>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          {(["PENDING", "APPROVED", "PURCHASED", "ALL"] as TabKey[]).map((t) => (
            <button key={t} className={tab === t ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab(t)}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* List */}
        {loading && <p className={T_CAPTION}>Loading…</p>}
        {!loading && requests.length === 0 && (
          <div className={`${GLASS_CARD} p-6 text-center`}>
            <p className="text-zinc-400">No {tab === "ALL" ? "" : tab.toLowerCase() + " "}requests.</p>
          </div>
        )}

        {requests.map((req) => (
          <div key={req.id} className={GLASS_CARD}>
            {/* Header row */}
            <div
              className="flex items-start justify-between p-5 cursor-pointer"
              onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">{req.request_no}</span>
                  {statusBadge(req.status)}
                </div>
                <p className="text-sm text-zinc-300">{req.purpose}</p>
                <p className={T_CAPTION}>
                  {req.requested_by} · {req.location} · Needed by {fmtDate(req.needed_by_date)}
                  {req.total_budget != null && ` · Budget ₱${req.total_budget.toLocaleString()}`}
                </p>
                <p className={T_CAPTION}>{req.items.length} item{req.items.length !== 1 ? "s" : ""} · Submitted {fmtDateTime(req.requested_at)}</p>
              </div>
              <span className="text-zinc-500 text-sm ml-3">{expandedId === req.id ? "▲" : "▼"}</span>
            </div>

            {/* Expanded detail */}
            {expandedId === req.id && (
              <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-4">
                {/* Items list */}
                <div className="space-y-2">
                  <p className={T_SECTION}>Items</p>
                  {req.items.map((it, i) => (
                    <div key={i} className="rounded-xl border border-white/6 bg-white/3 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{it.name}</p>
                        {it.photo_url && (
                          <a href={it.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 underline whitespace-nowrap">Photo</a>
                        )}
                      </div>
                      <p className={T_CAPTION}>
                        {it.qty} {it.unit}
                        {it.vendor && ` · ${it.vendor}`}
                        {it.unit_price != null && ` · ₱${it.unit_price.toLocaleString()}`}
                      </p>
                      {it.notes && <p className={T_CAPTION}>{it.notes}</p>}
                      {it.item_url && (
                        <a href={it.item_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 underline break-all">View listing</a>
                      )}
                    </div>
                  ))}
                </div>

                {/* Status history */}
                {req.status === "APPROVED" && (
                  <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                    <p className={T_LABEL + " mb-0.5"}>Approved</p>
                    <p className="text-sm text-violet-300">{req.approved_by} · {fmtDate(req.approved_at)}</p>
                    {req.approval_notes && <p className={T_CAPTION + " mt-0.5"}>{req.approval_notes}</p>}
                  </div>
                )}
                {req.status === "REJECTED" && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <p className={T_LABEL + " mb-0.5"}>Rejected</p>
                    <p className="text-sm text-red-300">{req.rejected_by} · {fmtDate(req.rejected_at)}</p>
                    <p className={T_CAPTION + " mt-0.5"}>{req.rejection_reason}</p>
                  </div>
                )}
                {req.status === "PURCHASED" && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <p className={T_LABEL + " mb-0.5"}>Purchased</p>
                    <p className="text-sm text-emerald-300">{req.purchased_by} · {fmtDate(req.purchased_at)}</p>
                    {req.receipt_notes && <p className={T_CAPTION + " mt-0.5"}>{req.receipt_notes}</p>}
                    {req.receipt_url && (
                      <a href={req.receipt_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-violet-400 underline">View Receipt</a>
                    )}
                  </div>
                )}

                {/* Actions */}
                {req.status === "PENDING" && (
                  <div className="space-y-3">
                    {actionMode[req.id] == null && (
                      <div className="flex gap-2">
                        <button className={PRIMARY_BUTTON + " text-sm"} onClick={() => setActionMode((p) => ({ ...p, [req.id]: "approve" }))}>Approve</button>
                        <button className={DANGER_BUTTON + " text-sm"} onClick={() => setActionMode((p) => ({ ...p, [req.id]: "reject" }))}>Reject</button>
                      </div>
                    )}

                    {actionMode[req.id] === "approve" && (
                      <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                        <p className="text-sm font-semibold text-violet-300">Approve Request</p>
                        <textarea
                          className={TEXTAREA_CLASS}
                          rows={2}
                          placeholder="Optional approval notes"
                          value={approveNotes[req.id] || ""}
                          onChange={(e) => setApproveNotes((p) => ({ ...p, [req.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button className={PRIMARY_BUTTON + " text-sm"} disabled={actionLoading[req.id]} onClick={() => doApprove(req.id)}>
                            {actionLoading[req.id] ? "Approving…" : "Confirm Approve"}
                          </button>
                          <button className={SECONDARY_BUTTON + " text-sm"} onClick={() => setActionMode((p) => ({ ...p, [req.id]: null }))}>Cancel</button>
                        </div>
                        {actionError[req.id] && <p className="text-xs text-red-400">{actionError[req.id]}</p>}
                      </div>
                    )}

                    {actionMode[req.id] === "reject" && (
                      <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <p className="text-sm font-semibold text-red-300">Reject Request</p>
                        <textarea
                          className={TEXTAREA_CLASS}
                          rows={2}
                          placeholder="Rejection reason (required)"
                          value={rejectReason[req.id] || ""}
                          onChange={(e) => setRejectReason((p) => ({ ...p, [req.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button className={DANGER_BUTTON + " text-sm"} disabled={actionLoading[req.id]} onClick={() => doReject(req.id)}>
                            {actionLoading[req.id] ? "Rejecting…" : "Confirm Reject"}
                          </button>
                          <button className={SECONDARY_BUTTON + " text-sm"} onClick={() => setActionMode((p) => ({ ...p, [req.id]: null }))}>Cancel</button>
                        </div>
                        {actionError[req.id] && <p className="text-xs text-red-400">{actionError[req.id]}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Mark Purchased */}
                {req.status === "APPROVED" && (
                  <div className="space-y-3">
                    {actionMode[req.id] == null && (
                      <button className={PRIMARY_BUTTON + " text-sm"} onClick={() => {
                        setCompletePurchasedBy((p) => ({ ...p, [req.id]: auth?.staffName || "" }));
                        setActionMode((p) => ({ ...p, [req.id]: "complete" }));
                      }}>
                        Mark as Purchased
                      </button>
                    )}

                    {actionMode[req.id] === "complete" && (
                      <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <p className="text-sm font-semibold text-emerald-300">Mark as Purchased</p>
                        <div>
                          <label className={`${T_LABEL} block mb-1`}>Purchased By</label>
                          <input
                            className={INPUT_CLASS}
                            value={completePurchasedBy[req.id] || ""}
                            onChange={(e) => setCompletePurchasedBy((p) => ({ ...p, [req.id]: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className={`${T_LABEL} block mb-1`}>Notes</label>
                          <textarea
                            className={TEXTAREA_CLASS}
                            rows={2}
                            placeholder="Optional notes about the purchase"
                            value={completeNotes[req.id] || ""}
                            onChange={(e) => setCompleteNotes((p) => ({ ...p, [req.id]: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className={`${T_LABEL} block mb-1`}>Receipt (optional)</label>
                          {receiptFile[req.id] ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-emerald-400">{receiptFile[req.id]?.name}</span>
                              <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setReceiptFile((p) => ({ ...p, [req.id]: null }))}>Remove</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={SMALL_BUTTON}
                                onClick={() => receiptInputRefs.current[req.id]?.click()}
                              >
                                Upload Receipt
                              </button>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                ref={(el) => { receiptInputRefs.current[req.id] = el; }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  setReceiptFile((p) => ({ ...p, [req.id]: file }));
                                  e.target.value = "";
                                }}
                              />
                              <span className={T_CAPTION}>JPG, PNG, PDF — max 20 MB</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button className={PRIMARY_BUTTON + " text-sm"} disabled={actionLoading[req.id]} onClick={() => doComplete(req.id)}>
                            {actionLoading[req.id] ? "Saving…" : "Confirm Purchase"}
                          </button>
                          <button className={SECONDARY_BUTTON + " text-sm"} onClick={() => setActionMode((p) => ({ ...p, [req.id]: null }))}>Cancel</button>
                        </div>
                        {actionError[req.id] && <p className="text-xs text-red-400">{actionError[req.id]}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
