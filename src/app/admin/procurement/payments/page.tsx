"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, ChevronRight } from "lucide-react";

type PaymentRow = {
  id: string;
  request_id: string;
  case_id: string;
  invoice_id: string;
  request_no: string;
  store_code: string;
  payment_no: string;
  payee_name: string;
  scheduled_amount: number;
  scheduled_date: string;
  status: string;
  hold_reason: string;
  hold_by: string;
  hold_at: string;
  released_by: string;
  released_at: string;
  executed_by: string;
  executed_at: string;
  execution_ref: string;
  created_at: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "EXECUTED") return <span className={BADGE_SUCCESS}>EXECUTED</span>;
  if (s === "RELEASED") return <span className={BADGE_INFO}>RELEASED</span>;
  if (s === "HOLD")     return <span className={BADGE_ERROR}>HOLD</span>;
  if (s === "QUEUED")   return <span className={BADGE_WARNING}>QUEUED</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementPaymentsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());

  // Filter
  const [filterRequestId, setFilterRequestId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Create form
  const [createRequestId, setCreateRequestId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [scheduledAmount, setScheduledAmount] = useState("0");
  const [scheduledDate, setScheduledDate] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [holdReasonById, setHoldReasonById] = useState<Record<string, string>>({});
  const [executionRefById, setExecutionRefById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const currency = city === "dubai" ? "AED" : "PHP";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterRequestId.trim()) qs.set("request_id", filterRequestId.trim());
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "200");
      const data = await procurementJson<{ rows: PaymentRow[] }>(
        `/api/admin/procurement/payments?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [filterRequestId, pin, requestedBy, statusFilter]);

  const queuePayment = async () => {
    if (!createRequestId.trim()) { setError("Request ID is required."); return; }
    setBusy("queue");
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/payments/queue",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: createRequestId.trim(),
            invoice_id: invoiceId.trim(),
            payee_name: payeeName.trim(),
            scheduled_amount: Number(scheduledAmount || 0),
            scheduled_date: scheduledDate,
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Payment queued successfully.");
      setShowCreateForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const act = async (paymentId: string, action: "hold" | "release" | "execute") => {
    setBusy(`${paymentId}:${action}`);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        `/api/admin/procurement/payments/${paymentId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_id: paymentId,
            hold_reason: holdReasonById[paymentId] || "",
            execution_ref: executionRefById[paymentId] || "",
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`Payment ${action} successful.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) {
      setFilterRequestId(initialRequestId);
      setCreateRequestId(initialRequestId);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const resolvedCity = String(resolvedAuth?.city || "manila").toLowerCase();
      setCity(resolvedCity === "dubai" ? "dubai" : "manila");
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        resolvedCity === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement payments is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Payments</h2>
          <p className="mt-1 text-sm text-zinc-400">Queue, hold, release and execute procurement payments.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className={PRIMARY_BUTTON}
        >
          {showCreateForm ? "Cancel" : "+ Queue Payment"}
        </button>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Session + Filter */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white">Session & Filter</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID Filter</label>
            <input value={filterRequestId} onChange={(e) => setFilterRequestId(e.target.value)} placeholder="Filter by request ID" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="">All statuses</option>
              <option value="QUEUED">QUEUED</option>
              <option value="HOLD">HOLD</option>
              <option value="RELEASED">RELEASED</option>
              <option value="EXECUTED">EXECUTED</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_SECTION} mb-4`}>Queue New Payment</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Request ID *</label>
              <input value={createRequestId} onChange={(e) => setCreateRequestId(e.target.value)} placeholder="Request ID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Invoice ID (optional)</label>
              <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Payee Name</label>
              <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Payee / vendor name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Scheduled Amount ({currency})</label>
              <input value={scheduledAmount} onChange={(e) => setScheduledAmount(e.target.value)} placeholder="0.00" className={INPUT_CLASS} />
            </div>
            <div className="sm:col-span-2">
              <label className={`${T_LABEL} mb-1.5 block`}>Scheduled Date</label>
              <DatePicker value={scheduledDate} onChange={setScheduledDate} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => void queuePayment()}
                disabled={busy === "queue"}
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
              >
                {busy === "queue" ? <><RefreshCw className="h-4 w-4 animate-spin" />Queueing…</> : "Queue Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading payments…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
          <p className={T_CAPTION}>No payments found.</p>
        </div>
      )}

      {/* Payment rows */}
      <div className="space-y-3">
        {rows.map((row) => {
          const isHold = String(row.status || "").toUpperCase() === "HOLD";
          return (
            <div
              key={row.id}
              className={[
                "rounded-2xl border p-4 transition-all",
                isHold ? "border-red-500/30 bg-red-950/10" : "border-white/8 bg-white/4",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.payment_no}</span>
                    {statusBadge(row.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>Req: <span className="text-zinc-200">{row.request_no || row.request_id || "-"}</span></span>
                    <span>Payee: <span className="text-zinc-200">{row.payee_name || "-"}</span></span>
                    <span>Store: <span className="text-zinc-200">{row.store_code || "-"}</span></span>
                    <span>Amount: <span className="font-semibold text-zinc-100">{Number(row.scheduled_amount || 0).toFixed(2)} {currency}</span></span>
                    <span>Date: <span className="text-zinc-200">{row.scheduled_date || "-"}</span></span>
                  </div>
                  {row.hold_reason && (
                    <p className="text-xs text-red-300">{row.hold_reason}</p>
                  )}
                  {row.execution_ref && (
                    <p className="text-xs text-emerald-300">Ref: {row.execution_ref}</p>
                  )}
                  <p className={T_CAPTION}>
                    {row.hold_by ? `Hold: ${row.hold_by} at ${formatDateTime(row.hold_at)} · ` : ""}
                    {row.released_by ? `Released: ${row.released_by} at ${formatDateTime(row.released_at)} · ` : ""}
                    {row.executed_by ? `Executed: ${row.executed_by} at ${formatDateTime(row.executed_at)}` : ""}
                  </p>
                </div>
                {row.case_id && (
                  <Link
                    href={`/admin/procurement/cases/${row.case_id}`}
                    className={`${SMALL_BUTTON} flex items-center gap-1 shrink-0`}
                  >
                    Case <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>

              {/* Per-row action inputs */}
              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/8 pt-4 sm:grid-cols-4">
                <textarea
                  value={holdReasonById[row.id] || ""}
                  onChange={(e) => setHoldReasonById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  placeholder="Hold reason"
                  className={`${TEXTAREA_CLASS} min-h-16 sm:col-span-2`}
                />
                <input
                  value={executionRefById[row.id] || ""}
                  onChange={(e) => setExecutionRefById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  placeholder="Execution reference"
                  className={INPUT_CLASS}
                />
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void act(row.id, "hold")}
                    disabled={!!busy}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
                  >
                    {busy === `${row.id}:hold` ? "Holding…" : "Hold"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(row.id, "release")}
                    disabled={!!busy}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60"
                  >
                    {busy === `${row.id}:release` ? "Releasing…" : "Release"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(row.id, "execute")}
                    disabled={!!busy}
                    className={`${PRIMARY_BUTTON} px-3 py-2 text-xs`}
                  >
                    {busy === `${row.id}:execute` ? "Executing…" : "Execute"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
