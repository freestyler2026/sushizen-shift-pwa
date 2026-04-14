"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, type City as BranchCity } from "@/lib/branches";
import { GLASS_CARD, T_PAGE_TITLE, T_BODY, BADGE_WARNING } from "@/lib/ui-tokens";

type ReportType = "app-private-report" | "hq-private-report";
type PrivateReportResult = {
  ok?: boolean;
  report_id?: string;
  status?: string;
  receipt_message?: string;
};

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const LABEL_CLASS = "mb-1.5 text-xs font-medium tracking-wide text-neutral-400 uppercase";
const INPUT_POLISH =
  "w-full rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition";
const SELECT_POLISH =
  "w-full appearance-none rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:border-violet-500/60 transition cursor-pointer";
const TEXTAREA_POLISH = `${INPUT_POLISH} min-h-[104px]`;

export default function PrivateReportPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [reportType, setReportType] = useState<ReportType>("app-private-report");
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [branch, setBranch] = useState("");
  const [dateTimeLocal, setDateTimeLocal] = useState("");
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
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<PrivateReportResult | null>(null);
  const auth = useMemo(() => getAuth(), []);

  const resetForm = () => {
    setResult(null);
    setSubmitError("");
    setBranch("");
    setDateTimeLocal("");
    setScreenFeature("");
    setProblem("");
    setExpected("");
    setActual("");
    setScreenshot("");
  };

  useEffect(() => {
    async function syncAuth() {
      const refreshed = await refreshAuthFromApi(auth);
      if (!refreshed?.staffName || !refreshed?.accessToken) {
        router.replace("/login?next=%2Fprivate-report");
        return;
      }
      if (!refreshed) return;
      setCity(refreshed.city || "dubai");
    }
    void syncAuth();
  }, [auth, router]);

  const submit = async () => {
    setLoading(true);
    setSubmitError("");
    setResult(null);
    try {
      const refreshed = await refreshAuthFromApi(auth);
      const accessToken = refreshed?.accessToken || auth?.accessToken;
      if (!accessToken) throw new Error("Please log in again.");
      if (!dateTimeLocal.trim()) throw new Error("Date / Time is required.");
      const dateTimeForApi = dateTimeLocal.replace("T", " ");
      if (reportType === "hq-private-report") {
        if (!whatHappened.trim()) throw new Error("What happened is required.");
        if (!whyProblem.trim()) throw new Error("Why this is a problem is required.");
      } else {
        if (!screenFeature.trim()) throw new Error("Screen / Feature is required.");
        if (!problem.trim()) throw new Error("Problem is required.");
        if (!expected.trim()) throw new Error("What you expected is required.");
        if (!actual.trim()) throw new Error("What actually happened is required.");
      }

      const body = {
        report_type: reportType,
        city,
        branch,
        report_datetime: dateTimeForApi,
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
      setSubmitError(e?.message || String(e));
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
            <h1 className={T_PAGE_TITLE}>Private Report</h1>
            <p className={T_BODY}>Submit private reports directly to HQ/HR. Other staff cannot see your submission.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={BADGE_WARNING}>
              <ShieldAlert className="h-3 w-3" />
              Confidential
            </span>
          </div>
        </div>

        <div className={`${BLUSH_GLASS} p-4`}>
          <div className="flex items-start gap-3 rounded-2xl border border-violet-700/30 bg-violet-950/20 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-violet-400">🔒</span>
            <p className="text-xs leading-relaxed text-neutral-400">
              <span className="font-semibold text-neutral-300">Anonymous posting notice:</span>{" "}
              This report is handled as anonymous to other staff, but HQ/HR may still see your name for follow-up support.
            </p>
          </div>

          {!result?.ok ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className={LABEL_CLASS}>Report Type</div>
                  <select
                    className={SELECT_POLISH}
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                  >
                    <option value="app-private-report">app-private-report</option>
                    <option value="hq-private-report">hq-private-report</option>
                  </select>
                </label>
                <label className="block">
                  <div className={LABEL_CLASS}>City</div>
                  <select
                    className={SELECT_POLISH}
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value as BranchCity);
                      setBranch("");
                    }}
                  >
                    <option value="dubai">Dubai</option>
                    <option value="manila">Manila</option>
                  </select>
                </label>
                <label className="block">
                  <div className={LABEL_CLASS}>Store / Branch</div>
                  <select className={SELECT_POLISH} value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">- Select branch -</option>
                    {(BRANCHES[(city as BranchCity) || "dubai"] || []).map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <div className={LABEL_CLASS}>Date / Time</div>
                  <input
                    type="datetime-local"
                    className={`${INPUT_POLISH} [color-scheme:dark]`}
                    value={dateTimeLocal}
                    onChange={(e) => setDateTimeLocal(e.target.value)}
                  />
                </label>
              </div>

              {reportType === "hq-private-report" ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className={LABEL_CLASS}>Category</div>
                    <select className={SELECT_POLISH} value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="App">App</option>
                      <option value="Operation">Operation</option>
                      <option value="Management">Management</option>
                      <option value="Staff issue">Staff issue</option>
                      <option value="Suggestion">Suggestion</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>Anonymous request</div>
                    <select
                      className={SELECT_POLISH}
                      value={anonymousRequest ? "yes" : "no"}
                      onChange={(e) => setAnonymousRequest(e.target.value === "yes")}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>What happened</div>
                    <textarea
                      className={TEXTAREA_POLISH}
                      rows={3}
                      value={whatHappened}
                      onChange={(e) => setWhatHappened(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>Why this is a problem</div>
                    <textarea
                      className={TEXTAREA_POLISH}
                      rows={3}
                      value={whyProblem}
                      onChange={(e) => setWhyProblem(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>How often it happens</div>
                    <input className={INPUT_POLISH} value={frequency} onChange={(e) => setFrequency(e.target.value)} />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>Who is affected</div>
                    <input
                      className={INPUT_POLISH}
                      value={affectedPeople}
                      onChange={(e) => setAffectedPeople(e.target.value)}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <label className="block">
                      <div className={LABEL_CLASS}>What support or change is needed</div>
                      <textarea
                        className={TEXTAREA_POLISH}
                        rows={3}
                        value={supportNeeded}
                        onChange={(e) => setSupportNeeded(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className={LABEL_CLASS}>Screen / Feature</div>
                    <input
                      className={INPUT_POLISH}
                      value={screenFeature}
                      onChange={(e) => setScreenFeature(e.target.value)}
                    />
                  </label>
                  <div />
                  <label className="block">
                    <div className={LABEL_CLASS}>Problem</div>
                    <textarea
                      className={TEXTAREA_POLISH}
                      rows={3}
                      value={problem}
                      onChange={(e) => setProblem(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>What you expected</div>
                    <textarea
                      className={TEXTAREA_POLISH}
                      rows={3}
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>What actually happened</div>
                    <textarea
                      className={TEXTAREA_POLISH}
                      rows={3}
                      value={actual}
                      onChange={(e) => setActual(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className={LABEL_CLASS}>Screenshot</div>
                    <input
                      className={INPUT_POLISH}
                      value={screenshot}
                      onChange={(e) => setScreenshot(e.target.value)}
                      placeholder="URL or short note"
                    />
                  </label>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Submit Private Report"
                  )}
                </button>
              </div>
            </>
          ) : null}

          {submitError ? (
            <div className="mt-6 rounded-2xl border border-rose-700/40 bg-rose-950/30 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-700/30 text-lg">
                  ❌
                </div>
                <div>
                  <div className="text-sm font-semibold text-rose-200">Submission Failed</div>
                  <div className="mt-0.5 text-xs text-rose-400/80">{submitError}</div>
                </div>
              </div>
            </div>
          ) : null}

          {result?.ok ? (
            <div className="mt-6 rounded-2xl border border-emerald-700/40 bg-emerald-950/30 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700/30 text-xl">
                  ✅
                </div>
                <div>
                  <div className="text-base font-semibold text-emerald-200">Report Submitted</div>
                  <div className="text-xs text-emerald-400/70">Your report has been received by HQ/HR</div>
                </div>
              </div>

              {result.receipt_message ? (
                <p className="mt-4 text-sm leading-relaxed text-neutral-300">{result.receipt_message}</p>
              ) : null}

              {result.report_id ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Report ID:</span>
                  <code className="rounded bg-neutral-900/60 px-2 py-0.5 text-[11px] font-mono text-neutral-400">
                    {result.report_id}
                  </code>
                </div>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200 transition hover:bg-emerald-950/60"
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
