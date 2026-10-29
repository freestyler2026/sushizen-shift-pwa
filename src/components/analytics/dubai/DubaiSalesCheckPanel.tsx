"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { TAB_ACTIVE, TAB_INACTIVE } from "@/lib/ui-tokens";

type CheckRow = {
  date: string;
  brand: string;
  os_net: number | null;
  os_orders: number | null;
  urbanpiper_net: number | null;
  urbanpiper_orders: number | null;
  difference: number | null;
  verdict: string;
  fix_in: "drive" | "check" | "urbanpiper";
  cause: string;
};

type CheckResult = {
  ok: boolean;
  from: string;
  to: string;
  compared: number;
  matched: number;
  to_fix_in_drive: number;
  rows: CheckRow[];
  rule: string;
};

/** The first day both Dubai reports exist for every brand. */
const SINCE = "2026-03-14";

const aed = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cell(net: number | null, orders: number | null) {
  if (net === null) return <span className="text-zinc-500">none</span>;
  return (
    <span>
      {aed(net)} <span className="text-zinc-500">({orders ?? 0})</span>
    </span>
  );
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs tabular-nums">
        <thead className="text-zinc-400">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Date</th>
            <th className="py-1.5 pr-3 font-medium">Brand</th>
            <th className="py-1.5 pr-3 text-right font-medium">OS (orders)</th>
            <th className="py-1.5 pr-3 text-right font-medium">UrbanPiper (orders)</th>
            <th className="py-1.5 pr-3 text-right font-medium">OS − UrbanPiper</th>
            <th className="py-1.5 font-medium">Cause</th>
          </tr>
        </thead>
        <tbody className="text-zinc-200">
          {rows.map((r) => (
            <tr key={`${r.date}-${r.brand}`} className="border-t border-white/5 align-top">
              <td className="py-1.5 pr-3 whitespace-nowrap">{r.date}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{r.brand}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{cell(r.os_net, r.os_orders)}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{cell(r.urbanpiper_net, r.urbanpiper_orders)}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{aed(r.difference)}</td>
              <td className="py-1.5 text-zinc-300">{r.cause}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dubai sales the OS saved against UrbanPiper's revenue-by-location report,
 *  brand by brand and day by day. A day where they disagree is wrong in one of
 *  the exports, and only re-exporting from UrbanPiper fixes it. */
export default function DubaiSalesCheckPanel() {
  const [range, setRange] = useState<"recent" | "since">("recent");
  const [data, setData] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const qs = range === "since" ? `?date_from=${SINCE}` : "";
    apiGet<CheckResult>(`/api/admin/pos/dubai-sales-check${qs}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the check."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const drive = (data?.rows || []).filter((r) => r.fix_in === "drive");
  const check = (data?.rows || []).filter((r) => r.fix_in === "check");
  const upSide = (data?.rows || []).filter((r) => r.fix_in === "urbanpiper");
  const clean = data && drive.length === 0 && check.length === 0;

  return (
    <section
      className={`mb-3 space-y-3 rounded-xl border px-4 py-3 text-xs ${
        clean ? "border-emerald-700/30 bg-emerald-950/10" : "border-amber-700/40 bg-amber-950/20"
      }`}
      aria-label="Sales check against UrbanPiper"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Sales check against UrbanPiper</div>
          <div className="text-zinc-400">
            {data
              ? `${data.from} to ${data.to}: ${data.matched} of ${data.compared} brand-days agree`
              : loading ? "Checking…" : ""}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" className={range === "recent" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setRange("recent")} disabled={loading}>
            Last 45 days
          </button>
          <button type="button" className={range === "since" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setRange("since")} disabled={loading}>
            Since 14 Mar
          </button>
        </div>
      </div>

      {error ? <div className="text-rose-300">{error}</div> : null}

      {clean ? (
        <div className="text-emerald-200">Every brand-day matches UrbanPiper. Nothing to export again.</div>
      ) : null}

      {drive.length > 0 ? (
        <div className="space-y-1.5">
          <div className="font-semibold text-amber-200">
            Export again from UrbanPiper — {drive.length} brand-day{drive.length === 1 ? "" : "s"}
          </div>
          <div className="text-amber-100/80">
            In UrbanPiper, export Order transactions for the brand and day below and put the file in the Dubai POS Drive folder.
            The daily sync loads it and saves the day with every brand; it drops off this list the next day.
          </div>
          <CheckTable rows={drive} />
        </div>
      ) : null}

      {check.length > 0 ? (
        <div className="space-y-1.5">
          <div className="font-semibold text-amber-200">Look at both exports — {check.length}</div>
          <CheckTable rows={check} />
        </div>
      ) : null}

      {upSide.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-zinc-400">
            UrbanPiper&apos;s report is wrong or missing — {upSide.length} (the OS figure is right; nothing to do in Drive)
          </summary>
          <div className="mt-1.5"><CheckTable rows={upSide} /></div>
        </details>
      ) : null}

      {data ? <div className="text-zinc-500">{data.rule}</div> : null}
    </section>
  );
}
