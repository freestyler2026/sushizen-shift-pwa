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
  Plus,
  Minus,
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
  "Chiller 1", "Chiller 2", "Chiller 3", "Chiller 4",
  "Freezer 1", "Freezer 2", "Freezer 3", "Freezer 4",
];
const DUBAI_UNITS = [
  "Chiller 1", "Chiller 2",
  "Freezer 1", "Freezer 2", "Freezer 3",
];

// ─── Equipment catalog (Manila only) ─────────────────────────────────────────

type EquipmentDef = { id: string; label: string; max: number; unit: string; group: string };

const MANILA_EQUIPMENT: EquipmentDef[] = [
  { id: "cooler_65l",   label: "65L Cooler Box",   max: 4,  unit: "box", group: "Cooler Box" },
  { id: "cooler_45l",   label: "45L Cooler Box",   max: 2,  unit: "box", group: "Cooler Box" },
  { id: "cooler_8l",    label: "8L Cooler Box",    max: 7,  unit: "box", group: "Cooler Box" },
  { id: "ice_400ml",    label: "400ml Ice Pack",   max: 10, unit: "pc",  group: "Ice Pack" },
  { id: "ice_600ml",    label: "600ml Ice Pack",   max: 24, unit: "pc",  group: "Ice Pack" },
  { id: "ice_1000ml",   label: "1000ml Ice Pack",  max: 30, unit: "pc",  group: "Ice Pack" },
  { id: "thermometer",  label: "Thermometer",      max: 15, unit: "pc",  group: "Other" },
];

type EquipmentQty = Record<string, number>; // id → quantity

