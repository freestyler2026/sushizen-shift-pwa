"use client";

/**
 * The par the Daily Inventory count sheet shows, editable in the page.
 *
 * Until now the only way to change these numbers was to download an Excel
 * template, fill in a column and upload it back. That round trip is what this
 * replaces; the Excel import is still there for setting many at once.
 *
 * This is a different par from the one above it on this page. The table the
 * store catalogue above writes (`store_supplier_catalog`) drives what a store
 * orders from its suppliers; this one (`daily_inv_par_patterns`) is what the
 * count sheet prints beside each item, per branch and weekday. Four par systems
 * exist in this OS and the quickest way to a fifth is to assume two of them are
 * the same one, so both say on screen what they drive.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save, Search } from "lucide-react";

import SelectDark from "@/components/SelectDark";
import { withCity } from "@/lib/daily-inventory-city";
import { getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BADGE_INFO,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_SECTION,
} from "@/lib/ui-tokens";

type PatternItem = {
  item_code: string;
  item_name: string;
  default_unit: string;
  par_level: number | null;
};

type SaveResult = {
  written?: number;
  unchanged?: number;
  refused?: string[];
};

export default function CountSheetParEditor() {
  const [patterns, setPatterns] = useState<string[]>([]);
  const [pattern, setPattern] = useState("");
  const [rows, setRows] = useState<PatternItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    void fetch(API_BASE + withCity("/api/daily-inventory/par-patterns"), { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d: { patterns?: string[] }) => {
        const list = d.patterns || [];
        setPatterns(list);
        setPattern((p) => p || list[0] || "");
      })
      .catch(() => setError("Could not read the pattern list."));
  }, []);

  const load = useCallback(async () => {
    if (!pattern) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        API_BASE + withCity(`/api/daily-inventory/par-patterns/${encodeURIComponent(pattern)}/items`),
        { headers: getAuthHeaders() },
      );
      const d = (await res.json()) as { items?: PatternItem[] };
      setRows(d.items || []);
      setEdits({});
    } catch {
      setError("Could not read this pattern's items.");
    } finally {
      setLoading(false);
    }
  }, [pattern]);

  useEffect(() => {
    void load();
  }, [load]);

  // A "Saved 3" from one pattern must not sit above another one's numbers.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [pattern]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.item_name.toLowerCase().includes(q) || r.item_code.toLowerCase().includes(q),
    );
  }, [rows, search]);

  /** Only the rows whose number the person actually changed are sent. */
  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const typed = edits[r.item_code];
        if (typed === undefined) return false;
        const was = r.par_level == null ? "" : String(r.par_level);
        return typed.trim() !== was;
      }),
    [rows, edits],
  );

  async function save() {
    if (!changed.length) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        API_BASE + withCity(`/api/daily-inventory/par-patterns/${encodeURIComponent(pattern)}/items`),
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            items: changed.map((r) => ({
              item_code: r.item_code,
              par_level: edits[r.item_code].trim() === "" ? null : Number(edits[r.item_code]),
            })),
          }),
        },
      );
      if (!res.ok) {
        // A save that failed must not look like a save that worked: the old
        // screen reloaded the list either way and 403 read exactly like 200.
        setError(`Save failed (${res.status}).`);
        return;
      }
      setResult((await res.json()) as SaveResult);
      await load();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={GLASS_CARD + " p-4 space-y-4"}>
      <div>
        <h2 className={T_SECTION}>Count sheet par</h2>
        <p className="mt-1 text-xs text-zinc-400">
          What the Daily Inventory sheet prints beside each item, per branch and weekday.
          A branch pattern overrides the warehouse one for the same day. This is not the
          supplier ordering par above — that one decides what the store orders.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SelectDark
          className={SELECT_CLASS + " max-w-[240px]"}
          value={pattern}
          onChange={(v) => setPattern(v)}
          options={patterns.map((p) => ({ value: p, label: p.replace("_", " · ") }))}
        />
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className={INPUT_CLASS + " pl-9"}
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => void load()} className={SECONDARY_BUTTON + " flex items-center gap-2"} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className={BADGE_INFO}>
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => void save()}
          disabled={saving || !changed.length}
          className={PRIMARY_BUTTON + " flex items-center gap-2 disabled:opacity-40"}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {changed.length ? `Save ${changed.length} change${changed.length !== 1 ? "s" : ""}` : "Save"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3 text-sm text-emerald-300"
        >
          {/* The server's own count, not the number of rows sent, and built as
              one string so it reads as one sentence rather than five nodes. */}
          {[
            `Saved ${result.written ?? 0}.`,
            result.unchanged ? `${result.unchanged} were already that number.` : "",
            result.refused?.length
              ? `Not saved, because they are not this city's items: ${result.refused.join(", ")}.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-zinc-500">Loading…</div>
      ) : !filtered.length ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          {rows.length ? "No item matches that search." : "This pattern has no items yet."}
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-xl border border-white/8">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#101726]">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 w-20">Unit</th>
                <th className="px-3 py-2 w-28 text-right">Par</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const typed = edits[r.item_code];
                const value = typed !== undefined ? typed : r.par_level == null ? "" : String(r.par_level);
                const isChanged = changed.some((c) => c.item_code === r.item_code);
                return (
                  <tr key={r.item_code} className="border-t border-white/5">
                    <td className="px-3 py-2 text-zinc-200">
                      {r.item_name}
                      <span className="ml-2 text-[11px] text-zinc-600">{r.item_code}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.default_unit}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        aria-label={`Par level for ${r.item_name}`}
                        className={
                          INPUT_CLASS +
                          " text-right tabular-nums" +
                          (isChanged ? " border-amber-400/60 bg-amber-400/5" : "")
                        }
                        value={value}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [r.item_code]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
