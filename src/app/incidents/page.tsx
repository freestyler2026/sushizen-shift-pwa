"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  X,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { API_BASE } from "@/lib/api";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

const INCIDENT_CATEGORIES = [
  "商品トラブル",
  "顧客トラブル",
  "欠品トラブル",
  "配送トラブル",
  "設備トラブル",
  "天候トラブル",
  "施設トラブル",
  "負傷トラブル",
  "その他",
] as const;

const SEVERITY_LEVELS = [
  { value: "low", label: "Low 🟢", color: "text-emerald-400" },
  { value: "medium", label: "Medium 🟡", color: "text-amber-400" },
  { value: "high", label: "High 🟠", color: "text-orange-400" },
  { value: "critical", label: "Critical 🔴", color: "text-rose-400" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  new: "新規",
  acknowledged: "確認中",
  in_progress: "対応中",
  resolved: "解決済",
};

const STATUS_BADGE: Record<string, string> = {
  new: BADGE_ERROR,
  acknowledged: BADGE_WARNING,
  in_progress: BADGE_INFO,
  resolved: BADGE_SUCCESS,
};

const SEVERITY_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🟠",
  critical: "🔴",
};

type Attachment = {
  id: string;
  file_name: string;
  web_view_link?: string;
  mime_type?: string;
};

type Reply = {
  id: string;
  author_name: string;
  author_role: string;
  message: string;
  created_at: string;
};

type IncidentReport = {
  id: string;
  city: string;
  branch: string;
  reporter_name: string;
  category: string;
  severity: string;
  description: string;
  incident_datetime: string;
  status: string;
  created_at: string;
  replies: Reply[];
  attachments: Attachment[];
};

