"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

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
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
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

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please login again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const [reqRes, qRes, exRes, kpiRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/procurement/requests?city=manila&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/approvals/queue?city=manila&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/exceptions?city=manila&limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/api/admin/procurement/kpi/summary?month_key=${encodeURIComponent(kpiMonth)}`, { headers, cache: "no-store" }),
      ]);
      const reqText = await reqRes.text();
      const qText = await qRes.text();
      const exText = await exRes.text();
      const kpiText = await kpiRes.text();
      if (!reqRes.ok) throw new Error(reqText || "Failed to load requests");
      if (!qRes.ok) throw new Error(qText || "Failed to load queue");
      if (!exRes.ok) throw new Error(exText || "Failed to load exceptions");
      if (!kpiRes.ok) throw new Error(kpiText || "Failed to load KPI");
      const reqJson = JSON.parse(reqText || "{}");
      const qJson = JSON.parse(qText || "{}");
      const exJson = JSON.parse(exText || "{}");
      const kpiJson = JSON.parse(kpiText || "{}");
      setRows(Array.isArray(reqJson?.rows) ? reqJson.rows : []);
      setQueueRows(Array.isArray(qJson?.rows) ? qJson.rows : []);
      setExceptions(Array.isArray(exJson?.rows) ? exJson.rows : []);
      setKpiSummary(kpiJson?.summary || null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, kpiMonth, tokenHeaders]);

  const createRequest = async () => {
    const validItems = items.filter((x) => (x.item_name || "").trim());
    if (!validItems.length) {
      setError("At least one item is required.");
      return;
    }
    setSubmitBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/procurement/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          city: "manila",
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
      setApprovalNote("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await loadAll();
    }
    init();
  }, [auth, loadAll]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Procurement Control (Manila)</div>
        <div className="mt-1 text-sm text-neutral-400">Fraud prevention, approval workflow, exception monitoring, and KPI tracking.</div>
      </div>
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 lg:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by / Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
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

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
        <div className="mb-2 text-sm font-medium">Request Items</div>
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
            onClick={createRequest}
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
                  <span>{Number(r.total_amount || 0).toFixed(2)} PHP</span>
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
        <div className="text-sm font-medium">KPI Summary ({kpiMonth})</div>
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
