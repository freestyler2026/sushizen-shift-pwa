"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
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
import { RefreshCw, AlertCircle, CheckCircle, Send, Package, ExternalLink } from "lucide-react";

type PoRow = {
  id: string;
  request_id: string;
  parent_case_no: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  status: string;
  drive_file_url: string;
  last_email_status: string;
  last_recipient_email: string;
  last_email_sent_at: string;
  receipt_confirmed_at: string;
  receipt_confirmed_by: string;
  created_at: string;
};

type PoEmailLogRow = {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  receipt_confirmed_at: string;
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

export default function ProcurementPoPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
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

  const currency = city === "dubai" ? "AED" : "PHP";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const trimmedRequestId = requestId.trim();
      const [poData, catalogData] = await Promise.all([
        procurementJson<{ rows: PoRow[] }>(
          `/api/admin/procurement/pos?request_id=${encodeURIComponent(trimmedRequestId)}`,
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
  }, [city, deliveryAddress, paymentTerms, pin, requestId, requestedBy]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedCity: "manila" | "dubai" =
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        resolvedCity,
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
            <select
              value={city}
              onChange={(e) => {
                const nextCity = e.target.value as "manila" | "dubai";
                setCity(nextCity);
                const can = canAccessProcurementAdmin(String(auth?.role || ""), nextCity);
                setAllowed(can);
                setCatalogSuppliers([]);
                setRows([]);
                setRequestSummary(null);
              }}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
            >
              <option value="manila">Manila (PHP)</option>
              <option value="dubai">Dubai (AED)</option>
            </select>
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
              <div className="text-sm font-medium text-white">{requestSummary.request_no}</div>
              <div className={T_CAPTION}>{requestSummary.store_code} | {requestSummary.request_date} | {requestSummary.status}</div>
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
            <select
              value={vatTreatment}
              onChange={(e) => setVatTreatment(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
            >
              <option value="">— Select —</option>
              {city === "dubai" ? (
                <>
                  <option value="VAT-inclusive">VAT-inclusive</option>
                  <option value="VAT-exclusive">VAT-exclusive</option>
                  <option value="VAT-exempt">VAT-exempt</option>
                  <option value="Zero-rated">Zero-rated</option>
                  <option value="Non-VAT">Non-VAT</option>
                </>
              ) : (
                <>
                  <option value="VAT-inclusive">VAT-inclusive</option>
                  <option value="VAT-exclusive">VAT-exclusive</option>
                  <option value="VAT-exempt">VAT-exempt</option>
                  <option value="Zero-rated">Zero-rated</option>
                  <option value="Non-VAT">Non-VAT</option>
                </>
              )}
            </select>
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
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
            >
              <option value="">— Select —</option>
              <option value="Prepaid">Prepaid</option>
              <option value="COD">COD (Cash on Delivery)</option>
              <option value="NET 7">NET 7</option>
              <option value="NET 15">NET 15</option>
              <option value="NET 30">NET 30</option>
              <option value="NET 45">NET 45</option>
              <option value="NET 60">NET 60</option>
              <option value="30 days credit">30 days credit</option>
              <option value="60 days credit">60 days credit</option>
            </select>
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
                              <div key={key} className="grid grid-cols-1 gap-2 rounded-xl border border-white/6 bg-white/4 p-3 sm:grid-cols-[minmax(0,1.5fr)_100px_110px_minmax(0,1fr)]">
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
                                <input
                                  value={draft.qty}
                                  onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, qty: e.target.value } }))}
                                  placeholder="Qty"
                                  className={INPUT_CLASS}
                                />
                                <input
                                  value={draft.unit_price}
                                  onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, unit_price: e.target.value } }))}
                                  placeholder="Unit price"
                                  className={INPUT_CLASS}
                                />
                                <div className="rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-xs text-zinc-400">
                                  Suggested: {item.suggested_qty || 0} &times; {currency} {money(item.suggested_unit_price || 0)}
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

      {/* PO list */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Purchase Orders</p>
          {rows.map((row) => (
            <div key={row.id} className={`${GLASS_CARD} p-4`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.po_no}</span>
                    {poStatusBadge(row.status)}
                    {emailStatusBadge(row.last_email_status)}
                  </div>
                  <div className={`mt-1 ${T_CAPTION}`}>
                    {row.parent_case_no} | {row.vendor_name || "-"} | {currency} {money(row.amount)}
                  </div>
                  <div className={T_CAPTION}>
                    Recipient: {row.last_recipient_email || "-"} | Receipt:{" "}
                    {row.receipt_confirmed_at ? String(row.receipt_confirmed_at).slice(0, 16).replace("T", " ") : "Pending"}
                  </div>
                </div>
                {row.drive_file_url && (
                  <a
                    href={row.drive_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open PO in Drive
                  </a>
                )}
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
                      <div className={`mt-1 ${T_CAPTION}`}>
                        Receipt: {log.receipt_confirmed_at ? String(log.receipt_confirmed_at).slice(0, 16).replace("T", " ") : "Pending"}
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
    </div>
  );
}
