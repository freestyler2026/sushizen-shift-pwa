"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type OptionItem = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: (string | OptionItem)[];
  placeholder?: string;
  className?: string;
  // When false (default), the X clear button is hidden — use for required fields
  // like city/branch selectors where an empty value is invalid.
  clearable?: boolean;
};

/**
 * Custom searchable dropdown that renders a dark-styled option list.
 * Replaces native <select> to fix Windows browser OS-native white popup.
 * Uses position:fixed so it escapes any overflow:hidden ancestor.
 */
export default function SelectDark({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  className = "",
  clearable = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  // Recompute fixed position whenever the dropdown opens or the page scrolls/resizes
  // useLayoutEffect runs before paint so there's no position flash on open
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Close on outside click — checks both trigger root and the portalled dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = rootRef.current?.contains(target);
      const inPortal = portalRef.current?.contains(target);
      if (!inTrigger && !inPortal) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const normalized = useMemo<OptionItem[]>(
    () => options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
    [options],
  );

  const selectedLabel = useMemo(
    () => normalized.find((o) => o.value === value)?.label ?? value,
    [normalized, value],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return normalized;
    return normalized.filter((o) => o.label.toLowerCase().includes(q));
  }, [normalized, query]);

  function select(opt: OptionItem) {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-left transition-all duration-200 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 cursor-pointer"
      >
        <span className={value ? "text-white" : "text-zinc-500"}>
          {value ? selectedLabel : placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => e.key === "Enter" && clear(e as unknown as React.MouseEvent)}
              className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown — portalled to document.body to escape backdrop-filter containing blocks */}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={portalRef} style={dropdownStyle} className="rounded-xl border border-violet-500/20 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">
          {/* Search input */}
          <div className="border-b border-white/8 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                if (e.key === "Enter" && filtered.length === 1) select(filtered[0]!);
              }}
              placeholder="Type to filter..."
              className="w-full rounded-lg border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-500">No results</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(opt)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-violet-500/15 hover:text-violet-200 ${
                    opt.value === value ? "bg-violet-500/20 text-violet-200 font-medium" : "text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-white/5 px-4 py-1.5 text-[11px] text-zinc-600">
              {filtered.length} of {normalized.length}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
