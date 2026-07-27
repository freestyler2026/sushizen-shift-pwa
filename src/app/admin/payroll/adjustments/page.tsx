"use client";

import {
  AlertCircle, ChevronDown, ChevronRight, Download, Loader2,
  Pencil, Plus, RefreshCw, Trash2, Upload, X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  GLASS_CARD, INPUT_CLASS, PRIMARY_BUTTON,
  SECONDARY_BUTTON, SELECT_CLASS, SMALL_BUTTON,
  T_PAGE_TITLE, TAB_ACTIVE, TAB_INACTIVE, TABLE_CELL, TABLE_HEADER, TABLE_ROW,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const API = "/api/admin/payroll";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

async function extractApiError(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json() as { detail?: string; message?: string };
    return j.detail || j.message || fallback;
  } catch { return fallback; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Cycle = {
  id: number;
  city: string;
  year: number;
  month: number;
  status: "open" | "closed";
};

type Adjustment = {
  id: string;
  city: string;
  cycle_id: number;
  staff_name: string;
  adj_type: "addition" | "deduction" | "recurring_deduction";
  subtype: string;
  amount: number;
  vat: number;
  incurred_at: string | null;
  reference_no: string;
  note: string;
  source: string;
  created_at: string;
};

const ADJ_LABELS: Record<string, string> = {
  addition: "Addition",
  deduction: "Deduction",
  recurring_deduction: "Recurring Deduction",
};

const SUBTYPES = {
  addition: ["Overtime","Prime time payment","Attendance Bonus","Commission","Other Addition"],
  deduction: ["Tardiness","Absence","Early Leave","Damage","Loan Repayment","Other Deduction"],
  recurring_deduction: ["Loan Installment","Insurance","Uniform","Other Recurring"],
};

// ── Adjustment Form Modal ─────────────────────────────────────────────────────

function AdjModal({
  city,
  cycleId,
  adj,
  defaultType,
  onSave,
  onClose,
}: {
  city: string;
  cycleId: number;
  adj: Adjustment | null;
  defaultType: Adjustment["adj_type"];
  onSave: (a: Adjustment) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    staff_name: adj?.staff_name ?? "",
    adj_type: adj?.adj_type ?? defaultType,
    subtype: adj?.subtype ?? "",
    amount: String(adj?.amount ?? ""),
    vat: String(adj?.vat ?? "0"),
    incurred_at: adj?.incurred_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    note: adj?.note ?? "",
    reference_no: adj?.reference_no ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.staff_name.trim()) { setErr("Staff name is required"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr("Amount must be greater than 0"); return; }
    setBusy(true); setErr("");
    try {
      let r: Response;
      if (adj) {
        r = await apiFetch(`${API}/adjustments/${adj.id}?city=${encodeURIComponent(city)}`, {
          method: "PATCH",
          body: JSON.stringify({
            subtype: form.subtype,
            amount: parseFloat(form.amount),
            vat: parseFloat(form.vat) || 0,
            incurred_at: form.incurred_at || null,
            note: form.note,
          }),
        });
      } else {
        r = await apiFetch(`${API}/adjustments?city=${encodeURIComponent(city)}&cycle_id=${cycleId}`, {
          method: "POST",
          body: JSON.stringify({
            staff_name: form.staff_name.trim(),
            adj_type: form.adj_type,
            subtype: form.subtype,
            amount: parseFloat(form.amount),
            vat: parseFloat(form.vat) || 0,
            incurred_at: form.incurred_at || null,
            note: form.note,
            reference_no: form.reference_no,
          }),
        });
      }
      if (!r.ok) { setErr(await extractApiError(r, "Failed to save adjustment")); return; }
      const data = await r.json() as { adjustment: Adjustment };
      onSave(data.adjustment);
    } catch {
      setErr("Network error — please try again");
    } finally { setBusy(false); }
  }

  const labelCls = "block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1";
  const subtypeOptions = SUBTYPES[form.adj_type as keyof typeof SUBTYPES] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6 relative`}>
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-500 hover:text-white"><X size={18} /></button>
        <h3 className="text-lg font-semibold text-white mb-4">
          {adj ? "Edit Adjustment" : `New ${ADJ_LABELS[defaultType]}`}
        </h3>

        {err && <p className={`${BADGE_ERROR} mb-3 w-full justify-center py-2 rounded-xl`}>{err}</p>}

        <div className="space-y-3">
          {!adj && (
            <>
              <div>
                <label className={labelCls}>Staff Name *</label>
                <input className={INPUT_CLASS} value={form.staff_name} onChange={e => set("staff_name", e.target.value)}
                  placeholder="Enter staff name exactly" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <SelectDark className={SELECT_CLASS} value={form.adj_type}
                  onChange={v => setForm(f => ({ ...f, adj_type: v as Adjustment["adj_type"], subtype: "" }))}
                  options={[
                    { value: "addition", label: "Addition" },
                    { value: "deduction", label: "Deduction" },
                    { value: "recurring_deduction", label: "Recurring Deduction" },
                  ]}
                />
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>Sub-type</label>
            <SelectDark className={SELECT_CLASS} value={form.subtype}
              onChange={v => set("subtype", v)}
              options={[
                { value: "", label: "— Select sub-type —" },
                ...subtypeOptions.map(s => ({ value: s, label: s })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount *</label>
              <input className={INPUT_CLASS} type="number" min="0" step="0.01"
                value={form.amount} onChange={e => set("amount", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>VAT</label>
              <input className={INPUT_CLASS} type="number" min="0" step="0.01"
                value={form.vat} onChange={e => set("vat", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Date Incurred</label>
            <input className={INPUT_CLASS} type="date" value={form.incurred_at} onChange={e => set("incurred_at", e.target.value)} />
          </div>

          {!adj && (
            <div>
              <label className={labelCls}>Reference #</label>
              <input className={INPUT_CLASS} value={form.reference_no} onChange={e => set("reference_no", e.target.value)}
                placeholder="Auto-generated if blank" />
            </div>
          )}

          <div>
            <label className={labelCls}>Note</label>
            <input className={INPUT_CLASS} value={form.note} onChange={e => set("note", e.target.value)}
              placeholder="Optional note or remarks" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className={SECONDARY_BUTTON} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={PRIMARY_BUTTON} onClick={() => { void save(); }} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ─────────────────────────────────────────────────────────

type CsvRow = {
  staff_name: string;
  adj_type: string;
  subtype: string;
  amount: string;
  incurred_date: string;
  reference_no: string;
  note: string;
  _errors: string[];
};

const CSV_VALID_TYPES = new Set(["addition", "deduction", "recurring_deduction"]);
const CSV_TEMPLATE_HEADERS = "staff_name,adj_type,subtype,amount,incurred_date,reference_no,note";

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells: string[] = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') {
        if (inQ && raw[i + 1] === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cells.push(cell.trim()); cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

function buildCsvRows(data: string[][], headers: string[]): CsvRow[] {
  const idx = (n: string) => headers.findIndex(h => h.toLowerCase().trim() === n);
  const iName = idx("staff_name"), iType = idx("adj_type"), iSub = idx("subtype");
  const iAmt = idx("amount"), iDate = idx("incurred_date");
  const iRef = idx("reference_no"), iNote = idx("note");
  return data.map(cells => {
    const g = (i: number) => (i >= 0 ? (cells[i] ?? "") : "").trim();
    const staff_name = g(iName), adj_type = g(iType).toLowerCase();
    const subtype = g(iSub), amount = g(iAmt);
    const incurred_date = g(iDate), reference_no = g(iRef), note = g(iNote);
    const errs: string[] = [];
    if (!staff_name) errs.push("staff_name required");
    if (!CSV_VALID_TYPES.has(adj_type)) errs.push("adj_type invalid");
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) errs.push("amount must be > 0");
    if (incurred_date && !/^\d{4}-\d{2}-\d{2}$/.test(incurred_date)) errs.push("date must be YYYY-MM-DD");
    return { staff_name, adj_type, subtype, amount, incurred_date, reference_no, note, _errors: errs };
  });
}

function CsvImportModal({
  city, cycleId, onImported, onClose,
}: {
  city: string; cycleId: number; onImported: () => void; onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{
    imported: number; skipped: number;
    errors: { row: number; staff_name: string; reason: string }[];
  } | null>(null);

  function dlTemplate() {
    const ex = `John Doe,addition,Overtime,500.00,${new Date().toISOString().slice(0, 10)},,OT work`;
    const blob = new Blob(["﻿" + CSV_TEMPLATE_HEADERS + "\r\n" + ex], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `adj_import_template_${city}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setResult(null); setErr("");
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? "";
      const all = parseCsvText(text);
      if (all.length < 2) { setErr("CSV must have a header row and at least one data row."); setRows([]); return; }
      const [hdr, ...data] = all;
      setRows(buildCsvRows(data, hdr));
    };
    reader.readAsText(file, "UTF-8");
  }

  async function doImport() {
    const valid = rows.filter(r => r._errors.length === 0);
    if (!valid.length) return;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/adjustments/bulk-import?city=${encodeURIComponent(city)}&cycle_id=${cycleId}`, {
        method: "POST",
        body: JSON.stringify({
          rows: valid.map(row => ({
            staff_name: row.staff_name, adj_type: row.adj_type, subtype: row.subtype,
            amount: parseFloat(row.amount), vat: 0,
            incurred_at: row.incurred_date, reference_no: row.reference_no, note: row.note,
          })),
        }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Import failed")); return; }
      const data = await r.json() as {
        imported: number; skipped: number;
        errors: { row: number; staff_name: string; reason: string }[];
      };
      setResult(data);
      if (data.imported > 0) onImported();
    } catch {
      setErr("Network error — please try again");
    } finally { setBusy(false); }
  }

  const validCount = rows.filter(r => r._errors.length === 0).length;
  const invalidCount = rows.filter(r => r._errors.length > 0).length;
  const lbl = "block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className={`${GLASS_CARD} w-full max-w-3xl p-6 relative my-8`}>
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-500 hover:text-white"><X size={18} /></button>
        <h3 className="text-lg font-semibold text-white mb-1">Import Adjustments from CSV</h3>
        <p className="text-sm text-zinc-400 mb-5">Bulk-import Net Additions / Deductions for this payroll cycle.</p>

        <div className="mb-5">
          <p className={lbl}>Step 1 — Download template (optional)</p>
          <button className={SMALL_BUTTON} onClick={dlTemplate}><Download size={12} />Download Template</button>
          <p className="text-xs text-zinc-500 mt-1">
            Columns: staff_name · adj_type (addition / deduction / recurring_deduction) · subtype · amount · incurred_date (YYYY-MM-DD) · reference_no · note
          </p>
        </div>

        <div className="mb-5">
          <p className={lbl}>Step 2 — Select your CSV file</p>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <button className={SMALL_BUTTON} onClick={() => fileRef.current?.click()}>
              <Upload size={12} />{fileName || "Choose file…"}
            </button>
            {fileName && <span className="text-xs text-zinc-400">{rows.length} data row(s) parsed</span>}
          </div>
        </div>

        {err && <p className={`${BADGE_ERROR} mb-4 w-full justify-center py-2 rounded-xl text-sm`}>{err}</p>}

        {rows.length > 0 && !result && (
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <p className={lbl + " mb-0"}>Preview — {rows.length} row(s)</p>
              {validCount > 0 && <span className={`${BADGE_SUCCESS} text-[10px]`}>{validCount} valid</span>}
              {invalidCount > 0 && <span className={`${BADGE_ERROR} text-[10px]`}>{invalidCount} invalid</span>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10 max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900/90">
                  <tr>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>#</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>Staff Name</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>Type</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>Sub-type</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-right`}>Amount</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>Date</th>
                    <th className={`${TABLE_HEADER} px-2 py-2 text-left`}>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={row._errors.length === 0 ? TABLE_ROW : "bg-red-500/10 border-b border-red-500/20"}>
                      <td className="px-2 py-1.5 text-zinc-500">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-white">
                        {row.staff_name ? row.staff_name : <span className="text-red-400 italic">missing</span>}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-300">{row.adj_type}</td>
                      <td className="px-2 py-1.5 text-zinc-400">{row.subtype || "—"}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${row.adj_type === "addition" ? "text-emerald-400" : "text-red-400"}`}>
                        {row.amount}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400">{row.incurred_date || "—"}</td>
                      <td className="px-2 py-1.5">
                        {row._errors.length > 0
                          ? <span className="text-red-400">{row._errors.join("; ")}</span>
                          : <span className="text-emerald-500">✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invalidCount > 0 && (
              <p className="text-xs text-amber-400 mt-2">
                {invalidCount} row(s) with errors will be skipped — only {validCount} valid row(s) will be imported.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="font-semibold text-emerald-400 mb-1">
              Import complete — {result.imported} row(s) imported{result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-red-400 space-y-0.5 mt-2">
                {result.errors.map((e, idx) => (
                  <li key={idx}>Row {e.row} ({e.staff_name}): {e.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className={SECONDARY_BUTTON} onClick={onClose}>{result ? "Close" : "Cancel"}</button>
          {!result && (
            <button className={PRIMARY_BUTTON} disabled={validCount === 0 || busy} onClick={() => { void doImport(); }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={15} />}
              {busy ? "Importing…" : `Import ${validCount} row(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdjustmentsPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const role = auth?.role ?? "";

  useEffect(() => {
    const ok = role === "HQ" || role === "ADMIN" || ["MANAGEMENT","MANILA_MANAGEMENT","HR_MANAGER"].includes(role);
    if (!ok) router.replace("/week");
  }, [role, router]);

  const [city, setCity] = useState<"dubai" | "manila">(() => {
    const a = getAuth();
    return (a as { city?: string } | null)?.city?.toLowerCase() === "dubai" ? "dubai" : "manila";
  });
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<Adjustment["adj_type"]>("addition");
  const [editingAdj, setEditingAdj] = useState<Adjustment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const cycleLoadRef = useRef(0);
  const loadCountRef = useRef(0);

  const loadCycles = useCallback(async (c: string) => {
    const id = ++cycleLoadRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles?city=${encodeURIComponent(c)}`);
      if (id !== cycleLoadRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load cycles")); return; }
      const data = await r.json() as { cycles: Cycle[] };
      setCycles(data.cycles);
      if (data.cycles.length > 0) setSelectedCycle(prev => prev ?? data.cycles[0]);
    } catch {
      if (id === cycleLoadRef.current) setErr("Network error — please try again");
    } finally {
      if (id === cycleLoadRef.current) setBusy(false);
    }
  }, []);

  const loadAdjustments = useCallback(async (cycleId: number, c: string) => {
    const id = ++loadCountRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/adjustments?city=${encodeURIComponent(c)}&cycle_id=${cycleId}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load adjustments")); setAdjustments([]); return; }
      const data = await r.json() as { adjustments: Adjustment[] };
      setAdjustments(data.adjustments);
    } catch {
      if (id === loadCountRef.current) { setErr("Network error — please try again"); setAdjustments([]); }
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    setSelectedCycle(null);
    setCycles([]);
    setAdjustments([]);
    void loadCycles(city);
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedCycle) void loadAdjustments(selectedCycle.id, city);
  }, [selectedCycle, city]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteAdj(id: string) {
    if (!confirm("Delete this adjustment? This cannot be undone.")) return;
    setErr(""); setDeletingId(id);
    try {
      const r = await apiFetch(`${API}/adjustments/${id}?city=${encodeURIComponent(city)}`, { method: "DELETE" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to delete adjustment")); return; }
      setAdjustments(prev => prev.filter(a => a.id !== id));
    } catch {
      setErr("Network error — please try again");
    } finally { setDeletingId(null); }
  }

  function onAdjSaved(a: Adjustment) {
    setAdjustments(prev => {
      const idx = prev.findIndex(x => x.id === a.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = a; return next; }
      return [a, ...prev];
    });
    setShowModal(false);
    setEditingAdj(null);
  }

  function downloadCSV() {
    if (!selectedCycle || adjustments.length === 0) return;
    const header = ["Staff Name","Type","Sub-type","Amount","VAT","Date Incurred","Reference","Note","Source"];
    const csvRows = adjustments.map(a => [
      a.staff_name, ADJ_LABELS[a.adj_type], a.subtype,
      a.amount, a.vat, a.incurred_at ?? "", a.reference_no, a.note, a.source,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `adjustments_${city}_${selectedCycle.year}_${String(selectedCycle.month).padStart(2,"0")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  const filtered = useMemo(() => {
    let list = adjustments;
    if (typeFilter !== "all") list = list.filter(a => a.adj_type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(a => a.staff_name.toLowerCase().includes(q) || a.subtype.toLowerCase().includes(q));
    }
    return list;
  }, [adjustments, typeFilter, search]);

  const typeBadge = (type: string) => {
    if (type === "addition") return BADGE_SUCCESS;
    if (type === "deduction") return BADGE_ERROR;
    return BADGE_WARNING;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-slate-900 to-zinc-900 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Payroll Adjustments</h1>
          <p className="mt-1 text-sm text-zinc-400">Additions, deductions, and recurring adjustments per cycle</p>
        </div>
        <div className="flex items-center gap-2">
          {(["dubai","manila"] as const).map(c => (
            <button key={c} onClick={() => setCity(c)}
              className={city === c ? TAB_ACTIVE : TAB_INACTIVE}>
              {c === "dubai" ? "Dubai" : "Manila"}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className={`${BADGE_ERROR} mb-4 w-full justify-center py-3 rounded-xl text-sm`}>
          <AlertCircle size={14} />{err}
        </div>
      )}

      {/* Cycle + Toolbar */}
      <div className={`${GLASS_CARD} p-4 mb-6`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cycle</label>
            <SelectDark
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
              value={selectedCycle ? String(selectedCycle.id) : ""}
              onChange={v => setSelectedCycle(cycles.find(x => x.id === Number(v)) ?? null)}
              options={[
                ...(cycles.length === 0 ? [{ value: "", label: "No cycles" }] : []),
                ...cycles.map(c => ({ value: String(c.id), label: `${MONTHS[c.month - 1]} ${c.year} — ${c.status}` })),
              ]}
            />
          </div>
          {selectedCycle && (
            <span className={selectedCycle.status === "open" ? BADGE_SUCCESS : BADGE_INFO}>{selectedCycle.status}</span>
          )}
          <div className="ml-auto flex gap-2 flex-wrap">
            <button className={SMALL_BUTTON} onClick={() => selectedCycle && void loadAdjustments(selectedCycle.id, city)} disabled={busy}>
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} />Refresh
            </button>
            {adjustments.length > 0 && (
              <button className={SMALL_BUTTON} onClick={downloadCSV}><Download size={12} />Download</button>
            )}
            <button className={SMALL_BUTTON} disabled={!selectedCycle || busy}
              onClick={() => setShowCsvImport(true)}>
              <Upload size={12} />Import CSV
            </button>
            {/* New Adjustment group */}
            <button className={`${PRIMARY_BUTTON} text-sm py-2 px-3 flex items-center gap-1`}
              disabled={!selectedCycle || busy}
              onClick={() => { setModalType("addition"); setEditingAdj(null); setShowModal(true); }}>
              <Plus size={14} />Addition
            </button>
            <button className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!selectedCycle || busy}
              onClick={() => { setModalType("deduction"); setEditingAdj(null); setShowModal(true); }}>
              <Plus size={14} />Deduction
            </button>
            <button className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!selectedCycle || busy}
              onClick={() => { setModalType("recurring_deduction"); setEditingAdj(null); setShowModal(true); }}>
              <Plus size={14} />Recurring
            </button>
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input className="rounded-xl border border-white/10 bg-white/6 px-4 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 min-w-[220px]"
          placeholder="Search by name or sub-type…" value={search} onChange={e => setSearch(e.target.value)} />
        <SelectDark className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All Types" },
            { value: "addition", label: "Additions" },
            { value: "deduction", label: "Deductions" },
            { value: "recurring_deduction", label: "Recurring" },
          ]}
        />
        <span className={BADGE_INFO + " self-center"}>{filtered.length} records</span>
      </div>

      {/* Table */}
      <div className={GLASS_CARD}>
        {busy && adjustments.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-violet-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-white/30">
            <Plus size={32} />
            <p className="text-sm">{adjustments.length > 0 ? "No records match the filter" : "No adjustments for this cycle"}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-6" />
                <th className={`${TABLE_HEADER} text-left px-3 py-3`}>Employee</th>
                <th className={`${TABLE_HEADER} text-left px-3 py-3`}>Type</th>
                <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Amount</th>
                <th className={`${TABLE_HEADER} text-center px-3 py-3`}>Date</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(adj => (
                <Fragment key={adj.id}>
                  <tr className={TABLE_ROW}>
                    <td className="pl-3">
                      <button className="text-zinc-500 hover:text-violet-300 transition-colors"
                        onClick={() => setExpandedId(expandedId === adj.id ? null : adj.id)}>
                        {expandedId === adj.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className={`${TABLE_CELL} px-3`}>
                      <p className="font-medium text-white">{adj.staff_name}</p>
                    </td>
                    <td className={`${TABLE_CELL} px-3`}>
                      <span className={`${typeBadge(adj.adj_type)} text-[10px]`}>{ADJ_LABELS[adj.adj_type]}</span>
                      {adj.subtype && <p className="text-xs text-zinc-500 mt-0.5">{adj.subtype}</p>}
                    </td>
                    <td className={`${TABLE_CELL} px-3 text-right tabular-nums font-medium ${adj.adj_type === "addition" ? "text-emerald-400" : "text-red-400"}`}>
                      {adj.adj_type === "addition" ? "+" : "-"}{adj.amount.toFixed(2)}
                    </td>
                    <td className={`${TABLE_CELL} px-3 text-center text-xs text-zinc-400`}>
                      {adj.incurred_at?.slice(0, 10) ?? "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button className={SMALL_BUTTON + " p-1.5"}
                          onClick={() => { setEditingAdj(adj); setModalType(adj.adj_type); setShowModal(true); }}>
                          <Pencil size={12} />
                        </button>
                        <button className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                          disabled={deletingId === adj.id}
                          onClick={() => { void deleteAdj(adj.id); }}>
                          {deletingId === adj.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === adj.id && (
                    <tr key={`${adj.id}-expanded`} className="bg-white/3 border-t border-white/5">
                      <td />
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1">Reference No</p>
                            <p className="text-zinc-300">{adj.reference_no || "—"}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1">Note / Remarks</p>
                            <p className="text-zinc-300">{adj.note || "—"}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1">Source</p>
                            <p className="text-zinc-300 capitalize">{adj.source}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && selectedCycle && (
        <CsvImportModal
          city={city}
          cycleId={selectedCycle.id}
          onImported={() => void loadAdjustments(selectedCycle.id, city)}
          onClose={() => setShowCsvImport(false)}
        />
      )}

      {/* Adjustment Modal */}
      {showModal && selectedCycle && (
        <AdjModal
          city={city}
          cycleId={selectedCycle.id}
          adj={editingAdj}
          defaultType={modalType}
          onSave={onAdjSaved}
          onClose={() => { setShowModal(false); setEditingAdj(null); setErr(""); }}
        />
      )}
    </div>
  );
}
