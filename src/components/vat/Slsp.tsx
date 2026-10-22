"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, SMALL_BUTTON, TABLE_HEADER, TABLE_ROW, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";

/* Summary List of Sales and Purchases as BIR RELIEF DAT files (VAT plan 5-3).
   Backend: app/vat_slsp.py, app/vat_seller_registry.py —
   GET /api/admin/vat/slsp, GET /api/admin/vat/slsp/download,
   GET|PUT /api/admin/vat/taxpayer-profile, PUT /api/admin/vat/seller-registry,
   POST /api/admin/vat/seller-registry/read. */

type Money = string;
interface Profile {
  tin: string; rdo_code: string; registered_name: string; last_name: string; first_name: string; middle_name: string;
  trade_name: string; address1: string; address2: string; fiscal_month_end: number;
  saved: boolean; updated_by: string | null; updated_at: string | null; missing: string[];
}
interface SaleMonth { month: string; exempt: Money; taxable: Money; tax: Money }
interface PurchaseLine { tin: string; name: string; documents: number }
interface PurchaseMonth { month: string; lines: PurchaseLine[]; exempt: Money; services: Money; other: Money; capital: Money;
  tax: Money; creditable: Money; non_creditable: Money }
interface Check { ok: boolean; what: string; lists?: Money; return?: Money; difference?: Money; note?: string }
interface Supplier { tin: string; name: string; documents: number; address: string; from: string;
  photos: { source: string; source_id: string }[] }
interface Build {
  year: number; quarter: number; owner_tin: string; profile: Profile; sales: SaleMonth[]; purchases: PurchaseMonth[];
  checks: Check[]; no_address: Supplier[]; address_to_check: Supplier[];
  tin_merged: { listed_as: string; documents: number; readings: { tin: string; documents: number }[] }[];
  not_listed: Record<string, { documents: number; amount: Money; examples: { vendor: string | null; date: string }[] }>;
  blocking: { S: string[]; P: string[] }; ready: { S: boolean; P: boolean }; files: string[]; can_manage: boolean;
}

const PROFILE_FIELDS: [keyof Profile, string, string][] = [
  ["tin", "TIN (9 digits)", "457994635"],
  ["rdo_code", "RDO code", "3 digits, on the COR"],
  ["registered_name", "Registered name (a company)", "leave empty for a sole proprietor"],
  ["last_name", "Last name (proprietor)", ""],
  ["first_name", "First name", ""],
  ["middle_name", "Middle name", ""],
  ["trade_name", "Trade name", ""],
  ["address1", "Registered address, line 1", "street, barangay"],
  ["address2", "Registered address, line 2", "city, ZIP"],
];

