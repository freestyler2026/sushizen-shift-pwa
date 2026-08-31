"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_BODY,
  T_CAPTION,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

type TodayItem = {
  key: string;
  title: string;
  detail: string;
  count: number | null;
  severity: "red" | "amber" | "unknown";
  href: string;
};

type Today = {
  city: string;
  items: TodayItem[];
  item_count: number;
  red_count: number;
};

/** Everything across HR that needs a person today.
 *
 *  The work lives on nine pages, and the only way to know whether any of them
 *  needed attention was to open all nine. Nobody does that, which is how four
 *  policy deadlines, PHP 48,585 of unreleased final pay, fifteen overdue
 *  employment decisions and twenty-one unanswered notices all sat unnoticed at
 *  the same time.
 *
 *  Nothing is counted here. Every figure comes from the page it links to, so
 *  this screen cannot disagree with what you find when you follow it.
 */
export default function HrTodayPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [data, setData] = useState<Today | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !(canAccessAdminNav(auth) || auth.role === "HQ" || auth.role === "ADMIN")) {
      router.replace("/");
      return;
    }
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/today?city=${city}`, {
        headers: getAuthHeaders(auth),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Could not load (${res.status})`);
      setData((await res.json()) as Today);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={T_PAGE_TITLE}>HR — what needs you today</h1>
        <SelectDark
          value={city}
          onChange={(v) => setCity(v as "manila" | "dubai")}
          options={[
            { value: "manila", label: "Manila" },
            { value: "dubai", label: "Dubai" },
          ]}
        />
        <button className={`${SMALL_BUTTON} ml-auto`} onClick={() => void load()}>
          <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>
      <p className={`${T_CAPTION} mb-5`}>{today}</p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data && <p className={T_BODY}>Checking…</p>}

      {data && data.items.length === 0 && (
        <div className={`${GLASS_CARD} flex items-center gap-3 px-5 py-8`}>
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
          <div>
            <p className="text-base font-semibold text-white">Nothing needs you today.</p>
            <p className={T_CAPTION}>
              No overdue decisions, no unanswered notices, no one waiting on their
              final pay.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data?.items.map((item) => {
          const tone =
            item.severity === "red"
              ? "border-red-500/30 hover:border-red-500/50"
              : item.severity === "amber"
              ? "border-amber-500/25 hover:border-amber-500/45"
              : "border-white/10 hover:border-white/20";
          const dot =
            item.severity === "red"
              ? "bg-red-400"
              : item.severity === "amber"
              ? "bg-amber-400"
              : "bg-zinc-500";

          const body = (
            <div className="flex items-start gap-3">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-white">{item.title}</p>
                <p className={`${T_CAPTION} mt-0.5`}>{item.detail}</p>
              </div>
              {item.href && (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
              )}
            </div>
          );

          // An item whose own check failed greys out on its own. A dashboard that
          // goes blank because one corner is broken is worse than nine pages.
          if (!item.href) {
            return (
              <div key={item.key} className={`${GLASS_CARD} ${tone} px-4 py-3.5`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[15px] font-medium text-zinc-300">{item.title}</p>
                    <p className={`${T_CAPTION} mt-0.5`}>{item.detail}</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`${GLASS_CARD} ${tone} block px-4 py-3.5 transition-colors`}
            >
              {body}
            </Link>
          );
        })}
      </div>

      {data && data.items.length > 0 && (
        <p className={`${T_CAPTION} mt-5`}>
          Each line opens the page that owns it. The figures are read from those
          pages rather than counted again here, so this screen cannot tell you
          something different from what you find when you follow it.
        </p>
      )}
    </div>
  );
}
