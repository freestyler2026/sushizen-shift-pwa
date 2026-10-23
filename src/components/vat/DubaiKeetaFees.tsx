"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";

/* Dubai VAT plan 0-6: Keeta's fees and the discounts Keeta funded, by brand, store and month.
   Backend: GET /api/admin/vat/dubai/keeta-fees (app/keeta_fees.py), filled by the weekly
   Keeta payout job from the billing report. Keeta's UAE portal gives no tax invoice, so the
   VAT in the fees is shown as waiting for one, never as claimable. */

interface Row {
  month: string; brand: string; store_code: string; days: number; orders: number;
  item_price: number; merchant_item_discount: number; keeta_item_discount: number; keeta_delivery_discount: number;
  commission: number; bank_fee: number; delivery_subsidy: number; subscription_fee: number; drone_fee: number;
  invoiced_adjustment: number; invoice_amount: number; payable: number; fee_vat: number; days_not_matching: number;
}

const BRAND: Record<string, string> = { sushi_zen: "Sushi ZEN", ramen_zen: "Ramen ZEN", all_veggie: "All Veggie Sushi" };
const BRANCH: Record<string, string> = { ARJ: "Arjan", AB3: "Al Barsha 3", BB: "Business Bay", JLT: "JLT", AM: "Al Mina", MC: "Mirdif" };

const aed = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const store = (code: string) => BRANCH[code.split("_").pop() || ""] || code;

function quarterRange(year: number, quarter: number) {
  const m0 = (quarter - 1) * 3 + 1;
  const last = new Date(Date.UTC(year, m0 + 2, 0)).getUTCDate();
  return { from: `${year}-${String(m0).padStart(2, "0")}-01`, to: `${year}-${String(m0 + 2).padStart(2, "0")}-${last}` };
}

export default function DubaiKeetaFees({ year, quarter }: { year: number; quarter: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const { from, to } = quarterRange(year, quarter);
    setRows(null);
    setError("");
    fetch(`/api/admin/vat/dubai/keeta-fees?date_from=${from}&date_to=${to}`, { headers: getAuthHeaders(getAuth()) })
      .then(async (res) => {
        const b = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) { setError(b?.detail || `Could not load Keeta's fees (HTTP ${res.status}).`); return; }
        setRows(b?.rows || []);
      })
      .catch(() => { if (!cancelled) setError("Network error loading Keeta's fees."); });
    return () => { cancelled = true; };
  }, [year, quarter]);

  // One line per brand and month; the stores open underneath.
  const groups = useMemo(() => {
    const g = new Map<string, { key: string; month: string; brand: string; stores: Row[]; t: Row }>();
    for (const r of rows || []) {
      const key = `${r.month}|${r.brand}`;
      const cur = g.get(key) || { key, month: r.month, brand: r.brand, stores: [], t: { ...r, store_code: "", days: 0, orders: 0,
        item_price: 0, merchant_item_discount: 0, keeta_item_discount: 0, keeta_delivery_discount: 0, commission: 0, bank_fee: 0,
        delivery_subsidy: 0, subscription_fee: 0, drone_fee: 0, invoiced_adjustment: 0, invoice_amount: 0, payable: 0, fee_vat: 0,
        days_not_matching: 0 } };
      cur.stores.push(r);
      for (const k of ["days", "orders", "item_price", "merchant_item_discount", "keeta_item_discount", "commission", "bank_fee",
        "delivery_subsidy", "invoice_amount", "fee_vat", "days_not_matching"] as const) cur.t[k] += r[k];
      g.set(key, cur);
    }
    return [...g.values()];
  }, [rows]);

  const total = groups.reduce((a, x) => ({ fee: a.fee + x.t.invoice_amount, vat: a.vat + x.t.fee_vat, keeta: a.keeta + x.t.keeta_item_discount }),
    { fee: 0, vat: 0, keeta: 0 });

  const cells = (t: Row) => (
    <>
      <td className="py-1.5 pr-3 text-right">{t.orders.toLocaleString("en-US")}</td>
      <td className="py-1.5 pr-3 text-right">{aed(t.item_price - t.merchant_item_discount)}</td>
      <td className="py-1.5 pr-3 text-right">{aed(t.keeta_item_discount)}</td>
      <td className="py-1.5 pr-3 text-right">{aed(t.commission)}</td>
      <td className="py-1.5 pr-3 text-right">{aed(t.bank_fee)}</td>
      <td className="py-1.5 pr-3 text-right">{aed(t.delivery_subsidy)}</td>
      <td className="py-1.5 pr-3 text-right font-medium text-white">{aed(t.invoice_amount)}</td>
      <td className="py-1.5 text-right text-amber-200">{aed(t.fee_vat)}</td>
    </>
  );

  return (
    <section id="dubai-keeta" className={`${GLASS_CARD} p-4`}>
      <h2 className={T_SECTION}>Dubai — Keeta&apos;s fees and the discounts Keeta funded</h2>
      <p className={`${T_CAPTION} mb-3`}>
        From Keeta&apos;s billing report, updated by the weekly Keeta job. Amounts include VAT. The VAT in the fees
        (5/105 of what Keeta invoiced) is input tax only with Keeta&apos;s tax invoice, which Keeta&apos;s portal does not
        give for the UAE — so it is shown here as waiting for the invoice, not counted. Keeta&apos;s item discount is
        money we receive from Keeta for the food, so it belongs in taxable sales; its delivery-fee discount does not.
      </p>
      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {rows === null && !error && <p className={T_BODY}>Loading…</p>}
      {rows && rows.length === 0 && <p className={T_BODY}>No Keeta figures for this quarter yet.</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="mb-2 text-sm text-zinc-200">
            Keeta invoiced AED {aed(total.fee)} this quarter; VAT inside it AED {aed(total.vat)} (waiting for Keeta&apos;s tax invoice).
            Keeta-funded item discounts: AED {aed(total.keeta)}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs tabular-nums">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Month · brand</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Orders</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Sales after our discounts</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Keeta-funded item discount</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Commission</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Bank fee</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Delivery subsidy</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Keeta invoiced</th>
                  <th className="py-1.5 text-right font-medium">VAT in it</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {groups.map((g) => (
                  <FragmentRows key={g.key} open={open === g.key} onToggle={() => setOpen(open === g.key ? "" : g.key)}
                    label={`${g.month} · ${BRAND[g.brand] || g.brand}`} t={g.t} stores={g.stores} cells={cells} />
                ))}
              </tbody>
            </table>
          </div>
          {groups.some((g) => g.t.days_not_matching > 0) && (
            <p className="mt-2 text-[12px] text-amber-200">
              Some days&apos; charges do not add up to Keeta&apos;s invoice amount for the day — check the billing report for those months.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FragmentRows({ open, onToggle, label, t, stores, cells }: {
  open: boolean; onToggle: () => void; label: string; t: Row; stores: Row[]; cells: (t: Row) => React.ReactNode;
}) {
  return (
    <>
      <tr className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={onToggle}>
        <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-100">
          <button type="button" className="text-left" aria-expanded={open}>{open ? "▾" : "▸"} {label}</button>
        </td>
        {cells(t)}
      </tr>
      {open && stores.map((s) => (
        <tr key={s.store_code} className="text-zinc-400">
          <td className="py-1 pl-5 pr-3 whitespace-nowrap">{store(s.store_code)} · {s.days} days</td>
          {cells(s)}
        </tr>
      ))}
    </>
  );
}
