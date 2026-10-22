"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Lock, Unlock } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, SMALL_BUTTON, TABLE_HEADER, TABLE_ROW, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";

/* The quarter's BIR Form 2550Q, item by item, and closing the quarter (VAT plan 5-1 / 5-4).
   Backend: GET /api/admin/vat/2550q, POST /api/admin/vat/close, POST /api/admin/vat/reopen
   (app/vat_2550q.py). Nothing is filed from here: a person copies the items into eBIRForms. */

interface Item { item: string; label: string; A: string | null; B: string | null }
interface Return2550Q {
  year: number; quarter: number; from: string; to: string; closed: boolean;
  closed_by?: string; closed_at?: string; carried_over_note: string; items: Item[];
  warnings: string[]; form: string; deadline: string;
}

// The lines a person checks first: totals and what is payable.
const TOTALS = new Set(["35", "49", "55", "56", "21"]);

function amount(v: string | null): string {
  if (v === null) return "";
  const n = Number(v);
  const s = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The form writes an excess as a figure in brackets.
  return n < 0 ? `(${s})` : s;
}

export default function Form2550Q({ year, quarter, canManage, quarterEnded }: {
  year: number; quarter: number; canManage: boolean; quarterEnded: boolean;
}) {
  const [data, setData] = useState<Return2550Q | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError("");
    setData((d) => (d && (d.year !== year || d.quarter !== quarter) ? null : d));
    try {
      const res = await fetch(`/api/admin/vat/2550q?year=${year}&quarter=${quarter}`, { headers: getAuthHeaders(getAuth()) });
      const body = await res.json().catch(() => null);
      if (my !== seq.current) return;
      if (!res.ok) { setData(null); setError(body?.detail || `Could not load the 2550Q (HTTP ${res.status}).`); return; }
      setData(body);
    } catch {
      if (my === seq.current) setError("Network error loading the 2550Q.");
    }
  }, [year, quarter]);

  useEffect(() => { setReopening(false); setReason(""); load(); }, [load]);

  const close = async () => {
    if (!data) return;
    const left = data.warnings.length ? `\n\nStill open:\n• ${data.warnings.join("\n• ")}` : "";
    if (!window.confirm(`Close ${year} Q${quarter}? The 2550Q figures are frozen as they are now and are not recomputed.${left}\n\nTo change them later, reopen the quarter with a reason.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vat/close", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter }),
      });
      if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.detail || "Could not close the quarter."); return; }
      await load();
    } finally { setBusy(false); }
  };

  const reopen = async () => {
    if (reason.trim().length < 5) { setError("Say why the quarter is reopened (a few words)."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vat/reopen", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter, reason: reason.trim() }),
      });
      if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.detail || "Could not reopen the quarter."); return; }
      setReopening(false); setReason("");
      await load();
    } finally { setBusy(false); }
  };

  return (
    <section id="form-2550q" className={`${GLASS_CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={T_SECTION}>BIR Form 2550Q</h2>
          <p className={T_CAPTION}>
            {year} Q{quarter} · due {data?.deadline || "—"} · copy these into eBIRForms; nothing is filed from here.
          </p>
        </div>
        {data && (data.closed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] text-emerald-200">
            <Lock className="h-3.5 w-3.5" />Closed by {data.closed_by} · {(data.closed_at || "").slice(0, 16).replace("T", " ")} UTC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[12px] text-amber-200">
            <Unlock className="h-3.5 w-3.5" />Not closed · computed now
          </span>
        ))}
      </div>

      {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
      {!data && !error && <p className={`${T_BODY} mt-2`}>Loading the 2550Q…</p>}

      {data && (
        <>
          {data.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {data.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[12px] text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
                </li>))}
            </ul>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className={TABLE_HEADER}>
                  <th className="w-12 text-left">Item</th><th className="text-left">Line</th>
                  <th className="text-right">A · Sales / Purchases</th><th className="text-right">B · Tax</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const strong = TOTALS.has(r.item);
                  return (
                    <tr key={r.item} className={`${TABLE_ROW} ${r.item === "15" ? "border-t border-white/15" : ""}`}>
                      <td className="py-1.5 tabular-nums text-zinc-400">{r.item}</td>
                      <td className={`py-1.5 ${strong ? "font-semibold text-white" : "text-zinc-300"}`}>{r.label}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-200">{amount(r.A)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${strong ? "font-semibold text-white" : "text-zinc-200"}`}>{amount(r.B)}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>

          <p className={`${T_CAPTION} mt-2`}>
            Item 36 (carried over): {data.carried_over_note}. Figures in brackets are excess input tax.
            Item numbers are the {data.form}.
            {data.closed ? " The sections above are recomputed live; the frozen figures are these." : ""}
          </p>

          {canManage && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!data.closed && (quarterEnded ? (
                <button className={SMALL_BUTTON} disabled={busy} onClick={close}>Close {year} Q{quarter}</button>
              ) : (
                <span className={T_CAPTION}>Close becomes available after {data.to}.</span>
              ))}
              {data.closed && !reopening && (
                <button className={SMALL_BUTTON} disabled={busy} onClick={() => setReopening(true)}>Reopen…</button>
              )}
              {data.closed && reopening && (
                <span className="flex flex-wrap items-center gap-2">
                  <input aria-label="Why the quarter is reopened" placeholder="why (e.g. amended return for a late invoice)"
                    className="w-72 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
                    value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className={SMALL_BUTTON} disabled={busy} onClick={reopen}>Reopen</button>
                  <button className={SMALL_BUTTON} disabled={busy} onClick={() => { setReopening(false); setReason(""); }}>Cancel</button>
                </span>
              )}
              <span className={T_CAPTION}>
                {data.closed ? "Reopening keeps the close and your reason on record. Close again once the figures are right."
                  : "Close after the return is filed: the next quarter carries over item 56 from it."}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
