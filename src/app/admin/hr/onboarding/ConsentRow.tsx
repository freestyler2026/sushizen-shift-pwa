"use client";

import { useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { SMALL_BUTTON, T_LABEL } from "@/lib/ui-tokens";
import SignaturePad from "@/components/SignaturePad";

export type ConsentItem = {
  id: string;
  item_label: string;
  status: string;
  notes: string;
  verified_by: string;
};

async function errorText(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data && (data as { detail?: string }).detail) || `HTTP ${res.status}`;
}

/**
 * The property deduction authorization: the employee signs it on HR's screen.
 * There is no status menu and no "Mark verified" — HR cannot tick it or mark it
 * N/A, and onboarding does not complete without it (owner, 2026-11-22). It is
 * what lets clearance deduct an unreturned uniform, key or device.
 */
export default function ConsentRow({ onboardingId, item, onUpdated }: { onboardingId: string; item: ConsentItem; onUpdated: (u: ConsentItem) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [employee, setEmployee] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setOpen(true);
    setErr("");
    const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/${onboardingId}/property-consent`, {
      headers: getAuthHeaders(getAuth()),
    });
    if (!res.ok) { setErr(await errorText(res)); return; }
    const d = await res.json();
    setText(d.text || "");
    setEmployee(d.staff_name || "");
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/${onboardingId}/property-consent`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ typed_name: name, signature }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      const d = await res.json();
      onUpdated({ ...item, status: "verified", verified_by: d?.signed?.witnessed_by || item.verified_by,
        notes: `Signed by the employee${d?.signed?.witnessed_by ? `, witnessed by ${d.signed.witnessed_by}` : ""}` });
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const signed = item.status === "verified";
  return (
    <div className={`rounded-xl border p-3 ${signed ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}
      data-testid="property-consent-row">
      <div className="flex items-start gap-2">
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${signed ? "bg-emerald-400" : "bg-amber-400"}`} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={signed ? "text-emerald-400 text-sm font-medium" : "text-sm font-medium text-white"}>{item.item_label}</span>
            {!signed && !open && (
              <button className={`${SMALL_BUTTON} text-amber-200`} onClick={() => void start()}>Employee signs</button>
            )}
          </div>
          <p className="text-xs text-zinc-400">
            {signed
              ? (item.notes || "Signed by the employee.")
              : "Signed by the employee on this screen. It cannot be ticked or marked N/A, and onboarding does not complete without it."}
          </p>
          {open && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-200">{text || "Loading…"}</pre>
              <label className="block space-y-1">
                <span className={T_LABEL}>Employee types their full name{employee ? `: ${employee}` : ""}</span>
                <input aria-label="Employee full name" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-500/50" />
              </label>
              <SignaturePad onChange={setSignature} />
              {err && <p className="text-xs text-red-400">{err}</p>}
              <div className="flex justify-end gap-2">
                <button className={SMALL_BUTTON} onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                <button className={`${SMALL_BUTTON} text-emerald-300`} onClick={() => void submit()} disabled={busy || !name.trim() || !signature}>
                  {busy ? "Saving…" : "Save signed authorization"}
                </button>
              </div>
            </div>
          )}
          {!open && err && <p className="text-xs text-red-400">{err}</p>}
        </div>
      </div>
    </div>
  );
}
