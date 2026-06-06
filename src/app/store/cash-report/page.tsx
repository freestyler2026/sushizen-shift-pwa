"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, Send, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, ExternalLink, Camera, X, ChevronDown, ChevronUp, Banknote,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  PRIMARY_BUTTON, SELECT_CLASS, INPUT_CLASS, TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  T_PAGE_TITLE, T_LABEL, T_CAPTION, GLASS_CARD,
} from "@/lib/ui-tokens";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "PAR", label: "Paranaque" },
  { code: "CUB", label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const BILLS   = [1000, 500, 200, 100, 50, 20] as const;
const COINS   = [20, 10, 5, 1] as const;
const SENTIMO = [{ label: "25¢", key: "coin_025", val: 0.25 }, { label: "5¢", key: "coin_005", val: 0.05 }, { label: "1¢", key: "coin_001", val: 0.01 }] as const;

type DenomKey = "bill_1000"|"bill_500"|"bill_200"|"bill_100"|"bill_50"|"bill_20"|"coin_20"|"coin_10"|"coin_5"|"coin_1"|"coin_025"|"coin_005"|"coin_001";

const DENOM_VALUES: Record<DenomKey, number> = {
  bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
  coin_20: 20, coin_10: 10, coin_5: 5, coin_1: 1,
  coin_025: 0.25, coin_005: 0.05, coin_001: 0.01,
};

type Denoms = Record<DenomKey, number>;

const emptyDenoms = (): Denoms => Object.fromEntries(
  Object.keys(DENOM_VALUES).map((k) => [k, 0])
) as Denoms;

function calcTotal(d: Denoms): number {
  return Object.entries(DENOM_VALUES).reduce(
    (sum, [k, v]) => sum + (d[k as DenomKey] || 0) * v, 0
  );
}

function fmtPHP(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

// ─── Small components ─────────────────────────────────────────────────────────

function DiscrepancyBadge({ diff }: { diff: number | null }) {
  if (diff == null) return null;
  if (diff === 0) return (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
      <CheckCircle2 size={13} /> MATCH (₱0.00)
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold">
      <AlertTriangle size={13} /> MISMATCH ({diff > 0 ? "+" : ""}{fmtPHP(diff)})
    </span>
  );
}

/** Large prominent balance comparison card shown after cash count. */
function BalanceCheckCard({
  label,
  subLabel,
  expected,
  actual,
  diff,
}: {
  label: string;
  subLabel?: string;
  expected: number;
  actual: number;
  diff: number;
}) {
  const isMatch   = diff === 0;
  const isShort   = diff < 0;  // cashier is short (less than expected)
  const isOver    = diff > 0;  // cashier has more than expected
  const diffColor = isMatch ? "text-emerald-400" : "text-red-400";
  const diffBg    = isMatch
    ? "border-emerald-500/30 bg-emerald-500/8"
    : "border-red-500/40 bg-red-500/8";
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${diffBg}`}>
      <div className="flex items-center gap-2">
        {isMatch
          ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          : <AlertTriangle size={16} className="text-red-400 shrink-0" />}
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${isMatch ? "text-emerald-300" : "text-red-300"}`}>{label}</p>
          {subLabel && <p className="text-[11px] text-zinc-500">{subLabel}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white/5 border border-white/8 px-3 py-2">
          <p className="text-[11px] text-zinc-500 mb-0.5">Expected</p>
          <p className="font-bold text-white">{fmtPHP(expected)}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/8 px-3 py-2">
          <p className="text-[11px] text-zinc-500 mb-0.5">Counted</p>
          <p className="font-bold text-white">{fmtPHP(actual)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/8 px-4 py-3">
        <p className="text-xs font-semibold text-zinc-400">Difference</p>
        <p className={`text-2xl font-black ${diffColor}`}>
          {isMatch ? "±₱0.00" : `${isOver ? "+" : ""}${fmtPHP(diff)}`}
        </p>
      </div>
      {!isMatch && (
        <p className="text-xs text-zinc-500 text-center">
          {isShort ? "⚠️ Drawer is SHORT — please recount and explain below." : "⚠️ Drawer has OVERAGE — please recount and explain below."}
        </p>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, prefix = "₱", placeholder = "0.00" }: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className={`${T_LABEL} mb-1 block`}>{label}</label>
      <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <span className="text-zinc-500 text-sm">{prefix}</span>
        <input type="number" step="0.01" placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      </div>
    </div>
  );
}

function SectionHeader({ title, color = "text-violet-300" }: { title: string; color?: string }) {
  return <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${color}`}>{title}</p>;
}

// ─── Denomination Counter ──────────────────────────────────────────────────────

function DenomGrid({ denoms, onChange }: { denoms: Denoms; onChange: (d: Denoms) => void }) {
  const set = (k: DenomKey, v: number) => onChange({ ...denoms, [k]: Math.max(0, v) });
  const total = calcTotal(denoms);

  return (
    <div className="space-y-3">
      <div>
        <p className={`${T_CAPTION} text-zinc-400 mb-2`}>Banknotes</p>
        <div className="grid grid-cols-2 gap-2">
          {BILLS.map((amt) => {
            const k = `bill_${amt}` as DenomKey;
            const subtotal = (denoms[k] || 0) * amt;
            return (
              <div key={k} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/8 px-3 py-2">
                <span className="text-xs text-zinc-400 w-12">₱{amt.toLocaleString()}</span>
                <input type="number" min="0" value={denoms[k] || ""} placeholder="0"
                  onChange={(e) => set(k, parseInt(e.target.value) || 0)}
                  className="w-14 bg-transparent text-sm text-white text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none border-b border-white/20" />
                <span className="text-xs text-zinc-500 ml-auto">={fmtPHP(subtotal)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className={`${T_CAPTION} text-zinc-400 mb-2`}>Coins</p>
        <div className="grid grid-cols-2 gap-2">
          {COINS.map((amt) => {
            const k = `coin_${amt}` as DenomKey;
            const subtotal = (denoms[k] || 0) * amt;
            return (
              <div key={k} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/8 px-3 py-2">
                <span className="text-xs text-zinc-400 w-12">₱{amt}</span>
                <input type="number" min="0" value={denoms[k] || ""} placeholder="0"
                  onChange={(e) => set(k, parseInt(e.target.value) || 0)}
                  className="w-14 bg-transparent text-sm text-white text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none border-b border-white/20" />
                <span className="text-xs text-zinc-500 ml-auto">={fmtPHP(subtotal)}</span>
              </div>
            );
          })}
          {SENTIMO.map(({ label, key }) => {
            const k = key as DenomKey;
            const subtotal = (denoms[k] || 0) * DENOM_VALUES[k];
            return (
              <div key={k} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/8 px-3 py-2">
                <span className="text-xs text-zinc-400 w-12">{label}</span>
                <input type="number" min="0" value={denoms[k] || ""} placeholder="0"
                  onChange={(e) => set(k, parseInt(e.target.value) || 0)}
                  className="w-14 bg-transparent text-sm text-white text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none border-b border-white/20" />
                <span className="text-xs text-zinc-500 ml-auto">={fmtPHP(subtotal)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/8 px-4 py-3">
        <span className="text-sm font-bold text-white">Total Cash Count</span>
        <span className="text-lg font-bold text-emerald-400">{fmtPHP(total)}</span>
      </div>
    </div>
  );
}

// ─── Photo Upload Button ──────────────────────────────────────────────────────

function PhotoUpload({
  label, preview, onChange, onRemove,
}: { label: string; preview: string; onChange: (f: File) => void; onRemove: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className={`${T_LABEL} mb-2 block`}>{label}</label>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="w-full max-h-36 object-cover rounded-xl" />
          <button type="button" onClick={() => { onRemove(); if (ref.current) ref.current.value = ""; }}
            className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
            <X size={13} className="text-white" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="w-full rounded-xl border border-dashed border-white/20 bg-white/3 py-3 flex items-center justify-center gap-2 text-zinc-400 hover:bg-white/5">
          <Camera size={16} /><span className="text-xs">Tap to add photo</span>
        </button>
      )}
    </div>
  );
}

// ─── Multi-photo grid (reusable) ─────────────────────────────────────────────

type Photo = { file: File; preview: string };

function MultiPhotoGrid({
  label, sublabel, photos, onAdd, onRemove, count,
}: {
  label: string; sublabel?: string;
  photos: Photo[];
  onAdd: (f: File) => void;
  onRemove: (i: number) => void;
  count?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className={`${T_LABEL} mb-0.5`}>{label}</p>
      {sublabel && <p className="text-[11px] text-zinc-500 mb-2">{sublabel}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          onAdd(f);
          if (inputRef.current) inputRef.current.value = "";
        }} />
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`${label} ${i + 1}`}
              className="w-20 h-20 object-cover rounded-xl border border-white/15" />
            <button type="button" onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5">
              <X size={10} className="text-white" />
            </button>
            <span className="absolute bottom-1 left-1 bg-black/60 rounded text-[9px] text-white px-1">#{i + 1}</span>
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-xl border border-dashed border-white/20 bg-white/3 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:bg-white/5 shrink-0">
          <Camera size={16} />
          <span className="text-[10px]">Add</span>
        </button>
      </div>
      {photos.length > 0 && (
        <p className="text-xs text-emerald-400 mt-1.5">
          {photos.length} photo{photos.length > 1 ? "s" : ""} ready → Drive
          {count != null && photos.length < count && (
            <span className="text-amber-400 ml-2">({count - photos.length} remaining)</span>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Closing Report Form ──────────────────────────────────────────────────────

function ClosingForm({ branch, today }: { branch: string; today: string }) {
  const auth = getAuth();
  // Reference
  const [ref, setRef]             = useState<Record<string, any> | null>(null);
  const [sbInfo, setSbInfo]       = useState<Record<string, any>>({});
  const [scpwdUrl, setScpwdUrl]   = useState("");
  // POS
  const [grossSales, setGross]    = useState("");
  const [cashSales,  setCash]     = useState("");
  const [posCc,      setPosCc]    = useState("");
  const [posQrph,    setPosQrph]  = useState("");
  // CC terminal
  const [termCc, setTermCc]       = useState("");
  // QRPH — multiple GCash screenshots
  const [qrphAmt,     setQrphAmt]    = useState("");
  const [qrphPhotos,  setQrphPhotos] = useState<Photo[]>([]);
  // SC/PWD
  const [scpwdCount,    setScpwdCnt]    = useState("");
  const [scpwdDisc,     setScpwdDis]    = useState("");
  // SC/PWD — separate arrays for receipts and ID cards
  const [scpwdReceipts, setScpwdRcpts] = useState<Photo[]>([]);
  const [scpwdIdCards,  setScpwdIds]   = useState<Photo[]>([]);
  // Denominations
  const [denoms, setDenoms]       = useState<Denoms>(emptyDenoms());
  // Safety Box
  const [sbDeposit, setSbDep]     = useState("");
  // Klickit (PAR only)
  const [klickit, setKlickit]     = useState("");
  // Notes
  const [notes, setNotes]         = useState("");
  const [staffName, setStaffName] = useState(auth?.staffName || "");
  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [uploadingQrph, setUploadingQrph] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // UI
  const [showDenoms, setShowDenoms] = useState(true);
  const [reportDate, setReportDate] = useState(today);

  useEffect(() => {
    fetch(`/api/store/cash-report/reference?branch=${branch}&report_date=${reportDate}&report_type=CLOSING`, {
      headers: getAuthHeaders(), cache: "no-store",
    }).then((r) => r.json()).then((d) => {
      setRef(d.reference_report || null);
      setSbInfo(d.safety_box || {});
      setScpwdUrl(d.scpwd_drive_url || "");
    }).catch(() => {});
  }, [branch, reportDate]);

  const openingBalance = ref ? parseFloat(ref.cash_total || 0) : null;
  const sbDep  = parseFloat(sbDeposit) || 0;
  const cashSalesNum = parseFloat(cashSales) || 0;
  const expectedClosing = openingBalance != null ? openingBalance + cashSalesNum - sbDep : null;
  const cashTotal = calcTotal(denoms);
  const cashDiff  = expectedClosing != null ? Math.round((cashTotal - expectedClosing) * 100) / 100 : null;
  const ccDiff    = termCc && posCc ? Math.round((parseFloat(termCc) - parseFloat(posCc)) * 100) / 100 : null;
  const qrphDiff  = qrphAmt && posQrph ? Math.round((parseFloat(qrphAmt) - parseFloat(posQrph)) * 100) / 100 : null;

  const sbRunning = parseFloat(sbInfo.balance || 0) + sbDep;
  const sbAlert   = sbRunning > 20000;

  // Upload all QRPH screenshots; save first photo URL to DB report
  const uploadQrphPhotos = async (reportId: string) => {
    for (let i = 0; i < qrphPhotos.length; i++) {
      const fd = new FormData();
      fd.append("report_id", reportId);
      fd.append("branch", branch);
      fd.append("report_date", reportDate);
      fd.append("file", qrphPhotos[i].file);
      await fetch("/api/store/cash-report/upload-qrph-photo", {
        method: "POST", headers: getAuthHeaders(), body: fd, cache: "no-store",
      }).catch(() => {});
    }
  };

  // Upload SC/PWD receipts to SC_PWD_Receipts folder
  const uploadScpwdReceipts = async () => {
    for (const photo of scpwdReceipts) {
      const fd = new FormData();
      fd.append("branch", branch);
      fd.append("report_date", reportDate);
      fd.append("doc_type", "receipt");
      fd.append("file", photo.file);
      await fetch("/api/store/cash-report/upload-scpwd-photo", {
        method: "POST", headers: getAuthHeaders(), body: fd, cache: "no-store",
      }).catch(() => {});
    }
  };

  // Upload SC/PWD ID card photos to SC_PWD_ID folder
  const uploadScpwdIdCards = async () => {
    for (const photo of scpwdIdCards) {
      const fd = new FormData();
      fd.append("branch", branch);
      fd.append("report_date", reportDate);
      fd.append("doc_type", "id");
      fd.append("file", photo.file);
      await fetch("/api/store/cash-report/upload-scpwd-photo", {
        method: "POST", headers: getAuthHeaders(), body: fd, cache: "no-store",
      }).catch(() => {});
    }
  };

  const submit = async () => {
    if (!staffName.trim()) { setMsg({ ok: false, text: "Staff name is required." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const body = {
        branch, report_date: reportDate, report_type: "CLOSING", staff_name: staffName,
        pos_gross_sales:   parseFloat(grossSales) || null,
        pos_cash_sales:    parseFloat(cashSales)  || null,
        pos_credit_card:   parseFloat(posCc)      || null,
        pos_qrph:          parseFloat(posQrph)    || null,
        terminal_credit_card_amt: termCc ? parseFloat(termCc) : null,
        qrph_terminal_amt:    qrphAmt ? parseFloat(qrphAmt) : null,
        scpwd_count:          parseInt(scpwdCount) || 0,
        scpwd_total_discount: parseFloat(scpwdDisc) || 0,
        scpwd_ids_uploaded:   scpwdIdCards.length > 0,
        scpwd_receipts_saved: scpwdReceipts.length > 0,
        ...denoms,
        opening_balance:     openingBalance,
        safety_box_deposit_amt: sbDep,
        klickit_gross_sales: branch === "PAR" && klickit ? parseFloat(klickit) : null,
        discrepancy_notes:   notes,
      };
      const res = await fetch("/api/store/cash-report", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      const reportId = d.report?.id || "";
      if (qrphPhotos.length > 0 && reportId) await uploadQrphPhotos(reportId);
      if (scpwdReceipts.length > 0) await uploadScpwdReceipts();
      if (scpwdIdCards.length > 0)  await uploadScpwdIdCards();
      setMsg({ ok: true, text: "Closing report submitted successfully." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className={`${T_LABEL} mb-1 block`}>Staff Name</label>
          <input className={`${INPUT_CLASS} w-full`} value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="min-w-0 overflow-hidden">
          <label className={`${T_LABEL} mb-1 block`}>Report Date</label>
          <input type="date" className={`${INPUT_CLASS} w-full max-w-full`} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </div>
      </div>
      {openingBalance != null && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2 text-sm text-sky-300">
          Opening Balance (from morning report): <strong>{fmtPHP(openingBalance)}</strong>
        </div>
      )}

      {/* Section 1: POS Figures */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <SectionHeader title="① POS Figures" color="text-violet-300" />
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Gross Sales (Dine-in)" value={grossSales} onChange={setGross} />
          <NumInput label="Cash Sales (Dine-in)" value={cashSales} onChange={setCash} />
          <NumInput label="Credit Card (POS)" value={posCc} onChange={setPosCc} />
          <NumInput label="QRPH / Cashless (POS)" value={posQrph} onChange={setPosQrph} />
        </div>
      </div>

      {/* Section 2: Credit Card Terminal */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <SectionHeader title="② Credit Card Terminal Check" color="text-sky-300" />
        <NumInput label="Credit Card Terminal Amount" value={termCc} onChange={setTermCc} />
        {ccDiff != null && <DiscrepancyBadge diff={ccDiff} />}
      </div>

      {/* Section 3: QRPH / GCash */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <SectionHeader title="③ QRPH / GCash Check" color="text-cyan-300" />
        <NumInput label="Total Amount (POS)" value={qrphAmt} onChange={setQrphAmt} />
        {qrphDiff != null && <DiscrepancyBadge diff={qrphDiff} />}
        <MultiPhotoGrid
          label="GCash Screenshots"
          sublabel="Add one screenshot per transaction"
          photos={qrphPhotos}
          onAdd={(f) => setQrphPhotos((p) => [...p, { file: f, preview: URL.createObjectURL(f) }])}
          onRemove={(i) => setQrphPhotos((p) => p.filter((_, j) => j !== i))}
          count={parseInt(posQrph) > 0 ? undefined : undefined}
        />
      </div>

      {/* Section 4: SC/PWD */}
      <div className={`${GLASS_CARD} p-4 space-y-4`}>
        <div>
          <SectionHeader title="④ SC / PWD Discounts" color="text-amber-300" />
          <p className="text-[11px] text-zinc-500">Enter totals from POS X / Z Report (all shifts combined)</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Total Count (POS)" value={scpwdCount} onChange={setScpwdCnt} prefix="#" placeholder="0" />
          <NumInput label="Total Discount (POS)" value={scpwdDisc} onChange={setScpwdDis} />
        </div>

        {/* Receipts */}
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧾</span>
            <p className="text-xs font-bold text-zinc-200">SC/PWD Receipts</p>
          </div>
          <MultiPhotoGrid
            label=""
            sublabel="Upload POS receipt for each SC/PWD transaction"
            photos={scpwdReceipts}
            onAdd={(f) => setScpwdRcpts((p) => [...p, { file: f, preview: URL.createObjectURL(f) }])}
            onRemove={(i) => setScpwdRcpts((p) => p.filter((_, j) => j !== i))}
            count={parseInt(scpwdCount) || undefined}
          />
        </div>

        {/* ID Cards */}
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🪪</span>
            <p className="text-xs font-bold text-zinc-200">SC/PWD ID Cards</p>
          </div>
          <MultiPhotoGrid
            label=""
            sublabel="Upload front AND back of each customer's ID"
            photos={scpwdIdCards}
            onAdd={(f) => setScpwdIds((p) => [...p, { file: f, preview: URL.createObjectURL(f) }])}
            onRemove={(i) => setScpwdIds((p) => p.filter((_, j) => j !== i))}
            count={(parseInt(scpwdCount) || 0) * 2 || undefined}
          />
          {(parseInt(scpwdCount) || 0) > 0 && (
            <p className="text-[11px] text-zinc-500">
              Expected: {(parseInt(scpwdCount) || 0) * 2} photos ({parseInt(scpwdCount) || 0} customers × front + back)
            </p>
          )}
        </div>

        {scpwdUrl && (
          <a href={scpwdUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300">
            <ExternalLink size={12} /> Open SC/PWD Folder on Google Drive
          </a>
        )}
      </div>

      {/* Section 5: Cash Count */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <button type="button" onClick={() => setShowDenoms((p) => !p)}
          className="w-full flex items-center justify-between">
          <SectionHeader title="⑤ Cash Denomination Count" color="text-emerald-300" />
          {showDenoms ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
        </button>
        {showDenoms && <DenomGrid denoms={denoms} onChange={setDenoms} />}
        {expectedClosing != null && cashDiff != null && (
          <BalanceCheckCard
            label="Closing Balance Check"
            subLabel={`Opening ₱${openingBalance?.toFixed(2)} + Cash Sales ₱${cashSalesNum.toFixed(2)} − Safety Box ₱${sbDep.toFixed(2)}`}
            expected={expectedClosing}
            actual={cashTotal}
            diff={cashDiff}
          />
        )}
      </div>

      {/* Section 6: Safety Box */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <SectionHeader title="⑥ Safety Box Deposit" color="text-rose-300" />
        <NumInput label="Amount Deposited (₱1,000 bills)" value={sbDeposit} onChange={setSbDep} />
        <div className={`text-xs rounded-lg px-3 py-2 ${sbAlert ? "bg-red-500/15 border border-red-500/30 text-red-300" : "bg-white/5 border border-white/10 text-zinc-400"}`}>
          {sbAlert ? <AlertTriangle size={12} className="inline mr-1" /> : null}
          Estimated running balance: <strong>{fmtPHP(sbRunning)}</strong>
          {sbAlert && " — ⚠️ Exceeds ₱20,000. HQ will be notified."}
        </div>
      </div>

      {/* Section 7: Klickit (PAR only) */}
      {branch === "PAR" && (
        <div className={`${GLASS_CARD} p-4 space-y-3`}>
          <SectionHeader title="⑦ Klickit Entry (Paranaque only)" color="text-orange-300" />
          <NumInput label="Gross Sales entered in Klickit" value={klickit} onChange={setKlickit} />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={`${T_LABEL} mb-1 block`}>Notes / Discrepancy Explanation</label>
        <textarea className={`${INPUT_CLASS} min-h-[80px] resize-none`} value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder="Any notes or explanation..." />
      </div>

      <button type="button" onClick={submit} disabled={submitting}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Submitting..." : "Submit Closing Report"}
      </button>
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── Opening Report Form ──────────────────────────────────────────────────────

function OpeningForm({ branch, today }: { branch: string; today: string }) {
  const auth = getAuth();
  const [ref, setRef]           = useState<Record<string, any> | null>(null);
  const [denoms, setDenoms]     = useState<Denoms>(emptyDenoms());
  const [staffName, setStaffName] = useState(auth?.staffName || "");
  const [notes, setNotes]       = useState("");
  const [reportDate, setReportDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDenoms, setShowDenoms] = useState(true);

  useEffect(() => {
    fetch(`/api/store/cash-report/reference?branch=${branch}&report_date=${reportDate}&report_type=OPENING`, {
      headers: getAuthHeaders(), cache: "no-store",
    }).then((r) => r.json()).then((d) => setRef(d.reference_report || null)).catch(() => {});
  }, [branch, reportDate]);

  const prevClosing = ref ? parseFloat(ref.cash_total || 0) : null;
  const prevSbDep   = ref ? parseFloat(ref.safety_box_deposit_amt || 0) : null;
  const expectedOpening = prevClosing != null && prevSbDep != null
    ? Math.round((prevClosing - prevSbDep) * 100) / 100
    : null;
  const cashTotal = calcTotal(denoms);
  const diff = expectedOpening != null ? Math.round((cashTotal - expectedOpening) * 100) / 100 : null;

  const submit = async () => {
    if (!staffName.trim()) { setMsg({ ok: false, text: "Staff name is required." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/store/cash-report", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          branch, report_date: reportDate, report_type: "OPENING",
          staff_name: staffName, ...denoms,
          opening_balance: expectedOpening,
          discrepancy_notes: notes,
        }), cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setMsg({ ok: true, text: "Opening report submitted successfully." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className={`${T_LABEL} mb-1 block`}>Staff Name</label>
          <input className={`${INPUT_CLASS} w-full`} value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="min-w-0 overflow-hidden">
          <label className={`${T_LABEL} mb-1 block`}>Report Date</label>
          <input type="date" className={`${INPUT_CLASS} w-full max-w-full`} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </div>
      </div>

      {expectedOpening != null && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
          Expected = Prev. Closing {fmtPHP(prevClosing)} − Safety Box {fmtPHP(prevSbDep)} = <strong className="text-white">{fmtPHP(expectedOpening)}</strong>
        </div>
      )}

      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <button type="button" onClick={() => setShowDenoms((p) => !p)}
          className="w-full flex items-center justify-between">
          <SectionHeader title="Cash Count" color="text-emerald-300" />
          {showDenoms ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
        </button>
        {showDenoms && <DenomGrid denoms={denoms} onChange={setDenoms} />}
      </div>

      {/* Prominent balance check — always visible after counting */}
      {expectedOpening != null && diff != null && (
        <BalanceCheckCard
          label="Night Shift Verification"
          subLabel="Does your count match yesterday's closing drawer?"
          expected={expectedOpening}
          actual={cashTotal}
          diff={diff}
        />
      )}

      {diff != null && diff !== 0 && (
        <div>
          <label className={`${T_LABEL} mb-1 block text-red-400`}>⚠️ Discrepancy Explanation (required)</label>
          <textarea className={`${INPUT_CLASS} min-h-[80px] resize-none border-red-500/40`}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Please explain the discrepancy..." />
        </div>
      )}

      <button type="button" onClick={submit} disabled={submitting}
        className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
        {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Submitting..." : "Submit Opening Report"}
      </button>
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashReportPage() {
  const router = useRouter();
  const auth   = getAuth();
  const today  = new Date().toISOString().slice(0, 10);
  const [branch, setBranch] = useState<string>("PAR");
  const [tab, setTab]       = useState<"closing" | "opening">("closing");

  useEffect(() => {
    if (!auth?.staffName) router.replace("/login");
  }, [auth, router]);

  if (!auth?.staffName) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <Banknote size={22} className="text-emerald-400" />
          <div>
            <h1 className={T_PAGE_TITLE}>Cash Report</h1>
            <p className={`${T_CAPTION} text-slate-400`}>Daily opening & closing cash management</p>
          </div>
        </div>

        {/* Branch selector */}
        <div className="mb-4">
          <label className={`${T_LABEL} mb-1 block`}>Branch</label>
          <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCHES.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className={`${TAB_CONTAINER} mb-5`}>
          <button className={tab === "closing" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("closing")}>
            🌙 Closing Report
          </button>
          <button className={tab === "opening" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("opening")}>
            ☀️ Opening Report
          </button>
        </div>

        <div className="rounded-xl border border-white/20 bg-white/5 p-4">
          {tab === "closing"
            ? <ClosingForm branch={branch} today={today} />
            : <OpeningForm branch={branch} today={today} />}
        </div>
      </div>
    </div>
  );
}
