// src/lib/branches.ts
export type City = "dubai" | "manila";

export type BranchCode =
  | "BB" | "JLT" | "ARJ" | "AM" | "AB" | "CK" | "DRIVER"
  | "PAR" | "CUB" | "TAFT";

export const BRANCHES: Record<City, Array<{ code: BranchCode; label: string }>> = {
  dubai: [
    { code: "BB", label: "Business Bay" },
    { code: "JLT", label: "JLT" },
    { code: "ARJ", label: "Arjan" },
    { code: "AM", label: "Al Mina" },
    { code: "AB", label: "Al Barsha" },
    { code: "CK", label: "Central Kitchen" },
    { code: "DRIVER", label: "Delivery" },
  ],
  manila: [
    { code: "PAR", label: "Paranaque" },
    { code: "CUB", label: "Cubao" },
    { code: "TAFT", label: "Taft" },
    { code: "CK", label: "Central Kitchen" },
  ],
};

export function labelOf(city: City, code: string): string {
  const c = (code || "").toUpperCase();
  return BRANCHES[city].find(x => x.code === (c as any))?.label || code;
}

// UI入力（Paranaque等）をコードへ寄せる（互換）
export function normalizeBranchCode(city: City, v: string): string {
  const s = (v || "").trim();
  const u = s.toUpperCase();

  // already code
  if (BRANCHES[city].some(x => x.code === (u as any))) return u;

  // labels -> code
  const hit = BRANCHES[city].find(x => x.label.toLowerCase() === s.toLowerCase());
  if (hit) return hit.code;

  // legacy aliases
  if (city === "manila") {
    if (s.toLowerCase().includes("par")) return "PAR";
    if (s.toLowerCase().includes("cub")) return "CUB";
    if (s.toLowerCase().includes("taft")) return "TAFT";
  }
  return u || s;
}