"use client";

import React, { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

interface CancelRecord {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  category: string | null;
  order_no: string | null;
  time_reported: string | null;
  ordered_items: string | null;
  paid_price: number | null;
  cancellation_reason: string | null;
  kitchen_photo_provided: boolean | null;
  ticket_status: string | null;
  recorded_by: string | null;
  refund_status: string | null;
}

interface EditableRecord extends CancelRecord {
  _uid: string;
  paid_price_str: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  isNew: boolean;
}

const PLATFORMS = ["GrabFood", "FoodPanda"] as const;
const BRANCHES = ["Paranaque", "Taft", "Cubao"] as const;
const CATEGORIES = ["Cancellation", "Incident/Refund"] as const;
const TICKET_STATUS_OPTIONS = [
  "Ticket Sent",
  "No need to send a ticket",
  "Ticket not sent — due date passed",
  "Pending",
] as const;
const CANCEL_REASON_OPTIONS = [
  "Missing item",
  "No rider available",
  "Unable to find or reach customer",
  "Outside service hours",
  "Customer received wrong order",
  "Food was not prepared",
  "Late preparation",
  "Other",
] as const;

const PLATFORM_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  GrabFood: { bg: "#00b14f15", text: "#4ade80", border: "#00b14f40" },
  FoodPanda: { bg: "#d70f6415", text: "#f472b6", border: "#d70f6440" },
};
const BRANCH_COLORS: Record<string, string> = {
  Paranaque: "#6366f1",
  Taft: "#10b981",
  Cubao: "#f59e0b",
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

function emptyRecord(date: string): EditableRecord {
  return {
    _uid: uid(),
    id: 0,
    incident_date: date,
    platform: "GrabFood",
    branch: "Paranaque",
    category: "Cancellation",
    order_no: "",
    time_reported: "",
    ordered_items: "",
    paid_price: null,
    paid_price_str: "",
    cancellation_reason: "",
    kitchen_photo_provided: null,
    ticket_status: "",
    recorded_by: "",
    refund_status: "",
    saving: false,
    saved: false,
    error: null,
    isNew: true,
  };
}

function dbToEditable(r: CancelRecord): EditableRecord {
  return {
    ...r,
    category: r.category || "Cancellation",
    _uid: `db-${r.id}`,
    paid_price_str: r.paid_price != null ? String(r.paid_price) : "",
    saving: false,
    saved: true,
    error: null,
    isNew: false,
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs text-white/40">{children}</label>;
}

function TextIn({
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
      className={`w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:outline-none ${className ?? ""}`}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder ?? ""}
      className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
    />
  );
}

function SelectIn({
  value,
  onChange,
  options,
  placeholder,
  extraValues,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  extraValues?: readonly string[];
}) {
  const extras = (extraValues || []).filter((x) => x && !options.includes(x));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white transition-colors focus:border-indigo-500 focus:outline-none"
    >
      {placeholder ? (
        <option value="" className="bg-gray-900">
          {placeholder}
        </option>
      ) : null}
      {extras.map((o) => (
        <option key={o} value={o} className="bg-gray-900">
          {o}
        </option>
      ))}
      {options.map((o) => (
        <option key={o} value={o} className="bg-gray-900">
          {o}
        </option>
      ))}
    </select>
  );
}

