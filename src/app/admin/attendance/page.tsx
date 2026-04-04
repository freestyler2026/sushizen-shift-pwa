"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart2, Layers, UserCheck } from "lucide-react";
import AdminAttendanceLinks from "@/components/admin/AdminAttendanceLinks";
import { canAccessAdminNav, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_CAPTION, T_PAGE_TITLE, T_SECTION } from "@/lib/ui-tokens";

const scopeItems = [
  "Daily Bayzat attendance report upload",
  "Duplicate detection by file hash",
  "Raw location auto-registration and mapping",
  "Employee matching to staff master",
  "Scheduled vs actual comparison",
  "Attendance analytics and monthly review",
];

const flowItems = [
  "Import Bayzat file",
  "Review import history and duplicates",
  "Map new locations and employees",
  "Review comparison and analytics",
  "Apply corrections if needed",
  "Review monthly summary, close month, export payroll CSV",
];

export default function AttendanceAdminPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const resolved = refreshed || auth;
      if (!resolved?.staffName || !resolved?.accessToken) {
        router.replace("/login?next=%2Fadmin%2Fattendance");
        return;
      }
      setAllowed(canAccessAdminNav(resolved));
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth, router]);

  if (!ready) {
    return <div className="min-h-screen bg-neutral-950 px-6 py-10 text-sm text-neutral-400">Loading attendance admin...</div>;
  }

  if (!allowed) {
    return <div className="min-h-screen bg-neutral-950 px-6 py-10 text-sm text-red-300">Attendance admin is available only to authorized admin roles.</div>;
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="space-y-8">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-500/10">
                  <UserCheck className="h-5 w-5 text-sky-400" />
                </div>
                <div>
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-500">ATTENDANCE ADMIN</p>
                  <h1 className={T_PAGE_TITLE}>Bayzat Attendance Management</h1>
                  <p className={T_CAPTION}>Upload files, review imports, map locations, verify attendance, run payroll</p>
                </div>
              </div>
              <Link href="/admin/analytics" className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
                <BarChart2 className="h-4 w-4" />
                Open Main Analytics
              </Link>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`${GLASS_CARD} p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-violet-400" />
                  <h2 className={T_SECTION}>Current Scope</h2>
                </div>
                <ul className="space-y-1.5">
                  {scopeItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`${GLASS_CARD} p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-400" />
                  <h2 className={T_SECTION}>Operational Flow</h2>
                </div>
                <ul className="space-y-2">
                  {flowItems.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/15 text-[10px] font-bold text-sky-400">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <AdminAttendanceLinks />

            <div className="mt-8 flex flex-col gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
              <Link href="/signup" className="transition hover:text-white">
                ← Back to Sign Up Hub
              </Link>
              <Link href="/" className="transition hover:text-white">
                Back to Home
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
