import type { ReactNode } from "react";
import ProcurementTabs from "@/components/ProcurementTabs";

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Procurement Phase1</div>
        <div className="mt-1 text-sm text-neutral-400">Requests, approval inbox, case workflow, document chain, PO, exceptions, and audit.</div>
        <div className="mt-3">
          <ProcurementTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
