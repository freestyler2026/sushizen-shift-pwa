"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_ACCENT,
} from "@/lib/ui-tokens";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  CornerUpLeft,
  AlertTriangle,
  Bell,
  Upload,
  ChevronRight,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";

type Bundle = {
  case?: any;
  request?: any;
  history?: any[];
  messages?: any[];
  notifications?: any[];
  documents?: any[];
  document_validation?: any;
  phase2_validation?: any;
  purchase_orders?: any[];
  receivings?: any[];
  claims?: any[];
  invoices?: any[];
  payments?: any[];
};

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN")       return <span className={BADGE_INFO}>OPEN</span>;
  if (s === "CLAIMED")    return <span className={BADGE_WARNING}>CLAIMED</span>;
  if (s === "IN_REVIEW")  return <span className={BADGE_INFO}>IN REVIEW</span>;
  if (s === "ESCALATED")  return <span className={BADGE_ERROR}>ESCALATED</span>;
  if (s === "APPROVED")   return <span className={BADGE_SUCCESS}>APPROVED</span>;
  if (s === "RETURNED")   return <span className={BADGE_WARNING}>RETURNED</span>;
  if (s === "REJECTED")   return <span className={BADGE_ERROR}>REJECTED</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

function severityBadge(severity: string) {
  const s = String(severity || "").toUpperCase();
  if (s === "RED" || s === "HIGH")    return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "AMBER" || s === "MEDIUM" || s === "YELLOW") return <span className={BADGE_WARNING}>{s}</span>;
  if (s === "GREEN" || s === "LOW")   return <span className={BADGE_SUCCESS}>{s}</span>;
  return <span className={BADGE_INFO}>{severity || "-"}</span>;
}

function actionBadge(action: string) {
  const a = String(action || "").toUpperCase();
  if (a === "APPROVE") return <span className={BADGE_SUCCESS}>{action}</span>;
  if (a === "REJECT")  return <span className={BADGE_ERROR}>{action}</span>;
  if (a === "RETURN")  return <span className={BADGE_WARNING}>{action}</span>;
  if (a === "ESCALATE") return <span className={BADGE_ERROR}>{action}</span>;
  return <span className={BADGE_INFO}>{action || "-"}</span>;
}

