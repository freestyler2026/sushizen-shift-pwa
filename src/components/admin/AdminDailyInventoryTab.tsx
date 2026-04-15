"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, INPUT_CLASS, SELECT_CLASS, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

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

const BRANCHES = ["PARANAQUE", "CUBAO", "TAFT"] as const;
const SHIFTS = ["AM", "PM", "OVERNIGHT"] as const;
const UNITS = ["kg", "g", "ml", "L", "Box", "Bag", "pcs", "pkt", "Tray", "Case"] as const;

const STAFF_NAMES = [
  "Ate Joy",
  "Kuya Mark",
  "Ate Ana",
  "Kuya Ben",
  "Ate Rose",
  "Kuya Carlo",
  "Others",
];

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const run = () => fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
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
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const run = () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
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
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `POST ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
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
  if (!qty || Number.isNaN(num)) return <span className={`${T_CAPTION} text-zinc-500`}>—</span>;
  if (minLevel !== null && num < minLevel)
    return <span className="text-xs font-bold text-red-400">LOW</span>;
  if (parLevel !== null && num < parLevel)
    return <span className="text-xs font-semibold text-amber-400">WARN</span>;
  return <span className="text-xs text-emerald-400">OK</span>;
}

export default function AdminDailyInventoryTab() {
  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [reportDate, setReportDate] = useState<string>(todayISO());
  const [shift, setShift] = useState<string>("AM");
  const [staffName, setStaffName] = useState<string>("");
  const [customStaff, setCustomStaff] = useState<string>("");

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
    staffName: string;
    customStaff: string;
  }>({ branch: BRANCHES[0], reportDate: todayISO(), shift: "AM", staffName: "", customStaff: "" });
  useEffect(() => {
    headerRef.current = { branch, reportDate, shift, staffName, customStaff };
  }, [branch, reportDate, shift, staffName, customStaff]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [historyTab, setHistoryTab] = useState(false);
  const [history, setHistory] = useState<ReportHeader[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiGet<InvItem[]>("/api/daily-inventory/items")
      .then((data) => {
        setItems(data);
        const init: EntryMap = {};
        data.forEach((item) => {
          init[item.item_code] = { qty: "", unit: item.default_unit, note: "" };
        });
        setEntries(init);
      })
      .catch(() => setError("Failed to load item list."));
  }, []);

  const doSave = useCallback(async (showMsg: boolean): Promise<number | null> => {
    const { branch: b, reportDate: rd, shift: sh, staffName: sn, customStaff: cs } = headerRef.current;
    const effectiveStaff = sn === "Others" ? cs : sn;
    if (!effectiveStaff) {
      if (showMsg) setError("Select or enter staff name.");
      return null;
    }
    setSaving(true);
    setError("");
    try {
      const ent = entriesRef.current;
      const payload = {
        branch: b,
        report_date: rd,
        shift: sh,
        staff_name: effectiveStaff,
        entries: Object.entries(ent)
          .filter(([, e]) => e.qty !== "")
          .map(([item_code, e]) => ({
            item_code,
            qty: parseFloat(e.qty) || null,
            unit: e.unit || null,
            note: e.note || null,
          })),
      };
      const data = await apiPostJson<{ ok: boolean; report_id: number; status: string }>(
        "/api/daily-inventory/save",
        payload
      );
      setCurrentReportId(data.report_id);
      if (showMsg) {
        setSaveMsg(`Saved (ID: ${data.report_id})`);
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

  const handleEntryChange = useCallback((itemCode: string, field: keyof EntryState, value: string) => {
    setEntries((prev) => ({
      ...prev,
      [itemCode]: { ...prev[itemCode], [field]: value },
    }));

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void doSave(false);
    }, 3000);
  }, [doSave]);

  const handleSubmit = async () => {
    let rid = currentReportId;
    if (!rid) {
      rid = await doSave(false);
      if (!rid) {
        setError("Save first (staff name required).");
        return;
      }
    }
    if (!window.confirm("Submit report? You cannot edit after submit.")) return;
    setSubmitting(true);
    setError("");
    try {
      await apiPostJson("/api/daily-inventory/submit", { report_id: rid });
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
      const data = await apiGet<ReportHeader[]>(`/api/daily-inventory/reports?branch=${encodeURIComponent(branch)}&limit=20`);
      setHistory(data);
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
  const countBySection = (section: string) => {
    const sectionItems = items.filter((i) => i.section === section);
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
      <div className={`${GLASS_CARD} flex flex-col items-center justify-center gap-4 py-16`}>
        <h2 className="text-lg font-semibold text-emerald-400">Report submitted</h2>
        <p className={T_CAPTION}>Report ID: {currentReportId}</p>
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
          className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New report
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Daily Inventory Input</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHistoryTab(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              !historyTab ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            Entry
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              historyTab ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            History
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}
      {saveMsg ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {saveMsg}
        </div>
      ) : null}

      {historyTab ? (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_LABEL} mb-3 text-zinc-200`}>History ({branch})</h3>
          {historyLoading ? (
            <div className={`${T_CAPTION} py-8 text-center`}>Loading…</div>
          ) : history.length === 0 ? (
            <div className={`${T_CAPTION} py-8 text-center`}>No reports yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="p-2">Date</th>
                    <th className="p-2">Shift</th>
                    <th className="p-2">Staff</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                      <td className="p-2 text-zinc-200">{r.report_date}</td>
                      <td className="p-2 text-zinc-300">{r.shift}</td>
                      <td className="p-2 text-zinc-300">{r.staff_name}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            r.status === "SUBMITTED"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-200"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2 text-zinc-500">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={`${GLASS_CARD} p-4`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Branch *</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={`${SELECT_CLASS} w-full text-sm`}
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Date *</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className={`${INPUT_CLASS} w-full text-sm`}
                />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Shift *</label>
                <select value={shift} onChange={(e) => setShift(e.target.value)} className={`${SELECT_CLASS} w-full text-sm`}>
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Staff *</label>
                <select
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className={`${SELECT_CLASS} w-full text-sm`}
                >
                  <option value="">— Select —</option>
                  {STAFF_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {staffName === "Others" ? (
                  <input
                    type="text"
                    placeholder="Name"
                    value={customStaff}
                    onChange={(e) => setCustomStaff(e.target.value)}
                    className={`${INPUT_CLASS} mt-1 w-full text-sm`}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {lowItems.length > 0 ? (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              <strong>LOW stock ({lowItems.length}):</strong> {lowItems.map((i) => i.item_name).join(", ")}
            </div>
          ) : null}

          {sections.map((section) => {
            const sectionItems = items.filter((i) => i.section === section);
            if (sectionItems.length === 0) return null;
            const { total, filled } = countBySection(section);
            return (
              <div key={section} className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-medium text-zinc-200">
                    {section === "KITCHEN" ? "Kitchen" : "CK (Cold Kitchen)"}
                  </h3>
                  <span className={T_CAPTION}>
                    {filled} / {total} filled
                  </span>
                </div>
                <div className={`${GLASS_CARD} overflow-hidden p-0`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-zinc-400">
                          <th className="p-2">Item</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2">Unit</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionItems.map((item) => {
                          const entry = entries[item.item_code] || { qty: "", unit: item.default_unit, note: "" };
                          return (
                            <tr key={item.item_code} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/40">
                              <td className="p-2">
                                <span className="font-medium text-zinc-100">{item.item_name}</span>
                                {item.par_level !== null ? (
                                  <span className={`${T_CAPTION} ml-2`}>
                                    Par: {item.par_level}
                                    {entry.unit}
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
                                  className={`${INPUT_CLASS} w-full max-w-[7rem] py-1 text-right text-sm`}
                                  placeholder="0"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={entry.unit}
                                  onChange={(e) => handleEntryChange(item.item_code, "unit", e.target.value)}
                                  className={`${SELECT_CLASS} w-full max-w-[6rem] py-1 text-sm`}
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
                                  className={`${INPUT_CLASS} w-full min-w-[5rem] py-1 text-xs`}
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
              </div>
            );
          })}

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-zinc-800 bg-zinc-950/90 py-3 pb-6 pt-3 backdrop-blur">
            <button
              type="button"
              onClick={() => void doSave(true)}
              disabled={saving}
              className="rounded-lg bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || saving}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
