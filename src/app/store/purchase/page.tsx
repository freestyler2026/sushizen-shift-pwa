"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  defaultProcurementName,
  defaultProcurementPin,
  procurementTokenHeaders,
  saveProcurementSession,
} from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_INFO,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import {
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  Plus,
  Trash2,
  Camera,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type VendorEntry = { name: string; isRegistered: boolean };
type CatalogItem  = { item_name: string; unit: string; benchmark_unit_price: number; category: string };

type ItemRow = {
  id: number;
  item_name: string;
  qty: string;
  unit: string;
  unit_price: string;
  benchmark_price: number;  // catalog reference price (0 if none); user can override
  is_new: boolean;   // true if not found in catalog
};

let _counter = 1;
const newItem = (): ItemRow => ({ id: _counter++, item_name: "", qty: "", unit: "kg", unit_price: "", benchmark_price: 0, is_new: false });

const UNITS = ["kg", "g", "L", "mL", "pc", "box", "bag", "bottle", "pack", "tray", "can"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function StorePurchasePage() {
  const auth = getAuth();

  // ── Auth ──
  const [name, setName]   = useState(defaultProcurementName());
  const [pin, setPin]     = useState(defaultProcurementPin());
  const [city, setCity]   = useState<"manila" | "dubai">(
    String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [authed, setAuthed]       = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy]   = useState(false);

  // ── Catalog data ──
  const [vendors, setVendors]                 = useState<VendorEntry[]>([]);
  const [unregisteredVendors, setUnregVendors]= useState<string[]>([]);
  const [catalog, setCatalog]                 = useState<CatalogItem[]>([]);

  // ── Vendor field ──
  const [vendorName, setVendorName]     = useState("");
  const [vendorOpen, setVendorOpen]     = useState(false);
  const [vendorIsNew, setVendorIsNew]   = useState(false);

  // ── Form ──
  const today = new Date().toISOString().slice(0, 10);
  const [requestDate, setRequestDate] = useState(today);
  const [items, setItems]             = useState<ItemRow[]>([newItem()]);

  // ── Item suggestion dropdown state ──
  const [activeSuggestId, setActiveSuggestId] = useState<number | null>(null);

  // ── Receipt photo ──
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // ── Submit ──
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");
  const [result, setResult] = useState<{ request_no?: string; total?: number } | null>(null);

  // ─── Verify PIN ──────────────────────────────────────────────────────────
  const verifyPin = useCallback(async () => {
    if (!name.trim() || !pin.trim()) { setAuthError("Please enter your name and PIN."); return; }
    setAuthBusy(true); setAuthError("");
    try {
      const qs = new URLSearchParams({ staff_name: name.trim(), pin: pin.trim(), city }).toString();
      const res  = await fetch(`/api/auth/verify?${qs}`, { method: "POST", cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        const j = JSON.parse(text || "{}");
        throw new Error(j?.detail || text || `Auth failed (${res.status})`);
      }
      const j = JSON.parse(text || "{}");
      if (!canAccessProcurementAdmin(String(j?.role || ""), city))
        throw new Error("Procurement access required.");
      saveProcurementSession(name.trim(), pin.trim());
      setAuthed(true);
      void loadCatalog();
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }, [name, pin, city]);

  // ─── Load vendor + item catalog ──────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    try {
      const headers = await procurementTokenHeaders(name, pin);
      const qs = new URLSearchParams({ approver_name: name.trim(), pin: pin.trim(), city }).toString();

      const [vRes, iRes] = await Promise.all([
        fetch(`/api/admin/procurement/direct-purchase/vendors?${qs}`,      { headers, cache: "no-store" }),
        fetch(`/api/admin/procurement/direct-purchase/item-catalog?${qs}`, { headers, cache: "no-store" }),
      ]);

      if (vRes.ok) {
        const vj = await vRes.json();
        const registered: VendorEntry[] = (vj?.vendors as string[] || []).map((n: string) => ({ name: n, isRegistered: true }));
        setVendors(registered);
        setUnregVendors(vj?.unregistered || []);
      }
      if (iRes.ok) {
        const ij = await iRes.json();
        setCatalog(Array.isArray(ij?.items) ? ij.items : []);
      }
    } catch {
      // Catalog is optional — silently ignore
    }
  }, [name, pin, city]);

  useEffect(() => {
    if (name && pin) void verifyPin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Vendor helpers ──────────────────────────────────────────────────────
  const allVendorNames = [
    ...vendors.map((v) => v.name),
    ...unregisteredVendors,
  ];
  const vendorSuggestions = vendorName
    ? allVendorNames.filter((n) => n.toLowerCase().includes(vendorName.toLowerCase()) && n !== vendorName)
    : allVendorNames;

  const selectVendor = (name: string, isRegistered: boolean) => {
    setVendorName(name);
    setVendorIsNew(!isRegistered);
    setVendorOpen(false);
  };

  const handleVendorChange = (val: string) => {
    setVendorName(val);
    setVendorOpen(true);
    const match = vendors.find((v) => v.name.toLowerCase() === val.toLowerCase());
    setVendorIsNew(!!val && !match);
  };

  // ─── Item helpers ─────────────────────────────────────────────────────────
  const addItem    = () => setItems((p) => [...p, newItem()]);
  const removeItem = (id: number) => setItems((p) => p.filter((i) => i.id !== id));

  const updateItem = (id: number, field: keyof Omit<ItemRow, "id">, value: string | boolean) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const selectCatalogItem = (rowId: number, cat: CatalogItem) => {
    setItems((p) => p.map((i) =>
      i.id === rowId
        ? { ...i, item_name: cat.item_name, unit: cat.unit,
            unit_price: cat.benchmark_unit_price > 0 ? String(cat.benchmark_unit_price) : i.unit_price,
            benchmark_price: cat.benchmark_unit_price || 0,
            is_new: false }
        : i,
    ));
    setActiveSuggestId(null);
  };

  const getItemSuggestions = (query: string) =>
    query.length < 1
      ? []
      : catalog.filter((c) => c.item_name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  const handleItemNameChange = (id: number, val: string) => {
    const match = catalog.find((c) => c.item_name.toLowerCase() === val.toLowerCase());
    updateItem(id, "item_name", val);
    updateItem(id, "is_new", !match && val.length > 0);
    setActiveSuggestId(id);
  };

  // ─── Photo ───────────────────────────────────────────────────────────────
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(String(ev.target?.result || ""));
    reader.readAsDataURL(f);
  };

  // ─── Total ───────────────────────────────────────────────────────────────
  const totalAmount = items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.unit_price) || 0;
    return sum + q * p;
  }, 0);

  const hasNewItems   = items.some((i) => i.is_new && i.item_name.trim());
  const hasNewVendor  = vendorIsNew && vendorName.trim();

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!vendorName.trim())               { setError("Vendor / market name is required."); return; }
    const validItems = items.filter((i) => i.item_name.trim() && parseFloat(i.qty) > 0);
    if (!validItems.length)               { setError("Add at least one item with a name and quantity."); return; }

    setBusy(true);
    try {
      const headers  = await procurementTokenHeaders(name, pin);
      const payload  = validItems.map((it) => ({
        item_name:  it.item_name.trim(),
        qty:        parseFloat(it.qty) || 0,
        unit:       it.unit || "pc",
        unit_price: parseFloat(it.unit_price) || 0,
      }));
      const fd = new FormData();
      fd.append("approver_name", name.trim());
      fd.append("pin", pin.trim());
      fd.append("city", city);
      fd.append("vendor_name", vendorName.trim());
      fd.append("request_date", requestDate);
      fd.append("items_json", JSON.stringify(payload));
      if (photoFile) fd.append("file", photoFile);

      const res  = await fetch("/api/admin/procurement/direct-purchase", {
        method: "POST",
        headers: { Authorization: headers["Authorization"] },
        body: fd,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text || `Request failed (${res.status})`;
        try { const j = JSON.parse(text); if (typeof j?.detail === "string") msg = j.detail; } catch {}
        throw new Error(msg);
      }
      const j   = JSON.parse(text || "{}");
      const req = j?.request || {};
      setResult({ request_no: String(req.request_no || req.parent_case_no || ""), total: Number(req.total_amount || totalAmount || 0) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ─── Success ──────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-2 py-8">
        <div className={`${GLASS_CARD} p-8 text-center space-y-4`}>
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
          <h2 className="text-2xl font-semibold text-white">Purchase Submitted!</h2>
          <p className="text-sm text-zinc-400">Submitted for manager approval. Back-office will review the details.</p>
          {result.request_no && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Request No.</span>
                <span className="font-mono font-semibold text-white">{result.request_no}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total Amount</span>
                <span className="font-semibold text-amber-300">PHP {Number(result.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Status</span>
                <span className={BADGE_INFO}>Pending Approval</span>
              </div>
            </div>
          )}
          <button type="button" className={`${SECONDARY_BUTTON} w-full`}
            onClick={() => { setResult(null); setVendorName(""); setVendorIsNew(false); setItems([newItem()]); setPhotoFile(null); setPhotoPreview(""); setRequestDate(today); }}>
            Submit Another Purchase
          </button>
        </div>
      </div>
    );
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="mx-auto max-w-sm space-y-5 px-2 py-8">
        <div className="text-center">
          <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-violet-400" />
          <h1 className={T_PAGE_TITLE}>Direct Purchase</h1>
          <p className="mt-1 text-sm text-zinc-400">Record market & supplier purchases for approval</p>
        </div>
        <div className={`${GLASS_CARD} p-5 space-y-4`}>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Your Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mariano" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)}
              placeholder="••••••••" className={INPUT_CLASS}
              onKeyDown={(e) => { if (e.key === "Enter") void verifyPin(); }} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <select value={city} onChange={(e) => setCity(e.target.value as "manila" | "dubai")} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          {authError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />{authError}
            </div>
          )}
          <button type="button" onClick={() => void verifyPin()} disabled={authBusy}
            className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
            {authBusy ? <><RefreshCw className="h-4 w-4 animate-spin" /> Verifying…</> : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-5 px-2 pb-12 pt-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-7 w-7 text-violet-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-white">Direct Purchase</h1>
          <p className={T_CAPTION}>Record as <span className="text-zinc-300">{name}</span> · {city}</p>
        </div>
      </div>

      {/* Unregistered warning */}
      {(hasNewVendor || hasNewItems) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {hasNewVendor && <span>Vendor <strong>&ldquo;{vendorName}&rdquo;</strong> is not in the registered list. </span>}
            {hasNewItems  && <span>Some items are not in the catalog. </span>}
            Back-office will review and correct after submission.
          </span>
        </div>
      )}

      {/* Purchase Info */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <p className={T_SECTION}>Purchase Info</p>

        <div>
          <label className={`${T_LABEL} mb-1.5 block`}>Purchase Date</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className={INPUT_CLASS} />
        </div>

        {/* Vendor field */}
        <div className="relative">
          <label className={`${T_LABEL} mb-1.5 block`}>
            Vendor / Market Name
            {vendorIsNew && vendorName && <span className={`${BADGE_WARNING} ml-2`}>New</span>}
          </label>
          <div className="relative">
            <input
              value={vendorName}
              onChange={(e) => handleVendorChange(e.target.value)}
              onFocus={() => setVendorOpen(true)}
              onBlur={() => setTimeout(() => setVendorOpen(false), 160)}
              placeholder="Select or type vendor name…"
              className={INPUT_CLASS}
            />
            <button type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
              onMouseDown={(e) => { e.preventDefault(); setVendorOpen((o) => !o); }}>
              {vendorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {vendorOpen && vendorSuggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-56 overflow-y-auto">
              {/* Registered (master) vendors first */}
              {vendors
                .filter((v) => !vendorName || v.name.toLowerCase().includes(vendorName.toLowerCase()))
                .slice(0, 10)
                .map((v) => (
                  <button key={v.name} type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); selectVendor(v.name, true); }}>
                    <Star className="h-3 w-3 text-amber-400 shrink-0" />
                    <span>{v.name}</span>
                    <span className="ml-auto text-[10px] text-zinc-500">Registered</span>
                  </button>
                ))}
              {/* Unregistered (history) vendors */}
              {unregisteredVendors
                .filter((n) => !vendorName || n.toLowerCase().includes(vendorName.toLowerCase()))
                .slice(0, 5)
                .map((n) => (
                  <button key={n} type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-violet-500/10 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); selectVendor(n, false); }}>
                    <span className="h-3 w-3 shrink-0" />
                    <span>{n}</span>
                    <span className="ml-auto text-[10px] text-amber-500">Unregistered</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Items Purchased</p>
          <span className="text-xs text-zinc-500">{items.length} row{items.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const suggestions = getItemSuggestions(item.item_name);
            const showSuggest = activeSuggestId === item.id && suggestions.length > 0;
            return (
              <div key={item.id} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500">
                    Item {idx + 1}
                    {item.is_new && item.item_name && <span className={`${BADGE_WARNING} ml-2`}>New</span>}
                  </span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(item.id)}
                      className="rounded-lg p-1 text-zinc-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Item name with catalog typeahead */}
                <div className="relative">
                  <input
                    value={item.item_name}
                    onChange={(e) => handleItemNameChange(item.id, e.target.value)}
                    onFocus={() => setActiveSuggestId(item.id)}
                    onBlur={() => setTimeout(() => setActiveSuggestId(null), 160)}
                    placeholder="Item name (e.g. Salmon, Soy Sauce)"
                    className={INPUT_CLASS}
                  />
                  {showSuggest && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button key={s.item_name} type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                          onMouseDown={(e) => { e.preventDefault(); selectCatalogItem(item.id, s); }}>
                          <Star className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="flex-1">{s.item_name}</span>
                          <span className="text-[10px] text-zinc-500">{s.unit}
                            {s.benchmark_unit_price > 0 && ` · ₱${s.benchmark_unit_price}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Qty + Unit + Price */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-500">Qty</label>
                    <input type="number" inputMode="decimal" value={item.qty}
                      onChange={(e) => updateItem(item.id, "qty", e.target.value)}
                      placeholder="0" min="0" step="0.1" className={INPUT_CLASS} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-500">Unit</label>
                    <select value={item.unit}
                      onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                      className={SELECT_CLASS}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-500">
                      Unit Price
                      {item.benchmark_price > 0 && (
                        <span className="ml-1 text-violet-400/70">(ref: ₱{item.benchmark_price})</span>
                      )}
                    </label>
                    <input type="number" inputMode="decimal" value={item.unit_price}
                      onChange={(e) => updateItem(item.id, "unit_price", e.target.value)}
                      placeholder="0" min="0" step="1" className={INPUT_CLASS} />
                  </div>
                </div>

                {parseFloat(item.qty) > 0 && parseFloat(item.unit_price) > 0 && (
                  <p className="text-right text-xs text-zinc-400">
                    = <span className="font-semibold text-amber-300">
                      PHP {(parseFloat(item.qty) * parseFloat(item.unit_price)).toFixed(2)}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addItem}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 text-sm text-zinc-400 transition-all hover:border-violet-500/30 hover:text-violet-300">
          <Plus className="h-4 w-4" /> Add item
        </button>

        <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-300">Total Amount</span>
          <span className="text-lg font-bold text-amber-300">PHP {totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Receipt photo */}
      <div className={`${GLASS_CARD} p-5 space-y-3`}>
        <p className={T_SECTION}>Receipt Photo</p>
        <p className={T_CAPTION}>Attach a photo of the receipt or invoice (optional but recommended).</p>
        {photoPreview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Receipt preview"
              className="max-h-48 w-full rounded-xl border border-white/10 object-contain bg-black/20" />
            <button type="button"
              onClick={() => { setPhotoFile(null); setPhotoPreview(""); if (photoRef.current) photoRef.current.value = ""; }}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
              Remove photo
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => photoRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-5 text-sm text-zinc-400 transition-all hover:border-violet-500/30 hover:text-violet-300">
            <Camera className="h-5 w-5" /> Tap to add photo / take a picture
          </button>
        )}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Submit */}
      <button type="button" onClick={() => void handleSubmit()} disabled={busy}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 py-3 text-base`}>
        {busy
          ? <><RefreshCw className="h-5 w-5 animate-spin" /> Submitting…</>
          : <><CheckCircle2 className="h-5 w-5" /> Submit for Approval · PHP {totalAmount.toFixed(2)}</>
        }
      </button>

      <p className="text-center text-xs text-zinc-600">
        After submission, your manager will be notified to review this purchase.
      </p>
    </div>
  );
}
