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
  BADGE_SUCCESS,
  BADGE_INFO,
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
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ItemRow = {
  id: number;
  item_name: string;
  qty: string;
  unit: string;
  unit_price: string;
};

let _itemCounter = 1;
function newItem(): ItemRow {
  return { id: _itemCounter++, item_name: "", qty: "", unit: "kg", unit_price: "" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StorePurchasePage() {
  const auth = getAuth();

  // ── Auth state ──
  const [name, setName] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // ── Vendor ──
  const [vendors, setVendors] = useState<string[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);

  // ── Form ──
  const today = new Date().toISOString().slice(0, 10);
  const [requestDate, setRequestDate] = useState(today);
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  // ── Receipt photo ──
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // ── Submit ──
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ request_no?: string; case_id?: string; total?: number } | null>(null);

  // ─── Verify PIN ──────────────────────────────────────────────────────────
  const verifyPin = useCallback(async () => {
    if (!name.trim() || !pin.trim()) {
      setAuthError("Please enter your name and PIN.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const qs = new URLSearchParams({
        staff_name: name.trim(),
        pin: pin.trim(),
        city,
      }).toString();
      const res = await fetch(`/api/auth/verify?${qs}`, { method: "POST", cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        const j = JSON.parse(text || "{}");
        throw new Error(j?.detail || text || `Auth failed (${res.status})`);
      }
      const j = JSON.parse(text || "{}");
      const perms: string[] = Array.isArray(j?.permissions) ? j.permissions : [];
      const hasProcAccess = canAccessProcurementAdmin(String(j?.role || ""), city);
      if (!hasProcAccess) {
        throw new Error("Procurement access required. Please contact your manager.");
      }
      saveProcurementSession(name.trim(), pin.trim());
      setAuthed(true);
      // Load vendor history
      void loadVendors();
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }, [name, pin, city]);

  // ─── Load vendor history ─────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    try {
      const headers = await procurementTokenHeaders(name, pin);
      const qs = new URLSearchParams({
        approver_name: name.trim(),
        pin: pin.trim(),
        city,
      }).toString();
      const res = await fetch(`/api/admin/procurement/direct-purchase/vendors?${qs}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setVendors(Array.isArray(j?.vendors) ? j.vendors : []);
      }
    } catch {
      // Vendor history is optional — silently ignore
    }
  }, [name, pin, city]);

  // ─── Auto-login if session already stored ────────────────────────────────
  useEffect(() => {
    if (name && pin) {
      void verifyPin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Item helpers ─────────────────────────────────────────────────────────
  const addItem = () => setItems((prev) => [...prev, newItem()]);
  const removeItem = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));
  const updateItem = (id: number, field: keyof Omit<ItemRow, "id">, value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const totalAmount = items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.unit_price) || 0;
    return sum + q * p;
  }, 0);

  // ─── Photo handler ────────────────────────────────────────────────────────
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(String(ev.target?.result || ""));
    reader.readAsDataURL(f);
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!vendorName.trim()) { setError("Vendor / market name is required."); return; }
    const validItems = items.filter((i) => i.item_name.trim() && parseFloat(i.qty) > 0);
    if (!validItems.length) { setError("Add at least one item with a name and quantity."); return; }

    setBusy(true);
    try {
      const headers = await procurementTokenHeaders(name, pin);

      const itemsPayload = validItems.map((it) => ({
        item_name: it.item_name.trim(),
        qty: parseFloat(it.qty) || 0,
        unit: it.unit.trim() || "pc",
        unit_price: parseFloat(it.unit_price) || 0,
      }));

      const fd = new FormData();
      fd.append("approver_name", name.trim());
      fd.append("pin", pin.trim());
      fd.append("city", city);
      fd.append("vendor_name", vendorName.trim());
      fd.append("request_date", requestDate);
      fd.append("items_json", JSON.stringify(itemsPayload));
      if (photoFile) fd.append("file", photoFile);

      const res = await fetch("/api/admin/procurement/direct-purchase", {
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
      const j = JSON.parse(text || "{}");
      const req = j?.request || {};
      setResult({
        request_no: String(req.request_no || req.parent_case_no || ""),
        case_id: String(j?.case_id || ""),
        total: Number(req.total_amount || totalAmount || 0),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ─── Success screen ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-2 py-8">
        <div className={`${GLASS_CARD} p-8 text-center space-y-4`}>
          <div className="flex justify-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white">Purchase Submitted!</h2>
          <p className="text-sm text-zinc-400">
            Your purchase has been submitted for manager approval.
          </p>
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
          <button
            type="button"
            className={`${SECONDARY_BUTTON} w-full mt-2`}
            onClick={() => {
              setResult(null);
              setVendorName("");
              setItems([newItem()]);
              setPhotoFile(null);
              setPhotoPreview("");
              setRequestDate(today);
            }}
          >
            Submit Another Purchase
          </button>
        </div>
      </div>
    );
  }

  // ─── Login screen ─────────────────────────────────────────────────────────
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mariano"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLASS}
              onKeyDown={(e) => { if (e.key === "Enter") void verifyPin(); }}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value as "manila" | "dubai")}
              className={SELECT_CLASS}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          {authError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />{authError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void verifyPin()}
            disabled={authBusy}
            className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
          >
            {authBusy
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Verifying…</>
              : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────
  const vendorSuggestions = vendors.filter(
    (v) => vendorName && v.toLowerCase().includes(vendorName.toLowerCase()) && v !== vendorName,
  ).slice(0, 6);

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

      {/* Date + Vendor */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <p className={T_SECTION}>Purchase Info</p>

        <div>
          <label className={`${T_LABEL} mb-1.5 block`}>Purchase Date</label>
          <input
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div className="relative">
          <label className={`${T_LABEL} mb-1.5 block`}>Vendor / Market Name</label>
          <div className="relative">
            <input
              value={vendorName}
              onChange={(e) => { setVendorName(e.target.value); setVendorOpen(true); }}
              onFocus={() => setVendorOpen(true)}
              onBlur={() => setTimeout(() => setVendorOpen(false), 150)}
              placeholder="e.g. Divisoria Market, Seafood Kingdom…"
              className={INPUT_CLASS}
            />
            {vendors.length > 0 && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                onMouseDown={(e) => { e.preventDefault(); setVendorOpen((o) => !o); }}
              >
                {vendorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          {/* Dropdown: either filtered suggestions or full list */}
          {vendorOpen && (vendorSuggestions.length > 0 || (!vendorName && vendors.length > 0)) && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden">
              {(vendorName ? vendorSuggestions : vendors.slice(0, 8)).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); setVendorName(v); setVendorOpen(false); }}
                >
                  {v}
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
          {items.map((item, idx) => (
            <div key={item.id} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Item {idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-1 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Item name */}
              <input
                value={item.item_name}
                onChange={(e) => updateItem(item.id, "item_name", e.target.value)}
                placeholder="Item name (e.g. Salmon, Soy Sauce)"
                className={INPUT_CLASS}
              />

              {/* Qty + Unit + Price */}
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.qty}
                  onChange={(e) => updateItem(item.id, "qty", e.target.value)}
                  placeholder="Qty"
                  min="0"
                  step="0.1"
                  className={INPUT_CLASS}
                />
                <select
                  value={item.unit}
                  onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                  className={SELECT_CLASS}
                >
                  {["kg", "g", "L", "mL", "pc", "box", "bag", "bottle", "pack", "tray", "can"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.unit_price}
                  onChange={(e) => updateItem(item.id, "unit_price", e.target.value)}
                  placeholder="Unit price"
                  min="0"
                  step="1"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Line total */}
              {parseFloat(item.qty) > 0 && parseFloat(item.unit_price) > 0 && (
                <p className="text-right text-xs text-zinc-400">
                  = <span className="font-semibold text-amber-300">
                    PHP {(parseFloat(item.qty) * parseFloat(item.unit_price)).toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 text-sm text-zinc-400 transition-all hover:border-violet-500/30 hover:text-violet-300"
        >
          <Plus className="h-4 w-4" /> Add item
        </button>

        {/* Total */}
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
            <img
              src={photoPreview}
              alt="Receipt preview"
              className="max-h-48 w-full rounded-xl border border-white/10 object-contain bg-black/20"
            />
            <button
              type="button"
              onClick={() => { setPhotoFile(null); setPhotoPreview(""); if (photoRef.current) photoRef.current.value = ""; }}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-5 text-sm text-zinc-400 transition-all hover:border-violet-500/30 hover:text-violet-300"
          >
            <Camera className="h-5 w-5" /> Tap to add photo / take a picture
          </button>
        )}
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={busy}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 py-3 text-base`}
      >
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
