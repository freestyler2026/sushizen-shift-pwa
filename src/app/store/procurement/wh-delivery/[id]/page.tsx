"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";

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
  currency: string;
  requested_by: string;
  notes: string;
  items: RequestItem[];
};

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function canEditPrices(auth: ReturnType<typeof getAuth>) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return (
    ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(auth.role || "") ||
    perms.includes("procurement.request.write")
  );
}

export default function WHDeliveryNotePage() {
  const params = useParams();
  const id = params?.id as string;
  const auth = getAuth();

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPrices, setShowPrices] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadDetail = useCallback(() => {
    if (!auth) { setError("Not authenticated"); setLoading(false); return; }
    fetch(`/api/admin/procurement/requests/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(auth),
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(txt || `Error ${r.status}`);
        }
        return r.json();
      })
      .then((data: { ok?: boolean; request?: RequestDetail }) => {
        setDetail(data.request ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load delivery note"))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDetail(); }, [loadDetail]);

  function enterEditMode() {
    const items = detail?.items || [];
    const init: Record<string, string> = {};
    for (const it of items) init[it.id] = String(it.unit_price ?? 0);
    setDraftPrices(init);
    setSaveError("");
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setSaveError("");
  }

  async function savePrices() {
    if (!detail || !auth) return;
    setSaving(true);
    setSaveError("");
    const items = detail.items || [];
    const changed = items.filter((it) => {
      const draft = parseFloat(draftPrices[it.id] ?? "") || 0;
      return Math.abs(draft - (it.unit_price ?? 0)) > 0.0001;
    });
    try {
      await Promise.all(
        changed.map((it) =>
          fetch(
            `/api/admin/procurement/requests/${encodeURIComponent(detail.id)}/items/${encodeURIComponent(it.id)}/price`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...getAuthHeaders(auth) },
              body: JSON.stringify({ unit_price: parseFloat(draftPrices[it.id] ?? "") || 0 }),
            },
          ).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
          }),
        ),
      );
      setEditMode(false);
      setLoading(true);
      loadDetail();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="animate-spin h-8 w-8 text-gray-400" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-red-500 text-sm px-8">
        {error || "Delivery note not found"}
      </div>
    );
  }

  const items = detail.items || [];
  const displayItems = editMode
    ? items.map((it) => ({ ...it, unit_price: parseFloat(draftPrices[it.id] ?? "") || 0 }))
    : items;
  const displayGrouped = groupBy(displayItems, (i) => i.category || "Other");
  const grandTotal = displayItems.reduce((sum, i) => sum + (i.qty || 0) * (i.unit_price || 0), 0);
  const hasPrices = displayItems.some((i) => (i.unit_price || 0) > 0);
  const currencySymbol = detail.currency === "AED" ? "AED" : "₱";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; }
          @page { margin: 15mm; }
        }
        body { background: white; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-4 right-4 z-50 flex items-center gap-2 flex-wrap justify-end">
        {saveError && (
          <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {saveError}
          </span>
        )}

        {editMode ? (
          <>
            <button
              onClick={cancelEditMode}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow hover:bg-gray-50 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              onClick={() => void savePrices()}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Prices
            </button>
          </>
        ) : (
          <>
            {canEditPrices(auth) && (
              <button
                onClick={enterEditMode}
                className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow hover:bg-blue-100"
              >
                <Pencil className="h-4 w-4" /> Edit Prices
              </button>
            )}
            {hasPrices && (
              <button
                onClick={() => setShowPrices((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow hover:bg-gray-50"
              >
                {showPrices ? "Hide Prices" : "Show Prices"}
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </>
        )}
      </div>

      <div className="min-h-screen bg-white px-10 py-8 text-gray-900 max-w-3xl mx-auto font-sans">
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-3 mb-5">
          <h1 className="text-xl font-bold tracking-tight">Sushi ZEN — WH Delivery Note</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {detail.request_no} · {detail.store_code}
          </p>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 mb-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Request Date</p>
            <p className="font-semibold text-gray-900">{detail.request_date}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Store</p>
            <p className="font-semibold text-gray-900">{detail.store_code}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</p>
            <p className="font-semibold text-gray-900">{detail.status}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">DN No.</p>
            <p className="font-semibold text-gray-900 font-mono">PR-DN-{detail.request_no}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Requested By</p>
            <p className="font-semibold text-gray-900">{detail.requested_by || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Currency</p>
            <p className="font-semibold text-gray-900">{detail.currency || "PHP"}</p>
          </div>
        </div>

        {/* Edit-mode notice */}
        {editMode && (
          <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 font-medium">
            Price edit mode — update unit prices below, then click &quot;Save Prices&quot;.
          </div>
        )}

        {/* Items grouped by category */}
        {Object.entries(displayGrouped).map(([category, catItems]) => (
          <div key={category} className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 pb-1 mb-1">
              {category}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-1" style={{ width: "38%" }}>Item</th>
                  <th className="text-right py-1" style={{ width: "12%" }}>Qty</th>
                  {(showPrices || editMode) && hasPrices && (
                    <>
                      <th className="text-right py-1 pl-3" style={{ width: "18%" }}>Unit Price</th>
                      <th className="text-right py-1 pl-3" style={{ width: "14%" }}>Line Total</th>
                    </>
                  )}
                  <th className="text-left py-1 pl-3" style={{ width: "10%" }}>Supplier</th>
                  {!editMode && <th className="text-left py-1 pl-3" style={{ width: "8%" }}>✓</th>}
                </tr>
              </thead>
              <tbody>
                {catItems.map((item) => {
                  const lineTotal = (item.qty || 0) * (item.unit_price || 0);
                  const origItem = items.find((i) => i.id === item.id);
                  return (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="py-1.5">
                        <p className="font-medium text-gray-900">{item.item_name}</p>
                        {item.spec && <p className="text-xs text-gray-400">{item.spec}</p>}
                      </td>
                      <td className="py-1.5 text-right font-mono text-gray-800 tabular-nums">
                        {item.qty} {item.unit}
                      </td>
                      {(showPrices || editMode) && hasPrices && (
                        <>
                          <td className="py-1.5 pl-3 text-right font-mono text-gray-700 tabular-nums">
                            {editMode ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draftPrices[origItem?.id ?? item.id] ?? "0"}
                                onChange={(e) =>
                                  setDraftPrices((p) => ({
                                    ...p,
                                    [origItem?.id ?? item.id]: e.target.value,
                                  }))
                                }
                                className="w-24 rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            ) : (
                              (item.unit_price || 0) > 0 ? fmt(item.unit_price) : "—"
                            )}
                          </td>
                          <td className="py-1.5 pl-3 text-right font-mono text-gray-800 tabular-nums">
                            {lineTotal > 0 ? fmt(lineTotal) : "—"}
                          </td>
                        </>
                      )}
                      <td className="py-1.5 pl-3">
                        <span className="text-xs text-gray-500 truncate block max-w-[80px]" title={item.vendor_name}>
                          {item.vendor_name || "—"}
                        </span>
                      </td>
                      {!editMode && (
                        <td className="py-1.5 pl-3">
                          <div className="h-4 w-4 rounded border border-gray-400" />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Grand total */}
        {(showPrices || editMode) && hasPrices && grandTotal > 0 && (
          <div className="mt-3 flex justify-end border-t-2 border-gray-900 pt-2">
            <div className="text-right">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-6">
                Total ({detail.currency || "PHP"})
              </span>
              <span className="text-base font-bold text-gray-900 tabular-nums">
                {currencySymbol} {fmt(grandTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="mt-2 text-xs text-gray-400 border-t border-gray-200 pt-2">
          {items.length} item(s) total
          {detail.notes && ` · Note: ${detail.notes}`}
        </div>

        {/* Signature lines */}
        <div className="mt-12 grid grid-cols-2 gap-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-8">Prepared By</p>
            <div className="border-b border-gray-400 mb-1" />
            <p className="text-xs text-gray-400">Name &amp; Signature</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-8">Received By</p>
            <div className="border-b border-gray-400 mb-1" />
            <p className="text-xs text-gray-400">Name &amp; Signature</p>
          </div>
        </div>

        <div className="mt-8 flex justify-between text-xs text-gray-400 border-t border-gray-200 pt-3">
          <span>Sushi ZEN Workforce OS</span>
          <span className="font-mono">{detail.request_no}</span>
        </div>
      </div>
    </>
  );
}
