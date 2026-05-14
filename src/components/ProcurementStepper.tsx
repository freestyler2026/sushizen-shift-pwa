"use client";

import { Check } from "lucide-react";

const STEPS = [
  { key: "request", label: "Request" },
  { key: "approval", label: "Approval" },
  { key: "receiving", label: "Receiving" },
  { key: "claim", label: "Claim" },
] as const;

export type ProcurementStep = (typeof STEPS)[number]["key"] | "hub";

export function ProcurementStepper({ currentStep }: { currentStep: ProcurementStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center justify-center w-full py-1">
        {STEPS.map((step, idx) => {
          const isDone = currentIdx > -1 && idx < currentIdx;
          const isActive = step.key === currentStep;
          const isFuture = currentIdx === -1 ? true : idx > currentIdx;
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-200",
                    isDone
                      ? "bg-violet-500/80 text-white"
                      : isActive
                        ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/30 ring-offset-1 ring-offset-[#0a0b14]"
                        : "bg-white/6 text-zinc-500 border border-white/10",
                  ].join(" ")}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <span>{idx + 1}</span>}
                </div>
                <span
                  className={[
                    "text-[10px] font-semibold uppercase tracking-wide",
                    isActive ? "text-violet-300" : isDone ? "text-violet-400/60" : "text-zinc-600",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={[
                    "mx-2 mb-4 h-px w-10 transition-colors duration-200 xl:w-16",
                    isDone ? "bg-violet-500/50" : "bg-white/8",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: condensed pill */}
      {currentStep !== "hub" && (
        <div className="sm:hidden flex items-center gap-2 text-xs text-zinc-400">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
            {currentIdx + 1}
          </div>
          <span className="text-violet-300 font-semibold">
            {STEPS[currentIdx]?.label}
          </span>
          <span className="text-zinc-600">of {STEPS.length}</span>
        </div>
      )}
    </>
  );
}
