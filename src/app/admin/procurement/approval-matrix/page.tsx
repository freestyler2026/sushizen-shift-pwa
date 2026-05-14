"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_ERROR,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Plus, ShieldCheck } from "lucide-react";

type MatrixRow = {
  id: string;
  level_no: number;
  min_amount: number;
  max_amount: number;
  required_roles_json: string[];
  conditions_json: Record<string, unknown>;
  is_active: boolean;
  updated_by: string;
  updated_at: string;
};

type MatrixDraft = {
  id: string;
  level_no: string;
  min_amount: string;
  max_amount: string;
  required_roles_text: string;
  escalate_if_urgent: boolean;
  require_hq_if_new_vendor: boolean;
  is_active: boolean;
};

function toDraft(row: MatrixRow): MatrixDraft {
  const cond = row.conditions_json || {};
  return {
    id: row.id || "",
    level_no: String(row.level_no ?? ""),
    min_amount: String(row.min_amount ?? 0),
    max_amount: String(row.max_amount ?? 0),
    required_roles_text: (Array.isArray(row.required_roles_json) ? row.required_roles_json : []).join(", "),
    escalate_if_urgent: cond.escalate_if_urgent !== false,
    require_hq_if_new_vendor: cond.require_hq_if_new_vendor !== false,
    is_active: Boolean(row.is_active),
  };
}

function newDraft(nextLevel: number): MatrixDraft {
  return {
    id: "",
    level_no: String(nextLevel),
    min_amount: "0",
    max_amount: "0",
    required_roles_text: "",
    escalate_if_urgent: true,
    require_hq_if_new_vendor: true,
    is_active: true,
  };
}

export default function ProcurementApprovalMatrixPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [drafts, setDrafts] = useState<MatrixDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const sortedDrafts = useMemo(
    () =>
      drafts
        .map((row, index) => ({ row, index }))
        .sort((a, b) => Number(a.row.level_no || 0) - Number(b.row.level_no || 0)),
    [drafts],
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await procurementJson<{ rows: MatrixRow[] }>(
        "/api/admin/procurement/config/approval-matrix",
        { method: "GET" },
        requestedBy,
        pin,
      );
      const apiRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(apiRows);
      setDrafts(apiRows.map(toDraft));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestedBy]);

  const addRow = () => {
    const maxLevel = Math.max(0, ...drafts.map((d) => Number(d.level_no || 0)));
    setDrafts((prev) => [...prev, newDraft(maxLevel + 1)]);
  };

  const updateDraft = (idx: number, patch: Partial<MatrixDraft>) => {
    setDrafts((prev) => prev.map((draft, i) => (i === idx ? { ...draft, ...patch } : draft)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const preparedRows = sortedDrafts.map(({ row }) => {
        const levelNo = Number(row.level_no || 0);
        const minAmount = Number(row.min_amount || 0);
        const maxAmount = Number(row.max_amount || 0);
        if (!Number.isFinite(levelNo) || levelNo <= 0) throw new Error("level_no must be a positive integer.");
        if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount)) throw new Error("min/max amount must be numeric.");
        if (maxAmount < minAmount) throw new Error(`max_amount must be >= min_amount (level ${levelNo}).`);
        const requiredRoles = row.required_roles_text
          .split(",")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
        return {
          id: row.id || undefined,
          level_no: levelNo,
          min_amount: minAmount,
          max_amount: maxAmount,
          required_roles_json: requiredRoles,
          conditions_json: {
            escalate_if_urgent: row.escalate_if_urgent,
            require_hq_if_new_vendor: row.require_hq_if_new_vendor,
          },
          is_active: row.is_active,
        };
      });

      const seenLevels = new Set<number>();
      for (const row of preparedRows) {
        if (seenLevels.has(row.level_no)) {
          throw new Error(`Duplicate level_no detected: ${row.level_no}`);
        }
        seenLevels.add(row.level_no);
      }

      await procurementJson(
        "/api/admin/procurement/config/approval-matrix/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin, rows: preparedRows }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Approval matrix saved.");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Approval matrix is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Approval Matrix</h2>
          <p className="mt-1 text-sm text-zinc-400">Configure approval levels, amount thresholds, and required roles.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <ShieldCheck className="h-3 w-3" />{rows.length} levels
        </span>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Session bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className="h-4 w-4" />Reload
            </button>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={addRow} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <Plus className="h-4 w-4" />Add Level
            </button>
          </div>
        </div>
      </div>

      {/* Draft rows */}
      <div className="space-y-3">
        {sortedDrafts.map(({ row, index }) => (
          <div key={`${row.id || "new"}:${index}`} className={GLASS_CARD + " p-4"}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Level</label>
                <input value={row.level_no} onChange={(e) => updateDraft(index, { level_no: e.target.value })} placeholder="Level" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Min Amount</label>
                <input value={row.min_amount} onChange={(e) => updateDraft(index, { min_amount: e.target.value })} placeholder="0" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Max Amount</label>
                <input value={row.max_amount} onChange={(e) => updateDraft(index, { max_amount: e.target.value })} placeholder="0" className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-2">
                <label className={`${T_LABEL} mb-1.5 block`}>Required Roles (comma-separated)</label>
                <input
                  value={row.required_roles_text}
                  onChange={(e) => updateDraft(index, { required_roles_text: e.target.value })}
                  placeholder="ADMIN, HQ"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => removeDraft(index)} className={`${DANGER_BUTTON} w-full`}>
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-zinc-300">
                <input type="checkbox" checked={row.escalate_if_urgent} onChange={(e) => updateDraft(index, { escalate_if_urgent: e.target.checked })} />
                Escalate if urgent
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-zinc-300">
                <input type="checkbox" checked={row.require_hq_if_new_vendor} onChange={(e) => updateDraft(index, { require_hq_if_new_vendor: e.target.checked })} />
                Require HQ if new vendor
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-zinc-300">
                <input type="checkbox" checked={row.is_active} onChange={(e) => updateDraft(index, { is_active: e.target.checked })} />
                Active
              </label>
            </div>
          </div>
        ))}
        {!sortedDrafts.length && (
          <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
            <p className={T_CAPTION}>No matrix rows. Click &ldquo;Add Level&rdquo; to get started.</p>
          </div>
        )}
      </div>

      {/* Readback */}
      {rows.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <p className={`${T_SECTION} mb-3`}>Current Matrix</p>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                <span className="font-mono font-medium text-white">L{row.level_no}</span>
                <span className={T_CAPTION}>{Number(row.min_amount || 0).toFixed(2)} – {Number(row.max_amount || 0).toFixed(2)}</span>
                <span className={T_CAPTION}>Roles: {(row.required_roles_json || []).join(", ") || "-"}</span>
                {row.is_active ? <span className={BADGE_SUCCESS}>ACTIVE</span> : <span className={BADGE_ERROR}>INACTIVE</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={() => void save()} disabled={busy} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
        <CheckCircle className="h-4 w-4" />
        {busy ? "Saving…" : "Save Approval Matrix"}
      </button>
    </div>
  );
}
