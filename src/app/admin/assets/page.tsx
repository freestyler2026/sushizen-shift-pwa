"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, RefreshCw, X, Laptop, Smartphone, Tablet, Package,
  AlertTriangle, CheckCircle2, ArrowLeftRight, ChevronDown, ChevronRight,
  Camera, ClipboardCheck, Wrench, FileText, Star,
} from "lucide-react";
import { getAuth, refreshAuthFromApi, hasRouteAccess } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  INPUT_CLASS, TEXTAREA_CLASS, TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY, T_CAPTION,
  BADGE_SUCCESS, BADGE_ERROR, BADGE_INFO, BADGE_WARNING,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"];

// ─── Types ───────────────────────────────────────────────────────────────────

type AssetType = "laptop" | "phone" | "tablet" | "other";
type AssetStatus = "active" | "retired";
type AssigneeType = "staff" | "location";
type Condition = "good" | "damaged" | "missing";

interface Asset {
  id: number;
  asset_tag: string;
  asset_type: AssetType;
  brand: string;
  model: string;
  serial_number: string;
  city: string;
  status: AssetStatus;
  notes: string;
  issued_to: string;
  issued_date: string | null;
  on_loan: boolean;
  current_assignee: string | null;
  current_assignee_type: AssigneeType | null;
  loaned_at: string | null;
  loan_id: number | null;
  open_incident_count: number;
}

interface Loan {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_type: string;
  brand: string;
  model: string;
  assignee: string;
  assignee_type: AssigneeType;
  loaned_at: string;
  condition_on_loan: string;
  returned_at: string | null;
  condition_on_return: string | null;
  return_notes: string;
  returned_by: string;
}

interface Incident {
  id: string;
  asset_tag: string;
  brand: string;
  model: string;
  reported_by: string;
  city: string;
  incident_type: string;
  description: string;
  status: string;
  created_at: string;
}

interface MaintenanceLog {
  id: number;
  asset_id: number;
  event_type: string;
  notes: string;
  performed_by: string;
  performed_at: string | null;
  photo_data: string;
  created_at: string | null;
}

interface KPIs { total: number; on_loan: number; available: number; open_incidents: number; }

const ASSET_TYPE_ICONS: Record<AssetType, React.ReactNode> = {
  laptop: <Laptop className="h-4 w-4" />,
  phone: <Smartphone className="h-4 w-4" />,
  tablet: <Tablet className="h-4 w-4" />,
  other: <Package className="h-4 w-4" />,
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  laptop: "Laptop 💻",
  phone: "Phone 📱",
  tablet: "Tablet 🖥",
  other: "Other 📦",
};

const CONDITION_OPTIONS = ["good", "damaged", "missing"];
const CONDITION_LABELS: Record<string, string> = { good: "Good", damaged: "Damaged", missing: "Missing" };

function conditionBadge(c: string | null) {
  if (!c) return null;
  const cls = c === "good" ? BADGE_SUCCESS : c === "damaged" ? BADGE_WARNING : BADGE_ERROR;
  return <span className={cls}>{CONDITION_LABELS[c] ?? c}</span>;
}

// ─── Add Asset Modal ──────────────────────────────────────────────────────────

