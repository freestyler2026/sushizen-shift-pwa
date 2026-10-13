/**
 * 当番表の担当者に Discord ID を入れる場所が、警告の出る画面にあること。
 *
 * この画面は「◯◯ には Discord ID がありません」と出していたのに、入れる欄が
 * 無かった。唯一の入力欄は Direct Purchase の画面にあり、当番表とは何の関係も
 * ない。2026-10-13、Yusuke が新しいマネージャー3名の登録を依頼してきて分かった。
 * 彼は自分で入れる場所を探したはずで、見つけられなかった。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "src", "app", "admin", "management", "assignments", "page.tsx"),
  "utf-8",
);
const CODE = SRC.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("the roster's missing Discord IDs", () => {
  it("can be set on the screen that reports them missing", () => {
    expect(CODE).toContain("RosterDiscord");
    expect(CODE).toMatch(/"\/api\/admin\/management\/channel-discord"/);
    expect(CODE).toMatch(/method:\s*"PUT"/);
  });

  it("does not send them to the exception-owner table instead", () => {
    // bo-pages/discord は例外タイプの担当者用（bo_assignments）。宛先が別。
    const roster = CODE.slice(CODE.indexOf("function RosterDiscord"), CODE.indexOf("function OwnerDiscord"));
    expect(roster).not.toContain("bo-pages/discord");
  });

  it("refuses something that is not a Discord user ID", () => {
    // 名前やユーザー名を貼ると、黙って保存されて通知が届かないままになる。
    expect(CODE).toMatch(/\\d\{5,\}/);
  });

  it("reloads after saving, so the warning clears without a refresh", () => {
    expect(CODE).toMatch(/onSaved=\{\(\) => void load\(\)\}/);
  });
});
