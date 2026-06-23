"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { getInvestorSession } from "@/lib/investor-auth";
import DateRangePicker from "@/components/DateRangePicker";

// ── Static investment simulation data (from Excel SushiZEN_FOCO_投資家用.xlsx) ─

const SIM = {
  almina: {
    investment: 27_500_000,
    yield_pct: 37.91,
    payback_yrs: 2.64,
    monthly_owner: 868_811,
    annual_owner: 10_425_730,
    fee_food: 12,
    fee_ops: 6,
    fee_royalty: 6,
    store_profit_rate: 56.37,
    floor_yield: 30,
    // Cumulative recovery by year 0-5 (JPY)
    recovery: [0, 10_425_730, 20_851_459, 31_277_189, 41_702_918, 52_128_648],
  },
  taft: {
    investment: 11_000_000,
    yield_base: 43.90,
    yield_conservative: 35.0,
    payback_base: 2.80,
    payback_conservative: 3.25,
    monthly_owner_base: 402_435,
    monthly_owner_conservative: 318_324,
    fee_food: 12,
    fee_ops: 6,
    fee_royalty: 2,
    store_profit_rate_now: 32.9,
    store_profit_rate_3yr: 76.3,
    floor_yield: 30,
    recovery_base: [0, 3_397_160, 7_392_258, 11_892_885, 16_722_106, 21_551_327],
    recovery_conservative: [0, 3_019_888, 6_462_347, 10_074_673, 13_791_186, 17_507_699],
    // Growth projection: base and conservative yield over time
    growth: [
      { label: "現在", base: 32.9, conservative: 27.5 },
      { label: "+1年", base: 51.1, conservative: 34.3 },
      { label: "+2年", base: 66.4, conservative: 39.5 },
      { label: "+3年", base: 76.3, conservative: 42.6 },
    ],
  },
} as const;

type Store = "almina" | "taft";
type Tab = "orders" | "hourly" | "items" | "ratings" | "simulation";
type DateRange = { from: string; to: string };

function investorFetch(path: string): Promise<unknown> {
  // /investor-api/* bypasses Vercel's /api/* rewrite so the route handler
  // can inject x-investor-key before forwarding to Heroku.
  return fetch(path, { cache: "no-store" }).then((r) => r.json());
}

function defaultDateRange(): DateRange {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
    .toISOString().slice(0, 10);
  return { from, to };
}

function fmtMonth(m: string) {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return `${y}年${parseInt(mo)}月`;
}

