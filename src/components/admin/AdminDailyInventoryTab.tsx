"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, AlertTriangle, CheckCircle2, Clock, ArrowLeft } from "lucide-react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_SECTION,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const BRANCHES = ["PARANAQUE", "CUBAO", "TAFT"] as const;
const SHIFTS = ["AM", "PM", "OVERNIGHT"] as const;
const UNITS = ["kg", "g", "ml", "L", "Box", "Bag", "pcs", "pkt", "Tray", "Case"] as const;

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

function mergeFetchHeaders(init?: RequestInit): Headers {
  const out = new Headers(getAuthHeaders());
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      out.set(key, value);
    });
  }
  return out;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const run = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: mergeFetchHeaders(init),
      cache: "no-store",
    });
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

/* ── Status badge for input form ── */
function StatusBadge({
  qty,
  minLevel,
  parLevel,
}: {
  qty: string;
  minLevel: number | null;
  parLevel: number | null;
}) {
  const num = parseFloat(qty);
  if (!qty || Number.isNaN(num)) return <span className="text-xs text-zinc-600">—</span>;
  if (minLevel !== null && num < minLevel)
    return <span className={BADGE_ERROR}>🔴 LOW</span>;
  if (parLevel !== null && num < parLevel)
    return <span className={BADGE_WARNING}>🟡 WARN</span>;
  return <span className={BADGE_SUCCESS}>🟢 OK</span>;
}

