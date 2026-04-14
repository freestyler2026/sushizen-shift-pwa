"use client";

import { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, INPUT_CLASS, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

const STORES = [
  { store_name: "QC", label: "Cubao (QC)" },
  { store_name: "Paranaque", label: "Paranaque" },
] as const;

type StoreKey = (typeof STORES)[number]["store_name"];

type RowVals = { order_count: string; total_sales: string; net_sales: string };

function emptyRow(): RowVals {
  return { order_count: "", total_sales: "", net_sales: "" };
}

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function todayLocalYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const run = () => fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await run();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await run();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const run = () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  let res = await run();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await run();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `POST ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function parseOptionalMoney(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function ManilaOfflineOrderEntryTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const todayStr = todayLocalYmd();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [rows, setRows] = useState<Record<StoreKey, RowVals>>({
    QC: emptyRow(),
    Paranaque: emptyRow(),
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setApproverName((p) => p.trim() || a.staffName || "");
    if (a?.pin) setPin((p) => p.trim() || a.pin || "");
  }, []);

  const loadDate = useCallback(
    async (date: string) => {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm || !p) {
        setLoadError("Approver name and PIN are required.");
        return;
      }
      setLoading(true);
      setLoadError("");
      setSavedOk(false);
      try {
        const qs = new URLSearchParams({
          order_date: date,
          approver_name: nm,
          pin: p,
        });
        const json = await apiGet<{
          rows?: Array<{
            store_name: string;
            order_count: number;
            total_sales?: number | null;
            net_sales?: number | null;
          }>;
        }>(`/api/admin/analytics/manila/order-counts/manual-offline/by-date?${qs}`);
        const next: Record<StoreKey, RowVals> = {
          QC: emptyRow(),
          Paranaque: emptyRow(),
        };
        for (const r of json.rows || []) {
          const sn = r.store_name as StoreKey;
          if (sn !== "QC" && sn !== "Paranaque") continue;
          next[sn] = {
            order_count: String(r.order_count ?? ""),
            total_sales: r.total_sales != null && r.total_sales !== undefined ? String(r.total_sales) : "",
            net_sales: r.net_sales != null && r.net_sales !== undefined ? String(r.net_sales) : "",
          };
        }
        setRows(next);
      } catch (e: unknown) {
        setRows({ QC: emptyRow(), Paranaque: emptyRow() });
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin],
  );

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  const setCell = (store: StoreKey, field: keyof RowVals, val: string) => {
    setRows((prev) => ({ ...prev, [store]: { ...prev[store], [field]: val } }));
    setSavedOk(false);
  };

  const save = async () => {
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setSaveError("Approver name and PIN are required to save.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSavedOk(false);
    const payloadRows = STORES.map(({ store_name }) => {
      const r = rows[store_name];
      const oc = parseInt(String(r.order_count).replace(/[^0-9-]/g, ""), 10);
      return {
        store_name,
        order_count: Number.isNaN(oc) ? 0 : Math.max(0, oc),
        total_sales: parseOptionalMoney(r.total_sales),
        net_sales: parseOptionalMoney(r.net_sales),
      };
    });
    try {
      await apiPostJson("/api/admin/analytics/manila/order-counts/manual-offline/save-day", {
        order_date: selectedDate,
        approver_name: nm,
        pin: p,
        rows: payloadRows,
      });
      setSavedOk(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${day}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span>📦</span> Number of Orders — Manila (Offline)
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Cubao (QC) and Paranaque offline counts (Taft uses StoreHub sync). Feeds Manila Sales Analytics → Number of
            Orders.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving || !approverName.trim() || !pin.trim()}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>💾</span> {saving ? "Saving…" : "Save day"}
        </button>
      </div>

      {saveError ? <div className="text-sm text-red-300">{saveError}</div> : null}
      {savedOk ? <div className="text-sm text-emerald-400">Saved.</div> : null}

      <div className={`${GLASS_CARD} space-y-3 p-4`}>
        <p className={T_CAPTION}>
          Manila management analytics PIN. Same approver + PIN as other Manila sales analytics.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <div className={T_LABEL}>Approver name</div>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              autoComplete="name"
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>PIN</div>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200" onClick={() => shiftDate(-1)}>
            ← Prev day
          </button>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <button type="button" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200" onClick={() => shiftDate(1)}>
            Next day →
          </button>
          <button
            type="button"
            className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200"
            onClick={() => void loadDate(selectedDate)}
            disabled={loading}
          >
            Reload
          </button>
        </div>

        {loadError ? <div className="text-sm text-red-300">{loadError}</div> : null}

        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm text-neutral-200">
              <thead className="border-b border-neutral-700 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Orders (transactions)</th>
                  <th className="py-2 pr-3">Total sales (PHP)</th>
                  <th className="py-2">Net sales (PHP)</th>
                </tr>
              </thead>
              <tbody>
                {STORES.map(({ store_name, label }) => (
                  <tr key={store_name} className="border-b border-neutral-800/80">
                    <td className="py-2 pr-3 font-medium text-white">{label}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={rows[store_name].order_count}
                        onChange={(e) => setCell(store_name, "order_count", e.target.value.replace(/[^0-9]/g, ""))}
                        className={INPUT_CLASS + " w-28"}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={rows[store_name].total_sales}
                        onChange={(e) => setCell(store_name, "total_sales", e.target.value)}
                        placeholder="Optional"
                        className={INPUT_CLASS + " w-36"}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={rows[store_name].net_sales}
                        onChange={(e) => setCell(store_name, "net_sales", e.target.value)}
                        placeholder="Optional"
                        className={INPUT_CLASS + " w-36"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
