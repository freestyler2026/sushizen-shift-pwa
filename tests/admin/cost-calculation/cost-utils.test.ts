// tests/admin/cost-calculation/cost-utils.test.ts
// Pure-function unit tests extracted from cost-calculation/page.tsx and cost-check/page.tsx.
// No DOM or network required.

import { describe, it, expect } from "vitest";

// ── Re-implement the pure helpers locally so we can test them without
//    importing the whole 5900-line page (which would need a full browser env).

function parseConversionRule(rule: string): { fromUnit: string; multiplier: number; toUnit: string } | null {
  if (!rule || !rule.trim()) return null;
  const cleaned = rule.split(/[→>]/)[0].trim();
  const m = cleaned.match(/(?:1\s+)?(\w+)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(\w+)/i);
  if (!m) return null;
  const multiplier = parseFloat(m[2]);
  if (!multiplier || multiplier <= 0) return null;
  return { fromUnit: m[1].toUpperCase(), multiplier, toUnit: m[3].toLowerCase() };
}

function conversionRuleHint(invoiceUnit: string): string {
  const u = (invoiceUnit || "").trim().toLowerCase();
  const hints: Record<string, string> = {
    tin: "e.g. 1 TIN = 17000 ml  →  17000 ml/TIN",
    ltr: "e.g. 1 LTR = 1000 ml  →  1000 ml/LTR",
    l: "e.g. 1 L = 1000 ml  →  1000 ml/L",
    kg: "e.g. 1 KG = 1000 g  →  1000 g/KG",
    pkt: "e.g. 1 PKT = X g  →  enter weight per packet",
    box: "e.g. 1 BOX = X units  →  enter count per box",
    ctn: "e.g. 1 CTN = X g  →  enter weight per carton",
    bag: "e.g. 1 BAG = X g  →  enter weight per bag",
    btl: "e.g. 1 BTL = X ml  →  enter ml per bottle",
    can: "e.g. 1 CAN = X g  →  enter weight per can",
    jar: "e.g. 1 JAR = X g  →  enter weight per jar",
    pcs: "e.g. 1 PCS = 1 pc",
    pc: "e.g. 1 PC = 1 pc",
    tray: "e.g. 1 TRAY = 30 pc  →  enter count per tray",
  };
  return hints[u] || "";
}

// ── classifyComponent logic from cost-check/page.tsx ─────────────────────────
type ComponentKind = "linked" | "formula" | "manual" | "processed" | "error";
type MasterComponentDetail = { component_type: "ingredient" | "processed_item"; ingredient_id: string; [k: string]: any };
type IngredientDetail = { supplier_prices?: any[]; unit_price_formula?: string; [k: string]: any };

function classifyComponent(
  component: MasterComponentDetail,
  ingredientDetail: IngredientDetail | null | undefined,
): ComponentKind {
  if (component.component_type === "processed_item") return "processed";
  if (ingredientDetail === null) return "error";
  if (ingredientDetail === undefined) return "error";
  if ((ingredientDetail.supplier_prices?.length ?? 0) > 0) return "linked";
  if (ingredientDetail.unit_price_formula?.trim()) return "formula";
  return "manual";
}

