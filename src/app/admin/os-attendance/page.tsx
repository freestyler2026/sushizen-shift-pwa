"use client";

import { CheckCircle, Fingerprint, Loader2, MapPin, Pencil, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessOsAttendanceAdmin, getAuth } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, TAB_ACTIVE, TAB_INACTIVE, BADGE_SUCCESS, BADGE_ERROR, BADGE_WARNING } from "@/lib/ui-tokens";

const API = "/api/admin/attendance";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> | undefined ?? {}) } });
}

type BranchGps = {
  city: string;
  branch_code: string;
  lat: number;
  lng: number;
  radius_m: number;
  label: string;
  updated_at: string;
};

type AttendanceSession = {
  id: string;
  city: string;
  branch_code: string;
  staff_name: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_gps_ok: boolean | null;
  check_out_gps_ok: boolean | null;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  note: string;
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
}

function GpsBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-white/30 text-xs">—</span>;
  if (ok) return <span className={BADGE_SUCCESS}><CheckCircle size={10} />範囲内</span>;
  return <span className={BADGE_ERROR}><XCircle size={10} />範囲外</span>;
}

// ── GPS設定タブ ─────────────────────────────────────────────

type GpsEditState = { lat: string; lng: string; radius_m: string; label: string };

function GpsTab({ city }: { city: string }) {
  const [list, setList] = useState<BranchGps[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // branch_code
  const [form, setForm] = useState<GpsEditState>({ lat: "", lng: "", radius_m: "100", label: "" });
  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API}/branch-gps?city=${city}`);
      const d = await r.json();
      setList(d.gps ?? []);
    } finally {
      setBusy(false);
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  function startEdit(g: BranchGps) {
    setEditing(g.branch_code);
    setForm({ lat: String(g.lat), lng: String(g.lng), radius_m: String(g.radius_m), label: g.label });
    setErr("");
  }

  async function save(branch_code: string) {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radius_m = parseInt(form.radius_m);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius_m)) { setErr("緯度・経度・半径は数値で入力してください"); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps/${city}/${branch_code}`, {
        method: "PUT",
        body: JSON.stringify({ lat, lng, radius_m, label: form.label }),
      });
      if (!r.ok) { setErr("保存に失敗しました"); return; }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  }

  async function del(branch_code: string) {
    if (!confirm(`${branch_code} のGPS設定を削除しますか？`)) return;
    setBusy(true);
    try {
      await apiFetch(`${API}/branch-gps/${city}/${branch_code}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  }

  async function addNew() {
    if (!newBranch.trim()) { setErr("ブランチコードを入力してください"); return; }
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radius_m = parseInt(form.radius_m);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius_m)) { setErr("緯度・経度・半径は数値で入力してください"); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/branch-gps/${city}/${newBranch.trim().toUpperCase()}`, {
        method: "PUT",
        body: JSON.stringify({ lat, lng, radius_m, label: form.label }),
      });
      if (!r.ok) { setErr("追加に失敗しました"); return; }
      setAdding(false); setNewBranch(""); setForm({ lat: "", lng: "", radius_m: "100", label: "" });
      await load();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">ブランチのGPS座標とジオフェンス半径を設定します。未設定のブランチはGPSチェックをスキップします。</p>
        <div className="flex gap-2">
          <button onClick={() => load()} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors">
            <RefreshCw size={12} />更新
          </button>
          <button onClick={() => { setAdding(true); setForm({ lat: "", lng: "", radius_m: "100", label: "" }); setNewBranch(""); setErr(""); }}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
            <Plus size={12} />ブランチ追加
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {adding && (
        <div className={`${GLASS_CARD} p-4 border-violet-500/30 space-y-3`}>
          <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">新規ブランチGPS設定</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">ブランチコード</label>
              <input value={newBranch} onChange={e => setNewBranch(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="例: MNL-01" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">ラベル（任意）</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="例: マニラ本店" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">緯度</label>
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="14.5995" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">経度</label>
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="120.9842" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">ジオフェンス半径 (m)</label>
              <input value={form.radius_m} onChange={e => setForm(f => ({ ...f, radius_m: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none"
                placeholder="100" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">キャンセル</button>
            <button onClick={addNew} disabled={busy} className={PRIMARY_BUTTON + " text-sm py-1.5 px-4"}>保存</button>
          </div>
        </div>
      )}

      {busy && list.length === 0 && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/30" size={24} /></div>}

      <div className="space-y-2">
        {list.map(g => (
          <div key={g.branch_code} className={`${GLASS_CARD} p-4`}>
            {editing === g.branch_code ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">{g.branch_code}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">ラベル</label>
                    <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">半径 (m)</label>
                    <input value={form.radius_m} onChange={e => setForm(f => ({ ...f, radius_m: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">緯度</label>
                    <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">経度</label>
                    <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
                  </div>
                </div>
                {err && <p className="text-xs text-red-400">{err}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors">キャンセル</button>
                  <button onClick={() => save(g.branch_code)} disabled={busy} className={PRIMARY_BUTTON + " text-sm py-1.5 px-4"}>保存</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{g.branch_code}</span>
                      {g.label && <span className="text-xs text-white/50">{g.label}</span>}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {g.lat.toFixed(6)}, {g.lng.toFixed(6)} · 半径 {g.radius_m}m
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(g)} className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-white hover:border-white/20 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => del(g.branch_code)} className="rounded-lg border border-red-500/20 p-1.5 text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!busy && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-white/30">
            <MapPin size={32} />
            <p className="text-sm">GPS設定がありません</p>
            <p className="text-xs">「ブランチ追加」から設定してください</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 出勤ログタブ ────────────────────────────────────────────

function LogTab({ city }: { city: string }) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API}/sessions?city=${city}&date=${date}&limit=100`);
      const d = await r.json();
      setSessions(d.sessions ?? []);
    } finally { setBusy(false); }
  }, [city, date]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors">
          <RefreshCw size={12} />更新
        </button>
        <span className="text-xs text-white/30">{sessions.length}件</span>
      </div>

      {busy && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/30" size={24} /></div>}

      {!busy && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-white/30">
          <Fingerprint size={32} />
          <p className="text-sm">この日の出勤記録はありません</p>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-white/40">
                <th className="pb-2 text-left font-medium">スタッフ</th>
                <th className="pb-2 text-left font-medium">ブランチ</th>
                <th className="pb-2 text-left font-medium">タイムイン</th>
                <th className="pb-2 text-left font-medium">GPS</th>
                <th className="pb-2 text-left font-medium">タイムアウト</th>
                <th className="pb-2 text-left font-medium">GPS</th>
                <th className="pb-2 text-left font-medium">勤務時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.map(s => {
                const workedMin = s.check_in_at && s.check_out_at
                  ? Math.round((new Date(s.check_out_at).getTime() - new Date(s.check_in_at).getTime()) / 60000)
                  : null;
                return (
                  <tr key={s.id} className="hover:bg-white/3 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-white">{s.staff_name}</td>
                    <td className="py-2.5 pr-4 text-white/60">{s.branch_code || "—"}</td>
                    <td className="py-2.5 pr-4 text-white/80">{fmtTime(s.check_in_at)}</td>
                    <td className="py-2.5 pr-4"><GpsBadge ok={s.check_in_gps_ok} /></td>
                    <td className="py-2.5 pr-4 text-white/80">{fmtTime(s.check_out_at)}</td>
                    <td className="py-2.5 pr-4"><GpsBadge ok={s.check_out_gps_ok} /></td>
                    <td className="py-2.5 text-white/60">
                      {workedMin !== null
                        ? `${Math.floor(workedMin / 60)}h${String(workedMin % 60).padStart(2, "0")}m`
                        : s.check_in_at ? <span className={BADGE_WARNING}>出勤中</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── メインページ ────────────────────────────────────────────

type Tab = "gps" | "log";

export default function OsAttendanceAdminPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const [tab, setTab] = useState<Tab>("log");
  const [city, setCity] = useState<"dubai" | "manila">("manila");

  useEffect(() => {
    if (!canAccessOsAttendanceAdmin(auth)) {
      router.replace("/week");
    }
  }, [auth, router]);

  if (!canAccessOsAttendanceAdmin(auth)) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">OS ATTENDANCE ADMIN</p>
            <h1 className={T_PAGE_TITLE}>OS出勤管理</h1>
            <p className="text-sm text-white/40 mt-1">WebAuthn + GPS 出勤ログ · ブランチGPS設定</p>
          </div>
          <div className="flex gap-2">
            {(["manila", "dubai"] as const).map(c => (
              <button key={c} onClick={() => setCity(c)}
                className={city === c
                  ? "rounded-lg bg-violet-500/20 border border-violet-500/40 px-4 py-1.5 text-sm font-semibold text-violet-300"
                  : "rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/50 hover:text-white hover:border-white/20 transition-colors"}>
                {c === "manila" ? "Manila" : "Dubai"}
              </button>
            ))}
          </div>
        </div>

        {/* タブ */}
        <div className="flex gap-2">
          <button onClick={() => setTab("log")} className={tab === "log" ? TAB_ACTIVE : TAB_INACTIVE}>
            出勤ログ
          </button>
          <button onClick={() => setTab("gps")} className={tab === "gps" ? TAB_ACTIVE : TAB_INACTIVE}>
            GPS設定
          </button>
        </div>

        {/* コンテンツ */}
        <div className={GLASS_CARD + " p-6"}>
          {tab === "log" && <LogTab city={city} />}
          {tab === "gps" && <GpsTab city={city} />}
        </div>
      </div>
    </main>
  );
}