/* ── Status badge for detail view (uses number qty) ── */
function DetailStatusBadge({
  qty,
  minLevel,
  parLevel,
}: {
  qty: number | null;
  minLevel: number | null;
  parLevel: number | null;
}) {
  if (qty === null) return <span className="text-xs text-zinc-600">—</span>;
  if (minLevel !== null && qty < minLevel)
    return <span className={BADGE_ERROR}>🔴 LOW</span>;
  if (parLevel !== null && qty < parLevel)
    return <span className={BADGE_WARNING}>🟡 WARN</span>;
  return <span className={BADGE_SUCCESS}>🟢 OK</span>;
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

/* ── Report Detail View ── */
function ReportDetailView({
  detail,
  items,
  onBack,
}: {
  detail: ReportDetail;
  items: InvItem[];
  onBack: () => void;
}) {
  const entryMap: Record<string, ReportEntry> = {};
  detail.entries.forEach((e) => { entryMap[e.item_code] = e; });

  // Compute alerts
  const lowItems: { item: InvItem; entry: ReportEntry }[] = [];
  const warnItems: { item: InvItem; entry: ReportEntry }[] = [];
  items.forEach((item) => {
    const entry = entryMap[item.item_code];
    if (!entry || entry.qty === null) return;
    if (item.min_level !== null && entry.qty < item.min_level) {
      lowItems.push({ item, entry });
    } else if (item.par_level !== null && entry.qty < item.par_level) {
      warnItems.push({ item, entry });
    }
  });

  // CK (Cold Kitchen) section is only shown for CUBAO branch
  const sections = (detail.branch === "CUBAO" ? ["KITCHEN", "CK"] : ["KITCHEN"]) as ("KITCHEN" | "CK")[];
  const filledCount = detail.entries.filter((e) => e.qty !== null).length;

  return (
    <div className="space-y-5">
      {/* Header card */}
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
            {detail.submitted_at && (
              <p className="text-xs text-zinc-500">
                Submitted {new Date(detail.submitted_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-white/5 pt-3">
          <p className="text-sm text-zinc-400">
            <span className="font-semibold text-white">{filledCount}</span> items recorded
          </p>
          {lowItems.length > 0 && (
            <span className={BADGE_ERROR}>{lowItems.length} LOW</span>
          )}
          {warnItems.length > 0 && (
            <span className={BADGE_WARNING}>{warnItems.length} WATCH</span>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {lowItems.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-sm font-semibold text-red-300">
              Low Stock Alert — {lowItems.length} item{lowItems.length > 1 ? "s" : ""} below minimum
            </p>
          </div>
          <ul className="space-y-1">
            {lowItems.map(({ item, entry }) => (
              <li key={item.item_code} className="text-xs text-red-200/80">
                <span className="font-medium text-red-200">{item.item_name}</span>
                {" "}— {entry.qty} {entry.unit ?? item.default_unit}
                {item.min_level !== null && (
                  <span className="text-red-400/70"> (min {item.min_level} {entry.unit ?? item.default_unit})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Watch alert */}
      {warnItems.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">
              Needs Attention — {warnItems.length} item{warnItems.length > 1 ? "s" : ""} below par level
            </p>
          </div>
          <ul className="space-y-1">
            {warnItems.map(({ item, entry }) => (
              <li key={item.item_code} className="text-xs text-amber-200/80">
                <span className="font-medium text-amber-200">{item.item_name}</span>
                {" "}— {entry.qty} {entry.unit ?? item.default_unit}
                {item.par_level !== null && (
                  <span className="text-amber-400/70"> (par {item.par_level} {entry.unit ?? item.default_unit})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Entries by section */}
      {sections.map((sec) => {
        const sectionItems = items.filter((i) => i.section === sec);
        const sectionEntries = sectionItems.filter((i) => entryMap[i.item_code]);
        if (sectionEntries.length === 0) return null;
        return (
          <div key={sec} className={GLASS_CARD}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <h3 className={T_SECTION}>
                {sec === "KITCHEN" ? "🍱 Kitchen" : "🧊 CK (Cold Kitchen)"}
              </h3>
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
                    const isLow = item.min_level !== null && entry.qty !== null && entry.qty < item.min_level;
                    const isWarn = !isLow && item.par_level !== null && entry.qty !== null && entry.qty < item.par_level;
                    return (
                      <tr
                        key={item.item_code}
                        className={[
                          TABLE_ROW,
                          isLow ? "bg-red-500/5" : isWarn ? "bg-amber-500/5" : "",
                        ].join(" ")}
                      >
                        <td className={`${TABLE_CELL} px-5`}>
                          <span className={isLow ? "text-red-300" : isWarn ? "text-amber-300" : "text-zinc-200"}>
                            {item.item_name}
                          </span>
                          {item.par_level !== null && (
                            <span className="ml-2 text-xs text-zinc-600">
                              par {item.par_level}
                            </span>
                          )}
                        </td>
                        <td className={`${TABLE_CELL} px-3 text-right font-mono`}>
                          {entry.qty ?? "—"}
                        </td>
                        <td className={`${TABLE_CELL} px-3 text-zinc-400`}>
                          {entry.unit ?? item.default_unit}
                        </td>
                        <td className={`${TABLE_CELL} px-3 text-center`}>
                          <DetailStatusBadge
                            qty={entry.qty}
                            minLevel={item.min_level}
                            parLevel={item.par_level}
                          />
                        </td>
                        <td className={`${TABLE_CELL} px-5 text-zinc-500`}>
                          {entry.note || "—"}
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

      <button
        type="button"
        onClick={onBack}
        className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to History
      </button>
    </div>
  );
}

export default function AdminDailyInventoryTab() {
  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [reportDate, setReportDate] = useState(todayYmd());
  const [shift, setShift] = useState("AM");
  const [staffChoice, setStaffChoice] = useState<string>("");
  const [customStaff, setCustomStaff] = useState("");

  const [items, setItems] = useState<InvItem[]>([]);
  const [entries, setEntries] = useState<EntryMap>({});
  const [currentReportId, setCurrentReportId] = useState<number | null>(null);

  const entriesRef = useRef<EntryMap>({});
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const headerRef = useRef<{
    branch: string;
    reportDate: string;
    shift: string;
    staffChoice: string;
    customStaff: string;
  }>({
    branch: BRANCHES[0],
    reportDate: todayYmd(),
    shift: "AM",
    staffChoice: "",
    customStaff: "",
  });
  useEffect(() => {
    headerRef.current = { branch, reportDate, shift, staffChoice, customStaff };
  }, [branch, reportDate, shift, staffChoice, customStaff]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");
  const [itemsLoading, setItemsLoading] = useState(true);

  // view: "form" | "history" | "detail"
  const [view, setView] = useState<"form" | "history" | "detail">("form");
  const [history, setHistory] = useState<ReportHeader[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [staffNamesLoading, setStaffNamesLoading] = useState(true);
  const [staffListError, setStaffListError] = useState("");

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStaffNamesLoading(true);
      setStaffListError("");
      try {
        const res = await apiFetch(
          `/api/daily-inventory/staff-names?home_branch=${encodeURIComponent(branch)}`,
        );
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
        if (!cancelled) {
          setStaffNames([]);
          setStaffListError("Could not load Manila staff list. Check network or permissions.");
        }
      } finally {
        if (!cancelled) setStaffNamesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [branch]);

  useEffect(() => {
    let cancelled = false;
    setItemsLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/daily-inventory/items?branch=${encodeURIComponent(branch)}`,
        );
        const text = await res.text();
        if (!res.ok) {
          let detail = text || `HTTP ${res.status}`;
          try {
            const j = JSON.parse(text) as { detail?: unknown };
            if (j?.detail !== undefined) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
          } catch { /* keep raw text */ }
          throw new Error(detail);
        }
        let data: unknown;
        try { data = JSON.parse(text || "[]"); } catch { throw new Error("Invalid JSON from items API"); }
        if (!Array.isArray(data)) throw new Error("Items API returned non-array");
        const rows = data as InvItem[];
        if (cancelled) return;
        setItems(rows);
        const init: EntryMap = {};
        rows.forEach((item) => { init[item.item_code] = { qty: "", unit: item.default_unit, note: "" }; });
        setEntries(init);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(`Failed to load item list: ${msg}`);
        }
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [branch]);

  const doSave = useCallback(async (showMsg: boolean): Promise<number | null> => {
    const h = headerRef.current;
    const name = effectiveStaffName(h.staffChoice, h.customStaff);
    if (!name) {
      if (showMsg) setError("Select a staff member, or choose Other and enter a name.");
      return null;
    }
    setSaving(true);
    setError("");
    try {
      const ent = entriesRef.current;
      const payload = {
        branch: h.branch,
        report_date: h.reportDate,
        shift: h.shift,
        staff_name: name,
        entries: Object.entries(ent)
          .filter(([, e]) => e.qty !== "")
          .map(([item_code, e]) => ({
            item_code,
            qty: parseFloat(e.qty) || null,
            unit: e.unit || null,
            note: e.note || null,
          })),
      };
      const res = await apiFetch("/api/daily-inventory/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Save failed");
      const data = JSON.parse(text) as { report_id: number };
      setCurrentReportId(data.report_id);
      if (showMsg) {
        setSaveMsg(`Draft saved`);
        setTimeout(() => setSaveMsg(""), 3000);
      }
      return data.report_id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Save error: ${msg}`);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const handleEntryChange = useCallback(
    (itemCode: string, field: keyof EntryState, value: string) => {
      setEntries((prev) => ({
        ...prev,
        [itemCode]: { ...prev[itemCode], [field]: value },
      }));
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => void doSave(false), 3000);
    },
    [doSave],
  );

  const handleSubmit = async () => {
    let rid = currentReportId;
    if (!rid) {
      rid = await doSave(false);
      if (!rid) {
        setError((prev) => prev || "Save first (select staff and enter quantities if needed).");
        return;
      }
    }
    if (!window.confirm("Submit this report? You will not be able to edit it after submit.")) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/daily-inventory/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: rid }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Submit failed");
      setSubmitted(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Submit error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/daily-inventory/reports?branch=${encodeURIComponent(branch)}&limit=30`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      let parsed: unknown;
      try { parsed = JSON.parse(text || "[]"); } catch { throw new Error("Invalid JSON from history API"); }
      setHistory(Array.isArray(parsed) ? (parsed as ReportHeader[]) : []);
    } catch {
      setError("Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadDetail = async (reportId: number) => {
    setDetailLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/daily-inventory/reports/${reportId}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const data = JSON.parse(text) as ReportDetail;
      setSelectedDetail(data);
      setView("detail");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load report: ${msg}`);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (view === "history") void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, branch]);

  // CK (Cold Kitchen) section is only shown for CUBAO branch
  const sections = (branch === "CUBAO" ? ["KITCHEN", "CK"] : ["KITCHEN"]) as ("KITCHEN" | "CK")[];
  const countBySection = (sec: string) => {
    const sectionItems = items.filter((i) => i.section === sec);
    const filled = sectionItems.filter((i) => entries[i.item_code]?.qty !== "").length;
    return { total: sectionItems.length, filled };
  };

  const lowItems = items.filter((item) => {
    const e = entries[item.item_code];
    if (!e || !e.qty) return false;
    const num = parseFloat(e.qty);
    return !Number.isNaN(num) && item.min_level !== null && num < item.min_level;
  });

  /** Dock title below real header height */
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
    const run = () => {
      measureTop();
      requestAnimationFrame(() => { measureHeight(); });
    };
    run();
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => {
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
    };
  }, [submitted, view]);

  /* ── Submitted success screen ── */
  if (submitted) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/25">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Report Submitted</h2>
        <p className="text-sm text-zinc-500">Report ID: {currentReportId}</p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setCurrentReportId(null);
            const init: EntryMap = {};
            items.forEach((item) => { init[item.item_code] = { qty: "", unit: item.default_unit, note: "" }; });
            setEntries(init);
          }}
          className={`mt-4 ${PRIMARY_BUTTON} text-sm`}
        >
          Start a new report
        </button>
      </div>
    );
  }

  /* ── Fixed toolbar portal ── */
  const toolbarPortal =
    typeof document !== "undefined" && !submitted
      ? createPortal(
          <div
            ref={toolbarDockRef}
            className="fixed inset-x-0 z-[45] border-b border-white/8 bg-slate-950/95 shadow-lg shadow-black/30 backdrop-blur-xl pointer-events-auto [touch-action:manipulation]"
            style={{ top: toolbarTopPx }}
          >
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <h1 className="text-lg font-semibold text-white sm:text-xl">📦 Daily Inventory Report</h1>
              <div className="flex shrink-0 gap-2">
                {view === "form" && (
                  <button
                    type="button"
                    onClick={() => setView("history")}
                    className={`${SECONDARY_BUTTON} touch-manipulation py-2 text-sm`}
                  >
                    History
                  </button>
                )}
                {(view === "history" || view === "detail") && (
                  <button
                    type="button"
                    onClick={() => { setView("form"); setSelectedDetail(null); }}
                    className={`${PRIMARY_BUTTON} touch-manipulation py-2 text-sm`}
                  >
                    Back to form
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  /* ── Fixed action bar (form only) ── */
  const actionBar =
    typeof document !== "undefined" && view === "form"
      ? createPortal(
          <div className="fixed inset-x-0 bottom-14 md:bottom-0 z-[60] border-t border-white/8 bg-slate-950/95 px-4 py-3 backdrop-blur-xl [padding-bottom:max(12px,env(safe-area-inset-bottom,0px))] pointer-events-auto [touch-action:manipulation]">
            <div className="mx-auto flex max-w-4xl justify-end gap-3">
              <button
                type="button"
                onClick={() => void doSave(true)}
                disabled={saving}
                className={`${SECONDARY_BUTTON} touch-manipulation py-2 text-sm disabled:opacity-50`}
              >
                {saving ? "Saving…" : "💾 Save draft"}
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || saving}
                className={`${PRIMARY_BUTTON} touch-manipulation py-2 text-sm disabled:opacity-50`}
              >
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

      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {saveMsg && (
        <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-300">
          ✓ {saveMsg}
        </div>
      )}

      {/* ── Detail view ── */}
      {view === "detail" && selectedDetail && (
        <ReportDetailView
          detail={selectedDetail}
          items={items}
          onBack={() => { setSelectedDetail(null); setView("history"); }}
        />
      )}

      {/* ── History view ── */}
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
                    <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Submitted</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-center`}></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr
                      key={r.id}
                      className={`${TABLE_ROW} cursor-pointer`}
                      onClick={() => void loadDetail(r.id)}
                    >
                      <td className={`${TABLE_CELL} px-5 font-medium text-white`}>
                        {formatDate(r.report_date)}
                      </td>
                      <td className={`${TABLE_CELL} px-3`}>{r.shift}</td>
                      <td className={`${TABLE_CELL} px-3`}>{r.staff_name}</td>
                      <td className={`${TABLE_CELL} px-3`}>
                        <span className={r.status === "SUBMITTED" ? BADGE_SUCCESS : BADGE_WARNING}>
                          {r.status === "SUBMITTED"
                            ? <><CheckCircle2 className="h-3 w-3" /> SUBMITTED</>
                            : <><Clock className="h-3 w-3" /> DRAFT</>
                          }
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} px-5 text-zinc-500`}>
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {detailLoading ? (
                          <span className="text-xs text-zinc-600">…</span>
                        ) : (
                          <ChevronRight className="mx-auto h-4 w-4 text-zinc-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Form view ── */}
      {view === "form" && (
        <>
          {/* Header fields */}
          <div className={`${GLASS_CARD} mb-5 p-5`}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Branch</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Date</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Shift</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={`${T_LABEL} mb-1.5 block`}>Staff</label>
                <select
                  value={staffChoice}
                  onChange={(e) => setStaffChoice(e.target.value)}
                  disabled={staffNamesLoading}
                  className={`${SELECT_CLASS} disabled:opacity-60`}
                >
                  <option value="">{staffNamesLoading ? "Loading staff…" : "— Select —"}</option>
                  {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={STAFF_OTHER}>{STAFF_OTHER}</option>
                </select>
                {staffChoice === STAFF_OTHER && (
                  <input
                    type="text"
                    value={customStaff}
                    onChange={(e) => setCustomStaff(e.target.value)}
                    placeholder="Enter name"
                    className={`${INPUT_CLASS} mt-2`}
                  />
                )}
                {staffListError && (
                  <p className="mt-1.5 text-xs text-amber-400">{staffListError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Low stock alert (live as user types) */}
          {lowItems.length > 0 && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
                <p className="text-sm font-semibold text-red-300">
                  Low Stock ({lowItems.length}):
                  <span className="ml-1 font-normal text-red-200/80">
                    {lowItems.map((i) => i.item_name).join(", ")}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Item loading state */}
          {itemsLoading && (
            <div className={`${GLASS_CARD} mb-5 flex items-center gap-3 px-5 py-6`}>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <span className="text-sm text-zinc-400">Loading inventory items…</span>
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
                  <h2 className={T_SECTION}>
                    {sec === "KITCHEN" ? "🍱 Kitchen" : "🧊 CK (Cold Kitchen)"}
                  </h2>
                  <span className="text-xs text-zinc-500">{filled} / {total} filled</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Item</th>
                        <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Qty</th>
                        <th className={`${TABLE_HEADER} px-3 py-3 text-left`}>Unit</th>
                        <th className={`${TABLE_HEADER} px-3 py-3 text-center`}>Status</th>
                        <th className={`${TABLE_HEADER} px-5 py-3 text-left`}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionItems.map((item) => {
                        const entry = entries[item.item_code] || { qty: "", unit: item.default_unit, note: "" };
                        const num = parseFloat(entry.qty);
                        const isLow = !Number.isNaN(num) && item.min_level !== null && num < item.min_level;
                        const isWarn = !isLow && !Number.isNaN(num) && item.par_level !== null && num < item.par_level;
                        return (
                          <tr
                            key={item.item_code}
                            className={[
                              TABLE_ROW,
                              isLow ? "bg-red-500/5" : isWarn ? "bg-amber-500/5" : "",
                            ].join(" ")}
                          >
                            <td className={`${TABLE_CELL} px-5`}>
                              <span className={isLow ? "font-medium text-red-300" : isWarn ? "font-medium text-amber-300" : "text-zinc-200"}>
                                {item.item_name}
                              </span>
                              {item.par_level !== null && (
                                <span className="ml-2 text-xs text-zinc-600">
                                  Par: {item.par_level} {entry.unit}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={entry.qty}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  // Allow digits, single decimal point, and empty string
                                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                    handleEntryChange(item.item_code, "qty", v);
                                  }
                                }}
                                className="w-full max-w-[7rem] rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 text-right text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <select
                                value={entry.unit}
                                onChange={(e) => handleEntryChange(item.item_code, "unit", e.target.value)}
                                className="w-full max-w-[5.5rem] appearance-none cursor-pointer rounded-xl border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
                              >
                                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <StatusBadge qty={entry.qty} minLevel={item.min_level} parLevel={item.par_level} />
                            </td>
                            <td className="px-5 py-3">
                              <input
                                type="text"
                                value={entry.note}
                                onChange={(e) => handleEntryChange(item.item_code, "note", e.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                                placeholder="—"
                              />
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
