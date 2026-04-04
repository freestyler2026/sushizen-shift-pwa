"use client";

import { useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

export default function ProcurementPriceChecksPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(
        canAccessProcurementAdmin(
          String((refreshed || auth)?.role || ""),
          String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
        ),
      );
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading price checks...</div>;
  }

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-lg font-semibold text-neutral-100">Price Checks</div>
        <div className="mt-2 text-sm text-neutral-400">
          This workspace is reserved for procurement price review tasks. The data source and action flow are being connected.
        </div>
      </section>
    </div>
  );
}
