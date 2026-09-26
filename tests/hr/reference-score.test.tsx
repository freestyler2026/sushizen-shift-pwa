// tests/hr/reference-score.test.tsx
//
// A number is used harder than a paragraph: once it exists, people sort by it.
// So the screen must never show the total without the two things that keep it
// honest — what it is made of, and what it leaves out.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import ReferenceScore from "@/components/hr/ReferenceScore";

const REF = {
  total: 94.6,
  out_of: 100,
  components: [
    { name: "判断", got: 46.6, max: 50, detail: "原因帰属 92% ・ 単一選択 34/36",
      note: "20問・この検査が最も厚く測れているところ" },
    { name: "英語", got: 18, max: 20, detail: "9/10", note: "正解のある10問" },
    { name: "姿勢", got: 30, max: 30, detail: "二者択一の★ 0/10 ・ フラグ 0件",
      note: "減点式。★1つ -3、フラグ1つ -10" },
  ],
  excluded: [
    "飲食の実務（原価・シフト・衛生・クレーム対応）は1問も測っていません。",
    "性格5因子は配点に入れていません。",
    "記述3問は点にしていません。",
  ],
};

describe("店長適性検査 — 参考点", () => {
  it("合計と、その満点を出す", () => {
    render(<ReferenceScore reference={REF} />);
    expect(screen.getByText("94.6")).toBeTruthy();
    expect(screen.getByText("/ 100")).toBeTruthy();
  });

  it("内訳を、何から出たかまで出す", () => {
    render(<ReferenceScore reference={REF} />);
    for (const n of ["判断", "英語", "姿勢"]) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByText(/原因帰属 92%/)).toBeTruthy();
    expect(screen.getByText(/★1つ -3、フラグ1つ -10/)).toBeTruthy();
  });

  it("何が入っていないかを、点と同じ枠の中に出す", () => {
    // 別のカードに追いやると読まれない。読まれなければ書いていないのと同じ。
    const { container } = render(<ReferenceScore reference={REF} />);
    const total = screen.getByText("94.6");
    const excluded = screen.getByText(/飲食の実務/);
    const card = total.closest("div.rounded-xl");
    expect(card).toBeTruthy();
    expect(card!.contains(excluded)).toBe(true);
    expect(excluded.closest("[hidden]")).toBeNull();
    void container;
  });

  it("順位付けや合否に使えないと書く", () => {
    render(<ReferenceScore reference={REF} />);
    expect(screen.getByText(/順位付けや合否には使えません/)).toBeTruthy();
  });

  it("同じ回答なら同じ値になると書く", () => {
    render(<ReferenceScore reference={REF} />);
    expect(screen.getByText(/同じ回答なら何度計算しても同じ値/)).toBeTruthy();
  });

  it("点が無いときは枠ごと出さない", () => {
    const { container } = render(<ReferenceScore reference={null} />);
    expect(container.textContent).toBe("");
  });
});
