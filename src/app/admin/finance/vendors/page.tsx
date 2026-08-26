"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Merge,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";

interface Vendor {
  id: number;
  city: string;
  canonical_name: string;
  name_variants: string[];
  is_internal: boolean | null;
  tin_or_trn: string;
  verified_by: string;
  verified_at: string | null;
  /** What the OCR most often read. Not authoritative — see candidate_pct. */
  candidate_tin: string;
  candidate_pct: number | null;
  invoice_count: number;
  total_amount: number | null;
  currency: string;
  sample_invoice_no: string;
  sample_invoice_url: string;
  notes: string;
}

/**
 * Some invoice numbers were stored as the string "null" by the reader.
 * Showing that to someone told to "open the sample invoice" reads as a
 * broken page; "Open" says what the link does.
 */
function invoiceLabel(no: string): string {
  const t = (no || "").trim();
  if (!t || ["null", "none", "n/a", "na", "-"].includes(t.toLowerCase())) return "Open";
  return t;
}

export default function VendorMasterPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [mergeFrom, setMergeFrom] = useState<Vendor | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Ffinance%2Fvendors");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/finance/vendors", {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setVendors(d.vendors || []);
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load vendors: ${e}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reseed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/finance/vendors/seed?city=dubai", {
        method: "POST",
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBanner({
        kind: "ok",
        text: `Refreshed from invoices — ${d.created} new, ${d.updated} updated. Tax numbers already entered were left alone.`,
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Refresh failed: ${e}` });
    } finally {
      setSeeding(false);
    }
  }

  async function patchVendor(v: Vendor, body: Record<string, unknown>, okText?: string) {
    setSavingId(v.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/finance/vendors/${v.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || `HTTP ${res.status}`);
      }
      if (okText) setBanner({ kind: "ok", text: okText });
      setEdits((e) => {
        const n = { ...e };
        delete n[v.id];
        return n;
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `${v.canonical_name}: ${e instanceof Error ? e.message : e}` });
    } finally {
      setSavingId(null);
    }
  }

  async function doMerge(keep: Vendor) {
    if (!mergeFrom) return;
    if (!confirm(`Fold "${mergeFrom.canonical_name}" into "${keep.canonical_name}"?\n\nThe absorbed row is deactivated, not deleted.`)) return;
    try {
      const res = await fetch("/api/admin/finance/vendors/merge", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ keep_id: keep.id, merge_id: mergeFrom.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBanner({ kind: "ok", text: `Merged "${mergeFrom.canonical_name}" into "${keep.canonical_name}".` });
      setMergeFrom(null);
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Merge failed: ${e}` });
    }
  }

  const external = useMemo(() => vendors.filter((v) => !v.is_internal), [vendors]);
  const done = external.filter((v) => v.tin_or_trn).length;
  const internalCount = vendors.filter((v) => v.is_internal).length;
  // What fraction of actual invoice volume the entered numbers cover — the
  // seven busiest suppliers carry most of it, so "5 of 11 done" understates
  // how far the work has got.
  const extInvoices = external.reduce((a, v) => a + v.invoice_count, 0);
  const coveredPct = extInvoices
    ? Math.round(
        (external.filter((v) => v.tin_or_trn).reduce((a, v) => a + v.invoice_count, 0) /
          extInvoices) * 100,
      )
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Vendors</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            The tax number for each supplier, entered once. Open the sample invoice, read
            the number printed on it, and type it here — this becomes the number used on
            every document from that supplier.
          </p>
        </div>
        <button onClick={reseed} disabled={seeding} className={SMALL_BUTTON}>
          <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${seeding ? "animate-spin" : ""}`} />
          Refresh from invoices
        </button>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/90 leading-relaxed">
          <strong>Do not trust the suggested number.</strong> It is what the reader most
          often saw, and it is frequently wrong — one supplier came back with 40 different
          numbers across 54 invoices. The percentage next to it is how often that reading
          repeated. <strong>Always check against the actual invoice.</strong>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            banner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mergeFrom && (
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-violet-100 flex items-center gap-3">
          <Merge className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            Merging <strong>{mergeFrom.canonical_name}</strong> — now click{" "}
            <strong>Merge into</strong> on the row it belongs to.
          </span>
          <button onClick={() => setMergeFrom(null)} className={SMALL_BUTTON}>
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Tax numbers entered</div>
          <div className={KPI_VALUE}>
            {done}
            <span className="text-base text-zinc-500"> / {external.length}</span>
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Suppliers</div>
          <div className={KPI_VALUE}>{external.length}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Own companies</div>
          <div className={KPI_VALUE + " text-sky-300"}>{internalCount}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Invoices covered</div>
          <div className={KPI_VALUE + (coveredPct >= 80 ? " text-emerald-300" : "")}>
            {coveredPct}
            <span className="text-base text-zinc-500">%</span>
          </div>
        </div>
      </div>

      <div className={GLASS_CARD + " p-4"}>
        {loading ? (
          <div className={T_CAPTION + " py-10 text-center"}>Loading…</div>
        ) : vendors.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className={T_BODY}>No vendors yet.</div>
            <div className={T_CAPTION}>Press “Refresh from invoices” to build the list.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="text-left">
                  <th className={TABLE_HEADER + " pl-2"}>Vendor</th>
                  <th className={TABLE_HEADER + " text-right"}>Invoices</th>
                  <th className={TABLE_HEADER}>Invoice to check</th>
                  <th className={TABLE_HEADER}>Suggested (unverified)</th>
                  <th className={TABLE_HEADER}>Tax number</th>
                  <th className={TABLE_HEADER + " text-center"}>Own company</th>
                  <th className={TABLE_HEADER + " text-right pr-2"} />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const dirty = edits[v.id] !== undefined;
                  const value = dirty ? edits[v.id] : v.tin_or_trn;
                  const weak = v.candidate_pct !== null && v.candidate_pct < 60;
                  return (
                    <tr key={v.id} className={TABLE_ROW}>
                      <td className="py-3 pl-2">
                        <div className="text-sm text-zinc-100">{v.canonical_name}</div>
                        {v.name_variants.length > 1 && (
                          <div className={T_CAPTION + " mt-0.5"} title={v.name_variants.join("\n")}>
                            +{v.name_variants.length - 1} other spelling
                            {v.name_variants.length > 2 ? "s" : ""}
                          </div>
                        )}
                        {v.verified_by && (
                          <div className="text-[11px] text-emerald-400/80 mt-0.5">
                            Entered by {v.verified_by}
                          </div>
                        )}
                      </td>

                      <td className="py-3 text-right text-sm text-zinc-300 tabular-nums">
                        {v.invoice_count}
                      </td>

                      <td className="py-3">
                        {v.sample_invoice_url ? (
                          <a
                            href={v.sample_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200 underline underline-offset-2"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {invoiceLabel(v.sample_invoice_no)}
                          </a>
                        ) : (
                          <span className={T_CAPTION}>—</span>
                        )}
                      </td>

                      <td className="py-3">
                        {v.candidate_tin ? (
                          <button
                            onClick={() => setEdits((e) => ({ ...e, [v.id]: v.candidate_tin }))}
                            title="Copy into the box — then check it against the invoice"
                            className="text-left"
                          >
                            <div
                              className={`text-xs tabular-nums ${
                                weak ? "text-red-300" : "text-zinc-400"
                              } hover:text-violet-200`}
                            >
                              {v.candidate_tin}
                            </div>
                            <div className={`text-[11px] ${weak ? "text-red-400" : "text-zinc-600"}`}>
                              {v.candidate_pct}% agreement
                              {weak ? " — likely wrong" : ""}
                            </div>
                          </button>
                        ) : (
                          <span className={T_CAPTION}>none printed</span>
                        )}
                      </td>

                      <td className="py-3">
                        <input
                          className="w-44 rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-sm text-white tabular-nums outline-none focus:border-violet-500/50"
                          placeholder={v.is_internal ? "not required" : "15 digits"}
                          value={value}
                          inputMode="numeric"
                          onChange={(e) => setEdits((s) => ({ ...s, [v.id]: e.target.value }))}
                        />
                      </td>

                      <td className="py-3 text-center">
                        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                          {[
                            { label: "Yes", val: true },
                            { label: "No", val: false },
                          ].map((o) => (
                            <button
                              key={o.label}
                              onClick={() => patchVendor(v, { is_internal: o.val })}
                              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                                v.is_internal === o.val
                                  ? o.val
                                    ? "bg-sky-500 text-white"
                                    : "bg-zinc-600 text-white"
                                  : "text-zinc-400 hover:bg-white/8"
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        {v.is_internal === null && (
                          <div className="text-[11px] text-amber-400/80 mt-1">confirm</div>
                        )}
                      </td>

                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() =>
                              patchVendor(v, { tin_or_trn: value }, `Saved ${v.canonical_name}.`)
                            }
                            disabled={!dirty || savingId === v.id}
                            className={SMALL_BUTTON + " disabled:opacity-30"}
                            title="Save"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          {mergeFrom && mergeFrom.id !== v.id ? (
                            <button onClick={() => doMerge(v)} className={PRIMARY_BUTTON + " px-2.5 py-1 text-xs"}>
                              Merge into
                            </button>
                          ) : (
                            <button
                              onClick={() => setMergeFrom(v)}
                              disabled={!!mergeFrom}
                              className={SMALL_BUTTON + " disabled:opacity-30"}
                              title="Same company as another row?"
                            >
                              <Merge className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={T_CAPTION + " mt-4 leading-relaxed"}>
          <strong className="text-zinc-400">Own company</strong> means Sushi ZEN&rsquo;s own
          kitchen, warehouse or outlets. Their deliveries are internal transfers, not
          purchases — counting one as a cost would charge it twice, because the kitchen
          already booked it when it bought the goods. They carry no tax number, which is
          correct.
          <br />
          <strong className="text-zinc-400">Merge</strong> two rows when they are the same
          company spelled differently. The absorbed row is deactivated, not deleted.
        </div>
      </div>
    </div>
  );
}
