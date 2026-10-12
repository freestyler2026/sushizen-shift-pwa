/**
 * 同じ理由で失敗し続けている人に、押し直しを勧め続けない。
 *
 * Android は「この端末に該当する鍵が無い」を `NotAllowedError` で返す。画面は
 * `NotImplementedError` のときだけ「Register this device」と案内していたので、
 * 該当鍵が無い人が受け取るのは「もう一度 Clock In を押してください」だった。
 * **押しても通らない。** Alex Delgado は30日で124回これを繰り返し、その間
 * PAR が毎日 StoreHub から手で勤怠を入れていた。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "src", "app", "attendance", "page.tsx"), "utf-8");
const CODE = SRC.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("a passkey check that keeps failing", () => {
  it("counts consecutive failures", () => {
    expect(CODE).toMatch(/consecutiveFailRef\.current\s*\+=\s*1/);
  });

  it("resets the count on a success, so one bad tap does not stick", () => {
    expect(CODE).toMatch(/consecutiveFailRef\.current\s*=\s*0/);
  });

  it("stops telling the person to tap the same button again", () => {
    // 2回目からは登録に誘導する。
    expect(CODE).toMatch(/consecutiveFailRef\.current\s*>=\s*2/);
    expect(CODE).toMatch(/Register this device/);
  });

  it("still says plainly that nothing was recorded", () => {
    // 静かな失敗で午前中を失った件（Peter Villafuerte, 9/17）の再発防止。
    expect(CODE).toMatch(/Not clocked in/);
    expect(CODE).toMatch(/nothing was recorded|Nothing was recorded/);
  });

  it("names how many times it failed, so the message is not the same one twice", () => {
    expect(CODE).toMatch(/times in a row/);
  });
});
