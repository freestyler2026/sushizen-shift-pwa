"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SelectDark from "@/components/SelectDark";
import {
  clearOwnerSession, getOwnerSession, OwnerAuthError, ownerDownload, ownerFetch, ownerImageUrl, type OwnerSession,
} from "@/lib/owner-auth";

type Tab = "daily" | "ledger" | "sales" | "ck" | "payouts" | "quality";
const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "日次" },
  { key: "ledger", label: "分配" },
  { key: "sales", label: "売上" },
  { key: "ck", label: "CK供給" },
  { key: "payouts", label: "入金" },
  { key: "quality", label: "運営品質" },
];

// The owner's month is the calendar month (like their books, BIR and the mall rent).
function cycleBounds(cycle: string): [string, string] {
  const [y, m] = cycle.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m, 0).getDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
}
function cycleOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function manilaToday(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000);
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function cycleLabel(cycle: string) {
  const [a, b] = cycleBounds(cycle);
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  const month = new Date(`${cycle}-01T00:00:00`).toLocaleDateString("ja-JP", { month: "long", year: "numeric" });
  return `${month}（${fmt(a)}〜${fmt(b)}）`;
}
// Yen beside every peso amount, at today's rate (display only: the ledger is in pesos,
// and the contract's own conversion -- the investment -- does not move with it).
type Fx = { rate: number; rate_date: string; source: string; stale: boolean };
let FX: Fx | null = null;
const peso = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const yen = (n: number | null | undefined) =>
  n == null || !FX ? "" : `（¥${Math.round(Number(n) * FX.rate).toLocaleString("ja-JP")}）`;
const php = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `${peso(n, digits)}${yen(n)}`);
const num = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : Number(n).toLocaleString("en-PH", { maximumFractionDigits: digits });

const FIRST_CYCLE = "2026-10";

export default function OwnerDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [store, setStore] = useState("");
  const [tab, setTab] = useState<Tab>("daily");
  const today = useMemo(() => manilaToday(), []);
  const cycles = useMemo(() => {
    const out: string[] = [];
    // Up to yesterday's month: on the 1st the new month has no figures yet.
    const last = cycleOf(new Date(today.getTime() - 86400000));
    for (let c = FIRST_CYCLE; c <= last; ) {
      out.push(c);
      const [y, m] = c.split("-").map(Number);
      c = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
    return out.reverse();
  }, [today]);
  const [cycle, setCycle] = useState(cycles[0]);
  const [fx, setFx] = useState<Fx | null>(null);
  FX = fx;

  useEffect(() => {
    const s = getOwnerSession();
    if (!s) { router.replace("/owner"); return; }
    setSession(s);
    setStore(s.stores[0]?.code || "");
    ownerFetch<Fx>("/api/owner/fx").then(setFx).catch(() => setFx(null));
  }, [router]);

  const onAuthError = useCallback((e: unknown) => {
    if (e instanceof OwnerAuthError) router.replace("/owner");
  }, [router]);

  if (!session || !store) return null;
  const [from, to] = cycleBounds(cycle);
  const yesterday = iso(new Date(today.getTime() - 86400000));
  const rangeTo = to < yesterday ? to : yesterday;
  const storeName = session.stores.find((s) => s.code === store)?.name || store;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Sushi ZEN · オーナーポータル</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{storeName}</h1>
          <p className="text-sm text-slate-400">{session.displayName} 様</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.stores.length > 1 && (
            <SelectDark value={store} onChange={setStore} aria-label="店舗" className="min-w-[9rem]"
              options={session.stores.map((s) => ({ value: s.code, label: s.name }))} />
          )}
          {tab !== "ledger" && tab !== "daily" && (
            <SelectDark value={cycle} onChange={setCycle} aria-label="月" className="min-w-[14rem]"
              options={cycles.map((c) => ({ value: c, label: cycleLabel(c) }))} />
          )}
          <button onClick={() => { clearOwnerSession(); router.replace("/owner"); }}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">ログアウト</button>
        </div>
      </header>

      <nav className="mt-4 flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {fx && (
        <p className="mt-2 text-[11px] text-slate-500">
          括弧内の円は参考表示です：1ペソ＝{fx.rate.toFixed(4)}円（{fx.rate_date}・{fx.source}{fx.stale ? "・最新レートを取得できなかったため直近のレート" : ""}）。契約上の金額はすべてペソです。
        </p>
      )}

      <main className="mt-6">
        {tab === "daily" && <DailyTab store={store} yesterday={yesterday} onAuthError={onAuthError} />}
        {tab === "ledger" && <LedgerTab store={store} onAuthError={onAuthError} />}
        {tab === "sales" && <SalesTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
        {tab === "ck" && <CkTab store={store} cycle={cycle} onAuthError={onAuthError} />}
        {tab === "payouts" && <PayoutsTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
        {tab === "quality" && <QualityTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
      </main>
    </div>
  );
}

function useOwnerData<T>(path: string, onAuthError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    ownerFetch<T>(path).then((d) => { if (live) setData(d); }).catch((e) => {
      if (!live) return;
      onAuthError(e);
      setError(e instanceof Error ? e.message : "読み込めませんでした。");
    });
    return () => { live = false; };
  }, [path, onAuthError]);
  return { data, error };
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs tracking-wider text-slate-400">{label}</p>
      {value.includes("（¥") ? (
        <>
          <p className="mt-1 text-xl font-bold tabular-nums text-white">{value.split("（¥")[0]}</p>
          <p className="text-xs tabular-nums text-slate-400">（¥{value.split("（¥")[1]}</p>
        </>
      ) : <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>}
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
function Loading({ error }: { error: string }) {
  return error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <p className="text-sm text-slate-400">読み込み中…</p>;
}

