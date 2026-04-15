"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";

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
  if (!qty || Number.isNaN(num)) return <span className="text-xs text-neutral-500">—</span>;
  if (minLevel !== null && num < minLevel) return <span className="text-xs font-bold text-red-400">🔴 LOW</span>;
  if (parLevel !== null && num < parLevel) return <span className="text-xs font-semibold text-amber-400">🟡 WARN</span>;
  return <span className="text-xs text-emerald-400">🟢 OK</span>;
}

function effectiveStaffName(staffChoice: string, customStaff: string): string {
  if (staffChoice === STAFF_OTHER) return customStaff.trim();
  return staffChoice.trim();
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

  const [historyTab, setHistoryTab] = useState(false);
  const [history, setHistory] = useState<ReportHeader[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [branch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/daily-inventory/items");
        const text = await res.text();
        if (!res.ok) throw new Error(text || "Failed to load items");
        const data = JSON.parse(text || "[]") as InvItem[];
        if (cancelled) return;
        setItems(data);
        const init: EntryMap = {};
        data.forEach((item) => {
          init[item.item_code] = { qty: "", unit: item.default_unit, note: "" };
        });
        setEntries(init);
      } catch {
        if (!cancelled) setError("Failed to load item list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setSaveMsg(`Saved (report ID: ${data.report_id})`);
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
        setError("Save first (select staff and enter quantities if needed).");
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
      const res = await apiFetch(`/api/daily-inventory/reports?branch=${encodeURIComponent(branch)}&limit=20`);
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      setHistory(JSON.parse(text || "[]") as ReportHeader[]);
    } catch {
      setError("Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (historyTab) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTab, branch]);

  const sections = ["KITCHEN", "CK"] as const;
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

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 py-20">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-emerald-400">Report submitted</h2>
        <p className="text-sm text-neutral-500">Report ID: {currentReportId}</p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setCurrentReportId(null);
            const init: EntryMap = {};
            items.forEach((item) => {
              init[item.item_code] = { qty: "", unit: item.default_unit, note: "" };
            });
            setEntries(init);
          }}
          className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Start a new report
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-4xl pb-28 text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-100">📦 Daily Inventory Report</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHistoryTab(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              !historyTab ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            Entry
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              historyTab ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            History
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}
      {saveMsg ? (
        <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {saveMsg}
        </div>
      ) : null}

      {historyTab ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-neutral-200">History ({branch})</h2>
          {historyLoading ? (
            <div className="py-8 text-center text-neutral-500">Loading…</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-neutral-500">No reports yet</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border border-neutral-700 bg-neutral-900 text-neutral-400">
                  <th className="border border-neutral-700 p-2 text-left">Date</th>
                  <th className="border border-neutral-700 p-2 text-left">Shift</th>
                  <th className="border border-neutral-700 p-2 text-left">Staff</th>
                  <th className="border border-neutral-700 p-2 text-left">Status</th>
                  <th className="border border-neutral-700 p-2 text-left">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-800 hover:bg-neutral-900/80">
                    <td className="border border-neutral-800 p-2">{r.report_date}</td>
                    <td className="border border-neutral-800 p-2">{r.shift}</td>
                    <td className="border border-neutral-800 p-2">{r.staff_name}</td>
                    <td className="border border-neutral-800 p-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          r.status === "SUBMITTED" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-200"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="border border-neutral-800 p-2 text-neutral-500">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Branch *</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Date *</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Shift *</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                >
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-neutral-500">Staff *</label>
                <select
                  value={staffChoice}
                  onChange={(e) => setStaffChoice(e.target.value)}
                  disabled={staffNamesLoading}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  <option value="">{staffNamesLoading ? "Loading staff…" : "— Select —"}</option>
                  {staffNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={STAFF_OTHER}>{STAFF_OTHER}</option>
                </select>
                {staffChoice === STAFF_OTHER ? (
                  <input
                    type="text"
                    value={customStaff}
                    onChange={(e) => setCustomStaff(e.target.value)}
                    placeholder="Enter name"
                    className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
                  />
                ) : null}
                {staffListError ? (
                  <p className="mt-1 text-xs text-amber-400">{staffListError}</p>
                ) : null}
              </div>
            </div>
          </div>

          {lowItems.length > 0 ? (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              🔴 <strong>LOW stock ({lowItems.length}):</strong> {lowItems.map((i) => i.item_name).join(", ")}
            </div>
          ) : null}

          {sections.map((sec) => {
            const sectionItems = items.filter((i) => i.section === sec);
            if (sectionItems.length === 0) return null;
            const { total, filled } = countBySection(sec);
            return (
              <div key={sec} className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-neutral-200">
                    {sec === "KITCHEN" ? "🍱 Kitchen" : "🧊 CK (Cold Kitchen)"}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    {filled} / {total} filled
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 bg-neutral-900 text-neutral-400">
                        <th className="border-b border-neutral-700 p-2 text-left">Item</th>
                        <th className="border-b border-neutral-700 p-2 text-left">Qty</th>
                        <th className="border-b border-neutral-700 p-2 text-left">Unit</th>
                        <th className="border-b border-neutral-700 p-2 text-center">Status</th>
                        <th className="border-b border-neutral-700 p-2 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionItems.map((item) => {
                        const entry = entries[item.item_code] || { qty: "", unit: item.default_unit, note: "" };
                        return (
                          <tr key={item.item_code} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-900/60">
                            <td className="p-2">
                              <span className="font-medium text-neutral-100">{item.item_name}</span>
                              {item.par_level !== null ? (
                                <span className="ml-2 text-xs text-neutral-500">
                                  Par: {item.par_level} {entry.unit}
                                </span>
                              ) : null}
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                value={entry.qty}
                                onChange={(e) => handleEntryChange(item.item_code, "qty", e.target.value)}
                                className="w-full max-w-[8rem] rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-right text-sm text-white"
                                placeholder="0"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={entry.unit}
                                onChange={(e) => handleEntryChange(item.item_code, "unit", e.target.value)}
                                className="w-full max-w-[6rem] rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-sm text-white"
                              >
                                {UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <StatusBadge qty={entry.qty} minLevel={item.min_level} parLevel={item.par_level} />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={entry.note}
                                onChange={(e) => handleEntryChange(item.item_code, "note", e.target.value)}
                                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white"
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

      {!historyTab ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur [padding-bottom:max(12px,env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto flex max-w-4xl justify-end gap-3">
            <button
              type="button"
              onClick={() => void doSave(true)}
              disabled={saving}
              className="rounded-lg bg-neutral-800 px-5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "💾 Save draft"}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || saving}
              className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "✅ Submit report"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
