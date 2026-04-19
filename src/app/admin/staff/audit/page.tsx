import { Suspense } from "react";
import StaffAuditClient from "./staff-audit-client";

export default function StaffAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffAuditClient />
    </Suspense>
  );
}
