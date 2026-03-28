"use client";

import { useRouter } from "next/navigation";
import { clearAuth } from "@/lib/auth";

export default function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  const logout = () => {
    // ✅ auth削除
    clearAuth();

    // ✅ roleも削除（明示）
    try {
      localStorage.removeItem("sushizen_shift_role_v1");
    } catch {}

    // ✅ cookie削除（念のため）
    document.cookie = "sushizen_authed=; path=/; max-age=0";

    // ✅ loginへ
    router.replace("/login");
  };

  return (
    <button
      onClick={logout}
      className={[
        "rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-900",
        className,
      ].join(" ")}
    >
      Logout
    </button>
  );
}