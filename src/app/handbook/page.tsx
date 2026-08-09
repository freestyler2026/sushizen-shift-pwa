"use client";

import { useEffect, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
} from "@/lib/ui-tokens";

// ── Minimal Markdown → JSX renderer ──────────────────────────────────────────

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-violet-300 mt-6 mb-2 border-b border-white/10 pb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-neutral-200 mt-4 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={i} className="ml-4 text-sm text-neutral-300 leading-relaxed list-disc">{line.slice(2)}</li>);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-6 border-white/10" />);
    } else if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
      elements.push(<p key={i} className="text-xs text-neutral-500 italic mt-2">{line.replace(/^\*|\*$/g, "")}</p>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm text-neutral-300 leading-relaxed">{line}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Handbook = {
  version: string;
  title: string;
  content_md: string;
  published_by: string;
  published_at: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function HandbookPage() {
  const [handbook, setHandbook] = useState<Handbook | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const auth = getAuth();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/store/staff/handbook", {
          credentials: "same-origin",
          headers: { ...getAuthHeaders(), "Cache-Control": "no-store" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "Failed to load handbook");
        setHandbook(data.handbook);
        setAcknowledged(data.acknowledged ?? false);
        setAcknowledgedAt(data.acknowledged_at ?? null);
      } catch (e: unknown) {
        setError(String((e as Error).message || e));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleAcknowledge() {
    if (!handbook) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/store/staff/handbook/acknowledge", {
        method: "POST",
        credentials: "same-origin",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ handbook_version: handbook.version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Failed");
      setAcknowledged(true);
      setAcknowledgedAt(new Date().toISOString());
      setSuccess(true);
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 py-4">
      <div>
        <h1 className={T_PAGE_TITLE}>Employee Handbook</h1>
        {handbook && (
          <p className="mt-1 text-sm text-neutral-500">
            Version {handbook.version} · Published by {handbook.published_by}
          </p>
        )}
      </div>

      {loading && (
        <div className={GLASS_CARD + " p-8 text-center text-sm text-neutral-400"}>
          Loading handbook…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {handbook && !loading && (
        <>
          <div className={GLASS_CARD + " p-6"}>
            {renderMarkdown(handbook.content_md)}
          </div>

          {/* Acknowledgement section */}
          <div className={GLASS_CARD + " p-5"}>
            <p className={T_LABEL + " mb-3"}>Receipt Confirmation</p>

            {success && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-400">
                You have acknowledged this handbook. Thank you.
              </div>
            )}

            {acknowledged && !success && (
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3 text-sm text-emerald-400">
                You acknowledged this handbook on {acknowledgedAt ? new Date(acknowledgedAt).toLocaleString() : "a previous date"}.
              </div>
            )}

            {!acknowledged ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">
                  By clicking the button below, you confirm that you have read and understood all policies in this handbook (Version {handbook.version}).
                </p>
                <button
                  onClick={handleAcknowledge}
                  disabled={submitting}
                  className={PRIMARY_BUTTON + " text-sm"}
                >
                  {submitting ? "Submitting…" : "I have read and understood this handbook"}
                </button>
              </div>
            ) : (
              <p className={T_CAPTION}>
                Your acknowledgement is on record.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
