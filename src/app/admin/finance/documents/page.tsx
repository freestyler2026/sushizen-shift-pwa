"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

interface FinDoc {
  id: number;
  source_label: string;
  city: string;
  doc_date: string | null;
  vendor_name: string;
  tin_or_trn: string;
  amount_total: number | null;
  currency: string;
  image_url: string;
  account_code: string;
  account_label: string | null;
  tax_line_no: number | null;
  tax_line_label: string | null;
  is_internal: boolean;
  confidence: string;
  classified_by: string;
  confirmed_by: string;
}

interface Account {
  account_code: string;
  label_en: string;
  pl_group: string;
}

type Tab = "unclassified" | "auto" | "confirmed" | "";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "unclassified", label: "Needs a decision", hint: "Nothing could be decided without guessing" },
  { key: "auto", label: "Decided by the system", hint: "Check these, then confirm" },
  { key: "confirmed", label: "Confirmed", hint: "A person decided; never overwritten" },
  { key: "", label: "All", hint: "" },
];

export default function FinDocumentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FinDoc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState<Tab>("unclassified");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Ffinance%2Fdocuments");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (tab) qs.set("status", tab);
      if (city) qs.set("city", city);
      qs.set("limit", "400");
      const [dRes, aRes] = await Promise.all([
        fetch(`/api/admin/finance/documents?${qs}`, { headers: getAuthHeaders(getAuth()) }),
        fetch(`/api/admin/finance/accounts`, { headers: getAuthHeaders(getAuth()) }),
      ]);
      if (!dRes.ok) throw new Error(`HTTP ${dRes.status}`);
      setRows((await dRes.json()).rows || []);
      if (aRes.ok) setAccounts((await aRes.json()).rows || []);
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load the ledger: ${e}` });
    } finally {
      setLoading(false);
    }
  }, [tab, city]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(path: string, label: string) {
    setBusy(label);
    setBanner(null);
    try {
      const qs = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await fetch(`/api/admin/finance/documents/${path}${qs}`, {
        method: "POST",
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBanner({
        kind: "ok",
        text:
          path === "register"
            ? `Read the source screens — ${d.created} new, ${d.updated} changed, ${d.unchanged} already current.`
            : `${d.by_vendor} decided by the supplier's default, ${d.by_category} by the category on the form, ${d.internal} internal transfers. ${d.left_for_a_person} left for a person.`,
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `${label} failed: ${e}` });
    } finally {
      setBusy("");
    }
  }

  async function confirmRow(d: FinDoc) {
    const code = picked[d.id] || d.account_code;
    if (!code) return;
    try {
      const res = await fetch(`/api/admin/finance/documents/${d.id}/confirm`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ account_code: code, teach_vendor: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setBanner({
        kind: "ok",
        text: j.vendor_taught
          ? `Confirmed. ${j.vendor_taught} will use this account from now on, so this question stops coming back.`
          : "Confirmed.",
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `${e instanceof Error ? e.message : e}` });
    }
  }

  const counts = useMemo(() => {
    const needs = rows.filter((r) => !r.account_code).length;
    const auto = rows.filter((r) => r.account_code && !r.confirmed_by).length;
    const done = rows.filter((r) => r.confirmed_by).length;
    return { needs, auto, done };
  }, [rows]);

  const money = (n: number | null, c: string) =>
    n == null ? "—" : `${c} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Filing Ledger</h1>
          <p className={T_BODY + " mt-1 max-w-3xl"}>
            One row per receipt, gathered from the screens staff already use. Nothing here
            changes those screens — this reads across them and records which account each
            receipt files under.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run("register", "Read sources")} disabled={!!busy} className={SMALL_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${busy === "Read sources" ? "animate-spin" : ""}`} />
            Read the source screens
          </button>
          <button onClick={() => run("classify", "Classify")} disabled={!!busy} className={SMALL_BUTTON}>
            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
            Decide what can be decided
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Needs a decision</div>
          <div className={KPI_VALUE + (counts.needs ? " text-amber-300" : "")}>{counts.needs}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Decided by the system</div>
          <div className={KPI_VALUE}>{counts.auto}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Confirmed</div>
          <div className={KPI_VALUE + (counts.done ? " text-emerald-300" : "")}>{counts.done}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Shown</div>
          <div className={KPI_VALUE}>{rows.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-violet-600 text-white"
                : "border border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto w-40">
          <SelectDark
            value={city}
            onChange={(v) => setCity(v)}
            options={[
              { value: "", label: "Both cities" },
              { value: "dubai", label: "Dubai" },
              { value: "manila", label: "Manila" },
            ]}
          />
        </div>
      </div>

      <div className={GLASS_CARD + " overflow-hidden p-0"}>
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            Nothing here. Try &ldquo;Read the source screens&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  <th className={TABLE_HEADER}>Date</th>
                  <th className={TABLE_HEADER}>Where it came from</th>
                  <th className={TABLE_HEADER}>Supplier / purpose</th>
                  <th className={TABLE_HEADER + " text-right"}>Amount</th>
                  <th className={TABLE_HEADER}>Account</th>
                  <th className={TABLE_HEADER}>Files under</th>
                  <th className={TABLE_HEADER}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className={TABLE_ROW}>
                    <td className="py-2.5 text-sm text-zinc-400 tabular-nums whitespace-nowrap">
                      {d.doc_date || "—"}
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-zinc-500">{d.source_label}</span>
                      <span className="ml-1.5 text-[10px] uppercase text-zinc-600">{d.city}</span>
                    </td>
                    <td className="py-2.5 max-w-[280px]">
                      <div className="truncate text-sm text-zinc-200">{d.vendor_name || "—"}</div>
                      {d.image_url && (
                        <a
                          href={d.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
                        >
                          <ExternalLink className="h-3 w-3" />
                          receipt
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-sm text-zinc-200 tabular-nums whitespace-nowrap">
                      {money(d.amount_total, d.currency)}
                    </td>
                    <td className="py-2.5">
                      {d.is_internal ? (
                        <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300">
                          Internal transfer
                        </span>
                      ) : (
                        <div className="w-52">
                          <SelectDark
                            value={picked[d.id] ?? d.account_code}
                            onChange={(v) => setPicked((p) => ({ ...p, [d.id]: v }))}
                            options={[
                              { value: "", label: "— not decided —" },
                              ...accounts.map((a) => ({
                                value: a.account_code,
                                label: `${a.label_en} (${a.pl_group})`,
                              })),
                            ]}
                          />
                          {d.classified_by && !d.confirmed_by && (
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              decided by {d.classified_by}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-zinc-400">
                      {d.tax_line_no ? (
                        <>
                          <span className="tabular-nums text-zinc-300">{d.tax_line_no}</span>{" "}
                          {d.tax_line_label}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {d.confirmed_by ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                          {d.confirmed_by}
                        </span>
                      ) : d.is_internal ? null : (
                        <button
                          onClick={() => confirmRow(d)}
                          disabled={!(picked[d.id] ?? d.account_code)}
                          className={SMALL_BUTTON + " disabled:opacity-30"}
                        >
                          Confirm
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={T_CAPTION + " leading-relaxed"}>
        <strong className="text-zinc-400">Confirming teaches the supplier.</strong> The first
        time you decide what a supplier&rsquo;s receipts file under, that becomes their default
        and the question stops coming back for every future receipt from them.
        <br />
        <strong className="text-zinc-400">Nothing is guessed.</strong> A receipt the system
        cannot decide from the supplier or the category on the form is left blank rather than
        filed under something plausible.
      </div>
    </div>
  );
}
