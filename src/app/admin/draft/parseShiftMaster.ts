// ---------------------------------------------------------------------------
// parseShiftMaster.ts — parse Sushi ZEN Master Excel file in the browser
// Uses dynamic import of "xlsx" to avoid SSR issues
// ---------------------------------------------------------------------------
import type {
  ShiftMasterData,
  StaffMaster,
  StaffTransport,
  BranchPeakInfo,
  VLEntry,
} from "@/lib/shiftMasterData";

function getCellStr(row: unknown[], idx: number): string {
  const v = row[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// Parse Excel serial date (number) or date-like string → "YYYY-MM-DD"
function parseExcelDate(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "number") {
    // Excel serial: days since Jan 1 1900 (with Lotus 1900 leap-year bug)
    const utc = (v - 25569) * 86400 * 1000;
    const d = new Date(utc);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

// "Metro — until 23:00 only" or "Bus — until 23:00" → 23
function parseHardEndHourFromRestriction(s: string): number | null {
  const m = s.match(/until\s+(\d{1,2}):00/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

// Hard_End_Time column: "23:00" → 23, "None" / "None (pickup)" → null
function parseHardEndHourFromColumn(s: string): number | null {
  if (!s || s === "None" || s === "None (pickup)") return null;
  const m = s.match(/(\d{1,2}):00/);
  if (m) return parseInt(m[1], 10);
  return null;
}

// "12:00–14:00" or "18:00–21:00 (peak: 19:00)" → { start: 12, end: 14 }
function parsePeakWindow(s: string): { start: number; end: number } | null {
  if (!s || s.toLowerCase().includes("minimal") || s.toLowerCase().includes("none")) return null;
  // Match first occurrence of HH:00–HH:00
  const m = s.match(/(\d{1,2}):00\s*[–\-]\s*(\d{1,2}):00/);
  if (!m) return null;
  return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
}

// Map Excel branch names → system branch codes
function mapBranchCode(branch: string): string {
  const b = branch.toLowerCase();
  if (b === "bb" || b.includes("business bay")) return "BB";
  if (b === "jlt") return "JLT";
  if (b === "mc" || b.includes("arjan") || b.includes("mc/")) return "ARJ";
  if (b === "am" || b.includes("hudaiba") || b.includes("al mina") || b.includes("mina")) return "AM";
  if (b === "ab" || b.includes("barsha")) return "AB";
  if (b.includes("central kitchen") || b === "ck") return "CK";
  return branch.toUpperCase();
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------
export async function parseShiftMasterXlsx(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ShiftMasterData> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });

  // ── Sheet 1: Staff Master ─────────────────────────────────────────────────
  const staff: StaffMaster[] = [];
  const ws1 = wb.Sheets["1_Staff_Master"];
  if (ws1) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws1, { header: 1, defval: null });
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const name = getCellStr(r, 0);
      if (!name || name.startsWith("LEGEND")) break;
      staff.push({
        name,
        branch: getCellStr(r, 1),
        roleTag: getCellStr(r, 3), // Role_Tag column
      });
    }
  }

  // ── Sheet 4: Transport Rules ──────────────────────────────────────────────
  const transport: StaffTransport[] = [];
  const ws4 = wb.Sheets["4_Transport_Rules"];
  if (ws4) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws4, { header: 1, defval: null });
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const name = getCellStr(r, 0);
      if (!name) continue;
      const transportType = getCellStr(r, 3);
      const hardEndStr = getCellStr(r, 4); // Hard_End_Time column
      const hardEndHour = parseHardEndHourFromColumn(hardEndStr)
        ?? parseHardEndHourFromRestriction(transportType);
      const pickupRequired = transportType.toLowerCase().includes("pickup");
      const isWalking = transportType.toLowerCase().includes("walk");
      transport.push({
        name,
        branch: getCellStr(r, 1),
        transportType,
        hardEndHour,
        pickupRequired,
        isWalking,
        pickupTimes: getCellStr(r, 6),
        notes: getCellStr(r, 7),
      });
    }
  }

  // ── Sheet 2: Store Rules → Branch Peak Info ───────────────────────────────
  const branchPeaks: BranchPeakInfo[] = [];
  const ws2 = wb.Sheets["2_Store_Rules"];
  if (ws2) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1, defval: null });
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const branchKey = getCellStr(r, 0);
      if (!branchKey) continue;
      const lunch = parsePeakWindow(getCellStr(r, 3));
      const dinner = parsePeakWindow(getCellStr(r, 4));
      const lateNight = parsePeakWindow(getCellStr(r, 5));
      branchPeaks.push({
        branchKey,
        branchCode: mapBranchCode(branchKey),
        lunchStart: lunch?.start ?? null,
        lunchEnd: lunch?.end ?? null,
        dinnerStart: dinner?.start ?? null,
        dinnerEnd: dinner?.end ?? null,
        lateNightStart: lateNight?.start ?? null,
        lateNightEnd: lateNight?.end ?? null,
      });
    }
  }

  // ── Sheet 8: VL Absence Calendar ─────────────────────────────────────────
  const vlCalendar: VLEntry[] = [];
  const ws8 = wb.Sheets["8_VL_Absence_Calendar"];
  if (ws8) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws8, { header: 1, defval: null });
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const status = getCellStr(r, 0);
      if (!status) continue;
      const startDate = parseExcelDate(r[3]);
      const endDate = parseExcelDate(r[4]);
      if (!startDate || !endDate) continue;
      vlCalendar.push({
        status,
        branch: getCellStr(r, 1),
        staffName: getCellStr(r, 2),
        vlStart: startDate,
        vlEnd: endDate,
        notes: getCellStr(r, 8),
      });
    }
  }

  return {
    staff,
    transport,
    branchPeaks,
    vlCalendar,
    uploadedAt: new Date().toISOString(),
    filename,
  };
}
