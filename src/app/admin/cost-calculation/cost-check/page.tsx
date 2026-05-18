"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { canAccessCostAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { costJson } from "@/lib/costClient";

// ─── Types（cost-calculation/page.tsx と同じ構造） ────────────────────────────
type City = "dubai" | "manila";

type MasterItemSummary = {
  id: string;
  city: string;
  category: string;
  name: string;
  item_type: "processed" | "product" | "draft";
  status: string;
  component_count: number;
  cost_unit_price: number;
  total_cost: number;
  cost_ratio: number | null;
};

type MasterComponentDetail = {
  id: string;
  component_type: "ingredient" | "processed_item";
  ingredient_id: string;
  component_menu_item_id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  cost: number;
  unit_price_formula?: string;
};

type SupplierPriceEntry = {
  id: string;
  supplier_name: string;
  purchase_unit: string;
  purchase_qty: number;
  purchase_price: number;
  unit_price: number;
};

type IngredientDetail = {
  id: string;
  name: string;
  unit: string;
  unit_price: number;
  unit_price_formula?: string;
  supplier_prices?: SupplierPriceEntry[];
};

type ComponentKind = "linked" | "formula" | "manual" | "processed" | "error";

type ComponentStat = {
  component: MasterComponentDetail;
  kind: ComponentKind;
  supplierName?: string;
};

type ProductStat = {
  item: MasterItemSummary;
  componentStats: ComponentStat[];
  loaded: boolean;
};

// ─── 商品マスタ全件取得（product + draft） ───────────────────────────────────
// costJson は @/lib/costClient — アクセストークンの自動リフレッシュ・再発行付き
async function fetchItemsByType(
  city: City,
  type: string,
): Promise<MasterItemSummary[]> {
  try {
    const res = await costJson<{ items?: MasterItemSummary[] }>(
      `/api/cost/master-items?city=${encodeURIComponent(city)}&type=${type}&show_inactive=true`,
    );
    return res.items || [];
  } catch {
    // show_inactive=true が通らない場合はアクティブのみにフォールバック
    // （この呼び出しが失敗した場合はエラーを上位に伝播させる）
    const res = await costJson<{ items?: MasterItemSummary[] }>(
      `/api/cost/master-items?city=${encodeURIComponent(city)}&type=${type}`,
    );
    return res.items || [];
  }
}

async function fetchProductMasterItems(city: City): Promise<MasterItemSummary[]> {
  const [productItems, draftItems] = await Promise.all([
    fetchItemsByType(city, "product"),
    fetchItemsByType(city, "draft"),
  ]);
  const seen = new Set<string>();
  const all: MasterItemSummary[] = [];
  for (const item of [...productItems, ...draftItems]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      all.push(item);
    }
  }
  return all;
}

// ─── 商品コンポーネント取得 ───────────────────────────────────────────────────
// draft 商品は /api/cost/product-drafts/${id}、それ以外は /api/cost/master-items/${id}
async function fetchMasterItemComponents(
  id: string,
  itemType: string,
): Promise<MasterComponentDetail[]> {
  const endpoints =
    itemType === "draft"
      ? [
          `/api/cost/product-drafts/${encodeURIComponent(id)}`,
          `/api/cost/master-items/${encodeURIComponent(id)}`,
        ]
      : [
          `/api/cost/master-items/${encodeURIComponent(id)}`,
        ];

  for (const endpoint of endpoints) {
    try {
      const res = await costJson<{ item?: { components?: MasterComponentDetail[] } }>(endpoint);
      const components = res.item?.components;
      if (Array.isArray(components)) return components;
    } catch {
      // 次のエンドポイントを試す
    }
  }
  return [];
}

// ─── 食材詳細取得（supplier_prices を確認） ───────────────────────────────────
async function fetchIngredientDetail(id: string): Promise<IngredientDetail | null> {
  try {
    const res = await costJson<{ item?: IngredientDetail }>(
      `/api/cost/ingredients/${encodeURIComponent(id)}`,
    );
    return res.item || null;
  } catch {
    return null;
  }
}

