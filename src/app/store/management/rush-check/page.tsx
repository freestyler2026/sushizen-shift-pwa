"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock, RefreshCw, X } from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";

const BRANCHES: Record<string, { value: string; label: string }[]> = {
  manila: [
    { value: "PAR", label: "Paranaque" },
    { value: "CUB", label: "Cubao" },
    { value: "TAFT", label: "Taft" },
  ],
  dubai: [
    { value: "BB", label: "Business Bay" },
    { value: "JLT", label: "JLT" },
    { value: "ARJ", label: "Arjan" },
    { value: "AM", label: "Al Mina" },
    { value: "AB", label: "Al Barsha" },
  ],
};

/** The five things the check asks about, in the order they are walked. */
const CHECKS: readonly {
  key: "queue_ok" | "prep_ok" | "staffing_ok" | "cleanliness_ok" | "travel_path_ok";
  label: string;
  ask: string;
  /** A "Not OK" here raises a red on its own and needs an explanation. */
  critical?: boolean;
}[] = [
  { key: "queue_ok", label: "Queue moving", ask: "Are customers being served without a backlog?" },
  { key: "prep_ok", label: "Prep holding", ask: "Is there enough prepared stock to finish the peak?" },
  { key: "staffing_ok", label: "Staffing adequate", ask: "Is every station covered right now?" },
  { key: "cleanliness_ok", label: "Area clean", ask: "Is the work area clean and tidy?" },
  {
    key: "travel_path_ok",
    label: "Travel path clear",
    ask: "Is the path staff walk clear, dry, and unobstructed?",
    critical: true,
  },
] as const;

type CheckKey = (typeof CHECKS)[number]["key"];

interface RushCheck {
  id: number;
  branch: string;
  slot: string;
  submitted_by: string;
  issues: string[];
  created_at: string;
}

