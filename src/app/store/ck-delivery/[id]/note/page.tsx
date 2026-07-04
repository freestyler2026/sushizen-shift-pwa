"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";

type DeliveryItem = {
  id: number;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
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

export default function CKDeliveryNotePage({ params }: { params: { id: string } }) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) { setError("Not authenticated"); setLoading(false); return; }
    fetch(`/api/store/ck-delivery/deliveries/${params.id}`, {
      headers: getAuthHeaders(auth),
    })
      .then(r => r.json())
      .then((data: { delivery?: Delivery } & Delivery) => {
        setDelivery(data.delivery ?? data);
      })
      .catch(() => setError("Failed to load delivery"))
      .finally(() => setLoading(false));
  }, [params.id]);

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
  const grouped = groupBy(items, i => i.category || "Other");

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

      {/* Print button — hidden when printing */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      <div className="min-h-screen bg-white px-10 py-8 text-gray-900 max-w-2xl mx-auto font-sans">
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

        {/* Items — grouped by category */}
        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 pb-1 mb-1">
              {category}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-1 w-1/2">Item</th>
                  <th className="text-right py-1 w-1/6">Qty</th>
                  <th className="text-left py-1 pl-3 w-1/6">Source</th>
                  <th className="text-left py-1 pl-3 w-1/6">✓ Check</th>
                </tr>
              </thead>
              <tbody>
                {catItems.map(item => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="py-1.5">
                      <p className="font-medium text-gray-900">{item.item_name}</p>
                      {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-gray-800">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-1.5 pl-3">
                      {item.source === "auto" ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Order</span>
                      ) : (
                        <span className="rounded-full border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Manual</span>
                      )}
                    </td>
                    <td className="py-1.5 pl-3">
                      <div className="h-4 w-4 rounded border border-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

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
