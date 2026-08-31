"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders, refreshAuthFromApi, canAccessHrClearanceAdmin } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  DIVIDER,
} from "@/lib/ui-tokens";
import { SALARY_HIDDEN, isSalaryHidden } from "@/lib/salary";

// ─── Types ────────────────────────────────────────────────────────────────────

type SeparationType = "resignation" | "termination" | "end_of_contract";

const SEP_TYPE_LABELS: Record<SeparationType, string> = {
  resignation: "Resignation",
  termination: "Termination",
  end_of_contract: "End of Contract",
};

type ClearanceCase = {
  id: string;
  city: string;
  employee_name: string;
  employee_id: string;
  department: string;
  position: string;
  employee_email: string;
  separation_type: SeparationType;
  last_working_day: string | null;
  days_since_last_day?: number | null;
  created_by: string;
  hr_signoff_by: string;
  hr_signoff_at: string | null;
  hr_signoff_notes: string;
  // Final-pay amounts are null for every role except HQ (backend masking).
  fp_basic_pay: number | null;
  fp_prorated_13th: number | null;
  fp_leave_conversion: number | null;
  fp_separation_pay: number | null;
  fp_allowance: number | null;
  fp_other_earnings: number | null;
  fp_other_earnings_label: string;
  fp_deduction_statutory: number | null;
  fp_deduction_loans: number | null;
  fp_deduction_other: number | null;
  fp_deduction_other_label: string;
  fp_total: number | null;
  fp_currency: string;
  fp_notes: string;
  current_stage: number;
  stage1_by: string;
  stage1_at: string | null;
  stage1_notes: string;
  stage2_by: string;
  stage2_at: string | null;
  stage2_notes: string;
  stage3_by: string;
  stage3_at: string | null;
  stage3_notes: string;
  stage4_by: string;
  stage4_at: string | null;
  stage4_notes: string;
  stage5_at: string | null;
  stage5_sent_to: string;
  stage6_by: string;
  stage6_at: string | null;
  stage6_notes: string;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  // Laptop / device tracking
  laptop_has_device: boolean;
  laptop_asset_tag: string;
  laptop_serial: string;
  laptop_brand: string;
  laptop_model: string;
  laptop_returned_at: string | null;
  laptop_returned_by: string;
  laptop_condition: string;
  laptop_condition_notes: string;
  laptop_reset_done: boolean;
  laptop_reset_by: string;
  laptop_reset_at: string | null;
  laptop_storage_location: string;
  laptop_notes: string;
};

// ─── Stage metadata ───────────────────────────────────────────────────────────

const STAGES = [
  { n: 0, label: "Draft" },
  { n: 1, label: "1st Review" },
  { n: 2, label: "2nd Review" },
  { n: 3, label: "3rd Review" },
  { n: 4, label: "Finalized" },
  { n: 5, label: "Email Sent" },
  { n: 6, label: "Payment Done" },
];

function stageColor(stage: number, current: number): string {
  if (stage < current) return "bg-emerald-500 text-white";
  if (stage === current) return "bg-indigo-500 text-white";
  return "bg-white/10 text-white/40";
}

