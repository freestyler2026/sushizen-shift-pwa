"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ban, Camera, CheckCircle2, Circle, Clock, ExternalLink, Package, ChevronRight, ChevronDown, CheckCheck, AlertTriangle, RefreshCw, X } from "lucide-react";
import { ProcurementStepper } from "@/components/ProcurementStepper";
import SelectDark from "@/components/SelectDark";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, friendlyProcurementError, procurementJson } from "@/lib/procurementClient";
import { receivingsForRequest, receivingStepState } from "@/lib/procurementStatus";
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
  receiving_status?: string;
  vendor_summary?: string;
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
  invoice_photo_url?: string;
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
  const [filterSearch, setFilterSearch] = useState("");
  const [filterHideConfirmed, setFilterHideConfirmed] = useState(false);
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

  // Invoice photo
  const invoicePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [invoicePhotoFile, setInvoicePhotoFile] = useState<File | null>(null);
  const [invoicePhotoPreview, setInvoicePhotoPreview] = useState("");
  const [invoicePhotoUploading, setInvoicePhotoUploading] = useState(false);

  // UI state
  const [busy, setBusy] = useState("");
  const [confirmTarget, setConfirmTarget] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [expandedRcvId, setExpandedRcvId] = useState<string>("");
  const [checkAllConfirm, setCheckAllConfirm] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formError, setFormError] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [prevReceivedQty, setPrevReceivedQty] = useState<Record<string, number>>({}); // request_item_id → qty_received
  const [duplicateWarningConfirmed, setDuplicateWarningConfirmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // On mobile: collapse Step 1 list when a request is pre-selected (from URL or after user picks one)
  const [step1Collapsed, setStep1Collapsed] = useState(false);

  // Close Order – Not Received modal
  const [closeNotReceivedOpen, setCloseNotReceivedOpen] = useState(false);
  const [closeNotReceivedReason, setCloseNotReceivedReason] = useState("");
  const [closeNotReceivedBusy, setCloseNotReceivedBusy] = useState(false);
  const [closeNotReceivedError, setCloseNotReceivedError] = useState("");

  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  // ── Load approved requests (all requesters) ──────────────────────────────

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    try {
      const activeCity = String(cityOverride || city || "manila").toLowerCase();
      const qs = new URLSearchParams({ city: activeCity, status: "APPROVED", limit: "1000", open_first: "true" });
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRequests(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    }
  }, [city, pin, requestedBy]);

  // ── Load receivings ────────────────────────────────────────────────────────

  const loadReceivings = useCallback(async (rid?: string, cityOverride?: string) => {
    try {
      const activeCity = cityOverride || city || "manila";
      const qs = new URLSearchParams({ limit: "200", city: activeCity });
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
      setError(friendlyProcurementError(e));
    }
  }, [city, pin, requestId, requestedBy]);

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
      setError(friendlyProcurementError(e));
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

  function handleInvoicePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setInvoicePhotoFile(f);
    if (f) {
      setInvoicePhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(f);
      });
    } else {
      setInvoicePhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
    }
  }

  function clearInvoicePhoto() {
    setInvoicePhotoFile(null);
    setInvoicePhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (invoicePhotoInputRef.current) invoicePhotoInputRef.current.value = "";
  }

  async function uploadInvoicePhoto(receivingId: string): Promise<void> {
    if (!invoicePhotoFile) return;
    setInvoicePhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("approver_name", requestedBy.trim());
      formData.append("pin", pin.trim());
      formData.append("file", invoicePhotoFile);
      const res = await fetch(`/api/admin/procurement/receiving/${encodeURIComponent(receivingId)}/invoice-photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String((err as { detail?: string }).detail || "Photo upload failed"));
      }
    } finally {
      setInvoicePhotoUploading(false);
    }
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
    const zeroQtyCheckedCount = items.filter((it) => {
      const chk = itemChecks[it.id];
      return chk?.checked && (!chk.qty_received || chk.qty_received === 0);
    }).length;
    const totalCount = items.length;
    // Delivery value: use unit_price if set, otherwise proportion of line_total
    const totalValue = items.reduce((s, it) => {
      const chk = itemChecks[it.id];
      if (!chk?.checked) return s;
      const qtyR = chk.qty_received ?? it.qty;
      if (it.unit_price) return s + qtyR * it.unit_price;
      if (it.line_total && it.qty) return s + (qtyR / it.qty) * it.line_total;
      return s;
    }, 0);
    return { qtyExpected, qtyReceived, checkedCount, zeroQtyCheckedCount, totalCount, totalValue };
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
      const msg = friendlyProcurementError(e);
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

      // Calculate effective unit price from checked items' line totals
      // effectiveUnitPrice = totalValue / totalQtyReceived so that
      // amount_received = qtyReceived * effectiveUnitPrice = totalValue (correct)
      const checkedItems = items.filter((it) => itemChecks[it.id]?.checked);
      const totalValue = checkedItems.reduce((s, it) => {
        const chk = itemChecks[it.id];
        const qtyR = chk?.qty_received ?? it.qty;
        // Prefer unit_price; fall back to proportional line_total when unit_price is 0/null
        if (it.unit_price) return s + qtyR * it.unit_price;
        if (it.line_total && it.qty) return s + (qtyR / it.qty) * it.line_total;
        return s;
      }, 0);
      const effectiveUnitPrice =
        computedTotals.qtyReceived > 0 ? totalValue / computedTotals.qtyReceived : 0;

      // Build per-item receiving data (all items including unchecked = qty_received 0)
      const perItemData = items.map((it) => {
        const chk = itemChecks[it.id];
        const received = chk?.checked ? (chk.qty_received ?? it.qty) : 0;
        const uprice = it.unit_price || (it.line_total && it.qty ? it.line_total / it.qty : 0);
        return {
          request_item_id: it.id,
          item_name: it.item_name,
          category: it.category || "",
          vendor_name: it.vendor_name || "",
          unit: it.unit,
          qty_ordered: it.qty,
          qty_received: received,
          unit_price: uprice,
          notes: "",
        };
      });

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
            unit_price: effectiveUnitPrice,
            quality_status: overallQuality,
            variance_reason: notes.trim(),
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
            items: perItemData,
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
      // Scroll to receiving records after a short delay for render
      requestAnimationFrame(() => {
        document.getElementById("receiving-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LAST_CREATED_KEY, JSON.stringify({ id: createdId, receiving_no: createdNo, request_id: createdRequestId, at: createdAt }));
        } catch {}
      }
      setFormError("");
      setInfo(createdNo ? `Receiving created: ${createdNo}` : "Receiving created.");
      setNotes("");
      if (createdId && invoicePhotoFile) {
        try {
          await uploadInvoicePhoto(createdId);
          setInfo((prev) => prev + " · Invoice photo uploaded.");
          clearInvoicePhoto();
        } catch (photoErr: any) {
          setInfo((prev) => prev + ` (Photo upload failed: ${String(photoErr?.message || photoErr)})`);
        }
      }
      await loadReceivings(requestId);
    } catch (e: any) {
      const msg = friendlyProcurementError(e);
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
      await Promise.all([loadReceivings(), loadMyRequests()]);
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    } finally {
      setBusy("");
    }
  };

  const deleteReceiving = async (receivingId: string) => {
    setBusy(receivingId);
    setError("");
    setDeleteTarget("");
    try {
      await procurementJson<{ ok: boolean }>(
        `/api/admin/procurement/receiving/${receivingId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiving_id: receivingId, approver_name: requestedBy.trim(), pin: pin.trim() }),
        },
        requestedBy,
        pin,
      );
      setInfo("Record deleted. You can now re-create it with the correct amount.");
      await Promise.all([loadReceivings(), loadMyRequests()]);
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    } finally {
      setBusy("");
    }
  };

  // ── Close Order – Not Received ────────────────────────────────────────────

  const closeOrderNotReceived = useCallback(async () => {
    if (!requestId) return;
    setCloseNotReceivedBusy(true);
    setCloseNotReceivedError("");
    try {
      await procurementJson(
        `/api/admin/procurement/requests/${requestId}/close-not-received`,
        {
          method: "POST",
          body: JSON.stringify({ approver_name: requestedBy, pin, reason: closeNotReceivedReason.trim() }),
        },
        requestedBy,
        pin,
      );
      setCloseNotReceivedOpen(false);
      setCloseNotReceivedReason("");
      await Promise.all([loadMyRequests(), loadReceivings()]);
    } catch (e: any) {
      setCloseNotReceivedError(String(e?.message || e || "Failed to close order"));
    } finally {
      setCloseNotReceivedBusy(false);
    }
  }, [requestId, requestedBy, pin, closeNotReceivedReason, loadMyRequests, loadReceivings]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initial = sp.get("request_id") || "";
    if (initial) { setRequestId(initial); setStep1Collapsed(true); }
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
      // Scope the initial receiving load to the URL's request_id (if any) so it
      // doesn't load a global list that races with the per-request load below.
      const initialReq = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("request_id") || "") : "";
      await Promise.all([loadMyRequests(initialCity), loadReceivings(initialReq, initialCity)]);
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setShowNewForm(false);
    setPrevReceivedQty({});
    setFormError("");
    if (requestId) {
      void loadRequestDetail(requestId);
      void loadReceivings(requestId);
    } else {
      setRequestDetail(null);
      setItemChecks({});
    }
  }, [requestId, loadRequestDetail, loadReceivings]);

  // When "Record additional delivery" is opened for a short-delivered PO,
  // load per-item data from the last confirmed receiving so we can pre-check
  // shortage items (qty_received = 0) and show what was already received.
  useEffect(() => {
    if (!showNewForm) { setPrevReceivedQty({}); return; }
    const lastConfirmed = requestReceivings.find((r) => String(r.status || "").toUpperCase() === "CONFIRMED");
    if (!lastConfirmed) { setPrevReceivedQty({}); return; }
    async function loadPrevItems() {
      try {
        const data = await procurementJson<{ items: Array<{ request_item_id: string; qty_received: number }> }>(
          `/api/admin/procurement/receiving/${lastConfirmed!.id}/items`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        const prevMap: Record<string, number> = {};
        for (const it of data?.items || []) {
          prevMap[String(it.request_item_id)] = Number(it.qty_received ?? 0);
        }
        setPrevReceivedQty(prevMap);
        // Pre-check items that were NOT received (shortage items → still need delivery)
        if (Object.keys(prevMap).length > 0) {
          setItemChecks((prev) => {
            const next = { ...prev };
            for (const [itemId, qtyRec] of Object.entries(prevMap)) {
              if (next[itemId]) {
                next[itemId] = { ...next[itemId], checked: qtyRec === 0 };
              }
            }
            return next;
          });
        }
      } catch {
        // Non-critical — items may not have been saved per-line
        setPrevReceivedQty({});
      }
    }
    void loadPrevItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewForm, requestId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectedRequest = requests.find((r) => r.id === requestId);

  // Receiving records that belong to the SELECTED request only. `rows` can briefly
  // hold a global (unfiltered) load — Step 2's confirmed/draft/empty decision must
  // be scoped to this request, or it shows another request's draft state.
  const requestReceivings = useMemo(
    () => receivingsForRequest(rows, requestId),
    [rows, requestId],
  );
  // Step-2 panel: confirmed | review | form (scoped to THIS request only).
  const receivingStep = receivingStepState(requestReceivings, showNewForm);

  const filteredRequests = useMemo(() => {
    let list = requests;
    if (filterHideConfirmed) {
      list = list.filter((r) => {
        const rs = (r.receiving_status || "").toUpperCase();
        return rs !== "CONFIRMED" && rs !== "RECEIVED" && rs !== "NOT_RECEIVED";
      });
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter((r) =>
        r.request_no.toLowerCase().includes(q) ||
        (r.store_code || "").toLowerCase().includes(q) ||
        (r.requested_by || "").toLowerCase().includes(q) ||
        (r.vendor_summary || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [requests, filterSearch, filterHideConfirmed]);

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* ── Page header + stepper (full-width) ── */}
        <div className="mb-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href={`/store/procurement?city=${encodeURIComponent(city || "manila")}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                ← Back
              </Link>
              <div>
                <h1 className="text-2xl font-light tracking-tight text-white">Store Receiving</h1>
                <p className="text-sm text-zinc-400 mt-1">Record deliveries and confirm received items.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-400">
              <Package className="h-3 w-3" />{cityLabel}
            </span>
          </div>
          <div className={`${GLASS} px-6 py-3 mb-3`}>
            <ProcurementStepper currentStep="receiving" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Link href="/store/procurement" className="hover:text-violet-300 transition-colors">Home</Link>
            <span>›</span>
            <Link href={`/store/procurement/request?city=${encodeURIComponent(city)}`} className="hover:text-violet-300 transition-colors">New Request</Link>
            <span>›</span>
            <span className="text-violet-300 font-medium">Receiving</span>
            <span>›</span>
            <Link href={`/store/procurement/claim?city=${encodeURIComponent(city)}`} className="hover:text-violet-300 transition-colors">Claim</Link>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

        {/* ─── LEFT PANEL: Auth + Request Selector ─── */}
        <div className="flex flex-col gap-4 lg:w-72 xl:w-80 lg:shrink-0">

          {/* Auth fields */}
          <div className={`${GLASS} p-4 space-y-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Session</p>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" className={FIELD} />
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={FIELD} />
            <SelectDark
              value={city}
              onChange={v => { setCity(v); void loadMyRequests(v); }}
              className={FIELD}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try { await Promise.all([loadMyRequests(), loadReceivings()]); }
                finally { setRefreshing(false); }
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-950/30 py-2 text-xs text-white transition hover:bg-violet-950/45 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* Step 1: Request selector */}
          {/* Mobile collapsed view — shown when a request is selected */}
          {requestId && step1Collapsed && (
            <div className={`${GLASS} p-3 lg:hidden`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      Step 1 ✓ — {selectedRequest?.request_no || requestId}
                    </div>
                    {selectedRequest && (
                      <div className="text-[11px] text-zinc-400">
                        {selectedRequest.store_code} · {formatDate(selectedRequest.request_date)}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep1Collapsed(false)}
                  className="shrink-0 rounded-lg border border-violet-400/20 bg-violet-950/30 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-950/50"
                >
                  Change
                </button>
              </div>
            </div>
          )}
          <div className={`${GLASS} p-4 ${requestId && step1Collapsed ? "hidden lg:block" : ""}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Step 1 — Select Request</div>
              <div className="text-xs text-zinc-500">All approved requests for {cityLabel}.</div>
            </div>
            {requestId && (
              <button type="button" onClick={() => { setRequestId(""); setRequestDetail(null); setRows([]); setDuplicateWarningConfirmed(false); setStep1Collapsed(false); }} className="text-xs text-zinc-500 underline">
                Clear
              </button>
            )}
          </div>
          {/* Search + filter */}
          <div className="mb-3 space-y-2">
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search PR no., branch, supplier…"
              className={FIELD + " text-xs"}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={filterHideConfirmed}
                onChange={(e) => setFilterHideConfirmed(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-600 accent-violet-500"
              />
              Hide already confirmed orders
            </label>
          </div>
          <div className="space-y-2">
            {filteredRequests.map((row) => {
              const selected = requestId === row.id;
              const rcvStatus = (row.receiving_status || "").toUpperCase();
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => { setRequestId(row.id); setDuplicateWarningConfirmed(false); setStep1Collapsed(true); }}
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
                    <div className="flex items-center gap-1">
                      {rcvStatus === "CONFIRMED" || rcvStatus === "RECEIVED" ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">✓ Confirmed</span>
                      ) : rcvStatus === "DRAFT" ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">Draft</span>
                      ) : null}
                      <span className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        row.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" :
                        row.status === "SUBMITTED" ? "bg-amber-500/15 text-amber-300" :
                        "bg-zinc-500/15 text-zinc-400"
                      ].join(" ")}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 pl-6 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">{row.store_code || "-"} · {formatDate(row.request_date)}</span>
                      <span className="text-xs font-medium text-violet-300">{Number(row.total_amount || 0).toFixed(2)} {currencyCode}</span>
                    </div>
                    {row.requested_by ? (
                      <div className="text-[11px] text-zinc-500">Requested by: {row.requested_by}</div>
                    ) : null}
                    {row.vendor_summary ? (
                      <div className="text-[11px] text-amber-400/80">Supplier: {row.vendor_summary}</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {!filteredRequests.length && requests.length > 0 ? (
              <div className="py-3 text-center text-xs text-zinc-500">No requests match your filter.</div>
            ) : !requests.length ? (
              <div className="py-4 text-center text-sm text-zinc-500">No approved requests found for {cityLabel}.</div>
            ) : null}
          </div>
        </div>{/* end request selector */}

        </div>{/* end left panel */}

        {/* ─── RIGHT PANEL: Banners + Step 2 + Step 3 ─── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">

          {/* Banners */}
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
          {lastCreatedId ? (
            <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/15 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  {lastCreatedNo || "Receiving created"}
                  {lastCreatedAt ? <span className="text-[11px] font-normal text-emerald-300/70">({formatRelativeAge(lastCreatedAt, relativeNowMs)})</span> : null}
                </div>
                <Link
                  href={`/store/procurement/claim?city=${encodeURIComponent(city)}&request_id=${encodeURIComponent(lastCreatedRequestId || requestId)}&receiving_id=${encodeURIComponent(lastCreatedId)}`}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  Continue to Claim <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : null}

          {/* ── Step 2: Items checklist + Delivery form ── */}
        {requestId ? (
          <div className={`${GLASS} p-4`}>
            <div className="mb-4">
              <div className="text-sm font-semibold">Step 2 — Check Delivered Items</div>
              {selectedRequest ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                  <span>{selectedRequest.request_no} · {selectedRequest.store_code}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{formatDate(selectedRequest.request_date)}</span>
                  <span className="text-zinc-600">·</span>
                  <span>PR Total: {Number(selectedRequest.total_amount || 0).toFixed(2)} {currencyCode}</span>
                  {computedTotals.checkedCount > 0 && (
                    <span className="font-medium text-emerald-400">
                      · Delivery: {computedTotals.totalValue.toFixed(2)} {currencyCode}
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* Maker-Checker warning — cannot receive your own request (skipped for HQ / ADMIN) */}
            {selectedRequest && selectedRequest.requested_by &&
              requestedBy.trim() &&
              selectedRequest.requested_by.trim().toLowerCase() === requestedBy.trim().toLowerCase() &&
              !["HQ", "ADMIN"].includes(String(auth?.role || "").toUpperCase()) && (
              <div className="mb-4 rounded-xl border border-orange-500/40 bg-orange-950/20 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
                <div>
                  <div className="text-sm font-semibold text-orange-200">You cannot receive your own request</div>
                  <div className="mt-1 text-xs text-orange-300/80">
                    <span className="font-mono font-semibold">{selectedRequest.request_no}</span> was created by you.
                    Please ask another staff member to receive this delivery.
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate receiving warning */}
            {selectedRequest && String(selectedRequest.status || "").toUpperCase() === "RECEIVED" && requestReceivings.length > 0 && !duplicateWarningConfirmed && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <div className="text-sm font-semibold text-amber-200">This order has already been received</div>
                    <div className="mt-1 text-xs text-amber-300/80">
                      A receiving record already exists for <span className="font-mono font-semibold">{selectedRequest.request_no}</span>.
                      Recording again may cause duplicate entries.
                    </div>
                    <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-amber-200">
                      <input
                        type="checkbox"
                        checked={duplicateWarningConfirmed}
                        onChange={(e) => setDuplicateWarningConfirmed(e.target.checked)}
                        className="h-4 w-4 rounded border-amber-500/40 accent-amber-500"
                      />
                      I understand — record another delivery anyway
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Already confirmed — show success state (unless user wants to add another) */}
            {receivingStep === "confirmed" ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/15">
                  <CheckCheck className="h-7 w-7 text-emerald-400" />
                </div>
                <div>
                  <div className="text-base font-semibold text-emerald-300">Delivery Confirmed</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {requestReceivings.length} delivery record{requestReceivings.length !== 1 ? "s" : ""} confirmed for this request.
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    If a new shipment has arrived (e.g. back-ordered items), tap the button below to record it.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/20 transition"
                >
                  <Package className="h-4 w-4" />
                  Record additional delivery
                </button>
              </div>
            ) : receivingStep === "review" ? (
              /* Unconfirmed receiving exists — show the recorded quantities and the
                 Confirm button right here, so quantities are always reviewed before
                 finalizing (no blind "confirm" without seeing what was received). */
              <div className="space-y-3 py-1">
                <div className="flex items-start gap-2 text-amber-200">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">Delivery Recorded — Review &amp; Confirm</div>
                    <div className="text-xs text-zinc-500">Check the received quantities below, then Confirm to finalize.</div>
                  </div>
                </div>
                {requestReceivings.filter((r) => r.status === "DRAFT").map((row) => {
                  const shortage = Number(row.shortage_qty || 0);
                  const excess = Number(row.excess_qty || 0);
                  return (
                    <div key={row.id} className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-zinc-300">{row.receiving_no || "Draft"}</span>
                        <span className="text-xs text-zinc-400">{Number(row.amount_received || 0).toFixed(2)} {currencyCode}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-zinc-300">Received <span className="font-semibold text-white">{row.qty_received}</span> / {row.qty_expected} {row.unit}</span>
                        {shortage > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Short {shortage}</span>}
                        {excess > 0 && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">Excess {excess}</span>}
                      </div>
                      <div className="mt-2.5 flex items-center justify-end gap-2">
                        {confirmTarget === row.id ? (
                          <>
                            <span className="text-xs text-amber-200">Finalize?</span>
                            <button type="button" onClick={() => { setConfirmTarget(""); void confirmReceiving(row.id); }} disabled={busy === row.id} className={BTN_CONFIRM}>
                              {busy === row.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                              {busy === row.id ? "Confirming…" : "Yes, Confirm"}
                            </button>
                            <button type="button" onClick={() => setConfirmTarget("")} disabled={busy === row.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/10 transition disabled:opacity-60">Cancel</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmTarget(row.id)} disabled={busy === row.id} className={BTN_CONFIRM}>
                            <CheckCheck className="h-4 w-4" />
                            Confirm Delivery
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-center text-[11px] text-zinc-500">
                  Need to fix quantities or delete this draft? Use the <span className="text-zinc-300">Receiving Records</span> section below.
                </p>
              </div>
            ) : detailBusy ? (
              <div className="py-6 text-center text-sm text-zinc-500">Loading items…</div>
            ) : requestDetail?.items?.length ? (
              <>
                {/* Step 1 label */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-300">1</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Check Items Received</span>
                </div>

                {/* Short-delivery banner: shown when re-recording after a partial delivery */}
                {Object.keys(prevReceivedQty).length > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2.5 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      <strong>Partial delivery:</strong> items already received in the first delivery are unchecked. Only check the items that arrived in <em>this</em> delivery.
                    </span>
                  </div>
                )}

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
                    const isZeroQty = chk.checked && (chk.qty_received === 0 || !chk.qty_received);
                    const prevQty = prevReceivedQty[item.id];
                    const wasPrevReceived = prevQty !== undefined && prevQty > 0;
                    return (
                      <div
                        key={item.id}
                        className={[
                          "grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/5 px-3 py-3 last:border-0 transition-colors",
                          isZeroQty ? "bg-amber-900/8" : chk.checked ? "bg-emerald-900/5" : "bg-black/10 opacity-60",
                        ].join(" ")}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center transition"
                        >
                          {chk.checked ? (
                            <CheckCircle2 className={`h-5 w-5 ${isZeroQty ? "text-amber-400" : "text-emerald-400"}`} />
                          ) : (
                            <Circle className="h-5 w-5 text-zinc-600" />
                          )}
                        </button>

                        {/* Item info */}
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-medium ${chk.checked ? (isZeroQty ? "text-amber-200" : "text-white") : "text-zinc-500 line-through"}`}>
                            {item.item_name}
                            {isZeroQty && (
                              <span className="ml-2 inline-block rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                0 received
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                            <span>{item.vendor_name || "-"}</span>
                            <span>·</span>
                            <span>Ordered: {item.qty} {item.unit}</span>
                          </div>
                          {wasPrevReceived && (
                            <div className="mt-0.5 text-[11px] text-emerald-400/80">
                              Previously received: {prevQty} {item.unit}
                            </div>
                          )}
                          {isZeroQty && !wasPrevReceived && (
                            <div className="mt-0.5 text-[11px] text-amber-400/80">
                              Not delivered? Uncheck this item to mark it as skipped.
                            </div>
                          )}
                        </div>

                        {/* Qty received input */}
                        <div className="w-24 text-right">
                          {chk.checked ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={chk.qty_received || ""}
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setItemQty(item.id, Number(e.target.value || 0))}
                                className={`w-16 rounded-lg border bg-black/30 px-2 py-1 text-right text-xs text-white outline-none focus:ring-2 ${isZeroQty ? "border-amber-500/40 focus:border-amber-500/50 focus:ring-amber-500/20" : "border-white/8 focus:border-emerald-500/50 focus:ring-emerald-500/20"}`}
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
                  {checkAllConfirm ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-amber-300">Mark all {Object.keys(itemChecks).length} items received?</span>
                      <button type="button" onClick={() => { checkAll(); setCheckAllConfirm(false); }} className="rounded bg-violet-600 px-2 py-0.5 font-semibold text-white hover:bg-violet-500">Yes</button>
                      <button type="button" onClick={() => setCheckAllConfirm(false)} className="rounded bg-white/10 px-2 py-0.5 text-white hover:bg-white/20">No</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setCheckAllConfirm(true)} className="text-xs text-violet-400 hover:text-violet-300 transition">
                      All received
                    </button>
                  )}
                </div>

                {/* Step 2 label */}
                <div className="mb-2 mt-5 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-300">2</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Delivery Details</span>
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

                {/* Invoice photo */}
                <div className="mb-4">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">Invoice Photo (optional)</label>
                  {invoicePhotoPreview ? (
                    <div className="relative overflow-hidden rounded-xl border border-violet-500/30 bg-black/20">
                      <img src={invoicePhotoPreview} alt="Invoice preview" className="max-h-48 w-full object-contain" />
                      <button
                        type="button"
                        onClick={clearInvoicePhoto}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => invoicePhotoInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-500/30 bg-violet-950/15 py-3 text-sm text-violet-300 transition hover:border-violet-500/50 hover:bg-violet-950/25"
                    >
                      <Camera className="h-4 w-4" />
                      Take / Select Invoice Photo
                    </button>
                  )}
                  <input
                    ref={invoicePhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleInvoicePhotoChange}
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

                {/* Zero-qty warning */}
                {computedTotals.zeroQtyCheckedCount > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div>
                      <span className="font-semibold">{computedTotals.zeroQtyCheckedCount} item{computedTotals.zeroQtyCheckedCount !== 1 ? "s" : ""} checked with qty 0.</span>
                      <span className="ml-1 text-amber-300/80">If an item was not delivered, uncheck it instead of entering 0.</span>
                    </div>
                  </div>
                )}

                {/* Inline form error */}
                {formError ? (
                  formError.toLowerCase().includes("cannot receive your own") ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
                      <div className="flex items-start gap-2 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div>
                          <div className="font-semibold">Cannot confirm your own order</div>
                          <div className="mt-1 text-xs text-amber-300/80">
                            For security, the person who created this order cannot confirm receipt. Please ask your manager or another staff member to log in and confirm this delivery.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2.5 text-sm text-red-300">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {formError}
                    </div>
                  )
                ) : null}

                {/* Submit button */}
                <button
                  type="button"
                  onClick={() => void createReceiving()}
                  disabled={busy === "create" || invoicePhotoUploading || computedTotals.checkedCount === 0}
                  className={`w-full ${BTN_PRIMARY}`}
                >
                  {invoicePhotoUploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Uploading photo…
                    </span>
                  ) : busy === "create" ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Creating…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Package className="h-4 w-4" />
                      Record Delivery ({computedTotals.checkedCount} items, {computedTotals.qtyReceived.toFixed(1)} units)
                      {invoicePhotoFile ? <Camera className="h-3.5 w-3.5 opacity-70" /> : null}
                    </span>
                  )}
                </button>
                {computedTotals.checkedCount === 0 ? (
                  <p className="mt-2 text-center text-xs text-zinc-500">Tap the ○ circle next to each item you received, then press Record Delivery.</p>
                ) : null}

                {/* Close Order – Not Received: shown when no items are checked and order has no receiving records */}
                {computedTotals.checkedCount === 0 && requestReceivings.length === 0 && (
                  <div className="mt-3 border-t border-white/8 pt-3">
                    <button
                      type="button"
                      onClick={() => { setCloseNotReceivedOpen(true); setCloseNotReceivedReason(""); setCloseNotReceivedError(""); }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-800/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/35 transition"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Close Order – Not Received
                    </button>
                    <p className="mt-1 text-[11px] text-zinc-600">Use when supplier did not deliver and no items will be received.</p>
                  </div>
                )}
              </>
            ) : requestDetail && !requestDetail.items?.length ? (
              <div className="py-4 text-center text-sm text-zinc-500">No items found in this request.</div>
            ) : null}
          </div>
        ) : null}

        {/* ── Step 3: Receiving records ── */}
        {rows.length > 0 ? (
          <div id="receiving-records" className="space-y-3">
            <div className="px-1 text-sm font-semibold">Receiving Records</div>
            {rows.map((row) => {
              const isConfirmed = row.status === "CONFIRMED";
              const isDraft = row.status === "DRAFT";
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
                      <div
                        className="flex items-center gap-2 flex-wrap cursor-pointer select-none"
                        onClick={() => setExpandedRcvId(expandedRcvId === row.id ? "" : row.id)}
                      >
                        {expandedRcvId === row.id
                          ? <ChevronDown className="h-4 w-4 shrink-0 text-violet-400" />
                          : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
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

                      {/* Request ID tag */}
                      {row.request_no && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-violet-300">
                            {row.request_no}
                          </span>
                        </div>
                      )}

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
                          <span className={[
                            "ml-1 font-medium",
                            Number(row.amount_received || 0) === 0 ? "text-amber-300" : "text-white",
                          ].join(" ")}>
                            {Number(row.amount_received || 0).toFixed(2)} {currencyCode}
                            {Number(row.amount_received || 0) === 0 && <span className="ml-1 text-[10px] text-amber-400">⚠ 要確認</span>}
                          </span>
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
                      {row.invoice_photo_url ? (
                        <a
                          href={row.invoice_photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                        >
                          <Camera className="h-3 w-3" />
                          View Invoice Photo
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      ) : null}

                      {/* Expanded items table */}
                      {expandedRcvId === row.id && (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-white/8 bg-black/20">
                          {requestDetail?.items && requestDetail.items.length > 0 ? (
                            <table className="min-w-full text-xs">
                              <thead className="bg-black/30 text-zinc-400">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium">Item</th>
                                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                                  <th className="px-3 py-2 text-right font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {requestDetail.items.map((item, idx) => (
                                  <tr key={item.id || idx} className="border-t border-white/6">
                                    <td className="px-3 py-2 text-zinc-100">{item.item_name}</td>
                                    <td className="px-3 py-2 text-zinc-400">{item.vendor_name || "—"}</td>
                                    <td className="px-3 py-2 text-right text-zinc-200">{item.qty}</td>
                                    <td className="px-3 py-2 text-zinc-400">{item.unit}</td>
                                    <td className="px-3 py-2 text-right text-zinc-200">
                                      {Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-zinc-100">
                                      {Number(item.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-3 py-2 text-xs text-zinc-500">No items recorded.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {/* CONFIRM button — two-step guard */}
                      {isConfirmed ? (
                        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                          <CheckCheck className="h-4 w-4" />
                          Confirmed
                        </div>
                      ) : deleteTarget === row.id ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <p className="text-xs text-red-200 font-medium text-right max-w-[200px]">
                            Delete this record? This cannot be undone.
                          </p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDeleteTarget("")}
                              className="rounded-lg border border-white/15 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteReceiving(row.id)}
                              disabled={busy === row.id}
                              className="rounded-lg border border-red-500/40 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-900/50"
                            >
                              {busy === row.id ? "Deleting…" : "Yes, Delete"}
                            </button>
                          </div>
                        </div>
                      ) : confirmTarget === row.id ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <p className="text-xs text-amber-200 font-medium text-right">
                            Finalize {row.receiving_no || "this delivery"}?
                          </p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setConfirmTarget(""); void confirmReceiving(row.id); }}
                              disabled={busy === row.id}
                              className={BTN_CONFIRM}
                            >
                              {busy === row.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCheck className="h-4 w-4" />
                              )}
                              {busy === row.id ? "Confirming…" : "Yes, Confirm"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmTarget("")}
                              disabled={busy === row.id}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/10 transition disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-2">
                          {/* Confirm button — always shown for DRAFT records */}
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(row.id)}
                            disabled={busy === row.id}
                            className={BTN_CONFIRM}
                          >
                            <CheckCheck className="h-4 w-4" />
                            Confirm
                          </button>
                          {/* Amount-0 warning + delete option shown alongside Confirm */}
                          {Number(row.amount_received || 0) === 0 && isDraft && (
                            <div className="flex flex-col items-end gap-1">
                              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-300 text-right max-w-[180px]">
                                ⚠ Amount recorded as 0.00
                              </div>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(row.id)}
                                className="rounded-lg border border-red-500/30 bg-red-900/15 px-2.5 py-1 text-[11px] font-medium text-red-400 transition hover:bg-red-900/30"
                              >
                                🗑 Delete &amp; Re-create
                              </button>
                            </div>
                          )}
                          {Number(row.amount_received || 0) === 0 && !isDraft && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-300 text-right max-w-[180px]">
                              ⚠ Amount is 0.00 — ask admin to void if needed
                            </div>
                          )}
                        </div>
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

        </div>{/* end right panel */}
        </div>{/* end two-column flex */}
      </div>

      {/* ── Close Order – Not Received modal ── */}
      {closeNotReceivedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-950/40 border border-red-800/40">
                <Ban className="h-4.5 w-4.5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Close Order – Not Received</h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  This marks the order as closed with no items received. No delivery was recorded.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Reason</label>
                <SelectDark
                  value={closeNotReceivedReason}
                  onChange={(v) => setCloseNotReceivedReason(v)}
                  className="w-full"
                  options={[
                    { value: "Out of Stock from Supplier", label: "Out of Stock from Supplier" },
                    { value: "Supplier Did Not Deliver", label: "Supplier Did Not Deliver" },
                    { value: "Supplier Unable to Fulfill", label: "Supplier Unable to Fulfill" },
                    { value: "Order Cancelled", label: "Order Cancelled" },
                    { value: "Other", label: "Other" },
                  ]}
                  placeholder="— Select reason —"
                />
              </div>

              {closeNotReceivedError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {closeNotReceivedError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCloseNotReceivedOpen(false)}
                  disabled={closeNotReceivedBusy}
                  className="flex-1 rounded-xl border border-white/12 bg-white/5 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void closeOrderNotReceived()}
                  disabled={closeNotReceivedBusy || !closeNotReceivedReason}
                  className="flex-1 rounded-xl border border-red-800/50 bg-red-950/30 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-50"
                >
                  {closeNotReceivedBusy ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Closing…
                    </span>
                  ) : "Close Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
