"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Search, X, Users, Package, UtensilsCrossed, ShieldAlert } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

interface Pattern {
  id: number;
  city: string;
  branch: string;
  pattern_type: string;
  pattern_key: string;
  subject: string;
  occurrences: number;
  threshold: number;
  window_days: number;
  severity: "red" | "yellow" | "green";
  route_to: string;
  action_label: string;
  detail: Record<string, unknown>;
  status: "open" | "acknowledged" | "closed";
  first_seen: string | null;
  last_seen: string | null;
  acknowledged_by: string | null;
}

/** What each pattern actually claims, in the words of whoever has to act on it. */
const PATTERN_META: Record<
  string,
  { label: string; icon: typeof Users; means: string }
> = {
  repeat_attendance: {
    label: "Repeat unverified attendance",
    icon: Users,
    means: "The same staff member's attendance could not be verified three times in two weeks. One miss is a clock-in slip; three is a record that HR needs.",
  },
  repeat_product_score: {
    label: "Repeat low product score",
    icon: UtensilsCrossed,
    means: "The same person posted three C-or-below products in a week. Verbal feedback per incident is evidently not landing.",
  },
  recurring_issue: {
    label: "Recurring product issue",
    icon: RefreshCw,
    means: "The same branch failed on the same issue twice in a week. This points at a standard or a station, not at one shift.",
  },
  repeat_backup_shortfall: {
    label: "Repeat backup shortfall",
    icon: Package,
    means: "The branch dropped below 50% of par twice in five days. Either prep is short or the par level is wrong — both need a decision, not another alert.",
  },
  repeat_cannot_response: {
    label: "Repeat “cannot” response",
    icon: ShieldAlert,
    means: "The manager answered “cannot” three times in a week. The instruction loop is running but nothing is changing on the floor.",
  },
};

const ROUTE_LABELS: Record<string, string> = {
  bo_a: "BO Staff A",
  bo_b: "BO Staff B",
  bo_c: "BO Staff C",
  area_manager: "Area Manager",
  hq: "HQ",
};

export default function PatternsPage() {
  const router = useRouter();
  const [city, setCity] = useState("manila");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fmanagement%2Fpatterns");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city });
      if (statusFilter !== "all") qs.set("status", statusFilter);
      const res = await fetch(`/api/admin/management/patterns?${qs}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setPatterns(d.patterns || []);
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load patterns: ${e}` });
    } finally {
      setLoading(false);
    }
  }, [city, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function runScan() {
    setScanning(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/management/patterns/detect", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const errs: { pattern: string; error: string }[] = d.errors || [];
      setBanner(
        errs.length
          ? {
              kind: "err",
              text: `${d.found} patterns found, but ${errs.length} rule(s) failed: ${errs
                .map((e) => `${e.pattern} (${e.error})`)
                .join("; ")}`,
            }
          : { kind: "ok", text: `Scan complete — ${d.found} patterns at or above threshold.` },
      );
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Scan failed: ${e}` });
    } finally {
      setScanning(false);
    }
  }

  async function setStatus(p: Pattern, status: "acknowledged" | "closed" | "open") {
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/management/patterns/${p.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ status, acknowledged_by: auth?.staffName || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Update failed: ${e}` });
    }
  }

  const counts = useMemo(
    () => ({
      red: patterns.filter((p) => p.severity === "red").length,
      open: patterns.filter((p) => p.status === "open").length,
      total: patterns.length,
    }),
    [patterns],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Pattern Detection</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            A single exception is the manager’s to handle. A pattern says the
            single-incident loop is not working, so it routes past the manager to whoever
            can change the underlying cause.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32">
            <SelectDark
              value={city}
              onChange={setCity}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
          </div>
          <div className="w-40">
            <SelectDark
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "open", label: "Open" },
                { value: "acknowledged", label: "Acknowledged" },
                { value: "closed", label: "Closed" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <button onClick={runScan} disabled={scanning} className={PRIMARY_BUTTON + " text-sm"}>
            <Search className={`h-4 w-4 inline mr-1.5 ${scanning ? "animate-pulse" : ""}`} />
            {scanning ? "Scanning…" : "Run Scan"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Critical</div>
          <div className={KPI_VALUE + (counts.red ? " text-red-300" : "")}>{counts.red}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Open</div>
          <div className={KPI_VALUE}>{counts.open}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Shown</div>
          <div className={KPI_VALUE}>{counts.total}</div>
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
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className={T_CAPTION + " py-10 text-center"}>Loading…</div>
      ) : patterns.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center space-y-2"}>
          <div className={T_BODY}>No patterns at or above threshold.</div>
          <div className={T_CAPTION}>
            That is the expected state. Patterns appear only when the same thing repeats
            inside its window.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => {
            const meta = PATTERN_META[p.pattern_type];
            const Icon = meta?.icon ?? RefreshCw;
            const critical = p.severity === "red";
            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-5 ${
                  critical
                    ? "border-red-500/35 bg-red-950/20"
                    : "border-amber-500/30 bg-amber-950/15"
                } ${p.status !== "open" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-xl p-2 flex-shrink-0 ${
                      critical ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {meta?.label ?? p.pattern_type}
                      </span>
                      <span className="text-xs text-zinc-500">{p.branch}</span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                          critical
                            ? "text-red-300 bg-red-500/15 border border-red-500/30"
                            : "text-amber-300 bg-amber-500/15 border border-amber-500/30"
                        }`}
                      >
                        {p.action_label}
                      </span>
                      {p.status !== "open" && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 bg-white/8 border border-white/12 rounded px-1.5 py-0.5">
                          {p.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 text-base font-medium text-white truncate">
                      {p.subject}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-sm text-zinc-300 tabular-nums">
                        <strong className={critical ? "text-red-300" : "text-amber-300"}>
                          {p.occurrences}×
                        </strong>{" "}
                        in {p.window_days} days
                        <span className="text-zinc-500"> (threshold {p.threshold})</span>
                      </span>
                      <span className={T_CAPTION}>
                        {p.first_seen} → {p.last_seen}
                      </span>
                      <span className={T_CAPTION}>
                        Route to:{" "}
                        <span className="text-zinc-300">
                          {ROUTE_LABELS[p.route_to] ?? p.route_to}
                        </span>
                      </span>
                    </div>

                    {meta?.means && (
                      <p className="mt-2.5 text-xs text-zinc-400 leading-relaxed">{meta.means}</p>
                    )}

                    {p.acknowledged_by && (
                      <div className={T_CAPTION + " mt-1.5"}>
                        Acknowledged by {p.acknowledged_by}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {p.status === "open" && (
                      <button onClick={() => setStatus(p, "acknowledged")} className={SMALL_BUTTON}>
                        Acknowledge
                      </button>
                    )}
                    {p.status !== "closed" ? (
                      <button onClick={() => setStatus(p, "closed")} className={SMALL_BUTTON}>
                        <Check className="h-3.5 w-3.5 inline mr-1" />
                        Close
                      </button>
                    ) : (
                      <button onClick={() => setStatus(p, "open")} className={SMALL_BUTTON}>
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={GLASS_CARD + " p-4"}>
        <div className={T_LABEL + " mb-3"}>Thresholds</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {Object.entries(PATTERN_META).map(([key, m]) => (
                <tr key={key} className="border-t border-white/5 first:border-t-0">
                  <td className="py-2 pr-4 text-zinc-200">{m.label}</td>
                  <td className="py-2 text-zinc-500 text-xs">{key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
