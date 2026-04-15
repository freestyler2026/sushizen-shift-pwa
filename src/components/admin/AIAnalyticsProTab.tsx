"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION } from "@/lib/ui-tokens";

interface ToolCallSummary {
  tool: string;
  inputs?: Record<string, unknown>;
  rows?: number | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallSummary[];
  model?: string;
  timestamp: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_dubai_sales: "🇦🇪 Dubai Sales",
  get_dubai_cancellations: "🇦🇪 Dubai Cancellations",
  get_manila_sales: "🇵🇭 Manila Sales",
  get_manila_cancellations: "🇵🇭 Manila Cancellations",
  get_cashier_evaluations: "⭐ Cashier Evaluations",
  get_pnl: "💰 P&L imports",
  get_procurement: "🛒 Procurement",
  get_evaluations: "📋 Eval settings",
  compare_periods: "⚖️ Compare periods",
};

const EXAMPLES = [
  { icon: "📉", q: "Why did Dubai net revenue change in the last 7 days vs the prior 7 days?" },
  { icon: "🏆", q: "Summarize Manila sales overview this month (totals and channel mix if present)." },
  { icon: "🚫", q: "Which Dubai platform had the most cancellation rows this month?" },
  { icon: "⭐", q: "List Manila cashier evaluations this month with any large QRPH diffs." },
  { icon: "⚖️", q: "Compare Dubai POS daily net revenue this month vs last month using compare_periods." },
  { icon: "💰", q: "What P&L monthly imports exist for Dubai and Manila in the last two months?" },
];

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed text-white/90">
      {lines.map((line, i) => {
        const t = line.trim();
        if (t.startsWith("**") && t.endsWith("**"))
          return (
            <p key={i} className="mt-3 font-semibold text-white">
              {t.replace(/\*\*/g, "")}
            </p>
          );
        if (/^\*\*(.+):\*\*/.test(line))
          return (
            <p key={i} className="mt-3 font-semibold text-indigo-300">
              {line.replace(/\*\*/g, "")}
            </p>
          );
        if (line.startsWith("- ") || line.startsWith("• "))
          return (
            <p key={i} className="pl-3 text-white/80">
              • {line.slice(2).trimStart()}
            </p>
          );
        if (/^\d+\. /.test(line)) return <p key={i} className="pl-3 text-white/70">{line}</p>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="whitespace-pre-wrap">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export default function AIAnalyticsProTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [thinking, setThinking] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [messages, thinking, scrollBottom]);

  const postChat = async (body: Record<string, unknown>) => {
    const url = `${getApiBase()}/api/ai/analytics/chat-pro`;
    const run = () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
    let res = await run();
    let text = await res.text();
    if (!res.ok && res.status === 401) {
      const cur = getAuth();
      if (cur?.pin && (text.includes("Invalid access token") || !cur.accessToken)) {
        await refreshAuthFromApi(cur, { includeMfa: true });
        res = await run();
        text = await res.text();
      }
    }
    if (!res.ok) {
      let detail = text;
      try {
        const j = JSON.parse(text) as { detail?: unknown };
        if (typeof j?.detail === "string") detail = j.detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail || "Request failed");
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    const auth = getAuth();
    const userMsg: Message = { role: "user", content: trimmed, timestamp: ts() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setThinking("Analysing your question…");
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    try {
      setThinking("Querying live data…");
      const json = await postChat({
        approver_name: auth?.staffName || "",
        pin: auth?.pin || "",
        question: trimmed,
        history,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        city: "dubai",
      });
      if (json.success) {
        const summary = Array.isArray(json.tool_results_summary)
          ? (json.tool_results_summary as ToolCallSummary[])
          : undefined;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: String(json.answer || ""),
            toolCalls: summary,
            model: typeof json.model === "string" ? json.model : undefined,
            timestamp: ts(),
          },
        ]);
      } else {
        throw new Error("Unexpected response");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}`, timestamp: ts() }]);
    } finally {
      setLoading(false);
      setThinking("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className={GLASS_CARD}>
      <div className="flex min-h-[640px] flex-col space-y-4 p-4 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
              <span className="text-2xl" aria-hidden>
                🤖
              </span>
              AI Analytics Pro
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 text-xs font-normal text-indigo-300">
                Live DB tools
              </span>
            </h2>
            <p className={`${T_CAPTION} mt-0.5`}>Claude selects tools and iterates over PostgreSQL-backed metrics.</p>
          </div>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/30 transition-colors hover:text-white/60"
            >
              Clear chat
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/40">Date range (optional):</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <span className="text-white/30">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          {dateFrom || dateTo ? (
            <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-white/30 hover:text-white/60">
              ✕ Clear
            </button>
          ) : null}
        </div>

        <div className="max-h-[520px] min-h-[400px] flex-1 space-y-5 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="text-center">
                <div className="mb-2 text-5xl" aria-hidden>
                  🤖
                </div>
                <p className="font-medium text-white/70">Ask anything about Dubai / Manila operations</p>
                <p className="mt-1 text-xs text-white/30">Uses the same permission as AI Analytics Consultant (analytics.consult.ai).</p>
              </div>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {EXAMPLES.map(({ icon, q }) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="group rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white/80"
                  >
                    <span className="mr-2">{icon}</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" ? (
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-indigo-500/40 bg-indigo-600/40 text-base">
                  🤖
                </div>
              ) : null}
              <div className={`flex max-w-[85%] flex-col space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.toolCalls && msg.toolCalls.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.toolCalls.map((tc, ti) => (
                      <span
                        key={ti}
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-500/25 bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300"
                      >
                        {TOOL_LABELS[tc.tool] ?? tc.tool}
                        {tc.rows != null ? <span className="text-indigo-400/60">({tc.rows})</span> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "rounded-tr-sm border border-indigo-500/30 bg-indigo-600/40 text-sm text-white"
                      : "rounded-tl-sm border border-white/12 bg-white/[0.08]"
                  }`}
                >
                  {msg.role === "user" ? <p className="text-sm">{msg.content}</p> : <AnswerText text={msg.content} />}
                  <p className="mt-1.5 text-right text-xs text-white/20">
                    {msg.timestamp}
                    {msg.model ? ` · ${msg.model}` : ""}
                  </p>
                </div>
              </div>
              {msg.role === "user" ? (
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-base">
                  👤
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-indigo-500/40 bg-indigo-600/40 text-base">
                🤖
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/12 bg-white/[0.08] px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs italic text-white/40">{thinking}</span>
                </div>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              rows={2}
              placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
              className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition-all placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 self-stretch rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "…" : "→"}
          </button>
        </div>

        <p className="text-center text-xs text-white/20">Verify critical decisions in source dashboards. AI can misread sparse or truncated tool output.</p>
      </div>
    </div>
  );
}
