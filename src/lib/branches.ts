export type City = "dubai" | "manila";

export type BranchCode =
  | "BB"
  | "JLT"
  | "MC"
  | "ARJ"
  | "AM"
  | "AB"
  | "CK"
  | "DRIVER"
  | "HQ"
  | "PAR"
  | "CUB"
  | "TAFT"
  | "BO"
  | "WH";

export type Branch = { code: BranchCode; name: string };

export const BRANCHES: Record<City, Branch[]> = {
  dubai: [
    { code: "BB", name: "Business Bay" },
    { code: "JLT", name: "JLT" },
    { code: "ARJ", name: "Arjan" },
    { code: "AM", name: "Al Mina" },
    { code: "AB", name: "Al Barsha" },
    { code: "CK", name: "Central Kitchen" },
    { code: "WH", name: "Warehouse" },
    { code: "DRIVER", name: "Delivery" },
    // The Dubai office. Five people are registered here on staff_master and
    // it had no entry in this list, so every screen built from it made them
    // pick a restaurant they do not work at. There is no QR poster for it
    // because it is an office, not a store.
    { code: "HQ", name: "HQ / Management" },
  ],
  manila: [
    { code: "PAR", name: "Paranaque" },
    { code: "CUB", name: "Cubao" },
    { code: "TAFT", name: "Taft" },
    { code: "CK", name: "Central Kitchen" },
    { code: "WH", name: "Warehouse" },
    { code: "BO", name: "Back Office" },
  ],
};

export function labelOf(city: City, code: string): string {
  const u = String(code || "").toUpperCase();
  if (city === "dubai" && u === "MC") return "Arjan";
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
    if (low.includes("warehouse") || low === "wh") return "WH";
    if (low.includes("back office") || low.includes("regus") || low === "bo") return "BO";
    // Manila's office is the Back Office. "HQ" typed here means the same
    // place — one code for it, or the spend splits across two names.
    if (low === "hq" || low.includes("head office") || low.includes("management")) return "BO";
  }

  if (city === "dubai") {
    const low = s.toLowerCase();
    if (low.includes("business") || low.includes("b bay") || low === "bb") return "BB";
    if (low.includes("jlt")) return "JLT";
    if (low.includes("motor city") || low.includes("m city") || low === "mc") return "ARJ";
    if (low.includes("arj")) return "ARJ";
    if (low.includes("al mina") || low.includes("amina") || low.includes("almina")) return "AM";
    if (low.includes("barsha")) return "AB";
    if (low.includes("driver") || low.includes("delivery")) return "DRIVER";
    if (low.includes("ck") || low.includes("central")) return "CK";
    if (low.includes("warehouse") || low === "wh") return "WH";
    if (low === "hq" || low.includes("head office") || low.includes("back office")
        || low.includes("management")) return "HQ";
  }

  return u || s;
}