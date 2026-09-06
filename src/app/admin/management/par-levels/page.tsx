"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import SelectDark from "@/components/SelectDark";

interface ParLevel {
  id: number;
  city: string;
  branch_code: string;
  section: string;
  item_name: string;
  unit: string;
  par_qty: number;
  is_active: boolean;
  /** 'seeded_median' means nobody has reviewed this number yet. */
  source: string;
  updated_by: string | null;
  updated_at: string;
  /** Empty means the plain row: closing, any day. Two rows for one item are not
      duplicates — they are different scopes, and the screen has to say so. */
  shift: string;
  day_type: string;
  /** What the last N days of closing reports said. Absent until the server
      has statistics for this item — a par nobody has ever reported against. */
  stats?: {
    obs_days: number; obs_min: number; obs_median: number; obs_max: number;
    unit_variants: number; obs_unit: string;
  } | null;
  verdict?: Verdict;
  reason?: string;
  obs_days?: number;
  days_below?: number;
}

type Verdict = "no_par" | "unit_mixed" | "unit_mismatch" | "too_high" | "no_data" | "thin" | "consistent";

// Dealt with in this order: something the alert cannot read at all, then a par
// that cries wolf, then one with nothing behind it, then one with too little,
// then the ones the reports already agree with.
const VERDICT_ORDER: Verdict[] = ["no_par", "unit_mixed", "unit_mismatch", "too_high", "no_data", "thin", "consistent"];

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  no_par:        { label: "No par",       cls: "text-red-300 bg-red-500/12 border-red-500/25" },
  unit_mixed:    { label: "Unit mixed",   cls: "text-red-300 bg-red-500/12 border-red-500/25" },
  unit_mismatch: { label: "Unit differs", cls: "text-red-300 bg-red-500/12 border-red-500/25" },
  too_high:      { label: "Too high",     cls: "text-orange-300 bg-orange-500/12 border-orange-500/25" },
  no_data:       { label: "No reports",   cls: "text-zinc-400 bg-white/5 border-white/10" },
  thin:          { label: "Thin history", cls: "text-amber-300 bg-amber-500/12 border-amber-500/25" },
  consistent:    { label: "Matches",      cls: "text-emerald-300 bg-emerald-500/12 border-emerald-500/25" },
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const CITIES = [
  { value: "manila", label: "Manila" },
  { value: "dubai", label: "Dubai" },
];

