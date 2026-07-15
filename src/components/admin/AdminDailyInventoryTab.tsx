"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight, AlertTriangle, CheckCircle2, Clock, ArrowLeft,
  Plus, Trash2, Settings2, Loader2, RefreshCw,
} from "lucide-react";

import { getAuth, getAuthHeaders, getUploadHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_LABEL,
  T_SECTION,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
} from "@/lib/ui-tokens";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const BRANCHES = ["PARANAQUE", "CUBAO", "TAFT", "CENTRAL KITCHEN"] as const;
const SHIFTS = ["AM", "PM", "OVERNIGHT"] as const;
const UNITS = [
  "kg", "g", "ml", "L",
  "Box", "Bag", "Bottle", "Sack", "Can", "Tin",
  "pcs", "pkt", "Tray", "Case",
  "Portion", "Batch", "Block", "Slab",
  // Legacy/abbreviated forms kept for backward compatibility with existing items
  "KG", "BTL", "PKT", "PCS", "CAN", "PTN", "LTR", "BOX",
] as const;

type SourceType = "ck" | "supplier" | "warehouse";

const SOURCE_TABS: { id: SourceType; label: string; color: string }[] = [
  { id: "ck",        label: "Central Kitchen",  color: "violet" },
  { id: "supplier",  label: "Supplier",          color: "sky"    },
  { id: "warehouse", label: "Warehouse",         color: "amber"  },
];

const SOURCE_SECTION_LABELS: Record<string, string> = {
  COLD_SUSHI:   "Cold Sushi",
  HOT_GRILL:    "Hot Grill",
  HOT_FRY:      "Hot Fry",
  HOT_RAMEN:    "Hot Ramen",
  HOT_SECTION:  "Hot Section",
  FROZEN_ITEMS: "Frozen Items",
  DRY_ITEMS:    "Dry Items",
  INGREDIENTS:  "Ingredients",
  OTHER_ITEMS:  "Other Items",
  DRINK:        "Drink",
  SUPPLIER:     "Supplier",
  WAREHOUSE:    "Warehouse",
  KITCHEN:      "Kitchen",
};

const STAFF_OTHER = "Other";

interface InvItem {
  id: number;
  item_code: string;
  section: string;
  item_name: string;
  default_unit: string;
  min_level: number | null;
  par_level: number | null;
  sort_order: number;
  is_commissary: boolean;
  is_active: boolean;
  source_type: string;
}

interface EntryState {
  qty: string;
  unit: string;
  note: string;
}

type EntryMap = Record<string, EntryState>;

interface ReportHeader {
  id: number;
  branch: string;
  report_date: string;
  shift: string;
  staff_name: string;
  status: string;
  submitted_at: string | null;
}

interface ReportEntry {
  id: number;
  report_id: number;
  item_code: string;
  qty: number | null;
  unit: string | null;
  note: string | null;
}

interface ReportDetail extends ReportHeader {
  entries: ReportEntry[];
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isManager(auth: ReturnType<typeof getAuth>): boolean {
  const r = (auth?.role || "").toUpperCase();
  return ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(r);
}

function mergeFetchHeaders(init?: RequestInit): Headers {
  const out = new Headers(getAuthHeaders());
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => { out.set(key, value); });
  }
  return out;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const run = () => fetch(`${API_BASE}${path}`, { ...init, headers: mergeFetchHeaders(init), cache: "no-store" });
  let res = await run();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await run();
      text = await res.text();
    }
  }
  return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function StatusBadge({ qty, minLevel, parLevel }: { qty: string; minLevel: number | null; parLevel: number | null }) {
  const num = parseFloat(qty);
  if (!qty || Number.isNaN(num)) return <span className="text-xs text-zinc-600">—</span>;
  if (minLevel !== null && num < minLevel) return <span className={BADGE_ERROR}>LOW</span>;
  if (parLevel !== null && num < parLevel) return <span className={BADGE_WARNING}>WARN</span>;
  return <span className={BADGE_SUCCESS}>OK</span>;
}

function DetailStatusBadge({ qty, minLevel, parLevel }: { qty: number | null; minLevel: number | null; parLevel: number | null }) {
  if (qty === null) return <span className="text-xs text-zinc-600">—</span>;
  if (minLevel !== null && Number(qty) < Number(minLevel)) return <span className={BADGE_ERROR}>LOW</span>;
  if (parLevel !== null && Number(qty) < Number(parLevel)) return <span className={BADGE_WARNING}>WARN</span>;
  return <span className={BADGE_SUCCESS}>OK</span>;
}

