"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareUpload } from "@/lib/image-compress";
import { getAuth, getAuthHeaders, getUploadHeaders, refreshAuthFromApi, type City } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
} from "@/lib/ui-tokens";

// INPUT_CLASS contains w-full which breaks flex-item sizing; strip it for item rows
const INPUT_BASE = "rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-all duration-200 focus:border-violet-500/50 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/20";
import SelectDark from "@/components/SelectDark";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MANILA_BRANCHES: Record<string, string> = {
  PAR: "Paranaque",
  CUB: "Cubao",
  TAFT: "Taft",
  CK: "Commissary Kitchen",
};
const DUBAI_BRANCHES: Record<string, string> = {
  BB: "Business Bay",
  JLT: "JLT",
  ARJ: "Al Rigga / Jaddaf",
  AM: "Al Mankhool",
  AB: "Abu Baker",
};

const DEPARTMENTS = ["Kitchen", "Operations", "Admin", "Maintenance", "Logistics", "Other"];

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemRow = { id: string; name: string; qty: string; unit: string; amount: string };
type CatalogItem = { item_name: string; unit: string; supplier_name: string };
type Entry = {
  id: string;
  branch_code: string;
  department: string;
  purchase_date: string;
  supplier_name: string;
  items: { name: string; qty?: number | null; unit?: string | null; amount: number }[];
  total_amount: number;
  receipt_url: string;
  submitted_by: string;
  notes: string;
  payment_method?: string;
  created_at: string;
};

function newItem(): ItemRow {
  return { id: Math.random().toString(36).slice(2), name: "", qty: "", unit: "", amount: "" };
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtAmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReceiptLogPage() {
  const [auth, setAuth] = useState(() => getAuth());

  useEffect(() => {
    refreshAuthFromApi(getAuth()).then((r) => setAuth(r || getAuth()));
  }, []);

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400">Please log in to continue.</p>
      </div>
    );
  }

  return <ReceiptLogApp auth={auth} />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

