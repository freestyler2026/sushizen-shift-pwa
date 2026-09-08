"use client";

/**
 * Ingredient ↔ ordering-catalogue map.
 *
 * The two lists name the same things differently — Cost Calculation says
 * `Sushi Box 12pcs - Cover`, the catalogue says `Sushi Box 12pc - Outside Box
 * (Cover)`. Renaming either side breaks the people who search it: recipes are
 * read by the kitchen, the catalogue is searched by whoever places the order.
 * So they stay as they are and this screen connects them.
 *
 * 88 of 206 ingredients linked themselves (identical once case, spacing and
 * `pcs`/`pc` are folded). What is left needs a person, because the difference
 * between "same item, written differently" and "different item, written
 * similarly" is not in the spelling: `CABBAGE WHITE` / `White Cabbage` is one
 * item and scores 0.54; `NOBASHI SHRIMP 16g` / `Nobashi Shrimp 1KG` is two and
 * scores 0.94.
 *
 * One decision per row, one tap. No form, no reason field — the ingredient and
 * the catalogue item are the whole record, and the person and the time come
 * from the session.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Link2, Loader2, Search, X } from "lucide-react";
import { ApiError, costJson } from "@/lib/costClient";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, INPUT_CLASS,
  T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
} from "@/lib/ui-tokens";

type Suggestion = {
  catalog_item_name: string;
  unit: string | null;
  unit_price: number;
  suppliers: number;
  score: number;
};
type Row = {
  ingredient_id: number;
  name: string;
  unit: string | null;
  unit_price: number;
  category: string | null;
  suggestions: Suggestion[];
};
type Review = {
  city: string;
  unmapped: number;
  with_suggestion: number;
  no_candidate: number;
  suggest_floor: number;
  items: Row[];
};
type DupGroup = {
  catalog_item_name: string;
  n: number;
  ingredients: { ingredient_id: number; name: string; unit: string | null;
                 unit_price: number; recipes: number }[];
};

const CITY = "manila";

export default function CatalogMapPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [dups, setDups] = useState<DupGroup[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  /** Rows settled in this session. Kept on screen rather than vanishing, so the
   *  link that was just made can still be undone from where it was made. */
  const [justLinked, setJustLinked] = useState<Record<number, string>>({});
  const [search, setSearch] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [r, d] = await Promise.all([
        costJson<Review>(`/api/cost/catalog-map/review?city=${CITY}&limit=400`),
        costJson<{ groups: DupGroup[] }>(`/api/cost/catalog-map/duplicates?city=${CITY}`),
      ]);
      setReview(r);
      setDups(d.groups || []);
      // Every catalogue name a row could be pointed at, for the rows that have
      // no suggestion. Gathered from the suggestions we already have plus the
      // names already linked, so no extra endpoint is needed.
      const names = new Set<string>();
      r.items.forEach((it) => it.suggestions.forEach((s) => names.add(s.catalog_item_name)));
      (d.groups || []).forEach((g) => names.add(g.catalog_item_name));
      setCatalog([...names].sort());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load the list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function link(ingredientId: number, catalogItemName: string) {
    setBusy(ingredientId);
    setErr("");
    try {
      await costJson(`/api/cost/catalog-map/link?city=${CITY}`, {
        method: "POST",
        body: JSON.stringify({ ingredient_id: ingredientId, catalog_item_name: catalogItemName }),
      });
      setJustLinked((p) => ({ ...p, [ingredientId]: catalogItemName }));
    } catch (e) {
      // A failed save must not look like a saved one (lesson 46).
      setErr(e instanceof ApiError ? e.message : "Could not save that link.");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => review?.items || [], [review]);
  const open = useMemo(() => rows.filter((r) => !justLinked[r.ingredient_id]), [rows, justLinked]);
  const withSugg = open.filter((r) => r.suggestions.length > 0);
  const without = open.filter((r) => r.suggestions.length === 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/admin/cost-calculation" className={`${T_CAPTION} mb-3 inline-flex items-center gap-1 hover:text-white`}>
        <ArrowLeft className="h-3.5 w-3.5" /> Cost Calculation
      </Link>
      <h1 className={T_PAGE_TITLE}>Ingredient ↔ ordering catalogue</h1>
      <p className={`${T_BODY} mt-2 max-w-2xl`}>
        The two lists spell the same items differently. Rather than renaming either — recipes
        are read by the kitchen, the catalogue is searched by whoever orders — they are linked
        here. Once an ingredient is linked, a price change in the catalogue can be checked
        against the recipe cost, and two ingredients pointing at the same catalogue item are
        the same thing registered twice.
      </p>

      {err && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-950/20 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Still to link", open.length, "ingredient(s) with no catalogue item"],
              ["Have a suggestion", withSugg.length, "one tap each"],
              ["Need a search", without.length, "nothing close enough to suggest"],
            ].map(([label, n, hint]) => (
              <div key={String(label)} className={`${GLASS_CARD} p-4`}>
                <div className={T_CAPTION}>{label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{n as number}</div>
                <div className={`${T_CAPTION} mt-0.5`}>{hint}</div>
              </div>
            ))}
          </div>

          {dups.length > 0 && (
            <div className={`${GLASS_CARD} mt-5 border-amber-400/30 p-4`}>
              <h2 className={`${T_SECTION} flex items-center gap-2 text-amber-200`}>
                <AlertTriangle className="h-4 w-4" />
                Same item registered twice ({dups.length})
              </h2>
              <p className={`${T_CAPTION} mt-1`}>
                These ingredients point at one catalogue item. This is the check that string
                matching cannot do — <span className="text-zinc-300">Napkin (Zen)</span> and{" "}
                <span className="text-zinc-300">Maxe Tissue</span> share no letters, but they
                share a supplier item.
              </p>
              <div className="mt-3 space-y-2">
                {dups.map((g) => (
                  <div key={g.catalog_item_name} className="rounded-lg border border-white/8 bg-white/3 p-2.5">
                    <div className={`${T_LABEL} text-amber-200`}>{g.catalog_item_name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {g.ingredients.map((i) => (
                        <span key={i.ingredient_id} className="text-[13px] text-zinc-300">
                          {i.name}
                          <span className="ml-1.5 text-zinc-500 tabular-nums">
                            ₱{Number(i.unit_price).toFixed(4)} / {i.unit} · {i.recipes} recipe(s)
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(justLinked).length > 0 && (
            <div className={`${GLASS_CARD} mt-5 border-emerald-400/25 p-4`}>
              <h2 className={`${T_SECTION} text-emerald-200`}>
                Linked just now ({Object.keys(justLinked).length})
              </h2>
              <p className={`${T_CAPTION} mt-1`}>
                Kept here until you refresh, so a wrong one can be undone from the same place.
              </p>
              <div className="mt-2 space-y-1">
                {rows.filter((r) => justLinked[r.ingredient_id]).map((r) => (
                  <div key={r.ingredient_id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-zinc-300">
                      {r.name} <span className="text-zinc-500">→</span>{" "}
                      <span className="text-emerald-200">{justLinked[r.ingredient_id]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void link(r.ingredient_id, "").then(() =>
                          setJustLinked((p) => {
                            const n = { ...p }; delete n[r.ingredient_id]; return n;
                          }));
                      }}
                      className="shrink-0 text-xs text-zinc-400 underline hover:text-white"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Section title={`Suggested — check before you tap (${withSugg.length})`}
                   hint={`Only matches at ${review ? Math.round(review.suggest_floor * 100) : 80}% or better are offered. Weaker guesses are not shown, because a wrong suggestion that gets tapped is worse than no suggestion.`}>
            {withSugg.map((r) => (
              <RowCard key={r.ingredient_id} row={r} busy={busy === r.ingredient_id}
                       onLink={(n) => void link(r.ingredient_id, n)} />
            ))}
          </Section>

          <Section title={`No close match — search for it (${without.length})`}
                   hint="Nothing in the catalogue was close enough to suggest. Either the wording is very different, or the item is genuinely not in the ordering list.">
            {without.map((r) => (
              <RowCard
                key={r.ingredient_id}
                row={r}
                busy={busy === r.ingredient_id}
                onLink={(n) => void link(r.ingredient_id, n)}
                searchValue={search[r.ingredient_id] || ""}
                onSearch={(v) => setSearch((p) => ({ ...p, [r.ingredient_id]: v }))}
                catalog={catalog}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className={T_SECTION}>{title}</h2>
      <p className={`${T_CAPTION} mb-3 mt-1 max-w-2xl`}>{hint}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RowCard({
  row, busy, onLink, searchValue, onSearch, catalog,
}: {
  row: Row;
  busy: boolean;
  onLink: (catalogItemName: string) => void;
  searchValue?: string;
  onSearch?: (v: string) => void;
  catalog?: string[];
}) {
  const q = (searchValue || "").trim().toLowerCase();
  const hits = q.length >= 2 && catalog
    ? catalog.filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
    : [];
  return (
    <div className={`${GLASS_CARD} p-3.5`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-white">{row.name}</span>
        <span className={`${T_CAPTION} tabular-nums`}>
          ₱{Number(row.unit_price).toFixed(4)} / {row.unit || "—"}
        </span>
        {row.category && <span className={T_CAPTION}>{row.category}</span>}
      </div>

      {row.suggestions.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {row.suggestions.map((s) => (
            <div key={s.catalog_item_name} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onLink(s.catalog_item_name)}
                className={`${PRIMARY_BUTTON} !px-3 !py-1.5 text-sm`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Link</span>
              </button>
              <span className="text-[13px] text-zinc-200">{s.catalog_item_name}</span>
              <span className={`${T_CAPTION} tabular-nums`}>
                {s.unit_price > 0 ? `₱${s.unit_price} / ${s.unit}` : "no price"}
                {s.suppliers > 1 ? ` · ${s.suppliers} suppliers` : ""}
              </span>
              {/* The score is shown, not hidden behind a threshold, so the person
                  can see how much the machine is guessing (lesson 9). */}
              <span className={`${T_CAPTION} tabular-nums`}>{Math.round(s.score * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {onSearch && (
        <div className="mt-2.5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchValue || ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search the catalogue…"
              className={`${INPUT_CLASS} !pl-8 text-sm`}
            />
          </div>
          {hits.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {hits.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => onLink(n)}
                  className={`${SECONDARY_BUTTON} !px-2.5 !py-1 mr-2 text-[13px]`}
                >
                  <Check className="mr-1 inline h-3 w-3" />{n}
                </button>
              ))}
            </div>
          )}
          {q.length >= 2 && hits.length === 0 && (
            <p className={`${T_CAPTION} mt-1.5`}>
              <X className="mr-1 inline h-3 w-3" />
              Nothing in the catalogue matches that. It may not be an ordered item.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
