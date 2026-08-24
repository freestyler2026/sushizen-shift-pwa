"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, T_PAGE_TITLE, T_SECTION, SMALL_BUTTON,
  PRIMARY_BUTTON, TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";
import { SALARY_HIDDEN, isSalaryHidden } from "@/lib/salary";

interface FoodDetail {
  year_month: string;
  city: string;
  store_code: string;
  by_vendor: { vendor: string; store_code: string; amount: number; count: number }[];
  by_store: { store_code: string; amount: number; count: number }[];
  requests: { request_no: string; store_code: string; vendor: string; date: string; amount: number; currency: string; status: string }[];
}

interface LaborDetail {
  year_month: string;
  city: string;
  // Pay figures come back null when the viewer is not HQ (backend masking).
  by_department: { department: string; office: string; staff_count: number; gross_pay: number | null; net_pay: number | null }[];
  totals: { staff_count: number; total_gross: number | null; total_net: number | null };
}

const DUBAI_STORES = ["", "AM", "AB", "JLT", "BB", "ARJ"];
const MANILA_STORES = ["", "CUB", "BER", "MOA", "MKT", "QC"];

function fmtAmt(v: number, cur = "AED") {
  return `${cur} ${v.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
/** fmtAmt for a pay figure that may be masked. */
function fmtPay(v: number | null | undefined, cur = "AED") {
  return isSalaryHidden(v) ? SALARY_HIDDEN : fmtAmt(v as number, cur);
}
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function prevMonths(n: number): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    result.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return result;
}

export default function CostDetailPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"food" | "labor">("food");
  const [city, setCity] = useState("dubai");
  const [storeCode, setStoreCode] = useState("");
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const [foodDetail, setFoodDetail] = useState<FoodDetail | null>(null);
  const [laborDetail, setLaborDetail] = useState<LaborDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const monthOptions = prevMonths(12);
  const storeOptions = city === "dubai" ? DUBAI_STORES : MANILA_STORES;
  const cur = city === "dubai" ? "AED" : "PHP";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

      const qs = new URLSearchParams({ city, year_month: yearMonth });
      if (storeCode) qs.set("store_code", storeCode);

      const [foodRes, laborRes] = await Promise.all([
        fetch(`/api/admin/mgmt/food-cost-detail?${qs}`, { headers }),
        fetch(`/api/admin/mgmt/labor-cost-detail?city=${city}&year_month=${yearMonth}`, { headers }),
      ]);

      if (!foodRes.ok) throw new Error(`Food cost: ${foodRes.status}`);
      if (!laborRes.ok) throw new Error(`Labor cost: ${laborRes.status}`);

      setFoodDetail(await foodRes.json());
      setLaborDetail(await laborRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, storeCode, yearMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">Management Accounting</p>
          <h1 className={T_PAGE_TITLE}>Cost Detail</h1>
          <p className="text-sm text-zinc-500 mt-1">Food cost by vendor · Labor by department</p>
        </div>
        <button onClick={() => router.push("/admin/mgmt-accounting")} className={SMALL_BUTTON}>
          ← Dashboard
        </button>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3`}>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">City</label>
          <select value={city} onChange={e => { setCity(e.target.value); setStoreCode(""); }}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Store</label>
          <select value={storeCode} onChange={e => setStoreCode(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="">All Stores</option>
            {storeOptions.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Month</label>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={fetchData} className={PRIMARY_BUTTON} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className={`${GLASS_CARD} p-4 border-rose-500/30`}>
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        <button onClick={() => setTab("food")} className={tab === "food" ? TAB_ACTIVE : TAB_INACTIVE}>
          Food Cost
        </button>
        <button onClick={() => setTab("labor")} className={tab === "labor" ? TAB_ACTIVE : TAB_INACTIVE}>
          Labor Cost
        </button>
      </div>

      {/* Food Cost Tab */}
      {tab === "food" && foodDetail && (
        <div className="space-y-5">
          {/* By Store */}
          {foodDetail.by_store.length > 1 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h2 className={`${T_SECTION} mb-4`}>By Store</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/8">
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Store</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {foodDetail.by_store.map(s => (
                    <tr key={s.store_code} className="border-t border-white/5">
                      <td className="py-2.5 font-mono text-zinc-200">{s.store_code}</td>
                      <td className="py-2.5 text-right font-mono text-amber-300">{fmtAmt(s.amount, cur)}</td>
                      <td className="py-2.5 text-right text-zinc-400">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By Vendor */}
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-4`}>By Vendor (Top 30)</h2>
            {foodDetail.by_vendor.length === 0 ? (
              <p className="text-sm text-zinc-500">No approved procurement requests for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-white/8">
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Vendor</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Store</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Reqs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodDetail.by_vendor.map((v, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2 text-zinc-200">{v.vendor || "—"}</td>
                        <td className="py-2 font-mono text-xs text-zinc-400">{v.store_code}</td>
                        <td className="py-2 text-right font-mono text-amber-300">{fmtAmt(v.amount, cur)}</td>
                        <td className="py-2 text-right text-zinc-400">{v.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Request List */}
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-4`}>Procurement Requests</h2>
            {foodDetail.requests.length === 0 ? (
              <p className="text-sm text-zinc-500">No approved requests found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-white/8">
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Request No</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Store</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Vendor</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Date</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodDetail.requests.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2 font-mono text-xs text-violet-300">{r.request_no}</td>
                        <td className="py-2 font-mono text-xs text-zinc-300">{r.store_code}</td>
                        <td className="py-2 text-zinc-300 max-w-[150px] truncate">{r.vendor || "—"}</td>
                        <td className="py-2 text-zinc-400">{r.date}</td>
                        <td className="py-2 text-right font-mono text-amber-300">{fmtAmt(r.amount, r.currency)}</td>
                        <td className="py-2">
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                            r.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-400" :
                            r.status === "COMPLETED" ? "bg-violet-500/15 text-violet-400" :
                            "bg-zinc-500/15 text-zinc-400"
                          }`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Labor Cost Tab */}
      {tab === "labor" && laborDetail && (
        <div className="space-y-5">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Staff", value: String(laborDetail.totals.staff_count) },
              { label: "Gross Pay", value: fmtPay(laborDetail.totals.total_gross, cur) },
              { label: "Net Pay", value: fmtPay(laborDetail.totals.total_net, cur) },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{k.label}</p>
                <p className="mt-1 text-xl font-bold text-white tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>

          {/* By Department */}
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-4`}>By Department</h2>
            {laborDetail.by_department.length === 0 ? (
              <p className="text-sm text-zinc-500">No payroll data for this period/city.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-white/8">
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Department</th>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Office</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Staff</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Gross Pay</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborDetail.by_department.map((d, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2.5 text-zinc-200">{d.department || "—"}</td>
                        <td className="py-2.5 text-zinc-400">{d.office || "—"}</td>
                        <td className="py-2.5 text-right text-zinc-300">{d.staff_count}</td>
                        <td className="py-2.5 text-right font-mono text-blue-300">{fmtPay(d.gross_pay, cur)}</td>
                        <td className="py-2.5 text-right font-mono text-zinc-300">{fmtPay(d.net_pay, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
