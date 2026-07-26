"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Receipt, Clock, CheckCircle, XCircle, Banknote, Paperclip, Image as ImageIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const CATEGORIES = ["Ingredients", "Transport", "Uniform", "Equipment", "Mobile", "Other"] as const;

type ExpenseRequest = {
  id: string;
  staff_name: string;
  city: string;
  branch_code: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "paid";
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  submitted_at: string;
  has_receipt: boolean;
};

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

function statusBadge(status: string) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  if (status === "paid") return <span className={BADGE_SUCCESS}><Banknote className="h-3 w-3" />Paid</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Pending</span>;
}

export default function ExpenseRequestPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [auth, setAuth] = useState(() => getAuth());

  // Form state
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // History state
  const [requests, setRequests] = useState<ExpenseRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const city = (auth?.city || "").toLowerCase();
  const currency = city === "dubai" ? "AED" : "PHP";

  useEffect(() => {
    const refresh = () => setAuth(getAuth());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Fstore%2Fexpense-request");
    }
  }, [auth, router]);

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return { Authorization: `Bearer ${accessToken}` };
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/expense/requests?limit=50`, { headers, cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || `Error ${res.status}`);
      setRequests(Array.isArray(j?.requests) ? j.requests : []);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [apiBase, tokenHeaders]);

  useEffect(() => {
    if (auth?.staffName) void loadHistory();
  }, [auth, loadHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");
    if (!category) { setSubmitError("Please select a category."); return; }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setSubmitError("Please enter a valid amount."); return; }
    if (!expenseDate) { setSubmitError("Please select the expense date."); return; }

    setSubmitting(true);
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/expense/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ city, branch_code: "", category, amount: amt, currency, expense_date: expenseDate, description, receipt_image: receiptImage }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || `Error ${res.status}`);
      setSubmitSuccess("Request submitted successfully. You will receive a confirmation in your Inbox.");
      setCategory("");
      setAmount("");
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setReceiptImage("");
      setReceiptPreview("");
      await loadHistory();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedTotal = requests
    .filter((r) => r.status === "approved" || r.status === "paid")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="min-h-screen text-white">
      <motion.div
        className="mx-auto max-w-3xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div>
          <h1 className={T_PAGE_TITLE}>Expense Reimbursement</h1>
          <p className={T_BODY}>Submit your work-related expense claims for review and reimbursement.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Total Submitted</div>
            <div className={KPI_VALUE}>{requests.length}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Pending Review</div>
            <div className={`${KPI_VALUE} ${pendingCount ? "text-amber-400" : ""}`}>{pendingCount}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Approved Total</div>
            <div className={`${KPI_VALUE} text-emerald-400`}>{currency} {approvedTotal.toFixed(2)}</div>
          </div>
        </div>

        {/* Submission Form */}
        <div className={GLASS_CARD}>
          <div className="p-5 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-violet-400" />
              <div className={T_SECTION}>New Expense Request</div>
            </div>
            <p className={`${T_CAPTION} mt-1`}>Currency: <span className="text-violet-300 font-medium">{currency}</span> ({city === "dubai" ? "Dubai" : "Manila"})</p>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Category */}
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Category *</label>
                <SelectDark
                  className={SELECT_CLASS}
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: "", label: "Select category..." },
                    ...CATEGORIES.map((c) => ({ value: c, label: c })),
                  ]}
                />
              </div>

              {/* Amount */}
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Amount ({currency}) *</label>
                <input
                  type="number"
                  className={INPUT_CLASS}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              {/* Expense Date */}
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Expense Date *</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Description / Notes</label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={3}
                placeholder="What was this expense for? (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Receipt Image */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Receipt / Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReceiptLoading(true);
                  try {
                    const compressed = await compressImage(file);
                    setReceiptImage(compressed);
                    setReceiptPreview(compressed);
                  } catch {
                    setSubmitError("Failed to process image. Please try another file.");
                  } finally {
                    setReceiptLoading(false);
                  }
                }}
              />
              {!receiptPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={receiptLoading}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-zinc-400 hover:border-violet-500 hover:text-violet-300 transition-colors w-full"
                >
                  <Paperclip className="h-4 w-4" />
                  {receiptLoading ? "Processing..." : "Attach receipt image (optional)"}
                </button>
              ) : (
                <div className="relative inline-block">
                  <img src={receiptPreview} alt="Receipt" className="max-h-40 rounded-lg border border-white/10 object-contain" />
                  <button
                    type="button"
                    onClick={() => { setReceiptImage(""); setReceiptPreview(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {submitError && <p className="text-sm text-red-400">{submitError}</p>}
            {submitSuccess && <p className="text-sm text-emerald-400">{submitSuccess}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className={SECONDARY_BUTTON}
              >
                Refresh
              </button>
            </div>
          </form>
        </div>

        {/* Request History */}
        <div className={GLASS_CARD}>
          <div className="p-5 border-b border-white/8">
            <div className={T_SECTION}>My Requests</div>
            <p className={`${T_CAPTION} mt-1`}>Your submitted expense reimbursement requests</p>
          </div>
          <div className="p-3">
            {historyError && <p className="p-2 text-sm text-red-400">{historyError}</p>}
            {loadingHistory && <p className="p-4 text-sm text-zinc-500">Loading...</p>}
            {!loadingHistory && !historyError && requests.length === 0 && (
              <p className="p-4 text-center text-sm text-zinc-500">No requests yet.</p>
            )}
            {requests.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className={`${TABLE_HEADER} px-3`}>Date</th>
                      <th className={`${TABLE_HEADER} px-3`}>Category</th>
                      <th className={`${TABLE_HEADER} px-3`}>Amount</th>
                      <th className={`${TABLE_HEADER} px-3`}>Status</th>
                      <th className={`${TABLE_HEADER} px-3`}>Note</th>
                      <th className={`${TABLE_HEADER} px-3`}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} px-3 whitespace-nowrap`}>{r.expense_date}</td>
                        <td className={`${TABLE_CELL} px-3`}>
                          <span className={BADGE_INFO}>{r.category}</span>
                        </td>
                        <td className={`${TABLE_CELL} px-3 font-mono whitespace-nowrap`}>
                          {r.currency} {Number(r.amount).toFixed(2)}
                        </td>
                        <td className={`${TABLE_CELL} px-3`}>{statusBadge(r.status)}</td>
                        <td className={`${TABLE_CELL} px-3 text-xs text-zinc-400 max-w-[180px] truncate`}>
                          {r.review_note || r.description || "—"}
                        </td>
                        <td className={`${TABLE_CELL} px-3`}>
                          {r.has_receipt ? <span className="text-violet-400"><ImageIcon className="h-4 w-4" /></span> : <span className="text-zinc-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
