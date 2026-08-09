"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  DANGER_BUTTON,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_LABEL,
} from "@/lib/ui-tokens";

const T_MUTED = "text-neutral-500";

// ─── types ────────────────────────────────────────────────────────────────────

type Session = {
  session_id: string;
  staff_name: string;
  role: string;
  city: string;
  ip: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

type FrozenAccount = {
  staff_name: string;
  reason: string;
  frozen_by: string;
  frozen_at: string;
  auto_frozen: boolean;
};

type AuditEvent = {
  id: number;
  actor_staff_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  result: string;
  created_at: string;
  extra_json: Record<string, unknown>;
};

type Tab = "sessions" | "frozen" | "audit";

// ─── helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers as Record<string, string> | undefined) } });
}

function fmt(ts: string) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function relTime(ts: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (Math.abs(diff) < 60_000) return "just now";
  if (diff < 0) {
    // Future timestamp (e.g., session expiry)
    const abs = -diff;
    if (abs < 3_600_000) return `in ${Math.floor(abs / 60_000)}m`;
    if (abs < 86_400_000) return `in ${Math.floor(abs / 3_600_000)}h`;
    return `in ${Math.floor(abs / 86_400_000)}d`;
  }
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const ACTION_COLORS: Record<string, string> = {
  "security.freeze": "text-red-400",
  "security.unfreeze": "text-emerald-400",
  "security.force_logout": "text-amber-400",
  "security.auto_freeze": "text-red-500",
  "auth.verify": "text-sky-400",
};

// ─── main page ────────────────────────────────────────────────────────────────

export default function SecurityAdminPage() {
  const router = useRouter();
  const auth = getAuth();

  // gate: HQ / ADMIN only
  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login"); return; }
    const r = (a.role || "").toUpperCase();
    if (r !== "HQ" && r !== "ADMIN") { router.replace("/my-shift"); return; }
  }, [router]);

  const [tab, setTab] = useState<Tab>("sessions");

  // sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [forceLogoutTarget, setForceLogoutTarget] = useState("");
  const [forceLogoutPending, setForceLogoutPending] = useState(false);

  // frozen
  const [frozen, setFrozen] = useState<FrozenAccount[]>([]);
  const [frozenLoading, setFrozenLoading] = useState(false);
  const [frozenError, setFrozenError] = useState("");
  const [unfreezeTarget, setUnfreezeTarget] = useState("");
  const [unfreezePending, setUnfreezePending] = useState(false);

  // freeze form
  const [freezeTarget, setFreezeTarget] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [freezePending, setFreezePending] = useState(false);
  const [freezeMsg, setFreezeMsg] = useState("");

  // audit log
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditStaffFilter, setAuditStaffFilter] = useState("");
  const auditFilterRef = useRef("");

  // ── loaders ──

  async function loadSessions() {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const r = await apiFetch("/api/admin/security/sessions");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setSessions(d.sessions || []);
    } catch (e: unknown) {
      setSessionsError(String((e as Error).message || e));
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadFrozen() {
    setFrozenLoading(true);
    setFrozenError("");
    try {
      const r = await apiFetch("/api/admin/security/frozen-accounts");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setFrozen(d.accounts || []);
    } catch (e: unknown) {
      setFrozenError(String((e as Error).message || e));
    } finally {
      setFrozenLoading(false);
    }
  }

  async function loadAudit(staffName = "") {
    setAuditLoading(true);
    setAuditError("");
    try {
      const qs = staffName ? `?staff_name=${encodeURIComponent(staffName)}&limit=100` : "?limit=100";
      const r = await apiFetch(`/api/admin/security/audit-log${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setEvents(d.events || []);
    } catch (e: unknown) {
      setAuditError(String((e as Error).message || e));
    } finally {
      setAuditLoading(false);
    }
  }

  // ── tab switch loads ──
  useEffect(() => {
    if (tab === "sessions") loadSessions();
    else if (tab === "frozen") loadFrozen();
    else if (tab === "audit") loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── actions ──

  async function handleForceLogout(target: string) {
    if (!window.confirm(`Force-logout all sessions for "${target}"?`)) return;
    setForceLogoutPending(true);
    setForceLogoutTarget(target);
    try {
      const r = await apiFetch("/api/admin/security/force-logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_staff_name: target }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      await loadSessions();
    } catch (e: unknown) {
      alert(String((e as Error).message || e));
    } finally {
      setForceLogoutPending(false);
      setForceLogoutTarget("");
    }
  }

  async function handleUnfreeze(target: string) {
    if (!window.confirm(`Unfreeze account for "${target}"?`)) return;
    setUnfreezePending(true);
    setUnfreezeTarget(target);
    try {
      const r = await apiFetch("/api/admin/security/unfreeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_staff_name: target }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      await loadFrozen();
    } catch (e: unknown) {
      alert(String((e as Error).message || e));
    } finally {
      setUnfreezePending(false);
      setUnfreezeTarget("");
    }
  }

  async function handleFreeze(e: React.FormEvent) {
    e.preventDefault();
    const target = freezeTarget.trim();
    const reason = freezeReason.trim();
    if (!target || !reason) return;
    if (!window.confirm(`Freeze account for "${target}"?\n\nReason: ${reason}`)) return;
    setFreezePending(true);
    setFreezeMsg("");
    try {
      const r = await apiFetch("/api/admin/security/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_staff_name: target, reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setFreezeMsg(`Frozen: ${target}`);
      setFreezeTarget("");
      setFreezeReason("");
      await loadFrozen();
    } catch (e: unknown) {
      setFreezeMsg(`Error: ${String((e as Error).message || e)}`);
    } finally {
      setFreezePending(false);
    }
  }

  // ── render ──

  const role = (auth?.role || "").toUpperCase();
  if (role !== "HQ" && role !== "ADMIN") return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-2 py-4">
      <h1 className={T_PAGE_TITLE}>Security Management</h1>

      {/* tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        {(["sessions", "frozen", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {t === "sessions" ? "Active Sessions" : t === "frozen" ? "Frozen Accounts" : "Audit Log"}
          </button>
        ))}
      </div>

      {/* ── Sessions tab ── */}
      {tab === "sessions" && (
        <div className={GLASS_CARD + " p-4"}>
          <div className="mb-3 flex items-center justify-between">
            <span className={T_LABEL}>Active Sessions ({sessions.length})</span>
            <button onClick={loadSessions} disabled={sessionsLoading} className={`text-xs ${TAB_INACTIVE} px-3 py-1.5 rounded-lg`}>
              {sessionsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {sessionsError && <p className="mb-2 text-xs text-red-400">{sessionsError}</p>}
          {sessions.length === 0 && !sessionsLoading ? (
            <p className={T_MUTED + " text-sm"}>No active sessions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-left text-neutral-500">
                    <th className="pb-2 pr-3 font-medium">Staff</th>
                    <th className="pb-2 pr-3 font-medium">Role</th>
                    <th className="pb-2 pr-3 font-medium">City</th>
                    <th className="pb-2 pr-3 font-medium">IP</th>
                    <th className="pb-2 pr-3 font-medium">Last seen</th>
                    <th className="pb-2 pr-3 font-medium">Expires</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const isSelf = s.staff_name.toLowerCase() === (auth?.staffName || "").toLowerCase();
                    return (
                      <tr key={s.session_id} className="border-b border-neutral-900 hover:bg-neutral-900/40">
                        <td className="py-2 pr-3 font-medium text-neutral-200">
                          {s.staff_name}
                          {isSelf && <span className="ml-1 text-neutral-500">(you)</span>}
                        </td>
                        <td className="py-2 pr-3 text-neutral-400">{s.role}</td>
                        <td className="py-2 pr-3 text-neutral-400 capitalize">{s.city}</td>
                        <td className="py-2 pr-3 font-mono text-neutral-400">{s.ip || "—"}</td>
                        <td className="py-2 pr-3 text-neutral-400" title={fmt(s.last_seen_at)}>
                          {relTime(s.last_seen_at)}
                        </td>
                        <td className="py-2 pr-3 text-neutral-400" title={fmt(s.expires_at)}>
                          {relTime(s.expires_at)}
                        </td>
                        <td className="py-2">
                          {!isSelf && (
                            <button
                              onClick={() => handleForceLogout(s.staff_name)}
                              disabled={forceLogoutPending && forceLogoutTarget === s.staff_name}
                              className="rounded-lg bg-red-900/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/50 disabled:opacity-40 transition-colors"
                            >
                              {forceLogoutPending && forceLogoutTarget === s.staff_name ? "…" : "Force logout"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Frozen accounts tab ── */}
      {tab === "frozen" && (
        <div className="space-y-4">
          {/* Freeze form */}
          <div className={GLASS_CARD + " p-4"}>
            <p className={T_LABEL + " mb-3"}>Freeze an account</p>
            <form onSubmit={handleFreeze} className="flex flex-wrap gap-2">
              <input
                className="h-9 min-w-52 flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-white placeholder:text-neutral-500"
                placeholder="Staff name (exact)"
                value={freezeTarget}
                onChange={(e) => setFreezeTarget(e.target.value)}
                required
              />
              <input
                className="h-9 min-w-52 flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-white placeholder:text-neutral-500"
                placeholder="Reason (required)"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={freezePending || !freezeTarget.trim() || !freezeReason.trim()}
                className={`h-9 px-4 text-sm rounded-xl ${DANGER_BUTTON} disabled:opacity-40`}
              >
                {freezePending ? "Freezing…" : "Freeze"}
              </button>
            </form>
            {freezeMsg && (
              <p className={`mt-2 text-xs ${freezeMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {freezeMsg}
              </p>
            )}
          </div>

          {/* Frozen list */}
          <div className={GLASS_CARD + " p-4"}>
            <div className="mb-3 flex items-center justify-between">
              <span className={T_LABEL}>Currently Frozen ({frozen.length})</span>
              <button onClick={loadFrozen} disabled={frozenLoading} className={`text-xs ${TAB_INACTIVE} px-3 py-1.5 rounded-lg`}>
                {frozenLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
            {frozenError && <p className="mb-2 text-xs text-red-400">{frozenError}</p>}
            {frozen.length === 0 && !frozenLoading ? (
              <p className={T_MUTED + " text-sm"}>No frozen accounts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left text-neutral-500">
                      <th className="pb-2 pr-3 font-medium">Staff</th>
                      <th className="pb-2 pr-3 font-medium">Reason</th>
                      <th className="pb-2 pr-3 font-medium">Frozen by</th>
                      <th className="pb-2 pr-3 font-medium">Frozen at</th>
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {frozen.map((f) => (
                      <tr key={f.staff_name} className="border-b border-neutral-900 hover:bg-neutral-900/40">
                        <td className="py-2 pr-3 font-medium text-red-300">{f.staff_name}</td>
                        <td className="py-2 pr-3 text-neutral-300 max-w-xs truncate" title={f.reason}>{f.reason}</td>
                        <td className="py-2 pr-3 text-neutral-400">{f.frozen_by || "—"}</td>
                        <td className="py-2 pr-3 text-neutral-400" title={fmt(f.frozen_at)}>
                          {relTime(f.frozen_at)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs ${f.auto_frozen ? "bg-amber-900/40 text-amber-400" : "bg-red-900/40 text-red-400"}`}>
                            {f.auto_frozen ? "Auto" : "Manual"}
                          </span>
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => handleUnfreeze(f.staff_name)}
                            disabled={unfreezePending && unfreezeTarget === f.staff_name}
                            className="rounded-lg bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-900/50 disabled:opacity-40 transition-colors"
                          >
                            {unfreezePending && unfreezeTarget === f.staff_name ? "…" : "Unfreeze"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Audit log tab ── */}
      {tab === "audit" && (
        <div className={GLASS_CARD + " p-4"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={T_LABEL}>Security Audit Log</span>
            <div className="flex flex-1 gap-2">
              <input
                className="h-8 min-w-40 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-xs text-white placeholder:text-neutral-500"
                placeholder="Filter by staff name…"
                defaultValue={auditStaffFilter}
                onChange={(e) => {
                  auditFilterRef.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = auditFilterRef.current.trim();
                    setAuditStaffFilter(v);
                    loadAudit(v);
                  }
                }}
              />
              <button
                onClick={() => {
                  const v = auditFilterRef.current.trim();
                  setAuditStaffFilter(v);
                  loadAudit(v);
                }}
                className={`h-8 px-3 text-xs rounded-lg ${TAB_INACTIVE}`}
              >
                Search
              </button>
              {auditStaffFilter && (
                <button
                  onClick={() => {
                    auditFilterRef.current = "";
                    setAuditStaffFilter("");
                    loadAudit("");
                  }}
                  className="h-8 px-2 text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Clear
                </button>
              )}
            </div>
            <button onClick={() => loadAudit(auditStaffFilter)} disabled={auditLoading} className={`text-xs ${TAB_INACTIVE} px-3 py-1.5 rounded-lg`}>
              {auditLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {auditError && <p className="mb-2 text-xs text-red-400">{auditError}</p>}
          {events.length === 0 && !auditLoading ? (
            <p className={T_MUTED + " text-sm"}>No events found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-left text-neutral-500">
                    <th className="pb-2 pr-3 font-medium">Time</th>
                    <th className="pb-2 pr-3 font-medium">Actor</th>
                    <th className="pb-2 pr-3 font-medium">Action</th>
                    <th className="pb-2 pr-3 font-medium">Target</th>
                    <th className="pb-2 pr-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b border-neutral-900 hover:bg-neutral-900/40">
                      <td className="py-2 pr-3 text-neutral-400 whitespace-nowrap" title={fmt(ev.created_at)}>
                        {relTime(ev.created_at)}
                      </td>
                      <td className="py-2 pr-3 text-neutral-300">
                        {ev.actor_staff_name}
                        {ev.actor_role && <span className="ml-1 text-neutral-500">({ev.actor_role})</span>}
                      </td>
                      <td className={`py-2 pr-3 font-mono ${ACTION_COLORS[ev.action] || "text-neutral-400"}`}>
                        {ev.action}
                      </td>
                      <td className="py-2 pr-3 text-neutral-300">
                        {ev.target_id || ev.target_type || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${ev.result === "SUCCESS" ? "bg-emerald-900/40 text-emerald-400" : ev.result === "FAILED" ? "bg-red-900/40 text-red-400" : "bg-neutral-800 text-neutral-400"}`}>
                          {ev.result || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