function fmtDt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function IncidentsPage() {
  const auth = getAuth();
  const city = (auth?.city || "dubai") as City;
  const staffName = auth?.staffName || "";

  // ── form state ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formCity, setFormCity] = useState<City>(city);
  const [branch, setBranch] = useState("");
  const [reporter, setReporter] = useState(staffName);
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [incidentDatetime, setIncidentDatetime] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── list state ──────────────────────────────────────────────────────
  const [items, setItems] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const branches = BRANCHES[formCity] ?? [];

  // ── fetch list ───────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setLoading(true);
    setListError("");
    try {
      const res = await fetch(`${API_BASE}/api/incidents`, {
        cache: "no-store",
        headers: getAuthHeaders(a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items || []);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // ── mark notifications read when expanding ───────────────────────────
  const handleExpand = async (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      try {
        const a = getAuth();
        if (!a) return;
        await fetch(`${API_BASE}/api/incidents/notifications/read`, {
          method: "POST",
          headers: getAuthHeaders(a),
          body: JSON.stringify({ report_id: id }),
        });
      } catch {}
    }
  };

  // ── submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitSuccess("");
    if (!category) { setSubmitError("カテゴリを選択してください"); return; }
    if (!branch) { setSubmitError("店舗を選択してください"); return; }
    if (!description.trim()) { setSubmitError("内容を入力してください"); return; }

    setSubmitting(true);
    try {
      const a = getAuth();
      if (!a) throw new Error("Not authenticated");

      const res = await fetch(`${API_BASE}/api/incidents`, {
        method: "POST",
        headers: getAuthHeaders(a),
        body: JSON.stringify({
          city: formCity,
          branch,
          reporter_name: reporter || a.staffName,
          category,
          severity,
          description: description.trim(),
          incident_datetime: incidentDatetime,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const reportId: string = data.report_id || "";

      // Upload image if selected
      if (imageFile && reportId) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("uploader_name", reporter || a.staffName);
        fd.append("authorization", `Bearer ${a.accessToken || ""}`);
        await fetch(`${API_BASE}/api/incidents/${reportId}/attachments`, {
          method: "POST",
          body: fd,
        });
      }

      setSubmitSuccess("インシデントレポートを送信しました。");
      setShowForm(false);
      setCategory("");
      setBranch("");
      setSeverity("medium");
      setDescription("");
      setIncidentDatetime("");
      setImageFile(null);
      void fetchList();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>
            <AlertTriangle className="mr-2 inline-block h-7 w-7 text-amber-400" />
            Incident Report
          </h1>
          <p className={`mt-1 ${T_CAPTION}`}>インシデント・トラブルの報告</p>
        </div>
        <button
          className={PRIMARY_BUTTON}
          onClick={() => { setShowForm((v) => !v); setSubmitError(""); setSubmitSuccess(""); }}
        >
          {showForm ? <X className="mr-1.5 inline h-4 w-4" /> : <Plus className="mr-1.5 inline h-4 w-4" />}
          {showForm ? "キャンセル" : "新規報告"}
        </button>
      </div>

      {/* Success banner */}
      {submitSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {submitSuccess}
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <div className={`${GLASS_CARD} space-y-4 p-6`}>
          <h2 className={T_SECTION}>インシデント報告フォーム</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* City */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>都市</label>
              <select
                className={SELECT_CLASS}
                value={formCity}
                onChange={(e) => { setFormCity(e.target.value as City); setBranch(""); }}
              >
                <option value="dubai">Dubai 🇦🇪</option>
                <option value="manila">Manila 🇵🇭</option>
              </select>
            </div>

            {/* Branch */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>店舗 *</label>
              <select
                className={SELECT_CLASS}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">— 選択 —</option>
                {branches.map((b) => (
                  <option key={b.code} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Reporter */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>投稿者</label>
              <input
                className={INPUT_CLASS}
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                placeholder="スタッフ名"
              />
            </div>

            {/* Incident datetime */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>発生日時</label>
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={incidentDatetime}
                onChange={(e) => setIncidentDatetime(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>カテゴリ *</label>
              <select
                className={SELECT_CLASS}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">— 選択 —</option>
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>重要度</label>
              <select
                className={SELECT_CLASS}
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className={T_LABEL}>内容 *</label>
            <textarea
              className={`${TEXTAREA_CLASS} min-h-[100px]`}
              placeholder="インシデントの詳細を記述してください…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Image upload */}
          <div className="space-y-1.5">
            <label className={T_LABEL}>画像添付（任意）</label>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/4 px-4 py-3 transition-colors hover:border-violet-500/40 hover:bg-white/6"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="h-5 w-5 text-zinc-400" />
              <span className="text-sm text-zinc-400">
                {imageFile ? imageFile.name : "クリックして画像を選択"}
              </span>
              {imageFile && (
                <button
                  className="ml-auto rounded p-0.5 text-zinc-500 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); setImageFile(null); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {submitError && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              className={SECONDARY_BUTTON}
              onClick={() => setShowForm(false)}
            >
              キャンセル
            </button>
            <button
              className={PRIMARY_BUTTON}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 inline h-4 w-4" />
              )}
              送信
            </button>
          </div>
        </div>
      )}

      {/* Incident list */}
      <div className="space-y-3">
        <h2 className={T_SECTION}>送信済みレポート</h2>

        {loading && (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            読み込み中…
          </div>
        )}
        {listError && (
          <div className={`${BADGE_ERROR} px-4 py-3`}>{listError}</div>
        )}
        {!loading && !listError && items.length === 0 && (
          <div className={`${GLASS_CARD} px-6 py-10 text-center text-sm text-zinc-500`}>
            レポートはまだありません。
          </div>
        )}

        {items.map((item) => {
          const expanded = expandedId === item.id;
          const hasUnread = item.replies?.length > 0;
          return (
            <div key={item.id} className={GLASS_CARD}>
              <button
                className="flex w-full items-start gap-3 p-4 text-left"
                onClick={() => handleExpand(item.id)}
              >
                <span className="mt-0.5 text-lg">
                  {SEVERITY_EMOJI[item.severity] ?? "🟡"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{item.category}</span>
                    <span className={STATUS_BADGE[item.status] ?? BADGE_INFO}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    {item.replies?.length > 0 && (
                      <span className={BADGE_INFO}>
                        <MessageSquare className="h-3 w-3" />
                        {item.replies.length}件の返信
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span>{item.branch}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtDt(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-zinc-300">
                    {item.description}
                  </p>
                </div>
                <span className="ml-2 mt-0.5 shrink-0 text-zinc-500">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">
                  {/* Details */}
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {item.incident_datetime && (
                      <div>
                        <span className={T_LABEL}>発生日時</span>
                        <p className="mt-0.5 text-zinc-200">{fmtDt(item.incident_datetime)}</p>
                      </div>
                    )}
                    <div>
                      <span className={T_LABEL}>重要度</span>
                      <p className="mt-0.5 text-zinc-200">{SEVERITY_EMOJI[item.severity]} {item.severity.toUpperCase()}</p>
                    </div>
                  </div>

                  <div>
                    <span className={T_LABEL}>内容</span>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{item.description}</p>
                  </div>

                  {/* Attachments */}
                  {item.attachments?.length > 0 && (
                    <div>
                      <span className={T_LABEL}>添付画像</span>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {item.attachments.map((att) => {
                          const isImage = (att.mime_type || "").startsWith("image/");
                          return isImage && att.web_view_link ? (
                            <a
                              key={att.id}
                              href={att.web_view_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative overflow-hidden rounded-xl border border-white/10 transition-all hover:border-violet-500/40"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={att.web_view_link.replace("/view", "/preview")}
                                alt={att.file_name}
                                className="h-28 w-40 object-cover transition-transform duration-200 group-hover:scale-105"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[10px] text-zinc-300">
                                {att.file_name}
                              </div>
                            </a>
                          ) : (
                            <a
                              key={att.id}
                              href={att.web_view_link || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              {att.file_name}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* HQ Replies */}
                  {item.replies?.length > 0 && (
                    <div>
                      <span className={T_LABEL}>本部からの返信</span>
                      <div className="mt-2 space-y-2">
                        {item.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-4 py-3"
                          >
                            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                              <span className="font-medium text-violet-300">{reply.author_name}</span>
                              <span>·</span>
                              <span>{fmtDt(reply.created_at)}</span>
                            </div>
                            <p className="text-sm text-zinc-200">{reply.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
