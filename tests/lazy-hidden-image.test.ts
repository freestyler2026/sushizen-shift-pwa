/**
 * A photo that is hidden until it loads must not also be lazy.
 *
 * The Morning Review card went to "Loading the photo…" and stayed there.
 * The three states were right; the image never started. Measured on
 * production 2026-10-10:
 *
 *     complete: false, naturalWidth: 0, loading: "lazy",
 *     display: "none", currentSrc: ""
 *
 * `loading="lazy"` defers until the element is near the viewport, and a
 * `display: none` element never is — so no request, no `onLoad`, no `onError`,
 * and the caption sits there for good. Fetching the same URL by hand returned
 * 200, image/jpeg, 582 KB in 1.3 s, so nothing behind it was broken.
 *
 * The two attributes arrived separately: `loading="lazy"` came with the screen
 * (9904086b) and the hidden-until-loaded state with the fix for a different
 * complaint (7896d34c), which is why nobody saw them meet.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("images that are hidden until they load", () => {
  it("never carry loading=lazy", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = readFileSync(file, "utf8");
      for (const tag of src.match(/<img\b[\s\S]*?\/?>/g) || []) {
        // A comment saying why the attribute is absent is not the attribute.
        if (!/\bloading\s*=\s*["']lazy["']/.test(tag)) continue;
        if (!/\bhidden\b/.test(tag)) continue;
        offenders.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the img tags at all, so the check cannot pass by reading nothing", () => {
    const withImg = tsxFiles("src").filter((f) =>
      /<img\b/.test(readFileSync(f, "utf8")),
    );
    expect(withImg.length).toBeGreaterThan(3);
  });
});
