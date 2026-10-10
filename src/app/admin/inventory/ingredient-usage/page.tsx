"use client";

// What the food sold in a period was actually made of, and what was bought for
// it in the same period.
//
// The calculation already existed and Dubai has run on it since March; nothing
// on the front end ever called it. The two things this screen has to be honest
// about are on the page, not in a footnote:
//   * how much of what was sold has a recipe at all (77% of Manila units)
//   * which lines cannot be compared with purchases, and why

import { isoDate } from "@/lib/date";
import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import SelectDark from "@/components/SelectDark";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet } from "@/lib/inventoryClient";

type UsageRow = {
  item_name: string;
  sku: string;
  category: string;
  supplier: string;
  used_qty: number;
  unit: string;
  used_value: number;
  bought_qty: number | null;
  bought_amount: number;
  difference: number | null;
  compare_status: "ok" | "partial" | "not_linked" | "not_ordered_here" | "unit_unknown";
  unconvertible_units: string[];
  in_par_list: boolean;
  // On the shelf now, in recipe units. Store and CK are counted daily; the
  // warehouse is counted every 77 days at the ninetieth percentile, so it is
  // kept apart rather than added in — a four-month-old warehouse figure read
  // as today's stock said a branch held 653 kg of tuna.
  stock_qty: number | null;
  stock_store_qty: number | null;
  stock_ck_qty: number | null;
  stock_wh_qty: number | null;
  stock_wh_counted_on: string;
  stock_counted_on: string;
  stock_counted_where: string[];
  stock_status: "ok" | "no_map" | "no_conversion" | "no_count";
  awaiting_pack_size: string[];
  days_cover: number | null;
  // Set when the branch has had no delivery of this item recorded for 30 days
  // while the recipes kept consuming it. The window is 30 days rather than the
  // dates on screen because Cubao, sharing a building with the Central Kitchen,
  // gets no delivery slip and enters a week at a time: over 30 days its kitchen
  // receipts carry one date against Paranaque's fourteen.
  unrecorded_intake: number;
  unrecorded_branches: string[];
  delivered_qty: number | null;
  // What the STORE's shelf had to supply, as opposed to `used_qty`, which is
  // every gram the sold dishes contain. Most raw ingredients disappear at the
  // Central Kitchen: the stores hold 0.1 kg of Ajinomoto against the CK's
  // 8.2 kg and ordered it twice in sixty days, because what arrives at a store
  // is the finished broth, not the seasoning in it. Comparing the full figure
  // against a store shelf reported deliveries as missing that were never due.
  store_used_qty: number;
  consumed_at: "store" | "store_and_ck" | "ck_only";
  // Which preparation carried it there. A bare number reads as "the store used
  // 13.9 kg of Ajinomoto"; naming Miso Ramen Base (5.8 kg) and Shoyu Ramen Base
  // (2.5 kg) — neither delivered to a store, both with their count rows
  // deactivated — tells the reader whether to fix the recipe or the stocktake.
  store_used_via: { name: string; qty: number }[];
};

// A preparation the Central Kitchen makes and the stores receive and count as
// an item of its own. This is where theory and the shelf actually meet: all 38
// of them have delivery records, which no raw ingredient inside them has.
type KitchenItem = {
  item_name: string;
  recipe_name: string;
  item_code: string;
  unit: string;
  used_qty: number;
  used_by_branch: Record<string, number>;
  delivered_qty: number | null;
  delivered_unit: string;
  ratio_pct: number | null;
  on_shelf: number | null;
  counted_on: string;
  days_cover: number | null;
};

// Something the Central Kitchen plans and makes, the stores count every day,
// and Cost Calculation has no item of that name. No recipe can consume it, so
// its theoretical use is always zero and it never appears in the table below.
// Found by hand on 2026-10-10 for Tonkotsu Broth — the CK had it on 53
// production plans and sent 512 kg in thirty days while the recipes consumed a
// differently-named item with no plans, no deliveries and no counts at all.
type UnnamedCkItem = {
  item_name: string;
  item_code: string;
  unit: string;
  section: string;
  counts: number;
  last_count: string;
  plans: number;
  last_plan: string;
  linked_in_code: boolean;
  linked_from: string[];
};

