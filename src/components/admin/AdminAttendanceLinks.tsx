"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, History, ShieldCheck, Upload } from "lucide-react";
import { GLASS_CARD, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";

const modules = [
  {
    id: "01-import",
    number: 1,
    title: "Import",
    href: "/admin/attendance/import",
    description: "Bayzat Excel / CSV upload and Drive sync",
    path: "/admin/attendance/import",
  },
  {
    id: "02-history",
    number: 2,
    title: "History",
    href: "/admin/attendance/history",
    description: "Import results, duplicates, notes, target date, CSV",
    path: "/admin/attendance/history",
  },
  {
    id: "03-locations",
    number: 3,
    title: "Locations",
    href: "/admin/attendance/locations",
    description: "Collect and review raw Bayzat locations",
    path: "/admin/attendance/locations",
  },
  {
    id: "04-mapping",
    number: 4,
    title: "Location Mapping",
    href: "/admin/attendance/mapping",
    description: "Map raw locations to canonical branches",
    path: "/admin/attendance/mapping",
  },
  {
    id: "05-employees",
    number: 5,
    title: "Employee Matching",
    href: "/admin/attendance/employees",
    description: "Map Bayzat employees to staff master",
    path: "/admin/attendance/employees",
  },
  {
    id: "06-verify",
    number: 6,
    title: "Verify",
    href: "/admin/analytics",
    description: "Scheduled vs actual, late, no-show, missing IN/OUT",
    path: "/admin/analytics",
  },
  {
    id: "07-monthly-summary",
    number: 7,
    title: "Monthly Summary",
    href: "/admin/analytics",
    description: "Monthly staff and branch attendance summary",
    path: "/admin/analytics",
  },
  {
    id: "08-monthly-closing",
    number: 8,
    title: "Monthly Closing",
    href: "/admin/attendance/monthly-closing",
    description: "Lock a month after review",
    path: "/admin/attendance/monthly-closing",
  },
  {
    id: "09-payroll",
    number: 9,
    title: "Payroll Export",
    href: "/admin/analytics",
    description: "Review and export payroll support CSV",
    path: "/admin/analytics",
  },
  {
    id: "10-corrections",
    number: 10,
    title: "Corrections",
    href: "/admin/corrections",
    description: "Regularization and audit-friendly corrections",
    path: "/admin/corrections",
  },
];

export default function AdminAttendanceLinks() {
  return (
    <section className="space-y-3">
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <p className={T_SECTION}>Attendance Admin</p>
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-0.5 text-xs text-zinc-400">
            Import / Normalize / Verify / Monthly Ops
          </span>
        </div>
        <p className={`${T_CAPTION} mb-4`}>Bayzat import, mapping, analytics, closing and payroll support.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link
          href="/admin/attendance/import"
          className="cursor-pointer rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/12 to-orange-500/6 p-4 transition-all duration-200 hover:border-amber-500/40"
        >
          <div className="mb-1 flex items-center gap-2">
            <Upload className="h-3.5 w-3.5 text-violet-400" />
            <p className="text-xs font-semibold text-violet-400">Open Step 1: Import</p>
          </div>
          <p className={T_CAPTION}>Daily Bayzat file upload / Drive sync</p>
        </Link>
        <Link
          href="/admin/attendance/history"
          className="cursor-pointer rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 to-blue-500/5 p-4 transition-all duration-200 hover:border-sky-500/40"
        >
          <div className="mb-1 flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-sky-400" />
            <p className="text-xs font-semibold text-sky-400">Open Step 2: History</p>
          </div>
          <p className={T_CAPTION}>Import logs, duplicates, notes, target date, CSV export</p>
        </Link>
        <Link
          href="/admin/analytics"
          className="cursor-pointer rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4 transition-all duration-200 hover:border-emerald-500/40"
        >
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-400">Open Step 6: Verify</p>
          </div>
          <p className={T_CAPTION}>Scheduled vs actual verification and attendance KPIs</p>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod, index) => (
          <motion.div
            key={mod.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Link href={mod.href}>
              <div className={`${GLASS_CARD} group cursor-pointer p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/8`}>
                <div className="mb-2 flex items-start justify-between">
                  <p className="text-sm font-semibold text-white transition-colors duration-200 group-hover:text-violet-400">
                    {mod.number}) {mod.title}
                  </p>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-violet-400" />
                </div>
                <p className={`${T_BODY} mb-2`}>{mod.description}</p>
                <p className="font-mono text-[10px] text-zinc-600">{mod.path}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
