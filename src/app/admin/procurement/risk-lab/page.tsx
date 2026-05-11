"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, hasPermission, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";

type CaseRow = {
  id: string;
  parent_case_no: string;
  request_no: string;
  severity: string;
  status: string;
  current_assignee_role: string;
  payment_status: string;
  payment_hold_reason: string;
  risk_score?: number;
};

type ExceptionRow = {
  id: string;
  case_id: string;
  request_id: string;
  request_no: string;
  rule_code: string;
  severity: string;
  score: number;
  status: string;
  requested_by: string;
};

type KpiRow = {
  id: string;
  month_key: string;
  owner_name: string;
  on_time_rate: number;
  price_deviation_avg: number;
  exception_count: number;
  urgent_ratio: number;
  approval_cycle_hours_avg: number;
  score_total: number;
  grade: string;
};

type ImprovementRow = {
  id: string;
  month_key: string;
  owner_name: string;
  issue_title: string;
  action_plan: string;
  due_date: string;
  status: string;
  result_note: string;
  updated_by: string;
  updated_at: string;
};

type RiskThresholdSettings = {
  exceptionHighCount: number;
  exceptionMediumCount: number;
  priceDevHigh: number;
  priceDevMedium: number;
  urgentRatioHigh: number;
  urgentRatioMedium: number;
  onTimeLow: number;
  onTimeWarn: number;
  cycleHoursHigh: number;
  cycleHoursMedium: number;
  behaviorHighRiskPoint: number;
  behaviorMediumRiskPoint: number;
  caseRiskScoreCritical: number;
  exceptionRiskScoreCritical: number;
};

type RiskLabAuditRow = {
  id: number;
  actor_name: string;
  actor_role: string;
  action_key: string;
  created_at: string;
  reason_code: string;
  before_json?: {
    config_key?: string;
    settings?: Partial<RiskThresholdSettings>;
  };
  after_json?: {
    config_key?: string;
    settings?: Partial<RiskThresholdSettings>;
    changed_keys?: string[];
    reason_detail?: string;
  };
};

type RiskLabConfigRow = {
  config_key: string;
  value_json?: Partial<RiskThresholdSettings>;
  updated_by?: string;
  updated_at?: string;
};

type ThresholdConflictState = {
  message: string;
  serverSettings: RiskThresholdSettings;
  serverUpdatedAt: string;
  serverUpdatedBy: string;
  localSettings: RiskThresholdSettings;
};

const RISK_THRESHOLD_DEFAULTS: RiskThresholdSettings = {
  exceptionHighCount: 5,
  exceptionMediumCount: 2,
  priceDevHigh: 8,
  priceDevMedium: 3,
  urgentRatioHigh: 30,
  urgentRatioMedium: 15,
  onTimeLow: 70,
  onTimeWarn: 85,
  cycleHoursHigh: 24,
  cycleHoursMedium: 8,
  behaviorHighRiskPoint: 70,
  behaviorMediumRiskPoint: 40,
  caseRiskScoreCritical: 80,
  exceptionRiskScoreCritical: 80,
};

const RISK_THRESHOLD_KEYS = Object.keys(RISK_THRESHOLD_DEFAULTS) as (keyof RiskThresholdSettings)[];

const RISK_THRESHOLD_LABELS: Record<keyof RiskThresholdSettings, string> = {
  exceptionHighCount: "Exception high count",
  exceptionMediumCount: "Exception medium count",
  priceDevHigh: "Price deviation high %",
  priceDevMedium: "Price deviation medium %",
  urgentRatioHigh: "Urgent high %",
  urgentRatioMedium: "Urgent medium %",
  onTimeLow: "On-time low %",
  onTimeWarn: "On-time warn %",
  cycleHoursHigh: "Cycle high hours",
  cycleHoursMedium: "Cycle medium hours",
  behaviorHighRiskPoint: "Behavior high points",
  behaviorMediumRiskPoint: "Behavior medium points",
  caseRiskScoreCritical: "Case critical score",
  exceptionRiskScoreCritical: "Exception critical score",
};

const RISK_REASON_OPTIONS = [
  { code: "THRESHOLD_TUNING", label: "Threshold tuning", description: "Regular calibration of alert sensitivity based on recent operational trends." },
  { code: "POLICY_UPDATE", label: "Policy update", description: "Thresholds changed to align with newly approved internal procurement policy." },
  { code: "INCIDENT_RESPONSE", label: "Incident response", description: "Emergency or short-term adjustment made while handling a live incident." },
  { code: "AUDIT_FINDING", label: "Audit finding", description: "Change applied to address an internal or external audit recommendation." },
  { code: "REGULATORY_CHANGE", label: "Regulatory change", description: "Update required to comply with new law, regulation, or compliance guideline." },
  { code: "FRAUD_PATTERN_OBSERVED", label: "Fraud pattern observed", description: "New suspicious pattern detected, requiring tighter fraud controls." },
  { code: "FALSE_POSITIVE_REDUCTION", label: "Reduce false positives", description: "Adjustment to decrease unnecessary alerts and review workload." },
  { code: "FALSE_NEGATIVE_REDUCTION", label: "Reduce false negatives", description: "Adjustment to catch more risky cases that were previously missed." },
  { code: "SEASONAL_ADJUSTMENT", label: "Seasonal adjustment", description: "Temporary or cyclical tuning for demand spikes, holidays, or promotions." },
  { code: "SUPPLIER_MARKET_CHANGE", label: "Supplier/market change", description: "Updated due to vendor pricing, lead-time, or market volatility changes." },
  { code: "PROCESS_CHANGE", label: "Process change", description: "Workflow or approval process changed, requiring threshold realignment." },
  { code: "TEAM_CALIBRATION", label: "Team calibration", description: "Cross-team agreement to standardize review strictness and scoring interpretation." },
  { code: "POST_MORTEM_ACTION", label: "Post-mortem action", description: "Follow-up action from incident post-mortem or lessons-learned review." },
  { code: "SYSTEM_BEHAVIOR_CHANGE", label: "System behavior change", description: "New app/API behavior affected signal quality and required re-tuning." },
  { code: "DATA_QUALITY_CORRECTION", label: "Data quality correction", description: "Thresholds adjusted after correcting data quality or mapping issues." },
  { code: "OTHER", label: "Other (specify detail)", description: "Use when no standard reason fits; detail is required for reporting clarity." },
] as const;

