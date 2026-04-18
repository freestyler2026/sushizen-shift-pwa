"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Lock,
  Loader2,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";

const INCIDENT_CATEGORIES = [
  "Product Issue", "Customer Issue", "Stock Shortage", "Delivery Issue",
  "Equipment Issue", "Weather Issue", "Facility Issue", "Injury", "Other",
];

const STATUS_OPTIONS = [
  { value: "",             label: "All Statuses" },
  { value: "new",          label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress",  label: "In Progress" },
  { value: "resolved",     label: "Resolved" },
];

const STATUS_LABEL: Record<string, string> = {
  new: "New", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved",
};
const STATUS_BADGE: Record<string, string> = {
  new: BADGE_ERROR, acknowledged: BADGE_WARNING, in_progress: BADGE_INFO, resolved: BADGE_SUCCESS,
};
const SEV_DOT: Record<string, string> = {
  low: "bg-emerald-400", medium: "bg-amber-400", high: "bg-orange-400", critical: "bg-red-400",
};

type IncidentRow = {
  id: string; city: string; branch: string; reporter_name: string;
  category: string; severity: string; description: string;
  incident_datetime: string; status: string; created_at: string;
  replies?: { id: string }[];
  attachments?: { id: string }[];
  has_notes?: boolean;
};

function fmtDt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminIncidentsPage() {
  const auth = getAuth();
  const city = String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";

  const [filterCity, setFilterCity]         = useState(city);
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterNotes, setFilterNotes]       = useState("");
  const [items, setItems]     = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const fetchList = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterCity)   params.set("city", filterCity);
      if (filterStatus) params.set("status", filterStatus);
      if (filterNotes)  params.set("has_notes", filterNotes);
      params.set("limit", "200");
      const res = await fetch(`${API_BASE}/api/admin/incidents?${params}`, {
        cache: "no-store", headers: getAuthHeaders(a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      let rows: IncidentRow[] = data.items || [];
      if (filterCategory) rows = rows.filter((r) => r.category === filterCategory);
      setItems(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [filterCity, filterStatus, filterCategory, filterNotes]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const counts = {
    total:       items.length,
    new:         items.filter((i) => i.status === "new").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    resolved:    items.filter((i) => i.status === "resolved").length,
  };

  const KPI_CONFIG = [
    { label: "Total",       value: counts.total,       color: "text-white",       icon: <BarChart3   className="h-4 w-4 text-zinc-500" />,        gradient: "" },
    { label: "New",         value: counts.new,         color: "text-rose-400",    icon: <XCircle     className="h-4 w-4 text-rose-500/50" />,     gradient: "from-rose-500/6" },
    { label: "In Progress", value: counts.in_progress, color: "text-violet-400",  icon: <Clock       className="h-4 w-4 text-violet-500/50" />,   gradient: "from-violet-500/6" },
    { label: "Resolved",    value: counts.resolved,    color: "text-emerald-400", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500/50" />, gradient: "from-emerald-500/6" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Incident Reports</h1>
            <p className={`mt-0.5 ${T_CAPTION}`}>Monitor and manage reports across all branches</p>
          </div>
        </div>
        <Link href="/admin/incidents/dashboard"
          className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
          <TrendingUp className="h-3.5 w-3.5" />Analytics Dashboard
        </Link>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPI_CONFIG.map(({ label, value, color, icon, gradient }) => (
          <div key={label} className={`relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br ${gradient} to-transparent p-4 transition-all hover:border-white/12`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{label}</p>
              {icon}
            </div>
            <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 shrink-0 text-zinc-500" />
          <div className="flex items-center gap-2">
            <label className={T_LABEL}>City</label>
            <select className={`${SELECT_CLASS} w-auto min-w-[120px]`} value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}>
              <option value="">All Cities</option>
              <option value="dubai">Dubai 🇦🇪</option>
              <option value="manila">Manila 🇵🇭</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className={T_LABEL}>Status</label>
            <select className={`${SELECT_CLASS} w-auto min-w-[150px]`} value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className={T_LABEL}>Category</label>
            <select className={`${SELECT_CLASS} w-auto min-w-[150px]`} value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All Categories</option>
              {INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-amber-500/70" />
            <label className={T_LABEL}>Notes</label>
            <select className={`${SELECT_CLASS} w-auto min-w-[130px]`} value={filterNotes}
              onChange={(e) => setFilterNotes(e.target.value)}>
              <option value="">All</option>
              <option value="true">Has HQ Notes</option>
              <option value="false">No Notes</option>
            </select>
          </div>
          <button className={`${SMALL_BUTTON} ml-auto flex items-center gap-1.5`}
            onClick={() => fetchList()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
              <AlertTriangle className="h-6 w-6 text-zinc-600" />
            </div>
            <p className="mt-3 text-sm text-zinc-400">No incidents found</p>
            <p className="mt-1 text-xs text-zinc-600">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {["", "Category", "Branch", "Reporter", "Reported", "Status", "Replies", "Notes", ""].map((h, i) => (
                    <th key={i} className={`${TABLE_HEADER} px-4 py-3 text-left`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={TABLE_ROW}>
                    <td className="w-10 pl-4 py-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${SEV_DOT[item.severity] ?? "bg-zinc-500"}`}
                        title={item.severity}
                      />
                    </td>
                    <td className={`${TABLE_CELL} px-4 font-medium text-white`}>{item.category}</td>
                    <td className={`${TABLE_CELL} px-4 text-zinc-400`}>{item.branch}</td>
                    <td className={`${TABLE_CELL} px-4 text-zinc-400`}>{item.reporter_name}</td>
                    <td className={`${TABLE_CELL} px-4`}>
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="h-3 w-3" />{fmtDt(item.created_at)}
                      </span>
                    </td>
                    <td className={`${TABLE_CELL} px-4`}>
                      <span className={STATUS_BADGE[item.status] ?? BADGE_INFO}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className={`${TABLE_CELL} px-4`}>
                      {(item.replies?.length ?? 0) > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-violet-300">
                          <MessageSquare className="h-3.5 w-3.5" />{item.replies!.length}
                        </span>
                      ) : <span className="text-xs text-zinc-700">—</span>}
                    </td>
                    <td className={`${TABLE_CELL} px-4`}>
                      {item.has_notes ? (
                        <span title="Has HQ internal notes" className="flex items-center gap-1 text-xs text-amber-400">
                          <Lock className="h-3.5 w-3.5" />
                        </span>
                      ) : <span className="text-xs text-zinc-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/incidents/${item.id}`}
                        className={`${SMALL_BUTTON} inline-flex items-center gap-1`}>
                        View<ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
