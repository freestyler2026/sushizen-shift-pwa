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
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
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
  expiry_date: string;
  notes: string;
  submitted_at: string;
  verified_by: string;
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
  pending_count: number;
  created_at: string;
  items?: OnboardingItem[];
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

const ITEM_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "verified", label: "Verified" },
  { value: "na", label: "N/A" },
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
  accessToken,
  onUpdated,
}: {
  item: OnboardingItem;
  accessToken: string;
  onUpdated: (updated: OnboardingItem) => void;
}) {
  const [draft, setDraft] = useState<OnboardingItem>({ ...item });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const isDirty =
    draft.status !== item.status ||
    draft.id_number !== item.id_number ||
    draft.expiry_date !== item.expiry_date ||
    draft.notes !== item.notes ||
    draft.verified_by !== item.verified_by;

  const handleSave = async () => {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/onboarding/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: draft.status,
          id_number: draft.id_number,
          expiry_date: draft.expiry_date,
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
            <span className={itemLabelClass(draft.status)}>{item.item_label}</span>
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, status: e.target.value as ItemStatus }))
              }
              className="appearance-none cursor-pointer rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-xs text-white outline-none focus:border-violet-500/50"
            >
              {ITEM_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              <label className={`${T_LABEL} block mb-1`}>Expiry Date</label>
              <input
                type="date"
                value={draft.expiry_date}
                onChange={(e) => setDraft((prev) => ({ ...prev, expiry_date: e.target.value }))}
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
  accessToken,
  onClose,
  onCompleted,
  onItemsUpdated,
}: {
  record: OnboardingRecord;
  accessToken: string;
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
      headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
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
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1117] px-5 py-4">
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
                      accessToken={accessToken}
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
  const [form, setForm] = useState({
    staff_name: "",
    branch: "",
    position: "",
    start_date: "",
    applicant_id: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          staff_name: form.staff_name.trim(),
          city,
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

  const field = (
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
          {field("staff_name", "Staff Name *", "text", "Juan dela Cruz")}
          {field("branch", "Branch", "text", "Makati")}
          {field("position", "Position", "text", "Kitchen Staff")}
          {field("start_date", "Start Date", "date")}
          {field(
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
      <p className={`${T_CAPTION} mt-0.5`}>Start: {record.start_date || "—"}</p>

      <div className={DIVIDER} style={{ margin: "0.75rem 0" }} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-amber-300/80">Submitted</span>
          <span className="text-xs text-amber-300 font-medium tabular-nums">
            {record.submitted_count}/{total}
          </span>
        </div>
        <ProgressBar value={record.submitted_count} total={total} color="amber" />

        <div className="flex items-center justify-between gap-2 mt-1">
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
  const [accessToken, setAccessToken] = useState("");

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
      if (!raw?.accessToken) {
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
        setCity(String(a.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
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
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE}/api/admin/hr/onboarding?city=${encodeURIComponent(city)}&status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
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
  }, [accessToken, city, statusFilter]);

  useEffect(() => {
    if (allowed && accessToken) void loadRecords();
  }, [allowed, accessToken, loadRecords]);

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

  if (!allowed && accessToken) {
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
          accessToken={accessToken}
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
