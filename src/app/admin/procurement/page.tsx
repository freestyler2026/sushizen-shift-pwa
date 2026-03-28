"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi, setAuth } from "@/lib/auth";

type ReqItem = {
  item_name: string;
  category: string;
  qty: number;
  unit_price: number;
  vendor_name: string;
};

type ReqRow = {
  id: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  urgent_flag: boolean;
  status: string;
  current_approval_level: number;
};

type ExceptionRow = {
  id: string;
  request_id: string;
  rule_code: string;
  severity: string;
  score: number;
  status: string;
  request_no: string;
};

type ImprovementRow = {
  id: string;
  month_key: string;
  owner_name: string;
  issue_title: string;
  action_plan: string;
  due_date: string | null;
  status: string;
  result_note: string;
  updated_by: string;
  updated_at: string;
  created_at: string;
};

type ChecklistTemplateItem = {
  code: string;
  label: string;
  required: boolean;
  guide: string;
};

type ChecklistItemState = ChecklistTemplateItem & {
  done: boolean;
  note: string;
  updatedAt?: string;
};

type ImportSyncResult = {
  record_count: number;
  inserted_count: number;
  sheet_count: number;
  sheet_names: string[];
  month_keys: string[];
  store_counts: Record<string, number>;
  order_type_counts: Record<string, number>;
  date_range?: { from?: string; to?: string };
};

const DAILY_CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  { code: "stock_count", label: "Today stock was checked before ordering", required: true, guide: "Verify actual stock and avoid duplicate purchase." },
  { code: "vendor_quote", label: "Vendor price was checked against latest quote", required: true, guide: "Confirm the price is still valid before submitting." },
  { code: "qty_reason", label: "Order quantity has a clear reason", required: true, guide: "Match quantity to usage, buffer, or urgent need." },
  { code: "new_vendor_review", label: "New vendor risk was reviewed if applicable", required: false, guide: "Use note field when buying from a new vendor." },
  { code: "urgent_reason", label: "Urgent reason was reviewed if marked urgent", required: false, guide: "Explain why the request cannot wait for standard flow." },
  { code: "docs_ready", label: "Invoice, quote, or supporting note is ready", required: true, guide: "Keep procurement evidence ready for audit." },
];

