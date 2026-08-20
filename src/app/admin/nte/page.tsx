"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  FileText, Paperclip, Plus, RefreshCw, Send, X,
} from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD, STATUS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  DANGER_BUTTON, INPUT_CLASS, TEXTAREA_CLASS, TAB_CONTAINER, TAB_ACTIVE,
  TAB_INACTIVE, KPI_CARD, KPI_LABEL, KPI_VALUE,
  T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO, BADGE_ACCENT,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type NteCase = {
  id: string;
  nte_ref: string;
  market: string;
  store_code: string | null;
  staff_name: string;
  violation_code: string | null;
  violation_title?: string | null;
  severity_class: string | null;
  offense_count: number;
  proposed_penalty: string | null;
  status: string;
  served_at: string | null;
  served_method: string | null;
  response_deadline: string | null;
  response_received_at: string | null;
  response_text: string | null;
  response_waived: boolean;
  decision_outcome: string | null;
  decision_penalty_detail: string | null;
  decided_at: string | null;
  created_at: string;
};

type IncidentReport = {
  id: string;
  ir_ref: string;
  market: string;
  store_code: string | null;
  staff_name: string;
  status: string;
  incident_date: string;
  proposed_code: string | null;
  observed_acts: string | null;
  reported_by: string | null;
  created_at: string;
};

type ViolationItem = {
  code: string;
  title_en: string;
  category_code: string;
  severity_class: string;
};

type EvidenceItem = {
  evidence_type: string;
  description: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function isOverdue(deadline: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  REVIEW_PENDING:     { label: "Review Pending",    badge: BADGE_ACCENT },
  APPROVAL_PENDING:   { label: "Approval Pending",  badge: BADGE_WARNING },
  APPROVED:           { label: "Approved",          badge: BADGE_INFO },
  SERVED:             { label: "Awaiting Response", badge: BADGE_WARNING },
  RESPONSE_RECEIVED:  { label: "Response Received", badge: BADGE_INFO },
  RESPONSE_WAIVED:    { label: "Response Waived",   badge: BADGE_ACCENT },
  HEARING_PENDING:    { label: "Hearing Scheduled", badge: BADGE_ACCENT },
  HEARING_DONE:       { label: "Hearing Complete",  badge: BADGE_ACCENT },
  INVESTIGATION_DONE: { label: "Under Review",      badge: BADGE_INFO },
  DECIDED:            { label: "Decision Issued",   badge: BADGE_SUCCESS },
  NOD_ISSUED:         { label: "Notice of Decision",badge: BADGE_SUCCESS },
  CLOSED:             { label: "Closed",            badge: "inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400" },
  DISMISSED:          { label: "Dismissed",         badge: BADGE_SUCCESS },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, badge: BADGE_INFO };
  return <span className={cfg.badge}>{cfg.label}</span>;
}

