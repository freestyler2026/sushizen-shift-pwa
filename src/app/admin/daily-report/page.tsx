"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardList,
  Globe,
  Package,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRouter } from "next/navigation";
import { canAccessAnalyticsAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";
import {
  BADGE_ERROR, BADGE_SUCCESS, BADGE_WARNING,
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  PRIMARY_BUTTON, SECONDARY_BUTTON,
  T_BODY, T_CAPTION, T_PAGE_TITLE, T_SECTION,
  TAB_ACTIVE, TAB_CONTAINER, TAB_INACTIVE,
  TABLE_CELL, TABLE_HEADER, TABLE_ROW,
} from "@/lib/ui-tokens";

type City = "dubai" | "manila";
type Lang = "en" | "ja";

const TR = {
  en: {
    pageTitle: "Daily Operations Report",
    subtitle: "All-in-one daily summary · Auto-generated at 1:30 PM PHT",
    refresh: "Refresh", generateNow: "Generate Now", generating: "Generating...",
    reportDate: "Report date", generatedAt: "Generated",
    noReports: "No report yet for today.", noReportsHint: "HQ/ADMIN can click \"Generate Now\" to build a report manually.",
    accessDenied: "Analytics permission required.",
    generateConfirm: "Generate report for {city} now?",
    errorPrefix: "Error",
    // Sections
    sec_overview: "Day at a Glance",
    sec_branch: "By Branch",
    sec_sales: "Sales Detail",
    sec_attendance: "Attendance Detail",
    sec_adherence: "Shift Adherence",
    sec_lean: "Lean Shift",
    sec_ratings: "Ratings",
    sec_disposal: "Disposal",
    sec_backup: "Backup",
    // KPIs
    totalSales: "Total Sales", totalOrders: "Orders",
    absences: "Absences", lateArrivals: "Late", noShows: "No-shows", totalOT: "Total OT",
    adherenceRate: "Adherence", avgRating: "Avg Rating",
    // Branch card
    sales: "Sales", orders: "Orders", absent: "Absent", late: "Late",
    ot: "OT", adherence: "Adherence", rating: "Rating",
    disposal: "Disposal", backup: "Backup",
    noSalesData: "No POS data", noData: "No data for this date.",
    // Tables
    branch: "Branch", staffName: "Staff", type: "Type", note: "Note",
    lateDuration: "Late By", scheduledBranch: "Sched. Branch",
    aggregator: "Aggregator", brand: "Brand", netSales: "Net Sales",
    grossSales: "Gross Sales", avgOrder: "Avg/Order",
    channel: "Channel", amount: "Amount", transactions: "Tx",
    scheduledShifts: "Sched.", attendedShifts: "Attended",
    noShowCount: "No-shows", staffCount: "Staff",
    avgCheckin: "Avg In", avgCheckout: "Avg Out", leanStart: "Lean",
    avgOT: "Avg OT", reducibleOT: "Reducible",
    shiftCount: "Shifts", dayName: "Day",
    reportedBy: "By", shift: "Shift", itemCount: "Items",
    ratingScore: "Score", reviews: "Reviews",
    noAbsences: "No absences", noLate: "No late arrivals", noNoShows: "No no-shows",
    totalReducible: "Total Reducible OT",
  },
  ja: {
    pageTitle: "デイリー業務レポート",
    subtitle: "全データ一覧 · 毎日13:30 PHT 自動生成",
    refresh: "更新", generateNow: "今すぐ生成", generating: "生成中...",
    reportDate: "日付", generatedAt: "生成",
    noReports: "本日のレポートがまだありません。", noReportsHint: "HQ/ADMINが「今すぐ生成」で手動生成できます。",
    accessDenied: "Analytics権限が必要です。",
    generateConfirm: "{city} のレポートを今すぐ生成しますか？",
    errorPrefix: "エラー",
    sec_overview: "当日サマリー",
    sec_branch: "店舗別",
    sec_sales: "売上詳細",
    sec_attendance: "勤怠詳細",
    sec_adherence: "シフト遵守率",
    sec_lean: "リーンシフト",
    sec_ratings: "評価",
    sec_disposal: "廃棄",
    sec_backup: "バックアップ",
    totalSales: "売上合計", totalOrders: "注文数",
    absences: "欠勤", lateArrivals: "遅刻", noShows: "未出勤", totalOT: "残業合計",
    adherenceRate: "遵守率", avgRating: "平均評価",
    sales: "売上", orders: "注文", absent: "欠勤", late: "遅刻",
    ot: "残業", adherence: "遵守率", rating: "評価",
    disposal: "廃棄", backup: "備品",
    noSalesData: "POSデータなし", noData: "この日のデータがありません。",
    branch: "店舗", staffName: "スタッフ", type: "種別", note: "備考",
    lateDuration: "遅刻時間", scheduledBranch: "予定店舗",
    aggregator: "AG", brand: "ブランド", netSales: "Net売上",
    grossSales: "Gross売上", avgOrder: "平均単価",
    channel: "チャンネル", amount: "金額", transactions: "取引",
    scheduledShifts: "予定", attendedShifts: "出勤",
    noShowCount: "未出勤", staffCount: "人数",
    avgCheckin: "平均IN", avgCheckout: "平均OUT", leanStart: "リーン",
    avgOT: "平均OT", reducibleOT: "削減可能",
    shiftCount: "シフト", dayName: "曜日",
    reportedBy: "報告者", shift: "シフト", itemCount: "件数",
    ratingScore: "スコア", reviews: "レビュー",
    noAbsences: "欠勤なし", noLate: "遅刻なし", noNoShows: "未出勤なし",
    totalReducible: "削減可能OT合計",
  },
} as const;
type T = { readonly [K in keyof typeof TR["en"]]: string };

// ── Interfaces ────────────────────────────────────────────────────────────────
interface AbsenceRow { staff_name: string; absence_type: string; note: string; branch: string }
interface LateRow { staff_name: string; branch: string; late_minutes: number }
interface NoShowRow { staff_name: string; scheduled_branch_code: string; scheduled_minutes: number }
interface OTSummary { total_incidents?: number; total_staff?: number; total_overtime_minutes?: number; max_overtime_minutes?: number }
interface OTBranchRow { branch_code?: string; incidents?: number; staff_count?: number; total_overtime_minutes?: number; avg_overtime_minutes?: number }
interface PosRow { branch_name?: string; branch_code?: string; aggregator_name?: string; net_sales?: number; gross_sales?: number; order_count?: number }
interface ManilaSalesRow { branch?: string; total_orders?: number; total_amount?: number; dine_in_orders?: number; grabfood_orders?: number; foodpanda_orders?: number; beep_orders?: number }
interface ByChannelRow { channel: string; orders: number; amount: number }
interface AggRow { aggregator: string; order_count: number }
interface BrandRow { brand: string; order_count: number }
interface DubaiOCRow { brand?: string; aggregator?: string; branch?: string; order_count?: number }
interface ManilaOCRow { store_name?: string; transaction_channel?: string; total_transactions?: number; total_sales?: number }
interface AdherenceBranchRow { branch_code: string; scheduled_shifts: number; attended_shifts: number; no_show_count: number; staff_count: number; adherence_rate: number; total_overtime_minutes?: number }
interface LeanShiftRow { branch_code: string; dow: number; day_name: string; shift_count: number; avg_checkout_hour: number; avg_checkin_hour: number; lean_start_hour: number; avg_hours_worked: number; avg_ot_minutes: number; reducible_ot_per_shift?: number }
interface DisposalReport { id: number; branch_code: string; report_date: string; reported_by: string; shift: string; notes: string; status: string; line_count: number; lines: { item_name_snapshot?: string; quantity?: number; unit?: string; disposal_reason?: string }[] }
interface BackupReport { id: number; branch_code: string; report_date: string; reported_by: string; shift: string; notes: string; status: string; lines: { section?: string; item_name_snapshot?: string; quantity?: number; unit?: string }[] }
interface RatingRow { brand?: string; aggregator?: string; branch?: string; rating_score?: number | null; review_count?: string | null }
interface AggRatingRow { aggregator: string; avg_score: number; count: number }

interface ReportData {
  report_date: string; city: string; generated_at: string;
  attendance: { absences: AbsenceRow[]; late: LateRow[]; no_show: NoShowRow[]; overtime_summary: OTSummary; overtime_by_branch: { rows?: OTBranchRow[] } };
  sales: {
    pos_sales?: { rows: PosRow[]; total_net_sales: number; total_gross_sales: number; total_orders: number };
    order_counts?: { rows: DubaiOCRow[] | ManilaOCRow[]; total?: number; total_transactions?: number; by_aggregator?: AggRow[]; by_brand?: BrandRow[] };
    daily_sales?: { rows: ManilaSalesRow[]; total_amount: number; total_orders: number; by_channel?: ByChannelRow[] };
  };
  adherence?: { rows: AdherenceBranchRow[]; overall_rate: number; total_scheduled: number; total_attended: number };
  lean_shift?: { rows: LeanShiftRow[]; total_reducible_ot_minutes: number };
  disposal?: { rows: DisposalReport[]; total_reports: number; total_items: number };
  backup?: { rows: BackupReport[]; total_reports: number; total_items: number };
  ratings?: { rows: RatingRow[]; avg_rating: number | null; count: number; by_aggregator: AggRatingRow[] };
}
interface ReportEntry { report_date: string; city: string; data: ReportData; generated_at: string | null }

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtAED = (v: number) => `AED ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtPHP = (v: number) => `₱${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtMin = (m: number) => { const h = Math.floor(m / 60); const mn = m % 60; return h > 0 ? `${h}h ${mn}m` : `${mn}m`; };
const fmtHr = (h: number) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; };

const CHART_COLORS = ["#7c3aed","#8b5cf6","#a78bfa","#6366f1","#06b6d4","#10b981","#f59e0b"];
const rateColor = (r: number) => r >= 90 ? "#10b981" : r >= 75 ? "#f59e0b" : "#f43f5e";
const starColor = (s: number | null) => s == null ? "#71717a" : s >= 4.5 ? "#10b981" : s >= 4.0 ? "#f59e0b" : "#f43f5e";

// ── Mini components ───────────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-white/8" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      <div className="h-px flex-1 bg-white/8" />
    </div>
  );
}

