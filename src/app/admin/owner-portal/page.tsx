"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";

// HQ: franchise owner accounts. An owner sees only the stores ticked here, and
// sets their own password from a one-time link -- HQ never knows it. Sending a
// new link is also the reset: the old password and sessions stop working.

type Owner = {
  id: number; login_id: string; display_name: string; stores: string[]; active: boolean;
  has_password: boolean; invite_pending: boolean; invite_expires_at: string | null; last_login_at: string | null;
};
type StoreOpt = { code: string; name: string };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await getAuthHeaders()), ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

export default function OwnerPortalAdminPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ login_id: "", display_name: "", stores: [] as string[] });
  const [links, setLinks] = useState<Record<number, { url: string; expires: string }>>({});

  const load = useCallback(async () => {
    try {
      const d = await api("/api/admin/owner-portal/owners");
      setOwners(d.owners);
      setStores(d.stores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/admin/owner-portal/owners", { method: "POST", body: JSON.stringify(form) });
      setForm({ login_id: "", display_name: "", stores: [] });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create."); }
  }

  async function invite(o: Owner) {
    if (o.has_password && !confirm(`Send ${o.display_name} a new link? Their current password stops working.`)) return;
    try {
      const d = await api(`/api/admin/owner-portal/owners/${o.id}/invite`, { method: "POST" });
      setLinks((l) => ({ ...l, [o.id]: { url: `${window.location.origin}${d.path}`, expires: d.expires_at } }));
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the link."); }
  }

  async function toggle(o: Owner) {
    try {
      await api(`/api/admin/owner-portal/owners/${o.id}`, { method: "PATCH", body: JSON.stringify({ active: !o.active }) });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update."); }
  }

  const storeName = (c: string) => stores.find((s) => s.code === c)?.name || c;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Owner Portal accounts</h1>
        <p className="text-sm text-slate-400">Franchise owners sign in at <span className="font-mono">/owner</span> and see only their own stores.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form onSubmit={create} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
        <input placeholder="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input placeholder="Login ID" value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} required minLength={3}
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <div className="flex items-center gap-3 text-sm text-slate-200">
          {stores.map((s) => (
            <label key={s.code} className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.stores.includes(s.code)}
                onChange={(e) => setForm({ ...form, stores: e.target.checked ? [...form.stores, s.code] : form.stores.filter((x) => x !== s.code) })} />
              {s.name}
            </label>
          ))}
        </div>
        <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Add owner</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Login ID</th><th className="px-3 py-2">Stores</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last sign-in</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-2 text-white">{o.display_name}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{o.login_id}</td>
                <td className="px-3 py-2">{o.stores.map(storeName).join(", ")}</td>
                <td className="px-3 py-2">
                  {!o.active ? <span className="text-slate-500">Switched off</span>
                    : o.has_password ? <span className="text-emerald-300">Active</span>
                    : o.invite_pending ? <span className="text-amber-300">Waiting for password</span>
                    : <span className="text-slate-400">No link sent</span>}
                  {links[o.id] && (
                    <div className="mt-2 max-w-md space-y-1">
                      <p className="text-xs text-slate-400">Send this link to the owner (valid until {new Date(links[o.id].expires).toLocaleString()}):</p>
                      <div className="flex gap-2">
                        <input readOnly value={links[o.id].url} className="w-full rounded border border-white/10 bg-slate-900 px-2 py-1 font-mono text-xs text-white" />
                        <button type="button" onClick={() => navigator.clipboard.writeText(links[o.id].url)}
                          className="rounded border border-white/10 px-2 py-1 text-xs text-slate-200">Copy</button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-400">{o.last_login_at ? new Date(o.last_login_at).toLocaleString() : "—"}</td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                  <button onClick={() => invite(o)} disabled={!o.active}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40">
                    {o.has_password ? "Reset password link" : "Create password link"}
                  </button>
                  <button onClick={() => toggle(o)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
                    {o.active ? "Switch off" : "Switch on"}
                  </button>
                </td>
              </tr>
            ))}
            {owners.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No owner accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <CostSheet />
    </div>
  );
}

// ── HQ only: the store's month, line by line (FOCO ledger stage 1) ───────────
type SheetLine = { group: "sales" | "cost"; key: string; label: string; amount: number | null; source: string; status: string; note: string };
type Sheet = {
  store: string; month: string; period_from: string; period_to: string; lines: SheetLine[]; gaps: string[]; missing: string[];
  complete: boolean; net_sales: number; store_costs: number; ck_cost: number; food_cost: number; labor: number; profit_before_fees: number;
};
const SHEET_STORES = [{ code: "TAFT", name: "Taft" }, { code: "PAR", name: "Paranaque" }];
const FIRST_MONTH = "2026-10";

function sheetMonths(): string[] {
  const now = new Date(Date.now() + (new Date().getTimezoneOffset() + 8 * 60) * 60000);
  const last = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const out: string[] = [];
  for (let c = FIRST_MONTH; c <= last;) {
    out.push(c);
    const [y, m] = c.split("-").map(Number);
    c = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out.reverse();
}

const peso = (n: number | null) => (n == null ? "—" : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS_STYLE: Record<string, string> = {
  actual: "text-slate-400", unreviewed: "text-amber-300", estimate: "text-sky-300", missing: "text-red-300",
};
const STATUS_TEXT: Record<string, string> = {
  actual: "Recorded", unreviewed: "Invoice not checked yet", estimate: "Estimate", missing: "Not in the OS",
};

function CostSheet() {
  const months = sheetMonths();
  const [store, setStore] = useState("TAFT");
  const [month, setMonth] = useState(months[0]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setSheet(null); setError("");
    api(`/api/admin/owner-portal/cost-sheet?store=${store}&month=${month}`)
      .then((d) => { if (live) setSheet(d); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => { live = false; };
  }, [store, month]);

  const pick = (on: boolean) => `rounded-lg border px-3 py-1.5 text-xs ${on ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`;
  const rows = (g: "sales" | "cost") => (sheet?.lines || []).filter((l) => l.group === g);

  return (
    <section className="space-y-4 border-t border-white/10 pt-6">
      <div>
        <h2 className="text-lg font-bold text-white">Store month sheet <span className="text-xs font-normal text-slate-400">HQ only</span></h2>
        <p className="text-sm text-slate-400">What the owner ledger will be built from: net sales and every store cost for the calendar month, with where each figure comes from. Owners do not see this page.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SHEET_STORES.map((s) => <button key={s.code} onClick={() => setStore(s.code)} className={pick(store === s.code)}>{s.name}</button>)}
        <span className="mx-1 h-5 w-px bg-white/10" />
        {months.map((m) => (
          <button key={m} onClick={() => setMonth(m)} className={pick(month === m)}>
            {new Date(`${m}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!sheet && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {sheet && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Net sales (VAT out)", sheet.net_sales], ["Store costs", sheet.store_costs],
              ["Profit before FOCO fees", sheet.profit_before_fees], ["CK goods (at CK cost)", sheet.ck_cost]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-400">{k}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">{peso(v as number)}</p>
              </div>
            ))}
          </div>
          {!sheet.complete && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Not final: {sheet.missing.length} cost line(s) are not in the OS, and some figures are estimates or unchecked invoices. {sheet.period_from} – {sheet.period_to}.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
                <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Source and detail</th></tr>
              </thead>
              <tbody>
                {(["sales", "cost"] as const).map((g) => (
                  <Fragment key={g}>
                    <tr className="border-t border-white/10 bg-white/[0.02]"><td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">{g === "sales" ? "Net sales" : "Store costs"}</td></tr>
                    {rows(g).map((l, i) => (
                      <tr key={`${g}-${i}`} className="border-t border-white/5 align-top">
                        <td className="px-3 py-2 text-white">{l.label}</td>
                        <td className="px-3 py-2 text-right text-white">{peso(l.amount)}</td>
                        <td className={`px-3 py-2 text-xs ${STATUS_STYLE[l.status] || ""}`}>{STATUS_TEXT[l.status] || l.status}</td>
                        <td className="px-3 py-2 text-xs text-slate-400"><span className="text-slate-300">{l.source}</span>{l.note ? ` — ${l.note}` : ""}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.gaps.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-slate-200">To check</p>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-400">{sheet.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
