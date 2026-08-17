"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  EyeOff,
  Eye,
  Zap,
  Info,
} from "lucide-react";
import { getAuth } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceAlert = {
  id: number;
  alert_date: string;
  brand_name: string;
  location_name: string;
  platform_name: string;
  item_name: string;
  category: string;
  old_price: number | null;
  new_price: number | null;
  old_discount_rate: number | null;
  new_discount_rate: number | null;
  old_available: boolean | null;
  new_available: boolean | null;
  change_type: "price_up" | "price_down" | "discount_up" | "discount_down" | "became_unavailable" | "became_available" | string;
  notified: boolean;
  created_at: string;
};

type Snapshot = {
  snapshot_date: string;
  brand_name: string;
  location_name: string;
  platform_name: string;
  item_name: string;
  category: string;
  base_price: number;
  platform_price: number;
  discount_rate: number;
  is_available: boolean;
};

type ComparisonItem = {
  brand_name: string;
  location_name: string;
  platform_name: string;
  item_name: string;
  category: string;
  base_price: number;
  today_price: number;
  today_rate: number;
  today_available: boolean;
  yesterday_price: number | null;
  yesterday_rate: number | null;
  yesterday_available: boolean | null;
  status: "ok" | "changed" | "new" | "unavailable";
};

type ComparisonResult = {
  ok: boolean;
  snapshot_date: string;
  city: string;
  items: ComparisonItem[];
  ok_count: number;
  changed_count: number;
  new_count: number;
  unavail_count: number;
};

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  const resp = await fetch(path, { ...opts, headers: { ...headers, ...opts?.headers } });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(txt);
  }
  return resp.json();
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function ChangeTypeBadge({ type }: { type: string }) {
  if (type === "price_up")
    return (
      <span className={`${BADGE_ERROR} inline-flex items-center gap-1`}>
        <TrendingUp className="w-3 h-3" /> Price Up
      </span>
    );
  if (type === "price_down")
    return (
      <span className={`${BADGE_WARNING} inline-flex items-center gap-1`}>
        <TrendingDown className="w-3 h-3" /> Price Down
      </span>
    );
  if (type === "discount_up")
    return (
      <span className={`${BADGE_SUCCESS} inline-flex items-center gap-1`}>
        <TrendingUp className="w-3 h-3" /> Discount Up
      </span>
    );
  if (type === "discount_down")
    return (
      <span className={`${BADGE_WARNING} inline-flex items-center gap-1`}>
        <TrendingDown className="w-3 h-3" /> Discount Down
      </span>
    );
  if (type === "became_unavailable")
    return (
      <span className={`${BADGE_ERROR} inline-flex items-center gap-1`}>
        <EyeOff className="w-3 h-3" /> Hidden
      </span>
    );
  if (type === "became_available")
    return (
      <span className={`${BADGE_SUCCESS} inline-flex items-center gap-1`}>
        <Eye className="w-3 h-3" /> Shown
      </span>
    );
  return <span className={BADGE_WARNING}>{type}</span>;
}

