"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, useRelativeAgeNow } from "@/lib/timeAgo";

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

const PAGE_BG = "min-h-screen text-white";
const GLASS_PANEL = "rounded-2xl border border-white/8 bg-violet-950/30 backdrop-blur-xl";
const FIELD_CLASS =
  "rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20";
const PRIMARY_BUTTON =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const SECONDARY_BUTTON =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-4 py-2 text-sm text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
const SMALL_LINK =
  "inline-flex rounded-xl border border-violet-400/15 bg-violet-950/30 px-3 py-2 text-xs text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45";

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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const actionHint = !requestId.trim()
    ? "Select a request first to create claim."
    : "";

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
      setError(e?.message || String(e));
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
      setInfo(claimNo ? `Claim created: ${claimNo}` : "Claim created.");
      setDescription("");
      await loadClaims();
    } catch (e: any) {
      setError(e?.message || String(e));
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
  }, [auth, city, loadClaims, loadMyRequests, requestedBy]);

  return (
    <div className={PAGE_BG}>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      {error ? <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</div> : null}
      {info ? <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">{info}</div> : null}
      {requestId.trim() ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/12 px-3 py-2 text-xs text-violet-200">
          Selected request_id: <span className="font-mono">{requestId.trim()}</span>
        </div>
      ) : null}
      {lastCreatedClaimId ? (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
          Last created claim: <span className="font-mono">{lastCreatedClaimNo || lastCreatedClaimId}</span>
          {lastCreatedClaimAt ? <span className="ml-2 text-[11px] text-emerald-300/90">({formatRelativeAge(lastCreatedClaimAt, relativeNowMs)})</span> : null}
          {lastCreatedClaimCaseId ? (
            <div className="mt-2">
              <Link
                href={`/admin/procurement/cases/${lastCreatedClaimCaseId}`}
                className={SMALL_LINK}
              >
                Open Case
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">Store Claims</div>
        <div className="mt-1 text-xs text-neutral-500">Create claim records for shortage, excess, quality issues, and invoice variance from store operations.</div>
        <div className="mt-2 text-xs text-violet-200">Current city: {cityLabel}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/store/procurement" className={SMALL_LINK}>
            Home
          </Link>
          <Link href={`/store/procurement/history?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to History
          </Link>
          <Link href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to Request
          </Link>
          <Link href={requestId ? `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}` : `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to Receiving
          </Link>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 p-3 md:grid-cols-5 ${GLASS_PANEL}`}>
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by" className={FIELD_CLASS} />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={FIELD_CLASS} />
        <select
          value={city}
          onChange={(e) => {
            const nextCity = String(e.target.value || "manila").toLowerCase();
            setCity(nextCity);
            void loadMyRequests(nextCity);
          }}
          className={FIELD_CLASS}
        >
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className={FIELD_CLASS} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FIELD_CLASS}>
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="ASSIGNED">ASSIGNED</option>
          <option value="ESCALATED">ESCALATED</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
        <button type="button" onClick={() => void Promise.all([loadMyRequests(), loadClaims()])} className={SECONDARY_BUTTON}>
          Refresh
        </button>
      </div>

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">My Requests (for claim, {cityLabel})</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setRequestId(row.id)}
              className={[
                "rounded-xl border p-3 text-left",
                requestId === row.id ? "border-violet-500/30 bg-violet-500/15" : "border-white/8 bg-black/15 hover:bg-violet-950/45",
              ].join(" ")}
            >
              <div className="text-sm text-neutral-100">{row.request_no}</div>
              <div className="mt-1 text-xs text-neutral-400">{row.store_code || "-"} | {row.status}</div>
              <div className="mt-2">
                <Link
                  href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
                  className={SMALL_LINK}
                  onClick={(e) => e.stopPropagation()}
                >
                  Open Receiving
                </Link>
              </div>
            </button>
          ))}
          {!requests.length ? <div className="text-sm text-neutral-500">No requests found.</div> : null}
        </div>
      </div>

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">Create Claim</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input value={receivingId} onChange={(e) => setReceivingId(e.target.value)} placeholder="Receiving ID (optional)" className={FIELD_CLASS} />
          <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID (optional)" className={FIELD_CLASS} />
          <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className={FIELD_CLASS}>
            <option value="SHORTAGE">SHORTAGE</option>
            <option value="EXCESS">EXCESS</option>
            <option value="QUALITY">QUALITY</option>
            <option value="INVOICE_VARIANCE">INVOICE_VARIANCE</option>
          </select>
          <input value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder={`Amount impact (${currencyCode})`} className={FIELD_CLASS} />
          <input value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} placeholder="Responsible party (vendor/etc)" className={`md:col-span-2 ${FIELD_CLASS}`} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Claim description" className={`min-h-24 md:col-span-3 ${FIELD_CLASS}`} />
          <button type="button" onClick={() => void createClaim()} disabled={busy === "create" || !requestId.trim()} className={`md:col-span-3 ${PRIMARY_BUTTON}`}>
            {busy === "create" ? "Creating..." : "Create Claim"}
          </button>
          {actionHint ? <div className="text-xs text-amber-300 md:col-span-3">{actionHint}</div> : null}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-2xl border p-4 ${
              row.id === lastCreatedClaimId
                ? "border-emerald-700/60 bg-emerald-900/20"
                : "border-white/8 bg-violet-950/25"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                  <span>{row.claim_no}</span>
                  {row.id === lastCreatedClaimId ? (
                    <span className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-200">
                      Just created
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.claim_type} | {row.severity} | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Impact {Number(row.amount_impact || 0).toFixed(2)} {currencyCode} | Owner {row.owner_name || "-"} | Assigned {row.assigned_to || "-"} | Escalated {row.escalated_to_role || "-"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">Created {formatDateTime(row.created_at)}</div>
                {row.description ? <div className="mt-2 text-sm text-neutral-300">{row.description}</div> : null}
                {row.resolution_note ? <div className="mt-2 text-sm text-emerald-200">{row.resolution_note}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {row.case_id ? (
                  <Link href={`/admin/procurement/cases/${row.case_id}`} className={SMALL_LINK}>
                    Open Case
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No claims found.</div> : null}
      </div>
      </div>
    </div>
  );
}
