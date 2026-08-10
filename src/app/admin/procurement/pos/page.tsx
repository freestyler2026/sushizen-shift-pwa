"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Send, Package, ExternalLink, Phone, X } from "lucide-react";

const BRANCH_LABELS: Record<string, string> = {
  PAR: "Paranaque", PARANAQUE: "Paranaque",
  CUB: "Cubao", CUBAO: "Cubao",
  TAFT: "Taft", TAFT_AV: "Taft",
  CK: "Central Kitchen",
  BB: "Business Bay", JLT: "JLT", ARJ: "Arjan", AM: "Al Mina", AB: "Al Barsha",
};

type PoRow = {
  id: string;
  request_id: string;
  parent_case_no: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  status: string;
  store_code: string;
  drive_file_url: string;
  last_email_status: string;
  last_recipient_email: string;
  last_email_sent_at: string;
  receipt_confirmed_at: string;
  receipt_confirmed_by: string;
  supplier_confirmation_status?: string;
  supplier_confirmation_notes?: string;
  created_at: string;
};

type SupplierCallLog = {
  id: number;
  call_date: string;
  called_by: string;
  call_time: string;
  result: string;
  expected_delivery_date?: string;
  notes: string;
  created_at: string;
};

type PoEmailLogRow = {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  receipt_confirmed_at: string;
  opened_at: string;
  open_count: number;
  drive_file_url: string;
};

type DeliveryBundle = {
  po: PoRow;
  email_logs: PoEmailLogRow[];
  confirm_url?: string;
};

type RequestSummary = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  status: string;
  total_amount: number;
  city?: string;
  suggested_delivery_address?: string;
};

type CatalogItem = {
  source_row_id: string;
  item_name: string;
  category: string;
  section: string;
  unit: string;
  suggested_unit_price: number;
  suggested_qty: number;
  line_total: number;
  store: string;
  order_date: string;
  order_type: string;
  source_sheet: string;
};

type CatalogCategory = {
  category: string;
  items: CatalogItem[];
};

type SupplierCatalog = {
  supplier: string;
  payment_terms: string;
  email: string;
  cc_emails: string;
  category_count: number;
  item_count: number;
  categories: CatalogCategory[];
};

type ItemDraft = {
  enabled: boolean;
  qty: string;
  unit_price: string;
};

type SupplierDraft = {
  recipient_email: string;
  cc_raw: string;
  message: string;
  send_email: boolean;
};

type BulkResultRow = {
  ok: boolean;
  vendor_name: string;
  error?: string;
  confirm_url?: string;
  po?: PoRow;
};

type BulkResult = {
  ok: boolean;
  created_count: number;
  sent_count: number;
  failed_count: number;
  results: BulkResultRow[];
  rows: PoRow[];
};

function itemKey(supplierName: string, item: CatalogItem) {
  return [supplierName, item.source_row_id || item.item_name, item.category].join("::");
}

function money(value: number) {
  return Number(value || 0).toFixed(2);
}

function poStatusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "SENT" || s === "DELIVERED") return <span className={BADGE_SUCCESS}>{s}</span>;
  if (s === "FAILED") return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "CREATED") return <span className={BADGE_WARNING}>{s}</span>;
  return <span className={BADGE_INFO}>{status || "PENDING"}</span>;
}

function emailStatusBadge(status: string) {
  const s = String(status || "PENDING").toUpperCase();
  if (s === "SENT") return <span className={BADGE_SUCCESS}>{s}</span>;
  if (s === "FAILED") return <span className={BADGE_ERROR}>{s}</span>;
  return <span className={BADGE_INFO}>{s}</span>;
}

function supplierConfBadge(status?: string) {
  const s = (status || "").toLowerCase();
  if (s === "confirmed") return <span className="rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">✓ Confirmed</span>;
  if (s === "rescheduled") return <span className="rounded-full bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">↻ Rescheduled</span>;
  if (s === "no_answer") return <span className="rounded-full bg-red-900/40 border border-red-700/50 px-2 py-0.5 text-[10px] font-semibold text-red-300">✗ No Answer</span>;
  if (s === "pending") return <span className="rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Call Pending</span>;
  return null;
}

