"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
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
import { AlertCircle, Building2, Camera, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

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
  photo_url: string;
  resolution_note: string;
  created_at: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

function claimTypeBadge(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "SHORTAGE")         return <span className={BADGE_ERROR}>SHORTAGE</span>;
  if (t === "QUALITY")          return <span className={BADGE_WARNING}>QUALITY</span>;
  if (t === "EXCESS")           return <span className={BADGE_INFO}>EXCESS</span>;
  if (t === "INVOICE_VARIANCE") return <span className={BADGE_INFO}>INVOICE VARIANCE</span>;
  return <span className={BADGE_INFO}>{type}</span>;
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN")      return <span className={BADGE_ERROR}>OPEN</span>;
  if (s === "ASSIGNED")  return <span className={BADGE_WARNING}>ASSIGNED</span>;
  if (s === "ESCALATED") return <span className={BADGE_ERROR}>ESCALATED</span>;
  if (s === "RESOLVED")  return <span className={BADGE_SUCCESS}>RESOLVED</span>;
  return <span className={BADGE_INFO}>{status}</span>;
}

function severityBadge(severity: string) {
  const s = String(severity || "").toUpperCase();
  if (s === "HIGH" || s === "RED")    return <span className={BADGE_ERROR}>{severity}</span>;
  if (s === "MEDIUM" || s === "AMBER") return <span className={BADGE_WARNING}>{severity}</span>;
  if (s === "LOW" || s === "GREEN")   return <span className={BADGE_SUCCESS}>{severity}</span>;
  return <span className={BADGE_INFO}>{severity || "-"}</span>;
}