type Coverage = {
  products_sold: number;
  products_without_recipe: number;
  qty_sold: number;
  qty_without_recipe: number;
  covered_pct: number;
  missing: { item_name: string; qty: number }[];
};

type Payload = {
  ok: boolean;
  rows: UsageRow[];
  summary: {
    ingredients: number;
    used_value: number;
    comparable: number;
    not_linked: number;
    not_ordered_here: number;
    unit_unknown: number;
    used_value_not_linked: number;
    unrecorded_intake_rows: number;
    ck_only_rows: number;
    kitchen_items: number;
    unnamed_ck_items: number;
  };
  kitchen_items: KitchenItem[];
  unnamed_ck_items: UnnamedCkItem[];
  coverage: Coverage;
  invoices_through: string;
  invoices_behind: boolean;
  usage_days: number;
  period_days: number;
  usage_partial: boolean;
  mapping_conflicts: { description: string; ingredients: string }[];
};

const BRANCHES = [
  { value: "", label: "All branches" },
  { value: "TAFT", label: "Taft" },
  { value: "PAR", label: "Paranaque" },
  { value: "CUB", label: "Cubao" },
];

// Why a line has no difference figure. Written as the thing that is missing,
// not as a code, because the person reading it is deciding whether to trust
// the row (lesson 9 — a rule that is not on the screen is not believed).
const STATUS_NOTE: Record<UsageRow["compare_status"], string> = {
  ok: "",
  partial: "Part of it came on an invoice whose pack size is not on file",
  // These two look the same on screen but mean opposite jobs: one is a normal
  // week with no delivery, the other is an ingredient nobody has ever linked to
  // a purchase item. Saying "not ordered" for both would send someone looking
  // for a delivery that was never going to exist.
  not_ordered_here: "No invoice for it in these dates — it is linked, just not billed here",
  not_linked: "Not linked to an invoice item — add it in Cost Calculation → Invoice Mapping",
  unit_unknown: "Invoiced in a pack whose size is not on file",
};

// Why a line has no stock figure. Same rule as the difference column: name the
// missing thing, because that is what tells the reader who has to do what.
// Where the ingredient is actually consumed. "ck_only" is not a gap in the
// data: it is the normal case for flour, pork bones and seasonings, and the
// reason those rows carry no days-left figure.
const WHERE_NOTE: Record<UsageRow["consumed_at"], string> = {
  store: "",
  store_and_ck: "",
  ck_only: "Used at the Central Kitchen, not on a store shelf",
};

const STOCK_NOTE: Record<UsageRow["stock_status"], string> = {
  ok: "",
  no_map: "Not linked to a counted item yet",
  no_conversion: "Linked, but nobody has recorded what one pack holds",
  no_count: "Linked, but this item has not been counted",
};

function iso(d: Date) {
  return isoDate(d);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}
function num(n: number | null | undefined, digits = 1) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// Recipes are written in grams, so a week reads as 201,625 g. Nobody buys or
// counts in that, so show kg past a kilo and keep the sign.
function qty(n: number | null | undefined, unit: string) {
  if (n == null) return "—";
  const u = (unit || "").toLowerCase();
  if (u === "g" && Math.abs(n) >= 1000) return `${num(n / 1000, 2)} kg`;
  if (u === "ml" && Math.abs(n) >= 1000) return `${num(n / 1000, 2)} L`;
  return `${num(n, u === "g" || u === "ml" ? 0 : 2)} ${unit}`;
}