function fmt(n: number | null | undefined, currency: string) {
  if (isSalaryHidden(n)) return SALARY_HIDDEN;
  return `${currency} ${(n as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** What is outstanding, above the list.
 *
 *  Six cases were open with someone waiting between 21 and 74 days for their
 *  final pay, PHP 48,585 between them. Every one of those facts existed in the
 *  data and none of them were on the screen -- the list was ordered by when the
 *  case was typed, so the oldest was not even at the top.
 */
type OffboardingCheck = {
  missing_offboarding: { employee_name: string; clearance_type: string; clearance_last_day: string }[];
  missing_count: number;
  type_disagreements: { employee_name: string; clearance_type: string; offboarding_type: string }[];
  disagreement_count: number;
  possible_duplicates: { names: string[]; types: string[]; last_working_days: string[]; n: number }[];
  duplicate_count: number;
};

/** Where the two registers of one departure disagree.
 *
 *  Nine cases exist here and one has a matching offboarding record — and that
 *  one calls it termination while offboarding calls it contract_end. Those mean
 *  different things. Shown, never reconciled: an offboarding record is what the
 *  nightly sweep reads to take away roles and logins, and that is not a
 *  decision to make from a name match.
 */
function OffboardingCheckPanel({ city }: { city: string }) {
  const [data, setData] = useState<OffboardingCheck | null>(null);

  useEffect(() => {
    fetch(`/api/admin/hr/clearance/offboarding-check?city=${encodeURIComponent(city)}`, {
      headers: getAuthHeaders(getAuth()),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, [city]);

  if (!data) return null;
  const total = data.missing_count + data.disagreement_count + data.duplicate_count;
  if (total === 0) return null;

  return (
    <div className={`${GLASS_CARD} space-y-3 border-amber-500/25`}>
      <p className="text-sm font-semibold text-amber-300">
        The clearance list and the offboarding list do not agree
      </p>

      {data.disagreement_count > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
            Different reason on each screen
          </p>
          {data.type_disagreements.map((r) => (
            <p key={r.employee_name} className="mt-1 text-sm text-white">
              {r.employee_name}
              <span className="text-white/50">
                {" "}— clearance says <span className="text-amber-200">{r.clearance_type}</span>,
                offboarding says <span className="text-amber-200">{r.offboarding_type}</span>
              </span>
            </p>
          ))}
        </div>
      )}

      {data.duplicate_count > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
            Possibly the same person, twice
          </p>
          {data.possible_duplicates.map((r) => (
            <p key={r.names.join("|")} className="mt-1 text-sm text-white">
              {r.names.join("  /  ")}
              <span className="text-white/50"> — {r.last_working_days.join(", ")}</span>
            </p>
          ))}
        </div>
      )}

      {data.missing_count > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
            No offboarding record ({data.missing_count})
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            {data.missing_offboarding.map((r) => r.employee_name).join(", ")}
          </p>
        </div>
      )}

      <p className={T_CAPTION}>
        Nothing here is corrected automatically. An offboarding record is what
        removes someone&apos;s roles and login overnight, so it is raised by a
        person on the Offboarding page, not by matching names.
      </p>
    </div>
  );
}

function OutstandingSummary({ cases }: { cases: ClearanceCase[] }) {
  const active = cases.filter((c) => c.status === "active");
  if (active.length === 0) return null;

  const byCurrency = new Map<string, number>();
  active.forEach((c) => {
    const amt = c.fp_total ?? 0;
    if (amt > 0) {
      const cur = c.fp_currency || "PHP";
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + amt);
    }
  });

  const waits = active
    .map((c) => c.days_since_last_day)
    .filter((d): d is number => typeof d === "number");
  const oldest = waits.length ? Math.max(...waits) : null;
  const over30 = waits.filter((d) => d >= 30).length;

  return (
    <div className={`${GLASS_CARD} flex flex-wrap items-baseline gap-x-6 gap-y-2`}>
      <span className="text-sm text-white/70">
        <span className="text-lg font-semibold text-white tabular-nums">{active.length}</span>{" "}
        case{active.length === 1 ? "" : "s"} open
      </span>
      {[...byCurrency.entries()].map(([cur, total]) => (
        <span key={cur} className="text-sm text-white/70">
          <span className="text-lg font-semibold text-white tabular-nums">
            {fmt(total, cur)}
          </span>{" "}
          not yet released
        </span>
      ))}
      {oldest !== null && (
        <span className={`text-sm ${oldest >= 30 ? "text-amber-300" : "text-white/70"}`}>
          oldest <span className="font-semibold tabular-nums">{oldest}</span> days
        </span>
      )}
      {over30 > 0 && (
        <span className="text-sm text-amber-300">
          {over30} past 30 days
        </span>
      )}
      <span className={`${T_CAPTION} w-full`}>
        Oldest first. A case only leaves this list when it reaches stage 6 or is
        cancelled.
      </span>
    </div>
  );
}


// ─── Create case modal ────────────────────────────────────────────────────────

type NewCaseForm = {
  city: string;
  employee_name: string;
  employee_id: string;
  department: string;
  position: string;
  employee_email: string;
  separation_type: SeparationType;
  last_working_day: string;
};

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: ClearanceCase) => void;
}) {
  const auth = getAuth();
  const [form, setForm] = useState<NewCaseForm>({
    city: auth?.city || "manila",
    employee_name: "",
    employee_id: "",
    department: "",
    position: "",
    employee_email: "",
    separation_type: "resignation",
    last_working_day: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(k: keyof NewCaseForm, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    if (!form.employee_name.trim()) { setErr("Employee name is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onCreated(data.case);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={T_CARD_TITLE}>New Clearance Case</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T_LABEL}>City</label>
              <SelectDark
                className={SELECT_CLASS}
                value={form.city}
                onChange={v => set("city", v)}
                options={[
                  { value: "manila", label: "Manila" },
                  { value: "dubai", label: "Dubai" },
                ]}
              />
            </div>
            <div>
              <label className={T_LABEL}>Separation Type</label>
              <SelectDark
                className={SELECT_CLASS}
                value={form.separation_type}
                onChange={v => set("separation_type", v as SeparationType)}
                options={Object.entries(SEP_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
              />
            </div>
          </div>
          <div>
            <label className={T_LABEL}>Employee Name *</label>
            <input className={INPUT_CLASS} value={form.employee_name} onChange={e => set("employee_name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T_LABEL}>Employee ID</label>
              <input className={INPUT_CLASS} value={form.employee_id} onChange={e => set("employee_id", e.target.value)} placeholder="e.g. MNL-001" />
            </div>
            <div>
              <label className={T_LABEL}>Last Working Day</label>
              <input type="date" className={INPUT_CLASS} value={form.last_working_day} onChange={e => set("last_working_day", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T_LABEL}>Department</label>
              <input className={INPUT_CLASS} value={form.department} onChange={e => set("department", e.target.value)} placeholder="e.g. Kitchen" />
            </div>
            <div>
              <label className={T_LABEL}>Position</label>
              <input className={INPUT_CLASS} value={form.position} onChange={e => set("position", e.target.value)} placeholder="e.g. Chef" />
            </div>
          </div>
          <div>
            <label className={T_LABEL}>Employee Email</label>
            <input type="email" className={INPUT_CLASS} value={form.employee_email} onChange={e => set("employee_email", e.target.value)} placeholder="employee@example.com" />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          <div className="flex gap-2 pt-2">
            <button className={PRIMARY_BUTTON} onClick={submit} disabled={saving}>
              {saving ? "Creating..." : "Create Case"}
            </button>
            <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loaned Assets section ────────────────────────────────────────────────────

interface ActiveLoan {
  id: number;
  asset_tag: string;
  asset_type: string;
  brand: string;
  model: string;
  loaned_at: string;
}

function LoanedAssetsSection({ employeeName, city }: { employeeName: string; city: string }) {
  const [loans, setLoans] = useState<ActiveLoan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const auth = getAuth();

  useEffect(() => {
    if (!employeeName || (!auth?.hasSession && !auth?.accessToken)) return;
    fetch(
      `${API_BASE}/api/admin/assets/loans/active?assignee=${encodeURIComponent(employeeName)}`,
      { headers: getAuthHeaders() },
    )
      .then(r => r.json())
      .then(d => { setLoans(d.loans ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [employeeName, auth?.accessToken]);

  if (!loaded || loans.length === 0) return null;

  return (
    <div className="mt-4">
      <div className={DIVIDER} />
      <div className="mt-3 mb-1 flex items-center justify-between">
        <p className={T_SECTION}>Loaned Company Assets</p>
        <a
          href={`/admin/assets?city=${city}`}
          className="text-xs text-indigo-300 hover:underline"
        >
          Manage in Assets →
        </a>
      </div>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 mb-2">
        <p className="text-xs text-amber-300 font-semibold">
          ⚠ {loans.length} company asset{loans.length > 1 ? "s" : ""} not yet returned. Please ensure return before finalizing clearance.
        </p>
      </div>
      <div className="space-y-2">
        {loans.map(l => (
          <div key={l.id} className="flex items-center justify-between text-sm rounded-lg bg-white/5 px-3 py-2">
            <div>
              <span className="font-mono text-violet-300 text-xs">{l.asset_tag}</span>
              <span className="text-white ml-2">{l.brand} {l.model}</span>
              <span className="text-white/40 text-xs ml-2 capitalize">{l.asset_type}</span>
            </div>
            <span className="text-white/40 text-xs">Since {l.loaned_at}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Laptop / Device section ──────────────────────────────────────────────────

const LAPTOP_CONDITIONS = [
  { value: "", label: "— Select condition —" },
  { value: "working", label: "Working (no issues)" },
  { value: "minor_issues", label: "Minor issues" },
  { value: "major_issues", label: "Major issues" },
  { value: "broken", label: "Broken / unusable" },
];

function laptopStatus(c: ClearanceCase): { label: string; color: string } {
  if (!c.laptop_has_device) return { label: "No laptop issued", color: "text-white/40" };
  if (c.laptop_reset_done && c.laptop_returned_at)
    return { label: "✓ Cleared", color: "text-emerald-400" };
  if (c.laptop_returned_at && !c.laptop_reset_done)
    return { label: "⚠ Reset Pending", color: "text-amber-400" };
  return { label: "⚠ Return Pending", color: "text-rose-400" };
}

function LaptopDeviceSection({ c, onUpdated }: { c: ClearanceCase; onUpdated: (u: ClearanceCase) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    laptop_has_device: c.laptop_has_device,
    laptop_asset_tag: c.laptop_asset_tag,
    laptop_serial: c.laptop_serial,
    laptop_brand: c.laptop_brand,
    laptop_model: c.laptop_model,
    laptop_returned_at: c.laptop_returned_at ?? "",
    laptop_returned_by: c.laptop_returned_by,
    laptop_condition: c.laptop_condition,
    laptop_condition_notes: c.laptop_condition_notes,
    laptop_reset_done: c.laptop_reset_done,
    laptop_reset_by: c.laptop_reset_by,
    laptop_reset_at: c.laptop_reset_at ?? "",
    laptop_storage_location: c.laptop_storage_location,
    laptop_notes: c.laptop_notes,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // sync if parent updates
  useEffect(() => {
    setForm({
      laptop_has_device: c.laptop_has_device,
      laptop_asset_tag: c.laptop_asset_tag,
      laptop_serial: c.laptop_serial,
      laptop_brand: c.laptop_brand,
      laptop_model: c.laptop_model,
      laptop_returned_at: c.laptop_returned_at ?? "",
      laptop_returned_by: c.laptop_returned_by,
      laptop_condition: c.laptop_condition,
      laptop_condition_notes: c.laptop_condition_notes,
      laptop_reset_done: c.laptop_reset_done,
      laptop_reset_by: c.laptop_reset_by,
      laptop_reset_at: c.laptop_reset_at ?? "",
      laptop_storage_location: c.laptop_storage_location,
      laptop_notes: c.laptop_notes,
    });
  }, [c.updated_at]);

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance/${c.id}/laptop`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          laptop_returned_at: form.laptop_returned_at || null,
          laptop_reset_at: form.laptop_reset_at || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "Save failed");
      onUpdated(d.case);
      setOpen(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const status = laptopStatus(c);

  return (
    <div className="mt-4">
      <div className={DIVIDER} />
      <div className="mt-3">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <p className={T_SECTION}>Laptop / Device</p>
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
        </button>

        {open && (
          <div className="mt-3 space-y-4">
            {/* Device assignment */}
            <div>
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Device Assignment</p>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={form.laptop_has_device}
                  onChange={e => set("laptop_has_device", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-white">This employee was issued a company laptop/device</span>
              </label>
              {form.laptop_has_device && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={T_LABEL}>Asset Tag</label>
                    <input className={INPUT_CLASS} value={form.laptop_asset_tag} onChange={e => set("laptop_asset_tag", e.target.value)} placeholder="e.g. LT-0042" />
                  </div>
                  <div>
                    <label className={T_LABEL}>Serial Number</label>
                    <input className={INPUT_CLASS} value={form.laptop_serial} onChange={e => set("laptop_serial", e.target.value)} placeholder="Serial #" />
                  </div>
                  <div>
                    <label className={T_LABEL}>Brand</label>
                    <input className={INPUT_CLASS} value={form.laptop_brand} onChange={e => set("laptop_brand", e.target.value)} placeholder="e.g. Lenovo" />
                  </div>
                  <div>
                    <label className={T_LABEL}>Model</label>
                    <input className={INPUT_CLASS} value={form.laptop_model} onChange={e => set("laptop_model", e.target.value)} placeholder="e.g. ThinkPad L14" />
                  </div>
                </div>
              )}
            </div>

            {form.laptop_has_device && (
              <>
                {/* Return tracking */}
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Return Tracking</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={T_LABEL}>Date Returned</label>
                      <input type="date" className={INPUT_CLASS} value={form.laptop_returned_at?.slice(0, 10) ?? ""} onChange={e => set("laptop_returned_at", e.target.value)} />
                    </div>
                    <div>
                      <label className={T_LABEL}>Received by (HR)</label>
                      <input className={INPUT_CLASS} value={form.laptop_returned_by} onChange={e => set("laptop_returned_by", e.target.value)} placeholder="HR staff name" />
                    </div>
                  </div>
                </div>

                {/* Condition report */}
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Condition Report</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={T_LABEL}>Condition</label>
                      <SelectDark
                        value={form.laptop_condition}
                        onChange={v => set("laptop_condition", v)}
                        options={LAPTOP_CONDITIONS}
                        className={SELECT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={T_LABEL}>Condition Notes</label>
                      <input className={INPUT_CLASS} value={form.laptop_condition_notes} onChange={e => set("laptop_condition_notes", e.target.value)} placeholder="Describe any damage, issues" />
                    </div>
                  </div>
                </div>

                {/* Security reset — critical */}
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <p className="text-xs font-semibold text-rose-300 uppercase tracking-wide mb-2">Security Reset — Critical</p>
                  <p className="text-xs text-white/50 mb-3">
                    Factory reset or revoke all access (accounts, VPN, email) before reissuing to a new employee.
                  </p>
                  <label className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={form.laptop_reset_done}
                      onChange={e => set("laptop_reset_done", e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-white font-medium">Security reset completed</span>
                  </label>
                  {form.laptop_reset_done && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={T_LABEL}>Reset performed by</label>
                        <input className={INPUT_CLASS} value={form.laptop_reset_by} onChange={e => set("laptop_reset_by", e.target.value)} placeholder="IT/HR staff name" />
                      </div>
                      <div>
                        <label className={T_LABEL}>Reset date</label>
                        <input type="date" className={INPUT_CLASS} value={form.laptop_reset_at?.slice(0, 10) ?? ""} onChange={e => set("laptop_reset_at", e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Storage */}
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Storage</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={T_LABEL}>Storage Location</label>
                      <input className={INPUT_CLASS} value={form.laptop_storage_location} onChange={e => set("laptop_storage_location", e.target.value)} placeholder="e.g. Office cabinet B2" />
                    </div>
                    <div>
                      <label className={T_LABEL}>Notes</label>
                      <input className={INPUT_CLASS} value={form.laptop_notes} onChange={e => set("laptop_notes", e.target.value)} placeholder="Any additional notes" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {err && <p className="text-xs text-rose-400">{err}</p>}

            <div className="flex gap-2 justify-end">
              <button className={SECONDARY_BUTTON} onClick={() => setOpen(false)}>Cancel</button>
              <button className={PRIMARY_BUTTON} onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Final Pay section ────────────────────────────────────────────────────────

function FinalPaySection({ c, onUpdated }: { c: ClearanceCase; onUpdated: (updated: ClearanceCase) => void }) {
  const [open, setOpen] = useState(c.current_stage === 0);
  useEffect(() => { if (c.current_stage === 0) setOpen(true); }, [c.current_stage]);
  const [fp, setFp] = useState({
    fp_basic_pay: c.fp_basic_pay,
    fp_prorated_13th: c.fp_prorated_13th,
    fp_leave_conversion: c.fp_leave_conversion,
    fp_separation_pay: c.fp_separation_pay,
    fp_allowance: c.fp_allowance,
    fp_other_earnings: c.fp_other_earnings,
    fp_other_earnings_label: c.fp_other_earnings_label,
    fp_deduction_statutory: c.fp_deduction_statutory,
    fp_deduction_loans: c.fp_deduction_loans,
    fp_deduction_other: c.fp_deduction_other,
    fp_deduction_other_label: c.fp_deduction_other_label,
    fp_notes: c.fp_notes,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Every component null ⇒ the figure is masked, not zero.
  const earningParts = [fp.fp_basic_pay, fp.fp_prorated_13th, fp.fp_leave_conversion, fp.fp_separation_pay, fp.fp_allowance, fp.fp_other_earnings];
  const deductionParts = [fp.fp_deduction_statutory, fp.fp_deduction_loans, fp.fp_deduction_other];
  const totalEarnings = earningParts.every(isSalaryHidden) ? null : earningParts.reduce<number>((s, v) => s + (v || 0), 0);
  const totalDeductions = deductionParts.every(isSalaryHidden) ? null : deductionParts.reduce<number>((s, v) => s + (v || 0), 0);
  const netPay = totalEarnings === null && totalDeductions === null ? null : (totalEarnings || 0) - (totalDeductions || 0);

  function numSet(k: string, v: string) {
    const n = parseFloat(v) || 0;
    setFp((p) => ({ ...p, [k]: n }));
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance/${c.id}/final-pay`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fp),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onUpdated(data.case);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // Frozen at Finalized, not the moment it leaves Draft — stages 1-3 are the
  // reviews, and a reviewer who finds a wrong figure has to be able to get it
  // corrected. Matches the server.
  const frozen = c.current_stage >= 4;
  // Every amount masked means this account cannot see salary, and so cannot set
  // it either: the server refuses the save. Typing into the boxes and pressing
  // Save used to look like it worked and change nothing.
  const salaryHiddenHere = [
    c.fp_basic_pay, c.fp_prorated_13th, c.fp_leave_conversion, c.fp_separation_pay,
    c.fp_allowance, c.fp_other_earnings, c.fp_deduction_statutory,
    c.fp_deduction_loans, c.fp_deduction_other,
  ].every(isSalaryHidden);
  const readOnly = frozen || salaryHiddenHere;

  return (
    <div className="mt-4">
      <button className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium w-full" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        Final Pay Breakdown
        {c.current_stage === 0 && !readOnly && <span className="text-xs text-amber-400 ml-1">(draft — edit before submitting)</span>}
        {frozen && <span className="text-xs text-white/40 ml-1">(finalized — amounts locked)</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {salaryHiddenHere && !frozen && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="font-semibold">Salary amounts are hidden from your account.</div>
              <div className="mt-0.5 leading-relaxed">
                You can work this case, but you cannot enter the final pay — the server
                will refuse it, so the boxes are disabled rather than pretending to save.
                Ask HQ to enter the amounts, or to grant you{" "}
                <strong>View Salary Amounts</strong> under Role Management.
              </div>
            </div>
          )}
          {/* Earnings */}
          <div>
            <p className={`${T_CAPTION} mb-2 text-emerald-400`}>Earnings</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "fp_basic_pay", label: "Basic Pay" },
                { k: "fp_prorated_13th", label: "Prorated 13th Month" },
                { k: "fp_leave_conversion", label: "Leave Conversion" },
                { k: "fp_separation_pay", label: "Separation Pay" },
                { k: "fp_allowance", label: "Allowance" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label className={T_LABEL}>{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={INPUT_CLASS}
                    value={(fp as Record<string, number | string | null>)[k] ?? ""}
                    onChange={e => numSet(k, e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              ))}
              <div>
                <label className={T_LABEL}>Other Earnings</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLASS}
                  value={fp.fp_other_earnings ?? ""} onChange={e => numSet("fp_other_earnings", e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={T_LABEL}>Other Label</label>
                <input className={INPUT_CLASS} placeholder="e.g. Bonus"
                  value={fp.fp_other_earnings_label} onChange={e => setFp(p => ({ ...p, fp_other_earnings_label: e.target.value }))} disabled={readOnly} />
              </div>
            </div>
          </div>

          <div className={DIVIDER} />

          {/* Deductions */}
          <div>
            <p className={`${T_CAPTION} mb-2 text-rose-400`}>Deductions</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "fp_deduction_statutory", label: "Statutory (SSS/PhilHealth/etc.)" },
                { k: "fp_deduction_loans", label: "Loans / Cash Advance" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label className={T_LABEL}>{label}</label>
                  <input type="number" min="0" step="0.01" className={INPUT_CLASS}
                    value={(fp as Record<string, number | string | null>)[k] ?? ""}
                    onChange={e => numSet(k, e.target.value)} disabled={readOnly} />
                </div>
              ))}
              <div>
                <label className={T_LABEL}>Other Deductions</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLASS}
                  value={fp.fp_deduction_other ?? ""} onChange={e => numSet("fp_deduction_other", e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={T_LABEL}>Other Label</label>
                <input className={INPUT_CLASS} placeholder="e.g. Uniform"
                  value={fp.fp_deduction_other_label} onChange={e => setFp(p => ({ ...p, fp_deduction_other_label: e.target.value }))} disabled={readOnly} />
              </div>
            </div>
          </div>

          <div className={DIVIDER} />

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className={T_CAPTION}>Total Earnings</p>
              <p className="text-emerald-400 font-semibold">{fmt(totalEarnings, c.fp_currency)}</p>
            </div>
            <div>
              <p className={T_CAPTION}>Total Deductions</p>
              <p className="text-rose-400 font-semibold">{fmt(totalDeductions, c.fp_currency)}</p>
            </div>
            <div>
              <p className={T_CAPTION}>Net Pay</p>
              <p className={`font-bold text-lg ${(netPay ?? 0) >= 0 ? "text-white" : "text-red-400"}`}>
                {fmt(netPay, c.fp_currency)}
              </p>
            </div>
          </div>

          <div>
            <label className={T_LABEL}>Notes</label>
            <textarea className={TEXTAREA_CLASS} rows={2}
              value={fp.fp_notes} onChange={e => setFp(p => ({ ...p, fp_notes: e.target.value }))} disabled={readOnly} />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          {!readOnly && (
            <button className={PRIMARY_BUTTON} onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Final Pay"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage timeline ───────────────────────────────────────────────────────────

function StageLine({ c, onUpdated }: { c: ClearanceCase; onUpdated: (u: ClearanceCase) => void }) {
  const [actionNotes, setActionNotes] = useState("");
  const [emailTo, setEmailTo] = useState(c.employee_email || "");
  const [doing, setDoing] = useState(false);
  const [err, setErr] = useState("");
  const [confirmingAdvance, setConfirmingAdvance] = useState(false);
  const myName = getAuth()?.staffName || "you";

  async function act(action: "advance" | "return") {
    setDoing(true); setErr(""); setConfirmingAdvance(false);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance/${c.id}/stage`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: actionNotes, email_sent_to: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onUpdated(data.case);
      setActionNotes("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setDoing(false);
    }
  }

  const cur = c.current_stage;
  const isDone = c.status === "completed";
  const isCancelled = c.status === "cancelled";

  const stageDetails = [
    { n: 1, who: c.stage1_by, at: c.stage1_at, notes: c.stage1_notes },
    { n: 2, who: c.stage2_by, at: c.stage2_at, notes: c.stage2_notes },
    { n: 3, who: c.stage3_by, at: c.stage3_at, notes: c.stage3_notes },
    { n: 4, who: c.stage4_by, at: c.stage4_at, notes: c.stage4_notes },
    { n: 5, who: "System", at: c.stage5_at, notes: c.stage5_sent_to ? `Sent to: ${c.stage5_sent_to}` : "" },
    { n: 6, who: c.stage6_by, at: c.stage6_at, notes: c.stage6_notes },
  ];

  return (
    <div className="mt-4 space-y-3">
      {/* Stage pills */}
      <div className="flex gap-1 flex-wrap">
        {STAGES.map(s => (
          <div key={s.n} className={`rounded-full px-3 py-1 text-xs font-medium ${stageColor(s.n, cur)}`}>
            {s.n === 0 ? "0: Draft" : `${s.n}: ${s.label}`}
          </div>
        ))}
      </div>

      {/* Completed stage details */}
      {stageDetails.filter(s => s.n <= cur).map(s => (
        <div key={s.n} className="flex items-start gap-2 text-sm">
          <div className="w-5 h-5 rounded-full bg-emerald-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check size={12} className="text-emerald-400" />
          </div>
          <div>
            <span className="text-white/60">{STAGES[s.n].label}</span>
            {s.who && <span className="text-white ml-1">— {s.who}</span>}
            {s.at && <span className="text-white/40 ml-1 text-xs">{fmtDate(s.at)}</span>}
            {s.notes && <p className="text-white/50 text-xs mt-0.5">{s.notes}</p>}
          </div>
        </div>
      ))}

      {/* Action area */}
      {!isDone && !isCancelled && (
        <div className="pt-2 space-y-2">
          <div>
            <label className={T_LABEL}>Notes for this action</label>
            <textarea className={TEXTAREA_CLASS} rows={2} value={actionNotes} onChange={e => setActionNotes(e.target.value)}
              placeholder={cur === 4 ? "Email body / remarks" : "Optional notes"} />
          </div>

          {/* Stage 4 → 5: email recipient */}
          {cur === 4 && (
            <div>
              <label className={T_LABEL}>Send Email To</label>
              <input type="email" className={INPUT_CLASS} value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="employee@example.com" />
            </div>
          )}

          {/* Advance confirmation banner */}
          {confirmingAdvance && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="text-amber-300 font-medium mb-1">Confirm advance?</p>
              <p className="text-white/70 mb-2">
                <span className="font-semibold text-white">{myName}</span> will be recorded as the{" "}
                <span className="font-semibold text-white">{STAGES[cur + 1]?.label}</span> approver.
              </p>
              <div className="flex gap-2">
                <button className={PRIMARY_BUTTON} onClick={() => act("advance")} disabled={doing}>
                  {doing ? "..." : "Yes, advance"}
                </button>
                <button className={SECONDARY_BUTTON} onClick={() => setConfirmingAdvance(false)} disabled={doing}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!confirmingAdvance && cur < 6 && (
              <button
                className={PRIMARY_BUTTON}
                onClick={() => cur < 4 ? setConfirmingAdvance(true) : act("advance")}
                disabled={doing}
              >
                {doing ? "..." : cur === 5 ? <><Check size={14} className="inline mr-1" />Mark Payment Done</> : cur === 4 ? <><Send size={14} className="inline mr-1" />Mark Email Sent</> : <><ChevronDown size={14} className="inline mr-1" />Advance</>}
              </button>
            )}
            {cur > 0 && (
              <button className={SECONDARY_BUTTON} onClick={() => act("return")} disabled={doing}>
                <RotateCcw size={14} className="inline mr-1" />Return to Draft
              </button>
            )}
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}
        </div>
      )}

      {isDone && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <Check size={16} /> Clearance complete — payment processed
        </div>
      )}
      {isCancelled && <p className="text-rose-400 text-sm">Case cancelled</p>}
    </div>
  );
}

// ─── Case card ────────────────────────────────────────────────────────────────

function CaseCard({ c, onUpdated, onCancel }: {
  c: ClearanceCase;
  onUpdated: (u: ClearanceCase) => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const stageBadge = STAGES[c.current_stage]?.label ?? `Stage ${c.current_stage}`;
  const statusColor =
    c.status === "completed" ? "text-emerald-400" :
    c.status === "cancelled" ? "text-rose-400/60" :
    "text-indigo-300";

  return (
    <div className={`${GLASS_CARD} ${c.status === "cancelled" ? "opacity-50" : ""}`}>
      <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`${T_CARD_TITLE} truncate`}>{c.employee_name}</p>
            <p className={T_CAPTION}>
              {c.department && `${c.department} · `}{c.position}
              {c.last_working_day && ` · LWD ${fmtDate(c.last_working_day)}`}
            </p>
            {c.status === "active" && (
              <p className="mt-1 text-sm">
                {typeof c.days_since_last_day === "number" && (
                  <span
                    className={
                      c.days_since_last_day >= 30
                        ? "font-medium text-amber-300"
                        : "text-white/50"
                    }
                  >
                    {c.days_since_last_day} days since last working day
                  </span>
                )}
                {(c.fp_total ?? 0) > 0 && (
                  <span className="text-white/50">
                    {" · "}
                    <span className="tabular-nums text-white/80">
                      {fmt(c.fp_total, c.fp_currency)}
                    </span>{" "}
                    not yet released
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs font-medium ${statusColor}`}>{stageBadge}</span>
            <span className={`text-xs rounded px-2 py-0.5 ${c.city === "dubai" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
              {c.city === "dubai" ? "DXB" : "MNL"}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4">
          <div className={DIVIDER} />

          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-white/50">Type:</span> <span className="text-white">{SEP_TYPE_LABELS[c.separation_type]}</span></div>
            <div><span className="text-white/50">Email:</span> <span className="text-white">{c.employee_email || "—"}</span></div>
            <div><span className="text-white/50">Employee ID:</span> <span className="text-white">{c.employee_id || "—"}</span></div>
            <div><span className="text-white/50">Created by:</span> <span className="text-white">{c.created_by || "—"}</span></div>
            <div><span className="text-white/50">Net Pay:</span> <span className="text-white font-semibold">{fmt(c.fp_total, c.fp_currency)}</span></div>
          </div>

          <LoanedAssetsSection employeeName={c.employee_name} city={c.city} />

          <LaptopDeviceSection c={c} onUpdated={onUpdated} />

          <FinalPaySection c={c} onUpdated={onUpdated} />

          <div className={`${DIVIDER} mt-4`} />

          <p className={`${T_SECTION} mt-3`}>Workflow</p>
          <StageLine c={c} onUpdated={onUpdated} />

          {c.status === "active" && (
            <div className="mt-4 flex justify-end">
              <button className="text-xs text-rose-400/60 hover:text-rose-400" onClick={onCancel}>Cancel case</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HrClearancePage() {
  const router = useRouter();
  const [cases, setCases] = useState<ClearanceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cityFilter, setCityFilter] = useState<"" | "manila" | "dubai">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "completed" | "cancelled">("active");
  const [showCreate, setShowCreate] = useState(false);

  const auth = getAuth();

  useEffect(() => {
    refreshAuthFromApi().then(fresh => {
      if (!canAccessHrClearanceAdmin(fresh ?? auth)) {
        router.replace("/");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (cityFilter) params.set("city", cityFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setCases(data.cases || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [cityFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: ClearanceCase) {
    setCases(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this clearance case?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/clearance/${id}/cancel`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error");
    }
  }

  const active = cases.filter(c => c.status === "active").length;
  const completed = cases.filter(c => c.status === "completed").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/50 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <FileCheck size={22} className="text-indigo-400" />
          <h1 className={T_PAGE_TITLE}>HR Clearance</h1>
          <button onClick={load} className="ml-auto text-white/40 hover:text-white">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active", value: active, color: "text-indigo-300" },
            { label: "Completed", value: completed, color: "text-emerald-400" },
            { label: "Shown", value: cases.length, color: "text-white" },
          ].map(k => (
            <div key={k.label} className={`${GLASS_CARD} text-center py-3`}>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className={T_CAPTION}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filters + create */}
        <div className="flex flex-wrap gap-2 items-center">
          <SelectDark
            className={SELECT_CLASS}
            value={cityFilter}
            onChange={v => setCityFilter(v as typeof cityFilter)}
            options={[
              { value: "", label: "All Cities" },
              { value: "manila", label: "Manila" },
              { value: "dubai", label: "Dubai" },
            ]}
          />
          <SelectDark
            className={SELECT_CLASS}
            value={statusFilter}
            onChange={v => setStatusFilter(v as typeof statusFilter)}
            options={[
              { value: "", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <button className={`${PRIMARY_BUTTON} ml-auto`} onClick={() => setShowCreate(true)}>
            <Plus size={16} className="inline mr-1" />New Case
          </button>
        </div>

        {err && <div className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">{err}</div>}

        {loading ? (
          <div className={`${GLASS_CARD} text-center text-white/40 py-12`}>Loading...</div>
        ) : cases.length === 0 ? (
          <div className={`${GLASS_CARD} text-center text-white/40 py-12`}>No cases found</div>
        ) : (
          <div className="space-y-3">
            <OutstandingSummary cases={cases} />
            <OffboardingCheckPanel city={cityFilter || "manila"} />
            {cases.map(c => (
              <CaseCard
                key={c.id}
                c={c}
                onUpdated={handleUpdated}
                onCancel={() => handleCancel(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={c => {
            setShowCreate(false);
            setCases(prev => [c, ...prev]);
          }}
        />
      )}
    </div>
  );
}
