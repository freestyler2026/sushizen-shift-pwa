/**
 * 取込の結果表示は、サーバーが返したキーを読む。
 *
 * ここは `d.upserted` を読んでいた。**そのキーはAPIに無い** —
 * 2026-10-03 の `edab378c` で written / unchanged / refused に変わっていて、
 * 画面側が追いついていなかった。結果、**何件入っても「0 items imported」**。
 * 入った取込と空振りの取込が同じ文言になる（教訓15・46）。
 *
 * Rafael の支店別シートはこの経路で入るので、ここが嘘をつくと
 * 「入らなかった」と報告されて、入っているものをもう一度送らせることになる。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "src", "components", "admin", "AdminDailyInventoryTab.tsx"),
  "utf-8",
);
const BODY = (() => {
  const i = SRC.indexOf("async function handlePatternImportFile");
  return SRC.slice(i, SRC.indexOf("async function handlePatternDownload", i));
})();
/** コメント行を外した本体。**散文ではなく式で判定する** — この不具合を説明した
 *  コメント自身に検査が当たる（教訓139 と同じ形で、実際に1回当たった）。 */
const CODE = BODY.split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
  .join("\n");

describe("the par pattern import message", () => {
  it("does not read a key the API does not return", () => {
    expect(CODE).not.toContain("upserted");
  });

  it("reports the server's own counts", () => {
    expect(CODE).toContain("d.written");
    expect(CODE).toContain("d.unchanged");
    expect(CODE).toContain("d.refused");
  });

  it("names the rows the server would not write", () => {
    // 0件の保存を成功と同じ見た目にしない。
    expect(CODE).toContain("d.no_par");
    expect(CODE).toContain("d.step_not_applicable");
  });

  it("explains a refused step rather than just counting it", () => {
    expect(CODE).toMatch(/Central Kitchen/);
    expect(CODE).toMatch(/catalogue row/);
  });
});