interface SlotDef {
  key: string;
  label: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RushCheckPage() {
  const router = useRouter();
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [branch, setBranch] = useState("PAR");
  const [slots, setSlots] = useState<SlotDef[]>([]);
  const [slot, setSlot] = useState("");
  const [existing, setExisting] = useState<RushCheck[]>([]);
  const [answers, setAnswers] = useState<Partial<Record<CheckKey, boolean>>>({});
  const [pathNote, setPathNote] = useState("");
  const [note, setNote] = useState("");
  // Two numbers the yes/no answers cannot carry. Added optional 2026-09-02,
  // made required 2026-09-03 at the owner's request: both are read straight
  // off the till during the same walk, and without them "Queue moving — OK"
  // is an opinion with nothing behind it.
  const [ticketCount, setTicketCount] = useState("");
  const [oldestOrder, setOldestOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [canSwitchCity, setCanSwitchCity] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fstore%2Fmanagement%2Frush-check");
      return;
    }
    // cityLock is the account's real constraint; auth.city is only what was
    // picked on the login screen, which defaults to Dubai.
    const lock = (auth.cityLock || "").toLowerCase();
    setCanSwitchCity(lock === "");
    const c = ((lock || auth.city) === "dubai" ? "dubai" : "manila") as "manila" | "dubai";
    setCity(c);
    setBranch(BRANCHES[c][0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/store/management/rush-checks?city=${city}&branch=${branch}&check_date=${todayISO()}`,
        { headers: getAuthHeaders(getAuth()) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setSlots(d.slots || []);
      setExisting(d.checks || []);
      if (!slot && d.slots?.length) {
        const done = new Set((d.checks || []).map((c: RushCheck) => c.slot));
        const next = d.slots.find((s: SlotDef) => !done.has(s.key)) || d.slots[0];
        setSlot(next.key);
      }
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load today's checks: ${e}` });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, branch]);

  useEffect(() => {
    load();
  }, [load]);

  const doneSlots = useMemo(() => new Set(existing.map((c) => c.slot)), [existing]);
  const alreadyDone = doneSlots.has(slot);
  const pathBad = answers.travel_path_ok === false;
  const allAnswered = CHECKS.every((c) => answers[c.key] !== undefined);
  // Both numbers are read off the till in the same walk. Optional, they were
  // the two fields that got skipped, which leaves the OK/Not OK answers with
  // nothing to check them against.
  const ticketsOk = ticketCount.trim() !== "" && Number(ticketCount) >= 0;
  const oldestOk = oldestOrder.trim() !== "";
  const canSubmit =
    allAnswered && ticketsOk && oldestOk && (!pathBad || pathNote.trim().length > 0) && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setBanner(null);
    try {
      const auth = getAuth();
      const res = await fetch("/api/store/management/rush-checks", {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          branch,
          slot,
          check_date: todayISO(),
          submitted_by: auth?.staffName || "Unknown",
          ...answers,
          travel_path_note: pathNote.trim(),
          note: note.trim(),
          ticket_count: ticketCount.trim() === "" ? null : Number(ticketCount),
          oldest_order: oldestOrder.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `HTTP ${res.status}`);
      }
      setBanner({
        kind: "ok",
        text: pathBad
          ? "Submitted. The travel path issue has been raised to Back Office."
          : "Submitted.",
      });
      setAnswers({});
      setPathNote("");
      setNote("");
      setTicketCount("");
      setOldestOrder("");
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Could not submit: ${e}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      <div>
        <h1 className={T_PAGE_TITLE}>Rush Hour Check</h1>
        <p className={T_BODY + " mt-1"}>
          A 30-second walk of the floor at each peak. Answer what you can actually see
          right now — a check filled in from the office is worse than no check.
        </p>
      </div>

      {canSwitchCity && (
        <SelectDark
          value={city}
          onChange={(v) => {
            const c = v as "manila" | "dubai";
            setCity(c);
            setBranch(BRANCHES[c][0].value);
          }}
          options={[
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <SelectDark value={branch} onChange={setBranch} options={BRANCHES[city]} />
        <SelectDark
          value={slot}
          onChange={setSlot}
          options={slots.map((s) => ({
            value: s.key,
            label: doneSlots.has(s.key) ? `${s.label} ✓` : s.label,
          }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Done today</div>
          <div className={KPI_VALUE}>
            {existing.length}
            <span className="text-base text-zinc-500"> / {slots.length}</span>
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Issues raised</div>
          <div className={KPI_VALUE + (existing.some((c) => c.issues?.length) ? " text-amber-300" : "")}>
            {existing.reduce((a, c) => a + (c.issues?.length || 0), 0)}
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            banner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {banner.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <span className="flex-1">{banner.text}</span>
        </div>
      )}

      {alreadyDone && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 p-3 text-sm text-sky-100/90 flex gap-2">
          <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 text-sky-300" />
          <span>
            This slot was already submitted today. Submitting again replaces the earlier
            answers.
          </span>
        </div>
      )}

      <div className={GLASS_CARD + " p-4 space-y-3"}>
        {CHECKS.map((c) => {
          const val = answers[c.key];
          return (
            <div key={c.key} className="border-b border-white/5 last:border-b-0 pb-3 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{c.label}</div>
                  <div className={T_CAPTION + " mt-0.5"}>{c.ask}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setAnswers((a) => ({ ...a, [c.key]: true }))}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
                      val === true
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/15"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setAnswers((a) => ({ ...a, [c.key]: false }))}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
                      val === false
                        ? "bg-red-500 text-white border-red-500"
                        : "border-red-500/35 text-red-300 hover:bg-red-500/15"
                    }`}
                  >
                    Not OK
                  </button>
                </div>
              </div>
              {c.critical && val === false && (
                <div className="mt-3">
                  <div className={T_LABEL + " mb-1.5"}>What is wrong with the path?</div>
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={2}
                    placeholder="e.g. Spillage near the pass — not yet cleaned"
                    value={pathNote}
                    onChange={(e) => setPathNote(e.target.value)}
                  />
                  <div className="text-xs text-amber-300/90 mt-1.5">
                    This raises a critical alert to Back Office immediately.
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Read off the screen, not counted by hand. Placed above the free
            note so they are answered while the numbers are still on the till.
            Required: they are the only numbers on this form, and without them
            the OK/Not OK answers cannot be checked against anything. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={T_LABEL + " mb-1.5"}>Tickets this slot <span className="text-amber-400">*</span></div>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={INPUT_CLASS}
              placeholder="e.g. 12"
              value={ticketCount}
              onChange={(e) => setTicketCount(e.target.value)}
            />
          </div>
          <div>
            <div className={T_LABEL + " mb-1.5"}>Oldest order received <span className="text-amber-400">*</span></div>
            <input
              type="time"
              className={INPUT_CLASS}
              value={oldestOrder}
              onChange={(e) => setOldestOrder(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className={T_LABEL + " mb-1.5"}>Anything else? (optional)</div>
          <textarea
            className={TEXTAREA_CLASS}
            rows={2}
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={PRIMARY_BUTTON + " w-full flex items-center justify-center gap-2 disabled:opacity-40"}
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Submit Check
            </>
          )}
        </button>
        {!canSubmit && !saving && (
          <div className="text-xs text-amber-400/80 text-center">
            {/* Name the one thing that is missing. "Something is missing" makes
                the person hunt for it on a screen they have already filled in. */}
            {!allAnswered
              ? "Answer every item to submit"
              : !ticketsOk
                ? "Enter the ticket count to submit"
                : !oldestOk
                  ? "Enter the time of the oldest order to submit"
                  : "Describe the travel path issue to submit"}
          </div>
        )}
      </div>

      <div className={GLASS_CARD + " p-4"}>
        <div className={T_LABEL + " mb-3"}>Today’s submissions</div>
        {loading ? (
          <div className={T_CAPTION}>Loading…</div>
        ) : existing.length === 0 ? (
          <div className={T_CAPTION}>Nothing submitted yet today.</div>
        ) : (
          <div className="space-y-2">
            {existing.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-200">
                  {slots.find((s) => s.key === c.slot)?.label || c.slot}
                </span>
                <span className={T_CAPTION}>{c.submitted_by}</span>
                {c.issues?.length > 0 && (
                  <span className="ml-auto text-xs text-amber-300">
                    {c.issues.join(", ").replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
