"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, Download } from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

const monthStates = [
  { month: "Current Month", status: "In review", badge: "warning" },
  { month: "Previous Month", status: "Closed", badge: "success" },
  { month: "Older Periods", status: "Open", badge: "error" },
] as const;

function badgeClass(kind: (typeof monthStates)[number]["badge"]) {
  if (kind === "success") return BADGE_SUCCESS;
  if (kind === "warning") return BADGE_WARNING;
  return BADGE_ERROR;
}

export default function AttendanceMonthlyClosingPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/admin/attendance" className={SECONDARY_BUTTON}>
              ← Back to Attendance
            </Link>
            <Link href="/admin/analytics" className={SECONDARY_BUTTON}>
              Open Analytics
            </Link>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-teal-500/10">
              <CalendarCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-400">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Monthly Closing</h1>
              <p className={T_CAPTION}>Review month-end attendance status and continue payroll-related export flow.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className={`${GLASS_CARD} p-5`}>
              <h2 className={T_SECTION}>Month Status</h2>
              <div className="mt-4 space-y-3">
                {monthStates.map((item) => (
                  <div key={item.month} className={`${GLASS_CARD} flex items-center justify-between p-4`}>
                    <div>
                      <p className={T_LABEL}>{item.month}</p>
                      <p className={T_BODY}>{item.status}</p>
                    </div>
                    <span className={badgeClass(item.badge)}>{item.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${GLASS_CARD} p-5`}>
              <h2 className={T_SECTION}>Next Actions</h2>
              <p className={`${T_BODY} mt-2`}>
                Dedicated close-month mutation logic is not wired on this route yet, so the page currently acts as a launchpad into the existing analytics and export flow.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                >
                  <CalendarCheck className="h-4 w-4" />
                  Close Month
                </button>
                <Link href="/admin/analytics" className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
                  Review Attendance Analytics
                </Link>
                <Link href="/admin/analytics" className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
                  <Download className="h-4 w-4" />
                  Export Payroll CSV
                </Link>
              </div>
            </section>
          </div>

          {confirmOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
              <div className={`${GLASS_CARD} w-full max-w-md p-5`}>
                <p className={T_LABEL}>Close Confirmation</p>
                <h2 className={`${T_SECTION} mt-2`}>Close current attendance month?</h2>
                <p className={`${T_BODY} mt-2`}>
                  Final month-closing logic is not yet available on this route. Continue to analytics to complete the current review and payroll export flow.
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className={SECONDARY_BUTTON}
                  >
                    Cancel
                  </button>
                  <Link
                    href="/admin/analytics"
                    className={`${DANGER_BUTTON} flex items-center gap-2`}
                    onClick={() => setConfirmOpen(false)}
                  >
                    Continue to Analytics
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </main>
  );
}
