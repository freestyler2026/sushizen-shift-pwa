"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ShoppingCart } from "lucide-react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi, setAuth } from "@/lib/auth";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

type ReqItem = {
  item_name: string;
  category: string;
  qty: number;
  unit?: string;
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
  const [approvalSuccess, setApprovalSuccess] = useState("");
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
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<{ request_no?: string; store_code?: string; status?: string; total_amount?: number; items?: ReqItem[] } | null>(null);
  const [selectedRequestLoading, setSelectedRequestLoading] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"APPROVE" | "REJECT" | "RETURN">("APPROVE");
  const [approvalNote, setApprovalNote] = useState("");
  const [pin, setPin] = useState(auth?.pin || "");
  const [kpiMonth, setKpiMonth] = useState(monthNow());
  const [kpiSummary, setKpiSummary] = useState<any>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemState[]>(() => buildChecklistState([], String(auth?.city || "manila"), todayIso()));
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [skipZeroQuantity, setSkipZeroQuantity] = useState(true);
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
      let resultStatus = "";
      try { resultStatus = JSON.parse(text)?.request?.status || ""; } catch {}
      setApprovalNote("");
      setError("");
      setApprovalSuccess(
        resultStatus === "APPROVED"
          ? `✓ Approved — request is now APPROVED`
          : resultStatus === "REJECTED"
          ? `✗ Rejected — request is now REJECTED`
          : resultStatus === "RETURNED"
          ? `↩ Returned — request sent back to requester`
          : resultStatus
          ? `Action recorded — status: ${resultStatus}`
          : "Action recorded successfully",
      );
      await loadAll();
    } catch (e: any) {
      setApprovalSuccess("");
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
      const can = canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), city === "dubai" ? "dubai" : "manila");
      setAllowed(can);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      if (can) await loadAll();
    }
    void init();
  }, [auth, city, loadAll, requestedBy]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
          <ShoppingCart className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Procurement Control</h1>
          <p className={T_CAPTION}>Manage requests, vendors, items, and approval workflows</p>
        </div>
      </div>

      {error ? <div className={`${BADGE_ERROR} whitespace-pre-wrap`}>{error}</div> : null}

      <div className={`${GLASS_CARD} mb-6 flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-[180px]">
          <span className={`${T_LABEL} mb-1.5 block`}>Name</span>
          <input
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Requested by / Approver name"
            className={INPUT_CLASS}
          />
        </div>
        <div className="min-w-[140px]">
          <span className={`${T_LABEL} mb-1.5 block`}>Market</span>
          <select
            value={city}
            onChange={(e) => {
              const nextCity = String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila";
              setCity(nextCity);
              setRows([]);
              setQueueRows([]);
              setExceptions([]);
              setKpiSummary(null);
              setChecklistItems(buildChecklistState([], nextCity, requestDate));
            }}
            className={SELECT_CLASS}
          >
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
        </div>
        <div className="min-w-[160px]">
          <span className={`${T_LABEL} mb-1.5 block`}>Store</span>
          <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="Store code" className={INPUT_CLASS} />
        </div>
        <div className="min-w-[180px]">
          <span className={`${T_LABEL} mb-1.5 block`}>Date</span>
          <DatePicker value={requestDate} onChange={setRequestDate} className="w-full" />
        </div>
        <div className="min-w-[140px]">
          <span className={`${T_LABEL} mb-1.5 block`}>PIN</span>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={INPUT_CLASS} />
        </div>
      </div>

      <div className={`${GLASS_CARD} mb-4 p-4`}>
        <h2 className={T_SECTION}>Filters</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input className="h-4 w-4 accent-amber-500" type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input className="h-4 w-4 accent-amber-500" type="checkbox" checked={newVendor} onChange={(e) => setNewVendor(e.target.checked)} />
            New vendor
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input className="h-4 w-4 accent-amber-500" type="checkbox" checked={skipZeroQuantity} onChange={(e) => setSkipZeroQuantity(e.target.checked)} />
            Skip zero quantity rows in Excel sync
          </label>
        </div>
      </div>


      <div className={`${GLASS_CARD} mb-4 p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-sky-400" />
            <h2 className={T_SECTION}>Daily Checklist</h2>
          </div>
          <span className={checklistStats.pendingTotal === 0 ? BADGE_SUCCESS : BADGE_WARNING}>
            {checklistStats.doneTotal} / {checklistStats.requiredTotal} complete
          </span>
        </div>
        <div className="mb-4 h-1 rounded-full bg-white/8">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-500"
            style={{ width: `${checklistStats.requiredTotal ? (checklistStats.doneTotal / checklistStats.requiredTotal) * 100 : 0}%` }}
          />
        </div>
        <div className="space-y-1">
          {checklistItems.map((item) => (
            <div key={item.code} className="border-t border-white/5 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <label className="flex items-start gap-3">
                  <input
                    className="h-4 w-4 accent-amber-500"
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) =>
                      setChecklistItems((prev) => prev.map((row) => (row.code === item.code ? { ...row, done: e.target.checked } : row)))
                    }
                  />
                  <span className="text-sm text-zinc-300">
                    {item.label}
                    {item.required ? <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Required</span> : null}
                    <div className="mt-1 text-xs text-zinc-500">{item.guide}</div>
                  </span>
                </label>
                <div className="text-[11px] text-zinc-500">{item.updatedAt ? `Updated: ${String(item.updatedAt).slice(0, 16).replace("T", " ")}` : "Not saved yet"}</div>
              </div>
              <input
                value={item.note}
                onChange={(e) =>
                  setChecklistItems((prev) => prev.map((row) => (row.code === item.code ? { ...row, note: e.target.value } : row)))
                }
                placeholder="Optional note"
                className={`${INPUT_CLASS} mt-2`}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={saveChecklist} disabled={checklistBusy} className={SECONDARY_BUTTON}>
            {checklistBusy ? "Saving..." : "Save Checklist"}
          </button>
          <div className={T_CAPTION}>
            {checklistStats.pendingTotal > 0
              ? `${checklistStats.pendingTotal} required item(s) still open`
              : "All required checklist items are complete"}
          </div>
        </div>
        {checklistStats.pendingLabels.length ? <div className="mt-2 text-xs text-amber-300">Pending: {checklistStats.pendingLabels.join(" / ")}</div> : null}
      </div>

      <div className={`${GLASS_CARD} p-6`}>
        <div className="mb-2">
          <h2 className={T_SECTION}>Manual PR Entry</h2>
          <p className={T_CAPTION}>Use this path for direct OS/manual PR creation. Excel Sync remains available above as the main entry from the existing workbook.</p>
        </div>
        <div className="space-y-3">
          {items.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              <input value={row.item_name} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, item_name: e.target.value } : x)))} placeholder="Item name" className={INPUT_CLASS} />
              <input value={row.category} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)))} placeholder="Category" className={INPUT_CLASS} />
              <input type="number" value={row.qty} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value || 0) } : x)))} placeholder="Qty" className={INPUT_CLASS} />
              <input type="number" value={row.unit_price} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x)))} placeholder="Unit price" className={INPUT_CLASS} />
              <input value={row.vendor_name} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, vendor_name: e.target.value } : x)))} placeholder="Vendor" className={INPUT_CLASS} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setItems((prev) => [...prev, { item_name: "", category: "", qty: 1, unit_price: 0, vendor_name: "" }])} className={SMALL_BUTTON}>
            Add Item
          </button>
          <button type="button" onClick={() => void createRequest()} disabled={submitBusy} className={PRIMARY_BUTTON}>
            {submitBusy ? "Submitting..." : "Create + Submit"}
          </button>
          <button type="button" onClick={() => void loadAll()} disabled={loading} className={SECONDARY_BUTTON}>
            Refresh
          </button>
        </div>
      </div>

      {(() => {
        const pendingCount = rows.filter((r) => ["SUBMITTED", "IN_REVIEW", "DRAFT"].includes(String(r.status || "").toUpperCase())).length;
        const kpiCards = [
          { id: "requests", label: "Requests", value: rows.length, pending: pendingCount },
          { id: "approvalInbox", label: "Approval Inbox", value: queueRows.length, pending: 0 },
          { id: "openExceptions", label: "Open Exceptions", value: exceptions.filter((x) => x.status === "OPEN").length, pending: 0 },
          { id: "kpiStaff", label: "Staff Count", value: Number(kpiSummary?.staff_count || 0), pending: 0 },
        ];
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 mb-6">
            {kpiCards.map((card, index) => (
              <motion.div key={card.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
                <div className={KPI_CARD}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={KPI_LABEL}>{card.label}</p>
                    {card.pending > 0 && (
                      <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                        {card.pending} pending
                      </span>
                    )}
                  </div>
                  <p className={KPI_VALUE}>{fmtNum(card.value)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <div className="flex items-center justify-between p-4">
            <h2 className={T_SECTION}>Requests</h2>
            <div className="flex items-center gap-2">
              {(() => {
                const pending = rows.filter((r) => ["SUBMITTED", "IN_REVIEW", "DRAFT"].includes(String(r.status || "").toUpperCase())).length;
                return pending > 0 ? (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                    {pending} unprocessed
                  </span>
                ) : null;
              })()}
              <span className={BADGE_INFO}>{rows.length} total</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TABLE_HEADER}>Request</th>
                  <th className={TABLE_HEADER}>Requester</th>
                  <th className={TABLE_HEADER}>Amount</th>
                  <th className={TABLE_HEADER}>Status</th>
                  <th className={TABLE_HEADER}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusBadge =
                    String(r.status || "").toUpperCase() === "APPROVED"
                      ? BADGE_SUCCESS
                      : String(r.status || "").toUpperCase() === "REJECTED"
                        ? BADGE_ERROR
                        : String(r.status || "").toUpperCase() === "RETURNED"
                          ? BADGE_WARNING
                          : BADGE_INFO;
                  return (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <div className="font-medium text-white">{r.request_no}</div>
                        <div className={T_CAPTION}>{r.store_code || "-"} · {r.request_date}</div>
                      </td>
                      <td className={TABLE_CELL}>{r.requested_by}</td>
                      <td className={TABLE_CELL}>{fmtNum(Number(r.total_amount || 0), currencyCode)}</td>
                      <td className={TABLE_CELL}><span className={statusBadge}>{r.status || "-"}</span></td>
                      <td className={TABLE_CELL}>
                        <button
                          type="button"
                          onClick={async () => {
                            setSelectedRequestId(r.id);
                            setSelectedRequestDetail(null);
                            setSelectedRequestLoading(true);
                            try {
                              const headers = await tokenHeaders();
                              const res = await fetch(`${apiBase}/api/admin/procurement/requests/${encodeURIComponent(r.id)}`, { method: "GET", headers, cache: "no-store" });
                              if (res.ok) {
                                const d = await res.json();
                                setSelectedRequestDetail({ request_no: d?.request?.request_no, store_code: d?.request?.store_code, status: d?.request?.status, total_amount: d?.request?.total_amount, items: d?.request?.items || [] });
                              }
                            } catch { /* non-fatal */ }
                            finally { setSelectedRequestLoading(false); }
                          }}
                          className={selectedRequestId === r.id ? `${SMALL_BUTTON} border-amber-500/40 text-amber-300` : SMALL_BUTTON}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr className={TABLE_ROW}>
                    <td className={TABLE_CELL} colSpan={5}>No requests.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${GLASS_CARD} p-6`}>
          <div className="mb-3">
            <h2 className={T_SECTION}>Approval Action</h2>
            <p className={T_CAPTION}>Run procurement approval workflow for the selected request.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <select value={approvalAction} onChange={(e) => setApprovalAction(e.target.value as "APPROVE" | "REJECT" | "RETURN")} className={SELECT_CLASS}>
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
              <option value="RETURN">RETURN</option>
            </select>
            <textarea value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Comment" className={`${TEXTAREA_CLASS} lg:col-span-2`} rows={3} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={runApproval} disabled={actionBusy || !selectedRequestId} className={PRIMARY_BUTTON}>
              {actionBusy ? "Processing..." : "Run Approval Action"}
            </button>
            <button type="button" onClick={() => setApprovalNote("")} className={SECONDARY_BUTTON}>
              Clear Note
            </button>
          </div>
          {approvalSuccess ? (
            <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-sm font-medium text-emerald-300">
              {approvalSuccess}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={BADGE_INFO}>Queue count: {queueRows.length}</span>
            <span className={exceptions.filter((x) => x.status === "OPEN").length > 0 ? BADGE_WARNING : BADGE_SUCCESS}>
              Open exceptions: {exceptions.filter((x) => x.status === "OPEN").length}
            </span>
          </div>

          {/* Selected Request Detail */}
          {selectedRequestLoading ? (
            <div className="mt-4 text-sm text-neutral-500">Loading request detail...</div>
          ) : selectedRequestDetail ? (
            <div className="mt-4 rounded-xl border border-amber-700/30 bg-amber-950/15 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-amber-200">{selectedRequestDetail.request_no || "–"}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {selectedRequestDetail.store_code || "-"} · {selectedRequestDetail.status} · {Number(selectedRequestDetail.total_amount || 0).toFixed(2)} {currencyCode}
                  </div>
                </div>
              </div>
              {(selectedRequestDetail.items?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-white/8">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 bg-black/20 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-left">Vendor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequestDetail.items!.map((item, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="px-3 py-2 text-neutral-200">{item.item_name}</td>
                          <td className="px-3 py-2 text-neutral-400">{item.category || "-"}</td>
                          <td className="px-3 py-2 text-right font-medium text-white">{Number(item.qty || 0)}</td>
                          <td className="px-3 py-2 text-neutral-400">{item.unit || "-"}</td>
                          <td className="px-3 py-2 text-right text-neutral-300">{Number(item.unit_price || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-neutral-400">{item.vendor_name || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="text-xs text-neutral-500">No items found.</div>}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className={T_SECTION}>KPI Summary</h2>
            <p className={T_CAPTION}>{kpiMonth}</p>
          </div>
          <MonthPicker value={kpiMonth} onChange={(value) => setKpiMonth(value || monthNow())} className="w-[220px]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { id: "staff", label: "Staff", value: Number(kpiSummary?.staff_count || 0) },
            { id: "score", label: "Avg Score", value: Number(kpiSummary?.avg_score_total || 0) },
            { id: "ontime", label: "On-time", value: Number(kpiSummary?.avg_on_time_rate || 0) },
            { id: "priceDev", label: "Price Dev", value: Number(kpiSummary?.avg_price_deviation || 0) },
          ].map((card, index) => (
            <motion.div key={card.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>{card.label}</p>
                <p className={KPI_VALUE}>{fmtNum(card.value)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