// ── Daily: how the store traded and ran yesterday ──────────────────────────
type ChannelSales = { orders: number; paid: number; net: number };
type SalesBlock = { channels: Record<"dine_in" | "grab" | "foodpanda", ChannelSales>; total: ChannelSales & { avg_ticket: number | null } };
type ScoreItem = {
  id: number; food_category: string; total_score: number; grade: string; feedback: string; at: string | null;
  score_shape: number; score_size_consistency: number; score_completion: number; score_topping: number;
  score_cut_uniformity: number; score_arrangement: number; score_portioning: number;
};
type Daily = {
  day: string; compare_day: string; sales: SalesBlock; sales_week_ago: SalesBlock | null; sales_change: number | null;
  mtd: SalesBlock & { from: string; to: string }; prev_mtd: (SalesBlock & { from: string; to: string }) | null;
  hourly: { hour: number; grab: number; foodpanda: number }[];
  hourly_coverage: Record<"grab" | "foodpanda", { ledger: number; pos: number; complete: boolean }>;
  quality: {
    grab_rating: number | null; grab_rating_week_ago: number | null; foodpanda_rating: number | null; foodpanda_rating_week_ago: number | null;
    foodpanda_prep_min: number | null; foodpanda_offline_min: number | null; foodpanda_rejection_pct: number | null;
    foodpanda_complaints: number | null; grab_offline_min: number | null; grab_prep_median_min: number | null;
  };
  team: { people: number; hours: number; still_clocked_in: number };
  checks: { type: string; status: string; submitted_at: string | null; confirmed: boolean }[];
  ck: { notes: number; lines: number };
  product: { count: number; avg: number | null; avg_last_7_days: number | null; by_grade: Record<string, number>; by_category: Record<string, number>; items: ScoreItem[] };
  flags: string[];
  freshness: { pos: string | null; grab_orders: string | null; foodpanda_orders: string | null };
};
const CHANNEL_LABEL: Record<string, string> = { dine_in: "店内・Beep", grab: "GrabFood", foodpanda: "foodpanda" };
const CHECK_LABEL: Record<string, string> = { OPENING: "開店", LUNCH_OPEN: "ランチ開始", LUNCH_CLOSE: "ランチ終了", BUSINESS_CLOSE: "閉店" };
const CATEGORY_LABEL: Record<string, string> = { sushi: "寿司", general: "その他の料理", ramen: "ラーメン" };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return iso(x); };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("ja-JP", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
const signed = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`);

const monthsBetween = (first: string, last: string) => {
  const out: string[] = [];
  for (let m = first; m <= last; m = nextMonth(m)) out.push(m);
  return out;
};
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
const navBtn = "rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-30";

// Daily tab: one day, or a month at a glance whose squares open their day (owner, 2026-10-30).
function DailyTab({ store, yesterday, onAuthError }: { store: string; yesterday: string; onAuthError: (e: unknown) => void }) {
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(yesterday);
  const [month, setMonth] = useState(yesterday.slice(0, 7));
  const first = FIRST_CYCLE + "-01";
  const months = useMemo(() => monthsBetween(FIRST_CYCLE, yesterday.slice(0, 7)), [yesterday]);
  const toggle = (
    <div className="inline-flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="表示の単位">
      {([["day", "日別"], ["month", "月別"]] as const).map(([k, label]) => (
        <button key={k} onClick={() => { if (k === "month") setMonth(day.slice(0, 7)); setMode(k); }} aria-pressed={mode === k}
          className={`rounded-md px-3 py-1 text-sm ${mode === k ? "bg-white/10 font-semibold text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
      ))}
    </div>
  );
  const dayNav = (
    <div className="flex items-center gap-2">
      <button disabled={day <= first} onClick={() => setDay(addDays(day, -1))} aria-label="前の日" className={navBtn}>‹</button>
      {/* The native date picker sits over the label: a tap opens the phone's calendar, a click the browser's. */}
      <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/5 sm:flex-none">
        <span>{dayLabel(day)}</span>
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
        <input type="date" aria-label="日付を選ぶ" value={day} min={first} max={yesterday}
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* the tap opens it */ } }}
          onChange={(e) => { const v = e.target.value; if (v && v >= first && v <= yesterday) setDay(v); }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:dark]" />
      </label>
      <button disabled={day >= yesterday} onClick={() => setDay(addDays(day, 1))} aria-label="次の日" className={navBtn}>›</button>
    </div>
  );
  const monthNav = (
    <div className="flex items-center gap-2">
      <button disabled={month <= months[0]} onClick={() => setMonth(prevMonth(month))} aria-label="前の月" className={navBtn}>‹</button>
      <SelectDark value={month} onChange={setMonth} aria-label="月を選ぶ" className="min-w-[9rem]"
        options={months.map((m) => ({ value: m, label: monthName(m) }))} />
      <button disabled={month >= months[months.length - 1]} onClick={() => setMonth(nextMonth(month))} aria-label="次の月" className={navBtn}>›</button>
    </div>
  );
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">{toggle}{mode === "day" ? dayNav : monthNav}</div>
      {mode === "day"
        ? <DayView store={store} day={day} onAuthError={onAuthError} />
        : <MonthView store={store} month={month} onAuthError={onAuthError} onOpenDay={(d) => { setDay(d); setMode("day"); }} />}
    </section>
  );
}

