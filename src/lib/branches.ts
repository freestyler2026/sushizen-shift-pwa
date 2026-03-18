export type City = "dubai" | "manila";

export type BranchCode =
  | "BB"
  | "JLT"
  | "ARJ"
  | "AM"
  | "AB"
  | "CK"
  | "DRIVER"
  | "PAR"
  | "CUB"
  | "TAFT";

export type Branch = { code: BranchCode; name: string };

export const BRANCHES: Record<City, Branch[]> = {
  dubai: [
    { code: "BB", name: "Business Bay" },
    { code: "JLT", name: "JLT" },
    { code: "ARJ", name: "Arjan" },
    { code: "AM", name: "Al Mina" },
    { code: "AB", name: "Al Barsha" },
    { code: "CK", name: "Central Kitchen" },
    { code: "DRIVER", name: "Delivery" },
  ],
  manila: [
    { code: "PAR", name: "Paranaque" },
    { code: "CUB", name: "Cubao" },
    { code: "TAFT", name: "Taft" },
    { code: "CK", name: "Central Kitchen" },
  ],
};

export function labelOf(city: City, code: string): string {
  const u = String(code || "").toUpperCase();
  return BRANCHES[city].find((x) => x.code === (u as BranchCode))?.name || code;
}

export function normalizeBranchCode(city: City, v: string): BranchCode | string {
  const s = String(v || "").trim();
  const u = s.toUpperCase();

  if (BRANCHES[city].some((x) => x.code === (u as BranchCode))) return u as BranchCode;

  const hit = BRANCHES[city].find((x) => x.name.toLowerCase() === s.toLowerCase());
  if (hit) return hit.code;

  if (city === "manila") {
    const low = s.toLowerCase();
    if (low.includes("para")) return "PAR";
    if (low.includes("cub")) return "CUB";
    if (low.includes("taft")) return "TAFT";
    if (low.includes("ck") || low.includes("central")) return "CK";
  }

  if (city === "dubai") {
    const low = s.toLowerCase();
    if (low.includes("business") || low.includes("b bay") || low === "bb") return "BB";
    if (low.includes("jlt")) return "JLT";
    if (low.includes("arj")) return "ARJ";
    if (low.includes("al mina") || low.includes("amina") || low.includes("almina")) return "AM";
    if (low.includes("barsha")) return "AB";
    if (low.includes("driver") || low.includes("delivery")) return "DRIVER";
    if (low.includes("ck") || low.includes("central")) return "CK";
  }

  return u || s;
}