function monthKeyOf(dateValue: string): string {
  const s = String(dateValue || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (m) return `${m[1]}-${m[2]}`;
  return monthNow();
}

function checklistIssueTitle(city: string, dateValue: string, code: string): string {
  return `DAILY_CHECK:${String(city || "manila").toLowerCase()}:${dateValue}:${code}`;
}

function buildChecklistState(rows: ImprovementRow[], city: string, dateValue: string): ChecklistItemState[] {
  const rowMap = new Map<string, ImprovementRow>();
  const prefix = `DAILY_CHECK:${String(city || "manila").toLowerCase()}:${dateValue}:`;
  rows.forEach((row) => {
    const issueTitle = String(row.issue_title || "");
    if (!issueTitle.startsWith(prefix)) return;
    const code = issueTitle.slice(prefix.length).trim();
    if (code) rowMap.set(code, row);
  });
  return DAILY_CHECKLIST_TEMPLATE.map((item) => {
    const row = rowMap.get(item.code);
    const status = String(row?.status || "").toUpperCase();
    return {
      ...item,
      done: status === "DONE" || status === "CLOSED" || status === "COMPLETE",
      note: String(row?.result_note || ""),
      updatedAt: row?.updated_at,
    };
  });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminProcurementPage() {
  const apiBase = "";
  const auth = useMemo(() => getAuth(), []);
  const initRef = useRef(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
  const [city, setCity] = useState((String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila"));
  const [storeCode, setStoreCode] = useState("");
  const [requestDate, setRequestDate] = useState(todayIso());
  const [urgent, setUrgent] = useState(false);
  const [newVendor, setNewVendor] = useState(false);
  const [items, setItems] = useState<ReqItem[]>([{ item_name: "", category: "", qty: 1, unit_price: 0, vendor_name: "" }]);
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [queueRows, setQueueRows] = useState<ReqRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [approvalAction, setApprovalAction] = useState<"APPROVE" | "REJECT" | "RETURN">("APPROVE");
  const [approvalNote, setApprovalNote] = useState("");
  const [pin, setPin] = useState(auth?.pin || "");
  const [kpiMonth, setKpiMonth] = useState(monthNow());
  const [kpiSummary, setKpiSummary] = useState<any>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemState[]>(() => buildChecklistState([], String(auth?.city || "manila"), todayIso()));
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncFile, setSyncFile] = useState<File | null>(null);
  const [skipZeroQuantity, setSkipZeroQuantity] = useState(true);
  const [syncResult, setSyncResult] = useState<ImportSyncResult | null>(null);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const checklistStats = useMemo(() => {
    const requiredItems = checklistItems.filter((item) => item.required);
    const doneItems = requiredItems.filter((item) => item.done);
    const pendingItems = requiredItems.filter((item) => !item.done);
    return {
      requiredTotal: requiredItems.length,
      doneTotal: doneItems.length,
      pendingTotal: pendingItems.length,
      pendingLabels: pendingItems.map((item) => item.label),
    };
  }, [checklistItems]);

  const tokenHeaders = useCallback(async () => {
    const latest = getAuth();
    const refreshed = await refreshAuthFromApi(latest);
    let accessToken = refreshed?.accessToken || latest?.accessToken || auth?.accessToken;
    const stepUpToken = refreshed?.stepUpToken || latest?.stepUpToken || auth?.stepUpToken;

    const remintAccessTokenWithPin = async (): Promise<string> => {
      if (!requestedBy.trim() || !pin.trim()) return "";
      const qs = new URLSearchParams({
        staff_name: requestedBy.trim(),
        pin: pin.trim(),
        city,
      }).toString();
      const verifyRes = await fetch(`/api/auth/verify?${qs}`, {
        method: "POST",
        cache: "no-store",
      });
      const verifyText = await verifyRes.text();
      if (!verifyRes.ok) throw new Error(verifyText || `Auth verify failed (${verifyRes.status})`);
      const verifyJson = JSON.parse(verifyText || "{}");
      const remintedToken = String(verifyJson?.access_token || "").trim();
      if (!remintedToken) throw new Error("Access token could not be issued.");
      setAuth({
        staffName: String(verifyJson?.staff_name || requestedBy).trim(),
        city: (String(verifyJson?.city || "manila").toLowerCase() === "manila" ? "manila" : "dubai"),
        role: (verifyJson?.role || refreshed?.role || latest?.role || auth?.role || "STAFF"),
        pin: pin.trim(),
        accessToken: remintedToken,
        stepUpToken: stepUpToken || "",
        stepUpLevel: refreshed?.stepUpLevel || latest?.stepUpLevel || auth?.stepUpLevel,
        stepUpMethod: refreshed?.stepUpMethod || latest?.stepUpMethod || auth?.stepUpMethod,
        stepUpVerifiedAt: refreshed?.stepUpVerifiedAt || latest?.stepUpVerifiedAt || auth?.stepUpVerifiedAt,
        permissions: Array.isArray(verifyJson?.permissions) ? verifyJson.permissions : (refreshed?.permissions || latest?.permissions || auth?.permissions || []),
        mfa: refreshed?.mfa || latest?.mfa || auth?.mfa,
      });
      return remintedToken;
    };

    // Access token may exist but already be expired; verify before using it.
    if (accessToken) {
      const sessionRes = await fetch(`/api/auth/session`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!sessionRes.ok) {
        accessToken = "";
      }
    }

    // Fallback for stale sessions: remint token from currently entered credentials.
    if (!accessToken) {
      accessToken = await remintAccessTokenWithPin();
    }

    if (!accessToken) throw new Error("Please login again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(stepUpToken ? { "X-Step-Up-Token": stepUpToken } : {}),
    };
  }, [auth, city, pin, requestedBy]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const monthKey = monthKeyOf(requestDate);
      const [reqRes, qRes, exRes, kpiRes, checklistRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/procurement/requests?city=${encodeURIComponent(city)}&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/approvals/queue?city=${encodeURIComponent(city)}&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/kpi/summary?city=${encodeURIComponent(city)}&month_key=${encodeURIComponent(kpiMonth)}`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/improvements?city=${encodeURIComponent(city)}&month_key=${encodeURIComponent(monthKey)}&owner_name=${encodeURIComponent(requestedBy.trim())}&limit=200`, { headers, cache: "no-store" }),
      ]);
      const reqText = await reqRes.text();
      const qText = await qRes.text();
      const exText = await exRes.text();
      const kpiText = await kpiRes.text();
      const checklistText = await checklistRes.text();
      if (!reqRes.ok) throw new Error(reqText || "Failed to load requests");
      if (!qRes.ok) throw new Error(qText || "Failed to load queue");
      if (!exRes.ok) throw new Error(exText || "Failed to load exceptions");
      if (!kpiRes.ok) throw new Error(kpiText || "Failed to load KPI");
      if (!checklistRes.ok) throw new Error(checklistText || "Failed to load checklist");
      const reqJson = JSON.parse(reqText || "{}");
      const qJson = JSON.parse(qText || "{}");
      const exJson = JSON.parse(exText || "{}");
      const kpiJson = JSON.parse(kpiText || "{}");
      const checklistJson = JSON.parse(checklistText || "{}");
      setRows(Array.isArray(reqJson?.rows) ? reqJson.rows : []);
      setQueueRows(Array.isArray(qJson?.rows) ? qJson.rows : []);
      setExceptions(Array.isArray(exJson?.rows) ? exJson.rows : []);
      setKpiSummary(kpiJson?.summary || null);
      setChecklistItems(buildChecklistState(Array.isArray(checklistJson?.rows) ? checklistJson.rows : [], city, requestDate));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, city, kpiMonth, requestDate, requestedBy, tokenHeaders]);

  const saveChecklist = async () => {
    if (!requestedBy.trim() || !pin.trim()) {
      setError("Requester name and PIN are required to save checklist.");
      return;
    }
    setChecklistBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const monthKey = monthKeyOf(requestDate);
      for (const item of checklistItems) {
        const res = await fetch(`${apiBase}/api/admin/procurement/improvements/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            month_key: monthKey,
            owner_name: requestedBy.trim(),
            issue_title: checklistIssueTitle(city, requestDate, item.code),
            action_plan: item.label,
            due_date: requestDate,
            status: item.done ? "DONE" : "OPEN",
            result_note: item.note,
            city,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || `Checklist save failed (${res.status})`);
      }
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setChecklistBusy(false);
    }
  };

  const createRequest = async (skipChecklistWarning = false) => {
    const validItems = items.filter((x) => (x.item_name || "").trim());
    if (!validItems.length) {
      setError("At least one item is required.");
      return;
    }
    if (!skipChecklistWarning && checklistStats.pendingTotal > 0) {
      const proceed = window.confirm(
        `Daily checklist has ${checklistStats.pendingTotal} required item(s) still open.\n\n${checklistStats.pendingLabels.join("\n")}\n\nContinue with Create + Submit anyway?`
      );
      if (!proceed) return;
    }
    setSubmitBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/procurement/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          city,
          requested_by: requestedBy,
          store_code: storeCode,
          request_date: requestDate,
          urgent_flag: urgent,
          new_vendor_flag: newVendor,
          items: validItems,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Create failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      const requestId = String(j?.request?.id || "");
      if (requestId && pin.trim()) {
        const submitRes = await fetch(`${apiBase}/api/admin/procurement/requests/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ request_id: requestId, approver_name: requestedBy, pin }),
        });
        const submitText = await submitRes.text();
        if (!submitRes.ok) throw new Error(submitText || `Submit failed (${submitRes.status})`);
      }
      setItems([{ item_name: "", category: "", qty: 1, unit_price: 0, vendor_name: "" }]);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitBusy(false);
    }
  };

  const syncWorkbook = async () => {
    if (!syncFile) {
      setError("Please select an Excel workbook first.");
      return;
    }
    if (!requestedBy.trim() || !pin.trim()) {
      setError("Requester name and PIN are required.");
      return;
    }
    setSyncBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const formData = new FormData();
      formData.set("file", syncFile);
      formData.set("approver_name", requestedBy.trim());
      formData.set("pin", pin.trim());
      formData.set("city", city);
      formData.set("skip_zero_quantity", String(skipZeroQuantity));
      const res = await fetch(`${apiBase}/api/admin/procurement/import/orders-excel`, {
        method: "POST",
        headers,
        body: formData,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Sync failed (${res.status})`);
      const json = JSON.parse(text || "{}");
      setSyncResult({
        record_count: Number(json?.record_count || 0),
        inserted_count: Number(json?.inserted_count || 0),
        sheet_count: Number(json?.sheet_count || 0),
        sheet_names: Array.isArray(json?.sheet_names) ? json.sheet_names : [],
        month_keys: Array.isArray(json?.month_keys) ? json.month_keys : [],
        store_counts: json?.store_counts && typeof json.store_counts === "object" ? json.store_counts : {},
        order_type_counts: json?.order_type_counts && typeof json.order_type_counts === "object" ? json.order_type_counts : {},
        date_range: json?.date_range || {},
      });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const runApproval = async () => {
    if (!selectedRequestId || !pin.trim() || !requestedBy.trim()) {
      setError("Request, approver name, and PIN are required.");
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/procurement/approvals/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          request_id: selectedRequestId,
          action: approvalAction,
          comment: approvalNote,
          approver_name: requestedBy,
          pin,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Approval action failed (${res.status})`);
      setApprovalNote("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      if (can) await loadAll();
    }
    void init();
  }, [auth, loadAll, requestedBy]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Procurement Control ({cityLabel})</div>
        <div className="mt-1 text-sm text-neutral-400">Fraud prevention, approval workflow, exception monitoring, and KPI tracking.</div>
      </div>
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 lg:grid-cols-5">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by / Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select
          value={city}
          onChange={(e) => {
            const nextCity = String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
            setCity(nextCity);
            setRows([]);
            setQueueRows([]);
            setExceptions([]);
            setKpiSummary(null);
            setSyncResult(null);
            setChecklistItems(buildChecklistState([], nextCity, requestDate));
          }}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="Store code" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={newVendor} onChange={(e) => setNewVendor(e.target.checked)} />
          New vendor
        </label>
      </div>

      <div className="rounded-2xl border border-emerald-800/70 bg-emerald-950/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-emerald-100">Excel Sync (Main PR path)</div>
            <div className="mt-1 text-xs text-neutral-400">
              Sync the familiar order workbook, keep imported history, and raise PR from the synced rows. Manual PR entry remains available below as the OS path.
            </div>
          </div>
          <Link href="/admin/procurement/imports" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Imports
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
            Workbook city: {cityLabel}
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setSyncFile(e.target.files?.[0] || null)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm lg:col-span-2"
          />
          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
            <input type="checkbox" checked={skipZeroQuantity} onChange={(e) => setSkipZeroQuantity(e.target.checked)} />
            Skip zero quantity rows
          </label>
          <button
            type="button"
            onClick={() => void syncWorkbook()}
            disabled={syncBusy}
            className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60"
          >
            {syncBusy ? "Syncing..." : "Sync Workbook"}
          </button>
        </div>
        {syncResult ? (
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-neutral-400">Records</div>
              <div className="mt-1 text-sm text-white">{syncResult.record_count}</div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-neutral-400">Sheets</div>
              <div className="mt-1 text-sm text-white">{syncResult.sheet_count}</div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-neutral-400">Months</div>
              <div className="mt-1 text-sm text-white">{syncResult.month_keys.join(", ") || "-"}</div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="text-neutral-400">Date Range</div>
              <div className="mt-1 text-sm text-white">
                {syncResult.date_range?.from || "-"} to {syncResult.date_range?.to || "-"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 md:col-span-2">
              <div className="text-neutral-400">Stores</div>
              <div className="mt-1 text-sm text-white">
                {Object.entries(syncResult.store_counts).map(([key, value]) => `${key}:${value}`).join(" / ") || "-"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 md:col-span-2">
              <div className="text-neutral-400">Types</div>
              <div className="mt-1 text-sm text-white">
                {Object.entries(syncResult.order_type_counts).map(([key, value]) => `${key}:${value}`).join(" / ") || "-"}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Daily Checklist (Requester)</div>
            <div className="mt-1 text-xs text-neutral-400">Daily self-check before procurement submission. Warning only; submit is still allowed.</div>
          </div>
          <div className="text-xs text-neutral-400">
            Completion: {checklistStats.doneTotal}/{checklistStats.requiredTotal}
          </div>
        </div>
        <div className="space-y-2">
          {checklistItems.map((item) => (
            <div key={item.code} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <label className="flex items-start gap-3 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) =>
                      setChecklistItems((prev) => prev.map((row) => (row.code === item.code ? { ...row, done: e.target.checked } : row)))
                    }
                  />
                  <span>
                    {item.label}
                    {item.required ? <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Required</span> : null}
                    <div className="mt-1 text-xs text-neutral-500">{item.guide}</div>
                  </span>
                </label>
                <div className="text-[11px] text-neutral-500">{item.updatedAt ? `Updated: ${String(item.updatedAt).slice(0, 16).replace("T", " ")}` : "Not saved yet"}</div>
              </div>
              <input
                value={item.note}
                onChange={(e) =>
                  setChecklistItems((prev) => prev.map((row) => (row.code === item.code ? { ...row, note: e.target.value } : row)))
                }
                placeholder="Optional note"
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveChecklist}
            disabled={checklistBusy}
            className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60"
          >
            {checklistBusy ? "Saving..." : "Save Checklist"}
          </button>
          <div className="text-xs text-neutral-400">
            {checklistStats.pendingTotal > 0
              ? `${checklistStats.pendingTotal} required item(s) still open`
              : "All required checklist items are complete"}
          </div>
        </div>
        {checklistStats.pendingLabels.length ? (
          <div className="mt-2 text-xs text-amber-300">
            Pending: {checklistStats.pendingLabels.join(" / ")}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
        <div className="mb-2 text-sm font-medium">Manual PR Entry (OS path)</div>
        <div className="mb-3 text-xs text-neutral-400">Use this path for direct OS/manual PR creation. Excel Sync remains available above as the main entry from the existing workbook.</div>
        <div className="space-y-2">
          {items.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              <input
                value={row.item_name}
                onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, item_name: e.target.value } : x)))}
                placeholder="Item name"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <input
                value={row.category}
                onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)))}
                placeholder="Category"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={row.qty}
                onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value || 0) } : x)))}
                placeholder="Qty"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={row.unit_price}
                onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x)))}
                placeholder="Unit price"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <input
                value={row.vendor_name}
                onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, vendor_name: e.target.value } : x)))}
                placeholder="Vendor"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, { item_name: "", category: "", qty: 1, unit_price: 0, vendor_name: "" }])}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900"
          >
            Add Item
          </button>
          <button
            type="button"
            onClick={() => {
              void createRequest();
            }}
            disabled={submitBusy}
            className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60"
          >
            {submitBusy ? "Submitting..." : "Create + Submit"}
          </button>
          <button type="button" onClick={loadAll} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="text-sm font-medium">Requests</div>
          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRequestId(r.id)}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-left text-sm",
                  selectedRequestId === r.id ? "border-amber-500 bg-amber-950/20 text-amber-100" : "border-neutral-800 bg-neutral-950/30 text-neutral-200",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span>{r.request_no}</span>
                  <span>{Number(r.total_amount || 0).toFixed(2)} {currencyCode}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">{r.requested_by} | {r.store_code || "-"} | {r.status}</div>
              </button>
            ))}
            {!rows.length ? <div className="text-xs text-neutral-500">No requests.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="text-sm font-medium">Approval Action</div>
          <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3">
            <select value={approvalAction} onChange={(e) => setApprovalAction(e.target.value as "APPROVE" | "REJECT" | "RETURN")} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
              <option value="RETURN">RETURN</option>
            </select>
            <input value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Comment" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm lg:col-span-2" />
          </div>
          <button type="button" onClick={runApproval} disabled={actionBusy || !selectedRequestId} className="mt-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60">
            {actionBusy ? "Processing..." : "Run Approval Action"}
          </button>
          <div className="mt-3 text-xs text-neutral-400">Queue count: {queueRows.length}</div>
          <div className="mt-1 text-xs text-neutral-400">Open exceptions: {exceptions.filter((x) => x.status === "OPEN").length}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-sm font-medium">KPI Summary ({kpiMonth})</div>
          <input
            type="month"
            value={kpiMonth}
            onChange={(e) => setKpiMonth(e.target.value || monthNow())}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Staff: {kpiSummary?.staff_count ?? 0}</div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Avg Score: {Number(kpiSummary?.avg_score_total || 0).toFixed(2)}</div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">On-time: {Number(kpiSummary?.avg_on_time_rate || 0).toFixed(2)}</div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Price Dev: {Number(kpiSummary?.avg_price_deviation || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
