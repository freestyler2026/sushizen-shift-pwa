"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, RefreshCw, X, Laptop, Smartphone, Tablet, Package,
  AlertTriangle, CheckCircle2, ArrowLeftRight, ChevronDown, ChevronRight,
} from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
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
    serial_number: "", notes: "", city,
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
  }, [asset.id, auth]);

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

// ─── Asset Row ────────────────────────────────────────────────────────────────

function AssetRow({
  asset, auth, staffList, onUpdated,
}: {
  asset: Asset;
  auth: ReturnType<typeof getAuth>;
  staffList: string[];
  onUpdated: (a: Asset) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

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
          <div className="flex items-center gap-2">
            {asset.open_incident_count > 0 && (
              <span className={BADGE_ERROR}>{asset.open_incident_count} incident{asset.open_incident_count > 1 ? "s" : ""}</span>
            )}
            {asset.status === "active" && (
              asset.on_loan
                ? <button onClick={() => setShowReturn(true)} className={`${SMALL_BUTTON} flex items-center gap-1`}><ArrowLeftRight size={12} />Return</button>
                : <button onClick={() => setShowLoan(true)} className={`${SMALL_BUTTON} flex items-center gap-1`}><Plus size={12} />Loan</button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-white/5 bg-white/2">
          <td colSpan={8} className="px-8 py-3">
            <p className={`${T_CAPTION} mb-1`}>Loan History</p>
            <LoanHistoryPanel asset={asset} auth={auth} />
            {asset.notes && <p className={`${T_CAPTION} mt-2`}>Notes: {asset.notes}</p>}
          </td>
        </tr>
      )}
      {showLoan && <LoanModal asset={asset} auth={auth} staffList={staffList} onClose={() => setShowLoan(false)} onLoaned={a => { onUpdated(a); setShowLoan(false); }} />}
      {showReturn && <ReturnModal asset={asset} auth={auth} onClose={() => setShowReturn(false)} onReturned={a => { onUpdated(a); setShowReturn(false); }} />}
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
  }, [auth, city]);

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
      if (!raw?.accessToken) { router.replace("/login"); return; }
      const resolved = await refreshAuthFromApi(raw);
      const a = resolved || raw;
      const role = String(a?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role)) return;
      setAllowed(true);
      setCity(String(a?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAssets = useCallback(async () => {
    if (!auth?.accessToken) return;
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams({ city });
      if (typeFilter) params.set("asset_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      const [aRes, kRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/assets?${params}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }),
        fetch(`${API_BASE}/api/admin/assets/summary?city=${city}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }),
      ]);
      const [aData, kData] = await Promise.all([aRes.json(), kRes.json()]);
      setAssets(aData.assets ?? []);
      setKpis({ total: kData.total ?? 0, on_loan: kData.on_loan ?? 0, available: kData.available ?? 0, open_incidents: kData.open_incidents ?? 0 });
    } catch { setErr("Failed to load assets."); }
    finally { setLoading(false); }
  }, [auth, city, typeFilter, statusFilter, q]);

  useEffect(() => {
    if (allowed) void loadAssets();
  }, [allowed, loadAssets]);

  useEffect(() => {
    if (!auth?.accessToken) return;
    fetch(`${API_BASE}/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
      .then(r => r.json())
      .then(d => setStaffList(d.names ?? []))
      .catch(() => {});
  }, [auth, city]);

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
                  <th className="py-3 pr-3">Assignee</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="py-8 text-center text-white/30">Loading...</td></tr>
                )}
                {!loading && assets.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-white/30">No assets found. Click "Register Asset" to add one.</td></tr>
                )}
                {assets.map(asset => (
                  <AssetRow key={asset.id} asset={asset} auth={auth} staffList={staffList} onUpdated={updated => setAssets(prev => prev.map(a => a.id === updated.id ? updated : a))} />
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
