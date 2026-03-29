import type { ReactNode } from "react";
import MenuTabs from "@/components/MenuTabs";

export default function MenuLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Menu Builder</div>
        <div className="mt-1 text-sm text-neutral-400">
          Independent workspace for Foodics-style menu categories, products, and ingredient mapping.
        </div>
        <div className="mt-3">
          <MenuTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
