"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City as BranchCity } from "@/lib/branches";

type DraftVersion = {
  id: string;
  city: string;
  branch_code: string;
  week_start: string;
  created_by: string;
  created_at: string;
  status: string;
};

type DraftRow = {
  id: string;
  work_date: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
  source?: string;
  updated_at?: string;
};

type DraftGenerateMonthResult = {
  ok: boolean;
  version_id: string;
  city: string;
  branch_code: string;
  target_month: string;
  rows_inserted: number;
  days_generated: number;
  source_days: Array<{
    target_date: string;
    reference_date: string;
    source_type: string;
    rows_copied: number;
  }>;
  version_week_start: string;
};

type ApplyPrepareResult = {
  ok: boolean;
  confirm_token: string;
  expires_in_sec: number;
  preview: {
    city: string;
    branch_code: string;
    week_start: string;
    draft_version_id: string;
    rows_count: number;
    staff_count: number;
  };
};

type ApplyConfirmResult = {
  ok: boolean;
  city: string;
  branch_code: string;
  week_start: string;
  draft_version_id: string;
  published_version_id?: string;
  rows_copied?: number;
  warning?: string;
  export?: {
    ok?: boolean;
    sheet_url?: string;
    spreadsheet_id?: string;
    tab_main?: string;
    tab_headcount?: string;
    main_url?: string;
    headcount_url?: string;
    meta?: any;
  };
};

type PublishedWeekResult = {
  ok: boolean;
  city: string;
  week_start: string;
  count: number;
  rows: Array<{
    work_date: string;
    branch_code: string;
    area: string;
    staff_name: string;
    role: string;
    start_hour: number;
    end_hour: number;
    is_exception: boolean;
  }>;
};

type VerifyResp = {
  ok: boolean;
  staff_name: string;
  role: "STAFF" | "MANAGER" | "HQ" | "ADMIN";
};

