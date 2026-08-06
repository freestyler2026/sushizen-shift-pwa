"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
} from "@/lib/ui-tokens";
import { Download, ExternalLink, RefreshCw, Receipt } from "lucide-react";
import SelectDark from "@/components/SelectDark";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReceiptItem = { name: string; amount: number };

type ReceiptEntry = {
  id: string;
  city: string;
  branch_code: string;
  department: string;
  purchase_date: string;
  supplier_name: string;
  items: ReceiptItem[];
  total_amount: number;
  receipt_url: string;
  submitted_by: string;
  notes: string;
  created_at: string;
};

// ─── Branch / dept maps ───────────────────────────────────────────────────────

const MANILA_BRANCHES: Record<string, string> = {
  PAR: "Paranaque",
  CUB: "Cubao",
  TAFT: "Taft",
  CK: "Commissary Kitchen",
};

const DUBAI_BRANCHES: Record<string, string> = {
  BB: "Business Bay",
  JLT: "JLT",
  ARJ: "Al Rigga / Jaddaf",
  AM: "Al Mankhool",
  AB: "Abu Baker",
};

function branchLabel(code: string, city: string) {
  const map = city === "dubai" ? DUBAI_BRANCHES : MANILA_BRANCHES;
  return map[code] ?? code;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatAmount(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvEscape(v: string | number) {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminReceiptLogPage() {
  const [city, setCity]           = useState<"manila" | "dubai">("manila");
  const [month, setMonth]         = useState(thisMonth());
  const [branch, setBranch]       = useState("");
  const [dept, setDept]           = useState("");
  const [entries, setEntries]     = useState<ReceiptEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const headers = useCallback((): Record<string, string> => {
    const auth = getAuth();
    if (!auth) return {};
    return procurementTokenHeaders(auth.name, auth.pin ?? "");
  }, []);

  // ─── Fetch entries ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await refreshAuthFromApi();
      const params = new URLSearchParams({ city, month, limit: "500" });
      if (branch) params.set("branch_code", branch);
      const data = await procurementJson(`/api/admin/receipt-log?${params}`, {
        method: "GET",
        headers: headers(),
      });
      setEntries(data.entries ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  }, [city, month, branch, headers]);

  useEffect(() => { load(); }, [load]);

  // ─── Filter by dept client-side ────────────────────────────────────────────
  const filtered = useMemo(
    () => (dept ? entries.filter((e) => e.department === dept) : entries),
    [entries, dept],
  );

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const totalSpend = useMemo(() => filtered.reduce((s, e) => s + e.total_amount, 0), [filtered]);
  const avgPerEntry = filtered.length ? totalSpend / filtered.length : 0;

  const topSupplier = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filtered) map[e.supplier_name] = (map[e.supplier_name] ?? 0) + e.total_amount;
    let top = "";
    let topAmt = 0;
    for (const [k, v] of Object.entries(map)) if (v > topAmt) { top = k; topAmt = v; }
    return top;
  }, [filtered]);

  const topBranch = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filtered) map[e.branch_code] = (map[e.branch_code] ?? 0) + e.total_amount;
    let top = "";
    let topAmt = 0;
    for (const [k, v] of Object.entries(map)) if (v > topAmt) { top = k; topAmt = v; }
    return top ? branchLabel(top, city) : "—";
  }, [filtered, city]);

  // ─── CSV export ────────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const rows = [
      ["Date", "Branch", "Department", "Supplier", "Items", "Total (₱)", "Submitted By", "Notes", "Receipt URL"].join(","),
      ...filtered.map((e) =>
        [
          csvEscape(e.purchase_date),
          csvEscape(branchLabel(e.branch_code, city)),
          csvEscape(e.department),
          csvEscape(e.supplier_name),
          csvEscape(e.items.map((i) => `${i.name} (${formatAmount(i.amount)})`).join("; ")),
          csvEscape(e.total_amount),
          csvEscape(e.submitted_by),
          csvEscape(e.notes),
          csvEscape(e.receipt_url),
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-log-${city}-${month}${branch ? `-${branch}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, city, month, branch]);

  // ─── Branch options ────────────────────────────────────────────────────────
  const branchMap = city === "dubai" ? DUBAI_BRANCHES : MANILA_BRANCHES;
  const branchOptions = [
    { value: "", label: "All Branches" },
    ...Object.entries(branchMap).map(([k, v]) => ({ value: k, label: v })),
  ];

  const deptOptions = [
    { value: "", label: "All Departments" },
    ...["Kitchen", "Operations", "Admin", "Maintenance", "Logistics", "Other"].map((d) => ({
      value: d, label: d,
    })),
  ];

  const currencySymbol = city === "dubai" ? "AED" : "₱";

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="text-violet-400" size={22} />
          <h1 className={T_PAGE_TITLE}>Receipt Log</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className={SECONDARY_BUTTON} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button onClick={exportCsv} className={PRIMARY_BUTTON} disabled={filtered.length === 0}>
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ─── Filters ────────────────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} flex flex-wrap gap-3 p-4`}>
        {/* City toggle */}
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {(["manila", "dubai"] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setCity(c); setBranch(""); }}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                city === c
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:bg-white/6 hover:text-white"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Month */}
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={`${INPUT_CLASS} w-40`}
        />

        {/* Branch */}
        <SelectDark
          value={branch}
          onChange={setBranch}
          options={branchOptions}
          className="w-52"
        />

        {/* Department */}
        <SelectDark
          value={dept}
          onChange={setDept}
          options={deptOptions}
          className="w-48"
        />
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Total Spend"
          value={`${currencySymbol} ${formatAmount(totalSpend)}`}
          sub={`${filtered.length} receipt${filtered.length !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Avg per Receipt"
          value={`${currencySymbol} ${formatAmount(avgPerEntry)}`}
          sub={month}
        />
        <KpiCard label="Top Supplier" value={topSupplier || "—"} sub="by spend" />
        <KpiCard label="Top Branch" value={topBranch} sub="by spend" />
      </div>

      {/* ─── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ─── Table ──────────────────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} overflow-hidden p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Date</th>
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Branch</th>
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Dept</th>
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Supplier</th>
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Items</th>
                <th className={`${T_LABEL} px-4 py-3 text-right`}>Amount</th>
                <th className={`${T_LABEL} px-4 py-3 text-left`}>Submitted By</th>
                <th className={`${T_LABEL} px-4 py-3 text-center`}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">Loading…</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    No entries found for {month}{branch ? ` · ${branchLabel(branch, city)}` : ""}.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/3"
                  >
                    <td className="px-4 py-3 font-mono text-zinc-300 tabular-nums">
                      {entry.purchase_date}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {branchLabel(entry.branch_code, city)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{entry.department || "—"}</td>
                    <td className="px-4 py-3 font-medium text-white">{entry.supplier_name}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {entry.items.length > 0 ? (
                        <span className={T_CAPTION}>
                          {entry.items
                            .map((i) => `${i.name} (${currencySymbol}${formatAmount(i.amount)})`)
                            .join(", ")}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-white">
                      {currencySymbol} {formatAmount(entry.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{entry.submitted_by}</td>
                    <td className="px-4 py-3 text-center">
                      {entry.receipt_url ? (
                        <a
                          href={entry.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300"
                          title="View receipt"
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-white/8 px-4 py-3 text-right">
            <span className={T_CAPTION}>{filtered.length} entries</span>
            <span className="ml-4 font-mono text-sm font-semibold text-white tabular-nums">
              Total: {currencySymbol} {formatAmount(totalSpend)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI card sub-component ───────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${GLASS_CARD} flex flex-col gap-1 p-4`}>
      <span className={T_LABEL}>{label}</span>
      <span className="truncate text-xl font-bold text-white" title={value}>
        {value}
      </span>
      <span className={T_CAPTION}>{sub}</span>
    </div>
  );
}