function ToggleBtns({
  value,
  onChange,
  options,
  colorMap,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  colorMap?: Record<string, string>;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? "text-white" : "text-white/30 hover:bg-white/5 hover:text-white/60"
          }`}
          style={value === o.value ? { backgroundColor: colorMap?.[o.value] ?? "#6366f1" } : {}}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RecordCard({
  rec,
  onUpdate,
  onSave,
  onDelete,
}: {
  rec: EditableRecord;
  onUpdate: (field: keyof EditableRecord, value: unknown) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(rec.isNew);
  const ps = PLATFORM_STYLES[rec.platform] ?? PLATFORM_STYLES.GrabFood;
  const hasMin = rec.order_no.trim() !== "" && rec.branch !== "" && rec.platform !== "";
  const price = parseFloat(rec.paid_price_str.replace(/,/g, ""));

  return (
    <div
      className={`rounded-xl border transition-all ${
        rec.saved ? "border-emerald-500/40 bg-emerald-500/5" : rec.error ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded((p) => !p)}>
        <span className="w-4 text-xs text-white/25">{expanded ? "▾" : "▸"}</span>
        <span
          className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: ps.bg, color: ps.text, border: `1px solid ${ps.border}` }}
          onClick={(e) => e.stopPropagation()}
        >
          {rec.platform}
        </span>
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          <TextIn
            value={rec.order_no}
            onChange={(v) => onUpdate("order_no", v)}
            placeholder="Order No. (required — e.g. GF-920 or a97i-xxxx)"
          />
        </div>
        {!Number.isNaN(price) && price > 0 ? (
          <span className="whitespace-nowrap text-sm font-semibold text-white">₱{price.toLocaleString("en-PH")}</span>
        ) : null}
        {rec.category ? (
          <span
            className={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-xs sm:block ${
              rec.category === "Cancellation" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {rec.category}
          </span>
        ) : null}
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {rec.saving ? (
            <span className="animate-pulse text-xs text-white/30">Saving…</span>
          ) : rec.saved ? (
            <span className="text-xs font-medium text-emerald-400">✓ Saved</span>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={!hasMin}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                hasMin ? "bg-indigo-600 text-white hover:bg-indigo-500" : "cursor-not-allowed bg-white/5 text-white/20"
              }`}
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-white/20 transition-colors hover:bg-red-400/10 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-4" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Platform</Label>
              <ToggleBtns
                value={rec.platform}
                onChange={(v) => onUpdate("platform", v)}
                options={PLATFORMS.map((p) => ({ label: p, value: p }))}
                colorMap={{ GrabFood: "#00b14f", FoodPanda: "#d70f64" }}
              />
            </div>
            <div>
              <Label>Branch</Label>
              <ToggleBtns
                value={rec.branch}
                onChange={(v) => onUpdate("branch", v)}
                options={BRANCHES.map((b) => ({ label: b, value: b }))}
                colorMap={BRANCH_COLORS}
              />
            </div>
            <div>
              <Label>Category</Label>
              <ToggleBtns
                value={rec.category || "Cancellation"}
                onChange={(v) => onUpdate("category", v)}
                options={CATEGORIES.map((c) => ({ label: c === "Incident/Refund" ? "Incident" : c, value: c }))}
                colorMap={{ Cancellation: "#ef4444", "Incident/Refund": "#f59e0b" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label>Time Reported</Label>
              <input
                type="time"
                value={rec.time_reported ?? ""}
                onChange={(e) => onUpdate("time_reported", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white transition-colors focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Paid Price (PHP)</Label>
              <input
                type="text"
                inputMode="decimal"
                value={rec.paid_price_str}
                onChange={(e) => onUpdate("paid_price_str", e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-right text-sm text-white transition-colors placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Kitchen Photo</Label>
              <ToggleBtns
                value={rec.kitchen_photo_provided == null ? "" : rec.kitchen_photo_provided ? "yes" : "no"}
                onChange={(v) => onUpdate("kitchen_photo_provided", v === "yes" ? true : v === "no" ? false : null)}
                options={[
                  { label: "Yes", value: "yes" },
                  { label: "No", value: "no" },
                  { label: "—", value: "" },
                ]}
                colorMap={{ yes: "#10b981", no: "#ef4444", "": "#374151" }}
              />
            </div>
            <div>
              <Label>Recorded By</Label>
              <TextIn value={rec.recorded_by ?? ""} onChange={(v) => onUpdate("recorded_by", v)} placeholder="Staff name" />
            </div>
          </div>
          <div>
            <Label>Ordered Items</Label>
            <TextArea
              value={rec.ordered_items ?? ""}
              onChange={(v) => onUpdate("ordered_items", v)}
              placeholder="e.g. Tokyo Umami Shoyu Rammen / ZEN Premium Box 24pcs"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Cancellation Reason</Label>
              <SelectIn
                value={rec.cancellation_reason ?? ""}
                onChange={(v) => onUpdate("cancellation_reason", v)}
                options={CANCEL_REASON_OPTIONS}
                placeholder="Select reason…"
                extraValues={rec.cancellation_reason ? [rec.cancellation_reason] : []}
              />
            </div>
            <div>
              <Label>Ticket Status</Label>
              <SelectIn
                value={rec.ticket_status ?? ""}
                onChange={(v) => onUpdate("ticket_status", v)}
                options={TICKET_STATUS_OPTIONS}
                placeholder="Select status…"
                extraValues={rec.ticket_status ? [rec.ticket_status] : []}
              />
            </div>
          </div>
          <div>
            <Label>Refund / Resolution Notes</Label>
            <TextArea
              value={rec.refund_status ?? ""}
              onChange={(v) => onUpdate("refund_status", v)}
              placeholder="e.g. We will be compensated for the cancelled order…"
              rows={2}
            />
          </div>
          {rec.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">✗ {rec.error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminCancellationInputTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [records, setRecords] = useState<EditableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<"All" | "GrabFood" | "FoodPanda">("All");
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
        setRecords([]);
        return;
      }
      setLoading(true);
      setLoadError("");
      try {
        const qs = new URLSearchParams({ approver_name: nm, pin: p });
        const res = await apiGet<{ ok?: boolean; items?: CancelRecord[] }>(
          `/api/admin/analytics/manila/cancellations/by-date/${encodeURIComponent(date)}?${qs.toString()}`,
        );
        const items = Array.isArray(res?.items) ? res.items : [];
        setRecords(items.map(dbToEditable));
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : "Failed to load");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin],
  );

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  const updateRec = (id: string, field: keyof EditableRecord, value: unknown) => {
    setRecords((prev) =>
      prev.map((r) => (r._uid === id ? { ...r, [field]: value, saved: false, error: null } : r)),
    );
  };

  const addRecord = () => setRecords((prev) => [...prev, emptyRecord(selectedDate)]);

  const saveRecord = async (uid: string) => {
    const rec = records.find((r) => r._uid === uid);
    if (!rec || !rec.order_no.trim()) return;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, error: "Approver name and PIN required" } : r)));
      return;
    }
    setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, saving: true, error: null } : r)));
    try {
      const price = parseFloat(rec.paid_price_str.replace(/,/g, ""));
      const data = await apiPostJson<{ ok?: boolean; record?: CancelRecord }>("/api/admin/analytics/manila/cancellations/upsert", {
        approver_name: nm,
        pin: p,
        incident_date: selectedDate,
        platform: rec.platform,
        branch: rec.branch,
        category: rec.category?.trim() || null,
        order_no: rec.order_no.trim(),
        time_reported: rec.time_reported?.trim() || null,
        ordered_items: rec.ordered_items?.trim() || null,
        paid_price: Number.isNaN(price) ? null : price,
        cancellation_reason: rec.cancellation_reason?.trim() || null,
        kitchen_photo_provided: rec.kitchen_photo_provided,
        ticket_status: rec.ticket_status?.trim() || null,
        recorded_by: rec.recorded_by?.trim() || null,
        refund_status: rec.refund_status?.trim() || null,
      });
      if (data.record) {
        const row = data.record;
        setRecords((prev) =>
          prev.map((r) =>
            r._uid === uid
              ? {
                  ...dbToEditable(row),
                  _uid: uid,
                  saving: false,
                  saved: true,
                  isNew: false,
                  error: null,
                }
              : r,
          ),
        );
      } else {
        setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, saving: false, saved: true, isNew: false, error: null } : r)));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, saving: false, error: msg } : r)));
    }
  };

  const deleteRecord = async (uid: string) => {
    const rec = records.find((r) => r._uid === uid);
    if (!rec) return;
    if (rec.isNew) {
      setRecords((prev) => prev.filter((r) => r._uid !== uid));
      return;
    }
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, error: "Approver name and PIN required" } : r)));
      return;
    }
    try {
      const qs = new URLSearchParams({
        record_id: String(rec.id),
        approver_name: nm,
        pin: p,
      });
      await apiDelete(`/api/admin/analytics/manila/cancellations/delete?${qs.toString()}`);
      setRecords((prev) => prev.filter((r) => r._uid !== uid));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, error: msg } : r)));
    }
  };

  const saveAll = async () => {
    const snapshot = records.filter((r) => !r.saved && r.order_no.trim() !== "");
    if (!snapshot.length) return;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setSaveAllStatus("error");
      setTimeout(() => setSaveAllStatus("idle"), 3000);
      return;
    }
    setSaveAllStatus("saving");
    let fail = false;
    for (const rec of snapshot) {
      setRecords((prev) => prev.map((r) => (r._uid === rec._uid ? { ...r, saving: true, error: null } : r)));
      try {
        const price = parseFloat(rec.paid_price_str.replace(/,/g, ""));
        const data = await apiPostJson<{ ok?: boolean; record?: CancelRecord }>("/api/admin/analytics/manila/cancellations/upsert", {
          approver_name: nm,
          pin: p,
          incident_date: selectedDate,
          platform: rec.platform,
          branch: rec.branch,
          category: rec.category?.trim() || null,
          order_no: rec.order_no.trim(),
          time_reported: rec.time_reported?.trim() || null,
          ordered_items: rec.ordered_items?.trim() || null,
          paid_price: Number.isNaN(price) ? null : price,
          cancellation_reason: rec.cancellation_reason?.trim() || null,
          kitchen_photo_provided: rec.kitchen_photo_provided,
          ticket_status: rec.ticket_status?.trim() || null,
          recorded_by: rec.recorded_by?.trim() || null,
          refund_status: rec.refund_status?.trim() || null,
        });
        if (data.record) {
          const row = data.record;
          setRecords((prev) =>
            prev.map((r) =>
              r._uid === rec._uid
                ? { ...dbToEditable(row), _uid: rec._uid, saving: false, saved: true, isNew: false, error: null }
                : r,
            ),
          );
        } else {
          setRecords((prev) =>
            prev.map((r) => (r._uid === rec._uid ? { ...r, saving: false, saved: true, isNew: false, error: null } : r)),
          );
        }
      } catch {
        fail = true;
        setRecords((prev) =>
          prev.map((r) => (r._uid === rec._uid ? { ...r, saving: false, saved: false, error: "Save failed" } : r)),
        );
      }
    }
    setSaveAllStatus(fail ? "error" : "done");
    setTimeout(() => setSaveAllStatus("idle"), 3000);
  };

  const visible = filterPlatform === "All" ? records : records.filter((r) => r.platform === filterPlatform);

  const totalPHP = records.reduce((s, r) => {
    const px = parseFloat(r.paid_price_str.replace(/,/g, ""));
    return s + (Number.isNaN(px) ? (r.paid_price ?? 0) : px);
  }, 0);

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
              <h2 className="text-lg font-semibold text-white">Cancellation Input</h2>
              <p className={`${T_CAPTION} mt-1`}>
                Log GrabFood &amp; FoodPanda cancellations. Data appears in Manila Sales Analytics → Cancellations after save.
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

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${selectedDate}T12:00:00`);
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
              const d = new Date(`${selectedDate}T12:00:00`);
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
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white"
          >
            Today
          </button>
        </div>

        {loadError ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{loadError}</div> : null}

        {records.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs">
            <span className="text-white/40">{selectedDate}</span>
            <span className="text-white/60">
              <strong className="text-white">{records.length}</strong> records
            </span>
            <span className="text-white/60">
              <strong className="text-emerald-400">{records.filter((r) => r.platform === "GrabFood").length}</strong> GrabFood &nbsp;/&nbsp;
              <strong className="text-pink-400">{records.filter((r) => r.platform === "FoodPanda").length}</strong> FoodPanda
            </span>
            {totalPHP > 0 ? (
              <span className="ml-auto text-white/60">
                At risk: <strong className="text-amber-400">₱{Math.round(totalPHP).toLocaleString("en-PH")}</strong>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {(["All", "GrabFood", "FoodPanda"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterPlatform === p
                    ? p === "GrabFood"
                      ? "bg-[#00b14f] text-white"
                      : p === "FoodPanda"
                        ? "bg-[#d70f64] text-white"
                        : "bg-indigo-600 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={addRecord}
            className="ml-auto rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
          >
            + Add record
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-white/30">
            <Spinner size="sm" /> Loading {selectedDate}…
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center">
                <p className="mb-3 text-sm text-white/25">
                  No {filterPlatform === "All" ? "" : `${filterPlatform} `}records for {selectedDate}
                </p>
                <button
                  type="button"
                  onClick={addRecord}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  + Add first record
                </button>
              </div>
            ) : (
              visible.map((rec) => (
                <RecordCard
                  key={rec._uid}
                  rec={rec}
                  onUpdate={(field, value) => updateRec(rec._uid, field, value)}
                  onSave={() => void saveRecord(rec._uid)}
                  onDelete={() => void deleteRecord(rec._uid)}
                />
              ))
            )}
          </div>
        )}

        {!loading && visible.length > 0 ? (
          <div className="flex items-center justify-end gap-3 pt-1">
            {saveAllStatus === "done" ? <span className="text-sm font-medium text-emerald-400">✓ All saved!</span> : null}
            {saveAllStatus === "error" ? <span className="text-sm text-red-400">Some records failed — check above.</span> : null}
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saveAllStatus === "saving"}
              className={`rounded-xl px-6 py-2 text-sm font-medium shadow-lg transition-all ${
                saveAllStatus === "saving"
                  ? "cursor-not-allowed bg-indigo-600/40 text-white/40 shadow-none"
                  : "bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-500"
              }`}
            >
              {saveAllStatus === "saving" ? "Saving…" : "Save All"}
            </button>
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/30">
          <p className="mb-2 font-medium text-white/50">How to use</p>
          <p>① Enter Approver + PIN (same as Sales Data Input).</p>
          <p>② Select the date (‹ › or Today).</p>
          <p>③ Click + Add record; enter Order No. (required), then expand to fill fields.</p>
          <p>④ Save per card or use Save All.</p>
          <p>⑤ Same Platform + Order No. overwrites the existing row.</p>
          <p className="pt-1 text-white/20">✕ on a saved row deletes it from the database.</p>
        </div>
      </div>
    </div>
  );
}
