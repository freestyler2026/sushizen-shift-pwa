"use client";

/**
 * Back-office days: presence against engagement.
 *
 * Built to answer one question the owners asked plainly -- is somebody signed
 * in and going through the motions. The only thing a system can see is the
 * difference between being present and being engaged, so that gap is what the
 * page is arranged around, and everything else on it exists to stop that gap
 * being read as more than it is.
 *
 * Three refusals are deliberate and should survive future edits:
 *   - No score. One number reads as a verdict, and the same figure means
 *     opposite things for a reviewer and for a data-entry role.
 *   - Nothing is called missing unless the clock was running. A row whose day
 *     began before the recording did carries no absence flag at all.
 *   - Every threshold is printed next to the flag it produced. A rule nobody
 *     can read is a rule nobody trusts, and this one decides what a person is
 *     accused of.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE, SMALL_BUTTON, INPUT_CLASS,
  TABLE_HEADER, TABLE_ROW, T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
} from "@/lib/ui-tokens";

// The same two names the server enforces. Kept here only so the page can say
// "not available" instead of rendering an empty table -- a hidden screen is
// not access control, the 403 is.
const VIEWERS = ["Yukihiro Nishimura", "Ayako Nishimura"];

type Row = {
  staff_name: string; city: string; branch_code: string; role: string;
  signed_in: boolean; sessions: number;
  login_at: string | null; first_action_at: string | null; last_action_at: string | null;
  /** No session was opened on this date — they were still signed in from the
   *  day before, so the time in the login column is the first thing they did,
   *  not a sign-in. Ordinary for anybody whose shift ends after midnight. */
  login_carried_over?: boolean;
  span_minutes: number; active_minutes: number; idle_minutes: number;
  longest_idle_minutes: number;
  events: number; screens: number; reads: number; writes: number;
  distinct_screens: number; buckets: number[]; busiest_slot_share: number;
  partial: boolean; unrecorded: boolean; observed_from: string | null;
  shift: { start_hour: number; end_hour: number } | null;
  rostered: boolean | null;
  day_complete: boolean;
  by_name: boolean;
  clock_in: string | null; clock_out: string | null;
  flags: string[];
};

type Report = {
  date: string;
  idle_gap_minutes: number;
  rules: Record<string, { says: string } & Record<string, unknown>>;
  selection: { roles: string[]; city: string; individuals: string[] };
  coverage: {
    log_from: string | null; log_to: string | null; log_rows: number;
    partial_rows: number; people: number; day_in_progress: number;
    date_recorded: "none" | "partial" | "full";
    with_shift_reference: number; without_shift_reference: number;
  };
  rows: Row[];
};

type ScreenRow = { screen: string; events: number; writes: number; first_at: string; last_at: string };

const TZ: Record<string, string> = { manila: "Asia/Manila", dubai: "Asia/Dubai" };
const CITY_LABEL: Record<string, string> = { manila: "マニラ", dubai: "ドバイ" };

function clock(iso: string | null, city: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: TZ[city] || "Asia/Dubai",
    });
  } catch { return "—"; }
}

/** A dash, not a zero, when nothing was measuring. Zero is a claim about the
 *  person; a dash is a statement about the record. */
function num(v: number | string, measured: boolean): string {
  return measured ? String(v) : "—";
}

/** Minutes between the two punches, or null when either is missing. The row
 *  carries both and the page used to show neither -- while calling the span
 *  between somebody's first and last OS action "在席", which is not the same
 *  thing and was out by up to seven hours in both directions on 2026-09-10:
 *  Karen Jane Borja was clocked in for 9h55m and the column said 2h46m;
 *  Ruby Rosa Rongcales was clocked in for 10h10m and it said 23h04m. */
function punchMinutes(r: { clock_in: string | null; clock_out: string | null }): number | null {
  if (!r.clock_in || !r.clock_out) return null;
  const a = Date.parse(r.clock_in), b = Date.parse(r.clock_out);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / 60000;
}