function EquipmentPicker({
  qty, onChange,
}: {
  qty: EquipmentQty;
  onChange: (id: string, val: number) => void;
}) {
  const groups = Array.from(new Set(MANILA_EQUIPMENT.map((e) => e.group)));

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group}>
          <p className={`${T_CAPTION} text-slate-400 mb-2 uppercase tracking-wider`}>{group}</p>
          <div className="space-y-2">
            {MANILA_EQUIPMENT.filter((e) => e.group === group).map((item) => {
              const count = qty[item.id] ?? 0;
              return (
                <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-sm text-slate-200">{item.label}</span>
                    <span className={`${T_CAPTION} text-slate-500 ml-2`}>max {item.max} {item.unit}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => onChange(item.id, Math.max(0, count - 1))}
                      disabled={count === 0}
                      className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 disabled:opacity-30"
                    >
                      <Minus size={12} className="text-slate-300" />
                    </button>
                    <span className={`w-8 text-center text-sm font-bold ${count > 0 ? "text-violet-300" : "text-slate-600"}`}>
                      {count}
                    </span>
                    <button type="button"
                      onClick={() => onChange(item.id, Math.min(item.max, count + 1))}
                      disabled={count >= item.max}
                      className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 disabled:opacity-30"
                    >
                      <Plus size={12} className="text-slate-300" />
                    </button>
                    {count > 0 && (
                      <span className={`${T_CAPTION} text-violet-400 w-12`}>{count} {item.unit}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Temperature validation ────────────────────────────────────────────────

type AlertLevel = "ok" | "danger" | "empty";

function tempOk(val: string, itemType: string): AlertLevel {
  const s = val.trim();
  if (!s) return "empty";
  const n = parseFloat(s);
  if (isNaN(n)) return "empty";
  const t = itemType.toUpperCase();
  if (t === "FROZEN") return n <= -18 ? "ok" : "danger";
  if (t === "CHILLED") return n <= 5 ? "ok" : "danger";
  return "ok";
}

function TempCell({
  value, onChange, itemType, disabled, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  itemType: string; disabled?: boolean; placeholder?: string;
}) {
  const al = tempOk(value, itemType);
  const border = al === "ok" ? "border-emerald-500/50 bg-emerald-500/8"
    : al === "danger" ? "border-red-500/50 bg-red-500/8"
    : "border-white/10 bg-white/5";
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${border}`}>
      <input
        type="number" step="0.1" disabled={disabled}
        placeholder={placeholder ?? "—"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-sm text-white outline-none placeholder-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-xs text-zinc-500 shrink-0">°C</span>
      {al === "ok"     && <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
      {al === "danger" && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
    </div>
  );
}

function TimeCell({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
      <Clock size={11} className="text-slate-500 shrink-0" />
      <input
        type="time" disabled={disabled} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-sm text-white outline-none"
      />
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BoxForm = {
  box_number: number;
  item_type: "FROZEN" | "CHILLED";
  dispatch_at: string;
  dispatch_temp: string;
  received_at: string;
  received_temp: string;
  received_by: string;
  stored_at: string;
  stored_temp: string;
  stored_by: string;
  storage_unit: string;
};

type DispatchRow = {
  id: string;
  dispatched_by: string;
  dispatch_date: string;
  created_at: string;
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function emptyBox(n: number): BoxForm {
  const t = nowHHMM();
  return {
    box_number: n,
    item_type: "FROZEN",
    dispatch_at: "",
    dispatch_temp: "",
    received_at: t,
    received_temp: "",
    received_by: "",
    stored_at: t,
    stored_temp: "",
    stored_by: "",
    storage_unit: "",
  };
}

function calcHeld(receivedAt: string, storedAt: string): string | null {
  if (!receivedAt || !storedAt) return null;
  try {
    const [h1, m1] = receivedAt.split(":").map(Number);
    const [h2, m2] = storedAt.split(":").map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch { return null; }
}

// ─── Box Table Row ────────────────────────────────────────────────────────────

function BoxTableRow({
  box, staffNames, storageUnits, onChange, disabled,
}: {
  box: BoxForm;
  staffNames: string[];
  storageUnits: string[];
  onChange: (patch: Partial<BoxForm>) => void;
  disabled: boolean;
}) {
  const held = calcHeld(box.received_at, box.stored_at);

  return (
    <div className={`${GLASS_CARD} overflow-hidden`}>
      {/* Box header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/3 border-b border-white/5">
        <span className="text-sm font-bold text-white">Cooler Box {box.box_number}</span>
        <div className="flex gap-2">
          {(["FROZEN", "CHILLED"] as const).map((t) => (
            <button key={t} type="button" disabled={disabled}
              onClick={() => onChange({ item_type: t })}
              className={`rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-all ${
                box.item_type === t
                  ? t === "FROZEN"
                    ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                    : "border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              {t === "FROZEN" ? "🧊 Frozen" : "❄️ Chilled"}
            </button>
          ))}
        </div>
      </div>

      {/* 3-row temperature table */}
      <div className="divide-y divide-white/5">
        {/* Row 1: Dispatch (CK) */}
        <div className="grid grid-cols-[120px_1fr_1fr] gap-3 px-4 py-3 items-center">
          <span className="text-xs font-semibold text-amber-300">① Dispatch (CK)</span>
          <div><p className={T_CAPTION}>Time</p>
            <TimeCell value={box.dispatch_at} onChange={(v) => onChange({ dispatch_at: v })} disabled={disabled} />
          </div>
          <div><p className={T_CAPTION}>Temperature</p>
            <TempCell value={box.dispatch_temp} onChange={(v) => onChange({ dispatch_temp: v })}
              itemType={box.item_type} disabled={disabled}
              placeholder={box.item_type === "FROZEN" ? "-18.0" : "4.0"} />
          </div>
        </div>

        {/* Row 2: Received (Branch) */}
        <div className="grid grid-cols-[120px_1fr_1fr] gap-3 px-4 py-3 items-center">
          <span className="text-xs font-semibold text-sky-300">② Received (Branch)</span>
          <div><p className={T_CAPTION}>Time</p>
            <TimeCell value={box.received_at} onChange={(v) => onChange({ received_at: v })} disabled={disabled} />
          </div>
          <div><p className={T_CAPTION}>Temperature</p>
            <TempCell value={box.received_temp} onChange={(v) => onChange({ received_temp: v })}
              itemType={box.item_type} disabled={disabled}
              placeholder={box.item_type === "FROZEN" ? "-18.0" : "4.0"} />
          </div>
        </div>

        {/* Row 3: In Chiller/Freezer */}
        <div className="px-4 py-3 space-y-2">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-3 items-center">
            <span className="text-xs font-semibold text-emerald-300">③ In Storage</span>
            <div><p className={T_CAPTION}>Time</p>
              <TimeCell value={box.stored_at} onChange={(v) => onChange({ stored_at: v })} disabled={disabled} />
            </div>
            <div><p className={T_CAPTION}>Temperature</p>
              <TempCell value={box.stored_temp} onChange={(v) => onChange({ stored_temp: v })}
                itemType={box.item_type} disabled={disabled}
                placeholder={box.item_type === "FROZEN" ? "-19.0" : "4.0"} />
            </div>
          </div>
          {/* Storage unit selector */}
          <div className="flex items-center gap-2">
            <span className={`${T_CAPTION} w-[120px] shrink-0`}>Storage Unit</span>
            <select className={`${SELECT_CLASS} flex-1 text-xs`} value={box.storage_unit}
              onChange={(e) => onChange({ storage_unit: e.target.value })} disabled={disabled}>
              <option value="">— Select unit —</option>
              {storageUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Calculated time held */}
        {held && (
          <div className="px-4 py-2 flex items-center gap-2">
            <Clock size={12} className="text-slate-400" />
            <span className={`${T_CAPTION} text-slate-400`}>Time held in cooler:</span>
            <span className={`text-sm font-bold ${
              (() => {
                const mins = parseInt(held);
                return isNaN(mins) ? "text-slate-400" : mins > 60 ? "text-red-400" : mins > 30 ? "text-amber-400" : "text-emerald-400";
              })()
            }`}>{held}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatch Form ────────────────────────────────────────────────────────────

function DispatchForm({ city }: { city: string }) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [destBranches, setDestBranches] = useState<string[]>([...branches]);
  const [equipmentQty, setEquipmentQty] = useState<EquipmentQty>({});
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

  const toggle = (b: string) =>
    setDestBranches((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b]);

  const setEqQty = (id: string, val: number) =>
    setEquipmentQty((p) => ({ ...p, [id]: val }));

  // Build equipment_json payload — only items with qty > 0
  const buildEquipmentJson = () =>
    MANILA_EQUIPMENT
      .filter((e) => (equipmentQty[e.id] ?? 0) > 0)
      .map((e) => ({ id: e.id, label: e.label, qty: equipmentQty[e.id], unit: e.unit }));

  const submit = async () => {
    if (!dispatchedBy) { setMsg({ ok: false, text: "Select dispatching staff." }); return; }
    if (!destBranches.length) { setMsg({ ok: false, text: "Select at least one destination." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/store/cold-chain/dispatch", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          dispatched_by: dispatchedBy,
          destination_branches: destBranches,
          equipment_json: city === "manila" ? buildEquipmentJson() : [],
          notes,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      setMsg({ ok: true, text: `Dispatch created. Notify branches: ${destBranches.join(", ")}` });
      setNotes(""); setEquipmentQty({});
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Dispatched By</label>
        <select className={SELECT_CLASS} value={dispatchedBy} onChange={(e) => setDispatchedBy(e.target.value)}>
          <option value="">— Select Staff —</option>
          {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div>
        <label className={`${T_LABEL} mb-2 block`}>Destination Branches</label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button key={b} type="button" onClick={() => toggle(b)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-all ${
                destBranches.includes(b)
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}>{BRANCH_LABELS[b] ?? b}</button>
          ))}
        </div>
      </div>

      {/* Equipment selector — Manila only */}
      {city === "manila" && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <label className={`${T_LABEL} mb-3 block`}>Equipment Used</label>
          <EquipmentPicker qty={equipmentQty} onChange={setEqQty} />
        </div>
      )}

      <div>
        <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
        <input className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." />
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

      <button type="button" onClick={submit} disabled={submitting}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Creating..." : "Create Dispatch Record"}
      </button>
    </div>
  );
}

// ─── Receiving Form ────────────────────────────────────────────────────────────

function ReceivingForm({ city }: { city: string }) {
  const branches     = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const storageUnits = city === "manila" ? MANILA_UNITS    : DUBAI_UNITS;

  const [branch, setBranch] = useState(branches[0]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [dispatchId, setDispatchId] = useState("");
  const [boxCount, setBoxCount] = useState(1);
  const [boxes, setBoxes] = useState<BoxForm[]>([emptyBox(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [staffNames, setStaffNames] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/admin/staff_master/names?city=${city}&limit=200`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d) ? d : (d.names ?? [])))
      .catch(() => {});
  }, [city]);

  const loadDispatches = useCallback(() => {
    fetch(`/api/store/cold-chain/dispatches?city=${city}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.dispatches ?? [];
        setDispatches(rows);
        setDispatchId(rows[0]?.id ?? "");
      })
      .catch(() => {});
  }, [city]);

  useEffect(() => { loadDispatches(); }, [loadDispatches]);

  // Sync boxCount → boxes array
  useEffect(() => {
    setBoxes((prev) => {
      if (boxCount === prev.length) return prev;
      if (boxCount > prev.length) {
        const extras: BoxForm[] = [];
        for (let i = prev.length + 1; i <= boxCount; i++) extras.push(emptyBox(i));
        return [...prev, ...extras];
      }
      return prev.slice(0, boxCount);
    });
  }, [boxCount]);

  const updateBox = (idx: number, patch: Partial<BoxForm>) =>
    setBoxes((prev) => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));

  const submit = async () => {
    if (!dispatchId) { setMsg({ ok: false, text: "Select a dispatch." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const payload = boxes.map((b) => ({
        ...b,
        dispatch_temp:  b.dispatch_temp  ? parseFloat(b.dispatch_temp)  : null,
        received_temp:  b.received_temp  ? parseFloat(b.received_temp)  : null,
        stored_temp:    b.stored_temp    ? parseFloat(b.stored_temp)    : null,
      }));
      const res = await fetch("/api/store/cold-chain/boxes", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dispatch_id: dispatchId, city, branch_code: branch, boxes: payload }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      setMsg({ ok: true, text: `${data.boxes?.length ?? 0} cooler box(es) recorded.` });
      setBoxes([emptyBox(1)]); setBoxCount(1);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setSubmitting(false); }
  };

  // selectedDispatch kept for future use (equipment display etc.)
  const _selectedDispatch = dispatches.find((d) => d.id === dispatchId); void _selectedDispatch;

  return (
    <div className="space-y-4">
      {/* Branch + dispatch selector */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Branch</label>
          <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {branches.map((b) => <option key={b} value={b}>{BRANCH_LABELS[b] ?? b}</option>)}
          </select>
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>CK Dispatch</label>
          {dispatches.length === 0 ? (
            <p className={`${T_CAPTION} text-slate-500 py-2`}>No dispatches today</p>
          ) : (
            <select className={SELECT_CLASS} value={dispatchId} onChange={(e) => setDispatchId(e.target.value)}>
              {dispatches.map((d) => (
                <option key={d.id} value={d.id}>{d.dispatched_by}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Box count */}
      <div>
        <label className={`${T_LABEL} mb-2 block`}>Number of Cooler Boxes Received</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setBoxCount((n) => Math.max(1, n - 1))}
            className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
            <Minus size={16} className="text-slate-300" />
          </button>
          <span className="text-2xl font-bold text-white w-8 text-center">{boxCount}</span>
          <button type="button" onClick={() => setBoxCount((n) => Math.min(5, n + 1))}
            className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
            <Plus size={16} className="text-slate-300" />
          </button>
        </div>
      </div>

      {/* Per-box temperature table */}
      {boxes.map((box, idx) => (
        <BoxTableRow
          key={box.box_number}
          box={box}
          staffNames={staffNames}
          storageUnits={storageUnits}
          onChange={(patch) => updateBox(idx, patch)}
          disabled={submitting}
        />
      ))}

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                 : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      <button type="button" onClick={submit} disabled={submitting || !dispatchId}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 ${!dispatchId ? "opacity-50" : ""}`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Saving..." : `Submit ${boxCount} Box Temperature Record${boxCount > 1 ? "s" : ""}`}
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
  const [tab, setTab] = useState<"receive" | "dispatch">("receive");

  if (!auth?.staffName) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <Thermometer size={22} className="text-violet-400" />
            <h1 className={T_PAGE_TITLE}>Cold Chain Log</h1>
          </div>
          <p className={`${T_CAPTION} text-slate-400`}>Cooler box temperature control — 3-step record</p>
        </div>

        {/* City */}
        <div className="rounded-xl border border-white/20 bg-white/5 p-3 mb-4 flex items-center gap-3">
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

        {/* border-white/8 → border-white/20 to prevent "black border" on dark backgrounds */}
        <div className="rounded-xl border border-white/20 bg-white/5 p-4">
          {tab === "dispatch" ? <DispatchForm city={city} /> : <ReceivingForm city={city} />}
        </div>
      </div>
    </div>
  );
}
