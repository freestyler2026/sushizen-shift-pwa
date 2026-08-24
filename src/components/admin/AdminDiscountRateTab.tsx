"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_LABEL, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const STANDARD_PCT = 50;

type RateRow = {
  id?: number;
  city: string;
  platform: string;
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

export default function AdminDiscountRateTab() {
  const [rows, setRows] = useState<Record<string, RateRow>>({});
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [loading, setLoading] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(todayISO());

  const key = (city: string, platform: string) => `${city}:${platform}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/aggregator-discount-rates?city=all", {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const map: Record<string, RateRow> = {};
      for (const r of data.rates ?? []) map[key(r.city, r.platform)] = r;
      setRows(map);
      const initEdits: Record<string, EditState> = {};
      for (const ag of AGGREGATORS) {
        const k = key(ag.city, ag.platform);
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

  const setEdit = (k: string, patch: Partial<EditState>) =>
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const save = async (city: string, platform: string) => {
    const k = key(city, platform);
    const e = edits[k];
    if (!e) return;
    const pct = parseFloat(e.discount_pct.trim());
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setEdit(k, { error: "0〜100の数値を入力してください" });
      return;
    }
    setEdit(k, { saving: true, error: null, saved: false });
    try {
      const res = await fetch("/api/admin/aggregator-discount-rates", {
        method: "POST",
        headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ city, platform, discount_pct: pct, effective_date: effectiveDate, notes: e.notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows((prev) => ({
        ...prev,
        [k]: { city, platform, discount_pct: data.discount_pct, effective_date: data.effective_date, notes: e.notes },
      }));
      setEdit(k, { saving: false, saved: true, discount_pct: String(data.discount_pct) });
      setTimeout(() => setEdit(k, { saved: false }), 2000);
    } catch (err) {
      setEdit(k, { saving: false, error: String(err) });
    }
  };

  const isNonStandard = (pct: string | number | null | undefined) => {
    if (pct == null || pct === "") return false;
    return Number(pct) !== STANDARD_PCT;
  };

  const dubaiRows = AGGREGATORS.filter((a) => a.city === "dubai");
  const manilaRows = AGGREGATORS.filter((a) => a.city === "manila");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Loading discount rates…
      </div>
    );
  }

  const renderSection = (city: "dubai" | "manila", list: typeof AGGREGATORS) => (
    <div className={`${GLASS_CARD} mb-6`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{CITY_FLAGS[city]}</span>
        <h3 className="font-semibold text-base">{CITY_LABEL[city]}</h3>
      </div>
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
            {list.map((ag) => {
              const k = key(ag.city, ag.platform);
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
                      onClick={() => save(ag.city, ag.platform)}
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
    </div>
  );

  const alertCount = AGGREGATORS.filter((ag) => {
    const existing = rows[key(ag.city, ag.platform)];
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

      {renderSection("dubai", dubaiRows)}
      {renderSection("manila", manilaRows)}

      <p className={`${T_CAPTION} opacity-60 text-xs mt-2`}>
        Standard is 50% off. Values other than 50% are shown in red.
        Each save records a new entry for the selected effective date.
      </p>
    </div>
  );
}
