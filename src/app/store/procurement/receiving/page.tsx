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
  total_amount: number;
};

type ReceivingRow = {
  id: string;
  request_id: string;
  case_id: string;
  request_no: string;
  receiving_no: string;
  vendor_name: string;
  qty_expected: number;
  qty_received: number;
  shortage_qty: number;
  excess_qty: number;
  unit: string;
  unit_price: number;
  amount_received: number;
  quality_status: string;
  status: string;
  variance_reason: string;
  confirmed_by: string;
  confirmed_at: string;
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

export default function StoreProcurementReceivingPage() {
  const LAST_CREATED_RECEIVING_KEY = "store_procurement_last_created_receiving";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());
  const [requestId, setRequestId] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [lastCreatedReceivingId, setLastCreatedReceivingId] = useState("");
  const [lastCreatedReceivingNo, setLastCreatedReceivingNo] = useState("");
  const [lastCreatedReceivingRequestId, setLastCreatedReceivingRequestId] = useState("");
  const [lastCreatedReceivingAt, setLastCreatedReceivingAt] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [poId, setPoId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [qtyExpected, setQtyExpected] = useState("0");
  const [qtyReceived, setQtyReceived] = useState("0");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [qualityStatus, setQualityStatus] = useState("ACCEPTED");
  const [varianceReason, setVarianceReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const actionHint = !requestId.trim()
    ? "Select a request first to create receiving."
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

  const loadReceivings = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (requestId.trim()) qs.set("request_id", requestId.trim());
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "200");
      const data = await procurementJson<{ rows: ReceivingRow[] }>(
        `/api/admin/procurement/receiving?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const createReceiving = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    setBusy("create");
    setError("");
    setInfo("");
    try {
      const res = await procurementJson<{ row?: ReceivingRow }>(
        "/api/admin/procurement/receiving",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            po_id: poId.trim(),
            vendor_name: vendorName.trim(),
            delivery_date: deliveryDate.trim(),
            qty_expected: Number(qtyExpected || 0),
            qty_received: Number(qtyReceived || 0),
            unit: unit.trim(),
            unit_price: Number(unitPrice || 0),
            quality_status: qualityStatus,
            variance_reason: varianceReason.trim(),
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      const createdNo = String(res?.row?.receiving_no || "").trim();
      const createdId = String(res?.row?.id || "").trim();
      const createdRequestId = String(res?.row?.request_id || requestId || "").trim();
      const createdAt = new Date().toISOString();
      setLastCreatedReceivingId(createdId);
      setLastCreatedReceivingNo(createdNo);
      setLastCreatedReceivingRequestId(createdRequestId);
      setLastCreatedReceivingAt(createdAt);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            LAST_CREATED_RECEIVING_KEY,
            JSON.stringify({
              id: createdId,
              receiving_no: createdNo,
              request_id: createdRequestId,
              at: createdAt,
            }),
          );
        } catch {}
      }
      setInfo(createdNo ? `Receiving created: ${createdNo}` : "Receiving created.");
      setVarianceReason("");
      await loadReceivings();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const confirmReceiving = async (receivingId: string) => {
    setBusy(receivingId);
    setError("");
    setInfo("");
    try {
      const res = await procurementJson<{ row?: ReceivingRow }>(
        `/api/admin/procurement/receiving/${receivingId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiving_id: receivingId,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setInfo(`Receiving confirmed: ${String(res?.row?.receiving_no || receivingId)}`);
      await loadReceivings();
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
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_RECEIVING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; receiving_no?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const receivingNo = String(parsed?.receiving_no || "").trim();
      const createdRequestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_RECEIVING_KEY);
        return;
      }
      if (id) {
        setLastCreatedReceivingId(id);
        setLastCreatedReceivingNo(receivingNo);
        setLastCreatedReceivingRequestId(createdRequestId);
        setLastCreatedReceivingAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_RECEIVING_KEY, relativeNowMs]);

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
      await Promise.all([loadMyRequests(initialCity), loadReceivings()]);
    }
    void init();
  }, [auth, city, loadMyRequests, loadReceivings, requestedBy]);

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
      {lastCreatedReceivingId ? (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
          Last created receiving: <span className="font-mono">{lastCreatedReceivingNo || lastCreatedReceivingId}</span>
          {lastCreatedReceivingAt ? <span className="ml-2 text-[11px] text-emerald-300/90">({formatRelativeAge(lastCreatedReceivingAt, relativeNowMs)})</span> : null}
          <div className="mt-2">
            <Link
              href={`/store/procurement/claim?request_id=${encodeURIComponent(lastCreatedReceivingRequestId || requestId)}&receiving_id=${encodeURIComponent(lastCreatedReceivingId)}`}
              className={SMALL_LINK}
            >
              Continue to Claim
            </Link>
          </div>
        </div>
      ) : null}

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">Store Receiving</div>
        <div className="mt-1 text-xs text-neutral-500">Register received quantities and confirm receiving records from store operations.</div>
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
          <Link href={requestId ? `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}` : `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to Claim
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
          <option value="DRAFT">DRAFT</option>
          <option value="CONFIRMED">CONFIRMED</option>
        </select>
        <button type="button" onClick={() => void Promise.all([loadMyRequests(), loadReceivings()])} className={SECONDARY_BUTTON}>
          Refresh
        </button>
      </div>

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">My Requests (for receiving, {cityLabel})</div>
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
              <div className="mt-1 text-xs text-neutral-500">{Number(row.total_amount || 0).toFixed(2)} {currencyCode}</div>
              <div className="mt-2">
                <Link
                  href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
                  className={SMALL_LINK}
                  onClick={(e) => e.stopPropagation()}
                >
                  Open Claim
                </Link>
              </div>
            </button>
          ))}
          {!requests.length ? <div className="text-sm text-neutral-500">No requests found.</div> : null}
        </div>
      </div>

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">Create Receiving</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input value={poId} onChange={(e) => setPoId(e.target.value)} placeholder="PO ID (optional)" className={FIELD_CLASS} />
          <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name (optional)" className={FIELD_CLASS} />
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={FIELD_CLASS} />
          <input value={qtyExpected} onChange={(e) => setQtyExpected(e.target.value)} placeholder="Qty expected" className={FIELD_CLASS} />
          <input value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} placeholder="Qty received" className={FIELD_CLASS} />
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className={FIELD_CLASS} />
          <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder={`Unit price (${currencyCode})`} className={FIELD_CLASS} />
          <select value={qualityStatus} onChange={(e) => setQualityStatus(e.target.value)} className={FIELD_CLASS}>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="QUALITY_REVIEW">QUALITY_REVIEW</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <textarea value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} placeholder="Variance / quality note" className={`min-h-20 md:col-span-3 ${FIELD_CLASS}`} />
          <button type="button" onClick={() => void createReceiving()} disabled={busy === "create" || !requestId.trim()} className={`md:col-span-3 ${PRIMARY_BUTTON}`}>
            {busy === "create" ? "Creating..." : "Create Receiving"}
          </button>
          {actionHint ? <div className="text-xs text-amber-300 md:col-span-3">{actionHint}</div> : null}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-2xl border p-4 ${
              row.id === lastCreatedReceivingId
                ? "border-emerald-700/60 bg-emerald-900/20"
                : "border-white/8 bg-violet-950/25"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                  <span>{row.receiving_no}</span>
                  {row.id === lastCreatedReceivingId ? (
                    <span className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-200">
                      Just created
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.vendor_name || "-"} | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Qty {Number(row.qty_received || 0).toFixed(2)} / {Number(row.qty_expected || 0).toFixed(2)} | Short {Number(row.shortage_qty || 0).toFixed(2)} | Excess {Number(row.excess_qty || 0).toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Quality {row.quality_status || "-"} | Amount {Number(row.amount_received || 0).toFixed(2)} {currencyCode} | Confirmed {row.confirmed_by || "-"} at {formatDateTime(row.confirmed_at)}
                </div>
                {row.variance_reason ? <div className="mt-1 text-sm text-amber-200">{row.variance_reason}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {row.case_id ? (
                  <Link href={`/admin/procurement/cases/${row.case_id}`} className={SMALL_LINK}>
                    Open Case
                  </Link>
                ) : null}
                <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.request_id)}&receiving_id=${encodeURIComponent(row.id)}`} className={SMALL_LINK}>
                  Create Claim
                </Link>
                <button
                  type="button"
                  onClick={() => void confirmReceiving(row.id)}
                  disabled={busy === row.id || row.status === "CONFIRMED"}
                  className={row.status === "CONFIRMED" ? SECONDARY_BUTTON : PRIMARY_BUTTON}
                >
                  {busy === row.id ? "Confirming..." : row.status === "CONFIRMED" ? "Confirmed" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No receiving records.</div> : null}
      </div>
      </div>
    </div>
  );
}
