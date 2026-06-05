"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Thermometer,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  INPUT_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const MANILA_BRANCHES = ["PAR", "CUB", "TAFT"];
const DUBAI_BRANCHES  = ["BB", "JLT", "ARJ", "AM", "AB"];

const BRANCH_LABELS: Record<string, string> = {
  PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft",
  BB: "Business Bay", JLT: "JLT", ARJ: "Arjan", AM: "Al Mina", AB: "Al Barsha",
};

const MANILA_UNITS = [
  { name: "Chiller 1", type: "CHILLER" }, { name: "Chiller 2", type: "CHILLER" },
  { name: "Chiller 3", type: "CHILLER" }, { name: "Chiller 4", type: "CHILLER" },
  { name: "Freezer 1", type: "FREEZER" }, { name: "Freezer 2", type: "FREEZER" },
  { name: "Freezer 3", type: "FREEZER" }, { name: "Freezer 4", type: "FREEZER" },
];

const DUBAI_UNITS = [
  { name: "Chiller 1", type: "CHILLER" }, { name: "Chiller 2", type: "CHILLER" },
  { name: "Freezer 1", type: "FREEZER" }, { name: "Freezer 2", type: "FREEZER" },
  { name: "Freezer 3", type: "FREEZER" },
];

// ─── Alert helpers ────────────────────────────────────────────────────────────

type AlertLevel = "ok" | "danger" | "empty";

function getTempAlert(val: string, type: "FROZEN" | "CHILLED" | "CHILLER" | "FREEZER"): AlertLevel {
  const s = val.trim();
  if (!s) return "empty";
  const n = parseFloat(s);
  if (isNaN(n)) return "empty";
  if (type === "FROZEN" || type === "FREEZER") return n <= -18 ? "ok" : "danger";
  if (type === "CHILLED" || type === "CHILLER") return n <= 5 ? "ok" : "danger";
  return "ok";
}

