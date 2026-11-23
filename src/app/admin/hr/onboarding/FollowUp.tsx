"use client";

/**
 * New-hire follow-up, inside the onboarding record: the check-ins with their
 * dates, each contact as recorded, the direct-PIC consultation, the month-end
 * audit counted from the records, and the review. The procedure is HR's own
 * (Onboarding settings); this screen only records against it.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import {
  STATE_LABEL,
  type FuAction,
  type FuContact,
  type FuPlan,
  type FuScheduleRow,
} from "@/lib/onboarding-followup";
import { BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING, SMALL_BUTTON, T_CAPTION, T_LABEL, T_SECTION } from "@/lib/ui-tokens";

const FIELD = "w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50";

function stateBadge(state: FuScheduleRow["state"]) {
  const cls = state === "done" ? BADGE_SUCCESS : state === "overdue" ? BADGE_ERROR
    : state === "late" || state === "due" ? BADGE_WARNING : BADGE_INFO;
  return <span className={cls}>{STATE_LABEL[state]}</span>;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ContactForm({ onboardingId, plan, row, editing, onSaved, onCancel }: {
  onboardingId: string;
  plan: FuPlan;
  row: FuScheduleRow;
  editing: FuContact | null;
  onSaved: (p: FuPlan) => void;
  onCancel: () => void;
}) {
  const t = plan.template!;
  const isPic = row.key === "pic";
  const questions = isPic ? t.pic?.questions || [] : t.questions;
  const [f, setF] = useState(() => ({
    actual_date: editing?.actual_date || todayIso(),
    actual_time: editing?.actual_time || "",
    method: editing?.method || row.suggested_method || t.methods[0]?.key || "",
    status: editing?.status || "completed",
    answers: { ...(editing?.answers || {}) } as Record<string, string>,
    ratings: { ...(editing?.ratings || {}) } as Record<string, string>,
    competency: (t.pic?.competency_areas || []).map((area) =>
      editing?.competency?.find((c) => c.area === area) || { area, result: "", evidence: "" }),
    actions: (editing?.actions?.length ? editing.actions : []) as FuAction[],
    pic_name: editing?.pic_name || plan.direct_pic || "",
    next_contact: editing?.next_contact || "",
    escalated_to: editing?.escalated_to || "",
    evidence_ref: editing?.evidence_ref || "",
    employee_confirmed: editing?.employee_confirmed || false,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const body = { ...f, milestone_key: row.key };
      const out = editing
        ? await apiSend("PUT", `/api/admin/hr/onboarding/${onboardingId}/followup/contacts/${editing.id}`, body)
        : await apiPost<FuPlan>(`/api/admin/hr/onboarding/${onboardingId}/followup/contacts`, body);
      onSaved(out as FuPlan);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/25 p-3" data-testid="followup-form">
      {row.focus && <p className="text-xs text-violet-300">Focus: {row.focus}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className={T_LABEL}>Date</span>
          <input type="date" className={FIELD} aria-label="Contact date" value={f.actual_date} onChange={(e) => set("actual_date", e.target.value)} /></label>
        <label className="space-y-1"><span className={T_LABEL}>Time</span>
          <input type="time" className={FIELD} aria-label="Contact time" value={f.actual_time} onChange={(e) => set("actual_time", e.target.value)} /></label>
        <label className="space-y-1"><span className={T_LABEL}>Method</span>
          <select className={FIELD} aria-label="Method" value={f.method} onChange={(e) => set("method", e.target.value)}>
            {t.methods.map((m) => <option key={m.key} value={m.key}>{m.label}{m.counts ? "" : " (does not count)"}</option>)}
          </select></label>
        <label className="space-y-1"><span className={T_LABEL}>Status</span>
          <select className={FIELD} aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="completed">Completed</option>
            <option value="attempted">Attempted only (not reached)</option>
            <option value="rescheduled">Rescheduled</option>
          </select></label>
      </div>
      {isPic && (
        <label className="block space-y-1"><span className={T_LABEL}>PIC name</span>
          <input className={FIELD} aria-label="PIC name" value={f.pic_name} onChange={(e) => set("pic_name", e.target.value)} /></label>
      )}
      {questions.map((q, i) => (
        <label key={q.key || i} className="block space-y-1"><span className={T_LABEL}>{i + 1}. {q.label}</span>
          <textarea className={FIELD} rows={2} aria-label={q.label} value={f.answers[q.key || ""] || ""}
            onChange={(e) => set("answers", { ...f.answers, [q.key || ""]: e.target.value })} /></label>
      ))}
      {isPic && f.competency.length > 0 && (
        <div className="space-y-1">
          <span className={T_LABEL}>Competency: observed result and evidence</span>
          {f.competency.map((c, i) => (
            <div key={c.area} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-1">
              <span className="text-xs text-zinc-300">{c.area}</span>
              <input className={FIELD} aria-label={`${c.area} result`} placeholder="Result" value={c.result}
                onChange={(e) => set("competency", f.competency.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))} />
              <input className={FIELD} aria-label={`${c.area} evidence`} placeholder="Evidence" value={c.evidence}
                onChange={(e) => set("competency", f.competency.map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)))} />
            </div>
          ))}
        </div>
      )}
      {!isPic && t.ratings.map((r) => (
        <label key={r.key || r.label} className="block space-y-1"><span className={T_LABEL}>{r.label}</span>
          <select className={FIELD} aria-label={r.label} value={f.ratings[r.key || ""] || ""}
            onChange={(e) => set("ratings", { ...f.ratings, [r.key || ""]: e.target.value })}>
            <option value="">Choose…</option>
            {r.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
      ))}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={T_LABEL}>Actions agreed (owner, due, verification)</span>
          <button type="button" className="text-xs text-violet-300" onClick={() => set("actions", [...f.actions, { action: "", owner: "", due: "", verification: "" }])}>+ Add action</button>
        </div>
        {f.actions.map((a, i) => (
          <div key={i} className="grid grid-cols-2 gap-1 rounded border border-white/10 p-1.5">
            {(["action", "owner", "due", "verification"] as const).map((k) => (
              <input key={k} className={FIELD} aria-label={`Action ${i + 1} ${k}`} placeholder={k === "due" ? "Due (date)" : k[0].toUpperCase() + k.slice(1)}
                value={a[k]} onChange={(e) => set("actions", f.actions.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className={T_LABEL}>Next contact</span>
          <input type="date" className={FIELD} aria-label="Next contact" value={f.next_contact} onChange={(e) => set("next_contact", e.target.value)} /></label>
        <label className="space-y-1"><span className={T_LABEL}>Escalated to</span>
          <input className={FIELD} aria-label="Escalated to" value={f.escalated_to} onChange={(e) => set("escalated_to", e.target.value)} /></label>
      </div>
      <label className="block space-y-1"><span className={T_LABEL}>Evidence (chat, call log, notes)</span>
        <input className={FIELD} aria-label="Evidence" value={f.evidence_ref} onChange={(e) => set("evidence_ref", e.target.value)}
          placeholder={f.status === "completed" ? "" : "Required: why it did not happen, and the proof"} /></label>
      {!isPic && (
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={f.employee_confirmed} onChange={(e) => set("employee_confirmed", e.target.checked)} />
          Employee confirmed this record
        </label>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className={SMALL_BUTTON} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={`${SMALL_BUTTON} text-emerald-300`} onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save record"}</button>
      </div>
    </div>
  );
}

async function apiSend(method: "PUT", path: string, body: unknown) {
  const { getAuthHeaders } = await import("@/lib/auth");
  const res = await fetch(path, { method, headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
  return data;
}

function ScheduleRow({ onboardingId, plan, row, onSaved }: {
  onboardingId: string; plan: FuPlan; row: FuScheduleRow; onSaved: (p: FuPlan) => void;
}) {
  const [open, setOpen] = useState<null | "new" | FuContact>(null);
  const methodLabel = (k: string) => plan.template?.methods.find((m) => m.key === k)?.label || k;
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3" data-testid={`followup-${row.key}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{row.label}</p>
          <p className={T_CAPTION}>Planned {row.planned_date}{row.deadline !== row.planned_date ? ` (by ${row.deadline})` : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {stateBadge(row.state)}
          {open === null && <button className="text-xs text-violet-300" onClick={() => setOpen("new")}>Record</button>}
        </div>
      </div>
      {row.records.map((c) => (
        <div key={c.id} className="mt-1.5 flex items-start justify-between gap-2 text-xs text-zinc-400">
          <span>
            {c.actual_date} · {methodLabel(c.method)} · {c.status === "completed" ? "completed" : c.status === "attempted" ? "attempted only" : "rescheduled"}
            {c.ratings?.retention_risk ? ` · risk ${c.ratings.retention_risk}` : ""} · {c.recorded_by}
          </span>
          {open === null && <button className="text-violet-300" onClick={() => setOpen(c)}>Edit</button>}
        </div>
      ))}
      {open !== null && (
        <ContactForm onboardingId={onboardingId} plan={plan} row={row} editing={open === "new" ? null : open}
          onSaved={(p) => { setOpen(null); onSaved(p); }} onCancel={() => setOpen(null)} />
      )}
    </li>
  );
}

function Review({ onboardingId, plan, onSaved }: { onboardingId: string; plan: FuPlan; onSaved: (p: FuPlan) => void }) {
  const r = plan.review || {};
  const [progress, setProgress] = useState(r.progress || "");
  const [devPlan, setDevPlan] = useState(r.development_plan || "");
  const [def, setDef] = useState(r.deficiencies || "");
  const [err, setErr] = useState("");
  const role = (getAuth()?.role || "").toUpperCase();
  async function act(action: string) {
    setErr("");
    try {
      onSaved(await apiPost<FuPlan>(`/api/admin/hr/onboarding/${onboardingId}/followup/review`,
        { action, progress, development_plan: devPlan, deficiencies: def }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-white">Month-end review</p>
      {[["Employee progress, remaining challenges, retention outlook", progress, setProgress],
        ["Next development plan, owner and deadline", devPlan, setDevPlan],
        ["HR deficiencies / exceptions and corrective action", def, setDef]].map(([label, v, fn]) => (
        <label key={label as string} className="block space-y-1"><span className={T_LABEL}>{label as string}</span>
          <textarea className={FIELD} rows={2} aria-label={label as string} value={v as string}
            onChange={(e) => (fn as (x: string) => void)(e.target.value)} /></label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button className={SMALL_BUTTON} onClick={() => void act("save")}>Save review</button>
        {r.written_at && !r.hr_manager_review_at && (role === "HR_MANAGER" || role === "HQ") && (
          <button className={`${SMALL_BUTTON} text-emerald-300`} onClick={() => void act("hr_manager_review")}>Mark reviewed (HR Manager)</button>
        )}
        {r.hr_manager_review_at && !r.management_approval_at && role === "HQ" && (
          <button className={`${SMALL_BUTTON} text-emerald-300`} onClick={() => void act("management_approval")}>Approve (management)</button>
        )}
      </div>
      <p className={T_CAPTION}>
        {r.written_by ? `Written by ${r.written_by}` : "Not written yet"}
        {r.hr_manager_review_by ? ` · reviewed by ${r.hr_manager_review_by}` : ""}
        {r.management_approval_by ? ` · approved by ${r.management_approval_by}` : ""}
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

export default function FollowUpSection({ onboardingId }: { onboardingId: string }) {
  const [plan, setPlan] = useState<FuPlan | null>(null);
  const [err, setErr] = useState("");
  const [team, setTeam] = useState({ hr_owner: "", direct_pic: "", training_buddy: "" });

  const adopt = (p: FuPlan) => {
    setPlan(p);
    setTeam({ hr_owner: p.hr_owner || "", direct_pic: p.direct_pic || "", training_buddy: p.training_buddy || "" });
  };

  const load = useCallback(async () => {
    try {
      adopt(await apiGet<FuPlan>(`/api/admin/hr/onboarding/${onboardingId}/followup`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the follow-up.");
    }
  }, [onboardingId]);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    setErr("");
    try {
      adopt(await apiPost<FuPlan>(`/api/admin/hr/onboarding/${onboardingId}/followup/start`, {}));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function saveTeam() {
    setErr("");
    try {
      adopt(await apiPatch<FuPlan>(`/api/admin/hr/onboarding/${onboardingId}/followup`, team));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!plan) return <p className={T_CAPTION}>{err || "Loading follow-up…"}</p>;

  if (!plan.started) {
    return (
      <div className="space-y-2" data-testid="followup-section">
        <h3 className={T_SECTION}>Follow-up</h3>
        <p className={T_CAPTION}>{plan.reason || "This new hire started before the follow-up procedure. Start it to schedule the check-ins from their start date."}</p>
        {plan.can_start && <button className={SMALL_BUTTON} onClick={() => void start()}>Start follow-up</button>}
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
    );
  }

  const a = plan.audit!;
  const line = (label: string, x: { done: number; required: number; met: boolean }) => (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-300">{label}</span>
      <span className={x.met ? "text-emerald-400" : "text-amber-300"}>{x.done} / {x.required} {x.met ? "met" : "not met"}</span>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="followup-section">
      <div>
        <h3 className={T_SECTION}>{plan.template?.title || "Follow-up"}</h3>
        <p className={T_CAPTION}>From {plan.start_date} · procedure v{plan.template_version}
          {plan.latest_version && plan.latest_version !== plan.template_version ? ` (v${plan.latest_version} applies to new hires)` : ""}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([["hr_owner", "HR owner"], ["direct_pic", "Direct PIC"], ["training_buddy", "Training buddy"]] as const).map(([k, label]) => (
          <label key={k} className="space-y-1"><span className={T_LABEL}>{label}</span>
            <input className={FIELD} aria-label={label} value={team[k]} onChange={(e) => setTeam((p) => ({ ...p, [k]: e.target.value }))} /></label>
        ))}
      </div>
      <button className={SMALL_BUTTON} onClick={() => void saveTeam()}>Save people</button>
      <ul className="space-y-2">
        {plan.schedule!.map((row) => <ScheduleRow key={row.key} onboardingId={onboardingId} plan={plan} row={row} onSaved={adopt} />)}
      </ul>
      <div className="space-y-1 rounded-lg border border-white/10 bg-white/5 p-3" data-testid="followup-audit">
        <p className="text-sm font-semibold text-white">Completion audit (from the records)</p>
        {line("Employee check-ins", a.checkins)}
        {line("Phone calls", a.phone)}
        {line("Face-to-face", a.face_to_face)}
        {line("Direct PIC consultation", a.pic)}
        {line("Actions verified", a.actions)}
        {a.late_or_missed.length > 0 && <p className="text-xs text-amber-300">Late or missed: {a.late_or_missed.join(", ")}</p>}
      </div>
      <Review onboardingId={onboardingId} plan={plan} onSaved={adopt} />
      {(plan.template?.rules || []).length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-zinc-500">
          {plan.template!.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
