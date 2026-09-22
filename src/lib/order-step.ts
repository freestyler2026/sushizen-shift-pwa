/**
 * Does this unit count whole things?
 *
 * The order generator rounds a shortfall up to the catalog's order step. Where
 * no step is set it writes the raw arithmetic, and on 2026-09-03 Taft ordered
 * 29.998 PKT of crabstick, 49.997 pcs of dumplings and 4.998 BNDL of thermal
 * paper. Nobody can pick 0.998 of a bundle.
 *
 * Kilos are different: 0.3 kg of mint is a real order, and across 120 days the
 * produce lines are full of them. So a missing step is only worth flagging
 * where the unit counts things — otherwise the warning lands on most of the
 * catalog and stops being read.
 */
const WHOLE_THING_UNITS = new Set([
  "pc", "pcs", "piece", "pieces",
  "pkt", "pack", "packet", "packs",
  "bndl", "bdl", "bundle",
  "box", "case", "tray", "set", "roll", "sachet", "bag", "jar", "tub",
  "btl", "bottle", "can", "tin",
  "ea", "unit", "pax",
]);

export function countsInWholeThings(unit?: string | null): boolean {
  const u = String(unit ?? "").trim().toLowerCase();
  if (!u) return false;
  return WHOLE_THING_UNITS.has(u);
}
