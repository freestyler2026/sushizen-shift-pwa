"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, INPUT_COMPACT_CLASS, SMALL_BUTTON, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { manilaTime } from "@/lib/vat-format";

/* Deadline reminders for the quarterly VAT filing (VAT plan 6-3).
   Backend: app/vat_deadline.py — GET /api/admin/vat/reminders,
   POST|DELETE /api/admin/vat/reminders/recipients, PUT /api/admin/vat/reminders/discord,
   POST /api/admin/vat/reminders/test. */

interface Recipient { staff_name: string; discord_user_id: string; added_by: string }
interface Sent { year: number; quarter: number; kind: string; staff_name: string; status: string; detail: string; at: string }
interface Data { recipients: Recipient[]; next: { date: string; year: number; quarter: number; kind: string }[];
  recent: Sent[]; can_manage: boolean }

const KIND: Record<string, string> = { quarter_end: "quarter ends", due_minus_10: "10 days before the due date" };
const STATUS: Record<string, string> = { sent: "sent", failed: "failed — tried again next hour", sending: "sending",
  no_discord_id: "no Discord id — tried again once one is entered" };

export default function Reminders() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [ids, setIds] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vat/reminders", { headers: getAuthHeaders(getAuth()) });
      const b = await res.json().catch(() => null);
      if (!res.ok) { setError(b?.detail || `Could not load the reminders (HTTP ${res.status}).`); return; }
      setData({ recipients: b?.recipients || [], next: b?.next || [], recent: b?.recent || [], can_manage: !!b?.can_manage });
    } catch { setError("Network error loading the reminders."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (key: string, url: string, method: string, body?: unknown,
    ok?: string | ((b: { staff_name?: string } | null) => string)) => {
    setBusy(key);
    setError("");
    setNote("");
    try {
      const res = await fetch(url, {
        method, headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) { setError(b?.detail || `Failed (HTTP ${res.status}).`); return false; }
      if (ok) setNote(typeof ok === "function" ? ok(b) : ok);
      await load();
      return true;
    } catch { setError("Network error. Try again."); return false; } finally { setBusy(""); }
  };

  const input = INPUT_COMPACT_CLASS;

  return (
    <section id="reminders" className={`${GLASS_CARD} p-4`}>
      <h2 className={T_SECTION}><BellRing className="mr-1 inline h-4 w-4" />Deadline reminders</h2>
      <p className={T_CAPTION}>
        A Discord message on the quarter&apos;s last day and 10 days before the 2550Q is due, with what is still open:
        closing, invoices to check, Grab&apos;s invoice, the summary lists. Only the people listed here get it.
      </p>
      {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
      {note && <p className="mt-2 text-[12px] text-emerald-300">{note}</p>}
      {!data && !error && <p className={`${T_BODY} mt-2`}>Loading…</p>}
      {data && (
        <>
          {data.recipients.length === 0 && (
            <p className="mt-2 flex items-start gap-2 text-[12px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Nobody gets the reminders yet. Add the person who files the return.
            </p>)}
          <div className="mt-2 space-y-2">
            {data.recipients.map((r) => (
              <div key={r.staff_name} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 p-2 text-sm">
                <span className="font-medium text-white">{r.staff_name}</span>
                {r.discord_user_id
                  ? <span className={T_CAPTION}>Discord {r.discord_user_id}</span>
                  : <span className="text-[12px] text-amber-200">no Discord id — the reminder cannot reach them</span>}
                {data.can_manage && !r.discord_user_id && (
                  <span className="flex items-center gap-2">
                    <input className={`${input} w-48 tabular-nums`} aria-label={`Discord user id for ${r.staff_name}`}
                      placeholder="Discord user id (17-20 digits)" inputMode="numeric" value={ids[r.staff_name] || ""}
                      onChange={(e) => setIds((x) => ({ ...x, [r.staff_name]: e.target.value.replace(/\D/g, "") }))} />
                    <button className={SMALL_BUTTON} disabled={!!busy || !ids[r.staff_name]}
                      onClick={() => call(`id-${r.staff_name}`, "/api/admin/vat/reminders/discord", "PUT",
                        { staff_name: r.staff_name, discord_user_id: ids[r.staff_name] }, `${r.staff_name}: Discord id saved.`)}>
                      Save
                    </button>
                  </span>)}
                {data.can_manage && (
                  <button className="ml-auto text-[12px] text-zinc-400 hover:text-red-300" disabled={!!busy}
                    onClick={() => window.confirm(`Stop sending the VAT reminders to ${r.staff_name}?`)
                      && call(`rm-${r.staff_name}`, `/api/admin/vat/reminders/recipients?staff_name=${encodeURIComponent(r.staff_name)}`, "DELETE")}>
                    Remove
                  </button>)}
              </div>))}
          </div>
          {data.can_manage && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className={`${input} w-64`} aria-label="Staff name to add" placeholder="staff name, as in the Staff list"
                value={name} onChange={(e) => setName(e.target.value)} />
              <button className={SMALL_BUTTON} disabled={!!busy || !name.trim()}
                onClick={async () => { if (await call("add", "/api/admin/vat/reminders/recipients", "POST", { staff_name: name.trim() },
                  (b) => `${b?.staff_name || name.trim()} added.`)) setName(""); }}>
                Add
              </button>
              <button className={SMALL_BUTTON} disabled={!!busy}
                onClick={() => call("test", "/api/admin/vat/reminders/test", "POST", undefined, "Test sent to you on Discord.")}>
                Send me a test
              </button>
            </div>)}
          <p className={`${T_CAPTION} mt-3`}>
            Next: {data.next.map((n) => `${n.date} (${n.year} Q${n.quarter}, ${KIND[n.kind] || n.kind})`).join(" · ")}
          </p>
          {data.recent.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[12px] text-zinc-400">
              {data.recent.slice(0, 6).map((s) => (
                <li key={`${s.year}${s.quarter}${s.kind}${s.staff_name}`}>
                  {manilaTime(s.at)} · {s.year} Q{s.quarter} {KIND[s.kind] || s.kind} · {s.staff_name}: {STATUS[s.status] || s.status}
                </li>))}
            </ul>)}
        </>)}
    </section>
  );
}
