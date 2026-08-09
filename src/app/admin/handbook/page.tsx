"use client";

import { useEffect, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  TEXTAREA_CLASS,
  INPUT_CLASS,
} from "@/lib/ui-tokens";

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    credentials: "same-origin",
    headers: { ...getAuthHeaders(), ...(opts?.headers as Record<string, string> | undefined) },
  });
}

function fmt(ts: string) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

type HandbookVersion = {
  id: number;
  version: string;
  title: string;
  published_by: string;
  published_at: string;
  is_active: boolean;
};

type Ack = {
  staff_name: string;
  handbook_version: string;
  acknowledged_at: string;
  ip: string;
};

type StaffName = { staff_name: string };

export default function AdminHandbookPage() {
  const auth = getAuth();
  const role = (auth?.role || "").toUpperCase();
  const [tab, setTab] = useState<"status" | "publish" | "versions">("status");

  // ── Acknowledgement status ────────────────────────────────────────────────
  const [acks, setAcks] = useState<Ack[]>([]);
  const [versions, setVersions] = useState<HandbookVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState("");
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [filterVersion, setFilterVersion] = useState("");

  // ── Publish form ──────────────────────────────────────────────────────────
  const [newVersion, setNewVersion] = useState("");
  const [newTitle, setNewTitle] = useState("Employee Handbook");
  const [newContent, setNewContent] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  async function loadVersions() {
    try {
      const r = await apiFetch("/api/admin/handbook/versions");
      const d = await r.json();
      if (r.ok) {
        setVersions(d.versions || []);
        const active = (d.versions || []).find((v: HandbookVersion) => v.is_active);
        if (active) {
          setActiveVersion(active.version);
          setFilterVersion(active.version);
        }
      }
    } catch { /* ignore */ }
  }

  async function loadAcks(version: string) {
    setStatusLoading(true);
    setStatusError("");
    try {
      const qs = version ? `?handbook_version=${encodeURIComponent(version)}` : "";
      const r = await apiFetch(`/api/admin/handbook/acknowledgements${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setAcks(d.acknowledgements || []);
    } catch (e: unknown) {
      setStatusError(String((e as Error).message || e));
    } finally {
      setStatusLoading(false);
    }
  }

  async function loadStaffNames() {
    try {
      const [rd, rm] = await Promise.all([
        apiFetch("/api/admin/staff_master/names?city=dubai&status=ACTIVE&limit=2000"),
        apiFetch("/api/admin/staff_master/names?city=manila&status=ACTIVE&limit=2000"),
      ]);
      const [dd, dm] = await Promise.all([rd.json(), rm.json()]);
      const combined = [
        ...(Array.isArray(dd?.names) ? dd.names : []),
        ...(Array.isArray(dm?.names) ? dm.names : []),
      ];
      setStaffNames(combined);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void loadVersions();
    void loadStaffNames();
  }, []);

  useEffect(() => {
    if (tab === "status") void loadAcks(filterVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (role !== "HQ" && role !== "ADMIN") return null;

  // ── Compute acknowledged set ───────────────────────────────────────────────
  const ackedSet = new Set(acks.map((a) => a.staff_name));
  const pending = staffNames.filter((n) => !ackedSet.has(n));
  const acknowledged = acks;

  // ── Publish handler ────────────────────────────────────────────────────────
  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!newVersion.trim()) return;
    setPublishing(true);
    setPublishMsg("");
    try {
      const r = await apiFetch("/api/admin/handbook/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: newVersion.trim(), title: newTitle.trim(), content_md: newContent.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Failed");
      setPublishMsg(`Published version ${newVersion.trim()} successfully.`);
      setNewVersion("");
      await loadVersions();
    } catch (e: unknown) {
      setPublishMsg(`Error: ${String((e as Error).message || e)}`);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-2 py-4">
      <h1 className={T_PAGE_TITLE}>Employee Handbook</h1>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["status", "publish", "versions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {t === "status" ? "Acknowledgement Status" : t === "publish" ? "Publish New Version" : "Version History"}
          </button>
        ))}
      </div>

      {/* ── Acknowledgement Status tab ──────────────────────────────────────── */}
      {tab === "status" && (
        <div className="space-y-4">
          {/* Filter controls */}
          <div className={GLASS_CARD + " p-4 flex flex-wrap items-center gap-3"}>
            <span className={T_LABEL}>Version</span>
            <select
              className="h-8 rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-xs text-white"
              value={filterVersion}
              onChange={(e) => setFilterVersion(e.target.value)}
            >
              <option value="">All versions</option>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}{v.is_active ? " (current)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => loadAcks(filterVersion)}
              disabled={statusLoading}
              className="h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              {statusLoading ? "Loading…" : "Refresh"}
            </button>
            {activeVersion && (
              <span className="text-xs text-neutral-500">
                Current version: <span className="text-violet-300">{activeVersion}</span>
              </span>
            )}
          </div>

          {statusError && (
            <p className="text-xs text-red-400">{statusError}</p>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL}>Acknowledged</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{acknowledged.length}</p>
            </div>
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL}>Pending</p>
              <p className="mt-1 text-2xl font-bold text-amber-400">{pending.length}</p>
            </div>
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL}>Total Staff</p>
              <p className="mt-1 text-2xl font-bold text-white">{staffNames.length}</p>
            </div>
          </div>

          {/* Pending list */}
          {pending.length > 0 && (
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL + " mb-3"}>Not Yet Acknowledged ({pending.length})</p>
              <div className="flex flex-wrap gap-2">
                {pending.map((name) => (
                  <span
                    key={name}
                    className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-xs text-amber-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Acknowledged table */}
          {acknowledged.length > 0 && (
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL + " mb-3"}>Acknowledged ({acknowledged.length})</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left">
                      <th className={TABLE_HEADER + " pr-4 pb-2"}>Staff</th>
                      <th className={TABLE_HEADER + " pr-4 pb-2"}>Version</th>
                      <th className={TABLE_HEADER + " pr-4 pb-2"}>Acknowledged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acknowledged.map((a) => (
                      <tr key={`${a.staff_name}-${a.handbook_version}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " pr-4 font-medium text-white"}>{a.staff_name}</td>
                        <td className={TABLE_CELL + " pr-4 text-violet-300"}>{a.handbook_version}</td>
                        <td className={TABLE_CELL + " pr-4 text-neutral-400"}>{fmt(a.acknowledged_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!statusLoading && acknowledged.length === 0 && pending.length === 0 && (
            <p className={T_CAPTION}>No acknowledgements on record.</p>
          )}
        </div>
      )}

      {/* ── Publish New Version tab ─────────────────────────────────────────── */}
      {tab === "publish" && (
        <div className={GLASS_CARD + " p-6"}>
          <p className={T_LABEL + " mb-4"}>Publish a new active handbook version</p>
          <form onSubmit={handlePublish} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Version (e.g. 1.1)</label>
                <input
                  className={INPUT_CLASS}
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="1.1"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Title</label>
                <input
                  className={INPUT_CLASS}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Employee Handbook"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Content (Markdown) — leave blank to use the default system handbook
              </label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={18}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="# Employee Handbook&#10;&#10;## 1. Code of Conduct&#10;..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={publishing || !newVersion.trim()} className={PRIMARY_BUTTON + " text-sm"}>
                {publishing ? "Publishing…" : "Publish Version"}
              </button>
              {publishMsg && (
                <span className={publishMsg.startsWith("Error") ? "text-xs text-red-400" : "text-xs text-emerald-400"}>
                  {publishMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              Publishing will deactivate all previous versions. All staff will need to re-acknowledge the new version.
            </p>
          </form>
        </div>
      )}

      {/* ── Version History tab ─────────────────────────────────────────────── */}
      {tab === "versions" && (
        <div className={GLASS_CARD + " p-4"}>
          <p className={T_LABEL + " mb-3"}>Version History</p>
          {versions.length === 0 ? (
            <p className={T_CAPTION}>No versions published yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-left">
                    <th className={TABLE_HEADER + " pr-4 pb-2"}>Version</th>
                    <th className={TABLE_HEADER + " pr-4 pb-2"}>Title</th>
                    <th className={TABLE_HEADER + " pr-4 pb-2"}>Published By</th>
                    <th className={TABLE_HEADER + " pr-4 pb-2"}>Published At</th>
                    <th className={TABLE_HEADER + " pb-2"}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL + " pr-4 font-mono text-violet-300"}>{v.version}</td>
                      <td className={TABLE_CELL + " pr-4 text-neutral-200"}>{v.title}</td>
                      <td className={TABLE_CELL + " pr-4 text-neutral-400"}>{v.published_by}</td>
                      <td className={TABLE_CELL + " pr-4 text-neutral-400"}>{fmt(v.published_at)}</td>
                      <td className={TABLE_CELL}>
                        {v.is_active ? (
                          <span className="rounded px-1.5 py-0.5 bg-emerald-900/40 text-emerald-400">Active</span>
                        ) : (
                          <span className="rounded px-1.5 py-0.5 bg-neutral-800 text-neutral-500">Archived</span>
                        )}
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
