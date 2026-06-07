"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Minus, X, ChevronRight } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DIVIDER,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type SeparationType =
  | "voluntary_resignation"
  | "mutual_agreement"
  | "termination"
  | "retirement"
  | "contract_end";

type SepItemStatus = "pending" | "done" | "na";

const SEPARATION_TYPE_LABELS: Record<SeparationType, string> = {
  voluntary_resignation: "Voluntary Resignation",
  mutual_agreement: "Mutual Agreement",
  termination: "Termination",
  retirement: "Retirement",
  contract_end: "Contract End",
};

const SEP_CATEGORIES = [
  { key: "exit", label: "Exit Process", icon: "🚪" },
  { key: "clearance", label: "Clearance", icon: "✅" },
  { key: "final_pay", label: "Final Pay", icon: "💰" },
  { key: "documents", label: "Documents", icon: "📋" },
];

type SeparationItem = {
  id: string;
  separation_id: string;
  item_key: string;
  item_label: string;
  category: string;
  status: SepItemStatus;
  notes: string;
  done_date: string;
  done_by: string;
};

type SeparationRecord = {
  id: string;
  staff_name: string;
  city: string;
  separation_type: SeparationType;
  resignation_date: string;
  last_working_date: string;
  exit_interview_date: string;
  final_pay_notes: string;
  final_pay_amount: number | null;
  final_pay_released_date: string;
  nte_reference: string;
  status: "in_progress" | "complete";
  notes: string;
  created_by: string;
  total_items: number;
  done_count: number;
  pending_count: number;
  created_at: string;
  items?: SeparationItem[];
};

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"];

// ─── Badge helpers ────────────────────────────────────────────────────────────

function SepTypeBadge({ type }: { type: SeparationType }) {
  const colorMap: Record<SeparationType, string> = {
    voluntary_resignation:
      "inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 text-xs font-medium text-blue-400",
    mutual_agreement:
      "inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-400",
    termination:
      "inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-2.5 py-0.5 text-xs font-medium text-red-400",
    retirement:
      "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-medium text-emerald-400",
    contract_end:
      "inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400",
  };
  return <span className={colorMap[type]}>{SEPARATION_TYPE_LABELS[type]}</span>;
}