export default function ProcurementPoPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [vatTreatment, setVatTreatment] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [requestSummary, setRequestSummary] = useState<RequestSummary | null>(null);
  const [catalogSuppliers, setCatalogSuppliers] = useState<SupplierCatalog[]>([]);
  const [rows, setRows] = useState<PoRow[]>([]);
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, SupplierDraft>>({});
  const [recipientById, setRecipientById] = useState<Record<string, string>>({});
  const [ccById, setCcById] = useState<Record<string, string>>({});
  const [messageById, setMessageById] = useState<Record<string, string>>({});
  const [deliveryById, setDeliveryById] = useState<Record<string, DeliveryBundle>>({});
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  // Supplier confirmation state
  const [confirmModal, setConfirmModal] = useState<{ poId: string; poNo: string; vendorName: string } | null>(null);
  const [callLog, setCallLog] = useState<Record<string, SupplierCallLog[]>>({});
  const [confResult, setConfResult] = useState<"confirmed" | "rescheduled" | "no_answer">("confirmed");
  const [confCallTime, setConfCallTime] = useState("");
  const [confExpDate, setConfExpDate] = useState("");
  const [confNotes, setConfNotes] = useState("");
  const [confBusy, setConfBusy] = useState(false);
  const [confSuccess, setConfSuccess] = useState("");
  // PO list filters
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const supplierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currency = city === "dubai" ? "AED" : "PHP";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const trimmedRequestId = requestId.trim();
      const trimmedSupplier = supplierFilter.trim();
      const poQs = new URLSearchParams();
      if (trimmedRequestId) poQs.set("request_id", trimmedRequestId);
      if (trimmedSupplier) poQs.set("vendor_name", trimmedSupplier);
      const [poData, catalogData] = await Promise.all([
        procurementJson<{ rows: PoRow[] }>(
          `/api/admin/procurement/pos?${poQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        trimmedRequestId
          ? procurementJson<{ request?: RequestSummary; suppliers?: SupplierCatalog[] }>(
              `/api/admin/procurement/pos/item-catalog?request_id=${encodeURIComponent(trimmedRequestId)}`,
              { method: "GET" },
              requestedBy,
              pin,
            )
          : Promise.resolve({ request: undefined, suppliers: [] }),
      ]);
      setRows(Array.isArray(poData?.rows) ? poData.rows : []);
      // City mismatch guard — reject cross-city request IDs
      if (trimmedRequestId && catalogData?.request?.city) {
        const reqCity = String(catalogData.request.city).toLowerCase();
        if (reqCity !== city) {
          const reqLabel = reqCity === "dubai" ? "Dubai" : "Manila";
          const curLabel = city === "dubai" ? "Dubai" : "Manila";
          setError(`This request belongs to ${reqLabel}, but you are currently in ${curLabel} mode. Please switch the City selector above to ${reqLabel} and try again.`);
          setLoading(false);
          return;
        }
      }
      setRequestSummary(catalogData?.request || null);
      const suppliers = Array.isArray(catalogData?.suppliers) ? catalogData.suppliers : [];
      setCatalogSuppliers(suppliers);
      setSupplierDrafts((prev) => {
        const next = { ...prev };
        for (const supplier of suppliers) {
          if (!next[supplier.supplier]) {
            next[supplier.supplier] = {
              recipient_email: supplier.email || "",
              cc_raw: supplier.cc_emails || "",
              message: "",
              send_email: true,
            };
          } else if (!next[supplier.supplier].recipient_email && supplier.email) {
            // Already exists but email was blank — back-fill from master
            next[supplier.supplier] = {
              ...next[supplier.supplier],
              recipient_email: supplier.email,
              cc_raw: next[supplier.supplier].cc_raw || supplier.cc_emails || "",
            };
          }
        }
        return next;
      });
      // Auto-check all PR items and pre-fill qty/price from the request
      setItemDrafts(() => {
        const next: Record<string, { enabled: boolean; qty: string; unit_price: string }> = {};
        for (const supplier of suppliers) {
          for (const category of supplier.categories) {
            for (const item of category.items) {
              const key = itemKey(supplier.supplier, item);
              next[key] = {
                enabled: true,
                qty: String(item.suggested_qty || ""),
                unit_price: String(item.suggested_unit_price || ""),
              };
            }
          }
        }
        return next;
      });
      if (!paymentTerms.trim()) {
        const suggestedTerms = suppliers.map((row) => row.payment_terms).find((value) => String(value || "").trim());
        if (suggestedTerms) setPaymentTerms(String(suggestedTerms));
      }
      // Auto-populate delivery address from the request's branch if not yet filled
      if (!deliveryAddress.trim() && catalogData?.request?.suggested_delivery_address) {
        setDeliveryAddress(String(catalogData.request.suggested_delivery_address));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, deliveryAddress, paymentTerms, pin, requestId, requestedBy, supplierFilter]);

  // Debounce supplier filter changes → auto-reload
  useEffect(() => {
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    supplierDebounceRef.current = setTimeout(() => { void load(); }, 500);
    return () => { if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierFilter]);

  // Client-side date filter on top of server-filtered rows
  const filteredRows = useMemo(() => {
    if (!dateFrom && !dateTo) return rows;
    return rows.filter((row) => {
      const d = row.created_at ? row.created_at.slice(0, 10) : "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo]);

  const openConfirmModal = async (poId: string, poNo: string, vendorName: string) => {
    setConfirmModal({ poId, poNo, vendorName });
    setConfResult("confirmed");
    setConfCallTime("");
    setConfExpDate("");
    setConfNotes("");
    setConfSuccess("");
    if (!callLog[poId]) {
      try {
        const data = await procurementJson<{ ok: boolean; calls: SupplierCallLog[] }>(
          `/api/admin/supplier-confirmation/${encodeURIComponent(poId)}/calls`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        setCallLog((prev) => ({ ...prev, [poId]: data?.calls || [] }));
      } catch { setCallLog((prev) => ({ ...prev, [poId]: [] })); }
    }
  };

  const submitConfirmationCall = async () => {
    if (!confirmModal) return;
    setConfBusy(true);
    setConfSuccess("");
    try {
      await procurementJson(
        "/api/admin/supplier-confirmation/log",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            po_id: confirmModal.poId,
            called_by: requestedBy.trim(),
            result: confResult,
            call_time: confCallTime.trim(),
            expected_delivery_date: confExpDate || null,
            notes: confNotes.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setConfSuccess("Call logged.");
      setCallLog((prev) => ({ ...prev, [confirmModal.poId]: [] }));
      setRows((prev) => prev.map((r) => r.id === confirmModal.poId ? { ...r, supplier_confirmation_status: confResult } : r));
      setConfResult("confirmed");
      setConfCallTime("");
      setConfExpDate("");
      setConfNotes("");
    } catch (e: unknown) {
      setConfSuccess("Error: " + String((e as Error)?.message || e));
    } finally {
      setConfBusy(false);
    }
  };

  const loadDeliveryStatus = async (poId: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await procurementJson<DeliveryBundle & { ok: boolean }>(
        `/api/admin/procurement/pos/${encodeURIComponent(poId)}/delivery-status`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setDeliveryById((prev) => ({ ...prev, [poId]: { po: data.po, email_logs: data.email_logs || [], confirm_url: data.confirm_url } }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendPoEmail = async (poId: string) => {
    const recipientEmail = String(recipientById[poId] || "").trim();
    if (!recipientEmail) {
      setError("Recipient email is required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const data = await procurementJson<DeliveryBundle & { ok: boolean; confirm_url?: string }>(
        `/api/admin/procurement/pos/${encodeURIComponent(poId)}/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient_email: recipientEmail,
            cc_emails: String(ccById[poId] || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            message: String(messageById[poId] || ""),
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setDeliveryById((prev) => ({ ...prev, [poId]: { po: data.po, email_logs: data.email_logs || [], confirm_url: data.confirm_url } }));
      setSuccessMsg("PO email sent successfully.");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedSuppliers = useMemo(() => {
    return catalogSuppliers
      .map((supplier) => {
        const selectedItems = supplier.categories.flatMap((category) =>
          category.items.flatMap((item) => {
            const draft = itemDrafts[itemKey(supplier.supplier, item)];
            if (!draft?.enabled) return [];
            const qty = Number(draft.qty || 0);
            const unitPrice = Number(draft.unit_price || 0);
            if (!qty || qty <= 0) return [];
            const specParts = [item.section, item.source_sheet ? `Imported from ${item.source_sheet}` : "", item.order_type];
            return [
              {
                source_row_id: item.source_row_id,
                item_name: item.item_name,
                category: item.category,
                spec: specParts.filter(Boolean).join(" | "),
                qty,
                unit: item.unit,
                unit_price: unitPrice,
                line_total: qty * unitPrice,
              },
            ];
          }),
        );
        const supplierDraft = supplierDrafts[supplier.supplier] || {
          recipient_email: "",
          cc_raw: "",
          message: "",
          send_email: true,
        };
        return {
          supplier: supplier.supplier,
          payment_terms: supplier.payment_terms,
          draft: supplierDraft,
          selectedItems,
          total: selectedItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0),
        };
      })
      .filter((supplier) => supplier.selectedItems.length > 0);
  }, [catalogSuppliers, itemDrafts, supplierDrafts]);

  const overallTotal = useMemo(() => selectedSuppliers.reduce((sum, supplier) => sum + supplier.total, 0), [selectedSuppliers]);

  const createAndSendBulk = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    if (!selectedSuppliers.length) {
      setError("Select at least one item.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccessMsg("");
    setBulkResult(null);
    try {
      const data = await procurementJson<BulkResult>(
        "/api/admin/procurement/pos/bulk-create-send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            vat_treatment: vatTreatment,
            delivery_address: deliveryAddress,
            delivery_date: deliveryDate,
            payment_terms: paymentTerms,
            approver_name: requestedBy,
            pin,
            suppliers: selectedSuppliers.map((supplier) => ({
              vendor_name: supplier.supplier,
              recipient_email: supplier.draft.recipient_email,
              cc_emails: supplier.draft.cc_raw
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              message: supplier.draft.message,
              send_email: supplier.draft.send_email,
              items: supplier.selectedItems,
            })),
          }),
        },
        requestedBy,
        pin,
      );
      setBulkResult(data);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSuccessMsg(`Created ${data.created_count} PO(s), sent ${data.sent_count}.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Ref to prevent double auto-load when requestId arrives from URL
  const didAutoLoadRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const localAuth = auth ?? getAuth();
      const refreshed = await refreshAuthFromApi(localAuth);
      // Determine city: URL city param > request_no prefix (MAN-/DUB-) > user auth city
      const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlCity = (sp?.get("city") || "").toLowerCase();
      const urlRequestId = (sp?.get("request_id") || "").toUpperCase();
      let resolvedCity: "manila" | "dubai";
      if (urlCity === "dubai") resolvedCity = "dubai";
      else if (urlCity === "manila") resolvedCity = "manila";
      else if (urlRequestId.startsWith("MAN-")) resolvedCity = "manila";
      else if (urlRequestId.startsWith("DUB-")) resolvedCity = "dubai";
      else resolvedCity = String((refreshed || localAuth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(
        String((refreshed || localAuth)?.role || ""),
        resolvedCity,
      );
      setAllowed(can);
      setAuthChecked(true);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-load when requestId arrives from URL and auth is ready (first time only)
  useEffect(() => {
    if (!requestId || !allowed || didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, allowed]);

  if (!authChecked) return null;
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement PO management is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Purchase Orders</h2>
          <p className="mt-1 text-sm text-zinc-400">Create supplier POs from catalog rows and send by email.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <Package className="h-3 w-3" />{rows.length} POs
        </span>
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

      {/* Session bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <SelectDark
              value={city}
              onChange={(v) => {
                if (!v) return;
                const nextCity = v as "manila" | "dubai";
                if (nextCity === city) return;
                setCity(nextCity);
                const can = canAccessProcurementAdmin(String(auth?.role || ""), nextCity);
                setAllowed(can);
                setCatalogSuppliers([]);
                setRows([]);
                setRequestSummary(null);
              }}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
              options={[
                { value: "manila", label: "Manila (PHP)" },
                { value: "dubai", label: "Dubai (AED)" },
              ]}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID</label>
            <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Load Request"}
            </button>
          </div>
        </div>
      </div>

      {/* PO Builder */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={`${T_SECTION} mb-1`}>Supplier-Grouped PO Builder</p>
            <p className={T_CAPTION}>Imported Excel rows are used as the supplier/category/item catalog for this request.</p>
          </div>
          {requestSummary && (
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-2">
                <div className="text-sm font-medium text-white">{requestSummary.request_no}</div>
                {requestSummary.store_code && (
                  <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-300">
                    {BRANCH_LABELS[requestSummary.store_code.toUpperCase()] ?? requestSummary.store_code}
                  </span>
                )}
              </div>
              <div className={T_CAPTION}>{requestSummary.request_date} | {requestSummary.status}</div>
            </div>
          )}
        </div>

        {/* PO metadata fields */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Delivery Date</label>
            <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>VAT Treatment</label>
            <SelectDark
              value={vatTreatment}
              onChange={setVatTreatment}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
              options={[
                { value: "", label: "— Select —" },
                { value: "VAT-inclusive", label: "VAT-inclusive" },
                { value: "VAT-exclusive", label: "VAT-exclusive" },
                { value: "VAT-exempt", label: "VAT-exempt" },
                { value: "Zero-rated", label: "Zero-rated" },
                { value: "Non-VAT", label: "Non-VAT" },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={`${T_LABEL} mb-1.5 block`}>
              Delivery Address
              {requestSummary?.suggested_delivery_address && deliveryAddress !== requestSummary.suggested_delivery_address && (
                <button
                  type="button"
                  onClick={() => setDeliveryAddress(requestSummary.suggested_delivery_address!)}
                  className="ml-2 text-[10px] font-normal text-violet-400 underline hover:text-violet-300"
                >
                  Use branch address
                </button>
              )}
            </label>
            <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={`${T_LABEL} mb-1.5 block`}>Payment Terms</label>
            <SelectDark
              value={paymentTerms}
              onChange={setPaymentTerms}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
              options={[
                { value: "", label: "— Select —" },
                { value: "Prepaid", label: "Prepaid" },
                { value: "COD", label: "COD (Cash on Delivery)" },
                { value: "NET 7", label: "NET 7" },
                { value: "NET 15", label: "NET 15" },
                { value: "NET 30", label: "NET 30" },
                { value: "NET 45", label: "NET 45" },
                { value: "NET 60", label: "NET 60" },
                { value: "30 days credit", label: "30 days credit" },
                { value: "60 days credit", label: "60 days credit" },
              ]}
            />
          </div>
        </div>

        {/* Selection summary */}
        <div className="mt-4 rounded-xl border border-white/8 bg-white/4 px-4 py-2.5 text-xs text-zinc-400">
          Selected suppliers: <span className="font-medium text-white">{selectedSuppliers.length}</span> &nbsp;|&nbsp;
          Selected items: <span className="font-medium text-white">{selectedSuppliers.reduce((sum, s) => sum + s.selectedItems.length, 0)}</span> &nbsp;|&nbsp;
          Total: <span className="font-medium text-amber-300">{currency} {money(overallTotal)}</span>
        </div>

        {/* Supplier panels */}
        <div className="mt-4 space-y-4">
          {loading && !catalogSuppliers.length ? (
            <div className="flex items-center gap-3 py-8 text-zinc-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading catalog…</span>
            </div>
          ) : (
            catalogSuppliers.map((supplier) => {
              const supplierDraft = supplierDrafts[supplier.supplier] || { recipient_email: "", cc_raw: "", message: "", send_email: true };
              const selectedSupplier = selectedSuppliers.find((row) => row.supplier === supplier.supplier);
              return (
                <div key={supplier.supplier} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className={T_CARD_TITLE}>{supplier.supplier}</div>
                      <div className={T_CAPTION}>
                        {supplier.category_count} categories | {supplier.item_count} items | Payment terms: {supplier.payment_terms || "-"}
                      </div>
                    </div>
                    <div className="text-xs font-medium text-amber-300">
                      {currency} {money(selectedSupplier?.total || 0)} selected
                    </div>
                  </div>

                  {/* Supplier email fields */}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={`${T_LABEL} mb-1.5 block`}>Supplier Email</label>
                      <input
                        value={supplierDraft.recipient_email}
                        onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, recipient_email: e.target.value } }))}
                        placeholder="supplier@example.com"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={`${T_LABEL} mb-1.5 block`}>CC Emails</label>
                      <input
                        value={supplierDraft.cc_raw}
                        onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, cc_raw: e.target.value } }))}
                        placeholder="cc1@example.com, cc2@example.com"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={`${T_LABEL} mb-1.5 block`}>Message (optional)</label>
                      <textarea
                        value={supplierDraft.message}
                        onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, message: e.target.value } }))}
                        placeholder="Optional supplier message"
                        rows={3}
                        className={TEXTAREA_CLASS}
                      />
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={supplierDraft.send_email}
                        onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, send_email: e.target.checked } }))}
                        className="rounded"
                      />
                      Send email after PO creation
                    </label>
                    <div className={T_CAPTION}>
                      {selectedSupplier?.selectedItems.length || 0} item(s) selected for this supplier.
                    </div>
                  </div>

                  {/* Item catalog */}
                  <div className="mt-4 space-y-3">
                    {supplier.categories.map((category) => (
                      <div key={`${supplier.supplier}-${category.category}`} className="rounded-xl border border-white/6 bg-white/3 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{category.category}</div>
                        <div className="space-y-2">
                          {category.items.map((item) => {
                            const key = itemKey(supplier.supplier, item);
                            const draft = itemDrafts[key] || { enabled: false, qty: String(item.suggested_qty || ""), unit_price: String(item.suggested_unit_price || "") };
                            return (
                              <div key={key} className="grid grid-cols-1 gap-2 rounded-xl border border-white/6 bg-white/4 p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px]">
                                <label className="inline-flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                                  <input
                                    type="checkbox"
                                    checked={draft.enabled}
                                    onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, enabled: e.target.checked } }))}
                                    className="mt-0.5 rounded"
                                  />
                                  <span>
                                    <span className="block font-medium">{item.item_name}</span>
                                    <span className={`block ${T_CAPTION}`}>
                                      {item.section || "-"} | {item.order_date || "-"} | {item.order_type || "-"} | {item.unit || "-"}
                                    </span>
                                  </span>
                                </label>
                                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-sm text-zinc-300 tabular-nums">
                                  {item.suggested_qty || 0}
                                  <span className={`block text-[10px] ${T_CAPTION}`}>qty</span>
                                </div>
                                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-sm text-zinc-300 tabular-nums">
                                  {currency} {money(item.suggested_unit_price || 0)}
                                  <span className={`block text-[10px] ${T_CAPTION}`}>unit price</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {!loading && !catalogSuppliers.length && (
            <div className="flex items-center justify-center py-10">
              <p className={T_CAPTION}>No imported catalog rows found for this request yet.</p>
            </div>
          )}
        </div>

        {/* Bulk create button */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => void createAndSendBulk()}
            disabled={busy || !selectedSuppliers.length}
            className={`${PRIMARY_BUTTON} flex items-center gap-2`}
          >
            <Send className="h-4 w-4" />
            {busy ? "Processing…" : "Create Supplier POs and Send"}
          </button>
        </div>

        {/* Bulk result */}
        {bulkResult && (
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-zinc-300">Created: <span className="font-semibold text-white">{bulkResult.created_count}</span></span>
              <span className="text-zinc-300">Sent: <span className="font-semibold text-emerald-300">{bulkResult.sent_count}</span></span>
              {bulkResult.failed_count > 0 && (
                <span className="text-zinc-300">Failed: <span className="font-semibold text-red-300">{bulkResult.failed_count}</span></span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {bulkResult.results.map((row, idx) => (
                <div key={`${row.vendor_name}-${idx}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/6 bg-white/3 p-2.5 text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200">{row.vendor_name || "Unknown supplier"}</span>
                  {row.ok ? <span className={BADGE_SUCCESS}>OK</span> : <span className={BADGE_ERROR}>FAILED</span>}
                  {row.po?.po_no && <span className="font-mono text-zinc-300">{row.po.po_no}</span>}
                  {row.error && <span className="text-red-400">{row.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PO search filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>Search / Filter POs</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Supplier Name</label>
            <input
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              placeholder="Type to search…"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Created From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Created To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        {(supplierFilter || dateFrom || dateTo) && (
          <div className="mt-2 flex items-center justify-between">
            <p className={T_CAPTION}>
              {filteredRows.length} of {rows.length} PO{rows.length !== 1 ? "s" : ""} shown
            </p>
            <button
              type="button"
              onClick={() => { setSupplierFilter(""); setDateFrom(""); setDateTo(""); }}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {/* PO list */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Purchase Orders</p>
          {filteredRows.map((row) => (
            <div key={row.id} className={`${GLASS_CARD} p-4`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.po_no}</span>
                    {poStatusBadge(row.status)}
                    {emailStatusBadge(row.last_email_status)}
                    {city === "manila" && row.supplier_confirmation_status !== "not_required" && supplierConfBadge(row.supplier_confirmation_status)}
                    {row.store_code && (
                      <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-300">
                        {BRANCH_LABELS[row.store_code.toUpperCase()] ?? row.store_code}
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 ${T_CAPTION}`}>
                    {row.parent_case_no} | {row.vendor_name || "-"} | {currency} {money(row.amount)}
                  </div>
                  <div className={T_CAPTION}>
                    Recipient: {row.last_recipient_email || "-"} | Receipt:{" "}
                    {row.receipt_confirmed_at ? String(row.receipt_confirmed_at).slice(0, 16).replace("T", " ") : "Pending"}
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {city === "manila" && row.supplier_confirmation_status !== "not_required" && (
                    <button
                      type="button"
                      onClick={() => void openConfirmModal(row.id, row.po_no, row.vendor_name)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-700/50 bg-violet-900/25 px-2.5 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-900/40 hover:text-violet-100 transition-colors"
                    >
                      <Phone className="h-3 w-3" />
                      Log Call
                    </button>
                  )}
                  {row.drive_file_url && (
                    <a
                      href={row.drive_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open PO in Drive
                    </a>
                  )}
                </div>
              </div>

              {/* Per-PO email controls */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Supplier Email</label>
                  <input
                    value={recipientById[row.id] || row.last_recipient_email || ""}
                    onChange={(e) => setRecipientById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="supplier@example.com"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>CC Emails</label>
                  <input
                    value={ccById[row.id] || ""}
                    onChange={(e) => setCcById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="cc1@example.com, cc2@example.com"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void sendPoEmail(row.id)}
                    disabled={busy}
                    className={`${SECONDARY_BUTTON} flex-1 flex items-center justify-center gap-2`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {busy ? "Sending…" : "Send by Gmail"}
                  </button>
                </div>
                <div className="sm:col-span-2">
                  <label className={`${T_LABEL} mb-1.5 block`}>Message (optional)</label>
                  <textarea
                    value={messageById[row.id] || ""}
                    onChange={(e) => setMessageById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Optional supplier message"
                    rows={3}
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void loadDeliveryStatus(row.id)}
                    disabled={busy}
                    className={`${SMALL_BUTTON} w-full flex items-center justify-center gap-2`}
                  >
                    <Package className="h-3.5 w-3.5" />
                    {busy ? "Loading…" : "View Delivery Status"}
                  </button>
                </div>
              </div>

              {/* Delivery / email logs */}
              {deliveryById[row.id]?.email_logs?.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Email Log</p>
                  {deliveryById[row.id].email_logs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-white/6 bg-white/3 p-3 text-xs text-zinc-300">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{log.recipient_email}</span>
                        {emailStatusBadge(log.status)}
                        <span className={T_CAPTION}>{log.sent_at ? String(log.sent_at).slice(0, 16).replace("T", " ") : "-"}</span>
                      </div>
                      <div className={`mt-1 flex flex-wrap gap-3 ${T_CAPTION}`}>
                        <span>
                          📬 {log.opened_at
                            ? `Opened ${String(log.opened_at).slice(0, 16).replace("T", " ")}${log.open_count > 1 ? ` (×${log.open_count})` : ""}`
                            : "Not opened yet"}
                        </span>
                        <span>
                          ✅ {log.receipt_confirmed_at
                            ? `Confirmed ${String(log.receipt_confirmed_at).slice(0, 16).replace("T", " ")}`
                            : "Receipt pending"}
                        </span>
                      </div>
                      {log.drive_file_url && (
                        <a
                          href={log.drive_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open mailed PO
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
          <p className={T_CAPTION}>No purchase orders. Enter a Request ID and load to see or create POs.</p>
        </div>
      )}

      {/* Supplier Confirmation Call Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Phone className="h-4 w-4 text-violet-400" />
                  Log Supplier Confirmation Call
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{confirmModal.poNo} — {confirmModal.vendorName}</p>
              </div>
              <button type="button" onClick={() => setConfirmModal(null)} className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-white/8">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Result */}
              <div>
                <label className={`${T_LABEL} mb-2 block`}>Call Result</label>
                <div className="flex gap-2">
                  {(["confirmed", "rescheduled", "no_answer"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setConfResult(r)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                        confResult === r
                          ? r === "confirmed"
                            ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                            : r === "rescheduled"
                              ? "border-amber-600 bg-amber-900/40 text-amber-300"
                              : "border-red-600 bg-red-900/40 text-red-300"
                          : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
                      }`}
                    >
                      {r === "confirmed" ? "✓ Confirmed" : r === "rescheduled" ? "↻ Rescheduled" : "✗ No Answer"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Call time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Call Time (optional)</label>
                  <input
                    type="time"
                    value={confCallTime}
                    onChange={(e) => setConfCallTime(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Expected Delivery</label>
                  <input
                    type="date"
                    value={confExpDate}
                    onChange={(e) => setConfExpDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Notes</label>
                <textarea
                  value={confNotes}
                  onChange={(e) => setConfNotes(e.target.value)}
                  placeholder="Contact person, agreed delivery window, etc."
                  rows={2}
                  className={TEXTAREA_CLASS}
                />
              </div>
              {confSuccess && (
                <div className={`rounded-xl border px-4 py-2 text-sm ${confSuccess.startsWith("Error") ? "border-red-700/50 bg-red-900/20 text-red-300" : "border-emerald-700/50 bg-emerald-900/20 text-emerald-300"}`}>
                  {confSuccess}
                </div>
              )}
              {/* Previous calls */}
              {(callLog[confirmModal.poId] || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2">Previous Calls</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {(callLog[confirmModal.poId] || []).map((c) => (
                      <div key={c.id} className="rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                        <span className="font-semibold">{c.result}</span>
                        <span className="text-zinc-500"> · {c.call_date} {c.call_time && `${c.call_time} · `}by {c.called_by}</span>
                        {c.notes && <p className="text-zinc-500 mt-0.5">{c.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-white/8 px-5 py-4">
              <button
                type="button"
                onClick={() => void submitConfirmationCall()}
                disabled={confBusy}
                className="flex-1 rounded-xl border border-violet-600/50 bg-violet-700/30 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-700/50 transition-colors disabled:opacity-50"
              >
                {confBusy ? "Saving…" : "Save Call"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-white/10 bg-white/3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/6 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
