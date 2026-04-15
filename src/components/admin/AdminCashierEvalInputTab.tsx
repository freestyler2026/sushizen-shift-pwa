"use client";

import React, { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

// ─── API row (matches backend eval_date + fields) ───────────────────────────
interface CashierEvalRow {
  eval_date: string;
  branch: string;
  cashier_name: string;
  pic_at_closing: string | null;
  sales_record_klikit: string | null;
  cash_counting_report: string | null;
  diff_cash_pos: number | null;
  qrph_count_pos: number | null;
  qrph_pictures_uploaded: number | null;
  qrph_number_diff: number | null;
  qrph_total_amount_discord: number | null;
  qrph_amount_pos: number | null;
  qrph_amount_diff: number | null;
  sc_pwd_count_pos: number | null;
  sc_pwd_cashier: string | null;
  sc_pwd_pictures_uploaded: number | null;
  sc_pwd_number_diff: number | null;
}

interface EditableCashier {
  _id: string;
  branch: string;
  cashier_name: string;
  pic_at_closing: string;
  sales_record_klikit: string;
  cash_counting_report: string;
  diff_cash_pos: string;
  qrph_count_pos: string;
  qrph_pictures_uploaded: string;
  qrph_amount_pos: string;
  qrph_total_amount_discord: string;
  sc_pwd_count_pos: string;
  sc_pwd_cashier: string;
  sc_pwd_pictures_uploaded: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  isNew: boolean;
}

const BRANCHES = ["Paranaque", "Taft", "Cubao"] as const;

const BRANCH_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Paranaque: { bg: "#6366f108", border: "#6366f130", text: "#818cf8", dot: "#6366f1" },
  Taft: { bg: "#10b98108", border: "#10b98130", text: "#34d399", dot: "#10b981" },
  Cubao: { bg: "#f59e0b08", border: "#f59e0b30", text: "#fbbf24", dot: "#f59e0b" },
};

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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function numOrNull(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function intOrNull(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function calcDiff(a: string, b: string): number | null {
  const na = numOrNull(a);
  const nb = numOrNull(b);
  if (na == null || nb == null) return null;
  return na - nb;
}

/** ManilaCashierEvaluationTab expects lowercase ok / no */
function okNgUiToApi(v: string): string | null {
  if (v === "OK") return "ok";
  if (v === "NG") return "no";
  if (v.trim() === "") return null;
  return v.trim().toLowerCase().slice(0, 32);
}

function okNgApiToUi(v: string | null | undefined): string {
  const s = (v || "").trim().toLowerCase();
  if (s === "ok") return "OK";
  if (s === "no") return "NG";
  return "";
}

function dbRowToEditable(r: CashierEvalRow): EditableCashier {
  const branch = r.branch;
  const name = r.cashier_name;
  return {
    _id: `${branch}-${name}`,
    branch,
    cashier_name: name,
    pic_at_closing: r.pic_at_closing ?? "",
    sales_record_klikit: okNgApiToUi(r.sales_record_klikit),
    cash_counting_report: okNgApiToUi(r.cash_counting_report),
    diff_cash_pos: r.diff_cash_pos != null ? String(r.diff_cash_pos) : "",
    qrph_count_pos: r.qrph_count_pos != null ? String(r.qrph_count_pos) : "",
    qrph_pictures_uploaded: r.qrph_pictures_uploaded != null ? String(r.qrph_pictures_uploaded) : "",
    qrph_amount_pos: r.qrph_amount_pos != null ? String(r.qrph_amount_pos) : "",
    qrph_total_amount_discord: r.qrph_total_amount_discord != null ? String(r.qrph_total_amount_discord) : "",
    sc_pwd_count_pos: r.sc_pwd_count_pos != null ? String(r.sc_pwd_count_pos) : "",
    sc_pwd_cashier: r.sc_pwd_cashier ?? "",
    sc_pwd_pictures_uploaded: r.sc_pwd_pictures_uploaded != null ? String(r.sc_pwd_pictures_uploaded) : "",
    saving: false,
    saved: false,
    error: null,
    isNew: false,
  };
}

function emptyRow(branch: string): EditableCashier {
  return {
    _id: uid(),
    branch,
    cashier_name: "",
    pic_at_closing: "",
    sales_record_klikit: "",
    cash_counting_report: "",
    diff_cash_pos: "",
    qrph_count_pos: "",
    qrph_pictures_uploaded: "",
    qrph_amount_pos: "",
    qrph_total_amount_discord: "",
    sc_pwd_count_pos: "",
    sc_pwd_cashier: "",
    sc_pwd_pictures_uploaded: "",
    saving: false,
    saved: false,
    error: null,
    isNew: true,
  };
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

async function apiDelete(path: string): Promise<void> {
  const run = () => fetch(`${getApiBase()}${path}`, { method: "DELETE", headers: getAuthHeaders() });
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
    throw new Error(detail || `DELETE failed`);
  }
}

function TextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? ""}
      className={`w-full rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:bg-white/5 focus:outline-none ${className ?? ""}`}
    />
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "0"}
      className="w-full rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-right text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:bg-white/5 focus:outline-none"
    />
  );
}

function OkNgToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10">
      {(["OK", "NG", ""] as const).map((v) => (
        <button
          key={v === "" ? "none" : v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            value === v
              ? v === "OK"
                ? "bg-emerald-600 text-white"
                : v === "NG"
                  ? "bg-red-600 text-white"
                  : "bg-white/10 text-white/50"
              : "text-white/30 hover:bg-white/5 hover:text-white/60"
          }`}
        >
          {v === "" ? "—" : v}
        </button>
      ))}
    </div>
  );
}

function DiffBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-white/20">—</span>;
  const color = value === 0 ? "text-white/50" : value > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

function CashDiffBadge({ value }: { value: string }) {
  const n = numOrNull(value);
  if (n == null) return <span className="text-xs text-white/20">—</span>;
  const color = n === 0 ? "text-white/50" : n > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {n > 0 ? "+" : ""}₱{Math.abs(n).toLocaleString()}
    </span>
  );
}

function CashierCard({
  row,
  onUpdate,
  onSave,
  onDelete,
}: {
  row: EditableCashier;
  onUpdate: (field: keyof EditableCashier, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(row.isNew);

  const qrphNumDiff = calcDiff(row.qrph_pictures_uploaded, row.qrph_count_pos);
  const qrphAmtDiff = calcDiff(row.qrph_total_amount_discord, row.qrph_amount_pos);
  const scPwdNumDiff = calcDiff(row.sc_pwd_pictures_uploaded, row.sc_pwd_count_pos);

  const hasName = row.cashier_name.trim() !== "";

  return (
    <div
      className={`rounded-xl border transition-all ${
        row.saved ? "border-emerald-500/40 bg-emerald-500/5" : row.error ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded((p) => !p)}>
        <span className="w-4 text-xs text-white/30">{expanded ? "▾" : "▸"}</span>

        <div className="flex-1" onClick={(e) => e.stopPropagation()}>
          <TextInput
            value={row.cashier_name}
            onChange={(v) => onUpdate("cashier_name", v)}
            placeholder="Cashier name (required)"
            className="font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          {row.sales_record_klikit ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                row.sales_record_klikit === "OK" ? "bg-emerald-600/30 text-emerald-400" : "bg-red-600/30 text-red-400"
              }`}
            >
              Klikit: {row.sales_record_klikit}
            </span>
          ) : null}
          {row.diff_cash_pos !== "" ? <CashDiffBadge value={row.diff_cash_pos} /> : null}
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {row.saving ? (
            <span className="animate-pulse text-xs text-white/30">Saving…</span>
          ) : row.saved ? (
            <span className="text-xs text-emerald-400">✓ Saved</span>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={!hasName}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                hasName ? "bg-indigo-600 text-white hover:bg-indigo-500" : "cursor-not-allowed bg-white/5 text-white/20"
              }`}
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-white/20 transition-colors hover:bg-red-400/10 hover:text-red-400"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/30">Basic Info</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-white/40">PIC at Closing</label>
                <TextInput value={row.pic_at_closing} onChange={(v) => onUpdate("pic_at_closing", v)} placeholder="Manager name" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Sales Record (Klikit)</label>
                <OkNgToggle value={row.sales_record_klikit} onChange={(v) => onUpdate("sales_record_klikit", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Cash Counting Report</label>
                <OkNgToggle value={row.cash_counting_report} onChange={(v) => onUpdate("cash_counting_report", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Cash Diff (PHP)</label>
                <NumInput value={row.diff_cash_pos} onChange={(v) => onUpdate("diff_cash_pos", v)} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-indigo-400">QRPH</p>
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs text-white/40">Count (POS)</label>
                <NumInput value={row.qrph_count_pos} onChange={(v) => onUpdate("qrph_count_pos", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Pictures Uploaded</label>
                <NumInput value={row.qrph_pictures_uploaded} onChange={(v) => onUpdate("qrph_pictures_uploaded", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">
                  Pic Diff <span className="text-white/20">(auto)</span>
                </label>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-right">
                  <DiffBadge value={qrphNumDiff} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Amount (POS) ₱</label>
                <NumInput value={row.qrph_amount_pos} onChange={(v) => onUpdate("qrph_amount_pos", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Discord Amount ₱</label>
                <NumInput value={row.qrph_total_amount_discord} onChange={(v) => onUpdate("qrph_total_amount_discord", v)} />
              </div>
            </div>
            {qrphAmtDiff != null ? (
              <div className="mt-2 text-right">
                <span className="text-xs text-white/30">Amount Diff: </span>
                <span
                  className={`text-xs font-medium ${
                    qrphAmtDiff === 0 ? "text-white/50" : qrphAmtDiff > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {qrphAmtDiff > 0 ? "+" : ""}₱{Math.abs(qrphAmtDiff).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-amber-400">SC / PWD</p>
            <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-white/40">Count (POS)</label>
                <NumInput value={row.sc_pwd_count_pos} onChange={(v) => onUpdate("sc_pwd_count_pos", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Cashier Name</label>
                <TextInput value={row.sc_pwd_cashier} onChange={(v) => onUpdate("sc_pwd_cashier", v)} placeholder="Cashier" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Pictures Uploaded</label>
                <NumInput value={row.sc_pwd_pictures_uploaded} onChange={(v) => onUpdate("sc_pwd_pictures_uploaded", v)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">
                  Pic Diff <span className="text-white/20">(auto)</span>
                </label>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-right">
                  <DiffBadge value={scPwdNumDiff} />
                </div>
              </div>
            </div>
          </div>

          {row.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">✗ {row.error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminCashierEvalInputTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [selectedBranch, setSelectedBranch] = useState<string>("Paranaque");
  const [cashiers, setCashiers] = useState<EditableCashier[]>([]);
  const [loadingDate, setLoadingDate] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveAllStatus, setSaveAllStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setApproverName((p) => p.trim() || a.staffName || "");
    if (a?.pin) setPin((p) => p.trim() || a.pin || "");
  }, []);

  const loadDate = useCallback(
    async (date: string) => {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm || !p) {
        setLoadError("Enter approver name and PIN (saved from login).");
        setCashiers([]);
        return;
      }
      setLoadingDate(true);
      setLoadError("");
      try {
        const qs = new URLSearchParams({ approver_name: nm, pin: p });
        const res = await apiGet<{ ok?: boolean; items?: CashierEvalRow[] }>(
          `/api/admin/analytics/manila/cashier-evaluations/by-date/${encodeURIComponent(date)}?${qs.toString()}`,
        );
        const items = Array.isArray(res?.items) ? res.items : [];
        setCashiers(items.map(dbRowToEditable));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load");
        setCashiers([]);
      } finally {
        setLoadingDate(false);
      }
    },
    [approverName, pin],
  );

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  const branchCashiers = cashiers.filter((c) => c.branch === selectedBranch);

  const addCashier = () => {
    setCashiers((prev) => [...prev, emptyRow(selectedBranch)]);
  };

  const updateCashier = (id: string, field: keyof EditableCashier, value: string) => {
    setCashiers((prev) =>
      prev.map((c) => (c._id === id ? { ...c, [field]: value, saved: false, error: null } : c)),
    );
  };

  const saveCashier = async (id: string): Promise<boolean> => {
    let captured: EditableCashier | null = null;
    setCashiers((prev) => {
      const row = prev.find((c) => c._id === id);
      if (!row || !row.cashier_name.trim()) return prev;
      captured = row;
      return prev.map((c) => (c._id === id ? { ...c, saving: true, error: null } : c));
    });
    if (!captured) return false;

    const row = captured;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setCashiers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, saving: false, error: "Approver name and PIN required" } : c)),
      );
      return false;
    }

    try {
      await apiPostJson("/api/admin/analytics/manila/cashier-evaluations/upsert", {
        approver_name: nm,
        pin: p,
        date: selectedDate,
        branch: row.branch,
        cashier_name: row.cashier_name.trim(),
        pic_at_closing: row.pic_at_closing.trim() || null,
        sales_record_klikit: okNgUiToApi(row.sales_record_klikit),
        cash_counting_report: okNgUiToApi(row.cash_counting_report),
        diff_cash_pos: numOrNull(row.diff_cash_pos),
        qrph_count_pos: intOrNull(row.qrph_count_pos),
        qrph_pictures_uploaded: intOrNull(row.qrph_pictures_uploaded),
        qrph_amount_pos: numOrNull(row.qrph_amount_pos),
        qrph_total_amount_discord: numOrNull(row.qrph_total_amount_discord),
        sc_pwd_count_pos: intOrNull(row.sc_pwd_count_pos),
        sc_pwd_cashier: row.sc_pwd_cashier.trim() || null,
        sc_pwd_pictures_uploaded: intOrNull(row.sc_pwd_pictures_uploaded),
      });
      const newId = `${row.branch}-${row.cashier_name.trim()}`;
      setCashiers((prev) =>
        prev.map((c) =>
          c._id === id
            ? {
                ...c,
                _id: newId,
                saving: false,
                saved: true,
                isNew: false,
                error: null,
              }
            : c,
        ),
      );
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setCashiers((prev) => prev.map((c) => (c._id === id ? { ...c, saving: false, saved: false, error: msg } : c)));
      return false;
    }
  };

  const deleteCashier = async (id: string) => {
    const row = cashiers.find((c) => c._id === id);
    if (!row) return;
    if (row.isNew) {
      setCashiers((prev) => prev.filter((c) => c._id !== id));
      return;
    }
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setCashiers((prev) => prev.map((c) => (c._id === id ? { ...c, error: "Approver name and PIN required" } : c)));
      return;
    }
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        branch: row.branch,
        cashier_name: row.cashier_name,
        approver_name: nm,
        pin: p,
      });
      await apiDelete(`/api/admin/analytics/manila/cashier-evaluations/delete?${params.toString()}`);
      setCashiers((prev) => prev.filter((c) => c._id !== id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setCashiers((prev) => prev.map((c) => (c._id === id ? { ...c, error: msg } : c)));
    }
  };

  const saveAll = async () => {
    const ids = branchCashiers.filter((c) => !c.saved && c.cashier_name.trim() !== "").map((c) => c._id);
    if (ids.length === 0) return;
    setSaveAllStatus("saving");
    let fail = false;
    for (const id of ids) {
      const ok = await saveCashier(id);
      if (!ok) fail = true;
    }
    setSaveAllStatus(fail ? "error" : "done");
    setTimeout(() => setSaveAllStatus("idle"), 3000);
  };

  return (
    <div className={GLASS_CARD}>
      <div className="space-y-5 p-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-lg font-semibold text-white">Cashier Evaluation Input</h2>
              <p className={`${T_CAPTION} mt-1`}>
                Enter daily cashier evaluation data. Changes reflect immediately in Manila Sales Analytics → Cashier Evaluation.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-[160px]">
              <label className={`${T_LABEL} mb-1 block`}>Approver</label>
              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="min-w-[120px]">
              <label className={`${T_LABEL} mb-1 block`}>PIN</label>
              <input
                type="password"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayISO())}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            Today
          </button>
        </div>

        {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}

        <div className="flex gap-2">
          {BRANCHES.map((b) => {
            const c = BRANCH_COLORS[b];
            const count = cashiers.filter((r) => r.branch === b).length;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBranch(b)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  selectedBranch === b ? "text-white" : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70"
                }`}
                style={
                  selectedBranch === b ? { backgroundColor: c.bg, borderColor: c.border, color: c.text } : undefined
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.dot }} />
                {b}
                {count > 0 ? (
                  <span className="rounded-full px-1.5 py-0.5 text-xs" style={{ backgroundColor: `${c.dot}30`, color: c.text }}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {loadingDate ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Spinner size="sm" /> Loading {selectedDate}…
          </div>
        ) : null}

        {!loadingDate ? (
          <div className="space-y-3">
            {branchCashiers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
                <p className="mb-3 text-sm text-white/30">
                  No cashier data for {selectedBranch} on {selectedDate}
                </p>
                <button
                  type="button"
                  onClick={addCashier}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  + Add first cashier
                </button>
              </div>
            ) : (
              <>
                {branchCashiers.map((row) => (
                  <CashierCard
                    key={row._id}
                    row={row}
                    onUpdate={(field, value) => updateCashier(row._id, field, value)}
                    onSave={() => void saveCashier(row._id)}
                    onDelete={() => void deleteCashier(row._id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addCashier}
                  className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm text-white/30 transition-colors hover:border-white/20 hover:text-white/60"
                >
                  + Add cashier
                </button>
                <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                  {saveAllStatus === "done" ? (
                    <span className="text-sm font-medium text-emerald-400">✓ All saved!</span>
                  ) : null}
                  {saveAllStatus === "error" ? (
                    <span className="text-sm text-red-400">Some records failed. Check cards above.</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveAll()}
                    disabled={
                      saveAllStatus === "saving" ||
                      branchCashiers.every((c) => c.saved || c.cashier_name.trim() === "")
                    }
                    className={`rounded-xl px-6 py-2 text-sm font-medium transition-all ${
                      saveAllStatus === "saving" ||
                      branchCashiers.every((c) => c.saved || c.cashier_name.trim() === "")
                        ? "cursor-not-allowed bg-indigo-600/40 text-white/40"
                        : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                    }`}
                  >
                    {saveAllStatus === "saving" ? "Saving…" : "Save All"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-xs text-white/30">
          <p className="mb-2 font-medium text-white/50">How to use</p>
          <p>① Enter Approver name + PIN (same as Sales Data Input).</p>
          <p>② Select a date → switch branch tabs.</p>
          <p>③ Click &quot;+ Add cashier&quot; to add a cashier card.</p>
          <p>④ Click ▸ on a card to expand, then fill in the fields.</p>
          <p>⑤ QRPH diff and SC/PWD diff are calculated automatically (also persisted on save).</p>
          <p>⑥ Click the Save button on each card to save (or use Save All). Data reflects immediately in Manila Sales Analytics → Cashier Evaluation.</p>
          <p className="pt-1 text-white/20">* Records with the same date, branch, and cashier name will be overwritten.</p>
        </div>
      </div>
    </div>
  );
}
