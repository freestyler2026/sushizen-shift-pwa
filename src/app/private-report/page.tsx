"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareWarning, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_BODY,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

type ReportType = "app-private-report" | "hq-private-report";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";

export default function PrivateReportPage() {
  const router = useRouter();
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
    setError("");
    setResult(null);
    try {
      const refreshed = await refreshAuthFromApi(auth);
      const accessToken = refreshed?.accessToken || auth?.accessToken;
      if (!accessToken) throw new Error("Please log in again.");
      if (!reportDatetime.trim()) throw new Error("Date / Time is required.");
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
        <div className={`p-3 ${BLUSH_HIGHLIGHT}`}>
          Anonymous posting notice: this report is handled as anonymous to other staff, but HQ/HR may still see your name for follow-up support.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Report Type">
            <select
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
            >
              <option value="app-private-report">app-private-report</option>
              <option value="hq-private-report">hq-private-report</option>
            </select>
          </Field>
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
          <Field label="Store / Branch">
            <input
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="e.g. BB"
            />
          </Field>
          <Field label="Date / Time">
            <input
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
                className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
                className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={anonymousRequest ? "yes" : "no"}
                onChange={(e) => setAnonymousRequest(e.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="What happened">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
              />
            </Field>
            <Field label="Why this is a problem">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={whyProblem}
                onChange={(e) => setWhyProblem(e.target.value)}
              />
            </Field>
            <Field label="How often it happens">
              <input
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              />
            </Field>
            <Field label="Who is affected">
              <input
                className={INPUT_CLASS}
                value={affectedPeople}
                onChange={(e) => setAffectedPeople(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="What support or change is needed">
                <textarea
                  className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={screenFeature}
                onChange={(e) => setScreenFeature(e.target.value)}
              />
            </Field>
            <div />
            <Field label="Problem">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
              />
            </Field>
            <Field label="What you expected">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </Field>
            <Field label="What actually happened">
              <textarea
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                rows={3}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </Field>
            <Field label="Screenshot">
              <input
                className={INPUT_CLASS}
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
            className={BLUSH_PRIMARY}
          >
            {loading ? "Submitting..." : "Submit Private Report"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setResult(null);
            }}
            className={BLUSH_SECONDARY}
          >
            Clear result
          </button>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        {result ? (
          <div className={`${BLUSH_GLASS} mt-4 p-3 text-sm text-neutral-200`}>
            <div className="flex items-center gap-2 font-medium">
              <MessageSquareWarning className="h-4 w-4 text-amber-300" />
              Accepted
            </div>
            <div className="mt-1 text-neutral-300">A receipt message was sent to your Inbox.</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-400">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
      </motion.div>
    </div>
  );
}
