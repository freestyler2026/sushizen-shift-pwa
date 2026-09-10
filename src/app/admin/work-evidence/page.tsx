"use client";

/**
 * 仕事の証拠 — 変えたものと、開いただけのもの。
 *
 * 隣の「バックオフィス — 1日のかたち」は在席と関与の差を見る。こちらはその
 * 次の問いに答えるために作った: 誰が実際に仕事をしていて、誰が仕事をしている
 * ように見せているか。回数では答えられない。ページを20回開けば20行になり、
 * それは何もせずに作れる唯一の数字だから。
 *
 * このページが数える「成果」は、記録を変えた書き込みだけ。承認された案件、
 * 値段の入った品目、採用された応募者、公開された週 — どれも人が開いて確認
 * できるものが残る。クリックでは作れない。
 *
 * 意図して守っていること（将来の編集でも壊さないこと）:
 *   - 点数を出さない。1つの数字は判決に読まれる。
 *   - 比較対象を必ず名前で書く。「同じ画面を使っている何人の中央値」が無い
 *     指摘は出さない。OSの外の仕事は見えないので、成果ゼロは職種によっては
 *     まったく正常。
 *   - 記録が始まる前に始まった勤務は、判定に使わない。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE, SMALL_BUTTON, INPUT_CLASS,
  TABLE_HEADER, TABLE_ROW, T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
} from "@/lib/ui-tokens";

// The same two names the server enforces. Here only so the page can say
// "not available" instead of rendering an empty table.
const VIEWERS = ["Yukihiro Nishimura", "Ayako Nishimura"];

type Area = { screen: string; outputs?: number; views?: number };
type Day = {
  date: string; outputs: number; views: number;
  os_minutes: number; punch_minutes: number;
  first_at: string | null; last_at: string | null;
  punch_in: string | null; punch_out: string | null;
  observed?: boolean;
};
type Person = {
  staff_name: string; role: string; city: string;
  views: number; reads: number; outputs: number;
  presence_writes: number; failed_writes: number;
  days_seen: number; days_punched: number;
  days_punched_no_output: number; days_punched_unobserved: number;
  punch_minutes: number; punch_minutes_observed: number; os_minutes: number;
  output_areas: Area[]; viewed_areas: Area[]; days: Day[];
};
type Flag = {
  flag: string; staff_name: string; role: string; date?: string;
  says: string; compared_with: string; evidence: Record<string, unknown>;
};
type AreaRow = {
  screen: string; outputs: number; people: number;
  sole_owner: string | null; top_share: number;
  contributors: { staff_name: string; outputs: number; share: number }[];
};
type RosterRow = {
  staff_name: string; role: string; city: string;
  coverage: string; coverage_label: string; why: string;
  outputs: number; views: number; punch_minutes: number;
  days_punched: number; days_punched_unobserved: number;
};
type Report = {
  scope: string;
  roster: RosterRow[]; roster_size: number;
  coverage_labels: Record<string, string>;
  out_of_scope: { staff_name: string; role: string; city: string; views: number; http_writes: number }[];
  start: string; end: string; city: string; timezone: string;
  log_started_at: string | null; unobserved_shifts: number;
  thresholds: Record<string, number>;
  totals: { people: number; outputs: number; views: number; areas: number };
  people: Person[]; areas: AreaRow[]; flags: Flag[];
};
type Backlog = {
  held: { staff_name: string; items: number; median_days: number; oldest_days: number; by_kind: Record<string, number> }[];
  unowned: { role: string; items: number; median_days: number; oldest_days: number }[];
  unowned_total: number; held_total: number;
  unowned_oldest: { kind: string; role: string; status: string; age_days: number; city: string; amount: number; ref: string }[];
};
type Speed = {
  days: number; decisions: number;
  people: { staff_name: string; role: string; decisions: number; approved: number; rejected: number; returned: number; median_hours: number; p90_hours: number; last_at: string | null; in_scope?: boolean }[];
};
type Redistribution = {
  sole_owner: { screen: string; outputs: number; staff_name: string; punch_minutes: number }[];
  concentrated: { screen: string; outputs: number; people: number; top_share: number; staff_name: string }[];
  scattered: { screen: string; outputs: number; people: number; contributors: { staff_name: string; share: number }[] }[];
  load: { staff_name: string; role: string; outputs: number; punch_minutes: number; os_minutes: number; areas: number; outputs_per_punched_hour: number | null }[];
};

const FLAG_LABEL: Record<string, string> = {
  NO_OUTPUT: "打刻はあるが、何も変えていない",
  VIEWS_ONLY: "その画面を開くだけで、決めていない",
  EDGE_ONLY: "出勤直後と退勤直前しかOSに居ない",
  OUTSIDE_SHIFT: "勤務時間の外で記録している",
};

function hm(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WorkEvidencePage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rep, setRep] = useState<Report | null>(null);
  const [red, setRed] = useState<Redistribution | null>(null);
  const [bl, setBl] = useState<Backlog | null>(null);
  const [sp, setSp] = useState<Speed | null>(null);
  const [tab, setTab] = useState<"people" | "areas" | "flags" | "hands" | "roster">("hands");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const today = useMemo(() => ymd(new Date(Date.now() + 8 * 3600 * 1000)), []);
  const weekAgo = useMemo(() => ymd(new Date(Date.now() + 8 * 3600 * 1000 - 6 * 86400000)), []);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);

  useEffect(() => {
    const a = getAuth();
    setAllowed(!!a && VIEWERS.includes((a.staffName || "").trim()));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const q = `start=${start}&end=${end}&city=manila`;
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/admin/work-evidence?${q}`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`/api/admin/work-evidence/redistribution?${q}`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`/api/admin/work-evidence/backlog?city=manila`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`/api/admin/work-evidence/speed?days=180`, { headers: getAuthHeaders(), cache: "no-store" }),
      ]);
      if (!r1.ok) throw new Error(r1.status === 403 ? "この画面は公開されていません。" : `読み込みに失敗しました (${r1.status})`);
      setRep(await r1.json());
      if (r2.ok) setRed(await r2.json());
      if (r3.ok) setBl(await r3.json());
      if (r4.ok) setSp(await r4.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className={`${GLASS_CARD} p-6 text-center`}>
          <p className={T_BODY}>この画面は公開されていません。</p>
        </div>
      </div>
    );
  }

  const th = rep?.thresholds || {};

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={T_PAGE_TITLE}>仕事の証拠 — 変えたものと、開いただけのもの</h1>
          <p className={`${T_CAPTION} mt-1`}>
            成果＝記録を変えた書き込み。打刻・QR確認・Excel出力は成果に数えません
            （前者2つは「居た」という主張そのもの、最後は何も変えないため）。
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <div className={T_LABEL}>開始</div>
            <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <div className={T_LABEL}>終了</div>
            <input type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} className={INPUT_CLASS} />
          </div>
          <button onClick={() => void load()} className={SMALL_BUTTON} disabled={loading}>
            {loading ? "読み込み中…" : "更新"}
          </button>
        </div>
      </div>

      {err && <div className={`${GLASS_CARD} border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200`}>{err}</div>}

      {/* What this window can and cannot say. Kept above the numbers on
          purpose: read after the table, a caveat is an excuse. */}
      {rep && (
        <div className={`${GLASS_CARD} border-amber-500/20 bg-amber-500/5 p-4`}>
          <p className={`${T_BODY} text-amber-100`}>
            記録は <b>{rep.log_started_at ? rep.log_started_at.slice(0, 16) : "—"}</b> から。
            それ以前に始まった勤務 <b>{rep.unobserved_shifts}件</b> は、判定には使っていません
            （見ていなかった時間について「やっていない」とは言えないため）。
          </p>
          <p className={`${T_CAPTION} mt-2 text-amber-200/80`}>
            OSの外の仕事はこの画面から見えません。調理・配達・接客の人の成果ゼロは、
            働いていないという意味ではありません。だから指摘は必ず
            <b>同じ画面を使っている人の中央値</b>と並べて出しています。それが無い人は指摘しません。
          </p>
        </div>
      )}

      {rep && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={KPI_CARD}><div className={KPI_LABEL}>成果（変えた記録）</div><div className={KPI_VALUE}>{rep.totals.outputs}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>画面を開いた回数</div><div className={KPI_VALUE}>{rep.totals.views}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>人</div><div className={KPI_VALUE}>{rep.totals.people}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>業務（画面）</div><div className={KPI_VALUE}>{rep.totals.areas}</div></div>
        </div>
      )}

      <div className="flex gap-2">
        {([["hands", `手元で止まっているもの${bl ? ` (${bl.unowned_total + bl.held_total})` : ""}`], ["flags", `確認が要る人${rep ? ` (${rep.flags.length})` : ""}`], ["people", "人ごと"], ["roster", `名簿${rep ? ` (${rep.roster_size})` : ""}`], ["areas", "業務の分担"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as typeof tab)}
            className={`${SMALL_BUTTON} ${tab === k ? "ring-2 ring-cyan-400/60" : "opacity-70"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 手元で止まっているもの ─────────────────────────────────── */}
      {tab === "hands" && bl && (
        <div className="space-y-5">
          {/* Returned first and on its own: ranking the named people would
              have shown a tidy queue and hidden nine tenths of the work. */}
          <div className={`${GLASS_CARD} border-red-500/25 bg-red-500/5 p-4`}>
            <h3 className={T_SECTION}>誰の手元にもないまま止まっているもの — {bl.unowned_total}件</h3>
            <p className={`${T_CAPTION} mt-1`}>
              ロールにだけ割り当てられていて、名前がありません。
              <b>誰も遅れていません。誰も頼まれていないからです。</b>
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={TABLE_HEADER}>
                  <tr>
                    <th className="px-3 py-2 text-left">宛先のロール</th>
                    <th className="px-3 py-2 text-right">件数</th>
                    <th className="px-3 py-2 text-right">中央値</th>
                    <th className="px-3 py-2 text-right">最も古いもの</th>
                  </tr>
                </thead>
                <tbody>
                  {bl.unowned.map((u) => (
                    <tr key={u.role} className={TABLE_ROW}>
                      <td className="px-3 py-2">{u.role}</td>
                      <td className="px-3 py-2 text-right font-medium">{u.items}</td>
                      <td className="px-3 py-2 text-right">{u.median_days}日</td>
                      <td className="px-3 py-2 text-right text-red-300">{u.oldest_days}日</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${GLASS_CARD} p-4`}>
            <h3 className={T_SECTION}>名前のついた手元 — {bl.held_total}件</h3>
            {bl.held.length === 0 && <p className={`${T_CAPTION} mt-1`}>該当なし</p>}
            <div className="mt-3 space-y-1">
              {bl.held.map((h) => (
                <div key={h.staff_name} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="opacity-85">{h.staff_name}</span>
                  <span className="opacity-70">
                    {h.items}件 · 中央値 {h.median_days}日 · 最古 <b className={h.oldest_days > 30 ? "text-red-300" : ""}>{h.oldest_days}日</b>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {sp && (
            <div className={`${GLASS_CARD} overflow-hidden`}>
              <div className="p-4 pb-0">
                <h3 className={T_SECTION}>受け取ってから決めるまで — 過去180日・{sp.decisions}件</h3>
                <p className={`${T_CAPTION} mt-1`}>
                  件数の多い少ないではなく、<b>渡されてから返すまで</b>。案件が自分に届いた時刻から、
                  自分が決めた時刻まで。活動ログが2日しか無いのに対し、これは6か月あります。
                </p>
                <p className={`${T_CAPTION} mt-1`}>
                  ⚠️ 速さは正しさではありません。中央値0時間は「キューを見ている人」か
                  「読まずに承認している人」のどちらかで、この表はその区別をしません。
                  p90を並べているのは、<b>中央値だけだと触っていない山が隠れる</b>ためです。
                </p>
                <p className={`${T_CAPTION} mt-1`}>
                  指定ロール以外の人も<b>消さずに「対象外」と付けて出します</b>。1,000件を捌いている人を
                  表から消すと、キューが無人に見えるためです。
                </p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={TABLE_HEADER}>
                    <tr>
                      <th className="px-3 py-2 text-left">名前</th>
                      <th className="px-3 py-2 text-right">決定</th>
                      <th className="px-3 py-2 text-right">承認</th>
                      <th className="px-3 py-2 text-right">却下</th>
                      <th className="px-3 py-2 text-right">差戻</th>
                      <th className="px-3 py-2 text-right">中央値</th>
                      <th className="px-3 py-2 text-right">p90（遅い方の1割）</th>
                      <th className="px-3 py-2 text-left">最後の決定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sp.people.map((r) => (
                      <tr key={r.staff_name} className={TABLE_ROW}>
                        <td className="px-3 py-2">
                          {r.staff_name}
                          {r.in_scope === false && <span className={`${T_CAPTION} ml-2`}>対象外</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{r.decisions}</td>
                        <td className="px-3 py-2 text-right opacity-70">{r.approved}</td>
                        <td className="px-3 py-2 text-right opacity-70">{r.rejected}</td>
                        <td className="px-3 py-2 text-right opacity-70">{r.returned}</td>
                        <td className="px-3 py-2 text-right">{r.median_hours}h</td>
                        <td className={`px-3 py-2 text-right ${r.p90_hours >= 168 ? "text-amber-300" : ""}`}>
                          {r.p90_hours >= 48 ? `${Math.round(r.p90_hours / 24)}日` : `${r.p90_hours}h`}
                        </td>
                        <td className="px-3 py-2 text-xs opacity-60">{(r.last_at || "").slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className={T_CAPTION}>
            ここに出るのは調達の承認と Management タスクだけです。ほかの待ち行列は
            「Waiting for Someone」が持っていて、遅れているものと持ち主のないものを既に出しています。
            同じ定義を2か所に書くと必ず食い違うので、こちらでは作り直していません。
          </p>
        </div>
      )}

      {/* ── 確認が要る人 ───────────────────────────────────────────── */}
      {tab === "flags" && rep && (
        <div className="space-y-3">
          {rep.flags.length === 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <p className={T_BODY}>この期間、比較できる相手がいる中で説明のつかない人はいませんでした。</p>
              <p className={`${T_CAPTION} mt-1`}>
                「該当なし」であって「調べていない」ではありません。判定に使えた勤務は
                記録開始後に始まったものだけです。
              </p>
            </div>
          )}
          {rep.flags.map((f, i) => (
            <div key={i} className={`${GLASS_CARD} p-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
                    {FLAG_LABEL[f.flag] || f.flag}
                  </span>
                  <span className={T_SECTION}>{f.staff_name}</span>
                  <span className={T_CAPTION}>{f.role}{f.date ? ` · ${f.date}` : ""}</span>
                </div>
                <button className={`${SMALL_BUTTON} text-xs`}
                  onClick={() => { setOpen(f.staff_name); setTab("people"); }}>
                  この人の内訳
                </button>
              </div>
              <p className={`${T_BODY} mt-2`}>{f.says}</p>
              <p className={`${T_CAPTION} mt-1`}>比較対象: {f.compared_with}</p>
            </div>
          ))}
          {rep.flags.length > 0 && (
            <p className={T_CAPTION}>
              判定の線: 打刻 {th.punched_hours_for_no_output}h 以上 ／ 同じ画面に
              {th.peer_group_min_people}人以上 ／ その人たちの中央値が1日
              {th.peer_output_per_day}件以上 ／ その画面を{th.views_to_call_it_their_screen}回以上開いている。
              いずれも `heroku config:set` で変更でき、デプロイは要りません。
            </p>
          )}
        </div>
      )}

      {/* ── 名簿 — 誰について語れて、誰について語れないか ─────────────── */}
      {tab === "roster" && rep && (
        <div className="space-y-5">
          <div className={`${GLASS_CARD} p-4`}>
            <h3 className={T_SECTION}>この画面が対象にしている {rep.roster_size} 名</h3>
            <p className={`${T_CAPTION} mt-1`}>
              HR Manager / Manila Manager / Admin / Inventory &amp; Purchasing / HR Staff の各ロールと、
              名前で追加された3名。<b>OSでの作業が多い職種だけ</b>を対象にしています。
              調理・配達・接客はOSに仕事がないので、ここには出しません。
              名簿は「BO 稼働状況」と同じものを読んでいます — 2つの画面が別の名簿を持つと、
              誰を見ているのかが静かに食い違うためです。
            </p>
            <p className={`${T_CAPTION} mt-2`}>
              <b>成果ゼロの人も全員この表に出します。</b>「何も無かった」と「見ていない」は
              違う答えで、黙って外すと後から区別できなくなります。
            </p>
          </div>

          <div className={`${GLASS_CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={TABLE_HEADER}>
                  <tr>
                    <th className="px-3 py-2 text-left">名前</th>
                    <th className="px-3 py-2 text-left">ロール</th>
                    <th className="px-3 py-2 text-right">成果</th>
                    <th className="px-3 py-2 text-right">開いた</th>
                    <th className="px-3 py-2 text-right">打刻</th>
                    <th className="px-3 py-2 text-left">OSが言えたこと</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.roster.map((r) => (
                    <tr key={r.staff_name} className={TABLE_ROW}>
                      <td className="px-3 py-2 align-top">{r.staff_name}</td>
                      <td className="px-3 py-2 align-top text-xs opacity-70">{r.role}</td>
                      <td className="px-3 py-2 align-top text-right font-medium">{r.outputs || "—"}</td>
                      <td className="px-3 py-2 align-top text-right opacity-70">{r.views || "—"}</td>
                      <td className="px-3 py-2 align-top text-right">{hm(r.punch_minutes)}</td>
                      <td className="px-3 py-2 align-top">
                        <span className={
                          r.coverage === "measured" ? "opacity-70"
                            : r.coverage === "no_output_comparable" ? "text-amber-200"
                            : "text-cyan-200"}>
                          {r.coverage_label}
                        </span>
                        {r.why && <div className={`${T_CAPTION} mt-0.5`}>{r.why}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {rep.out_of_scope.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <h3 className={T_SECTION}>対象外だが、この期間OSを使った {rep.out_of_scope.length} 名</h3>
              <p className={`${T_CAPTION} mt-1`}>
                指定されたロール以外の人です。判定はしませんが、<b>何をしたかは出します</b> —
                対象外にしたことと、記録が無いことは別だからです。
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={TABLE_HEADER}>
                    <tr>
                      <th className="px-3 py-2 text-left">名前</th>
                      <th className="px-3 py-2 text-left">ロール</th>
                      <th className="px-3 py-2 text-right">書き込み</th>
                      <th className="px-3 py-2 text-right">開いた</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.out_of_scope.slice(0, 30).map((o) => (
                      <tr key={o.staff_name} className={TABLE_ROW}>
                        <td className="px-3 py-2">{o.staff_name}</td>
                        <td className="px-3 py-2 text-xs opacity-70">{o.role}</td>
                        <td className="px-3 py-2 text-right">{o.http_writes || "—"}</td>
                        <td className="px-3 py-2 text-right opacity-70">{o.views || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rep.out_of_scope.length > 30 && (
                <p className={`${T_CAPTION} mt-2`}>ほか {rep.out_of_scope.length - 30} 名。</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 人ごと ────────────────────────────────────────────────── */}
      {tab === "people" && rep && (
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={TABLE_HEADER}>
                <tr>
                  <th className="px-3 py-2 text-left">名前</th>
                  <th className="px-3 py-2 text-left">ロール</th>
                  <th className="px-3 py-2 text-right">成果</th>
                  <th className="px-3 py-2 text-right">業務数</th>
                  <th className="px-3 py-2 text-right">画面を開いた</th>
                  <th className="px-3 py-2 text-right">打刻</th>
                  <th className="px-3 py-2 text-right">OS内</th>
                  <th className="px-3 py-2 text-right">成果ゼロの日</th>
                </tr>
              </thead>
              <tbody>
                {rep.people.map((p) => (
                  <tr key={p.staff_name} className={`${TABLE_ROW} cursor-pointer`}
                    onClick={() => setOpen(open === p.staff_name ? null : p.staff_name)}>
                    <td className="px-3 py-2">{p.staff_name}</td>
                    <td className="px-3 py-2 text-xs opacity-70">{p.role}</td>
                    <td className="px-3 py-2 text-right font-medium">{p.outputs || "—"}</td>
                    <td className="px-3 py-2 text-right">{p.output_areas.length || "—"}</td>
                    <td className="px-3 py-2 text-right opacity-70">{p.views}</td>
                    <td className="px-3 py-2 text-right">{hm(p.punch_minutes)}</td>
                    <td className="px-3 py-2 text-right opacity-70">{hm(p.os_minutes)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.days_punched ? `${p.days_punched_no_output} / ${p.days_punched}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {open && (() => {
            const p = rep.people.find((x) => x.staff_name === open);
            if (!p) return null;
            return (
              <div className="border-t border-white/10 p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className={T_SECTION}>{p.staff_name} の内訳</h3>
                  <button className={`${SMALL_BUTTON} text-xs`} onClick={() => setOpen(null)}>閉じる</button>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className={T_LABEL}>変えたもの</div>
                    {p.output_areas.length === 0 && <p className={T_CAPTION}>なし</p>}
                    {p.output_areas.map((a) => (
                      <div key={a.screen} className="flex justify-between py-0.5 text-sm">
                        <span className="opacity-80">{a.screen}</span><span>{a.outputs}</span>
                      </div>
                    ))}
                    {p.presence_writes > 0 && (
                      <p className={`${T_CAPTION} mt-2`}>
                        ほかに打刻・店内QR確認が {p.presence_writes}件。これは「居た」という記録なので成果には入れていません。
                      </p>
                    )}
                    {p.failed_writes > 0 && (
                      <p className={`${T_CAPTION} mt-1`}>失敗した書き込み {p.failed_writes}件（何も変わっていないため成果外）。</p>
                    )}
                  </div>
                  <div>
                    <div className={T_LABEL}>開いた画面</div>
                    {p.viewed_areas.slice(0, 12).map((a) => (
                      <div key={a.screen} className="flex justify-between py-0.5 text-sm">
                        <span className="opacity-80">{a.screen}</span><span className="opacity-60">{a.views}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className={TABLE_HEADER}>
                      <tr>
                        <th className="px-2 py-1 text-left">日</th>
                        <th className="px-2 py-1 text-right">成果</th>
                        <th className="px-2 py-1 text-right">開いた</th>
                        <th className="px-2 py-1 text-right">打刻</th>
                        <th className="px-2 py-1 text-right">OS内</th>
                        <th className="px-2 py-1 text-left">記録の対象</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.days.map((d) => (
                        <tr key={d.date} className={TABLE_ROW}>
                          <td className="px-2 py-1">{d.date}</td>
                          <td className="px-2 py-1 text-right">{d.outputs || "—"}</td>
                          <td className="px-2 py-1 text-right opacity-70">{d.views || "—"}</td>
                          <td className="px-2 py-1 text-right">{hm(d.punch_minutes)}</td>
                          <td className="px-2 py-1 text-right opacity-70">{hm(d.os_minutes)}</td>
                          <td className="px-2 py-1 text-left opacity-70">
                            {d.punch_minutes === 0 ? "打刻なし" : d.observed ? "判定に使える" : "記録開始前に出勤 — 判定対象外"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 業務の分担 ─────────────────────────────────────────────── */}
      {tab === "areas" && rep && red && (
        <div className="space-y-5">
          <div className={`${GLASS_CARD} p-4`}>
            <h3 className={T_SECTION}>その人しかやっていない業務</h3>
            <p className={`${T_CAPTION} mt-1`}>
              休んだ日に止まる業務です。評価ではなく、引き継ぎ先を決めるための一覧。
            </p>
            <div className="mt-3 space-y-1">
              {red.sole_owner.map((x) => (
                <div key={x.screen} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="opacity-85">{x.screen}</span>
                  <span><b>{x.staff_name}</b> <span className="opacity-60">が {x.outputs}件すべて</span></span>
                </div>
              ))}
              {red.sole_owner.length === 0 && <p className={T_CAPTION}>該当なし</p>}
            </div>
          </div>

          <div className={`${GLASS_CARD} p-4`}>
            <h3 className={T_SECTION}>1人に寄っている業務</h3>
            <p className={`${T_CAPTION} mt-1`}>複数人が触れるのに、8割以上を1人が処理しているもの。</p>
            <div className="mt-3 space-y-1">
              {red.concentrated.map((x) => (
                <div key={x.screen} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="opacity-85">{x.screen}</span>
                  <span><b>{x.staff_name}</b> <span className="opacity-60">が {Math.round(x.top_share * 100)}%（{x.people}人中・{x.outputs}件）</span></span>
                </div>
              ))}
              {red.concentrated.length === 0 && <p className={T_CAPTION}>該当なし</p>}
            </div>
          </div>

          <div className={`${GLASS_CARD} p-4`}>
            <h3 className={T_SECTION}>誰も主担当でない業務</h3>
            <p className={`${T_CAPTION} mt-1`}>4人以上が少しずつ触っているもの。担当を決める候補です。</p>
            <div className="mt-3 space-y-1">
              {red.scattered.map((x) => (
                <div key={x.screen} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="opacity-85">{x.screen}</span>
                  <span className="opacity-60">{x.people}人・{x.outputs}件（最多でも {Math.round(x.contributors[0].share * 100)}%）</span>
                </div>
              ))}
              {red.scattered.length === 0 && <p className={T_CAPTION}>該当なし</p>}
            </div>
          </div>

          <div className={`${GLASS_CARD} overflow-hidden`}>
            <div className="p-4 pb-0">
              <h3 className={T_SECTION}>業務ごとの担当者</h3>
              <p className={`${T_CAPTION} mt-1`}>再配置を考えるときの元表。件数は成果の数で、開いた回数ではありません。</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={TABLE_HEADER}>
                  <tr>
                    <th className="px-3 py-2 text-left">業務（画面）</th>
                    <th className="px-3 py-2 text-right">成果</th>
                    <th className="px-3 py-2 text-right">人数</th>
                    <th className="px-3 py-2 text-left">内訳</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.areas.map((a) => (
                    <tr key={a.screen} className={TABLE_ROW}>
                      <td className="px-3 py-2">{a.screen}</td>
                      <td className="px-3 py-2 text-right">{a.outputs}</td>
                      <td className="px-3 py-2 text-right">{a.people}</td>
                      <td className="px-3 py-2 text-xs opacity-75">
                        {a.contributors.slice(0, 4).map((c) => `${c.staff_name} ${Math.round(c.share * 100)}%`).join(" · ")}
                        {a.contributors.length > 4 ? ` 他${a.contributors.length - 4}名` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
