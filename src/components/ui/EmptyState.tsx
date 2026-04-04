import type { ReactNode } from "react";

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      {icon ? <div className="text-zinc-600">{icon}</div> : null}
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  );
}
