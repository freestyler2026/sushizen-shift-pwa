"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, CheckCircle2, XCircle, ChevronUp, ChevronDown, Send,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  SELECT_CLASS,
  INPUT_CLASS,
  T_CAPTION,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

/** Cash discrepancy notices, wherever the person who handles notices is.
 *
 *  This lived only on Cash Management, filed by where the data came from rather
 *  than by whose job it is. The people who work Notices to Explain never saw it,
 *  and 170 drafts accumulated across three months without one being actioned —
 *  the owner of the business did not know the feature existed.
 *
 *  One component, rendered in both places, so neither copy can drift.
 */

type NteGroup = {
  staff_name: string; branch: string; draft_count: number;
  oldest: string; newest: string; oldest_days: number; ids: string[];
};

type NteRow = {
  id: string; branch: string; report_date: string; report_type: string;
  staff_name: string; status: string; discrepancy_types: string[];
  discrepancy_details: Record<string, unknown>; nte_text: string;
  approved_by: string; approved_at: string | null; created_at: string;
};

const BRANCH_LABELS: Record<string, string> = {
  PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft",
};

export default function NteView() {
  const [ntes, setNtes]     = useState<NteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approver, setApprover] = useState(getAuth()?.staffName || "");
  const [groups, setGroups] = useState<NteGroup[]>([]);
  const [reasons, setReasons] = useState<{ key: string; label: string }[]>([]);
  const [groupReason, setGroupReason] = useState("");
  const [groupNote, setGroupNote] = useState("");
  const [tolerance, setTolerance] = useState<number | null>(null);
  const [busy, setBusy]   = useState<string | null>(null);
  const [msg, setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    // 500, not 100: there are 170 drafts and the first hundred were the only
    // ones anybody could see.
    fetch(`${API_BASE}/api/admin/cash-reports/nte?limit=500`, {
      headers: getAuthHeaders(getAuth()),
    }).then((r) => r.json()).then((d) => setNtes(d.ntes || []))
      .catch(() => {}).finally(() => setLoading(false));
    fetch(`${API_BASE}/api/admin/cash-reports/nte/summary`, {
      headers: getAuthHeaders(getAuth()),
    }).then((r) => r.json()).then((d) => {
      setGroups(d.groups || []);
      if (typeof d.tolerance === "number") setTolerance(d.tolerance);
    }).catch(() => {});
    fetch(`${API_BASE}/api/admin/cash-reports/nte/reasons`, {
      headers: getAuthHeaders(getAuth()),
    }).then((r) => r.json()).then((d) => setReasons(d.reasons || []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const dismissGroup = async (g: NteGroup) => {
    if (!approver.trim()) { setMsg({ ok: false, text: "Your name is required." }); return; }
    if (!groupReason) { setMsg({ ok: false, text: "Pick a reason first." }); return; }
    if (groupReason === "other" && !groupNote.trim()) {
      setMsg({ ok: false, text: "Choosing Other needs a note." }); return;
    }
    if (!window.confirm(
      `Dismiss all ${g.draft_count} drafts for ${g.staff_name}? ` +
      `This records that they were reviewed and no notice is needed.`
    )) return;
    setBusy(g.staff_name); setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/nte/dismiss-bulk`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: g.ids, dismissed_by: approver.trim(),
          reason: groupReason, note: groupNote.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      // Two people can work this list at once, and the server names back the
      // ones that had already moved. Saying so beats a count that quietly does
      // not add up to what was on screen a moment ago.
      const skipped = Array.isArray(d.skipped) ? d.skipped.length : 0;
      setMsg({
        ok: true,
        text:
          `${d.dismissed} draft(s) dismissed for ${g.staff_name}.` +
          (skipped > 0
            ? ` ${skipped} had already been actioned by someone else — the list is refreshed.`
            : ""),
      });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const approve = async (nteId: string) => {
    if (!approver.trim()) { setMsg({ ok: false, text: "Approver name required." }); return; }
    setBusy(nteId); setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/nte/${nteId}/approve`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: approver.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setMsg({ ok: true, text: "NTE issued successfully." });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const filtered = filter ? ntes.filter((n) => n.status === filter) : ntes;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SelectDark
          className={`${SELECT_CLASS} flex-1`}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "", label: "All Status" },
            { value: "DRAFT", label: "Draft" },
            { value: "ISSUED", label: "Issued" },
            { value: "DISMISSED", label: "Dismissed" },
            { value: "RESOLVED", label: "Resolved" },
          ]}
        />
        <div className="flex-1">
          <input className={INPUT_CLASS} placeholder="Your name (approver)" value={approver}
            onChange={(e) => setApprover(e.target.value)} />
        </div>
        <button type="button" onClick={load} className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
          <RefreshCw size={14} className={`text-zinc-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Drafts by person.
          170 drafts across 22 people, none ever actioned, because the only exit
          was issuing a formal notice and there was no way to say "reviewed, no
          notice needed". A queue whose only exit is the heaviest action does not
          get worked. */}
      {groups.length > 0 && (
        <div className={`${GLASS_CARD} space-y-3`}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-white">
              {groups.reduce((n, g) => n + g.draft_count, 0)} drafts waiting
              <span className="text-white/50"> · {groups.length} people</span>
            </p>
            <p className="text-xs text-amber-300">
              oldest {Math.max(...groups.map((g) => g.oldest_days))} days
            </p>
          </div>
          <p className="text-xs leading-relaxed text-white/50">
            {tolerance !== null && (
              <>
                A notice is drafted only when a report is out by more than{" "}
                <span className="font-medium text-white/70">
                  ₱{tolerance.toLocaleString("en-PH")}
                </span>
                . Below that it is treated as a counting difference and nothing
                is raised.{" "}
              </>
            )}
            Issuing a notice is not the only option either. If a discrepancy was
            already explained or handled at the branch, dismiss it — that records
            the review without putting a notice on anyone&apos;s file.
          </p>
          {tolerance !== null && groups.length > 0 && (
            <p className="text-xs text-white/40">
              Drafts raised before this threshold existed are still listed, so
              older ones may be below it.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <SelectDark
                className={SELECT_CLASS}
                value={groupReason}
                onChange={setGroupReason}
                options={[
                  { value: "", label: "Reason for dismissing…" },
                  ...reasons.map((r) => ({ value: r.key, label: r.label })),
                ]}
              />
            </div>
            {groupReason === "other" && (
              <input
                className={`${INPUT_CLASS} flex-1`}
                placeholder="Say why"
                value={groupNote}
                onChange={(e) => setGroupNote(e.target.value)}
              />
            )}
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {groups.map((g) => (
              <div
                key={`${g.staff_name}-${g.branch}`}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-white/4 px-3 py-2"
              >
                <span className="min-w-[160px] flex-1 truncate text-sm text-white">
                  {g.staff_name}
                </span>
                <span className="text-xs text-white/50">{g.branch}</span>
                <span className="text-sm tabular-nums text-white/80">
                  {g.draft_count} drafts
                </span>
                <span className={`text-xs tabular-nums ${g.oldest_days > 30 ? "text-amber-300" : "text-white/40"}`}>
                  oldest {g.oldest_days}d
                </span>
                <button
                  type="button"
                  disabled={busy === g.staff_name}
                  onClick={() => dismissGroup(g)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === g.staff_name ? "Dismissing…" : "Dismiss all"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}


      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No NTE records found.</div>
      ) : filtered.map((nte) => (
        <div key={nte.id} className={`${GLASS_CARD} p-4 space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${nte.status === "ISSUED" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : nte.status === "RESOLVED" ? "border-zinc-500/30 bg-zinc-500/15 text-zinc-400" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}>
                  {nte.status}
                </span>
                <span className="text-sm font-semibold text-white">{nte.staff_name}</span>
                <span className="text-xs text-zinc-400">{BRANCH_LABELS[nte.branch] ?? nte.branch} · {nte.report_date}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(nte.discrepancy_types || []).map((t) => (
                  <span key={t} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 px-1.5 rounded">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setExpanded(expanded === nte.id ? null : nte.id)}
                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10">
                {expanded === nte.id ? <ChevronUp size={13} className="text-zinc-400" /> : <ChevronDown size={13} className="text-zinc-400" />}
              </button>
              {nte.status === "DRAFT" && (
                <button type="button" onClick={() => approve(nte.id)} disabled={busy === nte.id}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30 disabled:opacity-50">
                  {busy === nte.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                  Approve & Issue
                </button>
              )}
            </div>
          </div>
          {expanded === nte.id && (
            <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-4">
              <p className={`${T_CAPTION} text-zinc-500 mb-2`}>NTE Text Preview</p>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">{nte.nte_text}</pre>
              {nte.approved_by && (
                <p className="text-xs text-zinc-500 mt-2">Approved by: {nte.approved_by} on {nte.approved_at?.slice(0,10)}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