function peso(v: Money | number | null | undefined): string {
  const n = Number(v || 0);
  const s = `₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `−${s}` : s;
}

function monthName(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function photoHref(p: { source: string; source_id: string }): string | null {
  return p.source === "drive_invoices" ? `/admin/procurement/invoices?city=manila&invoice=${p.source_id}` : null;
}

export default function Slsp({ year, quarter }: { year: number; quarter: number }) {
  const [data, setData] = useState<Build | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const [addr, setAddr] = useState<Record<string, { name: string; address: string }>>({});
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError("");
    setData((d) => (d && (d.year !== year || d.quarter !== quarter) ? null : d));
    try {
      const res = await fetch(`/api/admin/vat/slsp?year=${year}&quarter=${quarter}`, { headers: getAuthHeaders(getAuth()) });
      const body = await res.json().catch(() => null);
      if (my !== seq.current) return;
      if (!res.ok) { setData(null); setError(body?.detail || `Could not build the lists (HTTP ${res.status}).`); return; }
      setData(body);
      setProfile(body.profile);
    } catch {
      if (my === seq.current) setError("Network error building the lists.");
    }
  }, [year, quarter]);

  useEffect(() => { setNote(""); setEditProfile(false); setAddr({}); load(); }, [load]);

  const send = async (key: string, url: string, method: string, body?: unknown): Promise<unknown | null> => {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(url, {
        method, headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) { setError(b?.detail || `Failed (HTTP ${res.status}).`); return null; }
      return b;
    } catch {
      setError("Network error.");
      return null;
    } finally { setBusy(""); }
  };

  const saveProfile = async () => {
    if (!profile) return;
    const r = await send("profile", "/api/admin/vat/taxpayer-profile", "PUT", profile);
    if (r) { setEditProfile(false); setNote("Taxpayer details saved."); await load(); }
  };

  const saveSupplier = async (s: Supplier) => {
    const v = addr[s.tin] || { name: s.name, address: s.address };
    const r = await send(`save-${s.tin}`, "/api/admin/vat/seller-registry", "PUT", { tin: s.tin, name: v.name, address: v.address });
    if (r) { setNote(`${v.name || s.tin}: address saved.`); setAddr((a) => { const n = { ...a }; delete n[s.tin]; return n; }); await load(); }
  };

  const readSupplier = async (s: Supplier) => {
    const r = (await send(`read-${s.tin}`, `/api/admin/vat/seller-registry/read?year=${year}&quarter=${quarter}&tin=${s.tin}`, "POST")) as
      { address?: string } | null;
    if (r) { setNote(`${s.name || s.tin}: read “${r.address}” from the photo. Check it below.`); await load(); }
  };

  const download = async (kind: "S" | "P" | "all") => {
    setBusy(`dl-${kind}`);
    setError("");
    try {
      const res = await fetch(`/api/admin/vat/slsp/download?year=${year}&quarter=${quarter}&kind=${kind}`, { headers: getAuthHeaders(getAuth()) });
      if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.detail || `Download failed (HTTP ${res.status}).`); return; }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `SLSP_${year}Q${quarter}.zip`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setBusy(""); }
  };

  const input = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white";

  return (
    <section id="slsp" className={`${GLASS_CARD} p-4`}>
      <h2 className={T_SECTION}>Summary List of Sales and Purchases</h2>
      <p className={T_CAPTION}>
        Six BIR RELIEF files for {year} Q{quarter}: sales and purchases, one per month (RMO 4-2003), due with the 2550Q.
        Run them through BIR&apos;s RELIEF validation module before sending.
      </p>
      {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
      {note && <p className="mt-2 text-[12px] text-emerald-300">{note}</p>}
      {!data && !error && <p className={`${T_BODY} mt-2`}>Building the lists… (a few seconds)</p>}

      {data && (
        <>
          {/* What stands between this page and the files */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(["S", "P"] as const).map((k) => (
              <div key={k} className="rounded-xl border border-white/8 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {data.ready[k] ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                  <span className="font-semibold text-white">{k === "S" ? "Sales" : "Purchases"}</span>
                  <span className={T_CAPTION}>{data.ready[k] ? "ready to download" : "not ready"}</span>
                </div>
                {data.blocking[k].length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[12px] text-amber-200">
                    {data.blocking[k].map((b) => <li key={b}>{b}</li>)}
                  </ul>)}
                <button className={`${SMALL_BUTTON} mt-2`} disabled={!data.ready[k] || !!busy} onClick={() => download(k)}>
                  <Download className="mr-1 inline h-3.5 w-3.5" />{k === "S" ? "Sales files" : "Purchase files"} (3 + check workbook)
                </button>
              </div>))}
          </div>

          {/* Taxpayer header */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Taxpayer (the file header)</h3>
              {data.can_manage && !editProfile && (
                <button className={SMALL_BUTTON} onClick={() => { setProfile(data.profile); setEditProfile(true); }}>
                  {data.profile.saved ? "Edit" : "Check and save"}
                </button>)}
            </div>
            <p className={T_CAPTION}>
              {data.profile.saved
                ? `Saved by ${data.profile.updated_by} · ${(data.profile.updated_at || "").slice(0, 10)}`
                : "Suggested from what foodpanda prints on our invoices — check it against the Certificate of Registration (BIR Form 2303) and save."}
            </p>
            {!editProfile && (
              <p className="mt-1 text-[12px] text-zinc-300">
                TIN {data.profile.tin || "—"} · RDO {data.profile.rdo_code || "—"} ·{" "}
                {data.profile.registered_name || [data.profile.last_name, data.profile.first_name, data.profile.middle_name].filter(Boolean).join(", ") || "—"}
                {data.profile.trade_name ? ` · ${data.profile.trade_name}` : ""} ·{" "}
                {[data.profile.address1, data.profile.address2].filter(Boolean).join(", ") || "no address"}
              </p>)}
            {editProfile && profile && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PROFILE_FIELDS.map(([k, label, hint]) => (
                  <label key={k} className="text-[12px] text-zinc-400">
                    {label}
                    <input className={input} value={String(profile[k] ?? "")} placeholder={hint}
                      onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
                  </label>))}
                <label className="text-[12px] text-zinc-400">
                  Fiscal month end (12 = calendar year)
                  <input className={input} inputMode="numeric" value={String(profile.fiscal_month_end)}
                    onChange={(e) => setProfile({ ...profile, fiscal_month_end: Number(e.target.value) || 12 })} />
                </label>
                <div className="flex items-end gap-2">
                  <button className={SMALL_BUTTON} disabled={busy === "profile"} onClick={saveProfile}>Save</button>
                  <button className={SMALL_BUTTON} onClick={() => setEditProfile(false)}>Cancel</button>
                </div>
              </div>)}
          </div>

          {/* Month by month */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className={TABLE_HEADER}>
                <th className="text-left">Month</th><th className="text-right">Sales, taxable</th><th className="text-right">Exempt</th>
                <th className="text-right">Output tax</th><th className="text-right">Suppliers</th><th className="text-right">Input tax</th>
              </tr></thead>
              <tbody>
                {data.sales.map((s, i) => {
                  const p = data.purchases[i];
                  return (
                    <tr key={s.month} className={TABLE_ROW}>
                      <td className="py-1.5 text-zinc-200">{monthName(s.month)}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-200">{peso(s.taxable)}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-200">{peso(s.exempt)}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{peso(s.tax)}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-200">{p?.lines.length ?? 0}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{peso(p?.tax)}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
          <p className={`${T_CAPTION} mt-1`}>
            Sales are one END CONSUMER line a month: the POS does not record a buyer&apos;s TIN. A sale to a business that
            must be itemised (a regular buyer, or ₱100,000 or more in one sale) has to be added by hand.
          </p>

          {/* Against the 2550Q */}
          <div className="mt-3 space-y-1">
            {data.checks.map((c) => (
              <div key={c.what} className={`flex flex-wrap items-baseline gap-x-2 text-[12px] ${c.ok ? "text-zinc-400" : "text-amber-200"}`}>
                {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 self-center text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 self-center" />}
                <span>{c.what}</span>
                {c.lists !== undefined && <span className="tabular-nums">lists {peso(c.lists)} · 2550Q {peso(c.return)}{c.ok ? "" : ` · differs ${peso(c.difference)}`}</span>}
                {c.note && <span className="text-zinc-500">{c.note}</span>}
              </div>))}
          </div>

          {/* Supplier addresses */}
          {(data.no_address.length > 0 || data.address_to_check.length > 0) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-white">Supplier addresses</h3>
              <p className={T_CAPTION}>
                The validation module refuses a purchase line without the supplier&apos;s address. Copy it from the
                supplier&apos;s invoice, or read it from the photo; a reading counts once a person saves it.
              </p>
              <div className="mt-2 space-y-2">
                {[...data.no_address.map((s) => ({ s, missing: true })), ...data.address_to_check.map((s) => ({ s, missing: false }))].map(({ s, missing }) => {
                  const v = addr[s.tin] || { name: s.name, address: s.address };
                  const photo = s.photos.map(photoHref).find(Boolean);
                  return (
                    <div key={s.tin} className="rounded-xl border border-white/8 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{s.name || "(no name read)"}</span>
                        <span className="tabular-nums text-zinc-400">TIN {s.tin}</span>
                        <span className={T_CAPTION}>{s.documents} document{s.documents === 1 ? "" : "s"}</span>
                        <span className={missing ? "text-amber-200 text-[12px]" : "text-sky-200 text-[12px]"}>
                          {missing ? "no address" : `read from ${s.from} — check`}
                        </span>
                        {photo && (
                          <a className="inline-flex items-center gap-1 text-[12px] text-violet-300 hover:text-violet-200" href={photo}>
                            Photo<ExternalLink className="h-3 w-3" />
                          </a>)}
                      </div>
                      {data.can_manage && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                          <input className={input} aria-label="Registered name" placeholder="registered name" value={v.name}
                            onChange={(e) => setAddr((a) => ({ ...a, [s.tin]: { ...v, name: e.target.value } }))} />
                          <input className={input} aria-label="Address as printed" placeholder="address as printed on the invoice" value={v.address}
                            onChange={(e) => setAddr((a) => ({ ...a, [s.tin]: { ...v, address: e.target.value } }))} />
                          <div className="flex gap-2">
                            <button className={SMALL_BUTTON} disabled={!!busy || !v.address.trim()} onClick={() => saveSupplier(s)}>
                              {missing ? "Save" : "Confirm"}
                            </button>
                            {missing && s.photos.length > 0 && (
                              <button className={SMALL_BUTTON} disabled={!!busy} onClick={() => readSupplier(s)}>
                                {busy === `read-${s.tin}` ? "Reading…" : "Read from photo"}
                              </button>)}
                          </div>
                        </div>)}
                    </div>);
                })}
              </div>
            </div>)}

          {/* What was merged and what cannot be listed */}
          {data.tin_merged.length > 0 && (
            <p className={`${T_CAPTION} mt-3`}>
              One supplier read with different TINs, listed once:{" "}
              {data.tin_merged.map((m) => `${m.listed_as} (${m.readings.map((r) => `${r.tin}×${r.documents}`).join(", ")})`).join("; ")}.
            </p>)}
          {Object.entries(data.not_listed).map(([why, v]) => (
            <p key={why} className={`${T_CAPTION} mt-1`}>
              Not listed — {why}: {v.documents} documents, {peso(v.amount)} (no input tax). The 2550Q still counts them in item 46.
            </p>))}
        </>
      )}
    </section>
  );
}
