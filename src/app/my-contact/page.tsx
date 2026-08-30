"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock, Phone, ShieldCheck } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, T_CAPTION, T_BODY, T_LABEL } from "@/lib/ui-tokens";

/**
 * Your own number, entered by you.
 *
 * Level 3 is fire, injury, a forced closure — nobody opens an app during a
 * fire, they call. The number has to be here before it is needed, and the
 * person who knows it and will keep it current is its owner.
 */

export default function MyContactPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const [rc, re] = await Promise.all([
        fetch("/api/me/contact", { headers: getAuthHeaders(getAuth()) }),
        fetch("/api/me/employment", { headers: getAuthHeaders(getAuth()) }),
      ]);
      if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
      const d = await rc.json();
      setPhone(d.phone || "");
      setSaved(d.phone || "");
      setName(d.staff_name || getAuth()?.staffName || "");
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

  async function save() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/me/contact", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setSaved(d.phone || "");
      setPhone(d.phone || "");
      setBanner({ kind: "ok", text: "Saved. HQ can reach you now." });
    } catch (e) {
      setBanner({ kind: "err", text: `${e instanceof Error ? e.message : e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 space-y-5">
      <div>
        <h1 className={T_PAGE_TITLE}>My details</h1>
        <p className={T_BODY + " mt-1"}>
          Two things only you can tell us: how to reach you, and when you started.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm leading-relaxed text-amber-100/90">
          For a fire, an injury or a store having to close, nobody opens the app — they
          call. Your number has to already be here for that to work.
        </p>
      </div>

      <div className={GLASS_CARD + " space-y-4 p-5"}>
        <div>
          <div className={T_LABEL}>You</div>
          <div className="mt-1 text-sm text-zinc-200">{name || "—"}</div>
        </div>

        <div>
          <div className={T_LABEL}>Your number</div>
          <input
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-base tabular-nums text-white outline-none focus:border-violet-500/50"
            placeholder="+63 917 123 4567"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
          />
          <div className={T_CAPTION + " mt-1.5"}>
            Include the country code. WhatsApp is fine — it is the same number.
          </div>
        </div>

        {banner && (
          <div
            className={`rounded-lg border p-2.5 text-sm ${
              banner.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {banner.text}
          </div>
        )}

        <button
          onClick={save}
          disabled={busy || loading || phone === saved}
          className={PRIMARY_BUTTON + " w-full disabled:opacity-40"}
        >
          {busy ? "Saving…" : saved && phone === saved ? "Saved" : "Save"}
        </button>

        {saved && phone === saved && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            On file
          </div>
        )}
      </div>

      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        <p className={T_CAPTION + " leading-relaxed"}>
          Only you can change this, and only HQ and HR can see it. It is used to reach you
          about an emergency at a store — nothing else.
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
                max={new Date().toISOString().slice(0, 10)}
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
