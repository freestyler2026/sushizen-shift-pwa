"use client";

// What the food sold in a period was actually made of, and what was bought for
// it in the same period.
//
// The calculation already existed and Dubai has run on it since March; nothing
// on the front end ever called it. The two things this screen has to be honest
// about are on the page, not in a footnote:
//   * how much of what was sold has a recipe at all (77% of Manila units)
//   * which lines cannot be compared with purchases, and why

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
  used_unit: string;
  order_unit: string;
  used_in_order_unit: number | null;
  used_value: number;
  bought_qty: number | null;
  bought_amount: number;
  difference: number | null;
  compare_status: "ok" | "partial" | "not_linked" | "not_ordered_here" | "unit_unknown";
  unconvertible_units: string[];
  in_par_list: boolean;
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
  };
  coverage: Coverage;
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
  partial: "Some of it was ordered in a pack with no size on file",
  // These two look the same on screen but mean opposite jobs: one is a normal
  // week with no delivery, the other is an ingredient nobody has ever linked to
  // a purchase item. Saying "not ordered" for both would send someone looking
  // for a delivery that was never going to exist.
  not_ordered_here: "Not ordered in these dates — it is bought under this name at other times",
  not_linked: "No purchase item is linked to this ingredient, so nothing can be matched",
  unit_unknown: "Ordered in a pack with no size on file",
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
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

export default function IngredientUsagePage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">((auth?.city as "manila" | "dubai") || "manila");
  const [branch, setBranch] = useState("");
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(daysAgo(1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [onlyGaps, setOnlyGaps] = useState(false);

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
            Add a recipe on Cost Calculation to bring a product into this screen.
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-300">
            {data && (
              <>
                <strong className="text-neutral-200">{data.summary.comparable}</strong> of{" "}
                {data.summary.ingredients} can be compared with purchases.{" "}
                <span className="text-neutral-500">
                  {data.summary.not_linked} have no purchase item linked to them
                  {data.summary.used_value_not_linked > 0
                    ? ` (${num(data.summary.used_value_not_linked, 0)} of use)`
                    : ""}
                  , {data.summary.not_ordered_here} were simply not ordered in these dates, and
                  {" "}{data.summary.unit_unknown} were ordered in a pack with no size on file.
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

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-xs">
            <thead className="bg-neutral-900/60 uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">Ingredient</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-right">Used</th>
                <th className="px-3 py-2 text-right">Ordered</th>
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
                    </td>
                    <td className="px-3 py-2 text-neutral-400">{r.supplier || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                      {r.used_in_order_unit != null
                        ? `${num(r.used_in_order_unit, 2)} ${r.order_unit}`
                        : `${num(r.used_qty, 1)} ${r.used_unit || ""}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-200">
                      {r.bought_qty != null ? `${num(r.bought_qty, 2)} ${r.order_unit}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      r.difference == null ? "text-neutral-600"
                        : r.difference < 0 ? "text-orange-300" : "text-teal-300"}`}>
                      {r.difference == null ? "—" : num(r.difference, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                      {num(r.used_value, 0)}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">
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
          <strong className="text-neutral-400"> Ordered</strong> is what was requested through
          Procurement in the same dates, which is not the same as what arrived.
          A negative difference means more was used than ordered in these dates; over a short
          window that usually means it came out of stock already held.
          <br />
          <strong className="text-neutral-400">Purchases are counted across all of Manila</strong>,
          not just the branch selected above — the stores sell it, but CK and the warehouse buy
          most of it.
        </p>
      </section>
    </div>
  );
}