function effectiveStaffName(staffChoice: string, customStaff: string): string {
  if (staffChoice === STAFF_OTHER) return customStaff.trim();
  return staffChoice.trim();
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

type GeneratedPR = { type: string; request_no: string; case_no: string; request_id: string };

function ReportDetailView({ detail, items, onBack }: { detail: ReportDetail; items: InvItem[]; onBack: () => void }) {
  const entryMap: Record<string, ReportEntry> = {};
  detail.entries.forEach((e) => { entryMap[e.item_code] = e; });

  const lowItems: { item: InvItem; entry: ReportEntry }[] = [];
  const warnItems: { item: InvItem; entry: ReportEntry }[] = [];
  items.forEach((item) => {
    const entry = entryMap[item.item_code];
    if (!entry || entry.qty === null) return;
    if (item.min_level !== null && Number(entry.qty) < Number(item.min_level)) lowItems.push({ item, entry });
    else if (item.par_level !== null && Number(entry.qty) < Number(item.par_level)) warnItems.push({ item, entry });
  });

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderQtys, setOrderQtys] = useState<Record<string, string>>({});
  const [orderSelected, setOrderSelected] = useState<Record<string, boolean>>({});
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [generatedPRs, setGeneratedPRs] = useState<GeneratedPR[]>([]);

  function openOrderModal() {
    const qtys: Record<string, string> = {};
    const sel: Record<string, boolean> = {};
    lowItems.forEach(({ item, entry }) => {
      const deficit = item.min_level !== null ? Math.max(0, Number(item.min_level) - Number(entry.qty)) : 0;
      qtys[item.item_code] = deficit > 0 ? String(deficit) : "";
      sel[item.item_code] = deficit > 0;
    });
    setOrderQtys(qtys); setOrderSelected(sel); setOrderError(""); setGeneratedPRs([]); setOrderModalOpen(true);
  }

  async function submitGenerateOrder() {
    const auth = getAuth();
    const requestedBy = auth?.staffName || detail.staff_name || "";
    if (!requestedBy) { setOrderError("Could not identify current user."); return; }
    const selectedItems = lowItems.filter(({ item }) => orderSelected[item.item_code])
      .map(({ item }) => ({ item_code: item.item_code, order_qty: parseFloat(orderQtys[item.item_code] || "0") }))
      .filter((x) => x.order_qty > 0);
    if (!selectedItems.length) { setOrderError("Select at least one item with a quantity > 0."); return; }
    setOrderBusy(true); setOrderError("");
    try {
      const res = await apiFetch(`/api/daily-inventory/reports/${detail.id}/generate-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requested_by: requestedBy, items: selectedItems }),
      });
      const json = await res.json() as { ok?: boolean; created?: GeneratedPR[]; detail?: unknown };
      if (!res.ok) {
        const msg = typeof json.detail === "string" ? json.detail : "Failed to generate order";
        throw new Error(msg);
      }
      setGeneratedPRs((json.created as GeneratedPR[]) || []);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Unknown error");
    } finally { setOrderBusy(false); }
  }

  const sections = [...new Set(items.map((i) => i.section))];
  const filledCount = detail.entries.filter((e) => e.qty !== null).length;

  return (
    <div className="space-y-5">
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={T_LABEL}>Report Detail</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {detail.branch} — {formatDate(detail.report_date)} · {detail.shift}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">Staff: {detail.staff_name}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={detail.status === "SUBMITTED" ? BADGE_SUCCESS : BADGE_WARNING}>
              {detail.status === "SUBMITTED" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {detail.status}
            </span>
            {detail.submitted_at && <p className="text-xs text-zinc-500">Submitted {new Date(detail.submitted_at).toLocaleString()}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-white/5 pt-3">
          <p className="text-sm text-zinc-400"><span className="font-semibold text-white">{filledCount}</span> items recorded</p>
          {lowItems.length > 0 && <span className={BADGE_ERROR}>{lowItems.length} LOW</span>}
          {warnItems.length > 0 && <span className={BADGE_WARNING}>{warnItems.length} WATCH</span>}
        </div>
      </div>

      {lowItems.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <p className="text-sm font-semibold text-red-300">Low Stock — {lowItems.length} item{lowItems.length > 1 ? "s" : ""} below minimum</p>
            </div>
            {detail.status === "SUBMITTED" && (
              <button onClick={openOrderModal} className="rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/25">
                Generate Purchase Request
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {lowItems.map(({ item, entry }) => (
              <li key={item.item_code} className="text-xs text-red-200/80">
                <span className="font-medium text-red-200">{item.item_name}</span>
                {" "}— {entry.qty} {entry.unit ?? item.default_unit}
                {item.min_level !== null && <span className="text-red-400/70"> (min {item.min_level})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {orderModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="border-b border-white/8 px-6 py-4">
              <h3 className="text-base font-semibold text-white">Generate Purchase Request</h3>
              <p className="mt-0.5 text-xs text-zinc-400">{detail.branch} · {formatDate(detail.report_date)}</p>
            </div>
            {generatedPRs.length > 0 ? (
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm font-semibold text-emerald-300">Draft orders created!</p>
                <p className="text-xs text-amber-300/80">Each order is saved as <strong>DRAFT</strong>. Go to the Hub, review quantities, then click <strong>Submit</strong>.</p>
                {generatedPRs.map((pr) => (
                  <div key={pr.request_id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-4 py-3">
                    <div><p className="text-xs font-semibold text-zinc-300">{pr.type} Order</p><p className="text-xs text-zinc-500">{pr.request_no}</p></div>
                    <a href="/admin/procurement/hub" className="rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200 hover:bg-violet-500/25">Review →</a>
                  </div>
                ))}
                <div className="pt-2 flex justify-end"><button onClick={() => setOrderModalOpen(false)} className={SECONDARY_BUTTON}>Close</button></div>
              </div>
            ) : (
              <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {lowItems.filter(({ item }) => !item.is_commissary).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Supplier Items</p>
                    {lowItems.filter(({ item }) => !item.is_commissary).map(({ item, entry }) => (
                      <div key={item.item_code} className="mb-2 flex items-center gap-3">
                        <input type="checkbox" checked={!!orderSelected[item.item_code]}
                          onChange={(e) => setOrderSelected((p) => ({ ...p, [item.item_code]: e.target.checked }))}
                          className="h-4 w-4 rounded border-zinc-600 accent-violet-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-200">{item.item_name}</p>
                          <p className="text-xs text-zinc-500">Stock: {entry.qty} / Min: {item.min_level} {entry.unit ?? item.default_unit}</p>
                        </div>
                        <input type="number" min="0" step="1" value={orderQtys[item.item_code] ?? ""} placeholder="qty"
                          onChange={(e) => setOrderQtys((p) => ({ ...p, [item.item_code]: e.target.value }))}
                          className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
                        <span className="text-xs text-zinc-500 w-10">{entry.unit ?? item.default_unit}</span>
                      </div>
                    ))}
                  </div>
                )}
                {lowItems.filter(({ item }) => item.is_commissary).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Central Kitchen Items</p>
                    {lowItems.filter(({ item }) => item.is_commissary).map(({ item, entry }) => (
                      <div key={item.item_code} className="mb-2 flex items-center gap-3">
                        <input type="checkbox" checked={!!orderSelected[item.item_code]}
                          onChange={(e) => setOrderSelected((p) => ({ ...p, [item.item_code]: e.target.checked }))}
                          className="h-4 w-4 rounded border-zinc-600 accent-violet-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-200">{item.item_name}</p>
                          <p className="text-xs text-zinc-500">Stock: {entry.qty} / Min: {item.min_level} {entry.unit ?? item.default_unit}</p>
                        </div>
                        <input type="number" min="0" step="1" value={orderQtys[item.item_code] ?? ""} placeholder="qty"
                          onChange={(e) => setOrderQtys((p) => ({ ...p, [item.item_code]: e.target.value }))}
                          className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
                        <span className="text-xs text-zinc-500 w-10">{entry.unit ?? item.default_unit}</span>
                      </div>
                    ))}
                  </div>
                )}
                {orderError && <p className="text-xs text-red-400">{orderError}</p>}
              </div>
            )}
            {generatedPRs.length === 0 && (
              <div className="flex justify-end gap-3 border-t border-white/8 px-6 py-4">
                <button onClick={() => setOrderModalOpen(false)} className={SECONDARY_BUTTON} disabled={orderBusy}>Cancel</button>
                <button onClick={() => void submitGenerateOrder()} className={PRIMARY_BUTTON} disabled={orderBusy}>
                  {orderBusy ? "Generating…" : "Generate Orders"}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {warnItems.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">Needs Attention — {warnItems.length} item{warnItems.length > 1 ? "s" : ""} below par</p>
          </div>
          <ul className="space-y-1">
            {warnItems.map(({ item, entry }) => (
              <li key={item.item_code} className="text-xs text-amber-200/80">
                <span className="font-medium text-amber-200">{item.item_name}</span>
                {" "}— {entry.qty} {entry.unit ?? item.default_unit}
                {item.par_level !== null && <span className="text-amber-400/70"> (par {item.par_level})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sections.map((sec) => {
        const sectionItems = items.filter((i) => i.section === sec);
        const sectionEntries = sectionItems.filter((i) => entryMap[i.item_code]);
        if (sectionEntries.length === 0) return null;
        return (
          <div key={sec} className={GLASS_CARD}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <h3 className={T_SECTION}>{SOURCE_SECTION_LABELS[sec] ?? sec}</h3>
              <span className="text-xs text-zinc-500">{sectionEntries.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Item</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-right`}>Qty</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Unit</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-center`}>Status</th>
                    <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionItems.map((item) => {
                    const entry = entryMap[item.item_code];
                    if (!entry) return null;
                    const isLow = item.min_level !== null && entry.qty !== null && Number(entry.qty) < Number(item.min_level);
                    const isWarn = !isLow && item.par_level !== null && entry.qty !== null && Number(entry.qty) < Number(item.par_level);
                    return (
                      <tr key={item.item_code} className={[TABLE_ROW, isLow ? "bg-red-500/5" : isWarn ? "bg-amber-500/5" : ""].join(" ")}>
                        <td className={`${TABLE_CELL} px-5`}>
                          <span className={isLow ? "text-red-300" : isWarn ? "text-amber-300" : "text-zinc-200"}>{item.item_name}</span>
                          {item.par_level !== null && <span className="ml-2 text-xs text-zinc-600">par {item.par_level}</span>}
                        </td>
                        <td className={`${TABLE_CELL} px-3 text-right font-mono`}>{entry.qty ?? "—"}</td>
                        <td className={`${TABLE_CELL} px-3 text-zinc-400`}>{entry.unit ?? item.default_unit}</td>
                        <td className={`${TABLE_CELL} px-3 text-center`}><DetailStatusBadge qty={entry.qty} minLevel={item.min_level} parLevel={item.par_level} /></td>
                        <td className={`${TABLE_CELL} px-5 text-zinc-500`}>{entry.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={onBack} className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
        <ArrowLeft className="h-4 w-4" />Back to History
      </button>
    </div>
  );
}

// ── Item Master Management ─────────────────────────────────────────────────

interface ItemMasterProps {
  onBack: () => void;
}

function ItemMasterView({ onBack }: ItemMasterProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceType>("ck");
  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [seeding, setSeeding] = useState(false);

  // Add item form
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSection, setAddSection] = useState("");
  const [addUnit, setAddUnit] = useState("KG");
  const [addMinLevel, setAddMinLevel] = useState("");
  const [addParLevel, setAddParLevel] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Inline edit par level
  const [editParCode, setEditParCode] = useState<string | null>(null);
  const [editParVal, setEditParVal] = useState("");
  const [editParBusy, setEditParBusy] = useState(false);

  // Purge retired items
  const [purging, setPurging] = useState(false);

  // Excel import/export
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadItems() {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/daily-inventory/items?source_type=${sourceFilter}&active_only=false`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const data = JSON.parse(text) as InvItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadItems(); }, [sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSeedExcel() {
    if (!window.confirm("This will import 103 CK items + 23 Supplier items from the Excel master list. Existing items with the same code will be updated. Continue?")) return;
    setSeeding(true); setError(""); setMsg("");
    try {
      const res = await apiFetch("/api/daily-inventory/items/seed-excel", { method: "POST" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Seed failed");
      const data = JSON.parse(text) as { upserted?: number };
      setMsg(`Seeded ${data.upserted ?? "?"} items from Excel master list.`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally { setSeeding(false); }
  }

  async function handleAddItem() {
    if (!addName.trim()) return;
    setAddBusy(true); setError("");
    try {
      const res = await apiFetch("/api/daily-inventory/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: addName.trim(),
          section: addSection.trim().toUpperCase() || (sourceFilter === "ck" ? "CK_ITEMS" : sourceFilter.toUpperCase()),
          default_unit: addUnit,
          min_level: addMinLevel ? parseFloat(addMinLevel) : null,
          par_level: addParLevel ? parseFloat(addParLevel) : null,
          source_type: sourceFilter,
          is_commissary: sourceFilter === "ck",
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Create failed");
      setAddName(""); setAddSection(""); setAddUnit("KG"); setAddMinLevel(""); setAddParLevel("");
      setAddOpen(false);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally { setAddBusy(false); }
  }

  async function handleSaveParLevel(itemCode: string) {
    const val = parseFloat(editParVal);
    if (Number.isNaN(val)) { setEditParCode(null); return; }
    setEditParBusy(true);
    try {
      const res = await apiFetch(`/api/daily-inventory/items/${encodeURIComponent(itemCode)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ par_level: val }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Update failed");
      setItems((prev) => prev.map((it) => it.item_code === itemCode ? { ...it, par_level: val } : it));
      setEditParCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally { setEditParBusy(false); }
  }

  async function handleDelete(itemCode: string, itemName: string) {
    if (!window.confirm(`Deactivate "${itemName}"? It will no longer appear in the inventory form.`)) return;
    try {
      const res = await apiFetch(`/api/daily-inventory/items/${encodeURIComponent(itemCode)}`, { method: "DELETE" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Delete failed");
      setItems((prev) => prev.map((it) => it.item_code === itemCode ? { ...it, is_active: false } : it));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handlePurgeRetired() {
    const retiredCount = items.filter((i) => !i.is_active && i.item_name.startsWith("[Retired]")).length;
    if (!window.confirm(`Permanently delete ${retiredCount} [Retired] items? This cannot be undone.`)) return;
    setPurging(true); setError(""); setMsg("");
    try {
      const res = await apiFetch("/api/daily-inventory/items/purge-retired", { method: "POST" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Purge failed");
      const data = JSON.parse(text) as { deleted?: number };
      setMsg(`Deleted ${data.deleted ?? "?"} retired items.`);
      setItems((prev) => prev.filter((i) => !(i.item_name.startsWith("[Retired]") && !i.is_active)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purge failed");
    } finally { setPurging(false); }
  }

  async function handleDownloadTemplate() {
    setDownloading(true); setError("");
    try {
      // Use fetch directly — apiFetch reads body as text which corrupts binary Excel data
      const res = await fetch(`${API_BASE}/api/daily-inventory/items/template-excel`, {
        headers: new Headers(getAuthHeaders()),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "daily_inventory_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally { setDownloading(false); }
  }

  async function handleImportExcel(file: File) {
    if (!file) return;
    setImporting(true); setError(""); setMsg("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = `${API_BASE}/api/daily-inventory/items/import-excel${replaceMode ? "?deactivate_others=true" : ""}`;
      // Use fetch directly with getUploadHeaders — apiFetch injects Content-Type: application/json
      // which overrides the multipart/form-data boundary the browser must set for file uploads
      const res = await fetch(url, {
        method: "POST",
        headers: new Headers(getUploadHeaders()),
        body: formData,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Import failed");
      const data = JSON.parse(text) as { upserted?: number; total_processed?: number; skipped_blank?: number; deactivated?: number };
      const deactivatedNote = (data.deactivated ?? 0) > 0 ? ` · ${data.deactivated} old items deactivated.` : "";
      setMsg(`Import complete: ${data.upserted ?? data.total_processed ?? "?"} items upserted.${deactivatedNote}`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const [restoring, setRestoring] = useState(false);
  async function handleRestoreCommissary() {
    if (!confirm("Restore CK commissary items deactivated within the last 7 days?\nThis will reactivate items used by CK Inventory.\n\nNote: [Retired] items and items deactivated more than 7 days ago will NOT be restored.")) return;
    setRestoring(true); setError(""); setMsg("");
    try {
      const res = await apiFetch(`/api/daily-inventory/items/restore-commissary`, { method: "POST" });
      setMsg(`CK items restored: ${(res as { restored?: number }).restored ?? 0} items reactivated.`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  const [cleaning, setCleaning] = useState(false);
  async function handleCleanupCommissary() {
    if (!confirm(
      "Fix CK item issues caused by over-broad restore?\n\n" +
      "This will:\n" +
      "  1. Re-deactivate [Retired] items that were accidentally restored\n" +
      "  2. Remove cross-section duplicates (keeps the entry with prior usage history)\n\n" +
      "Continue?"
    )) return;
    setCleaning(true); setError(""); setMsg("");
    try {
      const res = await apiFetch(`/api/daily-inventory/items/cleanup-commissary`, { method: "POST" }) as {
        retired_deactivated?: number; duplicates_removed?: number;
      };
      setMsg(`Cleanup complete: ${res.retired_deactivated ?? 0} [Retired] items re-deactivated, ${res.duplicates_removed ?? 0} duplicate entries removed.`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }

  const sections = [...new Set(items.map((i) => i.section))].sort();
  const retiredCount = items.filter((i) => !i.is_active && i.item_name.startsWith("[Retired]")).length;

  return (
    <div className="space-y-5">
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Back Office</p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">Item Master</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {retiredCount > 0 && (
              <button
                onClick={() => void handlePurgeRetired()}
                disabled={purging}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {purging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Purge [{retiredCount}] Retired
              </button>
            )}
            {/* Hidden file input for Excel import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportExcel(f); }}
            />
            <button
              onClick={() => void handleDownloadTemplate()}
              disabled={downloading}
              className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
              title="Download current items as Excel template"
            >
              {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">↓</span>}
              Template
            </button>
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1.5 cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  replaceMode
                    ? "border-orange-500/50 bg-orange-500/20 text-orange-300"
                    : "border-zinc-600/40 bg-zinc-700/30 text-zinc-400 hover:border-zinc-500/50"
                }`}
                title="When checked, items NOT in the uploaded file will be deactivated (replace mode)"
              >
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                  className="h-3 w-3 accent-orange-400"
                />
                Replace
              </label>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                title={replaceMode ? "Upload Excel — items NOT in file will be deactivated" : "Upload edited Excel file to import/update items"}
              >
                {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">↑</span>}
                Import Excel
              </button>
            </div>
            <button
              onClick={() => void handleRestoreCommissary()}
              disabled={restoring}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              title="Reactivate CK commissary items deactivated within the last 7 days (excludes [Retired] items)"
            >
              {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Restore CK Items
            </button>
            <button
              onClick={() => void handleCleanupCommissary()}
              disabled={cleaning}
              className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 disabled:opacity-50"
              title="Re-deactivate [Retired] items and remove cross-section duplicates caused by over-broad restore"
            >
              {cleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
              Fix Restore Issues
            </button>
            <button
              onClick={() => void handleSeedExcel()}
              disabled={seeding}
              className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
              title="Reset to built-in July 2026 master list"
            >
              {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Reset to Default
            </button>
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
            >
              <Plus className="h-3 w-3" />Add Item
            </button>
          </div>
        </div>

        {/* Source filter tabs */}
        <div className="mt-4 flex gap-1.5">
          {SOURCE_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setSourceFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                sourceFilter === tab.id
                  ? "bg-white/15 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-300">✓ {msg}</div>}
      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-300">{error}</div>}

      {/* Add item form */}
      {addOpen && (
        <div className={`${GLASS_CARD} p-5`}>
          <p className="mb-3 text-sm font-semibold text-white">New Item — {SOURCE_TABS.find((t) => t.id === sourceFilter)?.label}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <label className={`${T_LABEL} mb-1 block`}>Item Name *</label>
              <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Tonkotsu Broth" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Section</label>
              <input type="text" value={addSection} onChange={(e) => setAddSection(e.target.value)}
                placeholder={sourceFilter === "ck" ? "HOT_RAMEN" : "SUPPLIER"} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Unit</label>
              <input type="text" value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="KG" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Min Level</label>
              <input type="number" step="any" min="0" value={addMinLevel} onChange={(e) => setAddMinLevel(e.target.value)} placeholder="0" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Par Level</label>
              <input type="number" step="any" min="0" value={addParLevel} onChange={(e) => setAddParLevel(e.target.value)} placeholder="0" className={INPUT_CLASS} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAddOpen(false)} className={SECONDARY_BUTTON}>Cancel</button>
            <button onClick={() => void handleAddItem()} disabled={addBusy || !addName.trim()} className={PRIMARY_BUTTON}>
              {addBusy ? "Adding…" : "Add Item"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className={`${GLASS_CARD} py-10 text-center text-zinc-500 flex items-center justify-center gap-2`}>
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      )}

      {!loading && sections.map((sec) => {
        const secItems = items.filter((i) => i.section === sec);
        return (
          <div key={sec} className={GLASS_CARD}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <h3 className={T_SECTION}>{SOURCE_SECTION_LABELS[sec] ?? sec}</h3>
              <span className="text-xs text-zinc-500">{secItems.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Item</th>
                    <th className={`${TABLE_HEADER} px-3 py-2 text-center`}>Unit</th>
                    <th className={`${TABLE_HEADER} px-3 py-2 text-center`}>Min</th>
                    <th className={`${TABLE_HEADER} px-3 py-2 text-center`}>Par Level</th>
                    <th className={`${TABLE_HEADER} px-3 py-2 text-center`}>Active</th>
                    <th className={`${TABLE_HEADER} px-4 py-2 text-center`}></th>
                  </tr>
                </thead>
                <tbody>
                  {secItems.map((item) => (
                    <tr key={item.item_code} className={`${TABLE_ROW} ${!item.is_active ? "opacity-40" : ""}`}>
                      <td className={`${TABLE_CELL} px-4`}>
                        <div className="font-medium text-zinc-200">{item.item_name}</div>
                        <div className="text-xs text-zinc-600">{item.item_code}</div>
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-center text-zinc-400`}>{item.default_unit}</td>
                      <td className={`${TABLE_CELL} px-3 text-center text-zinc-400`}>{item.min_level ?? "—"}</td>
                      <td className={`${TABLE_CELL} px-3 text-center`}>
                        {editParCode === item.item_code ? (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="text" inputMode="decimal"
                              value={editParVal}
                              onChange={(e) => setEditParVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") void handleSaveParLevel(item.item_code); if (e.key === "Escape") setEditParCode(null); }}
                              className="w-20 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-center text-sm text-white focus:outline-none"
                              autoFocus
                            />
                            <button onClick={() => void handleSaveParLevel(item.item_code)} disabled={editParBusy}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20">
                              {editParBusy ? "…" : "✓"}
                            </button>
                            <button onClick={() => setEditParCode(null)} className="text-zinc-500 hover:text-zinc-300 text-xs px-1">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditParCode(item.item_code); setEditParVal(String(item.par_level ?? "")); }}
                            className="rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/5 hover:text-white"
                          >
                            {item.par_level != null ? parseFloat(String(item.par_level)).toFixed(3) : <span className="text-zinc-600">—</span>}
                          </button>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-center`}>
                        {item.is_active
                          ? <span className={BADGE_SUCCESS}>Active</span>
                          : <span className={BADGE_ERROR}>Off</span>}
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-center`}>
                        {item.is_active && (
                          <button onClick={() => void handleDelete(item.item_code, item.item_name)}
                            className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={onBack} className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}>
        <ArrowLeft className="h-4 w-4" />Back
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminDailyInventoryTab() {
  const auth = getAuth();
  const manager = isManager(auth);

  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [reportDate, setReportDate] = useState(todayYmd());
  const [shift, setShift] = useState("AM");
  const [staffChoice, setStaffChoice] = useState<string>("");
  const [customStaff, setCustomStaff] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceType>("ck");

  const [items, setItems] = useState<InvItem[]>([]);
  // entries persists across source tab switches (keyed by item_code)
  const [entries, setEntries] = useState<EntryMap>({});
  const [currentReportId, setCurrentReportId] = useState<number | null>(null);

  const entriesRef = useRef<EntryMap>({});
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  const headerRef = useRef<{ branch: string; reportDate: string; shift: string; staffChoice: string; customStaff: string }>({ branch: BRANCHES[0], reportDate: todayYmd(), shift: "AM", staffChoice: "", customStaff: "" });
  useEffect(() => { headerRef.current = { branch, reportDate, shift, staffChoice, customStaff }; }, [branch, reportDate, shift, staffChoice, customStaff]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");
  const [itemsLoading, setItemsLoading] = useState(true);

  const [view, setView] = useState<"form" | "history" | "detail" | "items">("form");
  const [history, setHistory] = useState<ReportHeader[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // All items across sources (for detail view)
  const [allItems, setAllItems] = useState<InvItem[]>([]);

  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [staffNamesLoading, setStaffNamesLoading] = useState(true);
  const [staffListError, setStaffListError] = useState("");

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all items at mount for detail view (ensures allItems is complete regardless of which tabs are visited)
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/api/daily-inventory/items");
        const text = await res.text();
        if (!res.ok) return;
        const data = JSON.parse(text || "[]") as InvItem[];
        if (Array.isArray(data)) {
          setAllItems((prev) => {
            const map = new Map(prev.map((i) => [i.item_code, i]));
            data.forEach((i) => map.set(i.item_code, i));
            return [...map.values()];
          });
        }
      } catch { /* non-critical */ }
    })();
  }, []); // mount only

  // Staff names
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStaffNamesLoading(true); setStaffListError("");
      try {
        const res = await apiFetch(`/api/daily-inventory/staff-names?home_branch=${encodeURIComponent(branch)}`);
        const text = await res.text();
        if (!res.ok) throw new Error(text || "Failed to load staff names");
        const data = JSON.parse(text || "{}") as { names?: string[] };
        const names = Array.isArray(data.names) ? data.names.map((n) => String(n || "").trim()).filter(Boolean) : [];
        if (cancelled) return;
        setStaffNames(names);
        setStaffChoice((prev) => {
          if (prev === STAFF_OTHER) return prev;
          if (prev && !names.includes(prev)) return "";
          return prev;
        });
      } catch {
        if (!cancelled) { setStaffNames([]); setStaffListError("Could not load staff list."); }
      } finally { if (!cancelled) setStaffNamesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [branch]);

  // Items by source tab
  useEffect(() => {
    if (view !== "form") return;
    let cancelled = false;
    setItemsLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(`/api/daily-inventory/items?source_type=${sourceTab}`);
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const data = JSON.parse(text || "[]") as InvItem[];
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setItems(rows);
        // Init entries for any new items (don't overwrite existing)
        setEntries((prev) => {
          const next = { ...prev };
          rows.forEach((item) => {
            if (!next[item.item_code]) next[item.item_code] = { qty: "", unit: item.default_unit, note: "" };
          });
          return next;
        });
        // Merge into allItems
        setAllItems((prev) => {
          const map = new Map(prev.map((i) => [i.item_code, i]));
          rows.forEach((i) => map.set(i.item_code, i));
          return [...map.values()];
        });
      } catch (e) {
        if (!cancelled) setError(`Failed to load items: ${e instanceof Error ? e.message : String(e)}`);
      } finally { if (!cancelled) setItemsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sourceTab, view]);

  const doSave = useCallback(async (showMsg: boolean): Promise<number | null> => {
    const h = headerRef.current;
    const name = effectiveStaffName(h.staffChoice, h.customStaff);
    if (!name) { if (showMsg) setError("Select a staff member, or choose Other and enter a name."); return null; }
    setSaving(true); setError("");
    try {
      const ent = entriesRef.current;
      const payload = {
        branch: h.branch,
        report_date: h.reportDate,
        shift: h.shift,
        staff_name: name,
        entries: Object.entries(ent)
          .filter(([, e]) => e.qty !== "")
          .map(([item_code, e]) => ({ item_code, qty: parseFloat(e.qty) || null, unit: e.unit || null, note: e.note || null })),
      };
      const res = await apiFetch("/api/daily-inventory/save", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Save failed");
      const data = JSON.parse(text) as { report_id: number };
      setCurrentReportId(data.report_id);
      if (showMsg) { setSaveMsg("Draft saved"); setTimeout(() => setSaveMsg(""), 3000); }
      return data.report_id;
    } catch (e) {
      setError(`Save error: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally { setSaving(false); }
  }, []);

  const handleEntryChange = useCallback((itemCode: string, field: keyof EntryState, value: string) => {
    setEntries((prev) => ({ ...prev, [itemCode]: { ...prev[itemCode], [field]: value } }));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void doSave(false), 3000);
  }, [doSave]);

  const handleSubmit = async () => {
    let rid = currentReportId;
    if (!rid) { rid = await doSave(false); if (!rid) { setError((prev) => prev || "Save first."); return; } }
    if (!window.confirm("Submit this report? You will not be able to edit it after submit.")) return;
    setSubmitting(true); setError("");
    try {
      const res = await apiFetch("/api/daily-inventory/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id: rid }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Submit failed");
      setSubmitted(true);
    } catch (e) {
      setError(`Submit error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSubmitting(false); }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/daily-inventory/reports?branch=${encodeURIComponent(branch)}&limit=30`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const parsed = JSON.parse(text || "[]") as unknown;
      setHistory(Array.isArray(parsed) ? (parsed as ReportHeader[]) : []);
    } catch { setError("Failed to load history."); }
    finally { setHistoryLoading(false); }
  };

  const loadDetail = async (reportId: number) => {
    setDetailLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/daily-inventory/reports/${reportId}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setSelectedDetail(JSON.parse(text) as ReportDetail);
      setView("detail");
    } catch (e) {
      setError(`Failed to load report: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setDetailLoading(false); }
  };

  useEffect(() => { if (view === "history") void loadHistory(); }, [view, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = [...new Set(items.map((i) => i.section))].sort();
  const countBySection = (sec: string) => {
    const sec_items = items.filter((i) => i.section === sec);
    const filled = sec_items.filter((i) => entries[i.item_code]?.qty !== "").length;
    return { total: sec_items.length, filled };
  };
  const lowItems = items.filter((item) => {
    const e = entries[item.item_code];
    if (!e || !e.qty) return false;
    const num = parseFloat(e.qty);
    return !Number.isNaN(num) && item.min_level !== null && num < item.min_level;
  });

  const toolbarDockRef = useRef<HTMLDivElement>(null);
  const [toolbarTopPx, setToolbarTopPx] = useState(88);
  const [toolbarHeightPx, setToolbarHeightPx] = useState(64);

  useLayoutEffect(() => {
    if (submitted) return;
    const measureTop = () => {
      const header = document.querySelector("header");
      const bottom = header?.getBoundingClientRect().bottom;
      setToolbarTopPx(typeof bottom === "number" ? Math.ceil(bottom) + 2 : 88);
    };
    const measureHeight = () => {
      const el = toolbarDockRef.current;
      if (el) setToolbarHeightPx(Math.max(48, Math.ceil(el.getBoundingClientRect().height)));
    };
    const run = () => { measureTop(); requestAnimationFrame(() => { measureHeight(); }); };
    run();
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => { window.removeEventListener("resize", run); window.removeEventListener("scroll", run, true); };
  }, [submitted, view]);

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/25">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Report Submitted</h2>
        <p className="text-sm text-zinc-500">Report ID: {currentReportId}</p>
        <button type="button" onClick={() => { setSubmitted(false); setCurrentReportId(null); setEntries({}); setItems([]); setSourceTab("ck"); setView("form"); }}
          className={`mt-4 ${PRIMARY_BUTTON} text-sm`}>
          Start a new report
        </button>
      </div>
    );
  }

  if (view === "items") {
    return (
      <div className="relative mx-auto max-w-4xl pb-10 text-white">
        <ItemMasterView onBack={() => setView("form")} />
      </div>
    );
  }

  const toolbarPortal = typeof document !== "undefined" && !submitted
    ? createPortal(
        <div ref={toolbarDockRef}
          className="fixed inset-x-0 z-[45] border-b border-white/8 bg-slate-950/95 shadow-lg shadow-black/30 backdrop-blur-xl pointer-events-auto [touch-action:manipulation]"
          style={{ top: toolbarTopPx }}>
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <h1 className="text-lg font-semibold text-white sm:text-xl">📦 Daily Inventory Report</h1>
            <div className="flex shrink-0 gap-2">
              {view === "form" && manager && (
                <button type="button" onClick={() => setView("items")}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-600/40 bg-zinc-700/30 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700/50 touch-manipulation">
                  <Settings2 className="h-3.5 w-3.5" />Manage Items
                </button>
              )}
              {view === "form" && (
                <button type="button" onClick={() => setView("history")} className={`${SECONDARY_BUTTON} touch-manipulation py-2 text-sm`}>History</button>
              )}
              {(view === "history" || view === "detail") && (
                <button type="button" onClick={() => { setView("form"); setSelectedDetail(null); }} className={`${PRIMARY_BUTTON} touch-manipulation py-2 text-sm`}>Back to form</button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const actionBar = typeof document !== "undefined" && view === "form"
    ? createPortal(
        <div className="fixed inset-x-0 bottom-14 md:bottom-0 z-[60] border-t border-white/8 bg-slate-950/95 px-4 py-3 backdrop-blur-xl [padding-bottom:max(12px,env(safe-area-inset-bottom,0px))] pointer-events-auto [touch-action:manipulation]">
          <div className="mx-auto flex max-w-4xl justify-end gap-3">
            <button type="button" onClick={() => void doSave(true)} disabled={saving} className={`${SECONDARY_BUTTON} touch-manipulation py-2 text-sm disabled:opacity-50`}>
              {saving ? "Saving…" : "💾 Save draft"}
            </button>
            <button type="button" onClick={() => void handleSubmit()} disabled={submitting || saving} className={`${PRIMARY_BUTTON} touch-manipulation py-2 text-sm disabled:opacity-50`}>
              {submitting ? "Submitting…" : "✅ Submit report"}
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative mx-auto max-w-4xl pb-40 text-white">
      <div aria-hidden className="w-full" style={{ height: toolbarHeightPx }} />
      {toolbarPortal}

      {error && <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-300">{error}</div>}
      {saveMsg && <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-300">✓ {saveMsg}</div>}

      {/* Detail view */}
      {view === "detail" && selectedDetail && (
        <ReportDetailView
          detail={selectedDetail}
          items={allItems}
          onBack={() => { setSelectedDetail(null); setView("history"); }}
        />
      )}

      {/* History view */}
      {view === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={T_SECTION}>History — {branch}</h2>
            <span className="text-xs text-zinc-500">{history.length} reports</span>
          </div>
          {historyLoading ? (
            <div className={`${GLASS_CARD} py-12 text-center text-zinc-500`}>Loading…</div>
          ) : history.length === 0 ? (
            <div className={`${GLASS_CARD} py-12 text-center text-zinc-500`}>No reports yet for {branch}</div>
          ) : (
            <div className={GLASS_CARD}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Date</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Shift</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Staff</th>
                    <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Status</th>
                    <th className={`${TABLE_HEADER} px-5 py-3 text-left hidden sm:table-cell`}>Submitted</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-center`}></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className={`${TABLE_ROW} cursor-pointer`} onClick={() => void loadDetail(r.id)}>
                      <td className={`${TABLE_CELL} px-5 font-medium text-white`}>{formatDate(r.report_date)}</td>
                      <td className={`${TABLE_CELL} px-3`}>{r.shift}</td>
                      <td className={`${TABLE_CELL} px-3`}>{r.staff_name}</td>
                      <td className={`${TABLE_CELL} px-3`}>
                        <span className={r.status === "SUBMITTED" ? BADGE_SUCCESS : BADGE_WARNING}>
                          {r.status === "SUBMITTED" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {r.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT"}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} px-5 text-zinc-500 hidden sm:table-cell`}>
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {detailLoading ? <span className="text-xs text-zinc-600">…</span> : <ChevronRight className="mx-auto h-4 w-4 text-zinc-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Form view */}
      {view === "form" && (
        <>
          {/* Header fields */}
          <div className={`${GLASS_CARD} mb-4 p-5`}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className={SELECT_CLASS}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="min-w-0 overflow-hidden">
                <label className={`${T_LABEL} mb-1.5 block`}>Date</label>
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={`${INPUT_CLASS} appearance-none`} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Shift</label>
                <select value={shift} onChange={(e) => setShift(e.target.value)} className={SELECT_CLASS}>
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className={`${T_LABEL} mb-1.5 block`}>Staff</label>
                <select value={staffChoice} onChange={(e) => setStaffChoice(e.target.value)} disabled={staffNamesLoading} className={`${SELECT_CLASS} disabled:opacity-60`}>
                  <option value="">{staffNamesLoading ? "Loading…" : "— Select —"}</option>
                  {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={STAFF_OTHER}>Other</option>
                </select>
                {staffChoice === STAFF_OTHER && (
                  <input type="text" value={customStaff} onChange={(e) => setCustomStaff(e.target.value)} placeholder="Enter name" className={`${INPUT_CLASS} mt-2`} />
                )}
                {staffListError && <p className="mt-1.5 text-xs text-amber-400">{staffListError}</p>}
              </div>
            </div>
          </div>

          {/* Source tabs */}
          <div className="mb-4 flex gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {SOURCE_TABS.map((tab) => (
              <button key={tab.id} type="button"
                onClick={() => setSourceTab(tab.id)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  sourceTab === tab.id
                    ? "bg-white/12 text-white shadow"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Role hint */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-xs text-zinc-500">
            {sourceTab === "ck" && "👨‍🍳 Kitchen Staff — enter quantities for Central Kitchen items"}
            {sourceTab === "supplier" && "🚚 Kitchen Staff — enter quantities for daily Supplier deliveries"}
            {sourceTab === "warehouse" && "💼 Cashier — enter quantities for Warehouse items"}
          </div>

          {/* Low stock alert */}
          {lowItems.length > 0 && (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
                <p className="text-sm font-semibold text-red-300">
                  Low Stock ({lowItems.length}):
                  <span className="ml-1 font-normal text-red-200/80">{lowItems.map((i) => i.item_name).join(", ")}</span>
                </p>
              </div>
            </div>
          )}

          {itemsLoading && (
            <div className={`${GLASS_CARD} mb-5 flex items-center gap-3 px-5 py-6`}>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <span className="text-sm text-zinc-400">Loading {SOURCE_TABS.find((t) => t.id === sourceTab)?.label} items…</span>
            </div>
          )}

          {!itemsLoading && items.length === 0 && (
            <div className={`${GLASS_CARD} mb-5 py-12 text-center text-zinc-500 text-sm`}>
              No {SOURCE_TABS.find((t) => t.id === sourceTab)?.label} items yet.
              {manager && <span> Use <strong>Manage Items</strong> to add items or seed from Excel.</span>}
            </div>
          )}

          {/* Item sections */}
          {!itemsLoading && sections.map((sec) => {
            const sectionItems = items.filter((i) => i.section === sec);
            if (sectionItems.length === 0) return null;
            const { total, filled } = countBySection(sec);
            return (
              <div key={sec} className={`${GLASS_CARD} mb-5`}>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <h2 className={T_SECTION}>{SOURCE_SECTION_LABELS[sec] ?? sec}</h2>
                  <span className="text-xs text-zinc-500">{filled} / {total} filled</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Item</th>
                        <th className={`${TABLE_HEADER} px-2 py-3 text-right`}>Qty</th>
                        <th className={`${TABLE_HEADER} px-2 py-3 text-left`}>Unit</th>
                        <th className={`${TABLE_HEADER} px-2 py-3 text-center`}>Status</th>
                        <th className={`${TABLE_HEADER} hidden sm:table-cell px-3 py-3 text-left`}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionItems.map((item) => {
                        const entry = entries[item.item_code] || { qty: "", unit: item.default_unit, note: "" };
                        const num = parseFloat(entry.qty);
                        const isLow = !Number.isNaN(num) && item.min_level !== null && num < item.min_level;
                        const isWarn = !isLow && !Number.isNaN(num) && item.par_level !== null && num < item.par_level;
                        return (
                          <tr key={item.item_code} className={[TABLE_ROW, isLow ? "bg-red-500/5" : isWarn ? "bg-amber-500/5" : ""].join(" ")}>
                            <td className={`${TABLE_CELL} px-3`}>
                              <span className={isLow ? "font-medium text-red-300" : isWarn ? "font-medium text-amber-300" : "text-zinc-200"}>
                                {item.item_name}
                              </span>
                              {item.par_level !== null && (
                                <div className="text-xs text-zinc-600">Par: {item.par_level} {entry.unit}</div>
                              )}
                            </td>
                            <td className="px-2 py-3">
                              <input
                                type="number" inputMode="decimal" step="any" min="0" value={entry.qty}
                                onChange={(e) => handleEntryChange(item.item_code, "qty", e.target.value)}
                                className="w-16 appearance-none rounded-xl border border-white/10 bg-white/6 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-2 py-3">
                              <select value={entry.unit} onChange={(e) => handleEntryChange(item.item_code, "unit", e.target.value)}
                                className="w-full max-w-[5rem] appearance-none cursor-pointer rounded-xl border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/50">
                                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <StatusBadge qty={entry.qty} minLevel={item.min_level} parLevel={item.par_level} />
                            </td>
                            <td className="hidden sm:table-cell px-3 py-3">
                              <input type="text" value={entry.note} onChange={(e) => handleEntryChange(item.item_code, "note", e.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                                placeholder="—" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}

      {actionBar}
    </div>
  );
}
