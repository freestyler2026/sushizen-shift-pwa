"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken)
    ) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(detail || text || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

type CashierEvalRow = {
  eval_date: string;
  branch: string;
  pic_at_closing: string | null;
  cashier_name: string;
  sales_record_klikit: string | null;
  cash_counting_report: string | null;
  diff_cash_pos: number | null;
  qrph_count_pos: number | null;
  qrph_pictures_uploaded: number | null;
  qrph_number_diff: number | null;
  qrph_total_amount_discord: number | null;
  qrph_amount_pos: number | null;
  qrph_amount_diff: number | null;
  sc_pwd_count_pos: number | null;
  sc_pwd_cashier: string | null;
  sc_pwd_pictures_uploaded: number | null;
  sc_pwd_number_diff: number | null;
};

type ApiResp = {
  ok: boolean;
  items: CashierEvalRow[];
  total_records?: number;
};

const BRANCH_FILTERS = ["all", "Paranaque", "Taft", "Cubao"] as const;

export function ManilaCashierEvaluationTab({
  dateFrom,
  dateTo,
  approverName,
  pin,
  stepUpReady,
}: {
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CashierEvalRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const load = useCallback(async () => {
    if (!canLoad) {
      setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        date_from: dateFrom,
        date_to: dateTo,
      });
      const res = await apiGet<ApiResp>(`/api/admin/analytics/manila/cashier-evaluations?${qs.toString()}`);
      setData(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setData([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = (n: number | null) =>
    n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
  const diffClass = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) return "text-neutral-500";
    if (Math.abs(n) < 1e-9) return "text-emerald-400";
    return "text-rose-400";
  };

  const filtered = useMemo(() => {
    if (selectedBranch === "all") return data;
    return data.filter((r) => r.branch === selectedBranch);
  }, [data, selectedBranch]);

  return (
    <div className={GLASS_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className={T_SECTION}>Cashier Evaluation (Manila)</h2>
          <p className={T_CAPTION}>
            QRPH / SC-PWD checklist rows (<code className="text-neutral-400">manila_cashier_evaluations</code>). Klikit
            column is a checklist label from source spreadsheets, not live Klikit sync.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !canLoad} className={SECONDARY_BUTTON}>
          {loading ? <Spinner size="sm" /> : "Refresh"}
        </button>
      </div>

      <div className="p-4">
        {!canLoad ? (
          <p className={T_BODY}>Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : loading && !data.length ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !data.length ? (
          <p className={T_BODY}>
            No records for this range. Import the Cashier_Evaluation sheet via{" "}
            <code className="text-neutral-400">POST /api/admin/analytics/manila/cashier-evaluations/import</code> or{" "}
            <code className="text-neutral-400">scripts/import_manila_daily_excel.py</code>.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {BRANCH_FILTERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBranch(b)}
                  className={`rounded-lg px-3 py-1 text-xs ${
                    selectedBranch === b ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  {b === "all" ? "All branches" : b}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full min-w-[1100px] text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/80 text-left text-neutral-400">
                    <th className="sticky left-0 z-10 bg-neutral-950 px-2 py-2">Date</th>
                    <th className="px-2 py-2">Branch</th>
                    <th className="px-2 py-2">PIC</th>
                    <th className="px-2 py-2">Cashier</th>
                    <th className="px-2 py-2 text-center">Klikit log</th>
                    <th className="px-2 py-2 text-center">Cash check</th>
                    <th className="px-2 py-2 text-right">Cash−POS</th>
                    <th className="px-2 py-2 text-right">QRPH #</th>
                    <th className="px-2 py-2 text-right">QRPH pics</th>
                    <th className="px-2 py-2 text-right">QRPH #Δ</th>
                    <th className="px-2 py-2 text-right">QRPH amt Δ</th>
                    <th className="px-2 py-2 text-right">SC/PWD #</th>
                    <th className="px-2 py-2">SC/PWD by</th>
                    <th className="px-2 py-2 text-right">SC/PWD pics</th>
                    <th className="px-2 py-2 text-right">SC/PWD #Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={`${row.eval_date}-${row.branch}-${row.cashier_name}-${i}`} className={i % 2 === 0 ? "bg-neutral-950/30" : ""}>
                      <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-neutral-300">{row.eval_date}</td>
                      <td className="px-2 py-1.5 text-neutral-300">{row.branch}</td>
                      <td className="px-2 py-1.5">{row.pic_at_closing || "—"}</td>
                      <td className="px-2 py-1.5 font-medium text-white">{row.cashier_name}</td>
                      <td
                        className={`px-2 py-1.5 text-center ${
                          row.sales_record_klikit === "ok"
                            ? "text-emerald-400"
                            : row.sales_record_klikit === "no"
                              ? "text-rose-400"
                              : "text-neutral-500"
                        }`}
                      >
                        {row.sales_record_klikit || "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-center ${
                          row.cash_counting_report === "ok" ? "text-emerald-400" : "text-neutral-500"
                        }`}
                      >
                        {row.cash_counting_report || "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${diffClass(row.diff_cash_pos)}`}>{fmt(row.diff_cash_pos)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.qrph_count_pos)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.qrph_pictures_uploaded)}</td>
                      <td className={`px-2 py-1.5 text-right ${diffClass(row.qrph_number_diff)}`}>{fmt(row.qrph_number_diff)}</td>
                      <td className={`px-2 py-1.5 text-right ${diffClass(row.qrph_amount_diff)}`}>{fmt(row.qrph_amount_diff)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.sc_pwd_count_pos)}</td>
                      <td className="px-2 py-1.5 text-neutral-300">{row.sc_pwd_cashier || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.sc_pwd_pictures_uploaded)}</td>
                      <td className={`px-2 py-1.5 text-right ${diffClass(row.sc_pwd_number_diff)}`}>{fmt(row.sc_pwd_number_diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
