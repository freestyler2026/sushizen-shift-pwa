// tests/hr/assessment-opinion.test.tsx
//
// The owner asked for an AI reading alongside the scores, to be treated as a
// reference. What the panel must never do is let it read as a verdict, or let
// a failure to fetch look like "there is nothing to say".
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import AssessmentOpinion from "@/components/hr/AssessmentOpinion";

const FULL = {
  ok: true, model: "claude-opus-5", generated_at: "2026-09-25T09:00:00Z",
  tendencies: [{
    trait: "1対1より、場に向けて話す方が動きやすい",
    reads: "初対面の一対一には構えるが、人前で話すことには抵抗がない。",
    evidence: ["「初対面の人と話すのは苦にならない」に 2/5", "「大勢の前で話すことに抵抗はない」に 4/5"],
  }],
  strengths: ["8問すべてで自分が動かせる側を選んでいる。"],
  watch_outs: ["現場の当事者としての視点が記述に出てこない。"],
  in_the_role: "朝礼や全体への指示は苦にしない一方、個別の面談は意識的に設計する必要がある。",
  ask: ["店長という役割を希望される理由を教えてください。"],
  cannot_say: ["外向性は設問3問なので、接客志向はこの数値からは判断できません。"],
  essay_note: "3問とも問いに正面から答えている。",
};

describe("店長適性検査 — AIの読み", () => {
  beforeEach(() => mockFetch.mockReset());

  it("読む前に、合否ではないと言う", () => {
    render(<AssessmentOpinion candidateId="c1" complete />);
    expect(screen.getByText(/合否は書きません/)).toBeTruthy();
    expect(screen.getByText(/根拠の無いものは出しません/)).toBeTruthy();
    expect(screen.getByText(/判断材料の1つ/)).toBeTruthy();
  });

  it("保存済みがあればそのまま出し、取りに行かない", () => {
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    expect(screen.getByText(/1対1より、場に向けて話す/)).toBeTruthy();
    expect(screen.getByText(/店長という役割/)).toBeTruthy();
    expect(screen.getByText(/設問3問なので/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("傾向には、その根拠になった本人の回答を並べて出す", () => {
    // 「そう読める」だけの行は、評価ではなく感想になる。
    // DOM に在ることではなく、**見えていること**を見る — hidden を付けても
    // getByText は見つけてしまい、畳んだだけの変更を通してしまった。
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    for (const re of [/初対面の人と話すのは苦にならない.*2\/5/, /大勢の前で話すことに抵抗はない.*4\/5/]) {
      const el = screen.getByText(re);
      expect(el.closest("[hidden]")).toBeNull();
      expect(window.getComputedStyle(el).display).not.toBe("none");
    }
  });

  it("効くところと、つまずくところと、聞くことと、言えないことを分けて出す", () => {
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    for (const h of ["性格の傾向", "店長として、現場でどう出るか",
                     "この仕事で効きそうなところ", "つまずきそうなところ",
                     "面接で確かめるとよいこと", "この結果では判断できないこと"]) {
      expect(screen.getByText(h)).toBeTruthy();
    }
  });

  it("つまずきそうなところを、危険の赤では出さない", () => {
    // 人格の否定ではなく、どういう条件で問題になるかを書く欄。
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    const el = screen.getByText(/現場の当事者としての視点/);
    expect(el.className).toContain("amber");
    expect(el.className).not.toContain("red");
    expect(el.className).not.toContain("rose");
  });

  it("途中の回答には読ませるボタンを出さない", () => {
    render(<AssessmentOpinion candidateId="c1" complete={false} />);
    expect(screen.getByText(/全問終わってから読みます/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /読ませる/ })).toBeNull();
  });

  it("押したときだけ作る", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ opinion: FULL }) } as unknown as Response);
    render(<AssessmentOpinion candidateId="c1" complete />);
    expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /読ませる/ }));
    await waitFor(() => expect(screen.getByText(/1対1より、場に向けて話す/)).toBeTruthy());
    expect(String(mockFetch.mock.calls[0][0])).toContain("/opinion");
  });

  it("取れなかったことを『言うことが無い』と見せない", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    render(<AssessmentOpinion candidateId="c1" complete />);
    fireEvent.click(screen.getByRole("button", { name: /読ませる/ }));
    expect(await screen.findByText(/読みを出せませんでした/)).toBeTruthy();
    expect(screen.queryByText("性格の傾向")).toBeNull();
  });

  it("サーバが理由を返したらその理由を出す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ opinion: { ok: false, reason: "ANTHROPIC_API_KEY が未設定です。" } }),
    } as unknown as Response);
    render(<AssessmentOpinion candidateId="c1" complete />);
    fireEvent.click(screen.getByRole("button", { name: /読ませる/ }));
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
  });

  it("作り直すときだけ refresh を送る", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ opinion: FULL }) } as unknown as Response);
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    fireEvent.click(screen.getByRole("button", { name: /作り直す/ }));
    await waitFor(() => expect(String(mockFetch.mock.calls[0][0])).toContain("refresh=true"));
  });

  it("いつ・どのモデルが書いたかを残す", () => {
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    expect(screen.getByText(/claude-opus-5/)).toBeTruthy();
  });
});
