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
  brand: string | null;
  category: string | null;
  order_id: string | null;
  time_reported: string | null;
  ordered_items: string | null;
  basket_amount: number | null;
  total_amount: number | null;
  refund_amount: number | null;
  compensation_amount: number | null;
  cancellation_reason: string | null;
  encoded_by: string | null;
  customer_note: string | null;
  photo_status: string | null;
  double_checked_by: string | null;
  email_status: string | null;
  kitchen_notes: string | null;
  platform_notes: string | null;
  refund_status: string | null;
}

interface EditableRecord extends CancelRecord {
  _uid: string;
  basket_str: string;
  total_str: string;
  refund_str: string;
  comp_str: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  isNew: boolean;
}

const PLATFORMS = ["Careem", "Keeta", "Talabat"] as const;
const BRANCHES = ["Business Bay", "Arjan", "Al Barsha", "Al Hudaiba", "JLT"] as const;
const BRANDS = ["Sushi ZEN", "Ramen ZEN", "All Veggie"] as const;
const CATEGORIES = ["Cancellation", "Refund/Complaint"] as const;
const CANCEL_REASON_OPTIONS = [
  "avoidable cancellation",
  "Bad weather",
  "Bug in the food",
  "Cancelled by Careem",
  "Captain not found (Automatic CNF)",
  "Captain unprofessional behavior.",
  "Change of mind – customer cancelled",
  "Customer address issues",
  "Customer cancelled; due to order delay",
  "Customer change of mind",
  "Customer did not receive food items",
  "Customer left due to vendor delay",
  "Customer never received the order",
  "Customer received inedible/spilled food",
  "Customer received wrong order",
  "Customer refuses/is unable to pay for the order",
  "Customer wrong number/location",
  "Delivered without notification",
  "Delivery cancelled from CPS",
  "Delivery cancelled from CPS (Solutions/RH side)",
  "Delivery Delayed",
  "Delivery Error",
  "Delivery person unable to continue delivery",
  "Delivery Takes Too Long",
  "duplicate order",
  "Food is overcooked/burnt",
  "Food is undercooked",
  "Food Quality",
  "Food Quality Issues",
  "Food Sold Out",
  "Foul Smell",
  "Fraudulent order",
  "Hair in the food",
  "Incorrect Address",
  "Incorrect order prepared",
  "Instructions not followed",
  "Item not available",
  "Item not available at this time of day",
  "Item temporarily unavailable",
  "Kitchen too busy to prepare order",
  "Meal ready but delayed courier pickup",
  "Minimum order value not reached",
  "Missing or unavailable items",
  "Missing or unavailable items (Main item)",
  "Missing or unavailable items (Side item)",
  "My Food is not edible (SelfServe)",
  "N/A",
  "Navigation/map issues",
  "No courier accepted the order",
  "No delivery person accepting the order",
  "No Longer Needed Due to Change of Plans",
  "No Order received at restaurant",
  "No order received",
  "No rider available",
  "Not delivered to the address/requested customer pickup",
  "Order by Mistake/Fraud",
  "Order cancelled by user",
  "Order delayed because of captain",
  "Order delayed because of partner",
  "Order modification not possible",
  "Others",
  "Out of kitchen operational hours",
  "Outlet closed",
  "Outlet not responding",
  "Packaging quality issues",
  "Platform compensation for undetermined responsibility",
  "Restaurant not open",
  "Restaurant prepared the wrong order",
  "Restaurant requested order cancellation",
  "Rider met with accident",
  "shipment creation failure (auto pending Cancellation)",
  "Slow delivery or long wait",
  "Slow Food Preparation",
  "Slow Food Preparation, The meal was taken by someone else",
  "Some items didn't match my order request, such as wrong side dishes",
  "Spilled / damaged",
  "Technical problem - reason unknown",
  "The meal was taken by someone else",
  "The restaurant marked meal ready in advance",
  "Traffic Accident",
  "Unable to contact rider",
  "Unable to find or reach customer",
  "Unprofessional Behaviour",
  "Vendor Closed",
  "Vendor Delay",
  "Vendor too busy",
  "Weather Conditions",
  "Wrong item sent",
  "Wrong order received",
] as const;

const PHOTO_STATUS_OPTIONS = [
  "Asked Kitchen for Photo",
  "Asked for confirmation of prep and photo",
  "Kitchen has provided the photo",
  "No need to look for photo",
  "No replies from kitchen",
  "PIC found the photo",
] as const;

