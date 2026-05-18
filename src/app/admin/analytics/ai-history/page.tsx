"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAuthHeaders, getAuth, refreshAuthFromApi } from "@/lib/auth";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

type SnapshotItem = {
  id: string;
  city: string;
  date_from: string;
  date_to: string;
  question: string;
  answer: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  saved_by: string;
  created_at: string;
};

async function fetchSnapshots(city: string): Promise<SnapshotItem[]> {
  const qs = new URLSearchParams({ limit: "100" });
  if (city) qs.set("city", city);
  const auth = getAuth();
  const request = async () =>
    fetch(`${getApiBase()}/api/ai/analytics/snapshots?${qs.toString()}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
  let res = await request();
  if (!res.ok && res.status === 401 && auth?.pin) {
    await refreshAuthFromApi(auth, { includeMfa: true });
    res = await request();
  }
  if (!res.ok) {
    const text = await res.text();
    let detail = "";
    try { detail = JSON.parse(text)?.detail || text; } catch { detail = text; }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

const CITY_LABELS: Record<string, string> = {
  dubai: "Dubai",
  manila: "Manila",
  both: "Dubai + Manila",
};

function cityLabel(c: string) {
  return CITY_LABELS[c?.toLowerCase()] || c?.toUpperCase() || "—";
}

function formatDate(s: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return s; }
}

export default function AiHistoryPage() {
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchSnapshots(cityFilter)
      .then(setItems)
      .catch((e) => setError(e?.message || "Failed to load."))
      .finally(() => setLoading(false));
  }, [cityFilter]);

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-100">AI Analysis History</h1>
            <p className="mt-0.5 text-xs text-neutral-500">Saved AI Analytics responses</p>
          </div>
          <Link
            href="/admin/analytics?tab=ai"
            className="rounded-xl border border-neutral-700 px-4 py-2 text-xs text-neutral-400 transition hover:bg-neutral-800"
          >
            ← Back to AI Analytics
          </Link>
        </div>

        {/* Filter */}
        <div className="mb-4 flex gap-2">
          {["", "dubai", "manila", "both"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCityFilter(c)}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs transition",
                cityFilter === c
                  ? "border-violet-500/60 bg-violet-600/30 text-violet-200"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800",
              ].join(" ")}
            >
              {c === "" ? "All" : cityLabel(c)}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">Loading...</div>
        ) : error ? (
          <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
            ❌ {error}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-neutral-600">
            No saved analyses yet.
            <br />
            <span className="text-neutral-700">Use the 💾 Save button on any AI Analytics response to save it here.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden"
                >
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full px-5 py-4 text-left hover:bg-neutral-800/40 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="rounded-md border border-violet-600/30 bg-violet-600/20 px-2 py-0.5 text-[11px] text-violet-300">
                            {cityLabel(item.city)}
                          </span>
                          {item.date_from && item.date_to && (
                            <span className="text-[11px] text-neutral-500">
                              {item.date_from} 〜 {item.date_to}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm text-neutral-200 font-medium">
                          {item.question || "(No question)"}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                          {item.answer.slice(0, 200)}...
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-neutral-500">{formatDate(item.created_at)}</p>
                        <p className="text-[11px] text-neutral-600">{item.saved_by || "—"}</p>
                        <p className="mt-1 text-[11px] text-neutral-700">{isExpanded ? "▲ Collapse" : "▼ View Full"}</p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-neutral-800 px-5 py-4">
                      {item.question && (
                        <div className="mb-3">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Question</p>
                          <p className="rounded-xl border border-violet-600/20 bg-violet-600/10 px-4 py-2 text-sm text-violet-200">
                            {item.question}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">AI Response</p>
                        <div className="rounded-xl border border-neutral-700/40 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                          {item.answer}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-600">
                        <span>Model: {item.model || "—"}</span>
                        <span>Input {item.input_tokens} tokens</span>
                        <span>Output {item.output_tokens} tokens</span>
                        <span>Saved by: {item.saved_by || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
