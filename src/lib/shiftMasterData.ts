// ---------------------------------------------------------------------------
// Shift Master Data — types, utilities, violation checker, localStorage helpers
// ---------------------------------------------------------------------------

export type StaffMaster = {
  name: string;
  branch: string;
  roleTag: string; // "PIC" | "2nd PIC" | "Staff" | "PT" | "PIC / AM"
};

export type StaffTransport = {
  name: string;
  branch: string;
  transportType: string; // "Car Lift" | "Metro" | "Walking" | "Pickup (Nabaraj driver)" etc.
  hardEndHour: number | null; // e.g. 23 = must finish by 23:00
  pickupRequired: boolean;
  isWalking: boolean;
  pickupTimes: string;
  notes: string;
};

export type BranchPeakInfo = {
  branchKey: string; // as written in Excel: "JLT", "AB", "MC/Arjan", "AM/Hudaiba", "BB/Business Bay"
  branchCode: string; // system code: "JLT", "AB", "ARJ", "AM", "BB"
  lunchStart: number | null;
  lunchEnd: number | null;
  dinnerStart: number | null;
  dinnerEnd: number | null;
  lateNightStart: number | null;
  lateNightEnd: number | null;
};

export type VLEntry = {
  status: string; // "Approved" | "Pending" | "Completed"
  staffName: string;
  branch: string;
  vlStart: string; // "YYYY-MM-DD"
  vlEnd: string;   // "YYYY-MM-DD"
  notes: string;
};

export type ShiftMasterData = {
  staff: StaffMaster[];
  transport: StaffTransport[];
  branchPeaks: BranchPeakInfo[];
  vlCalendar: VLEntry[];
  uploadedAt: string; // ISO datetime
  filename: string;
};

export type ShiftViolation = {
  rowId: string;
  staffName: string;
  date: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  ruleId: string;
  message: string;
};

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------
const LS_KEY = "sushizen_shift_master_v1";

export function saveShiftMaster(data: ShiftMasterData): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function loadShiftMaster(): ShiftMasterData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShiftMasterData;
  } catch {
    return null;
  }
}