export default function ProcurementCaseDetailPage() {
  const auth = useMemo(() => getAuth(), []);
  const params = useParams<{ caseId: string }>();
  const searchParams = useSearchParams();
  const fromParam = searchParams?.get("from") ?? "";
  const caseId = String(params?.caseId || "");

  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState("manila");
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [bundle, setBundle] = useState<Bundle>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [escalateRole, setEscalateRole] = useState("HQ");
  const [uploadStage, setUploadStage] = useState("01_PR");
  const [uploadDocType, setUploadDocType] = useState("PR");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [quoteUrl, setQuoteUrl] = useState("");
  const [paymentConfirming, setPaymentConfirming] = useState(false);

  const currency = bundle.request?.currency || (city === "dubai" ? "AED" : "PHP");
  const APPROVAL_THRESHOLD = city === "dubai" ? 500 : 15000;
  const totalAmount = Number(bundle.request?.total_amount || 0);
  const isHighValue = totalAmount > APPROVAL_THRESHOLD;

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await procurementJson<Bundle>(
        `/api/admin/procurement/cases/${caseId}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setBundle(data || {});
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [caseId, pin, requestedBy]);

  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(path);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        `/api/admin/procurement/cases/${caseId}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        requestedBy,
        pin,
      );
      setMessage("");
      setSuccessMsg(`Action "${path}" completed successfully.`);
      await load();
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const upload = async () => {
    if (!uploadFile) { setError("Please choose a file."); return; }
    setBusy("upload");
    setError("");
    setSuccessMsg("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const form = new FormData();
      form.append("stage_code", uploadStage);
      form.append("doc_type", uploadDocType);
      form.append("approver_name", requestedBy);
      form.append("pin", pin);
      form.append("file", uploadFile);
      const res = await fetch(`/api/admin/procurement/cases/${caseId}/documents/upload`, {
        method: "POST",
        headers,
        body: form,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Upload failed (${res.status})`);
      setUploadFile(null);
      setSuccessMsg("Document uploaded successfully.");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const markPurchased = async () => {
    setReceiptUploading(true);
    setError("");
    setSuccessMsg("");
    try {
      let receiptUrl = "";
      if (receiptFile) {
        const headers = await procurementTokenHeaders(requestedBy, pin);
        const form = new FormData();
        form.append("stage_code", "05_RECEIPT");
        form.append("doc_type", "RECEIPT");
        form.append("approver_name", requestedBy);
        form.append("pin", pin);
        form.append("file", receiptFile);
        const res = await fetch(`/api/admin/procurement/cases/${caseId}/documents/upload`, {
          method: "POST",
          headers,
          body: form,
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || `Receipt upload failed (${res.status})`);
        try {
          const parsed = JSON.parse(text);
          receiptUrl = String(parsed?.url || parsed?.document?.url || "");
        } catch { /* ok */ }
      }
      const requestId = String(bundle.request?.id || "");
      await procurementJson(
        `/api/admin/procurement/requests/${requestId}/mark-purchased`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin, receipt_url: receiptUrl }),
        },
        requestedBy,
        pin,
      );
      setReceiptFile(null);
      setSuccessMsg("Marked as purchased successfully.");
      await load();
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setReceiptUploading(false);
    }
  };

  const confirmPayment = async () => {
    setPaymentConfirming(true);
    setError("");
    setSuccessMsg("");
    try {
      const requestId = String(bundle.request?.id || "");
      await procurementJson(
        `/api/admin/procurement/requests/${requestId}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin, quote_url: quoteUrl.trim() }),
        },
        requestedBy,
        pin,
      );
      setQuoteUrl("");
      setSuccessMsg("Payment confirmed. PO can now be issued.");
      await load();
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPaymentConfirming(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const resolvedCity = String(resolvedAuth?.city || "manila").toLowerCase();
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        resolvedCity === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can && caseId) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement case detail is only available to authorized admin roles.
      </div>
    );
  }

  const caseStatus = String(bundle.case?.status || "").toUpperCase();
  const isClosed = ["APPROVED", "REJECTED"].includes(caseStatus);
  const purchaseType = (bundle.request?.purchase_type || "").toLowerCase();
  const EXEC_TYPES = ["cash_purchase", "ec_purchase", "prepaid"];
  const isExecuted =
    bundle.request?.status === "PURCHASED" ||
    (purchaseType === "prepaid" && bundle.request?.payment_status === "PAYMENT_CONFIRMED");
  const needsExecution = caseStatus === "APPROVED" && EXEC_TYPES.includes(purchaseType) && !isExecuted;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={T_PAGE_TITLE}>
            {bundle.case?.parent_case_no || bundle.request?.request_no || caseId}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {bundle.case && statusBadge(bundle.case.status)}
            {bundle.case && severityBadge(bundle.case.severity)}
            {isHighValue && <span className={BADGE_WARNING}>⚠ High Value</span>}
            {bundle.request?.urgent_flag && <span className={BADGE_ERROR}>URGENT</span>}
            {bundle.request?.new_vendor_flag && <span className={BADGE_WARNING}>NEW VENDOR</span>}
            {bundle.request?.purchase_type === "cash_purchase" && <span className={`${BADGE_ACCENT} bg-amber-500/20 text-amber-300 border-amber-500/30`}>💵 Cash &amp; Carry</span>}
            {bundle.request?.purchase_type === "ec_purchase" && <span className={`${BADGE_ACCENT} bg-sky-500/20 text-sky-300 border-sky-500/30`}>🛒 EC / Online</span>}
            {bundle.request?.purchase_type === "prepaid" && <span className={`${BADGE_ACCENT} bg-purple-500/20 text-purple-300 border-purple-500/30`}>💳 Pre-payment</span>}
            {bundle.request?.status === "PURCHASED" && <span className={BADGE_SUCCESS}>✓ PURCHASED</span>}
            {bundle.request?.purchase_type === "prepaid" && bundle.request?.payment_status === "PAYMENT_CONFIRMED" && <span className={BADGE_SUCCESS}>💳 Payment Confirmed</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {fromParam === "hub" ? (
            <Link href="/admin/procurement/hub" className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
              ← Hub
            </Link>
          ) : (
            <Link href="/admin/procurement/approval-inbox" className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
              ← Inbox
            </Link>
          )}
        </div>
      </div>

      {/* Session / Auth bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white">Session</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} disabled={loading} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Load Case"}
            </button>
          </div>
        </div>
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

      {/* ⚡ Execution Required Banner */}
      {needsExecution && (
        <div className="rounded-xl border-2 border-amber-500/55 bg-amber-950/30 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚡</span>
            <div className="min-w-0">
              <p className="text-base font-bold text-amber-200">Execution Required</p>
              <p className="mt-1 text-sm text-amber-400/90">
                {purchaseType === "cash_purchase"
                  ? "This request is approved and ready for purchasing. Upload the receipt and mark as purchased to move it forward."
                  : purchaseType === "ec_purchase"
                  ? "This online order is approved. Place the order, then upload confirmation and mark as purchased."
                  : "This pre-payment request is approved. Enter the supplier quote or invoice URL and confirm payment."}
              </p>
            </div>
          </div>

          {(purchaseType === "cash_purchase" || purchaseType === "ec_purchase") && (
            <div className="space-y-3 pl-9">
              {bundle.request?.ec_order_url && (
                <div className="text-xs text-sky-300">
                  Order URL: <a href={bundle.request.ec_order_url} target="_blank" rel="noopener noreferrer" className="underline break-all">{bundle.request.ec_order_url}</a>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-200 hover:bg-amber-950/50 transition">
                  <Upload className="h-3.5 w-3.5" />
                  {receiptFile ? receiptFile.name : "Choose receipt photo"}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                </label>
                <button
                  type="button"
                  onClick={() => void markPurchased()}
                  disabled={receiptUploading}
                  className="flex items-center gap-2 rounded-xl border-2 border-amber-500/60 bg-amber-500/25 px-5 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-500/40 disabled:opacity-60"
                >
                  <CheckCircle className="h-4 w-4" />
                  {receiptUploading ? "Saving…" : "Mark as Purchased"}
                </button>
              </div>
            </div>
          )}

          {purchaseType === "prepaid" && (
            <div className="space-y-3 pl-9">
              <input
                type="url"
                value={quoteUrl}
                onChange={(e) => setQuoteUrl(e.target.value)}
                placeholder="Supplier quote or invoice URL (optional)"
                className="w-full rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500/60"
              />
              <button
                type="button"
                onClick={() => void confirmPayment()}
                disabled={paymentConfirming}
                className="flex items-center gap-2 rounded-xl border-2 border-amber-500/60 bg-amber-500/25 px-5 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-500/40 disabled:opacity-60"
              >
                <CheckCircle className="h-4 w-4" />
                {paymentConfirming ? "Confirming…" : "Confirm Payment"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !bundle.request && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading case details…</span>
        </div>
      )}

      {/* Request Details */}
      {bundle.request && (
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-base font-semibold text-white">{bundle.request.request_no}</span>
            <span className={T_CAPTION}>{String(bundle.request.request_date || "").slice(0, 10)}</span>
            <span className={T_CAPTION}>Store: <span className="text-zinc-300">{bundle.request.store_code || "-"}</span></span>
            <span className={T_CAPTION}>By: <span className="text-zinc-300">{bundle.request.requested_by || "-"}</span></span>
            <span className="ml-auto text-xl font-bold text-white tabular-nums">
              {isHighValue
                ? <span className="text-amber-300">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
                : <>{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</>
              }
            </span>
          </div>

          {bundle.request.notes && (
            <div className="mb-4 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-zinc-300">
              {bundle.request.notes}
            </div>
          )}

          {(bundle.request.items || []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left">
                    <th className={`${T_LABEL} pb-2 pr-3`}>Item</th>
                    <th className={`${T_LABEL} pb-2 pr-3`}>Category</th>
                    <th className={`${T_LABEL} pb-2 pr-3`}>Spec</th>
                    <th className={`${T_LABEL} pb-2 pr-3 text-right`}>Qty</th>
                    <th className={`${T_LABEL} pb-2 pr-3`}>Unit</th>
                    <th className={`${T_LABEL} pb-2 pr-3 text-right`}>Unit Price</th>
                    <th className={`${T_LABEL} pb-2 pr-3 text-right`}>Total</th>
                    <th className={`${T_LABEL} pb-2 pr-3`}>Vendor</th>
                    <th className={`${T_LABEL} pb-2`}>Needed By</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle.request.items as any[]).map((item: any, idx: number) => (
                    <tr key={item.id || idx} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-white">{item.item_name || "-"}</td>
                      <td className="py-2.5 pr-3 text-zinc-400">{item.category || "-"}</td>
                      <td className="py-2.5 pr-3 text-zinc-400">{item.spec || "-"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-200">{Number(item.qty || 0).toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-zinc-400">{item.unit || "-"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-200">{Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-violet-300">{Number(item.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 pr-3 text-zinc-400">{item.vendor_name || "-"}</td>
                      <td className="py-2.5 text-zinc-400">{String(item.needed_by_date || "").slice(0, 10) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10">
                    <td colSpan={6} className="pt-3 text-right text-xs text-zinc-500">Order Total</td>
                    <td className="pt-3 pr-3 text-right tabular-nums font-bold text-white">
                      {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {!(bundle.request.items || []).length && (
            <p className={T_CAPTION}>No line items found.</p>
          )}
        </div>
      )}

      {/* Case Actions panel */}
      {bundle.case && (
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className={T_SECTION}>Actions</p>
            <span className={T_CAPTION}>Assignee: <span className="text-zinc-300">{bundle.case.current_assignee_role || "-"}</span></span>
            {bundle.case.claimed_by && (
              <span className={T_CAPTION}>Claimed by: <span className="text-zinc-300">{bundle.case.claimed_by}</span></span>
            )}
            <span className={T_CAPTION}>Doc Gate: <span className="text-zinc-300">{bundle.document_validation?.status || "-"}</span></span>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Comment / case note (required for Reject and Return)"
            className={`${TEXTAREA_CLASS} mb-4 min-h-20`}
          />

          {isClosed ? (
            <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-zinc-400">
              This case is <strong className="text-zinc-200">{caseStatus}</strong> and no further actions can be taken.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {/* Approve */}
              <button
                type="button"
                onClick={() => void act("approve", { case_id: caseId, approver_name: requestedBy, pin, comment: message })}
                disabled={!!busy}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm`}
              >
                <CheckCircle className="h-4 w-4" />
                {busy === "approve" ? "Approving…" : "Approve"}
              </button>

              {/* Return */}
              <button
                type="button"
                onClick={() => void act("return", { case_id: caseId, approver_name: requestedBy, pin, comment: message })}
                disabled={!!busy}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
              >
                <CornerUpLeft className="h-4 w-4" />
                {busy === "return" ? "Returning…" : "Return for Revision"}
              </button>

              {/* Reject */}
              <button
                type="button"
                onClick={() => void act("reject", { case_id: caseId, approver_name: requestedBy, pin, comment: message })}
                disabled={!!busy}
                className={`${DANGER_BUTTON} flex items-center gap-2 px-4 py-2 text-sm`}
              >
                <XCircle className="h-4 w-4" />
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </button>

              {/* Post Message */}
              <button
                type="button"
                onClick={() => void act("message", { case_id: caseId, approver_name: requestedBy, pin, body: message || "Internal note", message_type: "NOTE" })}
                disabled={!!busy}
                className={`${SMALL_BUTTON} flex items-center gap-2`}
              >
                {busy === "message" ? "Posting…" : "Post Note"}
              </button>

              {/* Resend Push */}
              <button
                type="button"
                onClick={() => void act("notifications/resend", { case_id: caseId, approver_name: requestedBy, pin })}
                disabled={!!busy}
                className={`${SMALL_BUTTON} flex items-center gap-2`}
              >
                <Bell className="h-3.5 w-3.5" />
                {busy === "notifications/resend" ? "Resending…" : "Resend Push"}
              </button>

              {/* Escalate */}
              <div className="flex items-center gap-1">
                <select value={escalateRole} onChange={(e) => setEscalateRole(e.target.value)} className="w-36 appearance-none rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white outline-none">
                  <option value="HR_MANAGER">HR_MANAGER</option>
                  <option value="HQ">HQ</option>
                  <option value="FINANCE">FINANCE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <button
                  type="button"
                  onClick={() => void act("escalate", { case_id: caseId, approver_name: requestedBy, pin, target_role: escalateRole, comment: message })}
                  disabled={!!busy}
                  className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {busy === "escalate" ? "Escalating…" : "Escalate"}
                </button>
              </div>
            </div>
          )}

          {/* Mark as Purchased panel — cash & carry / EC orders only */}
          {["cash_purchase", "ec_purchase"].includes(bundle.request?.purchase_type || "") && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-amber-200">
                  {bundle.request?.purchase_type === "ec_purchase" ? "🛒 EC / Online Purchase" : "💵 Cash & Carry Purchase"}
                </span>
                {bundle.request?.status === "PURCHASED" ? (
                  <span className={BADGE_SUCCESS}>✓ Completed</span>
                ) : (
                  <span className={BADGE_WARNING}>Awaiting Purchase</span>
                )}
              </div>
              {bundle.request?.ec_order_url && (
                <div className="text-xs text-sky-300">
                  Order URL: <a href={bundle.request.ec_order_url} target="_blank" rel="noopener noreferrer" className="underline break-all">{bundle.request.ec_order_url}</a>
                </div>
              )}
              {bundle.request?.receipt_url && (
                <div className="text-xs text-zinc-400">
                  Receipt: <a href={bundle.request.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">View receipt</a>
                </div>
              )}
              {bundle.request?.purchased_by && (
                <div className="text-xs text-zinc-400">
                  Purchased by: <span className="text-zinc-200">{bundle.request.purchased_by}</span>
                  {bundle.request.purchased_at && <> · {new Date(bundle.request.purchased_at).toLocaleString()}</>}
                </div>
              )}
              {bundle.request?.status === "APPROVED" && (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Upload receipt photo (optional) then mark as purchased:</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition">
                      <Upload className="h-3.5 w-3.5" />
                      {receiptFile ? receiptFile.name : "Choose receipt photo"}
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <button
                      type="button"
                      onClick={() => void markPurchased()}
                      disabled={receiptUploading}
                      className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-60"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {receiptUploading ? "Saving…" : "Mark as Purchased"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment confirmation panel — pre-payment suppliers only */}
          {bundle.request?.purchase_type === "prepaid" && (
            <div className="mt-4 rounded-xl border border-purple-500/25 bg-purple-500/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-purple-200">💳 Pre-payment Supplier</span>
                {bundle.request?.payment_status === "PAYMENT_CONFIRMED" ? (
                  <span className={BADGE_SUCCESS}>✓ Payment Confirmed</span>
                ) : (
                  <span className={BADGE_WARNING}>Awaiting Payment</span>
                )}
              </div>
              {bundle.request?.purchased_by && (
                <div className="text-xs text-zinc-400">
                  Confirmed by: <span className="text-zinc-200">{bundle.request.purchased_by}</span>
                  {bundle.request?.purchased_at && <> · {new Date(bundle.request.purchased_at).toLocaleString()}</>}
                </div>
              )}
              {bundle.request?.receipt_url && (
                <div className="text-xs text-zinc-400">
                  Quote / Invoice: <a href={bundle.request.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">View document</a>
                </div>
              )}
              {bundle.request?.status === "APPROVED" && bundle.request?.payment_status !== "PAYMENT_CONFIRMED" && (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Enter supplier quote / invoice URL (optional) then confirm payment:</div>
                  <input
                    type="url"
                    value={quoteUrl}
                    onChange={(e) => setQuoteUrl(e.target.value)}
                    placeholder="Supplier quote or invoice URL (optional)"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => void confirmPayment()}
                    disabled={paymentConfirming}
                    className="flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-200 transition hover:bg-purple-500/30 disabled:opacity-60"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {paymentConfirming ? "Confirming…" : "Confirm Payment"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick links */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
            {[
              { label: "PO Screen", href: `/admin/procurement/pos?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}&city=${encodeURIComponent(bundle.request?.city || "")}` },
              { label: "Receiving", href: `/admin/procurement/receiving?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}` },
              { label: "Claims", href: `/admin/procurement/claims?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}` },
              { label: "Invoices", href: `/admin/procurement/invoices?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}` },
              { label: "Payments", href: `/admin/procurement/payments?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}` },
              { label: "Audit Log", href: `/admin/procurement/audit?request_id=${encodeURIComponent(bundle.request?.request_no || bundle.request?.id || "")}` },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`${SMALL_BUTTON} flex items-center gap-1`}
              >
                {label} <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Document Chain + Message Timeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Document Chain */}
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_CARD_TITLE} mb-4`}>Document Chain</p>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select value={uploadStage} onChange={(e) => setUploadStage(e.target.value)} className={`${SELECT_CLASS} col-span-2 sm:col-span-1`}>
              {["01_PR","02_RFQ","03_PO","04_RECEIVING","05_INVOICE","06_PAYMENT","07_EXCEPTION"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} placeholder="Doc type" className={INPUT_CLASS} />
            <label className="col-span-2 sm:col-span-1 flex items-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition">
              <span className="rounded-lg bg-violet-500/20 px-2 py-1 text-violet-300 shrink-0">Choose File</span>
              <span className="truncate text-zinc-400">{uploadFile ? uploadFile.name : "No file chosen"}</span>
              <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => void upload()}
              disabled={busy === "upload" || !uploadFile}
              className={`${PRIMARY_BUTTON} flex items-center justify-center gap-2 px-3 py-2 text-xs`}
            >
              <Upload className="h-3.5 w-3.5" />
              {busy === "upload" ? "Uploading…" : "Upload"}
            </button>
          </div>
          <div className="space-y-2">
            {(bundle.documents || []).map((doc: any) => (
              <a
                key={doc.id}
                href={doc.web_view_link || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/4 p-3 transition hover:bg-white/8"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{doc.stage_code} — {doc.file_name}</div>
                  <div className={`${T_CAPTION} mt-0.5`}>
                    {doc.doc_type || "-"} · Uploaded by {doc.uploaded_by || "-"} · {doc.validation_status || "-"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </a>
            ))}
            {!(bundle.documents || []).length && <p className={T_CAPTION}>No documents uploaded yet.</p>}
          </div>
          {bundle.document_validation && (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2">
              <p className={`${T_CAPTION}`}>Doc Gate: <span className="text-zinc-300">{bundle.document_validation.status || "-"}</span></p>
              {(bundle.document_validation.missing_stage_codes || []).length > 0 && (
                <p className={`${T_CAPTION} mt-0.5`}>Missing stages: {bundle.document_validation.missing_stage_codes.join(", ")}</p>
              )}
            </div>
          )}
        </div>

        {/* Message Timeline */}
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_CARD_TITLE} mb-4`}>Message Timeline</p>
          <div className="space-y-2">
            {(bundle.messages || []).map((row: any) => (
              <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                <div className="flex items-center gap-2">
                  <span className={BADGE_INFO}>{row.message_type}</span>
                  <span className="text-sm font-medium text-zinc-200">{row.actor_name}</span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-300">{row.body}</p>
                <p className={`${T_CAPTION} mt-1`}>{String(row.created_at || "").slice(0, 16).replace("T", " ")}</p>
              </div>
            ))}
            {!(bundle.messages || []).length && <p className={T_CAPTION}>No messages yet.</p>}
          </div>
        </div>
      </div>

      {/* Approval History */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={`${T_CARD_TITLE} mb-4`}>Approval History</p>
        <div className="space-y-2">
          {(bundle.history || []).map((row: any) => (
            <div key={row.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-white/8 bg-white/4 p-3">
              {actionBadge(row.action)}
              <span className="text-sm text-zinc-200">{row.actor_role}</span>
              <span className="text-sm font-medium text-white">{row.actor_name}</span>
              {row.comment && <span className="text-sm text-zinc-400">&ldquo;{row.comment}&rdquo;</span>}
            </div>
          ))}
          {!(bundle.history || []).length && <p className={T_CAPTION}>No approval actions yet.</p>}
        </div>
      </div>

      {/* Notification Timeline */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={`${T_CARD_TITLE} mb-4`}>Notification Timeline</p>
        <div className="space-y-2">
          {(bundle.notifications || []).map((row: any) => (
            <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={row.status === "DELIVERED" ? BADGE_SUCCESS : row.status === "FAILED" ? BADGE_ERROR : BADGE_INFO}>
                  {row.status || "-"}
                </span>
                <span className="text-sm text-zinc-200">{row.channel || "-"}</span>
                <span className="text-sm text-zinc-400">{row.recipient_name || row.recipient_role || "-"}</span>
              </div>
              <p className={`${T_CAPTION} mt-1`}>
                Provider: {row.provider_status || "-"}{row.provider_ref ? ` · Ref ${row.provider_ref}` : ""}
              </p>
              <p className={`${T_CAPTION} mt-0.5`}>
                Sent {String(row.sent_at || "").slice(0, 16).replace("T", " ")}
                {row.delivered_at ? ` · Delivered ${String(row.delivered_at || "").slice(0, 16).replace("T", " ")}` : ""}
              </p>
              {row.error_text && <p className="mt-1 text-xs text-red-300">{row.error_text}</p>}
            </div>
          ))}
          {!(bundle.notifications || []).length && <p className={T_CAPTION}>No notification records yet.</p>}
        </div>
      </div>

      {/* Phase 2: Receiving + Claims / Invoices / Payments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Receiving Records */}
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_CARD_TITLE} mb-1`}>Receiving Records</p>
          {bundle.phase2_validation && (
            <p className={`${T_CAPTION} mb-3`}>
              Payment Gate: {bundle.phase2_validation.status || "-"}
              {(bundle.phase2_validation.missing_stage_codes || []).length > 0
                ? ` · Missing: ${bundle.phase2_validation.missing_stage_codes.join(", ")}`
                : ""}
            </p>
          )}
          <div className="space-y-2">
            {(bundle.receivings || []).map((row: any) => (
              <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                <p className="font-mono text-sm font-semibold text-white">{row.receiving_no}</p>
                <p className={`${T_CAPTION} mt-0.5`}>
                  {row.status} · Qty {Number(row.qty_received || 0).toFixed(2)} / {Number(row.qty_expected || 0).toFixed(2)} · Quality: {row.quality_status || "-"}
                </p>
              </div>
            ))}
            {!(bundle.receivings || []).length && <p className={T_CAPTION}>No receiving records.</p>}
          </div>
        </div>

        {/* Claims */}
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_CARD_TITLE} mb-3`}>Claims / Invoices / Payments</p>
          <div className="space-y-2">
            {(bundle.claims || []).map((row: any) => {
              const hasPhoto = !!(row.photo_url || "").trim();
              const requiresPhoto = ["SHORTAGE", "QUALITY"].includes(String(row.claim_type || "").toUpperCase());
              return (
                <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.claim_no}</span>
                    <span className={BADGE_ACCENT}>{row.claim_type}</span>
                    <span className={row.status === "RESOLVED" ? BADGE_SUCCESS : row.status === "ESCALATED" ? BADGE_ERROR : BADGE_WARNING}>
                      {row.status}
                    </span>
                  </div>
                  <p className={`${T_CAPTION} mt-1`}>
                    Impact: {Number(row.amount_impact || 0).toFixed(2)} {currency}
                  </p>
                  {requiresPhoto && (
                    <div className="mt-1.5">
                      {hasPhoto ? (
                        <a
                          href={row.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          View photo evidence
                        </a>
                      ) : (
                        <span className={`${BADGE_WARNING} text-xs`}>
                          <AlertTriangle className="h-3 w-3" /> No Photo
                        </span>
                      )}
                    </div>
                  )}
                  {row.description && <p className="mt-1 text-xs text-zinc-400">{row.description}</p>}
                </div>
              );
            })}

            {(bundle.invoices || []).map((row: any) => (
              <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                <p className="font-mono text-sm font-semibold text-white">{row.invoice_no}</p>
                <p className={`${T_CAPTION} mt-0.5`}>
                  {row.status} · Match: {row.match_status} · Variance: {Number(row.variance_amount || 0).toFixed(2)} {currency}
                </p>
              </div>
            ))}

            {(bundle.payments || []).map((row: any) => (
              <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                <p className="font-mono text-sm font-semibold text-white">{row.payment_no}</p>
                <p className={`${T_CAPTION} mt-0.5`}>
                  {row.status} · Scheduled: {Number(row.scheduled_amount || 0).toFixed(2)} {currency}
                  {row.execution_ref ? ` · Ref: ${row.execution_ref}` : ""}
                </p>
              </div>
            ))}

            {!(bundle.claims || []).length && !(bundle.invoices || []).length && !(bundle.payments || []).length && (
              <p className={T_CAPTION}>No Phase 2 records yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
