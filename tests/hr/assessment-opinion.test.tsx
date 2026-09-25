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
  reading: ["記述はマクロな市場分析で一貫している。"],
  ask: ["店長という役割を希望される理由を教えてください。"],
  cannot_say: ["外向性は設問3問なので、接客志向はこの数値からは判断できません。"],
  essay_note: "3問とも問いに正面から答えている。",
};

describe("店長適性検査 — AIの読み", () => {
  beforeEach(() => mockFetch.mockReset());

  it("読む前に、合否ではないと言う", () => {
    render(<AssessmentOpinion candidateId="c1" complete />);
    expect(screen.getByText(/合否は書きません/)).toBeTruthy();
    expect(screen.getByText(/判断材料の1つ/)).toBeTruthy();
  });

  it("保存済みがあればそのまま出し、取りに行かない", () => {
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    expect(screen.getByText(/マクロな市場分析/)).toBeTruthy();
    expect(screen.getByText(/店長という役割/)).toBeTruthy();
    expect(screen.getByText(/設問3問なので/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("三つの見出しを分けて出す — 読みと、確かめることと、判断できないこと", () => {
    render(<AssessmentOpinion candidateId="c1" initial={FULL} complete />);
    for (const h of ["読み取れること", "面接で確かめるとよいこと", "この結果では判断できないこと"]) {
      expect(screen.getByText(h)).toBeTruthy();
    }
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
    await waitFor(() => expect(screen.getByText(/マクロな市場分析/)).toBeTruthy());
    expect(String(mockFetch.mock.calls[0][0])).toContain("/opinion");
  });

  it("取れなかったことを『言うことが無い』と見せない", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    render(<AssessmentOpinion candidateId="c1" complete />);
    fireEvent.click(screen.getByRole("button", { name: /読ませる/ }));
    expect(await screen.findByText(/読みを出せませんでした/)).toBeTruthy();
    expect(screen.queryByText("読み取れること")).toBeNull();
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
