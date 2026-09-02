"use client";

import {
  AlertCircle, ChevronLeft, Loader2, Plus, RefreshCw,
  Users, X, Pencil, CheckCircle2, XCircle, Link2, Link2Off, Wand2, PowerOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { hasPayrollViewSalary, canEditPayrollSalary, getAuth } from "@/lib/auth";
import { SALARY_HIDDEN } from "@/lib/salary";
import { GLASS_CARD, PRIMARY_BUTTON, INPUT_CLASS, SELECT_CLASS, TABLE_HEADER, TABLE_ROW, TABLE_CELL } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const API = "/api/admin/manila-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Types ──────────────────────────────────────────────────────────────────────

type StaffProfile = {
  id: number;
  staff_name: string;
  bayzat_employee_id: string | null;
  sss_number: string | null;
  philhealth_id: string | null;
  tin: string | null;
  pagibig_mid: string | null;
  employment_type: string;
  salary_type: string;
  hire_date: string | null;
  official_hire_date: string | null;
  last_working_date: string | null;
  department: string | null;
  position: string | null;
  monthly_rate: string | null;
  daily_rate: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  gcash_number: string | null;
  civil_status: string | null;
  num_qualified_dependents: number;
  mdr_submitted: boolean;
  mdr_submitted_date: string | null;
  mdr_notes: string;
  is_active: boolean;
  is_confidential: boolean;
  cola: string | null;
  is_minimum_wage_earner: boolean;
  rice_allowance: string | null;
  clothing_allowance: string | null;
  laundry_allowance: string | null;
  medical_allowance: string | null;
  pagibig_voluntary: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  staff_name: string;
  bayzat_employee_id: string;
  sss_number: string;
  philhealth_id: string;
  tin: string;
  pagibig_mid: string;
  employment_type: string;
  salary_type: string;
  hire_date: string;
  official_hire_date: string;
  last_working_date: string;
  department: string;
  position: string;
  monthly_rate: string;
  daily_rate: string;
  bank_name: string;
  bank_account_no: string;
  gcash_number: string;
  civil_status: string;
  num_qualified_dependents: number;
  mdr_submitted: boolean;
  mdr_submitted_date: string;
  mdr_notes: string;
  is_active: boolean;
  is_confidential: boolean;
  cola: string;
  is_minimum_wage_earner: boolean;
  rice_allowance: string;
  clothing_allowance: string;
  laundry_allowance: string;
  medical_allowance: string;
  pagibig_voluntary: string;
};

function emptyForm(): FormState {
  return {
    staff_name: "", bayzat_employee_id: "",
    sss_number: "", philhealth_id: "", tin: "", pagibig_mid: "",
    employment_type: "regular", salary_type: "monthly_paid",
    hire_date: "", official_hire_date: "", last_working_date: "",
    department: "", position: "",
    monthly_rate: "", daily_rate: "",
    bank_name: "", bank_account_no: "", gcash_number: "",
    civil_status: "", num_qualified_dependents: 0, mdr_submitted: false, mdr_submitted_date: "", mdr_notes: "",
    is_active: true,
    is_confidential: false,
    cola: "", is_minimum_wage_earner: false,
    rice_allowance: "", clothing_allowance: "", laundry_allowance: "", medical_allowance: "",
    pagibig_voluntary: "",
  };
}

function profileToForm(p: StaffProfile): FormState {
  return {
    staff_name: p.staff_name,
    bayzat_employee_id: p.bayzat_employee_id ?? "",
    sss_number: p.sss_number ?? "",
    philhealth_id: p.philhealth_id ?? "",
    tin: p.tin ?? "",
    pagibig_mid: p.pagibig_mid ?? "",
    employment_type: p.employment_type,
    salary_type: p.salary_type,
    hire_date: p.hire_date ?? "",
    official_hire_date: p.official_hire_date ?? "",
    last_working_date: p.last_working_date ?? "",
    department: p.department ?? "",
    position: p.position ?? "",
    monthly_rate: p.monthly_rate ?? "",
    daily_rate: p.daily_rate ?? "",
    bank_name: p.bank_name ?? "",
    bank_account_no: p.bank_account_no ?? "",
    gcash_number: p.gcash_number ?? "",
    civil_status: p.civil_status ?? "",
    num_qualified_dependents: p.num_qualified_dependents,
    mdr_submitted: p.mdr_submitted,
    mdr_submitted_date: p.mdr_submitted_date ?? "",
    mdr_notes: p.mdr_notes,
    is_active: p.is_active,
    is_confidential: p.is_confidential ?? false,
    cola: p.cola ?? "",
    is_minimum_wage_earner: p.is_minimum_wage_earner ?? false,
    rice_allowance:     p.rice_allowance ?? "",
    clothing_allowance: p.clothing_allowance ?? "",
    laundry_allowance:  p.laundry_allowance ?? "",
    medical_allowance:  p.medical_allowance ?? "",
    pagibig_voluntary:  p.pagibig_voluntary ?? "",
  };
}

// ── Profile Form Modal ─────────────────────────────────────────────────────────

function ProfileModal({
  existing,
  onSaved,
  onClose,
}: {
  existing: StaffProfile | null;
  onSaved: (p: StaffProfile) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(existing ? profileToForm(existing) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // Two different questions. Someone with the View Salary permission reads the
  // figures but cannot change them — the server pins every write back to the
  // stored value — so their inputs must show the number and refuse the edit.
  // A caller with neither sees null and must not have it validated as blank.
  const canSeeSalary = hasPayrollViewSalary(getAuth());
  // Per person, not per user: the server sends salary_hidden on the staff it
  // kept masked, and pins any write to those rows back to what is on disk.
  const canEditSalary = canEditPayrollSalary(getAuth())
    && !(existing as { salary_hidden?: boolean } | null)?.salary_hidden;
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [rosterNames, setRosterNames] = useState<string[]>([]);

  const isEdit = !!existing;

  useEffect(() => {
    if (isEdit) return;
    const auth = getAuth();
    fetch(`/api/admin/staff_master/names?city=manila&status=ACTIVE&limit=5000`, {
      headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.names)) setRosterNames(d.names); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.staff_name.trim()) { setErr("Staff name is required"); return; }
    if (canEditSalary && !form.monthly_rate && !form.daily_rate) { setErr("Either monthly rate or daily rate is required"); return; }
    setSaving(true); setErr("");
    try {
      const body = {
        ...form,
        staff_name: form.staff_name.trim(),
        bayzat_employee_id: form.bayzat_employee_id.trim() || null,
        sss_number: form.sss_number.trim() || null,
        philhealth_id: form.philhealth_id.trim() || null,
        tin: form.tin.trim() || null,
        pagibig_mid: form.pagibig_mid.trim() || null,
        hire_date: form.hire_date || null,
        official_hire_date: form.official_hire_date || null,
        last_working_date: form.last_working_date || null,
        department: form.department.trim() || null,
        position: form.position.trim() || null,
        monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : null,
        daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : null,
        bank_name: form.bank_name.trim() || null,
        bank_account_no: form.bank_account_no.trim() || null,
        gcash_number: form.gcash_number.trim() || null,
        civil_status: form.civil_status || null,
        num_qualified_dependents: form.num_qualified_dependents,
        mdr_submitted: form.mdr_submitted,
        mdr_submitted_date: form.mdr_submitted_date || null,
        mdr_notes: form.mdr_notes,
        cola: form.cola ? parseFloat(form.cola) : 0,
        is_minimum_wage_earner: form.is_minimum_wage_earner,
        rice_allowance:     form.rice_allowance     ? parseFloat(form.rice_allowance)     : 0,
        clothing_allowance: form.clothing_allowance ? parseFloat(form.clothing_allowance) : 0,
        laundry_allowance:  form.laundry_allowance  ? parseFloat(form.laundry_allowance)  : 0,
        medical_allowance:  form.medical_allowance  ? parseFloat(form.medical_allowance)  : 0,
        pagibig_voluntary:  form.pagibig_voluntary  ? parseFloat(form.pagibig_voluntary)  : 0,
      };
      const r = await apiFetch(`${API}/staff-profiles/${encodeURIComponent(form.staff_name.trim())}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!r.ok) { setErr(await r.text()); return; }
      onSaved(await r.json() as StaffProfile);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function syncFromRoster() {
    if (!existing) return;
    setSyncing(true); setSyncMsg("");
    try {
      const r = await apiFetch(`${API}/roster-lookup?staff_name=${encodeURIComponent(existing.staff_name)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { role: string | null; home_branch: string | null; hired_at: string | null };
      const filled: string[] = [];
      if (d.role) { setForm(f => ({ ...f, position: d.role! })); filled.push(`Role → ${d.role}`); }
      if (d.home_branch) { setForm(f => ({ ...f, department: d.home_branch! })); filled.push(`Branch → ${d.home_branch}`); }
      if (d.hired_at) { setForm(f => ({ ...f, hire_date: d.hired_at! })); filled.push(`Hire Date → ${d.hired_at}`); }
      setSyncMsg(filled.length ? `Synced: ${filled.join(" · ")}` : "No roster data found for this staff.");
    } catch (e) {
      setSyncMsg(`Sync failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  const L = "block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide";
  const I = INPUT_CLASS + " bg-slate-800/80 border-white/10 text-white placeholder:text-slate-600";
  const S = SELECT_CLASS + " bg-slate-800/80 border-white/10 text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-base font-semibold text-white">
            {isEdit ? `Edit — ${existing?.staff_name}` : "Add Staff Profile"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          {isEdit && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void syncFromRoster()} disabled={syncing}
                className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 disabled:opacity-50">
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                Sync from Roster
              </button>
              {syncMsg && (
                <span className={`text-xs ${syncMsg.startsWith("Sync failed") || syncMsg.startsWith("No roster") ? "text-amber-400" : "text-emerald-400"}`}>
                  {syncMsg}
                </span>
              )}
            </div>
          )}
          {err && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Staff Name */}
            <div className="col-span-2">
              <label className={L}>Staff Name *</label>
              {isEdit ? (
                <input className={I} value={form.staff_name} disabled
                  placeholder="Full name (must match OS Attendance)" />
              ) : (
                <>
                  <input
                    className={I}
                    list="staff-profile-names-list"
                    value={form.staff_name}
                    onChange={e => set("staff_name", e.target.value)}
                    placeholder="Select from roster or type manually"
                    autoComplete="off"
                  />
                  <datalist id="staff-profile-names-list">
                    {rosterNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose from roster suggestions, or type a new name if not listed.
                  </p>
                </>
              )}
              {isEdit && <p className="mt-1 text-xs text-slate-500">Name cannot be changed after creation</p>}
            </div>

            {/* Bayzat Employee ID */}
            <div className="col-span-2">
              <label className={L}>Bayzat Employee ID</label>
              <input className={I} value={form.bayzat_employee_id}
                onChange={e => set("bayzat_employee_id", e.target.value.toUpperCase())}
                placeholder="e.g. PH25018" />
              <p className="mt-1 text-xs text-slate-500">
                Used for automatic DTR sync from Bayzat. Usually auto-filled by the system.
              </p>
            </div>

            {/* Employment Type + Salary Type */}
            <div>
              <label className={L}>Employment Type</label>
              <SelectDark
                className={S}
                value={form.employment_type}
                onChange={v => set("employment_type", v)}
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "probationary", label: "Probationary" },
                  { value: "contractual", label: "Contractual" },
                  { value: "part_time", label: "Part-time" },
                ]}
              />
            </div>
            <div>
              <label className={L}>Salary Type</label>
              <SelectDark
                className={S}
                value={form.salary_type}
                onChange={v => set("salary_type", v)}
                options={[
                  { value: "monthly_paid", label: "Monthly Paid" },
                  { value: "daily_paid", label: "Daily Paid" },
                ]}
              />
            </div>

            {/* Rates */}
            {!canEditSalary && (
              <div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {canSeeSalary
                  ? "This person's pay is not shown to you, so the rate fields are read-only — saving keeps the stored amounts. A blank here means hidden, not zero."
                  : "Salary amounts are visible to HQ only. The rate and allowance fields below stay hidden, and saving keeps the stored amounts — every other field is yours to edit."}
              </div>
            )}
            <div>
              <label className={L}>Monthly Rate (PHP){canEditSalary ? " *" : ""}</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.monthly_rate : ""}
                onChange={e => set("monthly_rate", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "e.g. 18000.00" : SALARY_HIDDEN} />
            </div>
            <div>
              <label className={L}>Daily Rate (PHP)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.daily_rate : ""}
                onChange={e => set("daily_rate", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "Auto-computed if blank" : SALARY_HIDDEN} />
              {canSeeSalary && <p className="mt-1 text-xs text-slate-500">If blank, engine uses monthly÷26</p>}
            </div>
            <div>
              <label className={L}>COLA (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.cola : ""}
                onChange={e => set("cola", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">Cost of Living Allowance — included in Pag-IBIG base</p>
            </div>
            <div>
              <label className={L}>Pag-IBIG Voluntary (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.pagibig_voluntary : ""}
                onChange={e => set("pagibig_voluntary", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">Extra HDMF contribution above mandatory ₱200 — ER does not match; not deducted from BIR WHT base</p>
            </div>

            {/* Department + Position */}
            <div>
              <label className={L}>Department</label>
              <input className={I} value={form.department} onChange={e => set("department", e.target.value)}
                placeholder="e.g. Kitchen, FOH" />
            </div>
            <div>
              <label className={L}>Position / Role</label>
              <input className={I} value={form.position} onChange={e => set("position", e.target.value)}
                placeholder="e.g. Sushi Chef" />
            </div>

            {/* Dates */}
            <div>
              <label className={L}>Hire Date</label>
              <input className={I} type="date" value={form.hire_date} onChange={e => set("hire_date", e.target.value)} />
            </div>
            <div>
              <label className={L}>Official Hire Date</label>
              <input className={I} type="date" value={form.official_hire_date} onChange={e => set("official_hire_date", e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Used for SIL accrual (5 days after 12 months)</p>
            </div>
            <div>
              <label className={L}>Last Working Date</label>
              <input className={I} type="date" value={form.last_working_date} onChange={e => set("last_working_date", e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Set on resignation — payroll will pro-rate and stop deductions after this date</p>
            </div>

            {/* Government IDs */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Government IDs</p>
            </div>
            <div>
              <label className={L}>SSS Number</label>
              <input className={I} value={form.sss_number} onChange={e => set("sss_number", e.target.value)}
                placeholder="XX-XXXXXXX-X" />
            </div>
            <div>
              <label className={L}>PhilHealth ID</label>
              <input className={I} value={form.philhealth_id} onChange={e => set("philhealth_id", e.target.value)}
                placeholder="XX-XXXXXXXXX-X" />
            </div>
            <div>
              <label className={L}>TIN</label>
              <input className={I} value={form.tin} onChange={e => set("tin", e.target.value)}
                placeholder="XXX-XXX-XXX-000" />
            </div>
            <div>
              <label className={L}>Pag-IBIG MID</label>
              <input className={I} value={form.pagibig_mid} onChange={e => set("pagibig_mid", e.target.value)}
                placeholder="XXXX-XXXX-XXXX" />
            </div>

            {/* Personal & Tax Info */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Personal & Tax Info</p>
            </div>
            <div>
              <label className={L}>Civil Status</label>
              <SelectDark
                className={S}
                value={form.civil_status}
                onChange={v => set("civil_status", v)}
                options={[
                  { value: "", label: "— Not set —" },
                  { value: "single", label: "Single" },
                  { value: "married", label: "Married" },
                  { value: "widowed", label: "Widowed" },
                  { value: "legally_separated", label: "Legally Separated" },
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">Government records / PhilHealth beneficiary registration (no effect on tax calculation under TRAIN law)</p>
            </div>
            <div>
              <label className={L}>Qualified Dependents</label>
              <input className={I} type="number" min="0" max="4" step="1"
                value={form.num_qualified_dependents}
                onChange={e => set("num_qualified_dependents", parseInt(e.target.value) || 0)} />
              <p className="mt-1 text-xs text-slate-500">Government records / SSS beneficiary registration (no effect on BIR under TRAIN law)</p>
            </div>
            <div className="col-span-2">
              <label className={L}>Minimum Wage Earner (MWE)</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="peer sr-only" checked={form.is_minimum_wage_earner}
                    onChange={e => set("is_minimum_wage_earner", e.target.checked)} />
                  <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-amber-600 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
                </label>
                <span className="text-sm text-slate-300">{form.is_minimum_wage_earner ? "MWE — BIR WHT exempt (R.A. 9504)" : "Not MWE"}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Enable only if basic pay = NCR minimum wage. OT and holiday pay also become tax-exempt.</p>
            </div>
            <div className="col-span-2">
              <label className={L}>MDR (Member Data Record) Submitted</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="peer sr-only" checked={form.mdr_submitted}
                    onChange={e => set("mdr_submitted", e.target.checked)} />
                  <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
                </label>
                <span className="text-sm text-slate-300">{form.mdr_submitted ? "Submitted" : "Not yet submitted"}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">PhilHealth document confirming civil status & dependents</p>
            </div>
            {form.mdr_submitted && (
              <div>
                <label className={L}>MDR Submission Date</label>
                <input className={I} type="date" value={form.mdr_submitted_date}
                  onChange={e => set("mdr_submitted_date", e.target.value)} />
              </div>
            )}
            <div className={form.mdr_submitted ? "" : "col-span-2"}>
              <label className={L}>MDR Notes</label>
              <input className={I} value={form.mdr_notes}
                onChange={e => set("mdr_notes", e.target.value)}
                placeholder="e.g. Sent via email 2026-07-20" />
            </div>

            {/* De Minimis */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">De Minimis Benefits (BIR RR 8-2012)</p>
              <p className="text-xs text-slate-600 mb-3">Amounts actually paid per month — exempt from BIR WHT up to the statutory cap shown below.</p>
            </div>
            <div>
              <label className={L}>Rice Subsidy (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.rice_allowance : ""}
                onChange={e => set("rice_allowance", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">BIR cap: ₱2,000/month</p>
            </div>
            <div>
              <label className={L}>Clothing / Uniform Allowance (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.clothing_allowance : ""}
                onChange={e => set("clothing_allowance", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">BIR cap: ₱500/month (₱6,000/year)</p>
            </div>
            <div>
              <label className={L}>Laundry Allowance (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.laundry_allowance : ""}
                onChange={e => set("laundry_allowance", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">BIR cap: ₱300/month</p>
            </div>
            <div>
              <label className={L}>Medical Cash Allowance (PHP/month)</label>
              <input className={I} type={canSeeSalary ? "number" : "text"} min="0" step="0.01"
                value={canSeeSalary ? form.medical_allowance : ""}
                onChange={e => set("medical_allowance", e.target.value)}
                readOnly={!canEditSalary}
                placeholder={canSeeSalary ? "0.00" : SALARY_HIDDEN} />
              <p className="mt-1 text-xs text-slate-500">BIR cap: ₱250/month (to dependents)</p>
            </div>

            {/* Payment */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Payment Details</p>
            </div>
            <div>
              <label className={L}>Bank Name</label>
              <input className={I} value={form.bank_name} onChange={e => set("bank_name", e.target.value)}
                placeholder="e.g. BDO, BPI, UnionBank" />
            </div>
            <div>
              <label className={L}>Bank Account No.</label>
              <input className={I} value={form.bank_account_no} onChange={e => set("bank_account_no", e.target.value)}
                placeholder="Account number" />
            </div>
            <div>
              <label className={L}>GCash Number</label>
              <input className={I} value={form.gcash_number} onChange={e => set("gcash_number", e.target.value)}
                placeholder="09XXXXXXXXX" />
            </div>

            {/* Active */}
            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={form.is_active}
                  onChange={e => set("is_active", e.target.checked)} />
                <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-violet-600 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm text-slate-300">Active employee</span>
            </div>

            {/* Confidential */}
            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={form.is_confidential}
                  onChange={e => set("is_confidential", e.target.checked)} />
                <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-rose-600 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <div>
                <span className="text-sm text-slate-300">Confidential salary (HQ only)</span>
                <p className="text-xs text-slate-500 mt-0.5">Salary hidden from non-HQ users. Not included in payroll runs — counts in P&amp;L only.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => { void save(); }} disabled={saving}
            className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? "Save Changes" : "Add Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function StaffProfilesPage() {
  const router = useRouter();
  const isHQ = getAuth()?.role === "HQ";
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaffProfile | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{ matched: number; staff: { staff_name: string; bayzat_employee_id: string }[] } | null>(null);
  const loadRef = useRef(0);

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) {
      router.replace("/week");
    }
  }, [router]);

  const load = useCallback(async (activeOnly = !showInactive) => {
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API}/staff-profiles?active_only=${activeOnly}`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      setProfiles(await r.json() as StaffProfile[]);
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { void load(); }, [load]);

  async function runAutoMatch() {
    setAutoMatching(true);
    setAutoMatchResult(null);
    try {
      const r = await apiFetch(`${API}/staff-profiles/auto-match`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as typeof autoMatchResult;
      setAutoMatchResult(data);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAutoMatching(false);
    }
  }

  function onSaved(p: StaffProfile) {
    setShowModal(false);
    setEditing(null);
    setProfiles(prev => {
      const idx = prev.findIndex(x => x.staff_name === p.staff_name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [...prev, p].sort((a, b) => a.staff_name.localeCompare(b.staff_name));
    });
  }

  async function deactivateProfile(p: StaffProfile) {
    if (!window.confirm(`Deactivate "${p.staff_name}"?\n\nThe profile will be hidden from active lists. This can be reversed by toggling "Showing All" and editing the profile.`)) return;
    setError("");
    try {
      const body = {
        staff_name: p.staff_name,
        bayzat_employee_id: p.bayzat_employee_id || null,
        sss_number: p.sss_number || null,
        philhealth_id: p.philhealth_id || null,
        tin: p.tin || null,
        pagibig_mid: p.pagibig_mid || null,
        employment_type: p.employment_type,
        salary_type: p.salary_type,
        hire_date: p.hire_date || null,
        official_hire_date: p.official_hire_date || null,
        last_working_date: p.last_working_date || null,
        department: p.department || null,
        position: p.position || null,
        monthly_rate: p.monthly_rate ? parseFloat(p.monthly_rate) : null,
        daily_rate: p.daily_rate ? parseFloat(p.daily_rate) : null,
        bank_name: p.bank_name || null,
        bank_account_no: p.bank_account_no || null,
        gcash_number: p.gcash_number || null,
        is_active: false,
        is_confidential: p.is_confidential,
        civil_status: p.civil_status || null,
        num_qualified_dependents: p.num_qualified_dependents,
        mdr_submitted: p.mdr_submitted,
        mdr_submitted_date: p.mdr_submitted_date || null,
        mdr_notes: p.mdr_notes,
        cola: p.cola ? parseFloat(p.cola) : 0,
        is_minimum_wage_earner: p.is_minimum_wage_earner,
        rice_allowance: p.rice_allowance ? parseFloat(p.rice_allowance) : 0,
        clothing_allowance: p.clothing_allowance ? parseFloat(p.clothing_allowance) : 0,
        laundry_allowance: p.laundry_allowance ? parseFloat(p.laundry_allowance) : 0,
        medical_allowance: p.medical_allowance ? parseFloat(p.medical_allowance) : 0,
        pagibig_voluntary: p.pagibig_voluntary ? parseFloat(p.pagibig_voluntary) : 0,
      };
      const r = await apiFetch(`${API}/staff-profiles/${encodeURIComponent(p.staff_name)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!r.ok) { setError(await r.text()); return; }
      const updated = await r.json() as StaffProfile;
      setProfiles(prev =>
        showInactive
          ? prev.map(x => x.staff_name === p.staff_name ? updated : x)
          : prev.filter(x => x.staff_name !== p.staff_name)
      );
    } catch (e) {
      setError(String(e));
    }
  }

  function php(v: string | null) {
    if (!v) return "—";
    return `₱${parseFloat(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getReadiness(p: StaffProfile) {
    // The rate is masked to null for non-HQ, so this check cannot be evaluated —
    // counting it as missing flagged every single employee as not payroll-ready.
    const checks = [
      ...(isHQ ? [{ label: "Rate", ok: !!(p.monthly_rate || p.daily_rate) }] : []),
      { label: "SSS No.",    ok: !!p.sss_number },
      { label: "PhilHealth", ok: !!p.philhealth_id },
      { label: "Pag-IBIG",   ok: !!p.pagibig_mid },
      { label: "TIN",        ok: !!p.tin },
      { label: "Bank/GCash", ok: !!(p.bank_account_no || p.gcash_number) },
    ];
    const missing = checks.filter(c => !c.ok).map(c => c.label);
    return { score: checks.length - missing.length, total: checks.length, missing };
  }

  const payrollReadyCount = profiles.filter(p => getReadiness(p).score === 6).length;

  const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
    regular: "Regular", probationary: "Probationary",
    contractual: "Contractual", part_time: "Part-time",
  };

  const unlinkedCount = profiles.filter(p => !p.bayzat_employee_id).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/admin/payroll/manila"
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
                <ChevronLeft size={15} /> Manila Payroll
              </Link>
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <Users size={28} className="text-violet-400" />
              Staff Profiles
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manila payroll employee records — government IDs, rates, and Bayzat linking
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={() => { void runAutoMatch(); }}
              disabled={autoMatching}
              title="Auto-match staff names to Bayzat Employee IDs"
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
              {autoMatching ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Auto-Match Bayzat
            </button>
            <button
              onClick={() => setShowInactive(v => !v)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                showInactive
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              {showInactive ? "Showing All" : "Active Only"}
            </button>
            <button onClick={() => { void load(!showInactive); }}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
              <Plus size={16} /> Add Staff
            </button>
          </div>
        </div>

        {/* Auto-match result banner */}
        {autoMatchResult && (
          <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            autoMatchResult.matched > 0
              ? "border-emerald-500/20 bg-emerald-900/20 text-emerald-300"
              : "border-slate-500/20 bg-slate-800/40 text-slate-400"
          }`}>
            <Wand2 size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                {autoMatchResult.matched > 0
                  ? `${autoMatchResult.matched} staff matched to Bayzat IDs`
                  : "No new matches found — all staff are already linked or names don't match"}
              </p>
              {autoMatchResult.staff.length > 0 && (
                <p className="mt-1 text-xs opacity-80">
                  {autoMatchResult.staff.map(s => `${s.staff_name} → ${s.bayzat_employee_id}`).join(", ")}
                </p>
              )}
            </div>
            <button onClick={() => setAutoMatchResult(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Stats */}
        {!loading && profiles.length > 0 && (
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Total Profiles", value: profiles.length, color: "text-white" },
              { label: "Active", value: profiles.filter(p => p.is_active).length, color: "text-emerald-300" },
              { label: "Payroll Ready", value: payrollReadyCount, color: payrollReadyCount === profiles.filter(p => p.is_active).length ? "text-emerald-300" : "text-amber-300" },
              { label: "Monthly Paid", value: profiles.filter(p => p.salary_type === "monthly_paid").length, color: "text-violet-300" },
              { label: "Bayzat Unlinked", value: unlinkedCount, color: unlinkedCount > 0 ? "text-amber-300" : "text-emerald-300" },
            ].map(s => (
              <div key={s.label} className={GLASS_CARD + " p-4"}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Unlinked warning */}
        {!loading && unlinkedCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-900/10 px-4 py-3 text-sm text-amber-300">
            <Link2Off size={16} className="shrink-0" />
            <span>
              <span className="font-semibold">{unlinkedCount} staff</span> have no Bayzat Employee ID linked.
              Click <strong>Auto-Match Bayzat</strong> to link them automatically, or edit each profile manually.
            </span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-violet-400" />
          </div>
        ) : profiles.length === 0 ? (
          <div className={GLASS_CARD + " p-12 text-center"}>
            <Users size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No staff profiles yet.</p>
            <p className="mt-1 text-sm text-slate-500">Add employees to enable payroll computation.</p>
          </div>
        ) : (
          <div className={GLASS_CARD + " overflow-hidden"}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Name</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Bayzat ID</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Position</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Type</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Monthly Rate</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Gov IDs</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Payroll Ready</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>MDR</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Status</th>
                    <th className={TABLE_HEADER + " w-12"} />
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => {
                    const govIdCount = [p.sss_number, p.philhealth_id, p.tin, p.pagibig_mid].filter(Boolean).length;
                    return (
                      <tr key={p.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4 py-3"}>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white">{p.staff_name}</p>
                            {p.is_confidential && (
                              <span className="rounded-full border border-rose-500/30 bg-rose-900/20 px-1.5 py-0.5 text-[10px] text-rose-400">Confidential</span>
                            )}
                          </div>
                          {p.department && <p className="text-xs text-slate-500">{p.department}</p>}
                          {p.last_working_date && (
                            <p className="text-xs text-amber-400 mt-0.5">Last day: {p.last_working_date}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.bayzat_employee_id ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-900/30 px-2 py-0.5 text-xs font-mono text-violet-300">
                              <Link2 size={10} />
                              {p.bayzat_employee_id}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-900/20 px-2 py-0.5 text-xs text-amber-400">
                              <Link2Off size={10} />
                              Unlinked
                            </span>
                          )}
                        </td>
                        <td className={TABLE_CELL + " px-3 py-3 text-slate-300"}>
                          {p.position ?? <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                            {EMPLOYMENT_TYPE_LABEL[p.employment_type] ?? p.employment_type}
                          </span>
                        </td>
                        <td className={TABLE_CELL + " px-3 py-3 text-right tabular-nums font-medium text-white"}>
                          {p.is_confidential && !isHQ
                            ? <span className="text-slate-500 tracking-widest">****</span>
                            : php(p.monthly_rate)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            govIdCount === 4
                              ? "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30"
                              : govIdCount > 0
                              ? "bg-amber-900/40 text-amber-300 border border-amber-500/30"
                              : "bg-red-900/40 text-red-300 border border-red-500/30"
                          }`}>
                            {govIdCount}/4
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {(() => {
                            const { score, total, missing } = getReadiness(p);
                            return (
                              <span
                                title={missing.length ? `Missing: ${missing.join(", ")}` : "All required fields complete"}
                                className={`cursor-default rounded-full px-2 py-0.5 text-xs font-medium ${
                                  score === total
                                    ? "border border-emerald-500/30 bg-emerald-900/40 text-emerald-300"
                                    : score >= 4
                                    ? "border border-amber-500/30 bg-amber-900/40 text-amber-300"
                                    : "border border-red-500/30 bg-red-900/40 text-red-300"
                                }`}>
                                {score}/{total}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.mdr_submitted ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-300">
                              <CheckCircle2 size={10} /> Done
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.is_active ? (
                            <CheckCircle2 size={15} className="mx-auto text-emerald-400" />
                          ) : (
                            <XCircle size={15} className="mx-auto text-slate-600" />
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditing(p); setShowModal(true); }}
                              title="Edit profile"
                              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition">
                              <Pencil size={11} />
                            </button>
                            {p.is_active && (
                              <button
                                onClick={() => void deactivateProfile(p)}
                                title="Deactivate profile"
                                className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-900/10 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition">
                                <PowerOff size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between text-xs text-slate-500">
          <Link href="/admin/payroll/manila" className="hover:text-slate-300">← Back to Manila Payroll</Link>
          <span>{profiles.length} profile{profiles.length !== 1 ? "s" : ""} loaded</span>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <ProfileModal
          existing={editing}
          onSaved={onSaved}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
