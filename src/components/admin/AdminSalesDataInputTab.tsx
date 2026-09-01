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
  dine_in_gross: number | null;
  grabfood_orders: number | null;
  grabfood_amount: number | null;
  grabfood_gross: number | null;
  foodpanda_orders: number | null;
  foodpanda_gross: number | null;
  foodpanda_amount: number | null;
  beep_orders: number | null;
  beep_amount: number | null;
  beep_gross: number | null;
  total_orders: number | null;
  total_amount: number | null;
  ratio_to_prev_week: number | null;
};

type EditableRow = {
  branch: string;
  dine_in_orders: string;
  dine_in_amount: string;
  dine_in_gross: string;
  grabfood_orders: string;
  grabfood_amount: string;
  grabfood_gross: string;
  foodpanda_orders: string;
  foodpanda_gross: string;
  beep_orders: string;
  beep_amount: string;
  beep_gross: string;
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
  const orders =
    (intOrNull(row.dine_in_orders) ?? 0) +
    (intOrNull(row.grabfood_orders) ?? 0) +
    (intOrNull(row.foodpanda_orders) ?? 0) +
    (intOrNull(row.beep_orders) ?? 0);
  const fpNet = (floatOrNull(row.foodpanda_gross) ?? 0) * 0.7;
  // total_amount is the Net total: dine_in_amount + grabfood_amount + fp_net + beep_amount
  const amount =
    (floatOrNull(row.dine_in_amount) ?? 0) +
    (floatOrNull(row.grabfood_amount) ?? 0) +
    fpNet +
    (floatOrNull(row.beep_amount) ?? 0);
  return { orders, amount };
}

