"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SearchComboboxItem = {
  id: string | number;
  label: string;
  meta?: string;
  price?: number;
};

type SearchComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: SearchComboboxItem) => void;
  items: SearchComboboxItem[];
  placeholder?: string;
  currency?: string;
  className?: string;
};

export default function SearchCombobox({
  value,
  onChange,
  onSelect,
  items,
  placeholder,
  currency = "AED",
  className,
}: SearchComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const visibleItems = useMemo(() => items.slice(0, 8), [items]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder || "検索..."}
          className="h-8 w-full rounded-lg border border-white/15 bg-white/5 py-1.5 pl-8 pr-8 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/50"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && visibleItems.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-violet-500/20 bg-[#15142a] shadow-2xl shadow-black/40">
          <div className="border-b border-white/5 px-3 py-1.5 text-[10px] text-zinc-500">
            {visibleItems.length}件の候補
          </div>
          {visibleItems.map((item) => {
            const lowerLabel = item.label.toLowerCase();
            const lowerValue = value.toLowerCase();
            const matchIndex = lowerValue ? lowerLabel.indexOf(lowerValue) : -1;
            return (
              <button
                key={item.id}
                type="button"
                className="group flex w-full items-center justify-between px-3 py-2 text-left hover:bg-violet-500/10"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-white group-hover:text-violet-200">
                    {matchIndex >= 0 ? (
                      <>
                        <span>{item.label.slice(0, matchIndex)}</span>
                        <span className="font-semibold text-violet-300">
                          {item.label.slice(matchIndex, matchIndex + value.length)}
                        </span>
                        <span>{item.label.slice(matchIndex + value.length)}</span>
                      </>
                    ) : (
                      item.label
                    )}
                  </div>
                  {item.meta ? <div className="truncate text-[10px] text-zinc-500">{item.meta}</div> : null}
                </div>
                {typeof item.price === "number" ? (
                  <span className="ml-3 shrink-0 text-xs font-mono text-violet-300">
                    {currency} {item.price.toFixed(4)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
