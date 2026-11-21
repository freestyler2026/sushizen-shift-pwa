"use client";

/**
 * Clearance items, approvals, leavers without a case, and the approver list.
 *
 * A Manila leaver was marked SEPARATED with no case and sent to the CK to have a
 * paper signed; a Dubai case went Draft -> Payment Done in 13 seconds by one
 * person. The rules are on the server (app/db_clearance.py): this shows what is
 * left, lets HR sign the office items at the office, and says whose approval
 * is next (owner, 2026-11-22).
 */

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import SignaturePad from "@/components/SignaturePad";
import {
  getPosition,
  STEP_NAMES,
  type ClearanceItem,
  type ClearanceItemsResponse,
} from "@/lib/clearance-items";
import {
  BADGE_SUCCESS,
  BADGE_WARNING,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
  TEXTAREA_CLASS,
  GLASS_CARD,
} from "@/lib/ui-tokens";

type CaseLike = {
  id: string;
  city: string;
  employee_name: string;
  staff_name?: string;
  current_stage: number;
  status: string;
  separation_type: string;
  last_working_day?: string | null;
};

/** Last day and separation type, while the case is in Draft. A case that
 *  opened by itself has no last day yet, and approval waits for it. */
function CaseDetails({ c, onSaved }: { c: CaseLike; onSaved: () => void }) {
  const [lwd, setLwd] = useState(c.last_working_day ? c.last_working_day.slice(0, 10) : "");
  const [type, setType] = useState(c.separation_type || "resignation");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = lwd !== (c.last_working_day ? c.last_working_day.slice(0, 10) : "") || type !== c.separation_type;

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await apiPatch(`/api/admin/hr/clearance/${c.id}/details`, { last_working_day: lwd, separation_type: type });
      onSaved();
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-3 ${c.last_working_day ? "border-white/10 bg-white/5" : "border-amber-500/40 bg-amber-500/10"}`}>
      <label className="space-y-1"><span className={T_LABEL}>Last working day{c.last_working_day ? "" : " (needed)"}</span>
        <input type="date" className={INPUT_CLASS} aria-label="Last working day" value={lwd} onChange={(e) => setLwd(e.target.value)} /></label>
      <label className="space-y-1"><span className={T_LABEL}>Separation type</span>
        <select className={SELECT_CLASS} aria-label="Separation type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="resignation">Resignation</option>
          <option value="termination">Termination</option>
          <option value="end_of_contract">End of contract</option>
        </select></label>
      <div className="flex items-end gap-2">
        <button className={SECONDARY_BUTTON} disabled={busy || !dirty || !lwd} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}

function postJson(url: string, body: unknown) {
  return apiPost<Record<string, unknown>>(url, body);
}

function money(n: number | null | undefined, cur: string) {
  if (n === null || n === undefined) return "****";
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ItemForm({ c, item, data, onSigned }: {
  c: CaseLike;
  item: ClearanceItem;
  data: ClearanceItemsResponse;
  onSigned: (d: ClearanceItemsResponse) => void;
}) {
  const [issued, setIssued] = useState(item.qty_issued != null ? String(item.qty_issued) : "");
  const [returned, setReturned] = useState(item.qty_returned != null ? String(item.qty_returned) : "");
  const [value, setValue] = useState(item.unit_value != null ? String(item.unit_value) : "");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [letter, setLetter] = useState(false);
  const [companyId, setCompanyId] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const employee = c.staff_name || c.employee_name;

  async function sign() {
    setBusy(true);
    setErr("");
    try {
      // Manila office items are checked against the Back Office; Dubai's are not.
      let at: { lat?: number; lng?: number } = {};
      if (data.office_location_checked || item.where === "kitchen") {
        at = await getPosition();
      }
      const body: Record<string, unknown> = { ...at, notes };
      if (item.kind === "return") Object.assign(body, { qty_issued: issued, qty_returned: returned, unit_value: value });
      if (item.item_key === "EXIT_INTERVIEW") body.reason = reason;
      if (item.item_key === "DOCUMENTS") Object.assign(body, { resignation_letter: letter, company_id_returned: companyId });
      if (item.item_key === "EMPLOYEE_SIGN") Object.assign(body, { signed_name: signedName, signature });
      const out = await postJson(`/api/admin/hr/clearance/${c.id}/items/${item.item_key}`, body);
      onSigned(out as unknown as ClearanceItemsResponse);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const valued = item.item_key === "KEYS" || item.item_key === "DEVICE";
  const unreturnedItems = data.items.filter((i) => i.unreturned > 0);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
      {item.kind === "return" && (
        <div className={`grid gap-2 ${valued ? "grid-cols-3" : "grid-cols-2"}`}>
          <label className="space-y-1"><span className={T_LABEL}>Issued</span>
            <input className={INPUT_CLASS} inputMode="numeric" aria-label={`${item.label} issued`} value={issued}
              onChange={(e) => setIssued(e.target.value.replace(/[^0-9]/g, ""))} /></label>
          <label className="space-y-1"><span className={T_LABEL}>Returned</span>
            <input className={INPUT_CLASS} inputMode="numeric" aria-label={`${item.label} returned`} value={returned}
              onChange={(e) => setReturned(e.target.value.replace(/[^0-9]/g, ""))} /></label>
          {valued && (
            <label className="space-y-1"><span className={T_LABEL}>Value each (as issued)</span>
              <input className={INPUT_CLASS} inputMode="decimal" aria-label={`${item.label} value`} value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
          )}
        </div>
      )}
      {item.item_key === "EXIT_INTERVIEW" && (
        <label className="block space-y-1"><span className={T_LABEL}>Reason for leaving</span>
          <select className={SELECT_CLASS} aria-label="Reason for leaving" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose…</option>
            {data.exit_reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>
      )}
      {item.item_key === "DOCUMENTS" && (
        <div className="space-y-1 text-sm text-zinc-300">
          <label className="flex items-center gap-2"><input type="checkbox" checked={letter} onChange={(e) => setLetter(e.target.checked)} />
            Signed resignation letter received{c.separation_type !== "resignation" ? " (not needed for this separation type)" : ""}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={companyId} onChange={(e) => setCompanyId(e.target.checked)} />
            Company ID returned</label>
        </div>
      )}
      {item.item_key === "EMPLOYEE_SIGN" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
            <p className="font-medium text-white">The employee confirms:</p>
            {unreturnedItems.length === 0 ? (
              <p>Everything issued has been returned.</p>
            ) : (
              <ul className="list-disc pl-5">
                {unreturnedItems.map((i) => (
                  <li key={i.id}>{i.label}: {i.unreturned} not returned{i.deduction ? ` — ${money(i.deduction, data.currency)} deducted` : ""}</li>
                ))}
              </ul>
            )}
            <p className="mt-1">Deducted from final pay for property: <span className="font-semibold">{money(data.property_deduction, data.currency)}</span></p>
          </div>
          <label className="block space-y-1"><span className={T_LABEL}>Employee types their full name: {employee}</span>
            <input className={INPUT_CLASS} aria-label="Employee full name" value={signedName} onChange={(e) => setSignedName(e.target.value)} /></label>
          <SignaturePad onChange={setSignature} />
        </div>
      )}
      {item.item_key !== "EMPLOYEE_SIGN" && (
        <textarea className={TEXTAREA_CLASS} rows={2} aria-label={`${item.label} notes`} value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={item.item_key === "EXIT_INTERVIEW" ? "What the employee said" : "Notes (required if something was not returned)"} />
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className={PRIMARY_BUTTON} disabled={busy} onClick={sign}>
        {busy ? "Signing…" : item.status === "done" ? "Sign again" : "Sign"}
      </button>
    </div>
  );
}

function ItemRow({ c, item, data, canSign, onSigned }: {
  c: CaseLike;
  item: ClearanceItem;
  data: ClearanceItemsResponse;
  canSign: boolean;
  onSigned: (d: ClearanceItemsResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const details = (item.details || {}) as Record<string, unknown>;
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{item.label}</p>
          <p className={T_CAPTION}>
            {item.where === "kitchen" ? "Kitchen manager or HR, at a kitchen" : "HR only, at the office"}
          </p>
          {item.status === "done" && (
            <p className="mt-1 text-xs text-zinc-400">
              {item.kind === "return" && `${item.qty_returned} of ${item.qty_issued} returned · `}
              {typeof details.reason === "string" && `${details.reason} · `}
              {item.signed_by} · {item.sign_place}
              {item.signed_at && ` · ${new Date(item.signed_at).toLocaleString()}`}
            </p>
          )}
          {item.notes && <p className="text-xs text-zinc-500">{item.notes}</p>}
          {item.deduction_note && <p className="text-xs text-amber-300">{item.deduction_note}</p>}
          {!!item.deduction && <p className="text-xs text-rose-300">Deducted: {money(item.deduction, data.currency)}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {item.status === "done" ? <span className={BADGE_SUCCESS}>Signed</span> : <span className={BADGE_WARNING}>Pending</span>}
          {canSign && (
            <button className="text-xs text-violet-300 hover:text-violet-200" onClick={() => setOpen((o) => !o)}>
              {open ? "Close" : item.status === "done" ? "Change" : "Sign"}
            </button>
          )}
        </div>
      </div>
      {open && canSign && <ItemForm c={c} item={item} data={data} onSigned={(d) => { setOpen(false); onSigned(d); }} />}
    </li>
  );
}

export function ClearanceItemsSection({ c, onCaseChanged }: { c: CaseLike; onCaseChanged: () => void }) {
  const [data, setData] = useState<ClearanceItemsResponse | null>(null);
  const [err, setErr] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<ClearanceItemsResponse>(`/api/admin/hr/clearance/${c.id}/items`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load clearance items.");
    }
  }, [c.id]);

  // Reloaded when the stage moves, so "next approval" follows the case.
  useEffect(() => { void load(); }, [load, c.current_stage, c.status]);

  async function link() {
    setLinking(true);
    setErr("");
    try {
      await postJson(`/api/admin/hr/clearance/${c.id}/link`, { staff_name: linkName });
      onCaseChanged();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLinking(false);
    }
  }

  if (err && !data) return <p className="mt-3 text-sm text-red-400">{err}</p>;
  if (!data) return <p className={`mt-3 ${T_CAPTION}`}>Loading clearance…</p>;

  const isHr = (data.approval?.my_steps || []).includes("hr");
  const editable = c.status === "active" && c.current_stage === 0;
  const a = data.approval;

  return (
    <div className="mt-4 space-y-3" data-testid="clearance-items">
      <p className={T_SECTION}>Clearance</p>
      {editable && <CaseDetails c={c} onSaved={onCaseChanged} />}
      {!c.staff_name && c.status === "active" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 space-y-2">
          <p>This case was typed by name and is not linked to anyone on the staff list. Link it to the employee.</p>
          <div className="flex gap-2">
            <input className={INPUT_CLASS} aria-label="Staff name to link" placeholder="Name exactly as on the staff list"
              value={linkName} onChange={(e) => setLinkName(e.target.value)} />
            <button className={SECONDARY_BUTTON} disabled={linking || !linkName.trim()} onClick={link}>Link</button>
          </div>
        </div>
      )}
      <p className={T_CAPTION}>
        {data.complete
          ? "Every item is signed."
          : `${data.missing.length} to sign before HR can approve: ${data.missing.join("; ")}.`}
        {" "}
        {data.consent
          ? `Deduction authorization signed ${data.consent.signed_at ? new Date(data.consent.signed_at).toLocaleDateString() : ""}.`
          : "No signed deduction authorization: unreturned items are recorded but not deducted."}
      </p>
      {!editable && c.status === "active" && (
        <p className={T_CAPTION}>Approval has started. Return the case to Draft to change its clearance.</p>
      )}
      <ul className="space-y-2">
        {data.items.map((it) => (
          <ItemRow key={it.id + it.status + (it.signed_at || "")} c={c} item={it} data={data}
            canSign={editable && isHr}
            onSigned={(d) => { setData((prev) => ({ ...d, approval: prev?.approval })); onCaseChanged(); }} />
        ))}
      </ul>
      {!isHr && editable && (
        <p className={T_CAPTION}>Only HR signs these here. Kitchen managers record uniforms, knives and keys under Leaver Returns.</p>
      )}
      {a && a.next_step && c.status === "active" && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm" data-testid="next-approval">
          <span className="text-zinc-400">Approvals: </span>
          <span className="text-white">{a.flow.map((s) => STEP_NAMES[s] || s).join(" → ")}</span>
          <span className="text-zinc-400"> · next: </span>
          <span className="font-semibold text-white">
            {a.next_step === "release" ? "email and payment" : `${a.next_label}${a.next_names.length ? ` (${a.next_names.join(", ")})` : ""}`}
          </span>
          {a.next_step !== "release" && !a.my_steps.includes(a.next_step) && (
            <span className="text-zinc-500"> — not you</span>
          )}
        </div>
      )}
    </div>
  );
}

type Leaver = { staff_name: string; home_branch: string; last_shift: string };

export function LeaversWithoutCasePanel({ city, onOpened }: { city: string; onOpened: () => void }) {
  const [leavers, setLeavers] = useState<Leaver[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ leavers?: Leaver[] }>(`/api/admin/hr/clearance/leavers-without-case?city=${encodeURIComponent(city)}`);
      setLeavers(d.leavers || []);
    } catch { /* the panel stays hidden */ }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  async function open(l: Leaver) {
    setBusy(l.staff_name);
    setErr("");
    try {
      await postJson(`/api/admin/hr/clearance`, {
        city, employee_name: l.staff_name, separation_type: "resignation", last_working_day: l.last_shift,
      });
      await load();
      onOpened();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  if (leavers.length === 0) return null;
  return (
    <div className={`${GLASS_CARD} p-4 space-y-2`} data-testid="leavers-without-case">
      <p className="text-sm font-semibold text-amber-300">
        {leavers.length} {city === "dubai" ? "Dubai" : "Manila"} leaver{leavers.length === 1 ? "" : "s"} since May with no clearance case
      </p>
      <p className={T_CAPTION}>
        Marked SEPARATED before cases opened by themselves. Open one for anyone whose final pay is not settled; set the type and last day on the case.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <ul className="divide-y divide-white/5 text-sm">
        {leavers.map((l) => (
          <li key={l.staff_name} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-white">{l.staff_name}
              <span className="ml-2 text-xs text-zinc-500">last shift {l.last_shift}{l.home_branch ? ` · ${l.home_branch}` : ""}</span>
            </span>
            <button className="text-xs text-violet-300 hover:text-violet-200" disabled={!!busy} onClick={() => open(l)}>
              {busy === l.staff_name ? "Opening…" : "Open case"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Approvers = Record<string, Record<string, string[]>>;

export function ApproversPanel() {
  const [approvers, setApprovers] = useState<Approvers>({});
  const [canEdit, setCanEdit] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ approvers?: Approvers; can_edit?: boolean }>(`/api/admin/hr/clearance/approvers`);
      setApprovers(d.approvers || {});
      setCanEdit(!!d.can_edit);
    } catch { /* shown empty */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(city: string, step: string) {
    setMsg("");
    try {
      const res = await fetch(`/api/admin/hr/clearance/approvers`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ city, step, names: (edit[`${city}.${step}`] || "").split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Failed");
      setMsg("Saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  const flows: Record<string, string[]> = { manila: ["hr", "payroll", "hq"], dubai: ["hr", "hq"] };
  return (
    <div className={`${GLASS_CARD} p-4 space-y-2 text-sm`} data-testid="clearance-approvers">
      <p className="font-semibold text-white">Clearance approvers</p>
      {Object.entries(flows).map(([city, steps]) => (
        <div key={city} className="space-y-1">
          <p className="text-zinc-300">
            <span className="capitalize">{city}</span>: {steps.map((s) => s === "hq" ? "HQ" : `${STEP_NAMES[s]} (${(approvers[city]?.[s] || []).join(", ") || "none"})`).join(" → ")}
          </p>
          {canEdit && steps.filter((s) => s !== "hq").map((s) => (
            <div key={s} className="flex gap-2">
              <input className={INPUT_CLASS} aria-label={`${city} ${s} approvers`}
                placeholder={`${STEP_NAMES[s]} approvers, comma-separated`}
                value={edit[`${city}.${s}`] ?? (approvers[city]?.[s] || []).join(", ")}
                onChange={(e) => setEdit((p) => ({ ...p, [`${city}.${s}`]: e.target.value }))} />
              <button className={SECONDARY_BUTTON} onClick={() => save(city, s)}>Save</button>
            </div>
          ))}
        </div>
      ))}
      <p className={T_CAPTION}>Each approval is by a different person, in this order. The last one finalizes the case.</p>
      {msg && <p className="text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
