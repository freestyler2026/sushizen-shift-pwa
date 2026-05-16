"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Camera, ChevronRight, RefreshCw, CheckCircle2, MapPin, Building2, X } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, friendlyProcurementError, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, useRelativeAgeNow } from "@/lib/timeAgo";
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
  T_BODY,
  T_CAPTION,
  T_CARD_TITLE,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { ProcurementStepper } from "@/components/ProcurementStepper";

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  status: string;
};

type ClaimRow = {
  id: string;
  request_id: string;
  case_id: string;
  claim_no: string;
  claim_type: string;
  amount_impact: number;
  severity: string;
  status: string;
  owner_name: string;
  assigned_to: string;
  escalated_to_role: string;
  description: string;
  resolution_note: string;
  created_at: string;
  request_no: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN") return <span className={BADGE_ERROR}>OPEN</span>;
  if (s === "ASSIGNED") return <span className={BADGE_WARNING}>ASSIGNED</span>;
  if (s === "ESCALATED") return <span className={BADGE_ERROR}>ESCALATED</span>;
  if (s === "RESOLVED") return <span className={BADGE_SUCCESS}>RESOLVED</span>;
  return <span className={BADGE_INFO}>{status}</span>;
}

function claimTypeBadge(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "SHORTAGE") return <span className={BADGE_ERROR}>SHORTAGE</span>;
  if (t === "QUALITY") return <span className={BADGE_WARNING}>QUALITY</span>;
  if (t === "EXCESS") return <span className={BADGE_INFO}>EXCESS</span>;
  return <span className={BADGE_INFO}>{type}</span>;
}

