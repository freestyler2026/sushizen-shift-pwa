"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import SelectDark from "@/components/SelectDark";

interface BoPage {
  key: string;
  slot: string;
  label: string;
  types: string[];
  owner: string;
  owner_conflict: string[];
  red: number;
  yellow: number;
  open_total: number;
}

interface MatrixRow {
  exception_type: string;
  title: string;
  severity: string;
  owner: string;
  open_count: number;
  in_catalogue: boolean;
}


const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Who a store task is addressed to, by branch and weekday.
 *
 *  The BO table above answers "which back-office person handles this kind of
 *  exception". This one answers "who at the store is being told", which is a
 *  different question and had no answer at all: 321 of 322 tasks carried no name.
 *
 *  It rotates by weekday because the real arrangement does — TAFT is Ayako on
 *  Monday and Francis the rest of the week — and a single owner per branch
 *  cannot say that.
 */
/**
 * Register the Discord id the channel sends to. The 17:30 reminder and every
 * task notification go nowhere for a person who has no id here, and that was
 * visible only as a warning nobody could act on.
 */
function DiscordIds({
  rows, missing, onSaved,
}: {
  rows: { staff_name: string; discord_user_id: string; display_name: string }[];
  missing: string[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (staffName: string, discordId: string) => {
    if (!staffName.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/management/channel-discord", {
        method: "PUT",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: staffName.trim(), discord_user_id: discordId.trim() }),
      });
      // The response is read before anything is called a success: a save that
      // silently failed here means a notification that silently never arrives.
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(String(j.detail || `Could not save (${res.status}).`));
        return;
      }
      setName("");
      setUid("");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-1 text-sm font-semibold text-white">Discord IDs</p>
      <p className="mb-3 text-xs text-zinc-400">
        Notifications and the daily reminder are sent by Discord DM. A person with no ID
        here receives nothing. To find an ID: Discord → Settings → Advanced → Developer
        Mode on, then right-click the person → Copy User ID (a number, not a @name).
      </p>

      {rows.length > 0 && (
        <div className="mb-3 space-y-1">
          {rows.map((r) => (
            <div key={r.staff_name} className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="min-w-[180px]">{r.staff_name}</span>
              <code className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-violet-200">
                {r.discord_user_id}
              </code>
              <button
                className={SMALL_BUTTON}
                disabled={busy}
                onClick={() => save(r.staff_name, "")}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={missing[0] ? `Name — e.g. ${missing[0]}` : "Staff name"}
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="Discord user ID (numbers only)"
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <button className={SMALL_BUTTON} disabled={busy || !name.trim() || !uid.trim()}
                onClick={() => save(name, uid)}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
    </div>
  );
}

function OwnerRoster({ city }: { city: string }) {
  const [data, setData] = useState<{
    branches: Record<string, string[]>;
    substitutes: Record<string, string>;
    discord: { staff_name: string; discord_user_id: string; display_name: string }[];
    missing_discord_id: string[];
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/management/owner-roster?city=${encodeURIComponent(city)}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) return;
      setData(await res.json());
    } catch { /* leave the rest of the page usable */ }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  const setCell = async (branch: string, weekday: number | null, staff_name: string,
                         substitute = false) => {
    setBusy(`${branch}:${weekday ?? "sub"}`);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/management/owner-roster?city=${encodeURIComponent(city)}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ branch, weekday, staff_name, substitute }),
      });
      const d = await res.json().catch(() => ({}));
      // The server checks the name against the roster. A typo would otherwise be
      // silent: the task carries a name nobody has, the send guard sees a filled
      // field, and the message goes nowhere.
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setData(d);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy("");
    }
  };

  if (!data) return null;
  const branches = Object.keys(data.branches).sort();

  return (
    <div className="mb-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-white/70">
        Store owners by weekday
      </h2>
      <p className={`${T_CAPTION} mb-3`}>
        Who receives a task raised for this branch on this day. A blank cell means
        nothing can be sent for that branch on that weekday — the send button
        refuses rather than delivering to nobody.
      </p>

      {msg && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {msg}
        </div>
      )}
      {data.missing_discord_id.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-200">
            <strong>{data.missing_discord_id.join(", ")}</strong> {data.missing_discord_id.length === 1 ? "has" : "have"} no
            Discord ID, so no notification is posted for them. They would have to open
            the page themselves. Add them below.
          </p>
        </div>
      )}

      {/* Until now this table could only be written by the seed, so anyone it
          did not list could never be reached — including two of the three
          people who actually press Send. */}
      <DiscordIds rows={data.discord} missing={data.missing_discord_id} onSaved={load} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className={TABLE_HEADER}>
              <th className="px-3 py-2 text-left">Branch</th>
              {WEEKDAYS.map((d) => <th key={d} className="px-2 py-2 text-left">{d}</th>)}
              <th className="px-3 py-2 text-left">Stand-in</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b} className={TABLE_ROW}>
                <td className="px-3 py-2 font-semibold text-white">{b}</td>
                {WEEKDAYS.map((_, i) => (
                  <td key={i} className="px-2 py-1.5">
                    <input
                      defaultValue={data.branches[b][i] || ""}
                      placeholder="—"
                      disabled={busy === `${b}:${i}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (data.branches[b][i] || "")) void setCell(b, i, v);
                      }}
                      className="w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-violet-500/50"
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={data.substitutes[b] || ""}
                    placeholder="—"
                    disabled={busy === `${b}:sub`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (data.substitutes[b] || "")) void setCell(b, null, v, true);
                    }}
                    className="w-36 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-violet-500/50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${T_CAPTION} mt-2`}>
        The stand-in is offered when the owner is not on the published shift. It is
        never applied automatically — the published shift is not always right, and a
        silent switch delivers to someone whose branch it is not.
      </p>
    </div>
  );
}


export default function ManagementAssignmentsPage() {
  const router = useRouter();
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [boPages, setBoPages] = useState<BoPage[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !(canAccessAdminNav(auth) || auth.role === "HQ" || auth.role === "ADMIN")) {
      router.replace("/");
    }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/management/assignment-matrix?city=${city}`, {
        cache: "no-store",
        headers: getAuthHeaders(auth),
      });
      if (!res.ok) throw new Error(`Could not load owners (${res.status})`);
      const data = await res.json();
      setRows((data.rows ?? []) as MatrixRow[]);

      const st = await fetch(
        `/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`,
        { cache: "no-store", headers: getAuthHeaders(auth) },
      );
      if (st.ok) setStaff(((await st.json())?.names ?? []) as string[]);

      const bp = await fetch(`/api/admin/management/bo-pages?city=${city}`, {
        cache: "no-store", headers: getAuthHeaders(auth),
      });
      if (bp.ok) setBoPages(((await bp.json())?.pages ?? []) as BoPage[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { void load(); }, [load]);

  const setOwner = (exceptionType: string, owner: string) => {
    setSaved("");
    setRows((prev) => prev.map((r) => (r.exception_type === exceptionType ? { ...r, owner } : r)));
  };

  const savePageOwner = async (pageKey: string, staffName: string) => {
    setSaved("");
    setError("");
    try {
      const res = await fetch("/api/admin/management/bo-pages/owner", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city, page_key: pageKey, staff_name: staffName }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Save failed (${res.status})`);
      setSaved(staffName ? `${staffName} now owns this page` : "Owner cleared");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/admin/management/assignment-matrix", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          rows: rows.map((r) => ({ exception_type: r.exception_type, staff_name: r.owner })),
          apply_to_open_tasks: true,
        }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Save failed (${res.status})`);
      const data = await res.json();
      setSaved(`Saved — ${data.tasks_reassigned} open task(s) re-pointed`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const unowned = rows.filter((r) => !r.owner);
  const unownedOpen = unowned.reduce((n, r) => n + r.open_count, 0);

  // An owner who is not on this city's ACTIVE roster still owns the type. The
  // dropdown was built from the roster alone, so those names had no option to
  // select and every one of them rendered as "no owner" -- the table said
  // nobody while the record said Yuri Yamada (Dubai) and Camille Santos (not on
  // any roster). Carry them into the options so the screen shows what is stored.
  const offRoster = useMemo(() => {
    const onRoster = new Set(staff);
    const assigned = new Set<string>();
    rows.forEach((r) => { if (r.owner) assigned.add(r.owner); });
    boPages.forEach((p) => { if (p.owner) assigned.add(p.owner); });
    return [...assigned].filter((n) => !onRoster.has(n)).sort();
  }, [rows, boPages, staff]);

  const cityLabel = city === "dubai" ? "Dubai" : "Manila";

  const ownerOptions = (current: string) => {
    const onRoster = new Set(staff);
    const extras = [...new Set(
      current && !onRoster.has(current) ? [...offRoster, current] : offRoster
    )];
    return [
      { value: "", label: "— no owner —" },
      ...staff.map((n) => ({ value: n, label: n })),
      ...extras.map((n) => ({ value: n, label: `${n} — not on the ${cityLabel} roster` })),
    ];
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <MgmtChannelTabBar active="owners" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className={T_PAGE_TITLE}>Exception Owners</h1>
        <SelectDark
          value={city}
          onChange={(v) => setCity(v as "manila" | "dubai")}
          options={[
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ]}
        />
        <button type="button" onClick={() => void load()} className={SMALL_BUTTON}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
        <div className="ml-auto flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-400">{saved}</span>}
          <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY_BUTTON}>
            <Save className="mr-1 inline h-4 w-4" />
            {saving ? "Saving…" : "Save owners"}
          </button>
        </div>
      </div>

      <p className={`${T_CAPTION} mb-4`}>
        Who handles each kind of store exception. Detection assigns new tasks to the person named
        here, and the name sticks until it is changed. A type left blank produces tasks nobody owns.
      </p>

      {/* An unset type is the failure this page exists to prevent, so it is stated
          before the table rather than left to be noticed inside it. */}
      {!loading && unowned.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">
            <strong>{unowned.length} type(s) have no owner</strong>
            {unownedOpen > 0 && <> — {unownedOpen} open task(s) belong to nobody.</>} Tasks of these
            types will keep arriving unassigned until someone is named.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <OwnerRoster city={"manila"} />

      {/* Ownership is per page in the design — one person, one page, one manual.
          The per-type table below stays for exceptions to that, but the page is
          how it is meant to be set: nothing makes you enumerate a list you might
          not know is complete. */}
      <div className="mb-6 flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white/70">Pages</h2>
        <p className={T_CAPTION}>
          Counts are every task that is not Closed — open, sent and responded together.
          Press one to open the dashboard on exactly those rows. The dashboard itself starts
          filtered to Open and to your own pages, so it will show fewer until you clear that.
        </p>
        {boPages.map((p) => (
          <div key={p.key} className={`${GLASS_CARD} flex flex-wrap items-center gap-3 px-4 py-3`}>
            <div className="min-w-[200px]">
              <div className="text-sm font-semibold text-white">{p.label}</div>
              <div className={T_CAPTION}>{p.slot} · {p.types.length} types</div>
            </div>
            {p.open_total > 0 && (
              <Link
                href={`/admin/management/back-office?page=${encodeURIComponent(p.key)}&status=not_closed&city=manila`}
                className="rounded px-1.5 py-0.5 text-xs underline underline-offset-2 hover:bg-white/5"
                title="Tasks on this page that are not closed"
              >
                {p.red > 0 && <span className="text-red-300">{p.red} red</span>}
                {p.red > 0 && p.yellow > 0 && <span className="text-zinc-600"> · </span>}
                {p.yellow > 0 && <span className="text-amber-300">{p.yellow} yellow</span>}
                <span className="ml-1 text-white/35">not closed</span>
              </Link>
            )}
            {p.owner_conflict.length > 0 && (
              <div className="text-xs text-amber-300">Split: {p.owner_conflict.join(" / ")}</div>
            )}
            <div className="ml-auto min-w-[220px]">
              <SelectDark
                value={p.owner}
                onChange={(v) => void savePageOwner(p.key, v)}
                options={ownerOptions(p.owner)}
              />
            </div>
          </div>
        ))}
        {boPages.length === 0 && <div className={T_CAPTION}>Loading…</div>}
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-white/70">
        Per-type overrides
      </h2>
      <div className={`${GLASS_CARD} overflow-hidden p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEADER}>
                <th className="px-4 py-2.5 text-left">Exception</th>
                <th className="px-4 py-2.5 text-left">Severity</th>
                <th className="px-4 py-2.5 text-right">
                  Not closed
                  <span className="ml-1 font-normal normal-case text-white/35">(open + sent + responded)</span>
                </th>
                <th className="px-4 py-2.5 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className={`px-4 py-6 text-center ${T_CAPTION}`}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className={`px-4 py-6 text-center ${T_CAPTION}`}>No exception types found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.exception_type} className={TABLE_ROW}>
                  <td className="px-4 py-2.5">
                    <div className={T_BODY}>{r.title}</div>
                    <div className={`${T_CAPTION} font-mono`}>
                      {r.exception_type}
                      {!r.in_catalogue && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                          no template
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.severity === "red"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.open_count > 0 ? (
                      // A number you can read but not reach is the whole reason
                      // this figure and the dashboard table looked like they
                      // disagreed. This opens the dashboard on exactly these
                      // rows, every status, all pages.
                      <Link
                        href={`/admin/management/back-office?type=${encodeURIComponent(r.exception_type)}&status=not_closed&city=manila`}
                        className="rounded px-1.5 py-0.5 text-violet-300 underline underline-offset-2 hover:bg-violet-500/10 hover:text-violet-200"
                      >
                        {r.open_count}
                      </Link>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <SelectDark
                      value={r.owner}
                      onChange={(v) => setOwner(r.exception_type, v)}
                      options={ownerOptions(r.owner)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className={`${T_CAPTION} mt-3`}>
        Saving also re-points open tasks of each type to its new owner, so a change takes effect on
        what is already waiting rather than only on what arrives next.
      </p>
    </div>
  );
}