const EMAIL_STATUS_OPTIONS = [
  "Email/Ticket has been sent to Careem",
  "No need to send an email, the food was not prepared",
  "Pending for review",
  "The claim is valid, no need to send e-mail",
  "under refund dispute",
] as const;

const PLATFORM_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Careem: { bg: "#00c89615", text: "#34d399", border: "#00c89640" },
  Keeta: { bg: "#ff6b3515", text: "#fb923c", border: "#ff6b3540" },
  Talabat: { bg: "#ff2d5515", text: "#f472b6", border: "#ff2d5540" },
};
const BRANCH_COLORS: Record<string, string> = {
  "Business Bay": "#6366f1",
  Arjan: "#10b981",
  "Al Barsha": "#f59e0b",
  "Al Hudaiba": "#ec4899",
  JLT: "#8b5cf6",
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

function fStr(v: number | null | undefined) {
  return v != null && Number.isFinite(Number(v)) ? String(v) : "";
}

function emptyRecord(date: string): EditableRecord {
  return {
    _uid: uid(),
    id: 0,
    incident_date: date,
    platform: "Careem",
    branch: "Business Bay",
    brand: "Sushi ZEN",
    category: "Cancellation",
    order_id: "",
    time_reported: "",
    ordered_items: "",
    basket_amount: null,
    total_amount: null,
    refund_amount: null,
    compensation_amount: null,
    basket_str: "",
    total_str: "",
    refund_str: "",
    comp_str: "",
    cancellation_reason: "",
    encoded_by: "",
    customer_note: "",
    photo_status: "",
    double_checked_by: "",
    email_status: "",
    kitchen_notes: "",
    platform_notes: "",
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
    brand: r.brand || "Sushi ZEN",
    _uid: `db-${r.id}`,
    basket_str: fStr(r.basket_amount),
    total_str: fStr(r.total_amount),
    refund_str: fStr(r.refund_amount),
    comp_str: fStr(r.compensation_amount),
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

function parseAmt(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
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
  const ps = PLATFORM_STYLES[rec.platform] ?? PLATFORM_STYLES.Careem;
  const oid = (rec.order_id ?? "").trim();
  const hasMin = oid !== "" && rec.branch !== "" && rec.platform !== "";
  const totalPreview = parseAmt(rec.total_str);

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
          <TextIn value={rec.order_id ?? ""} onChange={(v) => onUpdate("order_id", v)} placeholder="Order ID (required)" />
        </div>
        {totalPreview != null && totalPreview > 0 ? (
          <span className="whitespace-nowrap text-sm font-semibold text-white">AED {totalPreview.toLocaleString("en-AE")}</span>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Platform</Label>
              <ToggleBtns
                value={rec.platform}
                onChange={(v) => onUpdate("platform", v)}
                options={PLATFORMS.map((p) => ({ label: p, value: p }))}
                colorMap={{ Careem: "#00c896", Keeta: "#ff6b35", Talabat: "#ff2d55" }}
              />
            </div>
            <div>
              <Label>Branch</Label>
              <ToggleBtns
                value={rec.branch}
                onChange={(v) => onUpdate("branch", v)}
                options={BRANCHES.map((b) => ({ label: b === "Business Bay" ? "Biz Bay" : b === "Al Hudaiba" ? "Hudaiba" : b, value: b }))}
                colorMap={BRANCH_COLORS}
              />
            </div>
            <div>
              <Label>Brand</Label>
              <ToggleBtns
                value={rec.brand || "Sushi ZEN"}
                onChange={(v) => onUpdate("brand", v)}
                options={BRANDS.map((b) => ({ label: b.replace(" ZEN", ""), value: b }))}
                colorMap={{ "Sushi ZEN": "#6366f1", "Ramen ZEN": "#f59e0b" }}
              />
            </div>
            <div>
              <Label>Category</Label>
              <ToggleBtns
                value={rec.category || "Cancellation"}
                onChange={(v) => onUpdate("category", v)}
                options={CATEGORIES.map((c) => ({ label: c === "Refund/Complaint" ? "Refund" : c, value: c }))}
                colorMap={{ Cancellation: "#ef4444", "Refund/Complaint": "#f59e0b" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <Label>Time Reported</Label>
              <input
                type="time"
                value={rec.time_reported ?? ""}
                onChange={(e) => onUpdate("time_reported", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Basket (AED)</Label>
              <input
                type="text"
                inputMode="decimal"
                value={rec.basket_str}
                onChange={(e) => onUpdate("basket_str", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-right text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Total (AED)</Label>
              <input
                type="text"
                inputMode="decimal"
                value={rec.total_str}
                onChange={(e) => onUpdate("total_str", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-right text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Refund (AED)</Label>
              <input
                type="text"
                inputMode="decimal"
                value={rec.refund_str}
                onChange={(e) => onUpdate("refund_str", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-right text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <Label>Compensation (AED) — Keeta</Label>
              <input
                type="text"
                inputMode="decimal"
                value={rec.comp_str}
                onChange={(e) => onUpdate("comp_str", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-right text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <Label>Ordered Items</Label>
            <TextArea value={rec.ordered_items ?? ""} onChange={(v) => onUpdate("ordered_items", v)} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Cancellation Reason</Label>
              <SelectIn
                value={rec.cancellation_reason ?? ""}
                onChange={(v) => onUpdate("cancellation_reason", v)}
                options={CANCEL_REASON_OPTIONS}
                placeholder="Select…"
                extraValues={rec.cancellation_reason ? [rec.cancellation_reason] : []}
              />
            </div>
            <div>
              <Label>Encoded By</Label>
              <TextIn value={rec.encoded_by ?? ""} onChange={(v) => onUpdate("encoded_by", v)} placeholder="Staff" />
            </div>
          </div>
          <div>
            <Label>Customer Note</Label>
            <TextArea value={rec.customer_note ?? ""} onChange={(v) => onUpdate("customer_note", v)} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Photo Status</Label>
              <SelectIn
                value={rec.photo_status ?? ""}
                onChange={(v) => onUpdate("photo_status", v)}
                options={PHOTO_STATUS_OPTIONS}
                placeholder="Select…"
                extraValues={rec.photo_status ? [rec.photo_status] : []}
              />
            </div>
            <div>
              <Label>Double Checked By — Careem</Label>
              <TextIn value={rec.double_checked_by ?? ""} onChange={(v) => onUpdate("double_checked_by", v)} />
            </div>
          </div>
          <div>
            <Label>Email / Ticket Status</Label>
            <SelectIn
              value={rec.email_status ?? ""}
              onChange={(v) => onUpdate("email_status", v)}
              options={EMAIL_STATUS_OPTIONS}
              placeholder="Select…"
              extraValues={rec.email_status ? [rec.email_status] : []}
            />
          </div>
          <div>
            <Label>Kitchen Notes</Label>
            <TextArea value={rec.kitchen_notes ?? ""} onChange={(v) => onUpdate("kitchen_notes", v)} rows={2} />
          </div>
          <div>
            <Label>Platform Response Notes — Careem</Label>
            <TextArea value={rec.platform_notes ?? ""} onChange={(v) => onUpdate("platform_notes", v)} rows={2} />
          </div>
          <div>
            <Label>Refund / Resolution Status</Label>
            <TextArea value={rec.refund_status ?? ""} onChange={(v) => onUpdate("refund_status", v)} rows={2} />
          </div>
          {rec.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">✗ {rec.error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildUpsertBody(
  nm: string,
  p: string,
  selectedDate: string,
  rec: EditableRecord,
): Record<string, unknown> {
  return {
    approver_name: nm,
    pin: p,
    incident_date: selectedDate,
    platform: rec.platform,
    branch: rec.branch,
    brand: rec.brand || "Sushi ZEN",
    category: rec.category?.trim() || null,
    order_id: (rec.order_id ?? "").trim(),
    time_reported: rec.time_reported?.trim() || null,
    ordered_items: rec.ordered_items?.trim() || null,
    basket_amount: parseAmt(rec.basket_str),
    total_amount: parseAmt(rec.total_str),
    refund_amount: parseAmt(rec.refund_str),
    compensation_amount: parseAmt(rec.comp_str),
    cancellation_reason: rec.cancellation_reason?.trim() || null,
    encoded_by: rec.encoded_by?.trim() || null,
    customer_note: rec.customer_note?.trim() || null,
    photo_status: rec.photo_status?.trim() || null,
    double_checked_by: rec.double_checked_by?.trim() || null,
    email_status: rec.email_status?.trim() || null,
    kitchen_notes: rec.kitchen_notes?.trim() || null,
    platform_notes: rec.platform_notes?.trim() || null,
    refund_status: rec.refund_status?.trim() || null,
  };
}

export default function AdminDubaiCancellationInputTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [records, setRecords] = useState<EditableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<"All" | (typeof PLATFORMS)[number]>("All");
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
          `/api/admin/analytics/dubai/cancellations/by-date/${encodeURIComponent(date)}?${qs.toString()}`,
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
    setRecords((prev) => prev.map((r) => (r._uid === id ? { ...r, [field]: value, saved: false, error: null } : r)));
  };

  const addRecord = () => setRecords((prev) => [...prev, emptyRecord(selectedDate)]);

  const saveRecord = async (uid: string) => {
    const rec = records.find((r) => r._uid === uid);
    if (!rec || !(rec.order_id ?? "").trim()) return;
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, error: "Approver name and PIN required" } : r)));
      return;
    }
    setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, saving: true, error: null } : r)));
    try {
      const data = await apiPostJson<{ ok?: boolean; record?: CancelRecord }>(
        "/api/admin/analytics/dubai/cancellations/upsert",
        buildUpsertBody(nm, p, selectedDate, rec),
      );
      if (data.record) {
        const row = data.record;
        setRecords((prev) =>
          prev.map((r) =>
            r._uid === uid ? { ...dbToEditable(row), _uid: uid, saving: false, saved: true, isNew: false, error: null } : r,
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
      const qs = new URLSearchParams({ record_id: String(rec.id), approver_name: nm, pin: p });
      await apiDelete(`/api/admin/analytics/dubai/cancellations/delete?${qs.toString()}`);
      setRecords((prev) => prev.filter((r) => r._uid !== uid));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setRecords((prev) => prev.map((r) => (r._uid === uid ? { ...r, error: msg } : r)));
    }
  };

  const saveAll = async () => {
    const snapshot = records.filter((r) => !r.saved && (r.order_id ?? "").trim() !== "");
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
        const data = await apiPostJson<{ ok?: boolean; record?: CancelRecord }>(
          "/api/admin/analytics/dubai/cancellations/upsert",
          buildUpsertBody(nm, p, selectedDate, rec),
        );
        if (data.record) {
          const row = data.record;
          setRecords((prev) =>
            prev.map((r) =>
              r._uid === rec._uid ? { ...dbToEditable(row), _uid: rec._uid, saving: false, saved: true, isNew: false, error: null } : r,
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

  const totalAed = records.reduce((s, r) => {
    const tx = parseAmt(r.total_str);
    const v = tx != null ? tx : Number(r.total_amount || 0);
    return s + v;
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
              <h2 className="text-lg font-semibold text-white">Dubai Cancellation Input</h2>
              <p className={`${T_CAPTION} mt-1`}>
                Log Careem / Keeta / Talabat cancellations. Reflects in Dubai Sales Analytics → Cancellations after save.
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
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${selectedDate}T12:00:00`);
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayISO())}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:text-white"
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
              <strong className="text-emerald-400">{records.filter((r) => r.platform === "Careem").length}</strong> Careem /{" "}
              <strong className="text-orange-400">{records.filter((r) => r.platform === "Keeta").length}</strong> Keeta /{" "}
              <strong className="text-pink-400">{records.filter((r) => r.platform === "Talabat").length}</strong> Talabat
            </span>
            {totalAed > 0 ? (
              <span className="ml-auto text-white/60">
                Total AED: <strong className="text-amber-400">{Math.round(totalAed).toLocaleString("en-AE")}</strong>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {(["All", "Careem", "Keeta", "Talabat"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterPlatform === p
                    ? p === "Careem"
                      ? "bg-[#00c896] text-white"
                      : p === "Keeta"
                        ? "bg-[#ff6b35] text-white"
                        : p === "Talabat"
                          ? "bg-[#ff2d55] text-white"
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
            className="ml-auto rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
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
                <button type="button" onClick={addRecord} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
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
            {saveAllStatus === "error" ? <span className="text-sm text-red-400">Some records failed.</span> : null}
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saveAllStatus === "saving"}
              className={`rounded-xl px-6 py-2 text-sm font-medium shadow-lg transition-all ${
                saveAllStatus === "saving" ? "cursor-not-allowed bg-indigo-600/40 text-white/40" : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {saveAllStatus === "saving" ? "Saving…" : "Save All"}
            </button>
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/30">
          <p className="mb-2 font-medium text-white/50">How to use</p>
          <p>① Approver + PIN. ② Pick date. ③ Add rows; Order ID + platform + branch required to save.</p>
          <p>④ Same Platform + Order ID updates the existing row.</p>
        </div>
      </div>
    </div>
  );
}
