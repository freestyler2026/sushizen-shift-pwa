"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type ClaimRow = {
  id: string;
  request_id: string;
  case_id: string;
  receiving_id: string;
  invoice_id: string;
  request_no: string;
  store_code: string;
  claim_no: string;
  claim_type: string;
  amount_impact: number;
  responsible_party: string;
  owner_name: string;
  assigned_to: string;
  escalated_to_role: string;
  severity: string;
  status: string;
  description: string;
  resolution_note: string;
  created_at: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

export default function ProcurementClaimsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [receivingId, setReceivingId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [claimType, setClaimType] = useState("SHORTAGE");
  const [amountImpact, setAmountImpact] = useState("0");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [busy, setBusy] = useState("");
  const [assignToById, setAssignToById] = useState<Record<string, string>>({});
  const [resolutionById, setResolutionById] = useState<Record<string, string>>({});
  const [escalateRoleById, setEscalateRoleById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (requestId.trim()) qs.set("request_id", requestId.trim());
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "200");
      const data = await procurementJson<{ rows: ClaimRow[] }>(
        `/api/admin/procurement/claims?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const createClaim = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    setBusy("create");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/claims",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            receiving_id: receivingId.trim(),
            invoice_id: invoiceId.trim(),
            claim_type: claimType,
            amount_impact: Number(amountImpact || 0),
            responsible_party: responsibleParty.trim(),
            owner_name: ownerName.trim(),
            description: description.trim(),
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setDescription("");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const assignClaim = async (claimId: string) => {
    setBusy(claimId + ":assign");
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/claims/${claimId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim_id: claimId,
            assigned_to: assignToById[claimId] || "",
            owner_name: ownerName.trim() || requestedBy,
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

  const resolveClaim = async (claimId: string) => {
    setBusy(claimId + ":resolve");
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/claims/${claimId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim_id: claimId,
            resolution_note: resolutionById[claimId] || "",
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

  const escalateClaim = async (claimId: string) => {
    setBusy(claimId + ":escalate");
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/claims/${claimId}/escalate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim_id: claimId,
            target_role: escalateRoleById[claimId] || "HQ",
            comment: resolutionById[claimId] || "",
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
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
            <option value="OPEN">OPEN</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-3">
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={receivingId} onChange={(e) => setReceivingId(e.target.value)} placeholder="Receiving ID (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="SHORTAGE">SHORTAGE</option>
          <option value="EXCESS">EXCESS</option>
          <option value="QUALITY">QUALITY</option>
          <option value="INVOICE_VARIANCE">INVOICE_VARIANCE</option>
        </select>
        <input value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder="Amount impact" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} placeholder="Responsible party" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Owner name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Claim description" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3" />
        <button type="button" onClick={() => void createClaim()} disabled={busy === "create"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-3">
          {busy === "create" ? "Creating..." : "Create Claim"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-100">{row.claim_no}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.claim_type} | {row.severity} | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Store {row.store_code || "-"} | Impact {Number(row.amount_impact || 0).toFixed(2)} PHP | Owner {row.owner_name || "-"} | Assigned {row.assigned_to || "-"} | Escalated {row.escalated_to_role || "-"}
                </div>
                <div className="mt-2 text-sm text-neutral-300">{row.description || "-"}</div>
                {row.resolution_note ? <div className="mt-2 text-sm text-emerald-200">{row.resolution_note}</div> : null}
                <div className="mt-1 text-xs text-neutral-500">Created {formatDateTime(row.created_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/procurement/cases/${row.case_id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
                  Open Case
                </Link>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <input
                value={assignToById[row.id] || ""}
                onChange={(e) => setAssignToById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Assign to"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <textarea
                value={resolutionById[row.id] || ""}
                onChange={(e) => setResolutionById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Resolution or escalation note"
                className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={escalateRoleById[row.id] || "HQ"}
                onChange={(e) => setEscalateRoleById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <option value="HQ">HQ</option>
                <option value="FINANCE">FINANCE</option>
                <option value="HR_MANAGER">HR_MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button type="button" onClick={() => void assignClaim(row.id)} disabled={busy === row.id + ":assign"} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
                {busy === row.id + ":assign" ? "Assigning..." : "Assign"}
              </button>
              <button type="button" onClick={() => void resolveClaim(row.id)} disabled={busy === row.id + ":resolve"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
                {busy === row.id + ":resolve" ? "Resolving..." : "Resolve"}
              </button>
              <button type="button" onClick={() => void escalateClaim(row.id)} disabled={busy === row.id + ":escalate"} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/30 disabled:opacity-60 md:col-span-2">
                {busy === row.id + ":escalate" ? "Escalating..." : "Escalate"}
              </button>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No claims.</div> : null}
      </div>
    </div>
  );
}