function MiniBar({ value, max, color = "#7c3aed" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 rounded-full bg-white/10">
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-neutral-500 w-6">{pct}%</span>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">{icon}</div>
      <h2 className={T_SECTION}>{title}</h2>
    </div>
  );
}

function EmptyNote({ msg }: { msg: string }) {
  return <div className="flex items-center gap-2 py-2 text-neutral-500 text-sm"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{msg}</div>;
}

// ── Branch grid ───────────────────────────────────────────────────────────────
interface BranchCard {
  name: string;
  netSales?: number; totalAmount?: number; orders?: number;
  absences: number; lateCount: number; noShows: number; otMinutes: number;
  adherenceRate?: number;
  avgRating?: number;
  disposalCount: number; backupCount: number;
}

function buildBranchCards(data: ReportData, city: string): BranchCard[] {
  const map = new Map<string, BranchCard>();
  const key = (s: string) => (s || "").toLowerCase().trim();

  const get = (name: string): BranchCard => {
    const k = key(name);
    if (!map.has(k)) map.set(k, { name, absences: 0, lateCount: 0, noShows: 0, otMinutes: 0, disposalCount: 0, backupCount: 0 });
    return map.get(k)!;
  };

  // Sales
  if (city === "dubai" && data.sales?.pos_sales?.rows?.length) {
    // Group by branch_name (multiple aggregator rows per branch → sum)
    const bySalesName = new Map<string, { net: number; orders: number }>();
    for (const r of data.sales.pos_sales.rows) {
      const n = r.branch_name || r.branch_code || "Unknown";
      const k2 = key(n);
      const cur = bySalesName.get(k2) ?? { net: 0, orders: 0 };
      cur.net += r.net_sales ?? 0;
      cur.orders += r.order_count ?? 0;
      bySalesName.set(k2, cur);
    }
    for (const [k2, v] of bySalesName) {
      const actual = data.sales!.pos_sales!.rows.find(r => key(r.branch_name || r.branch_code || "") === k2);
      const name = actual?.branch_name || actual?.branch_code || k2;
      const card = get(name);
      card.netSales = v.net;
      card.orders = v.orders;
    }
  }
  // Dubai fallback: populate per-branch orders from order_counts when POS has no rows
  if (city === "dubai" && !(data.sales?.pos_sales?.rows?.length)) {
    const ocRows = (data.sales?.order_counts?.rows ?? []) as DubaiOCRow[];
    const branchOrders = new Map<string, { name: string; total: number }>();
    for (const r of ocRows) {
      const bn = r.branch || "Unknown";
      const k2 = key(bn);
      const cur = branchOrders.get(k2) ?? { name: bn, total: 0 };
      cur.total += r.order_count ?? 0;
      branchOrders.set(k2, cur);
    }
    for (const [, v] of branchOrders) {
      get(v.name).orders = v.total;
    }
  }
  if (city === "manila" && data.sales?.daily_sales?.rows) {
    for (const r of data.sales.daily_sales.rows) {
      const card = get(r.branch || "Unknown");
      card.totalAmount = r.total_amount ?? 0;
      card.orders = r.total_orders ?? 0;
    }
  }

  // Absences by branch
  for (const r of data.attendance.absences) {
    get(r.branch || "Unknown").absences++;
  }
  // Late by branch
  for (const r of data.attendance.late) {
    get(r.branch || "Unknown").lateCount++;
  }
  // No-shows
  for (const r of data.attendance.no_show) {
    get(r.scheduled_branch_code || "Unknown").noShows++;
  }
  // OT by branch
  for (const r of data.attendance.overtime_by_branch?.rows ?? []) {
    const card = get(r.branch_code || "Unknown");
    card.otMinutes += r.total_overtime_minutes ?? 0;
  }

  // Adherence
  for (const r of data.adherence?.rows ?? []) {
    const card = get(r.branch_code || "Unknown");
    card.adherenceRate = r.adherence_rate;
  }

  // Ratings (avg per branch)
  const ratingsByBranch = new Map<string, number[]>();
  for (const r of data.ratings?.rows ?? []) {
    if (r.rating_score != null) {
      const k2 = key(r.branch || "Unknown");
      if (!ratingsByBranch.has(k2)) ratingsByBranch.set(k2, []);
      ratingsByBranch.get(k2)!.push(Number(r.rating_score));
    }
  }
  for (const [k2, scores] of ratingsByBranch) {
    // Match to existing card
    for (const [mk, card] of map) {
      if (mk === k2 || mk.includes(k2) || k2.includes(mk)) {
        card.avgRating = scores.reduce((a, b) => a + b, 0) / scores.length;
        break;
      }
    }
  }

  // Disposal / backup
  for (const r of data.disposal?.rows ?? []) {
    get(r.branch_code || "Unknown").disposalCount++;
  }
  for (const r of data.backup?.rows ?? []) {
    get(r.branch_code || "Unknown").backupCount++;
  }

  return Array.from(map.values()).sort((a, b) => {
    const sa = a.netSales ?? a.totalAmount ?? 0;
    const sb = b.netSales ?? b.totalAmount ?? 0;
    return sb - sa;
  });
}

