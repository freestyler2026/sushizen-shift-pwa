"use client";

/**
 * Prep Time review queue.
 *
 * The records have existed since July and the API to confirm them has existed
 * just as long, but no screen ever called it, so nothing has been reviewed
 * since 2026-07-25. This is that screen.
 *
 * The one decision it makes for you: of the 3,459 records sitting at "pending",
 * only ~625 can still reach a statistic. The rest are photos the reader could
 * not read, or a platform that does not operate in that city. Reviewing those
 * changes nothing, so they are not offered as work — they are counted, named,
 * and put on their own tab where they can be questioned.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Timer, RefreshCw, Check, X, AlertTriangle, Loader2, Inbox, EyeOff, Undo2,
} from "lucide-react";
import { getAuth, getAuthHeaders, hasPermission } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  T_PAGE_TITLE, T_CAPTION, T_LABEL, KPI_LABEL, KPI_VALUE,
} from "@/lib/ui-tokens";

type Rec = {
  id: number;
  city: string;
  branch_code: string | null;
  author_name: string | null;
  work_date: string;
  aggregator: string | null;
  order_no: string | null;
  ordered_at_str: string | null;
  ready_by_str: string | null;
  prep_minutes: number | null;
  prep_score: number | null;
  prep_grade: string | null;
  ocr_confidence: string | null;
  status: string;
  confirmed_by: string | null;
  excluded_reason: string | null;
};

type Excluded = {
  unread_photo: number; too_short: number; wrong_platform: number;
  total: number; floor_minutes: number;
} | null;

const CITIES = [
  { value: "", label: "Both cities" },
  { value: "dubai", label: "Dubai" },
  { value: "manila", label: "Manila" },
];

/** Why a record can never reach a statistic, said in words rather than a key. */
const EXCLUDED_WHY: Record<string, { title: string; detail: string }> = {
  unread_photo: {
    title: "The photo was not read",
    detail:
      "The reader returned its own example instead of the receipt. Nothing on these rows came from the picture.",
  },
  wrong_platform: {
    title: "Platform does not operate in that city",
    detail:
      "GrabFood has never run in the UAE, and Careem does not run in Manila. A receipt the reader could not place is a receipt it did not read.",
  },
  too_short: {
    title: "Too fast to be cooking",
    detail:
      "Order and ready stamped within a couple of minutes — that is someone pressing both buttons, not a kitchen.",
  },
};