export default function StoreProcurementClaimPage() {
  const LAST_CREATED_CLAIM_KEY = "store_procurement_last_created_claim";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());
  const [requestId, setRequestId] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [lastCreatedClaimId, setLastCreatedClaimId] = useState("");
  const [lastCreatedClaimNo, setLastCreatedClaimNo] = useState("");
  const [lastCreatedClaimCaseId, setLastCreatedClaimCaseId] = useState("");
  const [lastCreatedClaimAt, setLastCreatedClaimAt] = useState("");
  const [receivingId, setReceivingId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [claimType, setClaimType] = useState("SHORTAGE");
  const [amountImpact, setAmountImpact] = useState("0");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const actionHint = !requestId.trim() ? "Select a request first to create a claim." : "";

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const qs = new URLSearchParams({
        city: activeCity,
        requested_by: requestedBy.trim(),
        limit: "200",
      });
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRequests(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    }
  }, [city, pin, requestedBy]);

  const loadClaims = useCallback(async () => {
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
      setError(friendlyProcurementError(e));
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const requiresPhoto = ["SHORTAGE", "QUALITY"].includes(claimType.toUpperCase());

  const uploadPhoto = async (file: File): Promise<string> => {
    setPhotoUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("approver_name", requestedBy.trim());
      fd.append("pin", pin.trim());
      fd.append("store_code", selectedRequest?.store_code || "");
      const res = await fetch("/api/admin/procurement/claims/upload-photo", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err?.detail || `Upload failed (${res.status})`);
      }
      const data = await res.json() as { url?: string };
      return data?.url || "";
    } finally {
      setPhotoUploading(false);
    }
  };

  const createClaim = async () => {
    if (!requestId.trim()) {
      setError("Please select a request first.");
      return;
    }
    if (requiresPhoto && !photoUrl.trim()) {
      setError("A photo is required for SHORTAGE and QUALITY claims. Please attach a photo.");
      return;
    }
    setBusy("create");
    setError("");
    setInfo("");
    try {
      const res = await procurementJson<{ row?: ClaimRow }>(
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
            owner_name: requestedBy.trim(),
            description: description.trim(),
            photo_url: photoUrl.trim(),
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      const claimNo = String(res?.row?.claim_no || "").trim();
      const claimId = String(res?.row?.id || "").trim();
      const caseId = String(res?.row?.case_id || "").trim();
      const createdAt = new Date().toISOString();
      setLastCreatedClaimId(claimId);
      setLastCreatedClaimNo(claimNo);
      setLastCreatedClaimCaseId(caseId);
      setLastCreatedClaimAt(createdAt);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            LAST_CREATED_CLAIM_KEY,
            JSON.stringify({
              id: claimId,
              claim_no: claimNo,
              case_id: caseId,
              request_id: requestId.trim(),
              at: createdAt,
            }),
          );
        } catch {}
      }
      setInfo(claimNo ? `Claim created: ${claimNo}` : "Claim created successfully.");
      // Keep claimType, responsibleParty, description for quick follow-up claims on same delivery
      setAmountImpact("0");
      setPhotoUrl("");
      setPhotoPreview("");
      if (photoInputRef.current) photoInputRef.current.value = "";
      await loadClaims();
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialCity = sp.get("city") || "";
    const initialRequestId = sp.get("request_id") || "";
    const initialReceivingId = sp.get("receiving_id") || "";
    if (initialCity) setCity(String(initialCity).toLowerCase());
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
    if (initialReceivingId) setReceivingId((prev) => prev || initialReceivingId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_CLAIM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; claim_no?: string; case_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const claimNo = String(parsed?.claim_no || "").trim();
      const caseId = String(parsed?.case_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_CLAIM_KEY);
        return;
      }
      if (id) {
        setLastCreatedClaimId(id);
        setLastCreatedClaimNo(claimNo);
        setLastCreatedClaimCaseId(caseId);
        setLastCreatedClaimAt(at);
      }
    } catch {}
  }, [LAST_CREATED_CLAIM_KEY, LAST_CREATED_MAX_AGE_MS, relativeNowMs]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      let queryCity = "";
      if (typeof window !== "undefined") {
        queryCity = String(new URLSearchParams(window.location.search).get("city") || "").toLowerCase();
      }
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase() || "manila";
      setCity(initialCity);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      await Promise.all([loadMyRequests(initialCity), loadClaims()]);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRequest = requests.find((r) => r.id === requestId);

  // Reload claims whenever requestId or statusFilter changes
  useEffect(() => {
    if (!requestId.trim() && !statusFilter.trim()) return;
    void loadClaims();
  }, [requestId, statusFilter, loadClaims]);

  // Duplicate claim warning — any open (non-CLOSED/RESOLVED) claims for this request
  const openExistingClaims = useMemo(
    () => rows.filter((r) => !["CLOSED", "RESOLVED", "REJECTED"].includes(String(r.status || "").toUpperCase())),
    [rows],
  );

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>File a Claim</h1>
            <p className={T_BODY}>Report shortage, excess, quality issues, or invoice variance.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-400">
            <MapPin className="h-3 w-3" />{cityLabel}
          </span>
        </div>

        {/* Stepper */}
        <div className={`${GLASS_CARD} px-6 py-3`}>
          <ProcurementStepper currentStep="claim" />
        </div>

        {/* Breadcrumb nav */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link href="/store/procurement" className="hover:text-violet-300 transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}`} className="hover:text-violet-300 transition-colors">New Request</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}${requestId ? `&request_id=${encodeURIComponent(requestId)}` : ""}`} className="hover:text-violet-300 transition-colors">Receiving</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-violet-300 font-medium">Claim</span>
        </div>

        {/* Banners */}
        {error && (
          <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        {info && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {info}
            {lastCreatedClaimCaseId && (
              <Link href={`/admin/procurement/cases/${lastCreatedClaimCaseId}`} className="ml-auto shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20">
                Open Case <ChevronRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        )}
        {lastCreatedClaimId && !info && (
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-xs text-emerald-200">
            Last created: <span className="font-mono font-semibold">{lastCreatedClaimNo || lastCreatedClaimId}</span>
            {lastCreatedClaimAt && <span className="ml-2 text-emerald-300/70">({formatRelativeAge(lastCreatedClaimAt, relativeNowMs)})</span>}
            {lastCreatedClaimCaseId && (
              <Link href={`/admin/procurement/cases/${lastCreatedClaimCaseId}`} className="ml-3 inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20">
                Open Case <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        {/* Two-column PC layout */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

          {/* ─── LEFT PANEL: Auth + Request Selector ─── */}
          <div className="flex flex-col gap-4 lg:w-72 xl:w-80 lg:shrink-0">

            {/* Auth */}
            <div className={`${GLASS_CARD} p-4 space-y-3`}>
              <p className={`${T_LABEL} mb-1`}>Session</p>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Your Name</label>
                <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                  <Building2 className="h-3 w-3" />
                  City
                </label>
                <select
                  value={city}
                  onChange={(e) => {
                    const nextCity = String(e.target.value || "manila").toLowerCase();
                    setCity(nextCity);
                    void loadMyRequests(nextCity);
                  }}
                  className={SELECT_CLASS}
                >
                  <option value="manila">Manila</option>
                  <option value="dubai">Dubai</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void Promise.all([loadMyRequests(), loadClaims()])}
                className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2 text-sm`}
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>

            {/* Selected request summary */}
            {selectedRequest && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3">
                <p className={`${T_LABEL} mb-1`}>Selected Request</p>
                <p className="font-mono text-sm font-semibold text-white">{selectedRequest.request_no}</p>
                <p className="mt-1 text-xs text-zinc-400">{selectedRequest.store_code || "-"}</p>
                <div className="mt-1.5">
                  {String(selectedRequest.status || "").toUpperCase() === "APPROVED" && <span className={BADGE_SUCCESS}>APPROVED</span>}
                  {String(selectedRequest.status || "").toUpperCase() === "RETURNED" && <span className={BADGE_ERROR}>RETURNED</span>}
                  {(String(selectedRequest.status || "").toUpperCase() === "IN_REVIEW" || String(selectedRequest.status || "").toUpperCase() === "SUBMITTED") && <span className={BADGE_INFO}>IN REVIEW</span>}
                  {String(selectedRequest.status || "").toUpperCase() === "RECEIVED" && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2.5 py-0.5 text-xs font-medium text-cyan-400">RECEIVED</span>}
                </div>
              </div>
            )}

            {/* Request selector */}
            <div className={`${GLASS_CARD} p-4`}>
              <p className={`${T_CARD_TITLE} mb-3`}>My Requests</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {requests.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setRequestId(row.id)}
                    className={[
                      "w-full rounded-xl border p-3 text-left transition-all duration-150",
                      requestId === row.id
                        ? "border-violet-500/40 bg-violet-500/15"
                        : "border-white/8 bg-white/4 hover:bg-violet-950/45 hover:border-violet-500/20",
                    ].join(" ")}
                  >
                    <div className="text-sm font-medium text-white">{row.request_no}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">{row.store_code || "-"} · {row.status}</div>
                  </button>
                ))}
                {!requests.length && (
                  <p className={`${T_CAPTION} py-4 text-center`}>No requests found.</p>
                )}
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL: Claim Form + History ─── */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">

            {/* Create Claim form */}
            <div className={`${GLASS_CARD} p-5`}>
              <h2 className={`${T_SECTION} mb-4`}>Create Claim</h2>

              {actionHint && (
                <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-900/15 px-4 py-2.5 text-sm text-amber-300">
                  {actionHint}
                </div>
              )}

              {/* Duplicate claim warning */}
              {requestId && openExistingClaims.length > 0 && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <div className="font-semibold">Open claim already exists</div>
                    <div className="mt-0.5 text-xs text-amber-300/80">
                      {openExistingClaims.length === 1
                        ? `${openExistingClaims[0].claim_no} (${openExistingClaims[0].status}) is already open for this request.`
                        : `${openExistingClaims.length} open claims exist for this request.`}
                      {" "}You can still file another claim if this is a separate issue.
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Claim type */}
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Claim Type</label>
                  <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className={SELECT_CLASS}>
                    <option value="SHORTAGE">SHORTAGE — Items missing from delivery</option>
                    <option value="EXCESS">EXCESS — More than ordered received</option>
                    <option value="QUALITY">QUALITY — Items damaged or substandard</option>
                    <option value="INVOICE_VARIANCE">INVOICE_VARIANCE — Price discrepancy</option>
                  </select>
                </div>

                {/* Amount impact */}
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Amount Impact ({currencyCode})</label>
                  <input
                    value={amountImpact}
                    onChange={(e) => setAmountImpact(e.target.value)}
                    placeholder="0.00"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Receiving ID — auto-populated from URL, editable */}
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Receiving ID <span className="text-zinc-600 normal-case font-normal">(optional)</span></label>
                  <input
                    value={receivingId}
                    onChange={(e) => setReceivingId(e.target.value)}
                    placeholder="Auto-populated after receiving"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Invoice ID */}
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Invoice ID <span className="text-zinc-600 normal-case font-normal">(optional)</span></label>
                  <input
                    value={invoiceId}
                    onChange={(e) => setInvoiceId(e.target.value)}
                    placeholder="Vendor invoice reference"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Responsible party */}
                <div className="sm:col-span-2">
                  <label className={`${T_LABEL} mb-1.5 block`}>Responsible Party</label>
                  <input
                    value={responsibleParty}
                    onChange={(e) => setResponsibleParty(e.target.value)}
                    placeholder="e.g. vendor name, delivery staff"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className={`${T_LABEL} mb-1.5 block`}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue in detail…"
                    rows={4}
                    className={TEXTAREA_CLASS}
                  />
                </div>

                {/* Photo attachment — required for SHORTAGE / QUALITY */}
                <div className="sm:col-span-2">
                  <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                    <Camera className="h-3 w-3" />
                    Photo Evidence
                    {requiresPhoto
                      ? <span className="text-red-400 font-semibold">*required</span>
                      : <span className="text-zinc-600 normal-case font-normal">(optional)</span>}
                  </label>

                  {/* Preview if already uploaded */}
                  {photoUrl && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-3 py-2 text-xs text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">
                        Photo uploaded.{" "}
                        <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-200">View</a>
                      </span>
                      {photoPreview && (
                        <img src={photoPreview} alt="preview" className="h-8 w-8 rounded object-cover border border-white/10" />
                      )}
                      <button
                        type="button"
                        onClick={() => { setPhotoUrl(""); setPhotoPreview(""); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                        className="rounded p-0.5 hover:bg-white/10"
                      >
                        <X className="h-3.5 w-3.5 text-zinc-400" />
                      </button>
                    </div>
                  )}

                  {/* Upload button */}
                  {!photoUrl && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className={[
                        "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition-colors",
                        requiresPhoto
                          ? "border-amber-500/40 bg-amber-950/10 text-amber-300 hover:border-amber-400/60 hover:bg-amber-950/20"
                          : "border-white/12 bg-white/3 text-zinc-400 hover:border-white/20 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <Camera className="h-4 w-4" />
                      {photoUploading ? "Uploading…" : "Tap to attach a photo"}
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Local preview
                      const reader = new FileReader();
                      reader.onload = (ev) => setPhotoPreview(String(ev.target?.result || ""));
                      reader.readAsDataURL(file);
                      // Upload
                      try {
                        const url = await uploadPhoto(file);
                        setPhotoUrl(url);
                        if (!url) setError("Photo upload succeeded but no URL was returned. Try again.");
                      } catch (err: any) {
                        setError(err?.message || "Photo upload failed.");
                        setPhotoPreview("");
                        if (photoInputRef.current) photoInputRef.current.value = "";
                      }
                    }}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => void createClaim()}
                    disabled={busy === "create" || !requestId.trim() || photoUploading || (requiresPhoto && !photoUrl.trim())}
                    className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
                  >
                    <AlertCircle className="h-4 w-4" />
                    {busy === "create" ? "Submitting…" : "Submit Claim"}
                  </button>
                  {requiresPhoto && !photoUrl && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
                      <span className="mt-0.5 shrink-0">⚠</span>
                      <span>
                        A photo is required for <strong>{claimType}</strong> claims. Scroll up and attach a photo to enable submit.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Claims history */}
            {rows.length > 0 && (
              <div className={`${GLASS_CARD} p-5`}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={T_SECTION}>Claim History</h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-lg border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500/50"
                    >
                      <option value="">All statuses</option>
                      <option value="OPEN">OPEN</option>
                      <option value="ASSIGNED">ASSIGNED</option>
                      <option value="ESCALATED">ESCALATED</option>
                      <option value="RESOLVED">RESOLVED</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-xl border px-4 py-3 ${
                        row.id === lastCreatedClaimId
                          ? "border-emerald-700/50 bg-emerald-900/15"
                          : "border-white/8 bg-white/4"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-white">{row.claim_no}</span>
                            {row.id === lastCreatedClaimId && <span className={BADGE_SUCCESS}>Just created</span>}
                            {claimTypeBadge(row.claim_type)}
                            {statusBadge(row.status)}
                          </div>
                          <div className="mt-1.5 text-xs text-zinc-500">
                            {row.request_no || row.request_id}
                            {row.severity ? <span className="ml-2">· {row.severity}</span> : null}
                            {Number(row.amount_impact) > 0 ? (
                              <span className="ml-2">· Impact: <span className="font-semibold text-zinc-300">{Number(row.amount_impact).toFixed(2)} {currencyCode}</span></span>
                            ) : null}
                          </div>
                          {row.owner_name && (
                            <div className="mt-1 text-xs text-zinc-600">
                              Owner: {row.owner_name}
                              {row.assigned_to ? ` · Assigned: ${row.assigned_to}` : ""}
                              {row.escalated_to_role ? ` · Escalated to: ${row.escalated_to_role}` : ""}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-zinc-600">Created: {formatDateTime(row.created_at)}</div>
                          {row.description && <div className="mt-2 text-sm text-zinc-300">{row.description}</div>}
                          {row.resolution_note && <div className="mt-2 text-sm text-emerald-300">{row.resolution_note}</div>}
                        </div>
                        {row.case_id && (
                          <Link
                            href={`/admin/procurement/cases/${row.case_id}`}
                            className={SMALL_BUTTON}
                          >
                            Open Case
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rows.length === 0 && (
              <div className={`${GLASS_CARD} p-8 flex flex-col items-center gap-2`}>
                <AlertCircle className="h-8 w-8 text-zinc-600" />
                <p className={T_CAPTION}>No claims yet for this request.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
