"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Send, Loader2, BookOpen } from "lucide-react";
import MarkdownLite from "@/components/MarkdownLite";
import { getAuth, getAuthHeaders, canAccessAdminNav, type Auth } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  BADGE_INFO,
} from "@/lib/ui-tokens";

type Msg = { role: "user" | "assistant"; content: string };

/** Questions that currently reach the developer. Shown so the page says what it is for. */
const EXAMPLES = [
  "Why does AR Payouts show rows we never confirm?",
  "How do I add an item that is not on the Backup Report list?",
  "A supplier order will not submit — what stops it?",
  "Why did DTR Sync say complete but nothing changed?",
  "Who can approve a spot purchase, and up to how much?",
  "How do I reopen a management task I closed by mistake?",
];

export default function AdminHelpPage() {
  // Prerendered HTML is shared by every visitor and has no localStorage, so
  // nothing may be asserted about who this is until after mount (lesson 42).
  const [mounted, setMounted] = useState(false);
  const [auth, setAuth] = useState<Auth | null>(null);
  useEffect(() => {
    setAuth(getAuth());
    setMounted(true);
  }, []);

  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, step]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setErr("");
    setQ("");
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    setStep("Looking it up…");

    try {
      // Relative URL so the session cookie reaches the proxy (lesson 13).
      const res = await fetch("/api/ai/analytics/chat-pro", {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ question: text, history, mode: "help" }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: Record<string, unknown> | null = null;

      const onLine = (raw: string) => {
        const line = raw.replace(/\r$/, "").trimEnd();
        if (!line || line.startsWith(":") || !line.toLowerCase().startsWith("data:")) return;
        const js = line.slice(line.indexOf(":") + 1).trim();
        if (!js.startsWith("{")) return;
        try {
          const j = JSON.parse(js) as Record<string, unknown>;
          if (typeof j.success === "boolean") final = j;
          else if (j.type === "tool_start") setStep("Reading the code…");
        } catch {
          /* a malformed event must not kill the stream */
        }
      };

      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          parts.forEach(onLine);
        }
        if (buffer) onLine(buffer);
      } else {
        (await res.text()).split("\n").forEach(onLine);
      }

      const f = (final ?? {}) as Record<string, unknown>;
      if (!res.ok || f.success === false) {
        setErr(String(f.detail || `Request failed (${res.status}).`));
      } else {
        const answer = String(f.answer || f.text || "").trim();
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: answer || "No answer came back. Try rephrasing." },
        ]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  if (!mounted) {
    return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  }
  if (!canAccessAdminNav(auth) && auth?.role !== "HQ" && auth?.role !== "ADMIN") {
    return (
      <div className="p-6 text-sm text-zinc-400">
        Ask about the system is for admin, HR and HQ users.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-start gap-3">
        <HelpCircle className="mt-1 shrink-0 text-violet-400" size={26} />
        <div>
          <h1 className={T_PAGE_TITLE}>Ask about the system</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            How a screen works, what a button does, and why the system behaved the way it
            did. Answers come from the pages themselves, the operating manuals and the
            recorded reasons behind each rule.
          </p>
        </div>
      </div>

      <div className={`${GLASS_CARD} mb-5 px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className={BADGE_INFO}>
            <BookOpen size={11} /> No data access
          </span>
          <span>
            This cannot read payroll, attendance or anyone&apos;s records — only how the
            system works. Ask in Japanese to get an answer in Japanese.
          </span>
        </div>
      </div>

      {msgs.length === 0 && (
        <div className="mb-5">
          <p className={`${T_LABEL} mb-2`}>Things people ask</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} className={SMALL_BUTTON} onClick={() => ask(e)} disabled={busy}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-violet-500/15 px-4 py-2.5 text-sm text-violet-100"
                : `${GLASS_CARD} px-4 py-3.5`
            }
          >
            {m.role === "assistant" ? (
              <MarkdownLite text={m.content} />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-violet-100">
                {m.content}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className={`${GLASS_CARD} flex items-center gap-2 px-4 py-3 text-sm text-zinc-400`}>
            <Loader2 className="animate-spin text-violet-400" size={15} />
            {step || "Working…"}
            <span className="text-xs text-zinc-500">— this usually takes under a minute</span>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {err}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about any screen — e.g. why a button is disabled"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/40 focus:outline-none"
          disabled={busy}
        />
        <button type="submit" className={PRIMARY_BUTTON} disabled={busy || !q.trim()}>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
