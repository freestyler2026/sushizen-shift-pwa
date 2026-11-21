"use client";

/**
 * Leaver Returns — a store / CK manager records what a leaver hands back at the
 * kitchen: uniforms, knives, keys. The count issued and the count returned, not
 * a tick. Signed by the manager's own account, at a kitchen (the server checks
 * the location). The rest of clearance — laptop / phone, exit interview,
 * documents and the employee's signature — is HR's, at the office; nothing on
 * this screen clears the case (owner, 2026-11-22).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, hasChannelAccess } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";
import { GLASS_CARD, INPUT_CLASS, PRIMARY_BUTTON, T_CAPTION, T_LABEL, T_PAGE_TITLE, BADGE_SUCCESS, BADGE_WARNING } from "@/lib/ui-tokens";
import { getPosition, type ClearanceItem, type KitchenCase } from "@/lib/clearance-items";

function ReturnRow({ caseId, item, onSaved }: { caseId: string; item: ClearanceItem; onSaved: (cases: KitchenCase[]) => void }) {
  const [issued, setIssued] = useState(item.qty_issued != null ? String(item.qty_issued) : "");
  const [returned, setReturned] = useState(item.qty_returned != null ? String(item.qty_returned) : "");
  const [notes, setNotes] = useState(item.notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const short = issued !== "" && returned !== "" && Number(returned) < Number(issued);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const at = await getPosition();
      const data = await apiPost<{ cases?: KitchenCase[] }>(`/api/store/clearance-returns/${caseId}/${item.item_key}`,
        { qty_issued: issued, qty_returned: returned, notes, ...at });
      onSaved(data.cases || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">{item.label}</p>
        {item.status === "done" ? (
          <span className={BADGE_SUCCESS}>Recorded</span>
        ) : (
          <span className={BADGE_WARNING}>To record</span>
        )}
      </div>
      {item.status === "done" && (
        <p className={T_CAPTION}>
          {item.qty_returned} of {item.qty_issued} returned · {item.signed_by} · {item.sign_place}
          {item.unreturned > 0 && <span className="text-amber-300"> · {item.unreturned} not returned</span>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={T_LABEL}>Issued</span>
          <input className={INPUT_CLASS} inputMode="numeric" value={issued} aria-label={`${item.label} issued`}
            onChange={(e) => setIssued(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" />
        </label>
        <label className="space-y-1">
          <span className={T_LABEL}>Returned</span>
          <input className={INPUT_CLASS} inputMode="numeric" value={returned} aria-label={`${item.label} returned`}
            onChange={(e) => setReturned(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" />
        </label>
      </div>
      {short && (
        <input className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)}
          aria-label={`${item.label} notes`} placeholder="What was not returned, and why" />
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className={PRIMARY_BUTTON} disabled={busy || issued === "" || returned === ""} onClick={save}>
        {busy ? "Saving…" : item.status === "done" ? "Update" : "Record"}
      </button>
    </div>
  );
}

export default function LeaverReturnsPage() {
  const router = useRouter();
  const [cases, setCases] = useState<KitchenCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [city, setCity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet<{ cases?: KitchenCase[]; city?: string }>(`/api/store/clearance-returns${city ? `?city=${city}` : ""}`);
      setCases(data.cases || []);
      if (!city && data.city) setCity(data.city);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=/store/clearance-returns");
      return;
    }
    if (!hasChannelAccess("store_clearance_returns", ["view"], auth)) {
      setErr("You do not have Leaver Returns. Ask HQ to grant it under Role Management.");
      setLoading(false);
      return;
    }
    void load();
  }, [load, router]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className={T_PAGE_TITLE}>Leaver Returns</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Record what a leaver hands back at the kitchen. Count what was issued and what came back.
          Laptop, phone, exit interview and the final signature are done by HR at the office.
        </p>
      </div>
      {loading && <p className={T_CAPTION}>Loading…</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}
      {!loading && !err && cases.length === 0 && (
        <div className={`${GLASS_CARD} p-5 text-sm text-zinc-400`}>No leaver is waiting for kitchen returns.</div>
      )}
      {cases.map((c) => (
        <section key={c.id} className={`${GLASS_CARD} p-4 space-y-3`}>
          <div>
            <p className="text-base font-semibold text-white">{c.employee_name}</p>
            <p className={T_CAPTION}>
              {[c.department, c.position].filter(Boolean).join(" · ")}
              {c.last_working_day ? ` · Last day ${c.last_working_day}` : ""}
              {c.pending > 0 ? ` · ${c.pending} to record` : " · all recorded"}
            </p>
          </div>
          {c.items.map((it) => (
            <ReturnRow key={it.id + it.status + (it.qty_returned ?? "")} caseId={c.id} item={it} onSaved={setCases} />
          ))}
        </section>
      ))}
    </main>
  );
}
