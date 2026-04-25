import type { ReactNode } from "react";
import ProcurementTabs from "@/components/ProcurementTabs";
import ProcurementSessionBar from "@/components/ProcurementSessionBar";
import { GLASS_CARD, T_BODY, T_PAGE_TITLE } from "@/lib/ui-tokens";

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD} p-4`}>
        <div className={T_PAGE_TITLE}>Procurement Control</div>
        <div className={`mt-1 ${T_BODY}`}>Requests through payment control, KPI visibility, stockout risk review, and emergency whitelist operations.</div>
        <ProcurementSessionBar />
        <div className="mt-3">
          <ProcurementTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