function AddAssetModal({
  auth, city, onClose, onCreated,
}: {
  auth: ReturnType<typeof getAuth>;
  city: string;
  onClose: () => void;
  onCreated: (a: Asset) => void;
}) {
  const [form, setForm] = useState({
    asset_tag: "", asset_type: "laptop", brand: "", model: "",
    serial_number: "", notes: "", city, issued_to: "", issued_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.asset_tag.trim()) { setErr("Asset Tag is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onCreated(data.asset);
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className={T_SECTION}>Register Asset</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Asset Tag *</label>
              <input className={INPUT_CLASS} value={form.asset_tag} onChange={e => set("asset_tag", e.target.value)} placeholder="LAP-001" />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Type</label>
              <SelectDark value={form.asset_type} onChange={v => set("asset_type", v)} options={Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Brand</label>
              <input className={INPUT_CLASS} value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Dell" />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Model</label>
              <input className={INPUT_CLASS} value={form.model} onChange={e => set("model", e.target.value)} placeholder="XPS 13" />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Serial Number</label>
            <input className={INPUT_CLASS} value={form.serial_number} onChange={e => set("serial_number", e.target.value)} placeholder="SN-XXXXXX" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>City</label>
            <SelectDark value={form.city} onChange={v => set("city", v)} options={[{ value: "manila", label: "Manila" }, { value: "dubai", label: "Dubai" }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Issued To</label>
              <input className={INPUT_CLASS} value={form.issued_to} onChange={e => set("issued_to", e.target.value)} placeholder="Person name" />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Issued Date</label>
              <input type="date" className={INPUT_CLASS} value={form.issued_date} onChange={e => set("issued_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Notes</label>
            <textarea className={TEXTAREA_CLASS} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes..." />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} flex-1`}>{saving ? "Saving..." : "Register"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Asset Modal ─────────────────────────────────────────────────────────

function EditAssetModal({
  asset, auth, onClose, onUpdated,
}: {
  asset: Asset;
  auth: ReturnType<typeof getAuth>;
  onClose: () => void;
  onUpdated: (a: Asset) => void;
}) {
  const [form, setForm] = useState({
    asset_type: asset.asset_type,
    brand: asset.brand,
    model: asset.model,
    serial_number: asset.serial_number,
    status: asset.status,
    notes: asset.notes,
    issued_to: asset.issued_to ?? "",
    issued_date: asset.issued_date ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onUpdated(data.asset);
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className={T_SECTION}>Edit — {asset.asset_tag}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Type</label>
              <SelectDark value={form.asset_type} onChange={v => set("asset_type", v)} options={Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Status</label>
              <SelectDark value={form.status} onChange={v => set("status", v)} options={[{ value: "active", label: "Active" }, { value: "retired", label: "Retired" }]} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Brand</label>
              <input className={INPUT_CLASS} value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Dell" />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Model</label>
              <input className={INPUT_CLASS} value={form.model} onChange={e => set("model", e.target.value)} placeholder="XPS 13" />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Serial Number</label>
            <input className={INPUT_CLASS} value={form.serial_number} onChange={e => set("serial_number", e.target.value)} placeholder="SN-XXXXXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Issued To</label>
              <input className={INPUT_CLASS} value={form.issued_to} onChange={e => set("issued_to", e.target.value)} placeholder="Person name" />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Issued Date</label>
              <input type="date" className={INPUT_CLASS} value={form.issued_date} onChange={e => set("issued_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Notes</label>
            <textarea className={TEXTAREA_CLASS} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes..." />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} flex-1`}>{saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Loan Modal ───────────────────────────────────────────────────────────────

function LoanModal({
  asset, auth, staffList, onClose, onLoaned,
}: {
  asset: Asset;
  auth: ReturnType<typeof getAuth>;
  staffList: string[];
  onClose: () => void;
  onLoaned: (a: Asset) => void;
}) {
  const [assigneeType, setAssigneeType] = useState<AssigneeType>("staff");
  const [assignee, setAssignee] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [loanedAt, setLoanedAt] = useState(new Date().toISOString().slice(0, 10));
  const [condition, setCondition] = useState("good");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const effectiveAssignee = assigneeType === "staff" ? assignee : locationInput;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveAssignee.trim()) { setErr("Please select or enter an assignee."); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets/${asset.id}/loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
        body: JSON.stringify({ assignee: effectiveAssignee.trim(), assignee_type: assigneeType, loaned_at: loanedAt, condition_on_loan: condition }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      // Reload asset with updated loan info
      const res2 = await fetch(`${API_BASE}/api/admin/assets?q=${encodeURIComponent(asset.asset_tag)}`, { headers: { Authorization: `Bearer ${auth?.accessToken}` } });
      const d2 = await res2.json();
      const updated = (d2.assets as Asset[])?.find(a => a.id === asset.id) ?? asset;
      onLoaned(updated);
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={T_SECTION}>Loan — {asset.asset_tag}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <p className={`${T_BODY} mb-4`}>{asset.brand} {asset.model}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Assign To</label>
            <div className="flex gap-2 mb-2">
              {(["staff", "location"] as AssigneeType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setAssigneeType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${assigneeType === t ? "bg-violet-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                >{t === "staff" ? "Staff Member" : "Location (e.g. Kitchen)"}</button>
              ))}
            </div>
            {assigneeType === "staff"
              ? <SelectDark value={assignee} onChange={setAssignee} options={staffList} placeholder="Select staff..." />
              : <input className={INPUT_CLASS} value={locationInput} onChange={e => setLocationInput(e.target.value)} placeholder="e.g. PAR Kitchen" />
            }
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Loan Date</label>
              <input type="date" className={INPUT_CLASS} value={loanedAt} onChange={e => setLoanedAt(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Condition</label>
              <SelectDark value={condition} onChange={setCondition} options={CONDITION_OPTIONS.map(c => ({ value: c, label: CONDITION_LABELS[c] }))} />
            </div>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} flex-1`}>{saving ? "Saving..." : "Loan Asset"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Return Modal ─────────────────────────────────────────────────────────────

function ReturnModal({
  asset, auth, onClose, onReturned,
}: {
  asset: Asset;
  auth: ReturnType<typeof getAuth>;
  onClose: () => void;
  onReturned: (a: Asset) => void;
}) {
  const [condition, setCondition] = useState("good");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnedAt, setReturnedAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset.loan_id) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets/loans/${asset.loan_id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
        body: JSON.stringify({ condition_on_return: condition, return_notes: returnNotes, returned_by: auth?.staffName ?? "", returned_at: returnedAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      const res2 = await fetch(`${API_BASE}/api/admin/assets?q=${encodeURIComponent(asset.asset_tag)}`, { headers: { Authorization: `Bearer ${auth?.accessToken}` } });
      const d2 = await res2.json();
      const updated = (d2.assets as Asset[])?.find(a => a.id === asset.id) ?? asset;
      onReturned(updated);
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={T_SECTION}>Return — {asset.asset_tag}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <p className={`${T_BODY} mb-1`}>{asset.brand} {asset.model}</p>
        <p className={`${T_CAPTION} mb-4`}>Loaned to: <span className="text-white">{asset.current_assignee}</span> since {asset.loaned_at}</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Return Date</label>
              <input type="date" className={INPUT_CLASS} value={returnedAt} onChange={e => setReturnedAt(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Condition</label>
              <SelectDark value={condition} onChange={setCondition} options={CONDITION_OPTIONS.map(c => ({ value: c, label: CONDITION_LABELS[c] }))} />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Notes</label>
            <textarea className={TEXTAREA_CLASS} rows={2} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="e.g. Screen cracked, charger missing..." />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} flex-1`}>{saving ? "Saving..." : "Confirm Return"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Loan History Row ─────────────────────────────────────────────────────────

function LoanHistoryPanel({ asset, auth }: { asset: Asset; auth: ReturnType<typeof getAuth> }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/assets/${asset.id}/loans`, { headers: { Authorization: `Bearer ${auth?.accessToken}` } })
      .then(r => r.json())
      .then(d => setLoans(d.loans ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  // auth?.accessToken is a primitive string — stable even when auth object reference changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, auth?.accessToken]);

  if (loading) return <p className={`${T_CAPTION} py-2`}>Loading history...</p>;
  if (loans.length === 0) return <p className={`${T_CAPTION} py-2`}>No loan history.</p>;

  return (
    <div className="mt-2 space-y-1">
      {loans.map(l => (
        <div key={l.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
          <span className="w-24 shrink-0 text-white/60">{l.loaned_at}</span>
          <span className="flex-1 font-medium text-white">{l.assignee}</span>
          <span className="text-white/60">{l.returned_at ? `→ ${l.returned_at}` : "On Loan"}</span>
          {l.returned_at && conditionBadge(l.condition_on_return)}
          {l.return_notes && <span className="max-w-[120px] truncate text-white/40">{l.return_notes}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Lifecycle Panel ─────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  condition_check: { label: "Condition Check", icon: <ClipboardCheck size={13} />, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  cleaning:        { label: "Cleaning",         icon: <Star size={13} />,          color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  repair:          { label: "Repair",            icon: <Wrench size={13} />,        color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  ready:           { label: "Ready for Loan",    icon: <CheckCircle2 size={13} />,  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  photo:           { label: "Photo",             icon: <Camera size={13} />,        color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  note:            { label: "Note",              icon: <FileText size={13} />,      color: "text-white/60 bg-white/5 border-white/10" },
};

const EVENT_OPTIONS = [
  { value: "condition_check", label: "Condition Check" },
  { value: "cleaning",        label: "Cleaning Complete" },
  { value: "repair",          label: "Repair / Part Replacement" },
  { value: "ready",           label: "Ready for Next Loan" },
  { value: "photo",           label: "Photo Record" },
  { value: "note",            label: "Note" },
];

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type TLEvent =
  | { kind: "loan";  date: string; label: string; sub: string; color: string }
  | { kind: "log";   date: string; log: MaintenanceLog };

function buildTimeline(loans: Loan[], logs: MaintenanceLog[]): TLEvent[] {
  const events: TLEvent[] = [];
  for (const l of loans) {
    events.push({
      kind: "loan", date: l.loaned_at,
      label: `Loaned → ${l.assignee}`,
      sub: `Condition: ${l.condition_on_loan}`,
      color: "text-indigo-400",
    });
    if (l.returned_at) {
      events.push({
        kind: "loan", date: l.returned_at,
        label: `Returned by ${l.assignee}`,
        sub: `Condition: ${l.condition_on_return ?? "—"}${l.return_notes ? " · " + l.return_notes : ""}`,
        color: "text-white/50",
      });
    }
  }
  for (const log of logs) {
    events.push({ kind: "log", date: log.performed_at ?? "", log });
  }
  return events.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

function LifecyclePanel({ asset, auth }: { asset: Asset; auth: ReturnType<typeof getAuth> }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    event_type: "condition_check",
    notes: "",
    performed_by: auth?.staffName ?? "",
    performed_at: new Date().toISOString().slice(0, 10),
    photo_data: "",
  });
  const [photoName, setPhotoName] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const headers = { Authorization: `Bearer ${auth?.accessToken}` };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/admin/assets/${asset.id}/loans`, { headers }).then(r => r.json()),
      fetch(`${API_BASE}/api/admin/assets/${asset.id}/maintenance-logs`, { headers }).then(r => r.json()),
    ])
      .then(([ld, md]) => {
        setLoans(ld.loans ?? []);
        setLogs(md.logs ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, auth?.accessToken]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const data = await compressImage(file);
      setF("photo_data", data);
      setPhotoName(file.name);
    } finally {
      setCompressing(false);
    }
  }

  async function submit() {
    if (!form.performed_at) { setErr("Date is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets/${asset.id}/maintenance-logs`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "Failed");
      setShowForm(false);
      setForm({ event_type: "condition_check", notes: "", performed_by: auth?.staffName ?? "", performed_at: new Date().toISOString().slice(0, 10), photo_data: "" });
      setPhotoName("");
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className={`${T_CAPTION} py-2`}>Loading...</p>;

  const timeline = buildTimeline(loans, logs);

  return (
    <div className="mt-1">
      {/* Add Log button */}
      <div className="flex justify-end mb-2">
        {!showForm && (
          <button className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200" onClick={() => setShowForm(true)}>
            <Plus size={12} />Add Log
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Event type</label>
              <SelectDark value={form.event_type} onChange={v => setF("event_type", v)} options={EVENT_OPTIONS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Date</label>
              <input type="date" className={INPUT_CLASS} value={form.performed_at} onChange={e => setF("performed_at", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Performed by</label>
            <input className={INPUT_CLASS} value={form.performed_by} onChange={e => setF("performed_by", e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Notes</label>
            <textarea className={TEXTAREA_CLASS} rows={2} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Details…" />
          </div>
          {/* Photo upload */}
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Photo (optional)</label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-indigo-300 hover:text-indigo-200">
              <Camera size={13} />
              {compressing ? "Compressing…" : photoName || "Upload photo"}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
            {form.photo_data && (
              <div className="mt-1 relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.photo_data} alt="preview" className="h-16 w-auto rounded-lg object-cover" />
                <button className="absolute -top-1 -right-1 bg-rose-500 rounded-full p-0.5 text-white" onClick={() => { setF("photo_data", ""); setPhotoName(""); }}><X size={10} /></button>
              </div>
            )}
          </div>
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button className={SECONDARY_BUTTON} onClick={() => { setShowForm(false); setErr(""); }}>Cancel</button>
            <button className={PRIMARY_BUTTON} onClick={submit} disabled={saving || compressing}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length === 0 && <p className={`${T_CAPTION} py-2`}>No records yet.</p>}
      <div className="space-y-1">
        {timeline.map((ev, i) => {
          if (ev.kind === "loan") {
            return (
              <div key={`loan-${i}`} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                <ArrowLeftRight size={12} className={`mt-0.5 shrink-0 ${ev.color}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${ev.color}`}>{ev.label}</span>
                  {ev.sub && <span className="text-white/40 ml-2">{ev.sub}</span>}
                </div>
                <span className="text-white/30 shrink-0">{ev.date}</span>
              </div>
            );
          }
          const log = ev.log;
          const meta = EVENT_META[log.event_type] ?? EVENT_META.note;
          return (
            <div key={`log-${log.id}`} className={`rounded-lg border px-3 py-2 text-xs ${meta.color}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{meta.label}</span>
                  {log.performed_by && <span className="text-white/40 ml-2">by {log.performed_by}</span>}
                  {log.notes && <p className="text-white/70 mt-0.5 whitespace-pre-wrap">{log.notes}</p>}
                  {log.photo_data && (
                    <a href={log.photo_data} target="_blank" rel="noreferrer" className="mt-1 block w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photo_data} alt="log photo" className="h-20 w-auto rounded-lg object-cover hover:opacity-80 transition-opacity" />
                    </a>
                  )}
                </div>
                <span className="text-white/30 shrink-0">{log.performed_at}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Asset Row ────────────────────────────────────────────────────────────────

function AssetRow({
  asset, auth, staffList, onUpdated, onDeleted,
}: {
  asset: Asset;
  auth: ReturnType<typeof getAuth>;
  staffList: string[];
  onUpdated: (a: Asset) => void;
  onDeleted: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "lifecycle">("lifecycle");
  const [showLoan, setShowLoan] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/assets/${asset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth?.accessToken}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      onDeleted(asset.id);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); setConfirmDelete(false); }
  }

  return (
    <>
      <tr className={`border-b border-white/5 transition hover:bg-white/3 ${asset.status === "retired" ? "opacity-50" : ""}`}>
        <td className="py-3 pl-4 pr-2">
          <button onClick={() => setExpanded(p => !p)} className="text-white/40 hover:text-white">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            <span className="text-white/50">{ASSET_TYPE_ICONS[asset.asset_type]}</span>
            <span className="font-mono text-sm font-semibold text-violet-300">{asset.asset_tag}</span>
          </div>
        </td>
        <td className="py-3 pr-3 text-sm text-white/70 capitalize">{ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}</td>
        <td className="py-3 pr-3 text-sm text-white">{asset.brand} {asset.model}</td>
        <td className="py-3 pr-3 font-mono text-xs text-white/40">{asset.serial_number || "—"}</td>
        <td className="py-3 pr-3 text-xs capitalize text-white/60">{asset.city}</td>
        <td className="py-3 pr-3 text-xs text-white/70 max-w-[120px] truncate" title={asset.issued_to || undefined}>{asset.issued_to || <span className="text-white/20">—</span>}</td>
        <td className="py-3 pr-3">
          {asset.on_loan
            ? <div>
                <p className="text-sm text-white">{asset.current_assignee}</p>
                <p className="text-xs text-white/40">since {asset.loaned_at}</p>
              </div>
            : <span className="text-xs text-emerald-400">Available</span>
          }
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2 flex-wrap">
            {asset.open_incident_count > 0 && (
              <span className={BADGE_ERROR}>{asset.open_incident_count} incident{asset.open_incident_count > 1 ? "s" : ""}</span>
            )}
            {asset.status === "active" && (
              asset.on_loan
                ? <button onClick={() => setShowReturn(true)} className={`${SMALL_BUTTON} flex items-center gap-1`}><ArrowLeftRight size={12} />Return</button>
                : <button onClick={() => setShowLoan(true)} className={`${SMALL_BUTTON} flex items-center gap-1`}><Plus size={12} />Loan</button>
            )}
            <button onClick={() => setShowEdit(true)} className={`${SMALL_BUTTON} flex items-center gap-1`} title="Edit asset">
              <FileText size={12} />Edit
            </button>
            {!confirmDelete
              ? <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20 transition" title="Delete asset">
                  <X size={12} />Delete
                </button>
              : <span className="flex items-center gap-1 text-xs text-rose-300">
                  Sure?
                  <button onClick={handleDelete} disabled={deleting} className="rounded px-1.5 py-0.5 bg-rose-500 text-white hover:bg-rose-600 transition">{deleting ? "…" : "Yes"}</button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded px-1.5 py-0.5 bg-white/10 text-white/60 hover:bg-white/20 transition">No</button>
                </span>
            }
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-white/5 bg-white/2">
          <td colSpan={9} className="px-4 py-3">
            {/* Tabs */}
            <div className="flex gap-1 mb-3">
              <button
                className={`text-xs px-3 py-1 rounded-full transition ${activeTab === "lifecycle" ? "bg-indigo-500/30 text-indigo-200" : "text-white/40 hover:text-white/70"}`}
                onClick={() => setActiveTab("lifecycle")}
              >
                Lifecycle Log
              </button>
              <button
                className={`text-xs px-3 py-1 rounded-full transition ${activeTab === "history" ? "bg-indigo-500/30 text-indigo-200" : "text-white/40 hover:text-white/70"}`}
                onClick={() => setActiveTab("history")}
              >
                Loan History
              </button>
            </div>
            {activeTab === "lifecycle" && <LifecyclePanel asset={asset} auth={auth} />}
            {activeTab === "history" && (
              <>
                <LoanHistoryPanel asset={asset} auth={auth} />
                {asset.issued_to && <p className={`${T_CAPTION} mt-2`}>Issued to: <span className="text-white">{asset.issued_to}</span>{asset.issued_date ? ` on ${asset.issued_date}` : ""}</p>}
                {asset.notes && <p className={`${T_CAPTION} mt-1`}>Notes: {asset.notes}</p>}
              </>
            )}
          </td>
        </tr>
      )}
      {showLoan && <LoanModal asset={asset} auth={auth} staffList={staffList} onClose={() => setShowLoan(false)} onLoaned={a => { onUpdated(a); setShowLoan(false); }} />}
      {showReturn && <ReturnModal asset={asset} auth={auth} onClose={() => setShowReturn(false)} onReturned={a => { onUpdated(a); setShowReturn(false); }} />}
      {showEdit && <EditAssetModal asset={asset} auth={auth} onClose={() => setShowEdit(false)} onUpdated={a => { onUpdated(a); setShowEdit(false); }} />}
    </>
  );
}

// ─── Incidents Panel ──────────────────────────────────────────────────────────

function IncidentsPanel({ auth, city }: { auth: ReturnType<typeof getAuth>; city: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/admin/assets/incidents?city=${city}&status=open`, { headers: { Authorization: `Bearer ${auth?.accessToken}` } })
      .then(r => r.json())
      .then(d => setIncidents(d.incidents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accessToken, city]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    await fetch(`${API_BASE}/api/admin/assets/incidents/${id}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
      body: JSON.stringify({ resolved_by: auth?.staffName ?? "" }),
    });
    load();
  }

  if (loading) return <p className={`${T_CAPTION} py-4`}>Loading...</p>;
  if (incidents.length === 0) return (
    <div className="flex items-center gap-2 py-6 text-emerald-400">
      <CheckCircle2 size={16} />
      <span className="text-sm">No open incidents.</span>
    </div>
  );

  const TYPE_LABELS: Record<string, string> = { damage: "Damage", loss: "Loss", theft: "Theft" };

  return (
    <div className="space-y-2 mt-2">
      {incidents.map(inc => (
        <div key={inc.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-red-400" />
                <span className={BADGE_ERROR}>{TYPE_LABELS[inc.incident_type] ?? inc.incident_type}</span>
                <span className="font-mono text-xs text-violet-300">{inc.asset_tag}</span>
                {(inc.brand || inc.model) && <span className="text-xs text-white/40">{inc.brand} {inc.model}</span>}
              </div>
              <p className="text-sm text-white">{inc.description}</p>
              <p className={`${T_CAPTION} mt-1`}>Reported by {inc.reported_by} · {new Date(inc.created_at).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => resolve(inc.id)}
              className={`${SMALL_BUTTON} shrink-0 flex items-center gap-1`}
            >
              <CheckCircle2 size={12} />Resolve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const router = useRouter();
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState("manila");
  const [tab, setTab] = useState<"assets" | "incidents">("assets");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ total: 0, on_loan: 0, available: 0, open_incidents: 0 });
  const [staffList, setStaffList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function init() {
      const raw = auth;
      if (!raw?.hasSession && !raw?.accessToken) { router.replace("/login"); return; }
      const resolved = await refreshAuthFromApi(raw);
      const a = resolved || raw;
      const role = String(a?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role) && !hasRouteAccess("/admin/assets", auth)) return;
      setAllowed(true);
      setCity(String(a?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAssets = useCallback(async () => {
    if (!auth?.hasSession && !auth?.accessToken) return;
    setLoading(true); setErr("");
    const token = auth.accessToken;
    try {
      const params = new URLSearchParams({ city });
      if (typeFilter) params.set("asset_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      const [aRes, kRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/assets?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/admin/assets/summary?city=${city}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [aData, kData] = await Promise.all([aRes.json(), kRes.json()]);
      setAssets(aData.assets ?? []);
      setKpis({ total: kData.total ?? 0, on_loan: kData.on_loan ?? 0, available: kData.available ?? 0, open_incidents: kData.open_incidents ?? 0 });
    } catch { setErr("Failed to load assets."); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accessToken, city, typeFilter, statusFilter, q]);

  useEffect(() => {
    if (allowed) void loadAssets();
  }, [allowed, loadAssets]);

  useEffect(() => {
    if (!auth?.hasSession && !auth?.accessToken) return;
    const token = auth.accessToken;
    fetch(`${API_BASE}/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStaffList(d.names ?? []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accessToken, city]);

  if (!allowed) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-white/40">Loading...</p>
    </div>
  );

  const KPI_CARD = "rounded-2xl border border-white/8 bg-white/4 p-4";

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>Company Assets</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadAssets} disabled={loading} className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Register Asset
          </button>
        </div>
      </div>

      {/* City toggle */}
      <div className={`${TAB_CONTAINER} mb-5`}>
        {(["manila", "dubai"] as const).map(c => (
          <button key={c} onClick={() => setCity(c)} className={city === c ? TAB_ACTIVE : TAB_INACTIVE}>
            {c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <p className={T_CAPTION}>Total Assets</p>
          <p className="mt-1 text-2xl font-bold text-white">{kpis.total}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={T_CAPTION}>On Loan</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{kpis.on_loan}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={T_CAPTION}>Available</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{kpis.available}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={T_CAPTION}>Open Incidents</p>
          <p className={`mt-1 text-2xl font-bold ${kpis.open_incidents > 0 ? "text-red-400" : "text-white/40"}`}>{kpis.open_incidents}</p>
        </div>
      </div>

      {/* Tab: Assets / Incidents */}
      <div className={`${TAB_CONTAINER} mb-5`}>
        <button onClick={() => setTab("assets")} className={tab === "assets" ? TAB_ACTIVE : TAB_INACTIVE}>Asset List</button>
        <button onClick={() => setTab("incidents")} className={tab === "incidents" ? TAB_ACTIVE : TAB_INACTIVE}>
          Incidents {kpis.open_incidents > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{kpis.open_incidents}</span>}
        </button>
      </div>

      {tab === "incidents" ? (
        <div className={GLASS_CARD}>
          <p className={T_SECTION}>Open Incident Reports</p>
          <IncidentsPanel auth={auth} city={city} />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50"
              placeholder="Search tag, model, serial..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ minWidth: "220px" }}
            />
            <SelectDark
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "", label: "All Types" }, ...Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
            />
            <SelectDark
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "active", label: "Active" }, { value: "retired", label: "Retired" }, { value: "", label: "All" }]}
            />
          </div>

          {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

          {/* Asset Table */}
          <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
                  <th className="py-3 pl-4 pr-2 w-8"></th>
                  <th className="py-3 pr-3">Tag</th>
                  <th className="py-3 pr-3">Type</th>
                  <th className="py-3 pr-3">Brand / Model</th>
                  <th className="py-3 pr-3">Serial</th>
                  <th className="py-3 pr-3">City</th>
                  <th className="py-3 pr-3">Issued To</th>
                  <th className="py-3 pr-3">Assignee</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="py-8 text-center text-white/30">Loading...</td></tr>
                )}
                {!loading && assets.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-white/30">No assets found. Click &ldquo;Register Asset&rdquo; to add one.</td></tr>
                )}
                {assets.map(asset => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    auth={auth}
                    staffList={staffList}
                    onUpdated={updated => setAssets(prev => prev.map(a => a.id === updated.id ? updated : a))}
                    onDeleted={id => setAssets(prev => prev.filter(a => a.id !== id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd && <AddAssetModal auth={auth} city={city} onClose={() => setShowAdd(false)} onCreated={a => { setAssets(p => [a, ...p]); setShowAdd(false); }} />}
    </div>
  );
}
