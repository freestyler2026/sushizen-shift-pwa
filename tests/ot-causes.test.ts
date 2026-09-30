/**
 * One vocabulary, three screens.
 *
 * The staff picker, the admin picker and the admin chip labels each carried
 * their own copy of these eight codes until 2026-09-30. The server drops a
 * code it does not know without saying so, so a code that exists in one copy
 * and not another is a chip that records nothing.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OT_CAUSES, OT_CAUSE_LABELS, AVOIDABLE_CAUSES } from "@/lib/ot-causes";

const ROOT = join(__dirname, "..");
// The backend lives in a sibling checkout that CI does not have. Comparing
// against it locally is worth more than not comparing at all; skipping there
// is better than a red build for a missing directory (lesson 50).
const BACKEND = "/Users/jaynishimura/Desktop/sushizen_shift_app_clean/app/db.py";
const withBackend = existsSync(BACKEND) ? it : it.skip;

describe("overtime cause codes", () => {
  withBackend("matches OT_CAUSES on the server, exactly", () => {
    // The backend is the validator; this file is a mirror of it.
    const py = readFileSync(BACKEND, "utf8");
    const block = py.split("OT_CAUSES: Dict[str, Dict[str, Any]] = {")[1].split("\n}")[0];
    const rows = Array.from(block.matchAll(/^\s*"([a-z_]+)":\s*\{(.*)$/gm));
    const server = rows.map((m) => m[1]).sort();
    expect(server.length).toBeGreaterThan(0);
    expect(OT_CAUSES.map((c) => c.code).sort()).toEqual(server);
    // The server also says which two point at how the shift was run.
    const serverAvoidable = rows.filter((m) => /"avoidable":\s*True/.test(m[2]))
      .map((m) => m[1]).sort();
    expect(Array.from(AVOIDABLE_CAUSES).sort()).toEqual(serverAvoidable);
  });

  it("gives every code both a prompt and a short label", () => {
    for (const c of OT_CAUSES) {
      expect(c.prompt.length, c.code).toBeGreaterThan(0);
      expect(OT_CAUSE_LABELS[c.code], c.code).toBeTruthy();
    }
    expect(Object.keys(OT_CAUSE_LABELS)).toHaveLength(OT_CAUSES.length);
  });

  it("marks only causes that exist", () => {
    for (const code of AVOIDABLE_CAUSES) {
      expect(OT_CAUSES.some((c) => c.code === code), code).toBe(true);
    }
  });

  it("is the only copy — no screen keeps its own list", () => {
    for (const f of ["src/app/admin/overtime/page.tsx", "src/app/store/overtime-request/page.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, `${f} imports the shared list`).toContain('from "@/lib/ot-causes"');
      // A second literal list of the same codes is the thing this replaced.
      const inline = src.match(/code:\s*"(orders|short_staffed|carry_over)"/g) || [];
      expect(inline, `${f} still declares causes inline`).toHaveLength(0);
    }
  });
});
