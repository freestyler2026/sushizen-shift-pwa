"use client";

import { useEffect, useState, useCallback } from "react";
import { GLASS_CARD } from "@/lib/ui-tokens";
import DriveInvoiceModal from "./DriveInvoiceModal";

export interface DriveInvoice {
  id: number;
  drive_file_id: string;
  drive_file_name: string;
  drive_web_url: string;
  store_name: string;
  city: string;
  uploaded_at: string;
  ocr_status: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  currency: string;
  line_items: LineItem[];
  confidence_notes: string[];
  review_status: string;
  reviewed_by: string;
  reviewed_at: string | null;
  notes: string;
}

export interface LineItem {
  description: string;
  qty: number | null;
  unit: string;
  unit_price: number | null;
  amount: number | null;
}

interface Props {
  city?: string;
  authHeaders: Record<string, string>;
}

function OcrStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "OCR pending",    cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    processing: { label: "Processing…",   cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    done:       { label: "OCR done",       cls: "bg-green-500/20 text-green-300 border-green-500/30" },
    skipped:    { label: "Manual entry",   cls: "bg-white/10 text-white/50 border-white/10" },
    error:      { label: "OCR error",      cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, cls: "bg-white/10 text-white/50 border-white/10" };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${s.cls}`}>
      {s.label}
    </span>
  );
}

function FileIcon({ name }: { name: string }) {
  const isPdf = (name || "").toLowerCase().endsWith(".pdf");
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0 ${
      isPdf ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"
    }`}>
      {isPdf ? "PDF" : "IMG"}
    </div>
  );
}

export default function DriveInvoiceInbox({ city = "dubai", authHeaders }: Props) {
  const [invoices, setInvoices] = useState<DriveInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriveInvoice | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/drive-invoices?city=${city}&review_status=pending_review&limit=50`,
        { headers: authHeaders }
      );
      if (!res.ok) return;
      const data = await res.json();
      setInvoices(data.rows ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [city, authHeaders]);

  useEffect(() => {
    fetchInvoices();
    const interval = setInterval(fetchInvoices, 60_000);
    return () => clearInterval(interval);
  }, [fetchInvoices]);

  const handleUpdated = (updated: DriveInvoice) => {
    setInvoices((prev) =>
      prev.filter((inv) =>
        updated.review_status === "pending_review" ? true : inv.id !== updated.id
      ).map((inv) => (inv.id === updated.id ? updated : inv))
    );
    if (updated.review_status !== "pending_review") {
      setSelected(null);
    }
  };

  if (loading) return null;
  if (invoices.length === 0) return null;

  const displayed = showAll ? invoices : invoices.slice(0, 6);
  const hasMore = invoices.length > 6 && !showAll;

  return (
    <>
      <div className={`${GLASS_CARD} rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📥</span>
            <div>
              <h3 className="font-semibold text-white text-sm">Invoice Inbox</h3>
              <p className="text-white/50 text-xs">
                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} pending review
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchInvoices}
              className="text-white/40 hover:text-white/70 transition-colors text-xs px-2 py-1 rounded hover:bg-white/5"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {displayed.map((inv) => (
            <button
              key={inv.id}
              onClick={() => setSelected(inv)}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 transition-all text-left"
            >
              <FileIcon name={inv.drive_file_name} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{inv.drive_file_name}</p>
                <p className="text-white/50 text-[11px] truncate">{inv.store_name}</p>
                {inv.vendor_name && (
                  <p className="text-white/70 text-[11px] truncate font-medium">{inv.vendor_name}</p>
                )}
                {inv.total_amount != null && (
                  <p className="text-amber-300 text-[11px] font-mono">
                    {inv.currency} {inv.total_amount.toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <OcrStatusBadge status={inv.ocr_status} />
                  <span className="text-white/30 text-[10px]">
                    {new Date(inv.uploaded_at).toLocaleDateString("en-AE", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-2 text-amber-400/70 hover:text-amber-400 text-xs w-full text-center py-1"
          >
            Show {invoices.length - 6} more →
          </button>
        )}
      </div>

      {selected && (
        <DriveInvoiceModal
          invoice={selected}
          authHeaders={authHeaders}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  );
}