export default function ParLevelsPage() {
  const router = useRouter();
  const [city, setCity] = useState("manila");
  const [rows, setRows] = useState<ParLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [windowDays, setWindowDays] = useState(60);
  const [confirming, setConfirming] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [branchFilter, setBranchFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fmanagement%2Fpar-levels");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/management/par-levels?city=${city}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.par_levels || []);
      setWindowDays(Number(data.window_days) || 60);
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load par levels: ${e}` });
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSeed() {
    setSeeding(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/management/par-levels/seed", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city, days: 30, overwrite: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBanner({
        kind: "ok",
        text:
          `Proposed ${d.written} par levels from the last ${d.days} days ` +
          `(${d.skipped_existing} left alone because a value already exists).`,
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Seeding failed: ${e}` });
    } finally {
      setSeeding(false);
    }
  }

  /** The one write path. Confirming and correcting differ only in the number
      sent, so they must not be two copies of this. */
  async function writeRow(row: ParLevel, value: number, what: "Save" | "Confirm") {
    setSavingId(row.id);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/management/par-levels", {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          city: row.city,
          branch_code: row.branch_code,
          item_name: row.item_name,
          section: row.section,
          unit: row.unit,
          par_qty: value,
          updated_by: auth?.staffName || null,
          // Sent back as it came, or the save creates a second plain row
          // instead of editing the one on screen.
          shift: row.shift || "",
          day_type: row.day_type || "",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing((e) => {
        const next = { ...e };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `${what} failed: ${e}` });
    } finally {
      setSavingId(null);
    }
  }

  async function saveRow(row: ParLevel) {
    const raw = editing[row.id];
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      setBanner({ kind: "err", text: "Par level must be a number greater than 0." });
      return;
    }
    await writeRow(row, value, "Save");
  }

  /** Agreeing with a proposed number had no way to be recorded: Save is disabled
      until the value changes, so the only route off "Proposed" was to type a
      different number. 182 of the 228 rows here match the last 60 days of
      reports, and every one of them was stuck showing as unreviewed. */
  async function confirmRow(row: ParLevel) {
    await writeRow(row, row.par_qty, "Confirm");
  }

  async function removeRow(row: ParLevel) {
    if (!confirm(`Remove the par level for ${row.item_name} at ${row.branch_code}?\n\nNo alert will fire for this item until a new one is set.`)) return;
    try {
      const res = await fetch(`/api/admin/management/par-levels/${row.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Delete failed: ${e}` });
    }
  }

  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.branch_code))).sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter(
      (r) =>
        (branchFilter === "all" || r.branch_code === branchFilter) &&
        (!q || r.item_name.toLowerCase().includes(q) || r.section.toLowerCase().includes(q)),
    );
    // Worst first. Alphabetical made the reviewer read 225 rows to find the one
    // that would have alerted on half the days.
    const rank = (r: ParLevel) => {
      const i = VERDICT_ORDER.indexOf((r.verdict ?? "consistent") as Verdict);
      return i < 0 ? VERDICT_ORDER.length : i;
    };
    return [...kept].sort((a, b) =>
      rank(a) - rank(b) ||
      (b.days_below ?? 0) - (a.days_below ?? 0) ||
      a.branch_code.localeCompare(b.branch_code) ||
      a.item_name.localeCompare(b.item_name));
  }, [rows, branchFilter, query]);

  const unreviewed = rows.filter((r) => r.source === "seeded_median").length;
  const matching = rows.filter(
    (r) => r.source === "seeded_median" && r.verdict === "consistent",
  ).length;

  /** Confirms only what the server judges consistent — it is told the city, not
      a list of ids, so a screen left open overnight cannot wave through a value
      the reports have since contradicted. */
  async function confirmMatching() {
    if (!confirm(
      `Mark ${matching} proposed par levels as reviewed?\n\n` +
      `These are the ones the last ${windowDays} days of reports agree with. ` +
      `The numbers do not change. Rows with a unit problem, too few reports, ` +
      `or none at all are left alone.`)) return;
    setConfirming(true);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/management/par-levels/confirm-matching", {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ city, updated_by: auth?.staffName || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const left = Object.entries(data.left_for_review || {})
        .map(([k, v]) => `${k} ${v}`).join(", ");
      setBanner({
        kind: "ok",
        text: `Confirmed ${data.confirmed}.` + (left ? ` Still to look at: ${left}.` : ""),
      });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `Confirm failed: ${e}` });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <MgmtChannelTabBar active="par" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Backup Par Levels</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            The quantity each branch is expected to hold at closing. A submitted backup
            report below 70% of this raises a caution for the manager; below 50% raises a
            critical alert.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <SelectDark
              value={city}
              onChange={(v) => setCity(v)}
              options={CITIES}
            />
          </div>
          <button onClick={load} disabled={loading} className={SMALL_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Items with a par</div>
          <div className={KPI_VALUE}>{rows.length}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Branches</div>
          <div className={KPI_VALUE}>{branches.length}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Not yet reviewed</div>
          <div className={KPI_VALUE + (unreviewed ? " text-amber-300" : "")}>{unreviewed}</div>
          {/* Says how to clear it. The count sat at 80% because agreeing with a
              proposed number was not an action the screen offered. */}
          {unreviewed ? (
            <div className="text-[11px] text-zinc-500 mt-1">
              ✓ to keep the number · type a new one to change it
            </div>
          ) : null}
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Reviewed</div>
          <div className={KPI_VALUE}>{rows.length - unreviewed}</div>
        </div>
      </div>

      {unreviewed > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100/90 leading-relaxed">
            <strong>{unreviewed}</strong> par levels were proposed from the median of the
            last 30 days of reports. A median describes what the branch{" "}
            <em>typically holds</em>, not what it <em>should</em> hold — review each one
            and edit it to the real target. Alerts still fire on the proposed values in
            the meantime, so a wrong number produces a wrong alert.
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            banner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {banner.kind === "ok" ? (
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-current opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={GLASS_CARD + " p-4 space-y-4"}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <SelectDark
              value={branchFilter}
              onChange={setBranchFilter}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((b) => ({ value: b, label: b })),
              ]}
            />
          </div>
          <input
            className={INPUT_CLASS + " max-w-xs"}
            placeholder="Search item or section…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex-1" />
          {matching > 0 ? (
            <button onClick={confirmMatching} disabled={confirming} className={SMALL_BUTTON + " text-sm text-emerald-300"}>
              <Check className={`h-4 w-4 inline mr-1.5 ${confirming ? "animate-pulse" : ""}`} />
              {confirming ? "Confirming…" : `Confirm ${matching} matching`}
            </button>
          ) : null}
          <button onClick={handleSeed} disabled={seeding} className={PRIMARY_BUTTON + " text-sm"}>
            <Sparkles className={`h-4 w-4 inline mr-1.5 ${seeding ? "animate-pulse" : ""}`} />
            {seeding ? "Proposing…" : "Propose from last 30 days"}
          </button>
        </div>

        {loading ? (
          <div className={T_CAPTION + " py-8 text-center"}>Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className={T_BODY}>No par levels yet for this selection.</div>
            <div className={T_CAPTION}>
              Use “Propose from last 30 days” to generate a starting set from submitted
              backup reports, then correct the numbers.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <caption className="caption-top pb-3 text-left text-[11px] text-zinc-500">
                {/* The rule, on the screen. A threshold nobody can see is a
                    threshold nobody trusts. */}
                Sorted worst first. Figures are the lowest / middle / highest daily total
                over the last {windowDays} days, counting only the reports each row applies
                to — closing and any day unless the row says otherwise. An alert fires below
                70% of par.
              </caption>
              <thead>
                <tr className="text-left">
                  <th className={TABLE_HEADER + " pl-2"}>Branch</th>
                  <th className={TABLE_HEADER}>Section</th>
                  <th className={TABLE_HEADER}>Item</th>
                  <th className={TABLE_HEADER + " text-right"}>Par</th>
                  <th className={TABLE_HEADER}>Unit</th>
                  <th className={TABLE_HEADER}>What the reports say</th>
                  <th className={TABLE_HEADER}>Source</th>
                  <th className={TABLE_HEADER + " text-right pr-2"}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const dirty = editing[r.id] !== undefined;
                  return (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className="py-2.5 pl-2 text-sm text-zinc-300">{r.branch_code}</td>
                      <td className="py-2.5 text-xs text-zinc-500">{r.section || "—"}</td>
                      <td className="py-2.5 text-sm text-zinc-100">
                        {r.item_name}
                        {r.shift || r.day_type ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-300/80 border border-violet-400/25 rounded px-1 py-0.5">
                            {[r.shift, r.day_type].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          className="w-24 rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-sm text-white text-right tabular-nums outline-none focus:border-violet-500/50"
                          value={dirty ? editing[r.id] : String(r.par_qty)}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [r.id]: e.target.value }))
                          }
                          inputMode="decimal"
                        />
                      </td>
                      <td className="py-2.5 text-xs text-zinc-500">{r.unit}</td>
                      {/* The evidence, on the row. Without it the only way to
                          judge a proposed number was to go and read the reports,
                          which is why none of them were ever judged. */}
                      <td className="py-2.5">
                        {r.verdict ? (
                          <div className="flex items-center gap-2">
                            <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded border px-1.5 py-0.5 ${VERDICT_STYLE[r.verdict].cls}`}>
                              {VERDICT_STYLE[r.verdict].label}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {r.stats
                                ? `${fmt(r.stats.obs_min)} / ${fmt(r.stats.obs_median)} / ${fmt(r.stats.obs_max)} ${r.stats.obs_unit} · ${r.reason}`
                                : r.reason}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {r.source === "seeded_median" ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300 bg-amber-500/12 border border-amber-500/25 rounded px-1.5 py-0.5">
                            Proposed
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 rounded px-1.5 py-0.5">
                            Reviewed
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.source === "seeded_median" && !dirty ? (
                            <button
                              onClick={() => confirmRow(r)}
                              disabled={savingId === r.id}
                              className={SMALL_BUTTON + " disabled:opacity-30 text-emerald-300"}
                              title="This number is right — mark it reviewed"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            onClick={() => saveRow(r)}
                            disabled={!dirty || savingId === r.id}
                            className={SMALL_BUTTON + " disabled:opacity-30"}
                            title="Save"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeRow(r)}
                            className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-red-300 hover:bg-red-500/20 transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
