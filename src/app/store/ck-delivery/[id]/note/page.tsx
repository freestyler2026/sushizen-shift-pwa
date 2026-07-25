"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";

type DeliveryItem = {
  id: number;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  notes: string;
  source: "auto" | "manual";
};

type Delivery = {
  id: number;
  delivery_date: string;
  to_branch: string;
  status: string;
  created_by: string;
  proc_request_no: string;
  notes: string;
  items?: DeliveryItem[];
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
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function canEditPrices(auth: ReturnType<typeof getAuth>) {
  if (!auth) return false;
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(auth.role || "");
}

export default function CKDeliveryNotePage() {
  const params = useParams();
  const id = params?.id as string;
  const auth = getAuth();

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPrices, setShowPrices] = useState(true);

  // Edit-price mode
  const [editMode, setEditMode] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadDelivery = useCallback(() => {
    if (!auth) { setError("Not authenticated"); setLoading(false); return; }
    fetch(`/api/store/ck-delivery/deliveries/${id}`, {
      headers: getAuthHeaders(auth),
    })
      .then(r => r.json())
      .then((data: { delivery?: Delivery } & Delivery) => {
        setDelivery(data.delivery ?? data);
      })
      .catch(() => setError("Failed to load delivery"))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDelivery(); }, [loadDelivery]);

  function enterEditMode() {
    const items = delivery?.items || [];
    const init: Record<number, string> = {};
    for (const it of items) init[it.id] = String(it.unit_price ?? 0);
    setDraftPrices(init);
    setSaveError("");
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setSaveError("");
  }

  async function saveprices() {
    if (!delivery || !auth) return;
    setSaving(true);
    setSaveError("");
    const items = delivery.items || [];
    const changed = items.filter(it => {
      const draft = parseFloat(draftPrices[it.id] ?? "") || 0;
      return Math.abs(draft - (it.unit_price ?? 0)) > 0.0001;
    });
    try {
      await Promise.all(changed.map(it =>
        fetch(`/api/store/ck-delivery/deliveries/${delivery.id}/items/${it.id}/price`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders(auth) },
          body: JSON.stringify({ unit_price: parseFloat(draftPrices[it.id] ?? "") || 0 }),
        }).then(async r => {
          if (!r.ok) throw new Error(await r.text());
        })
      ));
      setEditMode(false);
      setLoading(true);
      loadDelivery();
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
  if (error || !delivery) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-red-500">
        {error || "Delivery not found"}
      </div>
    );
  }

  const items = delivery.items || [];
  const autoCount = items.filter(i => i.source === "auto").length;
  const manualCount = items.filter(i => i.source === "manual").length;

  const displayItems = editMode
    ? items.map(it => ({ ...it, unit_price: parseFloat(draftPrices[it.id] ?? "") || 0 }))
    : items;
  const displayGrouped = groupBy(displayItems, i => i.category || "Other");

  const grandTotal = displayItems.reduce((sum, i) => sum + (i.qty || 0) * (i.unit_price || 0), 0);
  const hasPrices = displayItems.some(i => (i.unit_price || 0) > 0);

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

      {/* Toolbar — hidden when printing */}
      <div className="no-print fixed top-4 right-4 z-50 flex items-center gap-2 flex-wrap justify-end">
        {saveError && (
          <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{saveError}</span>
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
              onClick={saveprices}
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
                onClick={() => setShowPrices(v => !v)}
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
          <h1 className="text-xl font-bold tracking-tight">Sushi ZEN — CK Delivery Note</h1>
          <p className="text-sm text-gray-500 mt-0.5">Central Kitchen → {delivery.to_branch}</p>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 mb-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Delivery Date</p>
            <p className="font-semibold text-gray-900">{delivery.delivery_date}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">To Branch</p>
            <p className="font-semibold text-gray-900">{delivery.to_branch}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Delivery ID</p>
            <p className="font-semibold text-gray-900">#{delivery.id}</p>
          </div>
          {delivery.proc_request_no && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">From Order</p>
              <p className="font-semibold text-gray-900">{delivery.proc_request_no}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Prepared by</p>
            <p className="font-semibold text-gray-900">{delivery.created_by || "—"}</p>
          </div>
        </div>

        {/* Edit-mode notice */}
        {editMode && (
          <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 font-medium">
            Price edit mode — update unit prices below, then click &quot;Save Prices&quot;.
          </div>
        )}

        {/* Items — grouped by category */}
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
                  <th className="text-left py-1 pl-3" style={{ width: "9%" }}>Source</th>
                  {!editMode && <th className="text-left py-1 pl-3" style={{ width: "9%" }}>✓</th>}
                </tr>
              </thead>
              <tbody>
                {catItems.map(item => {
                  const lineTotal = (item.qty || 0) * (item.unit_price || 0);
                  const origItem = items.find(i => i.id === item.id);
                  return (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="py-1.5">
                        <p className="font-medium text-gray-900">{item.item_name}</p>
                        {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
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
                                onChange={e => setDraftPrices(p => ({ ...p, [origItem?.id ?? item.id]: e.target.value }))}
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
                        {item.source === "auto" ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Order</span>
                        ) : (
                          <span className="rounded-full border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Manual</span>
                        )}
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
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-6">Delivery Total (PHP)</span>
              <span className="text-base font-bold text-gray-900 tabular-nums">₱ {fmt(grandTotal)}</span>
            </div>
          </div>
        )}

        {/* Summary line */}
        <div className="mt-2 text-xs text-gray-400 border-t border-gray-200 pt-2">
          {items.length} item(s) total
          {autoCount > 0 && ` · ${autoCount} from order`}
          {manualCount > 0 && autoCount > 0 && ` · ${manualCount} added manually`}
          {delivery.notes && ` · Note: ${delivery.notes}`}
        </div>

        {/* Signature lines */}
        <div className="mt-12 grid grid-cols-2 gap-12">
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-400">Dispatched by (CK)</p>
              <p className="text-xs text-gray-300 mt-4">Date: _______________</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-400">Received by (Branch)</p>
              <p className="text-xs text-gray-300 mt-4">Date: _______________</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
