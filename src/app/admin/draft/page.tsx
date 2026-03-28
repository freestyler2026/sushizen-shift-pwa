"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { BRANCHES, labelOf, type BranchCode } from "@/lib/branches";

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
    rows_generated?: number;
    forecast_orders_total?: number;
    required_staff_hours?: number;
    overtime_hours_added?: number;
    unresolved_hours?: number;
  }>;
  version_week_start: string;
  summary?: {
    generation_mode?: string;
    forecast_source_months?: string[];
    previous_month_source?: string;
    target_day_count?: number;
    total_overtime_hours?: number;
    total_required_staff_hours?: number;
    total_planned_staff_hours?: number;
    total_unresolved_hours?: number;
    demand_coverage_ratio?: number;
  };
};

type BatchDraftVersion = {
  branch_code: string;
  branch_name: string;
  version_id: string;
  version_week_start: string;
  rows_inserted: number;
  days_generated: number;
  summary?: DraftGenerateMonthResult["summary"];
};

type BatchGenerateResult = {
  ok: boolean;
  city: string;
  target_month: string;
  branches_generated: number;
  total_rows_inserted: number;
  total_overtime_hours: number;
  total_unresolved_hours: number;
  versions: BatchDraftVersion[];
  failed_branches: Array<{ branch_code: string; detail: string }>;
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

type ExportPrepareResult = {
  ok: boolean;
  confirm_token: string;
};

type ExportConfirmResult = {
  ok: boolean;
  warning?: string;
  sheet_url?: string;
  spreadsheet_id?: string;
  tab_main?: string;
  tab_headcount?: string;
  main_url?: string;
  headcount_url?: string;
  meta?: any;
};

type BatchApplyPrepareResult = {
  ok: boolean;
  items: Array<{
    branch_code: string;
    branch_name: string;
    week_start: string;
    confirm_token: string;
    preview: ApplyPrepareResult["preview"];
  }>;
  total_rows_count: number;
  total_staff_count: number;
};

type BatchApplyConfirmResult = {
  ok: boolean;
  items: Array<{
    branch_code: string;
    branch_name: string;
    week_start: string;
    published_version_id?: string;
    rows_copied?: number;
    warning?: string;
    export?: ApplyConfirmResult["export"];
  }>;
  total_rows_copied: number;
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
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type PendingSheetProposal = {
  id: string;
  city: string;
  branch_code: string;
  month_key: string;
  work_date: string;
  staff_name: string;
  start_hour: number;
  end_hour: number;
  proposed_staff_name: string;
  proposed_start_hour?: number | null;
  proposed_end_hour?: number | null;
  swap_with_staff?: string;
  note?: string;
  source_tab?: string;
  source_row_number?: number;
  proposed_by?: string;
  proposed_at?: string;
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

function nextMonthKey(base = new Date()) {
  return monthKey(new Date(base.getFullYear(), base.getMonth() + 1, 1));
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

function weekStartsForMonth(month: string) {
  const s = new Set<string>();
  for (const d of monthDates(month)) s.add(mondayOfDateString(d));
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function monthRangeLabel(month: string) {
  const dates = monthDates(month);
  if (!dates.length) return "";
  return `${dates[0]} -> ${dates[dates.length - 1]}`;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const city = "dubai";
  const draftBranches = useMemo(() => BRANCHES.dubai.map((b) => b.code as BranchCode), []);
  const targetMonth = useMemo(() => nextMonthKey(new Date()), []);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >("");

  const [prepared, setPrepared] = useState<null | {
    city: string;
    branch_codes: string[];
    target_month: string;
  }>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [versions, setVersions] = useState<BatchDraftVersion[]>([]);
  const [activeBranchCode, setActiveBranchCode] = useState<string>("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [generateResult, setGenerateResult] = useState<BatchGenerateResult | null>(null);

  const [newWorkDate, setNewWorkDate] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newStartHour, setNewStartHour] = useState("9");
  const [newEndHour, setNewEndHour] = useState("18");
  const [editingRow, setEditingRow] = useState<DraftRow | null>(null);

  const [applyMonth, setApplyMonth] = useState(targetMonth);
  const [applyPrepared, setApplyPrepared] = useState<BatchApplyPrepareResult | null>(null);
  const [applyResult, setApplyResult] = useState<BatchApplyConfirmResult | null>(null);
  const [published, setPublished] = useState<PublishedWeekResult | null>(null);
  const [pendingRows, setPendingRows] = useState<PendingSheetProposal[]>([]);
  const [pendingBranch, setPendingBranch] = useState<string>("ALL");
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [decisionNote, setDecisionNote] = useState("");
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [sheetSpreadsheetId, setSheetSpreadsheetId] = useState("");
  const [sheetTabMain, setSheetTabMain] = useState("");
  const [sheetRange, setSheetRange] = useState("A1:CL2000");
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [sheetTabsBusy, setSheetTabsBusy] = useState(false);

  const canOperate = myRole === "HQ" || myRole === "ADMIN";
  const targetMonthDates = useMemo(() => monthDates(targetMonth), [targetMonth]);
  const applyWeekStarts = useMemo(() => weekStartsForMonth(applyMonth), [applyMonth]);
  const version = useMemo(
    () => versions.find((item) => item.branch_code === activeBranchCode) || null,
    [versions, activeBranchCode]
  );

  const grouped = useMemo(() => {
    const m = new Map<string, DraftRow[]>();
    for (const r of sortRows(rows)) {
      const key = r.work_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);
  const pendingVisibleRows = useMemo(() => {
    if (pendingBranch === "ALL") return pendingRows;
    return pendingRows.filter((r) => (r.branch_code || "").toUpperCase() === pendingBranch);
  }, [pendingRows, pendingBranch]);
  const defaultSyncBranch = useMemo(() => {
    if (pendingBranch !== "ALL") return pendingBranch;
    if (activeBranchCode) return activeBranchCode;
    if (versions[0]?.branch_code) return versions[0].branch_code;
    return "";
  }, [pendingBranch, activeBranchCode, versions]);

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
    setPrepared(null);
    setVersions([]);
    setActiveBranchCode("");
    setRows([]);
    setGenerateResult(null);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyMonth(targetMonth);
    setError("");
  }, [targetMonth]);

  useEffect(() => {
    setApplyMonth(targetMonth);
  }, [targetMonth]);

  useEffect(() => {
    if (!versions.length) {
      setActiveBranchCode("");
      return;
    }
    if (!activeBranchCode || !versions.some((item) => item.branch_code === activeBranchCode)) {
      setActiveBranchCode(versions[0].branch_code);
    }
  }, [versions, activeBranchCode]);

  useEffect(() => {
    let mounted = true;

    async function loadDraftRows() {
      if (!version?.version_id) {
        setRows([]);
        return;
      }
      try {
        const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
          `/api/draft/rows${qs({ version_id: version.version_id })}`
        );
        const nextRows = sortRows(rr.rows || []);
        if (!mounted) return;
        setRows(nextRows);
        if (nextRows.length > 0) {
          setNewWorkDate(nextRows[0].work_date);
        } else if (targetMonthDates.length > 0) {
          setNewWorkDate(targetMonthDates[0]);
        }
      } catch {
        if (mounted) setRows([]);
      }
    }

    setEditingRow(null);
    loadDraftRows();
    return () => {
      mounted = false;
    };
  }, [version?.version_id, targetMonthDates]);

  useEffect(() => {
    let mounted = true;

    async function loadPublished() {
      if (!applyWeekStarts.length) {
        setPublished(null);
        return;
      }
      try {
        const pr = await apiGet<PublishedWeekResult>(
          `/api/published/week${qs({ city, week_start: applyWeekStarts[0] })}`
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
  }, [city, applyWeekStarts]);

  useEffect(() => {
    loadPendingProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperate, approverName, pin, applyMonth, pendingBranch]);

  useEffect(() => {
    if (sheetTabMain.trim()) return;
    const fromApply = (applyResult?.items || [])
      .map((x) => x.export?.tab_main || "")
      .find((x) => !!x);
    if (fromApply) setSheetTabMain(fromApply);
  }, [applyResult, sheetTabMain]);

  useEffect(() => {
    loadSheetTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperate, approverName, pin, city, applyMonth]);

  function prepareDraft() {
    setError("");
    setGenerateResult(null);
    setPrepared({
      city,
      branch_codes: draftBranches,
      target_month: targetMonth,
    });
    setConfirmChecked(false);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
  }

  async function confirmGenerate() {
    if (!prepared) return;
    setLoading(true);
    setError("");
    setGenerateResult(null);
    setVersions([]);
    setActiveBranchCode("");
    setRows([]);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyMonth(prepared.target_month);

    try {
      const nextVersions: BatchDraftVersion[] = [];
      const failedBranches: Array<{ branch_code: string; detail: string }> = [];
      let totalRowsInserted = 0;
      let totalOvertimeHours = 0;
      let totalUnresolvedHours = 0;

      for (const code of prepared.branch_codes) {
        try {
          const res = (await apiPost(`/api/draft/generate_month`, {
            city: prepared.city,
            branch_code: code,
            target_month: prepared.target_month,
            created_by: approverName || "AI",
          })) as DraftGenerateMonthResult;
          nextVersions.push({
            branch_code: res.branch_code,
            branch_name: labelOf("dubai", res.branch_code),
            version_id: res.version_id,
            version_week_start: res.version_week_start,
            rows_inserted: res.rows_inserted,
            days_generated: res.days_generated,
            summary: res.summary,
          });
          totalRowsInserted += Number(res.rows_inserted || 0);
          totalOvertimeHours += Number(res.summary?.total_overtime_hours || 0);
          totalUnresolvedHours += Number(res.summary?.total_unresolved_hours || 0);
        } catch (branchError: any) {
          failedBranches.push({
            branch_code: code,
            detail: String(branchError?.message || branchError || "Failed"),
          });
        }
      }

      if (!nextVersions.length) {
        throw new Error("Failed to generate monthly drafts for Dubai branches.");
      }

      setVersions(nextVersions);
      setActiveBranchCode(nextVersions[0]?.branch_code || "");
      setGenerateResult({
        ok: failedBranches.length === 0,
        city: prepared.city,
        target_month: prepared.target_month,
        branches_generated: nextVersions.length,
        total_rows_inserted: totalRowsInserted,
        total_overtime_hours: totalOvertimeHours,
        total_unresolved_hours: totalUnresolvedHours,
        versions: nextVersions,
        failed_branches: failedBranches,
      });
      setApplyMonth(prepared.target_month);
      if (failedBranches.length) {
        setError(
          failedBranches
            .map((item) => `${item.branch_code}: ${item.detail}`)
            .join("\n")
        );
      }
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
    if (!version?.version_id) return;
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
          version_id: version.version_id,
          ...nextRow,
        });
      }

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
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
    if (!version?.version_id) return;
    setLoading(true);
    setError("");

    try {
      await apiPost(`/api/draft/rows/delete_by_id`, {
        row_id: r.id,
      });

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
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

  async function buildApplyPrepared(): Promise<BatchApplyPrepareResult> {
    if (!versions.length) {
      throw new Error("No generated drafts found.");
    }
    if (!applyMonth) {
      throw new Error("Select a month to publish first.");
    }
    if (!applyWeekStarts.length) {
      throw new Error("No publishable weeks found for the selected month.");
    }

    const items: BatchApplyPrepareResult["items"] = [];
    let totalRowsCount = 0;
    let totalStaffCount = 0;
    for (const item of versions) {
      for (const weekStart of applyWeekStarts) {
        const res = await apiPost<ApplyPrepareResult>(`/api/draft/apply/prepare`, {
          city,
          branch_code: item.branch_code,
          week_start: weekStart,
          draft_version_id: item.version_id,
          approver_name: approverName,
          pin,
        });
        items.push({
          branch_code: item.branch_code,
          branch_name: item.branch_name,
          week_start: weekStart,
          confirm_token: res.confirm_token,
          preview: res.preview,
        });
        totalRowsCount += Number(res.preview?.rows_count || 0);
        totalStaffCount += Number(res.preview?.staff_count || 0);
      }
    }
    return {
      ok: true,
      items,
      total_rows_count: totalRowsCount,
      total_staff_count: totalStaffCount,
    };
  }

  async function prepareApply() {
    setLoading(true);
    setError("");
    setApplyPrepared(null);
    setApplyResult(null);

    try {
      const prepared = await buildApplyPrepared();
      setApplyPrepared(prepared);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to prepare apply"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmApply() {
    setLoading(true);
    setError("");
    setApplyResult(null);

    try {
      const prepared = applyPrepared?.items?.length ? applyPrepared : await buildApplyPrepared();
      setApplyPrepared(prepared);
      const confirmedItems: BatchApplyConfirmResult["items"] = [];
      let totalRowsCopied = 0;
      for (const item of prepared.items) {
        const res = await apiPost<ApplyConfirmResult>(`/api/draft/apply/confirm`, {
          confirm_token: item.confirm_token,
          approver_name: approverName,
          pin,
          auto_export: false,
          export_month: applyMonth,
        });
        confirmedItems.push({
          branch_code: item.branch_code,
          branch_name: item.branch_name,
          week_start: item.week_start,
          published_version_id: res.published_version_id,
          rows_copied: res.rows_copied,
          warning: res.warning,
        });
        totalRowsCopied += Number(res.rows_copied || 0);
      }

      // Export once per branch/month to avoid Google Sheets write quota spikes.
      const exportByBranch: Record<string, ApplyConfirmResult["export"]> = {};
      const exportWarningByBranch: Record<string, string> = {};
      const uniqueBranches = Array.from(
        new Map(confirmedItems.map((x) => [x.branch_code, { code: x.branch_code, name: x.branch_name }])).values()
      );
      for (const branch of uniqueBranches) {
        try {
          const prep = await apiPost<ExportPrepareResult>(`/api/admin/export/month/prepare`, {
            city,
            branch_code: branch.code,
            month: applyMonth,
            mode: "FINAL",
            approver_name: approverName,
            pin,
          });
          const confirm = await apiPost<ExportConfirmResult>(`/api/admin/export/month/confirm`, {
            confirm_token: prep.confirm_token,
            approver_name: approverName,
            pin,
          });
          exportByBranch[branch.code] = {
            ok: confirm.ok,
            sheet_url: confirm.sheet_url,
            spreadsheet_id: confirm.spreadsheet_id,
            tab_main: confirm.tab_main,
            tab_headcount: confirm.tab_headcount,
            main_url: confirm.main_url,
            headcount_url: confirm.headcount_url,
            meta: confirm.meta,
          };
          if (confirm.warning) {
            exportWarningByBranch[branch.code] = String(confirm.warning);
          }
          await sleep(300);
        } catch (e: any) {
          exportWarningByBranch[branch.code] = String(e?.message || e || "Export failed");
        }
      }

      const items = confirmedItems.map((item) => ({
        ...item,
        export: exportByBranch[item.branch_code],
        warning: item.warning || exportWarningByBranch[item.branch_code],
      }));
      setApplyResult({
        ok: true,
        items,
        total_rows_copied: totalRowsCopied,
      });

      const pr = await apiGet<PublishedWeekResult>(
        `/api/published/week${qs({ city, week_start: applyWeekStarts[0] })}`
      );
      setPublished(pr);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to confirm apply"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingProposals() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) {
      setPendingRows([]);
      setSelectedProposalIds([]);
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const branchParam = pendingBranch === "ALL" ? "" : pendingBranch;
      const resp = await apiGet<{ ok: boolean; count: number; items: PendingSheetProposal[] }>(
        `/api/draft/sheet/proposals${qs({
          city,
          branch_code: branchParam,
          month_key: applyMonth,
          status: "PENDING_HQ",
          approver_name: approverName,
          pin,
          limit: 500,
        })}`
      );
      const items = Array.isArray(resp?.items) ? resp.items : [];
      setPendingRows(items);
      setSelectedProposalIds((prev) => prev.filter((id) => items.some((r) => r.id === id)));
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Failed to load pending proposals"));
    } finally {
      setPendingBusy(false);
    }
  }

  function toggleSelectProposal(id: string, checked: boolean) {
    setSelectedProposalIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    if (!checked) {
      setSelectedProposalIds((prev) => prev.filter((id) => !pendingVisibleRows.some((r) => r.id === id)));
      return;
    }
    setSelectedProposalIds((prev) => {
      const s = new Set(prev);
      for (const r of pendingVisibleRows) s.add(r.id);
      return Array.from(s);
    });
  }

  async function runBulkDecision(decision: "APPROVE" | "REJECT") {
    if (!selectedProposalIds.length) {
      setPendingMessage("Select at least one pending row.");
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const res = await apiPost<{ ok: boolean; updated: number; decision: string; draft_rows_applied: number }>(
        `/api/draft/sheet/decide`,
        {
          proposal_ids: selectedProposalIds,
          decision,
          approver_name: approverName,
          pin,
          note: decisionNote,
        }
      );
      setPendingMessage(
        `${res.decision}: updated ${res.updated} rows` +
          (decision === "APPROVE" ? `, draft applied ${res.draft_rows_applied}` : "")
      );
      setSelectedProposalIds([]);
      await loadPendingProposals();
      if (version?.version_id) {
        const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
          `/api/draft/rows${qs({ version_id: version.version_id })}`
        );
        setRows(sortRows(rr.rows || []));
      }
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Decision failed"));
    } finally {
      setPendingBusy(false);
    }
  }

  async function proposeFromSheet() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) {
      setPendingMessage("Approver and PIN are required.");
      return;
    }
    if (!applyMonth) {
      setPendingMessage("Select month first.");
      return;
    }
    if (!defaultSyncBranch) {
      setPendingMessage("Select branch first.");
      return;
    }
    if (!sheetTabMain.trim()) {
      setPendingMessage("MAIN tab name is required.");
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const res = await apiPost<{ ok: boolean; inserted: number; warnings?: string[] }>(`/api/draft/sheet/propose_sync`, {
        city,
        branch_code: defaultSyncBranch,
        month_key: applyMonth,
        spreadsheet_id: sheetSpreadsheetId.trim(),
        tab_main: sheetTabMain.trim(),
        a1_range: sheetRange.trim() || "A1:CL2000",
        draft_version_id: version?.version_id || "",
        approver_name: approverName,
        pin,
      });
      const w = (res.warnings || []).join(" / ");
      setPendingMessage(`Proposed ${res.inserted} rows.${w ? ` Warnings: ${w}` : ""}`);
      await loadPendingProposals();
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Sync propose failed"));
    } finally {
      setPendingBusy(false);
    }
  }

  async function loadSheetTabs() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) return;
    setSheetTabsBusy(true);
    try {
      const resp = await apiGet<{ ok: boolean; tabs: string[] }>(
        `/admin/sheet_tabs${qs({ city })}`
      );
      const all = Array.isArray(resp?.tabs) ? resp.tabs : [];
      const mains = all.filter((t) => /_MAIN$/i.test(t));
      setSheetTabs(mains.length ? mains : all);
      if (!sheetTabMain) {
        const candidate = mains.find((t) => t.includes(applyMonth)) || mains[0];
        if (candidate) setSheetTabMain(candidate);
      }
    } catch {
      setSheetTabs([]);
    } finally {
      setSheetTabsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div className="text-lg font-semibold">Admin • Draft Generator / Edit / Apply</div>
        <div className="mt-1 text-sm text-neutral-400">
          Generate next month draft for all Dubai stores at once, edit by branch, then publish week by week.
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
            <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              Dubai
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Scope</div>
            <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              All Dubai stores
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Target month</div>
            <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              {targetMonth}
            </div>
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

        <div className="mt-4 rounded-2xl border border-sky-900/40 bg-sky-950/20 px-4 py-3 text-xs leading-6 text-sky-100">
          Forecast-based generation uses previous-month Bayzat shifts as the team pattern and hourly sales history as the
          demand signal. Branch members stay fixed, usual day-off patterns are preserved when possible, and shortages are
          handled with limited overtime first.
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
            Prepared: <span className="text-neutral-200">All Dubai stores</span> • {prepared.target_month}
          </div>
        ) : null}

        {error ? <div className="mt-3 whitespace-pre-wrap text-sm text-red-300">{error}</div> : null}
      </div>

      {generateResult ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold">Generate result</div>
          <div className="mt-2 space-y-1 text-xs text-neutral-400">
            <div>target_month: <span className="text-neutral-200">{generateResult.target_month}</span></div>
            <div>branches_generated: <span className="text-neutral-200">{generateResult.branches_generated}</span></div>
            <div>rows_inserted: <span className="text-neutral-200">{generateResult.total_rows_inserted}</span></div>
            <div>total_overtime_hours: <span className="text-neutral-200">{generateResult.total_overtime_hours}</span></div>
            <div>total_unresolved_hours: <span className="text-neutral-200">{generateResult.total_unresolved_hours}</span></div>
            {generateResult.failed_branches.length ? (
              <div className="text-amber-300">
                failed_branches: {generateResult.failed_branches.map((item) => item.branch_code).join(", ")}
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {generateResult.versions.map((item) => (
              <div key={item.branch_code} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 text-xs text-neutral-400">
                <div className="text-sm font-semibold text-neutral-100">{item.branch_name}</div>
                <div className="mt-2 space-y-1">
                  <div>version_id: <span className="text-neutral-200">{item.version_id}</span></div>
                  <div>rows_inserted: <span className="text-neutral-200">{item.rows_inserted}</span></div>
                  <div>days_generated: <span className="text-neutral-200">{item.days_generated}</span></div>
                  {typeof item.summary?.demand_coverage_ratio === "number" ? (
                    <div>
                      demand_coverage:{" "}
                      <span className="text-neutral-200">{(item.summary.demand_coverage_ratio * 100).toFixed(1)}%</span>
                    </div>
                  ) : null}
                  {typeof item.summary?.total_overtime_hours === "number" ? (
                    <div>overtime_hours: <span className="text-neutral-200">{item.summary.total_overtime_hours}</span></div>
                  ) : null}
                  {typeof item.summary?.total_unresolved_hours === "number" ? (
                    <div>unresolved_hours: <span className="text-neutral-200">{item.summary.total_unresolved_hours}</span></div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {canOperate ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Pending sheet proposals</div>
              <div className="mt-1 text-xs text-neutral-400">
                Manager edits from spreadsheet are queued here until HQ/Admin bulk decision.
              </div>
            </div>
            <button
              type="button"
              onClick={loadPendingProposals}
              disabled={pendingBusy}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              Refresh Pending
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Month</div>
              <input
                type="month"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={applyMonth}
                onChange={(e) => setApplyMonth(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-400">Branch filter</div>
              <select
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={pendingBranch}
                onChange={(e) => setPendingBranch(e.target.value)}
              >
                <option value="ALL">All branches</option>
                {versions.map((v) => (
                  <option key={v.branch_code} value={v.branch_code}>
                    {v.branch_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 text-xs text-neutral-400">Decision note (optional)</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Reason for approve/reject"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Spreadsheet ID (optional)</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={sheetSpreadsheetId}
                onChange={(e) => setSheetSpreadsheetId(e.target.value)}
                placeholder="blank = use city export sheet env"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                <span>MAIN tab name</span>
                <button
                  type="button"
                  onClick={loadSheetTabs}
                  disabled={sheetTabsBusy}
                  className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-neutral-900 disabled:opacity-60"
                >
                  {sheetTabsBusy ? "..." : "reload"}
                </button>
              </div>
              <select
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={sheetTabMain}
                onChange={(e) => setSheetTabMain(e.target.value)}
              >
                <option value="">Select MAIN tab</option>
                {sheetTabs.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {!sheetTabs.length ? (
                <input
                  className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  value={sheetTabMain}
                  onChange={(e) => setSheetTabMain(e.target.value)}
                  placeholder="fallback: type MAIN tab manually"
                />
              ) : null}
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-400">A1 range</div>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={sheetRange}
                onChange={(e) => setSheetRange(e.target.value)}
                placeholder="A1:CL2000"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={proposeFromSheet}
                disabled={pendingBusy || !defaultSyncBranch}
                className="w-full rounded-xl border border-sky-900 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-950/50 disabled:opacity-60"
              >
                Sync Proposals From Sheet
              </button>
            </div>
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">
            sync branch: <span className="text-neutral-300">{defaultSyncBranch || "-"}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runBulkDecision("APPROVE")}
              disabled={pendingBusy || selectedProposalIds.length === 0}
              className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
            >
              Approve Selected
            </button>
            <button
              type="button"
              onClick={() => runBulkDecision("REJECT")}
              disabled={pendingBusy || selectedProposalIds.length === 0}
              className="rounded-xl border border-rose-900 bg-rose-950/30 px-4 py-2 text-sm text-rose-200 hover:bg-rose-950/50 disabled:opacity-60"
            >
              Reject Selected
            </button>
            <div className="text-xs text-neutral-400">
              selected: <span className="text-neutral-200">{selectedProposalIds.length}</span> /{" "}
              <span className="text-neutral-200">{pendingVisibleRows.length}</span>
            </div>
          </div>

          {pendingMessage ? <div className="mt-2 text-xs text-amber-300">{pendingMessage}</div> : null}

          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-xs">
              <thead className="bg-neutral-950/70 text-neutral-300">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={
                        pendingVisibleRows.length > 0 &&
                        pendingVisibleRows.every((r) => selectedProposalIds.includes(r.id))
                      }
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    />
                  </th>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Branch</th>
                  <th className="px-2 py-2 text-left">Before</th>
                  <th className="px-2 py-2 text-left">After</th>
                  <th className="px-2 py-2 text-left">Swap</th>
                  <th className="px-2 py-2 text-left">Note</th>
                  <th className="px-2 py-2 text-left">By</th>
                </tr>
              </thead>
              <tbody>
                {!pendingVisibleRows.length ? (
                  <tr>
                    <td className="px-2 py-3 text-neutral-500" colSpan={8}>
                      {pendingBusy ? "Loading..." : "No pending proposals."}
                    </td>
                  </tr>
                ) : (
                  pendingVisibleRows.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-800 bg-neutral-950/20 text-neutral-300">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedProposalIds.includes(r.id)}
                          onChange={(e) => toggleSelectProposal(r.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-2 py-2">{r.work_date}</td>
                      <td className="px-2 py-2">{labelOf("dubai", r.branch_code as BranchCode) || r.branch_code}</td>
                      <td className="px-2 py-2">
                        {r.staff_name} {rangeText(Number(r.start_hour || 0), Number(r.end_hour || 0))}
                      </td>
                      <td
                        className={[
                          "px-2 py-2",
                          r.staff_name !== (r.proposed_staff_name || r.staff_name) ||
                          Number(r.start_hour || 0) !== Number(r.proposed_start_hour ?? r.start_hour ?? 0) ||
                          Number(r.end_hour || 0) !== Number(r.proposed_end_hour ?? r.end_hour ?? 0)
                            ? "text-emerald-300"
                            : "",
                        ].join(" ")}
                      >
                        {(r.proposed_staff_name || r.staff_name) + " "}
                        {rangeText(
                          Number(r.proposed_start_hour ?? r.start_hour ?? 0),
                          Number(r.proposed_end_hour ?? r.end_hour ?? 0)
                        )}
                      </td>
                      <td className="px-2 py-2">{r.swap_with_staff || "-"}</td>
                      <td className="px-2 py-2">{r.note || "-"}</td>
                      <td className="px-2 py-2">
                        <div>{r.proposed_by || "-"}</div>
                        <div className="text-[10px] text-neutral-500">
                          {(r.source_tab || "-")}#{r.source_row_number || 0}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {versions.length ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold">Apply draft to published</div>
          <div className="mt-1 text-xs text-neutral-400">
            Select a month to publish. All weeks included in that month are applied for all generated Dubai branches.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Month to publish</div>
              <input
                type="month"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={applyMonth}
                onChange={(e) => setApplyMonth(e.target.value)}
              />
              {monthRangeLabel(applyMonth) ? (
                <div className="mt-2 text-xs text-neutral-500">
                  Export range: {monthRangeLabel(applyMonth)}
                </div>
              ) : null}
              {applyWeekStarts.length ? (
                <div className="mt-2 text-xs text-neutral-500">
                  Weeks included: {applyWeekStarts.join(", ")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={prepareApply}
              disabled={loading || !canOperate || !approverName.trim() || !pin.trim() || !applyMonth || !applyWeekStarts.length}
              className="rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/50 disabled:opacity-60"
            >
              Prepare Apply
            </button>

            <button
              type="button"
              onClick={confirmApply}
              disabled={loading}
              className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-950/50 disabled:opacity-60"
            >
              Confirm Apply
            </button>
          </div>

          {applyPrepared?.ok ? (
            <div className="mt-3 space-y-1 text-xs text-neutral-400">
              <div>
                jobs_ready: <span className="text-neutral-200">{applyPrepared.items.length}</span>
              </div>
              <div>
                preview: {applyPrepared.total_rows_count} rows / {applyPrepared.total_staff_count} staff
              </div>
            </div>
          ) : null}

          {applyResult?.ok ? (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="text-sm font-semibold">Apply result</div>
              <div className="mt-2 space-y-1 text-xs text-neutral-400">
                <div>
                  jobs_applied: <span className="text-neutral-200">{applyResult.items.length}</span>
                </div>
                <div>rows_copied: <span className="text-neutral-200">{applyResult.total_rows_copied}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {applyResult.items.map((item) => (
                  <div key={`${item.branch_code}-${item.week_start}`} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3 text-xs text-neutral-400">
                    <div className="text-sm font-semibold text-neutral-100">{item.branch_name}</div>
                    <div className="mt-2 space-y-1">
                      <div>week_start: <span className="text-neutral-200">{item.week_start}</span></div>
                      <div>published_version_id: <span className="text-neutral-200">{item.published_version_id || "-"}</span></div>
                      <div>rows_copied: <span className="text-neutral-200">{String(item.rows_copied ?? "-")}</span></div>
                      {item.warning ? <div className="text-amber-300">{item.warning}</div> : null}
                      {item.export?.main_url ? (
                        <div>
                          Main:{" "}
                          <a className="underline hover:text-white" href={item.export.main_url} target="_blank" rel="noreferrer">
                            open
                          </a>
                        </div>
                      ) : null}
                      {item.export?.headcount_url ? (
                        <div>
                          Headcount:{" "}
                          <a className="underline hover:text-white" href={item.export.headcount_url} target="_blank" rel="noreferrer">
                            open
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {versions.length ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Draft rows</div>
              <div className="mt-1 text-xs text-neutral-400">
                branch: <span className="text-neutral-200">{version?.branch_name || "-"}</span> • version_id:{" "}
                <span className="text-neutral-200">{version?.version_id || "-"}</span> • rows:{" "}
                <span className="text-neutral-200">{rows.length}</span> • staff:{" "}
                <span className="text-neutral-200">{uniqueStaffCount(rows)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {versions.map((item) => (
              <button
                key={item.branch_code}
                type="button"
                onClick={() => setActiveBranchCode(item.branch_code)}
                className={[
                  "rounded-xl border px-3 py-2 text-sm transition",
                  activeBranchCode === item.branch_code
                    ? "border-amber-500 bg-amber-950/25 text-amber-200"
                    : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40 hover:text-white",
                ].join(" ")}
              >
                {item.branch_name}
              </button>
            ))}
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
              disabled={loading || !version?.version_id || !norm(newWorkDate) || !norm(newStaffName)}
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