export default function ProcurementClaimsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState(String(auth?.city || "manila").toLowerCase());

  // List filters
  const [requestIdFilter, setRequestIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Create claim form
  const [createRequestId, setCreateRequestId] = useState("");
  const [receivingId, setReceivingId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [claimType, setClaimType] = useState("SHORTAGE");
  const [amountImpact, setAmountImpact] = useState("0");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [assignToById, setAssignToById] = useState<Record<string, string>>({});
  const [resolutionById, setResolutionById] = useState<Record<string, string>>({});
  const [escalateRoleById, setEscalateRoleById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (requestIdFilter.trim()) qs.set("request_id", requestIdFilter.trim());
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
    } finally {
      setLoading(false);
    }
  }, [pin, requestedBy, requestIdFilter, statusFilter]);

  const createClaim = async () => {
    if (!createRequestId.trim()) { setError("Request ID is required."); return; }
    setBusy("create"); setError(""); setInfo("");
    try {
      await procurementJson(
        "/api/admin/procurement/claims",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: createRequestId.trim(),
            receiving_id: receivingId.trim(),
            invoice_id: invoiceId.trim(),
            claim_type: claimType,
            amount_impact: Number(amountImpact || 0),
            responsible_party: responsibleParty.trim(),
            owner_name: ownerName.trim() || requestedBy.trim(),
            description: description.trim(),
            photo_url: "",
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setDescription(""); setCreateRequestId(""); setReceivingId(""); setInvoiceId("");
      setInfo("Claim created successfully.");
      setShowCreateForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const assignClaim = async (claimId: string) => {
    setBusy(claimId + ":assign"); setError("");
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
      setInfo(`Claim ${claimId.slice(0, 8)}… assigned.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const resolveClaim = async (claimId: string) => {
    setBusy(claimId + ":resolve"); setError("");
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
      setInfo("Claim resolved.");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const escalateClaim = async (claimId: string) => {
    setBusy(claimId + ":escalate"); setError("");
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
      setInfo("Claim escalated.");
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
      setRequestIdFilter((prev) => prev || initialRequestId);
      setCreateRequestId((prev) => prev || initialRequestId);
    }
  }, []);

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
      if (can) await load();
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement claims page is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Claims</h2>
          <p className="mt-1 text-sm text-zinc-400">Manage shortage, quality, excess, and invoice variance claims.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
            {rows.length} claim{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Auth + filter bar */}
      <div className={`${GLASS_CARD} p-4 space-y-4`}>
        <p className={`${T_SECTION}`}>Session &amp; Filters</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}><Building2 className="h-3 w-3" />City</label>
            <select value={city} onChange={(e) => setCity(String(e.target.value).toLowerCase())} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Status Filter</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="">All statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="ESCALATED">ESCALATED</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID filter</label>
            <input
              value={requestIdFilter}
              onChange={(e) => setRequestIdFilter(e.target.value)}
              placeholder="Filter by Request ID (optional)"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} flex items-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className={`${PRIMARY_BUTTON} text-sm`}
            >
              {showCreateForm ? "Cancel" : "+ New Claim"}
            </button>
          </div>
        </div>
      </div>

      {/* Create claim form */}
      {showCreateForm && (
        <div className={`${GLASS_CARD} p-5`}>
          <h3 className={`${T_SECTION} mb-4`}>Create Claim (Admin)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Request ID <span className="text-red-400">*</span></label>
              <input value={createRequestId} onChange={(e) => setCreateRequestId(e.target.value)} placeholder="UUID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Claim Type</label>
              <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className={SELECT_CLASS}>
                <option value="SHORTAGE">SHORTAGE</option>
                <option value="EXCESS">EXCESS</option>
                <option value="QUALITY">QUALITY</option>
                <option value="INVOICE_VARIANCE">INVOICE_VARIANCE</option>
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Receiving ID <span className="text-zinc-600 font-normal">(optional)</span></label>
              <input value={receivingId} onChange={(e) => setReceivingId(e.target.value)} placeholder="UUID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Invoice ID <span className="text-zinc-600 font-normal">(optional)</span></label>
              <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="UUID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Amount Impact ({currencyCode})</label>
              <input value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder="0.00" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Responsible Party</label>
              <input value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} placeholder="Vendor / staff name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Owner Name</label>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Defaults to approver name" className={INPUT_CLASS} />
            </div>
            <div className="sm:col-span-2">
              <label className={`${T_LABEL} mb-1.5 block`}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the claim…" rows={3} className={TEXTAREA_CLASS} />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => void createClaim()}
                disabled={busy === "create"}
                className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
              >
                {busy === "create" ? "Creating…" : "Create Claim"}
              </button>
              <p className="mt-1.5 text-center text-xs text-zinc-500">
                Note: SHORTAGE/QUALITY claims require a photo — store staff should use the Store Procurement channel.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {info && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{info}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading claims…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <AlertCircle className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No claims found.</p>
        </div>
      )}

      {/* Claims list */}
      <div className="space-y-4">
        {rows.map((row) => {
          const needsPhoto = ["SHORTAGE", "QUALITY"].includes((row.claim_type || "").toUpperCase());
          const hasPhoto = !!(row.photo_url || "").trim();
          return (
            <div key={row.id} className={`${GLASS_CARD} p-5`}>

              {/* Claim header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.claim_no}</span>
                    {claimTypeBadge(row.claim_type)}
                    {statusBadge(row.status)}
                    {severityBadge(row.severity)}
                    {needsPhoto && !hasPhoto && (
                      <span className={BADGE_ERROR}>⚠ No Photo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>Request <span className="text-zinc-200 font-mono">{row.request_no || row.request_id?.slice(0, 8)}</span></span>
                    <span>Store <span className="text-zinc-200">{row.store_code || "-"}</span></span>
                    <span>Impact <span className="font-semibold text-zinc-200">{Number(row.amount_impact || 0).toFixed(2)} {currencyCode}</span></span>
                    <span>Owner <span className="text-zinc-200">{row.owner_name || "-"}</span></span>
                    {row.assigned_to && <span>→ <span className="text-zinc-200">{row.assigned_to}</span></span>}
                    {row.escalated_to_role && <span>Escalated → <span className="text-red-300">{row.escalated_to_role}</span></span>}
                  </div>
                  <p className="text-xs text-zinc-500">Created {formatDateTime(row.created_at)}</p>
                  {row.description && <p className="text-sm text-zinc-300">{row.description}</p>}
                  {row.resolution_note && (
                    <p className="rounded-lg border border-emerald-700/30 bg-emerald-900/15 px-3 py-1.5 text-sm text-emerald-300">
                      {row.resolution_note}
                    </p>
                  )}

                  {/* Photo evidence */}
                  {needsPhoto && (
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      hasPhoto
                        ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-300"
                        : "border-amber-700/30 bg-amber-900/10 text-amber-300"
                    }`}>
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      {hasPhoto ? (
                        <a href={row.photo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline hover:text-emerald-200">
                          View photo evidence <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>No photo attached for this {row.claim_type} claim.</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {row.case_id && (
                    <Link
                      href={`/admin/procurement/cases/${row.case_id}`}
                      className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                    >
                      Open Case →
                    </Link>
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/6 pt-4 sm:grid-cols-4">
                <div>
                  <label className={`${T_LABEL} mb-1 block`}>Assign to</label>
                  <input
                    value={assignToById[row.id] || ""}
                    onChange={(e) => setAssignToById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Staff name"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={`${T_LABEL} mb-1 block`}>Resolution / escalation note</label>
                  <textarea
                    value={resolutionById[row.id] || ""}
                    onChange={(e) => setResolutionById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Note…"
                    rows={2}
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <div>
                  <label className={`${T_LABEL} mb-1 block`}>Escalate to</label>
                  <select
                    value={escalateRoleById[row.id] || "HQ"}
                    onChange={(e) => setEscalateRoleById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className={SELECT_CLASS}
                  >
                    <option value="HQ">HQ</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="HR_MANAGER">HR_MANAGER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="flex gap-2 sm:col-span-4">
                  <button
                    type="button"
                    onClick={() => void assignClaim(row.id)}
                    disabled={busy === row.id + ":assign"}
                    className="flex-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60"
                  >
                    {busy === row.id + ":assign" ? "Assigning…" : "Assign"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveClaim(row.id)}
                    disabled={busy === row.id + ":resolve"}
                    className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    {busy === row.id + ":resolve" ? "Resolving…" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void escalateClaim(row.id)}
                    disabled={busy === row.id + ":escalate"}
                    className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
                  >
                    {busy === row.id + ":escalate" ? "Escalating…" : "Escalate"}
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
