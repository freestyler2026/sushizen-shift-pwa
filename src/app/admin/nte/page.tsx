"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NteRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/notice-to-explain"); }, [router]);
  return null;
}
