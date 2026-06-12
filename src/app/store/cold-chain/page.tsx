"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Camera,
  X,
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

type EquipmentQty = Record<string, number>;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Box form used in CK Dispatch form */
type DispatchBoxForm = {
  box_number: number;
  item_type: "FROZEN" | "CHILLED";
  dispatch_at: string;
  dispatch_temp: string;
};

/** Box stub loaded from API (created by CK) */
type DispatchBoxRow = {
  id: string;
  box_number: number;
  item_type: string;
  dispatch_at: string;
  dispatch_temp: number | null;
  received_at: string | null;
  received_temp: number | null;
  received_by: string | null;
  status: string;
  dispatched_by: string;
};

type DispatchRow = {
  id: string;
  dispatched_by: string;
  dispatch_date: string;
  created_at: string;
  has_dispatch_boxes: boolean;
  destination_branches: string[];
  box_count: number;
};

/** Per-box receiving state (new flow) — includes optional storage step */
type ReceiveBoxState = {
  box_id: string;
  received_at: string;
  received_temp: string;
  stored_at: string;
  stored_temp: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AlertLevel = "ok" | "danger" | "empty";

function tempOk(val: string, itemType: string): AlertLevel {
  const n = parseFloat(val);
  if (isNaN(n)) return "empty";
  const t = itemType.toUpperCase();
  if (t === "FROZEN")  return n <= -18 ? "ok" : "danger";
  if (t === "CHILLED") return n <=   5 ? "ok" : "danger";
  return "ok";
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function emptyDispatchBox(n: number): DispatchBoxForm {
  return { box_number: n, item_type: "FROZEN", dispatch_at: nowHHMM(), dispatch_temp: "" };
}

// ─── Small UI components ──────────────────────────────────────────────────────

function TempCell({
  value, onChange, itemType, disabled, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  itemType: string; disabled?: boolean; placeholder?: string;
}) {
  const al = tempOk(value, itemType);
  const border = al === "ok"     ? "border-emerald-500/50 bg-emerald-500/8"
    : al === "danger" ? "border-red-500/50 bg-red-500/8"
    : "border-white/10 bg-white/5";
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${border}`}>
      <input
        type="number" step="0.1" disabled={disabled}
        placeholder={placeholder ?? "—"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm text-white outline-none placeholder-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
        className="w-full bg-transparent text-sm text-white outline-none"
      />
    </div>
  );
}

// ─── Equipment Picker ─────────────────────────────────────────────────────────

function EquipmentPicker({ qty, onChange }: { qty: EquipmentQty; onChange: (id: string, n: number) => void }) {
  const groups = Array.from(new Set(MANILA_EQUIPMENT.map((e) => e.group)));
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g}>
          <p className={`${T_CAPTION} text-zinc-500 mb-1.5`}>{g}</p>
          <div className="space-y-2">
            {MANILA_EQUIPMENT.filter((e) => e.group === g).map((item) => {
              const count = qty[item.id] ?? 0;
              return (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      disabled={count === 0}
                      onClick={() => onChange(item.id, count - 1)}
                      className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 disabled:opacity-30">
                      <Minus size={12} />
                    </button>
                    <span className="text-sm text-white w-6 text-center font-semibold">{count}</span>
                    <button type="button"
                      disabled={count >= item.max}
                      onClick={() => onChange(item.id, count + 1)}
                      className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 disabled:opacity-30">
                      <Plus size={12} />
                    </button>
                    <span className={`${T_CAPTION} text-zinc-500 w-6`}>{item.unit}</span>
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

// ─── Dispatch Box Row ─────────────────────────────────────────────────────────

function DispatchBoxRow({
  box, onChange, disabled,
}: {
  box: DispatchBoxForm;
  onChange: (patch: Partial<DispatchBoxForm>) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/15 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
        <span className="text-sm font-bold text-white">Cooler Box {box.box_number}</span>
        <div className="flex gap-2">
          {(["FROZEN", "CHILLED"] as const).map((t) => (
            <button key={t} type="button" disabled={disabled}
              onClick={() => onChange({ item_type: t })}
              className={`rounded-xl border px-4 py-1.5 text-sm font-semibold transition-all ${
                box.item_type === t
                  ? t === "FROZEN"
                    ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                    : "border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}>
              {t === "FROZEN" ? "🧊 Frozen" : "❄️ Chilled"}
            </button>
          ))}
        </div>
      </div>
      {/* Dispatch time + temp */}
      <div className="px-4 py-3">
        <p className="text-xs font-bold mb-2.5 text-amber-300">① Dispatch (CK)</p>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className={`${T_CAPTION} mb-1`}>Time</p>
            <TimeCell value={box.dispatch_at} onChange={(v) => onChange({ dispatch_at: v })} disabled={disabled} />
          </div>
          <div className="flex-1">
            <p className={`${T_CAPTION} mb-1`}>Temperature</p>
            <TempCell
              value={box.dispatch_temp}
              onChange={(v) => onChange({ dispatch_temp: v })}
              itemType={box.item_type}
              disabled={disabled}
              placeholder={box.item_type === "FROZEN" ? "-18.0" : "4.0"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch Form ─────────────────────────────────────────────────────────────

function DispatchForm({ city }: { city: string }) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const [staffNames,    setStaffNames]    = useState<string[]>([]);
  const [dispatchedBy,  setDispatchedBy]  = useState("");
  // Default: all branches pre-selected — CK normally dispatches to all branches.
  // Uncheck to exclude a branch from this shipment.
  const [destBranches,  setDestBranches]  = useState<string[]>(() => (city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES));
  const [equipmentQty,  setEquipmentQty]  = useState<EquipmentQty>({});
  const [notes,         setNotes]         = useState("");
  // Per-box dispatch data (Manila only in new flow)
  const [boxCount,  setBoxCount]  = useState(1);
  const [boxes,     setBoxes]     = useState<DispatchBoxForm[]>([emptyDispatchBox(1)]);
  // Photo upload
  const photoRef                          = useRef<HTMLInputElement>(null);
  const [photoFile,    setPhotoFile]      = useState<File | null>(null);
  const [photoPreview, setPhotoPreview]   = useState("");
  const [submitting,   setSubmitting]     = useState(false);
  const [msg,          setMsg]            = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/staff_master/names?city=${city}&limit=200`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d) ? d : (d.names ?? [])))
      .catch(() => {});
  }, [city]);

  // Sync boxCount → boxes array (Manila only new flow)
  useEffect(() => {
    if (city !== "manila") return;
    setBoxes((prev) => {
      if (boxCount === prev.length) return prev;
      if (boxCount > prev.length) {
        const extras: DispatchBoxForm[] = [];
        for (let i = prev.length + 1; i <= boxCount; i++) extras.push(emptyDispatchBox(i));
        return [...prev, ...extras];
      }
      return prev.slice(0, boxCount);
    });
  }, [boxCount, city]);

  const toggle     = (b: string) =>
    setDestBranches((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b]);
  const setEqQty   = (id: string, val: number) =>
    setEquipmentQty((p) => ({ ...p, [id]: val }));
  const updateBox  = (idx: number, patch: Partial<DispatchBoxForm>) =>
    setBoxes((prev) => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));

  const buildEquipmentJson = () =>
    MANILA_EQUIPMENT
      .filter((e) => (equipmentQty[e.id] ?? 0) > 0)
      .map((e) => ({ id: e.id, label: e.label, qty: equipmentQty[e.id], unit: e.unit }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!dispatchedBy) { setMsg({ ok: false, text: "Select dispatching staff." }); return; }
    if (!destBranches.length) { setMsg({ ok: false, text: "Select at least one destination." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      // Step 1: Create dispatch (+ boxes for Manila new flow)
      const isNewFlow = city === "manila" && boxes.length > 0;
      const payload: Record<string, unknown> = {
        city,
        dispatched_by: dispatchedBy,
        destination_branches: destBranches,
        equipment_json: city === "manila" ? buildEquipmentJson() : [],
        notes,
        boxes: isNewFlow ? boxes.map((b) => ({
          box_number:    b.box_number,
          item_type:     b.item_type,
          dispatch_at:   b.dispatch_at,
          dispatch_temp: b.dispatch_temp ? parseFloat(b.dispatch_temp) : null,
        })) : [],
      };

      const res = await fetch("/api/store/cold-chain/dispatch", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      const dispatchId  = data.dispatch?.id ?? "";
      const dispatchDate = data.dispatch?.dispatch_date ?? new Date().toISOString().slice(0, 10);

      // Step 2: Upload photo if provided
      if (photoFile && dispatchId) {
        const fd = new FormData();
        fd.append("city",          city);
        fd.append("dispatch_date", dispatchDate);
        fd.append("file",          photoFile);
        await fetch(`/api/store/cold-chain/dispatch/${dispatchId}/photo`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: fd,
          cache: "no-store",
        }).catch(() => {}); // non-fatal
      }

      setMsg({ ok: true, text: `Dispatch created. Notify branches: ${destBranches.join(", ")}` });
      setNotes(""); setEquipmentQty({}); setPhotoFile(null); setPhotoPreview("");
      setBoxes([emptyDispatchBox(1)]); setBoxCount(1);
      setDestBranches([...branches]); // reset to all-selected for next dispatch
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dispatched By */}
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Dispatched By</label>
        <select className={SELECT_CLASS} value={dispatchedBy} onChange={(e) => setDispatchedBy(e.target.value)}>
          <option value="">— Select Staff —</option>
          {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Destination Branches */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={`${T_LABEL}`}>
            Destination Branches
            {destBranches.length === branches.length
              ? <span className="ml-2 text-xs font-normal text-emerald-400">All {branches.length} selected ✓</span>
              : <span className="ml-2 text-xs font-normal text-amber-400">{destBranches.length} / {branches.length} selected</span>
            }
          </label>
          <button type="button"
            onClick={() => setDestBranches(destBranches.length === branches.length ? [] : [...branches])}
            className="text-xs text-slate-400 hover:text-white underline underline-offset-2">
            {destBranches.length === branches.length ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => {
            const checked = destBranches.includes(b);
            return (
              <button key={b} type="button" onClick={() => toggle(b)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  checked
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-white/15 bg-white/5 text-slate-500"
                }`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                  checked ? "border-emerald-400 bg-emerald-500/30 text-emerald-300" : "border-white/30 bg-white/5 text-transparent"
                }`}>✓</span>
                {BRANCH_LABELS[b] ?? b}
              </button>
            );
          })}
        </div>
        {destBranches.length === 0 && (
          <p className="mt-1.5 text-xs text-red-400">⚠ No branch selected — please select at least one.</p>
        )}
      </div>

      {/* Equipment selector — Manila only */}
      {city === "manila" && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <label className={`${T_LABEL} mb-3 block`}>Equipment Used</label>
          <EquipmentPicker qty={equipmentQty} onChange={setEqQty} />
        </div>
      )}

      {/* Per-box dispatch temps — Manila only */}
      {city === "manila" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={`${T_LABEL}`}>Cooler Boxes to Dispatch</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setBoxCount((n) => Math.max(1, n - 1))}
                className="rounded-xl border border-white/10 bg-white/5 p-1.5 hover:bg-white/10">
                <Minus size={14} className="text-slate-300" />
              </button>
              <span className="text-lg font-bold text-white w-6 text-center">{boxCount}</span>
              <button type="button" onClick={() => setBoxCount((n) => Math.min(10, n + 1))}
                className="rounded-xl border border-white/10 bg-white/5 p-1.5 hover:bg-white/10">
                <Plus size={14} className="text-slate-300" />
              </button>
            </div>
          </div>
          {boxes.map((box, idx) => (
            <DispatchBoxRow
              key={box.box_number}
              box={box}
              onChange={(patch) => updateBox(idx, patch)}
              disabled={submitting}
            />
          ))}
        </div>
      )}

      {/* Photo Upload */}
      <div>
        <label className={`${T_LABEL} mb-2 block`}>Dispatch Photo (optional)</label>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        {photoPreview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="preview" className="w-full max-h-48 object-cover rounded-xl" />
            <button type="button"
              onClick={() => { setPhotoFile(null); setPhotoPreview(""); if (photoRef.current) photoRef.current.value = ""; }}
              className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
              <X size={14} className="text-white" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => photoRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-white/20 bg-white/3 py-4 flex flex-col items-center gap-1.5 text-zinc-400 hover:bg-white/5">
            <Camera size={20} />
            <span className="text-xs">Tap to add photo</span>
          </button>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
        <input className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." />
      </div>

      <button type="button" onClick={submit} disabled={submitting}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Creating..." : "Create Dispatch Record"}
      </button>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                 : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── Receiving Form ────────────────────────────────────────────────────────────

function ReceivingForm({ city }: { city: string }) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;

  const [branch,         setBranch]       = useState(branches[0]);
  const [dispatches,     setDispatches]   = useState<DispatchRow[]>([]);
  const [dispatchId,     setDispatchId]   = useState("");
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [staffNames,     setStaffNames]   = useState<string[]>([]);
  const [receivedBy,     setReceivedBy]   = useState("");

  // New flow (has_dispatch_boxes = true)
  const [dispatchBoxes,  setDispatchBoxes]  = useState<DispatchBoxRow[]>([]);
  const [loadingBoxes,   setLoadingBoxes]   = useState(false);
  const [receiveStates,  setReceiveStates]  = useState<ReceiveBoxState[]>([]);

  // Legacy flow (has_dispatch_boxes = false)
  const [boxCount,  setBoxCount]  = useState(1);
  const [legacyBoxes, setLegacyBoxes] = useState<{
    box_number: number; item_type: "FROZEN" | "CHILLED";
    dispatch_at: string; dispatch_temp: string;
    received_at: string; received_temp: string;
    stored_at: string; stored_temp: string;
  }[]>([{
    box_number: 1, item_type: "FROZEN",
    dispatch_at: "", dispatch_temp: "",
    received_at: nowHHMM(), received_temp: "",
    stored_at:   nowHHMM(), stored_temp:   "",
  }]);

  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ ok: boolean; text: string } | null>(null);

  // Selected dispatch meta
  const selectedDispatch = dispatches.find((d) => d.id === dispatchId);
  const isNewFlow = selectedDispatch?.has_dispatch_boxes === true;

  // ── Load staff names ──
  useEffect(() => {
    fetch(`/api/admin/staff_master/names?city=${city}&limit=200`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d) ? d : (d.names ?? [])))
      .catch(() => {});
  }, [city]);

  // ── Load dispatches ──
  const loadDispatches = useCallback(() => {
    setLoadingDispatches(true);
    fetch(`/api/store/cold-chain/dispatches?city=${city}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.dispatches ?? [];
        setDispatches(rows);
        setDispatchId(rows[0]?.id ?? "");
      })
      .catch(() => {})
      .finally(() => setLoadingDispatches(false));
  }, [city]);

  useEffect(() => { loadDispatches(); }, [loadDispatches]);

  // ── When branch changes, auto-select the first dispatch that covers that branch ──
  useEffect(() => {
    if (!dispatches.length) return;
    // If the current dispatch already includes this branch, keep it selected.
    const current = dispatches.find((d) => d.id === dispatchId);
    if (current?.destination_branches?.includes(branch)) return;
    // Otherwise, pick the first dispatch that includes this branch.
    const relevant = dispatches.find((d) => d.destination_branches?.includes(branch));
    if (relevant) setDispatchId(relevant.id);
  }, [branch, dispatches, dispatchId]);

  // ── When dispatch changes, load boxes (new flow only) ──
  useEffect(() => {
    if (!dispatchId || !isNewFlow) { setDispatchBoxes([]); setReceiveStates([]); return; }
    setLoadingBoxes(true);
    fetch(`/api/store/cold-chain/dispatch-boxes?dispatch_id=${dispatchId}&branch_code=${branch}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        const rows: DispatchBoxRow[] = d.boxes ?? [];
        setDispatchBoxes(rows);
        setReceiveStates(rows.map((b) => ({
          box_id:        b.id,
          received_at:   nowHHMM(),
          received_temp: "",
          stored_at:     nowHHMM(),
          stored_temp:   "",
        })));
      })
      .catch(() => { setDispatchBoxes([]); setReceiveStates([]); })
      .finally(() => setLoadingBoxes(false));
  }, [dispatchId, branch, isNewFlow]);

  // ── Sync legacy box count ──
  useEffect(() => {
    if (isNewFlow) return;
    const t = nowHHMM();
    setLegacyBoxes((prev) => {
      if (boxCount === prev.length) return prev;
      if (boxCount > prev.length) {
        const extras = [];
        for (let i = prev.length + 1; i <= boxCount; i++) {
          extras.push({
            box_number: i, item_type: "FROZEN" as const,
            dispatch_at: "", dispatch_temp: "",
            received_at: t,  received_temp: "",
            stored_at: t,    stored_temp: "",
          });
        }
        return [...prev, ...extras];
      }
      return prev.slice(0, boxCount);
    });
  }, [boxCount, isNewFlow]);

  // ── Submit — new flow ──
  const submitNew = async () => {
    if (!receivedBy.trim()) { setMsg({ ok: false, text: "Select receiving staff." }); return; }
    if (!receiveStates.length) { setMsg({ ok: false, text: "No boxes to receive." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/store/cold-chain/receive", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatch_id:  dispatchId,
          city,
          branch_code:  branch,
          received_by:  receivedBy,
          boxes: receiveStates.map((s) => ({
            box_id:        s.box_id,
            received_at:   s.received_at || null,
            received_temp: s.received_temp ? parseFloat(s.received_temp) : null,
            stored_at:     s.stored_at || null,
            stored_temp:   s.stored_temp ? parseFloat(s.stored_temp) : null,
          })),
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed.");
      setMsg({ ok: true, text: `${data.boxes?.length ?? 0} box(es) received.` });
      setDispatchBoxes([]); setReceiveStates([]);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit — legacy flow ──
  const submitLegacy = async () => {
    if (!dispatchId) { setMsg({ ok: false, text: "Select a dispatch." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const payload = legacyBoxes.map((b) => ({
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
      setMsg({ ok: true, text: `${data.boxes?.length ?? 0} box(es) recorded.` });
      setBoxCount(1);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
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
          <div className="flex items-center justify-between mb-1">
            <label className={T_LABEL}>CK Dispatch</label>
            <button type="button" onClick={loadDispatches} disabled={loadingDispatches}
              className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1">
              <RefreshCw size={11} className={loadingDispatches ? "animate-spin" : ""} />
              Reload
            </button>
          </div>
          {loadingDispatches ? (
            <p className={`${T_CAPTION} text-slate-500 py-2`}>Loading...</p>
          ) : dispatches.length === 0 ? (
            <p className={`${T_CAPTION} text-amber-400 py-2`}>No dispatches today — ask CK to create one first</p>
          ) : (
            <select className={SELECT_CLASS} value={dispatchId} onChange={(e) => setDispatchId(e.target.value)}>
              {dispatches.map((d) => {
                const dests = (d.destination_branches ?? []).map((b) => BRANCH_LABELS[b] ?? b).join(", ");
                return (
                  <option key={d.id} value={d.id}>
                    {d.dispatched_by}{dests ? ` → ${dests}` : ""}
                    {d.has_dispatch_boxes ? " ✓" : ""}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </div>

      {/* Received By selector (new flow + legacy) */}
      {dispatchId && (
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Received By</label>
          <select className={SELECT_CLASS} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}>
            <option value="">— Select Receiving Staff —</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {/* ── NEW FLOW: CK pre-created boxes ── */}
      {isNewFlow && (
        <>
          {loadingBoxes ? (
            <p className={`${T_CAPTION} text-slate-500`}>Loading box data...</p>
          ) : dispatchBoxes.length === 0 ? (
            <p className={`${T_CAPTION} text-amber-400`}>No box data found for this branch/dispatch.</p>
          ) : (
            <>
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
                Dispatched by <strong>{selectedDispatch?.dispatched_by}</strong> — {dispatchBoxes.length} box(es). Enter received temp &amp; time below.
              </div>

              {dispatchBoxes.map((box, idx) => {
                const rs = receiveStates[idx] ?? { box_id: box.id, received_at: "", received_temp: "", stored_at: "", stored_temp: "" };
                const updateRs = (patch: Partial<ReceiveBoxState>) =>
                  setReceiveStates((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
                return (
                  <div key={box.id} className="rounded-xl border border-white/15 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                      <span className="text-sm font-bold text-white">Cooler Box {box.box_number}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        box.item_type === "FROZEN"
                          ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                          : "border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                      }`}>
                        {box.item_type === "FROZEN" ? "🧊 Frozen" : "❄️ Chilled"}
                      </span>
                    </div>
                    {/* CK dispatch data — read-only */}
                    <div className="px-4 py-3 bg-amber-500/5 border-b border-white/8">
                      <p className="text-xs font-bold text-amber-300 mb-2">① Dispatch (CK) — read-only</p>
                      <div className="flex gap-4 text-xs text-zinc-400">
                        <span>Time: <span className="text-zinc-200">{box.dispatch_at || "—"}</span></span>
                        <span>Temp: <span className={`font-semibold ${
                          box.dispatch_temp != null
                            ? (box.item_type === "FROZEN" ? box.dispatch_temp <= -18 : box.dispatch_temp <= 5)
                              ? "text-emerald-400"
                              : "text-red-400"
                            : "text-zinc-500"
                        }`}>{box.dispatch_temp != null ? `${box.dispatch_temp}°C` : "—"}</span></span>
                      </div>
                    </div>
                    {/* Branch received — editable */}
                    <div className="px-4 py-3 border-b border-white/8">
                      <p className="text-xs font-bold text-sky-300 mb-2.5">② Received (Branch)</p>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Time</p>
                          <TimeCell
                            value={rs.received_at}
                            onChange={(v) => updateRs({ received_at: v })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Temperature</p>
                          <TempCell
                            value={rs.received_temp}
                            onChange={(v) => updateRs({ received_temp: v })}
                            itemType={box.item_type}
                            disabled={submitting}
                            placeholder={box.item_type === "FROZEN" ? "-18.0" : "4.0"}
                          />
                        </div>
                      </div>
                    </div>
                    {/* In Storage — editable */}
                    <div className="px-4 py-3">
                      <p className="text-xs font-bold text-emerald-300 mb-2.5">③ In Storage (Branch)</p>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Time</p>
                          <TimeCell
                            value={rs.stored_at}
                            onChange={(v) => updateRs({ stored_at: v })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Temperature</p>
                          <TempCell
                            value={rs.stored_temp}
                            onChange={(v) => updateRs({ stored_temp: v })}
                            itemType={box.item_type}
                            disabled={submitting}
                            placeholder={box.item_type === "FROZEN" ? "-19.0" : "4.0"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <button type="button" onClick={submitNew}
            disabled={submitting || !dispatchId || !receivedBy}
            className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 ${
              (!dispatchId || !receivedBy) ? "opacity-50" : ""
            }`}>
            {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "Saving..." : `Submit ${dispatchBoxes.length} Box Receiving Record${dispatchBoxes.length !== 1 ? "s" : ""}`}
          </button>
        </>
      )}

      {/* ── LEGACY FLOW: CK did not pre-create boxes ── */}
      {!isNewFlow && dispatchId && (
        <>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            Legacy mode — CK has not set box data. Enter all fields manually.
          </div>

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

          {legacyBoxes.map((box, idx) => {
            const upd = (patch: Partial<typeof box>) =>
              setLegacyBoxes((prev) => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));
            return (
              <div key={box.box_number} className="rounded-xl border border-white/15 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                  <span className="text-sm font-bold text-white">Cooler Box {box.box_number}</span>
                  <div className="flex gap-2">
                    {(["FROZEN", "CHILLED"] as const).map((t) => (
                      <button key={t} type="button" disabled={submitting}
                        onClick={() => upd({ item_type: t })}
                        className={`rounded-xl border px-4 py-1.5 text-sm font-semibold transition-all ${
                          box.item_type === t
                            ? t === "FROZEN" ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                                             : "border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                            : "border-white/10 bg-white/5 text-slate-400"
                        }`}>
                        {t === "FROZEN" ? "🧊 Frozen" : "❄️ Chilled"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-white/8">
                  {[
                    { label: "① Dispatch (CK)", color: "text-amber-300", timeKey: "dispatch_at" as const, tempKey: "dispatch_temp" as const, ph: box.item_type === "FROZEN" ? "-18.0" : "4.0" },
                    { label: "② Received (Branch)", color: "text-sky-300", timeKey: "received_at" as const, tempKey: "received_temp" as const, ph: box.item_type === "FROZEN" ? "-18.0" : "4.0" },
                    { label: "③ In Storage", color: "text-emerald-300", timeKey: "stored_at" as const, tempKey: "stored_temp" as const, ph: box.item_type === "FROZEN" ? "-19.0" : "4.0" },
                  ].map((s) => (
                    <div key={s.label} className="px-4 py-3">
                      <p className={`text-xs font-bold mb-2.5 ${s.color}`}>{s.label}</p>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Time</p>
                          <TimeCell value={box[s.timeKey]} onChange={(v) => upd({ [s.timeKey]: v })} disabled={submitting} />
                        </div>
                        <div className="flex-1">
                          <p className={`${T_CAPTION} mb-1`}>Temperature</p>
                          <TempCell
                            value={box[s.tempKey]}
                            onChange={(v) => upd({ [s.tempKey]: v })}
                            itemType={box.item_type}
                            disabled={submitting}
                            placeholder={s.ph}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button type="button" onClick={submitLegacy}
            disabled={submitting || !dispatchId}
            className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2 ${!dispatchId ? "opacity-50" : ""}`}>
            {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "Saving..." : `Submit ${boxCount} Box Temperature Record${boxCount > 1 ? "s" : ""}`}
          </button>
        </>
      )}

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                 : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}
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
  const [tab,  setTab]  = useState<"receive" | "dispatch">("receive");

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

        <div className="rounded-xl border border-white/20 bg-white/5 p-4">
          {tab === "dispatch" ? <DispatchForm city={city} /> : <ReceivingForm city={city} />}
        </div>
      </div>
    </div>
  );
}
