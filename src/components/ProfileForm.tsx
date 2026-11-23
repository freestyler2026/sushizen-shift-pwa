"use client";

/**
 * One employee record, kept by the employee (My Profile) and by HR (HR
 * Onboarding > Employee profiles). The rules are on the server
 * (app/db_staff_profile.py): what the employee types for a government number
 * or the payroll account waits for HR to check it against the document.
 */

import { useMemo, useState } from "react";
import { T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

export type StaffProfile = {
  staff_name: string;
  city: "manila" | "dubai";
  status: string;
  values: Record<string, string>;
  sensitive_fields: Record<string, string>;
  payroll_profile_exists: boolean;
  pending: { id: string; field: string; value: string; submitted_by: string; submitted_at: string }[];
  missing: string[];
  complete: boolean;
  history: { field: string; old_value: string; new_value: string; changed_by: string; via: string; changed_at: string }[];
};

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 disabled:opacity-60";

const LABEL: Record<string, string> = {
  date_of_birth: "Date of birth", phone: "Mobile number", email: "Email address", address: "Home address",
  emergency_name: "Contact person", emergency_relation: "Relationship", emergency_phone: "Their mobile number",
  position: "Position", hire_date: "Date of hire",
};

export default function ProfileForm({ profile, mode, onSave }: {
  profile: StaffProfile;
  mode: "self" | "hr";
  onSave: (changes: Record<string, string>) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, string>>({ ...profile.values });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hr = mode === "hr";
  const pendingBy = useMemo(() => Object.fromEntries(profile.pending.map((p) => [p.field, p])), [profile.pending]);
  const changes = Object.fromEntries(Object.entries(v).filter(([k, x]) => (profile.values[k] || "") !== (x || "")));
  const sensitive = profile.sensitive_fields;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await onSave(changes);
      const held = !hr && Object.keys(changes).some((k) => k in sensitive);
      setMsg({ ok: true, text: held ? "Saved. Government numbers and the payroll account go to HR to check first." : "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const input = (k: string, opts: { type?: string; ro?: boolean; placeholder?: string; label?: string } = {}) => {
    const p = pendingBy[k];
    return (
      <label key={k} className="block">
        <span className={T_LABEL}>{opts.label || LABEL[k] || sensitive[k] || k}</span>
        {k === "address" ? (
          <textarea className={FIELD} rows={2} aria-label={opts.label || LABEL[k]} value={v[k] || ""} disabled={opts.ro}
            onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={opts.placeholder} />
        ) : (
          <input className={FIELD} type={opts.type || "text"} aria-label={opts.label || LABEL[k] || sensitive[k]} value={v[k] || ""}
            disabled={opts.ro} placeholder={opts.placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        )}
        {p && (
          <span className="mt-1 block text-xs text-amber-300">
            Waiting for HR to check: {p.value}
          </span>
        )}
      </label>
    );
  };

  const isManila = profile.city === "manila";
  return (
    <div className="space-y-5" data-testid="profile-form">
      {profile.missing.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          Still missing: {profile.missing.join(", ")}.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Personal</h2>
        <div>
          <span className={T_LABEL}>Full name</span>
          <p className="mt-1 text-sm text-zinc-200">{profile.staff_name}</p>
          <p className={T_CAPTION}>{hr ? "Renamed on the Staff page (it carries to payroll and login)." : "Wrong spelling? Tell HR — it is your login and payroll name."}</p>
        </div>
        {input("date_of_birth", { type: "date" })}
        {input("phone", { type: "tel", placeholder: "0917 123 4567" })}
        {input("email", { type: "email", placeholder: "name@example.com" })}
        {input("address", { placeholder: "House no., street, barangay, city" })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">In case of emergency</h2>
        {input("emergency_name")}
        {input("emergency_relation", { placeholder: "e.g. Mother" })}
        {input("emergency_phone", { type: "tel" })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Employment</h2>
        {input("position", { ro: !hr })}
        {hr ? input("hire_date", { type: "date" }) : (
          <div>
            <span className={T_LABEL}>Date of hire</span>
            <p className="mt-1 text-sm text-zinc-200">{profile.values.hire_date || "Not confirmed yet"}</p>
          </div>
        )}
      </section>

      {isManila && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Government numbers</h2>
          {!hr && <p className={T_CAPTION}>HR checks these against your IDs before they are used for your contributions.</p>}
          {input("sss_number", { placeholder: "34-1234567-8" })}
          {input("philhealth_id", { placeholder: "12 digits" })}
          {input("pagibig_mid", { placeholder: "12 digits" })}
          {input("tin", { placeholder: "123-456-789-000" })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Payroll account</h2>
        {!hr && <p className={T_CAPTION}>HR checks a new account before your pay goes to it.</p>}
        {input("bank_name", { label: isManila ? "Bank or wallet (e.g. BPI, BDO, GCash)" : "Bank" })}
        {input("bank_account_no", { label: isManila ? "Bank account number" : "Bank account / IBAN" })}
        {isManila && input("gcash_number", { type: "tel", label: "GCash number", placeholder: "09xx xxx xxxx" })}
        {hr && !profile.payroll_profile_exists && (
          <p className="text-xs text-amber-300">No payroll profile yet: create it under Payroll &gt; Staff profiles before these can be saved.</p>
        )}
      </section>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.text}</p>}
      <button
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white disabled:opacity-40"
        disabled={busy || Object.keys(changes).length === 0}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save"}
      </button>

      {profile.history.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">Change history</summary>
          <ul className="mt-2 space-y-1">
            {profile.history.map((h, i) => (
              <li key={i}>
                {new Date(h.changed_at).toLocaleString()} · {LABEL[h.field] || sensitive[h.field] || h.field}: {h.old_value || "—"} → {h.new_value || "—"} · {h.changed_by}
                {h.via === "verified" ? " (checked by HR)" : h.via === "hr" ? " (HR)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
