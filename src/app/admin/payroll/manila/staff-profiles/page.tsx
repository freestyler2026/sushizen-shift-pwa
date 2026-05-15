"use client";

import {
  AlertCircle, ChevronLeft, Loader2, Plus, RefreshCw,
  Users, X, Pencil, CheckCircle2, XCircle, Link2, Link2Off, Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, INPUT_CLASS, SELECT_CLASS, TABLE_HEADER, TABLE_ROW, TABLE_CELL } from "@/lib/ui-tokens";

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
  department: string | null;
  position: string | null;
  monthly_rate: string | null;
  daily_rate: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  gcash_number: string | null;
  is_active: boolean;
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
  department: string;
  position: string;
  monthly_rate: string;
  daily_rate: string;
  bank_name: string;
  bank_account_no: string;
  gcash_number: string;
  is_active: boolean;
};

function emptyForm(): FormState {
  return {
    staff_name: "", bayzat_employee_id: "",
    sss_number: "", philhealth_id: "", tin: "", pagibig_mid: "",
    employment_type: "regular", salary_type: "monthly_paid",
    hire_date: "", official_hire_date: "",
    department: "", position: "",
    monthly_rate: "", daily_rate: "",
    bank_name: "", bank_account_no: "", gcash_number: "",
    is_active: true,
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
    department: p.department ?? "",
    position: p.position ?? "",
    monthly_rate: p.monthly_rate ?? "",
    daily_rate: p.daily_rate ?? "",
    bank_name: p.bank_name ?? "",
    bank_account_no: p.bank_account_no ?? "",
    gcash_number: p.gcash_number ?? "",
    is_active: p.is_active,
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

  const isEdit = !!existing;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.staff_name.trim()) { setErr("Staff name is required"); return; }
    if (!form.monthly_rate && !form.daily_rate) { setErr("Either monthly rate or daily rate is required"); return; }
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
        department: form.department.trim() || null,
        position: form.position.trim() || null,
        monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : null,
        daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : null,
        bank_name: form.bank_name.trim() || null,
        bank_account_no: form.bank_account_no.trim() || null,
        gcash_number: form.gcash_number.trim() || null,
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
          {err && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Staff Name */}
            <div className="col-span-2">
              <label className={L}>Staff Name *</label>
              <input className={I} value={form.staff_name}
                onChange={e => set("staff_name", e.target.value)}
                placeholder="Full name (must match OS Attendance)" disabled={isEdit} />
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
              <select className={S} value={form.employment_type} onChange={e => set("employment_type", e.target.value)}>
                <option value="regular">Regular</option>
                <option value="probationary">Probationary</option>
                <option value="contractual">Contractual</option>
                <option value="part_time">Part-time</option>
              </select>
            </div>
            <div>
              <label className={L}>Salary Type</label>
              <select className={S} value={form.salary_type} onChange={e => set("salary_type", e.target.value)}>
                <option value="monthly_paid">Monthly Paid</option>
                <option value="daily_paid">Daily Paid</option>
              </select>
            </div>

            {/* Rates */}
            <div>
              <label className={L}>Monthly Rate (PHP) *</label>
              <input className={I} type="number" min="0" step="0.01" value={form.monthly_rate}
                onChange={e => set("monthly_rate", e.target.value)}
                placeholder="e.g. 18000.00" />
            </div>
            <div>
              <label className={L}>Daily Rate (PHP)</label>
              <input className={I} type="number" min="0" step="0.01" value={form.daily_rate}
                onChange={e => set("daily_rate", e.target.value)}
                placeholder="Auto-computed if blank" />
              <p className="mt-1 text-xs text-slate-500">If blank, engine uses monthly÷26</p>
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

  function php(v: string | null) {
    if (!v) return "—";
    return `₱${parseFloat(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

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
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Profiles", value: profiles.length, color: "text-white" },
              { label: "Active", value: profiles.filter(p => p.is_active).length, color: "text-emerald-300" },
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
              <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Name</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Bayzat ID</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Position</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Type</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Monthly Rate</th>
                    <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Gov IDs</th>
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
                          <p className="font-semibold text-white">{p.staff_name}</p>
                          {p.department && <p className="text-xs text-slate-500">{p.department}</p>}
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
                          {php(p.monthly_rate)}
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
                          {p.is_active ? (
                            <CheckCircle2 size={15} className="mx-auto text-emerald-400" />
                          ) : (
                            <XCircle size={15} className="mx-auto text-slate-600" />
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <button
                            onClick={() => { setEditing(p); setShowModal(true); }}
                            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition">
                            <Pencil size={11} />
                          </button>
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
