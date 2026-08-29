// src/app/admin/coe/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileCheck2, AlertTriangle, Download } from "lucide-react";
import { getAuth } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type Snapshot = {
  found: boolean;
  can_issue?: boolean;
  missing?: string[];
  staff_name?: string;
  branch_code?: string | null;
  status?: string;
  company?: string;
  position?: string;
  hire_date?: string | null;
  last_working_date?: string | null;
  is_current?: boolean;
  sources?: Record<string, string>;
};

type CoeRow = {
  id: string;
  staff_name: string;
  request_date: string;
  due_date: string;
  days_waiting: number;
  overdue: boolean;
  purpose: string;
  company: string;
  position: string;
  hire_date: string | null;
  last_working_date: string | null;
  is_current: boolean;
  field_sources: Record<string, string>;
  status: string;
  requested_by: string;
  approved_by: string | null;
  issue_count: number;
  reject_note: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CoePage() {
  const auth = getAuth();

  const [rows, setRows] = useState<CoeRow[] | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [overdue, setOverdue] = useState(0);

  const [names, setNames] = useState<string[]>([]);
  const [staffName, setStaffName] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [requestDate, setRequestDate] = useState(todayISO());
  const [purpose, setPurpose] = useState("");

  const [sigName, setSigName] = useState(auth?.staffName || "");
  const [sigPosition, setSigPosition] = useState("");

  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/coe/requests?city=manila`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setRows(d.rows || []);
      setCanApprove(!!d.can_approve);
      setOverdue(d.overdue || 0);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/staff_master/names?city=manila&limit=5000`);
        const d = await res.json();
        setNames(Array.isArray(d?.names) ? d.names : []);
      } catch {
        setNames([]);
      }
    })();
  }, []);

  const lookup = async (name: string) => {
    setSnap(null);
    if (!name) return;
    try {
      const res = await fetch(
        `/api/admin/coe/snapshot?city=manila&staff_name=${encodeURIComponent(name)}`
      );
      const d = await res.json();
      setSnap(d);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    }
  };

  const createRequest = async () => {
    setBusy("create");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/coe/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: "manila",
          staff_name: staffName,
          request_date: requestDate,
          purpose,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: `${staffName} の請求を登録しました。` });
      setStaffName("");
      setSnap(null);
      setPurpose("");
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setBusy("");
    }
  };

  const issue = async (r: CoeRow) => {
    if (!sigName.trim()) {
      setMsg({ kind: "err", text: "署名者名を入力してください。" });
      return;
    }
    const verb = r.issue_count > 0 ? "再発行" : "発行";
    if (
      !window.confirm(
        `${r.staff_name} の在職証明書を${verb}します。\n\n` +
          `署名者：${sigName}\n` +
          `本人に渡す正式な書面です。内容を確認してから実行してください。`
      )
    )
      return;
    setBusy(r.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/coe/requests/${r.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatory_name: sigName, signatory_position: sigPosition }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: `${r.staff_name} — ${verb}しました（${d.issue_no}回目）。` });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setBusy("");
    }
  };

  const open = useMemo(() => (rows ?? []).filter((r) => r.status === "PENDING"), [rows]);
  const done = useMemo(() => (rows ?? []).filter((r) => r.status !== "PENDING"), [rows]);

  const srcTag = (r: CoeRow, k: string) =>
    r.field_sources?.[k] === "manual" ? (
      <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
        手入力
      </span>
    ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-5xl space-y-6 px-4 py-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-teal-500/10">
          <FileCheck2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Certificate of Employment</h1>
          <p className={T_CAPTION}>
            DOLE Labor Advisory 06-20 — 請求から<b>3日以内</b>の発行義務があります。
          </p>
        </div>
      </div>

      {overdue > 0 ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <b>{overdue}件</b>が3日の期限を過ぎています。遅延は DOLE への申立て事由になります。
          </span>
        </div>
      ) : null}

      {msg ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-200"
              : "border-rose-900/50 bg-rose-950/20 text-rose-200"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {/* ── New request ── */}
      <div className={`${GLASS_CARD} space-y-4 p-5`}>
        <p className={T_SECTION}>新しい請求</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className={T_LABEL + " mb-1.5"}>スタッフ</div>
            <input
              list="coe-staff"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              onBlur={(e) => lookup(e.target.value)}
              placeholder="名前を入力または選択"
              className={INPUT_CLASS}
            />
            <datalist id="coe-staff">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <div className={T_LABEL + " mb-1.5"}>本人が請求した日</div>
            <input
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-[11px] text-neutral-500">3日の期限はこの日から数えます。</p>
          </div>
          <div>
            <div className={T_LABEL + " mb-1.5"}>用途（任意）</div>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="転職先提出 など"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {snap && snap.found ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["法人", snap.company],
                ["役職", snap.position],
                ["入社日", snap.hire_date],
                [snap.is_current ? "在籍状況" : "最終出社日",
                  snap.is_current ? "在職中" : snap.last_working_date],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <div className={T_CAPTION}>{k}</div>
                  <div className="mt-0.5 text-sm text-neutral-100">
                    {v || <span className="text-rose-300">未登録</span>}
                  </div>
                </div>
              ))}
            </div>

            {snap.can_issue ? (
              <button
                type="button"
                disabled={busy === "create"}
                onClick={createRequest}
                className={`${PRIMARY_BUTTON} mt-4 text-sm disabled:opacity-40`}
              >
                {busy === "create" ? "登録中…" : "この内容で請求を登録"}
              </button>
            ) : (
              /* Naming what is missing is the point: this is the one place a hire
                 date would otherwise be guessed, and a certificate with a wrong
                 date is worse than a late one. */
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/15 p-3">
                <p className="text-sm font-semibold text-amber-200">COE を発行できません</p>
                <ul className="mt-1 list-disc pl-5 text-[13px] text-amber-100/90">
                  {(snap.missing || []).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-amber-100/70">
                  契約書を確認し、Staff の Employment Details で登録してください。
                  推測で埋めた値はそのまま証明書に印字されます。
                </p>
              </div>
            )}
          </div>
        ) : snap && !snap.found ? (
          <p className="text-sm text-rose-300">名簿に該当者がいません。</p>
        ) : null}
      </div>

      {/* ── Signatory ── */}
      {canApprove ? (
        <div className={`${GLASS_CARD} space-y-3 p-5`}>
          <p className={T_SECTION}>署名者</p>
          <p className={T_CAPTION}>
            発行のたびに選べます。証明書に印字されるのはここで入力した名前です。
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className={T_LABEL + " mb-1.5"}>署名者名</div>
              <input
                value={sigName}
                onChange={(e) => setSigName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <div className={T_LABEL + " mb-1.5"}>役職</div>
              <input
                value={sigPosition}
                onChange={(e) => setSigPosition(e.target.value)}
                placeholder="HR Manager など"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Open requests ── */}
      <div className={`${GLASS_CARD} space-y-3 p-5`}>
        <p className={T_SECTION}>発行待ち（{open.length}）</p>
        {rows === null ? (
          <p className={`${T_CAPTION} py-6 text-center`}>読み込み中…</p>
        ) : open.length === 0 ? (
          <p className={`${T_CAPTION} py-6 text-center`}>発行待ちはありません。</p>
        ) : (
          open.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-4 ${
                r.overdue
                  ? "border-rose-500/40 bg-rose-950/15"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-100">
                    {r.staff_name}
                    {!r.is_current ? (
                      <span className="ml-2 rounded bg-zinc-600/25 px-1.5 py-0.5 text-[10px] uppercase text-zinc-300">
                        退職者
                      </span>
                    ) : null}
                  </p>
                  <p className={T_CAPTION}>
                    請求 {r.request_date} · 期限 {r.due_date} ·{" "}
                    <span className={r.overdue ? "font-semibold text-rose-300" : ""}>
                      {r.overdue ? `${r.days_waiting}日経過（期限超過）` : `${r.days_waiting}日経過`}
                    </span>
                    {r.purpose ? ` · ${r.purpose}` : ""}
                  </p>
                </div>
                {canApprove ? (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => issue(r)}
                    className={`${PRIMARY_BUTTON} text-sm disabled:opacity-40`}
                  >
                    {busy === r.id ? "発行中…" : "承認して発行"}
                  </button>
                ) : (
                  <span className={T_CAPTION}>承認待ち</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 sm:grid-cols-4">
                <div>
                  <div className={T_CAPTION}>法人</div>
                  <div className="text-sm text-neutral-200">
                    {r.company}
                    {srcTag(r, "company")}
                  </div>
                </div>
                <div>
                  <div className={T_CAPTION}>役職</div>
                  <div className="text-sm text-neutral-200">
                    {r.position}
                    {srcTag(r, "position")}
                  </div>
                </div>
                <div>
                  <div className={T_CAPTION}>入社日</div>
                  <div className="text-sm text-neutral-200">
                    {r.hire_date}
                    {srcTag(r, "hire_date")}
                  </div>
                </div>
                <div>
                  <div className={T_CAPTION}>最終出社日</div>
                  <div className="text-sm text-neutral-200">
                    {r.is_current ? "—（在職中）" : r.last_working_date}
                    {srcTag(r, "last_working_date")}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Issued ── */}
      {done.length > 0 ? (
        <div className={`${GLASS_CARD} space-y-2 p-5`}>
          <p className={T_SECTION}>発行済み・却下（{done.length}）</p>
          {done.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <div>
                <span className="text-sm font-semibold text-neutral-100">{r.staff_name}</span>
                <span className={`${T_CAPTION} ml-2`}>
                  {r.status === "ISSUED"
                    ? `${r.approved_by} が発行${r.issue_count > 1 ? `（${r.issue_count}回）` : ""}`
                    : `却下：${r.reject_note || "—"}`}
                </span>
              </div>
              {r.status === "ISSUED" ? (
                <div className="flex gap-2">
                  <a
                    href={`/api/admin/coe/requests/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-xs`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </a>
                  {canApprove ? (
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => issue(r)}
                      className={`${SECONDARY_BUTTON} text-xs disabled:opacity-40`}
                    >
                      再発行
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}
