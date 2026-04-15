"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Info,
  Loader2,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { canAccessRenewalsAdmin, getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BRANCHES,
  DOC_LABELS,
  DOC_TYPES,
  type DocType,
  type RenewalAlertItem,
  type RenewalDocument,
  type RenewalStaff,
  type RenewalStatus,
  setRenewalsBadgeCount,
} from "@/lib/renewals";

type PageTab = "alerts" | "staff" | "add";
type StaffStatusFilter = "all" | "active" | "resigned";

type StaffFormState = {
  emp_id: string;
  full_name: string;
  position: string;
  branch: string;
  nationality: string;
  phone_no: string;
  active_status: "Active" | "Resigned";
};

type DocumentFormValue = {
  issued_date: string;
  expiry_date: string;
  renewal_status: RenewalStatus;
  doc_reference: string;
  notes: string;
};

type DocumentFormState = Record<DocType, DocumentFormValue>;

type ToastState = { kind: "success" | "error"; text: string } | null;

const STATUS_OPTIONS: RenewalStatus[] = ["PENDING", "IN_PROGRESS", "RENEWED", "N/A"];
const TAB_ITEMS: Array<{ id: PageTab; label: string; icon: typeof CircleAlert }> = [
  { id: "alerts", label: "Alerts", icon: CircleAlert },
  { id: "staff", label: "All Staff", icon: Users },
  { id: "add", label: "Add Staff", icon: Plus },
];

const DOC_TOOLTIPS: Record<DocType, string> = {
  VISA: "Residency visa renewal date tracking.",
  EID: "Emirates ID expiry and renewal status.",
  PASSPORT: "Passport expiry and reference details.",
  LABOUR_CONTRACT: "Labour contract renewal record.",
  INSURANCE: "Health insurance validity tracking.",
  OHC: "OHC food-safety certificate dates.",
  BFHC: "BFHC food-safety certificate dates.",
  PIC: "PIC food-safety certificate dates.",
  LABOUR_CARD: "Labour card expiry and permit reference.",
};

function emptyStaffForm(): StaffFormState {
  return {
    emp_id: "",
    full_name: "",
    position: "",
    branch: "",
    nationality: "",
    phone_no: "",
    active_status: "Active",
  };
}

function emptyDocumentForm(): DocumentFormState {
  return DOC_TYPES.reduce((acc, docType) => {
    acc[docType] = {
      issued_date: "",
      expiry_date: "",
      renewal_status: "PENDING",
      doc_reference: "",
      notes: "",
    };
    return acc;
  }, {} as DocumentFormState);
}

function toIsoDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function documentFormsFromStaff(documents: RenewalDocument[]): DocumentFormState {
  const base = emptyDocumentForm();
  for (const document of documents || []) {
    base[document.doc_type] = {
      issued_date: toIsoDate(document.issued_date),
      expiry_date: toIsoDate(document.expiry_date),
      renewal_status: document.renewal_status,
      doc_reference: document.doc_reference || "",
      notes: document.notes || "",
    };
  }
  return base;
}

