"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, FileText, Send, Siren } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, T_CAPTION, T_BODY, T_LABEL } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

/**
 * Two doors, one room.
 *
 * A water outage was never reported through Incident Report, because an
 * incident is understood as something we did wrong and need to analyse.
 * Facility and Weather have been options since the start and have been used
 * zero times in sixteen reports — so the barrier was the word, not the list.
 *
 * This asks the only question a person can answer without judgement: is
 * something happening now. What kind of thing it is, and whose fault, gets
 * decided later by people with time to decide it.
 */

const URGENT_CATEGORIES = [
  { value: "Water", label: "Water — no supply / low pressure", level: 2 },
  { value: "Electricity", label: "Electricity — outage", level: 2 },
  { value: "Gas", label: "Gas — supply stopped / leak risk", level: 2 },
  { value: "Fire", label: "Fire", level: 3 },
  { value: "Injury", label: "Injury to someone", level: 3 },
  { value: "Flood", label: "Flood", level: 3 },
  { value: "Forced Closure", label: "Forced to close", level: 3 },
  { value: "Security", label: "Security — theft, intruder, threat", level: 2 },
  { value: "Equipment Failure", label: "Equipment failure (freezer, oven…)", level: 0 },
  { value: "Weather", label: "Weather — typhoon, storm", level: 0 },
  { value: "Facility", label: "Building / facility problem", level: 0 },
  { value: "Other (urgent)", label: "Something else happening now", level: 0 },
];

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function StoreReportPage() {
  const router = useRouter();
  const [door, setDoor] = useState<"" | "urgent">("");
  const [city, setCity] = useState("");
  const [branch, setBranch] = useState("");
  const [category, setCategory] = useState("");
  const [noticedAt, setNoticedAt] = useState(localNow());
  const [affected, setAffected] = useState<boolean | null>(null);
  const [canContinue, setCanContinue] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [needHelp, setNeedHelp] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ level: number; lag: number | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fstore%2Freport");
      return;
    }
    setCity(auth.city || "manila");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = URGENT_CATEGORIES.find((c) => c.value === category);
  const level = picked ? (picked.level || (affected ? 2 : 1)) : 0;
  const ready = Boolean(category && affected !== null && canContinue);

  async function submit() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/incidents/urgent", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          branch,
          reporter_name: getAuth()?.staffName || "",
          category,
          description,
          incident_datetime: noticedAt,
          operation_affected: affected,
          can_continue: canContinue,
          immediate_action: action,
          hq_help_needed: needHelp ?? false,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setSent({ level: d.level, lag: d.reported_lag_min ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className={GLASS_CARD + " p-6 text-center"}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
            <Send className="h-6 w-6 text-emerald-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">HQ has been alerted</h1>
          <p className={T_BODY + " mt-2"}>
            Level {sent.level}. Somebody at HQ has to take this on before the alerts stop,
            so you do not need to chase it.
          </p>
          {sent.lag !== null && (
            <p className={T_CAPTION + " mt-3"}>
              You reported this {sent.lag} minute{sent.lag === 1 ? "" : "s"} after noticing it.
            </p>
          )}
          <button onClick={() => router.push("/")} className={PRIMARY_BUTTON + " mt-5 w-full"}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!door) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 space-y-4">
        <h1 className={T_PAGE_TITLE}>Report something</h1>
        <p className={T_BODY}>Which of these is it?</p>

        <button
          onClick={() => setDoor("urgent")}
          className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-left transition-colors hover:bg-red-500/15"
        >
          <div className="flex items-center gap-3">
            <Siren className="h-6 w-6 shrink-0 text-red-400" />
            <div>
              <div className="font-semibold text-red-100">It is happening now — we need help</div>
              <div className={T_CAPTION + " mt-1"}>
                No water, no power, gas, fire, injury, a broken freezer, a storm. Takes about
                two minutes.
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push("/incidents")}
          className="w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition-colors hover:bg-white/8"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 shrink-0 text-zinc-400" />
            <div>
              <div className="font-semibold text-zinc-100">It already happened — for the record</div>
              <div className={T_CAPTION + " mt-1"}>
                Something to look into and prevent next time. Product, delivery, stock, a
                customer.
              </div>
            </div>
          </div>
        </button>

        <div className={T_CAPTION + " pt-2 leading-relaxed"}>
          Not sure which? Use the first one. Reporting something that turns out to be minor
          is never a problem — a problem nobody heard about is.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 space-y-4">
      <button onClick={() => setDoor("")} className={T_CAPTION + " flex items-center gap-1"}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div>
        <h1 className={T_PAGE_TITLE}>Happening now</h1>
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm leading-relaxed text-amber-100/90">
            The sooner HQ knows, the more they can do. At 2pm water can be sent from the
            central kitchen; by 7pm there is nothing left to try.
          </p>
        </div>
      </div>

      <div className={GLASS_CARD + " space-y-4 p-4"}>
        <div>
          <div className={T_LABEL}>What is it?</div>
          <div className="mt-1.5">
            <SelectDark
              value={category}
              onChange={setCategory}
              options={[
                { value: "", label: "— choose —" },
                ...URGENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
              ]}
            />
          </div>
        </div>

        <div>
          <div className={T_LABEL}>Which store?</div>
          <input
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            placeholder="Taft"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>

        <div>
          <div className={T_LABEL}>When did you notice?</div>
          <input
            type="datetime-local"
            max={localNow()}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            value={noticedAt}
            onChange={(e) => setNoticedAt(e.target.value)}
          />
        </div>

        <div>
          <div className={T_LABEL}>Is trading affected?</div>
          <div className="mt-1.5 flex gap-2">
            {[
              { v: true, l: "Yes" },
              { v: false, l: "Not yet" },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setAffected(o.v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  affected === o.v
                    ? "border-violet-500/60 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/5 text-zinc-400"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={T_LABEL}>Can the store keep going?</div>
          <div className="mt-1.5 flex gap-2">
            {["YES", "LIMITED", "NO"].map((o) => (
              <button
                key={o}
                onClick={() => setCanContinue(o)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  canContinue === o
                    ? "border-violet-500/60 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/5 text-zinc-400"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={T_LABEL}>
            What is happening? <span className="text-zinc-600">optional</span>
          </div>
          <textarea
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            placeholder="Water stopped around 2pm. Roughly 40 litres left."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <div className={T_LABEL}>
            What have you already done? <span className="text-zinc-600">optional</span>
          </div>
          <input
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            placeholder="Asked building management"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        <div>
          <div className={T_LABEL}>Do you need HQ to do something?</div>
          <div className="mt-1.5 flex gap-2">
            {[
              { v: true, l: "Yes" },
              { v: false, l: "No" },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setNeedHelp(o.v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  needHelp === o.v
                    ? "border-violet-500/60 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/5 text-zinc-400"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {level > 0 && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            level === 3
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : level === 2
                ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                : "border-amber-500/30 bg-amber-500/8 text-amber-200"
          }`}
        >
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          This will go out as <strong>Level {level}</strong>
          {level === 3 && " — also call HQ, do not rely on the app alone."}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button onClick={submit} disabled={!ready || sending} className={PRIMARY_BUTTON + " w-full disabled:opacity-40"}>
        {sending ? "Sending…" : "Alert HQ now"}
      </button>
      <div className={T_CAPTION + " text-center"}>
        You can add photos and detail afterwards. Send this first.
      </div>
    </div>
  );
}
