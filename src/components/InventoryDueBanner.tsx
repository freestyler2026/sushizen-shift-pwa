"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";

/** Supplier ordering is calculated from these counts, so a count that has not
 *  been entered by its cut-off is an order about to be built on yesterday's
 *  figures — the fault that shorted Paranaque for weeks. The banner reads the
 *  same management task the BO Dashboard shows, so the two never disagree. */
type Props = {
  /** "wh_inventory_missing" | "ck_inventory_missing" */
  taskType: string;
  /** Shown in the banner, e.g. "14:00". */
  cutoff: string;
  city?: string;
};

type Task = {
  id: number;
  type: string;
  source_id: string | null;
  status: string;
  manager_name: string | null;
  context?: { date?: string } | null;
};

function todayManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export default function InventoryDueBanner({ taskType, cutoff, city = "manila" }: Props) {
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/management/tasks?city=${encodeURIComponent(city)}&type=${taskType}&limit=20`,
          { headers: getAuthHeaders(getAuth()) as Record<string, string>, cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json() as { tasks?: Task[] };
        const today = todayManila();
        // Only today's. An older one still open says the count was missed then,
        // which belongs on the dashboard, not on top of today's working screen.
        const hit = (data.tasks ?? []).find(
          (t) => (t.context?.date ?? t.source_id?.split(":")[0]) === today
            && t.status !== "closed",
        );
        if (!cancelled) setTask(hit ?? null);
      } catch {
        /* a banner that cannot load must not break the page under it */
      }
    })();
    return () => { cancelled = true; };
  }, [taskType, city]);

  if (!task) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="text-sm">
        <p className="font-semibold text-amber-200">
          Today&apos;s count has not been entered ({cutoff} cut-off passed)
        </p>
        <p className="mt-0.5 text-amber-200/80">
          Supplier orders are calculated from this count. Please complete it today.
          {task.manager_name ? ` This is with ${task.manager_name}.` : ""}
        </p>
      </div>
    </div>
  );
}