function mergeThresholdSettings(raw: Partial<RiskThresholdSettings> | null | undefined): RiskThresholdSettings {
  const src = raw || {};
  return {
    exceptionHighCount: Number.isFinite(Number(src.exceptionHighCount)) ? Number(src.exceptionHighCount) : RISK_THRESHOLD_DEFAULTS.exceptionHighCount,
    exceptionMediumCount: Number.isFinite(Number(src.exceptionMediumCount)) ? Number(src.exceptionMediumCount) : RISK_THRESHOLD_DEFAULTS.exceptionMediumCount,
    priceDevHigh: Number.isFinite(Number(src.priceDevHigh)) ? Number(src.priceDevHigh) : RISK_THRESHOLD_DEFAULTS.priceDevHigh,
    priceDevMedium: Number.isFinite(Number(src.priceDevMedium)) ? Number(src.priceDevMedium) : RISK_THRESHOLD_DEFAULTS.priceDevMedium,
    urgentRatioHigh: Number.isFinite(Number(src.urgentRatioHigh)) ? Number(src.urgentRatioHigh) : RISK_THRESHOLD_DEFAULTS.urgentRatioHigh,
    urgentRatioMedium: Number.isFinite(Number(src.urgentRatioMedium)) ? Number(src.urgentRatioMedium) : RISK_THRESHOLD_DEFAULTS.urgentRatioMedium,
    onTimeLow: Number.isFinite(Number(src.onTimeLow)) ? Number(src.onTimeLow) : RISK_THRESHOLD_DEFAULTS.onTimeLow,
    onTimeWarn: Number.isFinite(Number(src.onTimeWarn)) ? Number(src.onTimeWarn) : RISK_THRESHOLD_DEFAULTS.onTimeWarn,
    cycleHoursHigh: Number.isFinite(Number(src.cycleHoursHigh)) ? Number(src.cycleHoursHigh) : RISK_THRESHOLD_DEFAULTS.cycleHoursHigh,
    cycleHoursMedium: Number.isFinite(Number(src.cycleHoursMedium)) ? Number(src.cycleHoursMedium) : RISK_THRESHOLD_DEFAULTS.cycleHoursMedium,
    behaviorHighRiskPoint: Number.isFinite(Number(src.behaviorHighRiskPoint)) ? Number(src.behaviorHighRiskPoint) : RISK_THRESHOLD_DEFAULTS.behaviorHighRiskPoint,
    behaviorMediumRiskPoint: Number.isFinite(Number(src.behaviorMediumRiskPoint)) ? Number(src.behaviorMediumRiskPoint) : RISK_THRESHOLD_DEFAULTS.behaviorMediumRiskPoint,
    caseRiskScoreCritical: Number.isFinite(Number(src.caseRiskScoreCritical)) ? Number(src.caseRiskScoreCritical) : RISK_THRESHOLD_DEFAULTS.caseRiskScoreCritical,
    exceptionRiskScoreCritical: Number.isFinite(Number(src.exceptionRiskScoreCritical)) ? Number(src.exceptionRiskScoreCritical) : RISK_THRESHOLD_DEFAULTS.exceptionRiskScoreCritical,
  };
}

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizePercent(raw: number): number {
  const n = Number(raw || 0);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function normalizeAuditThresholdNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function extractMonthKey(isoLike: string): string {
  const raw = String(isoLike || "").trim();
  if (!raw) return "";
  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return raw.slice(0, 7);
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function parseProcurementApiError(rawMessage: string): { message: string; detailObject: Record<string, unknown> | null } {
  const raw = String(rawMessage || "").trim();
  if (!raw) return { message: "Unknown error", detailObject: null };
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return { message: detail.trim(), detailObject: null };
    }
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const detailObject = detail as Record<string, unknown>;
      const msg = String(detailObject.message || "").trim();
      return { message: msg || raw, detailObject };
    }
    return { message: raw, detailObject: null };
  } catch {
    return { message: raw, detailObject: null };
  }
}

function diffThresholdSettings(
  beforeRaw: Partial<RiskThresholdSettings> | null | undefined,
  afterRaw: Partial<RiskThresholdSettings> | null | undefined,
) {
  const before = beforeRaw || {};
  const after = afterRaw || {};
  const changed: Array<{ key: keyof RiskThresholdSettings; beforeValue: number | null; afterValue: number | null }> = [];
  for (const key of RISK_THRESHOLD_KEYS) {
    const beforeValue = normalizeAuditThresholdNumber(before[key]);
    const afterValue = normalizeAuditThresholdNumber(after[key]);
    if (beforeValue !== afterValue) {
      changed.push({ key, beforeValue, afterValue });
    }
  }
  return changed;
}