export default function PrepTimeReviewPage() {
  const router = useRouter();

  // Nothing is asserted until the browser has actually mounted. Reading auth
  // during the first render makes the prerendered HTML disagree with the client
  // and briefly tells everyone they are denied.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const auth = mounted ? getAuth() : null;
  const role = String(auth?.role || "").toUpperCase();
  const mayView = role === "HQ" || role === "ADMIN"
    || hasPermission("channel.admin.prep_time.view", auth)
    || hasPermission("channel.admin.prep_time.confirm", auth);
  const mayConfirm = role === "HQ" || role === "ADMIN"
    || hasPermission("channel.admin.prep_time.confirm", auth);

  useEffect(() => {
    if (mounted && auth && !mayView) router.replace("/admin");
  }, [mounted, auth, mayView, router]);

  const [tab, setTab] = useState<"review" | "skipped">("review");
  const [city, setCity] = useState("");
  const [rows, setRows] = useState<Rec[]>([]);
  const [excluded, setExcluded] = useState<Excluded>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  // Rows acted on in this sitting stay visible so the undo stays where the
  // action was. They leave on Refresh, which is the person saying "done".
  const [justDone, setJustDone] = useState<Record<number, string>>({});
  const [edit, setEdit] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!mounted || !mayView) return;
    setLoading(true); setErr("");
    const a = getAuth();
    const q = new URLSearchParams({ status: "pending", limit: "200", usable: tab === "review" ? "1" : "0" });
    if (city) q.set("city", city);
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/admin/prep-time/records?${q}`, { headers: getAuthHeaders(a) }),
        fetch(`/api/admin/prep-time/stats?${city ? `city=${city}` : ""}`, { headers: getAuthHeaders(a) }),
      ]);
      if (!rRes.ok) throw new Error((await rRes.text()) || `HTTP ${rRes.status}`);
      const body = await rRes.json();
      setRows(body.records || []);
      if (sRes.ok) setExcluded((await sRes.json()).excluded ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the queue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mounted, mayView, city, tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (r: Rec, status: "confirmed" | "rejected") => {
    if (!mayConfirm) return;
    setBusy(r.id); setErr("");
    const typed = edit[r.id];
    const minutes = typed !== undefined && typed !== "" ? Number(typed) : undefined;
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0)) {
      setErr("Minutes must be a number."); setBusy(null); return;
    }
    try {
      const res = await fetch(`/api/admin/prep-time/records/${r.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({ status, ...(minutes !== undefined ? { prep_minutes: minutes } : {}) }),
      });
      // Read the body before checking ok — a platform 413 arrives as text/plain
      // and res.json() would throw the real reason away.
      const raw = await res.text();
      if (!res.ok) {
        let detail = raw;
        try { detail = JSON.parse(raw).detail || raw; } catch { /* keep the text */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      setJustDone((p) => ({ ...p, [r.id]: status }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const undo = async (r: Rec) => {
    setBusy(r.id); setErr("");
    try {
      const res = await fetch(`/api/admin/prep-time/records/${r.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(getAuth()),
        body: JSON.stringify({ status: "pending" }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      setJustDone((p) => { const n = { ...p }; delete n[r.id]; return n; });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not undo.");
    } finally {
      setBusy(null);
    }
  };

  const remaining = useMemo(
    () => rows.filter((r) => !justDone[r.id]).length, [rows, justDone]);
  const doneNow = Object.keys(justDone).length;

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-300" />
      </div>
    );
  }
  if (!auth) {
    return (
      <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center px-4">
        <div className={GLASS_CARD + " max-w-sm p-6 text-center"}>
          <p className="text-sm text-white/70">Log in to review prep time.</p>
        </div>
      </div>
    );
  }
  if (!mayView) return null;

  return (
    <div className="min-h-screen bg-[#0b0f14] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">

        <div className="flex flex-wrap items-center gap-3">
          <Timer className="h-6 w-6 text-violet-300" />
          <h1 className={T_PAGE_TITLE}>Prep Time Review</h1>
          <button type="button" onClick={load}
            className={SECONDARY_BUTTON + " ml-auto inline-flex items-center gap-2"}>
            <RefreshCw className={"h-4 w-4" + (loading ? " animate-spin" : "")} /> Refresh
          </button>
        </div>
        <p className={T_CAPTION + " mt-1"}>
          Check that the reader got the receipt right. Correct the minutes if it did not.
        </p>

        {/* What the queue is, before you scroll it. */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={GLASS_CARD + " p-4"}>
            <div className={KPI_LABEL}>To review</div>
            <div className={KPI_VALUE}>{loading ? "—" : remaining}</div>
          </div>
          <div className={GLASS_CARD + " p-4"}>
            <div className={KPI_LABEL}>Done just now</div>
            <div className={KPI_VALUE}>{doneNow}</div>
          </div>
          <div className={GLASS_CARD + " p-4"}>
            <div className={KPI_LABEL}>Skipped by rule (all time)</div>
            <div className={KPI_VALUE}>
              {excluded ? excluded.unread_photo + excluded.too_short + excluded.wrong_platform : "—"}
            </div>
          </div>
          <div className={GLASS_CARD + " p-4"}>
            <div className={KPI_LABEL}>City</div>
            <div className="mt-1">
              <SelectDark value={city} onChange={setCity} options={CITIES}
                placeholder="Both cities" aria-label="City" />
            </div>
          </div>
        </div>

        {/* The rule, on the screen. A filter nobody can see is a filter nobody
            can question. */}
        {excluded && (
          <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3">
            <p className="text-xs text-amber-200/90">
              Across all {excluded.total} records ever collected,{" "}
              <b>{excluded.unread_photo + excluded.too_short + excluded.wrong_platform}</b> are left
              out of every prep-time average and are never offered as work:{" "}
              {excluded.unread_photo} unreadable photo, {excluded.wrong_platform} wrong platform for
              the city, {excluded.too_short} under {excluded.floor_minutes} min.
              The pending ones are on the <b>Skipped</b> tab.
            </p>
          </div>
        )}

        <div className={TAB_CONTAINER + " mt-5"}>
          <button type="button" onClick={() => setTab("review")}
            className={tab === "review" ? TAB_ACTIVE : TAB_INACTIVE}>
            <Inbox className="mr-1.5 inline h-4 w-4" /> To review
          </button>
          <button type="button" onClick={() => setTab("skipped")}
            className={tab === "skipped" ? TAB_ACTIVE : TAB_INACTIVE}>
            <EyeOff className="mr-1.5 inline h-4 w-4" /> Skipped by rule
          </button>
        </div>

        {err && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <p className="text-sm text-rose-200">{err}</p>
          </div>
        )}

        {!mayConfirm && tab === "review" && (
          <p className={T_CAPTION + " mt-4"}>
            You can read this queue but not confirm. Ask for the
            &ldquo;Confirm Prep Time Records&rdquo; permission in Role Management.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {loading && (
            <div className={GLASS_CARD + " flex items-center gap-3 p-6"}>
              <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
              <span className={T_CAPTION}>Loading…</span>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className={GLASS_CARD + " p-8 text-center"}>
              <Check className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-3 text-sm text-white/70">
                {tab === "review"
                  ? "Nothing waiting. Every readable record has been reviewed."
                  : "No skipped records for this filter."}
              </p>
            </div>
          )}

          {!loading && rows.map((r) => {
            const done = justDone[r.id];
            return (
              <div key={r.id}
                className={GLASS_CARD + " p-4 " + (done ? "opacity-60" : "")}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-white/40">#{r.id}</span>
                  <span className="text-sm font-semibold text-white/90">
                    {r.city === "dubai" ? "Dubai" : "Manila"} · {r.branch_code || "—"}
                  </span>
                  <span className={T_CAPTION}>{r.work_date}</span>
                  <span className={T_CAPTION}>{r.aggregator || "unknown platform"}</span>
                  {r.order_no && <span className={T_CAPTION}>Order {r.order_no}</span>}
                  {r.author_name && (
                    <span className="ml-auto text-xs text-white/35">posted by {r.author_name}</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className="text-white/70">
                    {r.ordered_at_str || "—"} <span className="text-white/30">→</span>{" "}
                    {r.ready_by_str || "—"}
                  </span>
                  <span className="text-white/90">
                    <b className="tabular-nums">{r.prep_minutes ?? "—"}</b> min
                  </span>
                  {r.prep_grade && (
                    <span className={T_CAPTION}>
                      grade {r.prep_grade} · score {r.prep_score ?? "—"}
                    </span>
                  )}
                </div>

                {tab === "skipped" && r.excluded_reason && (
                  <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-xs font-semibold text-amber-200/90">
                      {EXCLUDED_WHY[r.excluded_reason]?.title || r.excluded_reason}
                    </p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {EXCLUDED_WHY[r.excluded_reason]?.detail}
                    </p>
                  </div>
                )}

                {tab === "review" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {done ? (
                      <>
                        <span className="text-sm text-emerald-300">
                          {done === "confirmed" ? "Confirmed." : "Rejected."}
                        </span>
                        <button type="button" onClick={() => undo(r)} disabled={busy === r.id}
                          className={SECONDARY_BUTTON + " inline-flex items-center gap-1.5"}>
                          <Undo2 className="h-3.5 w-3.5" /> Undo
                        </button>
                        <span className={T_CAPTION}>
                          Stays here until you press Refresh.
                        </span>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={!mayConfirm || busy === r.id}
                          onClick={() => act(r, "confirmed")}
                          className={PRIMARY_BUTTON + " inline-flex items-center gap-1.5 disabled:opacity-40"}>
                          <Check className="h-4 w-4" /> Reading is right
                        </button>
                        <label className="flex items-center gap-1.5">
                          <span className={T_LABEL}>or correct to</span>
                          <input type="number" min={0} inputMode="numeric"
                            aria-label={`Corrected minutes for record ${r.id}`}
                            value={edit[r.id] ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, [r.id]: e.target.value }))}
                            className={INPUT_CLASS + " w-20 tabular-nums"} placeholder={String(r.prep_minutes ?? "")} />
                          <span className={T_LABEL}>min</span>
                        </label>
                        <button type="button" disabled={!mayConfirm || busy === r.id}
                          onClick={() => act(r, "rejected")}
                          className={SECONDARY_BUTTON + " inline-flex items-center gap-1.5 disabled:opacity-40"}>
                          <X className="h-4 w-4" /> Cannot tell
                        </button>
                        {busy === r.id && <Loader2 className="h-4 w-4 animate-spin text-violet-300" />}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && rows.length >= 200 && (
          <p className={T_CAPTION + " mt-4"}>
            Showing the newest 200. Press Refresh after clearing these to load the next batch.
          </p>
        )}
      </div>
    </div>
  );
}