function fmtYen(n: number) {
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(2)}M`;
  return `¥${n.toLocaleString()}`;
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTip({ active, payload, label, unit }: { active?: boolean; payload?: {value: number}[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <p className="font-bold text-emerald-400">{payload[0].value.toLocaleString()}{unit ?? ""}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InvestorDashboard() {
  const router = useRouter();
  const [store, setStore] = useState<Store>("almina");
  const [tab, setTab] = useState<Tab>("orders");
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);

  // Data states
  const [ordersData, setOrdersData] = useState<{ month: string; orders: number }[]>([]);
  const [hourlyData, setHourlyData] = useState<{ hour_of_day: number; orders: number }[]>([]);
  const [itemsData, setItemsData] = useState<{ item_name: string; order_line_count: number }[]>([]);
  const [ratingsData, setRatingsData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getInvestorSession()) { router.replace("/investor"); return; }
  }, [router]);

  const loadOrders = useCallback(async (s: Store, r: DateRange) => {
    const d = await investorFetch(
      `/investor-api/analytics/orders?store=${s}&date_from=${r.from}&date_to=${r.to}`
    ) as { rows?: { month: string; orders: number }[] };
    setOrdersData(d.rows ?? []);
  }, []);

  const loadHourly = useCallback(async (s: Store, r: DateRange) => {
    const d = await investorFetch(
      `/investor-api/analytics/hourly?store=${s}&date_from=${r.from}&date_to=${r.to}`
    ) as { rows?: { hour_of_day: number; orders: number }[] };
    setHourlyData(d.rows ?? []);
  }, []);

  const loadItems = useCallback(async (s: Store, r: DateRange) => {
    const d = await investorFetch(
      `/investor-api/analytics/items?store=${s}&date_from=${r.from}&date_to=${r.to}&limit=15`
    ) as { items?: { item_name: string; order_line_count: number }[] };
    setItemsData(d.items ?? []);
  }, []);

  const loadRatings = useCallback(async (s: Store, r: DateRange) => {
    const d = await investorFetch(
      `/investor-api/analytics/ratings?store=${s}&date_from=${r.from}&date_to=${r.to}`
    );
    setRatingsData(d as Record<string, unknown>);
  }, []);

  useEffect(() => {
    setError("");
    setLoading(true);
    const loaders: Record<Tab, (s: Store, r: DateRange) => Promise<void>> = {
      orders: loadOrders,
      hourly: loadHourly,
      items: loadItems,
      ratings: loadRatings,
      simulation: async () => {},
    };
    loaders[tab](store, dateRange)
      .catch(() => setError("データの読み込みに失敗しました。"))
      .finally(() => setLoading(false));
  }, [store, tab, dateRange, loadOrders, loadHourly, loadItems, loadRatings]);

  function logout() {
    localStorage.removeItem("sushizen_investor_session");
    router.replace("/investor");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "orders", label: "オーダー数" },
    { key: "hourly", label: "時間別オーダー数" },
    { key: "items", label: "アイテム別オーダー数" },
    { key: "ratings", label: "評価" },
    { key: "simulation", label: "投資家収支" },
  ];

  const storeLabel = store === "almina" ? "Al Mina店（Dubai）" : "Taft店（Manila）";
  const accentColor = store === "almina" ? "#10b981" : "#6366f1";

  // ── Recent month orders KPI ────────────────────────────────────────────────
  const lastMonthOrders = ordersData.length > 0 ? ordersData[ordersData.length - 1].orders : null;
  const prevMonthOrders = ordersData.length > 1 ? ordersData[ordersData.length - 2].orders : null;
  const ordersTrend = lastMonthOrders && prevMonthOrders
    ? ((lastMonthOrders - prevMonthOrders) / prevMonthOrders * 100).toFixed(1)
    : null;
  const totalOrders = ordersData.reduce((s, r) => s + r.orders, 0);

  // ── Hourly peak ────────────────────────────────────────────────────────────
  const peakRow = hourlyData.reduce((a, b) => (a.orders > b.orders ? a : b), { hour_of_day: 0, orders: 0 });

  return (
    <div className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/8 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25">
              <span className="text-sm font-bold text-emerald-400">ZEN</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Sushi ZEN FOCO</h1>
              <p className="text-[10px] text-slate-500">投資家向けダッシュボード</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* ── Store selector + Date range ──────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">店舗</p>
          {(["almina", "taft"] as Store[]).map((s) => (
            <button
              key={s}
              onClick={() => setStore(s)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                store === s
                  ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                  : "border border-white/8 bg-white/4 text-slate-400 hover:text-white"
              }`}
            >
              {s === "almina" ? "🇦🇪 Al Mina店（Dubai）" : "🇵🇭 Taft店（Manila）"}
            </button>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap">期間</p>
          <div className="flex-1 min-w-[220px] max-w-xs">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <p className="text-xs text-slate-600">
            {dateRange.from} 〜 {dateRange.to}
          </p>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-white/3 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-fit rounded-xl px-3 py-2 text-xs font-semibold transition ${
                tab === t.key
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Error / Loading ──────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && tab !== "simulation" && (
          <div className="flex h-48 items-center justify-center text-slate-500 text-sm">
            読み込み中...
          </div>
        )}

        {!loading && (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* Tab: オーダー数                                                */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {tab === "orders" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <KPI label="直近月のオーダー数" value={lastMonthOrders?.toLocaleString() ?? "—"} sub={ordersTrend ? `前月比 ${parseFloat(ordersTrend) >= 0 ? "+" : ""}${ordersTrend}%` : undefined} />
                  <KPI label="累計オーダー数（13ヶ月）" value={totalOrders.toLocaleString()} />
                  <KPI label="店舗" value={storeLabel} />
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-slate-300">月次オーダー数推移</h2>
                  {ordersData.length === 0 ? (
                    <p className="text-sm text-slate-500">データがありません</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={ordersData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtMonth} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                        <Tooltip content={<ChartTip unit=" 件" />} />
                        <Bar dataKey="orders" fill={accentColor} radius={[4, 4, 0, 0]} name="オーダー数" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* Tab: 時間別オーダー数                                          */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {tab === "hourly" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <KPI label="ピーク時間帯" value={peakRow.orders > 0 ? `${peakRow.hour_of_day}:00` : "—"} sub={peakRow.orders > 0 ? `${peakRow.orders.toLocaleString()} 件/時` : undefined} />
                  <KPI label="店舗" value={storeLabel} />
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-slate-300">時間別オーダー数（直近3ヶ月平均）</h2>
                  {hourlyData.length === 0 ? (
                    <p className="text-sm text-slate-500">データがありません</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={hourlyData}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="hour_of_day" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(h) => `${h}時`} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                        <Tooltip content={<ChartTip unit=" 件" />} />
                        <Bar dataKey="orders" fill={accentColor} radius={[4, 4, 0, 0]} name="オーダー数" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* Tab: アイテム別オーダー数                                      */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {tab === "items" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <KPI label="集計期間" value="直近3ヶ月" sub="全店舗集計" />
                  <KPI label="店舗（国）" value={storeLabel} />
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-slate-300">人気メニュー TOP 15（オーダー数順）</h2>
                  {itemsData.length === 0 ? (
                    <p className="text-sm text-slate-500">データがありません</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        layout="vertical"
                        data={[...itemsData].reverse()}
                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                        <YAxis type="category" dataKey="item_name" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={140} />
                        <Tooltip content={<ChartTip unit=" 件" />} />
                        <Bar dataKey="order_line_count" fill={accentColor} radius={[0, 4, 4, 0]} name="オーダー数" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* Tab: 評価                                                      */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {tab === "ratings" && (
              <div className="space-y-5">
                {store === "almina" ? (
                  <DubaiRatings data={ratingsData} />
                ) : (
                  <ManilaRatings data={ratingsData} />
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* Tab: 投資家収支                                                */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {tab === "simulation" && (
              store === "almina" ? <DubaiSimulation /> : <ManilaSimulation />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Dubai Ratings component ───────────────────────────────────────────────────
function DubaiRatings({ data }: { data: Record<string, unknown> }) {
  const ratings = (data.ratings ?? {}) as Record<string, { avg: number; latest: number } | number>;
  const entries = Object.entries(ratings);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(([platform, v]) => {
          const avg = typeof v === "object" && v !== null ? (v as { avg: number }).avg : (v as number);
          return (
            <div key={platform} className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{platform}</p>
              <p className="mt-2 text-3xl font-bold text-emerald-400">{avg ? avg.toFixed(1) : "—"}</p>
              <p className="mt-0.5 text-xs text-slate-400">/ 5.0</p>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="col-span-4 rounded-2xl border border-white/8 bg-white/4 p-8 text-center text-sm text-slate-500">
            評価データがありません
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-400">
        <p className="font-semibold text-white mb-1">Al Mina店 — 配信プラットフォーム評価</p>
        <p>Deliveroo・Talabat・Zomato等の配達プラットフォームからの顧客評価スコアです。</p>
      </div>
    </>
  );
}

// ── Manila Ratings component ──────────────────────────────────────────────────
function ManilaRatings({ data }: { data: Record<string, unknown> }) {
  const ratings = (data.ratings ?? {}) as Record<string, number | null>;
  const latestDate = (data.latest_record_date as string) || "";
  const entries = Object.entries(ratings).filter(([, v]) => v != null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map(([platform, v]) => (
          <div key={platform} className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{platform}</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">{(v as number).toFixed(1)}</p>
            <p className="mt-0.5 text-xs text-slate-400">/ 5.0</p>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="col-span-3 rounded-2xl border border-white/8 bg-white/4 p-8 text-center text-sm text-slate-500">
            評価データがありません
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-400">
        <p className="font-semibold text-white mb-1">Taft店 — 配信プラットフォーム評価</p>
        <p>FoodPanda・GrabFood等の配達プラットフォームからの顧客評価スコアです。</p>
        {latestDate && <p className="mt-1 text-xs text-slate-500">最終記録日: {latestDate}</p>}
      </div>
    </>
  );
}

// ── Dubai Simulation tab ──────────────────────────────────────────────────────
function DubaiSimulation() {
  const d = SIM.almina;
  const recoveryChartData = d.recovery.map((v, i) => ({ year: `${i}年`, 累計回収: v, 投資元本: d.investment }));

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="投資額" value={fmtYen(d.investment)} sub="1店舗あたり" />
        <KPI label="想定オーナー利回り" value={`${d.yield_pct}%`} sub="実績ベース" />
        <KPI label="投資回収期間" value={`${d.payback_yrs}年`} sub="実績平均" />
        <KPI label="月次オーナー収入" value={fmtYen(d.monthly_owner)} sub="年間 ¥10.4M" />
      </div>

      {/* Fee structure */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">食材卸マージン</p>
          <p className="mt-2 text-2xl font-bold text-white">{d.fee_food}%</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">運営手数料</p>
          <p className="mt-2 text-2xl font-bold text-white">{d.fee_ops}%</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">ロイヤリティ（Dubai）</p>
          <p className="mt-2 text-2xl font-bold text-white">{d.fee_royalty}%</p>
        </div>
      </div>

      {/* Distribution rule */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
        <p className="font-semibold text-emerald-300 mb-2">分配ルール</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-slate-400">フロア保証利回り以下</p>
            <p className="font-bold text-white">オーナー 100%（優先保護）</p>
          </div>
          <div>
            <p className="text-slate-400">{d.floor_yield}%超過分</p>
            <p className="font-bold text-white">オーナー 30% ／ 本部 70%</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">店舗利益率（地力）: {d.store_profit_rate}% → 手数料控除後オーナー利回り: {d.yield_pct}%</p>
      </div>

      {/* Payback chart */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">投資回収シミュレーション（Dubai Al Mina・実績ベース）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={recoveryChartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `¥${(v / 1_000_000).toFixed(0)}M`} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtYen(v)} />
            <Legend formatter={(v) => <span className="text-slate-300 text-xs">{v}</span>} />
            <ReferenceLine y={d.investment} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "投資元本", fill: "#f59e0b", fontSize: 11 }} />
            <Line type="monotone" dataKey="累計回収" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-500 text-center">
          ※ 2.64年で投資元本（¥{(d.investment / 1_000_000).toFixed(1)}M）を回収
        </p>
      </div>
    </div>
  );
}

// ── Manila Simulation tab ─────────────────────────────────────────────────────
function ManilaSimulation() {
  const d = SIM.taft;
  const recoveryChart = d.recovery_base.map((v, i) => ({
    year: `${i}年`,
    "Base（エメラルド）": v,
    "Conservative（堅実）": d.recovery_conservative[i],
    投資元本: d.investment,
  }));

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="投資額" value={fmtYen(d.investment)} sub="1店舗あたり" />
        <KPI label="成熟時想定利回り（Base）" value={`${d.yield_base}%`} sub="成長後3年目" />
        <KPI label="回収期間（Base）" value={`${d.payback_base}年`} sub="成熟時予測" />
        <KPI label="月次収入（Base・成熟時）" value={fmtYen(d.monthly_owner_base)} sub="年間 ¥4.8M" />
      </div>

      {/* Fee structure */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">食材卸マージン</p>
          <p className="mt-2 text-2xl font-bold text-white">{d.fee_food}%</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">運営手数料</p>
          <p className="mt-2 text-2xl font-bold text-white">{d.fee_ops}%</p>
        </div>
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">ロイヤリティ（Manila）</p>
          <p className="mt-2 text-2xl font-bold text-indigo-300">{d.fee_royalty}%</p>
          <p className="mt-0.5 text-xs text-indigo-400">Dubai 6% より優遇</p>
        </div>
      </div>

      {/* Growth projection */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">成長利回り予測（Taft店 基準）</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={d.growth} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 90]} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend formatter={(v) => <span className="text-slate-300 text-xs">{v}</span>} />
            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "フロア30%", fill: "#f59e0b", fontSize: 10 }} />
            <Line type="monotone" dataKey="base" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} name="Base（エメラルド）" />
            <Line type="monotone" dataKey="conservative" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" name="Conservative（堅実）" />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-500 text-center">
          ※ Baseはドバイ実績成長率＋マニラ人口ポテンシャル×1.2倍で算出
        </p>
      </div>

      {/* Payback chart */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">投資回収シミュレーション（Taft店・2シナリオ）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={recoveryChart} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `¥${(v / 1_000_000).toFixed(0)}M`} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtYen(v)} />
            <Legend formatter={(v) => <span className="text-slate-300 text-xs">{v}</span>} />
            <ReferenceLine y={d.investment} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "投資元本", fill: "#f59e0b", fontSize: 11 }} />
            <Line type="monotone" dataKey="Base（エメラルド）" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Conservative（堅実）" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-500 text-center">
          ※ 投資元本 ¥{(d.investment / 1_000_000).toFixed(0)}M。Base予測: {d.payback_base}年、Conservative: {d.payback_conservative}年で回収
        </p>
      </div>
    </div>
  );
}