function classifyComponent(
  component: MasterComponentDetail,
  ingredientDetail: IngredientDetail | null | undefined,
): ComponentKind {
  if (component.component_type === "processed_item") return "processed";
  if (ingredientDetail === null) return "error";
  if (ingredientDetail === undefined) return "error";
  if ((ingredientDetail.supplier_prices?.length ?? 0) > 0) return "linked";
  if (ingredientDetail.unit_price_formula?.trim()) return "formula";
  return "manual";
}

// ─── 食材行の種別バッジ ───────────────────────────────────────────────────────
function KindBadge({ kind }: { kind: ComponentKind }) {
  if (kind === "linked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        ✓ Invoice Linked
      </span>
    );
  }
  if (kind === "formula") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
        ƒ Formula
      </span>
    );
  }
  if (kind === "processed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
        Processed
      </span>
    );
  }
  // manual / error
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
      ⚠ Not Set
    </span>
  );
}

// ─── 展開パネル（食材一覧） ───────────────────────────────────────────────────
function IngredientPanel({
  stat,
  city,
  onClose,
}: {
  stat: ProductStat;
  city: City;
  onClose: () => void;
}) {
  const router = useRouter();
  const { item, componentStats } = stat;
  const ingStats = componentStats.filter((c) => c.kind !== "processed");
  const processedStats = componentStats.filter((c) => c.kind === "processed");
  const manualCount = ingStats.filter((c) => c.kind === "manual" || c.kind === "error").length;

  return (
    <div className="border-t border-white/8 bg-[#0d1117]">
      <div className="px-5 py-4">
        {/* ヘッダー */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.name}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
              {item.category}
            </span>
            {manualCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                ⚠ {manualCount} Not Set
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem(
                    "costcheck_goto",
                    JSON.stringify({ itemId: item.id, itemCity: city }),
                  );
                } catch { /* ignore */ }
                router.push("/admin/cost-calculation");
              }}
              className="rounded-lg border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200"
            >
              Edit in Products →
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>

        {/* 食材テーブル */}
        {componentStats.length === 0 ? (
          <p className="text-xs text-zinc-600">No ingredients registered</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/8 bg-white/3">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="py-2 pl-4 pr-3 text-left font-semibold uppercase tracking-wider text-zinc-600">
                    Ingredient
                  </th>
                  <th className="py-2 pr-3 text-left font-semibold uppercase tracking-wider text-zinc-600">
                    Category
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold uppercase tracking-wider text-zinc-600">
                    Qty
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold uppercase tracking-wider text-zinc-600">
                    Unit
                  </th>
                  <th className="py-2 pr-4 text-left font-semibold uppercase tracking-wider text-zinc-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 未設定食材を先頭に */}
                {[...componentStats]
                  .sort((a, b) => {
                    const order: Record<ComponentKind, number> = {
                      manual: 0,
                      error: 1,
                      formula: 2,
                      linked: 3,
                      processed: 4,
                    };
                    return order[a.kind] - order[b.kind];
                  })
                  .map((cs, i) => {
                    const isIssue = cs.kind === "manual" || cs.kind === "error";
                    return (
                      <tr
                        key={cs.component.id || i}
                        className={[
                          "border-b border-white/5 last:border-0",
                          isIssue ? "bg-amber-500/[0.04]" : "",
                        ].join(" ")}
                      >
                        <td className="py-2 pl-4 pr-3">
                          <span
                            className={
                              isIssue ? "font-semibold text-amber-200" : "text-zinc-300"
                            }
                          >
                            {isIssue && "⚠ "}
                            {cs.component.name}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-500">
                          {cs.component.category || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">
                          {cs.component.quantity}
                        </td>
                        <td className="py-2 pr-3 text-right text-zinc-500">
                          {cs.component.unit}
                        </td>
                        <td className="py-2 pr-4">
                          <KindBadge kind={cs.kind} />
                          {cs.kind === "linked" && cs.supplierName && (
                            <span className="ml-1.5 text-zinc-600">
                              ({cs.supplierName})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* 加工品サマリー */}
        {processedStats.length > 0 && (
          <p className="mt-2 text-[10px] text-zinc-600">
            Processed components ({processedStats.length} items — not individually checked):
            {" "}
            {processedStats.map((s) => s.component.name).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────────
function CostCheckPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCity = searchParams.get("city") || "";

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>("dubai");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [stats, setStats] = useState<ProductStat[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const auth = getAuth();
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessCostAdmin(resolved));
      const resolvedCity = (
        queryCity === "manila" || queryCity === "dubai"
          ? queryCity
          : resolved?.city || auth?.city || "dubai"
      ) as City;
      setCity(resolvedCity);
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [queryCity]);

  const analyze = useCallback(async (targetCity: City) => {
    setAnalyzing(true);
    setError("");
    setStats([]);
    setExpandedId(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: 0 });

    try {
      const items = await fetchProductMasterItems(targetCity);
      setProgress({ done: 0, total: items.length });
      setStats(items.map((item) => ({ item, componentStats: [], loaded: false })));

      const ingredientCache = new Map<string, Promise<IngredientDetail | null>>();
      function getIngredientDetail(id: string): Promise<IngredientDetail | null> {
        if (!ingredientCache.has(id)) {
          ingredientCache.set(id, fetchIngredientDetail(id));
        }
        return ingredientCache.get(id)!;
      }

      const BATCH = 4;
      for (let i = 0; i < items.length; i += BATCH) {
        if (cancelRef.current) break;
        const batch = items.slice(i, i + BATCH);

        await Promise.all(
          batch.map(async (item, batchIdx) => {
            const idx = i + batchIdx;
            const components = await fetchMasterItemComponents(item.id, item.item_type);

            if (components.length === 0) {
              setStats((prev) => {
                const next = [...prev];
                next[idx] = { item, componentStats: [], loaded: true };
                return next;
              });
              setProgress((p) => ({ ...p, done: p.done + 1 }));
              return;
            }

            const componentStats = await Promise.all(
              components.map(async (comp) => {
                if (comp.component_type === "processed_item") {
                  return { component: comp, kind: "processed" as ComponentKind };
                }
                const detail = await getIngredientDetail(comp.ingredient_id);
                const kind = classifyComponent(comp, detail);
                const supplierName =
                  kind === "linked"
                    ? detail?.supplier_prices?.[0]?.supplier_name
                    : undefined;
                return { component: comp, kind, supplierName } as ComponentStat;
              }),
            );

            setStats((prev) => {
              const next = [...prev];
              next[idx] = { item, componentStats, loaded: true };
              return next;
            });
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }),
        );
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        Loading...
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
        You do not have permission to access Cost Calculation.
      </div>
    );
  }

  const sorted = [...stats].sort((a, b) => {
    if (!a.loaded && b.loaded) return 1;
    if (a.loaded && !b.loaded) return -1;
    const aManual = a.componentStats.filter(
      (s) => s.kind === "manual" || s.kind === "error",
    ).length;
    const bManual = b.componentStats.filter(
      (s) => s.kind === "manual" || s.kind === "error",
    ).length;
    return bManual - aManual;
  });

  const displayed =
    filter === "issues"
      ? sorted.filter(
          (s) =>
            s.loaded &&
            s.componentStats.some((c) => c.kind === "manual" || c.kind === "error"),
        )
      : sorted;

  const doneCount = stats.filter((s) => s.loaded).length;
  const fullyLinked = stats.filter(
    (s) =>
      s.loaded &&
      s.componentStats.filter((c) => c.kind !== "processed").length > 0 &&
      s.componentStats
        .filter((c) => c.kind !== "processed")
        .every((c) => c.kind === "linked" || c.kind === "formula"),
  ).length;
  const hasIssuesCount = stats.filter(
    (s) =>
      s.loaded &&
      s.componentStats.some((c) => c.kind === "manual" || c.kind === "error"),
  ).length;
  const noComponents = stats.filter(
    (s) => s.loaded && s.componentStats.length === 0,
  ).length;
  const progressPct = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0d1117] px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* ── ヘッダー ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button
                type="button"
                onClick={() => router.push("/admin/cost-calculation")}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                ← Cost Calculation
              </button>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Invoice Link Check (Products)
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Check whether each ingredient in the Cost Calculation product master is linked to invoice prices
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {(["manila", "dubai"] as City[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCity(c); setExpandedId(null); }}
                className={[
                  "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all",
                  city === c
                    ? "bg-violet-500/25 text-violet-200 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ── 分析パネル ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void analyze(city)}
              disabled={analyzing}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-400 hover:to-purple-400 disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : stats.length ? "Re-analyze" : "Start Analysis"}
            </button>

            {analyzing && (
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <span className="text-sm text-zinc-400">
                  {progress.done} / {progress.total} products processing...
                </span>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {!analyzing && stats.length > 0 && (
              <span className="text-xs text-zinc-500">{doneCount} analyzed</span>
            )}
          </div>
          {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        </div>

        {/* ── サマリー ──────────────────────────────────────────────────────── */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Analyzed", value: doneCount, color: "text-white" },
              { label: "Linked OK", value: fullyLinked, color: "text-emerald-400" },
              {
                label: "Needs Review",
                value: hasIssuesCount,
                color: hasIssuesCount > 0 ? "text-amber-400" : "text-zinc-500",
              },
              { label: "No Ingredients", value: noComponents, color: "text-zinc-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-white/8 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {label}
                </div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── フィルター ────────────────────────────────────────────────────── */}
        {stats.length > 0 && (
          <div className="flex items-center gap-2">
            {(["all", "issues"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFilter(f); setExpandedId(null); }}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  filter === f
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                {f === "all"
                  ? `All (${sorted.filter((s) => s.loaded).length})`
                  : `⚠ Needs Review only (${hasIssuesCount})`}
              </button>
            ))}
          </div>
        )}

        {/* ── 結果テーブル ──────────────────────────────────────────────────── */}
        {displayed.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/8">
                  {[
                    "Product",
                    "Category",
                    "Ingredients",
                    "✓ Invoice Linked",
                    "ƒ Formula",
                    "⚠ Manual",
                    "Processed",
                    "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-5 pb-2.5 pt-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 last:pr-5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ item, componentStats, loaded }) => {
                  const ingStats = componentStats.filter((c) => c.kind !== "processed");
                  const processed = componentStats.filter((c) => c.kind === "processed").length;
                  const linked = ingStats.filter((c) => c.kind === "linked").length;
                  const formula = ingStats.filter((c) => c.kind === "formula").length;
                  const manual = ingStats.filter(
                    (c) => c.kind === "manual" || c.kind === "error",
                  ).length;
                  const hasIssue = loaded && manual > 0;
                  const allOk = loaded && ingStats.length > 0 && manual === 0;
                  const isExpanded = expandedId === item.id;
                  const stat = stats.find((s) => s.item.id === item.id);

                  return (
                    <React.Fragment key={item.id}>
                      {/* ── メイン行（クリックで展開） ── */}
                      <tr
                        key={item.id}
                        onClick={() => {
                          if (!loaded) return;
                          setExpandedId(isExpanded ? null : item.id);
                        }}
                        className={[
                          "border-b border-white/5 align-middle transition-colors",
                          loaded ? "cursor-pointer" : "",
                          isExpanded
                            ? "bg-white/6"
                            : hasIssue
                              ? "hover:bg-amber-500/[0.04] bg-amber-500/[0.02]"
                              : "hover:bg-white/4",
                        ].join(" ")}
                      >
                        {/* 商品名 */}
                        <td className="py-3 pl-5 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                !loaded
                                  ? "animate-pulse bg-zinc-600"
                                  : allOk
                                    ? "bg-emerald-400"
                                    : hasIssue
                                      ? "bg-amber-400"
                                      : "bg-zinc-600"
                              }`}
                            />
                            <span className="font-medium text-white">{item.name}</span>
                            {loaded && (
                              <span className="text-[10px] text-zinc-600">
                                {isExpanded ? "▲" : "▼"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* カテゴリ */}
                        <td className="py-3 pr-4">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                            {item.category}
                          </span>
                        </td>

                        {/* 食材数 */}
                        <td className="py-3 pr-4">
                          {loaded ? (
                            <span className="text-sm font-semibold tabular-nums text-white">
                              {ingStats.length}
                            </span>
                          ) : (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                          )}
                        </td>

                        {/* 仕入連動 */}
                        <td className="py-3 pr-4">
                          {loaded && ingStats.length > 0 ? (
                            <span
                              className={`text-sm font-bold tabular-nums ${
                                linked === ingStats.length
                                  ? "text-emerald-400"
                                  : linked > 0
                                    ? "text-emerald-300"
                                    : "text-zinc-600"
                              }`}
                            >
                              {linked}
                            </span>
                          ) : loaded ? (
                            <span className="text-zinc-600">—</span>
                          ) : null}
                        </td>

                        {/* 計算式 */}
                        <td className="py-3 pr-4">
                          {loaded && ingStats.length > 0 ? (
                            <span
                              className={`text-sm font-bold tabular-nums ${
                                formula > 0 ? "text-blue-300" : "text-zinc-600"
                              }`}
                            >
                              {formula}
                            </span>
                          ) : loaded ? (
                            <span className="text-zinc-600">—</span>
                          ) : null}
                        </td>

                        {/* 手動 */}
                        <td className="py-3 pr-4">
                          {loaded && ingStats.length > 0 ? (
                            <span
                              className={`text-sm font-bold tabular-nums ${
                                manual > 0 ? "text-amber-400" : "text-zinc-600"
                              }`}
                            >
                              {manual > 0 ? `⚠ ${manual}` : "0"}
                            </span>
                          ) : loaded ? (
                            <span className="text-zinc-600">—</span>
                          ) : null}
                        </td>

                        {/* 加工品 */}
                        <td className="py-3 pr-4">
                          {loaded ? (
                            <span className="text-sm tabular-nums text-zinc-600">
                              {processed > 0 ? processed : "—"}
                            </span>
                          ) : null}
                        </td>

                        {/* 展開ヒント */}
                        <td className="py-3 pr-5">
                          {loaded && (
                            <span className="text-[10px] text-zinc-600 whitespace-nowrap">
                              {isExpanded ? "Close" : "Details"}
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* ── 展開パネル ── */}
                      {isExpanded && stat && (
                        <tr key={`${item.id}-detail`} className="border-b border-white/5">
                          <td colSpan={8} className="p-0">
                            <IngredientPanel
                              stat={stat}
                              city={city}
                              onClose={() => setExpandedId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 凡例 ──────────────────────────────────────────────────────────── */}
        {stats.length > 0 && (
          <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">Legend:</span>
            {" "}
            <span className="text-emerald-400">✓ Invoice Linked</span> = supplier_prices configured
            <span className="text-blue-300">ƒ Formula</span> = unit_price_formula configured
            <span className="text-amber-400">⚠ Manual</span> = fixed unit price only (needs setup)
            <span className="text-zinc-500">Processed</span> = processed_item (not recursively checked)
            <span className="ml-4 text-zinc-600">* Click a row to expand ingredient details</span>
          </div>
        )}

        {/* ── 空状態 ────────────────────────────────────────────────────────── */}
        {!analyzing && stats.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center">
            <div className="mb-3 text-2xl">🔍</div>
            <p className="text-sm font-medium text-zinc-300">Click to start analysis</p>
            <p className="mt-1 text-xs text-zinc-600">
              Checks whether each ingredient in the Cost Calculation product master is linked to invoice prices
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CostCheckPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-3 p-8 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          Loading...
        </div>
      }
    >
      <CostCheckPageInner />
    </Suspense>
  );
}