function fmtRate(r: number | null): string {
  if (r == null) return "—";
  return `${(Number(r) * 100).toFixed(1)}%`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

type BrandToken = {
  set: boolean;
  expires?: string;
  hours_left?: number | null;
  error?: string;
};

type TokenStatus = {
  ok: boolean;
  sushi?: BrandToken;
  ramen?: BrandToken;
};

export default function AggregatorPriceMonitorPage() {
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [tab, setTab] = useState<"alerts" | "comparison">("alerts");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ ok: boolean; alerts: PriceAlert[] }>(
        `/api/admin/aggregator-price/alerts?city=${city}&days=30`
      );
      setAlerts(res.alerts || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  const loadComparison = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<ComparisonResult>(
        `/api/admin/aggregator-price/comparison?city=${city}`
      );
      setComparison(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    if (tab === "alerts") loadAlerts();
    else loadComparison();
  }, [tab, city, loadAlerts, loadComparison]);

  useEffect(() => {
    apiFetch<TokenStatus>("/api/admin/aggregator-price/token-status")
      .then(setTokenStatus)
      .catch(() => {});
  }, []);

  const handleRunCheck = async () => {
    setRunning(true);
    setError("");
    setRunResult(null);
    try {
      const res = await apiFetch<Record<string, unknown>>(
        `/api/admin/aggregator-price/run-check?city=${city}`,
        { method: "POST" }
      );
      setRunResult(res);
      // Reload data
      if (tab === "alerts") loadAlerts();
      else loadComparison();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const todayAlerts = alerts.filter(
    (a) => a.alert_date === new Date().toISOString().slice(0, 10)
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={T_PAGE_TITLE}>Aggregator Price Monitor</h1>
          <p className={T_BODY}>
            Daily price check · Talabat / Careem / Noon / Keeta (Dubai) ·
            FoodPanda / GrabFood (Manila)
          </p>
        </div>
        <button
          onClick={handleRunCheck}
          disabled={running}
          className={PRIMARY_BUTTON}
        >
          {running ? (
            <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
          ) : (
            <Zap className="w-4 h-4 inline mr-2" />
          )}
          Run Check Now
        </button>
      </div>

      {/* City selector */}
      <div className={TAB_CONTAINER}>
        {(["dubai", "manila"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={city === c ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
          </button>
        ))}
      </div>

      {/* Setup notice for Manila */}
      {city === "manila" && (
        <div className={`${GLASS_CARD} flex items-start gap-3 p-4`}>
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className={T_LABEL}>Manila monitoring not yet configured</p>
            <p className={T_CAPTION}>
              FoodPanda and GrabFood partner portal tokens are required. Ask the
              engineering team to set{" "}
              <code className="font-mono text-xs bg-black/20 px-1 rounded">
                FOODPANDA_TOKEN
              </code>{" "}
              or{" "}
              <code className="font-mono text-xs bg-black/20 px-1 rounded">
                GRABFOOD_TOKEN
              </code>{" "}
              in Heroku config vars.
            </p>
          </div>
        </div>
      )}

      {/* Token status for Dubai — one card per brand */}
      {city === "dubai" && (
        <div className="space-y-2">
          {(
            [
              { key: "sushi" as const, label: "Sushi ZEN", envVar: "URBANPIPER_TOKEN" },
              { key: "ramen" as const, label: "Ramen ZEN", envVar: "URBANPIPER_RAMEN_TOKEN" },
            ] as const
          ).map(({ key, label, envVar }) => {
            const t = tokenStatus?.ok ? tokenStatus[key] : undefined;
            const h = t?.hours_left ?? null;
            const isExpired = h !== null && h <= 0;
            const isWarning = h !== null && h > 0 && h < 72;
            const isOk      = h !== null && h >= 72;
            const expiresStr = t?.expires
              ? new Date(t.expires).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })
              : null;

            if (isOk) return (
              <div key={key} className={`${GLASS_CARD} flex items-center gap-3 px-4 py-3`}>
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <p className={T_BODY}>
                  <strong>{label}</strong> · Valid for {Math.floor(h!)} h
                  {expiresStr && <span className="opacity-50 text-xs ml-2">(expires {expiresStr} GST)</span>}
                </p>
              </div>
            );

            if (isWarning || isExpired) return (
              <div key={key} className={`rounded-lg border p-4 space-y-2 ${
                isExpired ? "bg-red-500/10 border-red-500/40" : "bg-amber-500/10 border-amber-500/40"
              }`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${isExpired ? "text-red-400" : "text-amber-400"}`} />
                  <p className={`${T_LABEL} ${isExpired ? "text-red-400" : "text-amber-400"}`}>
                    <strong>{label}</strong> — {isExpired ? "TOKEN EXPIRED" : `expires in ${Math.floor(h!)} h`}
                    {expiresStr && <span className="font-normal text-xs ml-2 opacity-70">({expiresStr} GST)</span>}
                  </p>
                </div>
                <p className={T_CAPTION}>
                  atlas.urbanpiper.com でログイン → ブランド切り替え → Network → graphql → authorization をコピーして:
                </p>
                <pre className="text-xs font-mono bg-black/30 rounded px-3 py-2 whitespace-pre-wrap break-all">
                  {`heroku config:set ${envVar}="eyJ..." -a sushizen-shift-app`}
                </pre>
              </div>
            );

            // not loaded or not set
            return (
              <div key={key} className={`${GLASS_CARD} flex items-center gap-3 px-4 py-3`}>
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <p className={`${T_BODY} opacity-70`}>
                  <strong>{label}</strong> — {t?.set === false ? `${envVar} not set` : "checking…"}
                </p>
              </div>
            );
          })}
          <p className={`${T_CAPTION} pl-1`}>Discord DM to Yukihiro 72 h before expiry.</p>
        </div>
      )}

      {/* Run result */}
      {runResult && (
        <div className={`${GLASS_CARD} p-4 font-mono text-xs`}>
          <p className={T_LABEL}>Last run result</p>
          <pre className="mt-1 whitespace-pre-wrap text-green-400">
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Today alert summary */}
      {todayAlerts.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className={T_LABEL}>
              {todayAlerts.length} price change{todayAlerts.length > 1 ? "s" : ""} detected today
            </p>
            <p className={T_CAPTION}>
              Review the Alerts tab for details.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        {(["alerts", "comparison"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? TAB_ACTIVE : TAB_INACTIVE}>
            {t === "alerts" ? (
              <>
                Alerts{" "}
                {todayAlerts.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {todayAlerts.length}
                  </span>
                )}
              </>
            ) : (
              "Menu Comparison"
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm opacity-60">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      )}

      {/* ── ALERTS TAB ── */}
      {tab === "alerts" && !loading && (
        <div className={GLASS_CARD}>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <p className={T_BODY}>No price changes detected in the last 30 days.</p>
              <p className={T_CAPTION}>
                {city === "dubai"
                  ? "Either no changes occurred, or no check has been run yet."
                  : "Manila monitoring is pending token setup."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Date</th>
                    <th className={TABLE_HEADER}>Brand</th>
                    <th className={TABLE_HEADER}>Location</th>
                    <th className={TABLE_HEADER}>Platform</th>
                    <th className={TABLE_HEADER}>Item</th>
                    <th className={TABLE_HEADER}>Change</th>
                    <th className={TABLE_HEADER}>Old Price</th>
                    <th className={TABLE_HEADER}>New Price</th>
                    <th className={TABLE_HEADER}>Discount Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <span className="font-mono">{a.alert_date}</span>
                      </td>
                      <td className={TABLE_CELL}>{a.brand_name}</td>
                      <td className={TABLE_CELL}>{a.location_name}</td>
                      <td className={TABLE_CELL}>
                        <span className="font-medium">{a.platform_name}</span>
                      </td>
                      <td className={TABLE_CELL}>{a.item_name}</td>
                      <td className={TABLE_CELL}>
                        <ChangeTypeBadge type={a.change_type} />
                      </td>
                      <td className={TABLE_CELL}>
                        {a.old_price != null
                          ? `AED ${Number(a.old_price).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className={TABLE_CELL}>
                        {a.new_price != null ? (
                          <span
                            className={
                              a.change_type === "price_up"
                                ? "text-red-400 font-semibold"
                                : a.change_type === "price_down"
                                ? "text-amber-400 font-semibold"
                                : ""
                            }
                          >
                            AED {Number(a.new_price).toFixed(2)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        {a.old_discount_rate != null || a.new_discount_rate != null ? (
                          <span
                            className={
                              a.change_type === "discount_down"
                                ? "text-amber-400 font-semibold"
                                : a.change_type === "discount_up"
                                ? "text-green-400 font-semibold"
                                : ""
                            }
                          >
                            {fmtRate(a.old_discount_rate)} → {fmtRate(a.new_discount_rate)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── COMPARISON TAB ── */}
      {tab === "comparison" && (
        <div className="space-y-4">
          {/* Summary bar */}
          {comparison && (
            <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-4 items-center`}>
              <span className={T_LABEL}>
                {comparison.snapshot_date} — {comparison.items.length} items
              </span>
              <span className="text-green-400 text-sm font-medium">✅ {comparison.ok_count} OK</span>
              {comparison.changed_count > 0 && (
                <span className="text-red-400 text-sm font-medium">❌ {comparison.changed_count} Changed</span>
              )}
              {comparison.new_count > 0 && (
                <span className="text-blue-400 text-sm font-medium">🆕 {comparison.new_count} New</span>
              )}
              {comparison.unavail_count > 0 && (
                <span className="text-zinc-400 text-sm font-medium">🔕 {comparison.unavail_count} Unavailable</span>
              )}
            </div>
          )}

          {/* Table */}
          {comparison && comparison.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className={TABLE_HEADER}>
                    <th className={`${TABLE_CELL} text-left`}></th>
                    <th className={`${TABLE_CELL} text-left`}>Item</th>
                    <th className={`${TABLE_CELL} text-left`}>Location / Platform</th>
                    <th className={`${TABLE_CELL} text-right`}>Today Price</th>
                    <th className={`${TABLE_CELL} text-right`}>Prev Price</th>
                    <th className={`${TABLE_CELL} text-right`}>Today Rate</th>
                    <th className={`${TABLE_CELL} text-right`}>Prev Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.items.map((item, idx) => {
                    const isChanged = item.status === "changed";
                    const isNew = item.status === "new";
                    const isUnavail = item.status === "unavailable";
                    return (
                      <tr key={idx} className={`${TABLE_ROW} ${isChanged ? "bg-red-500/5" : ""}`}>
                        <td className={`${TABLE_CELL} text-center text-base`}>
                          {isChanged ? "❌" : isNew ? "🆕" : isUnavail ? "🔕" : "✅"}
                        </td>
                        <td className={TABLE_CELL}>
                          <div className="font-medium">{item.item_name}</div>
                          <div className="text-xs opacity-50">{item.category}</div>
                        </td>
                        <td className={TABLE_CELL}>
                          <div>{item.location_name}</div>
                          <div className="text-xs opacity-50">{item.platform_name}</div>
                        </td>
                        <td className={`${TABLE_CELL} text-right font-mono`}>
                          AED {Number(item.today_price).toFixed(2)}
                        </td>
                        <td className={`${TABLE_CELL} text-right font-mono opacity-60`}>
                          {item.yesterday_price != null ? `AED ${Number(item.yesterday_price).toFixed(2)}` : "—"}
                        </td>
                        <td className={`${TABLE_CELL} text-right font-mono ${isChanged ? "text-red-400" : ""}`}>
                          {fmtRate(item.today_rate)}
                        </td>
                        <td className={`${TABLE_CELL} text-right font-mono opacity-60`}>
                          {fmtRate(item.yesterday_rate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !loading ? (
            <div className={`${GLASS_CARD} p-12 text-center`}>
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className={T_LABEL}>No snapshot data for today.</p>
              <p className={T_CAPTION}>Run a check first to populate data.</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
