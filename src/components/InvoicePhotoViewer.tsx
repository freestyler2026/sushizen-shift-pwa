"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLockBodyScroll } from "@/components/ModalScrim";

export type PhotoCandidate = {
  source: string;
  vendor_name?: string | null;
  photo_date?: string | null;
  store_code?: string | null;
  file_name?: string | null;
  read_invoice_no?: string | null;
  read_amount?: number | null;
  read_currency?: string | null;
  supplier_matches?: boolean;
  number_matches?: boolean;
  ocr_confirmed?: boolean;
  linked?: boolean;
  linked_by?: string | null;
};

/**
 * The invoice photograph, at the size somebody can actually read it.
 *
 * Reported with a screenshot: an invoice for AED 215.39 showing a photograph
 * whose printed total is 182.70 — a different document — under six candidate
 * buttons that all read "MUHAMMAD IMRAN YOUSAF FOODSTUFF TRADING L.L.C. ·
 * 2026-09-18". Nothing on that screen could tell one from another, and the
 * picture was drawn about 460px wide, too small to read the number off.
 *
 * So: the file at full size with zoom and pan, and the candidates as
 * thumbnails carrying what was read off each one. Choosing becomes looking,
 * which is what the person was trying to do.
 */
export default function InvoicePhotoViewer({
  open,
  onClose,
  invoiceNo,
  invoiceDate,
  supplierName,
  invoiceAmount,
  currency,
  photo,
  busy,
  showing,
  candidates,
  onSelect,
  onAttach,
  onDetach,
  attachBusy,
  fetchThumb,
}: {
  open: boolean;
  onClose: () => void;
  invoiceNo: string;
  invoiceDate?: string;
  supplierName?: string;
  invoiceAmount?: number;
  currency?: string;
  photo: string | null;
  busy: boolean;
  showing: string;
  candidates: PhotoCandidate[];
  onSelect: (source: string) => void;
  onAttach: (source: string) => void;
  onDetach: (source: string) => void;
  attachBusy: string;
  fetchThumb: (source: string) => Promise<string | null>;
}) {
  useLockBodyScroll();

  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1); setRot(0); setPan({ x: 0, y: 0 });
  }, []);
  const zoomTo = useCallback((z: number) => {
    const next = Math.min(12, Math.max(1, Math.round(z * 100) / 100));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  }, []);

  // A different photograph starts fitted, not wherever the last one was left.
  useEffect(() => { resetView(); }, [showing, resetView]);

  // Thumbnails, fetched once each and kept while the viewer is open. Two at a
  // time: each one is a full file pulled from Drive and shrunk on the server,
  // and six at once is six of those in flight.
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const wantRef = useRef<string[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    wantRef.current = candidates.map((c) => c.source);
    (async () => {
      const queue = candidates.map((c) => c.source).filter((s) => !(s in thumbs));
      const run = async () => {
        for (;;) {
          const src = queue.shift();
          if (!src || !alive) return;
          const got = await fetchThumb(src).catch(() => null);
          if (!alive) return;
          setThumbs((prev) => ({ ...prev, [src]: got }));
        }
      };
      await Promise.all([run(), run()]);
    })();
    return () => { alive = false; };
    // thumbs is deliberately not a dependency: adding one would restart the
    // queue on every arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates, fetchThumb]);

  const idx = Math.max(0, candidates.findIndex((c) => c.source === showing));
  const step = useCallback((by: number) => {
    if (!candidates.length) return;
    const next = (idx + by + candidates.length) % candidates.length;
    onSelect(candidates[next].source);
  }, [candidates, idx, onSelect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight") { step(1); return; }
      if (e.key === "ArrowLeft") { step(-1); return; }
      if (e.key === "+" || e.key === "=") { zoomTo(zoom * 1.4); return; }
      if (e.key === "-") { zoomTo(zoom / 1.4); return; }
      if (e.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, step, zoom, zoomTo, resetView]);

  if (!open) return null;

  const current = candidates.find((c) => c.source === showing);
  const money = (v?: number | null, c?: string | null) =>
    v === null || v === undefined ? "" : `${c || ""} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/92">
      {/* What we are comparing against. Without it on screen, the person is
          holding the invoice total in their head while reading the picture. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2 text-sm text-zinc-300">
        <span className="font-mono text-base font-semibold text-white">{invoiceNo}</span>
        {invoiceAmount !== undefined ? (
          <span className="font-mono text-base font-semibold text-amber-300">
            {money(invoiceAmount, currency)}
          </span>
        ) : null}
        {invoiceDate ? <span className="text-zinc-400">{invoiceDate}</span> : null}
        {supplierName ? <span className="truncate text-zinc-400">{supplierName}</span> : null}
        <span className="ml-auto text-[11px] text-zinc-500">
          scroll to zoom · drag to move · ← → to change photograph · Esc to close
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-sm text-zinc-200 hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-1">
          {busy ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Loading the photograph…
            </div>
          ) : photo ? (
            <div
              className={`absolute inset-0 overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
              onWheel={(e) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }}
              onDoubleClick={() => (zoom > 1 ? resetView() : zoomTo(3))}
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
                alt={`Invoice ${invoiceNo}`}
                draggable={false}
                className="absolute inset-0 h-full w-full select-none object-contain"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                  transformOrigin: "center",
                }}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              This photograph could not be loaded.
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/70 px-2 py-1">
            <button type="button" onClick={() => zoomTo(zoom / 1.4)} disabled={zoom <= 1}
              className="rounded px-3 py-1 text-lg text-white/80 hover:bg-white/10 disabled:opacity-30">−</button>
            <button type="button" onClick={resetView}
              className="rounded px-2 py-1 text-xs tabular-nums text-white/80 hover:bg-white/10">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomTo(zoom * 1.4)} disabled={zoom >= 12}
              className="rounded px-3 py-1 text-lg text-white/80 hover:bg-white/10 disabled:opacity-30">+</button>
            <button type="button" onClick={() => setRot((r) => (r + 90) % 360)}
              className="rounded px-3 py-1 text-base text-white/80 hover:bg-white/10">↻</button>
          </div>
        </div>

        {/* The candidates, as pictures. */}
        <div className="max-h-[42vh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-black/40 p-3 lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0">
          <div className="mb-2 text-xs text-zinc-400">
            {candidates.length} photograph{candidates.length === 1 ? "" : "s"} to choose between
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-2">
            {candidates.map((c) => {
              const on = c.source === showing;
              const thumb = thumbs[c.source];
              return (
                <button
                  key={c.source}
                  type="button"
                  onClick={() => onSelect(c.source)}
                  className={`overflow-hidden rounded-xl border text-left transition ${
                    on ? "border-violet-400/70 bg-violet-500/10" : "border-white/10 bg-white/5 hover:border-white/25"
                  }`}
                >
                  <div className="flex h-24 items-center justify-center bg-black/40">
                    {thumb === undefined ? (
                      <span className="text-[10px] text-zinc-600">loading…</span>
                    ) : thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-zinc-600">no preview</span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-2">
                    <div className="flex items-center gap-1">
                      {c.linked ? <span title="Attached">📎</span> : null}
                      {c.number_matches ? (
                        <span className="rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300">
                          SAME NUMBER
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[11px] text-zinc-200">
                      {c.read_invoice_no || "number not read"}
                    </div>
                    <div className="truncate font-mono text-[11px] text-amber-300/90">
                      {money(c.read_amount, c.read_currency || currency) || "total not read"}
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">
                      {c.photo_date ? String(c.photo_date).slice(0, 10) : "no date"}
                      {c.store_code ? ` · ${c.store_code}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-white/10 pt-3">
            {current?.linked ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/15 px-2 py-1.5 text-center text-xs text-sky-200">
                  📎 Attached to {invoiceNo}
                </div>
                <button
                  type="button"
                  disabled={attachBusy === showing}
                  onClick={() => onDetach(showing)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
                >
                  Detach
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!showing || attachBusy === showing}
                onClick={() => onAttach(showing)}
                className="w-full rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-100 disabled:opacity-40"
              >
                {attachBusy === showing ? "Attaching…" : "📎 Attach the one on screen"}
              </button>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">
              {/* The number is strong evidence but it is a reading, not a fact —
                  the whole reason this screen exists is that readings are wrong. */}
              SAME NUMBER means the number read off that picture matches this
              invoice. Check the total on the paper before attaching.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
