"use client";

import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/Field";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";

type ReportType = "app-private-report" | "hq-private-report";

export default function PrivateReportPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [reportType, setReportType] = useState<ReportType>("app-private-report");
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [branch, setBranch] = useState("");
  const [reportDatetime, setReportDatetime] = useState("");
  const [category, setCategory] = useState("Suggestion");
  const [whatHappened, setWhatHappened] = useState("");
  const [whyProblem, setWhyProblem] = useState("");
  const [frequency, setFrequency] = useState("");
  const [affectedPeople, setAffectedPeople] = useState("");
  const [supportNeeded, setSupportNeeded] = useState("");
  const [anonymousRequest, setAnonymousRequest] = useState(true);
  const [screenFeature, setScreenFeature] = useState("");
  const [problem, setProblem] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const auth = useMemo(() => getAuth(), []);

  useEffect(() => {
    async function syncAuth() {
      const refreshed = await refreshAuthFromApi(auth);
      if (!refreshed) return;
      setCity(refreshed.city || "dubai");
    }
    syncAuth();
  }, [auth]);

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const refreshed = await refreshAuthFromApi(auth);
      const accessToken = refreshed?.accessToken || auth?.accessToken;
      if (!accessToken) throw new Error("Please log in again.");

      const body = {
        report_type: reportType,
        city,
        branch,
        report_datetime: reportDatetime,
        category,
        what_happened: whatHappened,
        why_problem: whyProblem,
        frequency,
        affected_people: affectedPeople,
        support_needed: supportNeeded,
        anonymous_request: anonymousRequest,
        screen_feature: screenFeature,
        problem,
        expected,
        actual,
        screenshot,
      };

      const res = await fetch(`${apiBase}/api/private_reports/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Submit failed (${res.status})`);
      setResult(JSON.parse(text));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Private Report</div>
        <div className="mt-1 text-sm text-neutral-400">
          Submit private reports directly to HQ/HR. Other staff cannot see your submission.
        </div>
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300">
          Anonymous posting notice: this report is handled as anonymous to other staff, but HQ/HR may still see your name for follow-up support.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Report Type">
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
            >
              <option value="app-private-report">app-private-report</option>
              <option value="hq-private-report">hq-private-report</option>
            </select>
          </Field>
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
          <Field label="Store / Branch">
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="e.g. BB"
            />
          </Field>
          <Field label="Date / Time">
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={reportDatetime}
              onChange={(e) => setReportDatetime(e.target.value)}
              placeholder="e.g. 2026-03-24 21:30"
            />
          </Field>
        </div>

        {reportType === "hq-private-report" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="App">App</option>
                <option value="Operation">Operation</option>
                <option value="Management">Management</option>
                <option value="Staff issue">Staff issue</option>
                <option value="Suggestion">Suggestion</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Anonymous request">
              <select
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={anonymousRequest ? "yes" : "no"}
                onChange={(e) => setAnonymousRequest(e.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="What happened">
              <textarea
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
              />
            </Field>
            <Field label="Why this is a problem">
              <textarea
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={whyProblem}
                onChange={(e) => setWhyProblem(e.target.value)}
              />
            </Field>
            <Field label="How often it happens">
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              />
            </Field>
            <Field label="Who is affected">
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={affectedPeople}
                onChange={(e) => setAffectedPeople(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="What support or change is needed">
                <textarea
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  rows={3}
                  value={supportNeeded}
                  onChange={(e) => setSupportNeeded(e.target.value)}
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Screen / Feature">
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={screenFeature}
                onChange={(e) => setScreenFeature(e.target.value)}
              />
            </Field>
            <div />
            <Field label="Problem">
              <textarea
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
              />
            </Field>
            <Field label="What you expected">
              <textarea
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </Field>
            <Field label="What actually happened">
              <textarea
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                rows={3}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </Field>
            <Field label="Screenshot">
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={screenshot}
                onChange={(e) => setScreenshot(e.target.value)}
                placeholder="URL or short note"
              />
            </Field>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Submit Private Report"}
          </button>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        {result ? (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-200">
            <div className="font-medium">Accepted</div>
            <div className="mt-1 text-neutral-300">A receipt message was sent to your Inbox.</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-400">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
