// src/app/request/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import DatePicker from "@/components/DatePicker";
import { getAuth } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

type ReqType = "time_change" | "day_off" | "absence" | "swap" | "paid_leave" | "vacation" | "other";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
const BLUSH_SMALL = `${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RequestPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [branch, setBranch] = useState("BB");
  const [staffName, setStaffName] = useState("");
  const [workDate, setWorkDate] = useState(todayIso());
  const [requestType, setRequestType] = useState<ReqType>("time_change");
  const [reason, setReason] = useState("");
  const [medicalDoc, setMedicalDoc] = useState(false);
  const [medicalDocumentFile, setMedicalDocumentFile] = useState<File | null>(null);
  const medicalFileInputRef = useRef<HTMLInputElement | null>(null);

  // payload fields
  const [from, setFrom] = useState("9-16");
  const [to, setTo] = useState("10-18");

  const [withStaff, setWithStaff] = useState("");
  const [myTo, setMyTo] = useState("9-16");
  const [theirTo, setTheirTo] = useState("18-25");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const auth = useMemo(() => getAuth(), []);
  const canSubmitForOthers = auth?.role === "HQ" || auth?.role === "ADMIN";

  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Frequest");
      return;
    }
    if (!auth) return;
    if (auth.city) setCity(auth.city);
    if (auth.staffName) setStaffName(auth.staffName);
  }, [auth, router]);

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      if (!auth?.accessToken) {
        throw new Error("Please log in again before submitting a request.");
      }
      if (!workDate.trim()) {
        throw new Error("Work date is required.");
      }
      if (!reason.trim()) {
        throw new Error("Reason is required.");
      }
      if (requestType === "swap" && !withStaff.trim()) {
        throw new Error("Counterparty staff name is required for swap requests.");
      }
      if (requestType === "swap" && (!myTo.trim() || !theirTo.trim())) {
        throw new Error("Both swap time fields are required.");
      }
      if (requestType === "time_change" && !to.trim()) {
        throw new Error("Requested time is required.");
      }
      if (reason.trim().length < 10) {
        throw new Error("Reason must be at least 10 characters.");
      }
      let payload: any = {};
      if (requestType === "time_change") {
        payload = { from, to };
      } else if (requestType === "swap") {
        payload = { with_staff: withStaff, my_to: myTo, their_to: theirTo };
      }

      if (medicalDoc && !medicalDocumentFile) {
        throw new Error("Please attach your medical document file.");
      }

      const form = new FormData();
      form.set("city", city);
      form.set("staff_name", staffName);
      form.set("work_date", workDate);
      form.set("request_type", requestType);
      form.set("reason", reason);
      form.set("branch", branch);
      form.set("medical_doc", String(medicalDoc));
      form.set("payload_json", JSON.stringify(payload));
      if (medicalDocumentFile) {
        form.set("medical_document_file", medicalDocumentFile);
      }

      const url = `/api/shift_change/submit`;
      const res = await fetch(`${apiBase}${url}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          ...(auth.stepUpToken ? { "X-Step-Up-Token": auth.stepUpToken } : {}),
        },
        body: form,
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`Submit failed: ${res.status} ${text}`);

      setResult(JSON.parse(text));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-5xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Request</h1>
          <p className={T_BODY}>Submit shift changes, day off, absence, vacation, or swap requests from your phone.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={BADGE_SUCCESS}>
            <CalendarDays className="h-3 w-3" />
            {workDate || todayIso()}
          </span>
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4 sm:p-5`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className={T_SECTION}>Request Form</div>
            <div className={T_CAPTION}>Your login is used for secure submission and approval routing.</div>
          </div>
          <span className={canSubmitForOthers ? BADGE_WARNING : BADGE_SUCCESS}>
            <FileText className="h-3 w-3" />
            {canSubmitForOthers ? "Admin mode" : "Self submit"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City">
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={city}
              onChange={(e) => setCity(e.target.value as any)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </Field>

          <Field label="Branch (optional)">
            <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>

          <Field label="Staff name" hint="Exact spelling as in sheet">
            <input
              className={`${INPUT_CLASS} disabled:opacity-70 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              readOnly={!canSubmitForOthers}
              disabled={!canSubmitForOthers}
            />
          </Field>

          <Field label="Work date">
            <DatePicker value={workDate} onChange={setWorkDate} />
          </Field>

          <Field label="Request type">
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as ReqType)}
            >
              <option value="time_change">Time Change</option>
              <option value="day_off">Day Off</option>
              <option value="absence">Absence</option>
              <option value="paid_leave">Paid Leave</option>
              <option value="vacation">Vacation</option>
              <option value="other">Other</option>
              <option value="swap">Swap</option>
            </select>
          </Field>

          <Field label="Medical doc (RED recommended)">
            <label className={`flex min-h-10 items-center gap-2 ${BLUSH_GLASS} px-3 py-2 text-sm text-neutral-200`}>
              <input type="checkbox" checked={medicalDoc} onChange={(e) => setMedicalDoc(e.target.checked)} />
              I have medical document
            </label>
            <div className="mt-2 text-xs text-neutral-400">
              Note: If attached, medical documents are automatically uploaded to Discord channel{" "}
              <span className="font-semibold text-neutral-300">medical_document</span>.
            </div>
            {!canSubmitForOthers ? (
              <div className="mt-2 text-xs text-neutral-500">Your name is locked to your current login to prevent impersonation.</div>
            ) : null}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              ref={medicalFileInputRef}
              onChange={(e) => setMedicalDocumentFile(e.target.files?.[0] || null)}
              hidden
              aria-hidden="true"
              tabIndex={-1}
              className="hidden"
            />
            <div className={`mt-2 flex flex-wrap items-center gap-2 ${BLUSH_GLASS} px-3 py-2 text-sm text-neutral-200`}>
              <button
                type="button"
                onClick={() => medicalFileInputRef.current?.click()}
                className={BLUSH_SMALL}
                aria-label="Choose medical document"
              >
                Choose File
              </button>
              <span className="text-xs text-neutral-400">
                {medicalDocumentFile ? medicalDocumentFile.name : "No file selected"}
              </span>
              <span className="w-full text-[11px] text-neutral-500">
                Accepted files: PDF, JPG, JPEG, PNG, WEBP
              </span>
            </div>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Reason (RED requires 10+ chars)">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Type-specific */}
        <div className={`mt-5 p-4 ${BLUSH_HIGHLIGHT}`}>
          <div className="mb-3">
            <div className={T_SECTION}>Details</div>
            <div className={T_CAPTION}>Only the fields relevant to the selected request type are shown below.</div>
          </div>

          {requestType === "time_change" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="From (optional)">
                <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To (required)">
                <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          ) : null}

          {requestType === "swap" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="With staff (counterparty)">
                <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={withStaff} onChange={(e) => setWithStaff(e.target.value)} />
              </Field>
              <div />

              <Field label="My new time (my_to)">
                <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={myTo} onChange={(e) => setMyTo(e.target.value)} />
              </Field>

              <Field label="Their new time (their_to)">
                <input className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} value={theirTo} onChange={(e) => setTheirTo(e.target.value)} />
              </Field>

              <div className="sm:col-span-2 text-xs text-neutral-400">
                After submit: counterparty must approve with PIN in “Swap Approve” page.
              </div>
            </div>
          ) : null}

          {requestType === "day_off" || requestType === "absence" || requestType === "paid_leave" || requestType === "vacation" || requestType === "other" ? (
            <div className="text-sm text-neutral-400">No extra fields needed. Please write the reason.</div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={submit}
            disabled={loading}
            className={`${BLUSH_PRIMARY} min-h-10 w-full sm:w-auto`}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => {
              setReason("");
              setError("");
              setResult(null);
            }}
            className={`${BLUSH_SECONDARY} min-h-10 w-full sm:w-auto`}
          >
            Clear message
          </button>
          {error ? <div className="w-full text-sm text-red-300 sm:w-auto">{error}</div> : null}
        </div>

        {result ? (
          <div className={`mt-4 p-4 ${BLUSH_GLASS}`}>
            <div className={T_SECTION}>Result</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-300">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
      </motion.div>
    </div>
  );
}