export default function ProcurementRiskLabPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [canWriteSharedConfig, setCanWriteSharedConfig] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [monthKey, setMonthKey] = useState(monthNow());
  const [ownerFilter, setOwnerFilter] = useState("");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [kpiRows, setKpiRows] = useState<KpiRow[]>([]);
  const [improvementRows, setImprovementRows] = useState<ImprovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedImprovementId, setSelectedImprovementId] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [status, setStatus] = useState("OPEN");
  const [resultNote, setResultNote] = useState("");
  const [ownerName, setOwnerName] = useState(defaultProcurementName());
  const [thresholds, setThresholds] = useState<RiskThresholdSettings>(RISK_THRESHOLD_DEFAULTS);
  const [sharedThresholds, setSharedThresholds] = useState<RiskThresholdSettings>(RISK_THRESHOLD_DEFAULTS);
  const [thresholdReasonCode, setThresholdReasonCode] = useState("THRESHOLD_TUNING");
  const [thresholdReasonDetail, setThresholdReasonDetail] = useState("");
  const [thresholdUpdatedBy, setThresholdUpdatedBy] = useState("");
  const [thresholdUpdatedAt, setThresholdUpdatedAt] = useState("");
  const [thresholdConflict, setThresholdConflict] = useState<ThresholdConflictState | null>(null);
  const [riskLabAuditRows, setRiskLabAuditRows] = useState<RiskLabAuditRow[]>([]);
  const [historyReasonFilter, setHistoryReasonFilter] = useState("ALL");
  const [historyMonthFilter, setHistoryMonthFilter] = useState(monthNow());
  const [historyChangedKeyFilter, setHistoryChangedKeyFilter] = useState<string>("ALL");

  const effectiveOwnerFilter = useMemo(() => String(ownerFilter || "").trim(), [ownerFilter]);

  const loadRiskLabAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await procurementJson<{ rows?: RiskLabAuditRow[] }>(
        "/api/admin/procurement/audit-logs?limit=200",
        { method: "GET" },
        requestedBy,
        pin,
      );
      const allRows = Array.isArray(data?.rows) ? data.rows : [];
      const filtered = allRows
        .filter((row) => String(row?.action_key || "").trim().toLowerCase() === "procurement.config.risk_lab.upsert")
        .slice(0, 40);
      setRiskLabAuditRows(filtered);
    } catch {
      setRiskLabAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, [pin, requestedBy]);

  const load = useCallback(async () => {
    if (!monthKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      const qsKpi = new URLSearchParams({ month_key: monthKey.trim(), owner_name: effectiveOwnerFilter, limit: "500" });
      const qsImp = new URLSearchParams({ month_key: monthKey.trim(), owner_name: effectiveOwnerFilter, limit: "500" });
      const [caseRes, exRes, kpiRes, impRes, cfgRes] = await Promise.all([
        procurementJson<{ rows: CaseRow[] }>(
          "/api/admin/procurement/cases?status=&limit=300",
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: ExceptionRow[] }>(
          `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&status=OPEN&limit=500`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: KpiRow[] }>(
          `/api/admin/procurement/kpi/staff?${qsKpi.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: ImprovementRow[] }>(
          `/api/admin/procurement/improvements?${qsImp.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ settings?: Partial<RiskThresholdSettings>; rows?: RiskLabConfigRow[] }>(
          "/api/admin/procurement/config/risk-lab",
          { method: "GET" },
          requestedBy,
          pin,
        ),
      ]);
      setCases(Array.isArray(caseRes?.rows) ? caseRes.rows : []);
      setExceptions(Array.isArray(exRes?.rows) ? exRes.rows : []);
      setKpiRows(Array.isArray(kpiRes?.rows) ? kpiRes.rows : []);
      setImprovementRows(Array.isArray(impRes?.rows) ? impRes.rows : []);
      const mergedThresholds = mergeThresholdSettings(cfgRes?.settings);
      setThresholds(mergedThresholds);
      setSharedThresholds(mergedThresholds);
      const cfgRows = Array.isArray(cfgRes?.rows) ? cfgRes.rows : [];
      const thresholdRow = cfgRows.find((row) => String(row?.config_key || "").trim().toLowerCase() === "risk_thresholds");
      setThresholdUpdatedBy(String(thresholdRow?.updated_by || "").trim());
      setThresholdUpdatedAt(String(thresholdRow?.updated_at || "").trim());
      setThresholdConflict(null);
      await loadRiskLabAudit();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, effectiveOwnerFilter, loadRiskLabAudit, monthKey, pin, requestedBy]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedCity: "manila" | "dubai" =
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        resolvedCity,
      );
      const canWrite = hasPermission("procurement.config.write", refreshed || auth);
      setAllowed(can);
      setCanWriteSharedConfig(canWrite);
      if (can) {
        if ((refreshed?.staffName || "").trim()) {
          const staffName = String(refreshed?.staffName || "").trim();
          setOwnerName(staffName);
          if (!requestedBy.trim()) setRequestedBy(staffName);
        }
        await load();
      }
    }
    void init();
  }, [auth, load, requestedBy]);

  const saveThresholdSettings = async () => {
    if (!canWriteSharedConfig) {
      setError("Only HQ users with procurement.config.write can save shared thresholds.");
      return;
    }
    if (!requestedBy.trim() || !pin.trim()) {
      setError("Approver name and PIN are required to save shared thresholds.");
      return;
    }
    if (!thresholdReasonCode.trim()) {
      setError("Change reason selection is required.");
      return;
    }
    if (thresholdReasonCode === "OTHER" && !thresholdReasonDetail.trim()) {
      setError("Please provide detail when reason is Other.");
      return;
    }
    setThresholdSaving(true);
    setError("");
    try {
      const res = await procurementJson<{ settings?: Partial<RiskThresholdSettings>; row?: RiskLabConfigRow }>(
        "/api/admin/procurement/config/risk-lab/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
            reason_code: thresholdReasonCode.trim(),
            reason_detail: thresholdReasonDetail.trim(),
            expected_updated_at: thresholdUpdatedAt,
            settings: thresholds,
          }),
        },
        requestedBy,
        pin,
      );
      setThresholds(mergeThresholdSettings(res?.settings));
      setSharedThresholds(mergeThresholdSettings(res?.settings));
      setThresholdUpdatedBy(String(res?.row?.updated_by || "").trim());
      setThresholdUpdatedAt(String(res?.row?.updated_at || "").trim());
      setThresholdConflict(null);
      setThresholdReasonCode("THRESHOLD_TUNING");
      setThresholdReasonDetail("");
      await loadRiskLabAudit();
    } catch (e: any) {
      const parsed = parseProcurementApiError(e?.message || String(e));
      const detail = parsed.detailObject || {};
      const currentSettingsRaw = detail.current_settings as Partial<RiskThresholdSettings> | undefined;
      const hasCurrentSettings = !!currentSettingsRaw && typeof currentSettingsRaw === "object";
      if (hasCurrentSettings) {
        setThresholdConflict({
          message: parsed.message,
          serverSettings: mergeThresholdSettings(currentSettingsRaw),
          serverUpdatedAt: String(detail.current_updated_at || "").trim(),
          serverUpdatedBy: String(detail.current_updated_by || "").trim(),
          localSettings: { ...thresholds },
        });
      } else {
        setThresholdConflict(null);
      }
      setError(parsed.message);
    } finally {
      setThresholdSaving(false);
    }
  };

  const exceptionPatternRows = useMemo(() => {
    const grouped = new Map<string, { rule_code: string; count: number; avgScore: number; redCount: number }>();
    for (const row of exceptions) {
      const key = String(row.rule_code || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      const prev = grouped.get(key) || { rule_code: key, count: 0, avgScore: 0, redCount: 0 };
      const nextCount = prev.count + 1;
      const score = Number(row.score || 0);
      const sev = String(row.severity || "").toUpperCase();
      grouped.set(key, {
        rule_code: key,
        count: nextCount,
        avgScore: (prev.avgScore * prev.count + score) / nextCount,
        redCount: prev.redCount + (sev === "RED" || sev === "BLACK" ? 1 : 0),
      });
    }
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
  }, [exceptions]);

  const behaviorRows = useMemo(() => {
    return kpiRows
      .map((row) => {
        const exceptionCount = Number(row.exception_count || 0);
        const priceDev = Number(row.price_deviation_avg || 0);
        const urgentRatio = normalizePercent(row.urgent_ratio);
        const onTime = normalizePercent(row.on_time_rate);
        const cycleHours = Number(row.approval_cycle_hours_avg || 0);

        let riskPoints = 0;
        if (exceptionCount >= thresholds.exceptionHighCount) riskPoints += 40;
        else if (exceptionCount >= thresholds.exceptionMediumCount) riskPoints += 20;
        if (priceDev >= thresholds.priceDevHigh) riskPoints += 20;
        else if (priceDev >= thresholds.priceDevMedium) riskPoints += 10;
        if (urgentRatio >= thresholds.urgentRatioHigh) riskPoints += 15;
        else if (urgentRatio >= thresholds.urgentRatioMedium) riskPoints += 8;
        if (onTime < thresholds.onTimeLow) riskPoints += 15;
        else if (onTime < thresholds.onTimeWarn) riskPoints += 8;
        if (cycleHours > thresholds.cycleHoursHigh) riskPoints += 10;
        else if (cycleHours > thresholds.cycleHoursMedium) riskPoints += 5;

        const riskBand =
          riskPoints >= thresholds.behaviorHighRiskPoint
            ? "HIGH"
            : riskPoints >= thresholds.behaviorMediumRiskPoint
              ? "MEDIUM"
              : "LOW";
        return {
          ...row,
          riskPoints,
          riskBand,
          urgentRatio,
          onTime,
        };
      })
      .sort((a, b) => b.riskPoints - a.riskPoints || Number(b.exception_count || 0) - Number(a.exception_count || 0));
  }, [kpiRows, thresholds]);

  const investigationCandidates = useMemo(() => {
    const highRiskCases = cases.filter((row) => {
      const sev = String(row.severity || "").toUpperCase();
      const paymentStatus = String(row.payment_status || "").toUpperCase();
      const riskScore = Number((row as any)?.risk_score || 0);
      return sev === "RED" || sev === "BLACK" || paymentStatus === "HOLD" || riskScore >= thresholds.caseRiskScoreCritical;
    });

    const highRiskExceptions = exceptions.filter((row) => {
      const sev = String(row.severity || "").toUpperCase();
      return sev === "RED" || sev === "BLACK" || Number(row.score || 0) >= thresholds.exceptionRiskScoreCritical;
    });

    return {
      highRiskCases,
      highRiskExceptions,
    };
  }, [cases, exceptions, thresholds.caseRiskScoreCritical, thresholds.exceptionRiskScoreCritical]);

  const investigationActions = useMemo(() => {
    return improvementRows
      .filter((row) => String(row.issue_title || "").startsWith("INVESTIGATION:"))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [improvementRows]);

  const riskLabHistoryRows = useMemo(() => {
    return riskLabAuditRows.map((row) => {
      const beforeSettings = row.before_json?.settings;
      const afterSettings = row.after_json?.settings;
      const changed = diffThresholdSettings(beforeSettings, afterSettings);
      return {
        ...row,
        changed,
      };
    });
  }, [riskLabAuditRows]);

  const historyRowsForSummary = useMemo(() => {
    return riskLabHistoryRows.filter((row) => {
      if (!historyMonthFilter) return true;
      return extractMonthKey(row.created_at) === historyMonthFilter;
    });
  }, [historyMonthFilter, riskLabHistoryRows]);

  const historyReasonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of historyRowsForSummary) {
      const code = String(row.reason_code || "").trim().toUpperCase() || "UNSPECIFIED";
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    const total = historyRowsForSummary.length;
    return Array.from(counts.entries())
      .map(([code, count]) => ({
        code,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
        label: RISK_REASON_OPTIONS.find((item) => item.code === code)?.label || code,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [historyRowsForSummary]);

  const historyRowsByMonthAndReason = useMemo(() => {
    return riskLabHistoryRows.filter((row) => {
      const code = String(row.reason_code || "").trim().toUpperCase();
      const monthMatched = !historyMonthFilter || extractMonthKey(row.created_at) === historyMonthFilter;
      const reasonMatched = historyReasonFilter === "ALL" || code === historyReasonFilter;
      return monthMatched && reasonMatched;
    });
  }, [historyMonthFilter, historyReasonFilter, riskLabHistoryRows]);

  const topChangedThresholds = useMemo(() => {
    const counts = new Map<keyof RiskThresholdSettings, number>();
    for (const row of historyRowsByMonthAndReason) {
      for (const change of row.changed) {
        counts.set(change.key, (counts.get(change.key) || 0) + 1);
      }
    }
    const totalRows = historyRowsByMonthAndReason.length;
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: RISK_THRESHOLD_LABELS[key],
        count,
        pct: totalRows > 0 ? (count / totalRows) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [historyRowsByMonthAndReason]);

  const filteredRiskLabHistoryRows = useMemo(() => {
    return historyRowsByMonthAndReason.filter((row) => {
      if (historyChangedKeyFilter === "ALL") return true;
      return row.changed.some((change) => change.key === historyChangedKeyFilter);
    });
  }, [historyChangedKeyFilter, historyRowsByMonthAndReason]);

  const thresholdConflictDiff = useMemo(() => {
    if (!thresholdConflict) return [];
    return diffThresholdSettings(thresholdConflict.serverSettings, thresholdConflict.localSettings);
  }, [thresholdConflict]);

  const draftVsSharedDiff = useMemo(() => {
    return diffThresholdSettings(sharedThresholds, thresholds);
  }, [sharedThresholds, thresholds]);

  const exportHistoryCsv = useCallback(() => {
    const headers = [
      "created_at",
      "actor_name",
      "actor_role",
      "reason_code",
      "reason_label",
      "reason_detail",
      "changed_count",
      "changed_values",
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of filteredRiskLabHistoryRows) {
      const reasonCode = String(row.reason_code || "").trim().toUpperCase();
      const reasonLabel = RISK_REASON_OPTIONS.find((item) => item.code === reasonCode)?.label || reasonCode;
      const changedValues = row.changed
        .map((change) => `${RISK_THRESHOLD_LABELS[change.key]}: ${change.beforeValue == null ? "-" : change.beforeValue} -> ${change.afterValue == null ? "-" : change.afterValue}`)
        .join(" | ");
      lines.push(
        [
          row.created_at || "",
          row.actor_name || "",
          row.actor_role || "",
          reasonCode,
          reasonLabel,
          row.after_json?.reason_detail || "",
          String(row.changed.length),
          changedValues,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csvText = `${lines.join("\n")}\n`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const monthPart = historyMonthFilter || "all-months";
    const reasonPart = historyReasonFilter || "all-reasons";
    const changedKeyPart = historyChangedKeyFilter || "all-keys";
    a.href = url;
    a.download = `risk_lab_history_${monthPart}_${reasonPart}_${changedKeyPart}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [filteredRiskLabHistoryRows, historyChangedKeyFilter, historyMonthFilter, historyReasonFilter]);

  const exportReasonSummaryCsv = useCallback(() => {
    const headers = ["month_filter", "reason_code", "reason_label", "count", "percentage"];
    const lines = [headers.map(csvCell).join(",")];
    for (const item of historyReasonCounts) {
      lines.push([historyMonthFilter || "ALL", item.code, item.label, String(item.count), item.pct.toFixed(1)].map(csvCell).join(","));
    }
    const csvText = `${lines.join("\n")}\n`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `risk_lab_reason_summary_${historyMonthFilter || "all-months"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [historyMonthFilter, historyReasonCounts]);

  const prepareFromCase = (row: CaseRow) => {
    const caseNo = String(row.parent_case_no || row.request_no || row.id || "").trim();
    const base = `INVESTIGATION:${caseNo}`;
    setIssueTitle(base);
    setActionPlan(
      [
        `Investigate case ${caseNo}.`,
        `- Verify risk reasons and exception events.`,
        `- Validate document chain and phase2 controls.`,
        `- Decide escalation or closure with evidence.`,
      ].join("\n"),
    );
    setDueDate(todayIso());
    setStatus("OPEN");
    setResultNote("");
    setSelectedImprovementId("");
  };

  const prepareFromException = (row: ExceptionRow) => {
    const label = `${row.rule_code || "RULE"}:${row.request_no || row.request_id || row.id}`;
    const base = `INVESTIGATION:${label}`;
    setIssueTitle(base);
    setActionPlan(
      [
        `Investigate exception ${row.rule_code || "-"}.`,
        `- Confirm trigger details and source transaction.`,
        `- Review request/case context and supporting docs.`,
        `- Record mitigation or escalation decision.`,
      ].join("\n"),
    );
    setDueDate(todayIso());
    setStatus("OPEN");
    setResultNote("");
    setSelectedImprovementId("");
  };

  const editInvestigationAction = (row: ImprovementRow) => {
    setSelectedImprovementId(String(row.id || ""));
    setIssueTitle(String(row.issue_title || ""));
    setActionPlan(String(row.action_plan || ""));
    setDueDate(String(row.due_date || "").slice(0, 10) || todayIso());
    setStatus(String(row.status || "OPEN").toUpperCase());
    setResultNote(String(row.result_note || ""));
    if (String(row.owner_name || "").trim()) setOwnerName(String(row.owner_name || "").trim());
  };

  const clearForm = () => {
    setSelectedImprovementId("");
    setIssueTitle("");
    setActionPlan("");
    setDueDate(todayIso());
    setStatus("OPEN");
    setResultNote("");
  };

  const saveInvestigationAction = async () => {
    if (!monthKey.trim()) {
      setError("month_key is required.");
      return;
    }
    if (!ownerName.trim()) {
      setError("owner_name is required.");
      return;
    }
    if (!issueTitle.trim()) {
      setError("issue_title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/improvements/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month_key: monthKey.trim(),
            owner_name: ownerName.trim(),
            issue_title: issueTitle.trim(),
            action_plan: actionPlan.trim(),
            due_date: dueDate.trim(),
            status: status.trim().toUpperCase(),
            result_note: resultNote.trim(),
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      await load();
      clearForm();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-lg font-semibold">Risk Lab (Phase 3 MVP)</div>
        <div className="mt-1 text-sm text-neutral-400">
          Fraud pattern watch, approver behavior scoring, and investigation workflow on existing procurement APIs.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-6">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <MonthPicker value={monthKey} onChange={setMonthKey} />
        <input value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} placeholder="Owner filter (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Investigation owner" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Risk Threshold Settings</div>
            <div className="mt-1 text-xs text-neutral-500">Operational tuning for behavior/fraud detection in this Risk Lab.</div>
            {thresholdUpdatedAt ? (
              <div className="mt-1 text-[11px] text-neutral-500">
                Last shared update: {String(thresholdUpdatedAt || "").slice(0, 16).replace("T", " ")}
                {thresholdUpdatedBy ? ` by ${thresholdUpdatedBy}` : ""}
              </div>
            ) : null}
            <div className="mt-1 text-[11px] text-neutral-500">
              Draft delta vs shared: {draftVsSharedDiff.length} field{draftVsSharedDiff.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setThresholds(RISK_THRESHOLD_DEFAULTS)}
              disabled={!canWriteSharedConfig}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900"
            >
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={() => void saveThresholdSettings()}
              disabled={thresholdSaving || !canWriteSharedConfig}
              className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60"
            >
              {thresholdSaving ? "Saving..." : "Save Shared Thresholds"}
            </button>
            <button
              type="button"
              onClick={() => setThresholds(sharedThresholds)}
              disabled={!draftVsSharedDiff.length || !canWriteSharedConfig}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              Revert Draft to Shared
            </button>
          </div>
        </div>
        {!canWriteSharedConfig ? (
          <div className="mb-2 text-xs text-amber-200">
            Read-only mode: only HQ users with `procurement.config.write` can modify shared thresholds.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.exceptionHighCount} onChange={(e) => setThresholds((p) => ({ ...p, exceptionHighCount: Number(e.target.value || 0) }))} placeholder="Exception high count" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.exceptionMediumCount} onChange={(e) => setThresholds((p) => ({ ...p, exceptionMediumCount: Number(e.target.value || 0) }))} placeholder="Exception medium count" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.priceDevHigh} onChange={(e) => setThresholds((p) => ({ ...p, priceDevHigh: Number(e.target.value || 0) }))} placeholder="Price deviation high %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.priceDevMedium} onChange={(e) => setThresholds((p) => ({ ...p, priceDevMedium: Number(e.target.value || 0) }))} placeholder="Price deviation medium %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.urgentRatioHigh} onChange={(e) => setThresholds((p) => ({ ...p, urgentRatioHigh: Number(e.target.value || 0) }))} placeholder="Urgent high %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.urgentRatioMedium} onChange={(e) => setThresholds((p) => ({ ...p, urgentRatioMedium: Number(e.target.value || 0) }))} placeholder="Urgent medium %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.onTimeLow} onChange={(e) => setThresholds((p) => ({ ...p, onTimeLow: Number(e.target.value || 0) }))} placeholder="On-time low %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.onTimeWarn} onChange={(e) => setThresholds((p) => ({ ...p, onTimeWarn: Number(e.target.value || 0) }))} placeholder="On-time warn %" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.cycleHoursHigh} onChange={(e) => setThresholds((p) => ({ ...p, cycleHoursHigh: Number(e.target.value || 0) }))} placeholder="Cycle high hours" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.cycleHoursMedium} onChange={(e) => setThresholds((p) => ({ ...p, cycleHoursMedium: Number(e.target.value || 0) }))} placeholder="Cycle medium hours" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.behaviorHighRiskPoint} onChange={(e) => setThresholds((p) => ({ ...p, behaviorHighRiskPoint: Number(e.target.value || 0) }))} placeholder="Behavior high points" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.behaviorMediumRiskPoint} onChange={(e) => setThresholds((p) => ({ ...p, behaviorMediumRiskPoint: Number(e.target.value || 0) }))} placeholder="Behavior medium points" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.caseRiskScoreCritical} onChange={(e) => setThresholds((p) => ({ ...p, caseRiskScoreCritical: Number(e.target.value || 0) }))} placeholder="Case critical score" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
          <input type="number" disabled={!canWriteSharedConfig} value={thresholds.exceptionRiskScoreCritical} onChange={(e) => setThresholds((p) => ({ ...p, exceptionRiskScoreCritical: Number(e.target.value || 0) }))} placeholder="Exception critical score" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[280px_1fr]">
          <select
            disabled={!canWriteSharedConfig}
            value={thresholdReasonCode}
            onChange={(e) => setThresholdReasonCode(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60"
          >
            {RISK_REASON_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
            {RISK_REASON_OPTIONS.find((item) => item.code === thresholdReasonCode)?.description || "Select a reason."}
          </div>
        </div>
        {thresholdReasonCode === "OTHER" ? (
          <div className="mt-2">
            <input
              disabled={!canWriteSharedConfig}
              value={thresholdReasonDetail}
              onChange={(e) => setThresholdReasonDetail(e.target.value)}
              placeholder="Describe the reason for reporting (required when Other)"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-60"
            />
          </div>
        ) : null}
        <div className="mt-1 text-[11px] text-neutral-500">
          This reason code is used for audit/report grouping across the team.
        </div>
        {thresholdConflict ? (
          <div className="mt-3 rounded-xl border border-amber-700/50 bg-amber-900/10 p-3">
            <div className="text-xs font-medium text-amber-200">Conflict detected while saving shared thresholds</div>
            <div className="mt-1 text-[11px] text-amber-100/90">{thresholdConflict.message}</div>
            <div className="mt-1 text-[11px] text-neutral-400">
              Current shared version: {String(thresholdConflict.serverUpdatedAt || "").slice(0, 16).replace("T", " ")}
              {thresholdConflict.serverUpdatedBy ? ` by ${thresholdConflict.serverUpdatedBy}` : ""}
            </div>
            <div className="mt-2 space-y-1">
              {thresholdConflictDiff.map((item) => (
                <div key={`conflict-${item.key}`} className="text-[11px] text-neutral-300">
                  {RISK_THRESHOLD_LABELS[item.key]}: server {item.beforeValue == null ? "-" : item.beforeValue} -&gt; your draft{" "}
                  {item.afterValue == null ? "-" : item.afterValue}
                </div>
              ))}
              {!thresholdConflictDiff.length ? <div className="text-[11px] text-neutral-500">No numeric diff found, but shared version changed.</div> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setThresholds(thresholdConflict.serverSettings);
                  setSharedThresholds(thresholdConflict.serverSettings);
                  setThresholdUpdatedAt(thresholdConflict.serverUpdatedAt);
                  setThresholdUpdatedBy(thresholdConflict.serverUpdatedBy);
                  setThresholdConflict(null);
                  setError("");
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-[11px] hover:bg-neutral-900"
              >
                Load Latest Shared Values
              </button>
              <button
                type="button"
                onClick={() => {
                  setSharedThresholds(thresholdConflict.serverSettings);
                  setThresholdUpdatedAt(thresholdConflict.serverUpdatedAt);
                  setThresholdUpdatedBy(thresholdConflict.serverUpdatedBy);
                  setThresholdConflict(null);
                  setError("");
                }}
                className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-800/30"
              >
                Keep My Draft and Retry Save
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Shared Settings Update History</div>
            <div className="mt-1 text-xs text-neutral-500">Shows who changed thresholds, when, and what values were updated.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportHistoryCsv}
              disabled={!filteredRiskLabHistoryRows.length}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              Export History CSV
            </button>
            <button
              type="button"
              onClick={exportReasonSummaryCsv}
              disabled={!historyReasonCounts.length}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              Export Summary CSV
            </button>
            <button
              type="button"
              onClick={() => void loadRiskLabAudit()}
              disabled={auditLoading}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              {auditLoading ? "Loading..." : "Refresh History"}
            </button>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[240px_180px_auto]">
          <select
            value={historyReasonFilter}
            onChange={(e) => setHistoryReasonFilter(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs"
          >
            <option value="ALL">All reasons</option>
            {RISK_REASON_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <MonthPicker value={historyMonthFilter} onChange={setHistoryMonthFilter} />
          <button
            type="button"
            onClick={() => setHistoryMonthFilter("")}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900"
          >
            Show all months
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {historyReasonCounts.map((item) => (
            <div key={item.code} className="rounded-full border border-neutral-700 bg-neutral-950/60 px-2.5 py-1 text-[11px] text-neutral-300">
              {item.label}: {item.count} ({item.pct.toFixed(1)}%)
            </div>
          ))}
          {!historyReasonCounts.length ? <div className="text-xs text-neutral-500">No history rows in this month range.</div> : null}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHistoryChangedKeyFilter("ALL")}
            className={[
              "rounded-full border px-2.5 py-1 text-[11px]",
              historyChangedKeyFilter === "ALL"
                ? "border-amber-500 bg-amber-900/25 text-amber-200"
                : "border-neutral-700 bg-neutral-950/60 text-neutral-300 hover:bg-neutral-900",
            ].join(" ")}
          >
            All changed thresholds
          </button>
          {topChangedThresholds.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setHistoryChangedKeyFilter(item.key)}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px]",
                historyChangedKeyFilter === item.key
                  ? "border-amber-500 bg-amber-900/25 text-amber-200"
                  : "border-amber-700/40 bg-amber-900/10 text-amber-200 hover:bg-amber-900/20",
              ].join(" ")}
            >
              {item.label}: {item.count} ({item.pct.toFixed(1)}%)
            </button>
          ))}
          {!topChangedThresholds.length ? <div className="text-xs text-neutral-500">No threshold changes in current filter scope.</div> : null}
        </div>
        {historyChangedKeyFilter !== "ALL" ? (
          <div className="mb-3 text-[11px] text-neutral-500">
            Showing history rows that changed:{" "}
            {RISK_THRESHOLD_LABELS[historyChangedKeyFilter as keyof RiskThresholdSettings] || historyChangedKeyFilter}
          </div>
        ) : null}
        <div className="space-y-2">
          {filteredRiskLabHistoryRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-neutral-300">
                  {row.actor_name || "-"} {row.actor_role ? `(${row.actor_role})` : ""}
                </div>
                <div className="text-[11px] text-neutral-500">{String(row.created_at || "").slice(0, 16).replace("T", " ")}</div>
              </div>
              <div className="mt-2 space-y-1">
                {row.reason_code ? (
                  <div className="text-[11px] text-neutral-500">
                    Reason: {RISK_REASON_OPTIONS.find((item) => item.code === row.reason_code)?.label || row.reason_code}
                  </div>
                ) : null}
                {row.after_json?.reason_detail ? <div className="text-[11px] text-neutral-500">Detail: {row.after_json.reason_detail}</div> : null}
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!row.after_json?.settings || !canWriteSharedConfig}
                    onClick={() => {
                      const next = mergeThresholdSettings(row.after_json?.settings);
                      setThresholds(next);
                      setThresholdReasonCode("TEAM_CALIBRATION");
                      setThresholdReasonDetail(
                        `Loaded draft from history ${String(row.created_at || "").slice(0, 16).replace("T", " ")} by ${row.actor_name || "-"}.`,
                      );
                      setThresholdConflict(null);
                      setError("");
                    }}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] hover:bg-neutral-900 disabled:opacity-50"
                  >
                    Load This Snapshot as Draft
                  </button>
                </div>
                {row.changed.slice(0, 8).map((change) => (
                  <div key={`${row.id}-${change.key}`} className="text-[11px] text-neutral-400">
                    {RISK_THRESHOLD_LABELS[change.key]}: {change.beforeValue == null ? "-" : change.beforeValue} -&gt; {change.afterValue == null ? "-" : change.afterValue}
                  </div>
                ))}
                {row.changed.length > 8 ? <div className="text-[11px] text-neutral-500">...and {row.changed.length - 8} more changes</div> : null}
                {!row.changed.length ? <div className="text-[11px] text-neutral-500">No effective threshold value change.</div> : null}
              </div>
            </div>
          ))}
          {!filteredRiskLabHistoryRows.length && !auditLoading ? <div className="text-sm text-neutral-500">No risk threshold update history for this filter.</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-sm font-medium">Fraud Pattern Snapshot</div>
          <div className="mt-2 text-xs text-neutral-500">Grouped by exception rule code.</div>
          <div className="mt-3 space-y-2">
            {exceptionPatternRows.slice(0, 12).map((row) => (
              <div key={row.rule_code} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.rule_code}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  Count {row.count} | Avg Score {Number(row.avgScore || 0).toFixed(1)} | Red/Black {row.redCount}
                </div>
              </div>
            ))}
            {!exceptionPatternRows.length ? <div className="text-sm text-neutral-500">No exception patterns.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 xl:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Approver Behavior Scoring</div>
            <Link href={`/admin/procurement/scorecards?month_key=${encodeURIComponent(monthKey)}${ownerFilter ? `&owner_name=${encodeURIComponent(ownerFilter)}` : ""}`} className="text-xs text-amber-200 hover:underline">
              Open Scorecards
            </Link>
          </div>
          <div className="space-y-2">
            {behaviorRows.slice(0, 20).map((row) => (
              <div key={row.id || `${row.month_key}:${row.owner_name}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-neutral-100">{row.owner_name || "UNASSIGNED"}</div>
                  <div className="text-xs text-neutral-400">
                    Behavior Risk {row.riskPoints} ({row.riskBand})
                  </div>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Exceptions {Number(row.exception_count || 0)} | Price Dev {Number(row.price_deviation_avg || 0).toFixed(2)} | Urgent {Number(row.urgentRatio || 0).toFixed(1)}%
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  On-time {Number(row.onTime || 0).toFixed(1)}% | Cycle {Number(row.approval_cycle_hours_avg || 0).toFixed(2)}h | KPI Grade {row.grade || "-"}
                </div>
              </div>
            ))}
            {!behaviorRows.length ? <div className="text-sm text-neutral-500">No behavior rows for this filter.</div> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium">Investigation Candidates (High Risk Cases)</div>
            <div className="mt-3 space-y-2">
              {investigationCandidates.highRiskCases.map((row) => (
                <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-neutral-100">{row.parent_case_no || row.request_no || row.id}</div>
                    <div className="text-xs text-neutral-400">
                      Severity {row.severity || "-"} | Payment {row.payment_status || "-"} | Status {row.status || "-"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Assignee role {row.current_assignee_role || "-"} {row.payment_hold_reason ? `| Hold reason: ${row.payment_hold_reason}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/admin/procurement/cases/${row.id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] hover:bg-neutral-900">
                      Open Case
                    </Link>
                    <button type="button" onClick={() => prepareFromCase(row)} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-800/30">
                      Prepare Investigation
                    </button>
                  </div>
                </div>
              ))}
              {!investigationCandidates.highRiskCases.length ? <div className="text-sm text-neutral-500">No high-risk cases.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium">Investigation Candidates (Critical Exceptions)</div>
            <div className="mt-3 space-y-2">
              {investigationCandidates.highRiskExceptions.map((row) => (
                <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-neutral-100">{row.rule_code || "-"}</div>
                    <div className="text-xs text-neutral-400">
                      {row.request_no || row.request_id || "-"} | Severity {row.severity || "-"} | Score {Number(row.score || 0).toFixed(1)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">Requester {row.requested_by || "-"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.case_id ? (
                      <Link href={`/admin/procurement/cases/${row.case_id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] hover:bg-neutral-900">
                        Open Case
                      </Link>
                    ) : null}
                    <Link href="/admin/procurement/exceptions" className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] hover:bg-neutral-900">
                      Open Exceptions
                    </Link>
                    <button type="button" onClick={() => prepareFromException(row)} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-800/30">
                      Prepare Investigation
                    </button>
                  </div>
                </div>
              ))}
              {!investigationCandidates.highRiskExceptions.length ? <div className="text-sm text-neutral-500">No critical exception candidates.</div> : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{selectedImprovementId ? "Edit Investigation Action" : "New Investigation Action"}</div>
                <div className="mt-1 text-xs text-neutral-500">Saved via improvements API with `INVESTIGATION:` prefix.</div>
              </div>
              <button type="button" onClick={clearForm} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
                Clear
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Issue title (e.g. INVESTIGATION:CASE-...)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="Investigation plan" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <DatePicker value={dueDate} onChange={setDueDate} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="DONE">DONE</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <textarea value={resultNote} onChange={(e) => setResultNote(e.target.value)} placeholder="Result / finding note" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <button type="button" onClick={() => void saveInvestigationAction()} disabled={saving} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
                {saving ? "Saving..." : "Save Investigation Action"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium">Investigation Action Log ({monthKey})</div>
            <div className="mt-3 space-y-2">
              {investigationActions.slice(0, 40).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => editInvestigationAction(row)}
                  className={[
                    "w-full rounded-xl border p-3 text-left",
                    selectedImprovementId === row.id ? "border-amber-500 bg-amber-950/20" : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900",
                  ].join(" ")}
                >
                  <div className="text-sm text-neutral-100">{row.issue_title}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {row.owner_name || "-"} | {row.status || "-"} | Due {String(row.due_date || "").slice(0, 10) || "-"}
                  </div>
                </button>
              ))}
              {!investigationActions.length ? <div className="text-sm text-neutral-500">No investigation actions in this month/filter.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
