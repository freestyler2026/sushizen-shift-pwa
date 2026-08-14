"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, CheckCircle2, AlertTriangle, ImagePlus, Loader2 } from "lucide-react";
import { getAuth, getAuthHeaders, getUploadHeaders } from "@/lib/auth";
import {
  PRIMARY_BUTTON, INPUT_CLASS, T_PAGE_TITLE, T_LABEL, T_CAPTION, GLASS_CARD,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ["GrabFood", "FoodPanda"] as const;
const BRANCHES  = ["Paranaque", "Taft", "Cubao"] as const;

type Platform = typeof PLATFORMS[number];
type Branch   = typeof BRANCHES[number];

interface UploadedPhoto {
  url: string;
  name: string;
}

interface FormState {
  platform: Platform | "";
  branch: Branch | "";
  incident_date: string;
  order_no: string;
  time_reported: string;
  ordered_items: string;
  paid_price: string;
  cancellation_reason: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  platform: "",
  branch: "",
  incident_date: today(),
  order_no: "",
  time_reported: "",
  ordered_items: "",
  paid_price: "",
  cancellation_reason: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function CancellationInputPage() {
  const router = useRouter();
  const auth = getAuth();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ─── Auth guard ─────────────────────────────────────────────────────────────

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Please log in to access this page.</p>
      </div>
    );
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (photos.length + files.length > 2) {
      setError("Maximum 2 photos allowed (e.g. order photo + receipt).");
      return;
    }
    if (!form.incident_date || !form.branch) {
      setError("Please select Branch and Date before uploading photos.");
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are accepted.");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Each photo must be under 10 MB.");
        continue;
      }
      setUploadingIdx(photos.length);
      try {
        const fd = new FormData();
        fd.append("incident_date", form.incident_date);
        fd.append("branch", form.branch || "UNKNOWN");
        fd.append("file", file, file.name);
        const res = await fetch("/api/store/cancellation/upload-photo", {
          method: "POST",
          headers: getUploadHeaders(auth),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.detail || "Upload failed");
        setPhotos((prev) => [...prev, { url: data.url, name: file.name }]);
        setError("");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
      } finally {
        setUploadingIdx(null);
      }
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.platform) { setError("Platform is required."); return; }
    if (!form.branch)   { setError("Branch is required."); return; }
    if (!form.incident_date) { setError("Date is required."); return; }
    if (!form.order_no.trim()) { setError("Order No. is required."); return; }
    if (!form.cancellation_reason.trim()) { setError("Cancellation reason is required."); return; }

    setSubmitting(true);
    try {
      const payload = {
        platform: form.platform,
        incident_date: form.incident_date,
        branch: form.branch,
        order_no: form.order_no.trim(),
        time_reported: form.time_reported.trim() || null,
        ordered_items: form.ordered_items.trim() || null,
        paid_price: form.paid_price ? parseFloat(form.paid_price) : null,
        cancellation_reason: form.cancellation_reason.trim(),
        photo_upload_urls: photos.map((p) => p.url),
      };
      const res = await fetch("/api/store/cancellation/submit", {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.detail || "Submission failed");
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setForm(emptyForm());
    setPhotos([]);
    setError("");
    setSuccess(false);
  }

  // ─── Success state ───────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <div className={`${GLASS_CARD} p-8 max-w-md w-full text-center flex flex-col items-center gap-4`}>
          <CheckCircle2 className="w-14 h-14 text-emerald-400" />
          <h2 className="text-xl font-semibold text-white">Cancellation Submitted</h2>
          <p className="text-gray-400 text-sm">
            Your cancellation record has been saved and is now pending review by management.
            {photos.length > 0 && " The supporting photos have been uploaded to the drive."}
          </p>
          <div className="flex gap-3 mt-2">
            <button onClick={handleReset} className={PRIMARY_BUTTON}>
              Submit Another
            </button>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-lg border border-white/20 text-gray-300 hover:bg-white/10 text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main form ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-xl mx-auto">
      <h1 className={`${T_PAGE_TITLE} mb-6`}>Cancellation Report</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* Platform & Branch */}
        <div className={`${GLASS_CARD} p-4 flex flex-col gap-4`}>
          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Platform <span className="text-red-400">*</span></label>
            <SelectDark
              value={form.platform}
              onChange={(v) => setField("platform", v as Platform)}
              options={PLATFORMS.map((p) => ({ label: p, value: p }))}
              placeholder="Select platform…"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Branch <span className="text-red-400">*</span></label>
            <SelectDark
              value={form.branch}
              onChange={(v) => setField("branch", v as Branch)}
              options={BRANCHES.map((b) => ({ label: b, value: b }))}
              placeholder="Select branch…"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Incident Date <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={form.incident_date}
              onChange={(e) => setField("incident_date", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Order Details */}
        <div className={`${GLASS_CARD} p-4 flex flex-col gap-4`}>
          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Order No. <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.order_no}
              onChange={(e) => setField("order_no", e.target.value)}
              placeholder="e.g. GF-12345"
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className={T_LABEL}>Time Reported</label>
              <input
                type="time"
                value={form.time_reported}
                onChange={(e) => setField("time_reported", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className={T_LABEL}>Order Total (PHP)</label>
              <input
                type="number"
                value={form.paid_price}
                onChange={(e) => setField("paid_price", e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Items Ordered</label>
            <textarea
              rows={2}
              value={form.ordered_items}
              onChange={(e) => setField("ordered_items", e.target.value)}
              placeholder="List the items in the cancelled order…"
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={T_LABEL}>Cancellation Reason <span className="text-red-400">*</span></label>
            <textarea
              rows={3}
              value={form.cancellation_reason}
              onChange={(e) => setField("cancellation_reason", e.target.value)}
              placeholder="Describe why the order was cancelled…"
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>
        </div>

        {/* Photo Upload */}
        <div className={`${GLASS_CARD} p-4 flex flex-col gap-3`}>
          <div>
            <p className={T_LABEL}>Supporting Photos</p>
            <p className={`${T_CAPTION} mt-0.5`}>Upload up to 2 photos (prepared order + receipt). Max 10 MB each.</p>
          </div>

          {photos.map((p, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <ImagePlus className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-sm text-gray-300 flex-1 truncate">{p.name}</span>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline shrink-0"
              >
                View
              </a>
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="text-gray-500 hover:text-red-400 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {uploadingIdx !== null && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading photo…
            </div>
          )}

          {photos.length < 2 && uploadingIdx === null && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 hover:bg-white/10 p-3 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <Upload className="w-4 h-4" />
                {photos.length === 0 ? "Add photo (order / receipt)" : "Add another photo"}
              </button>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} flex items-center justify-center gap-2 w-full`}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit Cancellation Report"
          )}
        </button>

      </form>
    </div>
  );
}
