"use client";

/**
 * Employee profiles, HR's side of My Profile: every employee with what is
 * missing and what waits for HR to check, the profile itself (HR saves at
 * once), and the employee's changes to government numbers and the payroll
 * account, verified or rejected against the document.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import ProfileForm, { type StaffProfile } from "@/components/ProfileForm";
import { BADGE_SUCCESS, BADGE_WARNING, SMALL_BUTTON, T_CAPTION } from "@/lib/ui-tokens";

type Row = { staff_name: string; missing: string[]; complete: boolean; pending: number; payroll_profile_exists: boolean };

function Pending({ profile, onDone }: { profile: StaffProfile; onDone: (p: StaffProfile) => void }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  if (profile.pending.length === 0) return null;
  async function review(id: string, approve: boolean) {
    setErr("");
    try {
      onDone(await apiPost<StaffProfile>(`/api/admin/hr/onboarding/profile-requests/${id}`, { approve, note: note[id] || "" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="profile-pending">
      <p className="text-sm font-semibold text-amber-200">Waiting for you to check against the document</p>
      {profile.pending.map((p) => (
        <div key={p.id} className="space-y-1 rounded border border-white/10 p-2 text-sm">
          <p className="text-white">{profile.sensitive_fields[p.field] || p.field}: <span className="font-mono">{p.value}</span></p>
          <p className={T_CAPTION}>Was: {profile.values[p.field] || "—"} · sent {new Date(p.submitted_at).toLocaleDateString()}</p>
          <input className="w-full rounded border border-white/10 bg-white/6 px-2 py-1 text-xs text-white" aria-label={`Note for ${p.field}`}
            placeholder="Reason, if rejecting" value={note[p.id] || ""} onChange={(e) => setNote({ ...note, [p.id]: e.target.value })} />
          <div className="flex gap-2">
            <button className={`${SMALL_BUTTON} text-emerald-300`} onClick={() => void review(p.id, true)}>Verified — use it</button>
            <button className={`${SMALL_BUTTON} text-red-300`} onClick={() => void review(p.id, false)}>Reject</button>
          </div>
        </div>
      ))}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

export default function EmployeeProfiles({ city, onClose }: { city: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<StaffProfile | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setRows((await apiGet<{ profiles: Row[] }>(`/api/admin/hr/onboarding/profiles?city=${encodeURIComponent(city)}`)).profiles);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, [city]);
  useEffect(() => { void load(); }, [load]);

  async function openProfile(name: string) {
    setErr("");
    try {
      setOpen(await apiGet<StaffProfile>(`/api/admin/hr/onboarding/profiles/${encodeURIComponent(name)}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function saveHr(changes: Record<string, string>) {
    if (!open) return;
    setOpen(await apiPost<StaffProfile>(`/api/admin/hr/onboarding/profiles/${encodeURIComponent(open.staff_name)}`, changes));
    void load();
  }

  const shown = rows.filter((r) => r.staff_name.toLowerCase().includes(q.trim().toLowerCase()));
  const pendingTotal = rows.reduce((s, r) => s + r.pending, 0);
  const complete = rows.filter((r) => r.complete).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-zinc-950 p-5" onClick={(e) => e.stopPropagation()}
        data-testid="employee-profiles">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{open ? open.staff_name : "Employee profiles"}</h2>
          <button className="text-sm text-zinc-400 hover:text-white" onClick={open ? () => setOpen(null) : onClose}>{open ? "Back" : "Close"}</button>
        </div>
        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
        {open ? (
          <div className="space-y-4">
            <Pending profile={open} onDone={(p) => { setOpen(p); void load(); }} />
            <ProfileForm key={JSON.stringify(open.values) + open.pending.length} profile={open} mode="hr" onSave={saveHr} />
          </div>
        ) : (
          <>
            <p className={`${T_CAPTION} mb-3`}>
              Employees fill in My Profile themselves. {complete} of {rows.length} complete
              {pendingTotal ? ` · ${pendingTotal} change${pendingTotal === 1 ? "" : "s"} waiting for you to check` : ""}.
            </p>
            <input className="mb-3 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white" aria-label="Search employees"
              placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="divide-y divide-white/5">
              {shown.map((r) => (
                <li key={r.staff_name}>
                  <button className="flex w-full items-center justify-between gap-2 py-2 text-left" onClick={() => void openProfile(r.staff_name)}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{r.staff_name}</span>
                      {!r.complete && <span className="block truncate text-xs text-zinc-500">Missing: {r.missing.join(", ")}</span>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {r.pending > 0 && <span className={BADGE_WARNING}>{r.pending} to check</span>}
                      {r.complete ? <span className={BADGE_SUCCESS}>Complete</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
