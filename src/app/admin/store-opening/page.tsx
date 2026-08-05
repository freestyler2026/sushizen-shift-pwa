"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, ChevronDown, ChevronRight, Check, Pencil, X, AlertTriangle, Trash2 } from "lucide-react";
import { getAuth, canAccessStoreOpeningAdmin } from "@/lib/auth";
import { GLASS_CARD, T_PAGE_TITLE, PRIMARY_BUTTON } from "@/lib/ui-tokens";
import { API_BASE } from "@/lib/api";

// ─── Checklist definition ──────────────────────────────────────────────────

interface TaskItem {
  key: string;
  label: string;
  dDay: number;
}

interface Section {
  title: string;
  items: TaskItem[];
}

function t(key: string, label: string, dDay: number): TaskItem {
  return { key, label, dDay };
}

const CHECKLIST_SECTIONS: Section[] = [
  {
    title: "① 出店候補選定 (D+1 〜 D+14)",
    items: [
      t("0",  "出店エリア検討", 3),
      t("1",  "商圏調査", 5),
      t("2",  "競合調査", 5),
      t("3",  "売上シミュレーション", 7),
      t("4",  "候補物件リスト作成（モール・路面店）", 7),
      t("5",  "リーシング担当（ブローカー含）・オーナーへアプローチ", 9),
      t("6",  "ミーティング設定", 10),
      t("7",  "Company Profile提出", 10),
      t("8",  "店舗視察・内覧", 12),
      t("9",  "現地確認", 12),
      t("10", "条件ヒアリング", 13),
      t("11", "LOI提出", 14),
    ],
  },
  {
    title: "② 出店判断・基本プラン (D+15 〜 D+25)",
    items: [
      t("12", "Offer Sheet受領", 17),
      t("13", "賃料・契約条件確認", 18),
      t("14", "CAM確認（モールの場合）", 18),
      t("15", "Percentage Rent確認", 19),
      t("16", "Delivery売上のPercentage Rent算入可否を書面で確定", 19),
      t("17", "実測（内装会社、キッチン機器会社同席）", 19),
      t("18", "レイアウト案作成", 21),
      t("19", "Interiorデザインイメージ作成", 21),
      t("20", "Contractorへ図面共有", 22),
      t("21", "内装工事見積取得", 24),
      t("22", "厨房設備見積取得", 24),
      t("23", "初期投資シミュレーション更新", 25),
      t("24", "出店可否最終判断", 25),
    ],
  },
  {
    title: "③ 契約締結 (D+26 〜 D+32)",
    items: [
      t("25", "Offer Sheet締結", 27),
      t("26", "Turn Over日確認（目標：D+40）", 27),
      t("27", "Lease Agreementレビュー", 30),
      t("28", "Lease Agreement締結", 32),
      t("29", "Security Deposit支払い", 32),
      t("30", "Advance Rent支払い", 32),
    ],
  },
  {
    title: "④ 長納期・事前準備 — 中国発注 (D+33 〜 D+52)",
    items: [
      t("31", "内装素材（タイル、壁紙など）発注 ／ 着荷目標 D+65", 40),
      t("32", "テーブルトップチラー発注 ／ 着荷目標 D+78", 42),
      t("33", "包材関係（Sushi Box / Soy Sauce Bottle等）発注 ／ 着荷目標 D+88", 45),
      t("34", "食器関係発注 ／ 着荷目標 D+88", 45),
      t("35", "ユニフォーム発注 ／ 着荷目標 D+85", 50),
      t("36", "全発注のB/L・ETA・通関業者アサイン確認", 52),
    ],
  },
  {
    title: "④ 長納期・事前準備 — 税務・BIR",
    items: [
      t("37", "BIR Form 1905（RDO移転／支店登録）申請", 38),
      t("38", "POS Machine Permit to Use（PTU）申請", 40),
      t("39", "POS Machine PTU 取得", 80),
      t("40", "ATP（Authority to Print）申請", 40),
      t("41", "Official Receipt / Invoice 印刷納品", 85),
    ],
  },
  {
    title: "④ 長納期・事前準備 — デリバリー",
    items: [
      t("42", "Grab Merchant申請開始", 36),
      t("43", "Foodpanda Merchant申請開始", 36),
      t("44", "必要書類提出", 40),
      t("45", "メニュー・価格・写真データ入稿", 70),
      t("46", "両プラットフォーム掲載承認取得", 88),
    ],
  },
  {
    title: "④ 長納期・事前準備 — 決済・インフラ",
    items: [
      t("47", "Credit Card Terminal申請", 42),
      t("48", "GCash申請", 42),
      t("49", "Maya申請", 42),
      t("50", "Internet回線申込", 38),
      t("51", "Wi-Fi手配", 40),
    ],
  },
  {
    title: "④ 長納期・事前準備 — 人員計画",
    items: [
      t("52", "必要人数算出", 34),
      t("53", "Store Manager候補確定（社内異動検討）", 42),
      t("54", "Assistant Manager候補確定（社内異動検討）", 45),
      t("55", "Kitchen PIC候補確定（社内異動検討）", 45),
      t("56", "不足人員 採用開始", 48),
      t("57", "既存店舗でのトレーニング開始", 55),
      t("58", "全人員 採用完了", 70),
      t("59", "トレーニング完了", 85),
    ],
  },
  {
    title: "⑤ Permit・設計承認 — モール (D+33 〜 D+58)",
    items: [
      t("60", "デザイン承認", 44),
      t("61", "Contractor登録", 45),
      t("62", "工事保険提出", 46),
      t("63", "夜間工事許可（Overtime Work Permit）申請フロー確認", 46),
      t("64", "図面承認", 48),
      t("65", "Workers Pass取得", 48),
      t("66", "Fit-out Permit", 50),
      t("67", "一時電力・仮設水（Temporary Utility Connection）開通", 50),
    ],
  },
  {
    title: "⑤ Permit・設計承認 — 行政",
    items: [
      t("68", "Barangay Clearance", 45),
      t("69", "Building Permit（必要時）", 52),
      t("70", "Renovation Permit", 52),
      t("71", "Electrical Permit", 52),
      t("72", "Mechanical Permit", 52),
      t("73", "Plumbing Permit", 52),
      t("74", "Fire関連 申請", 54),
      t("75", "Sanitary関連 申請", 54),
      t("76", "Alcohol License 確認・申請（必要な場合）", 55),
      t("77", "Occupancy Permit 要否確認・申請", 58),
      t("78", "Business Permit 書類準備完了", 58),
      t("79", "Mayor's Permit 書類準備完了", 58),
    ],
  },
  {
    title: "⑥ 工事 (D+50 〜 D+82)",
    items: [
      t("80", "解体", 55),
      t("81", "配管", 60),
      t("82", "電気", 62),
      t("83", "ダクト", 64),
      t("84", "エアコン", 66),
      t("85", "床", 70),
      t("86", "壁", 72),
      t("87", "天井", 72),
      t("88", "塗装", 75),
      t("89", "照明", 78),
      t("90", "看板", 80),
    ],
  },
  {
    title: "⑥ 厨房・設備・システム",
    items: [
      t("91", "グリーストラップ", 66),
      t("92", "フード・ダクト", 68),
      t("93", "Stainless設置", 72),
      t("94", "給排水確認", 74),
      t("95", "POS契約", 60),
      t("96", "Cash Drawer準備", 78),
    ],
  },
  {
    title: "⑦ 設備搬入・マーケティング (D+72 〜 D+85)",
    items: [
      t("97",  "厨房機器搬入", 76),
      t("98",  "CCTV購入・設置", 80),
      t("99",  "Wi-Fi機器設置", 82),
      t("100", "Kitchen Printer準備", 82),
      t("101", "Google Maps（Google Business Profile）新店舗登録・申請", 78),
      t("102", "Google Business Profile 認証完了", 92),
      t("103", "SNSアカウント（Facebook / Instagram / TikTok）投稿開始", 80),
      t("104", "オープニングキャンペーン企画決定", 82),
      t("105", "Grab / Foodpanda オープニングプロモ設定", 90),
    ],
  },
  {
    title: "⑧ オープン準備 (D+86 〜 D+93)",
    items: [
      t("106", "Sushi ZEN OS 新店舗登録", 87),
      t("107", "Branch設定", 87),
      t("108", "POS連携確認", 88),
      t("109", "BIR Official Receipt / Official Invoice 納品確認", 88),
      t("110", "BIR掲示物（Notice to the Public / Form 2303）フレーム準備・店舗掲示", 90),
      t("111", "食器 購入・搬入", 89),
      t("112", "箸・Tray 購入・搬入", 89),
      t("113", "Initial Inventory確認", 90),
      t("114", "Cleaning用品搬入", 90),
      t("115", "スタッフ配属確定", 86),
      t("116", "Soft Opening（Dry Run）日程確定・招待客選定", 86),
      t("117", "工事完了確認", 88),
      t("118", "シフト確定", 88),
      t("119", "Contractor引渡し", 89),
      t("120", "Fire Inspection", 90),
      t("121", "Sanitary Inspection", 90),
      t("122", "モールInspection（モールの場合）", 91),
      t("123", "Business Permit 取得", 92),
      t("124", "Mayor's Permit 取得", 92),
    ],
  },
  {
    title: "⑨ オープンシミュレーション (D+94 〜 D+97)",
    items: [
      t("125", "店内動線確認", 94),
      t("126", "Kitchen動線確認", 94),
      t("127", "POSテスト", 94),
      t("128", "Credit Card Terminalテスト", 94),
      t("129", "Staff Simulation", 95),
      t("130", "オーダーフロー確認", 95),
      t("131", "Grab Driver導線確認", 95),
      t("132", "Foodpanda Driver導線確認", 95),
      t("133", "Family Trial（Soft Opening）", 96),
      t("134", "Grab / Foodpanda デリバリーテストオーダー", 96),
      t("135", "CCTV確認", 97),
      t("136", "Wi-Fi確認", 97),
      t("137", "シミュレーション課題リスト作成・改善完了", 98),
    ],
  },
  {
    title: "前日 (D+99)",
    items: [
      t("138", "Initial Inventory搬入", 99),
      t("139", "最終清掃", 99),
      t("140", "Cash Float準備", 99),
      t("141", "店内最終確認", 99),
    ],
  },
  {
    title: "Day 0 = D+100 (Grand Opening)",
    items: [
      t("142", "Grand Opening", 100),
      t("143", "初日オペレーション確認", 100),
      t("144", "問題点記録", 100),
      t("145", "改善ミーティング", 100),
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  store_name: string;
  city: string;
  start_date: string;
  status: string;
  notes: string | null;
}

type TaskStatuses = Record<string, { is_checked: boolean; checked_at: string | null; checked_by: string | null }>;

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDueDateColor(startDate: string, dDay: number, checked: boolean): "normal" | "yellow" | "red" {
  if (checked) return "normal";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = addDays(startDate, dDay);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (diffDays >= 7) return "red";
  if (diffDays > 0) return "yellow";
  return "normal";
}

function progressOf(items: TaskItem[], statuses: TaskStatuses) {
  const total = items.length;
  const done = items.filter(i => statuses[i.key]?.is_checked).length;
  return { done, total };
}

// ─── ProjectModal (outside main component to avoid display-name lint) ─────

interface ProjectModalProps {
  project: Project | null;
  headers: Record<string, string>;
  staffName: string;
  onClose: () => void;
  onCreated: (p: Project) => void;
  onUpdated: (p: Project) => void;
  onDeleted: (id: number) => void;
}

function ProjectModal({ project, headers, staffName, onClose, onCreated, onUpdated, onDeleted }: ProjectModalProps) {
  const isNew = !project;
  const [storeName, setStoreName] = useState(project?.store_name ?? "");
  const [city, setCity] = useState(project?.city ?? "MANILA");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState("");

  const save = async () => {
    if (!storeName.trim() || !startDate) return;
    setSaving(true);
    setSaveError("");
    try {
      if (isNew) {
        const res = await fetch(`${API_BASE}/api/admin/store-opening/projects`, {
          method: "POST",
          headers,
          body: JSON.stringify({ store_name: storeName, city, start_date: startDate, notes, staff_name: staffName }),
        });
        if (res.ok) {
          const data = await res.json();
          onCreated(data.project);
        } else {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          setSaveError(err.detail || "Failed to create project");
        }
      } else {
        const res = await fetch(`${API_BASE}/api/admin/store-opening/projects/${project!.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ store_name: storeName, city, start_date: startDate, notes, status }),
        });
        if (res.ok) {
          const data = await res.json();
          onUpdated(data.project);
        } else {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          setSaveError(err.detail || "Failed to update project");
        }
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{isNew ? "New Store Opening" : "Edit Project"}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Store Name *</label>
            <input
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. Manila North Branch"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">City</label>
            <select
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              value={city}
              onChange={e => setCity(e.target.value)}
            >
              <option value="MANILA">Manila</option>
              <option value="DUBAI">Dubai</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Start Date (D+1) *</label>
            <input
              type="date"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          {!isNew && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Status</label>
              <select
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Notes</label>
            <textarea
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              rows={3}
              placeholder="Optional notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          {saveError && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{saveError}</p>
          )}
          <button
            className={`${PRIMARY_BUTTON} w-full`}
            onClick={save}
            disabled={saving || deleting || !storeName.trim() || !startDate}
          >
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
          {!isNew && !confirmDelete && (
            <button
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              onClick={() => setConfirmDelete(true)}
              disabled={saving || deleting}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Project
            </button>
          )}
          {!isNew && confirmDelete && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-2">
              <p className="text-xs text-red-300 text-center">Delete <strong>{storeName}</strong>? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-500 py-1.5 text-xs text-white font-semibold transition-colors disabled:opacity-60"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      const res = await fetch(`${API_BASE}/api/admin/store-opening/projects/${project!.id}`, {
                        method: "DELETE",
                        headers,
                      });
                      if (res.ok) onDeleted(project!.id);
                      else setSaveError("Failed to delete project");
                    } catch (e) {
                      setSaveError(String(e));
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function StoreOpeningPage() {
  const auth = getAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<TaskStatuses>({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);

  const accessToken = auth?.accessToken ?? "";
  const staffName = auth?.staffName ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-opening/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: Project[] = data.projects ?? [];
      setProjects(list);
      setSelectedId(prev => (prev === null && list.length > 0 ? list[0].id : prev));
    } catch { /* ignore */ }
  }, [accessToken]);

  const loadTasks = useCallback(async (projectId: number) => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-opening/projects/${projectId}/tasks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setTaskStatuses(data.tasks ?? {});
    } catch { /* ignore */ }
    finally { setLoadingTasks(false); }
  }, [accessToken]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (selectedId !== null) loadTasks(selectedId);
  }, [selectedId, loadTasks]);

  // All hooks above — access guard after
  if (!canAccessStoreOpeningAdmin(auth)) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        You do not have access to this page.
      </div>
    );
  }

  const toggleTask = async (taskKey: string) => {
    if (!selectedId || savingTask) return;
    setSavingTask(taskKey);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/store-opening/projects/${selectedId}/tasks/${taskKey}/toggle`,
        { method: "POST", headers, body: JSON.stringify({ staff_name: staffName }) },
      );
      if (!res.ok) return;
      const data = await res.json();
      setTaskStatuses(prev => ({
        ...prev,
        [taskKey]: { is_checked: data.is_checked, checked_at: data.checked_at, checked_by: data.checked_by },
      }));
    } catch { /* ignore */ }
    finally { setSavingTask(null); }
  };

  const selectedProject = projects.find(p => p.id === selectedId) ?? null;
  const allItems = CHECKLIST_SECTIONS.flatMap(s => s.items);
  const totalProgress = progressOf(allItems, taskStatuses);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left panel: project list ─────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-white/8 bg-black/20">
        <div className="p-4 border-b border-white/8">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-5 w-5 text-violet-400" />
            <span className="font-semibold text-white text-sm">Store Openings</span>
          </div>
          <button
            className={`${PRIMARY_BUTTON} w-full text-xs py-1.5 gap-1.5`}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-3.5 w-3.5" /> New Opening
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {projects.length === 0 && (
            <p className="text-xs text-neutral-500 px-4 py-6 text-center">No openings yet.</p>
          )}
          {projects.map(p => {
            const active = p.id === selectedId;
            const overdueCount = CHECKLIST_SECTIONS.flatMap(s => s.items).filter(i =>
              getDueDateColor(p.start_date, i.dDay, taskStatuses[i.key]?.is_checked ?? false) !== "normal"
            ).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={[
                  "w-full text-left px-4 py-3 transition-colors",
                  active ? "bg-violet-600/20 border-r-2 border-violet-500" : "hover:bg-white/5",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-sm font-medium truncate ${active ? "text-white" : "text-neutral-300"}`}>
                    {p.store_name}
                  </span>
                  {overdueCount > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 leading-none">
                      {overdueCount}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {p.city} · D+1: {new Date(p.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                <div className={`text-[10px] mt-0.5 ${p.status === "active" ? "text-emerald-400" : p.status === "completed" ? "text-violet-400" : "text-neutral-500"}`}>
                  {p.status}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right panel: checklist ────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!selectedProject ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
            Select or create a store opening project.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-white/8 flex items-start justify-between gap-4">
              <div>
                <h1 className={`${T_PAGE_TITLE} flex items-center gap-2`}>
                  <Building2 className="h-5 w-5 text-violet-400" />
                  {selectedProject.store_name}
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {selectedProject.city} · D+1: {new Date(selectedProject.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {selectedProject.notes && <span className="ml-2">· {selectedProject.notes}</span>}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${totalProgress.total ? (totalProgress.done / totalProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-400">{totalProgress.done} / {totalProgress.total}</span>
                </div>
              </div>
              <button
                onClick={() => setEditingProject(selectedProject)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </div>

            {/* Checklist body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {loadingTasks && (
                <div className="text-neutral-500 text-sm text-center py-8">Loading tasks…</div>
              )}
              {!loadingTasks && CHECKLIST_SECTIONS.map((section, sIdx) => {
                const collapsed = collapsedSections.has(sIdx);
                const sp = progressOf(section.items, taskStatuses);
                const sectionOverdue = section.items.filter(i =>
                  getDueDateColor(selectedProject.start_date, i.dDay, taskStatuses[i.key]?.is_checked ?? false) !== "normal"
                ).length;

                return (
                  <div key={sIdx} className={GLASS_CARD}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                      onClick={() => setCollapsedSections(prev => {
                        const next = new Set(prev);
                        if (next.has(sIdx)) next.delete(sIdx); else next.add(sIdx);
                        return next;
                      })}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {collapsed
                          ? <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
                          : <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />}
                        <span className="text-sm font-medium text-white truncate">{section.title}</span>
                        {sectionOverdue > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5">
                            {sectionOverdue} overdue
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-neutral-500 ml-2">{sp.done}/{sp.total}</span>
                    </button>

                    {!collapsed && (
                      <div className="px-4 pb-3 space-y-0.5">
                        {section.items.map(item => {
                          const status = taskStatuses[item.key];
                          const checked = status?.is_checked ?? false;
                          const dueDate = addDays(selectedProject.start_date, item.dDay);
                          const color = getDueDateColor(selectedProject.start_date, item.dDay, checked);
                          const isLoading = savingTask === item.key;

                          return (
                            <div
                              key={item.key}
                              className={[
                                "flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer transition-colors group",
                                checked ? "opacity-50" : "hover:bg-white/5",
                              ].join(" ")}
                              onClick={() => toggleTask(item.key)}
                            >
                              <div className={[
                                "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                                checked
                                  ? "bg-violet-600 border-violet-600"
                                  : color === "red"
                                    ? "border-red-500 group-hover:border-red-400"
                                    : color === "yellow"
                                      ? "border-amber-400 group-hover:border-amber-300"
                                      : "border-white/20 group-hover:border-white/40",
                                isLoading ? "opacity-50" : "",
                              ].join(" ")}>
                                {checked && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>

                              <span className={[
                                "flex-1 text-sm",
                                checked
                                  ? "line-through text-neutral-600"
                                  : color === "red"
                                    ? "text-red-400"
                                    : color === "yellow"
                                      ? "text-amber-400"
                                      : "text-neutral-200",
                              ].join(" ")}>
                                {item.label}
                              </span>

                              <div className="shrink-0 flex items-center gap-1">
                                {!checked && color === "red" && (
                                  <AlertTriangle className="h-3 w-3 text-red-500" />
                                )}
                                <span className={[
                                  "text-[11px]",
                                  checked
                                    ? "text-neutral-700"
                                    : color === "red"
                                      ? "text-red-500 font-medium"
                                      : color === "yellow"
                                        ? "text-amber-500 font-medium"
                                        : "text-neutral-500",
                                ].join(" ")}>
                                  D+{item.dDay} · {formatDate(dueDate)}
                                </span>
                              </div>

                              {checked && status?.checked_by && (
                                <span className="text-[10px] text-neutral-700 shrink-0">
                                  ✓ {status.checked_by}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {showCreateModal && (
        <ProjectModal
          project={null}
          headers={headers}
          staffName={staffName}
          onClose={() => setShowCreateModal(false)}
          onCreated={p => { setProjects(prev => [p, ...prev]); setSelectedId(p.id); setShowCreateModal(false); }}
          onUpdated={() => {}}
          onDeleted={() => {}}
        />
      )}
      {editingProject && (
        <ProjectModal
          project={editingProject}
          headers={headers}
          staffName={staffName}
          onClose={() => setEditingProject(null)}
          onCreated={() => {}}
          onUpdated={p => { setProjects(prev => prev.map(x => x.id === p.id ? p : x)); setEditingProject(null); }}
          onDeleted={id => {
            setProjects(prev => prev.filter(x => x.id !== id));
            setSelectedId(prev => prev === id ? null : prev);
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
}