function BranchCardGrid({ cards, city, t }: { cards: BranchCard[]; city: string; t: T }) {
  const fmt = city === "dubai" ? fmtAED : fmtPHP;
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c, i) => {
        const salesVal = c.netSales ?? c.totalAmount;
        const hasIssue = c.absences > 0 || c.noShows > 0;
        return (
          <div key={i} className={`${GLASS_CARD} !p-4 relative overflow-hidden`}
            style={{ borderColor: hasIssue ? "rgba(244,63,94,0.25)" : undefined }}>
            {/* Branch name */}
            <div className="font-semibold text-white text-sm truncate mb-3">{c.name}</div>

            {/* Sales */}
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{t.sales}</div>
                <div className="text-lg font-bold text-emerald-400">
                  {salesVal != null ? fmt(salesVal) : <span className="text-neutral-600 text-xs">POS pending</span>}
                </div>
              </div>
              {c.orders != null && c.orders > 0 ? (
                <div className="text-right">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{t.orders}</div>
                  <div className="text-base font-semibold text-violet-300">{c.orders.toLocaleString()}</div>
                </div>
              ) : salesVal == null ? null : null}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-1 text-center">
              <StatPill label={t.absent} value={c.absences} bad={c.absences > 0} badColor="#f43f5e" />
              <StatPill label={t.late} value={c.lateCount} bad={c.lateCount > 0} badColor="#f59e0b" />
              <StatPill label={t.ot} value={c.otMinutes > 0 ? fmtMin(c.otMinutes) : "—"} bad={false} />
              {c.adherenceRate != null
                ? <StatPill label={t.adherence} value={`${c.adherenceRate}%`} bad={c.adherenceRate < 75} badColor={rateColor(c.adherenceRate)} valueColor={rateColor(c.adherenceRate)} />
                : <StatPill label={t.adherence} value="—" bad={false} />
              }
            </div>

            {/* Bottom row: rating, disposal, backup */}
            {(c.avgRating != null || c.disposalCount > 0 || c.backupCount > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {c.avgRating != null && (
                  <span className="text-[10px] font-medium" style={{ color: starColor(c.avgRating) }}>★ {c.avgRating.toFixed(2)}</span>
                )}
                {c.disposalCount > 0 && (
                  <span className="text-[10px] text-orange-400 flex items-center gap-0.5"><Package className="h-2.5 w-2.5" />{t.disposal} ×{c.disposalCount}</span>
                )}
                {c.backupCount > 0 && (
                  <span className="text-[10px] text-blue-400 flex items-center gap-0.5"><Archive className="h-2.5 w-2.5" />{t.backup} ×{c.backupCount}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, bad, badColor, valueColor }: { label: string; value: string | number; bad: boolean; badColor?: string; valueColor?: string }) {
  const col = valueColor ?? (bad && badColor ? badColor : bad ? "#f43f5e" : "#a1a1aa");
  return (
    <div className="rounded-md bg-white/5 py-1.5 px-1">
      <div className="text-[9px] text-neutral-600 uppercase tracking-wide truncate">{label}</div>
      <div className="text-xs font-semibold mt-0.5 truncate" style={{ color: col }}>{value}</div>
    </div>
  );
}

// ── Sales Detail ──────────────────────────────────────────────────────────────
function SalesDetail({ data, city, t }: { data: ReportData; city: string; t: T }) {
  const pos = data.sales?.pos_sales;
  const ds = data.sales?.daily_sales;
  const oc = data.sales?.order_counts;

  if (city === "dubai") {
    if (!pos && !oc) return <p className={T_CAPTION}>{t.noData}</p>;

    const posHasData = (pos?.rows?.length ?? 0) > 0;
    const ocTotal = oc?.total ?? 0;

    // Aggregate by branch (sum over aggregators)
    const byBranch = new Map<string, { net: number; gross: number; orders: number; aggs: string[] }>();
    for (const r of pos?.rows ?? []) {
      const n = r.branch_name || r.branch_code || "—";
      const cur = byBranch.get(n) ?? { net: 0, gross: 0, orders: 0, aggs: [] };
      cur.net += r.net_sales ?? 0;
      cur.gross += r.gross_sales ?? 0;
      cur.orders += r.order_count ?? 0;
      if (r.aggregator_name && !cur.aggs.includes(r.aggregator_name)) cur.aggs.push(r.aggregator_name);
      byBranch.set(n, cur);
    }
    const rows = Array.from(byBranch.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.net - a.net);
    const maxNet = Math.max(...rows.map(r => r.net), 1);

    return (
      <div className="space-y-4">
        {/* POS pending banner */}
        {!posHasData && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-semibold">UrbanPiper POS data not yet imported</span>
              <span className="text-amber-400/70 ml-2 text-xs">Upload the Revenue by Location CSV in Analytics → Dubai Sales to populate AED figures.</span>
              {ocTotal > 0 && <div className="mt-0.5 text-xs text-amber-200">Order counts from aggregator entries: <strong>{ocTotal.toLocaleString()}</strong> orders</div>}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={KPI_CARD}><div className={KPI_LABEL}>Net Sales</div><div className={`${KPI_VALUE} ${posHasData ? "text-emerald-400" : "text-neutral-600"}`}>{pos && posHasData ? fmtAED(pos.total_net_sales) : "—"}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>{t.grossSales}</div><div className={KPI_VALUE}>{pos && posHasData ? fmtAED(pos.total_gross_sales) : "—"}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>{t.orders}</div><div className={`${KPI_VALUE} text-violet-300`}>{posHasData ? pos!.total_orders.toLocaleString() : ocTotal > 0 ? ocTotal.toLocaleString() : "—"}</div></div>
          <div className={KPI_CARD}><div className={KPI_LABEL}>{t.avgOrder}</div><div className={`${KPI_VALUE} text-blue-300`}>{pos && posHasData && pos.total_orders > 0 ? fmtAED(pos.total_net_sales / pos.total_orders) : "—"}</div></div>
        </div>

        {/* Bar chart */}
        {rows.length > 0 && (
          <div className={GLASS_CARD}>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.slice(0, 15)} margin={{ top: 4, right: 8, left: 8, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtAED(v)} contentStyle={{ background: "#1e1b2e", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8 }} />
                  <Bar dataKey="net" name="Net Sales" radius={[3,3,0,0]}>
                    {rows.slice(0,15).map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <div className={GLASS_CARD}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className={TABLE_HEADER}>{t.branch}</th>
                  <th className={TABLE_HEADER}>{t.netSales}</th>
                  <th className={TABLE_HEADER}>{t.orders}</th>
                  <th className={TABLE_HEADER}>{t.avgOrder}</th>
                  <th className={TABLE_HEADER}>{t.aggregator}</th>
                </tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <div className="font-medium">{r.name}</div>
                      <MiniBar value={r.net} max={maxNet} />
                    </td>
                    <td className={TABLE_CELL}><span className="font-mono text-emerald-400">{fmtAED(r.net)}</span></td>
                    <td className={TABLE_CELL}>{r.orders.toLocaleString()}</td>
                    <td className={TABLE_CELL}>{r.orders > 0 ? fmtAED(r.net / r.orders) : "—"}</td>
                    <td className={TABLE_CELL}><span className="text-xs text-neutral-400">{r.aggs.join(", ") || "—"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Order counts by aggregator / brand */}
        {(oc?.by_aggregator ?? []).length > 0 && (
          <div className={GLASS_CARD}>
            <p className="text-xs font-semibold text-neutral-400 mb-3">{t.aggregator} Orders</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(oc!.by_aggregator as AggRow[]).map((r, i) => (
                <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                  <div className="text-xs text-neutral-400 truncate">{r.aggregator}</div>
                  <div className="text-base font-bold text-violet-300 mt-0.5">{r.order_count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(oc?.by_brand ?? []).length > 0 && (
          <div className={GLASS_CARD}>
            <p className="text-xs font-semibold text-neutral-400 mb-3">{t.brand} Orders</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(oc!.by_brand as BrandRow[]).map((r, i) => (
                <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                  <div className="text-xs text-neutral-400 truncate">{r.brand}</div>
                  <div className="text-base font-bold text-purple-300 mt-0.5">{r.order_count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Manila
  if (!ds && !oc) return <p className={T_CAPTION}>{t.noData}</p>;
  const mRows = ds?.rows.slice().sort((a,b) => (b.total_amount??0)-(a.total_amount??0)) ?? [];
  const maxAmt = Math.max(...mRows.map(r=>r.total_amount??0), 1);
  const byChannel = ds?.by_channel ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.totalSales}</div><div className={`${KPI_VALUE} text-emerald-400`}>{ds ? fmtPHP(ds.total_amount) : "—"}</div></div>
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.orders}</div><div className={`${KPI_VALUE} text-violet-300`}>{ds ? ds.total_orders.toLocaleString() : "—"}</div></div>
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.transactions}</div><div className={KPI_VALUE}>{oc ? (oc.total_transactions ?? 0).toLocaleString() : "—"}</div></div>
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.avgOrder}</div><div className={`${KPI_VALUE} text-blue-300`}>{ds && ds.total_orders > 0 ? fmtPHP(ds.total_amount / ds.total_orders) : "—"}</div></div>
      </div>

      {byChannel.length > 0 && (
        <div className={GLASS_CARD}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {byChannel.map((ch, i) => (
              <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="text-xs text-neutral-400">{ch.channel}</div>
                <div className="text-base font-bold text-violet-300 mt-0.5">{ch.orders.toLocaleString()}</div>
                <div className="text-xs text-emerald-400">{fmtPHP(ch.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mRows.length > 0 && (
        <div className={GLASS_CARD}>
          <div className="h-52 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mRows.slice(0,15)} margin={{ top: 4, right: 8, left: 8, bottom: 56 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="branch" tick={{ fill: "#a1a1aa", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtPHP(v)} contentStyle={{ background: "#1e1b2e", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8 }} />
                <Bar dataKey="total_amount" name={t.totalSales} radius={[3,3,0,0]}>
                  {mRows.slice(0,15).map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={TABLE_HEADER}>{t.branch}</th>
                <th className={TABLE_HEADER}>{t.totalSales}</th>
                <th className={TABLE_HEADER}>{t.orders}</th>
                <th className={TABLE_HEADER}>Dine-in</th>
                <th className={TABLE_HEADER}>Grab</th>
                <th className={TABLE_HEADER}>Panda</th>
                <th className={TABLE_HEADER}>Beep</th>
              </tr></thead>
              <tbody>{mRows.map((r, i) => (
                <tr key={i} className={TABLE_ROW}>
                  <td className={TABLE_CELL}><div className="font-medium">{r.branch||"—"}</div><MiniBar value={r.total_amount??0} max={maxAmt} /></td>
                  <td className={TABLE_CELL}><span className="font-mono text-emerald-400">{fmtPHP(r.total_amount??0)}</span></td>
                  <td className={TABLE_CELL}>{(r.total_orders??0).toLocaleString()}</td>
                  <td className={TABLE_CELL}>{r.dine_in_orders??"-"}</td>
                  <td className={TABLE_CELL}>{r.grabfood_orders??"-"}</td>
                  <td className={TABLE_CELL}>{r.foodpanda_orders??"-"}</td>
                  <td className={TABLE_CELL}>{r.beep_orders??"-"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attendance Detail ─────────────────────────────────────────────────────────
function AttendanceDetail({ data, t }: { data: ReportData; t: T }) {
  const att = data.attendance;
  const otBranches = att.overtime_by_branch?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Absences */}
      <div className={GLASS_CARD}>
        <p className="text-xs font-semibold text-rose-400 mb-2">{t.absences} ({att.absences.length})</p>
        {att.absences.length === 0 ? <EmptyNote msg={t.noAbsences} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={TABLE_HEADER}>{t.staffName}</th>
                <th className={TABLE_HEADER}>{t.branch}</th>
                <th className={TABLE_HEADER}>{t.type}</th>
                <th className={TABLE_HEADER}>{t.note}</th>
              </tr></thead>
              <tbody>{att.absences.map((r,i) => (
                <tr key={i} className={TABLE_ROW}>
                  <td className={TABLE_CELL}>{r.staff_name||"—"}</td>
                  <td className={TABLE_CELL}>{r.branch||"—"}</td>
                  <td className={TABLE_CELL}><span className={BADGE_ERROR}>{r.absence_type}</span></td>
                  <td className={TABLE_CELL}>{r.note||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Late */}
      <div className={GLASS_CARD}>
        <p className="text-xs font-semibold text-amber-400 mb-2">{t.lateArrivals} ({att.late.length})</p>
        {att.late.length === 0 ? <EmptyNote msg={t.noLate} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={TABLE_HEADER}>{t.staffName}</th>
                <th className={TABLE_HEADER}>{t.branch}</th>
                <th className={TABLE_HEADER}>{t.lateDuration}</th>
              </tr></thead>
              <tbody>{att.late.slice().sort((a,b)=>(b.late_minutes??0)-(a.late_minutes??0)).map((r,i) => (
                <tr key={i} className={TABLE_ROW}>
                  <td className={TABLE_CELL}>{r.staff_name||"—"}</td>
                  <td className={TABLE_CELL}>{r.branch||"—"}</td>
                  <td className={TABLE_CELL}><span className={(r.late_minutes??0)>=30?BADGE_ERROR:BADGE_WARNING}>{fmtMin(r.late_minutes??0)}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* No-shows */}
      {att.no_show.length > 0 && (
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold text-orange-400 mb-2">{t.noShows} ({att.no_show.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={TABLE_HEADER}>{t.staffName}</th>
                <th className={TABLE_HEADER}>{t.scheduledBranch}</th>
              </tr></thead>
              <tbody>{att.no_show.map((r,i) => (
                <tr key={i} className={TABLE_ROW}>
                  <td className={TABLE_CELL}>{r.staff_name||"—"}</td>
                  <td className={TABLE_CELL}>{r.scheduled_branch_code||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* OT by branch */}
      {otBranches.length > 0 && (
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold text-violet-400 mb-2">{t.totalOT} by {t.branch}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={TABLE_HEADER}>{t.branch}</th>
                <th className={TABLE_HEADER}>{t.staffCount}</th>
                <th className={TABLE_HEADER}>{t.totalOT}</th>
                <th className={TABLE_HEADER}>{t.avgOT}</th>
              </tr></thead>
              <tbody>{otBranches.slice().sort((a,b)=>(b.total_overtime_minutes??0)-(a.total_overtime_minutes??0)).map((r,i) => (
                <tr key={i} className={TABLE_ROW}>
                  <td className={TABLE_CELL}>{r.branch_code||"—"}</td>
                  <td className={TABLE_CELL}>{r.staff_count??0}</td>
                  <td className={TABLE_CELL}><span className="text-violet-300">{fmtMin(r.total_overtime_minutes??0)}</span></td>
                  <td className={TABLE_CELL}>{fmtMin(Math.round(r.avg_overtime_minutes??0))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Adherence Detail ──────────────────────────────────────────────────────────
function AdherenceDetail({ data, t }: { data: ReportData; t: T }) {
  const adh = data.adherence;
  if (!adh || adh.rows.length === 0) return <p className={T_CAPTION}>{t.noData}</p>;
  const isPending = adh.total_attended === 0 && adh.total_scheduled > 0;
  const maxS = Math.max(...adh.rows.map(r=>r.scheduled_shifts), 1);
  return (
    <div className="space-y-3">
      {isPending && (
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 px-4 py-3 text-sm text-blue-300 flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-blue-400" />
          <span>Attendance clock data not yet synced for this date — adherence will update once clocks are exported.</span>
        </div>
      )}
    <div className={GLASS_CARD}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.adherenceRate}</div><div className={KPI_VALUE} style={{color: isPending ? "#71717a" : rateColor(adh.overall_rate)}}>{isPending ? "Pending" : `${adh.overall_rate}%`}</div></div>
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.scheduledShifts}</div><div className={KPI_VALUE}>{adh.total_scheduled}</div></div>
        <div className={KPI_CARD}><div className={KPI_LABEL}>{t.attendedShifts}</div><div className={`${KPI_VALUE} text-emerald-400`}>{adh.total_attended}</div></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TABLE_HEADER}>{t.branch}</th>
            <th className={TABLE_HEADER}>{t.scheduledShifts}</th>
            <th className={TABLE_HEADER}>{t.attendedShifts}</th>
            <th className={TABLE_HEADER}>{t.noShowCount}</th>
            <th className={TABLE_HEADER}>{t.staffCount}</th>
            <th className={TABLE_HEADER}>{t.adherenceRate}</th>
          </tr></thead>
          <tbody>{adh.rows.slice().sort((a,b)=>a.adherence_rate-b.adherence_rate).map((r,i) => (
            <tr key={i} className={TABLE_ROW}>
              <td className={TABLE_CELL}><div className="font-medium">{r.branch_code||"—"}</div><MiniBar value={r.scheduled_shifts} max={maxS} color="#6366f1" /></td>
              <td className={TABLE_CELL}>{r.scheduled_shifts}</td>
              <td className={TABLE_CELL}>{r.attended_shifts}</td>
              <td className={TABLE_CELL}>{r.no_show_count>0?<span className={BADGE_ERROR}>{r.no_show_count}</span>:<span className={BADGE_SUCCESS}>0</span>}</td>
              <td className={TABLE_CELL}>{r.staff_count}</td>
              <td className={TABLE_CELL}><span className="font-semibold" style={{color: isPending ? "#71717a" : rateColor(r.adherence_rate)}}>{isPending ? "—" : `${r.adherence_rate}%`}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

// ── Lean Shift Detail ─────────────────────────────────────────────────────────
function LeanShiftDetail({ data, t }: { data: ReportData; t: T }) {
  const ls = data.lean_shift;
  if (!ls || ls.rows.length === 0) return <p className={T_CAPTION}>{t.noData}</p>;
  return (
    <div className={GLASS_CARD}>
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className={KPI_LABEL}>{t.totalReducible}:</span>
        <span className="font-semibold text-amber-400">{fmtMin(ls.total_reducible_ot_minutes)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TABLE_HEADER}>{t.branch}</th>
            <th className={TABLE_HEADER}>{t.dayName}</th>
            <th className={TABLE_HEADER}>{t.shiftCount}</th>
            <th className={TABLE_HEADER}>{t.avgCheckin}</th>
            <th className={TABLE_HEADER}>{t.avgCheckout}</th>
            <th className={TABLE_HEADER}>{t.leanStart}</th>
            <th className={TABLE_HEADER}>{t.avgOT}</th>
            <th className={TABLE_HEADER}>{t.reducibleOT}</th>
          </tr></thead>
          <tbody>{ls.rows.map((r,i) => {
            const red = r.reducible_ot_per_shift ?? Math.max(0,(r.lean_start_hour-r.avg_checkin_hour)*60);
            return (
              <tr key={i} className={TABLE_ROW}>
                <td className={TABLE_CELL}>{r.branch_code||"—"}</td>
                <td className={TABLE_CELL}>{r.day_name}</td>
                <td className={TABLE_CELL}>{r.shift_count}</td>
                <td className={TABLE_CELL}><span className="font-mono text-blue-300">{fmtHr(r.avg_checkin_hour)}</span></td>
                <td className={TABLE_CELL}><span className="font-mono text-violet-300">{fmtHr(r.avg_checkout_hour)}</span></td>
                <td className={TABLE_CELL}><span className="font-mono text-emerald-400">{fmtHr(r.lean_start_hour)}</span></td>
                <td className={TABLE_CELL}>{Math.round(r.avg_ot_minutes)}m</td>
                <td className={TABLE_CELL}>{red>0?<span className="text-amber-400">{Math.round(red)}m</span>:<span className="text-neutral-600">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ratings Detail ────────────────────────────────────────────────────────────
function RatingsDetail({ data, t }: { data: ReportData; t: T }) {
  const rat = data.ratings;
  if (!rat || rat.count === 0) return <p className={T_CAPTION}>{t.noData}</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rat.by_aggregator.map((r,i) => (
          <div key={i} className={KPI_CARD}>
            <div className={KPI_LABEL}>{r.aggregator}</div>
            <div className={KPI_VALUE} style={{color:starColor(r.avg_score)}}>★ {r.avg_score.toFixed(2)}</div>
            <div className="text-[10px] text-neutral-600">{r.count} entries</div>
          </div>
        ))}
      </div>
      <div className={GLASS_CARD}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className={TABLE_HEADER}>{t.brand}</th>
              <th className={TABLE_HEADER}>{t.aggregator}</th>
              <th className={TABLE_HEADER}>{t.branch}</th>
              <th className={TABLE_HEADER}>{t.ratingScore}</th>
              <th className={TABLE_HEADER}>{t.reviews}</th>
            </tr></thead>
            <tbody>{rat.rows.map((r,i) => (
              <tr key={i} className={TABLE_ROW}>
                <td className={TABLE_CELL}>{r.brand||"—"}</td>
                <td className={TABLE_CELL}>{r.aggregator||"—"}</td>
                <td className={TABLE_CELL}>{r.branch||"—"}</td>
                <td className={TABLE_CELL}>{r.rating_score!=null?<span className="font-semibold" style={{color:starColor(r.rating_score)}}>★ {Number(r.rating_score).toFixed(2)}</span>:"—"}</td>
                <td className={TABLE_CELL}>{r.review_count||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Disposal/Backup ───────────────────────────────────────────────────────────
function DisposalDetail({ data, t }: { data: ReportData; t: T }) {
  const disp = data.disposal;
  if (!disp || disp.rows.length === 0) return <EmptyNote msg={t.noData} />;
  return (
    <div className="space-y-3">
      {disp.rows.map((rpt,ri) => (
        <div key={ri} className={GLASS_CARD}>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="font-semibold text-sm">{rpt.branch_code||"—"}</span>
            <span className="text-xs text-neutral-500">{t.shift}: {rpt.shift||"—"}</span>
            <span className="text-xs text-neutral-500">{t.reportedBy}: {rpt.reported_by||"—"}</span>
            <span className={rpt.status==="submitted"?BADGE_SUCCESS:BADGE_WARNING}>{rpt.status}</span>
          </div>
          {rpt.lines?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>
                  <th className={TABLE_HEADER}>Item</th><th className={TABLE_HEADER}>Qty</th><th className={TABLE_HEADER}>Reason</th>
                </tr></thead>
                <tbody>{rpt.lines.map((ln,li) => (
                  <tr key={li} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>{ln.item_name_snapshot||"—"}</td>
                    <td className={TABLE_CELL}>{ln.quantity??""} {ln.unit||""}</td>
                    <td className={TABLE_CELL}>{ln.disposal_reason||"—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BackupDetail({ data, t }: { data: ReportData; t: T }) {
  const bkp = data.backup;
  if (!bkp || bkp.rows.length === 0) return <EmptyNote msg={t.noData} />;
  return (
    <div className="space-y-3">
      {bkp.rows.map((rpt,ri) => (
        <div key={ri} className={GLASS_CARD}>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="font-semibold text-sm">{rpt.branch_code||"—"}</span>
            <span className="text-xs text-neutral-500">{t.shift}: {rpt.shift||"—"}</span>
            <span className="text-xs text-neutral-500">{t.reportedBy}: {rpt.reported_by||"—"}</span>
            <span className={rpt.status==="submitted"?BADGE_SUCCESS:BADGE_WARNING}>{rpt.status}</span>
          </div>
          {rpt.lines?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>
                  <th className={TABLE_HEADER}>Section</th><th className={TABLE_HEADER}>Item</th><th className={TABLE_HEADER}>Qty</th>
                </tr></thead>
                <tbody>{rpt.lines.map((ln,li) => (
                  <tr key={li} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>{ln.section||"—"}</td>
                    <td className={TABLE_CELL}>{ln.item_name_snapshot||"—"}</td>
                    <td className={TABLE_CELL}>{ln.quantity??""} {ln.unit||""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DailyReportPage() {
  const router = useRouter();
  const auth = getAuth();
  const [lang, setLang] = useState<Lang>("en");
  const t: T = TR[lang];
  const [city, setCity] = useState<City>("dubai");
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateDate, setGenerateDate] = useState(() => {
    // Default to yesterday PHT
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      if (!auth?.accessToken) { router.replace("/login?next=%2Fadmin%2Fdaily-report"); return; }
      const a = (await refreshAuthFromApi(auth, { includeMfa: true })) || auth;
      const role = String(a?.role || "").toUpperCase();
      const can = canAccessAnalyticsAdmin(a) || role === "HQ" || role === "ADMIN";
      setAllowed(can);
      if (can) setReady(true);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReports = useCallback(async (c: City) => {
    setLoading(true); setError("");
    try {
      const json = await apiGet<{ ok: boolean; reports: ReportEntry[] }>(
        `/api/admin/daily-report/latest?city=${encodeURIComponent(c)}&limit=7`
      );
      const list = json.reports || [];
      setReports(list);
      if (list.length > 0) setSelectedDate(list[0].report_date);
      else setSelectedDate("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (ready) void fetchReports(city); }, [ready, city, fetchReports]);

  // Auto-refresh at 13:15 PHT and 15:15 PHT (= 05:15 UTC and 07:15 UTC)
  useEffect(() => {
    if (!ready) return;
    // UTC hours/minutes for each auto-refresh target (PHT = UTC+8)
    const TARGETS_UTC: { hour: number; minute: number }[] = [
      { hour: 5, minute: 15 },  // 13:15 PHT
      { hour: 7, minute: 15 },  // 15:15 PHT
    ];
    function msUntilNextTarget(): number {
      const nowMs = Date.now();
      // Express "now" as a PHT date to get today's calendar date in PHT
      const phtOffsetMs = 8 * 60 * 60 * 1000;
      const nowPht = new Date(nowMs + phtOffsetMs);
      // Midnight of today (PHT) expressed in UTC ms
      const todayMidnightUtcMs =
        Date.UTC(nowPht.getUTCFullYear(), nowPht.getUTCMonth(), nowPht.getUTCDate()) - phtOffsetMs;
      // Build absolute UTC ms for each target today
      const todayTargets = TARGETS_UTC.map(({ hour, minute }) =>
        todayMidnightUtcMs + (hour * 60 + minute) * 60 * 1000
      );
      // Next target strictly after now
      const future = todayTargets.filter((t) => t > nowMs);
      if (future.length > 0) return Math.min(...future) - nowMs;
      // All today's targets are past → schedule tomorrow's first target
      return todayTargets[0] + 24 * 60 * 60 * 1000 - nowMs;
    }
    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const ms = msUntilNextTarget();
      timer = setTimeout(() => {
        void fetchReports(city);
        scheduleNext(); // schedule the following target
      }, ms);
    }
    scheduleNext();
    return () => clearTimeout(timer);
  }, [ready, city, fetchReports]);

  const handleGenerate = async () => {
    const label = city === "dubai" ? "Dubai" : "Manila";
    if (!window.confirm(`Generate report for ${label} on ${generateDate}?`)) return;
    setGenerating(true); setError("");
    try {
      // Call per-city to avoid Heroku H12 30-second timeout (generating both at once is too slow)
      const [dubaiRes, manilaRes] = await Promise.all([
        apiPost<{ ok: boolean; results?: Record<string, { ok: boolean; error?: string }> }>(
          `/api/admin/daily-report/generate?report_date=${encodeURIComponent(generateDate)}&city=dubai`, {}
        ),
        apiPost<{ ok: boolean; results?: Record<string, { ok: boolean; error?: string }> }>(
          `/api/admin/daily-report/generate?report_date=${encodeURIComponent(generateDate)}&city=manila`, {}
        ),
      ]);
      const errs: string[] = [];
      for (const [cityKey, res] of Object.entries({ dubai: dubaiRes, manila: manilaRes })) {
        const cityResult = res.results?.[cityKey];
        if (cityResult && !cityResult.ok) errs.push(`${cityKey}: ${cityResult.error || "unknown error"}`);
      }
      if (errs.length) setError(errs.join(" | "));
      await fetchReports(city);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGenerating(false); }
  };

  const currentReport = reports.find(r => r.report_date === selectedDate);
  const data = currentReport?.data;

  const branchCards = useMemo(() => data ? buildBranchCards(data, city) : [], [data, city]);

  // Global KPIs
  const totalSales = city === "dubai"
    ? data?.sales?.pos_sales?.total_net_sales
    : data?.sales?.daily_sales?.total_amount;
  const totalOrders = city === "dubai"
    ? ((data?.sales?.pos_sales?.total_orders ?? 0) > 0
        ? data!.sales!.pos_sales!.total_orders
        : (data?.sales?.order_counts?.total ?? undefined))
    : data?.sales?.daily_sales?.total_orders;
  const absCount = data?.attendance.absences.length ?? 0;
  const lateCount = data?.attendance.late.length ?? 0;
  const noShowCount = data?.attendance.no_show.length ?? 0;
  const otMin = data?.attendance.overtime_summary?.total_overtime_minutes ?? 0;
  const overallAdh = data?.adherence?.overall_rate;
  const adhPending = (data?.adherence?.total_attended ?? 0) === 0 && (data?.adherence?.total_scheduled ?? 0) > 0;
  const avgRat = data?.ratings?.avg_rating;

  const isHQAdmin = auth && ["HQ","ADMIN"].includes(String(auth.role||"").toUpperCase());

  if (!allowed) return (
    <div className={`${GLASS_CARD} p-5`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-red-400" />
        <div><h1 className={T_SECTION}>Daily Report</h1><p className="mt-1 text-sm text-red-300">{t.accessDenied}</p></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen space-y-6 pb-12 text-white">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`${T_PAGE_TITLE} flex items-center gap-2`}>
              <CalendarDays className="h-5 w-5 text-violet-400" />{t.pageTitle}
            </h1>
            <p className={T_CAPTION}>{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setLang(l => l==="en"?"ja":"en")}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors">
              <Globe className="h-3.5 w-3.5" />{lang==="en"?"日本語":"English"}
            </button>
            <button onClick={() => void fetchReports(city)} disabled={loading} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`} />{t.refresh}
            </button>
            {isHQAdmin && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={generateDate}
                  onChange={e => setGenerateDate(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button onClick={() => void handleGenerate()} disabled={generating||loading} className={PRIMARY_BUTTON}>
                  {generating ? t.generating : t.generateNow}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          <span className="font-semibold">{t.errorPrefix}:</span> {error}
        </div>
      )}

      {/* City + date row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={TAB_CONTAINER}>
          {(["dubai","manila"] as City[]).map(c => (
            <button key={c} className={city===c?TAB_ACTIVE:TAB_INACTIVE}
              onClick={() => { setCity(c); setReports([]); setSelectedDate(""); }}>
              {c==="dubai"?"🇦🇪 Dubai":"🇵🇭 Manila"}
            </button>
          ))}
        </div>
        {reports.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {reports.map(r => (
              <button key={r.report_date} onClick={() => setSelectedDate(r.report_date)}
                className={["rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedDate===r.report_date?"bg-violet-600 text-white":"bg-white/8 text-neutral-400 hover:bg-white/12 hover:text-white"].join(" ")}>
                {r.report_date}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      )}

      {!loading && reports.length === 0 && !error && (
        <div className={`${GLASS_CARD} py-12 text-center`}>
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
          <p className={T_BODY}>{t.noReports}</p>
          <p className={`${T_CAPTION} mt-1`}>{t.noReportsHint}</p>
        </div>
      )}

      {!loading && data && (
        <motion.div key={`${city}-${selectedDate}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
            <span>{t.reportDate}: <span className="font-semibold text-neutral-200">{data.report_date}</span></span>
            {currentReport?.generated_at && (
              <span>{t.generatedAt}: <span className="text-neutral-400">
                {new Date(currentReport.generated_at).toLocaleString(lang==="ja"?"ja-JP":"en-US", { timeZone: "Asia/Manila" })} PHT
              </span></span>
            )}
          </div>

          {/* ① Day at a Glance — global KPIs */}
          <section>
            <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title={t.sec_overview} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: t.totalSales, value: totalSales != null ? (city==="dubai"?fmtAED(totalSales):fmtPHP(totalSales)) : "—", color: "#10b981" },
                { label: t.totalOrders, value: totalOrders != null ? totalOrders.toLocaleString() : "—", color: "#a78bfa" },
                { label: t.absences, value: absCount, color: absCount>0?"#f43f5e":"#10b981" },
                { label: t.lateArrivals, value: lateCount, color: lateCount>0?"#f59e0b":"#10b981" },
                { label: t.noShows, value: noShowCount, color: noShowCount>0?"#f97316":"#10b981" },
                { label: t.totalOT, value: otMin>0?fmtMin(otMin):"—", color: otMin>0?"#a78bfa":"#71717a" },
                ...(overallAdh!=null ? [{ label: t.adherenceRate, value: adhPending ? "Pending" : `${overallAdh}%`, color: adhPending ? "#71717a" : rateColor(overallAdh) }] : []),
                ...(avgRat!=null ? [{ label: t.avgRating, value: `★ ${avgRat.toFixed(2)}`, color: starColor(avgRat) }] : []),
              ].map((k,i) => (
                <div key={i} className={KPI_CARD}>
                  <div className={KPI_LABEL}>{k.label}</div>
                  <div className={KPI_VALUE} style={{ color: typeof k.color === "string" ? k.color : undefined }}>{String(k.value)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ② By Branch — compact cards per store */}
          <section>
            <SectionHeader icon={<Building2 className="h-4 w-4" />} title={t.sec_branch} />
            {branchCards.length === 0
              ? <p className={T_CAPTION}>{t.noData}</p>
              : <BranchCardGrid cards={branchCards} city={city} t={t} />
            }
          </section>

          {/* ③ Sales Detail */}
          <section>
            <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title={t.sec_sales} />
            <SalesDetail data={data} city={city} t={t} />
          </section>

          {/* ④ Attendance Detail */}
          <section>
            <SectionHeader icon={<Users className="h-4 w-4" />} title={t.sec_attendance} />
            <AttendanceDetail data={data} t={t} />
          </section>

          {/* ⑤ Adherence */}
          {(data.adherence?.rows?.length ?? 0) > 0 && (
            <section>
              <SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title={t.sec_adherence} />
              <AdherenceDetail data={data} t={t} />
            </section>
          )}

          {/* ⑥ Lean Shift */}
          {(data.lean_shift?.rows?.length ?? 0) > 0 && (
            <section>
              <SectionHeader icon={<Zap className="h-4 w-4" />} title={t.sec_lean} />
              <LeanShiftDetail data={data} t={t} />
            </section>
          )}

          {/* ⑦ Ratings */}
          {(data.ratings?.count ?? 0) > 0 && (
            <section>
              <SectionHeader icon={<Star className="h-4 w-4" />} title={t.sec_ratings} />
              <RatingsDetail data={data} t={t} />
            </section>
          )}

          {/* ⑧ Disposal */}
          {(data.disposal?.total_reports ?? 0) > 0 && (
            <section>
              <SectionHeader icon={<Package className="h-4 w-4" />} title={t.sec_disposal} />
              <DisposalDetail data={data} t={t} />
            </section>
          )}

          {/* ⑨ Backup */}
          {(data.backup?.total_reports ?? 0) > 0 && (
            <section>
              <SectionHeader icon={<Archive className="h-4 w-4" />} title={t.sec_backup} />
              <BackupDetail data={data} t={t} />
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
}
