"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  Clock,
  MinusCircle,
  Circle,
} from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_ERROR,
  BADGE_INFO,
  DIVIDER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type OnboardingStatus = "in_progress" | "complete";
type ItemStatus = "pending" | "submitted" | "verified" | "na";

type OnboardingItem = {
  id: string;
  onboarding_id: string;
  item_key: string;
  item_label: string;
  category: string;
  status: ItemStatus;
  id_number: string;
  date_issued: string;
  notes: string;
  submitted_at: string;
  verified_by: string;
  legally_required?: boolean;
};

type OnboardingRecord = {
  id: string;
  staff_name: string;
  city: string;
  branch: string;
  position: string;
  status: OnboardingStatus;
  start_date: string;
  notes: string;
  total_items: number;
  submitted_count: number;
  verified_count: number;
  legal_total?: number;
  legal_verified?: number;
  legal_outstanding?: number;
  days_since_start?: number | null;
  pending_count: number;
  created_at: string;
  items?: OnboardingItem[];
  date_of_birth?: string | null;
  marital_status?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"];

const CATEGORIES = [
  { key: "government", label: "Government Documents", icon: "🏛️" },
  { key: "health", label: "Health & Safety", icon: "🏥" },
  { key: "bank", label: "Bank & Payroll", icon: "🏦" },
  { key: "contract", label: "Contracts & Equipment", icon: "📄" },
  { key: "orientation", label: "Orientation", icon: "🎓" },
] as const;

// Submitted and N/A are gone from the picker: across 144 items neither has ever
// been chosen. A choice nobody makes still costs everybody the moment spent
// deciding it is not the one they want.
//
// The rendering below still understands them, because removing an option is not
// the same as being able to remove data, and nothing guarantees a row somewhere
// does not hold one.
const ITEM_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(status: ItemStatus) {
  if (status === "verified")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === "submitted")
    return <Clock className="h-4 w-4 shrink-0 text-amber-300" />;
  if (status === "na")
    return <MinusCircle className="h-4 w-4 shrink-0 text-neutral-500" />;
  return <Circle className="h-4 w-4 shrink-0 text-neutral-400" />;
}

function itemLabelClass(status: ItemStatus) {
  if (status === "verified") return "text-emerald-400 text-sm font-medium";
  if (status === "submitted") return "text-amber-300 text-sm font-medium";
  if (status === "na") return "text-neutral-500 text-sm line-through";
  return "text-neutral-400 text-sm";
}

function onboardingBadge(status: OnboardingStatus) {
  if (status === "complete")
    return <span className={BADGE_SUCCESS}>Complete</span>;
  return <span className={BADGE_INFO}>In Progress</span>;
}

