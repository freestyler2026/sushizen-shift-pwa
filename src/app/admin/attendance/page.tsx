"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  MapPin,
  RefreshCw,
  Upload,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { canAccessAdminNav, getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, T_CAPTION, T_LABEL, T_PAGE_TITLE, T_SECTION } from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = "SUCCESS" | "IMPORTED" | "FAILED" | "PARTIAL" | "DUPLICATE" | "PROCESSING" | "ROLLED_BACK";

type LatestBatch = {
  status: BatchStatus;
  imported_rows: number;
  error_rows: number;
  date_from?: string;
  date_to?: string;
  target_date?: string;
  created_at?: string;
  city?: string;
};

type DashStatus = {
  latestBatch: LatestBatch | null;
  unmappedLocations: number;
  unmatchedEmployees: number;
  loadedAt: Date | null;
  error: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: BatchStatus) {
  if (s === "SUCCESS" || s === "IMPORTED") return "text-emerald-400";
  if (s === "FAILED" || s === "ROLLED_BACK") return "text-red-400";
  if (s === "DUPLICATE") return "text-amber-400";
  if (s === "PARTIAL") return "text-orange-400";
  return "text-zinc-400";
}

function statusIcon(s: BatchStatus) {
  if (s === "SUCCESS" || s === "IMPORTED") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "FAILED" || s === "ROLLED_BACK") return <XCircle className="h-4 w-4 text-red-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-400" />;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return d.slice(0, 10);
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getApiBase() {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceAdminPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [status, setStatus] = useState<DashStatus>({
    latestBatch: null,
    unmappedLocations: 0,
    unmatchedEmployees: 0,
    loadedAt: null,
    error: "",
  });
  const [refreshing, setRefreshing] = useState(false);
  const resolvedAuth = useRef<ReturnType<typeof getAuth>>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const resolved = refreshed || auth;
      resolvedAuth.current = resolved;
      if (!resolved?.staffName || !resolved?.accessToken) {
        router.replace("/login?next=%2Fadmin%2Fattendance");
        return;
      }
      const ok = canAccessAdminNav(resolved);
      setAllowed(ok);
      setReady(true);
      if (ok) void loadStatus();
    }
    void init();
    return () => { cancelled = true; };
  }, [auth, router]);

  const loadStatus = async () => {
    setRefreshing(true);
    try {
      const headers = getAuthHeaders();

      // Fetch latest import batch
      const [histRes, locRes, empRes] = await Promise.allSettled([
        fetch(`${getApiBase()}/api/admin/attendance/history?limit=1&offset=0`, { headers, cache: "no-store" }),
        fetch(`${getApiBase()}/api/admin/attendance/locations?limit=500`, { headers, cache: "no-store" }),
        fetch(`${getApiBase()}/api/admin/attendance/employee-matches?limit=500`, { headers, cache: "no-store" }),
      ]);

      let latestBatch: LatestBatch | null = null;
      if (histRes.status === "fulfilled" && histRes.value.ok) {
        const d = await histRes.value.json().catch(() => null);
        const rows: LatestBatch[] = Array.isArray(d?.rows) ? d.rows : Array.isArray(d?.batches) ? d.batches : [];
        latestBatch = rows[0] ?? null;
      }

      let unmappedLocations = 0;
      if (locRes.status === "fulfilled" && locRes.value.ok) {
        const d = await locRes.value.json().catch(() => null);
        const locs: { branch_code?: string | null }[] = Array.isArray(d?.locations) ? d.locations : Array.isArray(d?.rows) ? d.rows : [];
        unmappedLocations = locs.filter((l) => !l.branch_code).length;
      }

      let unmatchedEmployees = 0;
      if (empRes.status === "fulfilled" && empRes.value.ok) {
        const d = await empRes.value.json().catch(() => null);
        const emps: { canonical_staff_name?: string | null }[] = Array.isArray(d?.employees) ? d.employees : Array.isArray(d?.rows) ? d.rows : [];
        unmatchedEmployees = emps.filter((e) => !e.canonical_staff_name).length;
      }

      setStatus({ latestBatch, unmappedLocations, unmatchedEmployees, loadedAt: new Date(), error: "" });
    } catch (e) {
      setStatus((prev) => ({ ...prev, error: e instanceof Error ? e.message : "Failed to load status" }));
    } finally {
      setRefreshing(false);
    }
  };

  if (!ready) {
    return <div className="min-h-screen bg-neutral-950 px-6 py-10 text-sm text-neutral-400">Loading...</div>;
  }
  if (!allowed) {
    return <div className="min-h-screen bg-neutral-950 px-6 py-10 text-sm text-red-300">Attendance admin is available only to authorized admin roles.</div>;
  }

  const { latestBatch, unmappedLocations, unmatchedEmployees, loadedAt, error } = status;
  const hasPending = unmappedLocations > 0 || unmatchedEmployees > 0;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-500/10">
                <UserCheck className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-500">ATTENDANCE ADMIN</p>
                <h1 className={T_PAGE_TITLE}>Bayzat Attendance</h1>
                <p className={T_CAPTION}>Import · Map · Verify · Correct</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStatus()}
                disabled={refreshing}
                className={SECONDARY_BUTTON + " flex items-center gap-1.5 px-3 py-1.5 text-xs"}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <Link href="/admin/analytics" className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
                <BarChart2 className="h-4 w-4" />
                Analytics
              </Link>
            </div>
          </div>

          {/* ── Live Status Dashboard ──────────────────────────────────── */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">

            {/* Latest Import */}
            <div className={GLASS_CARD + " p-4"}>
              <p className={T_LABEL + " mb-2 flex items-center gap-1.5"}>
                <Upload className="h-3.5 w-3.5 text-sky-400" />
                Latest Import
              </p>
              {latestBatch ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(latestBatch.status)}
                    <span className={`text-sm font-semibold ${statusColor(latestBatch.status)}`}>
                      {latestBatch.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    {latestBatch.imported_rows ?? "?"} records
                    {latestBatch.error_rows ? <span className="ml-1 text-red-400">({latestBatch.error_rows} errors)</span> : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Coverage: {fmtDate(latestBatch.date_from)} → {fmtDate(latestBatch.date_to)}
                  </p>
                  {latestBatch.created_at && (
                    <p className="flex items-center gap-1 text-[11px] text-zinc-600">
                      <Clock className="h-3 w-3" />
                      {timeAgo(latestBatch.created_at)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">{error ? "Could not load" : "No imports yet"}</p>
              )}
            </div>

            {/* Unmapped Locations */}
            <div className={GLASS_CARD + " p-4 " + (unmappedLocations > 0 ? "border-amber-500/30" : "")}>
              <p className={T_LABEL + " mb-2 flex items-center gap-1.5"}>
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                Unmapped Locations
              </p>
              {unmappedLocations > 0 ? (
                <div className="space-y-2">
                  <p className="text-2xl font-bold text-amber-400">{unmappedLocations}</p>
                  <p className="text-xs text-zinc-400">locations need branch assignment</p>
                  <Link href="/admin/attendance/locations" className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:underline">
                    Fix now <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">All mapped</span>
                  </div>
                  <p className="text-xs text-zinc-500">No pending location assignments</p>
                </div>
              )}
            </div>

            {/* Unmatched Employees */}
            <div className={GLASS_CARD + " p-4 " + (unmatchedEmployees > 0 ? "border-orange-500/30" : "")}>
              <p className={T_LABEL + " mb-2 flex items-center gap-1.5"}>
                <Users className="h-3.5 w-3.5 text-orange-400" />
                Unmatched Employees
              </p>
              {unmatchedEmployees > 0 ? (
                <div className="space-y-2">
                  <p className="text-2xl font-bold text-orange-400">{unmatchedEmployees}</p>
                  <p className="text-xs text-zinc-400">Bayzat names need staff matching</p>
                  <Link href="/admin/attendance/employees" className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:underline">
                    Match now <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">All matched</span>
                  </div>
                  <p className="text-xs text-zinc-500">No pending employee assignments</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending banner */}
          {hasPending && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">
                Action required before running attendance analytics:
                {unmappedLocations > 0 && <span className="ml-1">· {unmappedLocations} unmapped location{unmappedLocations > 1 ? "s" : ""}</span>}
                {unmatchedEmployees > 0 && <span className="ml-1">· {unmatchedEmployees} unmatched employee{unmatchedEmployees > 1 ? "s" : ""}</span>}
              </p>
            </div>
          )}

          {loadedAt && (
            <p className={T_CAPTION + " mb-6 text-right"}>
              Status as of {loadedAt.toLocaleTimeString()}
            </p>
          )}

          {/* ── Daily Workflow ─────────────────────────────────────────── */}
          <div className="mb-2 flex items-center gap-2">
            <h2 className={T_SECTION}>Daily Workflow</h2>
          </div>
          <p className={T_CAPTION + " mb-4"}>Follow these steps each day after receiving the Bayzat report.</p>

          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                step: 1,
                title: "Import",
                desc: "Sync today's Bayzat attendance file from Google Drive",
                href: "/admin/attendance/import",
                icon: Upload,
                color: "text-violet-400",
                border: "border-violet-500/25 hover:border-violet-500/50",
                bg: "from-violet-500/10 to-purple-500/5",
                badge: null,
              },
              {
                step: 2,
                title: "Import History",
                desc: "Review past imports, check for duplicates or errors",
                href: "/admin/attendance/history",
                icon: History,
                color: "text-sky-400",
                border: "border-sky-500/25 hover:border-sky-500/50",
                bg: "from-sky-500/10 to-blue-500/5",
                badge: null,
              },
              {
                step: 3,
                title: "Map Locations",
                desc: "Assign Bayzat location names to branch codes",
                href: "/admin/attendance/locations",
                icon: MapPin,
                color: unmappedLocations > 0 ? "text-amber-400" : "text-emerald-400",
                border: unmappedLocations > 0 ? "border-amber-500/40 hover:border-amber-500/60" : "border-emerald-500/20 hover:border-emerald-500/40",
                bg: unmappedLocations > 0 ? "from-amber-500/12 to-orange-500/6" : "from-emerald-500/8 to-teal-500/4",
                badge: unmappedLocations > 0 ? unmappedLocations : null,
              },
              {
                step: 4,
                title: "Match Employees",
                desc: "Link Bayzat employee names to Staff Master records",
                href: "/admin/attendance/employees",
                icon: Users,
                color: unmatchedEmployees > 0 ? "text-orange-400" : "text-emerald-400",
                border: unmatchedEmployees > 0 ? "border-orange-500/40 hover:border-orange-500/60" : "border-emerald-500/20 hover:border-emerald-500/40",
                bg: unmatchedEmployees > 0 ? "from-orange-500/12 to-red-500/6" : "from-emerald-500/8 to-teal-500/4",
                badge: unmatchedEmployees > 0 ? unmatchedEmployees : null,
              },
              {
                step: 5,
                title: "Verify Attendance",
                desc: "Compare scheduled vs actual · Late · No-show · Missing IN/OUT",
                href: "/admin/analytics",
                icon: CheckCircle2,
                color: "text-emerald-400",
                border: "border-emerald-500/25 hover:border-emerald-500/50",
                bg: "from-emerald-500/10 to-teal-500/5",
                badge: null,
              },
              {
                step: 6,
                title: "Corrections",
                desc: "Regularize and correct attendance records with audit trail",
                href: "/admin/corrections",
                icon: AlertTriangle,
                color: "text-rose-400",
                border: "border-rose-500/25 hover:border-rose-500/50",
                bg: "from-rose-500/10 to-red-500/5",
                badge: null,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
              >
                <Link
                  href={item.href}
                  className={`group relative flex h-full min-h-[130px] flex-col rounded-2xl border bg-gradient-to-br ${item.border} ${item.bg} p-4 transition-all duration-200 hover:scale-[1.015] hover:shadow-lg`}
                >
                  {item.badge !== null && (
                    <span className="absolute right-3 top-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">
                      {item.badge}
                    </span>
                  )}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-[10px] font-bold text-zinc-400">
                      {item.step}
                    </span>
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                    <p className={`text-sm font-semibold ${item.color}`}>{item.title}</p>
                  </div>
                  <p className={T_CAPTION + " flex-1"}>{item.desc}</p>
                  <ChevronRight className="mt-2 h-3.5 w-3.5 self-end text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-white/50" />
                </Link>
              </motion.div>
            ))}
          </div>

          {/* ── Quick Access ───────────────────────────────────────────── */}
          <div className="mb-2 flex items-center gap-2">
            <h2 className={T_SECTION}>Quick Access</h2>
          </div>
          <p className={T_CAPTION + " mb-4"}>Direct links to frequently used views.</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Analytics", sub: "Overtime · Late · Absence", href: "/admin/analytics", icon: BarChart2, color: "text-violet-400" },
              { label: "Import Now", sub: "Sync from Drive", href: "/admin/attendance/import", icon: Upload, color: "text-sky-400" },
              { label: "Locations", sub: "Map branch codes", href: "/admin/attendance/locations", icon: MapPin, color: "text-amber-400" },
              { label: "Employees", sub: "Match to staff", href: "/admin/attendance/employees", icon: UserCheck, color: "text-emerald-400" },
            ].map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`${GLASS_CARD} group flex flex-col gap-1 p-3 transition-all hover:border-white/20 hover:bg-white/8`}
              >
                <item.icon className={`h-4 w-4 ${item.color}`} />
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-[11px] text-zinc-500">{item.sub}</p>
              </Link>
            ))}
          </div>

        </motion.div>
      </div>
    </main>
  );
}
