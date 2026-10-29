/**
 * マニュアルは全文が `data-en` / `data-ja` 属性に入っていて、読み込み時に
 * `textContent` で差し替わる。そのため2つのことが静かに壊れる:
 *
 *  1. **属性の中の Markdown は効かない。** `**強調**` はアスタリスクのまま
 *     読者に出る。今日18個あり、うち2個は私が今日書いたもの。
 *  2. **`data-en` の中の子要素は消える。** `textContent` で上書きするので、
 *     `<b>` も `<a>` も平文に潰れる。
 *
 * どちらも画面を開くまで分からない。読者は現場のスタッフなので、ここで止める。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "docs", "manuals");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".html"));

describe.each(FILES)("%s", (file) => {
  const src = readFileSync(join(DIR, file), "utf-8");
  const attrs = [...src.matchAll(/data-(en|ja)="([^"]*)"/g)];

  it("has no Markdown emphasis in a translated attribute", () => {
    const bad = attrs.filter(([, , v]) => v.includes("**")).map(([, k, v]) => `${k}: ${v.slice(0, 60)}`);
    expect(bad).toEqual([]);
  });

  it("pairs every English string with a Japanese one", () => {
    // 片方だけ直すと、もう片方が嘘になる。
    const en = [...src.matchAll(/data-en="[^"]*"/g)].length;
    const withJa = [...src.matchAll(/data-en="[^"]*"\s+data-ja="[^"]*"/g)].length;
    if (en === 0) return;              // 単一言語のマニュアルは対象外
    expect(withJa).toBe(en);
  });

  it("renders the tags in its strings, instead of showing them as text", () => {
    // 属性の中に <b> を書いてよいのは innerHTML で描くマニュアルだけ。
    // Inventory Manual だけが textContent で、6箇所が読者に `<b>` という
    // 文字として見えていた。他の5本（HR / Payroll / Procurement /
    // Emergency / Policy Docs）は最初から innerHTML。
    const hasTags = attrs.some(([, , v]) => /<(b|strong|em|span|br)[ >/]/i.test(v));
    if (!hasTags) return;
    // 代入先の変数名は3通りある（lang / l / val）。見るのは代入先の
    // プロパティだけ: dataset を textContent に入れたらタグは文字になる。
    expect(src).toMatch(/innerHTML\s*=/);
    expect(src).not.toMatch(/textContent\s*=\s*(lang|l|v|val)\b/);
  });
});