export default function IngredientUsagePage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">((auth?.city as "manila" | "dubai") || "manila");
  const [branch, setBranch] = useState("");
  // 30 days, not 7: invoices arrive about a week late, so a 7-day view is
  // mostly blank Invoiced cells — and rice bought monthly never appears.
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(daysAgo(1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [showKitchen, setShowKitchen] = useState(false);
  const [showUnnamed, setShowUnnamed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity(((resolved?.city || auth?.city || "manila") as "manila" | "dubai"));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [auth]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ city, date_from: dateFrom, date_to: dateTo, branch_code: branch });
        const res = await inventoryGet<Payload>(`/api/admin/inventory/ingredient-usage?${qs.toString()}`);
        if (!cancelled) setData(res);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, branch, city, dateFrom, dateTo, ready]);

  if (!ready) return <div className="text-sm text-neutral-500">Loading…</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  const cov = data?.coverage;
  const rows = (data?.rows || []).filter((r) => !onlyGaps || r.compare_status !== "ok");
  const kitchen = data?.kitchen_items || [];
  const unnamed = data?.unnamed_ck_items || [];

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Ingredients Used by Sales</div>
            <div className="mt-1 max-w-2xl text-sm text-neutral-400">
              What the food sold in this period was made of, worked out from the recipes,
              next to what was ordered for it. Read it to decide what to buy — the
              difference column is a starting point, not a stock figure.
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            {loading ? "Loading…" : `${data?.summary.ingredients ?? 0} ingredients`}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-400">
            <div className="mb-1">City</div>
            <SelectDark
              value={city}
              onChange={(v) => setCity(v as "manila" | "dubai")}
              options={[{ value: "manila", label: "Manila" }, { value: "dubai", label: "Dubai" }]}
              aria-label="City"
            />
          </label>
          <label className="text-xs text-neutral-400">
            <div className="mb-1">Branch</div>
            <SelectDark value={branch} onChange={setBranch} options={BRANCHES} aria-label="Branch" />
          </label>
          <label className="text-xs text-neutral-400">
            <div className="mb-1">From</div>
            <input
              type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
          <label className="text-xs text-neutral-400">
            <div className="mb-1">To</div>
            <input
              type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => { setDateFrom(daysAgo(d)); setDateTo(daysAgo(1)); }}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Last {d} days
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* How much of what was sold this covers. A number that quietly describes
          three quarters of the sales is worse than no number (lesson 58). */}
      {cov && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-amber-200">
              <strong>{cov.covered_pct}%</strong> of the {num(cov.qty_sold, 0)} items sold in this
              period have a recipe. The rest is not in the figures below.
              {cov.products_without_recipe > 0 && (
                <> <span className="text-amber-300/80">
                  {cov.products_without_recipe} product{cov.products_without_recipe !== 1 ? "s" : ""}
                  {" "}({num(cov.qty_without_recipe, 0)} sold) have none.
                </span></>
              )}
            </div>
            {cov.products_without_recipe > 0 && (
              <button
                onClick={() => setShowMissing((v) => !v)}
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/15"
              >
                {showMissing ? "Hide the list" : "Which products?"}
              </button>
            )}
          </div>
          {showMissing && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-amber-500/20">
              <table className="w-full text-xs">
                <thead className="bg-amber-500/10 text-amber-200/70">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product sold</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.missing.map((m) => (
                    <tr key={m.item_name} className="border-t border-amber-500/10">
                      <td className="px-3 py-1.5 text-neutral-200">{m.item_name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{num(m.qty, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-amber-200/60">
            Add a recipe in Cost Calculation to bring a product into this screen.
          </div>
        </section>
      )}

      {/* Two things that make the Invoiced column wrong if nobody says them out
          loud: invoices arrive days late, and one bad mapping row silently
          removes an ingredient from the comparison entirely. */}
      {data && (data.usage_partial || data.invoices_behind || data.mapping_conflicts.length > 0) && (
        <section className="space-y-2">
          {data.usage_partial && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
              These figures cover <strong>{data.usage_days} of the {data.period_days} days</strong> in
              this period. The rest has not been worked out yet — it fills in overnight, a day at a
              time. Totals here are for the days that exist, not the whole period.
            </div>
          )}
          {data.invoices_behind && (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-200">
              Invoices are entered up to <strong>{data.invoices_through}</strong>, which is before
              the end of this period. Anything billed after that is not in the Invoiced column
              yet — the differences for recent days will look larger than they are.
            </div>
          )}
          {data.mapping_conflicts.map((c) => (
            <div key={c.description}
                 className="rounded-xl border border-orange-500/25 bg-orange-500/[0.06] px-4 py-3 text-sm text-orange-200">
              <strong>“{c.description}”</strong> is linked to more than one ingredient
              ({c.ingredients}), so its invoices are left out of the comparison rather than
              guessed at. Fix it in <strong>Cost Calculation → Invoice Mapping → Registered
              Mappings</strong> and this ingredient comes back on its own.
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-300">
            {data && (
              <>
                <strong className="text-neutral-200">{data.summary.comparable}</strong> of{" "}
                {data.summary.ingredients} can be compared with invoices.{" "}
                <span className="text-neutral-500">
                  {data.summary.not_linked} are not linked to an invoice item
                  {data.summary.used_value_not_linked > 0
                    ? ` (${num(data.summary.used_value_not_linked, 0)} of use)`
                    : ""}
                  , {data.summary.not_ordered_here} had no invoice in these dates, and
                  {" "}{data.summary.unit_unknown} came in a pack whose size is not on file.
                </span>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-500"
            />
            Only rows that cannot be compared
          </label>
        </div>

        {/* The generalised form of what took a hand trace to find: the kitchen
            makes it, the stores count it daily, and Cost Calculation has no item
            of that name, so nothing can ever consume it. Kept as its own list
            because these items are invisible in the table below — a row that
            does not exist cannot look wrong. */}
        {unnamed.length > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.05] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-orange-100">
                  {unnamed.length} items the kitchen makes have no name in Cost Calculation
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-400">
                  The Central Kitchen puts these on its production plans and the stores
                  count them every day, but no Cost Calculation item carries the name.
                  No recipe can consume what has no name, so their theoretical use is
                  always zero and they are absent from every figure on this page. Add the
                  item in Cost Calculation under the name the kitchen and the count sheets
                  already use, and point the dishes at it.
                </p>
              </div>
              <button
                onClick={() => setShowUnnamed((v) => !v)}
                className="rounded-lg border border-orange-500/40 px-3 py-1.5 text-xs font-medium text-orange-100 hover:bg-orange-500/15"
              >
                {showUnnamed ? "Hide" : "Show the list"}
              </button>
            </div>
            {showUnnamed && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-orange-500/20">
                <table className="w-full text-xs">
                  <thead className="bg-orange-500/10 uppercase tracking-wide text-orange-200/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">Count sheet section</th>
                      <th className="px-3 py-2 text-right font-medium">Kitchen plans</th>
                      <th className="px-3 py-2 text-right font-medium">Counted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unnamed.map((u) => (
                      <tr key={u.item_code} className="border-t border-orange-500/10">
                        <td className="px-3 py-2 text-neutral-100">
                          {u.item_name}
                          <span className="ml-2 text-[10px] text-neutral-500">
                            {u.item_code} · {u.unit}
                          </span>
                          {u.linked_in_code && (
                            <div className="mt-0.5 text-[10px] text-sky-300/70">
                              Linked in code to {u.linked_from.join(", ")} so its figures
                              appear above — the name in Cost Calculation still needs fixing
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-400">{u.section || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                          {u.plans}
                          <div className="text-[10px] text-neutral-500">to {u.last_plan}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                          {u.counts}
                          <div className="text-[10px] text-neutral-500">to {u.last_count}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* The preparations the Central Kitchen makes and the stores receive and
            count as items of their own. This is the one place theory and the
            shelf are describing the same object: every one of these has delivery
            records, which no raw ingredient inside them has. A ratio near 100%
            means the recipe matches what the kitchen sends; the far-off rows are
            a list of recipes to check, not a stock problem. */}
        {kitchen.length > 0 && (
          <div className="rounded-xl border border-teal-500/25 bg-teal-500/[0.04] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-teal-100">
                  Kitchen-made items the stores stock
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-400">
                  The stores receive these ready-made and count them. Their raw
                  ingredients are the Central Kitchen&apos;s, so they are not expected
                  on a store shelf. Theory against what the kitchen delivered: a
                  ratio far from 100% means the recipe&apos;s quantity is not what the
                  kitchen actually sends.
                </p>
              </div>
              <button
                onClick={() => setShowKitchen((v) => !v)}
                className="rounded-lg border border-teal-500/40 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-500/15"
              >
                {showKitchen ? "Hide" : `Show ${kitchen.length} items`}
              </button>
            </div>
            {showKitchen && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-teal-500/20">
                <table className="w-full text-xs">
                  <thead className="bg-teal-500/10 uppercase tracking-wide text-teal-200/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Recipes used</th>
                      <th className="px-3 py-2 text-right font-medium">Kitchen sent</th>
                      <th className="px-3 py-2 text-right font-medium">Theory vs sent</th>
                      <th className="px-3 py-2 text-right font-medium">On shelf</th>
                      <th className="px-3 py-2 text-right font-medium">Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kitchen.map((k) => (
                      <tr key={k.item_code} className="border-t border-teal-500/10">
                        <td className="px-3 py-2 text-neutral-100">
                          {k.item_name}
                          {k.recipe_name !== k.item_name && (
                            <div className="mt-0.5 text-[10px] text-amber-300/70">
                              Cost Calculation calls it {k.recipe_name} — the two
                              names should match
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                          {qty(k.used_qty, k.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                          {k.delivered_qty == null
                            ? <span className="text-neutral-600">—</span>
                            : qty(k.delivered_qty, k.unit)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${
                          k.ratio_pct == null ? "text-neutral-600"
                            : k.ratio_pct < 50 || k.ratio_pct > 200
                              ? "text-orange-300" : "text-neutral-200"}`}>
                          {k.ratio_pct == null ? "—" : `${num(k.ratio_pct, 0)}%`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                          {k.on_shelf == null
                            ? <span className="text-neutral-600">—</span>
                            : qty(k.on_shelf, k.unit)}
                          {k.counted_on && (
                            <div className="text-[10px] text-neutral-500">
                              counted {k.counted_on}
                            </div>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${
                          k.days_cover == null ? "text-neutral-600"
                            : k.days_cover < 2 ? "text-orange-300" : "text-neutral-200"}`}>
                          {k.days_cover == null ? "—" : num(k.days_cover, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-xs">
            <thead className="bg-neutral-900/60 uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">Ingredient</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-right">Used</th>
                <th className="px-3 py-2 text-right">On shelf</th>
                <th className="px-3 py-2 text-right">Days left</th>
                <th className="px-3 py-2 text-right">Warehouse</th>
                <th className="px-3 py-2 text-right">Delivered</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Difference</th>
                <th className="px-3 py-2 text-right">Cost of use</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const note = STATUS_NOTE[r.compare_status];
                return (
                  <tr key={r.item_name} className="border-t border-neutral-800/70">
                    <td className="px-3 py-2 text-neutral-100">
                      {r.item_name}
                      {note && <div className="mt-0.5 text-[10px] text-neutral-500">{note}</div>}
                      {WHERE_NOTE[r.consumed_at] && (
                        <div className="mt-0.5 text-[10px] text-sky-300/70">
                          {WHERE_NOTE[r.consumed_at]}
                        </div>
                      )}
                      {r.stock_status !== "ok" && (
                        <div className="mt-0.5 text-[10px] text-amber-300/70">
                          {STOCK_NOTE[r.stock_status]}
                          {r.awaiting_pack_size.length > 0 &&
                            `: ${r.awaiting_pack_size.join(", ")}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">{r.supplier || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                      {/* The shelf has to supply the store-level figure, not every
                          gram the sold dishes contain. Where they differ, say where
                          the rest went instead of leaving two numbers unexplained. */}
                      {r.consumed_at === "ck_only" ? (
                        <span className="text-neutral-600">—</span>
                      ) : qty(r.store_used_qty, r.unit)}
                      {r.consumed_at !== "store" && (
                        <div className="mt-0.5 text-[10px] text-neutral-500">
                          {qty(r.used_qty, r.unit)} in the dishes sold
                          {r.store_used_via.length > 0 &&
                            ` · via ${r.store_used_via
                              .map((v) => `${v.name} ${qty(v.qty, r.unit)}`)
                              .join(", ")}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                      {r.stock_qty != null ? qty(r.stock_qty, r.unit) : (
                        <span className="text-neutral-600">—</span>
                      )}
                      {r.stock_qty != null && r.stock_counted_on && (
                        <div className="text-[10px] text-neutral-500">
                          counted {r.stock_counted_on}
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      r.days_cover == null ? "text-neutral-600"
                        : r.days_cover < 2 ? "text-orange-300" : "text-neutral-200"}`}>
                      {r.days_cover == null ? "—" : r.days_cover.toLocaleString(undefined,
                        { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                      {r.stock_wh_qty == null ? <span className="text-neutral-600">—</span>
                        : qty(r.stock_wh_qty, r.unit)}
                      {r.stock_wh_counted_on && (
                        <div className="text-[10px] text-neutral-500">
                          counted {r.stock_wh_counted_on}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={r.unrecorded_intake > 0 ? "text-orange-300" : "text-neutral-200"}>
                        {r.delivered_qty != null ? qty(r.delivered_qty, r.unit) : "—"}
                      </span>
                      {r.unrecorded_intake > 0 && (
                        <div className="text-[10px] text-orange-300/80">
                          nothing received in 30 days · used {qty(r.unrecorded_intake, r.unit)}
                          {r.unrecorded_branches.length > 0 && ` · ${r.unrecorded_branches.join(", ")}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                      {r.bought_qty != null ? qty(r.bought_qty, r.unit) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      r.difference == null ? "text-neutral-600"
                        : r.difference < 0 ? "text-orange-300" : "text-teal-300"}`}>
                      {r.difference == null ? "—" : qty(r.difference, r.unit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                      {num(r.used_value, 0)}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-neutral-500">
                    Nothing for this period. If sales exist but nothing shows here, the
                    overnight job has not run for these dates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          <strong className="text-neutral-400">Used</strong> is worked out from the recipes, not
          counted — it is what the sales should have consumed.
          <strong className="text-neutral-400"> Delivered</strong> is what was received at the
          branches in these dates, from suppliers and from the Central Kitchen alike. Where it is
          orange, that branch has had nothing of it delivered for thirty days while the recipes
          kept consuming it. Thirty days rather than the dates on screen: Cubao shares a building
          with the Central Kitchen, gets no delivery slip, and enters a week at a time — over
          thirty days its kitchen receipts carry one date against Paranaque&apos;s fourteen, so a
          short window says more about when somebody typed than about what arrived.
          <strong className="text-neutral-400"> On shelf</strong> is the last count at the
          branches and the Central Kitchen, converted into the recipe&apos;s unit; both are counted
          daily. <strong className="text-neutral-400">Warehouse</strong> is kept in its own
          column with its date because it is counted every 77 days, so adding it in would show a
          months-old figure as today&apos;s stock. <strong className="text-neutral-400">Days left</strong>
          divides what is on the shelf by the rate the recipes consumed it over these dates.
          <strong className="text-neutral-400"> Invoiced</strong> is what suppliers billed in the
          same dates, matched to the ingredient through the item mapping on Cost Calculation —
          the same mapping that carries the pack size (1 SACK = 25,000 g).
          A negative difference means more was used than ordered in these dates; over a short
          window that usually means it came out of stock already held.
          <br />
          <strong className="text-neutral-400">Invoices are counted across all of Manila</strong>,
          not just the branch selected above — the stores sell it, but CK and the warehouse buy
          most of it.
        </p>
      </section>
    </div>
  );
}
