"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import ModalScrim from "@/components/ModalScrim";
import {
  LANES, STAGE_LABEL, boardTotals, laneCount, laneIsWork, laneOf, laneOldest,
  laneSplit, openRemovals,
  removalReason, rowKey, stageAlert, stageOf, stageTone,
  type DirectPurchaseRow, type DirectPurchaseItem, type ItemRemoval, type StageSummary,
} from "@/lib/direct-purchase-stage";
import { money } from "@/lib/currency";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  defaultProcurementName,
  defaultProcurementPin,
  procurementJson,
  procurementTokenHeaders,
} from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ShoppingBag,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
  Star,
  ExternalLink,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type CatalogItem = { item_name: string; unit: string; benchmark_unit_price: number; category: string };
type VendorEntry  = { name: string; isRegistered: boolean };

const UNITS = ["kg", "g", "L", "mL", "pc", "box", "bag", "bottle", "pack", "tray", "can"];

function stageBadge(row: DirectPurchaseRow) {
  const label = STAGE_LABEL[stageOf(row)] || stageOf(row);
  const cls = { success: BADGE_SUCCESS, error: BADGE_ERROR, warn: BADGE_WARNING, info: BADGE_INFO }[stageTone(row)];
  return <span className={cls}>{label}</span>;
}

// ─── Inline Edit State ───────────────────────────────────────────────────────

type EditState = {
  vendor_name: string;
  // The id travels with the line so the server can tell a removed line from a
  // renamed one. Empty on a line added here.
  items: { id: string; item_name: string; category: string; qty: string; unit: string; unit_price: string }[];
  reason_code: string;
  reason_note: string;
};