function staffFormFromStaff(staff: RenewalStaff): StaffFormState {
  return {
    emp_id: staff.emp_id || "",
    full_name: staff.full_name || "",
    position: staff.position || "",
    branch: staff.branch || "",
    nationality: staff.nationality || "",
    phone_no: staff.phone_no || "",
    active_status: staff.active_status === "Resigned" ? "Resigned" : "Active",
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...getAuthHeaders(),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed?.detail || text || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function formatDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function docTypeBadgeClass(docType: DocType) {
  if (docType === "VISA" || docType === "EID") return "bg-violet-900/50 text-violet-200";
  if (docType === "PASSPORT") return "bg-blue-900/50 text-blue-200";
  if (docType === "LABOUR_CONTRACT") return "bg-cyan-900/50 text-cyan-200";
  if (docType === "INSURANCE") return "bg-green-900/50 text-green-200";
  if (docType === "OHC" || docType === "BFHC" || docType === "PIC") return "bg-yellow-900/50 text-yellow-200";
  return "bg-pink-900/50 text-pink-200";
}

function alertBorderClass(level: RenewalAlertItem["alert_level"]) {
  if (level === "EXPIRED") return "border-red-500/50";
  if (level === "CRITICAL") return "border-orange-500/50";
  return "border-amber-500/50";
}

function alertBadgeClass(level: RenewalAlertItem["alert_level"]) {
  if (level === "EXPIRED") return "bg-red-900/50 border border-red-500 text-red-200";
  if (level === "CRITICAL") return "bg-orange-900/50 border border-orange-500 text-orange-200";
  return "bg-amber-900/50 border border-amber-500 text-amber-200";
}

function expiryCopy(daysUntilExpiry: number) {
  if (daysUntilExpiry < 0) return `${Math.abs(daysUntilExpiry)} days overdue`;
  if (daysUntilExpiry === 0) return "expires today";
  return `${daysUntilExpiry} days left`;
}

function statusSummary(document: RenewalDocument) {
  if (document.renewal_status === "RENEWED") {
    return { label: "VALID", className: "bg-emerald-800 text-emerald-200 rounded-full px-1.5 py-0.5 text-[10px] font-bold" };
  }
  if (document.alert_level === "EXPIRED") {
    return { label: "EXPIRED", className: "bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold" };
  }
  if (document.alert_level === "CRITICAL" || document.alert_level === "WARNING") {
    return { label: "EXPIRING", className: "bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold" };
  }
  if (document.expiry_date) {
    return { label: "VALID", className: "bg-emerald-800 text-emerald-200 rounded-full px-1.5 py-0.5 text-[10px] font-bold" };
  }
  return {
    label: document.renewal_status === "N/A" ? "N/A" : "PENDING",
    className: "bg-neutral-700 text-neutral-300 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
  };
}

function groupedAlerts(alerts: RenewalAlertItem[]) {
  const map = new Map<string, RenewalAlertItem[]>();
  for (const alert of alerts) {
    const key = `${alert.emp_id}__${alert.full_name}`;
    const list = map.get(key) || [];
    list.push(alert);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    emp_id: items[0]?.emp_id || "",
    full_name: items[0]?.full_name || "",
    position: items[0]?.position || "",
    branch: items[0]?.branch || "",
    active_status: items[0]?.active_status || "Active",
    items,
  }));
}

function isResignedStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase() === "resigned";
}

function FormInput({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">{label}</div>
      {children}
    </label>
  );
}

function baseInputClass() {
  return "w-full rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm px-3 py-2 focus:outline-none focus:border-violet-500";
}

