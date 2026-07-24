"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop, Smartphone, Tablet, Package, AlertTriangle, X } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA_CLASS,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY, T_CAPTION,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

type AssetType = "laptop" | "phone" | "tablet" | "other";

interface Loan {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_type: AssetType;
  brand: string;
  model: string;
  assignee: string;
  loaned_at: string;
  condition_on_loan: string;
}

const ASSET_TYPE_ICONS: Record<string, React.ReactNode> = {
  laptop: <Laptop className="h-5 w-5" />,
  phone: <Smartphone className="h-5 w-5" />,
  tablet: <Tablet className="h-5 w-5" />,
  other: <Package className="h-5 w-5" />,
};

const INCIDENT_TYPES = [
  { value: "damage", label: "Damage (physical damage)" },
  { value: "loss", label: "Loss (cannot find)" },
  { value: "theft", label: "Theft (stolen)" },
];

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({
  loans,
  staffName,
  city,
  auth,
  onClose,
  onSubmitted,
}: {
  loans: Loan[];
  staffName: string;
  city: string;
  auth: ReturnType<typeof getAuth>;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [assetTag, setAssetTag] = useState(loans[0]?.asset_tag ?? "");
  const [incidentType, setIncidentType] = useState("damage");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const selectedLoan = loans.find(l => l.asset_tag === assetTag);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setErr("Please describe the incident."); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/staff/assets/report-incident`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken}` },
        body: JSON.stringify({
          asset_id: selectedLoan?.asset_id ?? null,
          asset_tag: assetTag,
          reported_by: staffName,
          city,
          incident_type: incidentType,
          description: description.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to submit report.");
      }
      onSubmitted();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${GLASS_CARD} relative w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className={T_SECTION}>Report Damage / Loss</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Asset</label>
            <SelectDark
              value={assetTag}
              onChange={setAssetTag}
              options={loans.map(l => ({ value: l.asset_tag, label: `${l.asset_tag} — ${l.brand} ${l.model}` }))}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Incident Type</label>
            <SelectDark
              value={incidentType}
              onChange={setIncidentType}
              options={INCIDENT_TYPES}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Description *</label>
            <textarea
              className={TEXTAREA_CLASS}
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Please describe what happened in detail..."
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} flex-1`}>
              {saving ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyAssetsPage() {
  const router = useRouter();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState("");
  const [city, setCity] = useState("manila");
  const [auth, setAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [showReport, setShowReport] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function init() {
      const raw = getAuth();
      if (!raw?.accessToken) { router.replace("/login"); return; }
      const resolved = await refreshAuthFromApi(raw);
      const a = resolved || raw;
      setAuth(a);
      const name = a?.staffName ?? "";
      const c = String(a?.city || "manila").toLowerCase();
      setStaffName(name);
      setCity(c);
      if (!name) { setLoading(false); return; }
      try {
        const res = await fetch(
          `${API_BASE}/api/staff/assets/my-loans?staff_name=${encodeURIComponent(name)}`,
          { headers: { Authorization: `Bearer ${a.accessToken}` } },
        );
        const d = await res.json();
        setLoans(d.loans ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [router]);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className={`${T_PAGE_TITLE} mb-6`}>My Loaned Assets</h1>

      {loading && <p className={T_CAPTION}>Loading...</p>}

      {!loading && loans.length === 0 && (
        <div className={`${GLASS_CARD} text-center py-10`}>
          <Package className="mx-auto mb-3 h-8 w-8 text-white/20" />
          <p className={T_BODY}>No company assets currently assigned to you.</p>
        </div>
      )}

      {loans.length > 0 && (
        <div className="space-y-3 mb-6">
          {loans.map(loan => (
            <div key={loan.id} className={`${GLASS_CARD} flex items-center gap-4`}>
              <div className="shrink-0 rounded-xl bg-violet-500/15 p-3 text-violet-300">
                {ASSET_TYPE_ICONS[loan.asset_type] ?? <Package className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-violet-300">{loan.asset_tag}</span>
                  <span className="text-xs text-white/40 capitalize">{loan.asset_type}</span>
                </div>
                <p className="text-white font-medium">{loan.brand} {loan.model}</p>
                <p className={T_CAPTION}>Loaned since {loan.loaned_at}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {submitted && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Your incident report has been submitted. Management has been notified.
        </div>
      )}

      {loans.length > 0 && !submitted && (
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 hover:bg-red-500/20 transition"
        >
          <AlertTriangle size={16} />
          Report Damage / Loss / Theft
        </button>
      )}

      {showReport && auth && (
        <ReportModal
          loans={loans}
          staffName={staffName}
          city={city}
          auth={auth}
          onClose={() => setShowReport(false)}
          onSubmitted={() => { setShowReport(false); setSubmitted(true); }}
        />
      )}
    </div>
  );
}
