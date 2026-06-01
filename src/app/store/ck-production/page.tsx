"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MapPin,
  User,
  KeyRound,
  Package,
  Camera,
  X,
} from "lucide-react";
import {
  GLASS_CARD,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
} from "@/lib/ui-tokens";

// ─── Auth helpers (mirrors store/purchase pattern) ───────────────────────────
function defaultName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ck_production_name") || "";
}
function defaultPin(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ck_production_pin") || "";
}
function saveSession(name: string, pin: string) {
  localStorage.setItem("ck_production_name", name);
  localStorage.setItem("ck_production_pin", pin);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type LineItem = {
  item_name: string;
  qty: number;
  unit: string;
  unit_price?: number;
};

type PendingPo = {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  line_items_json: LineItem[];
  status: string;
  delivery_date?: string;
  created_at: string;
  request_id: string;
  request_no: string;
  store_code: string;
  city: string;
  request_notes?: string;
};

type DispatchItem = {
  item_name: string;
  unit: string;
  qty_ordered: number;
  qty_dispatched: number | string; // string during editing
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function hasShortage(items: DispatchItem[]): boolean {
  return items.some(
    (i) => Number(i.qty_dispatched) < Number(i.qty_ordered),
  );
}

function friendlyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "detail" in e)
    return String((e as { detail: string }).detail);
  return "Something went wrong. Please try again.";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CkProductionPage() {
  // Styles
  const AMBER_GLASS = `${GLASS_CARD} bg-amber-950/20`;
  const AMBER_PRIMARY =
    "rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-amber-500/20 hover:scale-[1.02] hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] disabled:opacity-60";
  const AMBER_SECONDARY =
    "rounded-xl border border-amber-700/30 bg-amber-950/20 px-5 py-2.5 text-white transition-all duration-200 hover:border-amber-600/40 hover:bg-amber-950/35 disabled:opacity-60";
  const SHORTAGE_PRIMARY =
    "rounded-xl bg-gradient-to-r from-rose-700 to-orange-700 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-orange-600 active:scale-[0.98] disabled:opacity-60";

  // Auth
  const [staffName, setStaffName] = useState(defaultName);
  const [pin, setPin] = useState(defaultPin);
  const [city, setCity] = useState("manila");

  // List state
  const [rows, setRows] = useState<PendingPo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetched, setFetched] = useState(false);

  // Per-PO state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dispatchItemsById, setDispatchItemsById] = useState<
    Record<string, DispatchItem[]>
  >({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [photoById, setPhotoById] = useState<Record<string, File | null>>({});
  const [photoPreviewById, setPhotoPreviewById] = useState<
    Record<string, string>
  >({});
  const [submitBusy, setSubmitBusy] = useState<Record<string, boolean>>({});
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, string>>(
    {},
  );
  const [submitError, setSubmitError] = useState<Record<string, string>>({});
  const [shortageConfirm, setShortageConfirm] = useState<
    Record<string, boolean>
  >({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ─── Load pending POs ──────────────────────────────────────────────────────
  const loadPending = useCallback(
    async (cityOverride?: string) => {
      const activeCity = cityOverride ?? city;
      if (!staffName.trim() || !pin.trim()) {
        setError("Please enter your name and PIN.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          city: activeCity,
          approver_name: staffName.trim(),
          pin: pin.trim(),
        });
        const res = await fetch(
          `/api/admin/procurement/ck-production/pending?${qs}`,
          { method: "GET", cache: "no-store" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.detail || `Error ${res.status}`);
        }
        const data: { rows: PendingPo[] } = await res.json();
        const newRows = Array.isArray(data?.rows) ? data.rows : [];
        setRows(newRows);

        // Initialise dispatch item qtys from line_items_json
        setDispatchItemsById((prev) => {
          const next = { ...prev };
          for (const row of newRows) {
            if (!next[row.id]) {
              next[row.id] = (row.line_items_json || []).map((li) => ({
                item_name: li.item_name || "",
                unit: li.unit || "",
                qty_ordered: Number(li.qty) || 0,
                qty_dispatched: Number(li.qty) || 0, // default = full order
              }));
            }
          }
          return next;
        });

        setFetched(true);
        saveSession(staffName.trim(), pin.trim());
      } catch (e: unknown) {
        setError(friendlyError(e));
      } finally {
        setLoading(false);
      }
    },
    [city, staffName, pin],
  );

  // ─── Handle photo selection ────────────────────────────────────────────────
  const handlePhoto = (poId: string, file: File | null) => {
    if (!file) return;
    setPhotoById((p) => ({ ...p, [poId]: file }));
    const url = URL.createObjectURL(file);
    setPhotoPreviewById((p) => ({ ...p, [poId]: url }));
  };

  const clearPhoto = (poId: string) => {
    const prev = photoPreviewById[poId];
    if (prev) URL.revokeObjectURL(prev);
    setPhotoById((p) => ({ ...p, [poId]: null }));
    setPhotoPreviewById((p) => ({ ...p, [poId]: "" }));
    const ref = fileInputRefs.current[poId];
    if (ref) ref.value = "";
  };

  // ─── Update a single dispatch qty ─────────────────────────────────────────
  const setItemQty = (poId: string, idx: number, val: string) => {
    setDispatchItemsById((prev) => {
      const updated = [...(prev[poId] || [])];
      updated[idx] = { ...updated[idx], qty_dispatched: val };
      return { ...prev, [poId]: updated };
    });
    // Reset shortage-confirm when qty changes
    setShortageConfirm((p) => ({ ...p, [poId]: false }));
  };

  // ─── Confirm dispatch ──────────────────────────────────────────────────────
  const handleDispatch = async (poId: string) => {
    const items = dispatchItemsById[poId] || [];
    const notes = notesById[poId] || "";
    const photo = photoById[poId] || null;
    const shortage = hasShortage(items);

    // First click with shortage: require confirmation
    if (shortage && !shortageConfirm[poId]) {
      setShortageConfirm((p) => ({ ...p, [poId]: true }));
      return;
    }

    setSubmitBusy((p) => ({ ...p, [poId]: true }));
    setSubmitError((p) => ({ ...p, [poId]: "" }));

    try {
      const dispatchedItems = items.map((i) => ({
        item_name: i.item_name,
        unit: i.unit,
        qty_ordered: Number(i.qty_ordered),
        qty_dispatched: Number(i.qty_dispatched) || 0,
      }));

      const fd = new FormData();
      fd.append("approver_name", staffName.trim());
      fd.append("pin", pin.trim());
      fd.append("delivery_note", notes.trim());
      fd.append("dispatched_items_json", JSON.stringify(dispatchedItems));
      if (photo) fd.append("file", photo);

      const res = await fetch(
        `/api/admin/procurement/ck-production/dispatch/${poId}`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Error ${res.status}`);
      }

      const label = shortage ? "Dispatched (shortage flagged)" : "Dispatched";
      setSubmitSuccess((p) => ({ ...p, [poId]: `✓ ${label}` }));
      setExpandedId(null);
      setShortageConfirm((p) => ({ ...p, [poId]: false }));

      setTimeout(() => {
        setRows((prev) => prev.filter((r) => r.id !== poId));
      }, 3000);
    } catch (e: unknown) {
      setSubmitError((p) => ({ ...p, [poId]: friendlyError(e) }));
    } finally {
      setSubmitBusy((p) => ({ ...p, [poId]: false }));
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white">
      <motion.div
        className="mx-auto max-w-2xl px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/20 border border-amber-500/30">
              <Truck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className={T_PAGE_TITLE}>CK Production Dispatch</h1>
              <p className={T_BODY}>
                Confirm items dispatched from Central Kitchen.
              </p>
            </div>
          </div>
        </div>

        {/* Auth + City card */}
        <div className={`${AMBER_GLASS} p-4 mb-5 space-y-3`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                <User className="h-3 w-3" /> Your Name
              </label>
              <input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="CK staff name"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3" /> PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
              <MapPin className="h-3 w-3" /> City
            </label>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (fetched) void loadPending(e.target.value);
              }}
              className={SELECT_CLASS}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadPending()}
            disabled={loading}
            className={`${AMBER_PRIMARY} w-full flex items-center justify-center gap-2 text-sm`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? "Loading…"
              : fetched
                ? "Refresh"
                : "Load Pending Orders"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Pending PO list */}
        {fetched && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={T_SECTION}>
                Pending Orders
                <span className={`${T_CAPTION} ml-2`}>({rows.length})</span>
              </h2>
            </div>

            {rows.length === 0 ? (
              <div
                className={`${AMBER_GLASS} flex flex-col items-center gap-2 py-12`}
              >
                <CheckCircle2 className="h-8 w-8 text-amber-500" />
                <p className={T_CAPTION}>No pending orders to dispatch.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const items = dispatchItemsById[row.id] || [];
                  const busy = submitBusy[row.id] || false;
                  const success = submitSuccess[row.id] || "";
                  const err = submitError[row.id] || "";
                  const needsShortageConfirm = shortageConfirm[row.id] || false;
                  const shortage = hasShortage(items);
                  const photo = photoById[row.id] || null;
                  const photoPreview = photoPreviewById[row.id] || "";

                  return (
                    <div
                      key={row.id}
                      className={[
                        "rounded-xl border transition-all duration-200 overflow-hidden",
                        success
                          ? "border-emerald-700/50 bg-emerald-900/15"
                          : isExpanded
                            ? "border-amber-500/40 bg-amber-950/20"
                            : "border-white/8 bg-white/4 hover:border-amber-500/30 hover:bg-amber-950/15",
                      ].join(" ")}
                    >
                      {/* PO header — always visible */}
                      <button
                        type="button"
                        className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : row.id)
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-amber-400 shrink-0" />
                            <span className="font-mono text-sm font-semibold text-white">
                              {row.po_no}
                            </span>
                            <span className="text-xs text-zinc-400">
                              → {row.store_code || row.city}
                            </span>
                            {success && (
                              <span className={BADGE_SUCCESS}>Dispatched</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                            <span>
                              {items.length} item
                              {items.length !== 1 ? "s" : ""}
                            </span>
                            {row.delivery_date && (
                              <span className="text-amber-400/80">
                                Deliver by {fmtDate(row.delivery_date)}
                              </span>
                            )}
                          </div>
                          {row.request_notes && (
                            <p className="mt-1 text-xs text-zinc-500 truncate">
                              Note: {row.request_notes}
                            </p>
                          )}
                          {success && (
                            <p className="mt-1 text-xs font-semibold text-emerald-400">
                              {success}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-amber-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-zinc-500" />
                          )}
                        </div>
                      </button>

                      {/* Expanded dispatch form */}
                      <AnimatePresence>
                        {isExpanded && !success && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">
                              {/* Items table */}
                              <div>
                                <p className={`${T_LABEL} mb-2`}>
                                  Dispatch Quantities
                                </p>

                                {/* Column headers */}
                                <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 mb-1">
                                  <span className="text-[11px] text-zinc-500 uppercase tracking-wide">
                                    Item
                                  </span>
                                  <span className="text-[11px] text-zinc-500 uppercase tracking-wide text-center">
                                    Ordered
                                  </span>
                                  <span className="text-[11px] text-zinc-500 uppercase tracking-wide text-center">
                                    Dispatched
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {items.map((item, idx) => {
                                    const ordered = Number(item.qty_ordered);
                                    const dispatched = Number(
                                      item.qty_dispatched,
                                    );
                                    const itemShort =
                                      dispatched < ordered &&
                                      !isNaN(dispatched);

                                    return (
                                      <div
                                        key={idx}
                                        className={[
                                          "grid grid-cols-[1fr_80px_80px] gap-2 items-center rounded-xl border px-3 py-2.5 transition-colors",
                                          itemShort
                                            ? "border-rose-700/40 bg-rose-950/20"
                                            : "border-white/8 bg-white/3",
                                        ].join(" ")}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-white truncate">
                                            {item.item_name}
                                          </p>
                                          <p className="text-[11px] text-zinc-500">
                                            {item.unit}
                                          </p>
                                        </div>
                                        <div className="text-center">
                                          <span className="text-sm text-zinc-300 font-mono">
                                            {ordered}
                                          </span>
                                        </div>
                                        <div>
                                          <input
                                            type="number"
                                            min="0"
                                            max={ordered}
                                            step="0.1"
                                            value={item.qty_dispatched}
                                            onChange={(e) =>
                                              setItemQty(
                                                row.id,
                                                idx,
                                                e.target.value,
                                              )
                                            }
                                            className={[
                                              "w-full rounded-lg border px-2 py-1.5 text-center text-sm font-mono bg-neutral-900/60 focus:outline-none focus:ring-1 transition-colors",
                                              itemShort
                                                ? "border-rose-600/50 text-rose-300 focus:ring-rose-500/50"
                                                : "border-white/15 text-white focus:ring-amber-500/50",
                                            ].join(" ")}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Shortage warning */}
                              {shortage && (
                                <div className="rounded-xl border border-rose-700/50 bg-rose-950/25 px-4 py-3 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                                    <p className="text-sm font-semibold text-rose-300">
                                      Shortage Detected
                                    </p>
                                  </div>
                                  <div className="space-y-0.5 pl-6">
                                    {items
                                      .filter(
                                        (i) =>
                                          Number(i.qty_dispatched) <
                                          Number(i.qty_ordered),
                                      )
                                      .map((i, k) => (
                                        <p
                                          key={k}
                                          className="text-xs text-rose-200"
                                        >
                                          {i.item_name}:{" "}
                                          <span className="font-mono">
                                            {Number(i.qty_dispatched)}/
                                            {Number(i.qty_ordered)} {i.unit}
                                          </span>{" "}
                                          <span className="text-rose-400">
                                            (
                                            {(
                                              Number(i.qty_ordered) -
                                              Number(i.qty_dispatched)
                                            ).toFixed(1)}{" "}
                                            short)
                                          </span>
                                        </p>
                                      ))}
                                  </div>
                                  <p className="pl-6 text-xs text-rose-300/70">
                                    The store and HQ will be notified of this
                                    shortage.
                                  </p>
                                </div>
                              )}

                              {/* Delivery note */}
                              <div>
                                <label
                                  className={`${T_LABEL} mb-1.5 block`}
                                >
                                  Delivery Note{" "}
                                  <span className="text-zinc-600">
                                    (optional)
                                  </span>
                                </label>
                                <textarea
                                  value={notesById[row.id] || ""}
                                  onChange={(e) =>
                                    setNotesById((p) => ({
                                      ...p,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Any notes for the store…"
                                  rows={2}
                                  className={`${INPUT_CLASS} resize-none`}
                                />
                              </div>

                              {/* Photo upload */}
                              <div>
                                <label className={`${T_LABEL} mb-1.5 block`}>
                                  Dispatch Photo{" "}
                                  <span className="text-zinc-600">
                                    (optional)
                                  </span>
                                </label>
                                {photoPreview ? (
                                  <div className="relative rounded-xl overflow-hidden border border-amber-700/40">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={photoPreview}
                                      alt="Dispatch photo preview"
                                      className="w-full max-h-48 object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => clearPhoto(row.id)}
                                      className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      fileInputRefs.current[row.id]?.click()
                                    }
                                    className="w-full rounded-xl border border-dashed border-amber-700/40 bg-amber-950/15 px-4 py-4 text-sm text-zinc-400 hover:border-amber-600/50 hover:text-zinc-300 transition-colors flex items-center justify-center gap-2"
                                  >
                                    <Camera className="h-4 w-4" />
                                    Take or attach photo
                                  </button>
                                )}
                                <input
                                  ref={(el) => {
                                    fileInputRefs.current[row.id] = el;
                                  }}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) =>
                                    handlePhoto(
                                      row.id,
                                      e.target.files?.[0] || null,
                                    )
                                  }
                                />
                              </div>

                              {err && (
                                <p className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                                  {err}
                                </p>
                              )}

                              {/* Confirm button */}
                              {needsShortageConfirm && shortage ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-rose-300 text-center font-medium">
                                    Tap again to confirm dispatch with shortage.
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShortageConfirm((p) => ({
                                          ...p,
                                          [row.id]: false,
                                        }))
                                      }
                                      disabled={busy}
                                      className={`${AMBER_SECONDARY} flex-1 text-sm flex items-center justify-center gap-2`}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDispatch(row.id)}
                                      disabled={busy}
                                      className={`${SHORTAGE_PRIMARY} flex-1 text-sm flex items-center justify-center gap-2`}
                                    >
                                      {busy ? (
                                        <>
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                          Dispatching…
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle className="h-4 w-4" />
                                          Confirm with Shortage
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleDispatch(row.id)}
                                  disabled={busy}
                                  className={`${shortage ? SHORTAGE_PRIMARY : AMBER_PRIMARY} w-full flex items-center justify-center gap-2 text-sm`}
                                >
                                  {busy ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                      Dispatching…
                                    </>
                                  ) : shortage ? (
                                    <>
                                      <AlertTriangle className="h-4 w-4" />
                                      Confirm Dispatch (Shortage)
                                    </>
                                  ) : (
                                    <>
                                      <Truck className="h-4 w-4" />
                                      Confirm Dispatch
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
