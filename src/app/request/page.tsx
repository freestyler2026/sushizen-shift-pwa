// src/app/request/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/Field";
import { getAuth } from "@/lib/auth";

type ReqType = "time_change" | "day_off" | "absence" | "swap" | "paid_leave" | "vacation" | "other";

export default function RequestPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [branch, setBranch] = useState("BB");
  const [staffName, setStaffName] = useState("");
  const [workDate, setWorkDate] = useState("2025-02-23");
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
    if (!auth) return;
    if (auth.city) setCity(auth.city);
    if (auth.staffName) setStaffName(auth.staffName);
  }, [auth]);

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      if (!auth?.accessToken) {
        throw new Error("Please log in again before submitting a request.");
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3.5 sm:p-5">
        <div className="mb-4">
          <div className="text-[15px] font-semibold text-neutral-100 sm:text-base">Request</div>
          <div className="mt-1 text-sm text-neutral-400">Submit shift change, day off, absence, paid leave, vacation, other, or swap requests from your phone.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City">
            <select
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as any)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </Field>

          <Field label="Branch (optional)">
            <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>

          <Field label="Staff name" hint="Exact spelling as in sheet">
            <input
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-70"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              readOnly={!canSubmitForOthers}
              disabled={!canSubmitForOthers}
            />
          </Field>

          <Field label="Work date">
            <input
              type="date"
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </Field>

          <Field label="Request type">
            <select
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
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
            <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
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
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
              <button
                type="button"
                onClick={() => medicalFileInputRef.current?.click()}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
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
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Type-specific */}
        <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3.5">
          <div className="mb-3 text-sm font-semibold">Details</div>

          {requestType === "time_change" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="From (optional)">
                <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To (required)">
                <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          ) : null}

          {requestType === "swap" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="With staff (counterparty)">
                <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={withStaff} onChange={(e) => setWithStaff(e.target.value)} />
              </Field>
              <div />

              <Field label="My new time (my_to)">
                <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={myTo} onChange={(e) => setMyTo(e.target.value)} />
              </Field>

              <Field label="Their new time (their_to)">
                <input className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={theirTo} onChange={(e) => setTheirTo(e.target.value)} />
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
            className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-medium hover:bg-neutral-900 disabled:opacity-50 sm:w-auto"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
          {error ? <div className="w-full text-sm text-red-300 sm:w-auto">{error}</div> : null}
        </div>

        {result ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-sm font-semibold">Result</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-300">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}