function SeverityBadge({ cls }: { cls: string | null }) {
  if (!cls) return null;
  const colors: Record<string, string> = {
    A: "bg-zinc-700 text-zinc-300",
    B: "bg-amber-900/60 text-amber-300",
    C: "bg-orange-900/60 text-orange-300",
    D: "bg-red-900/60 text-red-300",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${colors[cls] ?? "bg-zinc-700 text-zinc-300"}`}>
      Severity {cls}
    </span>
  );
}

const TERMINAL = new Set(["CLOSED", "DISMISSED"]);

// ─── Decision Modal ───────────────────────────────────────────────────────────

function DecisionModal({
  caseItem,
  onClose,
  onDone,
  authH,
}: {
  caseItem: NteCase;
  onClose: () => void;
  onDone: (updated: NteCase) => void;
  authH: Record<string, string>;
}) {
  const [outcome, setOutcome] = useState("DISMISSED");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setSaving(true); setErr("");
    try {
      const r = await fetch(`/api/admin/nte-v2/case/${caseItem.id}/transition`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", decision_outcome: outcome, decision_penalty_detail: detail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed");
      onDone(d.case as NteCase);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={T_SECTION}>Record Decision</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <p className={`${T_CAPTION} mb-4`}>{caseItem.nte_ref} — {caseItem.staff_name}</p>
        <div className="space-y-3">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Outcome</label>
            <SelectDark
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: "DISMISSED", label: "Dismissed — No penalty" },
                { value: "WRITTEN_WARNING", label: "Written Warning" },
                { value: "SUSPENSION", label: "Suspension" },
                { value: "TERMINATION", label: "Termination" },
              ]}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Penalty Detail / Notes</label>
            <textarea
              className={`${TEXTAREA_CLASS} text-sm`}
              rows={3}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="e.g. 3-day suspension effective Aug 25–27, 2026"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className={`${SECONDARY_BUTTON} text-sm`} onClick={onClose}>Cancel</button>
            <button className={`${PRIMARY_BUTTON} text-sm`} onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : "Confirm Decision"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Case Card ────────────────────────────────────────────────────────────────

function CaseCard({
  c,
  authH,
  onUpdated,
}: {
  c: NteCase;
  authH: Record<string, string>;
  onUpdated: (updated: NteCase) => void;
}) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState("");
  const [showDecision, setShowDecision] = useState(false);

  async function transition(action: string, extra: Record<string, string | number> = {}) {
    setActing(true); setErr("");
    try {
      const r = await fetch(`/api/admin/nte-v2/case/${c.id}/transition`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed");
      onUpdated(d.case as NteCase);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setActing(false); }
  }

  const overdueResponse = isOverdue(c.response_deadline) && c.status === "SERVED" && !c.response_text;

  return (
    <>
      {showDecision && (
        <DecisionModal
          caseItem={c}
          authH={authH}
          onClose={() => setShowDecision(false)}
          onDone={u => { onUpdated(u); setShowDecision(false); }}
        />
      )}
      <div className={STATUS_CARD}>
        {/* Row */}
        <button
          type="button"
          className="w-full flex flex-wrap items-center gap-3 p-4 text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-zinc-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
          <span className="font-mono text-sm font-bold text-violet-400 shrink-0">{c.nte_ref}</span>
          <span className="text-sm font-medium text-white">{c.staff_name}</span>
          <span className="text-xs text-zinc-500">{c.market}</span>
          {c.violation_code && <span className="font-mono text-xs text-zinc-400">{c.violation_code}</span>}
          <SeverityBadge cls={c.severity_class} />
          <StatusBadge status={c.status} />
          {overdueResponse && (
            <span className={BADGE_ERROR}><AlertTriangle size={10} /> Overdue</span>
          )}
          <span className={`${T_CAPTION} ml-auto shrink-0`}>{fmt(c.created_at)}</span>
        </button>

        {/* Expanded */}
        {open && (
          <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div><span className="text-zinc-500">Violation: </span><span className="text-white">{c.violation_title || c.violation_code || "—"}</span></div>
              <div><span className="text-zinc-500">Offense #: </span><span className="text-white">{c.offense_count}</span></div>
              <div><span className="text-zinc-500">Proposed Penalty: </span><span className="text-white">{c.proposed_penalty || "—"}</span></div>
              <div><span className="text-zinc-500">Served: </span><span className="text-white">{fmt(c.served_at)}{c.served_method ? ` (${c.served_method})` : ""}</span></div>
              <div><span className="text-zinc-500">Response Deadline: </span>
                <span className={overdueResponse ? "text-red-400 font-medium" : "text-white"}>
                  {fmt(c.response_deadline)}{overdueResponse ? " — OVERDUE" : ""}
                </span>
              </div>
              <div><span className="text-zinc-500">Decision: </span><span className="text-white">{c.decision_outcome || "—"}</span></div>
            </div>

            {c.response_text && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/8 p-3">
                <p className="text-xs font-semibold text-blue-400 mb-1">Staff Response — {fmt(c.response_received_at)}</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{c.response_text}</p>
              </div>
            )}

            {c.decision_penalty_detail && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3">
                <p className="text-xs font-semibold text-emerald-400 mb-1">Decision — {c.decision_outcome}</p>
                <p className="text-sm text-zinc-300">{c.decision_penalty_detail}</p>
              </div>
            )}

            {err && <p className="text-xs text-red-400">{err}</p>}

            {/* Action buttons */}
            {!TERMINAL.has(c.status) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {c.status === "REVIEW_PENDING" && (
                  <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                    onClick={() => void transition("generate_nte_draft")}>
                    Generate NTE Draft
                  </button>
                )}
                {c.status === "APPROVAL_PENDING" && (
                  <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                    onClick={() => void transition("approve")}>
                    <CheckCircle size={12} className="inline mr-1" />Approve
                  </button>
                )}
                {c.status === "APPROVED" && (
                  <button className={`${PRIMARY_BUTTON} text-xs`} disabled={acting}
                    onClick={() => void transition("serve", { served_method: "EMAIL" })}>
                    <Send size={12} className="inline mr-1" />Serve to Employee
                  </button>
                )}
                {c.status === "SERVED" && !c.response_text && isOverdue(c.response_deadline) && (
                  <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                    onClick={() => void transition("waive_response")}>
                    Waive Response (Overdue)
                  </button>
                )}
                {(c.status === "RESPONSE_RECEIVED" || c.status === "RESPONSE_WAIVED" || c.status === "INVESTIGATION_DONE") && (
                  <button className={`${PRIMARY_BUTTON} text-xs`} onClick={() => setShowDecision(true)}>
                    Record Decision
                  </button>
                )}
                {c.status === "DECIDED" && (
                  <>
                    <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                      onClick={() => void transition("issue_nod")}>
                      Issue Notice of Decision
                    </button>
                    <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                      onClick={() => void transition("close")}>
                      Close Case
                    </button>
                  </>
                )}
                {c.status === "NOD_ISSUED" && (
                  <button className={`${SMALL_BUTTON} text-xs`} disabled={acting}
                    onClick={() => void transition("close")}>
                    Close Case
                  </button>
                )}
                <a
                  href={`/api/admin/nte-v2/case/${c.id}/letter`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${SMALL_BUTTON} text-xs`}
                >
                  <FileText size={12} className="inline mr-1" />Download PDF
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Issue NTE Wizard ─────────────────────────────────────────────────────────

type IssueForm = {
  market: string;
  staff_name: string;
  violation_code: string;
  severity_class: string;
  incident_date: string;
  observed_acts: string;
  operational_impact: string;
  response_days: string;
  evidence: EvidenceItem[];
};

function IssueNteModal({
  onClose,
  onIssued,
  authH,
  staffNames,
  catalog,
}: {
  onClose: () => void;
  onIssued: (c: NteCase) => void;
  authH: Record<string, string>;
  staffNames: string[];
  catalog: ViolationItem[];
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IssueForm>({
    market: "PH",
    staff_name: "",
    violation_code: "",
    severity_class: "B",
    incident_date: new Date().toISOString().slice(0, 10),
    observed_acts: "",
    operational_impact: "",
    response_days: "3",
    evidence: [],
  });
  const [staffSearch, setStaffSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Record<string, string> | null>(null);

  function set<K extends keyof IssueForm>(k: K, v: IssueForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const selectedViolation = catalog.find(c => c.code === form.violation_code);
  const filteredStaff = form.staff_name
    ? staffNames.filter(n => n.toLowerCase().includes(staffSearch.toLowerCase())).slice(0, 10)
    : staffNames.filter(n => n.toLowerCase().includes(staffSearch.toLowerCase())).slice(0, 8);

  function addEvidence() {
    set("evidence", [...form.evidence, { evidence_type: "DOCUMENT", description: "" }]);
  }
  function removeEvidence(i: number) {
    set("evidence", form.evidence.filter((_, idx) => idx !== i));
  }
  function updateEvidence(i: number, field: keyof EvidenceItem, val: string) {
    set("evidence", form.evidence.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  }

  async function loadPreview() {
    if (!form.staff_name || !form.violation_code) return;
    try {
      const r = await fetch(
        `/api/admin/nte-v2/staff/${encodeURIComponent(form.staff_name)}/offense-history?violation_code=${form.violation_code}&market=${form.market}`,
        { headers: authH }
      );
      if (r.ok) {
        const d = await r.json();
        setPreview(d);
      }
    } catch {/* ignore */}
  }

  useEffect(() => {
    if (step === 3) void loadPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const step1Valid = form.market && form.staff_name && form.violation_code && form.incident_date;
  const step2Valid = form.observed_acts.trim().length >= 30;

  async function handleIssue() {
    setSaving(true); setErr("");
    try {
      // 1. Create IR
      const irRes = await fetch("/api/admin/nte-v2/ir", {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({
          market: form.market,
          staff_name: form.staff_name,
          incident_date: form.incident_date,
          proposed_code: form.violation_code,
          observed_acts: form.observed_acts,
          operational_impact: form.operational_impact,
        }),
      });
      const irData = await irRes.json();
      if (!irRes.ok) throw new Error(irData.detail || "Failed to create IR");
      const irId = irData.ir.id as string;

      // 2. Add evidence
      for (const ev of form.evidence.filter(e => e.description.trim())) {
        await fetch(`/api/admin/nte-v2/ir/${irId}/evidence`, {
          method: "POST",
          headers: { ...authH, "Content-Type": "application/json" },
          body: JSON.stringify({ evidence_type: ev.evidence_type, description: ev.description }),
        });
      }

      // 3. Submit IR
      const subRes = await fetch(`/api/admin/nte-v2/ir/${irId}/submit`, {
        method: "POST",
        headers: authH,
      });
      if (!subRes.ok) {
        const d = await subRes.json();
        throw new Error(d.detail || "Failed to submit IR");
      }

      // 4. Review → confirm_violation → creates Case
      const revRes = await fetch(`/api/admin/nte-v2/ir/${irId}/review`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_violation",
          violation_code: form.violation_code,
          severity_class: selectedViolation?.severity_class || form.severity_class,
          proposed_penalty: (preview as Record<string, string> | null)?.proposed_penalty || "",
          offense_count: parseInt((preview as Record<string, string | number> | null)?.current_offense_number as string || "1", 10),
          response_days: parseInt(form.response_days, 10),
        }),
      });
      const revData = await revRes.json();
      if (!revRes.ok) throw new Error(revData.detail || "Failed to confirm violation");
      const caseId = revData.case?.id as string;
      if (!caseId) throw new Error("No case ID returned from review");

      // 5. Generate NTE draft
      const draftRes = await fetch(`/api/admin/nte-v2/case/${caseId}/transition`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_nte_draft" }),
      });
      if (!draftRes.ok) {
        const d = await draftRes.json();
        throw new Error(d.detail || "Failed to generate draft");
      }

      // 6. Approve
      const approveRes = await fetch(`/api/admin/nte-v2/case/${caseId}/transition`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!approveRes.ok) {
        const d = await approveRes.json();
        throw new Error(d.detail || "Failed to approve");
      }

      // 7. Serve
      const serveRes = await fetch(`/api/admin/nte-v2/case/${caseId}/transition`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "serve", served_method: "EMAIL" }),
      });
      const serveData = await serveRes.json();
      if (!serveRes.ok) throw new Error(serveData.detail || "Failed to serve");

      onIssued(serveData.case as NteCase);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-lg max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className={T_SECTION}>Issue New NTE</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${s === step ? "bg-violet-500 text-white" : s < step ? "bg-emerald-500 text-white" : "bg-white/10 text-zinc-500"}`}>
                {s < step ? "✓" : s}
              </div>
              <span className={`text-xs ${s === step ? "text-white" : "text-zinc-500"}`}>
                {s === 1 ? "Staff & Violation" : s === 2 ? "Incident Details" : "Review & Issue"}
              </span>
              {s < 3 && <div className="h-px w-4 bg-white/10" />}
            </div>
          ))}
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Market</label>
                <SelectDark value={form.market} onChange={v => set("market", v)}
                  options={[{ value: "PH", label: "🇵🇭 Manila" }, { value: "AE", label: "🇦🇪 Dubai" }]} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Incident Date</label>
                <input type="date" className={`${INPUT_CLASS} text-sm`} value={form.incident_date}
                  onChange={e => set("incident_date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Issued To (Employee)</label>
              <input
                className={`${INPUT_CLASS} text-sm`}
                placeholder="Type to search employee name…"
                value={staffSearch || form.staff_name}
                onChange={e => {
                  setStaffSearch(e.target.value);
                  set("staff_name", "");
                }}
              />
              {staffSearch && !form.staff_name && filteredStaff.length > 0 && (
                <div className="mt-1 rounded-xl border border-white/10 bg-zinc-900 shadow-lg z-10 max-h-40 overflow-y-auto">
                  {filteredStaff.map(n => (
                    <button key={n} type="button"
                      className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-violet-500/20"
                      onClick={() => { set("staff_name", n); setStaffSearch(""); }}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {form.staff_name && (
                <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle size={12} /> {form.staff_name}
                </p>
              )}
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Re / Violation</label>
              <SelectDark
                value={form.violation_code}
                onChange={v => {
                  set("violation_code", v);
                  const found = catalog.find(c => c.code === v);
                  if (found) set("severity_class", found.severity_class);
                }}
                options={[
                  { value: "", label: "— Select violation —" },
                  ...catalog.map(c => ({ value: c.code, label: `${c.code} — ${c.title_en}` })),
                ]}
              />
              {selectedViolation && (
                <p className="mt-1 text-xs text-zinc-400">
                  Category: {selectedViolation.category_code} · <SeverityBadge cls={selectedViolation.severity_class} />
                </p>
              )}
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Response Days Allowed</label>
              <SelectDark value={form.response_days} onChange={v => set("response_days", v)}
                options={[
                  { value: "3", label: "3 days (standard)" },
                  { value: "5", label: "5 days" },
                  { value: "7", label: "7 days" },
                ]} />
            </div>
            <div className="flex justify-end pt-2">
              <button className={PRIMARY_BUTTON} disabled={!step1Valid} onClick={() => setStep(2)}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Body — Observed Acts</label>
              <p className={`${T_CAPTION} mb-1`}>Describe clearly what the employee did. Minimum 30 characters.</p>
              <textarea className={`${TEXTAREA_CLASS} text-sm`} rows={5} value={form.observed_acts}
                onChange={e => set("observed_acts", e.target.value)}
                placeholder="On [date], at [location], the employee was observed to have…" />
              <p className="text-right text-[10px] text-zinc-500 mt-0.5">{form.observed_acts.trim().length} chars</p>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Operational Impact</label>
              <textarea className={`${TEXTAREA_CLASS} text-sm`} rows={3} value={form.operational_impact}
                onChange={e => set("operational_impact", e.target.value)}
                placeholder="How did this affect store operations, team, or guests?" />
            </div>

            {/* Evidence */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={T_LABEL}>Attachments / Evidence</label>
                <button type="button" className={`${SMALL_BUTTON} text-xs flex items-center gap-1`} onClick={addEvidence}>
                  <Plus size={12} /> Add
                </button>
              </div>
              {form.evidence.length === 0 && (
                <p className={`${T_CAPTION} italic`}>No evidence added. Click Add to attach screenshots, documents, or other records.</p>
              )}
              <div className="space-y-2">
                {form.evidence.map((ev, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="w-36 shrink-0">
                      <SelectDark value={ev.evidence_type} onChange={v => updateEvidence(i, "evidence_type", v)}
                        options={[
                          { value: "PHOTO", label: "Photo / Screenshot" },
                          { value: "DOCUMENT", label: "Document" },
                          { value: "CCTV_REF", label: "CCTV Reference" },
                          { value: "WITNESS_STATEMENT", label: "Witness Statement" },
                          { value: "OS_LOG", label: "OS Log" },
                        ]} />
                    </div>
                    <input className={`${INPUT_CLASS} text-sm flex-1`}
                      placeholder="Description or file reference…"
                      value={ev.description}
                      onChange={e => updateEvidence(i, "description", e.target.value)} />
                    <button type="button" onClick={() => removeEvidence(i)} className="mt-2 text-zinc-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button className={`${SECONDARY_BUTTON} text-sm`} onClick={() => setStep(1)}>← Back</button>
              <button className={PRIMARY_BUTTON} disabled={!step2Valid} onClick={() => setStep(3)}>
                Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className={`${GLASS_CARD} p-4 space-y-2`}>
              <p className={T_LABEL}>NTE Summary</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div><span className="text-zinc-500">Issued To: </span><span className="text-white font-medium">{form.staff_name}</span></div>
                <div><span className="text-zinc-500">Date: </span><span className="text-white">{form.incident_date}</span></div>
                <div><span className="text-zinc-500">Market: </span><span className="text-white">{form.market === "PH" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}</span></div>
                <div><span className="text-zinc-500">Violation: </span><span className="text-white">{form.violation_code}</span></div>
                {selectedViolation && <div className="col-span-2"><span className="text-zinc-500">Re: </span><span className="text-white">{selectedViolation.title_en}</span></div>}
              </div>
              <div className="border-t border-white/5 pt-2 mt-1">
                <p className="text-xs text-zinc-500 mb-1">Body:</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{form.observed_acts}</p>
              </div>
              {form.evidence.filter(e => e.description).length > 0 && (
                <div className="border-t border-white/5 pt-2">
                  <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Paperclip size={10} /> Attachments:</p>
                  {form.evidence.filter(e => e.description).map((e, i) => (
                    <p key={i} className="text-xs text-zinc-400">• [{e.evidence_type}] {e.description}</p>
                  ))}
                </div>
              )}
            </div>

            {preview && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-400">Offense History</p>
                <p className="text-xs text-zinc-300">
                  Offense #<strong>{(preview as Record<string, string>).current_offense_number}</strong> for this violation.
                  Proposed penalty: <strong>{(preview as Record<string, string>).proposed_penalty || "—"}</strong>
                </p>
              </div>
            )}

            <div className="rounded-xl border border-violet-500/20 bg-violet-500/8 p-3">
              <p className="text-xs text-violet-300">
                <strong>What happens when you click Issue:</strong><br />
                The NTE will be created, approved, and served to {form.staff_name}.
                They will have {form.response_days} days to submit their written response through the OS.
                This NTE will be permanently recorded in the company database.
              </p>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <button className={`${SECONDARY_BUTTON} text-sm`} onClick={() => setStep(2)} disabled={saving}>← Back</button>
              <button
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                onClick={() => void handleIssue()}
                disabled={saving}
              >
                {saving ? (
                  <><RefreshCw size={14} className="animate-spin" /> Issuing…</>
                ) : (
                  <><Send size={14} /> Issue NTE to {form.staff_name}</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminNtePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<NteCase[]>([]);
  const [irs, setIrs] = useState<IncidentReport[]>([]);
  const [catalog, setCatalog] = useState<ViolationItem[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [tab, setTab] = useState<"cases" | "irs">("cases");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showIssue, setShowIssue] = useState(false);
  const [filterStatus, setFilterStatus] = useState("active");

  const authH = useCallback((): Record<string, string> => {
    const auth = getAuth();
    return getAuthHeaders(auth) as Record<string, string>;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = getAuth();
      if (!raw?.hasSession && !raw?.accessToken) { router.replace("/login"); return; }
      const resolved = (await refreshAuthFromApi(raw)) || raw;
      if (!resolved?.hasSession && !resolved?.accessToken) { router.replace("/login"); return; }
      if (!cancelled) setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const h = authH();
      const [caseRes, irRes, catRes, staffRes] = await Promise.all([
        fetch("/api/admin/nte-v2/case?limit=200", { headers: h }),
        fetch("/api/admin/nte-v2/ir?limit=100", { headers: h }),
        fetch("/api/admin/nte-v2/catalog?market=PH", { headers: h }),
        fetch("/api/staff/names?city=Manila&limit=5000", { headers: h }),
      ]);
      if (caseRes.ok) {
        const d = await caseRes.json();
        setCases(Array.isArray(d.cases) ? d.cases : []);
      }
      if (irRes.ok) {
        const d = await irRes.json();
        setIrs(Array.isArray(d.irs) ? d.irs : []);
      }
      if (catRes.ok) {
        const d = await catRes.json();
        setCatalog(Array.isArray(d.catalog) ? d.catalog : []);
      }
      if (staffRes.ok) {
        const d = await staffRes.json();
        const names = Array.isArray(d.names) ? d.names : (Array.isArray(d) ? d : []);
        setStaffNames(names);
      }
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [authH]);

  useEffect(() => { if (ready) void loadData(); }, [ready, loadData]);

  const activeCases = cases.filter(c => !TERMINAL.has(c.status));
  const responseRequired = cases.filter(c => c.status === "SERVED" && !c.response_text);
  const overdueCases = responseRequired.filter(c => isOverdue(c.response_deadline));
  const pendingIrs = irs.filter(r => !["DISMISSED", "REVIEW_PENDING"].includes(r.status));

  const displayedCases = filterStatus === "active"
    ? cases.filter(c => !TERMINAL.has(c.status))
    : filterStatus === "closed"
    ? cases.filter(c => TERMINAL.has(c.status))
    : cases;

  if (!ready) return null;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={T_PAGE_TITLE}>NTE Management</h2>
          <p className={`${T_BODY} mt-1`}>Issue and track Notice to Explain cases.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-sm`}
            onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            onClick={() => setShowIssue(true)}>
            <Plus size={16} /> Issue New NTE
          </button>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
          <button type="button" onClick={() => setErr("")} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Active Cases</p>
          <p className={KPI_VALUE}>{loading ? "—" : activeCases.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Awaiting Response</p>
          <p className={`${KPI_VALUE} ${responseRequired.length > 0 ? "text-amber-400" : ""}`}>
            {loading ? "—" : responseRequired.length}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Overdue</p>
          <p className={`${KPI_VALUE} ${overdueCases.length > 0 ? "text-red-400" : ""}`}>
            {loading ? "—" : overdueCases.length}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Cases</p>
          <p className={KPI_VALUE}>{loading ? "—" : cases.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        <button className={tab === "cases" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("cases")}>
          NTE Cases {activeCases.length > 0 && <span className="ml-1 rounded-full bg-violet-500/30 px-1.5 text-[10px]">{activeCases.length}</span>}
        </button>
        <button className={tab === "irs" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("irs")}>
          Incident Reports {pendingIrs.length > 0 && <span className="ml-1 rounded-full bg-amber-500/30 px-1.5 text-[10px]">{pendingIrs.length}</span>}
        </button>
      </div>

      {/* Cases Tab */}
      {tab === "cases" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(["active", "closed", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                className={filterStatus === f ? TAB_ACTIVE : TAB_INACTIVE}
                style={{ padding: "4px 12px", fontSize: "12px" }}>
                {f === "active" ? "Active" : f === "closed" ? "Closed" : "All"}
              </button>
            ))}
          </div>
          {loading ? (
            <p className={`${T_BODY} py-8 text-center`}>Loading…</p>
          ) : displayedCases.length === 0 ? (
            <div className={`${GLASS_CARD} py-12 text-center`}>
              <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
              <p className={T_BODY}>No NTE cases found.</p>
              <button className={`${PRIMARY_BUTTON} mt-4 flex items-center gap-2 mx-auto`} onClick={() => setShowIssue(true)}>
                <Plus size={16} /> Issue First NTE
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedCases.map(c => (
                <CaseCard key={c.id} c={c} authH={authH()} onUpdated={updated =>
                  setCases(prev => prev.map(x => x.id === updated.id ? updated : x))
                } />
              ))}
            </div>
          )}
        </div>
      )}

      {/* IRs Tab */}
      {tab === "irs" && (
        <div className="space-y-2">
          {loading ? (
            <p className={`${T_BODY} py-8 text-center`}>Loading…</p>
          ) : irs.length === 0 ? (
            <div className={`${GLASS_CARD} py-12 text-center`}>
              <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
              <p className={T_BODY}>No incident reports found.</p>
            </div>
          ) : (
            irs.map(ir => (
              <div key={ir.id} className={`${STATUS_CARD} p-4`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold text-amber-400">{ir.ir_ref}</span>
                  <span className="text-sm text-white">{ir.staff_name}</span>
                  <span className="text-xs text-zinc-500">{ir.market}</span>
                  {ir.proposed_code && <span className="font-mono text-xs text-zinc-400">{ir.proposed_code}</span>}
                  <span className={BADGE_INFO}>{ir.status}</span>
                  <span className={`${T_CAPTION} ml-auto`}>{fmt(ir.incident_date)}</span>
                </div>
                {ir.observed_acts && (
                  <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{ir.observed_acts}</p>
                )}
                <p className={`${T_CAPTION} mt-1`}>Reported by: {ir.reported_by || "—"}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Issue Modal */}
      {showIssue && (
        <IssueNteModal
          onClose={() => setShowIssue(false)}
          onIssued={c => {
            setCases(prev => [c, ...prev]);
            setShowIssue(false);
          }}
          authH={authH()}
          staffNames={staffNames}
          catalog={catalog}
        />
      )}
    </div>
  );
}
