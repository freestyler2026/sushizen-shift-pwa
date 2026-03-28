import { useEffect, useState } from "react";

export function parseIsoTimeMs(isoLike: string): number | null {
  const value = String(isoLike || "").trim();
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return timestamp;
}

export function isOlderThan(isoLike: string, maxAgeMs: number, nowMs = Date.now()): boolean {
  const timestamp = parseIsoTimeMs(isoLike);
  if (timestamp == null) return false;
  return nowMs - timestamp > maxAgeMs;
}

export function getRecentBadgeMaxAgeMs(defaultDays = 7): number {
  const raw = String(process.env.NEXT_PUBLIC_PROC_RECENT_MAX_DAYS || "").trim();
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * 24 * 60 * 60 * 1000;
  }
  return defaultDays * 24 * 60 * 60 * 1000;
}

export function useRelativeAgeNow(intervalMs = 60_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowMs;
}

export function formatRelativeAge(isoLike: string, nowMs = Date.now()): string {
  const timestamp = parseIsoTimeMs(isoLike);
  if (timestamp == null) return "";

  const diffMs = nowMs - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;

  const years = Math.floor(days / 365);
  return `${years} y ago`;
}
