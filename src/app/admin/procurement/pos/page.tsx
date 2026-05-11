"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";

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

export default function ProcurementPoPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
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
      setRequestSummary(catalogData?.request || null);
      const suppliers = Array.isArray(catalogData?.suppliers) ? catalogData.suppliers : [];
      setCatalogSuppliers(suppliers);
      setSupplierDrafts((prev) => {
        const next = { ...prev };
        for (const supplier of suppliers) {
          next[supplier.supplier] = next[supplier.supplier] || {
            recipient_email: "",
            cc_raw: "",
            message: "",
            send_email: true,
          };
        }
        return next;
      });
      setItemDrafts((prev) => {
        const next = { ...prev };
        for (const supplier of suppliers) {
          for (const category of supplier.categories) {
            for (const item of category.items) {
              const key = itemKey(supplier.supplier, item);
              next[key] = next[key] || {
                enabled: false,
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
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [paymentTerms, pin, requestId, requestedBy]);

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
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Refresh Request + Catalog
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-100">Supplier-grouped PO Builder</div>
            <div className="mt-1 text-xs text-neutral-500">Imported Excel rows are used as the supplier/category/item catalog for this request.</div>
          </div>
          {requestSummary ? (
            <div className="text-xs text-neutral-400">
              {requestSummary.request_no} | {requestSummary.store_code} | {requestSummary.request_date} | {requestSummary.status}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
          <input value={vatTreatment} onChange={(e) => setVatTreatment(e.target.value)} placeholder="VAT treatment" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2" />
          <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Payment terms" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2" />
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-400">
          Selected suppliers: {selectedSuppliers.length} | Selected items: {selectedSuppliers.reduce((sum, supplier) => sum + supplier.selectedItems.length, 0)} | Total: PHP {money(overallTotal)}
        </div>

        <div className="mt-4 space-y-4">
          {catalogSuppliers.map((supplier) => {
            const supplierDraft = supplierDrafts[supplier.supplier] || { recipient_email: "", cc_raw: "", message: "", send_email: true };
            const selectedSupplier = selectedSuppliers.find((row) => row.supplier === supplier.supplier);
            return (
              <div key={supplier.supplier} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-neutral-100">{supplier.supplier}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {supplier.category_count} categories | {supplier.item_count} items | Suggested payment terms {supplier.payment_terms || "-"}
                    </div>
                  </div>
                  <div className="text-xs text-amber-200">Selected total: PHP {money(selectedSupplier?.total || 0)}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    value={supplierDraft.recipient_email}
                    onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, recipient_email: e.target.value } }))}
                    placeholder="Supplier email"
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  />
                  <input
                    value={supplierDraft.cc_raw}
                    onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, cc_raw: e.target.value } }))}
                    placeholder="CC emails (comma separated)"
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  />
                  <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      checked={supplierDraft.send_email}
                      onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, send_email: e.target.checked } }))}
                    />
                    Send email after PO creation
                  </label>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400">
                    This supplier will create {selectedSupplier?.selectedItems.length || 0} line items.
                  </div>
                  <textarea
                    value={supplierDraft.message}
                    onChange={(e) => setSupplierDrafts((prev) => ({ ...prev, [supplier.supplier]: { ...supplierDraft, message: e.target.value } }))}
                    placeholder="Optional supplier message"
                    className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {supplier.categories.map((category) => (
                    <div key={`${supplier.supplier}-${category.category}`} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">{category.category}</div>
                      <div className="mt-2 space-y-2">
                        {category.items.map((item) => {
                          const key = itemKey(supplier.supplier, item);
                          const draft = itemDrafts[key] || { enabled: false, qty: String(item.suggested_qty || ""), unit_price: String(item.suggested_unit_price || "") };
                          return (
                            <div key={key} className="grid grid-cols-1 gap-2 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 md:grid-cols-[minmax(0,1.5fr)_120px_120px_minmax(0,1fr)]">
                              <label className="inline-flex items-start gap-2 text-sm text-neutral-200">
                                <input
                                  type="checkbox"
                                  checked={draft.enabled}
                                  onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, enabled: e.target.checked } }))}
                                  className="mt-1"
                                />
                                <span>
                                  <span className="block">{item.item_name}</span>
                                  <span className="block text-xs text-neutral-500">
                                    {item.section || "-"} | {item.order_date || "-"} | {item.order_type || "-"} | {item.unit || "-"}
                                  </span>
                                </span>
                              </label>
                              <input
                                value={draft.qty}
                                onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, qty: e.target.value } }))}
                                placeholder="Qty"
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                              />
                              <input
                                value={draft.unit_price}
                                onChange={(e) => setItemDrafts((prev) => ({ ...prev, [key]: { ...draft, unit_price: e.target.value } }))}
                                placeholder="Unit price"
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                              />
                              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400">
                                Suggested: {item.suggested_qty || 0} x PHP {money(item.suggested_unit_price || 0)}
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
          })}
          {!catalogSuppliers.length ? <div className="text-sm text-neutral-500">No imported catalog rows found for this request yet.</div> : null}
        </div>

        <button
          type="button"
          onClick={() => void createAndSendBulk()}
          disabled={busy}
          className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60"
        >
          {busy ? "Processing..." : "Create Supplier POs and Send"}
        </button>

        {bulkResult ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3 text-sm">
            <div className="text-neutral-100">
              Created {bulkResult.created_count} | Sent {bulkResult.sent_count} | Failed {bulkResult.failed_count}
            </div>
            <div className="mt-2 space-y-2 text-xs text-neutral-400">
              {bulkResult.results.map((row, idx) => (
                <div key={`${row.vendor_name}-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-2">
                  {row.vendor_name || "Unknown supplier"} | {row.ok ? "OK" : "FAILED"} {row.po?.po_no ? `| ${row.po.po_no}` : ""} {row.error ? `| ${row.error}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium text-neutral-100">{row.po_no}</div>
            <div className="mt-1 text-xs text-neutral-400">
              {row.parent_case_no} | {row.vendor_name || "-"} | {money(row.amount)} PHP | {row.status}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Email {row.last_email_status || "PENDING"} | Recipient {row.last_recipient_email || "-"} | Receipt {row.receipt_confirmed_at ? String(row.receipt_confirmed_at).slice(0, 16).replace("T", " ") : "Pending"}
            </div>
            {row.drive_file_url ? (
              <a href={row.drive_file_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-300 underline">
                Open PO file in Drive
              </a>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                value={recipientById[row.id] || row.last_recipient_email || ""}
                onChange={(e) => setRecipientById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Supplier email"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <input
                value={ccById[row.id] || ""}
                onChange={(e) => setCcById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="CC emails (comma separated)"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void sendPoEmail(row.id)}
                disabled={busy}
                className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30 disabled:opacity-60"
              >
                {busy ? "Sending..." : "Send PO by Gmail"}
              </button>
              <textarea
                value={messageById[row.id] || ""}
                onChange={(e) => setMessageById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Optional supplier message"
                className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
              />
              <button
                type="button"
                onClick={() => void loadDeliveryStatus(row.id)}
                disabled={busy}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              >
                {busy ? "Loading..." : "View Delivery Status"}
              </button>
            </div>
            {deliveryById[row.id]?.email_logs?.length ? (
              <div className="mt-3 space-y-2">
                {deliveryById[row.id].email_logs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300">
                    <div>{log.recipient_email} | {log.status} | {log.sent_at ? String(log.sent_at).slice(0, 16).replace("T", " ") : "-"}</div>
                    <div className="mt-1 text-neutral-500">
                      Receipt {log.receipt_confirmed_at ? String(log.receipt_confirmed_at).slice(0, 16).replace("T", " ") : "Pending"}
                    </div>
                    {log.drive_file_url ? (
                      <a href={log.drive_file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sky-300 underline">
                        Open mailed PO
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No purchase orders.</div> : null}
      </div>
    </div>
  );
}
