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
  const [tab, setTab] = useState<"alerts" | "snapshots">("alerts");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);

  // ── Platform filter ───────────────────────────────────────────────────────
  const [platformFilter, setPlatformFilter] = useState("");

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

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ ok: boolean; snapshots: Snapshot[] }>(
        `/api/admin/aggregator-price/snapshots?city=${city}&days=1&platform=${encodeURIComponent(platformFilter)}`
      );
      setSnapshots(res.snapshots || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [city, platformFilter]);

  useEffect(() => {
    if (tab === "alerts") loadAlerts();
    else loadSnapshots();
  }, [tab, city, loadAlerts, loadSnapshots]);

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
      else loadSnapshots();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const platforms = Array.from(
    new Set(snapshots.map((s) => s.platform_name).filter(Boolean))
  ).sort();

  const filteredSnapshots = platformFilter
    ? snapshots.filter((s) =>
        s.platform_name.toLowerCase().includes(platformFilter.toLowerCase())
      )
    : snapshots;

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
        <button
          onClick={() => setTab("alerts")}
          className={tab === "alerts" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Alerts{" "}
          {todayAlerts.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {todayAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("snapshots")}
          className={tab === "snapshots" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Latest Snapshot
        </button>
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

      {/* ── SNAPSHOTS TAB ── */}
      {tab === "snapshots" && !loading && (
        <>
          {/* Platform filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPlatformFilter("")}
              className={!platformFilter ? TAB_ACTIVE : TAB_INACTIVE}
            >
              All Platforms
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={platformFilter === p ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {p}
              </button>
            ))}
          </div>

          <div className={GLASS_CARD}>
            {filteredSnapshots.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Info className="w-8 h-8 text-blue-400" />
                <p className={T_BODY}>No snapshot data yet.</p>
                <p className={T_CAPTION}>
                  Click &ldquo;Run Check Now&rdquo; to fetch the latest prices.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TABLE_HEADER}>Brand</th>
                      <th className={TABLE_HEADER}>Location</th>
                      <th className={TABLE_HEADER}>Platform</th>
                      <th className={TABLE_HEADER}>Category</th>
                      <th className={TABLE_HEADER}>Item</th>
                      <th className={TABLE_HEADER}>Base Price</th>
                      <th className={TABLE_HEADER}>Platform Price</th>
                      <th className={TABLE_HEADER}>Discount</th>
                      <th className={TABLE_HEADER}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((s, i) => {
                      const rate = Number(s.discount_rate ?? 1);
                      // Highlight when discount deviates from expected 50% by >2%
                      const ratePct = `${(rate * 100).toFixed(1)}%`;
                      const rateOdd = Math.abs(rate - 0.5) > 0.02 && rate !== 1.0;
                      return (
                        <tr key={i} className={TABLE_ROW}>
                          <td className={TABLE_CELL}>{s.brand_name}</td>
                          <td className={TABLE_CELL}>{s.location_name}</td>
                          <td className={TABLE_CELL}>
                            <span className="font-medium">{s.platform_name}</span>
                          </td>
                          <td className={TABLE_CELL}>{s.category}</td>
                          <td className={TABLE_CELL}>{s.item_name}</td>
                          <td className={TABLE_CELL}>
                            AED {Number(s.base_price).toFixed(2)}
                          </td>
                          <td className={TABLE_CELL}>
                            {Number(s.platform_price) !== Number(s.base_price) ? (
                              <span className="text-amber-400 font-semibold">
                                AED {Number(s.platform_price).toFixed(2)}
                              </span>
                            ) : (
                              `AED ${Number(s.platform_price).toFixed(2)}`
                            )}
                          </td>
                          <td className={TABLE_CELL}>
                            <span className={rateOdd ? "text-amber-400 font-semibold" : ""}>
                              {ratePct}
                            </span>
                          </td>
                          <td className={TABLE_CELL}>
                            {s.is_available ? (
                              <span className={BADGE_SUCCESS}>Active</span>
                            ) : (
                              <span className={BADGE_ERROR}>Hidden</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
