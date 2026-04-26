"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Package, Tag, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_BODY } from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
type PriceResult = {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_unit: string;
  unit_price: number;
  unit_price_formula: string;
  invoice_item_description: string;
  invoice_supplier_name: string;
  invoice_unit: string;
  conversion_rule: string;
  supplier_name: string;
  purchase_unit: string;
  purchase_qty: number;
  purchase_price: number;
  price_updated_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchAuthHeaders(): Promise<Record<string, string>> {
  const auth = getAuth();
  const refreshed = await refreshAuthFromApi(auth);
  const token = refreshed?.accessToken || auth?.accessToken || "";
  const stepUp = refreshed?.stepUpToken || auth?.stepUpToken || "";
  if (!token) throw new Error("Please log in again.");
  return {
    Authorization: `Bearer ${token}`,
    ...(stepUp ? { "X-Step-Up-Token": stepUp } : {}),
  };
}

function fmt(n: number, dp = 4) {
  return n ? n.toFixed(dp) : "-";
}

function cityFromAuth(): string {
  const auth = getAuth();
  return (auth?.city || "dubai").toLowerCase() === "dubai" ? "dubai" : "manila";
}

// Group results by ingredient so each ingredient appears once with all its
// invoice mappings / supplier prices listed underneath.
type GroupedResult = {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_unit: string;
  unit_price: number;
  unit_price_formula: string;
  rows: PriceResult[];
};

function groupResults(items: PriceResult[]): GroupedResult[] {
  const map = new Map<string, GroupedResult>();
  for (const item of items) {
    if (!map.has(item.ingredient_id)) {
      map.set(item.ingredient_id, {
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name,
        ingredient_unit: item.ingredient_unit,
        unit_price: item.unit_price,
        unit_price_formula: item.unit_price_formula,
        rows: [],
      });
    }
    map.get(item.ingredient_id)!.rows.push(item);
  }
  return Array.from(map.values());
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PriceSearchPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("dubai");
  const [results, setResults] = useState<GroupedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve city from auth on mount
  useEffect(() => {
    setCity(cityFromAuth());
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string, c: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setMessage(trimmed.length === 0 ? "" : "Enter at least 2 characters.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const headers = await fetchAuthHeaders();
      const qs = new URLSearchParams({ city: c, q: trimmed }).toString();
      const res = await fetch(`/api/admin/cost/price-lookup?${qs}`, {
        method: "GET",
        cache: "no-store",
        headers,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Error (${res.status})`);
      const json = JSON.parse(text || "{}");
      const items: PriceResult[] = Array.isArray(json?.items) ? json.items : [];
      const grouped = groupResults(items);
      setResults(grouped);
      if (grouped.length === 0) setMessage(`No items found matching "${trimmed}".`);
    } catch (e: any) {
      setError(e?.message || String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query / city change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query, city), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, city, search]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currencyCode = city === "dubai" ? "AED" : "PHP";

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* City selector */}
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10">
            {(["dubai", "manila"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold uppercase transition-colors",
                  city === c
                    ? "bg-violet-600/60 text-white"
                    : "text-zinc-400 hover:text-white",
                ].join(" ")}
              >
                {c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
              </button>
            ))}
          </div>

          {/* Query input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by item name (e.g. TOM YUM PASTE)"
              className="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder-zinc-500 focus:border-violet-500/50 focus:outline-none"
            />
          </div>
        </div>

        {loading && (
          <p className={`mt-2 text-xs ${T_CAPTION}`}>Searching...</p>
        )}
        {error && (
          <div className="mt-2 flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
        {!loading && message && (
          <p className={`mt-2 text-xs ${T_CAPTION}`}>{message}</p>
        )}
        {!loading && results.length > 0 && (
          <p className={`mt-2 text-xs ${T_CAPTION}`}>{results.length} item{results.length !== 1 ? "s" : ""} found.</p>
        )}
      </div>

      {/* Results */}
      <div className="space-y-3">
        {results.map((group) => {
          const isExpanded = expandedIds.has(group.ingredient_id);
          const hasRows = group.rows.some(
            (r) => r.invoice_item_description || r.purchase_price > 0,
          );

          return (
            <div key={group.ingredient_id} className={`${GLASS_CARD} overflow-hidden`}>
              {/* Ingredient header */}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
                onClick={() => toggleExpand(group.ingredient_id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-4 w-4 shrink-0 text-violet-400" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white text-sm">
                      {group.ingredient_name}
                    </p>
                    <p className={`text-xs ${T_CAPTION}`}>
                      Unit: {group.ingredient_unit}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  {/* Cost unit price */}
                  <div className="text-right">
                    <p className={`text-[10px] uppercase tracking-wider ${T_CAPTION}`}>Unit Cost</p>
                    <p className="font-mono text-sm font-semibold text-violet-300">
                      {group.unit_price > 0
                        ? `${currencyCode} ${fmt(group.unit_price)}`
                        : <span className="text-zinc-500">Not set</span>}
                    </p>
                    {group.unit_price_formula && (
                      <p className="font-mono text-[10px] text-zinc-500">{group.unit_price_formula}</p>
                    )}
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
              </button>

              {/* Expanded: invoice + supplier price rows */}
              {isExpanded && (
                <div className="border-t border-white/8">
                  {!hasRows ? (
                    <p className={`px-4 py-3 text-xs ${T_CAPTION}`}>
                      No purchase data registered.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {group.rows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                          {/* Invoice item */}
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${T_CAPTION}`}>
                              Invoice Item
                            </p>
                            <p className={`text-xs ${T_BODY} break-words`}>
                              {row.invoice_item_description || "-"}
                            </p>
                            {row.invoice_unit && (
                              <p className={`text-[10px] ${T_CAPTION}`}>
                                Unit: {row.invoice_unit}
                              </p>
                            )}
                          </div>

                          {/* Supplier */}
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${T_CAPTION}`}>
                              Supplier
                            </p>
                            <p className={`flex items-center gap-1 text-xs ${T_BODY}`}>
                              <Tag className="h-3 w-3 text-violet-400 shrink-0" />
                              {row.supplier_name || row.invoice_supplier_name || "-"}
                            </p>
                          </div>

                          {/* Purchase price */}
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${T_CAPTION}`}>
                              Purchase Price
                            </p>
                            {row.purchase_price > 0 ? (
                              <>
                                <p className="font-mono text-sm font-semibold text-emerald-300">
                                  {currencyCode} {fmt(row.purchase_price, 2)}
                                </p>
                                <p className={`text-[10px] ${T_CAPTION}`}>
                                  {row.purchase_qty > 0
                                    ? `per ${row.purchase_qty} ${row.purchase_unit}`
                                    : row.purchase_unit}
                                </p>
                              </>
                            ) : (
                              <p className={`text-xs ${T_CAPTION}`}>No price data</p>
                            )}
                          </div>

                          {/* Conversion */}
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${T_CAPTION}`}>
                              Conversion Rule
                            </p>
                            <p className={`font-mono text-xs ${T_BODY}`}>
                              {row.conversion_rule || "-"}
                            </p>
                            {row.price_updated_at && (
                              <p className={`text-[10px] ${T_CAPTION}`}>
                                Updated: {new Date(row.price_updated_at).toLocaleDateString("en-GB")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
