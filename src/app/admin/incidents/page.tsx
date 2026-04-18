"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ChevronRight, Clock, Filter,
  Loader2, MessageSquare, RefreshCw, TrendingUp,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  SELECT_CLASS, SMALL_BUTTON, T_CAPTION, T_LABEL, T_PAGE_TITLE,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
} from "@/lib/ui-tokens";

const INCIDENT_CATEGORIES = [
  "商品トラブル","顧客トラブル","欠品トラブル","配送トラブル",
  "設備トラブル","天候トラブル","施設トラブル","負傷トラブル","その他",
];

const STATUS_OPTIONS = [
  { value: "",             label: "All" },
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

const SEVERITY_EMOJI: Record<string, string> = {
  low: "🟢", medium: "🟡", high: "🟠", critical: "🔴",
};

type IncidentRow = {
  id: string; city: string; branch: string; reporter_name: string;
  category: string; severity: string; description: string;
  incident_datetime: string; status: string; created_at: string;
  replies?: { id: string }[];
  attachments?: { id: string }[];
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
  const [items, setItems]   = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const fetchList = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterCity)   params.set("city", filterCity);
      if (filterStatus) params.set("status", filterStatus);
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
  }, [filterCity, filterStatus, filterCategory]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const counts = {
    total:       items.length,
    new:         items.filter((i) => i.status === "new").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    resolved:    items.filter((i) => i.status === "resolved").length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle className="h-7 w-7 text-amber-400" />
        <div className="flex-1">
          <h1 className={T_PAGE_TITLE}>Incident Reports</h1>
          <p className={`mt-0.5 ${T_CAPTION}`}>Incident report management</p>
        </div>
        <Link href="/admin/incidents/dashboard"
          className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
          <TrendingUp className="h-3.5 w-3.5" />Dashboard
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}><p className={KPI_LABEL}>Total</p><p className={KPI_VALUE}>{counts.total}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>New</p><p className={`${KPI_VALUE} text-rose-400`}>{counts.new}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>In Progress</p><p className={`${KPI_VALUE} text-violet-400`}>{counts.in_progress}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Resolved</p><p className={`${KPI_VALUE} text-emerald-400`}>{counts.resolved}</p></div>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-4`}>
        <Filter className="h-4 w-4 shrink-0 text-zinc-400" />
        <div className="flex items-center gap-2">
          <label className={T_LABEL}>City</label>
          <select className={`${SELECT_CLASS} w-auto min-w-[120px]`} value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}>
            <option value="">All</option>
            <option value="dubai">Dubai 🇦🇪</option>
            <option value="manila">Manila 🇵🇭</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className={T_LABEL}>Status</label>
          <select className={`${SELECT_CLASS} w-auto min-w-[140px]`} value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className={T_LABEL}>Category</label>
          <select className={`${SELECT_CLASS} w-auto min-w-[150px]`} value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All</option>
            {INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className={`${SMALL_BUTTON} ml-auto flex items-center gap-1.5`}
          onClick={() => fetchList()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Table */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-zinc-500">No incidents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  {["Sev.", "Category", "Branch", "Reporter", "Date", "Status", "Replies", ""].map((h) => (
                    <th key={h} className={`${TABLE_HEADER} px-4 py-3 text-left`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} px-4`}>{SEVERITY_EMOJI[item.severity] ?? "🟡"}</td>
                    <td className={`${TABLE_CELL} px-4 font-medium text-white`}>{item.category}</td>
                    <td className={`${TABLE_CELL} px-4`}>{item.branch}</td>
                    <td className={`${TABLE_CELL} px-4`}>{item.reporter_name}</td>
                    <td className={`${TABLE_CELL} px-4`}>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
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
                      ) : <span className="text-xs text-zinc-600">—</span>}
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