function DocumentFields({
  docForms,
  onChange,
}: {
  docForms: DocumentFormState;
  onChange: (docType: DocType, field: keyof DocumentFormValue, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {DOC_TYPES.map((docType) => (
        <div key={docType} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-semibold text-white">{DOC_LABELS[docType]}</div>
            <span title={DOC_TOOLTIPS[docType]} className="text-neutral-500">
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="grid gap-3">
            <FormInput label="Issued Date">
              <input
                type="date"
                value={docForms[docType].issued_date}
                onChange={(event) => onChange(docType, "issued_date", event.target.value)}
                className={baseInputClass()}
              />
            </FormInput>
            <FormInput label="Expiry Date">
              <input
                type="date"
                value={docForms[docType].expiry_date}
                onChange={(event) => onChange(docType, "expiry_date", event.target.value)}
                className={baseInputClass()}
              />
            </FormInput>
            <FormInput label="Reference / Notes">
              <input
                value={docForms[docType].doc_reference}
                onChange={(event) => onChange(docType, "doc_reference", event.target.value)}
                className={baseInputClass()}
                placeholder="Permit no / certificate no"
              />
            </FormInput>
            <FormInput label="Status">
              <select
                value={docForms[docType].renewal_status}
                onChange={(event) => onChange(docType, "renewal_status", event.target.value)}
                className={baseInputClass()}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FormInput>
            <FormInput label="Notes">
              <textarea
                value={docForms[docType].notes}
                onChange={(event) => onChange(docType, "notes", event.target.value)}
                className={baseInputClass() + " min-h-[74px]"}
                placeholder="Optional notes"
              />
            </FormInput>
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffEditor({
  staffForm,
  setStaffForm,
  docForms,
  setDocForms,
  onSubmit,
  saving,
  submitLabel,
  onCancel,
  lockEmpId = false,
}: {
  staffForm: StaffFormState;
  setStaffForm: Dispatch<SetStateAction<StaffFormState>>;
  docForms: DocumentFormState;
  setDocForms: Dispatch<SetStateAction<DocumentFormState>>;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
  onCancel?: () => void;
  lockEmpId?: boolean;
}) {
  const updateDocField = (docType: DocType, field: keyof DocumentFormValue, value: string) => {
    setDocForms((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        [field]: value,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Staff Info</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormInput label="Employee ID">
            <input
              value={staffForm.emp_id}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, emp_id: event.target.value }))}
              disabled={lockEmpId}
              className={[baseInputClass(), lockEmpId ? "cursor-not-allowed opacity-60" : ""].join(" ")}
              placeholder="EMP052"
            />
          </FormInput>
          <FormInput label="Full Name">
            <input
              value={staffForm.full_name}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, full_name: event.target.value }))}
              className={baseInputClass()}
            />
          </FormInput>
          <FormInput label="Position">
            <input
              value={staffForm.position}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, position: event.target.value }))}
              className={baseInputClass()}
            />
          </FormInput>
          <FormInput label="Branch">
            <select
              value={staffForm.branch}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, branch: event.target.value }))}
              className={baseInputClass()}
            >
              <option value="">Select branch</option>
              {BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </FormInput>
          <FormInput label="Nationality">
            <input
              value={staffForm.nationality}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, nationality: event.target.value }))}
              className={baseInputClass()}
            />
          </FormInput>
          <FormInput label="Phone No">
            <input
              value={staffForm.phone_no}
              onChange={(event) => setStaffForm((prev) => ({ ...prev, phone_no: event.target.value }))}
              className={baseInputClass()}
            />
          </FormInput>
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">Active Status</div>
          <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
            {(["Active", "Resigned"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStaffForm((prev) => ({ ...prev, active_status: status }))}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  staffForm.active_status === status ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                ].join(" ")}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Document Dates</h2>
        <DocumentFields docForms={docForms} onChange={updateDocField} />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="w-full rounded-xl bg-violet-700 py-3 font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3 font-semibold text-neutral-200 transition hover:border-neutral-600"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function RenewalsAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<PageTab>("alerts");
  const [alerts, setAlerts] = useState<RenewalAlertItem[]>([]);
  const [staff, setStaff] = useState<RenewalStaff[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [resigningId, setResigningId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [showAllStaff, setShowAllStaff] = useState(true);
  const [alertStaffFilter, setAlertStaffFilter] = useState<StaffStatusFilter>("all");
  const [addStaffForm, setAddStaffForm] = useState<StaffFormState>(emptyStaffForm());
  const [addDocForms, setAddDocForms] = useState<DocumentFormState>(emptyDocumentForm());
  const [editingStaff, setEditingStaff] = useState<RenewalStaff | null>(null);
  const [editStaffForm, setEditStaffForm] = useState<StaffFormState>(emptyStaffForm());
  const [editDocForms, setEditDocForms] = useState<DocumentFormState>(emptyDocumentForm());
  const [accessReady, setAccessReady] = useState(false);

  useEffect(() => {
    const current = getAuth();
    if (!current) {
      router.replace("/login?next=%2Fadmin%2Frenewals");
      return;
    }
    void refreshAuthFromApi(current).then((resolved) => {
      const auth = resolved || current;
      if (!canAccessRenewalsAdmin(auth)) {
        router.replace("/week");
        return;
      }
      setAccessReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const data = await requestJson<{ alerts: RenewalAlertItem[]; badge_count: number }>("/api/renewals/alerts");
      const nextAlerts = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlerts(nextAlerts);
      setRenewalsBadgeCount(nextAlerts.filter((item) => !isResignedStatus(item.active_status)).length);
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to load alerts" });
    } finally {
      setAlertsLoading(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const data = await requestJson<{ staff: RenewalStaff[] }>("/api/renewals/staff?active_only=false");
      setStaff(Array.isArray(data?.staff) ? data.staff : []);
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to load staff" });
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    if (!accessReady) return;
    void loadAlerts();
    void loadStaff();
  }, [accessReady]);

  const summary = useMemo(
    () => ({
      expired: alerts.filter((item) => item.alert_level === "EXPIRED").length,
      critical: alerts.filter((item) => item.alert_level === "CRITICAL").length,
      warning: alerts.filter((item) => item.alert_level === "WARNING").length,
    }),
    [alerts],
  );

  const visibleStaff = useMemo(() => {
    return staff.filter((member) => {
      if (!showAllStaff && member.active_status !== "Active") return false;
      if (branchFilter && member.branch !== branchFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${member.full_name} ${member.emp_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [branchFilter, search, showAllStaff, staff]);

  const alertGroups = useMemo(() => groupedAlerts(alerts), [alerts]);
  const visibleAlertGroups = useMemo(() => {
    if (alertStaffFilter === "all") return alertGroups;
    const target = alertStaffFilter === "active" ? "Active" : "Resigned";
    return alertGroups.filter((group) => (group.active_status === "Resigned" ? "Resigned" : "Active") === target);
  }, [alertGroups, alertStaffFilter]);

  const saveDocuments = async (empId: string, docForms: DocumentFormState) => {
    await Promise.all(
      DOC_TYPES.map((docType) =>
        requestJson(`/api/renewals/staff/${encodeURIComponent(empId)}/documents`, {
          method: "POST",
          body: JSON.stringify({
            doc_type: docType,
            issued_date: docForms[docType].issued_date || null,
            expiry_date: docForms[docType].expiry_date || null,
            renewal_status: docForms[docType].renewal_status,
            doc_reference: docForms[docType].doc_reference,
            notes: docForms[docType].notes,
          }),
        }),
      ),
    );
  };

  const handleCreateStaff = async () => {
    if (!addStaffForm.emp_id.trim() || !addStaffForm.full_name.trim()) {
      setToast({ kind: "error", text: "Employee ID and full name are required." });
      return;
    }
    setSaving(true);
    try {
      await requestJson("/api/renewals/staff", {
        method: "POST",
        body: JSON.stringify(addStaffForm),
      });
      await saveDocuments(addStaffForm.emp_id.trim(), addDocForms);
      await Promise.all([loadStaff(), loadAlerts()]);
      setAddStaffForm(emptyStaffForm());
      setAddDocForms(emptyDocumentForm());
      setTab("staff");
      setToast({ kind: "success", text: "Staff and documents saved." });
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to save staff." });
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (member: RenewalStaff) => {
    setEditingStaff(member);
    setEditStaffForm(staffFormFromStaff(member));
    setEditDocForms(documentFormsFromStaff(member.documents || []));
  };

  const handleSaveEdit = async () => {
    if (!editingStaff) return;
    setSaving(true);
    try {
      await requestJson(`/api/renewals/staff/${encodeURIComponent(editingStaff.emp_id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: editStaffForm.full_name,
          position: editStaffForm.position,
          branch: editStaffForm.branch,
          nationality: editStaffForm.nationality,
          active_status: editStaffForm.active_status,
          phone_no: editStaffForm.phone_no,
        }),
      });
      await saveDocuments(editingStaff.emp_id, editDocForms);
      await Promise.all([loadStaff(), loadAlerts()]);
      setEditingStaff(null);
      setToast({ kind: "success", text: "Renewal record updated." });
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to update record." });
    } finally {
      setSaving(false);
    }
  };

  const mutateAlertStatus = async (documentId: number, renewalStatus: RenewalStatus) => {
    setStatusSavingId(documentId);
    try {
      await requestJson(`/api/renewals/documents/${documentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ renewal_status: renewalStatus }),
      });
      if (renewalStatus === "RENEWED") {
        setAlerts((prev) => {
          const next = prev.filter((item) => item.document_id !== documentId);
          setRenewalsBadgeCount(next.filter((item) => !isResignedStatus(item.active_status)).length);
          return next;
        });
      } else {
        setAlerts((prev) =>
          prev.map((item) => (item.document_id === documentId ? { ...item, renewal_status: renewalStatus } : item)),
        );
      }
      await loadStaff();
      if (renewalStatus === "RENEWED") {
        setToast({ kind: "success", text: "Document marked as renewed." });
      }
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to update status." });
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleMarkResigned = async (empId: string, fullName: string) => {
    if (!window.confirm(`Mark ${fullName} as Resigned?\n\nAll their alerts will be removed from the Active view.`)) return;
    setResigningId(empId);
    try {
      await requestJson(`/api/renewals/staff/${encodeURIComponent(empId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active_status: "Resigned" }),
      });
      setAlerts((prev) => {
        const next = prev.map((item) => (item.emp_id === empId ? { ...item, active_status: "Resigned" } : item));
        setRenewalsBadgeCount(next.filter((item) => !isResignedStatus(item.active_status)).length);
        return next;
      });
      setStaff((prev) => prev.map((member) => (member.emp_id === empId ? { ...member, active_status: "Resigned" } : member)));
      setToast({ kind: "success", text: `${fullName} marked as Resigned. Their alerts have been removed from Active view.` });
    } catch (error: any) {
      setToast({ kind: "error", text: error?.message || "Failed to update status." });
    } finally {
      setResigningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">Renewals</h1>
          <p className="text-sm text-neutral-400">
            Track visa, ID, passport, labour, insurance, and food-safety renewal deadlines for all staff.
          </p>
        </div>

        <div className="flex gap-6 border-b border-neutral-800">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={[
                  "flex items-center gap-2 border-b-2 px-1 py-3 text-sm transition",
                  active ? "border-amber-500 text-white" : "border-transparent text-neutral-400 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "alerts" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-full border border-red-500 bg-red-900/50 px-3 py-1 text-sm font-semibold text-red-200">
                Expired: {summary.expired}
              </div>
              <div className="rounded-full border border-orange-500 bg-orange-900/50 px-3 py-1 text-sm font-semibold text-orange-200">
                Critical ≤14d: {summary.critical}
              </div>
              <div className="rounded-full border border-amber-500 bg-amber-900/50 px-3 py-1 text-sm font-semibold text-amber-200">
                Warning ≤42d: {summary.warning}
              </div>
            </div>
            <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
              <button
                type="button"
                onClick={() => setAlertStaffFilter("all")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  alertStaffFilter === "all" ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                ].join(" ")}
              >
                All Staff
              </button>
              <button
                type="button"
                onClick={() => setAlertStaffFilter("active")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  alertStaffFilter === "active" ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                ].join(" ")}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setAlertStaffFilter("resigned")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  alertStaffFilter === "resigned" ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                ].join(" ")}
              >
                Resigned
              </button>
            </div>

            <div className="max-h-[calc(100vh-240px)] space-y-5 overflow-y-auto pr-1">
              {alertsLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading alerts...
                </div>
              ) : visibleAlertGroups.length === 0 ? (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
                  No renewal alerts right now.
                </div>
              ) : (
                visibleAlertGroups.map((group) => (
                  <section key={group.key} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-300">
                      <span>{group.full_name}</span>
                      <span className="text-neutral-500">{group.position || "No position"} · {group.branch || "No branch"}</span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isResignedStatus(group.active_status) ? "bg-rose-900/50 text-rose-300" : "bg-emerald-900/50 text-emerald-200",
                        ].join(" ")}
                      >
                        {group.active_status}
                      </span>
                      {!isResignedStatus(group.active_status) ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkResigned(group.emp_id, group.full_name)}
                          disabled={resigningId === group.emp_id}
                          className={[
                            "ml-auto rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                            "border-rose-800/60 bg-rose-950/30 text-rose-300",
                            "hover:bg-rose-900/50 hover:text-rose-100",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          ].join(" ")}
                        >
                          {resigningId === group.emp_id ? "Updating..." : "Mark as Resigned"}
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      {group.items.map((alert) => (
                        (() => {
                          const resignedStaff = isResignedStatus(alert.active_status);
                          return (
                        <div
                          key={alert.document_id}
                          className={[
                            `rounded-2xl border bg-neutral-900 p-4 ${alertBorderClass(alert.alert_level)}`,
                            resignedStaff ? "opacity-50" : "",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alertBadgeClass(alert.alert_level)}`}>
                              {alert.alert_level}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${docTypeBadgeClass(alert.doc_type)}`}>
                              {DOC_LABELS[alert.doc_type]}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-neutral-200">
                            {alert.full_name} · {alert.position || "No position"} · {alert.branch || "No branch"}
                            <span
                              className={[
                                "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold align-middle",
                                isResignedStatus(alert.active_status) ? "bg-rose-900/50 text-rose-300" : "bg-emerald-900/50 text-emerald-200",
                              ].join(" ")}
                            >
                              {alert.active_status}
                            </span>
                          </div>
                          {resignedStaff ? (
                            <div className="mt-2 rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-200">
                              Staff has resigned - no renewal action required
                            </div>
                          ) : null}
                          <div className="mt-2 text-sm text-neutral-400">
                            Expiry: {formatDate(alert.expiry_date)} ({expiryCopy(alert.days_until_expiry)})
                          </div>
                          {!resignedStaff ? (
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-xs text-neutral-400">
                                <span>Status:</span>
                                <div className="relative">
                                  <select
                                    value={alert.renewal_status}
                                    onChange={(event) => void mutateAlertStatus(alert.document_id, event.target.value as RenewalStatus)}
                                    disabled={statusSavingId === alert.document_id}
                                    className="appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 pr-7 text-xs text-neutral-200"
                                  >
                                    {STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3.5 w-3.5 text-neutral-500" />
                                </div>
                              </label>
                              <button
                                type="button"
                                onClick={() => void mutateAlertStatus(alert.document_id, "RENEWED")}
                                disabled={statusSavingId === alert.document_id}
                                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white transition hover:bg-emerald-600 disabled:opacity-60"
                              >
                                {statusSavingId === alert.document_id ? "Saving..." : "Mark as Renewed"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                          );
                        })()
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "staff" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by staff name"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-sm text-neutral-200 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <select
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="">All Branches</option>
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
                <button
                  type="button"
                  onClick={() => setShowAllStaff(false)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    !showAllStaff ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                  ].join(" ")}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllStaff(true)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    showAllStaff ? "bg-violet-700 text-white" : "text-neutral-400 hover:text-white",
                  ].join(" ")}
                >
                  All
                </button>
              </div>
            </div>

            {staffLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading staff...
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleStaff.map((member) => (
                  <div
                    key={member.emp_id}
                    className={[
                      "rounded-2xl border border-neutral-800 bg-neutral-900 p-4",
                      member.active_status === "Resigned" ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{member.full_name}</div>
                        <div className="mt-1 text-sm text-neutral-400">
                          {[member.position, member.branch, member.nationality].filter(Boolean).join(" · ") || "No staff details"}
                        </div>
                      </div>
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          member.active_status === "Active" ? "bg-emerald-900/50 text-emerald-200" : "bg-neutral-800 text-neutral-300",
                        ].join(" ")}
                      >
                        {member.active_status}
                      </span>
                    </div>
                    <div className="my-4 h-px bg-neutral-800" />
                    <div className="flex flex-wrap gap-2">
                      {DOC_TYPES.map((docType) => {
                        const document = (member.documents || []).find((item) => item.doc_type === docType);
                        const pill = document ? statusSummary(document) : { label: "PENDING", className: "bg-neutral-700 text-neutral-300 rounded-full px-1.5 py-0.5 text-[10px] font-bold" };
                        const shortLabel =
                          docType === "LABOUR_CONTRACT" ? "CONTRACT" : docType === "LABOUR_CARD" ? "LABOUR CARD" : docType;
                        return (
                          <div key={docType} className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                            <span>{shortLabel}</span>
                            <span className={pill.className}>{pill.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="my-4 h-px bg-neutral-800" />
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-neutral-400">Alerts: {member.alert_count}</div>
                      <button
                        type="button"
                        onClick={() => openEditModal(member)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition hover:border-neutral-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "add" ? (
          <StaffEditor
            staffForm={addStaffForm}
            setStaffForm={setAddStaffForm}
            docForms={addDocForms}
            setDocForms={setAddDocForms}
            onSubmit={() => void handleCreateStaff()}
            saving={saving}
            submitLabel="Save Staff & Documents"
          />
        ) : null}
      </div>

      {editingStaff ? (
        <div className="fixed inset-0 z-50 bg-black/70 px-4 backdrop-blur">
          <div className="mx-auto mt-20 max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-white">Edit Renewal Record</div>
                <div className="text-sm text-neutral-400">{editingStaff.full_name}</div>
              </div>
              <button type="button" onClick={() => setEditingStaff(null)} className="text-neutral-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <StaffEditor
              staffForm={editStaffForm}
              setStaffForm={setEditStaffForm}
              docForms={editDocForms}
              setDocForms={setEditDocForms}
              onSubmit={() => void handleSaveEdit()}
              saving={saving}
              submitLabel="Save"
              onCancel={() => setEditingStaff(null)}
            lockEmpId
            />
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={[
            "fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm shadow-2xl",
            toast.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
              : "border-red-500/40 bg-red-950/90 text-red-100",
          ].join(" ")}
        >
          <div className="flex items-start gap-2">
            {toast.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
            <span>{toast.text}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
