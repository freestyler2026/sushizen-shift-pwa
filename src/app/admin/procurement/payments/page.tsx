"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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

export default function ProcurementPaymentsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [scheduledAmount, setScheduledAmount] = useState("0");
  const [scheduledDate, setScheduledDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [holdReasonById, setHoldReasonById] = useState<Record<string, string>>({});
  const [executionRefById, setExecutionRefById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (requestId.trim()) qs.set("request_id", requestId.trim());
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
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const queuePayment = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    setBusy("queue");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/payments/queue",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
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
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const act = async (paymentId: string, action: "hold" | "release" | "execute") => {
    setBusy(paymentId + ":" + action);
    setError("");
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
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID filter" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="HOLD">HOLD</option>
            <option value="RELEASED">RELEASED</option>
            <option value="EXECUTED">EXECUTED</option>
          </select>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-2">
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Payee name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={scheduledAmount} onChange={(e) => setScheduledAmount(e.target.value)} placeholder="Scheduled amount" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2" />
        <button type="button" onClick={() => void queuePayment()} disabled={busy === "queue"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-2">
          {busy === "queue" ? "Queueing..." : "Queue Payment"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-100">{row.payment_no}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.payee_name || "-"} | {Number(row.scheduled_amount || 0).toFixed(2)} PHP | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Scheduled {row.scheduled_date || "-"} | Hold {row.hold_by || "-"} {formatDateTime(row.hold_at)} | Released {row.released_by || "-"} {formatDateTime(row.released_at)} | Executed {row.executed_by || "-"} {formatDateTime(row.executed_at)}
                </div>
                {row.hold_reason ? <div className="mt-2 text-sm text-amber-200">{row.hold_reason}</div> : null}
                {row.execution_ref ? <div className="mt-1 text-sm text-emerald-200">Execution ref: {row.execution_ref}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/procurement/cases/${row.case_id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
                  Open Case
                </Link>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <textarea
                value={holdReasonById[row.id] || ""}
                onChange={(e) => setHoldReasonById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Hold reason"
                className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={executionRefById[row.id] || ""}
                onChange={(e) => setExecutionRefById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Execution reference"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => void act(row.id, "hold")} disabled={busy === row.id + ":hold"} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-800/30 disabled:opacity-60">
                  {busy === row.id + ":hold" ? "Holding..." : "Hold"}
                </button>
                <button type="button" onClick={() => void act(row.id, "release")} disabled={busy === row.id + ":release"} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
                  {busy === row.id + ":release" ? "Releasing..." : "Release"}
                </button>
                <button type="button" onClick={() => void act(row.id, "execute")} disabled={busy === row.id + ":execute"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
                  {busy === row.id + ":execute" ? "Executing..." : "Execute"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No payments.</div> : null}
      </div>
    </div>
  );
}
