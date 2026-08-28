"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Hand, RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_LABEL,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

interface WaitingAction {
  key: string;
  label: string;
  method: string;
  endpoint?: string;
  form?: string;
  body_key?: string;
  /** Fixed payload the provider declared, e.g. {hq_action: "approved"}. */
  body?: Record<string, unknown>;
  /** For work that genuinely needs the record: opens that one, not a list. */
  open_url?: string;
}

interface WaitingItem {
  uid: string;
  kind: string;
  kind_label: string;
  city: string;
  branch: string;
  title: string;
  detail: string;
  sub: string;
  owner: string;
  severity: string;
  waiting_min: number;
  photo_url: string | null;
  actions: WaitingAction[];
}

function waited(min: number): string {
  if (min < 60) return `${min}分`;
  if (min < 1440) return `${Math.floor(min / 60)}時間`;
  return `${Math.floor(min / 1440)}日`;
}

/** The photo an item is about, when it has one. */
function ItemPhoto({ url }: { url: string }) {
  const thumb = `${url}?size=thumb`;
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="block overflow-hidden rounded-lg border border-white/10 bg-black/20"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" loading="lazy" onError={() => setFailed(true)} className="max-h-32 object-contain" />
      </button>
      {full && (
        <div onClick={() => setFull(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

function Row({ item, onDone }: { item: WaitingItem; onDone: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [feedback, setFeedback] = useState("");
  const [openForm, setOpenForm] = useState(false);

  // Everything an item needs to be settled is on the row, so it is settled here.
  // Sending someone to another page to finish is the step that never happens.
  async function run(a: WaitingAction) {
    // Some work cannot honestly be finished from a row — judging a refund needs
    // the record. Those open the one record rather than a page to search.
    if (a.open_url) { window.open(a.open_url, "_blank", "noopener"); return; }
    if (a.form === "feedback" && !openForm) { setOpenForm(true); return; }
    if (a.form === "feedback" && !feedback.trim()) { setErr("フィードバックを入力してください"); return; }
    setBusy(a.key);
    setErr("");
    try {
      let body: Record<string, unknown> | undefined;
      if (a.body_key === "bo_assignee_self") {
        body = { bo_assignee: getAuth()?.staffName || "" };
      } else if (a.form === "feedback") {
        body = {
          photo_checked: true,
          issue_found: true,
          issue_detail: feedback.trim(),
          close_task: true,
        };
      } else if (a.form === "close") {
        body = { photo_checked: true, issue_found: false, close_task: true };
      } else if (a.body) {
        // Providers cannot know who is signed in, so they mark the slot instead.
        body = Object.fromEntries(
          Object.entries(a.body).map(([k, v]) =>
            [k, v === "__me__" ? (getAuth()?.staffName || "") : v]),
        );
      }
      const res = await fetch(a.endpoint as string, {
        method: a.method,
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 160) || `HTTP ${res.status}`);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const sev =
    item.severity === "red"
      ? "border-l-red-500"
      : item.severity === "yellow"
      ? "border-l-amber-500"
      : "border-l-white/20";

  return (
    <div className={`border-l-2 ${sev} bg-white/[0.02] px-4 py-3`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-white">{item.title}</span>
        <span className="text-xs text-zinc-400">{item.branch}</span>
        {item.detail && <span className="text-xs text-zinc-500">{item.detail}</span>}
        <span className="ml-auto text-xs tabular-nums text-zinc-400">{waited(item.waiting_min)}待ち</span>
      </div>
      <div className={`${T_CAPTION} mt-0.5`}>
        {item.owner ? item.sub : <span className="text-red-300">{item.sub}</span>}
      </div>

      {item.photo_url && (
        <div className="mt-2">
          <ItemPhoto url={item.photo_url} />
        </div>
      )}

      {openForm && (
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          placeholder="フィードバックの内容（この記録が本部から確認できます）"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
        />
      )}

      {err && <div className="mt-1.5 text-xs text-red-400">{err}</div>}

      <div className="mt-2 flex flex-wrap gap-2">
        {item.actions.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={!!busy}
            onClick={() => void run(a)}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
              a.key === "take_on" || a.key === "claim" || a.key === "hq_approve" || a.key === "ot_approve"
                ? "border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                : "border-white/12 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {busy === a.key ? "…" : a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const PAGE_SIZE = 5;

export default function WaitingForSomeonePage() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [errors, setErrors] = useState<{ provider: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.replace("/login?next=%2Fadmin%2Fincidents%2Funowned"); return; }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner("");
    try {
      const qs = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await fetch(`/api/admin/waiting${qs}`, { headers: getAuthHeaders(getAuth()) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setItems(d.items || []);
      setErrors(d.errors || []);
    } catch (e) {
      setBanner(`読み込めませんでした: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  // Grouped by kind. 145 rows in one list is read the same way as none of them;
  // a dozen group headings with a count each stays honest and stays readable.
  const groups = useMemo(() => {
    const by = new Map<string, WaitingItem[]>();
    for (const i of items) {
      const arr = by.get(i.kind_label) ?? [];
      arr.push(i);
      by.set(i.kind_label, arr);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const unowned = items.filter((i) => !i.owner).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Hand className="h-5 w-5 text-amber-400" />
        <h1 className={T_PAGE_TITLE}>Waiting for Someone</h1>
        <SelectDark
          value={city}
          onChange={setCity}
          options={[
            { value: "", label: "All cities" },
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ]}
        />
        <button type="button" onClick={() => void load()} className={SMALL_BUTTON}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
      </div>

      <p className={`${T_CAPTION} mb-4 max-w-2xl`}>
        誰も担当していないもの、または担当がいても期限を過ぎたものだけを集めています。
        ここで対応まで終わります。他のページに移動する必要はありません。
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className={`${GLASS_CARD} px-4 py-2.5`}>
          <div className={T_LABEL}>Waiting</div>
          <div className="text-xl font-bold tabular-nums text-white">{items.length}</div>
        </div>
        <div className={`${GLASS_CARD} px-4 py-2.5`}>
          <div className={T_LABEL}>Nobody owns</div>
          <div className={`text-xl font-bold tabular-nums ${unowned > 0 ? "text-red-400" : "text-white"}`}>
            {unowned}
          </div>
        </div>
      </div>

      {/* A provider that failed must say so. A short list is otherwise
          indistinguishable from a quiet day, which is the failure this page exists
          to prevent. */}
      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="text-sm text-red-300">
            {errors.length} 件の取得に失敗しています。この一覧は不完全です。
            <div className="mt-1 font-mono text-xs opacity-80">
              {errors.map((e) => `${e.provider}: ${e.error}`).join(" / ")}
            </div>
          </div>
        </div>
      )}

      {banner && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {banner}
        </div>
      )}

      {loading && <div className={T_CAPTION}>読み込み中…</div>}

      {!loading && items.length === 0 && (
        <div className={`${GLASS_CARD} px-5 py-8 text-center`}>
          <div className="text-sm text-emerald-300">待っているものはありません。</div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map(([label, rows]) => {
          const isOpen = expanded.has(label);
          const shown = isOpen ? rows : rows.slice(0, PAGE_SIZE);
          return (
            <div key={label} className={`${GLASS_CARD} overflow-hidden p-0`}>
              <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
                <span className="text-sm font-semibold text-white">{label}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums text-zinc-300">
                  {rows.length}
                </span>
                {rows.length > PAGE_SIZE && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(label)) next.delete(label); else next.add(label);
                        return next;
                      })
                    }
                    className="ml-auto text-xs font-semibold text-violet-300 hover:text-violet-200"
                  >
                    {isOpen ? "折りたたむ" : `すべて表示 (${rows.length})`}
                  </button>
                )}
              </div>
              <div className="divide-y divide-white/5">
                {shown.map((i) => (
                  <Row key={i.uid} item={i} onDone={() => void load()} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
