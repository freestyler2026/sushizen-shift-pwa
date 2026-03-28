"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [drafts, setDrafts] = useState<MatrixDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: preparedRows,
          }),
        },
        requestedBy,
        pin,
      );
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
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Reload
        </button>
        <button type="button" onClick={addRow} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Add Level
        </button>
      </div>

      <div className="space-y-3">
        {sortedDrafts.map(({ row, index }) => (
          <div key={`${row.id || "new"}:${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <input value={row.level_no} onChange={(e) => updateDraft(index, { level_no: e.target.value })} placeholder="Level" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={row.min_amount} onChange={(e) => updateDraft(index, { min_amount: e.target.value })} placeholder="Min amount" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input value={row.max_amount} onChange={(e) => updateDraft(index, { max_amount: e.target.value })} placeholder="Max amount" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <input
                value={row.required_roles_text}
                onChange={(e) => updateDraft(index, { required_roles_text: e.target.value })}
                placeholder="Roles (comma-separated)"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
              />
              <button type="button" onClick={() => removeDraft(index)} className="rounded-xl border border-rose-700/60 bg-rose-900/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-800/30">
                Remove
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
                <input type="checkbox" checked={row.escalate_if_urgent} onChange={(e) => updateDraft(index, { escalate_if_urgent: e.target.checked })} />
                Escalate if urgent
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
                <input type="checkbox" checked={row.require_hq_if_new_vendor} onChange={(e) => updateDraft(index, { require_hq_if_new_vendor: e.target.checked })} />
                Require HQ if new vendor
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
                <input type="checkbox" checked={row.is_active} onChange={(e) => updateDraft(index, { is_active: e.target.checked })} />
                Active
              </label>
            </div>
          </div>
        ))}
        {!sortedDrafts.length ? <div className="text-sm text-neutral-500">No matrix rows yet.</div> : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Current Matrix (Readback)</div>
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300">
              L{row.level_no}: {Number(row.min_amount || 0).toFixed(2)} - {Number(row.max_amount || 0).toFixed(2)} | Roles {(row.required_roles_json || []).join(", ") || "-"} | {row.is_active ? "ACTIVE" : "INACTIVE"}
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
        {busy ? "Saving..." : "Save Approval Matrix"}
      </button>
    </div>
  );
}
