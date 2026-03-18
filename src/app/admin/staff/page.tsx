// src/app/admin/staff/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, isAdmin, type City } from "@/lib/auth";
import { apiGet, apiPost, qs } from "@/lib/api";

const ROLE_OPTIONS = ["STAFF", "MANAGER", "HQ", "ADMIN"] as const;
type StaffRole = (typeof ROLE_OPTIONS)[number];

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"] as const;
type StaffStatus = (typeof STATUS_OPTIONS)[number];

type StaffRow = {
  id: string;
  city: string;
  display_name: string;

  home_branch?: string;
  role?: string;
  status?: string;
  max_days_per_week?: number;
  max_consecutive_days?: number;
  notes?: string;
  skill_rank?: string;

  setup_required?: boolean;
  setup_completed?: boolean;

  created_at?: string | null;
  updated_at?: string | null;
};

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

function norm(s: any) {
  return String(s ?? "").trim();
}

function asRole(s: any): StaffRole {
  const u = norm(s).toUpperCase();
  if (ROLE_OPTIONS.includes(u as any)) return u as StaffRole;
  return "STAFF";
}

function asStatus(s: any): StaffStatus {
  const u = norm(s).toUpperCase();
  if (STATUS_OPTIONS.includes(u as any)) return u as StaffStatus;
  return "ACTIVE";
}

