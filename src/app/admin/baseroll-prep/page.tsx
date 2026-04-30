// src/app/admin/baseroll-prep/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE } from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type RollQty = { roll: string; qty_raw: number; qty_prep: number };
type MatchedProduct = { name: string; daily_qty: number };
type StoreResult = {
  store: string;
  reference_date: string;
  total_orders: number;
  lunch_orders: number;
  lunch_ratio: number;
  dinner_orders: number;
  dinner_ratio: number;
  matched_products: MatchedProduct[];
  lunch: RollQty[];
  dinner: RollQty[];
};
type ApiResult = {
  ok: boolean;
  prep_date: string;
  reference_date: string;
  stores: StoreResult[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

async function apiFetch<T>(path: string): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    headers: { ...(getAuthHeaders(auth) ?? {}) },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Roll colour map ──────────────────────────────────────────────────────────

const ROLL_COLORS: Record<string, string> = {
  "California Base Roll":                   "bg-yellow-500/20 text-yellow-200 border-yellow-500/30",
  "Cucumber Crabstick Mayo Roll":           "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
  "Spicy Tuna & Quezo Base Roll":           "bg-rose-500/20 text-rose-200 border-rose-500/30",
  "Cucumber Crabstick & Mango Base Roll":   "bg-orange-500/20 text-orange-200 border-orange-500/30",
  "Shrimp Tempura Base Roll":               "bg-amber-500/20 text-amber-200 border-amber-500/30",
  "Crunchy Fish Base Roll":                 "bg-sky-500/20 text-sky-200 border-sky-500/30",
  "Crunchy Salmon Base Roll":               "bg-violet-500/20 text-violet-200 border-violet-500/30",
  "Crabstick Upo Base Roll":                "bg-teal-500/20 text-teal-200 border-teal-500/30",
  "Philadelphia Base Roll":                 "bg-indigo-500/20 text-indigo-200 border-indigo-500/30",
};

function rollColor(name: string) {
  return ROLL_COLORS[name] ?? "bg-neutral-500/20 text-neutral-200 border-neutral-500/30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionTable({ label, emoji, rows }: { label: string; emoji: string; rows: RollQty[] }) {
  if (rows.length === 0) return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-neutral-500">
      {emoji} {label} — データなし
    </div>
  );
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.04] px-4 py-2.5">
        <span className="text-sm font-semibold text-white">{emoji} {label}</span>
        <span className="ml-auto text-xs text-neutral-500">{rows.length} rolls</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.roll} className="flex items-center justify-between px-4 py-2.5">
            <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium ${rollColor(r.roll)}`}>
              {r.roll}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">{r.qty_raw} × 0.9 =</span>
              <span className="min-w-[2.5rem] rounded-lg bg-violet-600 px-3 py-1 text-center text-sm font-bold text-white tabular-nums">
                {r.qty_prep}
              </span>
              <span className="text-xs text-neutral-400">本</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreCard({ s }: { s: StoreResult }) {
  const [open, setOpen] = useState(true);
  const lunchPct = Math.round(s.lunch_ratio * 100);
  const dinnerPct = Math.round(s.dinner_ratio * 100);

  return (
    <div className={`${GLASS_CARD} overflow-hidden p-0`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 border-b border-white/10 bg-white/[0.04] px-5 py-3.5 text-left hover:bg-white/[0.07] transition"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-violet-500/20 px-3 py-0.5 text-sm font-bold text-violet-200">
            🏪 {s.store}
          </span>
          <span className="text-xs text-neutral-400">参照: {fmtDate(s.reference_date)}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-400">
          <span>🕐 ランチ {lunchPct}%</span>
          <span>🌙 ディナー {dinnerPct}%</span>
          <span className="text-neutral-600">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 p-4">
          {/* Order distribution bar */}
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-neutral-400">注文時間帯分布（前週同日）</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-sky-500/70" style={{ width: `${lunchPct}%` }} title={`ランチ ${lunchPct}%`} />
              <div className="bg-violet-500/70" style={{ width: `${dinnerPct}%` }} title={`ディナー ${dinnerPct}%`} />
            </div>
            <div className="mt-1.5 flex gap-4 text-[10px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500/70" />ランチ 11–14時 {s.lunch_orders}件 ({lunchPct}%)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-500/70" />ディナー 17–22時 {s.dinner_orders}件 ({dinnerPct}%)</span>
              <span className="ml-auto">合計 {s.total_orders}件</span>
            </div>
          </div>

          {/* Lunch / Dinner base roll tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SessionTable label="ランチ仕込み (×0.9)" emoji="🕐" rows={s.lunch} />
            <SessionTable label="ディナー仕込み (×0.9)" emoji="🌙" rows={s.dinner} />
          </div>

          {/* Matched products detail (collapsible) */}
          {s.matched_products.length > 0 && (
            <details className="rounded-xl border border-white/8 bg-white/[0.02]">
              <summary className="cursor-pointer px-4 py-2.5 text-xs text-neutral-500 hover:text-neutral-300">
                📋 使用した商品データ ({s.matched_products.length}品)
              </summary>
              <div className="divide-y divide-white/5 px-4 pb-3">
                {s.matched_products.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-neutral-300">{p.name}</span>
                    <span className="text-neutral-500">{p.daily_qty} 個</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BaserollPrepPage() {
  const [prepDate, setPrepDate] = useState(localDateStr(new Date()));
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refDate = useMemo(() => addDays(prepDate, -7), [prepDate]);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<ApiResult>(
        `/api/admin/analytics/manila/baseroll-prep?prep_date=${prepDate}`
      );
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [prepDate]);

  // Auto-load on mount
  useEffect(() => { void fetch(); }, [fetch]);

  const hasData = result && result.stores.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>🍣 ベースロール仕込み指示</h1>
          <p className="mt-1 text-sm text-neutral-400">
            前週同日の販売データから、ランチ・ディナーのベースロール仕込み本数を自動計算します
          </p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Admin
        </Link>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} flex flex-wrap items-end gap-4`}>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-400">仕込み日</label>
          <input
            type="date"
            value={prepDate}
            onChange={(e) => setPrepDate(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">参照日（前週同日）</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-300">
            {fmtDate(refDate)}
          </span>
        </div>
        <button
          type="button"
          onClick={fetch}
          disabled={loading}
          className={`${PRIMARY_BUTTON} min-w-[140px]`}
        >
          {loading ? "計算中…" : "🔄 計算する"}
        </button>
      </div>

      {/* Note */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 px-4 py-3 text-xs text-sky-300">
        💡 計算式: 前週同日の商品別販売数 × 時間帯注文比率 × 0.9（四捨五入）<br />
        <span className="text-sky-400/70">ランチ = 11–14時注文 / 全注文　ディナー = 17–22時注文 / 全注文</span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-neutral-500">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-sm">データを取得中…</p>
          </div>
        </div>
      )}

      {/* No data */}
      {!loading && result && !hasData && (
        <div className={`${GLASS_CARD} flex flex-col items-center py-16 text-center`}>
          <div className="mb-3 text-4xl">📭</div>
          <p className="text-sm font-medium text-neutral-300">
            {fmtDate(refDate)} のマニラ売上データが見つかりません
          </p>
          <p className="mt-1 text-xs text-neutral-500">別の日付を選択してください</p>
        </div>
      )}

      {/* Results */}
      {!loading && hasData && (
        <div className="space-y-4">
          {result!.stores.map((s) => (
            <StoreCard key={s.store} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
