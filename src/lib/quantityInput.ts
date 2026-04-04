const COUNT_UNITS = new Set(["pcs", "pc", "piece", "pieces", "pkt", "packet", "packets", "bag", "bags", "box", "boxes"]);
const MEASURE_UNITS = new Set(["kg", "g", "gram", "grams", "ml", "l", "liter", "liters", "litre", "litres"]);

function normalizeUnit(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function getInventoryQuantityStep(unit?: string) {
  const normalized = normalizeUnit(unit || "");
  if (COUNT_UNITS.has(normalized)) return 1;
  if (MEASURE_UNITS.has(normalized)) return 0.1;
  return 1;
}

export function getInventoryQuantityMin(unit?: string) {
  return getInventoryQuantityStep(unit);
}

export function getInventoryCostStep() {
  return 0.01;
}

export function getStepPrecision(step: number) {
  const text = String(step || 0);
  const dot = text.indexOf(".");
  return dot >= 0 ? text.length - dot - 1 : 0;
}

export function parseDraftNumber(value: string) {
  const normalized = String(value || "").trim().replace(/,/g, ".");
  if (!normalized || normalized === "." || normalized === "-" || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDraftNumber(value: number, fallback = "") {
  return Number.isFinite(value) ? String(value) : fallback;
}

export function stepDraftNumber(value: string, step: number, direction: 1 | -1, min = 0) {
  const parsed = parseDraftNumber(value);
  const base = parsed === null ? min : parsed;
  const next = Math.max(min, base + step * direction);
  const precision = getStepPrecision(step);
  return precision > 0 ? next.toFixed(precision) : String(Math.round(next));
}
