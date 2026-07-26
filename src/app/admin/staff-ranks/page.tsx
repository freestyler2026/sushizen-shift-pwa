// src/app/admin/staff-ranks/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Search, RefreshCw, Check, AlertCircle } from "lucide-react";
import { canAccessStaffAdmin, getAuth } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";
import {
  GLASS_CARD,
  INPUT_CLASS,
  SMALL_BUTTON,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ── Rank label map ─────────────────────────────────────────────────────────────
const RANK_LABELS: Record<number, { label: string; phase: string; color: string }> = {
  [-1]: { label: "Not set", phase: "", color: "text-zinc-500" },
  0:  { label: "L0 — Kitchen Assistant",    phase: "Phase 1",  color: "text-zinc-400" },
  1:  { label: "L1 — Junior Cook / Prep",   phase: "Phase 1",  color: "text-blue-400" },
  2:  { label: "L2 — Prep Cook",            phase: "Phase 1",  color: "text-blue-400" },
  3:  { label: "L3 — Line Cook",            phase: "Phase 1",  color: "text-blue-300" },
  4:  { label: "L4 — Section Cook",         phase: "Phase 1",  color: "text-cyan-400" },
  5:  { label: "L5 — Commis Chef",          phase: "Phase 2",  color: "text-emerald-400" },
  6:  { label: "L6 — Senior Commis / Asst. PIC", phase: "Phase 2", color: "text-emerald-300" },
  7:  { label: "L7 — PIC / Store Manager",  phase: "Phase 2",  color: "text-amber-400" },
  8:  { label: "L8 — Multi-Unit Manager",   phase: "Phase 3",  color: "text-orange-400" },
  9:  { label: "L9 — Area Manager",         phase: "Phase 3",  color: "text-red-400" },
  10: { label: "L10 — PH Ops Head / GM",   phase: "Phase 3",  color: "text-purple-400" },
};

const RANK_OPTIONS = [
  { value: "-1", label: "— Not set —" },
  { value: "0",  label: "L0  Kitchen Assistant" },
  { value: "1",  label: "L1  Junior Cook / Prep" },
  { value: "2",  label: "L2  Prep Cook" },
  { value: "3",  label: "L3  Line Cook" },
  { value: "4",  label: "L4  Section Cook" },
  { value: "5",  label: "L5  Commis Chef" },
  { value: "6",  label: "L6  Senior Commis / Asst. PIC" },
  { value: "7",  label: "L7  PIC / Store Manager" },
  { value: "8",  label: "L8  Multi-Unit Manager" },
  { value: "9",  label: "L9  Area Manager" },
  { value: "10", label: "L10 PH Ops Head / GM" },
];

type StaffRow = {
  staff_name: string;
  city: string;
  branch_code: string;
  is_active: boolean;
  rank_level: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function StaffRanksPage() {
  const auth = getAuth();

  const [city, setCity] = useState<string>("manila");
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Track per-row save state
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  // Local overrides (before saved)
  const [pendingRanks, setPendingRanks] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/api/admin/staff-ranks?city=${city}&q=${encodeURIComponent(q)}`) as { staff: StaffRow[] };
      setStaff(data.staff ?? []);
      setPendingRanks({});
      setSaveStates({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [city, q]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRankChange = (staffName: string, newLevel: number) => {
    setPendingRanks((prev) => ({ ...prev, [staffName]: newLevel }));
    setSaveStates((prev) => ({ ...prev, [staffName]: "idle" }));
  };

  const saveRank = useCallback(
    async (staffName: string) => {
      const level = pendingRanks[staffName];
      if (level === undefined) return;
      setSaveStates((prev) => ({ ...prev, [staffName]: "saving" }));
      try {
        await apiPost("/api/admin/staff-ranks/set", {
          city,
          staff_name: staffName,
          rank_level: level,
        });
        // Commit into local list
        setStaff((prev) =>
          prev.map((r) =>
            r.staff_name === staffName ? { ...r, rank_level: level } : r
          )
        );
        setPendingRanks((prev) => {
          const next = { ...prev };
          delete next[staffName];
          return next;
        });
        setSaveStates((prev) => ({ ...prev, [staffName]: "saved" }));
        setTimeout(() => setSaveStates((prev) => ({ ...prev, [staffName]: "idle" })), 2000);
      } catch {
        setSaveStates((prev) => ({ ...prev, [staffName]: "error" }));
      }
    },
    [city, pendingRanks]
  );

  if (!canAccessStaffAdmin(auth)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-400">
        Access denied
      </div>
    );
  }

  // Filtered display list
  const displayList = staff.filter((r) => {
    if (!showInactive && !r.is_active) return false;
    return true;
  });

  // Stats
  const totalSet = staff.filter((r) => r.rank_level >= 0).length;
  const totalActive = staff.filter((r) => r.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Staff Ranks</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Set L0–L10 rank levels for each staff member. Used in draft auto-scheduling.
            </p>
          </div>
          <button onClick={load} disabled={loading} className={SMALL_BUTTON}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-36">
              <SelectDark
                value={city}
                onChange={(v) => setCity(v)}
                options={[
                  { value: "manila", label: "Manila" },
                  { value: "dubai", label: "Dubai" },
                ]}
              />
            </div>
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className={`${INPUT_CLASS} pl-8`}
                placeholder="Search by name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Show inactive
            </label>
            <div className="ml-auto text-xs text-zinc-500">
              {totalSet}/{totalActive} active staff ranked
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Rank reference legend */}
        <div className={`${GLASS_CARD} p-4`}>
          <p className={`${T_LABEL} mb-3`}>Rank reference</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
            <div>
              <p className="font-semibold text-blue-400 mb-1">Phase 1 — Operational</p>
              {[0,1,2,3,4].map((l) => (
                <p key={l} className="text-zinc-400">
                  <span className="font-mono font-semibold">L{l}</span> {RANK_LABELS[l].label.split("—")[1]?.trim()}
                </p>
              ))}
            </div>
            <div>
              <p className="font-semibold text-emerald-400 mb-1">Phase 2 — Leadership</p>
              {[5,6,7].map((l) => (
                <p key={l} className="text-zinc-400">
                  <span className="font-mono font-semibold">L{l}</span> {RANK_LABELS[l].label.split("—")[1]?.trim()}
                </p>
              ))}
            </div>
            <div>
              <p className="font-semibold text-purple-400 mb-1">Phase 3 — Executive</p>
              {[8,9,10].map((l) => (
                <p key={l} className="text-zinc-400">
                  <span className="font-mono font-semibold">L{l}</span> {RANK_LABELS[l].label.split("—")[1]?.trim()}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className={GLASS_CARD}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}>Staff Name</th>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}>Status</th>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}>Current Rank</th>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}>Set Rank</th>
                  <th className={`${TABLE_HEADER} px-4 pt-4 text-left`}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && displayList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                      No staff found
                    </td>
                  </tr>
                )}
                {!loading &&
                  displayList.map((row) => {
                    const pending = pendingRanks[row.staff_name];
                    const currentLevel = pending !== undefined ? pending : row.rank_level;
                    const hasPending = pending !== undefined && pending !== row.rank_level;
                    const saveState = saveStates[row.staff_name] ?? "idle";
                    const rankInfo = RANK_LABELS[currentLevel] ?? RANK_LABELS[-1];

                    return (
                      <tr key={row.staff_name} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} px-4 font-medium text-white`}>
                          {row.staff_name}
                        </td>
                        <td className={`${TABLE_CELL} px-4 text-zinc-400`}>
                          {row.branch_code || "—"}
                        </td>
                        <td className={`${TABLE_CELL} px-4`}>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.is_active
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-zinc-500/15 text-zinc-500"
                            }`}
                          >
                            {row.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className={`${TABLE_CELL} px-4`}>
                          <span className={`text-sm font-medium ${rankInfo.color}`}>
                            {row.rank_level >= 0
                              ? `L${row.rank_level} ${RANK_LABELS[row.rank_level].label.split("—")[1]?.trim()}`
                              : "Not set"}
                          </span>
                        </td>
                        <td className={`${TABLE_CELL} px-4`} style={{ minWidth: 220 }}>
                          <SelectDark
                            value={String(pending !== undefined ? pending : row.rank_level)}
                            onChange={(v) =>
                              handleRankChange(row.staff_name, parseInt(v, 10))
                            }
                            options={RANK_OPTIONS}
                          />
                        </td>
                        <td className={`${TABLE_CELL} px-4`}>
                          {hasPending && saveState !== "saved" && (
                            <button
                              onClick={() => saveRank(row.staff_name)}
                              disabled={saveState === "saving"}
                              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition-colors"
                            >
                              {saveState === "saving" ? "Saving…" : "Save"}
                            </button>
                          )}
                          {saveState === "saved" && (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <Check size={12} /> Saved
                            </span>
                          )}
                          {saveState === "error" && (
                            <span className="flex items-center gap-1 text-xs text-red-400">
                              <AlertCircle size={12} /> Error
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {displayList.length > 0 && (
            <p className="px-4 py-3 text-xs text-zinc-600 border-t border-white/5">
              {displayList.length} staff shown
              {!showInactive && staff.filter((r) => !r.is_active).length > 0
                ? ` · ${staff.filter((r) => !r.is_active).length} inactive hidden`
                : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