function buildEditState(row: DirectPurchaseRow): EditState {
  return {
    vendor_name: row.po_vendor_name || row.items[0]?.vendor_name || "",
    items: row.items.map((i) => ({
      id:         i.id || "",
      item_name:  i.item_name,
      category:   i.category || "General",
      qty:        String(i.qty),
      unit:       i.unit,
      unit_price: String(i.unit_price),
    })),
    reason_code: "",
    reason_note: "",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

type AlertLogRow = {
  request_id: string;
  request_no: string;
  alert_kind: string;
  recipient_name: string;
  delivery: string;
  created_at: string;
};

type AlertPayload = {
  threshold_hours: number;
  go_live_at: string | null;
  log: AlertLogRow[];
  pending_count: number;
  unreachable: {
    staff_name: string;
    alertable_requests: number;
    open_requests: number;
    last_30_days: number;
  }[];
};

export default function DirectPurchasesAdminPage() {
  const auth = getAuth();

  // ── Session ──
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin]                 = useState(defaultProcurementPin());
  const [allowed, setAllowed]         = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Filter ──
  const [cityFilter,   setCityFilter]   = useState("manila");
  const [statusFilter, setStatusFilter] = useState("");
  // In Review is the landing lane: it is the only one where somebody is
  // waiting on a decision from this screen.
  const [lane, setLane] = useState("IN_REVIEW");
  // Not a stage, so not a lane: a line can come off an order at any stage. It
  // sits beside the lanes because it is reached the same way, and a count that
  // cannot be opened is a dead end.
  const [removalsOnly, setRemovalsOnly] = useState(false);
  const [verifiedFilter, setVerifiedFilter] = useState("");   // "" | "false" | "true"

  // ── Data ──
  const [rows, setRows]       = useState<DirectPurchaseRow[]>([]);
  // Every row at every stage, from the server. The lane chips read this, never
  // `rows` -- `rows` holds one lane now.
  const [stageSummary, setStageSummary] = useState<StageSummary | null>(null);
  // Lines taken off an order, keyed by request. Kept beside the rows rather
  // than inside them: a removal belongs to the order, and a line can come off
  // before any purchase order exists.
  const [removals, setRemovals] = useState<Record<string, ItemRemoval[]>>({});
  const [removalsOpen, setRemovalsOpen] = useState(0);
  const [removalReasons, setRemovalReasons] = useState<Record<string, string>>({});
  const [ackBusy, setAckBusy] = useState("");
  // What the two creator alerts have done, and who they cannot reach.
  const [alerts, setAlerts] = useState<AlertPayload | null>(null);
  // Registering the missing IDs happens here, not on another page. The page
  // that owns this table only shows a field for people who own a store
  // exception type — Mariano and Aliana do not, so it could not have fixed
  // them, and sending anybody there would have been the third wrong route in
  // a row (lesson 21).
  const [idEdit, setIdEdit] = useState<Record<string, string>>({});
  const [idBusy, setIdBusy] = useState("");
  const [idMsg,  setIdMsg]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // ── Expand/edit ──
  const [expandedId, setExpandedId] = useState("");
  const [showBacklog, setShowBacklog] = useState(false);
  // The threshold comes from the server, so the chip and the list cannot
  // disagree about which side of it a row is on.
  const [backlogDays, setBacklogDays] = useState(30);
  const [editingId,  setEditingId]  = useState("");
  const [editState,  setEditState]  = useState<EditState | null>(null);
  const [editBusy,   setEditBusy]   = useState(false);
  const [editError,  setEditError]  = useState("");

  // ── Verify ──
  const [verifyBusy, setVerifyBusy] = useState("");
  const [poBusy, setPoBusy] = useState("");
  const [dateTarget, setDateTarget] = useState<DirectPurchaseRow | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [dateReason, setDateReason] = useState("");
  const [dateError, setDateError] = useState("");

  // ── Void ──
  const [voidTarget, setVoidTarget]   = useState<{ id: string; request_no: string } | null>(null);
  const [voidReason, setVoidReason]   = useState("");
  const [voidBusy,   setVoidBusy]     = useState(false);
  const [voidError,  setVoidError]    = useState("");

  // ── Catalog ──
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [vendors, setVendors]   = useState<VendorEntry[]>([]);
  const [activeSuggestField, setActiveSuggestField] = useState<string>("");  // "vendor" | "item-{idx}"

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const localAuth     = auth ?? getAuth();
      const refreshed     = await refreshAuthFromApi(localAuth);
      const resolvedAuth  = refreshed || localAuth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      setAuthChecked(true);
      if (can) {
        await load("manila", "", "");
        void loadCatalog();
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDiscordId = useCallback(async (name: string) => {
    const value = (idEdit[name] ?? "").trim();
    setIdBusy(name); setIdMsg("");
    try {
      const res = await fetch("/api/admin/management/channel-discord", {
        method: "PUT",
        headers: { ...(await procurementTokenHeaders(requestedBy, pin)), "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: name, discord_user_id: value }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) {
        // This screen is gated on procurement.request.write; saving a Discord
        // id is gated on the management back-office channel. Somebody can see
        // this banner and be refused here, and "Permission required:
        // channel.admin.management_back_office" tells them a key name rather
        // than what to do about it (lesson 125 — the audience has to be able
        // to act, or be told who can).
        throw new Error(
          "Your account cannot register Discord IDs — that is a Management "
          + "Back Office permission. Ask an admin to add it, or send them this "
          + "name and ID to save.",
        );
      }
      if (!res.ok) throw new Error(String(j?.detail || `Could not save (${res.status})`));
      setIdMsg(`Saved for ${name}. Their next alert will be delivered.`);
      setIdEdit(prev => { const n = { ...prev }; delete n[name]; return n; });
      // Re-read so the banner drops the name it just fixed; without this the
      // warning stays on screen and the save looks like it did nothing.
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e) {
      setIdMsg(e instanceof Error ? e.message : "Could not reach the server.");
    } finally { setIdBusy(""); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEdit, requestedBy, pin, cityFilter, statusFilter, verifiedFilter]);

  // ─── Load list ───────────────────────────────────────────────────────────
  const load = useCallback(async (city: string, status: string, dv: string,
                                  forLane?: string, forRemovals?: boolean,
                                  forBacklog?: boolean) => {
    setError(""); setLoading(true);
    try {
      // The lane being looked at, not every row. Manila is 827 rows and fitted
      // in one window; Dubai is 3,074 at one row per supplier, so asking for
      // everything would cut off two thirds and the oldest order -- the one
      // most worth opening -- is the one that falls off the end.
      //
      // The counts come back separately, over every row. A count taken from
      // the page is a count of the page.
      const laneKey = forLane ?? lane;
      const onlyRemovals = forRemovals ?? removalsOnly;
      // Removals cut across the lanes, so asking for them means asking for
      // every stage.
      const laneDef = LANES.find(l => l.key === laneKey);
      const stages = onlyRemovals ? "" : (laneDef?.stages || []).join(",");
      // Today's work first. Dubai's Incoming lane is 1,029 orders against a
      // window of 1,000, and 949 of them are months old -- fetching the whole
      // lane means the 80 somebody can act on today may not even be in it.
      const age = onlyRemovals || !laneDef || !laneIsWork(laneDef)
        ? ""
        : (forBacklog ?? showBacklog) ? "older" : "recent";
      const qs = new URLSearchParams({
        city,
        ...(status ? { status } : {}),
        ...(dv ? { data_verified: dv } : {}),
        ...(stages ? { stages } : {}),
        ...(onlyRemovals ? { open_removals: "true" } : {}),
        ...(age ? { age } : {}),
        limit: "1000",
      }).toString();
      const data = await procurementJson<{
        rows: DirectPurchaseRow[];
        stages?: StageSummary;
        removals?: Record<string, ItemRemoval[]>;
        removals_open?: number;
        removal_reasons?: Record<string, string>;
        backlog_days?: number;
      }>(
        `/api/admin/procurement/direct-purchases?${qs}`,
        { method: "GET" },
        requestedBy, pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setStageSummary(data?.stages || null);
      setRemovals(data?.removals || {});
      setRemovalsOpen(Number(data?.removals_open || 0));
      setRemovalReasons(data?.removal_reasons || {});
      if (data?.backlog_days) setBacklogDays(Number(data.backlog_days));
      // Non-fatal on purpose: if this call is refused the banner is simply
      // absent, rather than the whole screen failing over a caption.
      try {
        const a = await procurementJson<AlertPayload>(
          `/api/admin/procurement/request-alerts?city=${encodeURIComponent(city)}`,
          { method: "GET" }, requestedBy, pin,
        );
        setAlerts(a && Array.isArray(a.log) ? a : null);
      } catch { setAlerts(null); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [requestedBy, pin]);

  // ─── Load catalog for edit typeahead ─────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ approver_name: requestedBy, pin, city: cityFilter }).toString();
      const [vRes, iRes] = await Promise.all([
        fetch(`/api/admin/procurement/direct-purchase/vendors?${qs}`,      { headers, cache: "no-store" }),
        fetch(`/api/admin/procurement/direct-purchase/item-catalog?${qs}`, { headers, cache: "no-store" }),
      ]);
      if (vRes.ok) {
        const vj = await vRes.json();
        const reg: VendorEntry[] = (vj?.vendors as string[] || []).map((n: string) => ({ name: n, isRegistered: true }));
        const unreg: VendorEntry[] = (vj?.unregistered as string[] || []).map((n: string) => ({ name: n, isRegistered: false }));
        setVendors([...reg, ...unreg]);
      }
      if (iRes.ok) {
        const ij = await iRes.json();
        setCatalog(Array.isArray(ij?.items) ? ij.items : []);
      }
    } catch { /* optional */ }
  }, [requestedBy, pin, cityFilter]);

  const handleFilterChange = (city: string, status: string, dv: string) => {
    setCityFilter(city); setStatusFilter(status); setVerifiedFilter(dv);
    void load(city, status, dv);
  };

  // ─── Edit handlers ────────────────────────────────────────────────────────
  const startEdit = (row: DirectPurchaseRow) => {
    // Keyed on the row, not the request: an order sent to two suppliers has two
    // rows, and `row.id` would open both of them for editing at once.
    setEditingId(rowKey(row));
    setEditState(buildEditState(row));
    setExpandedId(rowKey(row));
    setEditError("");
  };

  const cancelEdit = () => { setEditingId(""); setEditState(null); setEditError(""); };

  const updateEditItem = (idx: number, field: string, value: string) =>
    setEditState((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });

  const addEditItem = () =>
    setEditState((prev) => prev
      ? { ...prev, items: [...prev.items, { id: "", item_name: "", category: "General", qty: "", unit: "kg", unit_price: "" }] }
      : prev,
    );

  const removeEditItem = (idx: number) =>
    setEditState((prev) => prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev);

  const selectCatalogForEdit = (idx: number, cat: CatalogItem) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        item_name:  cat.item_name,
        unit:       cat.unit,
        unit_price: cat.benchmark_unit_price > 0 ? String(cat.benchmark_unit_price) : items[idx].unit_price,
        category:   cat.category || items[idx].category,
      };
      return { ...prev, items };
    });
    setActiveSuggestField("");
  };

  const saveEdit = async (requestId: string) => {
    if (!editState) return;
    if (!editState.vendor_name.trim()) { setEditError("Vendor name is required."); return; }
    const validItems = editState.items.filter((i) => i.item_name.trim() && parseFloat(i.qty) > 0);
    if (!validItems.length) { setEditError("At least one item with name and quantity is required."); return; }
    setEditBusy(true); setEditError("");
    try {
      const itemsPayload = validItems.map((it) => ({
        id:         it.id || "",
        item_name:  it.item_name.trim(),
        category:   it.category.trim() || "General",
        qty:        parseFloat(it.qty) || 0,
        unit:       it.unit || "pc",
        unit_price: parseFloat(it.unit_price) || 0,
      }));
      await procurementJson(
        `/api/admin/procurement/direct-purchases/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy, pin,
            vendor_name: editState.vendor_name,
            items: itemsPayload,
            removal_reason_code: editState.reason_code,
            removal_reason_note: editState.reason_note,
          }),
        },
        requestedBy, pin,
      );
      cancelEdit();
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  };

  /** Yusuke's "I approve it and it stops being shown". The row stays. */
  const acknowledgeRemoval = async (rm: ItemRemoval) => {
    setAckBusy(rm.id);
    try {
      await procurementJson(
        `/api/admin/procurement/item-removals/${encodeURIComponent(rm.id)}/ack`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin }),
        },
        requestedBy, pin,
      );
      // Mark it here rather than refetching: the row would otherwise jump as
      // the list reloads, and the acknowledgement is one field.
      setRemovals((prev) => ({
        ...prev,
        [rm.request_id]: (prev[rm.request_id] || []).map((x) =>
          x.id === rm.id
            ? { ...x, ack_status: "acknowledged", ack_by: requestedBy, ack_at: "just now" }
            : x),
      }));
      setRemovalsOpen((n) => Math.max(0, n - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAckBusy("");
    }
  };

  // ─── Verify handler ───────────────────────────────────────────────────────
  const handleVerify = async (requestId: string) => {
    setVerifyBusy(requestId);
    try {
      await procurementJson(
        `/api/admin/procurement/direct-purchases/${requestId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approver_name: requestedBy, pin }),
        },
        requestedBy, pin,
      );
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifyBusy("");
    }
  };

  // ─── Dispatch confirmation / expected-date handlers ──────────────────────
  // Named "Delivered" until 2026-09-27. The back office presses it when the
  // supplier has confirmed the delivery is arranged, which is not the same
  // event as the goods being in the kitchen -- that is the kitchen's own
  // receipt. Yusuke asked for the rename so the two are not read as one:
  // an order with no dispatch confirmed is stuck at the supplier, and an
  // order with dispatch confirmed but no receipt is waiting on the kitchen.
  // The column stays delivered_confirmed_at; only what people read changed.
  // Token auth, no PIN: the back office touches these every day, and lesson 77
  // is that a PIN on a daily action is how a feature reaches zero uses.
  const handleDelivered = async (row: DirectPurchaseRow, undo: boolean) => {
    if (!row.po_id) return;
    setPoBusy(row.id);
    try {
      await procurementJson(
        `/api/admin/procurement/pos/${row.po_id}/delivered`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ undo }),
        },
        requestedBy, pin,
      );
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoBusy("");
    }
  };

  const saveDeliveryDate = async () => {
    if (!dateTarget?.po_id || !dateValue) return;
    setPoBusy(dateTarget.id);
    setDateError("");
    try {
      await procurementJson(
        `/api/admin/procurement/pos/${dateTarget.po_id}/delivery-date`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_date: dateValue, reason: dateReason }),
        },
        requestedBy, pin,
      );
      setDateTarget(null);
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setDateError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoBusy("");
    }
  };

  // ─── Void handler ────────────────────────────────────────────────────────
  const doVoidDirectPurchase = useCallback(async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setVoidBusy(true);
    setVoidError("");
    try {
      await procurementJson(
        `/api/admin/procurement/requests/${voidTarget.id}/void`,
        {
          method: "POST",
          body: JSON.stringify({ approver_name: requestedBy, pin, void_reason: voidReason.trim() }),
        },
        requestedBy, pin,
      );
      setVoidTarget(null);
      setVoidReason("");
      void load(cityFilter, statusFilter, verifiedFilter);
    } catch (e: unknown) {
      setVoidError(e instanceof Error ? e.message : String(e));
    } finally {
      setVoidBusy(false);
    }
  }, [voidTarget, voidReason, requestedBy, pin, cityFilter, statusFilter, verifiedFilter, load]);

  // ─── Guard ───────────────────────────────────────────────────────────────
  if (!authChecked) return null;
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Direct Purchases admin is only available to authorized procurement roles.
      </div>
    );
  }

  const editTotal = editState
    ? editState.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0), 0)
    : 0;

  // Over the whole board, from the server. Counting the rows on screen made
  // this say 1,000 for a Dubai board of 3,074 -- the page's size, dressed as a
  // fact about the work.
  const board = boardTotals(stageSummary);

  // Oldest first inside a lane. The whole complaint was that the screen does
  // not say what to do next; created_at DESC answers "what is newest", which is
  // the opposite of what a queue needs (pattern 5). Received and closed rows
  // stay newest-first because nobody is working them.
  // Anything that has sat in its lane this long is not this week's work. Yusuke
  // asked for it on 2026-09-27: In Review held 48 orders, every one of them
  // raised before 19 August, so a genuinely new request would have arrived into
  // a pile it could not be told apart from. The line is drawn on time in the
  // lane rather than on the request's age -- an old request that was approved
  // yesterday is today's problem, and belongs at the top.
  //
  // The line itself moved to the server on 2026-10-04 (`backlogDays`, from the
  // response). It was drawn over the rows that happened to be fetched, which is
  // sound at Manila's 827 and false at Dubai's Incoming lane: 1,029 orders
  // against a window of 1,000, with 949 of them months old, so the 80 somebody
  // can act on today might not be in the window at all.
  //
  // Nothing is hidden: the backlog keeps its own count and opens in one click.

  const laneRows = rows
    .filter(r => removalsOnly || laneOf(r) === lane)
    .sort((a, b) => {
      if (lane === "RECEIVED" || lane === "CLOSED") {
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      }
      const av = lane === "PO_ISSUED" ? Number(a.days_past_delivery_date ?? -9999) : Number(a.days_in_stage || 0);
      const bv = lane === "PO_ISSUED" ? Number(b.days_past_delivery_date ?? -9999) : Number(b.days_in_stage || 0);
      return bv - av;
    });

  // The server decides which side of the line a row is on and fetches that
  // side, so these are no longer a slice of what happened to arrive.
  const visibleRows = laneRows;
  const activeLane = LANES.find(l => l.key === lane);
  const split = laneSplit(stageSummary, activeLane || LANES[0]);
  const backlogCount = activeLane && laneIsWork(activeLane) && !removalsOnly ? split.older : 0;
  const backlogOldest = activeLane ? laneOldest(stageSummary, activeLane) : 0;


  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className={T_PAGE_TITLE}>Direct Purchase Review</h2>
          <p className="mt-1 text-sm text-zinc-400">Review and correct vendor/item data submitted by procurement staff.</p>
        </div>
        <div className="flex items-center gap-2">
          {board.unverified > 0 && (
            <span className={`${BADGE_WARNING}`}>
              {board.unverified === board.total
                ? `Nothing reviewed yet — all ${board.total.toLocaleString()}`
                : `${board.unverified.toLocaleString()} pending review`}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
            <ShoppingBag className="h-3 w-3" />{board.total.toLocaleString()} total
          </span>
        </div>
      </div>

      {/* Session + Filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <SelectDark
              className={SELECT_CLASS}
              value={cityFilter}
              onChange={v => handleFilterChange(v, statusFilter, verifiedFilter)}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
                { value: "", label: "All" },
              ]}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Verification</label>
            <SelectDark
              className={SELECT_CLASS}
              value={verifiedFilter}
              onChange={v => handleFilterChange(cityFilter, statusFilter, v)}
              options={[
                { value: "", label: "All" },
                { value: "false", label: "Pending review" },
                { value: "true", label: "Verified" },
              ]}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => void load(cityFilter, statusFilter, verifiedFilter)} disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <ShoppingBag className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No direct purchases found.</p>
        </div>
      )}

      {/* Lane strip. The counts are the navigation (pattern 7: a number you can
          read but not press is a dead end), and each lane states its own rule
          so the flagging is inspectable rather than mysterious. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {LANES.map((l) => {
          const active = lane === l.key;
          // From the server, over every row. Only the lane on screen has rows
          // here, so counting those would report 0 for every other chip.
          const total = laneCount(stageSummary, l);
          const working = laneIsWork(l);
          const split = laneSplit(stageSummary, l);
          // The working lanes lead with today's work and name the pile behind
          // it. The closed lanes are not work, so they keep their total.
          const count = working ? split.recent : total;
          const oldest = working ? laneOldest(stageSummary, l) : 0;
          // Only for the lane whose rows are loaded. Saying how many of
          // another lane are flagged would need its rows, and guessing is how
          // a chip and the list under it start disagreeing.
          const flagged = active ? rows.filter(r => stageAlert(r)).length : 0;
          const inLane = active ? rows.filter(r => laneOf(r) === l.key) : [];
          return (
            <button key={l.key} type="button"
              onClick={() => { setLane(l.key); setRemovalsOnly(false); setShowBacklog(false); setExpandedId("");
                               void load(cityFilter, statusFilter, verifiedFilter, l.key, false, false); }}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                active ? "border-violet-400/50 bg-violet-500/15 text-white"
                       : "border-white/10 bg-white/4 text-zinc-300 hover:bg-white/8"}`}>
              <span className="text-xs font-semibold">{l.label}</span>
              <span className="ml-2 font-mono text-sm">{count}</span>
              {/* "N flagged" only when it is a strict subset. Every row in
                  In Review and nearly every row in Needs PO is past its
                  threshold right now, and a badge that reads "48 flagged" next
                  to a count of 48 says nothing -- the same way a queue where
                  83% is noise stops being read. The oldest age is informative
                  either way, so that is what the chip carries. */}
              {active && flagged > 0 && flagged < inLane.length && (
                <span className="ml-2 rounded-lg bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  {flagged} flagged
                </span>
              )}
              {working && split.older > 0 && (
                <span className="ml-2 rounded-lg bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  +{split.older} older
                </span>
              )}
              {working && count > 0 && oldest > 0 && (
                <span className="ml-2 rounded-lg bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                  oldest {oldest}d
                </span>
              )}
            </button>
          );
        })}
        {removalsOpen > 0 && (
          <button type="button"
            onClick={() => { setRemovalsOnly(true); setShowBacklog(false); setExpandedId("");
                             void load(cityFilter, statusFilter, verifiedFilter, lane, true); }}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              removalsOnly ? "border-rose-400/50 bg-rose-500/15 text-white"
                           : "border-rose-500/25 bg-rose-500/8 text-rose-200 hover:bg-rose-500/15"}`}>
            <span className="text-xs font-semibold">Lines taken off</span>
            <span className="ml-2 font-mono text-sm">{removalsOpen}</span>
          </button>
        )}
      </div>
      <p className={`${T_CAPTION} mb-3`}>
        {removalsOnly
          ? "Lines taken off an order after it was raised. Acknowledge one to take it off this list — the record stays on the order."
          : LANES.find(l => l.key === lane)?.hint}
        {(() => {
          // The window holds 1,000 and Dubai's Incoming lane is larger than
          // that. Saying so beats a list that silently stops: the row most
          // worth opening is the oldest, and it is the one past the end.
          if (removalsOnly) return null;
          const total = laneCount(stageSummary, LANES.find(l => l.key === lane)!);
          if (!rows.length || total <= rows.length) return null;
          return (
            <span className="text-zinc-400">
              {" "}Showing the newest {rows.length} of {total}.
            </span>
          );
        })()}
        {(() => {
          const inLane = rows.filter(r => laneOf(r) === lane);
          const flagged = inLane.filter(r => stageAlert(r)).length;
          // Only when the lane fits in one window: "all 1,000 are past that"
          // would be a statement about the window, not about the lane.
          if (removalsOnly) return null;
          const whole = inLane.length === laneCount(stageSummary, LANES.find(l => l.key === lane)!);
          if (!whole || !inLane.length || flagged < inLane.length) return null;
          // Saying "all of them" is the difference between a queue somebody
          // works today and a backlog somebody schedules. Without it the
          // screen looks like a daily list that is permanently on fire.
          return (
            <span className="text-amber-300">
              {" "}All {inLane.length} are past that — this is a backlog to clear, not today&apos;s work.
            </span>
          );
        })()}
      </p>

      {/* Alerts. The rule is on the screen because a rule nobody can see is a
          rule nobody trusts, and the unreachable list is here because three of
          the five creators on this screen have no Discord ID registered — an
          alert addressed to them is written down and delivered nowhere. */}
      {alerts && (
        <div className="mb-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <p className={T_CAPTION}>
            <span className="text-white/80">Alerts to the creator:</span>{" "}
            still in review after {alerts.threshold_hours}h (checked each morning),
            and immediately on rejection.
            {alerts.go_live_at && (
              <> Requests raised before{" "}
                {new Date(alerts.go_live_at).toLocaleDateString("en-GB",
                  { day: "2-digit", month: "short", year: "numeric" })}{" "}
                are not alerted — the rows already sitting in review predate this
                and are a backlog, not news.</>
            )}
            {alerts.pending_count > 0 && (
              <span className="text-amber-300">
                {" "}{alerts.pending_count} will be alerted on the next pass.
              </span>
            )}
          </p>
          {alerts.unreachable.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <p className={`${T_CAPTION} text-amber-200`}>
                No Discord ID registered — these alerts are recorded but reach
                nobody. Paste an ID and save; it is fixed from here.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {alerts.unreachable.map(u => {
                  // Both counts, because the two alerts have different
                  // populations: stale review only touches open requests,
                  // rejection touches whoever is raising them now.
                  const parts: string[] = [];
                  if (u.open_requests) parts.push(`${u.open_requests} open`);
                  if (u.last_30_days) parts.push(`${u.last_30_days} in 30d`);
                  return (
                    <div key={u.staff_name} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-[180px] text-white/85">{u.staff_name}</span>
                      <span className="min-w-[120px] text-xs text-white/45">{parts.join(", ")}</span>
                      <input
                        value={idEdit[u.staff_name] ?? ""}
                        onChange={(e) => setIdEdit({ ...idEdit, [u.staff_name]: e.target.value })}
                        placeholder="Discord user ID (numbers only)"
                        className={`${INPUT_CLASS} min-w-[220px] flex-1`}
                      />
                      <button type="button" className={SMALL_BUTTON}
                        disabled={idBusy === u.staff_name || !(idEdit[u.staff_name] ?? "").trim()}
                        onClick={() => void saveDiscordId(u.staff_name)}>
                        {idBusy === u.staff_name ? "Saving…" : "Save"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {idMsg && <p className="mt-2 text-sm text-white/75">{idMsg}</p>}
              <p className={`${T_CAPTION} mt-2 text-white/45`}>
                In Discord: turn on Developer Mode, right-click the person and
                choose Copy User ID. It is all digits — an @name will be refused
                rather than stored and silently failing to deliver.
              </p>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {visibleRows.length === 0 && backlogCount > 0 && !showBacklog && (
          <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-5 text-center text-sm text-zinc-400">
            Nothing new in this lane — everything here has been waiting more than {backlogDays} days.
          </div>
        )}
        {visibleRows.map((row) => {
          const key = rowKey(row);
          const isExpanded = expandedId === key;
          const isEditing  = editingId  === key;
          const createdDt  = row.created_at
            ? new Date(row.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—";

          return (
            <Fragment key={key}>
            <div className={`rounded-2xl border transition-all ${row.data_verified_at ? "border-white/8 bg-white/4" : "border-amber-500/20 bg-amber-500/5"}`}>

              {/* Row header */}
              <button type="button" className="w-full px-4 py-4 text-left"
                onClick={() => setExpandedId(isExpanded ? "" : key)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{row.request_no || row.parent_case_no}</span>
                      {stageBadge(row)}
                      {row.po_no && (
                        <span className={BADGE_INFO} title="Purchase order raised for this request">
                          {row.po_no}
                        </span>
                      )}
                      {(() => {
                        // "Alerted" alone would read as "the creator knows".
                        // When delivery failed, that is the opposite of true,
                        // so the badge says which happened.
                        const a = (alerts?.log || []).find(x => x.request_id === row.id);
                        if (!a) return null;
                        const landed = a.delivery === "discord";
                        return (
                          <span className={landed ? BADGE_INFO : BADGE_WARNING}
                            title={`${a.alert_kind === "rejected" ? "Rejection" : "Stale review"} alert to ${a.recipient_name || "nobody"} — ${a.delivery}`}>
                            {landed ? "Creator told" : "Alert not delivered"}
                          </span>
                        );
                      })()}
                      {Number(row.po_vendor_count || 0) > 1 && (
                        <span className={BADGE_WARNING}
                          title="This order went to more than one supplier. Each supplier is its own row.">
                          1 of {row.po_vendor_count} suppliers
                        </span>
                      )}
                      {Number(row.po_reissue_count || 0) > 1 && (
                        <span className={BADGE_INFO}
                          title="The purchase order to this supplier was raised more than once — same lines, same amount. The latest is shown.">
                          PO issued ×{row.po_reissue_count}
                        </span>
                      )}
                      {row.has_shortage && <span className={BADGE_WARNING}>Short delivery</span>}
                      {row.data_verified_at
                        ? <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" /> Verified</span>
                        : <span className={BADGE_WARNING}>Needs Review</span>
                      }
                      {row.new_vendor_flag && <span className={BADGE_WARNING}>New Vendor</span>}
                    </div>
                    {stageAlert(row) && (
                      <p className="text-[11px] font-medium text-amber-300">{stageAlert(row)}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>By <span className="text-zinc-300">{row.requested_by}</span></span>
                      {row.store_code && <span>Branch <span className="text-zinc-300">{row.store_code}</span></span>}
                      <span>Date <span className="text-zinc-300">{row.request_date || createdDt}</span></span>
                      <span>Vendor <span className="text-zinc-200 font-medium">{row.po_vendor_name || row.items[0]?.vendor_name || "—"}</span></span>
                      {/* This supplier's share, and the order's total when they
                          differ. They differ only on a multi-supplier order,
                          where one number for both would be the thing this
                          grain exists to stop. */}
                      <span>Total <span className="font-semibold text-amber-300">{money(row.city, row.row_amount ?? row.total_amount)}</span>
                        {Number(row.po_vendor_count || 0) > 1 && (
                          <span className="text-zinc-500"> of {money(row.city, row.total_amount)}</span>
                        )}
                      </span>
                      {row.delivery_date && (
                        <span>
                          Expected <span className="text-zinc-200 font-medium">{row.delivery_date}</span>
                          {row.delivery_date_revised_at && row.delivery_date_original !== row.delivery_date && (
                            <span className="text-zinc-500"> (was {row.delivery_date_original})</span>
                          )}
                        </span>
                      )}
                      {row.delivered_confirmed_at && (
                        <span className="text-sky-300">
                          Dispatch confirmed {String(row.delivered_confirmed_at).slice(0, 10)}
                          {row.delivered_confirmed_by ? ` · ${row.delivered_confirmed_by}` : ""}
                        </span>
                      )}
                      {/* Yusuke asked who recorded the receipt and when. Every
                          column was already filled; the screen never asked. */}
                      {row.received_at && (
                        <span className="text-emerald-300">
                          Received {String(row.received_at).slice(0, 16).replace("T", " ")}
                          {row.received_by ? ` · ${row.received_by}` : ""}
                        </span>
                      )}
                      {/* Said plainly, because the row looks identical to a
                          received one otherwise: a stamp, a date, a name — the
                          supplier's. */}
                      {stageOf(row) === "SUPPLIER_ACKED" && (
                        <span className="text-amber-300">
                          Supplier confirmed the order{row.receipt_confirmed_at ? ` ${String(row.receipt_confirmed_at).slice(0, 10)}` : ""} — nobody has recorded it arriving
                        </span>
                      )}
                    </div>
                    {row.data_verified_at && (
                      <p className="text-[10px] text-emerald-500">
                        Verified by {row.data_verified_by} · {new Date(row.data_verified_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!row.data_verified_at && !isEditing && (
                      <button type="button" onClick={() => startEdit(row)}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {!row.data_verified_at && !isEditing && (
                      <button type="button"
                        onClick={() => void handleVerify(row.id)}
                        disabled={verifyBusy === row.id}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`}>
                        {verifyBusy === row.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Mark Verified
                      </button>
                    )}
                    {row.po_id && stageOf(row) !== "RECEIVED" && !isEditing && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setDateTarget(row); setDateValue(row.delivery_date || ""); setDateReason(""); setDateError(""); }}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                        title="The supplier moved the date">
                        <Pencil className="h-3.5 w-3.5" /> Expected date
                      </button>
                    )}
                    {row.po_id && stageOf(row) === "PO_ISSUED" && !isEditing && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelivered(row, false); }}
                        disabled={poBusy === row.id}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5 border-sky-500/30 text-sky-300 hover:bg-sky-500/10`}
                        title="Back office confirms the supplier delivered. The kitchen still confirms receipt.">
                        {poBusy === row.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirm Dispatch
                      </button>
                    )}
                    {row.po_id && stageOf(row) === "DELIVERED" && !isEditing && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelivered(row, true); }}
                        disabled={poBusy === row.id}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                        title="Undo the delivered mark">
                        Undo Dispatch
                      </button>
                    )}
                    {(row.status || "").toUpperCase() === "APPROVED" && !isEditing && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setVoidTarget({ id: row.id, request_no: row.request_no || row.parent_case_no }); setVoidReason(""); setVoidError(""); }}
                        className={`${SMALL_BUTTON} flex items-center gap-1.5 border-red-800/40 text-red-400 hover:bg-red-950/20`}>
                        <Ban className="h-3.5 w-3.5" />
                        Void
                      </button>
                    )}
                    <span className="text-xs text-zinc-500">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>
              </button>

              {/* Expanded: view mode */}
              {isExpanded && !isEditing && (
                <div className="border-t border-white/8 px-4 pb-4 space-y-3">
                  {/* Receipt photo */}
                  {row.receipt_url && (
                    <div className="mt-3">
                      <a href={row.receipt_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 transition">
                        <ExternalLink className="h-3.5 w-3.5" /> View Receipt Photo
                      </a>
                    </div>
                  )}
                  {/* Items table */}
                  <div className="mt-2 overflow-x-auto rounded-xl border border-white/8">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#0c1024]/70 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Vendor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.items.map((item, idx) => (
                          <tr key={idx} className="border-t border-white/8">
                            <td className="px-3 py-2 font-medium text-zinc-100">{item.item_name}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.category || "—"}</td>
                            <td className="px-3 py-2 text-right text-white">{item.qty}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.unit}</td>
                            <td className="px-3 py-2 text-right text-zinc-300">{Number(item.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-300">{Number(item.line_total).toFixed(2)}</td>
                            <td className="px-3 py-2 text-zinc-400">{item.vendor_name}</td>
                          </tr>
                        ))}
                        {/* Under the lines that are coming, struck through: the
                            ones that are not. They were deleted outright before
                            this, so the order read as if they had never been
                            asked for while the purchase order in the supplier's
                            hands still listed them. */}
                        {(removals[row.id] || []).map((rm) => (
                          <tr key={rm.id} className="border-t border-white/8 bg-rose-500/5">
                            <td className="px-3 py-2 text-zinc-400 line-through">{rm.item_name}</td>
                            <td className="px-3 py-2 text-zinc-500">{rm.category || "—"}</td>
                            <td className="px-3 py-2 text-right text-zinc-400 line-through">{rm.qty}</td>
                            <td className="px-3 py-2 text-zinc-500">{rm.unit}</td>
                            <td className="px-3 py-2 text-right text-zinc-500 line-through">{Number(rm.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500 line-through">{Number(rm.line_total).toFixed(2)}</td>
                            <td className="px-3 py-2 text-zinc-500">{rm.vendor_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(removals[row.id] || []).map((rm) => (
                    <div key={rm.id}
                      className={`rounded-xl border p-3 text-xs ${
                        (rm.ack_status || "pending") === "acknowledged"
                          ? "border-white/8 bg-white/4 text-zinc-400"
                          : "border-rose-500/30 bg-rose-500/5 text-rose-200"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-semibold">Taken off this order:</span>{" "}
                          {rm.item_name} {rm.qty} {rm.unit} · {money(row.city, rm.line_total)}
                          {rm.po_no ? ` · ${rm.po_no}` : ""}
                        </span>
                        {(rm.ack_status || "pending") !== "acknowledged" ? (
                          <button type="button" onClick={() => void acknowledgeRemoval(rm)}
                            disabled={ackBusy === rm.id}
                            className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
                            {ackBusy === rm.id
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Acknowledge
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-500">
                            Acknowledged{rm.ack_by ? ` by ${rm.ack_by}` : ""}{rm.ack_at ? ` · ${rm.ack_at}` : ""}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {removalReason(rm, removalReasons)}
                        {" · "}
                        {rm.removed_by
                          ? `removed by ${rm.removed_by}`
                          : "nobody recorded who removed it"}
                        {rm.removed_at ? ` · ${rm.removed_at}` : ""}
                        {rm.reconstructed
                          ? " · worked out from the purchase order, not witnessed"
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Expanded: EDIT mode */}
              {isExpanded && isEditing && editState && (
                <div className="border-t border-white/8 px-4 pb-5 space-y-4">
                  <p className="mt-3 text-sm font-semibold text-amber-300">Editing — correct vendor and item data</p>

                  {editError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />{editError}
                    </div>
                  )}

                  {/* Vendor edit */}
                  <div className="relative">
                    <label className={`${T_LABEL} mb-1.5 block`}>Vendor Name</label>
                    <input
                      value={editState.vendor_name}
                      onChange={(e) => { setEditState((p) => p ? { ...p, vendor_name: e.target.value } : p); setActiveSuggestField("vendor"); }}
                      onFocus={() => setActiveSuggestField("vendor")}
                      onBlur={() => setTimeout(() => setActiveSuggestField(""), 160)}
                      placeholder="Correct vendor name…"
                      className={INPUT_CLASS}
                    />
                    {activeSuggestField === "vendor" && vendors.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {vendors
                          .filter((v) => !editState.vendor_name || v.name.toLowerCase().includes(editState.vendor_name.toLowerCase()))
                          .slice(0, 10)
                          .map((v) => (
                            <button key={v.name} type="button"
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); setEditState((p) => p ? { ...p, vendor_name: v.name } : p); setActiveSuggestField(""); }}>
                              {v.isRegistered && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                              <span>{v.name}</span>
                              {v.isRegistered && <span className="ml-auto text-[10px] text-zinc-500">Registered</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Items edit */}
                  <div className="space-y-3">
                    <label className={`${T_LABEL} block`}>Items</label>
                    {editState.items.map((item, idx) => {
                      const itemSuggestions = item.item_name.length > 0
                        ? catalog.filter((c) => c.item_name.toLowerCase().includes(item.item_name.toLowerCase())).slice(0, 6)
                        : [];
                      const suggestKey = `item-${idx}`;
                      return (
                        <div key={idx} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-zinc-500">Item {idx + 1}</span>
                            {editState.items.length > 1 && (
                              <button type="button" onClick={() => removeEditItem(idx)}
                                className="text-zinc-600 hover:text-red-400 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Item name + catalog suggest */}
                          <div className="relative">
                            <input
                              value={item.item_name}
                              onChange={(e) => { updateEditItem(idx, "item_name", e.target.value); setActiveSuggestField(suggestKey); }}
                              onFocus={() => setActiveSuggestField(suggestKey)}
                              onBlur={() => setTimeout(() => setActiveSuggestField(""), 160)}
                              placeholder="Item name"
                              className={INPUT_CLASS}
                            />
                            {activeSuggestField === suggestKey && itemSuggestions.length > 0 && (
                              <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#1a1f35] shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                                {itemSuggestions.map((s) => (
                                  <button key={s.item_name} type="button"
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-violet-500/15 transition-colors"
                                    onMouseDown={(e) => { e.preventDefault(); selectCatalogForEdit(idx, s); }}>
                                    <Star className="h-3 w-3 text-amber-400 shrink-0" />
                                    <span className="flex-1">{s.item_name}</span>
                                    <span className="text-[10px] text-zinc-500">{s.unit}{s.benchmark_unit_price > 0 && ` · ₱${s.benchmark_unit_price}`}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <input type="number" value={item.qty}
                              onChange={(e) => updateEditItem(idx, "qty", e.target.value)}
                              placeholder="Qty" min="0" step="0.1" className={INPUT_CLASS} />
                            <SelectDark
                              className={SELECT_CLASS}
                              value={item.unit}
                              onChange={v => updateEditItem(idx, "unit", v)}
                              options={UNITS.map(u => ({ value: u, label: u }))}
                            />
                            <input type="number" value={item.unit_price}
                              onChange={(e) => updateEditItem(idx, "unit_price", e.target.value)}
                              placeholder="Unit price" min="0" step="1" className={INPUT_CLASS} />
                          </div>
                        </div>
                      );
                    })}

                    <button type="button" onClick={addEditItem}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                      + Add item
                    </button>

                    {/* Running total */}
                    <div className="flex justify-end text-sm">
                      <span className="text-zinc-400 mr-3">New total:</span>
                      <span className="font-semibold text-amber-300">{money(row.city, editTotal)}</span>
                    </div>

                    {/* Asked at the moment the line comes off, and only once a
                        purchase order exists — before that the supplier has not
                        been told anything and this screen is for correcting the
                        request. The server requires the same thing; this is so
                        the person is not told afterwards that the save failed. */}
                    {(() => {
                      const dropped = row.items.filter(
                        (i) => !editState!.items.some((e) => e.id && e.id === i.id));
                      if (!dropped.length || !row.po_id) return null;
                      return (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                          <p className="text-xs text-amber-200">
                            Taking {dropped.length} line{dropped.length === 1 ? "" : "s"} off {row.po_no} — {dropped.map((d) => String(d.item_name)).join(", ")}.
                            {" "}The person who raised the order is told, and this is kept on the row.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(removalReasons).map(([code, label]) => (
                              <button key={code} type="button"
                                onClick={() => setEditState(prev => prev ? { ...prev, reason_code: code } : prev)}
                                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                                  editState!.reason_code === code
                                    ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                    : "border-white/10 bg-white/4 text-zinc-300 hover:bg-white/8"}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <input
                            className={INPUT_CLASS}
                            placeholder={editState!.reason_code === "other"
                              ? "Say what happened (required)"
                              : "Anything to add (optional)"}
                            value={editState!.reason_note}
                            onChange={(e) => setEditState(prev => prev ? { ...prev, reason_note: e.target.value } : prev)}
                          />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => void saveEdit(row.id)} disabled={editBusy}
                      className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}>
                      {editBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editBusy ? "Saving…" : "Save Changes"}
                    </button>
                    <button type="button" onClick={cancelEdit} disabled={editBusy} className={SECONDARY_BUTTON}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            </Fragment>
          );
        })}
        {backlogCount > 0 && (
          <button type="button"
            onClick={() => { const next = !showBacklog; setShowBacklog(next); setExpandedId("");
                             void load(cityFilter, statusFilter, verifiedFilter, lane, false, next); }}
            className="w-full rounded-xl border border-dashed border-white/12 bg-white/2 px-4 py-3 text-sm text-zinc-400 hover:border-violet-500/30 hover:text-zinc-200">
            {showBacklog
              ? `Back to the ${split.recent} from the last ${backlogDays} days`
              : `Show ${backlogCount} order${backlogCount === 1 ? "" : "s"} waiting more than ${backlogDays} days`}
            {!showBacklog && backlogOldest > 0 && (
              <span className="text-zinc-500"> · oldest {backlogOldest} days</span>
            )}
          </button>
        )}
      </div>

      {/* ── Void confirmation modal ── */}
      {/* Expected delivery date. Uses ModalScrim, not the fixed/flex/center
          pattern the void dialog below still uses -- that one is on lesson
          116's list of 66 files and cannot be typed into on a phone. */}
      {dateTarget && (
        <ModalScrim className="bg-black/70 backdrop-blur-sm">
          <div className="mx-auto my-4 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Expected delivery date</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              <span className="font-mono text-zinc-200">{dateTarget.po_no || dateTarget.request_no}</span>
              {" — "}what the supplier now says. The first promised date is kept, so the
              order still counts as late against it.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">New date</label>
                <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
                  className={INPUT_CLASS} />
                {dateTarget.delivery_date && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Currently {dateTarget.delivery_date}
                    {dateTarget.delivery_date_original && dateTarget.delivery_date_original !== dateTarget.delivery_date
                      ? ` · first promised ${dateTarget.delivery_date_original}` : ""}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Reason (optional)</label>
                <input type="text" value={dateReason} onChange={(e) => setDateReason(e.target.value)}
                  placeholder="Supplier out of stock" className={INPUT_CLASS} />
              </div>
              {dateError && <p className="text-xs text-red-400">{dateError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setDateTarget(null)} className={SECONDARY_BUTTON}>Cancel</button>
                <button type="button" onClick={() => void saveDeliveryDate()}
                  disabled={!dateValue || poBusy === dateTarget.id}
                  className={PRIMARY_BUTTON}>
                  {poBusy === dateTarget.id ? "Saving…" : "Save date"}
                </button>
              </div>
            </div>
          </div>
        </ModalScrim>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-950/40 border border-red-800/40">
                <Ban className="h-4.5 w-4.5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Void Direct Purchase</h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  <span className="font-mono text-zinc-200">{voidTarget.request_no}</span> — Management PIN required. Requester cannot void their own order.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Reason</label>
                <SelectDark
                  value={voidReason}
                  onChange={(v) => setVoidReason(v)}
                  className="w-full"
                  options={[
                    { value: "Out of Stock from Supplier", label: "Out of Stock from Supplier" },
                    { value: "Supplier Price Increased", label: "Supplier Price Increased" },
                    { value: "Switching to Alternative Supplier", label: "Switching to Alternative Supplier" },
                    { value: "Duplicate Order", label: "Duplicate Order" },
                    { value: "Other", label: "Other" },
                  ]}
                  placeholder="— Select reason —"
                />
              </div>

              {voidError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {voidError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setVoidTarget(null)}
                  disabled={voidBusy}
                  className="flex-1 rounded-xl border border-white/12 bg-white/5 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void doVoidDirectPurchase()}
                  disabled={voidBusy || !voidReason}
                  className="flex-1 rounded-xl border border-red-800/50 bg-red-950/30 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-50"
                >
                  {voidBusy ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Voiding…
                    </span>
                  ) : "Void Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
