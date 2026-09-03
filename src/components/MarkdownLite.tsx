"use client";

import React from "react";

/**
 * Renders the Markdown the assistants actually produce: headings, GFM tables,
 * lists, bold, inline code, fenced code, blockquotes and rules.
 *
 * The answers were being printed with `whitespace-pre-wrap`, so every table
 * arrived as a wall of pipes — the tables are the part people came for. Built
 * rather than pulled in because the input is one known producer, and nothing
 * here reaches innerHTML: every node below is a React element, so no answer
 * text can become markup.
 */

type Props = { text: string; className?: string };

/** Bold, italic and inline code inside one line of text. */
function inline(src: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Ordered so `code` wins over ** and *, and ** wins over *.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-200"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(
        <strong key={k} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <em key={k} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isDivider = (line: string): boolean =>
  /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes("-");

export default function MarkdownLite({ text, className = "" }: Props) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    const body = para.join(" ");
    blocks.push(
      <p key={`p${k++}`} className="leading-relaxed text-zinc-200">
        {inline(body, `p${k}`)}
      </p>,
    );
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code
    if (/^\s*```/.test(line)) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      blocks.push(
        <pre
          key={`c${k++}`}
          className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-300"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    // Table: a pipe row followed by a divider row
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      blocks.push(
        // The tables are wide and the panel is not. This scrolls, the page does not.
        <div
          key={`t${k++}`}
          className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03]"
        >
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                {head.map((h, j) => (
                  <th
                    key={j}
                    className="whitespace-nowrap border-b border-white/10 bg-white/[0.05] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                  >
                    {inline(h, `th${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-white/5 last:border-0">
                  {head.map((_, ci) => (
                    <td key={ci} className="px-3 py-2 align-top text-zinc-300">
                      {inline(r[ci] ?? "", `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const depth = h[1].length;
      const size =
        depth <= 2 ? "text-base font-semibold" : depth === 3 ? "text-sm font-semibold" : "text-sm font-medium";
      blocks.push(
        <div key={`h${k++}`} className={`${size} mt-1 text-white`}>
          {inline(h[2], `h${k}`)}
        </div>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushPara();
      blocks.push(<hr key={`r${k++}`} className="border-white/10" />);
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      blocks.push(
        <blockquote
          key={`q${k++}`}
          className="border-l-2 border-violet-400/40 bg-violet-500/5 py-1.5 pl-3 text-sm text-zinc-300"
        >
          {inline(buf.join(" "), `q${k}`)}
        </blockquote>,
      );
      continue;
    }

    // Lists. Nesting is a tree, not a flat run: a sub-bullet under step 2 was
    // being folded into the numbered list and became "3.", which renumbered
    // every step after it. Instructions people follow cannot renumber themselves.
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushPara();
      const items: { indent: number; ord: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i];
        items.push({
          indent: /^\s*/.exec(raw)?.[0].length ?? 0,
          ord: /^\s*\d+\.\s+/.test(raw),
          text: raw.replace(/^\s*([-*+]|\d+\.)\s+/, ""),
        });
        i++;
      }
      i--;

      let n = 0;
      const build = (from: number, indent: number): [React.ReactNode, number] => {
        const ordered = items[from].ord;
        const kids: React.ReactNode[] = [];
        let j = from;
        while (j < items.length && items[j].indent >= indent) {
          if (items[j].indent > indent) {
            const [sub, next] = build(j, items[j].indent);
            const prev = kids.pop();
            kids.push(
              <li key={`n${n++}`} className="leading-relaxed">
                {prev ? (prev as React.ReactElement<{ children?: React.ReactNode }>).props.children : null}
                {sub}
              </li>,
            );
            j = next;
            continue;
          }
          kids.push(
            <li key={`n${n++}`} className="leading-relaxed">
              {inline(items[j].text, `li${n}`)}
            </li>,
          );
          j++;
        }
        const Tag = ordered ? "ol" : "ul";
        return [
          <Tag
            key={`n${n++}`}
            className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-zinc-200 marker:text-zinc-500`}
          >
            {kids}
          </Tag>,
          j,
        ];
      };

      const [tree] = build(0, items[0].indent);
      blocks.push(<div key={`l${k++}`}>{tree}</div>);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();

  return <div className={`space-y-3 text-sm ${className}`}>{blocks}</div>;
}
