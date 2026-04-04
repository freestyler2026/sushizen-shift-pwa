"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { GLASS_CARD, INPUT_CLASS } from "@/lib/ui-tokens";

export type ProcurementSupplierSearchRow = {
  supplier_name: string;
  supplier_code?: string;
  market?: string;
  invoice_count?: number;
  spend_total?: number;
  latest_invoice_date?: string;
  currency?: string;
};

type Props = {
  onSelect: (item: ProcurementSupplierSearchRow) => void;
  market?: string;
  placeholder?: string;
  requestedBy?: string;
  pin?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

function money(value?: number, currency?: string) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

export default function SupplierSearchInput({
  onSelect,
  market = "",
  placeholder = "Search supplier",
  requestedBy = "",
  pin = "",
  value,
  onValueChange,
  className = "",
}: Props) {
  const fallbackRequestedBy = useMemo(() => defaultProcurementName(), []);
  const fallbackPin = useMemo(() => defaultProcurementPin(), []);
  const [inputValue, setInputValue] = useState(value ?? "");
  const [rows, setRows] = useState<ProcurementSupplierSearchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  useEffect(() => {
    const q = String(inputValue || "").trim();
    if (!q) {
      setRows([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ q, limit: "20" });
        if ((market || "").trim()) qs.set("market", market.trim());
        const res = await procurementJson<ProcurementSupplierSearchRow[]>(
          `/api/procurement/suppliers/search?${qs.toString()}`,
          { method: "GET" },
          requestedBy || fallbackRequestedBy,
          pin || fallbackPin,
        );
        const nextRows = Array.isArray(res) ? res : [];
        setRows(nextRows);
        setActiveIndex(nextRows.length ? 0 : -1);
        setOpen(true);
      } catch {
        setRows([]);
        setActiveIndex(-1);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fallbackPin, fallbackRequestedBy, inputValue, market, pin, requestedBy]);

  function applyValue(nextValue: string) {
    setInputValue(nextValue);
    onValueChange?.(nextValue);
  }

  function choose(item: ProcurementSupplierSearchRow) {
    applyValue(String(item.supplier_name || ""));
    setRows([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(item);
  }

  return (
    <div className={`relative ${className}`.trim()}>
      <input
        value={inputValue}
        onChange={(e) => {
          applyValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
          if (rows.length || String(inputValue || "").trim()) setOpen(true);
        }}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
          } else if (e.key === "Enter") {
            if (open && activeIndex >= 0 && rows[activeIndex]) {
              e.preventDefault();
              choose(rows[activeIndex]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={`${INPUT_CLASS} pr-10`}
      />
      {loading ? <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">...</div> : null}
      {open ? (
        <div className={`absolute z-20 mt-2 max-h-72 w-full overflow-y-auto ${GLASS_CARD} bg-neutral-950/95`}>
          {rows.length ? (
            rows.map((row, index) => (
              <button
                key={`${row.market || ""}:${row.supplier_name}:${index}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                className={`block w-full border-b border-white/5 px-4 py-3 text-left last:border-b-0 transition-colors duration-150 ${
                  index === activeIndex ? "bg-white/8" : "hover:bg-white/4"
                }`}
              >
                <div className="text-sm font-semibold text-white">{row.supplier_name || "-"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[money(row.spend_total, row.currency), `${Number(row.invoice_count || 0).toLocaleString()} invoices`, row.latest_invoice_date || ""].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">No suppliers yet — data will appear after invoices are imported</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
