"use client";

import * as React from "react";
import { useLocale } from "@/providers/locale-provider";

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[12.5px] break-all"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function AiMarkdown({ content }: { content: string }) {
  const { locale } = useLocale();
  const blocks = React.useMemo(() => {
    const lines = content.split("\n");
    const result: Array<
      | { type: "code"; lang: string; code: string }
      | { type: "table"; headers: string[]; rows: string[][] }
      | { type: "text"; lines: string[] }
    > = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trimStart().startsWith("```")) {
        const lang = line.trimStart().slice(3).trim();
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
          codeLines.push(lines[i]);
          i += 1;
        }
        result.push({ type: "code", lang, code: codeLines.join("\n") });
        i += 1;
        continue;
      }

      if (
        line.trim().startsWith("|") &&
        i + 1 < lines.length &&
        /^\|?[\s:-]+\|/.test(lines[i + 1].trim())
      ) {
        const parseRow = (row: string) =>
          row
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
        const headers = parseRow(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(parseRow(lines[i]));
          i += 1;
        }
        result.push({ type: "table", headers, rows });
        continue;
      }

      const last = result[result.length - 1];
      if (last && last.type === "text") {
        last.lines.push(line);
      } else {
        result.push({ type: "text", lines: [line] });
      }
      i += 1;
    }
    return result;
  }, [content]);

  return (
    <div lang={locale} className="space-y-2.5 min-w-0 break-words [overflow-wrap:anywhere]">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <div
              key={idx}
              className="max-w-full overflow-x-auto rounded-xl bg-black/85 p-3 text-left text-[12.5px] text-white"
            >
              {block.lang && (
                <div className="mb-1 text-[10.5px] uppercase tracking-wider text-white/60">
                  {block.lang}
                </div>
              )}
              <pre className="font-mono leading-relaxed whitespace-pre">
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={idx}
              className="max-w-full overflow-x-auto rounded-xl border border-[var(--border-subtle)]"
            >
              <table className="w-full min-w-[320px] border-collapse text-left text-[12.5px]">
                <thead className="bg-[var(--bg-subtle)]">
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 font-semibold">
                        {renderInlineMarkdown(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2">
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={idx} className="space-y-1 whitespace-pre-wrap">
            {block.lines.map((line, lIdx) => {
              const heading = line.match(/^(#{1,3})\s+(.+)$/);
              if (heading) {
                return (
                  <p key={lIdx} className="font-heading text-[15px] font-bold">
                    {renderInlineMarkdown(heading[2])}
                  </p>
                );
              }
              return (
                <React.Fragment key={lIdx}>
                  {renderInlineMarkdown(line)}
                  {lIdx < block.lines.length - 1 ? "\n" : null}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
