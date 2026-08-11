"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  History,
  PackageCheck,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  ClipboardList,
  CheckCircle2,
  Clock,
  RotateCcw,
  X,
  Package,
  FileText,
  User,
  CalendarDays,
  Hash,
  PlusCircle,
  Truck,
  ImageIcon,
  PackageSearch,
  TriangleAlert,
  Printer,
  BarChart2,
} from "lucide-react";
import { ProcurementStepper } from "@/components/ProcurementStepper";
import SelectDark from "@/components/SelectDark";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import { defaultProcurementName, defaultProcurementPin, friendlyProcurementError, procurementJson } from "@/lib/procurementClient";
import { isActiveRequest, isCkDispatchVisible, isRejectedRequest, selectDisplayedRequests } from "@/lib/procurementStatus";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, parseIsoTimeMs, useRelativeAgeNow } from "@/lib/timeAgo";
import {
  GLASS_CARD,
  STATUS_CARD,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  DIVIDER,
} from "@/lib/ui-tokens";

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  receiving_status?: string;
  current_approval_level: number;
  vendor_summary?: string;   // supplier(s) for this request (comma-joined)
  blocked_reason?: string;   // reject / return reason from Back Office
};

type RequestItem = {
  id: string;
  item_name: string;
  category: string;
  spec: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name: string;
  needed_by_date: string;
};

type RequestDetail = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  receiving_status?: string;
  current_approval_level: number;
  currency: string;
  requested_by: string;
  urgent_flag: boolean;
  notes: string;
  items: RequestItem[];
  receivings?: { id: string; receiving_no: string; status: string }[];
  claims?: { id: string; claim_no: string; status: string }[];
};

type RecentActivityItem = {
  kind: "request" | "receiving" | "claim";
  id: string;
  label: string;
  at: string;
  requestId?: string;
  caseId?: string;
};

type TimelineAction = {
  label: string;
  href: string;
};

type CkDispatchRow = {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  line_items_json: { item_name: string; qty: number; unit: string }[];
  status: string;
  delivery_date?: string;
  request_no: string;
  store_code: string;
  city: string;
  request_id: string;
};

function escHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function printProcDeliveryNote(detail: RequestDetail, currencyCode: string) {
  const now = new Date();
  const printDate = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const dnNo = `PR-DN-${escHtml(detail.request_no)}`;
  const vendors = [...new Set((detail.items || []).map((i) => i.vendor_name).filter(Boolean))];
  const vendorLabel = escHtml(vendors.join(" / ") || "Supplier");

  const rows = (detail.items || []).map((item, i) => `
    <tr class="${i % 2 === 0 ? "even" : ""}">
      <td class="num">${i + 1}</td>
      <td class="name">${escHtml(item.item_name)}${item.spec ? `<div class="spec">${escHtml(item.spec)}</div>` : ""}</td>
      <td class="vendor">${escHtml(item.vendor_name || "-")}</td>
      <td class="qty">${Number(item.qty || 0).toLocaleString()}</td>
      <td class="unit">${escHtml(item.unit)}</td>
      <td class="price">${item.unit_price > 0 ? Number(item.unit_price).toFixed(2) : "-"}</td>
      <td class="total">${item.line_total > 0 ? Number(item.line_total).toFixed(2) : "-"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Delivery Note — ${detail.request_no}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #111; font-size: 12px; padding: 32px 36px; }
  .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .brand { font-size: 24px; font-weight: 900; letter-spacing: 3px; color: #0f172a; }
  .doc-block { text-align: right; }
  .doc-type { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 1px; text-transform: uppercase; }
  .doc-no { font-size: 11px; color: #64748b; margin-top: 3px; font-family: monospace; }
  .bar { height: 4px; background: linear-gradient(90deg, #0f172a, #7c3aed, #0e7490); border-radius: 2px; margin-bottom: 20px; }
  .address-grid { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 0; margin-bottom: 18px; }
  .address-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; background: #f8fafc; }
  .address-box.to-box { background: #f0fdf4; border-color: #bbf7d0; }
  .address-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
  .address-name { font-size: 15px; font-weight: 800; color: #0f172a; }
  .address-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .arrow-cell { display: flex; align-items: center; justify-content: center; font-size: 20px; color: #94a3b8; }
  .meta-row { display: flex; gap: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
  .meta-item { flex: 1; padding: 8px 12px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .meta-value { font-size: 12px; font-weight: 600; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #0f172a; color: #fff; }
  th { padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  th.right { text-align: right; }
  tbody tr.even { background: #f8fafc; }
  td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num { width: 28px; color: #94a3b8; font-size: 10px; }
  td.name { font-size: 13px; font-weight: 500; }
  td.name .spec { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  td.vendor { font-size: 10px; color: #64748b; width: 110px; }
  td.qty { width: 60px; text-align: right; font-size: 13px; font-weight: 700; }
  td.unit { width: 50px; color: #64748b; }
  td.price { width: 80px; text-align: right; color: #64748b; }
  td.total { width: 90px; text-align: right; font-weight: 700; color: #0f172a; }
  .total-row { display: flex; justify-content: flex-end; margin-bottom: 22px; }
  .total-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 18px; background: #f1f5f9; text-align: right; }
  .total-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .total-value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .total-currency { font-size: 11px; color: #64748b; }
  .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px; }
  .sign-label { font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 28px; }
  .sign-line { border-bottom: 1.5px solid #cbd5e1; margin-bottom: 4px; }
  .sign-sub { font-size: 9px; color: #94a3b8; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  @media print {
    @page { margin: 0; size: A4; }
    body { padding: 22px 26px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="top-bar">
    <div class="brand">SUSHI ZEN</div>
    <div class="doc-block">
      <div class="doc-type">Delivery Note</div>
      <div class="doc-no">${dnNo}</div>
    </div>
  </div>
  <div class="bar"></div>
  <div class="address-grid">
    <div class="address-box">
      <div class="address-label">From (Supplier)</div>
      <div class="address-name">${vendorLabel}</div>
      <div class="address-sub">External Vendor</div>
    </div>
    <div class="arrow-cell">→</div>
    <div class="address-box to-box">
      <div class="address-label">To (Branch)</div>
      <div class="address-name">${escHtml(detail.store_code || "-")}</div>
      <div class="address-sub">Requested by: ${escHtml(detail.requested_by || "-")}</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Print Date</div>
      <div class="meta-value">${escHtml(printDate)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">PR Number</div>
      <div class="meta-value">${escHtml(detail.request_no)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Order Date</div>
      <div class="meta-value">${escHtml(String(detail.request_date || "").slice(0, 10))}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status</div>
      <div class="meta-value">${escHtml(detail.status)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item Description</th>
        <th>Vendor</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th class="right">Unit Price</th>
        <th class="right">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total-row">
    <div class="total-box">
      <div class="total-label">Total Amount</div>
      <div class="total-value">${Number(detail.total_amount || 0).toFixed(2)} <span class="total-currency">${currencyCode}</span></div>
    </div>
  </div>
  <div class="signoff">
    <div>
      <div class="sign-label">Delivered / Dispatched by</div>
      <div class="sign-line"></div>
      <div class="sign-sub">Name &amp; Signature</div>
    </div>
    <div>
      <div class="sign-label">Received by (Store)</div>
      <div class="sign-line"></div>
      <div class="sign-sub">Name &amp; Signature</div>
    </div>
  </div>
  <div class="footer">
    <div>Printed: ${printDate} · Sushi ZEN Workforce OS</div>
    <div>${dnNo}</div>
  </div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=950,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    alert("Pop-up was blocked. Please allow pop-ups for this site and try again.");
  }
}

function RequestDetailDrawer({
  requestId,
  city,
  requestedBy,
  pin,
  currencyCode,
  onClose,
  onSubmitSuccess,
}: {
  requestId: string;
  city: string;
  requestedBy: string;
  pin: string;
  currencyCode: string;
  onClose: () => void;
  onSubmitSuccess?: (requestNo: string) => void;
}) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  // Edit prices mode
  const drawerAuth = useMemo(() => getAuth(), []);
  const canEditPricesRole = ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(drawerAuth?.role || "");
  const [editPricesMode, setEditPricesMode] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [savePricesError, setSavePricesError] = useState("");

  const handleSubmitForApproval = async () => {
    setSubmitBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/requests/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      onSubmitSuccess?.(detail?.request_no || requestId);
    } catch (e: unknown) {
      setError(friendlyProcurementError(e));
      setSubmitBusy(false);
      setSubmitConfirm(false);
    }
  };

  const handleCancelRequest = async () => {
    setCancelBusy(true);
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/requests/${encodeURIComponent(requestId)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      onClose();
      onSubmitSuccess?.("cancelled");
    } catch (e: unknown) {
      setError(friendlyProcurementError(e));
      setCancelBusy(false);
      setCancelConfirm(false);
    }
  };

  function enterEditPricesMode() {
    const items = detail?.items || [];
    const init: Record<string, string> = {};
    for (const it of items) init[it.id] = String(it.unit_price ?? 0);
    setDraftPrices(init);
    setSavePricesError("");
    setEditPricesMode(true);
  }

  async function savePrices() {
    if (!detail) return;
    setSavingPrices(true);
    setSavePricesError("");
    const items = detail.items || [];
    const changed = items.filter((it) => {
      const draft = parseFloat(draftPrices[it.id] ?? "") || 0;
      return Math.abs(draft - (it.unit_price ?? 0)) > 0.0001;
    });
    try {
      await Promise.all(
        changed.map((it) =>
          fetch(
            `/api/admin/procurement/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(it.id)}/price`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ unit_price: parseFloat(draftPrices[it.id] ?? "") || 0 }),
            },
          ).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
          }),
        ),
      );
      setEditPricesMode(false);
      // Refresh detail to pick up new prices
      const data = await procurementJson<{ ok: boolean; request: RequestDetail }>(
        `/api/admin/procurement/requests/${encodeURIComponent(requestId)}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setDetail(data?.request ?? null);
    } catch (e: unknown) {
      setSavePricesError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPrices(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    setDetail(null);
    procurementJson<{ ok: boolean; request: RequestDetail }>(
      `/api/admin/procurement/requests/${encodeURIComponent(requestId)}`,
      { method: "GET" },
      requestedBy,
      pin,
    )
      .then((data) => {
        setDetail(data?.request ?? null);
      })
      .catch((e: unknown) => {
        setError(friendlyProcurementError(e));
      })
      .finally(() => setLoading(false));
  }, [requestId, requestedBy, pin]);

  const statusBadge = (status: string) => {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED") return <span className="rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">APPROVED</span>;
    if (s === "RETURNED") return <span className="rounded-full bg-red-900/40 border border-red-700/50 px-2.5 py-0.5 text-xs font-semibold text-red-300">RETURNED</span>;
    if (s === "REJECTED") return <span className="rounded-full bg-rose-900/50 border border-rose-600/60 px-2.5 py-0.5 text-xs font-semibold text-rose-300">REJECTED</span>;
    if (s === "IN_REVIEW" || s === "SUBMITTED") return <span className="rounded-full bg-blue-900/40 border border-blue-700/50 px-2.5 py-0.5 text-xs font-semibold text-blue-300">IN REVIEW</span>;
    if (s === "DRAFT") return <span className="rounded-full bg-amber-900/40 border border-amber-700/50 px-2.5 py-0.5 text-xs font-semibold text-amber-300">DRAFT</span>;
    return <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-400">{status}</span>;
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Drawer */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[210] flex max-h-[90vh] flex-col rounded-t-2xl border-t border-white/10 bg-[#0f0f1a] shadow-2xl md:bottom-auto md:right-0 md:top-0 md:w-[480px] md:max-h-screen md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0"
        initial={{ y: "100%", x: 0 }}
        animate={{ y: 0, x: 0 }}
        exit={{ y: "100%", x: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-violet-400" />
            <span className="font-mono text-base font-semibold text-white">
              {detail?.request_no || "Loading..."}
            </span>
            {detail ? statusBadge(detail.status) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {detail && (
            <>
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <Hash className="h-3 w-3" /> Branch
                  </div>
                  <div className="font-semibold text-white">{detail.store_code || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <CalendarDays className="h-3 w-3" /> Date
                  </div>
                  <div className="font-semibold text-white">{detail.request_date || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <User className="h-3 w-3" /> Requested By
                  </div>
                  <div className="font-semibold text-white">{detail.requested_by || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <Package className="h-3 w-3" /> Total
                  </div>
                  <div className="font-semibold text-violet-300">
                    {Number(detail.total_amount || 0).toFixed(2)} {currencyCode}
                  </div>
                </div>
              </div>

              {detail.urgent_flag && (
                <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs font-semibold text-red-300">
                  ⚡ URGENT REQUEST
                </div>
              )}

              {detail.notes && (
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-zinc-300">
                  <div className="mb-1 text-xs text-zinc-500">Notes</div>
                  {detail.notes}
                </div>
              )}

              {/* Items */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                    <Package className="h-4 w-4 text-violet-400" />
                    Items ({detail.items?.length ?? 0})
                  </h3>
                  {canEditPricesRole && !!detail.items?.length && (
                    editPricesMode ? (
                      <div className="flex items-center gap-2">
                        {savePricesError && (
                          <span className="text-[10px] text-red-400 max-w-[120px] truncate">{savePricesError}</span>
                        )}
                        <button
                          onClick={() => { setEditPricesMode(false); setSavePricesError(""); }}
                          disabled={savingPrices}
                          className="rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={savePrices}
                          disabled={savingPrices}
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {savingPrices ? "Saving…" : "Save Prices"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={enterEditPricesMode}
                        className="rounded-lg border border-blue-500/40 bg-blue-950/30 px-2 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-900/40"
                      >
                        Edit Prices
                      </button>
                    )
                  )}
                </div>
                {editPricesMode && (
                  <div className="mb-2 rounded-lg border border-blue-500/20 bg-blue-950/20 px-2.5 py-1.5 text-[11px] text-blue-300">
                    Price edit mode — update unit prices below, then click Save Prices.
                  </div>
                )}
                {!detail.items?.length ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">No items</p>
                ) : (
                  <div className="space-y-2">
                    {detail.items.map((item, idx) => {
                      const draftPrice = editPricesMode ? (parseFloat(draftPrices[item.id] ?? "") || 0) : (item.unit_price ?? 0);
                      const draftTotal = (item.qty || 0) * draftPrice;
                      return (
                        <div
                          key={item.id || idx}
                          className={`rounded-xl border px-3 py-3 ${editPricesMode ? "border-blue-500/20 bg-blue-950/10" : "border-white/8 bg-white/4"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-white text-sm leading-tight">{item.item_name}</div>
                              {item.category && (
                                <div className="mt-0.5 text-xs text-violet-400">{item.category}</div>
                              )}
                              {item.spec && (
                                <div className="mt-0.5 text-xs text-zinc-500">{item.spec}</div>
                              )}
                              {item.vendor_name && (
                                <div className="mt-0.5 text-xs text-zinc-500">Vendor: {item.vendor_name}</div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-white">
                                {Number(item.qty || 0).toLocaleString()} {item.unit}
                              </div>
                              {editPricesMode ? (
                                <div className="mt-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={draftPrices[item.id] ?? "0"}
                                    onChange={(e) => setDraftPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                                    className="w-24 rounded border border-blue-400/40 bg-zinc-900 px-1.5 py-0.5 text-right text-xs text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                  {draftTotal > 0 && (
                                    <div className="text-[10px] text-blue-300 mt-0.5 tabular-nums">
                                      = {draftTotal.toFixed(2)} {currencyCode}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {item.unit_price > 0 && (
                                    <div className="text-xs text-zinc-400">
                                      @ {Number(item.unit_price).toFixed(2)}
                                    </div>
                                  )}
                                  {item.line_total > 0 && (
                                    <div className="text-xs font-semibold text-violet-300 mt-0.5">
                                      {Number(item.line_total).toFixed(2)} {currencyCode}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {item.needed_by_date && (
                            <div className="mt-1.5 text-xs text-amber-400">
                              Needed by: {item.needed_by_date}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Receivings */}
              {detail.receivings && detail.receivings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                    Receivings ({detail.receivings.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.receivings.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-zinc-300">{r.receiving_no || r.id}</span>
                        <span className="text-xs text-zinc-500">{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Claims */}
              {detail.claims && detail.claims.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                    Claims ({detail.claims.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.claims.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-zinc-300">{c.claim_no || c.id}</span>
                        <span className="text-xs text-zinc-500">{c.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions — status-aware */}
        {detail && (() => {
          const s = String(detail.status || "").toUpperCase();
          if (s === "DRAFT") {
            if (submitConfirm) {
              return (
                <div className="border-t border-white/10 px-5 py-4 space-y-3">
                  <p className="text-center text-sm text-amber-200">
                    Submit <span className="font-mono font-semibold">{detail?.request_no}</span> for approval?
                  </p>
                  {error && (
                    <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmitForApproval()}
                      disabled={submitBusy}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {submitBusy ? "Submitting…" : "✓ Confirm Submit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSubmitConfirm(false); setError(""); }}
                      disabled={submitBusy}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-zinc-400 transition hover:bg-white/10 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitConfirm(true)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Submit for Approval
                </button>
                <Link
                  href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
                >
                  Edit
                </Link>
              </div>
            );
          }
          if (s === "RETURNED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 space-y-2">
                <div className="flex gap-3">
                  <Link
                    href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(requestId)}`}
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-amber-500/40 bg-amber-950/30 py-2.5 text-center text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
                  >
                    Edit &amp; Resubmit
                  </Link>
                  {!cancelConfirm ? (
                    <button
                      type="button"
                      onClick={() => setCancelConfirm(true)}
                      className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-950/35"
                    >
                      Cancel Request
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Sure?</span>
                      <button
                        type="button"
                        onClick={handleCancelRequest}
                        disabled={cancelBusy}
                        className="rounded-lg border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-50"
                      >
                        {cancelBusy ? "Cancelling…" : "Yes, Cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(false)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50"
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          if (s === "REJECTED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-rose-500/40 bg-rose-950/30 py-2.5 text-center text-sm font-semibold text-rose-300 transition hover:bg-rose-900/40"
                >
                  Edit &amp; Resubmit
                </Link>
              </div>
            );
          }
          if (s === "IN_REVIEW" || s === "SUBMITTED") {
            return (
              <div className="border-t border-white/10 px-5 py-4">
                <div className="flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/4 py-2.5 text-sm text-zinc-500">
                  <Clock className="h-4 w-4" /> Awaiting Approval
                </div>
              </div>
            );
          }
          if (s === "APPROVED") {
            const rs = String(detail.receiving_status || "").toUpperCase();
            if (rs === "CONFIRMED") {
              return (
                <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                  <Link
                    href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-950/30 py-2.5 text-center text-sm font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
                  >
                    ✓ Received — File Claim
                  </Link>
                  <button
                    type="button"
                    onClick={() => window.open(`/store/procurement/wh-delivery/${encodeURIComponent(requestId)}`, "_blank")}
                    className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-950/30 px-3 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-900/40 flex items-center gap-1.5"
                    title="Open Delivery Note"
                  >
                    <Printer className="h-4 w-4" />
                    DN
                  </button>
                </div>
              );
            }
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-2.5 text-center text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-emerald-400"
                >
                  Receive Now
                </Link>
                <button
                  type="button"
                  onClick={() => window.open(`/store/procurement/wh-delivery/${encodeURIComponent(requestId)}`, "_blank")}
                  className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-950/30 px-3 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-900/40 flex items-center gap-1.5"
                  title="Open Delivery Note"
                >
                  <Printer className="h-4 w-4" />
                  DN
                </button>
              </div>
            );
          }
          if (s === "RECEIVED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-blue-500/30 bg-blue-950/30 py-2.5 text-center text-sm font-semibold text-blue-300 transition hover:bg-blue-900/40"
                >
                  File Claim
                </Link>
                <button
                  type="button"
                  onClick={() => window.open(`/store/procurement/wh-delivery/${encodeURIComponent(requestId)}`, "_blank")}
                  className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-950/30 px-3 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-900/40 flex items-center gap-1.5"
                  title="Open Delivery Note"
                >
                  <Printer className="h-4 w-4" />
                  DN
                </button>
              </div>
            );
          }
          // CLAIMED / CLOSED / other — show history links
          return (
            <div className="border-t border-white/10 px-5 py-4 flex gap-3">
              <Link
                href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                onClick={onClose}
                className="flex-1 rounded-xl border border-violet-500/30 bg-violet-950/40 py-2.5 text-center text-sm font-semibold text-violet-300 transition hover:bg-violet-900/40"
              >
                Receiving
              </Link>
              <Link
                href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                onClick={onClose}
                className="flex-1 rounded-xl border border-red-500/30 bg-red-950/40 py-2.5 text-center text-sm font-semibold text-red-300 transition hover:bg-red-900/40"
              >
                Claim
              </Link>
            </div>
          );
        })()}
      </motion.div>
    </>
  );
}

export default function StoreProcurementHomePage() {
  const PAGE_BG = "min-h-screen text-white";
  const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
  const BLUSH_PRIMARY =
    "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
  const BLUSH_SECONDARY =
    "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
  const BLUSH_SMALL = `${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`;

  const router = useRouter();
  const LAST_CREATED_REQUEST_KEY = "store_procurement_last_created_request";
  const LAST_CREATED_RECEIVING_KEY = "store_procurement_last_created_receiving";
  const LAST_CREATED_CLAIM_KEY = "store_procurement_last_created_claim";
  const RECENT_ACTIVITY_EXPANDED_KEY = "store_procurement_recent_activity_expanded";
  const RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY = "store_procurement_recent_activity_actions_expanded";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState(() => {
    // Determine city from stored branch first; fall back to auth.city
    const storedBranch = (typeof window !== "undefined" ? localStorage.getItem("store_proc_branch") || "" : "").toUpperCase();
    if (storedBranch) {
      const inManila = BRANCHES.manila.some((b) => b.code === storedBranch);
      const inDubai  = BRANCHES.dubai.some((b) => b.code === storedBranch);
      if (inManila && !inDubai) return "manila";
      if (inDubai  && !inManila) return "dubai";
    }
    return (auth?.city || "manila").toLowerCase();
  });
  const [storeCode, setStoreCode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("store_proc_branch") || "";
    return "";
  });
  const [rows, setRows] = useState<RequestRow[]>([]);
  // KPI card filter: null = show all, else a status bucket (DRAFT/IN_REVIEW/APPROVED/RETURNED).
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [lastCreatedRequestId, setLastCreatedRequestId] = useState("");
  const [lastCreatedRequestNo, setLastCreatedRequestNo] = useState("");
  const [lastCreatedRequestAt, setLastCreatedRequestAt] = useState("");
  const [lastCreatedReceivingId, setLastCreatedReceivingId] = useState("");
  const [lastCreatedReceivingNo, setLastCreatedReceivingNo] = useState("");
  const [lastCreatedReceivingRequestId, setLastCreatedReceivingRequestId] = useState("");
  const [lastCreatedReceivingAt, setLastCreatedReceivingAt] = useState("");
  const [lastCreatedClaimId, setLastCreatedClaimId] = useState("");
  const [lastCreatedClaimNo, setLastCreatedClaimNo] = useState("");
  const [lastCreatedClaimCaseId, setLastCreatedClaimCaseId] = useState("");
  const [lastCreatedClaimRequestId, setLastCreatedClaimRequestId] = useState("");
  const [lastCreatedClaimAt, setLastCreatedClaimAt] = useState("");
  const [showAllRecentActivities, setShowAllRecentActivities] = useState(false);
  const [expandedActionsByItem, setExpandedActionsByItem] = useState<Record<string, boolean>>({});
  const [deliverySummaryOpen, setDeliverySummaryOpen] = useState(false);
  const [expandedSummaryMonth, setExpandedSummaryMonth] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [canOpenAdminCase, setCanOpenAdminCase] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [cancellingRowId, setCancellingRowId] = useState<string | null>(null);
  const [cancelConfirmRowId, setCancelConfirmRowId] = useState<string | null>(null);
  // Pending Deliveries state
  type PendingDeliveryRow = {
    id: string;
    po_no: string;
    vendor_name: string;
    amount: number;
    line_items_json: { item_name: string; qty: number; unit: string }[];
    status: string;
    delivery_date?: string;
    dispatched_at?: string;
    receipt_confirmed_at?: string;
    has_shortage: boolean;
    delivery_note?: string;
    request_id: string;
    request_no: string;
    store_code: string;
    pending_status: "not_dispatched" | "in_transit" | "short_delivered";
    is_overdue: boolean;
    days_overdue: number;
    expected_date?: string;
  };
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDeliveryRow[]>([]);
  const [pendingDeliveriesHiddenCount, setPendingDeliveriesHiddenCount] = useState(0);
  const [pendingDeliveriesLoading, setPendingDeliveriesLoading] = useState(false);
  const [pendingDeliveriesSectionOpen, setPendingDeliveriesSectionOpen] = useState(true);
  const [pendingDeliveriesExpanded, setPendingDeliveriesExpanded] = useState<string | null>(null);
  const [alertingPoId, setAlertingPoId] = useState("");
  const [alertSentPoIds, setAlertSentPoIds] = useState<Set<string>>(new Set());

  // CK Dispatch state
  const [ckDispatchRows, setCkDispatchRows] = useState<CkDispatchRow[]>([]);
  const [ckDispatchLoading, setCkDispatchLoading] = useState(false);
  const [ckDispatchExpanded, setCkDispatchExpanded] = useState<string | null>(null);
  const [ckDispatchNote, setCkDispatchNote] = useState<Record<string, string>>({});
  const [ckDispatchPhoto, setCkDispatchPhoto] = useState<Record<string, File | null>>({});
  const [ckDispatchPhotoPreview, setCkDispatchPhotoPreview] = useState<Record<string, string>>({});
  const [ckDispatchBusy, setCkDispatchBusy] = useState<Record<string, boolean>>({});
  const [ckDispatchSuccess, setCkDispatchSuccess] = useState<Record<string, string>>({});
  const [ckDispatchError, setCkDispatchError] = useState<Record<string, string>>({});
  const [ckDispatchSectionOpen, setCkDispatchSectionOpen] = useState(true);
  const initRef = useRef(false);
  const storeCodeMountRef = useRef(true);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";
  const APPROVAL_THRESHOLD = city === "dubai" ? 500 : 15000;
  const isHighValue = (row: RequestRow) => Number(row.total_amount || 0) > APPROVAL_THRESHOLD;

  const loadPendingDeliveries = useCallback(async (cityOverride?: string, storeCodeOverride?: string) => {
    const activeCity = cityOverride ?? city;
    const activeStore = storeCodeOverride ?? storeCode;
    if (!activeStore) return;
    setPendingDeliveriesLoading(true);
    try {
      const qs = new URLSearchParams({ city: activeCity, store_code: activeStore });
      const res = await fetch(`/api/store/procurement/pending-deliveries?${qs}`, { method: "GET", cache: "no-store" });
      const data = await res.json();
      setPendingDeliveries(Array.isArray(data?.rows) ? data.rows : []);
      setPendingDeliveriesHiddenCount(typeof data?.hidden_count === "number" ? data.hidden_count : 0);
    } catch {
      setPendingDeliveries([]);
      setPendingDeliveriesHiddenCount(0);
    } finally {
      setPendingDeliveriesLoading(false);
    }
  }, [city, storeCode]);

  const sendOverdueAlert = useCallback(async (poId: string) => {
    setAlertingPoId(poId);
    try {
      await fetch(`/api/store/procurement/pending-deliveries/${encodeURIComponent(poId)}/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approver_name: requestedBy.trim(), pin: pin.trim(), notes: "" }),
        cache: "no-store",
      });
      setAlertSentPoIds((prev) => new Set([...prev, poId]));
    } catch {
      // best-effort — no error surfaced since the core action (pending display) is unaffected
    } finally {
      setAlertingPoId("");
    }
  }, [pin, requestedBy]);

  const loadCkDispatch = useCallback(async (cityOverride?: string) => {
    const activeCity = cityOverride ?? city;
    if (!requestedBy.trim() || !pin.trim()) return;
    setCkDispatchLoading(true);
    try {
      const qs = new URLSearchParams({
        city: activeCity,
        approver_name: requestedBy.trim(),
        pin: pin.trim(),
      });
      const data = await procurementJson<{ rows: CkDispatchRow[] }>(
        `/api/admin/procurement/ck-dispatch/pending?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setCkDispatchRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      // Non-critical: silently ignore if user lacks dispatch access
      setCkDispatchRows([]);
    } finally {
      setCkDispatchLoading(false);
    }
  }, [city, pin, requestedBy]);

  const handleCkDispatch = async (poId: string) => {
    setCkDispatchBusy((p) => ({ ...p, [poId]: true }));
    setCkDispatchError((p) => ({ ...p, [poId]: "" }));
    try {
      const fd = new FormData();
      fd.append("approver_name", requestedBy.trim());
      fd.append("pin", pin.trim());
      fd.append("delivery_note", (ckDispatchNote[poId] || "").trim());
      const photoFile = ckDispatchPhoto[poId];
      if (photoFile) fd.append("file", photoFile);

      const headers = await (await import("@/lib/procurementClient")).procurementTokenHeaders(requestedBy, pin);
      const res = await fetch(`/api/admin/procurement/ck-dispatch/${encodeURIComponent(poId)}`, {
        method: "POST",
        body: fd,
        headers,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text || `Request failed (${res.status})`;
        try { const j = JSON.parse(text); if (j?.detail) msg = j.detail; } catch {}
        throw new Error(msg);
      }
      setCkDispatchSuccess((p) => ({ ...p, [poId]: "✓ Marked as dispatched" }));
      setCkDispatchExpanded(null);
      setTimeout(() => {
        setCkDispatchRows((prev) => prev.filter((r) => r.id !== poId));
      }, 2500);
    } catch (e: unknown) {
      setCkDispatchError((p) => ({ ...p, [poId]: friendlyProcurementError(e) }));
    } finally {
      setCkDispatchBusy((p) => ({ ...p, [poId]: false }));
    }
  };

  const loadMyRequests = useCallback(async (cityOverride?: string, _requestedByOverride?: string, storeCodeOverride?: string) => {
    setLoading(true);
    setError("");
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const activeStore = (storeCodeOverride !== undefined ? storeCodeOverride : storeCode).trim();
      const qs = new URLSearchParams({ city: activeCity, limit: "200" });
      if (activeStore) qs.set("store_code", activeStore);
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(friendlyProcurementError(e));
    } finally {
      setLoading(false);
    }
  }, [city, pin, requestedBy, storeCode]);


  const handleCancelRow = async (rowId: string) => {
    setCancellingRowId(rowId);
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/requests/${encodeURIComponent(rowId)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: rowId,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setCancelConfirmRowId(null);
      await loadMyRequests();
    } catch (e: unknown) {
      setError(friendlyProcurementError(e));
    } finally {
      setCancellingRowId(null);
    }
  };

  useEffect(() => {
    if (!submitSuccessMsg) return;
    const t = setTimeout(() => setSubmitSuccessMsg(""), 8000);
    return () => clearTimeout(t);
  }, [submitSuccessMsg]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (!(refreshed?.staffName || auth?.staffName) || !(refreshed?.hasSession || auth?.hasSession || refreshed?.accessToken || auth?.accessToken)) {
        router.replace("/login?next=%2Fstore%2Fprocurement");
        return;
      }
      let queryCity = "";
      if (typeof window !== "undefined") {
        queryCity = String(new URLSearchParams(window.location.search).get("city") || "").toLowerCase();
      }
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase() || "manila";
      setCanOpenAdminCase(canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), initialCity === "dubai" ? "dubai" : "manila"));
      setCity(initialCity);
      const resolvedName = (refreshed?.staffName || auth?.staffName || "").trim();
      if (resolvedName && !requestedBy.trim()) {
        setRequestedBy(resolvedName);
      }
      // Pass the resolved name directly to avoid stale closure
      await loadMyRequests(initialCity, resolvedName || requestedBy.trim());
      // Load CK dispatch (non-blocking, silently fails if no access).
      // CK is a Manila-only facility — never load/show it for Dubai.
      if (isCkDispatchVisible(initialCity)) void loadCkDispatch(initialCity);
      // Load pending deliveries if a branch is already selected
      if (storeCode) void loadPendingDeliveries(initialCity, storeCode);
    }
    void init();
  }, [auth, city, loadCkDispatch, loadMyRequests, loadPendingDeliveries, requestedBy, router, storeCode]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const timelineFromQuery = String(sp.get("timeline") || "").toLowerCase();
      if (timelineFromQuery === "open") {
        setShowAllRecentActivities(true);
        return;
      }
      if (timelineFromQuery === "closed") {
        setShowAllRecentActivities(false);
        return;
      }
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_EXPANDED_KEY);
      if (!saved) return;
      setShowAllRecentActivities(saved === "1");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities ? "1" : "0");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities]);

  useEffect(() => {
    if (storeCode) void loadPendingDeliveries();
    else setPendingDeliveries([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode]);

  useEffect(() => {
    if (storeCodeMountRef.current) { storeCodeMountRef.current = false; return; }
    void loadMyRequests(undefined, undefined, storeCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (showAllRecentActivities) {
        url.searchParams.set("timeline", "open");
      } else if (String(url.searchParams.get("timeline") || "").toLowerCase() === "open") {
        url.searchParams.delete("timeline");
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [showAllRecentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_REQUEST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; request_no?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const requestNo = String(parsed?.request_no || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_REQUEST_KEY);
        return;
      }
      if (id) {
        setLastCreatedRequestId(id);
        setLastCreatedRequestNo(requestNo);
        setLastCreatedRequestAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_REQUEST_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_RECEIVING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; receiving_no?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const receivingNo = String(parsed?.receiving_no || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_RECEIVING_KEY);
        return;
      }
      if (id) {
        setLastCreatedReceivingId(id);
        setLastCreatedReceivingNo(receivingNo);
        setLastCreatedReceivingRequestId(requestId);
        setLastCreatedReceivingAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_RECEIVING_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_CLAIM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; claim_no?: string; case_id?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const claimNo = String(parsed?.claim_no || "").trim();
      const caseId = String(parsed?.case_id || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_CLAIM_KEY);
        return;
      }
      if (id) {
        setLastCreatedClaimId(id);
        setLastCreatedClaimNo(claimNo);
        setLastCreatedClaimCaseId(caseId);
        setLastCreatedClaimRequestId(requestId);
        setLastCreatedClaimAt(at);
      }
    } catch {}
  }, [LAST_CREATED_CLAIM_KEY, LAST_CREATED_MAX_AGE_MS, relativeNowMs]);

  // Filter out completed requests: receiving confirmed or terminal status
  const activeRows = useMemo(() => rows.filter(isActiveRequest), [rows]);

  // Rejected requests are excluded from activeRows; surface them separately so the
  // store can see (and re-submit) orders the Back Office rejected.
  const rejectedRows = useMemo(() => rows.filter(isRejectedRequest), [rows]);

  const counts = useMemo(() => {
    const out = {
      total: activeRows.length,
      draft: 0,
      inReview: 0,
      approved: 0,
      returned: 0,
      rejected: rejectedRows.length,
    };
    for (const row of activeRows) {
      const st = String(row.status || "").toUpperCase();
      if (st === "DRAFT") out.draft += 1;
      else if (st === "IN_REVIEW" || st === "SUBMITTED") out.inReview += 1;
      else if (st === "APPROVED") out.approved += 1;
      else if (st === "RETURNED") out.returned += 1;
    }
    return out;
  }, [activeRows, rejectedRows]);

  // Rows shown in the Requests list, narrowed by the selected KPI card (if any).
  const displayedRows = useMemo(
    () => selectDisplayedRequests(activeRows, rejectedRows, statusFilter),
    [activeRows, rejectedRows, statusFilter],
  );

  // Monthly delivery summary: aggregate approved/received rows by YYYY-MM
  const monthlySummary = useMemo(() => {
    const SETTLED = new Set(["APPROVED", "RECEIVED", "CLAIMED", "CLOSED"]);
    const byMonth: Record<string, { count: number; total: number }> = {};
    for (const row of rows) {
      if (!SETTLED.has(String(row.status || "").toUpperCase())) continue;
      const month = String(row.request_date || "").slice(0, 7);
      if (!month) continue;
      if (!byMonth[month]) byMonth[month] = { count: 0, total: 0 };
      byMonth[month].count += 1;
      byMonth[month].total += Number(row.total_amount || 0);
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, d]) => ({ month, ...d }));
  }, [rows]);

  const STATUS_FILTER_LABEL: Record<string, string> = {
    DRAFT: "Draft", IN_REVIEW: "In Review", APPROVED: "Approved", RETURNED: "Returned", REJECTED: "Rejected",
  };

  // Toggle a KPI card filter and scroll the Requests list into view.
  const toggleStatusFilter = (s: string) => {
    setStatusFilter((cur) => (cur === s ? null : s));
    if (typeof document !== "undefined") {
      window.setTimeout(
        () => document.getElementById("history")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        60,
      );
    }
  };

  const recentActivities = useMemo<RecentActivityItem[]>(() => {
    const items: RecentActivityItem[] = [];
    if (lastCreatedRequestId) {
      items.push({
        kind: "request",
        id: lastCreatedRequestId,
        label: lastCreatedRequestNo || lastCreatedRequestId,
        at: lastCreatedRequestAt,
        requestId: lastCreatedRequestId,
      });
    }
    if (lastCreatedReceivingId) {
      items.push({
        kind: "receiving",
        id: lastCreatedReceivingId,
        label: lastCreatedReceivingNo || lastCreatedReceivingId,
        at: lastCreatedReceivingAt,
        requestId: lastCreatedReceivingRequestId,
      });
    }
    if (lastCreatedClaimId) {
      items.push({
        kind: "claim",
        id: lastCreatedClaimId,
        label: lastCreatedClaimNo || lastCreatedClaimId,
        at: lastCreatedClaimAt,
        requestId: lastCreatedClaimRequestId,
        caseId: lastCreatedClaimCaseId,
      });
    }
    return items.sort((a, b) => (parseIsoTimeMs(b.at) || 0) - (parseIsoTimeMs(a.at) || 0));
  }, [
    lastCreatedClaimAt,
    lastCreatedClaimCaseId,
    lastCreatedClaimId,
    lastCreatedClaimNo,
    lastCreatedClaimRequestId,
    lastCreatedReceivingAt,
    lastCreatedReceivingId,
    lastCreatedReceivingNo,
    lastCreatedReceivingRequestId,
    lastCreatedRequestAt,
    lastCreatedRequestId,
    lastCreatedRequestNo,
  ]);
  const visibleRecentActivities = useMemo(
    () => (showAllRecentActivities ? recentActivities : recentActivities.slice(0, 3)),
    [recentActivities, showAllRecentActivities],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setExpandedActionsByItem(parsed);
      }
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY]);

  useEffect(() => {
    const activeKeys = new Set(recentActivities.map((item) => `${item.kind}:${item.id}`));
    setExpandedActionsByItem((prev) => {
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (activeKeys.has(key)) next[key] = Boolean(value);
      }
      return next;
    });
  }, [recentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY,
        JSON.stringify(expandedActionsByItem),
      );
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY, expandedActionsByItem]);

  const getStatusActionButton = (row: RequestRow) => {
    const s = String(row.status || "").toUpperCase();
    const rs = String(row.receiving_status || "").toUpperCase();
    if (s === "APPROVED") {
      // If receiving is already confirmed, show "Continue to Claim" instead of "Receive Now"
      if (rs === "CONFIRMED") {
        return (
          <Link
            href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
            className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Received — File Claim
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        );
      }
      return (
        <Link
          href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
          className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Receive Now
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      );
    }
    if (s === "RETURNED") {
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(row.id)}`}
            className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Edit & Resubmit
            </span>
          </Link>
          {cancelConfirmRowId !== row.id ? (
            <button
              type="button"
              onClick={() => setCancelConfirmRowId(row.id)}
              className="rounded-xl border border-red-500/30 bg-red-950/15 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-950/30"
            >
              Cancel
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/40">Sure?</span>
              <button
                type="button"
                onClick={() => void handleCancelRow(row.id)}
                disabled={cancellingRowId === row.id}
                className="rounded-lg border border-red-500/50 bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-50"
              >
                {cancellingRowId === row.id ? "…" : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => setCancelConfirmRowId(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/40"
              >
                Keep
              </button>
            </div>
          )}
        </div>
      );
    }
    if (s === "REJECTED") {
      return (
        <Link
          href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-900/40"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Edit & Resubmit
          </span>
        </Link>
      );
    }
    if (s === "IN_REVIEW" || s === "SUBMITTED") {
      return (
        <span className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-sm text-zinc-500 cursor-default">
          <Clock className="h-4 w-4" />
          Awaiting Approval
        </span>
      );
    }
    if (s === "RECEIVED") {
      return (
        <Link
          href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-blue-500/30 bg-blue-950/30 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-900/40"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            File Claim
          </span>
        </Link>
      );
    }
    if (s === "DRAFT") {
      return (
        <Link
          href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-900/35"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            Continue Draft
          </span>
        </Link>
      );
    }
    // CLAIMED / CLOSED / fallback — show both options
    return (
      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${SMALL_BUTTON} justify-center`}>
          Receiving
        </Link>
        <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${DANGER_BUTTON} justify-center`}>
          Claim
        </Link>
      </div>
    );
  };

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-7xl px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      {/* Header */}
      <div className="mb-5">
        <h1 className={T_PAGE_TITLE}>Store Procurement</h1>
        <p className={T_BODY}>Request, track, receive, and claim store supplies.</p>
      </div>

      {/* Stepper */}
      <div className={`${BLUSH_GLASS} px-6 py-3 mb-6`}>
        <ProcurementStepper currentStep="hub" />
      </div>

      {/* Two-column layout on PC */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* ─── LEFT PANEL ─── */}
        <div className="flex flex-col gap-4 lg:w-72 xl:w-80 lg:shrink-0">

          {/* City selector */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">City</span>
            </div>
            <SelectDark
              value={city}
              onChange={(v) => {
                const nextCity = v as "dubai" | "manila";
                setCity(nextCity);
                setStoreCode("");
                if (typeof window !== "undefined") localStorage.removeItem("store_proc_branch");
                void loadMyRequests(nextCity, undefined, "");
                if (isCkDispatchVisible(nextCity)) void loadCkDispatch(nextCity);
              }}
              className={SELECT_CLASS}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
          </div>

          {/* Branch selector */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">Branch</span>
              {storeCode ? (
                <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                  ✓ {BRANCHES[city as "dubai" | "manila"]?.find((b) => b.code === storeCode)?.name || storeCode}
                </span>
              ) : (
                <span className="text-xs text-amber-400">⚠ Select branch</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(BRANCHES[city as "dubai" | "manila"] || [])
                .filter((b) => b.code !== "DRIVER")
                .map((branch) => {
                  const active = storeCode === branch.code;
                  return (
                    <button
                      key={branch.code}
                      type="button"
                      onClick={() => {
                        setStoreCode(branch.code);
                        if (typeof window !== "undefined") localStorage.setItem("store_proc_branch", branch.code);
                      }}
                      className={[
                        "rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all duration-200",
                        active
                          ? "bg-violet-500/25 text-violet-100 border-violet-500/50 shadow-sm"
                          : "bg-violet-950/30 text-violet-400 border-violet-800/40 hover:bg-violet-900/40 hover:text-violet-200",
                      ].join(" ")}
                    >
                      {branch.name}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* New Request CTA */}
          <Link
            href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}${storeCode ? `&store_code=${encodeURIComponent(storeCode)}` : ""}`}
            className={[BLUSH_PRIMARY, "flex items-center justify-center gap-2 text-sm", !storeCode ? "opacity-60 cursor-not-allowed pointer-events-none" : ""].join(" ")}
            aria-disabled={!storeCode}
          >
            <PlusCircle className="h-4 w-4" />
            {storeCode ? "New Request" : "Select Branch First"}
          </Link>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => toggleStatusFilter("DRAFT")}
              className={`${KPI_CARD} text-left cursor-pointer transition-all hover:border-white/20 ${statusFilter === "DRAFT" ? "ring-2 ring-zinc-400/60 border-zinc-400/40" : ""}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-zinc-400" />
                <p className={KPI_LABEL}>Draft</p>
              </div>
              <p className={`${KPI_VALUE} text-lg text-zinc-200`}>{counts.draft}</p>
            </button>
            <button
              type="button"
              onClick={() => toggleStatusFilter("IN_REVIEW")}
              className={`${KPI_CARD} text-left cursor-pointer transition-all hover:border-white/20 ${statusFilter === "IN_REVIEW" ? "ring-2 ring-amber-400/60 border-amber-400/40" : ""}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <p className={KPI_LABEL}>In Review</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.inReview > 0 ? "text-amber-400" : "text-zinc-500"}`}>{counts.inReview}</p>
            </button>
            <button
              type="button"
              onClick={() => toggleStatusFilter("APPROVED")}
              className={`${KPI_CARD} text-left cursor-pointer transition-all hover:border-white/20 ${statusFilter === "APPROVED" ? "ring-2 ring-emerald-400/60 border-emerald-400/40" : ""}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <p className={KPI_LABEL}>Approved</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.approved > 0 ? "text-emerald-400" : "text-zinc-500"}`}>{counts.approved}</p>
            </button>
            <button
              type="button"
              onClick={() => toggleStatusFilter("RETURNED")}
              className={`${KPI_CARD} text-left cursor-pointer transition-all hover:border-white/20 ${statusFilter === "RETURNED" ? "ring-2 ring-red-400/60 border-red-400/40" : ""}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5 text-red-400" />
                <p className={KPI_LABEL}>Returned</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.returned > 0 ? "text-red-400" : "text-zinc-500"}`}>{counts.returned}</p>
            </button>
            <button
              type="button"
              onClick={() => toggleStatusFilter("REJECTED")}
              className={`${KPI_CARD} text-left cursor-pointer transition-all hover:border-white/20 ${statusFilter === "REJECTED" ? "ring-2 ring-rose-500/60 border-rose-500/40" : ""}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5 text-rose-500" />
                <p className={KPI_LABEL}>Rejected</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.rejected > 0 ? "text-rose-500" : "text-zinc-500"}`}>{counts.rejected}</p>
            </button>
          </div>

          {/* Auth form + city */}
          <div className={`${BLUSH_GLASS} p-4 space-y-3`}>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Your Name</label>
              <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Session PIN</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                <Building2 className="h-3 w-3" />
                City
              </label>
              <SelectDark
                value={city}
                onChange={(v) => {
                  const nextCity = String(v || "manila").toLowerCase();
                  setCity(nextCity);
                  setStoreCode("");
                  if (typeof window !== "undefined") localStorage.removeItem("store_proc_branch");
                  void loadMyRequests(nextCity, undefined, "");
                  if (isCkDispatchVisible(nextCity)) void loadCkDispatch(nextCity);
                }}
                className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                options={[
                  { value: "manila", label: "Manila" },
                  { value: "dubai", label: "Dubai" },
                ]}
              />
            </div>
            <button type="button" onClick={() => { void loadMyRequests(); void loadPendingDeliveries(); }} disabled={loading} className={BLUSH_SECONDARY + " w-full flex items-center justify-center gap-2 text-sm"}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Quick links */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <p className={`${T_LABEL} mb-3`}>Quick Links</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className={`${BLUSH_SMALL} justify-center min-h-10`}>
                <span className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-3 w-3" /> Receiving
                </span>
              </Link>
              <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className={`${DANGER_BUTTON} justify-center min-h-10 text-sm`}>
                <span className="flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-3 w-3" /> Claim
                </span>
              </Link>
              <Link href={`/store/procurement?city=${encodeURIComponent(city || "manila")}#history`} className={`col-span-2 ${BLUSH_SMALL} justify-center min-h-10`}>
                <span className="flex items-center justify-center gap-1.5">
                  <History className="h-3 w-3" /> View History
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">

          {/* ── Pending Deliveries Section ── */}
          {storeCode && (
          <div className={`${BLUSH_GLASS} overflow-hidden`}>
            <button
              type="button"
              className="w-full px-5 py-3.5 flex items-center justify-between gap-3"
              onClick={() => setPendingDeliveriesSectionOpen((v) => !v)}
            >
              {(() => {
                const overdueCount = pendingDeliveries.filter((r) => r.is_overdue).length;
                return (
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${overdueCount > 0 ? "bg-red-500/15 border border-red-500/40" : "bg-sky-500/15 border border-sky-500/30"}`}>
                    <PackageSearch className={`h-4 w-4 ${overdueCount > 0 ? "text-red-400" : "text-sky-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                      Pending Deliveries
                      {overdueCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-[11px] font-bold text-red-300">
                          <TriangleAlert className="h-3 w-3" />
                          {overdueCount} OVERDUE
                        </span>
                      )}
                      {pendingDeliveries.length > overdueCount && (
                        <span className="inline-flex items-center justify-center rounded-full bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                          {pendingDeliveries.length - overdueCount} pending
                        </span>
                      )}
                      {pendingDeliveriesLoading && <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {overdueCount > 0
                        ? `${overdueCount} order${overdueCount !== 1 ? "s" : ""} not received past expected date — action required`
                        : "Vendor POs not yet received"}
                    </p>
                  </div>
                </div>
                );
              })()}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void loadPendingDeliveries(); }}
                  className="rounded-lg p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  title="Refresh"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                {pendingDeliveriesSectionOpen
                  ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {pendingDeliveriesSectionOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/8 px-5 pb-4 pt-3">
                    {pendingDeliveriesHiddenCount > 0 && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-700/40 bg-zinc-800/30 px-3 py-2 text-xs text-zinc-500">
                        <span className="text-zinc-600">ℹ</span>
                        {pendingDeliveriesHiddenCount} older order{pendingDeliveriesHiddenCount !== 1 ? "s" : ""} (90+ days overdue) hidden. Contact HQ to review or close them.
                      </div>
                    )}
                    {pendingDeliveries.length === 0 && !pendingDeliveriesLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
                        No pending deliveries for {storeCode}.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pendingDeliveries.map((row) => {
                          const isExp = pendingDeliveriesExpanded === row.id;
                          const isOverdue = row.is_overdue;
                          const alertSent = alertSentPoIds.has(row.id);
                          const alerting = alertingPoId === row.id;
                          const statusLabel =
                            row.pending_status === "short_delivered"
                              ? { label: "Short Delivered", cls: "bg-amber-900/30 border-amber-700/50 text-amber-300" }
                              : row.pending_status === "in_transit"
                                ? { label: "In Transit", cls: "bg-sky-900/30 border-sky-700/50 text-sky-300" }
                                : { label: "Not Dispatched", cls: "bg-zinc-800 border-zinc-700 text-zinc-400" };
                          return (
                            <div
                              key={row.id}
                              className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                                isExp
                                  ? isOverdue
                                    ? "border-red-500/50 bg-red-950/10"
                                    : "border-sky-500/40 bg-sky-950/15"
                                  : isOverdue
                                    ? "border-red-700/50 bg-red-950/8 hover:border-red-500/50"
                                    : row.pending_status === "short_delivered"
                                      ? "border-amber-700/40 bg-amber-950/10 hover:border-amber-500/40"
                                      : "border-white/8 bg-white/3 hover:border-sky-500/25"
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2.5 flex items-start justify-between gap-2 text-left"
                                onClick={() => setPendingDeliveriesExpanded(isExp ? null : row.id)}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white font-mono flex items-center gap-2 flex-wrap">
                                    {row.po_no}
                                    {isOverdue && (
                                      <span className="inline-flex items-center gap-1 rounded-full border bg-red-900/40 border-red-600/60 text-red-300 px-2 py-0.5 text-[10px] font-bold">
                                        <TriangleAlert className="h-3 w-3" />
                                        OVERDUE {row.days_overdue > 0 ? `${row.days_overdue}d` : ""}
                                      </span>
                                    )}
                                    {row.pending_status === "short_delivered" && (
                                      <span className="inline-flex items-center gap-1 rounded-full border bg-amber-900/40 border-amber-600/60 text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                                        <TriangleAlert className="h-3 w-3" />
                                        Short Delivered
                                      </span>
                                    )}
                                    {!isOverdue && row.pending_status !== "short_delivered" && (
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusLabel.cls}`}>
                                        {statusLabel.label}
                                      </span>
                                    )}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                                    <span>{row.vendor_name}</span>
                                    {row.expected_date && (
                                      <span className={isOverdue ? "text-red-400 font-medium" : ""}>
                                        Expected {row.expected_date}
                                      </span>
                                    )}
                                    <span>{(row.line_items_json || []).length} item{(row.line_items_json || []).length !== 1 ? "s" : ""}</span>
                                    {row.dispatched_at && <span>Dispatched {new Date(row.dispatched_at).toLocaleDateString()}</span>}
                                  </div>
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {isExp
                                    ? <ChevronUp className={`h-3.5 w-3.5 ${isOverdue ? "text-red-400" : "text-sky-400"}`} />
                                    : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                                </div>
                              </button>
                              {isExp && (
                                <div className="border-t border-white/8 px-3 py-3 space-y-3">
                                  {isOverdue && (
                                    <div className="rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
                                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
                                      <span>
                                        This delivery was expected on <strong>{row.expected_date}</strong> but has not been confirmed.
                                        {row.days_overdue > 0 && ` (${row.days_overdue} day${row.days_overdue !== 1 ? "s" : ""} overdue)`}
                                        {" "}Use <strong>Send Alert</strong> to notify HQ and the purchasing team.
                                      </span>
                                    </div>
                                  )}
                                  {row.delivery_note && (
                                    <p className="text-xs text-zinc-400 italic">{row.delivery_note}</p>
                                  )}
                                  <div className="space-y-1">
                                    {(Array.isArray(row.line_items_json) ? row.line_items_json : []).map((item, i) => (
                                      <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                                        <span>{item.item_name}</span>
                                        <span className="text-zinc-500">{item.qty} {item.unit}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <a
                                      href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.request_id)}`}
                                      className={`${BLUSH_SMALL} text-xs`}
                                    >
                                      <PackageCheck className="h-3 w-3" />
                                      Receiving
                                    </a>
                                    {row.pending_status === "short_delivered" && (
                                      <a
                                        href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.request_id)}`}
                                        className={`${DANGER_BUTTON} text-xs`}
                                      >
                                        <AlertCircle className="h-3 w-3" />
                                        Claim
                                      </a>
                                    )}
                                    {isOverdue && (
                                      alertSent ? (
                                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/40 bg-emerald-950/20 px-2.5 py-1 text-xs text-emerald-400">
                                          <CheckCircle2 className="h-3 w-3" /> Alert Sent
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={alerting}
                                          onClick={(e) => { e.preventDefault(); void sendOverdueAlert(row.id); }}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-600/50 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-950/50 disabled:opacity-50 transition-colors"
                                        >
                                          {alerting
                                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                                            : <TriangleAlert className="h-3 w-3" />}
                                          {alerting ? "Sending…" : "Send Alert to HQ"}
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          {/* ── CK Dispatch Section (Manila only — CK is a Manila facility; hide for Dubai) ── */}
          {isCkDispatchVisible(city) && (
          <div className={`${BLUSH_GLASS} overflow-hidden`}>
            <button
              type="button"
              className="w-full px-5 py-3.5 flex items-center justify-between gap-3"
              onClick={() => setCkDispatchSectionOpen((v) => !v)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15 border border-orange-500/30">
                  <Truck className="h-4 w-4 text-orange-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    CK Dispatch
                    {ckDispatchRows.length > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/40 px-2 py-0.5 text-[11px] font-bold text-orange-300">
                        {ckDispatchRows.length}
                      </span>
                    )}
                    {ckDispatchLoading && <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />}
                  </p>
                  <p className="text-xs text-zinc-500">Mark CK orders as dispatched</p>
                </div>
              </div>
              {ckDispatchSectionOpen
                ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
            </button>

            <AnimatePresence initial={false}>
              {ckDispatchSectionOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/8 px-5 pb-4 pt-3">
                    {ckDispatchRows.length === 0 && !ckDispatchLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
                        No CK orders pending dispatch.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {ckDispatchRows.map((row) => {
                          const isExp = ckDispatchExpanded === row.id;
                          const busy = ckDispatchBusy[row.id] || false;
                          const success = ckDispatchSuccess[row.id] || "";
                          const err = ckDispatchError[row.id] || "";
                          const photoFile = ckDispatchPhoto[row.id] || null;
                          const photoPreview = ckDispatchPhotoPreview[row.id] || "";

                          return (
                            <div
                              key={row.id}
                              className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                                success
                                  ? "border-emerald-700/50 bg-emerald-900/15"
                                  : isExp
                                    ? "border-orange-500/40 bg-orange-950/15"
                                    : "border-white/8 bg-white/3 hover:border-orange-500/25"
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2.5 flex items-start justify-between gap-2 text-left"
                                onClick={() => setCkDispatchExpanded(isExp ? null : row.id)}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white font-mono flex items-center gap-2">
                                    {row.po_no}
                                    {success && <span className="text-[10px] font-normal text-emerald-400">{success}</span>}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                                    <span>{row.store_code || row.city}</span>
                                    {row.delivery_date && <span>📅 {row.delivery_date}</span>}
                                    <span>{(row.line_items_json || []).length} item{(row.line_items_json || []).length !== 1 ? "s" : ""}</span>
                                  </div>
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {isExp
                                    ? <ChevronUp className="h-3.5 w-3.5 text-orange-400" />
                                    : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                                </div>
                              </button>

                              <AnimatePresence>
                                {isExp && !success && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-white/8 px-3 pb-3 pt-2.5 space-y-2.5">
                                      {/* Items summary */}
                                      {(row.line_items_json || []).length > 0 && (
                                        <div className="space-y-1">
                                          {row.line_items_json.map((li, i) => (
                                            <p key={i} className="text-xs text-zinc-400">
                                              · {li.item_name} — {li.qty} {li.unit}
                                            </p>
                                          ))}
                                        </div>
                                      )}

                                      {/* Delivery note */}
                                      <div>
                                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                                          Delivery Note
                                        </label>
                                        <input
                                          value={ckDispatchNote[row.id] || ""}
                                          onChange={(e) => setCkDispatchNote((p) => ({ ...p, [row.id]: e.target.value }))}
                                          placeholder="Invoice no., note…"
                                          className={INPUT_CLASS}
                                        />
                                      </div>

                                      {/* Photo upload */}
                                      <div>
                                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                                          Invoice Photo
                                        </label>
                                        {photoPreview ? (
                                          <div className="flex items-center gap-2">
                                            <img src={photoPreview} alt="preview" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs text-zinc-400 truncate">{photoFile?.name || "photo"}</p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setCkDispatchPhoto((p) => ({ ...p, [row.id]: null }));
                                                setCkDispatchPhotoPreview((p) => ({ ...p, [row.id]: "" }));
                                              }}
                                              className="rounded-lg border border-white/10 p-1 text-zinc-500 hover:text-white transition-colors"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/3 px-3 py-2.5 text-xs text-zinc-500 hover:border-orange-500/40 hover:text-zinc-300 transition-colors">
                                            <ImageIcon className="h-4 w-4" />
                                            Tap to attach invoice photo
                                            <input
                                              type="file"
                                              accept="image/*"
                                              capture="environment"
                                              className="sr-only"
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setCkDispatchPhoto((p) => ({ ...p, [row.id]: file }));
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                  setCkDispatchPhotoPreview((p) => ({ ...p, [row.id]: String(ev.target?.result || "") }));
                                                };
                                                reader.readAsDataURL(file);
                                              }}
                                            />
                                          </label>
                                        )}
                                      </div>

                                      {err && (
                                        <p className="text-xs text-red-400 rounded-lg border border-red-700/40 bg-red-900/20 px-2 py-1.5">{err}</p>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => void handleCkDispatch(row.id)}
                                        disabled={busy}
                                        className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 py-2.5 text-sm font-semibold text-white transition-all hover:from-orange-500 hover:to-amber-500 disabled:opacity-60 flex items-center justify-center gap-2"
                                      >
                                        {busy
                                          ? <><RefreshCw className="h-4 w-4 animate-spin" /> Dispatching…</>
                                          : <><Truck className="h-4 w-4" /> Mark as Dispatched</>}
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          {error ? <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div> : null}

          {submitSuccessMsg && (
            <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {submitSuccessMsg}
            </div>
          )}

          {recentActivities.length ? (
            <div className={`${BLUSH_GLASS} px-4 py-3 text-xs text-neutral-200`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={T_CARD_TITLE}>Recent Activity</div>
                <span className={T_CAPTION}>{recentActivities.length} item{recentActivities.length !== 1 ? "s" : ""}</span>
              </div>
              {recentActivities.length > 3 ? (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => setShowAllRecentActivities((prev) => !prev)}
                    className={BLUSH_SMALL}
                  >
                    {showAllRecentActivities ? "Show less" : `View all (${recentActivities.length})`}
                  </button>
                </div>
              ) : null}
              <div className="space-y-2">
                {visibleRecentActivities.map((item) => (
                  <div key={`${item.kind}:${item.id}`} className={`${STATUS_CARD} bg-violet-950/25 p-3`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          item.kind === "request"
                            ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-200"
                            : item.kind === "receiving"
                              ? "border-cyan-700/60 bg-cyan-900/30 text-cyan-200"
                              : "border-violet-700/60 bg-violet-900/30 text-violet-200"
                        }`}
                      >
                        {item.kind === "request" ? "Request" : item.kind === "receiving" ? "Receiving" : "Claim"}
                      </span>
                      <span className="font-mono">{item.label}</span>
                      {item.at ? <span className="text-[11px] text-neutral-400">({formatRelativeAge(item.at, relativeNowMs)})</span> : null}
                    </div>
                    {(() => {
                      const activityKey = `${item.kind}:${item.id}`;
                      const isExpanded = Boolean(expandedActionsByItem[activityKey]);
                      const actions: TimelineAction[] =
                        item.kind === "request" && item.requestId
                          ? [
                              {
                                label: "Continue to Receiving",
                                href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                              },
                              {
                                label: "Continue to Claim",
                                href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                              },
                            ]
                          : item.kind === "receiving" && item.requestId
                            ? [
                                {
                                  label: "Open Receiving",
                                  href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                                },
                                {
                                  label: "Continue to Claim",
                                  href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}&receiving_id=${encodeURIComponent(item.id)}`,
                                },
                              ]
                            : item.kind === "claim" && item.requestId
                              ? [
                                  {
                                    label: "Open Claim",
                                    href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                                  },
                                  ...(item.caseId && canOpenAdminCase
                                ? [
                                    {
                                      label: "Open Case",
                                      href: `/admin/procurement/cases/${item.caseId}`,
                                    } satisfies TimelineAction,
                                  ]
                                : []),
                            ]
                          : [];
                  const hasMoreActions = actions.length > 2;
                  const visibleActions = isExpanded ? actions : actions.slice(0, 2);
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {visibleActions.map((action) => (
                        <Link
                          key={`${action.label}:${action.href}`}
                          href={action.href}
                          className={BLUSH_SMALL}
                        >
                          {action.label}
                        </Link>
                      ))}
                      {hasMoreActions ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActionsByItem((prev) => ({
                              ...prev,
                              [activityKey]: !isExpanded,
                            }))
                          }
                          className={BLUSH_SMALL}
                        >
                          {isExpanded ? "Less" : `More (${actions.length - 2})`}
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : null}

          {/* Delivery Summary */}
          {storeCode && monthlySummary.length > 0 && (
            <div className={`${BLUSH_GLASS} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setDeliverySummaryOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/30">
                    <BarChart2 className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Delivery Amount Summary</p>
                    <p className="text-xs text-zinc-500">Monthly totals for approved &amp; received orders</p>
                  </div>
                </div>
                {deliverySummaryOpen
                  ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
              </button>
              <AnimatePresence initial={false}>
                {deliverySummaryOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/8 px-5 pb-4 pt-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-zinc-500 border-b border-white/8">
                            <th className="pb-2 text-left font-semibold">Month</th>
                            <th className="pb-2 text-right font-semibold">Orders</th>
                            <th className="pb-2 text-right font-semibold">Total ({currencyCode})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlySummary.map((row) => {
                            const SETTLED = new Set(["APPROVED", "RECEIVED", "CLAIMED", "CLOSED"]);
                            const monthRows = rows.filter(
                              (r) => String(r.request_date || "").slice(0, 7) === row.month && SETTLED.has(String(r.status || "").toUpperCase())
                            );
                            const isOpen = expandedSummaryMonth === row.month;
                            return (
                              <React.Fragment key={row.month}>
                                <tr
                                  className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/4 transition-colors"
                                  onClick={() => setExpandedSummaryMonth(isOpen ? null : row.month)}
                                >
                                  <td className="py-2 text-zinc-300 font-mono text-xs">
                                    <span className="inline-flex items-center gap-1">
                                      {isOpen
                                        ? <ChevronDown className="h-3 w-3 text-violet-400 shrink-0" />
                                        : <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />}
                                      {row.month}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right text-zinc-400 text-xs">{row.count}</td>
                                  <td className="py-2 text-right font-semibold text-violet-300 tabular-nums">
                                    {Number(row.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr>
                                    <td colSpan={3} className="pb-2 pt-0">
                                      <div className="flex flex-col gap-1 rounded-lg border border-white/8 bg-white/3 p-2">
                                        {monthRows.map((pr) => {
                                          const st = String(pr.status || "").toUpperCase();
                                          return (
                                            <div
                                              key={pr.id}
                                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-violet-950/30 transition-colors"
                                              onClick={(e) => { e.stopPropagation(); setSelectedRequestId(pr.id); }}
                                            >
                                              <div className="min-w-0 flex-1">
                                                <p className="font-mono text-[11px] font-semibold text-white truncate">{pr.request_no}</p>
                                                {pr.vendor_summary ? (
                                                  <p className="text-[10px] text-violet-300/80 truncate">{pr.vendor_summary}</p>
                                                ) : null}
                                              </div>
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                {st === "APPROVED" && <span className={BADGE_SUCCESS}>APPROVED</span>}
                                                {st === "RECEIVED" && <span className="rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-medium text-cyan-400">RECEIVED</span>}
                                                {st === "CLAIMED" && <span className="rounded-full bg-teal-500/15 border border-teal-500/25 px-2 py-0.5 text-[10px] font-medium text-teal-400">CLAIMED</span>}
                                                {st === "CLOSED" && <span className="rounded-full bg-zinc-700/50 border border-zinc-600/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">CLOSED</span>}
                                                <span className="text-[11px] font-semibold text-violet-300 tabular-nums">
                                                  {Number(pr.total_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <ChevronRight className="h-3 w-3 text-zinc-600" />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/15">
                            <td className="pt-2 text-xs text-zinc-500 font-semibold">Total</td>
                            <td className="pt-2 text-right text-xs text-zinc-400">{monthlySummary.reduce((s, r) => s + r.count, 0)}</td>
                            <td className="pt-2 text-right text-sm font-bold text-white tabular-nums">
                              {monthlySummary.reduce((s, r) => s + r.total, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                      <p className="mt-3 text-[11px] text-zinc-600">* Based on currently loaded requests (up to 200). Covers APPROVED, RECEIVED, CLAIMED &amp; CLOSED statuses.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Request list */}
          <div id="history" className={`${BLUSH_GLASS} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className={T_SECTION}>
                Requests
                <span className={`${T_CAPTION} ml-2 font-normal`}>
                  ({cityLabel} · {statusFilter ? `${displayedRows.length} ${STATUS_FILTER_LABEL[statusFilter] ?? statusFilter}` : `${counts.total} active`})
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {statusFilter && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(null)}
                    className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
                  >
                    <X className="h-3 w-3" />
                    Clear filter
                  </button>
                )}
                {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />}
              </div>
            </div>

            {displayedRows.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <ShoppingCart className="h-8 w-8 text-zinc-600" />
                <p className={T_CAPTION}>
                  {statusFilter ? `No ${STATUS_FILTER_LABEL[statusFilter] ?? statusFilter} requests.` : "No active requests."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedRows.map((row) => {
                  const s = String(row.status || "").toUpperCase();
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border px-4 py-3 transition-all duration-150 cursor-pointer hover:border-violet-500/40 hover:bg-violet-950/20 ${
                        row.id === lastCreatedRequestId
                          ? "border-emerald-700/60 bg-emerald-900/20"
                          : selectedRequestId === row.id
                            ? "border-violet-500/50 bg-violet-950/25"
                            : "border-white/8 bg-white/4"
                      }`}
                      onClick={() => setSelectedRequestId(row.id)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold leading-tight text-white flex items-center gap-2">
                            <span className="font-mono">{row.request_no}</span>
                            {row.id === lastCreatedRequestId && <span className={BADGE_SUCCESS}>New</span>}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-zinc-500">
                            <span>{row.store_code || "-"}</span>
                            <span>{row.request_date || "-"}</span>
                            <span className={`font-semibold ${isHighValue(row) ? "text-amber-400" : "text-zinc-400"}`}>
                              {Number(row.total_amount || 0).toFixed(2)} {currencyCode}
                            </span>
                          </div>
                          {/* Supplier(s) — helps tell apart same-store, same-day orders */}
                          {row.vendor_summary ? (
                            <p className="mt-1 flex items-center gap-1 text-xs text-violet-300/90">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="break-words">{row.vendor_summary}</span>
                            </p>
                          ) : null}
                          {/* Status badge row */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s === "DRAFT" && <span className={BADGE_WARNING}>DRAFT · Level {row.current_approval_level || 0}</span>}
                            {s === "APPROVED" && <span className={BADGE_SUCCESS}>APPROVED</span>}
                            {s === "RETURNED" && <span className={BADGE_ERROR}>RETURNED</span>}
                            {s === "REJECTED" && <span className={BADGE_ERROR}>REJECTED</span>}
                            {(s === "IN_REVIEW" || s === "SUBMITTED") && <span className={BADGE_INFO}>IN REVIEW</span>}
                            {s === "RECEIVED" && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2.5 py-0.5 text-xs font-medium text-cyan-400">RECEIVED</span>}
                            {isHighValue(row) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 border border-amber-500/40 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                                ⚠ High Value
                              </span>
                            )}
                          </div>
                          {/* Reject / return reason from Back Office */}
                          {(s === "RETURNED" || s === "REJECTED") && row.blocked_reason ? (
                            <p className="mt-1.5 rounded-lg border border-red-500/25 bg-red-500/8 px-2.5 py-1.5 text-xs text-red-300">
                              {s === "REJECTED" ? "Rejected" : "Returned"}: {row.blocked_reason}
                            </p>
                          ) : null}
                        </div>
                        {/* Status-driven action button */}
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          {getStatusActionButton(row)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>{/* end right panel */}
      </div>{/* end two-column */}
      </motion.div>

      {/* Request detail drawer */}
      <AnimatePresence>
        {selectedRequestId && (
          <RequestDetailDrawer
            key={selectedRequestId}
            requestId={selectedRequestId}
            city={city}
            requestedBy={requestedBy}
            pin={pin}
            currencyCode={currencyCode}
            onClose={() => setSelectedRequestId(null)}
            onSubmitSuccess={(requestNo) => {
              setSelectedRequestId(null);
              setSubmitSuccessMsg(`✓ ${requestNo} submitted — now IN REVIEW`);
              void loadMyRequests();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
