"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, LockKeyhole, RefreshCcw } from "lucide-react";
import { getAuth, setAuth } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_BODY,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";

function getApiBase() {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "";
}

type ChangePinResp = {
  ok: boolean;
  staff_name: string;
  message: string;
};

export default function ChangePinPage() {
  const router = useRouter();
  const [staffName, setStaffName] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Fchange-pin");
      return;
    }
    setStaffName(auth.staffName);
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const name = staffName.trim();
      const cur = currentPin.trim();
      const nextPin = newPin.trim();
      const confirm = confirmPin.trim();

      if (!name) throw new Error("Staff name is required.");
      if (!cur) throw new Error("Current PIN is required.");
      if (!nextPin) throw new Error("New PIN is required.");
      if (nextPin !== confirm) throw new Error("PIN confirmation does not match.");
      if (!/^\d{4,8}$/.test(nextPin)) throw new Error("PIN must be 4 to 8 numeric digits.");
      if (nextPin === cur) throw new Error("New PIN must be different from current PIN.");

      const res = await fetch(`${getApiBase()}/api/auth/change_pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: name,
          current_pin: cur,
          new_pin: nextPin,
          confirm_pin: confirm,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.parse(text)?.detail || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || text || `Change PIN failed: ${res.status}`);
      }
      const data = (text ? JSON.parse(text) : {}) as ChangePinResp;
      const auth = getAuth();
      if (auth?.staffName) {
        setAuth({ ...auth, pin: nextPin });
      }
      setCurrentPin(nextPin);
      setNewPin("");
      setConfirmPin("");
      setSuccess(data.message || "PIN changed successfully.");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to change PIN"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-3xl px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Change PIN</h1>
            <p className={T_BODY}>Update your login PIN and keep your session secure.</p>
          </div>
          <span className={BADGE_WARNING}>
            <KeyRound className="h-3 w-3" />
            Private credential
          </span>
        </div>

        <div className={`${BLUSH_GLASS} p-6`}>
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h2 className={T_SECTION}>PIN Settings</h2>
          </div>

          <div className={`${BLUSH_HIGHLIGHT} mb-6 flex items-start gap-3 px-4 py-3`}>
            <LockKeyhole className="mt-0.5 h-4 w-4 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-200">Use a numeric PIN with 4 to 8 digits.</p>
              <p className={T_CAPTION}>Avoid reusing your current PIN or sharing it with other staff.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Name</label>
              <input
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={staffName}
                readOnly
                placeholder="Your exact name"
              />
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Current PIN</label>
              <input
                type="password"
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Current PIN"
              />
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>New PIN</label>
              <input
                type="password"
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="4 to 8 digits"
              />
            </div>

            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Confirm New PIN</label>
              <input
                type="password"
                className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirm new PIN"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className={T_CAPTION}>Changes update your saved local session PIN after success.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPin("");
                    setNewPin("");
                    setConfirmPin("");
                    setError("");
                    setSuccess("");
                  }}
                  className={BLUSH_SECONDARY}
                >
                  <span className="flex items-center gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    Clear
                  </span>
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={BLUSH_PRIMARY}
                >
                  {loading ? "Updating..." : "Update PIN"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