function fmtPHP(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type GapsResp = {
  ok?: boolean;
  expected_branches?: number;
  grace_days?: number;
  missing?: string[];
  missing_count?: number;
  partial?: { day: string; branches: number }[];
  partial_count?: number;
  channel_blank?: {
    day: string;
    branch: string;
    channel: string;
    total_orders: number | null;
    typical_orders: number | null;
  }[];
  channel_blank_count?: number;
};

const EMPTY_ROW_FIELDS = {
  dine_in_orders: "",
  dine_in_amount: "",
  dine_in_gross: "",
  grabfood_orders: "",
  grabfood_amount: "",
  grabfood_gross: "",
  foodpanda_orders: "",
  foodpanda_gross: "",
  beep_orders: "",
  beep_amount: "",
  beep_gross: "",
  saving: false,
  saved: false,
  error: null,
} as const;

function rowToEditable(r: SaleRow): EditableRow {
  return {
    branch: r.branch,
    dine_in_orders: r.dine_in_orders != null ? String(r.dine_in_orders) : "",
    dine_in_amount: r.dine_in_amount != null ? String(r.dine_in_amount) : "",
    dine_in_gross: r.dine_in_gross != null ? String(r.dine_in_gross) : "",
    grabfood_orders: r.grabfood_orders != null ? String(r.grabfood_orders) : "",
    grabfood_amount: r.grabfood_amount != null ? String(r.grabfood_amount) : "",
    grabfood_gross: r.grabfood_gross != null ? String(r.grabfood_gross) : "",
    foodpanda_orders: r.foodpanda_orders != null ? String(r.foodpanda_orders) : "",
    foodpanda_gross: r.foodpanda_gross != null ? String(r.foodpanda_gross) : "",
    beep_orders: r.beep_orders != null ? String(r.beep_orders) : "",
    beep_amount: r.beep_amount != null ? String(r.beep_amount) : "",
    beep_gross: r.beep_gross != null ? String(r.beep_gross) : "",
    saving: false,
    saved: false,
    error: null,
  };
}

function hasRowInput(row: EditableRow) {
  return [
    row.dine_in_orders,
    row.dine_in_amount,
    row.dine_in_gross,
    row.grabfood_orders,
    row.grabfood_amount,
    row.grabfood_gross,
    row.foodpanda_orders,
    row.foodpanda_gross,
    row.beep_orders,
    row.beep_amount,
    row.beep_gross,
  ].some((v) => v.trim() !== "");
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

// Column layout: Branch | Dine#  DineNet  DineGross | Grab#  GrabNet  GrabGross | FP#  FPGross  FPNet | Beep#  BeepNet  BeepGross | Total#  TotalPHP | action
const GRID_COLS =
  "grid-cols-[minmax(100px,140px)_repeat(12,minmax(60px,1fr))_minmax(72px,100px)_minmax(72px,100px)_80px]";

export default function AdminSalesDataInputTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<EditableRow[]>(
    BRANCHES.map((b) => ({ branch: b, ...EMPTY_ROW_FIELDS })),
  );
  const [loadingDate, setLoadingDate] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveAllStatus, setSaveAllStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [gaps, setGaps] = useState<GapsResp | null>(null);

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
        setRows(BRANCHES.map((b) => ({ branch: b, ...EMPTY_ROW_FIELDS })));
      } finally {
        setLoadingDate(false);
      }
    },
    [approverName, pin],
  );

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  // The whole of July 2026 was entered nowhere and went unnoticed for two
  // months, because the dashboard kept showing sales -- those come from the
  // channel exports -- while the order count read zero. This lists what is
  // still outstanding on the page where it gets fixed, rather than only in a
  // Discord message that has to be read on the right morning.
  const loadGaps = useCallback(async () => {
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) return;
    try {
      const qs = new URLSearchParams({ approver_name: nm, pin: p });
      setGaps(await apiGet<GapsResp>(`/api/admin/analytics/manila/daily-sales/gaps?${qs.toString()}`));
    } catch {
      setGaps(null); // never block entry on the check that watches entry
    }
  }, [approverName, pin]);

  useEffect(() => {
    void loadGaps();
  }, [loadGaps]);

  const updateRow = (branchIdx: number, field: keyof EditableRow, value: string) => {
    if (field === "saving" || field === "saved" || field === "error" || field === "branch") return;
    setRows((prev) =>
      prev.map((r, i) => (i === branchIdx ? { ...r, [field]: value, saved: false, error: null } : r)),
    );
  };

  function buildPayload(row: EditableRow, date: string, nm: string, p: string) {
    return {
      approver_name: nm,
      pin: p,
      date,
      branch: row.branch,
      dine_in_orders: intOrNull(row.dine_in_orders),
      dine_in_amount: floatOrNull(row.dine_in_amount),
      dine_in_gross: floatOrNull(row.dine_in_gross),
      grabfood_orders: intOrNull(row.grabfood_orders),
      grabfood_amount: floatOrNull(row.grabfood_amount),
      grabfood_gross: floatOrNull(row.grabfood_gross),
      foodpanda_orders: intOrNull(row.foodpanda_orders),
      foodpanda_gross: floatOrNull(row.foodpanda_gross),
      beep_orders: intOrNull(row.beep_orders),
      beep_amount: floatOrNull(row.beep_amount),
      beep_gross: floatOrNull(row.beep_gross),
    };
  }

  const saveRow = async (idx: number): Promise<boolean> => {
    const row = rows[idx];
    if (!hasRowInput(row)) return true;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, error: "Approver name and PIN required", saved: false } : r)),
      );
      return false;
    }
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: true, error: null } : r)));
    try {
      await apiPostJson("/api/admin/analytics/manila/daily-sales/upsert", buildPayload(row, selectedDate, nm, p));
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false, saved: true, error: null } : r)));
      void loadGaps(); // the list above should drop the day you just fixed
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
        await apiPostJson(
          "/api/admin/analytics/manila/daily-sales/upsert",
          buildPayload(snapshot[i], selectedDate, nm, p),
        );
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, saving: false, saved: true, error: null } : r)));
      } catch {
        fail = true;
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, saving: false, saved: false, error: "Save failed" } : r)));
      }
    }
    setSaveAllStatus(fail ? "error" : "done");
    void loadGaps();
    setTimeout(() => setSaveAllStatus("idle"), 3000);
  };

  return (
    <div className={GLASS_CARD}>
      <div className="space-y-6 p-4 pb-8">
        {/* Header */}
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
                Enter daily counts and sales amounts for each channel. Data appears in Manila Sales Analytics → Sales Data after save.
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

        {/* Days still outstanding. Each one jumps to that date. */}
        {gaps &&
          ((gaps.missing_count || 0) > 0 ||
            (gaps.partial_count || 0) > 0 ||
            (gaps.channel_blank_count || 0) > 0) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                Days still needing figures
              </div>
              <div className="flex flex-wrap gap-2">
                {(gaps.missing || []).map((d) => (
                  <button
                    key={`m-${d}`}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 transition-colors hover:bg-red-500/20"
                  >
                    {d} — nothing entered
                  </button>
                ))}
                {(gaps.partial || []).map((p) => (
                  <button
                    key={`p-${p.day}`}
                    type="button"
                    onClick={() => setSelectedDate(p.day)}
                    className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-200 transition-colors hover:bg-orange-500/20"
                  >
                    {p.day} — {p.branches} of {gaps.expected_branches} branches
                  </button>
                ))}
                {(gaps.channel_blank || []).map((b) => (
                  <button
                    key={`c-${b.day}-${b.branch}-${b.channel}`}
                    type="button"
                    onClick={() => setSelectedDate(b.day)}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-500/20"
                  >
                    {b.day} {b.branch} — {b.channel} blank
                    {b.typical_orders ? ` (usually ~${b.typical_orders})` : ""}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                The total is the sum of the four channel figures, so a channel left blank is missing
                from the day&apos;s total as well. A blank is only listed for a branch that uses that
                channel almost every day, so this is not a store that was simply off the platform.
                The last {gaps.grace_days} days are not checked yet — the figures normally arrive a
                day or two late.
              </p>
            </div>
          )}

        {/* Field guide */}
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-xs leading-relaxed text-white/60">
          <span className="font-semibold text-indigo-300">Field guide — </span>
          <span className="text-sky-300 font-medium">Net Sales</span>
          {" "}= the Net Sales figure shown directly in your aggregator portal (Grab Merchant, Beep, StoreHub). Copy this value as-is.{"  "}
          <span className="text-amber-300 font-medium">Gross Sales</span>
          {" "}= the Gross Sales figure from the same portal. Copy this value as-is.{"  "}
          <span className="text-emerald-300 font-medium">FoodPanda</span>
          {" "}= enter FP Gross; Net (×0.70) is auto-computed.
        </div>

        {/* Date picker */}
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

        {/* Input table */}
        {!loadingDate ? (
          <div className="space-y-3 overflow-x-auto">
            {/* Column group labels */}
            <div className={`grid ${GRID_COLS} gap-2 px-1 sm:px-4`}>
              <div />
              {/* Dine-in group */}
              <div className="col-span-3 border-b border-white/10 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-indigo-300/60">
                Dine-in
              </div>
              {/* Grab group */}
              <div className="col-span-3 border-b border-white/10 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-green-300/60">
                Grab
              </div>
              {/* FoodPanda group */}
              <div className="col-span-3 border-b border-pink-500/20 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-300/60">
                FoodPanda
              </div>
              {/* Beep group */}
              <div className="col-span-3 border-b border-white/10 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-amber-300/60">
                Beep
              </div>
              <div />
              <div />
              <div />
            </div>

            {/* Column headers */}
            <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs sm:px-4`}>
              <div className="font-medium text-white/30">Branch</div>
              {/* Dine-in */}
              <div className="text-center text-white/30">#</div>
              <div className="text-center text-sky-300/60">Net</div>
              <div className="text-center text-amber-300/60">Gross</div>
              {/* Grab */}
              <div className="text-center text-white/30">#</div>
              <div className="text-center text-sky-300/60">Net</div>
              <div className="text-center text-amber-300/60">Gross</div>
              {/* FP */}
              <div className="text-center text-white/30">#</div>
              <div className="text-center text-amber-300/60">Gross</div>
              <div className="text-center text-emerald-300/60">Net (auto)</div>
              {/* Beep */}
              <div className="text-center text-white/30">#</div>
              <div className="text-center text-sky-300/60">Net</div>
              <div className="text-center text-amber-300/60">Gross</div>
              {/* Totals */}
              <div className="text-center text-white/30">Total #</div>
              <div className="text-center text-white/30">Total Net</div>
              <div />
            </div>

            {/* Branch rows */}
            {rows.map((row, idx) => {
              const { orders, amount } = calcTotal(row);
              const colors = BRANCH_COLORS[row.branch];
              const hasData = hasRowInput(row);

              return (
                <div
                  key={row.branch}
                  className={`rounded-2xl border transition-all ${
                    row.saved
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : row.error
                        ? "border-red-500/40 bg-red-500/5"
                        : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className={`grid ${GRID_COLS} items-center gap-2 px-1 py-3 sm:px-4`}>
                    {/* Branch label */}
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colors?.dot }} />
                      <span className="text-sm font-medium" style={{ color: colors?.text }}>
                        {row.branch}
                      </span>
                    </div>
                    {/* Dine-in */}
                    <InputCell value={row.dine_in_orders} onChange={(v) => updateRow(idx, "dine_in_orders", v)} />
                    <InputCell value={row.dine_in_amount} onChange={(v) => updateRow(idx, "dine_in_amount", v)} isAmount />
                    <InputCell value={row.dine_in_gross} onChange={(v) => updateRow(idx, "dine_in_gross", v)} isAmount />
                    {/* Grab */}
                    <InputCell value={row.grabfood_orders} onChange={(v) => updateRow(idx, "grabfood_orders", v)} />
                    <InputCell value={row.grabfood_amount} onChange={(v) => updateRow(idx, "grabfood_amount", v)} isAmount />
                    <InputCell value={row.grabfood_gross} onChange={(v) => updateRow(idx, "grabfood_gross", v)} isAmount />
                    {/* FoodPanda */}
                    <InputCell value={row.foodpanda_orders} onChange={(v) => updateRow(idx, "foodpanda_orders", v)} />
                    <InputCell value={row.foodpanda_gross} onChange={(v) => updateRow(idx, "foodpanda_gross", v)} isAmount />
                    {(() => {
                      const fpGross = floatOrNull(row.foodpanda_gross);
                      const fpNet = fpGross != null ? fpGross * 0.7 : null;
                      return (
                        <div className="text-right text-sm text-emerald-400/80">
                          {fpNet != null ? fmtPHP(fpNet) : <span className="text-white/20">—</span>}
                        </div>
                      );
                    })()}
                    {/* Beep */}
                    <InputCell value={row.beep_orders} onChange={(v) => updateRow(idx, "beep_orders", v)} />
                    <InputCell value={row.beep_amount} onChange={(v) => updateRow(idx, "beep_amount", v)} isAmount />
                    <InputCell value={row.beep_gross} onChange={(v) => updateRow(idx, "beep_gross", v)} isAmount />
                    {/* Totals */}
                    <div className="text-right text-sm font-semibold text-white">
                      {hasData && orders > 0 ? orders.toLocaleString("en-PH") : <span className="text-white/20">—</span>}
                    </div>
                    <div className="text-right text-sm font-semibold text-white">
                      {hasData && amount > 0 ? fmtPHP(amount) : <span className="text-white/20">—</span>}
                    </div>
                    {/* Save button */}
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
                            hasData
                              ? "bg-indigo-600 text-white hover:bg-indigo-500"
                              : "cursor-not-allowed bg-white/5 text-white/20"
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

        {/* Summary tables */}
        {!loadingDate && rows.some((r) => hasRowInput(r)) ? (
          <div className="space-y-4">
            {/* Net Sales Summary */}
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4">
              <h3 className="mb-1 text-sm font-semibold text-sky-300/80">Net Sales Summary</h3>
              <p className="mb-3 text-[11px] text-white/30">
                Dine-in / Grab / Beep = Net from portal · FoodPanda = Gross × 0.70
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                      <th className="pb-2 pr-4 text-left">Branch</th>
                      <th className="pb-2 px-3 text-right">Dine-In Net</th>
                      <th className="pb-2 px-3 text-right">Grab Net</th>
                      <th className="pb-2 px-3 text-right">FP Net</th>
                      <th className="pb-2 px-3 text-right">Beep Net</th>
                      <th className="pb-2 pl-3 text-right font-bold text-white/40">Total Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((row) => {
                      if (!hasRowInput(row)) return null;
                      const dine = floatOrNull(row.dine_in_amount) ?? 0;
                      const grab = floatOrNull(row.grabfood_amount) ?? 0;
                      const fpNet = (floatOrNull(row.foodpanda_gross) ?? 0) * 0.7;
                      const beep = floatOrNull(row.beep_amount) ?? 0;
                      const totalNet = dine + grab + fpNet + beep;
                      const colors = BRANCH_COLORS[row.branch];
                      return (
                        <tr key={row.branch}>
                          <td className="py-2 pr-4">
                            <span className="text-sm font-medium" style={{ color: colors?.text }}>
                              {row.branch}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-white/70">
                            {dine > 0 ? fmtPHP(dine) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-white/70">
                            {grab > 0 ? fmtPHP(grab) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-400/80">
                            {fpNet > 0 ? fmtPHP(fpNet) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-white/70">
                            {beep > 0 ? fmtPHP(beep) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="py-2 pl-3 text-right tabular-nums font-semibold text-white">
                            {totalNet > 0 ? fmtPHP(totalNet) : <span className="text-white/20">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-white/10">
                    <tr>
                      <td className="pt-2 pr-4 text-xs font-semibold uppercase tracking-wider text-white/40">Total</td>
                      {(
                        [
                          { field: "dine_in_amount" as const, fp: false },
                          { field: "grabfood_amount" as const, fp: false },
                          { field: "foodpanda_gross" as const, fp: true },
                          { field: "beep_amount" as const, fp: false },
                        ] as const
                      ).map(({ field, fp }) => {
                        const total = rows.reduce(
                          (s, r) =>
                            s + (fp ? (floatOrNull(r[field]) ?? 0) * 0.7 : (floatOrNull(r[field]) ?? 0)),
                          0,
                        );
                        return (
                          <td
                            key={field}
                            className={`pt-2 px-3 text-right tabular-nums text-sm font-semibold ${fp ? "text-emerald-400/80" : "text-white/60"}`}
                          >
                            {total > 0 ? fmtPHP(total) : <span className="text-white/20">—</span>}
                          </td>
                        );
                      })}
                      <td className="pt-2 pl-3 text-right tabular-nums text-sm font-bold text-sky-400">
                        {fmtPHP(
                          rows.reduce(
                            (s, r) =>
                              s +
                              (floatOrNull(r.dine_in_amount) ?? 0) +
                              (floatOrNull(r.grabfood_amount) ?? 0) +
                              (floatOrNull(r.foodpanda_gross) ?? 0) * 0.7 +
                              (floatOrNull(r.beep_amount) ?? 0),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Gross Sales Summary — only show if any gross data entered */}
            {rows.some(
              (r) =>
                (floatOrNull(r.dine_in_gross) ?? 0) > 0 ||
                (floatOrNull(r.grabfood_gross) ?? 0) > 0 ||
                (floatOrNull(r.foodpanda_gross) ?? 0) > 0 ||
                (floatOrNull(r.beep_gross) ?? 0) > 0,
            ) ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
                <h3 className="mb-1 text-sm font-semibold text-amber-300/80">Gross Sales Summary</h3>
                <p className="mb-3 text-[11px] text-white/30">
                  Dine-in / Grab / Beep = Gross from portal · FoodPanda = same as FP Gross input
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                        <th className="pb-2 pr-4 text-left">Branch</th>
                        <th className="pb-2 px-3 text-right">Dine-In Gross</th>
                        <th className="pb-2 px-3 text-right">Grab Gross</th>
                        <th className="pb-2 px-3 text-right">FP Gross</th>
                        <th className="pb-2 px-3 text-right">Beep Gross</th>
                        <th className="pb-2 pl-3 text-right font-bold text-white/40">Total Gross</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rows.map((row) => {
                        if (!hasRowInput(row)) return null;
                        const dineG = floatOrNull(row.dine_in_gross) ?? 0;
                        const grabG = floatOrNull(row.grabfood_gross) ?? 0;
                        const fpG = floatOrNull(row.foodpanda_gross) ?? 0;
                        const beepG = floatOrNull(row.beep_gross) ?? 0;
                        const totalG = dineG + grabG + fpG + beepG;
                        const colors = BRANCH_COLORS[row.branch];
                        return (
                          <tr key={row.branch}>
                            <td className="py-2 pr-4">
                              <span className="text-sm font-medium" style={{ color: colors?.text }}>
                                {row.branch}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-white/70">
                              {dineG > 0 ? fmtPHP(dineG) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-white/70">
                              {grabG > 0 ? fmtPHP(grabG) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-amber-400/80">
                              {fpG > 0 ? fmtPHP(fpG) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-white/70">
                              {beepG > 0 ? fmtPHP(beepG) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="py-2 pl-3 text-right tabular-nums font-semibold text-white">
                              {totalG > 0 ? fmtPHP(totalG) : <span className="text-white/20">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-white/10">
                      <tr>
                        <td className="pt-2 pr-4 text-xs font-semibold uppercase tracking-wider text-white/40">Total</td>
                        {(["dine_in_gross", "grabfood_gross", "foodpanda_gross", "beep_gross"] as const).map((field) => {
                          const total = rows.reduce((s, r) => s + (floatOrNull(r[field]) ?? 0), 0);
                          return (
                            <td
                              key={field}
                              className={`pt-2 px-3 text-right tabular-nums text-sm font-semibold ${field === "foodpanda_gross" ? "text-amber-400/80" : "text-white/60"}`}
                            >
                              {total > 0 ? fmtPHP(total) : <span className="text-white/20">—</span>}
                            </td>
                          );
                        })}
                        <td className="pt-2 pl-3 text-right tabular-nums text-sm font-bold text-amber-400">
                          {fmtPHP(
                            rows.reduce(
                              (s, r) =>
                                s +
                                (floatOrNull(r.dine_in_gross) ?? 0) +
                                (floatOrNull(r.grabfood_gross) ?? 0) +
                                (floatOrNull(r.foodpanda_gross) ?? 0) +
                                (floatOrNull(r.beep_gross) ?? 0),
                              0,
                            ),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Save all */}
        {!loadingDate ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {saveAllStatus === "done" ? (
              <span className="text-sm font-medium text-emerald-400">All saved</span>
            ) : null}
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

        {/* How to use */}
        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/30">
          <p className="mb-2 font-medium text-white/50">How to use</p>
          <p>① Set approver + PIN (Manila management).</p>
          <p>② Pick a date; existing data loads automatically for Paranaque / Taft / Cubao.</p>
          <p>③ For Grab, Beep, Dine-in — enter <span className="text-sky-300">Net Sales</span> (portal Net) and <span className="text-amber-300">Gross Sales</span> (portal Gross) separately.</p>
          <p>④ For FoodPanda — enter Gross only; Net (×0.70) is auto-computed.</p>
          <p>⑤ <span className="text-white/40">Total Net</span> column = sum of all Net channels. WoW ratio is recomputed on save.</p>
          <p>⑥ Use Save per row or Save all branches.</p>
          <p className="pt-1 text-white/20">Same date + branch overwrites the existing row.</p>
        </div>
      </div>
    </div>
  );
}