function StatusBadge({ status }: { status: "in_progress" | "complete" }) {
  if (status === "complete") {
    return <span className={BADGE_SUCCESS}>Complete</span>;
  }
  return <span className={BADGE_WARNING}>In Progress</span>;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between">
        <span className={T_CAPTION}>Progress</span>
        <span className="text-xs font-semibold text-zinc-300">
          {done}/{total} done
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Checklist item row ───────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  onSave,
}: {
  item: SeparationItem;
  onSave: (id: string, patch: { status: SepItemStatus; notes: string; done_by: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState<SepItemStatus>(item.status);
  const [notes, setNotes] = useState(item.notes || "");
  const [doneBy, setDoneBy] = useState(item.done_by || "");
  const [saving, setSaving] = useState(false);

  const isDirty =
    status !== item.status ||
    notes !== (item.notes || "") ||
    doneBy !== (item.done_by || "");

  const statusIcon = {
    done: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
    pending: <Circle className="h-5 w-5 text-zinc-500" />,
    na: <Minus className="h-5 w-5 text-zinc-600" />,
  }[status];

  const labelClass = {
    done: "text-sm font-medium text-emerald-400 line-through-none",
    pending: "text-sm font-medium text-zinc-300",
    na: "text-sm font-medium text-zinc-600 line-through",
  }[status];

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(item.id, { status, notes, done_by: doneBy });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-3 transition-all duration-150 hover:border-white/12">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <p className={labelClass}>{item.item_label}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={T_LABEL + " mb-1 block"}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SepItemStatus)}
                className={SELECT_CLASS + " py-1.5 text-xs"}
              >
                <option value="pending">Pending</option>
                <option value="done">Done</option>
                <option value="na">N/A</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className={T_LABEL + " mb-1 block"}>Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes..."
                className={INPUT_CLASS + " py-1.5 text-xs"}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={T_LABEL + " mb-1 block"}>Done By</label>
              <input
                type="text"
                value={doneBy}
                onChange={(e) => setDoneBy(e.target.value)}
                placeholder="Name..."
                className={INPUT_CLASS + " py-1.5 text-xs"}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={SMALL_BUTTON}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  record,
  onClose,
  onUpdated,
}: {
  record: SeparationRecord;
  onClose: () => void;
  onUpdated: (updated: SeparationRecord) => void;
}) {
  const auth = getAuth();

  const [detail, setDetail] = useState<SeparationRecord>(record);
  const [loading, setLoading] = useState(false);

  // Header field state
  const [resignationDate, setResignationDate] = useState(record.resignation_date || "");
  const [lastWorkingDate, setLastWorkingDate] = useState(record.last_working_date || "");
  const [exitInterviewDate, setExitInterviewDate] = useState(record.exit_interview_date || "");
  const [finalPayNotes, setFinalPayNotes] = useState(record.final_pay_notes || "");
  const [finalPayAmount, setFinalPayAmount] = useState<string>(
    record.final_pay_amount != null ? String(record.final_pay_amount) : ""
  );
  const [finalPayReleasedDate, setFinalPayReleasedDate] = useState(record.final_pay_released_date || "");
  const [nteReference, setNteReference] = useState(record.nte_reference || "");
  const [notes, setNotes] = useState(record.notes || "");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Reset header state when a different record is opened (Bug S6)
  useEffect(() => {
    setResignationDate(record.resignation_date?.slice(0, 10) || "");
    setLastWorkingDate(record.last_working_date?.slice(0, 10) || "");
    setExitInterviewDate(record.exit_interview_date?.slice(0, 10) || "");
    setFinalPayNotes(record.final_pay_notes || "");
    setFinalPayAmount(record.final_pay_amount != null ? String(record.final_pay_amount) : "");
    setFinalPayReleasedDate(record.final_pay_released_date?.slice(0, 10) || "");
    setNteReference(record.nte_reference || "");
    setNotes(record.notes || "");
  }, [record.id]);

  // Load full detail with items — skip fetch if items already provided (Bug S3)
  useEffect(() => {
    if (!auth) return;
    if (record.items && record.items.length > 0) {
      setDetail(record);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/admin/hr/separations/${record.id}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((data: SeparationRecord) => {
        setDetail(data);
        setResignationDate(data.resignation_date?.slice(0, 10) || "");
        setLastWorkingDate(data.last_working_date?.slice(0, 10) || "");
        setExitInterviewDate(data.exit_interview_date?.slice(0, 10) || "");
        setFinalPayNotes(data.final_pay_notes || "");
        setFinalPayAmount(data.final_pay_amount != null ? String(data.final_pay_amount) : "");
        setFinalPayReleasedDate(data.final_pay_released_date?.slice(0, 10) || "");
        setNteReference(data.nte_reference || "");
        setNotes(data.notes || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  async function patchHeader() {
    if (!auth) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        resignation_date: resignationDate || null,
        last_working_date: lastWorkingDate || null,
        exit_interview_date: exitInterviewDate || null,
        final_pay_notes: finalPayNotes,
        final_pay_amount: finalPayAmount !== "" ? parseFloat(finalPayAmount) : null,
        final_pay_released_date: finalPayReleasedDate || null,
        nte_reference: nteReference,
        notes,
      };
      const res = await fetch(`${API_BASE}/api/admin/hr/separations/${detail.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated: SeparationRecord = await res.json();
        setDetail((prev) => ({ ...prev, ...updated }));
        onUpdated({ ...detail, ...updated });
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(
    itemId: string,
    patch: { status: SepItemStatus; notes: string; done_by: string }
  ) {
    if (!auth) return;
    const res = await fetch(`${API_BASE}/api/admin/hr/separations/items/${itemId}`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updatedItem: SeparationItem = await res.json();
      setDetail((prev) => {
        const items = (prev.items || []).map((it) =>
          it.id === itemId ? { ...it, ...updatedItem } : it
        );
        const done_count = items.filter((i) => i.status === "done").length;
        const pending_count = items.filter((i) => i.status === "pending").length;
        const updated = { ...prev, items, done_count, pending_count };
        onUpdated(updated);
        return updated;
      });
    }
  }

  async function markComplete() {
    if (!auth) return;
    setCompleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/separations/${detail.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "complete" }),
      });
      if (res.ok) {
        const updated: SeparationRecord = await res.json();
        const next = { ...detail, ...updated };
        setDetail(next);
        onUpdated(next);
      }
    } finally {
      setCompleting(false);
    }
  }

  const allDone = detail.total_items === 0 || detail.pending_count === 0;

  // Group items by category
  const itemsByCategory = SEP_CATEGORIES.map((cat) => ({
    ...cat,
    items: (detail.items || []).filter((i) => i.category === cat.key),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex md:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 flex w-full flex-col overflow-y-auto bg-[#0d1117] shadow-2xl md:w-[600px] md:border-l md:border-white/10">
        {/* Panel header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#0d1117] p-5">
          <div className="flex-1 min-w-0">
            <p className={T_SECTION}>{detail.staff_name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <SepTypeBadge type={detail.separation_type} />
              <StatusBadge status={detail.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/8 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 p-5">
            {/* Dates */}
            <div>
              <p className={T_SECTION + " mb-3"}>Key Dates</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={T_LABEL + " mb-1 block"}>Resignation Date</label>
                  <input
                    type="date"
                    value={resignationDate}
                    onChange={(e) => setResignationDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={T_LABEL + " mb-1 block"}>Last Working Date</label>
                  <input
                    type="date"
                    value={lastWorkingDate}
                    onChange={(e) => setLastWorkingDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={T_LABEL + " mb-1 block"}>Exit Interview Date</label>
                  <input
                    type="date"
                    value={exitInterviewDate}
                    onChange={(e) => setExitInterviewDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </div>

            {/* Final Pay */}
            <div>
              <p className={T_SECTION + " mb-3"}>Final Pay</p>
              <div className="space-y-3">
                <div>
                  <label className={T_LABEL + " mb-1 block"}>Final Pay Notes</label>
                  <textarea
                    value={finalPayNotes}
                    onChange={(e) => setFinalPayNotes(e.target.value)}
                    rows={3}
                    placeholder="Calculation details, deductions, allowances..."
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={T_LABEL + " mb-1 block"}>Final Pay Amount (PHP)</label>
                    <input
                      type="number"
                      value={finalPayAmount}
                      onChange={(e) => setFinalPayAmount(e.target.value)}
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={T_LABEL + " mb-1 block"}>Released Date</label>
                    <input
                      type="date"
                      value={finalPayReleasedDate}
                      onChange={(e) => setFinalPayReleasedDate(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* NTE Reference (only for termination) */}
            {detail.separation_type === "termination" && (
              <div>
                <p className={T_SECTION + " mb-3"}>NTE Reference</p>
                <input
                  type="text"
                  value={nteReference}
                  onChange={(e) => setNteReference(e.target.value)}
                  placeholder="NTE reference number or case ID..."
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className={T_LABEL + " mb-1 block"}>General Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes..."
                className={TEXTAREA_CLASS}
              />
            </div>

            {/* Save header button */}
            <div className="flex justify-end">
              <button onClick={patchHeader} disabled={saving} className={PRIMARY_BUTTON}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <div className={DIVIDER} />

            {/* Progress summary */}
            <div>
              <ProgressBar done={detail.done_count} total={detail.total_items} />
              {detail.pending_count > 0 && (
                <div className="mt-2">
                  <span className={BADGE_WARNING}>{detail.pending_count} pending</span>
                </div>
              )}
            </div>

            {/* Checklist by category */}
            {itemsByCategory.length > 0 ? (
              <div className="space-y-6">
                {itemsByCategory.map((cat) => (
                  <div key={cat.key}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <p className={T_SECTION}>{cat.label}</p>
                    </div>
                    <div className="space-y-2">
                      {cat.items.map((item) => (
                        <ChecklistItemRow key={item.id} item={item} onSave={patchItem} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={T_BODY + " text-center py-4"}>No checklist items found.</p>
            )}

            <div className={DIVIDER} />

            {/* Mark complete */}
            {detail.status !== "complete" && (
              <div className="flex justify-center">
                <button
                  onClick={markComplete}
                  disabled={!allDone || completing}
                  className={
                    allDone
                      ? "rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-2.5 font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-300 disabled:opacity-60"
                      : "rounded-xl border border-white/10 bg-white/4 px-6 py-2.5 font-semibold text-zinc-500 cursor-not-allowed opacity-60"
                  }
                  title={!allDone ? "All checklist items must be done or N/A to complete" : undefined}
                >
                  {completing ? "Completing..." : "Mark Offboarding Complete"}
                </button>
              </div>
            )}
            {detail.status === "complete" && (
              <div className="flex justify-center">
                <span className={BADGE_SUCCESS + " px-5 py-2 text-sm"}>Offboarding Complete</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Separation modal ─────────────────────────────────────────────────────

function AddSeparationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (rec: SeparationRecord) => void;
}) {
  const auth = getAuth();
  const [staffName, setStaffName] = useState("");
  const [separationType, setSeparationType] = useState<SeparationType>("voluntary_resignation");
  const [resignationDate, setResignationDate] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [nteReference, setNteReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffName.trim()) {
      setError("Staff name is required.");
      return;
    }
    if (!auth) return;
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        staff_name: staffName.trim(),
        separation_type: separationType,
        resignation_date: resignationDate || null,
        last_working_date: lastWorkingDate || null,
        notes,
      };
      if (separationType === "termination") {
        body.nte_reference = nteReference;
      }
      const res = await fetch(`${API_BASE}/api/admin/hr/separations`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text();
        setError(msg || "Failed to create record.");
        return;
      }
      const created: SeparationRecord = await res.json();
      onCreated(created);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <p className={T_SECTION}>Start Offboarding</p>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/8 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={T_LABEL + " mb-1 block"}>Staff Name *</label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Full name..."
              required
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={T_LABEL + " mb-1 block"}>Separation Type</label>
            <select
              value={separationType}
              onChange={(e) => setSeparationType(e.target.value as SeparationType)}
              className={SELECT_CLASS}
            >
              {(Object.keys(SEPARATION_TYPE_LABELS) as SeparationType[]).map((key) => (
                <option key={key} value={key}>
                  {SEPARATION_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {separationType === "termination" && (
            <div>
              <label className={T_LABEL + " mb-1 block"}>NTE Reference</label>
              <input
                type="text"
                value={nteReference}
                onChange={(e) => setNteReference(e.target.value)}
                placeholder="NTE reference number or case ID..."
                className={INPUT_CLASS}
              />
            </div>
          )}

          <div>
            <label className={T_LABEL + " mb-1 block"}>Date Notified / Resignation Date</label>
            <input
              type="date"
              value={resignationDate}
              onChange={(e) => setResignationDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={T_LABEL + " mb-1 block"}>Last Working Date</label>
            <input
              type="date"
              value={lastWorkingDate}
              onChange={(e) => setLastWorkingDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={T_LABEL + " mb-1 block"}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className={TEXTAREA_CLASS}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
              {submitting ? "Creating..." : "Start Offboarding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Separation card ──────────────────────────────────────────────────────────

function SeparationCard({
  record,
  onClick,
}: {
  record: SeparationRecord;
  onClick: () => void;
}) {
  return (
    <div className={GLASS_CARD + " p-5 flex flex-col gap-4 cursor-pointer hover:border-violet-500/20 transition-all duration-200"} onClick={onClick}>
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SepTypeBadge type={record.separation_type} />
          <StatusBadge status={record.status} />
        </div>
      </div>

      {/* Staff name */}
      <div>
        <p className={T_CARD_TITLE}>{record.staff_name}</p>
        {record.last_working_date && (
          <p className={T_BODY + " mt-0.5"}>
            Last working day:{" "}
            <span className="font-medium text-zinc-300">{record.last_working_date}</span>
          </p>
        )}
      </div>

      {/* Progress */}
      <ProgressBar done={record.done_count} total={record.total_items} />

      {/* Footer */}
      <div className="flex items-center justify-between">
        {record.pending_count > 0 ? (
          <span className={BADGE_WARNING}>{record.pending_count} pending</span>
        ) : (
          <span className={BADGE_SUCCESS}>All done</span>
        )}
        <button
          className="flex items-center gap-1 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          View Details
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = "in_progress" | "complete" | "all";

export default function HrSeparationPage() {
  const router = useRouter();

  const [accessReady, setAccessReady] = useState(false);
  const [authHeaders, setAuthHeaders] = useState<HeadersInit>({});

  const [records, setRecords] = useState<SeparationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("in_progress");
  const [selectedRecord, setSelectedRecord] = useState<SeparationRecord | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // ─── Auth init (Bug S2) ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = getAuth();
      if (!raw?.accessToken) {
        router.replace("/login?next=/admin/hr/separation");
        return;
      }
      const resolved = await refreshAuthFromApi(raw);
      const a = resolved || raw;
      const role = String(a?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role)) {
        router.replace("/week");
        return;
      }
      if (!cancelled) {
        setAuthHeaders(getAuthHeaders(a));
        setAccessReady(true);
      }
    }
    void init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!accessReady) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`${API_BASE}/api/admin/hr/separations?${params.toString()}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data: SeparationRecord[] = await res.json();
        setRecords(data);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, accessReady, authHeaders]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Show spinner while auth resolves (Bug S2)
  if (!accessReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  function handleUpdated(updated: SeparationRecord) {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    if (selectedRecord?.id === updated.id) {
      setSelectedRecord((prev) => (prev ? { ...prev, ...updated } : prev));
    }
  }

  function handleCreated(rec: SeparationRecord) {
    setRecords((prev) => [rec, ...prev]);
  }

  return (
    <div className="min-h-screen space-y-6 p-4 pb-24 md:p-6 md:pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>HR Offboarding</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className={PRIMARY_BUTTON}
        >
          + Start Offboarding
        </button>
      </div>

      {/* Filter tabs */}
      <div className={TAB_CONTAINER}>
        {(
          [
            { key: "in_progress", label: "In Progress" },
            { key: "complete", label: "Complete" },
            { key: "all", label: "All" },
          ] as { key: StatusFilter; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={statusFilter === key ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Records grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : records.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center"}>
          <p className={T_SECTION + " text-zinc-400"}>No offboarding records</p>
          <p className={T_BODY + " mt-1"}>
            {statusFilter === "in_progress"
              ? "No active offboarding cases."
              : statusFilter === "complete"
              ? "No completed offboarding cases."
              : "No offboarding records yet."}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className={PRIMARY_BUTTON + " mt-4"}
          >
            + Start Offboarding
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {records.map((rec) => (
            <SeparationCard
              key={rec.id}
              record={rec}
              onClick={() => setSelectedRecord(rec)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedRecord && (
        <DetailPanel
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onUpdated={handleUpdated}
        />
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddSeparationModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
