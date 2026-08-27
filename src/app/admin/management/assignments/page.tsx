"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import SelectDark from "@/components/SelectDark";

interface MatrixRow {
  exception_type: string;
  title: string;
  severity: string;
  owner: string;
  open_count: number;
  in_catalogue: boolean;
}

export default function ManagementAssignmentsPage() {
  const router = useRouter();
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !(canAccessAdminNav(auth) || auth.role === "HQ" || auth.role === "ADMIN")) {
      router.replace("/");
    }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/management/assignment-matrix?city=${city}`, {
        cache: "no-store",
        headers: getAuthHeaders(auth),
      });
      if (!res.ok) throw new Error(`Could not load owners (${res.status})`);
      const data = await res.json();
      setRows((data.rows ?? []) as MatrixRow[]);

      const st = await fetch(
        `/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`,
        { cache: "no-store", headers: getAuthHeaders(auth) },
      );
      if (st.ok) setStaff(((await st.json())?.names ?? []) as string[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  const setOwner = (exceptionType: string, owner: string) => {
    setSaved("");
    setRows((prev) => prev.map((r) => (r.exception_type === exceptionType ? { ...r, owner } : r)));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/admin/management/assignment-matrix", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          rows: rows.map((r) => ({ exception_type: r.exception_type, staff_name: r.owner })),
          apply_to_open_tasks: true,
        }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Save failed (${res.status})`);
      const data = await res.json();
      setSaved(`Saved — ${data.tasks_reassigned} open task(s) re-pointed`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const unowned = rows.filter((r) => !r.owner);
  const unownedOpen = unowned.reduce((n, r) => n + r.open_count, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <MgmtChannelTabBar active="owners" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className={T_PAGE_TITLE}>Exception Owners</h1>
        <SelectDark
          value={city}
          onChange={(v) => setCity(v as "manila" | "dubai")}
          options={[
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ]}
        />
        <button type="button" onClick={() => void load()} className={SMALL_BUTTON}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
        <div className="ml-auto flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-400">{saved}</span>}
          <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY_BUTTON}>
            <Save className="mr-1 inline h-4 w-4" />
            {saving ? "Saving…" : "Save owners"}
          </button>
        </div>
      </div>

      <p className={`${T_CAPTION} mb-4`}>
        Who handles each kind of store exception. Detection assigns new tasks to the person named
        here, and the name sticks until it is changed. A type left blank produces tasks nobody owns.
      </p>

      {/* An unset type is the failure this page exists to prevent, so it is stated
          before the table rather than left to be noticed inside it. */}
      {!loading && unowned.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">
            <strong>{unowned.length} type(s) have no owner</strong>
            {unownedOpen > 0 && <> — {unownedOpen} open task(s) belong to nobody.</>} Tasks of these
            types will keep arriving unassigned until someone is named.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className={`${GLASS_CARD} overflow-hidden p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEADER}>
                <th className="px-4 py-2.5 text-left">Exception</th>
                <th className="px-4 py-2.5 text-left">Severity</th>
                <th className="px-4 py-2.5 text-right">Open</th>
                <th className="px-4 py-2.5 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className={`px-4 py-6 text-center ${T_CAPTION}`}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className={`px-4 py-6 text-center ${T_CAPTION}`}>No exception types found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.exception_type} className={TABLE_ROW}>
                  <td className="px-4 py-2.5">
                    <div className={T_BODY}>{r.title}</div>
                    <div className={`${T_CAPTION} font-mono`}>
                      {r.exception_type}
                      {!r.in_catalogue && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                          no template
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.severity === "red"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.open_count > 0 ? r.open_count : <span className="text-white/25">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <SelectDark
                      value={r.owner}
                      onChange={(v) => setOwner(r.exception_type, v)}
                      options={[
                        { value: "", label: "— no owner —" },
                        ...staff.map((n) => ({ value: n, label: n })),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className={`${T_CAPTION} mt-3`}>
        Saving also re-points open tasks of each type to its new owner, so a change takes effect on
        what is already waiting rather than only on what arrives next.
      </p>
    </div>
  );
}