function hm(min: number, measured = true): string {
  if (!measured) return "—";
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** The day as 48 half hours. The shape answers "was this one flurry or a day"
 *  faster than any of the numbers beside it. */
function Strip({ buckets, shift }: { buckets: number[]; shift: Row["shift"] }) {
  const peak = Math.max(1, ...buckets);
  return (
    <div className="flex h-6 w-full items-end gap-[1px]" aria-hidden="true">
      {buckets.map((n, i) => {
        const rostered = shift && i >= shift.start_hour * 2 && i < shift.end_hour * 2;
        const h = n ? Math.max(3, Math.round((n / peak) * 24)) : 0;
        return (
          <div key={i} className="relative flex-1" style={{ height: 24 }}>
            {rostered && <div className="absolute inset-x-0 bottom-0 h-full rounded-[1px] bg-white/6" />}
            {h > 0 && (
              <div
                className="absolute inset-x-0 bottom-0 rounded-[1px] bg-violet-400"
                style={{ height: h }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const FLAG_TONE: Record<string, string> = {
  NEVER_SIGNED_IN: "border-red-500/30 bg-red-500/10 text-red-300",
  NO_OS_ACTIVITY: "border-red-500/30 bg-red-500/10 text-red-300",
  MOSTLY_IDLE: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  LONG_IDLE: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  ONE_BURST: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  NO_DECISIONS: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  NO_SHIFT_REFERENCE: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

// Shown on the chips. The keys stay English because they are what the API and
// the tests speak; only the reader's side is Japanese.
const FLAG_LABEL: Record<string, string> = {
  NEVER_SIGNED_IN: "未ログイン",
  NO_OS_ACTIVITY: "操作なし",
  MOSTLY_IDLE: "ほぼ無操作",
  LONG_IDLE: "長時間の空白",
  ONE_BURST: "ひと固まりだけ",
  NO_DECISIONS: "変更ゼロ",
  NO_SHIFT_REFERENCE: "シフト未登録",
};

// Role keys are left in English on purpose: they are the same identifiers that
// appear in Role Management, and translating them here would make the two
// screens impossible to cross-check.
const ROLE_LABEL: Record<string, string> = {
  HR_MANAGER: "HR Manager", MANILA_MANAGEMENT: "Manila Management",
  MANILA_MANAGER: "Manila Manager", HR_STAFF: "HR Staff", ADMIN: "Admin",
  INVENTORY_PURCHASING: "Inventory & Purchasing", HQ: "HQ",
};

export default function BackOfficeActivityPage() {
  // Prerendered HTML is the same for everybody and has no localStorage, so a
  // page that decides access on the first render tells every reader they are
  // not allowed, for a frame (lesson 42).
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string>("");
  const [screens, setScreens] = useState<Record<string, ScreenRow[]>>({});

  useEffect(() => { setMounted(true); }, []);
  const me = mounted ? (getAuth()?.staffName || "") : "";
  const allowed = VIEWERS.includes(me);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/admin/back-office/activity?date=${date}`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) {
        setErr(res.status === 403 ? "このアカウントではこのページを開けません。"
          : `読み込めませんでした（${res.status}）。`);
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setErr("読み込めませんでした。通信を確認してもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  async function toggle(r: Row) {
    const key = r.staff_name;
    if (open === key) { setOpen(""); return; }
    setOpen(key);
    if (screens[key]) return;
    try {
      const res = await fetch(
        `/api/admin/back-office/screens?staff_name=${encodeURIComponent(key)}&date=${date}&city=${r.city}`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setScreens((s) => ({ ...s, [key]: j.rows || [] }));
      }
    } catch { /* the row still shows its numbers */ }
  }

  const totals = useMemo(() => {
    const rows = data?.rows || [];
    return {
      people: rows.length,
      flagged: rows.filter((r) => r.flags.length).length,
      partial: rows.filter((r) => r.partial).length,
      // Excludes rows nothing was recording: on an unwatched date every single
      // person would otherwise be counted as "signed in and did nothing".
      silent: rows.filter(
        (r) => r.signed_in && r.events === 0 && !r.partial && !r.unrecorded).length,
    };
  }, [data]);

  if (!mounted) return null;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <div className={`${GLASS_CARD} p-6 text-center`}>
          <h1 className={T_SECTION}>このページは表示できません</h1>
          <p className={`${T_BODY} mt-2`}>特定のアカウントのみが開けます。</p>
        </div>
      </div>
    );
  }

  const cov = data?.coverage;

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>バックオフィス — 1日のかたち</h1>
          <p className={`${T_BODY} mt-1 max-w-2xl`}>
            1行が1人の、その日のOSの使い方です。いつ来て、その間どれだけ手が動いていて、
            何の画面を開いたか。
          </p>
          {data?.selection && (
            <p className={`${T_CAPTION} mt-2 max-w-2xl`}>
              対象：<strong>{CITY_LABEL[data.selection.city] || data.selection.city}</strong> の{" "}
              {data.selection.roles.map((r) => ROLE_LABEL[r] || r).join(" / ")} 保有者
              {data.selection.individuals.length > 0 && (
                <>と、<strong>{data.selection.individuals.join("、")}</strong>（人名で追加）。</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className={T_LABEL} htmlFor="d">日付</label>
            <input id="d" type="date" value={date} className={`${INPUT_CLASS} mt-1`}
              onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="button" className={SMALL_BUTTON} onClick={() => void load()} disabled={loading}>
            {loading ? "読み込み中…" : "再読み込み"}
          </button>
        </div>
      </div>

      {/* What this cannot tell you. First, not last: a reader who takes a low
          row as proof of idleness before reaching a footnote has already made
          the mistake this panel exists to prevent. */}
      <div className={`${GLASS_CARD} border-amber-500/20 bg-amber-500/5 p-4`}>
        <p className="text-sm font-semibold text-amber-200">行を根拠にする前に読んでください</p>
        <ul className={`${T_BODY} mt-2 list-disc space-y-1 pl-5`}>
          <li>ここで測っているのは <strong>OSの使用</strong> だけです。電話・会議・Excel・紙の仕事は
            1件も残りません。<strong>静かな行は、静かな1日の証拠ではありません。</strong></li>
          {cov && cov.without_shift_reference > 0 && (
            <li><strong>{cov.people}名中{cov.without_shift_reference}名</strong>は公開シフトが
              1件もないため、「静かな日」と「休みの日」を区別できません。その行は
              欠勤と呼ばずに、その旨を表示します。</li>
          )}
          {cov?.log_from && (
            <li>記録の開始は <strong>{new Date(cov.log_from).toLocaleString("ja-JP")}</strong> です。
              それ以前は<strong>そもそも見ていません</strong>。<em>記録開始前から勤務</em> の行は
              観測範囲の外で1日を始めた人で、不在系のフラグは1つも出しません。</li>
          )}
          <li><strong>その人の1日が終わるまで、フラグは1つも出しません</strong> —
            過去の日付か、本日ならシフト終了後です。マニラの0時はドバイの夕方なので、
            これが無いと毎朝ほぼ全員が「欠勤」に見えます。<strong>数字は常時ライブ、判定だけが待ちます。</strong></li>
          <li>何も書いていないことと、何もしていないことは違います。40件確認して全部問題なければ、
            記録は1件も増えません。</li>
          <li><strong>Inventory &amp; Purchasing は店舗勤務です。</strong>1日の大半は売場で、
            ここではありません。実働が短いのが彼らの通常です。<strong>事務所の行と比べず、
            彼ら同士で比べてください。</strong></li>
          {/* The three HQ names work in Manila, though the roster registers
              them under the Dubai entity. The whole page is measured on
              Manila time for everybody, so the half-hour bars can be read
              down the column. An earlier note here said their verdict
              arrived four hours late; that was true of the Dubai clock and
              is no longer true of anything, so it is gone rather than left
              to be believed. */}
          <li>閲覧と変更は<strong>サーバーが観測</strong>しています。画面数だけは
            <strong>ブラウザからの申告</strong>なので、<strong>本人がクリックして水増しできる唯一の数字</strong>です。
            判断は実働時間と変更内容で行ってください。</li>
        </ul>
      </div>

      {cov?.date_recorded === "none" && (
        <div className={`${GLASS_CARD} border-red-500/30 bg-red-500/5 p-4`}>
          <p className="text-sm font-semibold text-red-200">この日はまだ記録していません</p>
          <p className={`${T_BODY} mt-2`}>
            操作の記録を取り始めたのは{" "}
            <strong>{cov.log_from ? new Date(cov.log_from).toLocaleString("ja-JP") : "—"}</strong>{" "}
            です。それより前の日について、<strong>この画面は何も測っていません。</strong>
            表の 打刻の下のOS・実働・画面・閲覧・変更 が「—」なのはそのためで、
            <strong>0ではありません。</strong>
          </p>
          <p className={`${T_BODY} mt-2`}>
            この日について言えるのは<strong>ログインの有無だけ</strong>です。
            それは以前から記録されているので信用できます。
          </p>
        </div>
      )}

      {err && (
        <div className={`${GLASS_CARD} border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200`}>{err}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}><p className={KPI_LABEL}>対象人数</p><p className={KPI_VALUE}>{totals.people}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>フラグのある行</p><p className={KPI_VALUE}>{totals.flagged}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>ログイン済み・操作なし</p><p className={KPI_VALUE}>{totals.silent}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>まだ勤務中</p><p className={KPI_VALUE}>{cov?.day_in_progress ?? 0}</p></div>
      </div>

      <div className={`${GLASS_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr>
                {["対象者", "ログイン", "最後の操作", "打刻", "実働", "最長の空白",
                  "画面 回/種", "閲覧", "変更", "1日の推移", ""].map((h) => (
                  <th key={h} className={`${TABLE_HEADER} px-4 text-left`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((r) => (
                <Fragment key={r.staff_name}>
                  <tr className={TABLE_ROW}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{r.staff_name}</div>
                      <div className={T_CAPTION}>
                        {CITY_LABEL[r.city] || r.city} · {r.branch_code} · {ROLE_LABEL[r.role] || r.role}
                        {r.by_name && (
                          // Otherwise a named individual whose role happens to be
                          // HQ reads as "HQ is included", which is the opposite
                          // of the rule.
                          <span className="ml-1.5 rounded border border-white/15 bg-white/5 px-1 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                            人名で追加
                          </span>
                        )}
                      </div>
                      {r.flags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.flags.map((f) => (
                            <span key={f}
                              title={data?.rules?.[f]?.says || ""}
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${FLAG_TONE[f] || "border-white/15 bg-white/5 text-zinc-300"}`}>
                              {FLAG_LABEL[f] || f}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.unrecorded ? (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          この日はまだ記録していません
                        </div>
                      ) : r.partial ? (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          この日は途中からしか見ていません
                        </div>
                      ) : null}
                      {r.rostered === false && (
                        <div className="mt-1 text-[10px] text-zinc-500">この日はシフトなし</div>
                      )}
                      {!r.day_complete && (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          勤務中 — まだ何も判定していません
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                      {clock(r.login_at, r.city)}
                      {r.login_carried_over && (
                        // Saying "logged in at 00:03" about somebody whose
                        // session came from yesterday is a small lie in a
                        // column somebody reads as arrival time.
                        <span className="ml-1 text-[10px] text-zinc-500"
                              title="この日のログインはありません。前日のセッションが続いており、これは最初の操作の時刻です。">
                          継続
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{clock(r.last_action_at, r.city)}</td>
                    {/* Two different things, said as two. The punch is what
                        the question is about -- how much of the time they were
                        at work were they in the OS -- and the OS span is what
                        this page can see. Putting one under the other is the
                        comparison; putting one of them under the other's name
                        was the bug. */}
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                      {(() => {
                        const p = punchMinutes(r);
                        return p === null
                          ? <span className="text-zinc-500" title="この日の打刻がありません">—</span>
                          : <span className="text-zinc-200">{hm(p)}</span>;
                      })()}
                      <span className="mt-0.5 block text-[10px] text-zinc-500"
                            title="OS上の最初の操作から最後の操作まで。打刻とは別のものです。">
                        OS {hm(r.span_minutes, !r.unrecorded)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold tabular-nums text-white">{hm(r.active_minutes, !r.unrecorded)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{hm(r.longest_idle_minutes, !r.unrecorded)}</td>
                    {/* Views and distinct screens are different questions and
                        were being answered with one number. Alex Delgado's
                        2026-09-10 read "9", which is nine views of three
                        screens -- and nine screens is what a reader takes from
                        it. Opening the same page nine times is the shape this
                        page is looking for, so the two have to be separable. */}
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                      {r.unrecorded ? "—" : (
                        <span title={`${r.screens} 回開き、種類は ${r.distinct_screens} つ`}>
                          {r.screens}
                          <span className="text-zinc-500"> / {r.distinct_screens}種</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{num(r.reads, !r.unrecorded)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{num(r.writes, !r.unrecorded)}</td>
                    <td className="w-52 px-4 py-3"><Strip buckets={r.buckets} shift={r.shift} /></td>
                    <td className="px-4 py-3">
                      <button type="button" className={SMALL_BUTTON} onClick={() => void toggle(r)}>
                        {open === r.staff_name ? "閉じる" : "画面"}
                      </button>
                    </td>
                  </tr>
                  {open === r.staff_name && (
                    <tr className="border-t border-white/5 bg-black/20">
                      <td colSpan={11} className="px-4 py-4">
                        {(screens[r.staff_name] || []).length === 0 ? (
                          <p className={T_BODY}>この日、この人の画面の記録はありません。</p>
                        ) : (
                          <div className="space-y-1">
                            {(screens[r.staff_name] || []).map((s) => (
                              <div key={s.screen} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                                <span className="w-64 font-mono text-xs text-violet-200">{s.screen}</span>
                                <span className="tabular-nums text-zinc-400">
                                  {clock(s.first_at, r.city)}–{clock(s.last_at, r.city)}
                                </span>
                                <span className="tabular-nums text-zinc-500">{s.events} 操作</span>
                                <span className="tabular-nums text-zinc-500">{s.writes} 変更</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The rules, in full. Whoever reads a flag has to be able to check what
          produced it without asking anyone. */}
      {data?.rules && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={T_SECTION}>フラグの意味</h2>
          <p className={`${T_CAPTION} mt-1`}>
            {data.idle_gap_minutes}分以上あいた時間は「考えていた」ではなく「離席」として数えます。
          </p>
          <dl className="mt-3 space-y-2">
            {Object.entries(data.rules).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${FLAG_TONE[k] || "border-white/15 bg-white/5 text-zinc-300"}`}>
                  {FLAG_LABEL[k] || k}
                </dt>
                <dd className={`${T_BODY} flex-1 min-w-[16rem]`}>{v.says}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