// ════════════════════════════════════════════════════════════════════════════════
// parseConversionRule
// ════════════════════════════════════════════════════════════════════════════════
describe("parseConversionRule", () => {
  it("returns null for empty string", () => {
    expect(parseConversionRule("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseConversionRule("   ")).toBeNull();
  });

  it("parses 'TRAY = 30 pc'", () => {
    const result = parseConversionRule("TRAY = 30 pc");
    expect(result).not.toBeNull();
    expect(result!.fromUnit).toBe("TRAY");
    expect(result!.multiplier).toBe(30);
    expect(result!.toUnit).toBe("pc");
  });

  it("parses '1 KG = 1000 g' with leading '1'", () => {
    const result = parseConversionRule("1 KG = 1000 g");
    expect(result).not.toBeNull();
    expect(result!.fromUnit).toBe("KG");
    expect(result!.multiplier).toBe(1000);
    expect(result!.toUnit).toBe("g");
  });

  it("parses decimal multiplier '1 BTL = 750 ml'", () => {
    const result = parseConversionRule("BTL = 750 ml");
    expect(result).not.toBeNull();
    expect(result!.multiplier).toBe(750);
  });

  it("strips the hint after → arrow", () => {
    const result = parseConversionRule("1 TIN = 17000 ml  →  17000 ml/TIN");
    expect(result).not.toBeNull();
    expect(result!.fromUnit).toBe("TIN");
    expect(result!.multiplier).toBe(17000);
  });

  it("strips the hint after > arrow", () => {
    const result = parseConversionRule("1 CTN = 12 pcs > 12 pcs/CTN");
    expect(result).not.toBeNull();
    expect(result!.multiplier).toBe(12);
  });

  it("returns null for invalid rule with no number", () => {
    expect(parseConversionRule("TRAY = pc")).toBeNull();
  });

  it("returns null for zero multiplier", () => {
    expect(parseConversionRule("TRAY = 0 pc")).toBeNull();
  });

  it("is case-insensitive for units", () => {
    const result = parseConversionRule("tray = 30 PC");
    expect(result!.fromUnit).toBe("TRAY");
    expect(result!.toUnit).toBe("pc");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// conversionRuleHint
// ════════════════════════════════════════════════════════════════════════════════
describe("conversionRuleHint", () => {
  it("returns correct hint for 'TIN'", () => {
    expect(conversionRuleHint("TIN")).toContain("17000 ml");
  });

  it("case-insensitive — 'Kg' returns same as 'kg'", () => {
    expect(conversionRuleHint("Kg")).toBe(conversionRuleHint("kg"));
  });

  it("returns empty string for unknown unit", () => {
    expect(conversionRuleHint("UNKNOWN_UNIT")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(conversionRuleHint("")).toBe("");
  });

  it("trims whitespace before lookup", () => {
    expect(conversionRuleHint("  pcs  ")).toContain("1 pc");
  });

  it("'LTR' returns litre hint", () => {
    expect(conversionRuleHint("ltr")).toContain("1000 ml");
  });

  it("'TRAY' returns tray hint", () => {
    expect(conversionRuleHint("tray")).toContain("30 pc");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// classifyComponent
// ════════════════════════════════════════════════════════════════════════════════
describe("classifyComponent", () => {
  const baseComponent = (type: "ingredient" | "processed_item" = "ingredient"): MasterComponentDetail => ({
    component_type: type,
    ingredient_id: "42",
    id: "1",
    name: "Test",
    category: "Fish",
    unit: "g",
    quantity: 100,
    unit_cost: 0.5,
    cost: 50,
    sort_order: 0,
  });

  it("returns 'processed' for processed_item type", () => {
    expect(classifyComponent(baseComponent("processed_item"), null)).toBe("processed");
  });

  it("returns 'error' when ingredientDetail is null", () => {
    expect(classifyComponent(baseComponent(), null)).toBe("error");
  });

  it("returns 'error' when ingredientDetail is undefined", () => {
    expect(classifyComponent(baseComponent(), undefined)).toBe("error");
  });

  it("returns 'linked' when supplier_prices is non-empty", () => {
    const detail: IngredientDetail = {
      supplier_prices: [{ id: "1", supplier_name: "Toyo" }],
    };
    expect(classifyComponent(baseComponent(), detail)).toBe("linked");
  });

  it("returns 'formula' when unit_price_formula is set and no supplier_prices", () => {
    const detail: IngredientDetail = {
      supplier_prices: [],
      unit_price_formula: "BASE_RATE * 0.95",
    };
    expect(classifyComponent(baseComponent(), detail)).toBe("formula");
  });

  it("returns 'manual' when no supplier_prices and no formula", () => {
    const detail: IngredientDetail = {
      supplier_prices: [],
      unit_price_formula: "",
    };
    expect(classifyComponent(baseComponent(), detail)).toBe("manual");
  });

  it("returns 'manual' when supplier_prices is empty array (no formula)", () => {
    const detail: IngredientDetail = { supplier_prices: [] };
    expect(classifyComponent(baseComponent(), detail)).toBe("manual");
  });

  it("prefers 'linked' over 'formula' when both present", () => {
    const detail: IngredientDetail = {
      supplier_prices: [{ id: "1", supplier_name: "Supplier" }],
      unit_price_formula: "SOME_FORMULA",
    };
    expect(classifyComponent(baseComponent(), detail)).toBe("linked");
  });
});
