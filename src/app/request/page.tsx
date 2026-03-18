// src/app/request/page.tsx
"use client";

import { useState } from "react";
import { apiPost, qs } from "@/lib/api";
import { Field } from "@/components/Field";

type ReqType = "time_change" | "day_off" | "absence" | "swap";

export default function RequestPage() {
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [branch, setBranch] = useState("BB");
  const [staffName, setStaffName] = useState("");
  const [workDate, setWorkDate] = useState("2025-02-23");
  const [requestType, setRequestType] = useState<ReqType>("time_change");
  const [reason, setReason] = useState("");
  const [medicalDoc, setMedicalDoc] = useState(false);

  // payload fields
  const [from, setFrom] = useState("9-16");
  const [to, setTo] = useState("10-18");

  const [withStaff, setWithStaff] = useState("");
  const [myTo, setMyTo] = useState("9-16");
  const [theirTo, setTheirTo] = useState("18-25");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      let payload: any = {};
      if (requestType === "time_change") {
        payload = { from, to };
      } else if (requestType === "swap") {
        payload = { with_staff: withStaff, my_to: myTo, their_to: theirTo };
      }

      const path =
        `/api/shift_change/submit` +
        qs({
          city,
          staff_name: staffName,
          work_date: workDate,
          request_type: requestType,
          reason,
          branch,
          medical_doc: medicalDoc,
        });

      // backend expects JSON body (payload)
      const url = path;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "")}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="City">
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as any)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </Field>

          <Field label="Branch (optional)">
            <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>

          <Field label="Staff name" hint="Exact spelling as in sheet">
            <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          </Field>

          <Field label="Work date">
            <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </Field>

          <Field label="Request type">
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as ReqType)}
            >
              <option value="time_change">time_change</option>
              <option value="day_off">day_off</option>
              <option value="absence">absence</option>
              <option value="swap">swap</option>
            </select>
          </Field>

          <Field label="Medical doc (RED recommended)">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input type="checkbox" checked={medicalDoc} onChange={(e) => setMedicalDoc(e.target.checked)} />
              I have medical document
            </label>
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
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="mb-3 text-sm font-semibold">Details</div>

          {requestType === "time_change" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="From (optional)">
                <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To (required)">
                <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          ) : null}

          {requestType === "swap" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="With staff (counterparty)">
                <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={withStaff} onChange={(e) => setWithStaff(e.target.value)} />
              </Field>
              <div />

              <Field label="My new time (my_to)">
                <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={myTo} onChange={(e) => setMyTo(e.target.value)} />
              </Field>

              <Field label="Their new time (their_to)">
                <input className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={theirTo} onChange={(e) => setTheirTo(e.target.value)} />
              </Field>

              <div className="sm:col-span-2 text-xs text-neutral-400">
                After submit: counterparty must approve with PIN in “Swap Approve” page.
              </div>
            </div>
          ) : null}

          {requestType === "day_off" || requestType === "absence" ? (
            <div className="text-sm text-neutral-400">No extra fields needed. Please write the reason.</div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
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