export function clearShiftMaster(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------
export function getTransport(name: string, data: ShiftMasterData): StaffTransport | undefined {
  const lower = name.toLowerCase().trim();
  return data.transport.find((t) => t.name.toLowerCase().trim() === lower);
}

export function getStaffRecord(name: string, data: ShiftMasterData): StaffMaster | undefined {
  const lower = name.toLowerCase().trim();
  return data.staff.find((s) => s.name.toLowerCase().trim() === lower);
}

export function isOnVL(name: string, date: string, data: ShiftMasterData): VLEntry | undefined {
  const lower = name.toLowerCase().trim();
  return data.vlCalendar.find(
    (v) =>
      v.staffName.toLowerCase().trim() === lower &&
      v.status === "Approved" &&
      v.vlStart <= date &&
      v.vlEnd >= date,
  );
}

export function getPeakInfo(branchCode: string, data: ShiftMasterData): BranchPeakInfo | undefined {
  return data.branchPeaks.find((b) => b.branchCode === branchCode);
}

// ---------------------------------------------------------------------------
// Violation checker (② )
// ---------------------------------------------------------------------------
type DraftRowLike = {
  id: string;
  work_date: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
};

function fmtH(h: number): string {
  if (h >= 24) return `${String(h - 24).padStart(2, "0")}:00(+1)`;
  return `${String(h).padStart(2, "0")}:00`;
}

export function checkViolations(
  rows: DraftRowLike[],
  masterData: ShiftMasterData,
): ShiftViolation[] {
  const violations: ShiftViolation[] = [];
  const seenKeys = new Set<string>();

  function addViolation(v: ShiftViolation) {
    const key = `${v.rowId}:${v.ruleId}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    violations.push(v);
  }

  // Per-row checks
  for (const row of rows) {
    const t = getTransport(row.staff_name, masterData);

    // R-03 / R-12 / R-08: Hard transport end time
    if (t?.hardEndHour != null && row.end_hour > t.hardEndHour) {
      addViolation({
        rowId: row.id,
        staffName: row.staff_name,
        date: row.work_date,
        severity: "CRITICAL",
        ruleId: "R-03",
        message: `${row.staff_name} must finish by ${fmtH(t.hardEndHour)} (${t.transportType}), but scheduled until ${fmtH(row.end_hour)}`,
      });
    }

    // R-15: Pickup required, late shift
    if (t?.pickupRequired && !t.hardEndHour && row.end_hour > 22) {
      addViolation({
        rowId: row.id,
        staffName: row.staff_name,
        date: row.work_date,
        severity: "CRITICAL",
        ruleId: "R-15",
        message: `${row.staff_name} requires confirmed pickup for shift ending ${fmtH(row.end_hour)} — confirm transport first`,
      });
    }

    // R-08 (Muna AB): must be 13:00–23:00 only
    if (row.staff_name.toLowerCase().includes("muna") && row.start_hour < 13) {
      addViolation({
        rowId: row.id,
        staffName: row.staff_name,
        date: row.work_date,
        severity: "HIGH",
        ruleId: "R-08",
        message: `Muna Rana Magar (AB): start time must be 13:00 or later (current: ${fmtH(row.start_hour)})`,
      });
    }

    // VL conflict check (④)
    const vl = isOnVL(row.staff_name, row.work_date, masterData);
    if (vl) {
      addViolation({
        rowId: row.id,
        staffName: row.staff_name,
        date: row.work_date,
        severity: "CRITICAL",
        ruleId: "VL",
        message: `${row.staff_name} is on approved leave (${vl.vlStart} – ${vl.vlEnd})`,
      });
    }
  }

  // Per-date group checks
  const byDate = new Map<string, DraftRowLike[]>();
  for (const row of rows) {
    if (!byDate.has(row.work_date)) byDate.set(row.work_date, []);
    byDate.get(row.work_date)!.push(row);
  }

  const warnedPairs = new Set<string>();
  for (const [date, dateRows] of byDate) {
    const picRows = dateRows.filter(
      (r) => getStaffRecord(r.staff_name, masterData)?.roleTag === "PIC",
    );
    const pic2Rows = dateRows.filter(
      (r) => getStaffRecord(r.staff_name, masterData)?.roleTag === "2nd PIC",
    );

    // R-01: PIC and 2nd PIC must not have identical shift times
    for (const pic of picRows) {
      for (const pic2 of pic2Rows) {
        const pairKey = `${date}:${pic.staff_name}:${pic2.staff_name}`;
        if (!warnedPairs.has(pairKey) && pic.start_hour === pic2.start_hour && pic.end_hour === pic2.end_hour) {
          warnedPairs.add(pairKey);
          addViolation({
            rowId: pic.id,
            staffName: pic.staff_name,
            date,
            severity: "CRITICAL",
            ruleId: "R-01",
            message: `PIC (${pic.staff_name}) and 2nd PIC (${pic2.staff_name}) have identical shift times on ${date} — stagger required`,
          });
        }
      }
    }

    // R-10: All staff on shift are PT
    if (dateRows.length > 0) {
      const allPT = dateRows.every(
        (r) => getStaffRecord(r.staff_name, masterData)?.roleTag === "PT",
      );
      if (allPT) {
        addViolation({
          rowId: dateRows[0].id,
          staffName: dateRows[0].staff_name,
          date,
          severity: "HIGH",
          ruleId: "R-10",
          message: `All staff on ${date} are part-time — at least 1 full-time staff required`,
        });
      }
    }

    // R-13: If PIC is absent (on VL), check no IC-capable backup
    if (picRows.length === 0 && dateRows.length > 0) {
      // Check if the PIC for this branch is on VL
      const branchPIC = masterData.staff.find(
        (s) => s.roleTag === "PIC" && dateRows.some(
          (r) => r.staff_name.toLowerCase() !== s.name.toLowerCase(),
        ),
      );
      if (branchPIC && isOnVL(branchPIC.name, date, masterData)) {
        // PIC is on VL but we already flag VL conflict via VL rule above
        // Just check that there's at least a 2nd PIC covering
        if (pic2Rows.length === 0) {
          addViolation({
            rowId: dateRows[0].id,
            staffName: dateRows[0].staff_name,
            date,
            severity: "HIGH",
            ruleId: "R-13",
            message: `No PIC or 2nd PIC on ${date} — ensure IC-capable staff is scheduled`,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// AI context builder (①)
// ---------------------------------------------------------------------------
export function buildAiContext(masterData: ShiftMasterData, targetMonth: string): string {
  const activeVL = masterData.vlCalendar.filter(
    (v) =>
      v.status === "Approved" &&
      (v.vlStart.slice(0, 7) === targetMonth || v.vlEnd.slice(0, 7) === targetMonth ||
       (v.vlStart < targetMonth + "-01" && v.vlEnd >= targetMonth + "-01")),
  );

  const transportWarnings = masterData.transport
    .filter((t) => t.hardEndHour != null || t.pickupRequired)
    .map(
      (t) =>
        `- ${t.name} (${t.branch}): ${t.transportType}${t.hardEndHour != null ? `, MUST end by ${fmtH(t.hardEndHour)}` : ", pickup required — confirm before late shift"}`,
    )
    .join("\n");

  const vlContext = activeVL.length
    ? activeVL
        .map(
          (v) =>
            `- ${v.staffName} (${v.branch}): VL ${v.vlStart} – ${v.vlEnd}${v.notes ? ` [${v.notes}]` : ""}`,
        )
        .join("\n")
    : "No active VL this period.";

  const picByBranch = ["JLT", "AB", "MC/Arjan", "AM/Hudaiba", "BB/Business Bay"]
    .map((b) => {
      const pic = masterData.staff.find((s) => s.branch === b && s.roleTag === "PIC");
      const pic2 = masterData.staff.find((s) => s.branch === b && s.roleTag === "2nd PIC");
      return `  ${b}: PIC=${pic?.name ?? "N/A"}, 2nd PIC=${pic2?.name ?? "N/A"}`;
    })
    .join("\n");

  return `=== SUSHI ZEN DUBAI SHIFT RULES CONTEXT (Auto-loaded from Staff Master) ===

TRANSPORT CONSTRAINTS — MUST FOLLOW:
${transportWarnings || "None."}

ACTIVE VACATION LEAVE (${targetMonth}):
${vlContext}

PIC / 2ND PIC BY BRANCH:
${picByBranch}

SCHEDULING PRIORITY RULES:
1. [CRITICAL] Never assign late shift without confirmed transport. Cap at 22:00 if unconfirmed.
2. [CRITICAL] PIC and 2nd PIC must NOT have identical shift times — stagger start/end for max coverage.
3. [CRITICAL] During peak hours, at least 1 PIC/2nd PIC/IC-capable staff must be present.
4. [CRITICAL] BB (Business Bay): mid-shift MUST end at 23:00. No 00:00 or 01:00 end for mid staff.
5. [CRITICAL] AM/Hudaiba: must always have late-night capable staff (Satwa-based: Bikram, Ramuel, Philip, Jheymar, Bijien, Angelo). Orders do NOT drop after midnight.
6. [HIGH] Muna Rana Magar (AB): 13:00–23:00 only. Never start at 11:00 AM.
7. [HIGH] Kapil Bahadur (JLT): Metro only — must finish by 23:00. Morning/Mid shifts only.
8. [HIGH] MC/Arjan: No pickup at 23:00 — plan shift ends at 22:00 or 00:00.
9. [HIGH] Part-time staff must always be paired with at least 1 full-time staff.
10. [MEDIUM] OHC Pending staff cannot be assigned as PIC.

PEAK HOURS BY BRANCH:
- JLT: Lunch 12:00–14:00, Dinner 18:00–21:00 (peak 19:00). Split shifts to cover both.
- AB: Dinner 18:00–22:00 (peak 19:00–20:00). Lunch very calm. Do not over-staff.
- MC/Arjan: Dinner 18:00–21:00 (peak 19:00). Saturday is biggest day (~121 orders). Evening staff concentration Fri–Sun.
- AM/Hudaiba: Dinner 19:00–21:00 + Late Night 23:00–02:00. Thu–Sun 120–180 orders. UNIQUE: orders continue past midnight.
- BB/Business Bay: Lunch 12:00–14:00, Dinner 18:00–21:00. After 00:00 orders drop. Mid-shift end at 23:00.

=== END CONTEXT ===
`;
}
