"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, RefreshCw, X } from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, INPUT_CLASS, SMALL_BUTTON, TEXTAREA_CLASS,
  T_PAGE_TITLE, T_LABEL, T_CAPTION, T_BODY,
} from "@/lib/ui-tokens";

const BRANCHES: Record<string, { value: string; label: string }[]> = {
  manila: [
    { value: "TAFT", label: "Taft" },
    { value: "PAR", label: "Paranaque" },
    { value: "CUB", label: "Cubao" },
  ],
  dubai: [
    { value: "BB", label: "Business Bay" },
    { value: "AB", label: "Al Barsha" },
    { value: "JLT", label: "JLT" },
  ],
};

type Fact = { ok: boolean | null; label: string; detail: string; href: string };
type Item = {
  seq: number; section: "opening" | "closing"; timing: string; title: string;
  allows_issue: boolean; note_prompt: string; fact: Fact | null;
  result: string; issue_outcome: string; note: string;
  answered_by: string; answered_at: string | null;
};
type Day = {
  id: string; opening_owner: string; closing_owner: string;
  opening_done_at: string | null; closing_done_at: string | null;
};
type Payload = {
  day: Day | null; items: Item[]; enabled: boolean;
  suggested: { opening_owner: string; closing_owner: string } | null;
};

const OUTCOMES = [
  { value: "resolved", label: "Resolved" },
  { value: "reported", label: "Reported to Management" },
  { value: "in_progress", label: "Action in Progress" },
];

/** What the fact line looks like. Green is "the report is in", amber is "it is
 *  not" — never red: the manager did not cause it, and a screen that shouts at
 *  somebody for another person's missing report stops being read. */
