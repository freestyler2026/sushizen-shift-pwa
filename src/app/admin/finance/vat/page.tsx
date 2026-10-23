"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders, hasRouteAccess } from "@/lib/auth";
import Form2550Q from "@/components/vat/Form2550Q";
import Slsp from "@/components/vat/Slsp";
import Reminders from "@/components/vat/Reminders";
import DubaiKeetaFees from "@/components/vat/DubaiKeetaFees";
import { peso } from "@/lib/vat-format";
import {
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  SMALL_BUTTON,
  STACK_BODY,
  STACK_CELL,
  STACK_HEAD,
  STACK_LABEL,
  STACK_ROW,
  STACK_TABLE,
  STACK_TITLE,
  TABLE_HEADER,
  TABLE_ROW,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
  T_BODY,
  T_CAPTION,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

/* The Manila VAT ledger (VAT plan Phases 4-5). Nothing here is filed: the 2550Q items are copied into eBIRForms.
   Backend: GET /api/admin/vat/summary (app/vat_output.py, app/vat_input.py,
   app/vat_withholding.py). */

type Money = string;
interface ChannelBox { transactions: number; sales: Money; vat: Money }
interface Store { store: string; label: string; channels: Record<string, ChannelBox> }
interface AdjLine { platform: string; store: string; compensation: Money; alignment: Money; applied: Money; vat: Money;
  not_applied: Record<string, { orders: number; sales: Money }> }
interface FillLine { platform: string; store: string; orders: number; sales: Money; vat: Money; days: number | null;
  first: string; last: string; source: string }
interface InputRow { bucket: "deductible" | "needs_review" | "not_deductible"; reasons: string[]; checks: string[];
  review_fields: string[]; source: string; source_id: string; review_status?: string; vendor: string | null; invoice_number: string | null;
  invoice_date: string; total: Money; vat: Money; buyer_tin?: string | null; buyer_name?: string | null;
  buyer_decision?: { decision: "ours" | "not_ours"; decided_by: string; decided_at: string } | null;
  review_values?: { field: string; first: unknown; second: unknown }[];
  reading_choices?: { field: string; value: unknown; decided_by: string; decided_at: string }[] }
interface CopyRow { source: string; source_id: string; vendor: string | null; invoice_number: string | null; invoice_date: string;
  total: Money; vat: Money; same_as_source: string; same_as_id: string; decided_by: string; decided_at: string }
interface WhtLine { platform: string; store: string; withheld: Money; state: string;
  received: { amount: Money; by: string; at: string; note: string } | null }
interface Summary {
  year: number; quarter: number; from: string; to: string; due: string; days_to_due: number; quarter_ended: boolean;
  output_vat: Money; input_vat: Money; payable: Money; needs_review: number; days_not_settled: number; can_manage: boolean;
  carried_over?: Money; exempt_share?: Money; closed?: boolean;
  awaiting_invoice: { vat: Money; by_store: Record<string, { commission: Money; ads: Money; cancelled_fees: Money; vat: Money }> } | null;
  output: {
    stores: Store[]; vat_inclusive_sales: Money; vatable_sales: Money; output_vat: Money; vat_exempt_sales: Money;
    rounding_difference: Money; through: string;
    scpwd: { transactions: number; exempt_sales: Money; vat_billed_to_senior: { store: string; transactions: number; vat_on_senior_share: Money }[] };
    platform_adjustments: { applied: Money; vat: Money; lines: AdjLine[];
      platform_only?: { sales: Money; vat: Money; lines: FillLine[] } };
    days_not_settled: { store: string; days: number; first: string | null; last: string | null }[];
    days_without_sales: { store: string; days: number; dates: string[] }[];
    not_in_storehub_before: { store: string; channel: string; first_in_storehub: string; days_missing: number;
      filled_from_platform: { orders: number; days: number } | null }[];
  };
  input: { deductible: { documents: number; input_vat: Money }; needs_review: { documents: number; vat_printed: Money };
    not_deductible: { documents: number; vat_printed: Money }; excluded_not_a_purchase: number; rows: InputRow[];
    left_out_as_copy?: CopyRow[];
    rows_truncated?: boolean; deductible_by_basis?: Record<string, { documents: number; vat: Money }> };
  withholding: { withheld: Money; received_2307: Money; awaiting: number; lines: WhtLine[] };
}

const STORE: Record<string, string> = { TAFT: "Taft", CUB: "Cubao", PAR: "Paranaque" };
const CHANNEL: Record<string, string> = { dine_in: "Dine-in", grabfood: "GrabFood", foodpanda: "foodpanda", other: "Other" };
const PLATFORM: Record<string, string> = { grabfood: "GrabFood", foodpanda: "foodpanda" };
const WHY: Record<string, string> = {
  seller_non_vat: "Seller is Non-VAT",
  official_receipt: "Official receipt, not an invoice",
  no_vat_shown: "No VAT shown",
  seller_tin_missing: "Seller TIN missing",
  buyer_tin_not_ours: "Not made out to our TIN",
  buyer_name_missing: "No buyer name",
  buyer_name_not_registered: "Buyer name is not ours",
  invoice_number_missing: "Invoice number missing",
  date_missing: "Date missing",
  buyer_tin_check: "Our TIN with a digit off? Check the photo",
  buyer_name_check: "Our name misspelt? Check the photo",
};
// What the two readings disagree on, in the words on the invoice.
const FIELD: Record<string, string> = {
  vat_amount: "VAT", tax_amount: "VAT", seller_tin_printed: "seller TIN", buyer_tin_printed: "buyer TIN",
  buyer_name_printed: "buyer name", invoice_number: "invoice number", seller_vat_status: "VAT or Non-VAT seller",
  document_kind: "kind of document",
};
const SOURCE: Record<string, string> = { proc_receivings: "receiving photo", proc_po_invoice_checks: "PO-check photo",
  drive_invoices: "Inbox invoice" };

/** The photo a document was read from (receiving or PO check: there is no Inbox card for it). */
function photoLink(r: { source: string; source_id: string }): string {
  return `/api/admin/vat/document-photo?source=${encodeURIComponent(r.source)}&source_id=${encodeURIComponent(r.source_id)}`;
}

/** Splits that read the same to a person (the VAT is kept under two field names) shown once. */
function readingGroups(vals: { field: string; first: unknown; second: unknown }[]) {
  const out: { field: string; first: unknown; second: unknown; fields: string[] }[] = [];
  for (const v of vals) {
    const same = out.find((g) => (FIELD[g.field] || g.field) === (FIELD[v.field] || v.field)
      && shown(g.first) === shown(v.first) && shown(g.second) === shown(v.second));
    if (same) same.fields.push(v.field); else out.push({ ...v, fields: [v.field] });
  }
  return out;
}

function choiceGroups(vals: { field: string; value: unknown; decided_by: string; decided_at: string }[]) {
  const out: { field: string; value: unknown; decided_by: string; decided_at: string; fields: string[] }[] = [];
  for (const c of vals) {
    const same = out.find((g) => (FIELD[g.field] || g.field) === (FIELD[c.field] || c.field) && shown(g.value) === shown(c.value));
    if (same) same.fields.push(c.field); else out.push({ ...c, fields: [c.field] });
  }
  return out;
}

function shown(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  return typeof v === "number" ? v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

const WHT_STATE: Record<string, string> = {
  awaiting_2307: "Form 2307 not received",
  received: "2307 received",
  received_differs: "2307 received — amount differs",
  nothing_withheld: "Nothing withheld",
};

/** Today in Manila: the filing deadline is Manila's, whatever the device's clock says. */
function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** The quarter to open on: the one being filed while its 25 days run, else the current one. */
function defaultQuarter(): { year: number; quarter: number } {
  const [y, m, d] = manilaToday().split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const firstMonth = (q - 1) * 3 + 1;
  if (m === firstMonth && d <= 25) return q === 1 ? { year: y - 1, quarter: 4 } : { year: y, quarter: q - 1 };
  return { year: y, quarter: q };
}

export default function VatLedgerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [{ year, quarter }, setYQ] = useState(defaultQuarter);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft2307, setDraft2307] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [whtError, setWhtError] = useState("");
  const [allowed, setAllowed] = useState(true);
  const seq = useRef(0);
  // One refresh for the whole page: the 2550Q and SLSP sections read the same
  // figures as the summary, so a decision, a close or Refresh reloads all three.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    const a = getAuth();
    if (!a) { router.replace("/"); return; }
    // The API also accepts Management Accounting access; the screen does the same,
    // and says so instead of sending the person home without a word.
    setAllowed(a.role === "HQ" || hasRouteAccess("/admin/finance/vat", a) || hasRouteAccess("/admin/mgmt-accounting", a));
  }, [router]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError("");
    // A quarter's figures must not stay on screen under another quarter's tab:
    // a 2307 pressed then was recorded for the tab, with the old row's numbers.
    setData((d) => (d && (d.year !== year || d.quarter !== quarter) ? null : d));
    try {
      const res = await fetch(`/api/admin/vat/summary?year=${year}&quarter=${quarter}`, { headers: getAuthHeaders(getAuth()) });
      const body = await res.json().catch(() => null);
      if (my !== seq.current) return;
      if (!res.ok) { setData(null); setError(body?.detail || `Could not load the quarter (HTTP ${res.status}).`); return; }
      setData(body);
    } catch {
      if (my === seq.current) setError("Network error. Press Refresh to try again.");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => { if (mounted) load(); }, [mounted, load]);
  const refreshAll = useCallback(() => { load(); setTick((t) => t + 1); }, [load]);

  // 2026 Q1 (the first quarter with data) to the calendar quarter running today.
  const quarters = useMemo(() => {
    const [cy, cm] = manilaToday().split("-").map(Number);
    const cq = Math.floor((cm - 1) / 3) + 1;
    const out: { year: number; quarter: number }[] = [];
    for (let y = 2026; y <= cy; y++) for (let q = 1; q <= 4; q++) if (y < cy || q <= cq) out.push({ year: y, quarter: q });
    return out;
  }, []);

  // Oldest first: the longest-waiting invoice is the first one a person sees.
  const reviewRows = useMemo(() => (data?.input.rows || []).filter((r) => r.bucket === "needs_review")
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)), [data]);
  const decidedRows = useMemo(() => (data?.input.rows || []).filter((r) => r.bucket === "deductible"
      && (r.buyer_decision || (r.reading_choices || []).length > 0))
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)), [data]);
  const notRows = useMemo(() => (data?.input.rows || []).filter((r) => r.bucket === "not_deductible" && Number(r.vat) > 0)
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)), [data]);

  const save2307 = async (w: WhtLine) => {
    const key = `${year}Q${quarter}|${w.platform}|${w.store}`;
    const raw = (draft2307[key] || "").replace(/[,\s₱]/g, "");
    const amount = Number(raw);
    // Typed from the form, never prefilled from the statement: a prefilled figure
    // recorded "received" with one tap, and nobody had compared it.
    if (!raw || !Number.isFinite(amount) || amount <= 0) {
      setWhtError(`Type the amount printed on the Form 2307 for ${PLATFORM[w.platform]} ${STORE[w.store] || w.store}.`);
      return;
    }
    setWhtError("");
    setSaving(key);
    try {
      const res = await fetch("/api/admin/vat/2307", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ platform: w.platform, store: w.store, year, quarter, amount }),
      });
      if (!res.ok) { const b = await res.json().catch(() => null); setWhtError(b?.detail || "Could not save the 2307."); return; }
      setDraft2307((d) => { const n = { ...d }; delete n[key]; return n; });
      await load();
    } catch { setWhtError("Network error. Try again."); } finally { setSaving(""); }
  };
  const undo2307 = async (w: WhtLine) => {
    const key = `${year}Q${quarter}|${w.platform}|${w.store}`;
    if (!window.confirm(`Remove the Form 2307 recorded for ${PLATFORM[w.platform]} ${STORE[w.store] || w.store}, ${year} Q${quarter}?`)) return;
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/vat/2307?platform=${w.platform}&store=${w.store}&year=${year}&quarter=${quarter}`, {
        method: "DELETE", headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) { const b = await res.json().catch(() => null); setWhtError(b?.detail || "Could not undo the 2307."); return; }
      await load();
    } catch { setWhtError("Network error. Try again."); } finally { setSaving(""); }
  };

  if (!mounted) return null;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className={T_PAGE_TITLE}>VAT Ledger</h1>
        <p className={`${T_BODY} mt-3`}>
          Your role does not include the VAT Ledger. Ask HQ to grant &ldquo;View VAT Ledger&rdquo; in Role Management.
        </p>
      </div>
    );
  }

  const o = data?.output;
  const pa = o?.platform_adjustments;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={T_PAGE_TITLE}>VAT Ledger</h1>
          <p className={T_CAPTION}>Manila · TIN 457-994-635-00000 · nothing here is filed with the BIR</p>
        </div>
        <button className={SMALL_BUTTON} onClick={refreshAll} disabled={loading}>
          <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className={`${TAB_CONTAINER} overflow-x-auto`}>
        {quarters.map((x) => (
          <button key={`${x.year}${x.quarter}`} onClick={() => setYQ(x)}
            className={x.year === year && x.quarter === quarter ? TAB_ACTIVE : TAB_INACTIVE}>
            {x.year} Q{x.quarter}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {loading && !data && <p className={T_BODY}>Loading the quarter… (a few seconds)</p>}

      {data && o && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Full width on a phone: a seven-figure peso amount does not fit half a screen. */}
            <a href="#form-2550q" className={`${KPI_CARD} col-span-2 lg:col-span-1`}>
              <div className={KPI_LABEL}>{data.closed ? "VAT payable (closed)" : "VAT payable (so far)"}</div>
              <div className={KPI_VALUE}>{peso(data.payable)}</div>
              <div className={T_CAPTION}>
                2550Q item 56: {peso(data.output_vat)} output − {peso(data.input_vat)} input
                {Number(data.carried_over) > 0 ? ` − ${peso(data.carried_over)} carried over` : ""}
                {Number(data.exempt_share) > 0 ? ` + ${peso(data.exempt_share)} input tax on exempt sales (item 51)` : ""}.
                {data.closed ? " Frozen when the quarter was closed." : ""}
                {!data.closed && (Number(data.input.needs_review.vat_printed) > 0 || Number(data.awaiting_invoice?.vat) > 0)
                  ? ` Lower by up to ${peso(Number(data.input.needs_review.vat_printed) + Number(data.awaiting_invoice?.vat || 0))} once the invoices to check and Grab's invoice are in.`
                  : ""}
              </div>
            </a>
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>2550Q due</div>
              <div className={KPI_VALUE}>{data.days_to_due >= 0 ? `${data.days_to_due} days` : `${-data.days_to_due} days ago`}</div>
              <div className={T_CAPTION}>{data.due}{data.quarter_ended ? "" : " · quarter still running"}</div>
            </div>
            <a href="#review" className={KPI_CARD}>
              <div className={KPI_LABEL}>Invoices to check</div>
              <div className={KPI_VALUE}>{data.needs_review}</div>
              <div className={T_CAPTION}>{peso(data.input.needs_review.vat_printed)} VAT not counted until checked</div>
            </a>
            <a href="#grab" className={KPI_CARD}>
              <div className={KPI_LABEL}>Waiting for Grab&apos;s invoice</div>
              <div className={KPI_VALUE}>{peso(data.awaiting_invoice?.vat)}</div>
              <div className={T_CAPTION}>Input VAT not counted until Grab invoices it</div>
            </a>
          </div>

          <Form2550Q year={year} quarter={quarter} canManage={data.can_manage} quarterEnded={data.quarter_ended}
            refreshKey={tick} onChanged={refreshAll} />

          <Slsp year={year} quarter={quarter} refreshKey={tick} />

          <Reminders />

          {/* Output VAT */}
          <section className={`${GLASS_CARD} p-4`}>
            <h2 className={T_SECTION}>Output VAT</h2>
            <p className={`${T_CAPTION} mb-3`}>
              {data.from} to {o.through}. VAT = paid amount × 12/112, rounded once.
              {data.days_not_settled > 0 ? ` ${data.days_not_settled} store-days not yet re-read 7 days later (late cancellations can still move them).` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className={`${STACK_TABLE} sm:min-w-[520px]`}>
                <thead className={STACK_HEAD}><tr className={TABLE_HEADER}>
                  <th className="text-left">Store</th>
                  {Object.keys(CHANNEL).map((c) => <th key={c} className="text-right">{CHANNEL[c]}</th>)}
                </tr></thead>
                <tbody className={STACK_BODY}>
                  {o.stores.map((s) => (
                    <tr key={s.store} className={`${TABLE_ROW} ${STACK_ROW}`}>
                      <td className={`${STACK_TITLE} text-zinc-200`}>{STORE[s.store] || s.label}</td>
                      {Object.keys(CHANNEL).map((c) => (
                        <td key={c} className={`${STACK_CELL} tabular-nums text-zinc-300`}>
                          <span className={STACK_LABEL}>{CHANNEL[c]}</span>
                          <span>{s.channels[c] ? <>{peso(s.channels[c].sales)}<span className="ml-2 text-[11px] text-zinc-500 sm:ml-0 sm:block">VAT {peso(s.channels[c].vat)}</span></> : "—"}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {((o.not_in_storehub_before || []).some((g) => !g.filled_from_platform) || (o.days_without_sales || []).length > 0) && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                {(o.not_in_storehub_before || []).filter((g) => !g.filled_from_platform).map((g) => (
                  <div key={g.store + g.channel}>{STORE[g.store] || g.store} {CHANNEL[g.channel] || g.channel}: {g.days_missing} days before {g.first_in_storehub} are in neither StoreHub nor the platform&apos;s records — not in the figures.</div>))}
                {(o.days_without_sales || []).map((g) => (
                  <div key={g.store}>{STORE[g.store] || g.store}: {g.days} days with no sale at all ({(g.dates || []).slice(0, 5).join(", ")}{g.days > 5 ? "…" : ""}) — closed, or not read.</div>))}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/8 p-3">
                <div className="text-sm font-semibold text-white">Delivery apps, aligned to the platform</div>
                <div className={T_CAPTION}>Cancellation compensation is a taxable sale; chargebacks are not deducted (owner decision 2026-10-21).</div>
                <div className="mt-2 text-sm tabular-nums text-zinc-300">{peso(pa?.applied)} · VAT {peso(pa?.vat)}</div>
              </div>
              <div className="rounded-xl border border-white/8 p-3">
                <div className="text-sm font-semibold text-white">Sold before StoreHub carried the channel</div>
                <div className={T_CAPTION}>Taken from the platform&apos;s own records, which are the only record of these days.</div>
                {(pa?.platform_only?.lines || []).length === 0 ? <div className="mt-2 text-sm text-zinc-500">None this quarter.</div> :
                  (pa?.platform_only?.lines || []).map((l) => (
                    <div key={`${l.platform}${l.store}`} className="mt-2 text-sm text-zinc-300">
                      {STORE[l.store] || l.store} {PLATFORM[l.platform]}: {peso(l.sales)} · VAT {peso(l.vat)}
                      <div className="text-[11px] text-zinc-500">{l.orders} orders{l.days != null ? `, ${l.days} days` : ""} ({l.first} to {l.last}) · {l.source}</div>
                    </div>))}
              </div>
              <div className="rounded-xl border border-white/8 p-3">
                <div className="text-sm font-semibold text-white">Senior / PWD</div>
                <div className="mt-1 text-sm tabular-nums text-zinc-300">VAT-exempt sales {peso(o.scpwd.exempt_sales)} · {o.scpwd.transactions} bills</div>
                {o.scpwd.vat_billed_to_senior.map((b) => (
                  <div key={b.store} className="mt-1 text-[12px] text-amber-200">
                    {STORE[b.store] || b.store}: {b.transactions} bills gave the 20% with the ordinary-discount button, so VAT {peso(b.vat_on_senior_share)} was billed and is owed. Use the Senior/PWD button.
                  </div>))}
              </div>
              <div className="rounded-xl border border-white/8 p-3 text-sm tabular-nums text-zinc-300">
                <div>VAT-inclusive sales {peso(o.vat_inclusive_sales)}</div>
                <div>VATable sales {peso(o.vatable_sales)}</div>
                <div className="font-semibold text-white">Output VAT {peso(o.output_vat)}</div>
                <div className="text-[11px] text-zinc-500">Store boxes rounded one by one differ by {peso(o.rounding_difference)}.</div>
              </div>
            </div>
          </section>

          {/* Input VAT */}
          <section className={`${GLASS_CARD} p-4`}>
            <h2 className={T_SECTION}>Input VAT</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-emerald-300">Deductible</div>
                <div className="tabular-nums text-white">{peso(data.input.deductible.input_vat)}</div>
                <div className={T_CAPTION}>{data.input.deductible.documents} invoices</div>
                {Object.entries(data.input.deductible_by_basis || {}).map(([k, v]) => (
                  <div key={k} className="text-[11px] text-zinc-400">
                    {({ foodpanda_invoice: "foodpanda's invoices", approved_by_a_person: "approved by a person",
                       approved_by_the_reader: "approved by the reader (read twice, nothing to check)",
                       read_twice_not_reviewed: "read twice, not reviewed yet" } as Record<string, string>)[k] || k}: {peso(v.vat)} ({v.documents})
                  </div>))}
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="text-amber-300">To check</div>
                <div className="tabular-nums text-white">{peso(data.input.needs_review.vat_printed)}</div>
                <div className={T_CAPTION}>{data.input.needs_review.documents} invoices</div>
              </div>
              <div className="rounded-xl border border-white/10 p-3">
                <div className="text-zinc-300">Not deductible</div>
                <div className="tabular-nums text-white">{peso(data.input.not_deductible.vat_printed)}</div>
                <div className={T_CAPTION}>{data.input.not_deductible.documents} documents (most are Non-VAT sellers)</div>
              </div>
            </div>

            <h3 id="review" className="mt-5 text-sm font-semibold text-white">To check — oldest first</h3>
            <p className={T_CAPTION}>Each holds VAT that is not counted yet. Open it in the Invoice Inbox and compare with the photo.</p>
            <p className={T_CAPTION}>
              Approving an invoice in the Inbox puts the purchase in the Hub; it does not decide the input VAT. When the buyer TIN
              or name is a digit or letter off, compare the photo and decide here: <strong>Our TIN</strong> counts it (once nothing else is open on it), <strong>Not ours</strong> leaves it out.
              A decision stops applying if the invoice is read again with a different TIN or name.
            </p>
            <InvoiceList rows={reviewRows} empty="Nothing to check this quarter." canDecide={data.can_manage} onDecided={refreshAll} />

            <h3 className="mt-5 text-sm font-semibold text-white">VAT printed but not deductible</h3>
            <p className={T_CAPTION}>A supplier printed VAT, but the invoice misses something the BIR requires (RMC 77-2024). Ask the supplier for a corrected invoice.</p>
            <InvoiceList rows={notRows} empty="None this quarter." canDecide={data.can_manage} onDecided={refreshAll} />
            {decidedRows.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-white">Counted by a VAT decision</h3>
                <p className={T_CAPTION}>Invoices counted because a person decided they are made out to us, or picked one of two readings. Undo puts one back to be checked.</p>
                <InvoiceList rows={decidedRows} empty="" canDecide={data.can_manage} onDecided={refreshAll} />
              </>)}
            {(data.input.left_out_as_copy || []).length > 0 && (
              <CopyList rows={data.input.left_out_as_copy || []} canDecide={data.can_manage} onDecided={refreshAll} />)}
            {data.input.rows_truncated && <p className="mt-2 text-[12px] text-amber-200">The list stops at 1,000 rows; the totals above count every document.</p>}
          </section>

          {/* Grab */}
          <section id="grab" className={`${GLASS_CARD} p-4`}>
            {Object.keys(data.awaiting_invoice?.by_store || {}).length === 0 && (
              <p className={`${T_CAPTION} mb-1`}>No Grab transactions read for this quarter.</p>)}
            <h2 className={T_SECTION}>Waiting for Grab&apos;s VAT invoice</h2>
            <p className={`${T_CAPTION} mb-2`}>
              The amounts are exact (Grab&apos;s own transactions), but input VAT needs Grab&apos;s VAT invoice to our TIN and registered name.
              Ask Grab Help &amp; Support, or open Finance → Reports with the business-owner account.
            </p>
            <div className="overflow-x-auto">
              <table className={`${STACK_TABLE} sm:min-w-[480px]`}>
                <thead className={STACK_HEAD}><tr className={TABLE_HEADER}><th className="text-left">Store</th><th className="text-right">Commission</th><th className="text-right">Ads</th><th className="text-right">Cancelled-order fees</th><th className="text-right">VAT</th></tr></thead>
                <tbody className={STACK_BODY}>
                  {Object.entries(data.awaiting_invoice?.by_store || {}).map(([s, v]) => (
                    <tr key={s} className={`${TABLE_ROW} ${STACK_ROW}`}>
                      <td className={`${STACK_TITLE} text-zinc-200`}>{STORE[s] || s}</td>
                      <td className={`${STACK_CELL} tabular-nums`}><span className={STACK_LABEL}>Commission</span>{peso(v.commission)}</td>
                      <td className={`${STACK_CELL} tabular-nums`}><span className={STACK_LABEL}>Ads</span>{peso(v.ads)}</td>
                      <td className={`${STACK_CELL} tabular-nums`}><span className={STACK_LABEL}>Cancelled-order fees</span>{peso(v.cancelled_fees)}</td>
                      <td className={`${STACK_CELL} font-semibold tabular-nums text-white`}><span className={STACK_LABEL}>VAT</span>{peso(v.vat)}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Withholding */}
          <section className={`${GLASS_CARD} p-4`}>
            <h2 className={T_SECTION}>Tax withheld by the delivery apps</h2>
            <p className={`${T_CAPTION} mb-2`}>
              Not VAT: a credit against income tax, usable only with the platform&apos;s Form 2307. {peso(data.withholding.withheld)} withheld this quarter, {data.withholding.awaiting} 2307s outstanding.
            </p>
            {whtError && <p className="mb-2 text-[12px] text-red-300">{whtError}</p>}
            <div className="space-y-2">
              {data.withholding.lines.filter((w) => Number(w.withheld) > 0 || w.received).map((w) => {
                const key = `${year}Q${quarter}|${w.platform}|${w.store}`;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 p-3 text-sm">
                    <div className="min-w-[160px] text-zinc-200">{PLATFORM[w.platform]} · {STORE[w.store] || w.store}</div>
                    <div className="tabular-nums text-white">{peso(w.withheld)}</div>
                    <span className={w.state === "received" ? "text-emerald-300" : "text-amber-200"}>{WHT_STATE[w.state] || w.state}</span>
                    {w.received && <span className={T_CAPTION}>{peso(w.received.amount)} recorded by {w.received.by}</span>}
                    {data.can_manage && (w.received ? (
                      <button className={SMALL_BUTTON} disabled={saving === key || loading} onClick={() => undo2307(w)}>Undo</button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <input aria-label="Amount on the Form 2307" inputMode="decimal" placeholder="amount on the 2307"
                          className="w-36 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right tabular-nums text-white"
                          value={draft2307[key] ?? ""}
                          onChange={(e) => setDraft2307((d) => ({ ...d, [key]: e.target.value }))} />
                        <button className={SMALL_BUTTON} disabled={saving === key || loading} onClick={() => save2307(w)}>2307 received</button>
                      </span>))}
                  </div>);
              })}
              {data.withholding.lines.every((w) => Number(w.withheld) === 0 && !w.received) && (
                <p className={T_BODY}>Nothing withheld in the statements this quarter.</p>)}
            </div>
          </section>

          <DubaiKeetaFees year={year} quarter={quarter} />
        </>
      )}
    </div>
  );
}

function CopyList({ rows, canDecide, onDecided }: { rows: CopyRow[]; canDecide: boolean; onDecided: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const undo = async (r: CopyRow) => {
    if (!window.confirm(`Count ${r.vendor || "this invoice"} ${r.invoice_number || ""} again as its own invoice?`)) return;
    setBusy(r.source_id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/vat/same-invoice?source=${encodeURIComponent(r.source)}&source_id=${encodeURIComponent(r.source_id)}`,
        { method: "DELETE", headers: getAuthHeaders(getAuth()) });
      if (!res.ok) { const b = await res.json().catch(() => null); setErr(b?.detail || `Could not undo (HTTP ${res.status}).`); return; }
      onDecided();
    } catch { setErr("Network error. Try again."); } finally { setBusy(""); }
  };
  return (
    <>
      <h3 className="mt-5 text-sm font-semibold text-white">Left out as a copy of another invoice</h3>
      <p className={T_CAPTION}>The same paper invoice photographed twice. The copy is not in any total; the receiving and PO check keep their photos.</p>
      {err && <p className="mt-2 text-[12px] text-red-300">{err}</p>}
      <div className="mt-2 space-y-2">
        {rows.map((r) => (
          <div key={`${r.source}${r.source_id}`} className="rounded-xl border border-white/8 p-2 text-[12px] text-zinc-300">
            <span className="text-white">{r.vendor || "—"}</span> · {r.invoice_number || "—"} · {r.invoice_date} · VAT {peso(r.vat)}
            <span className="text-zinc-400"> — copy of the {SOURCE[r.same_as_source] || r.same_as_source}, left out by {r.decided_by}</span>
            <a className="ml-2 inline-flex items-center gap-1 text-violet-300 hover:text-violet-200" href={photoLink(r)} target="_blank" rel="noreferrer">
              Photo<ExternalLink className="h-3 w-3" /></a>
            {canDecide && (
              <button className="ml-2 text-violet-300 hover:text-violet-200" disabled={!!busy} onClick={() => undo(r)}>Undo</button>)}
          </div>))}
      </div>
    </>
  );
}

function InvoiceList({ rows, empty, canDecide = false, onDecided }: {
  rows: InputRow[]; empty: string; canDecide?: boolean; onDecided?: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // One choice can settle several fields: the reading keeps the VAT under two names
  // (vat_amount and tax_amount), and both split the same way.
  const pick = async (r: InputRow, fields: string[], choice: "first" | "second" | "undo") => {
    const key = `${r.source}${r.source_id}`;
    setBusy(key);
    setErr("");
    try {
      for (const field of fields) {
        const q = `source=${encodeURIComponent(r.source)}&source_id=${encodeURIComponent(r.source_id)}&field=${encodeURIComponent(field)}`;
        const res = choice === "undo"
          ? await fetch(`/api/admin/vat/reading-choice?${q}`, { method: "DELETE", headers: getAuthHeaders(getAuth()) })
          : await fetch("/api/admin/vat/reading-choice", {
            method: "POST", headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
            body: JSON.stringify({ source: r.source, source_id: r.source_id, field, choice }),
          });
        if (!res.ok) { const b = await res.json().catch(() => null); setErr(b?.detail || `Could not save (HTTP ${res.status}).`); return; }
      }
      onDecided?.();
    } catch { setErr("Network error. Try again."); } finally { setBusy(""); }
  };
  const decide = async (r: InputRow, decision: "ours" | "not_ours" | "undo") => {
    const key = `${r.source}${r.source_id}`;
    if (decision === "undo" && !window.confirm(`Undo the decision on ${r.vendor || "this invoice"} ${r.invoice_number || ""}? It goes back to be checked.`)) return;
    setBusy(key);
    setErr("");
    try {
      const res = decision === "undo"
        ? await fetch(`/api/admin/vat/buyer-decision?source=${encodeURIComponent(r.source)}&source_id=${encodeURIComponent(r.source_id)}`,
          { method: "DELETE", headers: getAuthHeaders(getAuth()) })
        : await fetch("/api/admin/vat/buyer-decision", {
          method: "POST", headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
          body: JSON.stringify({ source: r.source, source_id: r.source_id, decision }),
        });
      if (!res.ok) { const b = await res.json().catch(() => null); setErr(b?.detail || `Could not save (HTTP ${res.status}).`); return; }
      onDecided?.();
    } catch { setErr("Network error. Try again."); } finally { setBusy(""); }
  };
  if (rows.length === 0) return <p className={`${T_BODY} mt-2`}>{empty}</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      {err && <p className="mb-2 text-[12px] text-red-300">{err}</p>}
      <table className={`${STACK_TABLE} sm:min-w-[560px]`}>
        <thead className={STACK_HEAD}><tr className={TABLE_HEADER}><th className="text-left">Date</th><th className="text-left">Supplier</th><th className="text-left sm:pr-4">Invoice</th><th className="text-right sm:pr-4">VAT</th><th className="text-left">What is missing</th><th /></tr></thead>
        <tbody className={STACK_BODY}>
          {rows.map((r) => (
            <tr key={`${r.source}${r.source_id}`} className={`${TABLE_ROW} ${STACK_ROW}`}>
              <td className={`${STACK_CELL} tabular-nums text-zinc-300 sm:text-left`}><span className={STACK_LABEL}>Date</span>{r.invoice_date}</td>
              <td className={`${STACK_TITLE} text-zinc-200 sm:order-none`}>{r.vendor || "—"}</td>
              <td className={`${STACK_CELL} tabular-nums text-zinc-300 sm:pr-4 sm:text-left`}><span className={STACK_LABEL}>Invoice</span>{r.invoice_number || "—"}</td>
              <td className={`${STACK_CELL} tabular-nums text-white sm:pr-4`}><span className={STACK_LABEL}>VAT</span>{peso(r.vat)}</td>
              <td className="block py-1 text-[12px] text-amber-200 sm:table-cell sm:py-2">
                {[...r.reasons, ...r.checks].map((k) => WHY[k] || k).concat(r.review_fields.length ? ["Two readings disagree"] : []).join(" · ")}
                {(r.checks.length > 0 || r.buyer_decision) && (
                  <div className="mt-1 text-zinc-400">Read: TIN {r.buyer_tin || "—"} · {r.buyer_name || "no name"}</div>)}
                {r.buyer_decision && (
                  <div className="mt-1 text-zinc-400">
                    Decided {r.buyer_decision.decision === "ours" ? "ours" : "not ours"} by {r.buyer_decision.decided_by}
                    {canDecide && (
                      <button className="ml-2 text-violet-300 hover:text-violet-200" disabled={!!busy} onClick={() => decide(r, "undo")}>Undo</button>)}
                  </div>)}
                {/* The decision settles only the TIN / name check. On an invoice that misses something
                    else (no buyer TIN at all, no VAT shown) it would change nothing, so it is not offered. */}
                {canDecide && r.checks.length > 0 && r.reasons.length === 0 && !r.buyer_decision && (
                  <div className="mt-1 flex gap-2">
                    <button className={SMALL_BUTTON} disabled={!!busy} onClick={() => decide(r, "ours")}>Our TIN</button>
                    <button className={SMALL_BUTTON} disabled={!!busy} onClick={() => decide(r, "not_ours")}>Not ours</button>
                  </div>)}
                {/* Approving in the Inbox does not settle a split between the two readings, for any
                    kind of document: compare the photo and pick the printed value here. */}
                {readingGroups(r.review_values || []).map((v) => (
                  <div key={v.fields.join(",")} className="mt-1 text-zinc-300">
                    Two readings of the {FIELD[v.field] || v.field}: <span className="tabular-nums">{shown(v.first)}</span> or{" "}
                    <span className="tabular-nums">{shown(v.second)}</span>. Open the photo and pick the one printed.
                    {canDecide && (
                      <span className="mt-1 flex flex-wrap gap-2">
                        <button className={SMALL_BUTTON} disabled={!!busy} onClick={() => pick(r, v.fields, "first")}>{shown(v.first)}</button>
                        <button className={SMALL_BUTTON} disabled={!!busy} onClick={() => pick(r, v.fields, "second")}>{shown(v.second)}</button>
                      </span>)}
                  </div>))}
                {choiceGroups(r.reading_choices || []).map((c) => (
                  <div key={c.fields.join(",")} className="mt-1 text-zinc-400">
                    {FIELD[c.field] || c.field}: {shown(c.value)}, picked by {c.decided_by}
                    {canDecide && (
                      <button className="ml-2 text-violet-300 hover:text-violet-200" disabled={!!busy} onClick={() => pick(r, c.fields, "undo")}>Undo</button>)}
                  </div>))}
              </td>
              <td className="block py-1 sm:table-cell sm:py-2 sm:text-right">
                {r.source === "drive_invoices" ? (
                  <span className="inline-flex flex-wrap items-center gap-3">
                    <a className="inline-flex items-center gap-1 text-[12px] text-violet-300 hover:text-violet-200" href={photoLink(r)}
                      target="_blank" rel="noreferrer">
                      Photo<ExternalLink className="h-3 w-3" />
                    </a>
                    <a className="inline-flex items-center gap-1 text-[12px] text-violet-300 hover:text-violet-200"
                      href={`/admin/procurement/invoices?city=manila&invoice=${r.source_id}`}>
                      {r.review_status === "approved" ? "Approved" : "Pending"} #{r.source_id}<ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                ) : r.source === "fp_sales_invoices" ? (
                  <span className="text-[11px] text-zinc-500">foodpanda invoice</span>
                ) : (
                  <a className="inline-flex items-center gap-1 text-[12px] text-violet-300 hover:text-violet-200" href={photoLink(r)}
                    target="_blank" rel="noreferrer" title="Read from a PO-check or receiving photo; it has no Inbox card">
                    Photo<ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </td>
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}
