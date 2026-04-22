"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { menuGet } from "@/lib/menuClient";

export type IngredientItemOption = {
  id: string;
  name: string;
  sku: string;
  storage_unit: string;
  ingredient_unit: string;
  cost: number;
  item_type?: string;
  /** "cost" when the item comes from the Cost Calculation ingredient_master */
  source?: string;
};

type IngredientItemSearchProps = {
  city: string;
  selectedOption: IngredientItemOption | null;
  onSelect: (option: IngredientItemOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

function optionLabel(option: IngredientItemOption | null) {
  if (!option) return "";
  const sku = String(option.sku || "").trim();
  return sku ? `${option.name} (${sku})` : option.name;
}

function itemTypeLabel(itemType: string | undefined) {
  const t = String(itemType || "").toUpperCase();
  if (t === "PRODUCT") return "CK Product";
  if (t === "COST_INGREDIENT") return "Cost Ingredient";
  return "Ingredient";
}

function itemTypeBadgeClass(itemType: string | undefined) {
  const t = String(itemType || "").toUpperCase();
  if (t === "PRODUCT") return "border-violet-800/80 bg-violet-950/40 text-violet-200";
  if (t === "COST_INGREDIENT") return "border-amber-800/80 bg-amber-950/30 text-amber-200";
  return "border-emerald-800/80 bg-emerald-950/30 text-emerald-200";
}

function matchesSelectionQuery(option: IngredientItemOption, query: string) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return false;
  const name = String(option.name || "").trim().toLowerCase();
  const sku = String(option.sku || "").trim().toLowerCase();
  const label = optionLabel(option).trim().toLowerCase();
  return needle === name || needle === sku || needle === label;
}

export default function IngredientItemSearch({
  city,
  selectedOption,
  onSelect,
  placeholder = "Search ingredient or CK product",
  disabled = false,
}: IngredientItemSearchProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(optionLabel(selectedOption));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<IngredientItemOption[]>(selectedOption ? [selectedOption] : []);
  const [error, setError] = useState("");

  const trimmedQuery = query.trim();

  useEffect(() => {
    setQuery(optionLabel(selectedOption));
    setOptions((current) => {
      if (!selectedOption || current.some((option) => option.id === selectedOption.id)) return current;
      return [selectedOption, ...current];
    });
  }, [selectedOption]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        qs.set("city", city);
        qs.set("include_products", "true");
        qs.set("limit", trimmedQuery ? "25" : "12");
        if (trimmedQuery) qs.set("q", trimmedQuery);
        const res = await menuGet<{ rows?: IngredientItemOption[] }>(`/api/admin/menu/ingredient-items?${qs.toString()}`);
        if (cancelled) return;
        const fetched = Array.isArray(res?.rows) ? res.rows.filter((row) => row?.id) : [];
        setOptions(selectedOption && !fetched.some((row) => row.id === selectedOption.id) ? [selectedOption, ...fetched] : fetched);
      } catch {
        if (!cancelled) {
          setOptions(selectedOption ? [selectedOption] : []);
          setError("Failed to load ingredient options.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmedQuery ? 200 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [city, trimmedQuery, selectedOption]);

  const visibleOptions = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return options;
    const starts = options.filter((option) => {
      const name = String(option.name || "").toLowerCase();
      const sku = String(option.sku || "").toLowerCase();
      return name.startsWith(q) || sku.startsWith(q);
    });
    const contains = options.filter((option) => {
      const name = String(option.name || "").toLowerCase();
      const sku = String(option.sku || "").toLowerCase();
      return (name.includes(q) || sku.includes(q)) && !starts.some((row) => row.id === option.id);
    });
    return [...starts, ...contains];
  }, [options, trimmedQuery]);

  function commitQuerySelection() {
    if (selectedOption || !visibleOptions.length) return;
    const exactMatch = visibleOptions.find((option) => matchesSelectionQuery(option, trimmedQuery));
    const next = exactMatch || (visibleOptions.length === 1 ? visibleOptions[0] : null);
    if (!next) return;
    onSelect(next);
    setQuery(optionLabel(next));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commitQuerySelection();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitQuerySelection();
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (selectedOption && next.trim() !== optionLabel(selectedOption)) {
            onSelect(null);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100"
      />
      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          {loading ? <div className="px-3 py-2 text-sm text-neutral-400">Loading...</div> : null}
          {!loading && error ? <div className="px-3 py-2 text-sm text-rose-300">{error}</div> : null}
          {!loading && !visibleOptions.length ? <div className="px-3 py-2 text-sm text-neutral-500">No matching ingredients found.</div> : null}
          {!loading
            ? visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(option);
                    setQuery(optionLabel(option));
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-3 border-t border-neutral-900 px-3 py-2 text-left first:border-t-0 hover:bg-neutral-900"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-100">{option.name}</div>
                    <div className="truncate text-xs text-neutral-500">{option.sku || "No SKU"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${itemTypeBadgeClass(option.item_type)}`}>
                    {itemTypeLabel(option.item_type)}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