function DayView({ store, day, onAuthError }: { store: string; day: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Daily>(`/api/owner/daily?store=${store}&day=${day}`, onAuthError);
  const [lowestFirst, setLowestFirst] = useState(false);
  const [shown, setShown] = useState(12);
  useEffect(() => { setShown(12); }, [day, store]);
  if (!data) return <Loading error={error} />;
  const s = data.sales.total;
  const q = data.quality;
  const items = [...data.product.items].sort((a, b) => (lowestFirst ? a.total_score - b.total_score : (a.at || "").localeCompare(b.at || "")));
  const hourlyShown = (["grab", "foodpanda"] as const).filter((p) => data.hourly_coverage[p].complete);
  return (
    <div className="space-y-6">
      {data.flags.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">確認しておきたい点</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{data.flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">特に変わった点はありません。</div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="売上（税抜）" value={php(s.net)} sub={data.sales_change == null ? undefined : `先週の${new Date(`${data.compare_day}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}比 ${signed(data.sales_change)}`} />
        <Card label="注文数" value={`${num(s.orders)}件`} sub={data.sales_week_ago ? `先週同曜日 ${num(data.sales_week_ago.total.orders)}件` : undefined} />
        <Card label="客単価" value={php(s.avg_ticket)} />
        <Card label="今月の累計" value={php(data.mtd.total.net)} sub={data.prev_mtd ? `先月同期比 ${signed(data.prev_mtd.total.net ? data.mtd.total.net / data.prev_mtd.total.net - 1 : null)}` : `${num(data.mtd.total.orders)}件`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">チャネル別</p>
          <div className="mt-3 space-y-2">
            {(["grab", "foodpanda", "dine_in"] as const).map((ch) => {
              const c = data.sales.channels[ch];
              const share = s.net ? c.net / s.net : 0;
              return (
                <div key={ch} className="text-sm">
                  <div className="flex justify-between text-slate-300"><span>{CHANNEL_LABEL[ch]}</span><span className="tabular-nums text-white">{php(c.net)} · {num(c.orders)}件</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">時間帯別のデリバリー注文</p>
          {hourlyShown.length ? (
            <div className="mt-2 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourly.map((h) => ({ hour: `${h.hour}時`, GrabFood: hourlyShown.includes("grab") ? h.grab : 0, foodpanda: hourlyShown.includes("foodpanda") ? h.foodpanda : 0 }))}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 10 }} width={24} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                  {hourlyShown.includes("grab") && <Bar dataKey="GrabFood" stackId="a" fill="#10b981" />}
                  {hourlyShown.includes("foodpanda") && <Bar dataKey="foodpanda" stackId="a" fill="#ec4899" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-2 text-sm text-slate-400">この日の注文時刻はまだ取り込み中です。</p>}
          {(["grab", "foodpanda"] as const).filter((p) => !data.hourly_coverage[p].complete && data.hourly_coverage[p].pos > 0).map((p) => (
            <p key={p} className="mt-1 text-xs text-slate-500">{CHANNEL_LABEL[p]}：注文時刻の取り込みが途中です（{data.hourly_coverage[p].pos}件中{data.hourly_coverage[p].ledger}件）。揃いしだい表示します。</p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="GrabFood の評価" value={q.grab_rating?.toFixed(2) ?? "—"} sub={q.grab_rating_week_ago != null ? `1週間前 ${q.grab_rating_week_ago.toFixed(2)}` : undefined} />
        <Card label="foodpanda の評価" value={q.foodpanda_rating?.toFixed(2) ?? "—"} sub={q.foodpanda_rating_week_ago != null ? `1週間前 ${q.foodpanda_rating_week_ago.toFixed(2)}` : undefined} />
        <Card label="調理時間" value={q.foodpanda_prep_min != null ? `${q.foodpanda_prep_min}分` : q.grab_prep_median_min != null ? `${q.grab_prep_median_min}分` : "—"} sub={q.foodpanda_prep_min != null ? "foodpanda の平均" : q.grab_prep_median_min != null ? "GrabFood の中央値" : "未取り込み"} />
        <Card label="オフライン時間" value={`${q.grab_offline_min ?? "—"} / ${q.foodpanda_offline_min ?? "—"}分`} sub="GrabFood / foodpanda" />
        <Card label="出勤スタッフ" value={`${data.team.people}人`} sub={`合計${data.team.hours}時間${data.team.still_clocked_in ? `・退勤未打刻 ${data.team.still_clocked_in}人` : ""}`} />
        <Card label="CKからの納品" value={`${data.ck.notes}件`} sub={`${data.ck.lines}品目`} />
        <Card label="お客様からの問い合わせ" value={q.foodpanda_complaints != null ? `${q.foodpanda_complaints}%` : "—"} sub="foodpanda 注文に対して" />
        <Card label="注文の拒否" value={q.foodpanda_rejection_pct != null ? `${q.foodpanda_rejection_pct}%` : "—"} sub="foodpanda" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">店舗チェック</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.checks.map((c) => {
            const tone = c.status === "MISSING" ? "border-red-500/40 text-red-200" : c.status.includes("ISSUE") ? "border-amber-500/40 text-amber-200" : c.confirmed ? "border-emerald-500/40 text-emerald-200" : "border-sky-500/40 text-sky-200";
            const text = c.status === "MISSING" ? "未提出" : c.status.includes("ISSUE") ? "問題あり" : c.confirmed ? "実施・確認済み" : "実施・確認中";
            return <span key={c.type} className={`rounded-full border px-3 py-1 text-xs ${tone}`}>{CHECK_LABEL[c.type] || c.type}：{text}</span>;
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">開店・ランチ・閉店のたびに、スタッフがデリバリー端末と店舗の状態を確認し、本部（バックオフィス）が一件ずつ確認しています。</p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">料理写真の評価 <span className="font-normal text-slate-400">— 厨房が送る料理写真をすべて採点しています</span></p>
          <p className="text-sm tabular-nums text-slate-300">{data.product.count}枚・平均{data.product.avg ?? "—"}点{data.product.avg_last_7_days != null && <span className="text-slate-500">（直前7日間 {data.product.avg_last_7_days}点）</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.product.by_grade).sort().map(([g, n]) => (
            <span key={g} className={`rounded-full border px-2.5 py-0.5 ${g === "A" ? "border-emerald-500/40 text-emerald-200" : g === "C" ? "border-amber-500/40 text-amber-200" : "border-white/15 text-slate-300"}`}>{g}評価：{n}枚</span>
          ))}
          {Object.entries(data.product.by_category).map(([c, v]) => <span key={c} className="rounded-full border border-white/10 px-2.5 py-0.5 text-slate-400">{CATEGORY_LABEL[c] || c}：{v}点</span>)}
          {data.product.count > 0 && (
            <button onClick={() => setLowestFirst(!lowestFirst)} className="ml-auto rounded-lg border border-white/10 px-2.5 py-0.5 text-slate-300 hover:bg-white/5">{lowestFirst ? "時刻順に並べる" : "点数の低い順に並べる"}</button>
          )}
        </div>
        {data.product.count === 0 ? <p className="text-sm text-slate-400">この日に採点された料理写真はありません。</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.slice(0, shown).map((it) => <ScorePhoto key={it.id} store={store} item={it} />)}
            </div>
            {shown < items.length && (
              <button onClick={() => setShown(shown + 12)} className="w-full rounded-lg border border-white/10 py-2 text-sm text-slate-300 hover:bg-white/5">もっと見る（残り{items.length - shown}枚）</button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-500">
        この画面の売上は店舗のレジ（StoreHub）の記録で、全チャネルが翌朝までにそろいます（税抜）。「分配」タブの月次の数字は各プラットフォームの精算明細を使うため、数%の差が出ることがあります。利益は月を締めないと正確に出せないため、日次では表示していません。
        {" "}データの取り込み状況：レジ {data.freshness.pos ?? "—"}まで、GrabFood の注文 {data.freshness.grab_orders ?? "—"}まで、foodpanda の注文 {data.freshness.foodpanda_orders ?? "—"}まで。
      </p>
    </div>
  );
}

type MonthDay = {
  day: string; net: number; orders: number; change: number | null; people: number; hours: number;
  checks_done: number; check_issues: number; photos: number; c_photos: number; ck_notes: number;
  grab_offline_min: number | null; foodpanda_offline_min: number | null; foodpanda_prep_min: number | null; flags: string[];
};
type Month = {
  month: string; from: string; to: string; complete: boolean;
  sales: { channels: Record<string, ChannelSales>; total: ChannelSales & { avg_ticket: number | null } };
  prev: { from: string; to: string } | null; sales_change: number | null; daily_avg_net: number | null;
  days: MonthDay[];
  quality: { grab_rating: number | null; grab_rating_start: number | null; foodpanda_rating: number | null; foodpanda_rating_start: number | null;
    foodpanda_prep_avg_min: number | null; grab_prep_median_avg_min: number | null; grab_offline_min: number; foodpanda_offline_min: number };
  checks: { expected: number; done: number; issues: number };
  team: { person_days: number; hours: number };
  ck_notes: number;
  product: { count: number; avg: number | null; by_grade: Record<string, number>; by_category: Record<string, number> };
  days_with_flags: number;
};
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const kilo = (n: number) => (n >= 1000 ? `₱${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `₱${Math.round(n)}`);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function MonthView({ store, month, onAuthError, onOpenDay }: { store: string; month: string; onAuthError: (e: unknown) => void; onOpenDay: (d: string) => void }) {
  const { data, error } = useOwnerData<Month>(`/api/owner/daily-month?store=${store}&month=${month}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const t = data.sales.total;
  const q = data.quality;
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const m1 = new Date(`${month}-01T00:00:00`);
  const daysInMonth = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(m1.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const maxNet = Math.max(1, ...data.days.map((d) => d.net));
  const rating = (now: number | null) => (now == null ? "—" : now.toFixed(2));
  const ratingSub = (now: number | null, start: number | null) =>
    start == null || now == null ? undefined : start === now ? "月初から変わらず" : `月初 ${start.toFixed(2)} から`;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="売上（税抜）" value={php(t.net)} sub={data.sales_change != null && data.prev ? `先月の${short(data.prev.from)}〜${short(data.prev.to)}比 ${signed(data.sales_change)}` : `${short(data.from)}〜${short(data.to)}${data.complete ? "" : "（途中まで）"}`} />
        <Card label="注文数" value={`${num(t.orders)}件`} />
        <Card label="客単価" value={php(t.avg_ticket)} />
        <Card label="1日あたりの売上" value={php(data.daily_avg_net)} sub={`${data.days.length}日間の平均`} />
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">チャネル別</p>
          <div className="mt-3 space-y-2">
            {(["grab", "foodpanda", "dine_in"] as const).map((ch) => {
              const c = data.sales.channels[ch];
              const share = t.net ? c.net / t.net : 0;
              return (
                <div key={ch} className="text-sm">
                  <div className="flex justify-between gap-2 text-slate-300"><span>{CHANNEL_LABEL[ch]}</span><span className="text-right tabular-nums text-white">{php(c.net)} · {num(c.orders)}件</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-white">日ごとの売上 <span className="font-normal text-slate-400">— 日付を押すとその日の詳細を開きます</span></p>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w, i) => <div key={w} className={`pb-1 text-[11px] ${i === 0 ? "text-rose-300" : i === 6 ? "text-sky-300" : "text-slate-400"}`}>{w}</div>)}
            {cells.map((c, i) => {
              if (!c) return <div key={`e${i}`} />;
              const d = byDay.get(c);
              const dayNum = Number(c.slice(8));
              if (!d) return <div key={c} className="rounded-md border border-white/5 py-2 text-[11px] text-slate-600">{dayNum}</div>;
              const warn = d.checks_done < 4 || d.check_issues > 0 || (d.change != null && d.change <= -0.2)
                || (d.grab_offline_min ?? 0) >= 60 || (d.foodpanda_offline_min ?? 0) >= 60 || (d.foodpanda_prep_min ?? 0) > 25;
              return (
                <button key={c} onClick={() => onOpenDay(c)} title={d.flags.length ? d.flags.join("\n") : "特に変わった点はありません"}
                  className={`relative overflow-hidden rounded-md border px-0.5 pb-1 pt-1 text-left hover:border-emerald-400/60 ${warn ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-white/10 bg-white/[0.02]"}`}>
                  <div className="absolute inset-x-0 bottom-0 bg-emerald-400/15" style={{ height: `${Math.round((d.net / maxNet) * 70)}%` }} aria-hidden />
                  <div className="relative flex items-start justify-between px-0.5">
                    <span className="text-[11px] font-semibold text-slate-200">{dayNum}</span>
                    {warn && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="確認しておきたい点あり" />}
                  </div>
                  <div className="relative mt-1 text-center text-[10px] tabular-nums text-white sm:text-xs">{kilo(d.net)}</div>
                  <div className="relative hidden text-center text-[10px] tabular-nums text-slate-400 sm:block">{d.orders}件{d.c_photos ? <span className="text-slate-500">・C{d.c_photos}</span> : null}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />店舗チェックの未提出・問題、オフライン60分以上、調理時間25分超、先週同曜日より売上20%以上減のいずれかがあった日。「C」はC評価の料理写真の枚数です（スマートフォンでは注文数と合わせて省略しています）。緑の帯の高さは、この月で一番売上が多い日に対する割合です。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="GrabFood の評価" value={rating(q.grab_rating)} sub={ratingSub(q.grab_rating, q.grab_rating_start)} />
        <Card label="foodpanda の評価" value={rating(q.foodpanda_rating)} sub={ratingSub(q.foodpanda_rating, q.foodpanda_rating_start)} />
        <Card label="調理時間" value={q.foodpanda_prep_avg_min != null ? `${q.foodpanda_prep_avg_min}分` : "—"} sub={`foodpanda の平均${q.grab_prep_median_avg_min != null ? `・GrabFood ${q.grab_prep_median_avg_min}分` : ""}`} />
        <Card label="オフライン時間（合計）" value={`${num(q.grab_offline_min + q.foodpanda_offline_min)}分`} sub={`GrabFood ${num(q.grab_offline_min)}分・foodpanda ${num(q.foodpanda_offline_min)}分`} />
        <Card label="店舗チェック" value={`${data.checks.done} / ${data.checks.expected}回`} sub={data.checks.issues ? `問題あり ${data.checks.issues}回` : "問題の報告なし"} />
        <Card label="出勤スタッフ" value={`延べ${num(data.team.person_days)}人`} sub={`合計${num(data.team.hours)}時間`} />
        <Card label="CKからの納品" value={`${data.ck_notes}件`} />
        <Card label="料理写真の評価" value={data.product.avg != null ? `平均${data.product.avg}点` : "—"} sub={`${num(data.product.count)}枚・${["A", "B", "C"].filter((g) => data.product.by_grade[g]).map((g) => `${g} ${num(data.product.by_grade[g])}`).join("・")}`} />
      </div>

      <p className="text-xs text-slate-500">
        売上は店舗のレジ（StoreHub）の記録で税抜です。「分配」タブの月次の数字は各プラットフォームの精算明細を使うため、数%の差が出ることがあります。{data.complete ? "" : `この月は${short(data.to)}までの集計です。`}
      </p>
    </div>
  );
}

function ScorePhoto({ store, item }: { store: string; item: ScoreItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true; let made: string | null = null;
    ownerImageUrl(`/api/owner/product-scores/${item.id}/photo?store=${store}`)
      .then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [store, item.id]);
  const tone = item.grade === "A" ? "bg-emerald-500 text-slate-950" : item.grade === "C" ? "bg-amber-400 text-slate-950" : "bg-slate-200 text-slate-900";
  return (
    <button onClick={() => setOpen(!open)} className="overflow-hidden rounded-lg border border-white/10 bg-slate-900 text-left">
      <div className="relative aspect-square bg-slate-800">
        {url ? <img src={url} alt={`${CATEGORY_LABEL[item.food_category] || item.food_category}の料理写真、${item.total_score}点`} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-xs text-slate-500">{failed ? "写真を表示できません" : "読み込み中…"}</div>}
        <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-bold ${tone}`}>{item.grade} {item.total_score}</span>
      </div>
      <div className="p-2 text-xs text-slate-400">
        <p>{item.at ?? ""} · {CATEGORY_LABEL[item.food_category] || item.food_category}</p>
        {open && (
          <div className="mt-1 space-y-1">
            <p className="text-slate-300">{item.feedback}</p>
            <p className="text-[10px] text-slate-500">（AIによる講評・英語）</p>
            <p className="text-[11px]">形 {item.score_shape}・大きさの均一さ {item.score_size_consistency}・仕上がり {item.score_completion}・トッピング {item.score_topping}・カット {item.score_cut_uniformity}・盛り付け {item.score_arrangement}・量 {item.score_portioning}</p>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Distributions (the ledger under the agreement) ──────────────────────────
type LedgerRow = {
  month: string; financial_year: number; month_index: number; net_sales: number; store_costs: number;
  profit_before_fees: number; ck_supply_fee: number; operating_fee: number; royalty: number; foco_fees: number;
  operating_profit: number; corp_tax: number; corp_tax_rate: number; corp_tax_basis: "provisional" | "filed";
  capex_reserve: number; after_tax_profit: number; ytd_after_tax_profit: number; preferred_cap_year: number;
  ytd_preferred: number; ytd_owner_excess: number; ytd_entitled: number; interim_distribution: number;
  paid: number | null; ytd_payable: number; ytd_paid: number; year_end_due: number | null; overpayment_carried_in: number;
  fl_ratio: number | null; status: string;
  revision: number; published_at: string | null;
  company_support?: { fees_waived: Record<string, number>; fees_waived_total: number; trainee_labor: number; trainee_people: number; cost_share?: number; total: number };
};
const WAIVED_LABEL: Record<string, string> = { ck_supply_fee: "食材供給", operating_fee: "運営", royalty: "ロイヤリティ" };
// The Company's support for a month, in one sentence the owner can read: fees it gave up
// and the trainees it paid for -- a count, never names (owner, 2026-10-31).
function supportText(r: LedgerRow): string | null {
  const cs = r.company_support;
  if (!cs || !cs.total) return null;
  const parts: string[] = [];
  if (cs.fees_waived_total) parts.push(`フィー免除 ${php(cs.fees_waived_total)}（${Object.keys(cs.fees_waived).map((k) => WAIVED_LABEL[k] || k).join("・")}）`);
  if (cs.trainee_labor) parts.push(`新店のための研修スタッフ${cs.trainee_people}人の人件費 ${php(cs.trainee_labor)}`);
  if (cs.cost_share) parts.push(`家賃などの一部 ${php(cs.cost_share)}`);
  return `会社による支援 ${php(cs.total)}：${parts.join("、")}`;
}
type Ledger = {
  store_name: string;
  contract: {
    investment_jpy: number; fx_php_per_jpy: number; fx_date: string; investment_php: number; opening_date: string;
    term_end: string; months_left: number; preferred_cap_year: number; operating_fee_pct: number; royalty_pct: number;
    food_supply_fee_pct: number; capex_reserve_pct: number; excess_owner_pct: number;
  };
  rows: LedgerRow[];
  payments: { id: number; month: string; amount: number; paid_on: string; reference: string }[];
  kpi: { paid_to_date: number; recovery_rate: number | null; due_not_paid: number; last_month: string | null; buyout_reference: number | null };
  fl: { month: string; fl_ratio: number | null; over: boolean; streak: number }[];
  // Months that have ended and are not closed yet, as they stand now (owner, 2026-10-31).
  preliminary?: Prelim[];
};
type Prelim = Pick<LedgerRow, "month" | "net_sales" | "store_costs" | "foco_fees" | "ck_supply_fee" | "operating_fee" | "royalty"
  | "operating_profit" | "corp_tax" | "corp_tax_rate" | "capex_reserve" | "after_tax_profit"
  | "ytd_payable" | "financial_year" | "company_support"> & {
  // What this month adds to the year's payable (adds up month by month); ytd_payable is the year so far.
  month_payable: number; status: "open" | "approved"; pending: string[];
};
const prevMonthOf = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };

// A month as it stands before it is closed: every figure, marked not final, with what is still estimated.
function PrelimCard({ p }: { p: Prelim }) {
  const lastMonth = prevMonthOf(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7));
  const when = p.status === "approved" ? "本部で確認済み・公開の準備中です"
    : p.month === lastMonth ? "確定は翌月20日ごろの予定です" : "本部で締めの作業中です";
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-white">{monthName(p.month)} <span className="ml-1 rounded-full border border-amber-400/40 px-2 py-0.5 text-xs font-normal text-amber-200">速報・確定前</span></p>
        <p className="text-xs text-slate-400">{when}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        {([
          ["純売上", p.net_sales], ["店舗費用", p.store_costs], ["会社へのフィー", p.foco_fees], ["営業利益", p.operating_profit],
          ["法人税（暫定）", p.corp_tax], ["設備更新積立", p.capex_reserve], ["税引後利益", p.after_tax_profit], ["この月の分配の見込み", p.month_payable],
        ] as [string, number][]).map(([label, v]) => (
          <div key={label}>
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className={`tabular-nums ${label === "この月の分配の見込み" ? "font-semibold text-emerald-300" : v < 0 ? "text-red-300" : "text-white"}`}>{php(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-slate-400">年度累計のお支払い額（見込み）{php(p.ytd_payable)}。毎月のお支払いは税引後利益の70%までで、残りは年度末に精算します。</p>
      {supportText(p as unknown as LedgerRow) && <p className="mt-2 text-[11px] text-sky-300">{supportText(p as unknown as LedgerRow)}</p>}
      {p.pending.length > 0 && (
        <div className="mt-3 text-xs text-slate-300">
          <p className="font-semibold text-amber-200">まだ見込みの項目</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{p.pending.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("ja-JP", { month: "long", year: "numeric" });
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);

function LedgerTab({ store, onAuthError }: { store: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Ledger>(`/api/owner/ledger?store=${store}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const c = data.contract;
  const k = data.kpi;
  const rows = data.rows;
  const last = rows[rows.length - 1];
  const yearRows = last ? rows.filter((r) => r.financial_year === last.financial_year) : [];
  const yearLast = yearRows[yearRows.length - 1];
  const prefUsed = yearLast && yearLast.preferred_cap_year > 0 ? Math.min(1, yearLast.ytd_preferred / yearLast.preferred_cap_year) : 0;
  const flLast = data.fl[data.fl.length - 1];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-slate-300">
        <span>出資額 <b className="text-white">{peso(c.investment_php)}</b> <span className="text-slate-500">（¥{num(c.investment_jpy)}を{c.fx_date}のBSPレート 1円＝₱{c.fx_php_per_jpy} で換算した契約上の金額）</span></span>
        <span>開業日 <b className="text-white">{c.opening_date}</b></span>
        <span>契約期間の終了 <b className="text-white">{c.term_end}</b>・残り{c.months_left}か月</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="お支払い済みの分配" value={php(k.paid_to_date, 2)} sub={`${data.payments.length}回`} />
        <Card label="回収率" value={pct(k.recovery_rate)} sub="お支払い済み ÷ 出資額（ペソ）" />
        <Card label="お支払い予定（未払い）" value={php(k.due_not_paid, 2)} sub="期中分配" />
        <Card label="最新の確定月" value={k.last_month ? monthName(k.last_month) : "—"} />
      </div>

      {(data.preliminary || []).length > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">速報（確定前）</p>
            <p className="mt-1">
              {"月が終わった翌日から、その月の数字をいまの記録のまま表示します。確定（お支払い額の確定）は翌月20日ごろです。"
                + "月末の数日分の給与は「月末から翌月10日まで」の給与期間に入るため、その計算が終わるのが翌月中旬になること、"
                + "また貸主（Sundry）の月後半分の家賃の請求書が翌月8日ごろに届くことが理由です。"
                + "確定までは、下の「まだ見込みの項目」が実額に置き換わり、数字が動くことがあります。"}
            </p>
          </div>
          {(data.preliminary || []).map((p) => <PrelimCard key={p.month} p={p} />)}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300">
          まだ確定した月はありません。本部は、請求書と給与がそろった時点で月を締めてここに公開します（通常は翌月20日ごろ）。{(data.preliminary || []).length > 0 ? "それまでは上の速報をご覧ください。" : "月が終わった翌日から、その月の速報をここに表示します。"}
        </div>
      ) : (
        <>
          {yearLast && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">{yearLast.financial_year}年度の優先分配</p>
                <p className="text-sm tabular-nums text-slate-300">{php(yearLast.ytd_preferred, 2)} ／ 上限 {php(yearLast.preferred_cap_year, 2)}</p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(prefUsed * 100).toFixed(1)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-400">出資額の年30%までを、会計年度（1月〜12月）ごとに計算します（{yearLast.financial_year === 2026 ? "2026年度は10月〜12月の3か月分" : "1年分"}）。その年に届かなかった分は翌年に繰り越しません。上限を超えた利益は、会社{100 - c.excess_owner_pct}%・オーナー様{c.excess_owner_pct}%で分けます。</p>
            </div>
          )}

          {/* On a phone each month is a card; the ten-column table is for wider screens. */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.month} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm tabular-nums">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold text-white">{monthName(r.month)}{r.revision > 1 && <span className="ml-1 text-[10px] text-amber-300">訂正{r.revision - 1}回</span>}</p>
                  <p className="text-xs text-slate-400">法人税 {(r.corp_tax_rate * 100).toFixed(0)}%（{r.corp_tax_basis === "filed" ? "申告済み" : "暫定"}）</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {([
                    ["純売上", r.net_sales], ["店舗費用", r.store_costs], ["会社へのフィー", r.foco_fees],
                    ["営業利益", r.operating_profit], ["法人税", r.corp_tax], ["設備更新積立", r.capex_reserve],
                    ["税引後利益", r.after_tax_profit],
                  ] as [string, number][]).map(([k, v]) => (
                    <Fragment key={k}>
                      <dt className="text-slate-400">{k}</dt>
                      <dd className={`text-right ${v < 0 ? "text-red-300" : "text-white"}`}>{php(v)}</dd>
                    </Fragment>
                  ))}
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <div><p className="text-xs text-slate-400">年度累計のお支払い額</p><p className="font-semibold text-white">{php(r.ytd_payable, 2)}</p>
                    {r.year_end_due != null && r.year_end_due > 0 && <p className="text-[11px] text-emerald-300">年度末の精算 {php(r.year_end_due, 2)}</p>}</div>
                  <div className="text-right"><p className="text-xs text-slate-400">年度累計のお支払い済み</p><p className="font-semibold text-white">{php(r.ytd_paid, 2)}</p>
                    {r.overpayment_carried_in > 0 && <p className="text-[11px] text-amber-300">前年度の払い過ぎ {php(r.overpayment_carried_in, 2)} を含む</p>}</div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">フィー内訳：食材供給 {php(r.ck_supply_fee)}・運営 {php(r.operating_fee)}・ロイヤリティ {php(r.royalty)}</p>
                {supportText(r) && <p className="mt-1 text-[11px] text-sky-300">{supportText(r)}</p>}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
            <table className="w-full min-w-[980px] text-sm tabular-nums">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">月</th><th className="px-3 py-2 text-right">純売上</th>
                  <th className="px-3 py-2 text-right">店舗費用</th><th className="px-3 py-2 text-right">会社へのフィー</th>
                  <th className="px-3 py-2 text-right">営業利益</th><th className="px-3 py-2 text-right">法人税</th>
                  <th className="px-3 py-2 text-right">設備更新積立</th><th className="px-3 py-2 text-right">税引後利益</th>
                  <th className="px-3 py-2 text-right">年度累計のお支払い額</th><th className="px-3 py-2 text-right">年度累計のお支払い済み</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.month}>
                  <tr className="border-t border-white/5 align-top">
                    <td className="px-3 py-2 text-white">{monthName(r.month)}{r.revision > 1 && <span className="ml-1 text-[10px] text-amber-300">訂正{r.revision - 1}回</span>}</td>
                    <td className="px-3 py-2 text-right">{php(r.net_sales)}</td>
                    <td className="px-3 py-2 text-right">{php(r.store_costs)}</td>
                    <td className="px-3 py-2 text-right" title={`食材供給フィー ${php(r.ck_supply_fee)}・運営フィー ${php(r.operating_fee)}・ロイヤリティ ${php(r.royalty)}`}>
                      {php(r.foco_fees)}
                      <div className="text-[11px] text-slate-500">食材供給 {php(r.ck_supply_fee)}・運営 {php(r.operating_fee)}・ロイヤリティ {php(r.royalty)}</div>
                    </td>
                    <td className={`px-3 py-2 text-right ${r.operating_profit < 0 ? "text-red-300" : ""}`}>{php(r.operating_profit)}</td>
                    <td className="px-3 py-2 text-right">{php(r.corp_tax)}<div className="text-[11px] text-slate-500">{(r.corp_tax_rate * 100).toFixed(0)}%（{r.corp_tax_basis === "filed" ? "申告済み" : "暫定"}）</div></td>
                    <td className="px-3 py-2 text-right">{php(r.capex_reserve)}</td>
                    <td className={`px-3 py-2 text-right ${r.after_tax_profit < 0 ? "text-red-300" : "text-white"}`}>{php(r.after_tax_profit)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-white">
                      {php(r.ytd_payable, 2)}
                      {r.year_end_due != null && r.year_end_due > 0 && <div className="text-[11px] font-normal text-emerald-300">年度末の精算 {php(r.year_end_due, 2)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {php(r.ytd_paid, 2)}
                      {r.paid ? <div className="text-[11px] text-slate-500">今月のお支払い {php(r.paid, 2)}</div> : null}
                      {r.overpayment_carried_in > 0 && <div className="text-[11px] text-amber-300">前年度の払い過ぎ {php(r.overpayment_carried_in, 2)} を含む</div>}
                    </td>
                  </tr>
                  {supportText(r) && (
                    <tr><td colSpan={10} className="px-3 pb-2 text-[11px] text-sky-300">{supportText(r)}</td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">FL比率 <span className="font-normal text-slate-400">（食材費＋食材供給フィー＋店舗人件費）÷ 純売上</span></p>
              <div className="mt-3 space-y-1.5">
                {data.fl.map((f) => (
                  <div key={f.month} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-slate-400">{monthName(f.month)}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${f.over ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${Math.min(100, (f.fl_ratio || 0) * 100)}%` }} />
                      <div className="absolute inset-y-[-3px] w-px bg-white/60" style={{ left: "55%" }} title="55%" />
                    </div>
                    <span className={`w-14 text-right tabular-nums ${f.over ? "text-amber-300" : "text-white"}`}>{pct(f.fl_ratio)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                線は55%です。超えた月は、原因と改善方針を翌月の報告でご説明します。3か月続けて超えた場合は、書面で改善計画をお出しします（契約第9条4項）。
                {flLast?.streak >= 3 && <b className="text-amber-300"> 3か月連続で55%を超えています：書面の改善計画をお出しします。</b>}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p className="font-semibold text-white">会社へのフィー（契約 Schedule 1）</p>
              <ul className="mt-2 space-y-1">
                <li>食材供給フィー：供給原価の{c.food_supply_fee_pct}%（明細は「CK供給」タブ）</li>
                <li>運営フィー：純売上の{c.operating_fee_pct}%</li>
                <li>フランチャイズ・ロイヤリティ：純売上の{c.royalty_pct}%</li>
                <li>設備更新積立：純売上の{c.capex_reserve_pct}%（店舗の修繕のために積み立て）</li>
              </ul>
              <p className="mt-2 text-xs text-slate-400">これ以外の本部費用を店舗に負担させることはありません（契約第7条7項）。年1回、オーナー様のご負担で、独立した会計士に損益と供給原価を検証させることができます（契約第9条6項）。</p>
              {k.buyout_reference != null && (
                <p className="mt-2 text-xs text-slate-400">買取価格の参考値（契約第12条3項）：{php(k.buyout_reference, 2)}（直近12か月の分配×0.8）。会社の権利であって義務ではなく、回収率には含めません。</p>
              )}
            </div>
          </div>
        </>
      )}

      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
        <li>金額はペソが基準です。回収率は、お支払い済みの分配 ÷ 出資額（ペソ、{peso(c.investment_php)}）で計算します。括弧内の円はその日のレートによる参考表示です。</li>
        <li>分配はフィリピンの法人税を差し引いた後、オーナー様ご自身にかかる税を差し引く前の金額です。分配にかかる源泉税や、お住まいの国での課税は含まれていないため、実際の受取額はこれより少なくなることがあります。</li>
        <li>法人税は、毎月その年度の累計に25%をかけて暫定で計算します。会社が年度の申告をした時点で、申告した税率（条件を満たせば20%）で年度全体を計算し直し、差額を精算します。</li>
        <li>毎月の分配は監査前の月次決算にもとづく期中分配で、年度累計の利益の70%が上限です。年度の決算が確定した時点で精算し、残りをお支払いするか、払い過ぎは翌期以降の分配から差し引きます（契約 Schedule 2 第3条・第4条）。</li>
        <li>「会社による支援」は、会社が受け取るはずのフィーを免除した額、新しい店舗のために研修中のスタッフの人件費、家賃などの一部を会社が負担した額です。店舗の費用の実額は変えずに、支援として分けて表示しています。</li>
        <li>家賃と光熱費は、請求書が届くまでは見込みで計上し、請求書の実額が入ると置き換えます。家賃は、貸主（Sundry）の計算式を、その月の売上にあてはめて計算しています。</li>
        <li>利回りや回収は目標であり、保証ではありません。各月は本部が締めてから表示し、訂正した月には訂正回数を表示します。</li>
      </ul>
    </section>
  );
}

// ── Sales ───────────────────────────────────────────────────────────────────
type SalesDay = {
  day: string; grab_orders: number; grab_net: number; grab_gross: number; foodpanda_orders: number;
  foodpanda_net: number; foodpanda_gross: number; store_orders: number; store_net: number; store_gross: number;
  total_orders: number; total_net: number;
};
type Sales = { days: SalesDay[]; totals: Record<string, number | null> };

function SalesTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Sales>(`/api/owner/sales?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const t = data.totals;
  const chart = data.days.map((d) => ({ day: d.day.slice(5), GrabFood: d.grab_net, foodpanda: d.foodpanda_net, "店内・Beep": d.store_net }));
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="売上（税抜）" value={php(t.total_net as number)} sub={`${from}〜${to}`} />
        <Card label="注文数" value={`${num(t.total_orders as number)}件`} />
        <Card label="客単価" value={php(t.avg_ticket as number)} />
        <Card label="日数" value={`${data.days.length}日`} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="GrabFood" value={php(t.grab_net as number)} sub={`${num(t.grab_orders as number)}件・割引前 ${peso(t.grab_gross as number)}`} />
        <Card label="foodpanda" value={php(t.foodpanda_net as number)} sub={`${num(t.foodpanda_orders as number)}件・割引前 ${peso(t.foodpanda_gross as number)}`} />
        <Card label="店内・Beep" value={php(t.store_net as number)} sub={`${num(t.store_orders as number)}件`} />
      </div>
      <div className="h-72 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} formatter={(v: number) => php(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="GrabFood" stackId="a" fill="#10b981" />
            <Bar dataKey="foodpanda" stackId="a" fill="#ec4899" />
            <Bar dataKey="店内・Beep" stackId="a" fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500">契約上の純売上です：VAT抜き、店舗が負担した割引を差し引いた後の金額で、お客様に返金した foodpanda の注文は除いています。シニア・PWDの売上はVAT免税のため1.12で割っていません。「割引前」は店舗負担の割引を差し引く前の注文金額（VAT込み）です。</p>
    </section>
  );
}

// ── CK billing ──────────────────────────────────────────────────────────────
type CkItem = { item_name: string; unit: string; unit_cost: number; received_qty: number; cost: number; margin: number; amount: number };
type Ck = {
  cycle: string; period_from: string; period_to: string; billable: boolean; margin_pct: number;
  confirmed_notes: number; pending_notes: { note_id: number; delivery_date: string; order_no: string; status: string; sent_cost: number }[];
  unpriced_lines: number; totals: { cost: number; margin: number; amount: number; charged?: number }; by_item: CkItem[];
  // The Company waives the Food Supply Fee for the month (its support): the store is charged the cost alone.
  fee_waived?: boolean;
};

function CkTab({ store, cycle, onAuthError }: { store: string; cycle: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Ck>(`/api/owner/ck-billing?store=${store}&cycle=${cycle}`, onAuthError);
  const [dlError, setDlError] = useState("");
  if (!data) return <Loading error={error} />;
  const t = data.totals;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="CKの食材原価" value={php(t.cost, 2)} sub={`受領確認済みの納品 ${data.confirmed_notes}件`} />
        <Card label={`食材供給フィー ${data.margin_pct}%`} value={php(t.margin, 2)} sub={data.fee_waived ? "この月は会社が免除（店舗の費用になりません）" : undefined} />
        {data.fee_waived
          ? <Card label="店舗の費用になる額（食材原価のみ）" value={php(t.charged ?? t.cost, 2)} sub={`${data.period_from}〜${data.period_to}`} />
          : <Card label="食材原価＋食材供給フィー" value={php(t.amount, 2)} sub={`${data.period_from}〜${data.period_to}`} />}
      </div>
      {data.pending_notes.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          店舗がまだ受領確認していない納品書が{data.pending_notes.length}件あり、まだ計上していません（出荷数量で{php(data.pending_notes.reduce((s, n) => s + n.sent_cost, 0))}）。店舗が受け取った数量を確認した月に計上します。
        </div>
      )}
      {data.unpriced_lines > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          CKの単価が未設定の品目が{data.unpriced_lines}行あり、金額に含まれていません。本部で単価を設定中です。
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">品目別</h2>
        <button onClick={() => ownerDownload(`/api/owner/ck-billing/csv?store=${store}&cycle=${cycle}`, `ck-billing-${store.toLowerCase()}-${cycle}.csv`).catch((e) => setDlError(String(e.message || e)))}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">明細をダウンロード（CSV）</button>
      </div>
      {dlError && <p className="text-xs text-red-300">{dlError}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">品目</th><th className="px-3 py-2">単位</th><th className="px-3 py-2 text-right">受領数量</th>
              <th className="px-3 py-2 text-right">単価</th><th className="px-3 py-2 text-right">原価</th>
              <th className="px-3 py-2 text-right">食材供給フィー</th><th className="px-3 py-2 text-right">合計</th></tr>
          </thead>
          <tbody>
            {data.by_item.map((i) => (
              <tr key={`${i.item_name}|${i.unit}|${i.unit_cost}`} className="border-t border-white/5">
                <td className="px-3 py-2 text-white">{i.item_name}</td><td className="px-3 py-2 text-slate-400">{i.unit}</td>
                <td className="px-3 py-2 text-right">{num(i.received_qty, 2)}</td>
                <td className={`px-3 py-2 text-right ${i.unit_cost > 0 ? "" : "text-amber-300"}`}>{i.unit_cost > 0 ? php(i.unit_cost, 2) : "単価未設定"}</td>
                <td className="px-3 py-2 text-right">{php(i.cost, 2)}</td><td className="px-3 py-2 text-right">{php(i.margin, 2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{php(i.amount, 2)}</td>
              </tr>
            ))}
            {data.by_item.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">この月に受領確認されたCKの納品はまだありません。</td></tr>}
          </tbody>
          {data.by_item.length > 0 && (
            <tfoot className="border-t border-white/10 bg-white/[0.04] font-semibold text-white">
              <tr><td className="px-3 py-2" colSpan={4}>合計</td><td className="px-3 py-2 text-right">{php(t.cost, 2)}</td>
                <td className="px-3 py-2 text-right">{php(t.margin, 2)}</td><td className="px-3 py-2 text-right">{php(t.amount, 2)}</td></tr>
              {data.fee_waived && (
                <tr className="text-sky-300"><td className="px-3 py-2" colSpan={5}>食材供給フィー（会社が免除）</td>
                  <td className="px-3 py-2 text-right">−{php(t.margin, 2)}</td><td className="px-3 py-2 text-right">{php(t.charged ?? t.cost, 2)}</td></tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-500">セントラルキッチンからの食材原価と食材供給フィー（供給原価の{data.margin_pct}%、契約 Schedule 1）です。店舗が受け取りを確認した数量に、各納品書のCK単価をかけて、受領確認した月に計上します。どちらも月次損益における店舗の費用です。{data.fee_waived ? "この月は食材供給フィーを会社が免除しているため、店舗の費用になるのは食材原価だけです（「分配」タブの「会社による支援」に含まれます）。" : ""}</p>
    </section>
  );
}

// ── Payouts ─────────────────────────────────────────────────────────────────
type Payouts = { payouts: { platform: string; payout_date: string; period_start: string; period_end: string; amount: number; orders: number | null; gross_sales: number | null; net_sales: number | null; before_transfer: boolean }[]; totals: Record<string, number>; owned_from: string };

function PayoutsTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Payouts>(`/api/owner/payouts?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="GrabFood からの入金" value={php(data.totals.grab || 0, 2)} />
        <Card label="foodpanda からの入金" value={php(data.totals.foodpanda || 0, 2)} />
        <Card label="合計" value={php((data.totals.grab || 0) + (data.totals.foodpanda || 0), 2)} sub={`${from}〜${to}`} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">入金日</th><th className="px-3 py-2">プラットフォーム</th><th className="px-3 py-2">対象の売上期間</th>
              <th className="px-3 py-2 text-right">注文数</th><th className="px-3 py-2 text-right">入金額</th></tr>
          </thead>
          <tbody>
            {data.payouts.map((p, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-3 py-2">{p.payout_date}</td>
                <td className="px-3 py-2">{p.platform === "grab" ? "GrabFood" : "foodpanda"}</td>
                <td className="px-3 py-2 text-slate-400">
                  {p.period_start === p.period_end ? p.period_start : `${p.period_start}〜${p.period_end}`}
                  {p.before_transfer && <span className="block text-xs text-amber-300">{data.owned_from}より前の売上を含むため、合計には入れていません</span>}
                </td>
                <td className="px-3 py-2 text-right">{num(p.orders)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{php(p.amount, 2)}</td>
              </tr>
            ))}
            {data.payouts.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">この月の入金はありません。</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">各プラットフォームが手数料を差し引いて銀行に振り込んだ金額です。</p>
    </section>
  );
}

// ── Store performance ───────────────────────────────────────────────────────
type Quality = {
  ratings: { day: string; aggregator: string; rating_score: number; review_count: number | null }[];
  foodpanda_ops: { day: string; prep_seconds: number | null; offline_seconds: number | null; rejection_pct: number | null }[];
  grab_offline: { day: string; offline_minutes: number; offline_rate_pct: number }[];
  grab_prep: { day: string; orders: number; median_prep_minutes: number }[];
};

function QualityTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Quality>(`/api/owner/quality?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const latest = (agg: string) => [...data.ratings].reverse().find((r) => r.aggregator === agg)?.rating_score ?? null;
  const fp = data.foodpanda_ops.filter((d) => d.prep_seconds != null);
  const fpPrep = fp.length ? fp.reduce((s, d) => s + (d.prep_seconds || 0), 0) / fp.length / 60 : null;
  const fpOffline = data.foodpanda_ops.reduce((s, d) => s + (d.offline_seconds || 0), 0) / 60;
  const grabOffline = data.grab_offline.reduce((s, d) => s + d.offline_minutes, 0);
  const prepByDay = new Map<string, { day: string; GrabFood?: number; foodpanda?: number }>();
  data.grab_prep.forEach((d) => prepByDay.set(d.day, { ...(prepByDay.get(d.day) || { day: d.day }), GrabFood: Math.round(d.median_prep_minutes * 10) / 10 }));
  fp.forEach((d) => prepByDay.set(d.day, { ...(prepByDay.get(d.day) || { day: d.day }), foodpanda: Math.round((d.prep_seconds || 0) / 6) / 10 }));
  const prepChart = [...prepByDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, day: d.day.slice(5) }));
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="GrabFood の評価" value={latest("GrabFood")?.toFixed(2) ?? "—"} sub="最新" />
        <Card label="foodpanda の評価" value={latest("FoodPanda")?.toFixed(2) ?? "—"} sub="最新" />
        <Card label="foodpanda の調理時間" value={fpPrep == null ? "—" : `${fpPrep.toFixed(1)}分`} sub="日ごとの平均" />
        <Card label="オフライン時間" value={`${Math.round(grabOffline + fpOffline)}分`} sub={`GrabFood ${Math.round(grabOffline)}分・foodpanda ${Math.round(fpOffline)}分`} />
      </div>
      <div className="h-72 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">調理時間（分）</p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={prepChart}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="GrabFood" stroke="#10b981" dot={false} connectNulls />
            <Line type="monotone" dataKey="foodpanda" stroke="#ec4899" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500">GrabFood：注文を受けてから「準備完了」にするまでの時間（中央値）。foodpanda：プラットフォームが出している日ごとの平均。オフライン時間は、営業時間中にアプリ上で店舗が閉じていた時間です。</p>
    </section>
  );
}