function norm(s: string) {
  return (s || "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hourText(h: number) {
  const hh = Number(h || 0);
  const base = hh >= 24 ? hh - 24 : hh;
  const suffix = hh >= 24 ? "(+1)" : "";
  return `${pad2(base)}${suffix}`;
}

function rangeText(st: number, en: number) {
  return `${hourText(st)}–${hourText(en)}`;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthStartDate(month: string) {
  return new Date(`${month}-01T00:00:00`);
}

function monthDates(month: string) {
  const out: string[] = [];
  if (!month || month.length !== 7) return out;
  const start = monthStartDate(month);
  if (Number.isNaN(start.getTime())) return out;
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = new Date(y, m, 1);
  while (d.getMonth() === m) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function mondayOfDateString(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function uniqueStaffCount(rows: DraftRow[]) {
  return new Set(rows.map((r) => norm(r.staff_name)).filter(Boolean)).size;
}

function sortRows(rows: DraftRow[]) {
  return [...rows].sort((a, b) => {
    if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
    if (a.staff_name !== b.staff_name) return a.staff_name.localeCompare(b.staff_name);
    if (a.start_hour !== b.start_hour) return a.start_hour - b.start_hour;
    return a.end_hour - b.end_hour;
  });
}

function uniqueWeekStartsFromRows(rows: DraftRow[]) {
  const s = new Set<string>();
  for (const r of rows) s.add(mondayOfDateString(r.work_date));
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

function qs(obj: Record<string, any>) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v);
    if (s === "") return;
    p.append(k, s);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export default function AdminDraftPage() {
  const router = useRouter();
  const auth = getAuth();

  const [city, setCity] = useState<BranchCity>((auth?.city as BranchCity) || "dubai");
  const [branchCode, setBranchCode] = useState<BranchCode>(
    (city === "dubai" ? "BB" : "PAR") as BranchCode
  );

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<"STAFF" | "MANAGER" | "HQ" | "ADMIN" | "">("");

  const [targetMonth, setTargetMonth] = useState(monthKey(new Date()));
  const [prepared, setPrepared] = useState<null | {
    city: string;
    branch_code: string;
    target_month: string;
  }>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [version, setVersion] = useState<DraftVersion | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [generateResult, setGenerateResult] = useState<DraftGenerateMonthResult | null>(null);

  const [newWorkDate, setNewWorkDate] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newStartHour, setNewStartHour] = useState("9");
  const [newEndHour, setNewEndHour] = useState("18");
  const [editingRow, setEditingRow] = useState<DraftRow | null>(null);

  const [applyWeekStart, setApplyWeekStart] = useState("");
  const [applyPrepared, setApplyPrepared] = useState<ApplyPrepareResult | null>(null);
  const [applyConfirmChecked, setApplyConfirmChecked] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyConfirmResult | null>(null);
  const [published, setPublished] = useState<PublishedWeekResult | null>(null);

  const canOperate = myRole === "HQ" || myRole === "ADMIN";
  const targetMonthDates = useMemo(() => monthDates(targetMonth), [targetMonth]);

  const grouped = useMemo(() => {
    const m = new Map<string, DraftRow[]>();
    for (const r of sortRows(rows)) {
      const key = r.work_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

  const availableWeekStarts = useMemo(() => uniqueWeekStartsFromRows(rows), [rows]);

  useEffect(() => {
    if (!auth?.staffName) {
      router.replace("/login");
    }
  }, [auth, router]);

  useEffect(() => {
    const run = async () => {
      const nm = approverName.trim();
      const p = pin.trim();

      if (!nm || !p) {
        setMyRole("");
        return;
      }

      try {
        const r = await apiPost<VerifyResp>(`/api/auth/verify${qs({ staff_name: nm, pin: p })}`);
        if (r?.ok) setMyRole(r.role || "");
        else setMyRole("");
      } catch {
        setMyRole("");
      }
    };

    run();
  }, [approverName, pin]);

  useEffect(() => {
    setBranchCode((city === "dubai" ? "BB" : "PAR") as BranchCode);
    setPrepared(null);
    setVersion(null);
    setRows([]);
    setGenerateResult(null);
    setApplyPrepared(null);
    setApplyConfirmChecked(false);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyWeekStart("");
    setError("");
  }, [city]);

  useEffect(() => {
    if (!availableWeekStarts.length) {
      setApplyWeekStart("");
      return;
    }
    if (!applyWeekStart || !availableWeekStarts.includes(applyWeekStart)) {
      setApplyWeekStart(availableWeekStarts[0]);
    }
  }, [availableWeekStarts, applyWeekStart]);

  useEffect(() => {
    let mounted = true;

    async function loadPublished() {
      if (!applyWeekStart) {
        setPublished(null);
        return;
      }
      try {
        const pr = await apiGet<PublishedWeekResult>(
          `/api/published/week${qs({ city, week_start: applyWeekStart })}`
        );
        if (mounted) setPublished(pr);
      } catch {
        if (mounted) setPublished(null);
      }
    }

    loadPublished();
    return () => {
      mounted = false;
    };
  }, [city, applyWeekStart]);

  function prepareDraft() {
    setError("");
    setGenerateResult(null);
    setPrepared({
      city,
      branch_code: branchCode,
      target_month: targetMonth,
    });
    setConfirmChecked(false);
    setApplyPrepared(null);
    setApplyConfirmChecked(false);
    setApplyResult(null);
    setPublished(null);
  }

  async function confirmGenerate() {
    if (!prepared) return;
    setLoading(true);
    setError("");
    setGenerateResult(null);
    setVersion(null);
    setRows([]);
    setApplyPrepared(null);
    setApplyConfirmChecked(false);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyWeekStart("");

    try {
      const res = (await apiPost(`/api/draft/generate_month`, {
        city: prepared.city,
        branch_code: prepared.branch_code,
        target_month: prepared.target_month,
        created_by: approverName || "AI",
      })) as DraftGenerateMonthResult;

      setGenerateResult(res);
      setVersion({
        id: res.version_id,
        city: res.city,
        branch_code: res.branch_code,
        week_start: res.version_week_start,
        created_by: approverName || "AI",
        created_at: "",
        status: "DRAFT",
      });

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: res.version_id })}`
      );
      const nextRows = sortRows(rr.rows || []);
      setRows(nextRows);

      if (nextRows.length > 0) {
        setNewWorkDate(nextRows[0].work_date);
      } else if (targetMonthDates.length > 0) {
        setNewWorkDate(targetMonthDates[0]);
      }

      const weeks = uniqueWeekStartsFromRows(nextRows);
      setApplyWeekStart(weeks[0] || "");
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to generate monthly draft"));
    } finally {
      setLoading(false);
    }
  }

  function startEditRow(r: DraftRow) {
    setEditingRow(r);
    setNewWorkDate(r.work_date);
    setNewStaffName(r.staff_name);
    setNewRole(r.role || "");
    setNewStartHour(String(r.start_hour));
    setNewEndHour(String(r.end_hour));
  }

  function cancelEdit() {
    setEditingRow(null);
    setNewStaffName("");
    setNewRole("");
    setNewStartHour("9");
    setNewEndHour("18");
    setNewWorkDate(targetMonthDates[0] || "");
  }

  async function saveRow() {
    if (!version?.id) return;
    setLoading(true);
    setError("");

    try {
      const nextRow = {
        work_date: norm(newWorkDate),
        staff_name: norm(newStaffName),
        role: norm(newRole),
        start_hour: Number(newStartHour),
        end_hour: Number(newEndHour),
      };

      if (!nextRow.work_date) throw new Error("Date is required");
      if (!nextRow.staff_name) throw new Error("Staff name is required");
      if (Number.isNaN(nextRow.start_hour) || Number.isNaN(nextRow.end_hour)) {
        throw new Error("Start / End hour is invalid");
      }
      if (nextRow.end_hour <= nextRow.start_hour) {
        throw new Error("End hour must be greater than start hour");
      }

      if (editingRow?.id) {
        await apiPost(`/api/draft/rows/update`, {
          row_id: editingRow.id,
          ...nextRow,
        });
      } else {
        await apiPost(`/api/draft/rows/upsert`, {
          version_id: version.id,
          ...nextRow,
        });
      }

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.id })}`
      );
      setRows(sortRows(rr.rows || []));

      setEditingRow(null);
      setNewStaffName("");
      setNewRole("");
      setNewStartHour("9");
      setNewEndHour("18");
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to save row"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteRow(r: DraftRow) {
    if (!version?.id) return;
    setLoading(true);
    setError("");

    try {
      await apiPost(`/api/draft/rows/delete_by_id`, {
        row_id: r.id,
      });

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.id })}`
      );
      setRows(sortRows(rr.rows || []));

      if (editingRow?.id === r.id) {
        cancelEdit();
      }
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to delete row"));
    } finally {
      setLoading(false);
    }
  }

  async function prepareApply() {
    if (!version?.id) return;
    if (!applyWeekStart) {
      setError("Select a week to publish first.");
      return;
    }

    setLoading(true);
    setError("");
    setApplyPrepared(null);
    setApplyConfirmChecked(false);
    setApplyResult(null);

    try {
      const res = await apiPost<ApplyPrepareResult>(`/api/draft/apply/prepare`, {
        city,
        branch_code: branchCode,
        week_start: applyWeekStart,
        draft_version_id: version.id,
        approver_name: approverName,
        pin,
      });
      setApplyPrepared(res);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to prepare apply"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmApply() {
    if (!applyPrepared?.confirm_token) return;
    setLoading(true);
    setError("");
    setApplyResult(null);

    try {
      const res = await apiPost<ApplyConfirmResult>(`/api/draft/apply/confirm`, {
        confirm_token: applyPrepared.confirm_token,
        approver_name: approverName,
        pin,
        auto_export: true,
      });
      setApplyResult(res);

      const pr = await apiGet<PublishedWeekResult>(
        `/api/published/week${qs({ city, week_start: applyWeekStart })}`
      );
      setPublished(pr);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to confirm apply"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div className="text-lg font-semibold">Admin • Draft Generator / Edit / Apply</div>
        <div className="mt-1 text-sm text-neutral-400">
          Generate monthly draft from previous month same-weekday copy, edit rows, then publish week by week.
        </div>

        {!canOperate ? (
          <div className="mt-4 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">
            HQ / ADMIN only. Enter a valid approver name and PIN to verify your role.
          </div>
        ) : null}

        <div className="mt-2 text-xs text-neutral-500">
          Verified role: <span className="text-neutral-200">{myRole || "—"}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="mb-1 text-xs text-neutral-400">City</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as BranchCity)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Branch</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value as BranchCode)}
            >
              {BRANCHES[city].map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Target month</div>
            <input
              type="month"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Approver</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">PIN</div>
            <input
              type="password"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={prepareDraft}
            disabled={!canOperate || loading}
            className="rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/50 disabled:opacity-60"
          >
            Prepare Generate
          </button>

          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-200">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={!prepared}
            />
            I confirm generating a new monthly draft.
          </label>

          <button
            type="button"
            onClick={confirmGenerate}
            disabled={!canOperate || loading || !prepared || !confirmChecked}
            className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
          >
            {loading ? "Working..." : "Confirm Generate"}
          </button>
        </div>

        {prepared ? (
          <div className="mt-3 text-xs text-neutral-400">
            Prepared: <span className="text-neutral-200">{prepared.branch_code}</span> • {prepared.target_month}
          </div>
        ) : null}

        {error ? <div className="mt-3 whitespace-pre-wrap text-sm text-red-300">{error}</div> : null}
      </div>

      {generateResult?.ok ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold">Generate result</div>
          <div className="mt-2 space-y-1 text-xs text-neutral-400">
            <div>version_id: <span className="text-neutral-200">{generateResult.version_id}</span></div>
            <div>branch: <span className="text-neutral-200">{generateResult.branch_code}</span></div>
            <div>target_month: <span className="text-neutral-200">{generateResult.target_month}</span></div>
            <div>rows_inserted: <span className="text-neutral-200">{generateResult.rows_inserted}</span></div>
            <div>days_generated: <span className="text-neutral-200">{generateResult.days_generated}</span></div>
          </div>
        </div>
      ) : null}

      {version ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold">Apply draft to published</div>
          <div className="mt-1 text-xs text-neutral-400">
            Monthly draft is published one week at a time.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Week to publish (Mon)</div>
              <select
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={applyWeekStart}
                onChange={(e) => setApplyWeekStart(e.target.value)}
              >
                {availableWeekStarts.map((ws) => (
                  <option key={ws} value={ws}>
                    {ws}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={prepareApply}
              disabled={loading || !canOperate || !approverName.trim() || !pin.trim() || !applyWeekStart}
              className="rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/50 disabled:opacity-60"
            >
              Prepare Apply
            </button>

            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-200">
              <input
                type="checkbox"
                checked={applyConfirmChecked}
                onChange={(e) => setApplyConfirmChecked(e.target.checked)}
                disabled={!applyPrepared}
              />
              I confirm publishing this week.
            </label>

            <button
              type="button"
              onClick={confirmApply}
              disabled={loading || !applyPrepared || !applyConfirmChecked}
              className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
            >
              Confirm Apply
            </button>
          </div>

          {applyPrepared?.ok ? (
            <div className="mt-3 space-y-1 text-xs text-neutral-400">
              <div>
                token: <span className="text-neutral-200">{applyPrepared.confirm_token}</span>
              </div>
              <div>
                preview: {applyPrepared.preview.rows_count} rows / {applyPrepared.preview.staff_count} staff
              </div>
            </div>
          ) : null}

          {applyResult?.ok ? (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="text-sm font-semibold">Apply result</div>
              <div className="mt-2 space-y-1 text-xs text-neutral-400">
                <div>
                  published_version_id:{" "}
                  <span className="text-neutral-200">{applyResult.published_version_id || "-"}</span>
                </div>
                <div>
                  rows_copied: <span className="text-neutral-200">{String(applyResult.rows_copied ?? "-")}</span>
                </div>
                {applyResult.warning ? (
                  <div className="text-amber-300">{applyResult.warning}</div>
                ) : null}
              </div>

              {applyResult.export ? (
                <div className="pt-3">
                  <div className="text-sm font-semibold">Export result</div>
                  <div className="mt-1 space-y-1 text-xs text-neutral-400">
                    {applyResult.export.sheet_url ? (
                      <div>
                        Sheet:{" "}
                        <a
                          className="underline hover:text-white"
                          href={applyResult.export.sheet_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          open
                        </a>
                      </div>
                    ) : null}

                    {applyResult.export.main_url ? (
                      <div>
                        Main:{" "}
                        <a
                          className="underline hover:text-white"
                          href={applyResult.export.main_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          open
                        </a>
                      </div>
                    ) : null}

                    {applyResult.export.headcount_url ? (
                      <div>
                        Headcount:{" "}
                        <a
                          className="underline hover:text-white"
                          href={applyResult.export.headcount_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          open
                        </a>
                      </div>
                    ) : null}

                    {applyResult.export.tab_main || applyResult.export.tab_headcount ? (
                      <div>
                        Tabs:{" "}
                        <span className="text-neutral-200">
                          {applyResult.export.tab_main || "-"}
                        </span>
                        ,{" "}
                        <span className="text-neutral-200">
                          {applyResult.export.tab_headcount || "-"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {version ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Draft rows</div>
              <div className="mt-1 text-xs text-neutral-400">
                version_id: <span className="text-neutral-200">{version.id}</span> • rows:{" "}
                <span className="text-neutral-200">{rows.length}</span> • staff:{" "}
                <span className="text-neutral-200">{uniqueStaffCount(rows)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Date</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newWorkDate}
                onChange={(e) => setNewWorkDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {targetMonthDates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewWorkDate(d)}
                    className={[
                      "rounded-lg border px-2 py-1 text-xs",
                      newWorkDate === d
                        ? "border-amber-500 bg-amber-950/30 text-amber-200"
                        : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900",
                    ].join(" ")}
                  >
                    {d.slice(5)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Staff</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="Staff name"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Role</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="Role"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Start</div>
              <input
                type="number"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newStartHour}
                onChange={(e) => setNewStartHour(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">End</div>
              <input
                type="number"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newEndHour}
                onChange={(e) => setNewEndHour(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveRow}
              disabled={loading || !version?.id || !norm(newWorkDate) || !norm(newStaffName)}
              className="rounded-xl border border-sky-900 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-950/50 disabled:opacity-60"
            >
              {editingRow ? "Save Update" : "Add Row"}
            </button>

            {editingRow ? (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={loading}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            {!grouped.length ? <div className="text-sm text-neutral-500">No draft rows.</div> : null}

            {grouped.map(([day, dayRows]) => (
              <div key={day} className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
                <div className="mb-3 text-sm font-semibold">{day}</div>

                <div className="space-y-2">
                  {dayRows.map((r, idx) => {
                    const isEditing = editingRow?.id === r.id;

                    return (
                      <div
                        key={`${r.id}-${idx}`}
                        className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
                      >
                        {!isEditing ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{r.staff_name}</div>
                              <div className="text-xs text-neutral-400">
                                {r.role || "-"} • {rangeText(r.start_hour, r.end_hour)}
                                {r.source ? ` • ${r.source}` : ""}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEditRow(r)}
                                disabled={loading}
                                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-60"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteRow(r)}
                                disabled={loading}
                                className="rounded-lg border border-rose-900 bg-rose-950/30 px-3 py-1 text-xs text-rose-200 hover:bg-rose-950/50 disabled:opacity-60"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-sm font-semibold text-amber-200">Editing</div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                              <input
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                                value={newStaffName}
                                onChange={(e) => setNewStaffName(e.target.value)}
                                placeholder="Staff name"
                              />
                              <input
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                                placeholder="Role"
                              />
                              <input
                                type="number"
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                                value={newStartHour}
                                onChange={(e) => setNewStartHour(e.target.value)}
                              />
                              <input
                                type="number"
                                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                                value={newEndHour}
                                onChange={(e) => setNewEndHour(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={saveRow}
                                  disabled={loading}
                                  className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={loading}
                                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            <div className="text-xs text-neutral-500">
                              {newWorkDate} • editing row
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {published ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold">Published week</div>
          <div className="mt-1 text-xs text-neutral-400">
            week_start: <span className="text-neutral-200">{published.week_start}</span> • count:{" "}
            <span className="text-neutral-200">{published.count}</span>
          </div>

          <div className="mt-4 space-y-4">
            {published.rows.length === 0 ? (
              <div className="text-sm text-neutral-500">No published rows yet.</div>
            ) : null}

            {Object.entries(
              published.rows.reduce<Record<string, typeof published.rows>>((acc, r) => {
                if (!acc[r.work_date]) acc[r.work_date] = [];
                acc[r.work_date].push(r);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, dayRows]) => (
                <div key={day} className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
                  <div className="mb-3 text-sm font-semibold">{day}</div>
                  <div className="space-y-2">
                    {dayRows.map((r, idx) => (
                      <div
                        key={`${day}-${r.staff_name}-${r.start_hour}-${r.end_hour}-${idx}`}
                        className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
                      >
                        <div className="text-sm font-medium">{r.staff_name}</div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {r.branch_code} • {r.role || "-"} • {rangeText(r.start_hour, r.end_hour)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}