function TempInput({
  label, value, onChange, type, disabled, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type: "FROZEN" | "CHILLED" | "CHILLER" | "FREEZER"; disabled?: boolean; placeholder?: string;
}) {
  const alert = getTempAlert(value, type);
  const borderCls = alert === "ok" ? "border-emerald-500/60 bg-emerald-500/8"
    : alert === "danger" ? "border-red-500/60 bg-red-500/8"
    : "border-white/15 bg-white/5";
  return (
    <div>
      <label className={`${T_LABEL} mb-1 block`}>{label}</label>
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${borderCls}`}>
        <Thermometer size={14} className={alert === "ok" ? "text-emerald-400" : alert === "danger" ? "text-red-400" : "text-slate-500"} />
        <input
          type="number" step="0.1" disabled={disabled}
          className="w-full bg-transparent text-sm text-white outline-none placeholder-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          placeholder={placeholder ?? "—"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-xs text-zinc-500 shrink-0">°C</span>
        {alert === "ok" && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
        {alert === "danger" && <AlertTriangle size={13} className="text-red-400 shrink-0" />}
      </div>
      {alert === "danger" && (
        <p className={`${T_CAPTION} text-red-400 mt-0.5`}>
          {type === "FROZEN" || type === "FREEZER"
            ? "⚠ Above -18°C — frozen item temperature violation"
            : "⚠ Above 5°C — chilled item temperature violation (danger zone)"}
        </p>
      )}
    </div>
  );
}

// ─── Dispatch form ────────────────────────────────────────────────────────────

function DispatchForm({ city }: { city: string }) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [dispatchAt, setDispatchAt] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [hasFrozen, setHasFrozen] = useState(true);
  const [hasChilled, setHasChilled] = useState(true);
  const [frozenTemp, setFrozenTemp] = useState("");
  const [chilledTemp, setChilledTemp] = useState("");
  const [destBranches, setDestBranches] = useState<string[]>([...branches]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/staff_master/names?city=${city}&limit=200`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d) ? d : (d.names ?? [])))
      .catch(() => {});
  }, [city]);

  const toggleBranch = (b: string) =>
    setDestBranches((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);

  const handleSubmit = async () => {
    if (!dispatchedBy) { setMsg({ ok: false, text: "Please select staff." }); return; }
    if (!dispatchAt)   { setMsg({ ok: false, text: "Dispatch time is required." }); return; }
    if (!hasFrozen && !hasChilled) { setMsg({ ok: false, text: "Select at least one item type." }); return; }
    if (destBranches.length === 0) { setMsg({ ok: false, text: "Select at least one destination." }); return; }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/store/cold-chain/dispatch", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city, dispatch_at: dispatchAt,
          has_frozen: hasFrozen, has_chilled: hasChilled,
          frozen_cooler_temp: hasFrozen && frozenTemp ? parseFloat(frozenTemp) : null,
          chilled_cooler_temp: hasChilled && chilledTemp ? parseFloat(chilledTemp) : null,
          dispatched_by: dispatchedBy,
          destination_branches: destBranches,
          notes: notes.trim() || null,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      setMsg({ ok: true, text: `Dispatch record created. ${destBranches.length} branch(es) notified.` });
      setFrozenTemp(""); setChilledTemp(""); setNotes("");
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Error." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Dispatched By</label>
          <select className={SELECT_CLASS} value={dispatchedBy} onChange={(e) => setDispatchedBy(e.target.value)}>
            <option value="">— Select Staff —</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Dispatch Time</label>
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <input type="time" className="w-full bg-transparent text-sm text-white outline-none"
              value={dispatchAt} onChange={(e) => setDispatchAt(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Item type selection */}
      <div className={GLASS_CARD + " p-3"}>
        <p className={`${T_LABEL} mb-2`}>Items in Cooler Box</p>
        <div className="flex gap-3">
          {[
            { key: "frozen", label: "🧊 Frozen Items", val: hasFrozen, set: setHasFrozen },
            { key: "chilled", label: "❄️ Chilled Items", val: hasChilled, set: setHasChilled },
          ].map(({ key, label, val, set }) => (
            <button key={key} type="button" onClick={() => set(!val)}
              className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-all ${
                val ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                    : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Cooler temps */}
      <div className="grid grid-cols-2 gap-3">
        {hasFrozen && (
          <TempInput label="Frozen Section Temp (°C)" value={frozenTemp}
            onChange={setFrozenTemp} type="FROZEN" placeholder="-18.0" />
        )}
        {hasChilled && (
          <TempInput label="Chilled Section Temp (°C)" value={chilledTemp}
            onChange={setChilledTemp} type="CHILLED" placeholder="4.0" />
        )}
      </div>

      {/* Destination branches */}
      <div>
        <p className={`${T_LABEL} mb-2`}>Destination Branches</p>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button key={b} type="button" onClick={() => toggleBranch(b)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-all ${
                destBranches.includes(b)
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >{BRANCH_LABELS[b] ?? b}</button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
        <input className={INPUT_CLASS} placeholder="Any notes..." value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                 : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      <button type="button" onClick={handleSubmit} disabled={submitting}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Creating..." : "Create Dispatch Record"}
      </button>
    </div>
  );
}

// ─── Receiving form ────────────────────────────────────────────────────────────

type PendingDelivery = {
  id: string;
  branch_code: string;
  dispatch_at: string;
  dispatch_date: string;
  dispatch_frozen_temp: number | null;
  dispatch_chilled_temp: number | null;
  has_frozen: boolean;
  has_chilled: boolean;
  dispatched_by: string;
  status: string;
};

function ReceivingForm({ city }: { city: string }) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const units    = city === "manila" ? MANILA_UNITS : DUBAI_UNITS;

  const [branch, setBranch] = useState(branches[0]);
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [receivedBy, setReceivedBy] = useState("");
  const [frozenTemp, setFrozenTemp] = useState("");
  const [chilledTemp, setChilledTemp] = useState("");
  const [transferTemps, setTransferTemps] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [allStaff, setAllStaff] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/admin/staff_master/names?city=${city}&limit=200`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setAllStaff(Array.isArray(d) ? d : (d.names ?? [])))
      .catch(() => {});
  }, [city]);

  const loadDeliveries = useCallback(() => {
    if (!branch) return;
    fetch(`/api/store/cold-chain/pending?city=${city}&branch_code=${branch}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.deliveries ?? [];
        setDeliveries(rows);
        setSelectedId(rows[0]?.id ?? "");
      })
      .catch(() => {});
  }, [city, branch]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  const selected = deliveries.find((d) => d.id === selectedId);

  const setTransfer = (unit: string, val: string) =>
    setTransferTemps((prev) => ({ ...prev, [unit]: val }));

  const handleSubmit = async () => {
    if (!selectedId) { setMsg({ ok: false, text: "Select a dispatch to receive." }); return; }
    if (!receivedBy) { setMsg({ ok: false, text: "Please select receiving staff." }); return; }

    const transferList = units.map((u) => ({
      unit: u.name, type: u.type,
      temp: transferTemps[u.name] ? parseFloat(transferTemps[u.name]) : null,
      at: receivedAt,
    })).filter((t) => t.temp !== null);

    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/store/cold-chain/delivery", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_id: selectedId,
          received_at: receivedAt,
          received_by: receivedBy,
          frozen_cooler_temp: selected?.has_frozen && frozenTemp ? parseFloat(frozenTemp) : null,
          chilled_cooler_temp: selected?.has_chilled && chilledTemp ? parseFloat(chilledTemp) : null,
          transfer_temps_json: transferList,
          notes: notes.trim() || null,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      setMsg({ ok: true, text: "Receiving & storage transfer recorded." });
      loadDeliveries();
      setFrozenTemp(""); setChilledTemp(""); setTransferTemps({}); setNotes("");
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Error." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Branch + delivery selector */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Branch</label>
          <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {branches.map((b) => <option key={b} value={b}>{BRANCH_LABELS[b] ?? b}</option>)}
          </select>
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>CK Dispatch</label>
          {deliveries.length === 0 ? (
            <p className={`${T_CAPTION} text-slate-500 py-2`}>No pending deliveries</p>
          ) : (
            <select className={SELECT_CLASS} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {deliveries.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dispatch_at} dispatch — {d.dispatched_by}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Dispatch reference temps */}
      {selected && (
        <div className={`${GLASS_CARD} p-3`}>
          <p className={`${T_LABEL} mb-2`}>📦 CK Dispatch Reference</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {selected.has_frozen && (
              <div>
                <span className={T_CAPTION}>Frozen at dispatch</span>
                <p className={`font-bold ${selected.dispatch_frozen_temp != null && selected.dispatch_frozen_temp > -18 ? "text-red-400" : "text-emerald-400"}`}>
                  {selected.dispatch_frozen_temp != null ? `${selected.dispatch_frozen_temp}°C` : "—"}
                </p>
              </div>
            )}
            {selected.has_chilled && (
              <div>
                <span className={T_CAPTION}>Chilled at dispatch</span>
                <p className={`font-bold ${selected.dispatch_chilled_temp != null && selected.dispatch_chilled_temp > 5 ? "text-red-400" : "text-emerald-400"}`}>
                  {selected.dispatch_chilled_temp != null ? `${selected.dispatch_chilled_temp}°C` : "—"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Received By</label>
          <select className={SELECT_CLASS} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}>
            <option value="">— Select Staff —</option>
            {allStaff.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Received Time</label>
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <input type="time" className="w-full bg-transparent text-sm text-white outline-none"
              value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Receiving cooler temps */}
      {selected && (
        <div className="grid grid-cols-2 gap-3">
          {selected.has_frozen && (
            <TempInput label="Frozen Cooler Temp at Receiving" value={frozenTemp}
              onChange={setFrozenTemp} type="FROZEN" placeholder="-18.0" />
          )}
          {selected.has_chilled && (
            <TempInput label="Chilled Cooler Temp at Receiving" value={chilledTemp}
              onChange={setChilledTemp} type="CHILLED" placeholder="4.0" />
          )}
        </div>
      )}

      {/* Storage transfer temps */}
      <div className={GLASS_CARD + " p-3"}>
        <p className={`${T_SECTION} mb-1`}>Storage Transfer Temperatures</p>
        <p className={`${T_CAPTION} text-slate-500 mb-3`}>Record temp when moving items from cooler to each unit</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {units.map((u) => {
            const val = transferTemps[u.name] ?? "";
            const alertType = u.type === "CHILLER" ? "CHILLED" : "FROZEN";
            const alert = getTempAlert(val, alertType as any);
            const borderCls = alert === "ok" ? "border-emerald-500/50 bg-emerald-500/5"
              : alert === "danger" ? "border-red-500/50 bg-red-500/5"
              : "border-white/10 bg-white/5";
            return (
              <div key={u.name}>
                <label className={`${T_CAPTION} text-slate-500 block mb-0.5`}>{u.name}</label>
                <div className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${borderCls}`}>
                  <input type="number" step="0.1"
                    className="w-full bg-transparent text-sm outline-none placeholder-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="—" value={val}
                    onChange={(e) => setTransfer(u.name, e.target.value)}
                  />
                  <span className="text-xs text-zinc-500">°C</span>
                  {alert === "ok" && <CheckCircle2 size={11} className="text-emerald-400" />}
                  {alert === "danger" && <AlertTriangle size={11} className="text-red-400" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
        <input className={INPUT_CLASS} placeholder="Any notes..." value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                 : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      <button type="button" onClick={handleSubmit} disabled={submitting || !selectedId}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 ${!selectedId ? "opacity-50" : ""}`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Saving..." : "Submit Receiving & Transfer"}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ColdChainPage() {
  const router = useRouter();
  const auth = getAuth();

  useEffect(() => {
    if (!auth?.staffName) router.replace("/login");
  }, [auth, router]);

  const [city, setCity] = useState<"manila" | "dubai">((auth?.city || "manila") as "manila" | "dubai");
  const [tab, setTab] = useState<"dispatch" | "receive">("receive");

  if (!auth?.staffName) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-20">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <Thermometer size={22} className="text-violet-400" />
            <h1 className={T_PAGE_TITLE}>Cold Chain Log</h1>
          </div>
          <p className={`${T_CAPTION} text-slate-400`}>CK cooler temperature tracking</p>
        </div>

        {/* City selector */}
        <div className={`${GLASS_CARD} p-3 mb-4 flex items-center gap-3`}>
          <span className={T_LABEL}>City</span>
          {(["manila", "dubai"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCity(c)}
              className={`flex-1 rounded-xl border py-1.5 text-sm font-medium transition-all ${
                city === c ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                           : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >{c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}</button>
          ))}
        </div>

        {/* Tabs */}
        <div className={`${TAB_CONTAINER} mb-5`}>
          <button className={tab === "receive" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("receive")}>
            📥 Branch Receiving
          </button>
          <button className={tab === "dispatch" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("dispatch")}>
            🚚 CK Dispatch
          </button>
        </div>

        <div className={GLASS_CARD + " p-4"}>
          {tab === "dispatch" ? (
            <DispatchForm city={city} />
          ) : (
            <ReceivingForm city={city} />
          )}
        </div>
      </div>
    </div>
  );
}
