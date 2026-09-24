"use client";

import { useState, useEffect, useRef } from "react";
import type { DriveInvoice, LineItem } from "./DriveInvoiceInbox";
import PhotoLoupe from "./PhotoLoupe";
import { money } from "@/lib/currency";

interface Props {
  invoice: DriveInvoice;
  authHeaders: Record<string, string>;
  onClose: () => void;
  onUpdated: (inv: DriveInvoice) => void;
}

interface POCandidate {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number | null;
  delivery_date: string | null;
  status: string;
  score?: number;
  /** The day the PO was raised — the newest are listed first, so this is how
   *  you see how far back the list reaches. */
  created_on?: string | null;
  city?: string;
  /** How many POs match, against however many are being shown. */
  total_matches?: number;
}

function ConfidenceWarnings({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-2 space-y-1">
      {notes.map((n, i) => (
        <p key={i} className="text-yellow-300 text-xs flex items-start gap-1">
          <span>⚠</span>
          <span>{n}</span>
        </p>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-white/50 text-[11px] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50 ${
          readOnly ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

type VendorOption = {
  name: string;
  invoice_count: number;
  last_invoice_date: string | null;
  is_internal: boolean;
  trn: string | null;
};

type ItemOption = {
  description: string;
  unit: string;
  last_unit_price: number | null;
  last_seen: string | null;
  times_seen: number;
};

/** Case- and space-insensitive, which is exactly as far as the folding on the
 *  server goes. Anything looser would claim two products are the same. */
function foldKey(v: string): string {
  return (v || "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** The vendor field, with the list of vendors this city actually buys from.
 *
 *  Still a text input: a genuinely new supplier has to be enterable, and the
 *  first invoice from one arrives before anybody adds it to a master. What
 *  changed is that the 61 known spellings are one tap away, and a name that
 *  matches none of them now says so instead of quietly becoming the 62nd. */
function VendorPicker({
  value,
  onChange,
  options,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: VendorOption[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const typed = query ?? value;
  // The whole list until they type. Seeding the filter with the name already in
  // the field narrowed it to that one vendor, so opening the picker showed the
  // reviewer only the answer they already had.
  const needle = query === null ? "" : foldKey(query);
  const shown = needle
    ? options.filter((o) => foldKey(o.name).includes(needle))
    : options;
  const known = options.some((o) => foldKey(o.name) === foldKey(value));

  return (
    <div ref={box} className="relative">
      <label className="block text-white/50 text-[11px] mb-1">
        Vendor Name
        {!loading && value.trim() !== "" && !known && (
          <span className="ml-2 text-amber-300">not a vendor we have invoiced before</span>
        )}
      </label>
      <input
        value={typed}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        placeholder={loading ? "Loading vendors…" : "Type, or pick from the list"}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-[#151528] shadow-xl">
          {shown.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-white/40 italic">
              {loading ? "Loading…" : "No vendor matches — what you typed will be saved as-is."}
            </p>
          )}
          {shown.map((o) => (
            <button
              key={o.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o.name); setQuery(null); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10 ${
                foldKey(o.name) === foldKey(value) ? "bg-amber-500/10" : ""
              }`}
            >
              <span className="flex-1 truncate text-[12px] text-white">{o.name}</span>
              {o.is_internal && (
                <span className="shrink-0 rounded border border-sky-400/30 bg-sky-500/15 px-1 text-[9px] text-sky-300">
                  ours
                </span>
              )}
              <span className="shrink-0 font-mono text-[10px] text-white/35 tabular-nums">
                {o.invoice_count > 0 ? `${o.invoice_count} inv` : "new"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The list of what this vendor has invoiced before.
 *
 *  It stays open after a pick. An invoice has a dozen lines, and a picker that
 *  closes on every one turns that into a dozen open/close cycles — which is
 *  how a picker ends up unused and everyone goes back to typing. */
function ItemPicker({
  items,
  loading,
  error,
  vendor,
  currency,
  replacing,
  onPick,
  onClose,
}: {
  items: ItemOption[];
  loading: boolean;
  error: string;
  vendor: string;
  currency: string;
  replacing: number | null;
  onPick: (item: ItemOption) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = foldKey(query);
  const shown = needle ? items.filter((it) => foldKey(it.description).includes(needle)) : items;

  return (
    <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={vendor ? `Search ${vendor}'s items…` : "Pick a vendor first"}
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50"
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[11px] text-white/45 hover:text-white/80"
        >
          Done
        </button>
      </div>
      {replacing !== null && (
        <p className="mb-1.5 px-1 text-[10px] text-amber-300/80">
          Picking will replace line {replacing + 1}.
        </p>
      )}
      {!vendor.trim() && (
        <p className="px-1 py-2 text-[11px] italic text-white/40">
          Set the vendor above and this fills with what they have invoiced before.
        </p>
      )}
      {vendor.trim() && loading && (
        <p className="px-1 py-2 text-[11px] italic text-white/40">Loading…</p>
      )}
      {vendor.trim() && !loading && error && (
        <p className="px-1 py-2 text-[11px] text-red-300">{error}</p>
      )}
      {vendor.trim() && !loading && !error && items.length === 0 && (
        <p className="px-1 py-2 text-[11px] italic text-white/40">
          No past lines for this vendor — their first invoice has to be typed.
        </p>
      )}
      {shown.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {shown.map((it) => (
            <button
              key={it.description}
              type="button"
              onClick={() => onPick(it)}
              className="flex w-full items-start gap-2 border-b border-white/5 px-2 py-1.5 text-left last:border-b-0 hover:bg-white/10"
            >
              <span className="flex-1 text-[11px] leading-snug text-white">{it.description}</span>
              <span className="shrink-0 text-right text-[10px] leading-snug text-white/40">
                <span className="block font-mono">{it.unit || "—"}</span>
                {/* The last price is shown, never filled in: across these
                    invoices the same item has been read at 2.00 and at 130.00,
                    so this is a memory jog, not a number to trust. */}
                {it.last_unit_price != null && (
                  <span className="block font-mono tabular-nums">
                    last {currency} {it.last_unit_price}
                  </span>
                )}
              </span>
              <span className="shrink-0 w-10 text-right font-mono text-[10px] tabular-nums text-white/25">
                {it.times_seen}x
              </span>
            </button>
          ))}
        </div>
      )}
      {vendor.trim() && !loading && items.length > 0 && shown.length === 0 && (
        <p className="px-1 py-2 text-[11px] italic text-white/40">
          Nothing matches “{query}” — add it as a row and type it.
        </p>
      )}
    </div>
  );
}

export default function DriveInvoiceModal({ invoice, authHeaders, onClose, onUpdated }: Props) {
  const [vendorName, setVendorName] = useState(invoice.vendor_name || "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number || "");
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date || "");
  const [dueDate, setDueDate] = useState(invoice.due_date || "");
  const [totalAmount, setTotalAmount] = useState(
    invoice.total_amount != null ? String(invoice.total_amount) : ""
  );
  const [amountExclTax, setAmountExclTax] = useState(
    invoice.amount_excl_tax != null ? String(invoice.amount_excl_tax) : ""
  );
  const [taxAmount, setTaxAmount] = useState(
    invoice.tax_amount != null ? String(invoice.tax_amount) : ""
  );
  const [taxRatePct, setTaxRatePct] = useState(
    invoice.tax_rate_pct != null ? String(invoice.tax_rate_pct) : ""
  );
  const [currency, setCurrency] = useState(invoice.currency || "AED");
  // The branch, and the branches it can be.
  //
  // This was read-only, on the reasoning that it comes from the capture folder
  // rather than the OCR. But the capture folder is the Discord channel the
  // photo was posted in, and that is wrong whenever somebody photographs one
  // branch's invoice into another branch's channel — Dubai reported a Chef
  // Middle East invoice for JLT sitting under Arjan with no way to say so.
  const [storeName, setStoreName] = useState(invoice.store_name || "");
  const [storeOptions, setStoreOptions] = useState<string[]>([]);
  const [notes, setNotes] = useState(invoice.notes || "");
  const [lineItems, setLineItems] = useState<LineItem[]>(invoice.line_items || []);
  /** The vendor list and this vendor's past lines. The reviewer was retyping
      both from the photo, which is where 108 spellings of 66 Dubai companies
      came from. */
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  /** null = the pick appends a row; a number = it replaces that row. */
  const [replacingLine, setReplacingLine] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState(false);

  // PO match state
  const [matchedPoId, setMatchedPoId] = useState(invoice.matched_po_id);
  // Open when nothing downstream will read them. A linked PO means Receiving
  // checks these line by line; without one this screen is the only place they
  // are ever seen, so it must not hide them.
  const [showLines, setShowLines] = useState(!invoice.matched_po_id);
  const [matchedPoNo, setMatchedPoNo] = useState(invoice.matched_po_no);
  const [matchedPoVendor, setMatchedPoVendor] = useState(invoice.matched_po_vendor);
  const [matchedPoAmount, setMatchedPoAmount] = useState(invoice.matched_po_amount);
  const [matchConfidence, setMatchConfidence] = useState(invoice.match_confidence);
  const [matchMethod, setMatchMethod] = useState(invoice.match_method || "");
  const [showPoSearch, setShowPoSearch] = useState(false);
  const [poQuery, setPoQuery] = useState("");
  // Set when the typed vendor found nothing and the list below is the
  // city's newest POs instead of an answer to what was typed.
  const [poFellBack, setPoFellBack] = useState("");
  const [poCandidates, setPoCandidates] = useState<POCandidate[]>([]);
  const [poSearching, setPoSearching] = useState(false);
  const [poSaving, setPoSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPdf = (invoice.drive_file_name || "").toLowerCase().endsWith(".pdf");
  const driveFileId = invoice.drive_file_id;
  const previewUrl = `https://drive.google.com/file/d/${driveFileId}/preview`;
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  // Reading the invoice while correcting the fields.
  //
  // The server already sends this at 2000px on the long edge precisely so the
  // number, the date and the total can be read. The panel then drew it at about
  // 460px wide with no way to look closer, so a reviewer who needed to check a
  // twelve-digit invoice number opened the Drive folder instead -- where the
  // files are called IMG_5142.jpg and the only way to find the right one is to
  // open them until it appears. The zoom is what they were going to Drive for.
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wide, setWide] = useState(false);
  // The glass. Off by default: it follows the pointer, and something that
  // follows the pointer unasked is in the way when you are not using it.
  const [loupe, setLoupe] = useState(false);
  const [loupeFactor, setLoupeFactor] = useState(2.5);
  const photoPaneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const resetView = () => { setZoom(1); setRot(0); setPan({ x: 0, y: 0 }); };
  // A new invoice starts fitted, not wherever the last one was left.
  useEffect(() => { resetView(); }, [invoice.id]);

  const zoomTo = (z: number) => {
    const next = Math.min(8, Math.max(1, Math.round(z * 100) / 100));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  // The Drive embed asks the person at the screen for their own access to the
  // file, and only the upload service account has it. Fetch it through the
  // server, which does.
  useEffect(() => {
    if (isPdf || !invoice.id) return;
    let alive = true;
    setPhoto(null);
    setPreviewError(false);
    setPhotoLoading(true);
    fetch(`/api/admin/drive-invoices/${invoice.id}/file`, {
      headers: authHeaders,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        if (d?.photo) setPhoto(d.photo);
        else setPreviewError(true);
      })
      .catch(() => { if (alive) setPreviewError(true); })
      .finally(() => { if (alive) setPhotoLoading(false); });
    return () => { alive = false; };
  }, [invoice.id, isPdf, authHeaders]);

  // The three figures the invoice prints, and whether they agree.
  //
  // Reported with a screenshot of a Chef Middle East invoice: net 163.50,
  // VAT 8.18, total 171.68, two lines of 96.00 and 67.50 — and a panel
  // showing only "Total Amount 171.68" above two line amounts that could
  // never add up to it. Nothing was wrong with the figures; there was no VAT
  // on the screen to put between them.
  const num = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };
  const net = num(amountExclTax);
  const vat = num(taxAmount);
  const gross = num(totalAmount);
  const lineSum = lineItems.reduce<number | null>((acc, li) => {
    if (acc === null) return null;
    const v = li.amount;
    return v === null || v === undefined ? null : acc + Number(v);
  }, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const headerOff =
    net !== null && vat !== null && gross !== null ? round2(net + vat - gross) : null;
  const linesOff = lineSum !== null && net !== null ? round2(lineSum - net) : null;

  // What the column would come to if every line used its own qty x price,
  // and which lines that would change. Where that lands on the printed net,
  // the invoice has checked the answer and one press applies it.
  const recomputable = lineItems.every(
    (li) => li.qty !== null && li.qty !== undefined && li.unit_price !== null && li.unit_price !== undefined,
  );
  const recomputed = recomputable
    ? lineItems.map((li) => round2(Number(li.qty) * Number(li.unit_price)))
    : null;
  const wouldChange = recomputed
    ? recomputed.filter((v, i) => Math.abs(v - Number(lineItems[i].amount ?? NaN)) > 0.02 || lineItems[i].amount == null).length
    : 0;
  const recomputedSum = recomputed ? round2(recomputed.reduce((a, b) => a + b, 0)) : null;
  const recomputeReconciles =
    recomputedSum !== null && net !== null && Math.abs(recomputedSum - net) <= 0.02;
  const applyQtyTimesPrice = () => {
    if (!recomputed) return;
    setLineItems((prev) =>
      prev.map((li, i) => ({ ...li, amount: recomputed[i] })),
    );
  };

  useEffect(() => {
    let dead = false;
    fetch(`/api/admin/drive-invoices/vendors?city=${encodeURIComponent(invoice.city || "")}`, {
      headers: authHeaders,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { vendors: [] }))
      .then((d: { vendors?: VendorOption[] }) => {
        if (!dead) setVendorOptions(d.vendors ?? []);
      })
      .catch(() => { if (!dead) setVendorOptions([]); })
      .finally(() => { if (!dead) setVendorsLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.city]);

  /** Fetched when the picker is first opened, not when the modal opens: most
      invoices are approved without touching the lines at all. */
  useEffect(() => {
    if (!itemPickerOpen || !vendorName.trim()) return;
    let dead = false;
    setItemsLoading(true);
    setItemsError("");
    fetch(
      `/api/admin/drive-invoices/vendor-items?city=${encodeURIComponent(invoice.city || "")}` +
        `&vendor=${encodeURIComponent(vendorName.trim())}`,
      { headers: authHeaders, cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { items?: ItemOption[] }) => { if (!dead) setItemOptions(d.items ?? []); })
      .catch((e) => {
        if (dead) return;
        setItemOptions([]);
        setItemsError(`Could not load this vendor's items (${String(e)}).`);
      })
      .finally(() => { if (!dead) setItemsLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemPickerOpen, vendorName, invoice.city]);

  useEffect(() => {
    let dead = false;
    fetch(`/api/admin/drive-invoices/stores?city=${encodeURIComponent(invoice.city || "")}`, {
      headers: authHeaders,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d: { stores?: string[] }) => {
        if (dead) return;
        const list = d.stores ?? [];
        // Keep whatever the invoice already says, even if the channel it came
        // from has since been removed from the list.
        setStoreOptions(
          invoice.store_name && !list.includes(invoice.store_name)
            ? [invoice.store_name, ...list]
            : list,
        );
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [invoice.city, invoice.store_name, authHeaders]);

  const buildPayload = (reviewStatus: string) => ({
    vendor_name: vendorName,
    store_name: storeName,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate || null,
    due_date: dueDate || null,
    total_amount: totalAmount ? Number(totalAmount) : null,
    amount_excl_tax: amountExclTax ? Number(amountExclTax) : null,
    tax_amount: taxAmount ? Number(taxAmount) : null,
    tax_rate_pct: taxRatePct ? Number(taxRatePct) : null,
    currency,
    line_items: lineItems,
    notes,
    review_status: reviewStatus,
  });

  const submit = async (reviewStatus: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(reviewStatus)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail || data.message || "Save failed");
        return;
      }
      onUpdated({ ...invoice, ...buildPayload(reviewStatus) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const retryOcr = async () => {
    setRetrying(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/retry-ocr`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail || "Retry failed");
        return;
      }
      onUpdated({ ...invoice, ocr_status: "pending" });
    } catch {
      setError("Network error");
    } finally {
      setRetrying(false);
    }
  };

  const updateLineItem = (i: number, field: keyof LineItem, value: string) => {
    setLineItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        const numeric = field === "qty" || field === "unit_price" || field === "amount";
        const next: LineItem = {
          ...item,
          [field]: numeric ? (value === "" ? null : Number(value)) : value,
        };
        // Correcting the quantity or the price carries the amount with it.
        //
        // Reported twice on one invoice: the reading had 12 x 10.63 = 127.56
        // for a line printed 8 x 12.000 = 96.00. Typing 8 and 12 left 127.56
        // sitting there, so the invoice still did not add up and the person
        // had to go and change a third figure that the first two determine.
        // Type over the amount afterwards where the invoice really does say
        // something else — a discount, a rounding — and that stands.
        if (field === "qty" || field === "unit_price") {
          const q = Number(next.qty);
          const p = Number(next.unit_price);
          if (next.qty !== null && next.unit_price !== null
              && Number.isFinite(q) && Number.isFinite(p)) {
            next.amount = Math.round(q * p * 100) / 100;
          }
        }
        return next;
      })
    );
  };

  /** Description and unit come from the pick; the price does not. The same
      item has been read at 2.00 and at 130.00 on these invoices, so a filled-in
      price would be a number nobody chose sitting in a field that looks read.
      The picker prints the last one next to the item instead. */
  const pickItem = (it: ItemOption) => {
    setLineItems((prev) => {
      if (replacingLine !== null && replacingLine < prev.length) {
        return prev.map((li, idx) =>
          idx === replacingLine ? { ...li, description: it.description, unit: it.unit || li.unit } : li,
        );
      }
      return [
        ...prev,
        { description: it.description, qty: null, unit: it.unit || "", unit_price: null, amount: null },
      ];
    });
    setReplacingLine(null);
  };

  const removeLineItem = (i: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: "", qty: null, unit: "", unit_price: null, amount: null },
    ]);
  };

  // PO search with debounce
  useEffect(() => {
    if (!showPoSearch) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setPoSearching(true);
      try {
        const q = encodeURIComponent(poQuery);
        const res = await fetch(
          // Dubai raises about twenty POs a day, so ten rows was half a day
          // of them and anything older looked as though it had gone.
          `/api/admin/drive-invoices/${invoice.id}/po-candidates?q=${q}&limit=25`,
          { headers: authHeaders }
        );
        if (res.ok) {
          const data = await res.json();
          let rows = data.candidates ?? [];
          setPoFellBack("");
          // SAFCO is how we buy from SAWHNEY FOODSTUFF -- an abbreviation,
          // not a substring, so no amount of matching finds it. The box
          // opens pre-filled with the invoice's vendor, so that reviewer
          // met "No POs found" before touching anything. Show this city's
          // newest POs instead and say why: the case number is one field
          // away, and an empty panel does not say that.
          if (rows.length === 0 && poQuery.trim()) {
            const back = await fetch(
              `/api/admin/drive-invoices/${invoice.id}/po-candidates?q=&limit=25`,
              { headers: authHeaders }
            );
            if (back.ok) {
              rows = (await back.json()).candidates ?? [];
              setPoFellBack(rows.length ? poQuery.trim() : "");
            }
          }
          setPoCandidates(rows);
        }
      } catch {
        // silent
      } finally {
        setPoSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [poQuery, showPoSearch, invoice.id, authHeaders]);

  const openPoSearch = () => {
    setPoQuery(invoice.vendor_name || "");
    setShowPoSearch(true);
  };

  const selectPO = async (candidate: POCandidate) => {
    setPoSaving(true);
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/set-po-match`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: candidate.id, matched_by: "" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMatchedPoId(candidate.id);
        setMatchedPoNo(candidate.po_no);
        setMatchedPoVendor(candidate.vendor_name);
        setMatchedPoAmount(candidate.amount);
        setMatchConfidence(null);
        setMatchMethod("manual");
        setShowPoSearch(false);
        onUpdated({
          ...invoice,
          matched_po_id: candidate.id,
          matched_po_no: candidate.po_no,
          matched_po_vendor: candidate.vendor_name,
          matched_po_amount: candidate.amount,
          match_confidence: null,
          match_method: "manual",
        });
      }
    } catch {
      // silent
    } finally {
      setPoSaving(false);
    }
  };

  const clearPO = async () => {
    setPoSaving(true);
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/set-po-match`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: null, matched_by: "" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMatchedPoId(null);
        setMatchedPoNo(null);
        setMatchedPoVendor(null);
        setMatchedPoAmount(null);
        setMatchConfidence(null);
        setMatchMethod("");
        setShowPoSearch(false);
        onUpdated({
          ...invoice,
          matched_po_id: null,
          matched_po_no: null,
          matched_po_vendor: null,
          matched_po_amount: null,
          match_confidence: null,
          match_method: "",
        });
      }
    } catch {
      // silent
    } finally {
      setPoSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[#1a1a2e] border border-white/15 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">📄</span>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{invoice.drive_file_name}</p>
              <p className="text-white/40 text-xs">{invoice.store_name} · {invoice.city.toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(invoice.ocr_status === "error" || invoice.ocr_status === "skipped") && (
              <button
                onClick={retryOcr}
                disabled={retrying}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10"
              >
                {retrying ? "Queuing…" : "↺ Retry OCR"}
              </button>
            )}
            <a
              href={invoice.drive_web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10"
            >
              Open in Drive ↗
            </a>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left: file preview */}
          <div className={`w-full ${wide ? "lg:w-[72%]" : "lg:w-[45%]"} border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20 shrink-0 h-64 lg:h-auto flex flex-col transition-[width]`}>
            {photo ? (
              <>
                <div
                  ref={photoPaneRef}
                  className={`relative flex-1 min-h-0 overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
                  onWheel={(e) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }}
                  onDoubleClick={() => (zoom > 1 ? resetView() : zoomTo(2.5))}
                  onPointerDown={(e) => {
                    if (zoom <= 1) return;
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
                  }}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerLeave={() => { dragRef.current = null; }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt="Invoice"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain select-none"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                      transformOrigin: "center",
                    }}
                  />
                  {loupe ? (
                    <PhotoLoupe containerRef={photoPaneRef} active={loupe} factor={loupeFactor}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain select-none"
                        style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                          transformOrigin: "center",
                        }}
                      />
                    </PhotoLoupe>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 border-t border-white/10 bg-black/30 px-2 py-1.5">
                  <button type="button" onClick={() => zoomTo(zoom / 1.4)} disabled={zoom <= 1}
                    title="Zoom out"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30">−</button>
                  <button type="button" onClick={resetView} title="Fit"
                    className="rounded px-2 py-0.5 text-[11px] tabular-nums text-white/70 hover:bg-white/10 hover:text-white">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button type="button" onClick={() => zoomTo(zoom * 1.4)} disabled={zoom >= 8}
                    title="Zoom in"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30">+</button>
                  <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} title="Rotate"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white">↻</button>
                  <button
                    type="button"
                    onClick={() => setLoupe((v) => !v)}
                    title="Magnifier — enlarges what is under the pointer"
                    className={`rounded px-2 py-0.5 text-sm ${
                      loupe ? "bg-amber-400/20 text-amber-300" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >🔎</button>
                  {loupe && (
                    <button
                      type="button"
                      onClick={() => setLoupeFactor((f) => (f >= 5 ? 1.5 : Math.round((f + 0.5) * 10) / 10))}
                      title="Change the magnification"
                      className="rounded px-1.5 py-0.5 text-[11px] tabular-nums text-amber-300 hover:bg-white/10"
                    >{loupeFactor}x</button>
                  )}
                  <button type="button" onClick={() => setWide((w) => !w)}
                    title={wide ? "Narrow the preview" : "Widen the preview"}
                    className="ml-auto hidden rounded px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white lg:block">
                    {wide ? "◧ Narrow" : "◨ Wider"}
                  </button>
                  <span className="hidden text-[10px] text-white/30 lg:block">scroll to zoom · drag to move · double-click to fit</span>
                </div>
              </>
            ) : isPdf && !previewError ? (
              <iframe
                src={previewUrl}
                title="Invoice preview"
                className="w-full flex-1 border-0"
                onError={() => setPreviewError(true)}
              />
            ) : photoLoading ? (
              <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
                Loading the invoice…
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/40">
                <span className="text-4xl">{isPdf ? "📄" : "🖼"}</span>
                <p className="text-sm">Preview unavailable</p>
                <a
                  href={invoice.drive_web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 text-sm underline"
                >
                  Open in Google Drive
                </a>
              </div>
            )}
          </div>

          {/* Right: form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ConfidenceWarnings notes={invoice.confidence_notes} />

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <VendorPicker
                  value={vendorName}
                  onChange={setVendorName}
                  options={vendorOptions}
                  loading={vendorsLoading}
                />
              </div>
              {/* Branch was printed once in small type under the file name. It
                  is one of the five things being checked here, so it gets a
                  label like the other four — and it is editable, because the
                  value is the channel the photo was posted in rather than
                  anything the invoice says. It ends up on every line in the
                  Hub, so the wrong one files the cost against the wrong store. */}
              <div className="col-span-2">
                <label className="block text-white/50 text-[11px] mb-1">
                  Branch / Location
                  {storeName && invoice.store_name && storeName !== invoice.store_name && (
                    <span className="ml-2 text-amber-300">
                      changed from {invoice.store_name}
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {storeOptions.length === 0 && (
                      <option value={storeName} className="bg-[#1a1a2e]">{storeName || "—"}</option>
                    )}
                    {storeOptions.map((s) => (
                      <option key={s} value={s} className="bg-[#1a1a2e]">{s}</option>
                    ))}
                  </select>
                  <span className="shrink-0 text-sm text-white/50">{invoice.city.toUpperCase()}</span>
                </div>
              </div>
              <Field label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} />
              <div>
                <label className="block text-white/50 text-[11px] mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                >
                  {["AED", "USD", "PHP", "EUR", "GBP"].map((c) => (
                    <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>
                  ))}
                </select>
              </div>
              <Field label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
              <Field label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
              {/* Net, tax, total — in the order the invoice prints them, so the
                  sum can be followed down the column. */}
              <Field label="Total excl. VAT" value={amountExclTax} onChange={setAmountExclTax} type="number" />
              <div className="grid grid-cols-[1fr_auto] gap-1 items-end">
                <Field label="VAT" value={taxAmount} onChange={setTaxAmount} type="number" />
                <div className="w-16">
                  <Field label="Rate %" value={taxRatePct} onChange={setTaxRatePct} type="number" />
                </div>
              </div>
              <div className="col-span-2">
                <Field label="Total (incl. VAT)" value={totalAmount} onChange={setTotalAmount} type="number" />
              </div>
              <div className="col-span-2">
                {headerOff === null ? (
                  <p className="text-white/30 text-[11px]">
                    Enter the net and the VAT and this line checks the total for you.
                  </p>
                ) : headerOff === 0 ? (
                  <p className="text-emerald-300/80 text-[11px]">
                    ✓ {net} + {vat} = {gross}
                  </p>
                ) : (
                  <p className="text-amber-300 text-[11px]">
                    ⚠ {net} + {vat} = {round2((net ?? 0) + (vat ?? 0))}, not {gross}
                    <span className="text-amber-300/60"> — out by {headerOff}</span>
                  </p>
                )}
              </div>
            </div>

            {/* PO Match section */}
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-blue-300 text-[11px] font-semibold tracking-wide uppercase">
                  Purchase Order Match
                </p>
                <div className="flex items-center gap-1.5">
                  {matchedPoId && (
                    <button
                      onClick={clearPO}
                      disabled={poSaving}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-white/40 hover:text-white/70 transition-all"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={showPoSearch ? () => setShowPoSearch(false) : openPoSearch}
                    disabled={poSaving}
                    className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all border border-blue-500/30"
                  >
                    {showPoSearch ? "Cancel" : matchedPoId ? "Change PO" : "Link PO"}
                  </button>
                </div>
              </div>

              {matchedPoId && !showPoSearch ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white text-xs font-mono">{matchedPoNo}</p>
                    <p className="text-white/60 text-[11px] truncate">{matchedPoVendor}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {matchedPoAmount != null && (
                      <p className="text-white/80 text-xs font-mono">
                        {money(invoice.city, matchedPoAmount)}
                      </p>
                    )}
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      {matchConfidence != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                          {Math.round(matchConfidence * 100)}%
                        </span>
                      )}
                      <span className="text-[10px] text-white/30">
                        {matchMethod === "auto" ? "auto-matched" : "manual"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : !showPoSearch ? (
                <p className="text-white/30 text-xs italic">No PO linked — click Link PO to search</p>
              ) : null}

              {showPoSearch && (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={poQuery}
                    onChange={(e) => setPoQuery(e.target.value)}
                    placeholder="Search vendor, PO number or case number…"
                    className="w-full rounded-lg bg-white/5 border border-blue-500/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-400/60 placeholder:text-white/30"
                  />
                  {poFellBack && (
                    <p className="text-amber-300/80 text-[10px] px-1">
                      No PO is raised to “{poFellBack}” — we buy from that
                      supplier under a shorter name. Showing this city&apos;s newest
                      POs; type the case number to go straight to one.
                    </p>
                  )}
                  {!poFellBack && poCandidates.length > 0 && (poCandidates[0].total_matches ?? 0) > poCandidates.length && (
                    <p className="text-white/40 text-[10px] px-1">
                      Showing the newest {poCandidates.length} of{" "}
                      {poCandidates[0].total_matches?.toLocaleString()} — type part of the PO
                      number to reach an older one.
                    </p>
                  )}
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                    {poSearching ? (
                      <p className="text-white/40 text-xs px-3 py-2 text-center">Searching…</p>
                    ) : poCandidates.length === 0 ? (
                      <p className="text-white/30 text-xs px-3 py-2 text-center italic">No POs found</p>
                    ) : (
                      poCandidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectPO(c)}
                          disabled={poSaving}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-blue-500/10 text-left transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-white text-xs font-mono">{c.po_no}</p>
                            <p className="text-white/50 text-[10px] truncate">{c.vendor_name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {c.amount != null && (
                              <p className="text-white/70 text-[10px] font-mono">
                                {money(invoice.city, c.amount)}
                              </p>
                            )}
                            {(c.delivery_date || c.created_on) && (
                              <p className="text-white/30 text-[10px]">
                                {c.delivery_date || c.created_on}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Line items.

                Checked in full at Receiving -> PO Match, so re-reading fourteen
                rows here is the same work twice — and 419 invoices had been
                sitting unreviewed against three approved. But that only holds
                where a PO exists: a quarter of them have none, and for those
                nothing downstream ever looks at the lines, so they stay open. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setShowLines((v) => !v)}
                  className="flex items-center gap-1.5 text-white/50 text-[11px] hover:text-white/80"
                >
                  <span className={`transition-transform ${showLines ? "rotate-90" : ""}`}>▸</span>
                  Line Items ({lineItems.length})
                </button>
                {showLines && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setReplacingLine(null);
                        setItemPickerOpen((v) => !v);
                      }}
                      className={`text-xs ${itemPickerOpen ? "text-amber-400" : "text-amber-400/70 hover:text-amber-400"}`}
                    >
                      {itemPickerOpen ? "▾ Pick item" : "▸ Pick item"}
                    </button>
                    <button
                      onClick={addLineItem}
                      className="text-xs text-white/40 hover:text-white/70"
                    >
                      + Blank row
                    </button>
                  </div>
                )}
              </div>
              {!showLines && (
                <p className="text-white/35 text-xs italic">
                  Detailed line items are verified at Receiving → PO Match.
                </p>
              )}
              {showLines && itemPickerOpen && (
                <ItemPicker
                  items={itemOptions}
                  loading={itemsLoading}
                  error={itemsError}
                  vendor={vendorName}
                  currency={currency}
                  replacing={replacingLine}
                  onPick={pickItem}
                  onClose={() => { setItemPickerOpen(false); setReplacingLine(null); }}
                />
              )}
              {showLines && lineItems.length === 0 && !itemPickerOpen && (
                <p className="text-white/30 text-xs italic">
                  No line items were read from this invoice — use <span className="text-amber-400/70">Pick item</span> to
                  build them from what this vendor has invoiced before.
                </p>
              )}
              {showLines && lineItems.length > 0 && (
                <div className="rounded-lg overflow-x-auto border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 text-white/40">
                        <th className="text-left px-2 py-1.5">Description</th>
                        <th className="text-right px-2 py-1.5 w-16">Qty</th>
                        <th className="text-left px-2 py-1.5 w-16">Unit</th>
                        <th className="text-right px-2 py-1.5 w-20">Price</th>
                        <th className="text-right px-2 py-1.5 w-24">Amount excl. VAT</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1">
                              <input
                                value={item.description}
                                onChange={(e) => updateLineItem(i, "description", e.target.value)}
                                className="w-full bg-transparent text-white focus:outline-none"
                              />
                              {/* A line the OCR read as noise is replaced from
                                  the vendor's own history rather than retyped. */}
                              <button
                                type="button"
                                title="Replace from this vendor's items"
                                onClick={() => { setReplacingLine(i); setItemPickerOpen(true); }}
                                className={`shrink-0 px-1 text-[11px] ${
                                  replacingLine === i ? "text-amber-400" : "text-white/25 hover:text-amber-400"
                                }`}
                              >
                                ⌄
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.qty ?? ""}
                              onChange={(e) => updateLineItem(i, "qty", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={item.unit}
                              onChange={(e) => updateLineItem(i, "unit", e.target.value)}
                              className="w-full bg-transparent text-white focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.unit_price ?? ""}
                              onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.amount ?? ""}
                              onChange={(e) => updateLineItem(i, "amount", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                            {/* Where all three were read, say so when they
                                disagree — one line came back 12 x 10.63 =
                                127.56 for a line printed 8 x 12.000 = 96.00. */}
                            {item.qty != null && item.unit_price != null && item.amount != null
                              && Math.abs(Number(item.qty) * Number(item.unit_price) - Number(item.amount)) > 0.02 ? (
                              <button
                                type="button"
                                title="Use qty × price"
                                onClick={() =>
                                  updateLineItem(i, "amount",
                                    String(round2(Number(item.qty) * Number(item.unit_price))))
                                }
                                className="block w-full text-right text-[10px] text-amber-300/80 underline decoration-dotted underline-offset-2 hover:text-amber-300"
                              >
                                ⚠ use {item.qty} × {item.unit_price} = {round2(Number(item.qty) * Number(item.unit_price))}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => removeLineItem(i)}
                              className="text-white/30 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* The column has to add to the net. This is the row that
                        makes a misread line visible without opening a
                        calculator. */}
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/5">
                        <td className="px-2 py-1.5 text-white/40" colSpan={4}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {lineSum === null
                                ? "Some lines have no amount, so they cannot be added up."
                                : linesOff === null
                                  ? "Lines add up to"
                                  : linesOff === 0
                                    ? "✓ Lines add up to the net"
                                    : `⚠ Lines are out by ${linesOff} against the net ${net}`}
                            </span>
                            {/* The reading gets the quantity and the price right
                                far more often than the line total. Where using
                                them lands exactly on the net the invoice prints,
                                the invoice has checked the answer itself. */}
                            {linesOff !== 0 && wouldChange > 0 && recomputedSum !== null ? (
                              <button
                                type="button"
                                onClick={applyQtyTimesPrice}
                                className={`rounded-md border px-2 py-0.5 text-[11px] ${
                                  recomputeReconciles
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/15 bg-white/5 text-white/70"
                                }`}
                              >
                                {recomputeReconciles
                                  ? `Use qty × price on ${wouldChange} line${wouldChange === 1 ? "" : "s"} → ${recomputedSum} ✓`
                                  : `Use qty × price on ${wouldChange} line${wouldChange === 1 ? "" : "s"} → ${recomputedSum}`}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${
                          linesOff === 0 ? "text-emerald-300" : linesOff === null ? "text-white/60" : "text-amber-300"
                        }`}>
                          {lineSum === null ? "—" : round2(lineSum)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-white/50 text-[11px] mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0 bg-black/20">
          <button
            onClick={() => submit("pending_review")}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <div className="flex items-center gap-2">
            {/* Our own paperwork gets posted into the supplier invoice
                channels — delivery notes from the Central Kitchen, the
                Warehouse, branch-to-branch documents. 97 of them were sitting
                in the review queue as if a supplier had sent them. This takes
                one out without calling it rejected, which it is not. */}
            <button
              onClick={() => submit("not_supplier_invoice")}
              disabled={saving}
              title="A ZEN document — a CK or Warehouse delivery note, not a supplier's invoice"
              className="text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 transition-all border border-white/10 disabled:opacity-50"
            >
              Not a supplier invoice
            </button>
            <button
              onClick={() => submit("rejected")}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-all border border-red-500/30 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => submit("approved")}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-300 hover:text-green-200 transition-all border border-green-500/30 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
