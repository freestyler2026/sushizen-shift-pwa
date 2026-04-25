"use client";

import { useEffect, useState } from "react";
import { defaultProcurementName, defaultProcurementPin, saveProcurementSession } from "@/lib/procurementClient";

export default function ProcurementSessionBar() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPin, setDraftPin] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const n = defaultProcurementName();
    const p = defaultProcurementPin();
    setName(n);
    setPin(p);
    if (!n) {
      // Pre-fill draft from auth if session not set yet
      setDraftName(n);
      setDraftPin(p);
      setEditing(true);
    }
  }, []);

  function save() {
    if (!draftName.trim()) return;
    saveProcurementSession(draftName.trim(), draftPin.trim());
    setName(draftName.trim());
    setPin(draftPin.trim());
    setEditing(false);
  }

  // Don't render server-side (sessionStorage not available)
  if (!mounted) return null;

  if (editing || !name) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-800/40 bg-violet-950/15 px-3 py-2">
        <span className="text-xs font-medium text-violet-300">Who are you?</span>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Your name"
          autoFocus
          className="flex-1 min-w-[140px] rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
        />
        <input
          type="password"
          value={draftPin}
          onChange={(e) => setDraftPin(e.target.value)}
          placeholder="PIN"
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={!draftName.trim()}
          className="rounded-lg border border-violet-700 bg-violet-900/40 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-800/50 disabled:opacity-50"
        >
          Set Session
        </button>
        {name && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            Cancel
          </button>
        )}
        <span className="w-full text-[11px] text-neutral-600">
          Entered once per browser session — no need to re-enter on each tab
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/20 px-3 py-1.5">
      <span className="text-xs text-neutral-500">Session:</span>
      <span className="text-sm font-medium text-neutral-200">{name}</span>
      {pin && (
        <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">
          PIN {"●".repeat(Math.min(pin.length, 4))}
        </span>
      )}
      <button
        type="button"
        onClick={() => { setDraftName(name); setDraftPin(pin); setEditing(true); }}
        className="ml-auto rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
      >
        Change
      </button>
    </div>
  );
}
