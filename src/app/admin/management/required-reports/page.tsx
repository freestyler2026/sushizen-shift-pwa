"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import { GLASS_CARD, SMALL_BUTTON, T_PAGE_TITLE, T_CAPTION, T_LABEL, INPUT_CLASS } from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import SelectDark from "@/components/SelectDark";

type Stage = "missing" | "not_due" | "submitted" | "reviewed" | "issue" | "action";

interface Row {
  item_key: string;
  label: string;
  deadline: string;
  page: string;
  slot: string;
  severity: string;
  note: string;
  branch: string;
  stage: Stage;
  due: boolean;
  submitted_at: string | null;
  late: boolean;
  reviewed_by: string;
  reviewed_at: string | null;
  issue_found: boolean | null;
  issue_note: string;
  action_taken: string;
  action_by: string;
}

// Submitted is not reviewed. The colours say which of the two a cell is, because
// a report that arrived and a report somebody read are different facts and the
// old view could only show the first.
const STAGE_STYLE: Record<Stage, { bg: string; text: string; label: string }> = {
  missing:   { bg: "bg-red-500/15 border-red-500/30",       text: "text-red-300",     label: "Not submitted" },
  not_due:   { bg: "bg-white/[0.03] border-white/10",        text: "text-zinc-500",    label: "Not due yet" },
  submitted: { bg: "bg-amber-500/12 border-amber-500/25",    text: "text-amber-300",   label: "Submitted, not checked" },
  reviewed:  { bg: "bg-emerald-500/12 border-emerald-500/25",text: "text-emerald-300", label: "Checked" },
  issue:     { bg: "bg-orange-500/15 border-orange-500/30",  text: "text-orange-300",  label: "Issue found" },
  action:    { bg: "bg-sky-500/12 border-sky-500/25",        text: "text-sky-300",     label: "Handled" },
};

function Cell({ row, onReview }: { row: Row; onReview: (r: Row, issue: boolean, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState(row.issue_found === true);
  const [note, setNote] = useState(row.issue_note || "");
  const [busy, setBusy] = useState(false);
  const st = STAGE_STYLE[row.stage];

  const canReview = row.stage === "submitted" || row.stage === "reviewed" || row.stage === "issue";

  return (
    <td className="align-top p-1">
      <button
        type="button"
        onClick={() => canReview && setOpen((v) => !v)}
        className={`w-full rounded-lg border px-2 py-1.5 text-left ${st.bg} ${canReview ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className={`text-[11px] font-semibold ${st.text}`}>{st.label}</div>
        {row.late && <div className="text-[10px] text-red-300">Submitted late</div>}
        {row.reviewed_by && <div className="text-[10px] text-zinc-500">{row.reviewed_by}</div>}
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2">
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <input type="checkbox" checked={issue} onChange={(e) => setIssue(e.target.checked)}
                   className="h-3 w-3 accent-orange-500" />
            Something was wrong with it
          </label>
          {issue && (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="What was wrong"
              className={INPUT_CLASS + " mt-1 w-full text-[11px]"} />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onReview(row, issue, note); setBusy(false); setOpen(false); }}
            className="mt-1.5 w-full rounded bg-violet-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? "…" : "Record as checked"}
          </button>
        </div>
      )}
    </td>
  );
}

export default function RequiredReportsPage() {
  const router = useRouter();
  const [city, setCity] = useState("manila");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.replace("/login"); return; }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ city, ...(date ? { date } : {}) }).toString();
      const res = await fetch(`/api/admin/management/required-reports?${qs}`, {
        headers: getAuthHeaders(getAuth()), cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.rows || []); setBranches(d.branches || []); setCounts(d.counts || {});
      if (!date) setDate(d.date);
    } catch (e) {
      setError(String(e));
    } finally { setLoading(false); }
  }, [city, date]);

  useEffect(() => { void load(); }, [load]);

  const review = async (r: Row, issue: boolean, note: string) => {
    try {
      const res = await fetch("/api/admin/management/required-reports/review", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city, branch: r.branch, report_date: date, item_key: r.item_key,
          issue_found: issue, issue_note: note,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) { setError(String(e)); }
  };

  const items = useMemo(() => {
    const seen = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = seen.get(r.item_key) ?? [];
      arr.push(r);
      seen.set(r.item_key, arr);
    }
    return [...seen.entries()];
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <MgmtChannelTabBar active="reports" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className={T_PAGE_TITLE}>Required Reports</h1>
        <SelectDark value={city} onChange={setCity}
          options={[{ value: "manila", label: "Manila" }, { value: "dubai", label: "Dubai" }]} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
               className={INPUT_CLASS + " text-sm"} />
        <button type="button" onClick={() => void load()} className={SMALL_BUTTON}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
      </div>

      <p className={`${T_CAPTION} mb-4 max-w-3xl`}>
        <strong>Submitted and checked are not the same thing.</strong>
        A submission alone does not tell you the contents are right. Press a cell and record it as checked.
        If something is wrong, record it there and then. Anything not yet due is grey, and is not the same as not submitted.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["missing", "submitted", "reviewed", "issue", "action", "not_due"] as Stage[]).map((s) => (
          <div key={s} className={`rounded-lg border px-3 py-1.5 ${STAGE_STYLE[s].bg}`}>
            <span className={`text-xs font-semibold ${STAGE_STYLE[s].text}`}>{STAGE_STYLE[s].label}</span>
            <span className="ml-2 text-sm font-bold tabular-nums text-white">{counts[s] ?? 0}</span>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className={T_CAPTION}>Loading…</div>}

      {!loading && (
        <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className={`${T_LABEL} px-3 py-2 text-left`}>Required Item</th>
                <th className={`${T_LABEL} px-3 py-2 text-left`}>Due</th>
                <th className={`${T_LABEL} px-3 py-2 text-left`}>Owner</th>
                {branches.map((b) => (
                  <th key={b} className={`${T_LABEL} px-3 py-2 text-left`}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(([key, cells]) => {
                const first = cells[0];
                return (
                  <tr key={key} className="border-b border-white/5">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-white">{first.label}</div>
                      {first.note && <div className="text-[11px] text-amber-300">{first.note}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-zinc-300">{first.deadline}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{first.slot}</td>
                    {branches.map((b) => {
                      const r = cells.find((c) => c.branch === b);
                      return r ? <Cell key={b} row={r} onReview={review} /> : <td key={b} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