function ProgressBar({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  color: "amber" | "emerald";
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-white/8">
      <div
        className={`h-1.5 rounded-full transition-all duration-300 ${
          color === "amber" ? "bg-amber-400" : "bg-emerald-400"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onUpdated,
}: {
  item: OnboardingItem;
  onUpdated: (updated: OnboardingItem) => void;
}) {
  const [draft, setDraft] = useState<OnboardingItem>({ ...item });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const isDirty =
    draft.status !== item.status ||
    draft.id_number !== item.id_number ||
    draft.date_issued !== item.date_issued ||
    draft.notes !== item.notes ||
    draft.verified_by !== item.verified_by;

  const handleVerify = async () => {
    setSaving(true);
    setErr("");
    try {
      // verified_by is filled in by the server from the session.
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/items/${item.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({ status: "verified" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const who = data?.verified_by || draft.verified_by;
      setDraft((prev) => ({ ...prev, status: "verified", verified_by: who }));
      onUpdated({ ...item, status: "verified", verified_by: who });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/items/${item.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({
          status: draft.status,
          id_number: draft.id_number,
          date_issued: draft.date_issued,
          notes: draft.notes,
          verified_by: draft.verified_by,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const updated: OnboardingItem = data?.item ?? { ...draft };
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border border-white/8 bg-white/4 p-3 transition-colors ${
      draft.status === "verified"
        ? "border-emerald-500/20 bg-emerald-500/5"
        : draft.status === "submitted"
        ? "border-amber-500/20 bg-amber-500/5"
        : draft.status === "na"
        ? "opacity-60"
        : ""
    }`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{statusIcon(draft.status)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={itemLabelClass(draft.status)}>
              {item.item_label}
              {item.legally_required && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/30">
                  required by law
                </span>
              )}
            </span>
            <SelectDark
              value={draft.status}
              onChange={(v) =>
                setDraft((prev) => ({ ...prev, status: v as ItemStatus }))
              }
              className="appearance-none cursor-pointer rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-xs text-white outline-none focus:border-violet-500/50"
              options={ITEM_STATUS_OPTIONS}
            />
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={`${T_LABEL} block mb-1`}>ID / Reference No.</label>
              <input
                type="text"
                value={draft.id_number}
                onChange={(e) => setDraft((prev) => ({ ...prev, id_number: e.target.value }))}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1`}>Date Issued</label>
              <input
                type="date"
                value={draft.date_issued}
                onChange={(e) => setDraft((prev) => ({ ...prev, date_issued: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1`}>Notes</label>
              <input
                type="text"
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1`}>Verified By</label>
              <input
                type="text"
                value={draft.verified_by}
                onChange={(e) => setDraft((prev) => ({ ...prev, verified_by: e.target.value }))}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          {err && <p className="mt-1.5 text-xs text-red-400">{err}</p>}

          <div className="mt-2 flex items-center justify-end gap-2">
            {saved && <span className="text-xs text-emerald-400">Saved</span>}
            {draft.status !== "verified" && (
              // Sixteen rows per person, five fields each, and Verified By had
              // to be typed on every one. Five of nine people have nothing
              // recorded weeks after starting. The common case is one tap now;
              // the fields stay for when the reference number matters.
              <button
                onClick={() => void handleVerify()}
                disabled={saving}
                className={`${SMALL_BUTTON} text-emerald-300`}
              >
                Mark verified
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={`${SMALL_BUTTON} text-xs px-3 py-1 disabled:opacity-40`}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  record,
  onClose,
  onCompleted,
  onItemsUpdated,
}: {
  record: OnboardingRecord;
  onClose: () => void;
  onCompleted: (id: string) => void;
  onItemsUpdated: (id: string, items: OnboardingItem[]) => void;
}) {
  const [items, setItems] = useState<OnboardingItem[]>(record.items ?? []);
  const [loadingItems, setLoadingItems] = useState(!record.items);
  const [completing, setCompleting] = useState(false);
  const [completeErr, setCompleteErr] = useState("");

  useEffect(() => {
    if (record.items) {
      setItems(record.items);
      setLoadingItems(false);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    fetch(`${API_BASE}/api/admin/hr/onboarding/${record.id}`, {
      headers: getAuthHeaders(getAuth()),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          const loaded: OnboardingItem[] = Array.isArray(data?.items) ? data.items : [];
          setItems(loaded);
          onItemsUpdated(record.id, loaded);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  const handleItemUpdated = (updated: OnboardingItem) => {
    const next = items.map((it) => (it.id === updated.id ? updated : it));
    setItems(next);
    onItemsUpdated(record.id, next);
  };

  // Compute whether "Mark Complete" is eligible
  const canComplete =
    record.status !== "complete" &&
    items.length > 0 &&
    items.every((it) => it.status === "submitted" || it.status === "verified" || it.status === "na");

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/${record.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({ status: "complete" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCompleted(record.id);
    } catch (e: unknown) {
      setCompleteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCompleting(false);
    }
  };

  const groupedItems = CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((it) => it.category === cat.key),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex md:justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 flex h-full w-full flex-col overflow-y-auto bg-[#0d1117] md:w-[560px] md:border-l md:border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0d1117] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-white">{record.staff_name}</h2>
              <p className={T_CAPTION}>
                {record.position}{record.branch ? ` · ${record.branch}` : ""} · Start:{" "}
                {record.start_date || "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onboardingBadge(record.status)}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {(record.date_of_birth || record.marital_status) && (
            <div className="mt-2 flex flex-wrap gap-3">
              {record.date_of_birth && (
                <div className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/8 px-2.5 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">DOB</span>
                  <span className="text-xs font-medium text-white">{record.date_of_birth}</span>
                </div>
              )}
              {record.marital_status && (
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/6 px-2.5 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Status</span>
                  <span className="text-xs font-medium text-white capitalize">{record.marital_status}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Complete button */}
        {record.status !== "complete" && (
          <div className="border-b border-white/8 px-5 py-3">
            {completeErr && <p className="mb-2 text-xs text-red-400">{completeErr}</p>}
            <button
              onClick={handleComplete}
              disabled={!canComplete || completing}
              className={`${PRIMARY_BUTTON} w-full disabled:opacity-40`}
            >
              {completing ? "Marking complete..." : "Mark Onboarding Complete"}
            </button>
            {!canComplete && items.length > 0 && (
              <p className={`mt-1.5 text-center ${T_CAPTION}`}>
                All items must be submitted, verified, or N/A
              </p>
            )}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 px-5 py-4 space-y-6">
          {loadingItems ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-violet-400" />
            </div>
          ) : groupedItems.length === 0 ? (
            <p className={`text-center ${T_BODY}`}>No checklist items found.</p>
          ) : (
            groupedItems.map((cat) => (
              <div key={cat.key}>
                <h3 className={`${T_SECTION} mb-3`}>
                  {cat.icon} {cat.label}
                </h3>
                <div className="space-y-2">
                  {cat.items.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      onUpdated={handleItemUpdated}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddModal({
  accessToken,
  city,
  onClose,
  onCreated,
}: {
  accessToken: string;
  city: string;
  onClose: () => void;
  onCreated: (record: OnboardingRecord) => void;
}) {
  const [modalCity, setModalCity] = useState(city);
  const [form, setForm] = useState({
    staff_name: "",
    branch: "",
    position: "",
    start_date: "",
    applicant_id: "",
    notes: "",
  });
  const [staffList, setStaffList] = useState<string[]>([]);
  const [infoLoading, setInfoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/staff_master/names?city=${modalCity}&status=ACTIVE&limit=5000`, {
      headers: getAuthHeaders(getAuth()),
    })
      .then((r) => r.json())
      .then((d) => setStaffList(Array.isArray(d?.names) ? d.names : []))
      .catch(() => {});
  }, [accessToken, modalCity]);

  const handleCitySwitch = (c: string) => {
    setModalCity(c);
    setForm((prev) => ({ ...prev, staff_name: "", branch: "", position: "" }));
  };

  const handleStaffSelect = async (name: string) => {
    setForm((prev) => ({ ...prev, staff_name: name }));
    if (!name) return;
    setInfoLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/staff_master/info?name=${encodeURIComponent(name)}&city=${modalCity}`,
        { headers: getAuthHeaders(getAuth()) },
      );
      if (res.ok) {
        const d = await res.json();
        setForm((prev) => ({
          ...prev,
          branch: d.branch || prev.branch,
          position: d.position || prev.position,
        }));
      }
    } catch {
      // ignore — form stays editable
    } finally {
      setInfoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_name.trim()) {
      setErr("Staff name is required.");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding`, {
        method: "POST",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({
          staff_name: form.staff_name.trim(),
          city: modalCity,
          branch: form.branch.trim(),
          position: form.position.trim(),
          start_date: form.start_date || null,
          applicant_id: form.applicant_id.trim() || null,
          notes: form.notes.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onCreated(data?.record ?? data);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const textField = (
    key: keyof typeof form,
    label: string,
    type: string = "text",
    placeholder?: string,
    hint?: string,
  ) => (
    <div>
      <label className={`${T_LABEL} block mb-1`}>{label}</label>
      {hint && <p className={`${T_CAPTION} mb-1`}>{hint}</p>}
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full max-w-lg ${GLASS_CARD} p-6 mx-4 mb-4 sm:mb-0 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className={T_SECTION}>Start Onboarding</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* City toggle */}
          <div>
            <label className={`${T_LABEL} block mb-1`}>City</label>
            <div className="flex gap-2">
              {["manila", "dubai"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCitySwitch(c)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    modalCity === c
                      ? "bg-violet-600 text-white"
                      : "bg-white/10 text-neutral-400 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  {c === "manila" ? "Manila" : "Dubai"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1`}>Staff Name *</label>
            <SelectDark
              value={form.staff_name}
              onChange={handleStaffSelect}
              options={staffList}
              placeholder="Select staff member..."
            />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1`}>
              Branch{infoLoading && <span className="ml-2 text-xs text-neutral-500">syncing...</span>}
            </label>
            <input
              type="text"
              value={form.branch}
              onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
              placeholder="e.g. Paranaque"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1`}>
              Position{infoLoading && <span className="ml-2 text-xs text-neutral-500">syncing...</span>}
            </label>
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              placeholder="e.g. Kitchen Staff"
              className={INPUT_CLASS}
            />
          </div>
          {textField("start_date", "Start Date", "date")}
          {textField(
            "applicant_id",
            "Applicant ID (Pipeline)",
            "text",
            "Optional",
            "Leave blank if not from recruitment pipeline",
          )}
          <div>
            <label className={`${T_LABEL} block mb-1`}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes..."
              rows={3}
              className={TEXTAREA_CLASS}
            />
          </div>

          {err && <p className="text-sm text-red-400">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} flex-1`}>
              {submitting ? "Creating..." : "Start Onboarding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Record Card ──────────────────────────────────────────────────────────────

function RecordCard({
  record,
  onClick,
}: {
  record: OnboardingRecord;
  onClick: () => void;
}) {
  const total = record.total_items || 1;
  return (
    <button
      onClick={onClick}
      className={`${GLASS_CARD} w-full p-4 text-left transition-all hover:border-violet-500/30 hover:bg-white/8 active:scale-[0.99]`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        {onboardingBadge(record.status)}
        {record.pending_count > 0 && (
          <span className={BADGE_ERROR}>{record.pending_count} pending</span>
        )}
      </div>

      <h3 className="text-base font-semibold text-white truncate">{record.staff_name}</h3>
      <p className={`${T_CAPTION} mt-0.5`}>
        {record.position || "—"}
        {record.branch ? ` · ${record.branch}` : ""}
      </p>
      <p className={`${T_CAPTION} mt-0.5`}>
        Start: {record.start_date || "—"}
        {typeof record.days_since_start === "number" && (
          <span className={record.days_since_start > 30 ? " text-amber-300" : ""}>
            {" "}· {record.days_since_start} days ago
          </span>
        )}
      </p>

      {/* The three the law is behind, counted on their own. Verified for one of
          nine people, while five have been on the line for over a month. */}
      {(record.legal_outstanding ?? 0) > 0 && (
        <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
          {record.legal_outstanding} of {record.legal_total} required by law still
          missing
          <span className="block font-normal text-amber-200/70">
            NBI Clearance · Health Certificate · Food Handler
          </span>
        </p>
      )}

      <div className={DIVIDER} style={{ margin: "0.75rem 0" }} />

      {/* One bar, not two. Submitted counts submitted-plus-verified and nothing
          has ever been Submitted, so the two bars always drew the same number —
          two identical figures make a reader look for the difference. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-emerald-400/80">Verified</span>
          <span className="text-xs text-emerald-400 font-medium tabular-nums">
            {record.verified_count}/{total}
          </span>
        </div>
        <ProgressBar value={record.verified_count} total={total} color="emerald" />
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-violet-400">
        <span>View Details</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HrOnboardingPage() {
  const router = useRouter();

  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState("manila");
  const [canSwitchCity, setCanSwitchCity] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [hasSession, setHasSession] = useState(false);

  const [statusFilter, setStatusFilter] = useState<OnboardingStatus>("in_progress");
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OnboardingRecord | null>(null);

  // ─── Auth init ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = getAuth();
      if (!raw?.hasSession && !raw?.accessToken) {
        router.replace("/login");
        return;
      }
      const resolved = await refreshAuthFromApi(raw);
      const a = resolved || raw;
      const role = String(a?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role)) {
        if (!cancelled) setAllowed(false);
        return;
      }
      if (!cancelled) {
        setAllowed(true);
        setAccessToken(a.accessToken ?? "");
        setHasSession(a.hasSession ?? false);
        const isGlobal = role === "ADMIN" || role === "HQ";
        setCanSwitchCity(isGlobal);
        setCity(isGlobal ? "manila" : (String(a.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila"));
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load records ─────────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    if (!accessToken && !hasSession) return;
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE}/api/admin/hr/onboarding?city=${encodeURIComponent(city)}&status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url, {
        headers: getAuthHeaders(getAuth()),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecords(Array.isArray(data?.onboarding) ? data.onboarding : Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasSession, city, statusFilter]);

  useEffect(() => {
    if (allowed && (accessToken || hasSession)) void loadRecords();
  }, [allowed, accessToken, hasSession, loadRecords]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCreated = (record: OnboardingRecord) => {
    setRecords((prev) => [record, ...prev]);
  };

  const handleCompleted = (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "complete" as OnboardingStatus } : r)),
    );
    if (selectedRecord?.id === id) {
      setSelectedRecord((prev) => prev ? { ...prev, status: "complete" } : prev);
    }
  };

  const handleItemsUpdated = (recordId: string, items: OnboardingItem[]) => {
    // Recompute progress counts locally
    const submitted = items.filter((it) => it.status === "submitted" || it.status === "verified").length;
    const verified = items.filter((it) => it.status === "verified").length;
    const pending = items.filter((it) => it.status === "pending").length;

    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? {
              ...r,
              submitted_count: submitted,
              verified_count: verified,
              pending_count: pending,
              items,
            }
          : r,
      ),
    );
    if (selectedRecord?.id === recordId) {
      setSelectedRecord((prev) =>
        prev
          ? {
              ...prev,
              submitted_count: submitted,
              verified_count: verified,
              pending_count: pending,
              items,
            }
          : prev,
      );
    }
  };

  // ─── Access denied ────────────────────────────────────────────────────────

  if (!allowed && (accessToken || hasSession)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className={`${GLASS_CARD} p-8 text-center max-w-sm`}>
          <p className="text-lg font-semibold text-white mb-2">Access Denied</p>
          <p className={T_BODY}>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>HR Onboarding</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadRecords}
            disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-2`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className={`${PRIMARY_BUTTON} flex items-center gap-2`}
          >
            <Plus className="h-4 w-4" />
            Start Onboarding
          </button>
        </div>
      </div>

      {/* City switcher (HQ / ADMIN only) */}
      {canSwitchCity && (
        <div className={`${TAB_CONTAINER} mb-4 w-fit`}>
          {(["manila", "dubai"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={city === c ? TAB_ACTIVE : TAB_INACTIVE}
            >
              {c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}
            </button>
          ))}
        </div>
      )}

      {/* Status filter tabs */}
      <div className={`${TAB_CONTAINER} mb-6 w-fit`}>
        {(["in_progress", "complete"] as OnboardingStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {s === "in_progress" ? "In Progress" : "Complete"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className={`${GLASS_CARD} mb-4 p-3 border-red-500/20`}>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && records.length === 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`${GLASS_CARD} h-48 animate-pulse`} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && records.length === 0 && !error && (
        <div className={`${GLASS_CARD} p-12 text-center`}>
          <p className="text-lg font-semibold text-white mb-2">No records found</p>
          <p className={T_BODY}>
            {statusFilter === "in_progress"
              ? "No onboarding in progress. Click \"Start Onboarding\" to add one."
              : "No completed onboarding records."}
          </p>
        </div>
      )}

      {/* Record grid */}
      {records.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {records.map((r) => (
            <RecordCard
              key={r.id}
              record={r}
              onClick={() => setSelectedRecord(r)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedRecord && (
        <DetailPanel
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onCompleted={handleCompleted}
          onItemsUpdated={handleItemsUpdated}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <AddModal
          accessToken={accessToken}
          city={city}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