function FactLine({ fact }: { fact: Fact }) {
  const tone =
    fact.ok === true ? "text-emerald-300"
    : fact.ok === false ? "text-amber-300"
    : "text-zinc-500";
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-2 text-xs ${tone}`}>
      {fact.ok === true ? <CheckCircle2 className="h-3.5 w-3.5" />
        : fact.ok === false ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
      <span className="font-medium">{fact.label}</span>
      {fact.detail && <span className="text-zinc-500">{fact.detail}</span>}
      {fact.href && (
        <a href={fact.href} className="inline-flex items-center gap-0.5 text-violet-300 hover:text-violet-200">
          Open <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/** One half of the day.
 *
 *  Defined at module scope on purpose. Declared inside the page component it
 *  is a new function on every render, so React tears the subtree down and
 *  rebuilds it each time — and since typing a note updates state, the note
 *  box lost focus after every single character. The fields where a manager
 *  writes what went wrong were the ones that did not work.
 */
function Half({
  title, owner, which, rows, doneAt, handover, draft, setDraft, editing, setEditing,
  onAnswer, onSaveOwner,
}: {
  title: string; owner: string; which: "opening" | "closing";
  rows: Item[]; doneAt: string | null; handover?: Fact | null;
  draft: Record<number, { note: string; outcome: string }>;
  setDraft: React.Dispatch<React.SetStateAction<Record<number, { note: string; outcome: string }>>>;
  editing: Set<number>;
  setEditing: React.Dispatch<React.SetStateAction<Set<number>>>;
  onAnswer: (item: Item, result: string) => void;
  onSaveOwner: (which: "opening" | "closing", name: string) => void;
}) {
  return (
    <div className={`${GLASS_CARD} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={T_LABEL}>{title}</p>
          <p className={`${T_CAPTION} mt-0.5`}>
            {rows.filter((r) => r.result).length} of {rows.length} answered
          </p>
        </div>
        {doneAt && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <Check className="h-3 w-3" /> Complete
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className={T_LABEL}>On duty</p>
        <div className="mt-1 flex gap-2">
          <input
            className={INPUT_CLASS}
            key={`${which}-${owner}`}
            defaultValue={owner}
            placeholder="Name"
            aria-label={`${title} owner`}
            onBlur={(e) => { if (e.target.value !== owner) onSaveOwner(which, e.target.value); }}
          />
        </div>
        {/* One person may hold both halves. Cubao has no candidate and is
            covered alone, and one Paranaque candidate is rostered on both
            sides, so this is normal rather than an exception. */}
      </div>

      {/* What the opening half is handing over. It is the reason the 16:00
          item exists, and it has to arrive where the closing manager reads —
          not sit in the other column as a tick they never look at. */}
      {which === "closing" && handover && handover.ok === false && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-300">
            Handed over to you
          </p>
          <p className="mt-1 text-sm text-amber-100">{handover.label}</p>
          {handover.detail && (
            <p className="mt-0.5 text-xs text-amber-200/80">{handover.detail}</p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((item) => {
          const d = draft[item.seq] || { note: item.note || "", outcome: item.issue_outcome || "" };
          const answered = !!item.result && !editing.has(item.seq);
          return (
            <div
              key={item.seq}
              className={`rounded-xl border p-3 ${
                answered ? "border-white/5 bg-white/3" : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400 tabular-nums">
                  {item.seq}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                    {item.timing}
                  </p>
                  <p className={`${T_BODY} mt-0.5 text-zinc-200`}>{item.title}</p>
                  {item.fact && <FactLine fact={item.fact} />}

                  {item.note_prompt && !answered && (
                    <textarea
                      className={`${TEXTAREA_CLASS} mt-2`}
                      rows={2}
                      placeholder={item.note_prompt}
                      aria-label={`Item ${item.seq} note`}
                      value={d.note}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [item.seq]: { ...d, note: e.target.value } }))}
                    />
                  )}

                  {/* Above the buttons, because it is written before one of
                      them is pressed. Below them it read as an afterthought
                      and the save came back asking for words already typed
                      nowhere. */}
                  {item.allows_issue && !answered && (
                    <textarea
                      className={`${TEXTAREA_CLASS} mt-2`}
                      rows={2}
                      placeholder="What was the issue? (only needed if you report one)"
                      aria-label={`Item ${item.seq} issue note`}
                      value={d.note}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [item.seq]: { ...d, note: e.target.value } }))}
                    />
                  )}

                  {answered ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={
                        item.result === "done" ? "text-emerald-300"
                        : item.result === "issue" ? "text-amber-300" : "text-zinc-400"}>
                        {item.result === "done" ? "Done"
                          : item.result === "issue"
                            ? `Issue — ${OUTCOMES.find((o) => o.value === item.issue_outcome)?.label || ""}`
                            : "Unable to complete"}
                      </span>
                      {item.answered_by && <span className="text-zinc-500">{item.answered_by}</span>}
                      {item.note && <span className="text-zinc-400">“{item.note}”</span>}
                      <button
                        className="text-zinc-500 underline hover:text-zinc-300"
                        onClick={() => {
                          setDraft((p) => ({ ...p, [item.seq]: d }));
                          setEditing((p) => new Set(p).add(item.seq));
                        }}
                      >
                        change
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button className={SMALL_BUTTON} onClick={() => onAnswer(item, "done")}>
                        <Check className="mr-1 inline h-3 w-3" />Done
                      </button>
                      <button className={SMALL_BUTTON} onClick={() => onAnswer(item, "unable")}>
                        <X className="mr-1 inline h-3 w-3" />Unable to complete
                      </button>
                      {item.allows_issue && (
                        <>
                          <SelectDark
                            className="min-w-[190px]"
                            value={d.outcome}
                            onChange={(v) =>
                              setDraft((p) => ({ ...p, [item.seq]: { ...d, outcome: v } }))}
                            options={[{ value: "", label: "— If issue found —" }, ...OUTCOMES]}
                            aria-label={`Item ${item.seq} issue outcome`}
                          />
                          <button
                            className={SMALL_BUTTON}
                            onClick={() => onAnswer(item, "issue")}
                          >
                            <AlertTriangle className="mr-1 inline h-3 w-3" />Issue found
                          </button>
                        </>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ManagerChecklistPage() {
  // Nothing is asserted until the client has mounted. The HTML is prerendered
  // and shared by everyone, so reading the session during the first render
  // shows every manager somebody else's state for a moment (lesson 42).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [city, setCity] = useState("manila");
  const [branch, setBranch] = useState("TAFT");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<Record<number, { note: string; outcome: string }>>({});
  /** Items reopened for a correction. "change" used to post an empty result,
   *  which the API refuses — the button looked dead. Reopening is a local
   *  state, and the next real answer overwrites the old one. */
  const [editing, setEditing] = useState<Set<number>>(new Set());

  useEffect(() => {
    const a = getAuth();
    const c = String(a?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
    setCity(c);
    setBranch(BRANCHES[c][0].value);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/store/management/checklist?city=${encodeURIComponent(city)}&branch=${encodeURIComponent(branch)}`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, branch]);

  useEffect(() => { if (mounted) void load(); }, [mounted, load]);

  const saveOwner = async (which: "opening" | "closing", name: string) => {
    setFormError("");
    try {
      const res = await fetch("/api/store/management/checklist/owners", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city, branch,
          [which === "opening" ? "opening_owner" : "closing_owner"]: name,
        }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200));
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const answer = async (item: Item, result: string) => {
    // Validation lives in its own state. Sharing one banner with the loader
    // means the next refresh wipes the message and the button looks dead
    // (lesson 93).
    setFormError("");
    const d = draft[item.seq] || { note: "", outcome: "" };
    if (result === "issue" && !d.outcome) {
      setFormError(`Item ${item.seq}: choose what happened with the issue.`);
      return;
    }
    if (result === "issue" && !d.note.trim()) {
      setFormError(`Item ${item.seq}: say what the issue was — the next shift reads this.`);
      return;
    }
    try {
      const res = await fetch("/api/store/management/checklist/answer", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city, branch, seq: item.seq, result,
          issue_outcome: result === "issue" ? d.outcome : "",
          note: d.note,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try { detail = JSON.parse(t)?.detail || t; } catch { /* text/plain */ }
        throw new Error(String(detail).slice(0, 200));
      }
      setEditing((p) => { const n = new Set(p); n.delete(item.seq); return n; });
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!mounted) return null;

  const items = data?.items || [];
  const opening = items.filter((i) => i.section === "opening");
  const closing = items.filter((i) => i.section === "closing");
  const day = data?.day;


  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={T_PAGE_TITLE}>Manager Checklist</h1>
          <p className={`${T_CAPTION} mt-1`}>
            The staff travel path records what was done. This records whether it was
            done properly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelectDark
            className="min-w-[150px]"
            value={branch}
            onChange={setBranch}
            options={BRANCHES[city] || []}
            aria-label="Branch"
          />
          <button className={SMALL_BUTTON} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 inline h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {formError && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-200">
          {formError}
        </p>
      )}

      {data && !data.enabled && (
        <div className={`${GLASS_CARD} p-4`}>
          <p className={T_BODY}>
            This branch has not started using the Manager Checklist yet. Nothing here
            is required of anyone until it does.
          </p>
        </div>
      )}

      {data?.enabled && (
        <div className="grid gap-4 md:grid-cols-2">
          <Half title="Opening" which="opening" rows={opening}
                owner={day?.opening_owner || ""}
                doneAt={day?.opening_done_at || null}
                draft={draft} setDraft={setDraft}
                editing={editing} setEditing={setEditing}
                onAnswer={(i, r) => void answer(i, r)}
                onSaveOwner={(w, n) => void saveOwner(w, n)} />
          <Half title="Closing" which="closing" rows={closing}
                owner={day?.closing_owner || ""}
                doneAt={day?.closing_done_at || null}
                handover={items.find((i) => i.seq === 6)?.fact || null}
                draft={draft} setDraft={setDraft}
                editing={editing} setEditing={setEditing}
                onAnswer={(i, r) => void answer(i, r)}
                onSaveOwner={(w, n) => void saveOwner(w, n)} />
        </div>
      )}

      {day?.opening_done_at && day?.closing_done_at && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-sm text-emerald-200">
          Both halves are in. Today&rsquo;s Manager Checklist is complete.
        </div>
      )}
    </div>
  );
}
