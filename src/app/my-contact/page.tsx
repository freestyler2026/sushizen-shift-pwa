"use client";

import { isoToday } from "@/lib/date";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock, Phone, ShieldCheck } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, T_CAPTION, T_BODY, T_LABEL } from "@/lib/ui-tokens";
import ProfileForm, { type StaffProfile } from "@/components/ProfileForm";

/**
 * My Profile (HR Manager's request, 2026-11-24): the employee's own record --
 * personal details, emergency contact, government numbers and the payroll
 * account. Kept by the employee, checked by HR. It grew out of "My details",
 * which held only the phone number (for emergencies at a store) and the start
 * date; both are still here.
 */

export default function MyContactPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Start date. Held apart from the phone number because it is not simply a
  // fact about you — it decides how much leave you are owed, so HR checks it
  // against the contract before it counts.
  const [hireDate, setHireDate] = useState("");
  const [hireSaved, setHireSaved] = useState("");
  const [hireConfirmed, setHireConfirmed] = useState("");
  const [earliest, setEarliest] = useState("");
  const [hireBusy, setHireBusy] = useState(false);
  const [hireBanner, setHireBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rp, re] = await Promise.all([
        fetch("/api/me/profile", { headers: getAuthHeaders(getAuth()) }),
        fetch("/api/me/employment", { headers: getAuthHeaders(getAuth()) }),
      ]);
      const d = await rp.json().catch(() => ({}));
      if (!rp.ok) throw new Error(d?.detail || `HTTP ${rp.status}`);
      setProfile(d as StaffProfile);
      if (re.ok) {
        const e = await re.json();
        const shown = e.confirmed_hire_date || e.claimed_hire_date || "";
        setHireDate(shown);
        setHireSaved(shown);
        setHireConfirmed(e.confirmed_hire_date || "");
        setEarliest(e.earliest_allowed || "");
      }
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load: ${e}` });
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveHireDate() {
    setHireBusy(true);
    setHireBanner(null);
    try {
      const res = await fetch("/api/me/employment", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ hire_date: hireDate }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setHireSaved(j?.claimed_hire_date || hireDate);
      setHireBanner({ kind: "ok", text: "Thank you. HR will check it against your contract." });
    } catch (e) {
      setHireBanner({ kind: "err", text: `${e instanceof Error ? e.message : e}` });
    } finally {
      setHireBusy(false);
    }
  }

  useEffect(() => {
    if (!getAuth()) {
      router.replace("/login?next=%2Fmy-contact");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(changes: Record<string, string>) {
    const res = await fetch("/api/me/profile", {
      method: "POST",
      headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
    setProfile(j as StaffProfile);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 space-y-5">
      <div>
        <h1 className={T_PAGE_TITLE}>My Profile</h1>
        <p className={T_BODY + " mt-1"}>
          Your details for HR and payroll. Keep them current; HR checks government numbers and
          your payroll account before they are used.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm leading-relaxed text-amber-100/90">
          For a fire, an injury or a store having to close, nobody opens the app — they
          call. Your number has to already be here for that to work.
        </p>
      </div>

      {banner && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-200">{banner.text}</div>
      )}

      <div className={GLASS_CARD + " p-5"}>
        {loading || !profile ? (
          <p className={T_CAPTION}>Loading…</p>
        ) : (
          <ProfileForm key={JSON.stringify(profile.values) + profile.pending.length} profile={profile} mode="self" onSave={saveProfile} />
        )}
      </div>

      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        <p className={T_CAPTION + " leading-relaxed"}>
          Only you and HR can see and change this page. Every change is recorded with who made it.
        </p>
      </div>

      {/* ── The date you started ─────────────────────────────────────────── */}
      <div className={GLASS_CARD + " space-y-4 p-5"}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">The date you started</h2>
        </div>

        <p className={T_CAPTION + " leading-relaxed"}>
          Your leave is counted from this date, so it needs to be right. Use the date on
          your contract — your first day of work, not the day you signed or were
          interviewed. If you are not sure, leave it blank and ask HR rather than guessing.
        </p>

        {hireConfirmed ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-200">
              <Check className="h-4 w-4" />
              {hireConfirmed}
            </div>
            <div className={T_CAPTION + " mt-1"}>
              Confirmed by HR. To change it, speak to HR with your contract.
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className={T_LABEL}>Your first day of work</div>
              <input
                type="date"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-base tabular-nums text-white outline-none focus:border-violet-500/50"
                value={hireDate}
                min={earliest || undefined}
                max={isoToday()}
                onChange={(e) => setHireDate(e.target.value)}
                disabled={loading}
              />
            </div>

            {hireSaved && hireSaved === hireDate && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-2.5">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Sent to HR. It does not count towards your leave until HR has checked it
                  against your contract.
                </p>
              </div>
            )}

            {hireBanner && (
              <div
                className={`rounded-lg border p-2.5 text-sm ${
                  hireBanner.kind === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-red-500/30 bg-red-500/10 text-red-200"
                }`}
              >
                {hireBanner.text}
              </div>
            )}

            <button
              onClick={saveHireDate}
              disabled={hireBusy || loading || !hireDate || hireDate === hireSaved}
              className={PRIMARY_BUTTON + " w-full disabled:opacity-40"}
            >
              {hireBusy ? "Sending…" : hireSaved && hireDate === hireSaved ? "Sent to HR" : "Send to HR"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
