"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, Package, ChevronRight, CheckCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, useRelativeAgeNow } from "@/lib/timeAgo";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  status: string;
  total_amount: number;
  requested_by: string;
  request_date: string;
};

type RequestItem = {
  id: string;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name: string;
};

type RequestDetail = {
  id: string;
  request_no: string;
  store_code: string;
  status: string;
  total_amount: number;
  requested_by: string;
  request_date: string;
  items: RequestItem[];
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

type ItemCheck = {
  checked: boolean;
  qty_received: number;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const GLASS = "rounded-2xl border border-white/8 bg-violet-950/30 backdrop-blur-xl";
const FIELD = "rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 outline-none";
const BTN_PRIMARY = "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100";
const BTN_SECONDARY = "rounded-xl border border-violet-400/15 bg-violet-950/30 px-3 py-2 text-xs text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45";
const BTN_CONFIRM = "flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:scale-[1.02] hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100";

function formatDate(v: string) {
  return v ? String(v).slice(0, 10) : "-";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoreProcurementReceivingPage() {
  const LAST_CREATED_KEY = "store_procurement_last_created_receiving";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);

  // Auth fields
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());

  // Request selection
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestId, setRequestId] = useState("");
  const [requestDetail, setRequestDetail] = useState<RequestDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  // Per-item check state: itemId → { checked, qty_received }
  const [itemChecks, setItemChecks] = useState<Record<string, ItemCheck>>({});

  // Delivery form
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [overallQuality, setOverallQuality] = useState("ACCEPTED");
  const [notes, setNotes] = useState("");

  // Receiving records
  const [rows, setRows] = useState<ReceivingRow[]>([]);

  // Last created
  const [lastCreatedId, setLastCreatedId] = useState("");
  const [lastCreatedNo, setLastCreatedNo] = useState("");
  const [lastCreatedRequestId, setLastCreatedRequestId] = useState("");
  const [lastCreatedAt, setLastCreatedAt] = useState("");

  // UI state
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formError, setFormError] = useState("");

  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  // ── Load my requests ──────────────────────────────────────────────────────

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    try {
      const activeCity = String(cityOverride || city || "manila").toLowerCase();
      const qs = new URLSearchParams({ city: activeCity, requested_by: requestedBy.trim(), limit: "200" });
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRequests(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city, pin, requestedBy]);

  // ── Load receivings ────────────────────────────────────────────────────────

  const loadReceivings = useCallback(async (rid?: string) => {
    try {
      const qs = new URLSearchParams({ limit: "200" });
      const targetId = (rid ?? requestId).trim();
      if (targetId) qs.set("request_id", targetId);
      const data = await procurementJson<{ rows: ReceivingRow[] }>(
        `/api/admin/procurement/receiving?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestId, requestedBy]);

  // ── Load request detail (items) ───────────────────────────────────────────

  const loadRequestDetail = useCallback(async (rid: string) => {
    if (!rid) { setRequestDetail(null); setItemChecks({}); return; }
    setDetailBusy(true);
    try {
      const data = await procurementJson<{ request: RequestDetail }>(
        `/api/admin/procurement/requests/${encodeURIComponent(rid)}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      const detail = data?.request ?? null;
      setRequestDetail(detail);
      // Initialize item check state — all UNCHECKED, qty = ordered qty
      if (detail?.items) {
        const init: Record<string, ItemCheck> = {};
        for (const it of detail.items) {
          init[it.id] = { checked: false, qty_received: it.qty };
        }
        setItemChecks(init);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDetailBusy(false);
    }
  }, [pin, requestedBy]);

  // ── Item check helpers ────────────────────────────────────────────────────

  function toggleItem(id: string) {
    setItemChecks((prev) => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id]?.checked },
    }));
  }

  function setItemQty(id: string, qty: number) {
    setItemChecks((prev) => ({
      ...prev,
      [id]: { ...prev[id], qty_received: qty },
    }));
  }

  function checkAll() {
    setItemChecks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = { ...next[k], checked: true };
      return next;
    });
  }

  // ── Computed totals from checklist ────────────────────────────────────────

  const computedTotals = useMemo(() => {
    const items = requestDetail?.items ?? [];
    const qtyExpected = items.reduce((s, it) => s + (it.qty || 0), 0);
    const qtyReceived = items.reduce((s, it) => {
      const chk = itemChecks[it.id];
      return s + (chk?.checked ? (chk.qty_received ?? it.qty) : 0);
    }, 0);
    const checkedCount = items.filter((it) => itemChecks[it.id]?.checked).length;
    const totalCount = items.length;
    return { qtyExpected, qtyReceived, checkedCount, totalCount };
  }, [itemChecks, requestDetail]);

  // ── Submit request (DRAFT → SUBMITTED, creates approval case) ────────────

  const submitRequest = async () => {
    if (!requestId.trim()) return;
    setBusy("submit");
    setFormError("");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/requests/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setInfo("Request submitted. You can now record a delivery.");
      // Reload requests list to reflect new status
      await loadMyRequests();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setFormError(msg);
      setError(msg);
    } finally {
      setBusy("");
    }
  };

  // ── Create receiving ──────────────────────────────────────────────────────

  const createReceiving = async () => {
    if (!requestId.trim()) { setFormError("Please select a request first."); return; }
    setBusy("create");
    setError("");
    setFormError("");
    setInfo("");
    try {
      // Aggregate vendor name from items
      const items = requestDetail?.items ?? [];
      const vendors = [...new Set(items.map((it) => it.vendor_name).filter(Boolean))];
      const vendorName = vendors.join(", ");
      const firstUnit = items[0]?.unit ?? "";

      const res = await procurementJson<{ row?: ReceivingRow }>(
        "/api/admin/procurement/receiving",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            vendor_name: vendorName,
            delivery_date: deliveryDate,
            qty_expected: computedTotals.qtyExpected,
            qty_received: computedTotals.qtyReceived,
            unit: firstUnit,
            unit_price: 0,
            quality_status: overallQuality,
            variance_reason: notes.trim(),
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
      setLastCreatedId(createdId);
      setLastCreatedNo(createdNo);
      setLastCreatedRequestId(createdRequestId);
      setLastCreatedAt(createdAt);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LAST_CREATED_KEY, JSON.stringify({ id: createdId, receiving_no: createdNo, request_id: createdRequestId, at: createdAt }));
        } catch {}
      }
      setFormError("");
      setInfo(createdNo ? `Receiving created: ${createdNo}` : "Receiving created.");
      setNotes("");
      await loadReceivings(requestId);
    } catch (e: any) {
      const msg = (e?.message || String(e));
      setFormError(msg);
      setError(msg);
    } finally {
      setBusy("");
    }
  };

  // ── Confirm receiving ─────────────────────────────────────────────────────

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
          body: JSON.stringify({ receiving_id: receivingId, approver_name: requestedBy.trim(), pin: pin.trim() }),
        },
        requestedBy,
        pin,
      );
      setInfo(`Confirmed: ${String(res?.row?.receiving_no || receivingId)}`);
      await loadReceivings();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initial = sp.get("request_id") || "";
    if (initial) setRequestId(initial);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      if (p?.at && isOlderThan(p.at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) { window.localStorage.removeItem(LAST_CREATED_KEY); return; }
      if (p?.id) { setLastCreatedId(p.id); setLastCreatedNo(p.receiving_no || ""); setLastCreatedRequestId(p.request_id || ""); setLastCreatedAt(p.at || ""); }
    } catch {}
  }, [LAST_CREATED_KEY, LAST_CREATED_MAX_AGE_MS, relativeNowMs]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      let queryCity = "";
      if (typeof window !== "undefined") queryCity = String(new URLSearchParams(window.location.search).get("city") || "").toLowerCase();
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase();
      setCity(initialCity);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) setRequestedBy(String(refreshed.staffName).trim());
      await Promise.all([loadMyRequests(initialCity), loadReceivings()]);
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (requestId) {
      void loadRequestDetail(requestId);
      void loadReceivings(requestId);
    } else {
      setRequestDetail(null);
      setItemChecks({});
    }
  }, [requestId, loadRequestDetail, loadReceivings]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectedRequest = requests.find((r) => r.id === requestId);

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">

        {/* ── Error / Info banners ── */}
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {info}
          </div>
        ) : null}

        {/* ── Last created receiving banner ── */}
        {lastCreatedId ? (
          <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/15 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  {lastCreatedNo || "Receiving created"}
                  {lastCreatedAt ? <span className="text-[11px] font-normal text-emerald-300/70">({formatRelativeAge(lastCreatedAt, relativeNowMs)})</span> : null}
                </div>
              </div>
              <Link
                href={`/store/procurement/claim?request_id=${encodeURIComponent(lastCreatedRequestId || requestId)}&receiving_id=${encodeURIComponent(lastCreatedId)}`}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                Continue to Claim <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : null}

        {/* ── Header ── */}
        <div className={`${GLASS} p-4`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-semibold">Store Receiving</span>
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">{cityLabel}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Record deliveries and confirm received items.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/store/procurement" className={BTN_SECONDARY}>Home</Link>
            <Link href={`/store/procurement/history?city=${encodeURIComponent(city)}`} className={BTN_SECONDARY}>History</Link>
            <Link href={`/store/procurement/request?city=${encodeURIComponent(city)}`} className={BTN_SECONDARY}>New Request</Link>
            <Link href={`/store/procurement/claim?city=${encodeURIComponent(city)}`} className={BTN_SECONDARY}>Claim</Link>
          </div>
        </div>

        {/* ── Auth row ── */}
        <div className={`${GLASS} grid grid-cols-2 gap-2 p-3 md:grid-cols-4`}>
          <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" className={FIELD} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={FIELD} />
          <select value={city} onChange={(e) => { const c = e.target.value; setCity(c); void loadMyRequests(c); }} className={FIELD}>
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
          <button
            type="button"
            onClick={() => void Promise.all([loadMyRequests(), loadReceivings()])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-950/30 py-2 text-xs text-white transition hover:bg-violet-950/45"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* ── Step 1: Select a request ── */}
        <div className={`${GLASS} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Step 1 — Select Request</div>
              <div className="text-xs text-zinc-500">Tap a request to start receiving.</div>
            </div>
            {requestId && (
              <button type="button" onClick={() => { setRequestId(""); setRequestDetail(null); setRows([]); }} className="text-xs text-zinc-500 underline">
                Clear
              </button>
            )}
          </div>
          <div className="space-y-2">
            {requests.map((row) => {
              const selected = requestId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setRequestId(row.id)}
                  className={[
                    "w-full rounded-xl border p-3 text-left transition-all duration-150",
                    selected
                      ? "border-violet-500/40 bg-violet-500/12 ring-1 ring-violet-500/20"
                      : "border-white/8 bg-black/15 hover:border-violet-400/20 hover:bg-violet-950/30",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selected ? (
                        <CheckCircle2 className="h-4 w-4 text-violet-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-zinc-600" />
                      )}
                      <span className="text-sm font-medium text-white">{row.request_no}</span>
                    </div>
                    <span className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      row.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" :
                      row.status === "SUBMITTED" ? "bg-amber-500/15 text-amber-300" :
                      "bg-zinc-500/15 text-zinc-400"
                    ].join(" ")}>
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between pl-6">
                    <span className="text-xs text-zinc-400">{row.store_code || "-"} · {formatDate(row.request_date)}</span>
                    <span className="text-xs font-medium text-violet-300">{Number(row.total_amount || 0).toFixed(2)} {currencyCode}</span>
                  </div>
                </button>
              );
            })}
            {!requests.length ? (
              <div className="py-4 text-center text-sm text-zinc-500">No requests found for {requestedBy || "this user"}.</div>
            ) : null}
          </div>
        </div>

        {/* ── Step 2: Items checklist + Delivery form ── */}
        {requestId ? (
          <div className={`${GLASS} p-4`}>
            <div className="mb-4">
              <div className="text-sm font-semibold">Step 2 — Check Delivered Items</div>
              {selectedRequest ? (
                <div className="mt-1 text-xs text-zinc-400">
                  {selectedRequest.request_no} · {selectedRequest.store_code} · {Number(selectedRequest.total_amount || 0).toFixed(2)} {currencyCode}
                </div>
              ) : null}
            </div>

            {detailBusy ? (
              <div className="py-6 text-center text-sm text-zinc-500">Loading items…</div>
            ) : requestDetail?.items?.length ? (
              <>
                {/* Items checklist */}
                <div className="mb-4 overflow-hidden rounded-xl border border-white/8">
                  {/* Header row */}
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/8 bg-black/20 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    <div className="w-6"></div>
                    <div>Item</div>
                    <div className="w-24 text-right">Received</div>
                  </div>

                  {/* Item rows */}
                  {requestDetail.items.map((item) => {
                    const chk = itemChecks[item.id] ?? { checked: true, qty_received: item.qty };
                    return (
                      <div
                        key={item.id}
                        className={[
                          "grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/5 px-3 py-3 last:border-0 transition-colors",
                          chk.checked ? "bg-emerald-900/5" : "bg-black/10 opacity-60",
                        ].join(" ")}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center transition"
                        >
                          {chk.checked ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <Circle className="h-5 w-5 text-zinc-600" />
                          )}
                        </button>

                        {/* Item info */}
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-medium ${chk.checked ? "text-white" : "text-zinc-500 line-through"}`}>
                            {item.item_name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                            <span>{item.vendor_name || "-"}</span>
                            <span>·</span>
                            <span>Ordered: {item.qty} {item.unit}</span>
                          </div>
                        </div>

                        {/* Qty received input */}
                        <div className="w-24 text-right">
                          {chk.checked ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={chk.qty_received || ""}
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setItemQty(item.id, Number(e.target.value || 0))}
                                className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-right text-xs text-white focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                              />
                              <span className="text-[11px] text-zinc-500">{item.unit}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-600">skipped</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Check all / summary bar */}
                <div className="mb-4 flex items-center justify-between rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                  <div className="text-xs text-zinc-400">
                    {computedTotals.checkedCount === 0 ? (
                      <span className="text-zinc-500">Tap ○ next to each item as it arrives</span>
                    ) : (
                      <>
                        <span className="font-medium text-emerald-300">{computedTotals.checkedCount}</span>
                        <span className="text-zinc-500"> / {computedTotals.totalCount} items received</span>
                        <span className="mx-2 text-zinc-600">·</span>
                        <span className="font-medium text-white">{computedTotals.qtyReceived.toFixed(1)}</span>
                        <span className="text-zinc-500"> units</span>
                        {computedTotals.checkedCount > 0 && computedTotals.qtyExpected !== computedTotals.qtyReceived ? (
                          <span className="ml-2 text-amber-400">
                            ({(computedTotals.qtyReceived - computedTotals.qtyExpected > 0 ? "+" : "")}{(computedTotals.qtyReceived - computedTotals.qtyExpected).toFixed(1)} vs ordered)
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <button type="button" onClick={checkAll} className="text-xs text-violet-400 hover:text-violet-300 transition">
                    All received
                  </button>
                </div>

                {/* Delivery details */}
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-400">Delivery Date</label>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={`w-full ${FIELD}`} />
                  </div>
                  <div className="col-span-2 md:col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-400">Quality</label>
                    <div className="flex gap-2">
                      {(["ACCEPTED", "QUALITY_REVIEW", "REJECTED"] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setOverallQuality(q)}
                          className={[
                            "flex-1 rounded-xl border py-2 text-xs font-medium transition",
                            overallQuality === q
                              ? q === "ACCEPTED" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : q === "QUALITY_REVIEW" ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                                : "border-red-500/40 bg-red-500/15 text-red-300"
                              : "border-white/8 bg-black/15 text-zinc-500 hover:text-zinc-300",
                          ].join(" ")}
                        >
                          {q === "ACCEPTED" ? "✓ OK" : q === "QUALITY_REVIEW" ? "⚠ Review" : "✗ Reject"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">Notes / Variance Reason (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. 2 boxes short, item damaged..."
                    rows={2}
                    className={`w-full resize-none ${FIELD}`}
                  />
                </div>

                {/* DRAFT → needs submit before receiving */}
                {selectedRequest && selectedRequest.status === "DRAFT" ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
                    <div className="flex items-start gap-2 text-sm text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <div>
                        <div className="font-semibold">Request is still DRAFT</div>
                        <div className="mt-0.5 text-xs text-amber-300/80">Submit this request first to create an approval record, then you can record the delivery.</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void submitRequest()}
                      disabled={busy === "submit"}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:from-amber-400 hover:to-orange-400 disabled:opacity-60"
                    >
                      {busy === "submit" ? (
                        <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</>
                      ) : (
                        <><ChevronRight className="h-4 w-4" /> Submit Request First</>
                      )}
                    </button>
                  </div>
                ) : selectedRequest && !["APPROVED", "SUBMITTED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(selectedRequest.status) ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div>
                      <span className="font-semibold">Status: {selectedRequest.status}</span>
                      <span className="ml-1">— Receiving may not be available for this request status.</span>
                    </div>
                  </div>
                ) : null}

                {/* Inline form error */}
                {formError ? (
                  <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2.5 text-sm text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                ) : null}

                {/* Submit button */}
                <button
                  type="button"
                  onClick={() => void createReceiving()}
                  disabled={busy === "create" || computedTotals.checkedCount === 0}
                  className={`w-full ${BTN_PRIMARY}`}
                >
                  {busy === "create" ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Creating…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Package className="h-4 w-4" />
                      Record Delivery ({computedTotals.checkedCount} items, {computedTotals.qtyReceived.toFixed(1)} units)
                    </span>
                  )}
                </button>
                {computedTotals.checkedCount === 0 ? (
                  <p className="mt-2 text-center text-xs text-zinc-500">Tap the ○ circle next to each item you received, then press Record Delivery.</p>
                ) : null}
              </>
            ) : requestDetail && !requestDetail.items?.length ? (
              <div className="py-4 text-center text-sm text-zinc-500">No items found in this request.</div>
            ) : null}
          </div>
        ) : null}

        {/* ── Step 3: Receiving records ── */}
        {rows.length > 0 ? (
          <div className="space-y-3">
            <div className="px-1 text-sm font-semibold">Receiving Records</div>
            {rows.map((row) => {
              const isConfirmed = row.status === "CONFIRMED";
              const isNew = row.id === lastCreatedId;
              return (
                <div
                  key={row.id}
                  className={[
                    "rounded-2xl border p-4 transition-all",
                    isNew && !isConfirmed ? "border-emerald-700/50 bg-emerald-900/10" :
                    isConfirmed ? "border-emerald-600/30 bg-emerald-900/8" :
                    "border-white/8 bg-violet-950/20",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{row.receiving_no || "Receiving"}</span>
                        {isNew ? (
                          <span className="rounded-full border border-emerald-700/50 bg-emerald-900/20 px-2 py-0.5 text-[10px] text-emerald-300">Just created</span>
                        ) : null}
                        {/* Status badge */}
                        <span className={[
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          isConfirmed
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300",
                        ].join(" ")}>
                          {isConfirmed ? <CheckCheck className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {row.status}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                        <div>
                          <span className="text-zinc-500">Received</span>
                          <span className="ml-1 font-medium text-white">{Number(row.qty_received || 0).toFixed(1)} / {Number(row.qty_expected || 0).toFixed(1)}</span>
                        </div>
                        {(row.shortage_qty || 0) !== 0 ? (
                          <div>
                            <span className="text-zinc-500">Short</span>
                            <span className="ml-1 font-medium text-amber-300">{Number(row.shortage_qty || 0).toFixed(1)}</span>
                          </div>
                        ) : null}
                        <div>
                          <span className="text-zinc-500">Amount</span>
                          <span className="ml-1 font-medium text-white">{Number(row.amount_received || 0).toFixed(2)} {currencyCode}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Quality</span>
                          <span className={[
                            "ml-1 font-medium",
                            row.quality_status === "ACCEPTED" ? "text-emerald-300" :
                            row.quality_status === "REJECTED" ? "text-red-300" :
                            "text-amber-300",
                          ].join(" ")}>{row.quality_status || "-"}</span>
                        </div>
                        {row.vendor_name ? (
                          <div>
                            <span className="text-zinc-500">Vendor</span>
                            <span className="ml-1 text-white">{row.vendor_name}</span>
                          </div>
                        ) : null}
                        {isConfirmed && row.confirmed_by ? (
                          <div>
                            <span className="text-zinc-500">Confirmed by</span>
                            <span className="ml-1 text-white">{row.confirmed_by}</span>
                          </div>
                        ) : null}
                      </div>

                      {row.variance_reason ? (
                        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-2 py-1.5 text-xs text-amber-200">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {row.variance_reason}
                        </div>
                      ) : null}
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {/* CONFIRM button */}
                      {isConfirmed ? (
                        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                          <CheckCheck className="h-4 w-4" />
                          Confirmed
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void confirmReceiving(row.id)}
                          disabled={busy === row.id}
                          className={BTN_CONFIRM}
                        >
                          {busy === row.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCheck className="h-4 w-4" />
                          )}
                          {busy === row.id ? "Confirming…" : "Confirm"}
                        </button>
                      )}

                      {/* Claim link */}
                      <Link
                        href={`/store/procurement/claim?city=${encodeURIComponent(city)}&request_id=${encodeURIComponent(row.request_id)}&receiving_id=${encodeURIComponent(row.id)}`}
                        className={BTN_SECONDARY}
                      >
                        Create Claim
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : requestId && !detailBusy ? (
          <div className={`${GLASS} py-6 text-center`}>
            <Package className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-500">No receiving records yet for this request.</p>
            <p className="mt-1 text-xs text-zinc-600">Check the items above and tap &quot;Record Delivery&quot;.</p>
          </div>
        ) : null}

      </div>
    </div>
  );
}
