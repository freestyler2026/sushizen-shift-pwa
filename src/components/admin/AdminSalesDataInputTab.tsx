"use client";

import { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

type SaleRow = {
  date?: string;
  sale_date?: string;
  branch: string;
  dine_in_orders: number | null;
  dine_in_amount: number | null;
  grabfood_orders: number | null;
  grabfood_amount: number | null;
  foodpanda_orders: number | null;
  foodpanda_amount: number | null;
  total_orders: number | null;
  total_amount: number | null;
  ratio_to_prev_week: number | null;
};

type EditableRow = {
  branch: string;
  dine_in_orders: string;
  dine_in_amount: string;
  grabfood_orders: string;
  grabfood_amount: string;
  foodpanda_orders: string;
  foodpanda_amount: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

const BRANCHES = ["Paranaque", "Taft", "Cubao"] as const;

const BRANCH_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Paranaque: { bg: "#6366f120", text: "#818cf8", dot: "#6366f1" },
  Taft: { bg: "#10b98120", text: "#34d399", dot: "#10b981" },
  Cubao: { bg: "#f59e0b20", text: "#fbbf24", dot: "#f59e0b" },
};

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function intOrNull(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function floatOrNull(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function calcTotal(row: EditableRow) {
  const orders = (intOrNull(row.dine_in_orders) ?? 0) + (intOrNull(row.grabfood_orders) ?? 0) + (intOrNull(row.foodpanda_orders) ?? 0);
  const amount = (floatOrNull(row.dine_in_amount) ?? 0) + (floatOrNull(row.grabfood_amount) ?? 0) + (floatOrNull(row.foodpanda_amount) ?? 0);
  return { orders, amount };
}

function fmtPHP(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function rowToEditable(r: SaleRow): EditableRow {
  return {
    branch: r.branch,
    dine_in_orders: r.dine_in_orders != null ? String(r.dine_in_orders) : "",
    dine_in_amount: r.dine_in_amount != null ? String(r.dine_in_amount) : "",
    grabfood_orders: r.grabfood_orders != null ? String(r.grabfood_orders) : "",
    grabfood_amount: r.grabfood_amount != null ? String(r.grabfood_amount) : "",
    foodpanda_orders: r.foodpanda_orders != null ? String(r.foodpanda_orders) : "",
    foodpanda_amount: r.foodpanda_amount != null ? String(r.foodpanda_amount) : "",
    saving: false,
    saved: false,
    error: null,
  };
}

function hasRowInput(row: EditableRow) {
  return [row.dine_in_orders, row.dine_in_amount, row.grabfood_orders, row.grabfood_amount, row.foodpanda_orders, row.foodpanda_amount].some(
    (v) => v.trim() !== "",
  );
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

function InputCell({
  value,
  onChange,
  placeholder,
  isAmount,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isAmount?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={isAmount ? "decimal" : "numeric"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "0"}
      className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-right text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:bg-white/5 focus:outline-none"
    />
  );
}

export default function AdminSalesDataInputTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<EditableRow[]>(
    BRANCHES.map((b) => ({
      branch: b,
      dine_in_orders: "",
      dine_in_amount: "",
      grabfood_orders: "",
      grabfood_amount: "",
      foodpanda_orders: "",
      foodpanda_amount: "",
      saving: false,
      saved: false,
      error: null,
    })),
  );
  const [loadingDate, setLoadingDate] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveAllStatus, setSaveAllStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setApproverName((p) => p.trim() || a.staffName || "");
    if (a?.pin) setPin((p) => p.trim() || a.pin || "");
  }, []);

  const loadDate = useCallback(async (date: string) => {
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setLoadError("Enter approver name and PIN (saved from login).");
      return;
    }
    setLoadingDate(true);
    setLoadError("");
    try {
      const qs = new URLSearchParams({ approver_name: nm, pin: p });
      const res = await apiGet<{ ok?: boolean; items?: SaleRow[] }>(
        `/api/admin/analytics/manila/daily-sales/by-date/${encodeURIComponent(date)}?${qs.toString()}`,
      );
      const items = Array.isArray(res?.items) ? res.items : [];
      setRows(items.map(rowToEditable));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setRows(
        BRANCHES.map((b) => ({
          branch: b,
          dine_in_orders: "",
          dine_in_amount: "",
          grabfood_orders: "",
          grabfood_amount: "",
          foodpanda_orders: "",
          foodpanda_amount: "",
          saving: false,
          saved: false,
          error: null,
        })),
      );
    } finally {
      setLoadingDate(false);
    }
  }, [approverName, pin]);

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  const updateRow = (branchIdx: number, field: keyof EditableRow, value: string) => {
    if (field === "saving" || field === "saved" || field === "error" || field === "branch") return;
    setRows((prev) =>
      prev.map((r, i) => (i === branchIdx ? { ...r, [field]: value, saved: false, error: null } : r)),
    );
  };

  const saveRow = async (idx: number): Promise<boolean> => {
    const row = rows[idx];
    if (!hasRowInput(row)) return true;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, error: "Approver name and PIN required", saved: false } : r)));
      return false;
    }
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: true, error: null } : r)));
    try {
      await apiPostJson("/api/admin/analytics/manila/daily-sales/upsert", {
        approver_name: nm,
        pin: p,
        date: selectedDate,
        branch: row.branch,
        dine_in_orders: intOrNull(row.dine_in_orders),
        dine_in_amount: floatOrNull(row.dine_in_amount),
        grabfood_orders: intOrNull(row.grabfood_orders),
        grabfood_amount: floatOrNull(row.grabfood_amount),
        foodpanda_orders: intOrNull(row.foodpanda_orders),
        foodpanda_amount: floatOrNull(row.foodpanda_amount),
      });
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false, saved: true, error: null } : r)));
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false, saved: false, error: msg } : r)));
      return false;
    }
  };

  const saveAll = async () => {
    const snapshot = [...rows];
    setSaveAllStatus("saving");
    let fail = false;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setSaveAllStatus("error");
      setTimeout(() => setSaveAllStatus("idle"), 3000);
      return;
    }
    for (let i = 0; i < snapshot.length; i++) {
      if (!hasRowInput(snapshot[i])) continue;
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, saving: true, error: null } : r)));
      try {
        await apiPostJson("/api/admin/analytics/manila/daily-sales/upsert", {
          approver_name: nm,
          pin: p,
          date: selectedDate,
          branch: snapshot[i].branch,
          dine_in_orders: intOrNull(snapshot[i].dine_in_orders),
          dine_in_amount: floatOrNull(snapshot[i].dine_in_amount),
          grabfood_orders: intOrNull(snapshot[i].grabfood_orders),
          grabfood_amount: floatOrNull(snapshot[i].grabfood_amount),
          foodpanda_orders: intOrNull(snapshot[i].foodpanda_orders),
          foodpanda_amount: floatOrNull(snapshot[i].foodpanda_amount),
        });
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, saving: false, saved: true, error: null } : r)));
      } catch {
        fail = true;
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, saving: false, saved: false, error: "Save failed" } : r)));
      }
    }
    setSaveAllStatus(fail ? "error" : "done");
    setTimeout(() => setSaveAllStatus("idle"), 3000);
  };

  return (
    <div className={GLASS_CARD}>
      <div className="space-y-6 p-4 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-lg font-semibold text-white">Sales Data Input</h2>
              <p className={`${T_CAPTION} mt-1`}>
                Enter daily Dine-in / GrabFood / FoodPanda counts and PHP amounts. Data appears in Manila Sales Analytics → Sales Data after save.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-[160px]">
              <label className={`${T_LABEL} mb-1 block`}>Approver</label>
              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="min-w-[120px]">
              <label className={`${T_LABEL} mb-1 block`}>PIN</label>
              <input
                type="password"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayISO())}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            Today
          </button>
        </div>

        {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
        {loadingDate ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Spinner size="sm" /> Loading {selectedDate}…
          </div>
        ) : null}

        {!loadingDate ? (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(100px,140px)_repeat(6,minmax(0,1fr))_minmax(72px,100px)_minmax(72px,100px)_80px] gap-2 px-1 text-xs sm:px-4">
              <div className="font-medium text-white/30">Branch</div>
              <div className="text-center text-white/30">Dine-in #</div>
              <div className="text-center text-white/30">Dine-in PHP</div>
              <div className="text-center text-white/30">Grab #</div>
              <div className="text-center text-white/30">Grab PHP</div>
              <div className="text-center text-white/30">FP #</div>
              <div className="text-center text-white/30">FP PHP</div>
              <div className="text-center text-white/30">Total #</div>
              <div className="text-center text-white/30">Total PHP</div>
              <div />
            </div>

            {rows.map((row, idx) => {
              const { orders, amount } = calcTotal(row);
              const colors = BRANCH_COLORS[row.branch];
              const hasData = hasRowInput(row);

              return (
                <div
                  key={row.branch}
                  className={`rounded-2xl border transition-all ${
                    row.saved ? "border-emerald-500/40 bg-emerald-500/5" : row.error ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="grid grid-cols-[minmax(100px,140px)_repeat(6,minmax(0,1fr))_minmax(72px,100px)_minmax(72px,100px)_80px] items-center gap-2 px-1 py-3 sm:px-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colors?.dot }} />
                      <span className="text-sm font-medium" style={{ color: colors?.text }}>
                        {row.branch}
                      </span>
                    </div>
                    <InputCell value={row.dine_in_orders} onChange={(v) => updateRow(idx, "dine_in_orders", v)} />
                    <InputCell value={row.dine_in_amount} onChange={(v) => updateRow(idx, "dine_in_amount", v)} isAmount />
                    <InputCell value={row.grabfood_orders} onChange={(v) => updateRow(idx, "grabfood_orders", v)} />
                    <InputCell value={row.grabfood_amount} onChange={(v) => updateRow(idx, "grabfood_amount", v)} isAmount />
                    <InputCell value={row.foodpanda_orders} onChange={(v) => updateRow(idx, "foodpanda_orders", v)} />
                    <InputCell value={row.foodpanda_amount} onChange={(v) => updateRow(idx, "foodpanda_amount", v)} isAmount />
                    <div className="text-right text-sm font-semibold text-white">
                      {hasData && orders > 0 ? orders.toLocaleString("en-PH") : <span className="text-white/20">—</span>}
                    </div>
                    <div className="text-right text-sm font-semibold text-white">
                      {hasData && amount > 0 ? fmtPHP(amount) : <span className="text-white/20">—</span>}
                    </div>
                    <div className="flex justify-center">
                      {row.saving ? (
                        <span className="animate-pulse text-xs text-white/30">…</span>
                      ) : row.saved ? (
                        <span className="text-xs font-medium text-emerald-400">Saved</span>
                      ) : row.error ? (
                        <span className="max-w-[72px] truncate text-xs text-red-400" title={row.error}>
                          Error
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void saveRow(idx)}
                          disabled={!hasData}
                          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                            hasData ? "bg-indigo-600 text-white hover:bg-indigo-500" : "cursor-not-allowed bg-white/5 text-white/20"
                          }`}
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                  {row.error ? <div className="px-4 pb-2 text-xs text-red-400">{row.error}</div> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {!loadingDate ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {saveAllStatus === "done" ? <span className="text-sm font-medium text-emerald-400">All saved</span> : null}
            {saveAllStatus === "error" ? (
              <span className="text-sm text-red-400">Some rows failed — check above.</span>
            ) : null}
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saveAllStatus === "saving"}
              className={`rounded-xl px-6 py-2 text-sm font-medium transition-all ${
                saveAllStatus === "saving"
                  ? "cursor-not-allowed bg-indigo-600/50 text-white/50"
                  : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
              }`}
            >
              {saveAllStatus === "saving" ? "Saving…" : "Save all branches"}
            </button>
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/30">
          <p className="mb-2 font-medium text-white/50">How to use</p>
          <p>① Set approver + PIN (Manila management).</p>
          <p>② Pick a date; load fills Paranaque / Taft / Cubao from the database.</p>
          <p>③ Totals update as you type; WoW ratio is computed on save vs same branch 7 days earlier.</p>
          <p>④ Use Save per row or Save all branches.</p>
          <p className="pt-1 text-white/20">Same date + branch overwrites the existing row.</p>
        </div>
      </div>
    </div>
  );
}
