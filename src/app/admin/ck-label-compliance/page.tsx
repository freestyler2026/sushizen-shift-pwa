"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, RefreshCw, AlertTriangle, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, SELECT_CLASS, INPUT_CLASS, SECONDARY_BUTTON,
  T_PAGE_TITLE, T_LABEL, T_CAPTION,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const ALLOWED = ["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANILA_MANAGER"];
const BRANCHES = [
  { code: "", label: "All branches" },
  { code: "Paranaque", label: "Paranaque" },
  { code: "Cubao", label: "Cubao" },
  { code: "Taft", label: "Taft" },
];

type Item = {
  delivery_id: number; delivery_date: string; to_branch: string; status: string;
  dispatched_by: string; confirmed_by: string;
  item_id: number; item_name: string; category: string; qty: number; unit: string;
  production_date: string | null; expiry_date: string | null;
  label_photo_url: string; label_ok: boolean | null; label_issue: string; is_expired: boolean;
};
type Summary = {
  total_items: number; with_production_date: number; with_expiry: number;
  with_photo: number; fully_labeled: number; expired: number; flagged: number;
};

function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso() { return isoDaysAgo(0); }
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function CKLabelCompliancePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(14));
  const [dateTo, setDateTo] = useState(todayIso());
  const [branch, setBranch] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login?next=/admin/ck-label-compliance"); return; }
    void refreshAuthFromApi(a).then((res) => {
      const auth = res || a;
      const ok = ALLOWED.includes(String(auth?.role || "").toUpperCase());
      setAllowed(ok);
      setReady(true);
      if (!ok) router.replace("/week");
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ city: "manila", date_from: dateFrom, date_to: dateTo });
      if (branch) qs.set("branch", branch);
      const res = await fetch(`${API_BASE}/api/admin/ck-delivery/label-compliance?${qs}`, {
        headers: getAuthHeaders(getAuth()), cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      setItems(Array.isArray(d.items) ? d.items : []);
      setSummary(d.summary || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, branch]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  // Group items by delivery
  const deliveries = useMemo(() => {
    const map = new Map<number, { date: string; branch: string; status: string; items: Item[] }>();
    for (const it of items) {
      if (!map.has(it.delivery_id)) map.set(it.delivery_id, { date: it.delivery_date, branch: it.to_branch, status: it.status, items: [] });
      map.get(it.delivery_id)!.items.push(it);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [items]);

  if (!ready) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (!allowed) return null;

  const s = summary;
  const itemMissing = (it: Item) => !it.production_date || !it.expiry_date || !it.label_photo_url || it.is_expired || it.label_ok === false || !!it.label_issue;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className={T_PAGE_TITLE}>CK Label Compliance</h1>
          <p className={`${T_CAPTION} mt-1`}>Production-date labels on CK deliveries (Manila). Captured at dispatch, verified at receiving.</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>From</label>
          <input type="date" className={INPUT_CLASS} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>To</label>
          <input type="date" className={INPUT_CLASS} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Branch</label>
          <SelectDark
            className={SELECT_CLASS}
            value={branch}
            onChange={setBranch}
            options={BRANCHES.map((b) => ({ value: b.code, label: b.label }))}
          />
        </div>
        <button onClick={() => void load()} disabled={loading} className={`${SECONDARY_BUTTON} inline-flex items-center gap-2`}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Fully labeled</p>
            <p className={`mt-1 text-2xl font-bold ${s.total_items > 0 && s.fully_labeled === s.total_items ? "text-emerald-400" : "text-amber-400"}`}>
              {pct(s.fully_labeled, s.total_items)}%
            </p>
            <p className={T_CAPTION}>{s.fully_labeled}/{s.total_items} items</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>With label photo</p>
            <p className="mt-1 text-2xl font-bold text-white">{pct(s.with_photo, s.total_items)}%</p>
            <p className={T_CAPTION}>{s.with_photo}/{s.total_items}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Expired at receiving</p>
            <p className={`mt-1 text-2xl font-bold ${s.expired > 0 ? "text-red-400" : "text-zinc-300"}`}>{s.expired}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Flagged issues</p>
            <p className={`mt-1 text-2xl font-bold ${s.flagged > 0 ? "text-red-400" : "text-zinc-300"}`}>{s.flagged}</p>
          </div>
        </div>
      )}

      {/* Deliveries */}
      {loading ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>Loading…</div>
      ) : deliveries.length === 0 ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No CK deliveries in this range.</div>
      ) : (
        deliveries.map((d) => (
          <div key={d.id} className={GLASS_CARD}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{d.date} → {d.branch}</span>
                <span className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400">{d.status}</span>
              </div>
              <span className={T_CAPTION}>{d.items.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[11px] text-zinc-500">
                    <th className="px-4 py-2">Item</th>
                    <th className="px-3 py-2">Production</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2 text-center">Photo</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it) => (
                    <tr key={it.item_id} className={`border-b border-white/5 ${itemMissing(it) ? "bg-red-500/[0.04]" : ""}`}>
                      <td className="px-4 py-2 font-medium text-white">{it.item_name}<span className="ml-1 text-[11px] text-zinc-500">{it.category}</span></td>
                      <td className={`px-3 py-2 ${it.production_date ? "text-zinc-300" : "text-red-400"}`}>{it.production_date || "missing"}</td>
                      <td className={`px-3 py-2 ${it.is_expired ? "text-red-400 font-semibold" : it.expiry_date ? "text-zinc-300" : "text-red-400"}`}>
                        {it.expiry_date || "missing"}{it.is_expired ? " · EXPIRED" : ""}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {it.label_photo_url
                          ? <a href={it.label_photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300"><ExternalLink className="h-3.5 w-3.5" /></a>
                          : <span className="text-red-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {it.label_issue || it.label_ok === false
                          ? <span className="inline-flex items-center gap-1 text-red-400"><AlertTriangle className="h-3.5 w-3.5" />{it.label_issue || "issue"}</span>
                          : it.label_ok === true
                            ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> verified</span>
                            : !it.production_date || !it.expiry_date || !it.label_photo_url
                              ? <span className="inline-flex items-center gap-1 text-red-400"><XCircle className="h-3.5 w-3.5" /> incomplete</span>
                              : <span className="text-zinc-500">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
