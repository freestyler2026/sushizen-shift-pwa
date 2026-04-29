"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingDown,
  TrendingUp,
  PencilLine,
  Clock,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  INPUT_CLASS,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceCheckResult = {
  id: number;
  store_code: string;
  product_id: string;
  product_name: string;
  category: string;
  baseline_price: number | null;
  current_price: number | null;
  discount_rate: number | null;
  status: "ok" | "changed" | "confirmed" | "pending_manual";
  confirmed_by: string | null;
  confirmed_at: string | null;
  memo: string;
  last_seen: string | null;
  checked_at: string;
  source: string;
};

type LastRun = {
  run_at: string | null;
  items_checked: number;
  items_flagged: number;
  status: string;
  error_msg: string | null;
};

type Tab = "TAFT" | "PAR";

const STORE_LABELS: Record<Tab, string> = {
  TAFT: "Taft",
  PAR: "Parañaque",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = Number(v) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: PriceCheckResult["status"]) {
  switch (status) {
    case "changed":
      return (
        <span className={BADGE_ERROR}>
          <AlertTriangle className="h-3 w-3" />
          Changed
        </span>
      );
    case "confirmed":
      return (
        <span className={BADGE_SUCCESS}>
          <ShieldCheck className="h-3 w-3" />
          Confirmed
        </span>
      );
    case "pending_manual":
      return (
        <span className={BADGE_WARNING}>
          <PencilLine className="h-3 w-3" />
          Pending
        </span>
      );
    default:
      return (
        <span className={BADGE_SUCCESS}>
          <CheckCircle2 className="h-3 w-3" />
          OK
        </span>
      );
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PriceCheckPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);

  const [activeTab, setActiveTab] = useState<Tab>("TAFT");
  const [loading, setLoading] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [results, setResults] = useState<PriceCheckResult[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Confirm busy per row id
  const [confirmingIds, setConfirmingIds] = useState<number[]>([]);
  const [confirmMemos, setConfirmMemos] = useState<Record<number, string>>({});

  // Manual entry state (Parañaque)
  const [manualProductId, setManualProductId] = useState("");
  const [manualProductName, setManualProductName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualMemo, setManualMemo] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(
        `${apiBase}/api/admin/price-check/status?store_code=${activeTab}`,
        { headers, cache: "no-store" }
      );
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setResults(j.results || []);
      setLastRun(j.last_run || null);
      setFlaggedCount(Number(j.flagged_count || 0));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders, activeTab]);

  const runCheck = async () => {
    setRunBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ store_code: activeTab, store_id: "" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(`チェック完了 — ${j.items_checked} 商品, ${j.items_flagged} 件フラグ`);
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunBusy(false);
    }
  };

  const initBaseline = async () => {
    if (!window.confirm("現在のStoreHub価格を基準価格として上書き保存します。よろしいですか？")) return;
    setBaselineBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/init-baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ store_code: activeTab, store_id: "" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(`基準価格を更新しました — ${j.products_snapshotted} 商品`);
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBaselineBusy(false);
    }
  };

  const confirmItem = async (row: PriceCheckResult) => {
    setConfirmingIds((ids) => [...ids, row.id]);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          store_code: row.store_code,
          product_id: row.product_id,
          memo: confirmMemos[row.id] || "",
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      setSuccess(`"${row.product_name}" を確認済みにしました`);
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setConfirmingIds((ids) => ids.filter((x) => x !== row.id));
    }
  };

  const submitManualEntry = async () => {
    if (!manualProductId.trim()) { setError("商品IDを入力してください"); return; }
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price <= 0) { setError("正しい価格を入力してください"); return; }
    setManualBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/manual-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          store_code: activeTab,
          product_id: manualProductId.trim(),
          product_name: manualProductName.trim() || manualProductId.trim(),
          category: manualCategory.trim(),
          current_price: price,
          memo: manualMemo.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(
        j.status === "changed"
          ? `⚠️ 価格変更を検出: 基準 ${fmtPrice(j.baseline_price)} → 現在 ${fmtPrice(j.current_price)}`
          : `"${manualProductId}" を登録しました (価格変化なし)`
      );
      setManualProductId("");
      setManualProductName("");
      setManualCategory("");
      setManualPrice("");
      setManualMemo("");
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setManualBusy(false);
    }
  };

  // Auth guard
  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Fadmin%2Fprice-check");
      return;
    }
    const role = auth.role || "";
    if (!["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role)) {
      router.replace("/admin");
      return;
    }
  }, [auth, router]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Grouped
  const flaggedRows = useMemo(() => results.filter((r) => r.status === "changed"), [results]);
  const confirmedRows = useMemo(() => results.filter((r) => r.status === "confirmed"), [results]);
  const okRows = useMemo(() => results.filter((r) => r.status === "ok"), [results]);

  const isParanaque = activeTab === "PAR";

  return (
    <div className="min-h-screen text-white">
      <motion.div
        className="mx-auto max-w-6xl space-y-5 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Price Check</h1>
            <p className={T_BODY}>
              StoreHubの販売価格を監視し、基準価格からの変更を検出します。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {flaggedCount > 0 ? (
              <span className={BADGE_ERROR}>
                <AlertTriangle className="h-3 w-3" />
                {flaggedCount} 件の変更あり
              </span>
            ) : (
              <span className={BADGE_SUCCESS}>
                <CheckCircle2 className="h-3 w-3" />
                全て正常
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          {(["TAFT", "PAR"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE}
            >
              {STORE_LABELS[tab]}
              {tab === "PAR" && (
                <span className="ml-1.5 text-[10px] text-zinc-500">(手動)</span>
              )}
            </button>
          ))}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>フラグ件数</div>
            <div className={`${KPI_VALUE} ${flaggedCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {flaggedCount}
            </div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>確認済み</div>
            <div className={KPI_VALUE}>{confirmedRows.length}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>監視商品数</div>
            <div className={KPI_VALUE}>{results.length}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>最終チェック</div>
            <div className="mt-1 text-sm font-semibold text-white">
              {lastRun?.run_at ? fmtDatetime(lastRun.run_at) : "未実行"}
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className={T_SECTION}>{STORE_LABELS[activeTab]} — コントロール</div>
            {lastRun && (
              <div className={`${T_CAPTION} flex items-center gap-1`}>
                <Clock className="h-3 w-3" />
                最終実行: {fmtDatetime(lastRun.run_at)}
                {lastRun.error_msg && (
                  <span className="ml-2 text-red-400">({lastRun.error_msg})</span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!isParanaque && (
              <>
                <button
                  type="button"
                  onClick={runCheck}
                  disabled={runBusy || loading}
                  className={PRIMARY_BUTTON}
                >
                  {runBusy ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> チェック中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4" /> 今すぐチェック
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={initBaseline}
                  disabled={baselineBusy || loading}
                  className={SECONDARY_BUTTON}
                >
                  {baselineBusy ? "更新中..." : "基準価格を現在値で更新"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={loadStatus}
              disabled={loading}
              className={SECONDARY_BUTTON}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                更新
              </span>
            </button>
          </div>

          {!isParanaque && (
            <p className={`mt-2 ${T_CAPTION}`}>
              自動チェックは3時間ごとに実行されます。「今すぐチェック」で手動実行も可能です。
            </p>
          )}
          {isParanaque && (
            <p className={`mt-2 ${T_CAPTION}`}>
              ParañaqueはStoreHub APIに対応していないため、価格を手動で入力・確認してください。
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">
              {success}
            </div>
          )}
        </div>

        {/* Manual entry (Parañaque) */}
        {isParanaque && (
          <div className={`${GLASS_CARD} p-4`}>
            <div className="mb-3">
              <div className={T_SECTION}>手動価格入力</div>
              <p className={T_BODY}>商品IDと現在の販売価格を入力してください。</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <div className={`${T_LABEL} mb-1.5`}>商品ID *</div>
                <input
                  className={INPUT_CLASS}
                  value={manualProductId}
                  onChange={(e) => setManualProductId(e.target.value)}
                  placeholder="例: PROD-001"
                />
              </label>
              <label className="block">
                <div className={`${T_LABEL} mb-1.5`}>商品名</div>
                <input
                  className={INPUT_CLASS}
                  value={manualProductName}
                  onChange={(e) => setManualProductName(e.target.value)}
                  placeholder="例: サーモン丼"
                />
              </label>
              <label className="block">
                <div className={`${T_LABEL} mb-1.5`}>カテゴリ</div>
                <input
                  className={INPUT_CLASS}
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  placeholder="例: Main"
                />
              </label>
              <label className="block">
                <div className={`${T_LABEL} mb-1.5`}>現在の販売価格 (₱) *</div>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="例: 350.00"
                />
              </label>
              <label className="block sm:col-span-2">
                <div className={`${T_LABEL} mb-1.5`}>メモ</div>
                <input
                  className={INPUT_CLASS}
                  value={manualMemo}
                  onChange={(e) => setManualMemo(e.target.value)}
                  placeholder="任意メモ"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={submitManualEntry}
                disabled={manualBusy}
                className={PRIMARY_BUTTON}
              >
                {manualBusy ? "登録中..." : "価格を登録・チェック"}
              </button>
            </div>
          </div>
        )}

        {/* Flagged items */}
        {flaggedRows.length > 0 && (
          <div className={`${GLASS_CARD} border-red-500/20 p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <div className={T_SECTION}>価格変更あり ({flaggedRows.length} 件)</div>
            </div>
            <PriceTable
              rows={flaggedRows}
              confirmingIds={confirmingIds}
              confirmMemos={confirmMemos}
              setConfirmMemos={setConfirmMemos}
              onConfirm={confirmItem}
              showConfirm
            />
          </div>
        )}

        {/* OK / Confirmed items */}
        {(okRows.length > 0 || confirmedRows.length > 0) && (
          <div className={`${GLASS_CARD} p-4`}>
            <div className="mb-3">
              <div className={T_SECTION}>
                監視中 ({okRows.length + confirmedRows.length} 件)
              </div>
            </div>
            <PriceTable
              rows={[...confirmedRows, ...okRows]}
              confirmingIds={confirmingIds}
              confirmMemos={confirmMemos}
              setConfirmMemos={setConfirmMemos}
              onConfirm={confirmItem}
              showConfirm={false}
            />
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className={`${GLASS_CARD} flex flex-col items-center gap-3 py-10`}>
            <Tag className="h-8 w-8 text-zinc-600" />
            <p className={T_CAPTION}>
              {isParanaque
                ? "まだ価格が登録されていません。上のフォームから手動入力してください。"
                : "まだ価格データがありません。「今すぐチェック」を実行してください。"}
            </p>
            {!isParanaque && (
              <button
                type="button"
                onClick={runCheck}
                disabled={runBusy}
                className={PRIMARY_BUTTON}
              >
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  今すぐチェック
                </span>
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Price Table sub-component ───────────────────────────────────────────────

function PriceTable({
  rows,
  confirmingIds,
  confirmMemos,
  setConfirmMemos,
  onConfirm,
  showConfirm,
}: {
  rows: PriceCheckResult[];
  confirmingIds: number[];
  confirmMemos: Record<number, string>;
  setConfirmMemos: Dispatch<SetStateAction<Record<number, string>>>;
  onConfirm: (row: PriceCheckResult) => void;
  showConfirm: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr>
            <th className={`${TABLE_HEADER} text-left`}>商品名</th>
            <th className={`${TABLE_HEADER} text-left hidden sm:table-cell`}>カテゴリ</th>
            <th className={`${TABLE_HEADER} text-right`}>基準価格</th>
            <th className={`${TABLE_HEADER} text-right`}>現在価格</th>
            <th className={`${TABLE_HEADER} text-right`}>変動率</th>
            <th className={`${TABLE_HEADER} text-center`}>ステータス</th>
            <th className={`${TABLE_HEADER} text-left hidden md:table-cell`}>最終確認</th>
            {showConfirm && <th className={`${TABLE_HEADER} text-left`}>確認</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = row.discount_rate;
            const rateClass =
              rate == null
                ? "text-zinc-500"
                : rate < -0.001
                ? "text-red-400 font-semibold"
                : rate > 0.001
                ? "text-amber-400 font-semibold"
                : "text-emerald-400";

            return (
              <tr key={`${row.store_code}-${row.product_id}`} className={TABLE_ROW}>
                <td className={TABLE_CELL}>
                  <div className="font-medium text-white">{row.product_name}</div>
                  <div className={`${TABLE_HEADER} mt-0.5`}>{row.product_id}</div>
                </td>
                <td className={`${TABLE_CELL} hidden sm:table-cell text-zinc-400`}>
                  {row.category || "—"}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums`}>
                  {fmtPrice(row.baseline_price)}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums font-medium`}>
                  {fmtPrice(row.current_price)}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums ${rateClass}`}>
                  <span className="flex items-center justify-end gap-1">
                    {rate != null && rate < -0.001 && <TrendingDown className="h-3 w-3" />}
                    {rate != null && rate > 0.001 && <TrendingUp className="h-3 w-3" />}
                    {fmtRate(row.discount_rate)}
                  </span>
                </td>
                <td className={`${TABLE_CELL} text-center`}>{statusBadge(row.status)}</td>
                <td className={`${TABLE_CELL} hidden md:table-cell`}>
                  {row.confirmed_by ? (
                    <div>
                      <div className="text-xs text-zinc-300">{row.confirmed_by}</div>
                      <div className={TABLE_HEADER}>{fmtDatetime(row.confirmed_at)}</div>
                    </div>
                  ) : row.checked_at ? (
                    <div className={TABLE_HEADER}>{fmtDatetime(row.checked_at)}</div>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                {showConfirm && (
                  <td className={TABLE_CELL}>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                        placeholder="メモ"
                        value={confirmMemos[row.id] || ""}
                        onChange={(e) =>
                          setConfirmMemos((m) => ({ ...m, [row.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => onConfirm(row)}
                        disabled={confirmingIds.includes(row.id)}
                        className={SMALL_BUTTON}
                      >
                        {confirmingIds.includes(row.id) ? (
                          "..."
                        ) : (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            確認済
                          </span>
                        )}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
