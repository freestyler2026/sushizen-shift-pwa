"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

const STANDARD_PCT = 50;

type RateRow = {
  id?: number;
  city: string;
  platform: string;
  brand: string;
  discount_pct: number | null;
  effective_date: string;
  notes: string;
  updated_at?: string;
};

type EditState = {
  discount_pct: string;
  notes: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

const AGGREGATORS: { city: "dubai" | "manila"; platform: string; label: string }[] = [
  { city: "dubai",  platform: "careem",    label: "Careem"     },
  { city: "dubai",  platform: "noon",      label: "Noon"       },
  { city: "dubai",  platform: "talabat",   label: "Talabat"    },
  { city: "dubai",  platform: "keeta",     label: "Keeta"      },
  { city: "dubai",  platform: "smiles",    label: "Smiles"     },
  { city: "manila", platform: "grabfood",  label: "Grab Food"  },
  { city: "manila", platform: "foodpanda", label: "Food Panda" },
];

// Dubai negotiates each aggregator's discount per brand, so a rate is keyed by
// (city, platform, brand). Manila is not split and uses the empty brand.
const DUBAI_BRANDS = [
  { brand: "sushi_zen",  label: "Sushi ZEN"        },
  { brand: "ramen_zen",  label: "Ramen ZEN"        },
  { brand: "all_veggie", label: "All Veggie Sushi" },
];
const NO_BRAND = [{ brand: "", label: "" }];

const brandsFor = (city: string) => (city === "dubai" ? DUBAI_BRANDS : NO_BRAND);

const BRAND_LABEL: Record<string, string> = Object.fromEntries(
  DUBAI_BRANDS.map((b) => [b.brand, b.label]),
);

// Every editable cell on the page: one per aggregator per brand.
const CELLS = AGGREGATORS.flatMap((ag) =>
  brandsFor(ag.city).map((b) => ({ ...ag, brand: b.brand })),
);

const CITY_FLAGS: Record<string, string> = { dubai: "🇦🇪", manila: "🇵🇭" };
const CITY_LABEL: Record<string, string> = { dubai: "Dubai", manila: "Manila" };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatUpdatedAt(ts: string | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type HistoryRow = {
  id: number;
  city: string;
  platform: string;
  brand: string;
  discount_pct: number;
  effective_date: string;
  notes: string;
  updated_at: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  careem: "Careem", noon: "Noon", talabat: "Talabat",
  keeta: "Keeta", smiles: "Smiles", grabfood: "Grab Food", foodpanda: "Food Panda",
};

export default function AdminDiscountRateTab() {
  const [rows, setRows] = useState<Record<string, RateRow>>({});
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [loading, setLoading] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");

  // Brand is part of the key — without it Dubai's three brands would share one
  // row of state and overwrite each other.
  const key = (city: string, platform: string, brand: string) =>
    `${city}:${platform}:${brand ?? ""}`;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/aggregator-discount-rates/history?city=all&limit=200", {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch {
      // leave empty on error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/aggregator-discount-rates?city=all", {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const map: Record<string, RateRow> = {};
      for (const r of data.rates ?? []) map[key(r.city, r.platform, r.brand ?? "")] = r;
      setRows(map);
      const initEdits: Record<string, EditState> = {};
      for (const cell of CELLS) {
        const k = key(cell.city, cell.platform, cell.brand);
        const existing = map[k];
        initEdits[k] = {
          discount_pct: existing?.discount_pct != null ? String(existing.discount_pct) : "",
          notes: existing?.notes ?? "",
          saving: false,
          saved: false,
          error: null,
        };
      }
      setEdits(initEdits);
    } catch {
      // leave empty on load error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  const setEdit = (k: string, patch: Partial<EditState>) =>
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const save = async (city: string, platform: string, brand: string) => {
    const k = key(city, platform, brand);
    const e = edits[k];
    if (!e) return;
    const pct = parseFloat(e.discount_pct.trim());
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setEdit(k, { error: "Enter a number between 0 and 100" });
      return;
    }
    setEdit(k, { saving: true, error: null, saved: false });
    try {
      const res = await fetch("/api/admin/aggregator-discount-rates", {
        method: "POST",
        headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city, platform, brand, discount_pct: pct, effective_date: effectiveDate, notes: e.notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows((prev) => ({
        ...prev,
        [k]: {
          city, platform, brand,
          discount_pct: data.discount_pct,
          effective_date: data.effective_date,
          notes: e.notes,
        },
      }));
      setEdit(k, { saving: false, saved: true, discount_pct: String(data.discount_pct) });
      setTimeout(() => setEdit(k, { saved: false }), 2000);
      if (showHistory) loadHistory();
    } catch (err) {
      setEdit(k, { saving: false, error: String(err) });
    }
  };

  const isNonStandard = (pct: string | number | null | undefined) => {
    if (pct == null || pct === "") return false;
    return Number(pct) !== STANDARD_PCT;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Loading discount rates…
      </div>
    );
  }

  const renderTable = (city: "dubai" | "manila", brand: string) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            <th className={`text-left py-2 pl-3 pr-4 ${T_LABEL} font-medium`}>Aggregator</th>
            <th className={`text-left py-2 pr-4 ${T_LABEL} font-medium`}>Discount %</th>
            <th className={`text-left py-2 pr-4 ${T_LABEL} font-medium`}>Last Updated</th>
            <th className={`text-left py-2 pr-4 ${T_LABEL} font-medium`}>Notes</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {AGGREGATORS.filter((a) => a.city === city).map((ag) => {
            const k = key(ag.city, ag.platform, brand);
            const e = edits[k] ?? { discount_pct: "", notes: "", saving: false, saved: false, error: null };
            const existing = rows[k];
            const savedPct = existing?.discount_pct;
            const nonStandard = isNonStandard(savedPct);
            const inputNonStandard = isNonStandard(e.discount_pct);

            return (
              <tr key={k} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="py-3 pl-3 pr-4 font-medium">
                  <span className={nonStandard ? "text-red-400 font-semibold" : ""}>{ag.label}</span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={e.discount_pct}
                      onChange={(ev) => setEdit(k, { discount_pct: ev.target.value, saved: false, error: null })}
                      placeholder="50"
                      className={[
                        "w-20 px-2 py-1 rounded border text-sm bg-transparent focus:outline-none focus:ring-1",
                        inputNonStandard && e.discount_pct !== ""
                          ? "border-red-500 text-red-400 focus:ring-red-500"
                          : "border-white/20 focus:ring-white/30",
                      ].join(" ")}
                    />
                    <span className={`${T_CAPTION} ${inputNonStandard && e.discount_pct !== "" ? "text-red-400" : ""}`}>%</span>
                    {savedPct != null && (
                      <span
                        className={`ml-1 text-xs font-semibold px-1.5 py-0.5 rounded ${
                          nonStandard ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {nonStandard ? `${savedPct}% ⚠` : `${savedPct}% ✓`}
                      </span>
                    )}
                  </div>
                  {e.error && <p className="text-red-400 text-xs mt-1">{e.error}</p>}
                </td>
                <td className={`py-3 pr-4 ${T_CAPTION}`}>
                  {existing?.updated_at
                    ? formatUpdatedAt(existing.updated_at)
                    : <span className="opacity-40">—</span>}
                  {existing?.effective_date && (
                    <div className="opacity-60">{formatDate(existing.effective_date)}</div>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <input
                    type="text"
                    value={e.notes}
                    onChange={(ev) => setEdit(k, { notes: ev.target.value })}
                    placeholder="Notes"
                    className="w-full px-2 py-1 rounded border border-white/20 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                </td>
                <td className="py-3">
                  <button
                    onClick={() => save(ag.city, ag.platform, brand)}
                    disabled={e.saving || e.discount_pct.trim() === ""}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      e.saved
                        ? "bg-green-500/20 text-green-400"
                        : "bg-white/10 hover:bg-white/20 disabled:opacity-40"
                    }`}
                  >
                    {e.saving ? "…" : e.saved ? "Saved ✓" : "Save"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderSection = (city: "dubai" | "manila") => {
    const brands = brandsFor(city);
    return (
      <div className={`${GLASS_CARD} mb-6`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">{CITY_FLAGS[city]}</span>
          <h3 className="font-semibold text-base">{CITY_LABEL[city]}</h3>
        </div>
        {brands.map((b, i) => (
          <div key={b.brand} className={i > 0 ? "mt-6" : ""}>
            {b.label && (
              <h4 className={`${T_LABEL} font-semibold mb-2 pl-3`}>{b.label}</h4>
            )}
            {renderTable(city, b.brand)}
          </div>
        ))}
      </div>
    );
  };

  const alertCount = CELLS.filter((cell) => {
    const existing = rows[key(cell.city, cell.platform, cell.brand)];
    return existing?.discount_pct != null && isNonStandard(existing.discount_pct);
  }).length;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold">Aggregator Discount Rates</h2>
          <p className={`${T_CAPTION} mt-0.5`}>
            Standard rate: <span className="text-green-400 font-medium">50% off</span>
            {alertCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">
                {alertCount} aggregator{alertCount > 1 ? "s" : ""} non-standard
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${T_CAPTION}`}>Effective date</span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="px-2 py-1 rounded border border-white/20 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          <button
            onClick={load}
            className="px-3 py-1 rounded border border-white/20 text-sm hover:bg-white/10 transition"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {alertCount > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          ⚠ Non-standard discount detected — check aggregator portals and update accordingly.
        </div>
      )}

      {renderSection("dubai")}
      {renderSection("manila")}

      {/* Change History */}
      <div className="mt-2">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors"
        >
          <span>{showHistory ? "▾" : "▸"}</span>
          <span>Change History</span>
          {history.length > 0 && (
            <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded">{history.length}</span>
          )}
        </button>

        {showHistory && (
          <div className={`${GLASS_CARD} mt-3`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-sm">All Entries</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Filter by aggregator…"
                  className="px-2 py-1 rounded border border-white/20 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30 w-44"
                />
                <button
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="px-2 py-1 rounded border border-white/20 text-xs hover:bg-white/10 transition disabled:opacity-40"
                >
                  {historyLoading ? "…" : "↺"}
                </button>
              </div>
            </div>

            {historyLoading ? (
              <p className={`${T_CAPTION} py-4 text-center`}>Loading…</p>
            ) : history.length === 0 ? (
              <p className={`${T_CAPTION} py-4 text-center opacity-50`}>No history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className={`text-left py-2 pl-2 pr-3 ${T_LABEL} font-medium`}>Date</th>
                      <th className={`text-left py-2 pr-3 ${T_LABEL} font-medium`}>City</th>
                      <th className={`text-left py-2 pr-3 ${T_LABEL} font-medium`}>Brand</th>
                      <th className={`text-left py-2 pr-3 ${T_LABEL} font-medium`}>Aggregator</th>
                      <th className={`text-right py-2 pr-3 ${T_LABEL} font-medium`}>Rate</th>
                      <th className={`text-left py-2 pr-3 ${T_LABEL} font-medium`}>Notes</th>
                      <th className={`text-left py-2 ${T_LABEL} font-medium`}>Recorded at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history
                      .filter((h) => {
                        if (!historyFilter.trim()) return true;
                        const q = historyFilter.toLowerCase();
                        const label = (PLATFORM_LABEL[h.platform] ?? h.platform).toLowerCase();
                        const brand = (BRAND_LABEL[h.brand] ?? h.brand ?? "").toLowerCase();
                        return label.includes(q) || h.city.includes(q) || h.platform.includes(q) || brand.includes(q);
                      })
                      .map((h) => {
                        const nonStd = h.discount_pct !== STANDARD_PCT;
                        return (
                          <tr key={h.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-2 pl-2 pr-3 tabular-nums">{formatDate(h.effective_date)}</td>
                            <td className="py-2 pr-3">
                              <span>{CITY_FLAGS[h.city] ?? ""} {CITY_LABEL[h.city] ?? h.city}</span>
                            </td>
                            <td className={`py-2 pr-3 ${h.brand ? "" : "opacity-40"}`}>
                              {BRAND_LABEL[h.brand] ?? (h.brand || "—")}
                            </td>
                            <td className="py-2 pr-3 font-medium">{PLATFORM_LABEL[h.platform] ?? h.platform}</td>
                            <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${nonStd ? "text-red-400" : "text-green-400"}`}>
                              {h.discount_pct}%
                            </td>
                            <td className={`py-2 pr-3 ${T_CAPTION} opacity-70`}>{h.notes || "—"}</td>
                            <td className={`py-2 ${T_CAPTION} opacity-50`}>{formatUpdatedAt(h.updated_at)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <p className={`${T_CAPTION} opacity-60 text-xs mt-3`}>
        Standard is 50% off. Values other than 50% are shown in red.
        Dubai rates are set per brand; each save records a new entry for the selected effective date.
      </p>
    </div>
  );
}