function ReceiptLogApp({ auth }: { auth: NonNullable<ReturnType<typeof getAuth>> }) {
  const role = auth.role ?? "STAFF";
  const canSwitchCity = role === "HQ" || role === "ADMIN" || (auth.cityLock ?? "") === "";

  const [city, setCity] = useState<City>(auth.city === "dubai" ? "dubai" : "manila");

  const branches = city === "dubai" ? DUBAI_BRANCHES : MANILA_BRANCHES;
  const branchKeys = Object.keys(branches);

  // ── Form state ──
  const [branch, setBranch]     = useState(branchKeys[0]);
  const [dept, setDept]         = useState(DEPARTMENTS[0]);
  const [date, setDate]         = useState(todayLocal);
  const [supplier, setSupplier] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [items, setItems]       = useState<ItemRow[]>([newItem()]);
  const [notes, setNotes]       = useState("");
  // Not pre-selected. A default of Cash would silently mislabel every card
  // purchase, which is the one thing this field exists to prevent.
  const [payment, setPayment]   = useState("");
  const [methods, setMethods]   = useState<{ key: string; label: string }[]>([]);
  const [receiptUrl, setReceiptUrl] = useState("");

  // ── Catalog state ──
  const [vendors, setVendors]   = useState<string[]>([]);
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [activeSuggestId, setActiveSuggestId] = useState<string | null>(null);

  // ── Upload state ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errMsg, setErrMsg]         = useState("");

  // ── Recent submissions ──
  const [entries, setEntries]       = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  // Set while correcting an entry that is already filed. There is no other way
  // back: the log has no delete, so a mistyped amount used to stay in the books
  // and the purchase got entered a second time to compensate (lesson 22).
  const [editingId, setEditingId]   = useState<string | null>(null);

  // Reset branch to first branch of the new city when city switches
  useEffect(() => {
    const keys = city === "dubai" ? Object.keys(DUBAI_BRANCHES) : Object.keys(MANILA_BRANCHES);
    setBranch(keys[0]);
    setSupplier("");
  }, [city]);

  // Load catalog (vendors + items) when city changes
  const loadCatalog = useCallback(async () => {
    try {
      const [vRes, iRes, mRes] = await Promise.all([
        fetch(`/api/store/receipt-log/catalog/vendors?city=${city}`, { headers: getAuthHeaders(auth) }),
        fetch(`/api/store/receipt-log/catalog/items?city=${city}`, { headers: getAuthHeaders(auth) }),
        // Served rather than hardcoded, so the values that can be chosen and the
        // values that can be saved cannot drift apart.
        fetch(`/api/store/receipt-log/payment-methods`, { headers: getAuthHeaders(auth) }),
      ]);
      if (vRes.ok) {
        const vj = await vRes.json();
        setVendors(vj.vendors ?? []);
      }
      if (iRes.ok) {
        const ij = await iRes.json();
        setCatalog(ij.items ?? []);
      }
      if (mRes.ok) {
        const mj = await mRes.json();
        setMethods(mj.methods ?? []);
      }
    } catch {
      // Catalog is optional — silently ignore
    }
  }, [auth, city]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const total = items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);

  // Load recent submissions
  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const res = await fetch(`/api/store/receipt-log/my?city=${city}&limit=20`, {
        headers: getAuthHeaders(auth),
      });
      const data = await res.json();
      if (data.ok) setEntries(data.entries);
    } finally {
      setLoadingEntries(false);
    }
  }, [auth, city]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // ── Upload receipt photo ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("file", await prepareUpload(file));
      fd.append("branch_code", branch);
      const res = await fetch("/api/store/receipt-log/upload", {
        method: "POST",
        headers: getUploadHeaders(auth),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.detail || "Upload failed");
      setReceiptUrl(data.receipt_url);
    } catch (err: unknown) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Supplier helpers ──
  const supplierSuggestions = (() => {
    if (!supplier.trim()) return vendors;
    const q = supplier.toLowerCase();
    return vendors.filter((v) => v.toLowerCase().includes(q) && v.toLowerCase() !== q);
  })();

  const selectSupplier = (name: string) => {
    setSupplier(name);
    setSupplierOpen(false);
  };

  // ── Item catalog helpers ──
  const vendorCatalog = (() => {
    if (!supplier.trim()) return catalog;
    const vl = supplier.toLowerCase();
    const filtered = catalog.filter((c) => c.supplier_name.toLowerCase() === vl);
    return filtered.length > 0 ? filtered : catalog;
  })();

  const getItemSuggestions = (query: string): CatalogItem[] =>
    query.length < 1
      ? vendorCatalog.slice(0, 12)
      : vendorCatalog.filter((c) => c.item_name.toLowerCase().includes(query.toLowerCase())).slice(0, 10);

  // ── Item row helpers ──
  const updateItemField = (id: string, field: "name" | "amount" | "qty" | "unit", val: string) =>
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: val } : it));

  const handleItemNameChange = (id: string, val: string) => {
    updateItemField(id, "name", val);
    setActiveSuggestId(id);
  };

  const selectCatalogItem = (rowId: string, cat: CatalogItem) => {
    setItems((prev) => prev.map((it) =>
      it.id === rowId ? { ...it, name: cat.item_name, unit: cat.unit || it.unit } : it,
    ));
    setActiveSuggestId(null);
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.length > 1 ? prev.filter((it) => it.id !== id) : prev);

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    setSuccessMsg("");
    setActiveSuggestId(null);

    if (!supplier.trim()) { setErrMsg("Supplier / store name is required."); return; }
    if (total <= 0) { setErrMsg("At least one item with an amount is required."); return; }
    if (!payment) { setErrMsg("Please choose how this was paid."); return; }

    const payload = {
      city,
      branch_code: branch,
      department: dept,
      purchase_date: date,
      supplier_name: supplier.trim(),
      items: items
        .filter((it) => it.name.trim() && parseFloat(it.amount) > 0)
        .map((it) => ({
          name: it.name.trim(),
          qty: it.qty ? parseFloat(it.qty) : null,
          unit: it.unit.trim() || null,
          amount: parseFloat(it.amount),
        })),
      total_amount: total,
      receipt_url: receiptUrl,
      notes: notes.trim(),
      payment_method: payment,
    };

    setSubmitting(true);
    try {
      const res = editingId
        ? await fetch(`/api/store/receipt-log/${editingId}`, {
            method: "PATCH",
            headers: getAuthHeaders(auth),
            body: JSON.stringify({ items: payload.items, total_amount: total }),
          })
        : await fetch("/api/store/receipt-log", {
            method: "POST",
            headers: getAuthHeaders(auth),
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.detail || (editingId ? "Could not save the correction" : "Submission failed"));

      setSuccessMsg(editingId
        ? `Corrected — now ₱${fmtAmt(total)} at ${supplier.trim()}`
        : `Submitted! ₱${fmtAmt(total)} at ${supplier.trim()}`);
      setEditingId(null);
      // Reset form
      setSupplier("");
      setItems([newItem()]);
      setNotes("");
      setReceiptUrl("");
      // payment stays: three receipts from one trip were paid the same way, and
      // re-picking each time is the tax that stops the third being entered.
      setDate(todayLocal());
      loadEntries();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6" onClick={() => { setSupplierOpen(false); setActiveSuggestId(null); }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Receipt Log</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Upload a receipt and record cash/market purchases for expense tracking.
          </p>
        </div>
        {canSwitchCity && (
          <div className="flex shrink-0 rounded-xl border border-white/10 bg-white/5 p-1 gap-1 mt-1">
            {(["manila", "dubai"] as City[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={(ev) => { ev.stopPropagation(); setCity(c); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  city === c
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {c === "manila" ? "Manila" : "Dubai"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className={`${GLASS_CARD} space-y-5`} onClick={(e) => { e.stopPropagation(); setSupplierOpen(false); setActiveSuggestId(null); }}>

        {/* Receipt photo upload */}
        <div>
          <p className={`${T_LABEL} mb-2`}>Receipt Photo</p>
          {receiptUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/40">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-emerald-300 underline truncate flex-1"
              >
                Receipt uploaded
              </a>
              <ExternalLink size={14} className="text-emerald-400 shrink-0" />
              <button
                type="button"
                onClick={() => setReceiptUrl("")}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-zinc-600 hover:border-violet-500 hover:bg-violet-900/10 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={28} className="text-violet-400 animate-spin" />
              ) : (
                <Camera size={28} className="text-zinc-400" />
              )}
              <span className="text-sm text-zinc-400">
                {uploading ? "Uploading…" : "Tap to upload receipt photo"}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleUpload}
          />
          {uploadErr && <p className="text-xs text-red-400 mt-1">{uploadErr}</p>}
        </div>

        {/* Branch + Department */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`${T_LABEL} block mb-1`}>Branch / Store</label>
            <SelectDark
              value={branch}
              onChange={(v) => setBranch(v)}
              options={branchKeys.map((k) => ({ value: k, label: `${k} — ${branches[k]}` }))}
            />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1`}>Department</label>
            <SelectDark
              value={dept}
              onChange={(v) => setDept(v)}
              options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
            />
          </div>
        </div>

        {/* Date + Supplier */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`${T_LABEL} block mb-1`}>Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <label className={`${T_LABEL} block mb-1`}>Supplier / Store</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => { setSupplier(e.target.value); setSupplierOpen(true); }}
              onFocus={() => setSupplierOpen(true)}
              onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
              placeholder="e.g. SM Supermarket"
              className={INPUT_CLASS}
              autoComplete="off"
              required
            />
            {supplierOpen && (supplierSuggestions.length > 0 || vendors.length > 0) && (
              <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-zinc-900 shadow-xl max-h-48 overflow-y-auto">
                {(supplier.trim() ? supplierSuggestions : vendors).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectSupplier(v); }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
                  >
                    {v}
                  </button>
                ))}
                {supplier.trim() && !vendors.some((v) => v.toLowerCase() === supplier.toLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectSupplier(supplier.trim()); setSupplierOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-500 italic hover:bg-white/10"
                  >
                    Use &quot;{supplier.trim()}&quot; (not in catalog)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className={T_LABEL}>Items</p>
            <span className={`${T_CAPTION} text-zinc-500`}>name · qty · unit · line total</span>
          </div>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="relative" onClick={(e) => e.stopPropagation()}>
                {/* Row 1: Item name + trash */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => handleItemNameChange(it.id, e.target.value)}
                      onFocus={() => setActiveSuggestId(it.id)}
                      onBlur={() => setTimeout(() => setActiveSuggestId(null), 150)}
                      placeholder="Item name"
                      className={`${INPUT_BASE} w-full`}
                      autoComplete="off"
                    />
                    {activeSuggestId === it.id && (
                      <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-zinc-900 shadow-xl max-h-44 overflow-y-auto">
                        {getItemSuggestions(it.name).map((cat) => (
                          <button
                            key={cat.item_name}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectCatalogItem(it.id, cat); }}
                            className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
                          >
                            <span className="text-sm text-zinc-200">{cat.item_name}</span>
                            {cat.unit && (
                              <span className="text-xs text-zinc-500 ml-1">· {cat.unit}</span>
                            )}
                          </button>
                        ))}
                        {getItemSuggestions(it.name).length === 0 && it.name.trim() && (
                          <div className="px-3 py-2 text-xs text-zinc-600 italic">No matches in catalog</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="text-zinc-600 hover:text-red-400 shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {/* Row 2: Qty + Unit + Amount */}
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="number"
                    value={it.qty}
                    onChange={(e) => updateItemField(it.id, "qty", e.target.value)}
                    placeholder="Qty"
                    min="0"
                    step="0.01"
                    className={`${INPUT_BASE} w-20 shrink-0`}
                    onFocus={() => setActiveSuggestId(null)}
                  />
                  <input
                    type="text"
                    value={it.unit}
                    onChange={(e) => updateItemField(it.id, "unit", e.target.value)}
                    placeholder="Unit (KG…)"
                    className={`${INPUT_BASE} w-24 shrink-0`}
                    autoComplete="off"
                  />
                  <input
                    type="number"
                    value={it.amount}
                    onChange={(e) => updateItemField(it.id, "amount", e.target.value)}
                    placeholder="₱ Line total"
                    min="0"
                    step="0.01"
                    className={`${INPUT_BASE} flex-1 text-right`}
                    onFocus={() => setActiveSuggestId(null)}
                  />
                </div>
                {/* The last box is the line total, but with a quantity sitting
                    right next to it people reasonably read it as the price of
                    one and the receipt is then filed short (4 bottles logged as
                    ₱525 instead of ₱2,100). We cannot tell which was meant, so
                    we do the multiplication and offer it rather than applying
                    it — whoever is holding the receipt decides. */}
                {(() => {
                  const q = parseFloat(it.qty);
                  const a = parseFloat(it.amount);
                  if (!(q > 1) || !(a > 0)) return null;
                  const lineTotal = Math.round(q * a * 100) / 100;
                  return (
                    <div className="flex items-center gap-2 mt-1 pl-1">
                      <span className="text-[11px] text-zinc-500">
                        If ₱{fmtAmt(a)} is the price of one: {q} × ₱{fmtAmt(a)} = ₱{fmtAmt(lineTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItemField(it.id, "amount", String(lineTotal))}
                        className="text-[11px] font-semibold text-violet-400 underline shrink-0"
                      >
                        Use
                      </button>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, newItem()])}
            className={`${SECONDARY_BUTTON} mt-2 text-sm`}
          >
            <Plus size={14} /> Add Item
          </button>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center py-2 border-t border-zinc-700/50">
          <span className="text-sm font-semibold text-zinc-300">Total</span>
          <span className="text-lg font-bold text-white">₱ {fmtAmt(total)}</span>
        </div>

        {/* Paid with */}
        <div>
          <label className={`${T_LABEL} block mb-1`}>Paid with</label>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setPayment(m.key)}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                  payment === m.key
                    ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className={`${T_CAPTION} mt-1.5`}>
            Card purchases are settled from this, without waiting for the
            statement. The statement is then only checked against it.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className={`${T_LABEL} block mb-1`}>Notes <span className="text-zinc-500 font-normal">(optional)</span></label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. For monthly maintenance supplies"
            className={INPUT_CLASS}
          />
        </div>

        {/* Feedback */}
        {errMsg && (
          <div className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
            {errMsg}
          </div>
        )}
        {successMsg && (
          <div className="text-sm text-emerald-300 bg-emerald-900/20 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 size={15} /> {successMsg}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || total <= 0}
          className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> {editingId ? "Saving…" : "Submitting…"}</>
          ) : editingId ? (
            <><Receipt size={16} /> Save Correction</>
          ) : (
            <><Receipt size={16} /> Submit Receipt</>
          )}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setSupplier(""); setItems([newItem()]); setNotes(""); setReceiptUrl(""); setErrMsg(""); }}
            className="w-full mt-2 text-xs text-zinc-400 underline"
          >
            Cancel — leave that entry as it is
          </button>
        )}
      </form>

      {/* ── Recent submissions ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className={T_SECTION}>My Recent Submissions</h2>
          <button
            onClick={loadEntries}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>

        {loadingEntries ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-zinc-500" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No submissions yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className={GLASS_CARD}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white">{e.supplier_name}</span>
                    <span className={`${T_CAPTION} text-zinc-500`}>
                      {fmtDate(e.purchase_date)} · {e.branch_code} · {e.department}
                      {" · "}
                      {/* Shown so a wrong choice is caught here rather than
                          months later against the card statement. Entries made
                          before this field existed say so instead of guessing. */}
                      {methods.find((m) => m.key === e.payment_method)?.label
                        ?? (e.payment_method || "payment not recorded")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-emerald-300">₱ {fmtAmt(e.total_amount)}</span>
                    {expanded === e.id ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
                  </div>
                </button>

                {expanded === e.id && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50 space-y-2">
                    {e.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm gap-2">
                        <span className="text-zinc-300">
                          {it.name}
                          {(it.qty || it.unit) && (
                            <span className="text-zinc-500 text-xs ml-1.5">
                              {it.qty != null ? `× ${it.qty}` : ""}
                              {it.unit ? ` ${it.unit}` : ""}
                            </span>
                          )}
                        </span>
                        <span className="text-zinc-400 shrink-0">₱ {fmtAmt(it.amount)}</span>
                      </div>
                    ))}
                    {e.notes && (
                      <p className="text-xs text-zinc-500 mt-1 italic">{e.notes}</p>
                    )}
                    {/* The way back. Loads the lines into the form above; the
                        branch, date, supplier, payment method and photo stay as
                        filed, so a wrong number is fixed rather than the whole
                        purchase entered again. */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setSupplier(e.supplier_name);
                        setItems(e.items.length
                          ? e.items.map((it) => ({
                              id: Math.random().toString(36).slice(2),
                              name: it.name ?? "",
                              qty: it.qty != null ? String(it.qty) : "",
                              unit: it.unit ?? "",
                              amount: String(it.amount ?? ""),
                            }))
                          : [newItem()]);
                        setErrMsg("");
                        setSuccessMsg("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-xs text-violet-400 underline mt-2"
                    >
                      Fix the amounts on this receipt
                    </button>
                    {e.receipt_url && (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-violet-400 underline mt-1"
                      >
                        <ExternalLink size={11} /> View receipt
                      </a>
                    )}
                    {!e.receipt_url && (
                      <p className="text-xs text-zinc-600">No receipt photo</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