function roleBadgeClass(role: StaffRole) {
  if (role === "ADMIN") {
    return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  }
  if (role === "HQ") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (role === "MANAGER") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function statusBadgeClass(status: StaffStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  return "border-rose-900/40 bg-rose-950/10 text-rose-200";
}

function branchBadgeClass(branch: string) {
  const b = (branch || "").trim().toUpperCase();

  if (b === "BB" || b === "BUSINESS BAY") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (b === "JLT") {
    return "border-cyan-900/40 bg-cyan-950/10 text-cyan-200";
  }
  if (b === "ARJ" || b === "ARJAN") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (b === "AM" || b === "AL MINA") {
    return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  }
  if (b === "AB" || b === "AL BARSHA") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (b === "CK") {
    return "border-violet-900/40 bg-violet-950/10 text-violet-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function skillBadgeClass(skill: string) {
  const s = (skill || "").trim().toUpperCase();

  if (s === "A") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (s === "B") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (s === "C") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (s === "D") {
    return "border-orange-900/40 bg-orange-950/10 text-orange-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function setupBadgeClass(setupRequired: boolean, setupCompleted: boolean) {
  if (setupCompleted) {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (setupRequired) {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

export default function AdminStaffPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const [city, setCity] = useState<City>("dubai");

  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");

  const [statusFilter, setStatusFilter] = useState<StaffStatus>("ACTIVE");
  const [homeBranchFilter, setHomeBranchFilter] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(2000);

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const [selectedDisplayName, setSelectedDisplayName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  const [homeBranch, setHomeBranch] = useState("");
  const [role, setRole] = useState<StaffRole>("STAFF");
  const [status, setStatus] = useState<StaffStatus>("ACTIVE");
  const [maxDaysPerWeek, setMaxDaysPerWeek] = useState<number>(6);
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState<number>(6);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login?next=%2Fadmin%2Fstaff");
      return;
    }
    if (!isAdmin(a)) {
      router.replace("/week");
      return;
    }
    setAuthed(a);
    setCity(a.city || "dubai");
    setApproverName(a.staffName || "");
  }, [router]);

  const msgCls =
    msg?.kind === "err"
      ? "text-red-300"
      : msg?.kind === "ok"
        ? "text-emerald-200"
        : "text-amber-200";

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      const res = await apiGet<{ ok: boolean; rows: StaffRow[] }>(
        `/api/admin/staff_master${qs({
          city,
          status: statusFilter,
          home_branch: homeBranchFilter,
          q,
          limit,
          approver_name: nm,
          pin: p,
        })}`
      );

      const list = (res.rows || []).map((r) => ({
        ...r,
        display_name: norm(r.display_name),
        home_branch: norm(r.home_branch),
        role: norm(r.role),
        status: norm(r.status),
        notes: norm(r.notes),
      }));

      setRows(list);
      setMsg({ kind: "ok", text: `Loaded: ${list.length} rows` });
    } catch (e: any) {
      setRows([]);
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDisplayName("");
    setNewDisplayName("");
    setHomeBranch("");
    setRole("STAFF");
    setStatus("ACTIVE");
    setMaxDaysPerWeek(6);
    setMaxConsecutiveDays(6);
    setNotes("");
  };

  const onPickRow = (r: StaffRow) => {
    setSelectedDisplayName(norm(r.display_name));
    setNewDisplayName("");
    setHomeBranch(norm(r.home_branch));
    setRole(asRole(r.role));
    setStatus(asStatus(r.status));
    setMaxDaysPerWeek(Number(r.max_days_per_week ?? 6));
    setMaxConsecutiveDays(Number(r.max_consecutive_days ?? 6));
    setNotes(norm(r.notes));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const upsert = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      const finalDisplayName = norm(newDisplayName) || norm(selectedDisplayName);
      if (!finalDisplayName) throw new Error("display_name is required.");

      const payload = {
        city,
        display_name: finalDisplayName,
        home_branch: norm(homeBranch),
        role,
        status,
        max_days_per_week: Math.max(1, Math.min(7, Number(maxDaysPerWeek || 6))),
        max_consecutive_days: Math.max(1, Math.min(14, Number(maxConsecutiveDays || 6))),
        notes: norm(notes),
        approver_name: nm,
        pin: p,
      };

      const r = await apiPost<{ ok: boolean; id: string }>(
        "/api/admin/staff_master/upsert",
        payload
      );

      setMsg({ kind: "ok", text: `Saved: ${r.id}` });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const setStatusOnly = async (display_name: string, newStatus: StaffStatus) => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = norm(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");

      const dn = norm(display_name);
      if (!dn) throw new Error("display_name missing.");

      const r = await apiPost<{ ok: boolean; updated: number }>(
        "/api/admin/staff_master/set_status",
        {
          city,
          display_name: dn,
          status: newStatus,
          approver_name: nm,
          pin: p,
        }
      );

      setMsg({
        kind: "ok",
        text: `Status updated: ${dn} → ${newStatus} (updated=${r.updated ?? 0})`,
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const branches = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const hb = norm(r.home_branch);
      if (hb) set.add(hb);
    });

    [
      "Business Bay",
      "JLT",
      "Arjan",
      "Al Mina",
      "Al Barsha",
      "CK",
      "Delivery",
    ].forEach((x) => set.add(x));

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const sortedNames = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => norm(r.display_name)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [rows]
  );

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-semibold">Quick Links</div>
        <div className="mt-1 text-xs text-neutral-500">
          Move between staff master, onboarding, and HQ role management.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <a
            href="/admin/staff/create"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Create Staff Record</div>
            <div className="mt-1 text-xs text-neutral-400">
              Register a new staff member and issue setup code.
            </div>
          </a>

          <a
            href="/admin/analytics"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Analytics</div>
            <div className="mt-1 text-xs text-neutral-400">
              Review historical hours, weekday averages, staff workload, and absences.
            </div>
          </a>

          <a
            href="/admin/staff/setup"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Pending Staff Setup</div>
            <div className="mt-1 text-xs text-neutral-400">
              View pending setup staff and reissue codes.
            </div>
          </a>

          <a
            href="/admin/staff/roles"
            className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 transition hover:bg-amber-950/20"
          >
            <div className="text-sm font-semibold text-amber-200">Role Management</div>
            <div className="mt-1 text-xs text-neutral-400">
              HQ only. Change staff roles including ADMIN.
            </div>
          </a>

          <a
            href="/admin/staff/onboarding"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Onboarding Dashboard</div>
            <div className="mt-1 text-xs text-neutral-400">
              View staff created, pending setup, and completed onboarding status.
            </div>
          </a>

          <a
            href="/admin/staff/audit"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Audit Logs</div>
            <div className="mt-1 text-xs text-neutral-400">
              View staff creation, setup completion, code reissue, and role change history.
            </div>
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-sm font-semibold">Admin • Staff Master</div>
        <div className="mt-1 text-xs text-neutral-500">
          Manage roster without code changes (ACTIVE/INACTIVE, branch, constraints).
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-xs text-neutral-400">City</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Approver name (ADMIN)</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="e.g. Yukihiro Nishimura"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">PIN</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              type="password"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !norm(approverName) || !norm(pin)}
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white disabled:opacity-60"
            title={!norm(pin) ? "Enter PIN to load" : "Load"}
          >
            {loading ? "Loading..." : "Login & Load"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40"
          >
            Clear form
          </button>

          {msg ? <div className={`text-sm ${msgCls}`}>{msg.text}</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-semibold">Add / Update</div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-neutral-400">Select existing staff</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={selectedDisplayName}
              onChange={(e) => setSelectedDisplayName(e.target.value)}
            >
              <option value="">Select staff</option>
              {sortedNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="mt-2 text-[11px] text-neutral-500">
              Select an existing staff member to update.
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Or add new staff</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="New staff full name"
            />
            <div className="mt-2 text-[11px] text-neutral-500">
              Leave blank unless creating a new staff record.
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Home branch</div>
            <input
              list="branch_list"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={homeBranch}
              onChange={(e) => setHomeBranch(e.target.value)}
              placeholder="Business Bay / JLT / ..."
            />
            <datalist id="branch_list">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Role</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {ROLE_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Status</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as StaffStatus)}
            >
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Max days / week</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={7}
              value={Number.isFinite(maxDaysPerWeek) ? maxDaysPerWeek : 6}
              onChange={(e) => setMaxDaysPerWeek(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Max consecutive days</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={14}
              value={Number.isFinite(maxConsecutiveDays) ? maxConsecutiveDays : 6}
              onChange={(e) => setMaxConsecutiveDays(Number(e.target.value))}
            />
          </div>

          <div className="sm:col-span-3">
            <div className="mb-1 text-xs text-neutral-400">Notes</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={loading || !norm(approverName) || !norm(pin)}
            onClick={upsert}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">List</div>
            <div className="text-xs text-neutral-500">
              Rows: <span className="text-neutral-200">{rows.length}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div>
            <div className="mb-1 text-xs text-neutral-400">Status</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StaffStatus)}
            >
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Home branch</div>
            <input
              list="branch_list"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={homeBranchFilter}
              onChange={(e) => setHomeBranchFilter(e.target.value)}
              placeholder="(optional)"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-neutral-400">Search</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name contains..."
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Limit</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !norm(approverName) || !norm(pin)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            Refresh list
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {!rows.length && !loading ? (
            <div className="text-sm text-neutral-500">No rows.</div>
          ) : null}

          {rows.map((r) => {
            const dn = norm(r.display_name);
            const st = asStatus(r.status);
            const hb = norm(r.home_branch);
            const rr = asRole(r.role);
            const mdw = Number(r.max_days_per_week ?? 6);
            const mcd = Number(r.max_consecutive_days ?? 6);
            const sr = norm(r.skill_rank);
            const setupRequired = Boolean(r.setup_required);
            const setupCompleted = Boolean(r.setup_completed);
            const setupLabel = setupCompleted ? "setup:done" : setupRequired ? "setup:pending" : "setup:n/a";

            return (
              <div
                key={`${r.city}__${dn}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{dn}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          branchBadgeClass(hb),
                        ].join(" ")}
                      >
                        {hb || "-"}
                      </span>

                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          roleBadgeClass(rr),
                        ].join(" ")}
                      >
                        {rr}
                      </span>

                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusBadgeClass(st),
                        ].join(" ")}
                      >
                        {st}
                      </span>

                      <span>max/wk:{mdw}</span>
                      <span>max/cons:{mcd}</span>
                      {sr ? (
                        <span
                          className={[
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            skillBadgeClass(sr),
                          ].join(" ")}
                        >
                          skill:{sr}
                        </span>
                      ) : null}
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          setupBadgeClass(setupRequired, setupCompleted),
                        ].join(" ")}
                      >
                        {setupLabel}
                      </span>
                    </div>
                    {r.notes ? (
                      <div className="mt-1 truncate text-xs text-neutral-500">
                        {norm(r.notes)}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPickRow(r)}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs hover:bg-neutral-900"
                    >
                      Edit
                    </button>

                    <a
                      href={`/admin/staff/roles?staff_name=${encodeURIComponent(dn)}`}
                      className="rounded-lg border border-amber-900 bg-amber-950/20 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/40"
                    >
                      Role
                    </a>

                    <a
                      href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(dn)}`}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
                    >
                      Audit
                    </a>

                    {setupRequired && !setupCompleted ? (
                      <a
                        href="/admin/staff/setup"
                        className="rounded-lg border border-sky-900/40 bg-sky-950/10 px-3 py-1 text-xs text-sky-200 hover:bg-sky-950/20"
                      >
                        Pending Setup
                      </a>
                    ) : null}

                    {st === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => setStatusOnly(dn, "INACTIVE")}
                        className="rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/50"
                        disabled={loading}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatusOnly(dn, "ACTIVE")}
                        className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-950/50"
                        disabled={loading}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Note: list endpoint is filtered by <code>status</code>. Switch to INACTIVE to see disabled staff.
        </div>
      </div>
    </div>
  );
}