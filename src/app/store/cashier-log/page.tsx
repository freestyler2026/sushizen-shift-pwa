"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Plus, RefreshCw, Trash2, X, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { prepareUpload } from "@/lib/image-compress";
import { clearAuth, getAuth, getAuthHeaders, getUploadHeaders } from "@/lib/auth";
import {
  PRIMARY_BUTTON, SECONDARY_BUTTON, SELECT_CLASS, INPUT_CLASS,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  T_PAGE_TITLE, T_LABEL, T_CAPTION, GLASS_CARD,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const BRANCHES = [
  { code: "PAR", label: "Paranaque" },
  { code: "CUB", label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

type EntryType = "SCPWD" | "QRPH";

type LogEntry = {
  id: string;
  entry_type: EntryType;
  cashier_name: string;
  amount: number;
  reference_no: string;
  receipt_url: string;
  id_front_url: string;
  id_back_url: string;
  created_at: string;
};

type Totals = {
  SCPWD: { count: number; total: number };
  QRPH: { count: number; total: number };
};

const API = "/api/store/cashier-log";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(iso: string) {
  if (!iso) return "";
  // Normalize to ISO 8601 and parse as timezone-aware date so the browser
  // converts UTC → local time (PHT = UTC+8 for Manila cashiers).
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) {
    const t = iso.includes("T") ? iso.split("T")[1] : iso.split(" ")[1] || "";
    return t.slice(0, 5);
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

const fmtPHP = (n: number) => `₱${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Photo = { file: File; preview: string };

function PhotoSlot({ label, photo, onPick, onClear }: {
  label: string; photo: Photo | null;
  onPick: (f: File) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1 text-[11px] text-zinc-500">{label}</p>
      {photo ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt={label} className="h-24 w-full rounded-lg border border-white/10 object-cover" />
          <button
            onClick={onClear}
            className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
            aria-label="Remove photo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06]"
        >
          <Camera className="h-5 w-5" />
          <span className="text-[10px]">Add photo</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
      />
    </div>
  );
}

export default function CashierLogPage() {
  const auth = getAuth();
  const router = useRouter();
  const [branch, setBranch] = useState("PAR");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [cashierName, setCashierName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [tab, setTab] = useState<EntryType>("SCPWD");

  // entry form
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");
  const [receipt, setReceipt] = useState<Photo | null>(null);
  const [idFront, setIdFront] = useState<Photo | null>(null);
  const [idBack, setIdBack] = useState<Photo | null>(null);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSessionExpired(false);
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`${API}/entries?branch=${branch}&entry_date=${entryDate}`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`${API}/totals?branch=${branch}&entry_date=${entryDate}`, { headers: getAuthHeaders(), cache: "no-store" }),
      ]);
      if (eRes.status === 401 || tRes.status === 401) { setSessionExpired(true); return; }
      if (eRes.ok) { const d = await eRes.json(); setEntries(Array.isArray(d.entries) ? d.entries : []); }
      if (tRes.ok) { const d = await tRes.json(); setTotals(d.totals || null); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [branch, entryDate]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => { setAmount(""); setRefNo(""); setReceipt(null); setIdFront(null); setIdBack(null); };

  const uploadPhoto = async (entryId: string, slot: string, photo: Photo): Promise<boolean> => {
    const fd = new FormData();
    fd.append("branch", branch);
    fd.append("entry_date", entryDate);
    fd.append("entry_type", tab);
    fd.append("slot", slot);
    fd.append("file", await prepareUpload(photo.file));
    try {
      const res = await fetch(`${API}/entries/${entryId}/photo`, { method: "POST", headers: getUploadHeaders(), body: fd, cache: "no-store" });
      return res.ok;
    } catch { return false; }
  };

  const addEntry = async () => {
    if (!cashierName.trim()) { setMsg({ ok: false, text: "Cashier name is required." }); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setMsg({ ok: false, text: "Enter a valid amount." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/entries`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          branch, entry_date: entryDate, entry_type: tab,
          cashier_name: cashierName.trim(), amount: amt, reference_no: refNo.trim(),
        }),
        cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to save.");
      const id = d.entry?.id;
      let photoFailed = false;
      if (id) {
        const results = await Promise.all([
          receipt ? uploadPhoto(id, "receipt", receipt) : true,
          tab === "SCPWD" && idFront ? uploadPhoto(id, "id_front", idFront) : true,
          tab === "SCPWD" && idBack ? uploadPhoto(id, "id_back", idBack) : true,
        ]);
        photoFailed = results.some((ok) => !ok);
      }
      resetForm();
      setMsg({ ok: true, text: photoFailed ? "Entry saved — but photo upload failed. Try re-attaching the photo." : "Entry saved." });
      await load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    try {
      const res = await fetch(`${API}/entries/${id}`, { method: "DELETE", headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error("Failed to delete.");
      await load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const shown = entries.filter((e) => e.entry_type === tab);
  const dayTotal = totals?.[tab] ?? { count: 0, total: 0 };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div>
        <h1 className={T_PAGE_TITLE}>Cashier Log</h1>
        <p className={`${T_CAPTION} mt-1`}>
          Log <strong className="text-white">immediately when each transaction happens</strong> — SC/PWD discounts and QRPH payments.
          Every shift&apos;s cashier logs their own transactions in real time. The Closing cashier only reviews the totals.
        </p>
      </div>

      {/* Identity / context */}
      <div className={`${GLASS_CARD} grid grid-cols-2 gap-3 p-4`}>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Cashier Name</label>
          <input className={`${INPUT_CLASS} w-full`} value={cashierName} onChange={(e) => setCashierName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>PIN</label>
          <input type="password" className={`${INPUT_CLASS} w-full`} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Branch</label>
          <SelectDark
            className={`${SELECT_CLASS} w-full`}
            value={branch}
            onChange={setBranch}
            options={BRANCHES.map((b) => ({ value: b.code, label: b.label }))}
          />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Date</label>
          <input type="date" className={`${INPUT_CLASS} w-full`} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
      </div>

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        <button className={tab === "SCPWD" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("SCPWD")}>SC / PWD Discount</button>
        <button className={tab === "QRPH" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("QRPH")}>QRPH Payment</button>
      </div>

      {/* Entry form */}
      <div className={`${GLASS_CARD} space-y-3 p-4`}>
        {tab === "SCPWD" && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
            <div className="font-semibold mb-0.5">⚡ Log immediately when the transaction happens.</div>
            Enter the <strong>discount amount deducted</strong> (the 20% SC/PWD reduction) — <em>not</em> the full bill total.
            <br />Example: if the bill is ₱500, enter ₱100 (20% of ₱500).
          </div>
        )}
        {tab === "QRPH" && (
          <div className="rounded-lg border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-xs text-sky-300">
            <div className="font-semibold mb-0.5">⚡ Log immediately when the transaction happens — not at the end of your shift.</div>
            Do not rely on Discord alone. Each cashier logs their own QRPH payments in real time so the Closing total covers all shifts.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>
              {tab === "SCPWD" ? "Discount Amount (₱)" : "Amount (₱)"}
            </label>
            <input type="number" inputMode="decimal" step="0.01" className={`${INPUT_CLASS} w-full`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>{tab === "QRPH" ? "Reference No." : "OR / Receipt No."} <span className="text-zinc-600">(optional)</span></label>
            <input className={`${INPUT_CLASS} w-full`} value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={tab === "QRPH" ? "QRPH ref" : "OR no."} />
          </div>
        </div>

        {tab === "SCPWD" ? (
          <div className="grid grid-cols-3 gap-3">
            <PhotoSlot label="Receipt" photo={receipt} onPick={(f) => setReceipt({ file: f, preview: URL.createObjectURL(f) })} onClear={() => setReceipt(null)} />
            <PhotoSlot label="ID front" photo={idFront} onPick={(f) => setIdFront({ file: f, preview: URL.createObjectURL(f) })} onClear={() => setIdFront(null)} />
            <PhotoSlot label="ID back" photo={idBack} onPick={(f) => setIdBack({ file: f, preview: URL.createObjectURL(f) })} onClear={() => setIdBack(null)} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <PhotoSlot label="Payment confirmation" photo={receipt} onPick={(f) => setReceipt({ file: f, preview: URL.createObjectURL(f) })} onClear={() => setReceipt(null)} />
          </div>
        )}

        {msg && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}
          </div>
        )}

        <button onClick={() => void addEntry()} disabled={saving} className={`${PRIMARY_BUTTON} flex w-full items-center justify-center gap-2 disabled:opacity-50`}>
          <Plus className="h-4 w-4" />{saving ? "Saving…" : "Add entry"}
        </button>
      </div>

      {/* Day total */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-300">Today · {tab === "SCPWD" ? "SC/PWD Total Discount" : "QRPH Total"}</span>
          <span className="text-sm text-indigo-300">{dayTotal.count} {dayTotal.count === 1 ? "entry" : "entries"}</span>
        </div>
        <p className="mt-0.5 text-3xl font-bold text-white tabular-nums">{fmtPHP(dayTotal.total)}</p>
        <p className="mt-1 text-[11px] text-indigo-300/70">
          {tab === "SCPWD"
            ? "→ This total discount amount feeds into the Closing Cash Count automatically."
            : "→ This total feeds into the Closing Cash Count automatically. Closing staff: confirm all shifts have logged their transactions before submitting."}
        </p>
      </div>

      {/* Session expired banner */}
      {sessionExpired && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Session expired.{" "}
          <button
            className="underline"
            onClick={() => { clearAuth(); router.replace("/login"); }}
          >
            Log out now.
          </button>
        </div>
      )}

      {/* Today's log */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Today&apos;s entries ({shown.length})</h2>
          <button onClick={() => void load()} className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-xs`}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {shown.length === 0 ? (
          <p className={`${T_CAPTION} py-6 text-center`}>No entries yet for this branch/date.</p>
        ) : (
          <>
            <div className="space-y-2">
              {shown.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold tabular-nums text-sky-400">{fmtTime(e.created_at)}</span>
                      <span className="text-sm font-semibold text-white tabular-nums">{fmtPHP(e.amount)}</span>
                      <span className="text-[11px] text-zinc-400">{e.cashier_name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                      {e.reference_no && <span>#{e.reference_no}</span>}
                      {[["Receipt", e.receipt_url], ["ID front", e.id_front_url], ["ID back", e.id_back_url]]
                        .filter(([, u]) => u)
                        .map(([lab, u]) => (
                          <a key={lab as string} href={u as string} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-violet-400 hover:text-violet-300">
                            <ExternalLink className="h-3 w-3" />{lab}
                          </a>
                        ))}
                    </div>
                  </div>
                  <button onClick={() => void deleteEntry(e.id)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10" aria-label="Delete entry">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {/* Per-cashier summary for Closing staff */}
            {(() => {
              const byName: Record<string, { count: number; total: number }> = {};
              for (const e of shown) {
                const k = e.cashier_name || "Unknown";
                if (!byName[k]) byName[k] = { count: 0, total: 0 };
                byName[k].count++;
                byName[k].total += e.amount;
              }
              const names = Object.keys(byName);
              if (names.length < 2) return null;
              return (
                <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">By cashier today</p>
                  <div className="space-y-1">
                    {names.map((n) => (
                      <div key={n} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">{n}</span>
                        <span className="tabular-nums text-zinc-400">{byName[n].count} {byName[n].count === 1 ? "entry" : "entries"} · {fmtPHP(byName[n].total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
