"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";

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

export default function ProcurementCaseDetailPage() {
  const auth = getAuth();
  const params = useParams<{ caseId: string }>();
  const caseId = String(params?.caseId || "");
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [bundle, setBundle] = useState<Bundle>({});
  const [message, setMessage] = useState("");
  const [escalateRole, setEscalateRole] = useState("HQ");
  const [uploadStage, setUploadStage] = useState("01_PR");
  const [uploadDocType, setUploadDocType] = useState("PR");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
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
    }
  }, [caseId, pin, requestedBy]);

  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(path);
    setError("");
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
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const upload = async () => {
    if (!uploadFile) {
      setError("Please choose a file.");
      return;
    }
    setBusy("upload");
    setError("");
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
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can && caseId) await load();
    }
    void init();
  }, [auth, caseId, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-3">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-lg font-semibold">{bundle.case?.parent_case_no || bundle.request?.request_no || caseId}</div>
        <div className="mt-1 text-sm text-neutral-400">
          {bundle.request?.requested_by || "-"} | {bundle.request?.store_code || "-"} | Severity {bundle.case?.severity || "-"} | Status {bundle.case?.status || "-"}
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Document Gate: {bundle.document_validation?.status || "-"} | Missing: {(bundle.document_validation?.missing_stage_codes || []).join(", ") || "none"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void act("approve", { case_id: caseId, approver_name: requestedBy, pin, comment: message })} disabled={busy === "approve"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
            {busy === "approve" ? "Approving..." : "Approve"}
          </button>
          <button type="button" onClick={() => void act("reject", { case_id: caseId, approver_name: requestedBy, pin, comment: message })} disabled={busy === "reject"} className="rounded-xl border border-rose-700/60 bg-rose-900/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-800/30 disabled:opacity-60">
            {busy === "reject" ? "Rejecting..." : "Reject"}
          </button>
          <button type="button" onClick={() => void act("message", { case_id: caseId, approver_name: requestedBy, pin, body: message || "Internal note", message_type: "NOTE" })} disabled={busy === "message"} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
            {busy === "message" ? "Posting..." : "Post Message"}
          </button>
          <button
            type="button"
            onClick={() => void act("notifications/resend", { case_id: caseId, approver_name: requestedBy, pin })}
            disabled={busy === "notifications/resend"}
            className="rounded-xl border border-fuchsia-700/60 bg-fuchsia-900/20 px-3 py-2 text-xs text-fuchsia-200 hover:bg-fuchsia-800/30 disabled:opacity-60"
          >
            {busy === "notifications/resend" ? "Resending..." : "Resend Push Notification"}
          </button>
          <select value={escalateRole} onChange={(e) => setEscalateRole(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
            <option value="HR_MANAGER">HR_MANAGER</option>
            <option value="HQ">HQ</option>
            <option value="FINANCE">FINANCE</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="button" onClick={() => void act("escalate", { case_id: caseId, approver_name: requestedBy, pin, target_role: escalateRole, comment: message })} disabled={busy === "escalate"} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-800/30 disabled:opacity-60">
            {busy === "escalate" ? "Escalating..." : "Escalate"}
          </button>
          <Link href={`/admin/procurement/pos?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open PO Screen
          </Link>
          <Link href={`/admin/procurement/receiving?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Receiving
          </Link>
          <Link href={`/admin/procurement/claims?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Claims
          </Link>
          <Link href={`/admin/procurement/invoices?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Invoices
          </Link>
          <Link href={`/admin/procurement/payments?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Payments
          </Link>
          <Link href={`/admin/procurement/audit?request_id=${encodeURIComponent(bundle.request?.id || "")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Audit
          </Link>
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Comment / case note" className="mt-3 min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-sm font-medium">Document Chain</div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            <select value={uploadStage} onChange={(e) => setUploadStage(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
              <option value="01_PR">01_PR</option>
              <option value="02_RFQ">02_RFQ</option>
              <option value="03_PO">03_PO</option>
              <option value="04_RECEIVING">04_RECEIVING</option>
              <option value="05_INVOICE">05_INVOICE</option>
              <option value="06_PAYMENT">06_PAYMENT</option>
              <option value="07_EXCEPTION">07_EXCEPTION</option>
            </select>
            <input value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} placeholder="Doc type" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <button type="button" onClick={() => void upload()} disabled={busy === "upload"} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
              {busy === "upload" ? "Uploading..." : "Upload"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {(bundle.documents || []).map((doc) => (
              <a key={doc.id} href={doc.web_view_link || "#"} target="_blank" rel="noreferrer" className="block rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900">
                <div className="text-sm text-neutral-100">{doc.stage_code} | {doc.file_name}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {doc.doc_type || "-"} | Uploaded by {doc.uploaded_by || "-"} | {doc.validation_status || "-"}
                </div>
              </a>
            ))}
            {!(bundle.documents || []).length ? <div className="text-sm text-neutral-500">No documents uploaded.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-sm font-medium">Message Timeline</div>
          <div className="mt-3 space-y-2">
            {(bundle.messages || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.message_type} | {row.actor_name}</div>
                <div className="mt-1 text-sm text-neutral-300">{row.body}</div>
                <div className="mt-1 text-xs text-neutral-500">{String(row.created_at || "").slice(0, 16).replace("T", " ")}</div>
              </div>
            ))}
            {!(bundle.messages || []).length ? <div className="text-sm text-neutral-500">No messages yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Approval History</div>
        <div className="mt-3 space-y-2">
          {(bundle.history || []).map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-200">
              {row.action} | {row.actor_role} | {row.actor_name} | {row.comment || "-"}
            </div>
          ))}
          {!(bundle.history || []).length ? <div className="text-sm text-neutral-500">No approval actions yet.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Notification Timeline</div>
        <div className="mt-3 space-y-2">
          {(bundle.notifications || []).map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-sm text-neutral-100">
                {row.channel || "-"} | {row.status || "-"} | {row.recipient_name || row.recipient_role || "-"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Provider {row.provider_status || "-"} {row.provider_ref ? `| Ref ${row.provider_ref}` : ""}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Sent {String(row.sent_at || "").slice(0, 16).replace("T", " ")}
                {row.delivered_at ? ` | Delivered ${String(row.delivered_at || "").slice(0, 16).replace("T", " ")}` : ""}
                {row.claimed_at ? ` | Claimed ${String(row.claimed_at || "").slice(0, 16).replace("T", " ")}` : ""}
              </div>
              {row.error_text ? <div className="mt-1 text-xs text-rose-300">{row.error_text}</div> : null}
            </div>
          ))}
          {!(bundle.notifications || []).length ? <div className="text-sm text-neutral-500">No notification records yet.</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-sm font-medium">Phase2 Control Summary</div>
          <div className="mt-2 text-xs text-neutral-500">
            Payment Gate: {bundle.phase2_validation?.status || "-"} | Missing: {(bundle.phase2_validation?.missing_stage_codes || []).join(", ") || "none"}
          </div>
          <div className="mt-3 space-y-2">
            {(bundle.receivings || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.receiving_no}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {row.status} | Qty {Number(row.qty_received || 0).toFixed(2)} / {Number(row.qty_expected || 0).toFixed(2)} | {row.quality_status || "-"}
                </div>
              </div>
            ))}
            {!(bundle.receivings || []).length ? <div className="text-sm text-neutral-500">No receiving records.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-sm font-medium">Claims / Invoices / Payments</div>
          <div className="mt-3 space-y-2">
            {(bundle.claims || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">Claim {row.claim_no}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {row.claim_type} | {row.status} | Impact {Number(row.amount_impact || 0).toFixed(2)} PHP
                </div>
              </div>
            ))}
            {(bundle.invoices || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">Invoice {row.invoice_no}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {row.status} | Match {row.match_status} | Variance {Number(row.variance_amount || 0).toFixed(2)}
                </div>
              </div>
            ))}
            {(bundle.payments || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">Payment {row.payment_no}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {row.status} | Scheduled {Number(row.scheduled_amount || 0).toFixed(2)} PHP | Ref {row.execution_ref || "-"}
                </div>
              </div>
            ))}
            {!(bundle.claims || []).length && !(bundle.invoices || []).length && !(bundle.payments || []).length ? (
              <div className="text-sm text-neutral-500">No Phase2 records yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
