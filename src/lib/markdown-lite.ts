/**
 * Tiny markdown subset (**bold**, `code`, ![alt](data:image/...), line breaks)
 * rendered as React elements — never as an HTML string — so model, user or
 * tool text cannot inject tags or attributes. Images are limited to base64
 * data URLs of raster/SVG types (an SVG loaded via <img> cannot run script).
 */
import { createElement, Fragment, type ReactNode } from "react";

export type InlineToken =
  | { t: "text"; v: string }
  | { t: "strong"; v: string }
  | { t: "code"; v: string }
  | { t: "img"; alt: string; src: string };

export const SAFE_IMAGE_SRC = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

const TOKEN_RE = /\*\*(.+?)\*\*|`([^`\n]+)`|!\[([^\]\n]{0,200})\]\(([^)\s]{1,200000})\)/g;

export function parseInline(line: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: "text", v: line.slice(last, idx) });
    if (m[1] !== undefined) out.push({ t: "strong", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (SAFE_IMAGE_SRC.test(m[4])) out.push({ t: "img", alt: m[3], src: m[4] });
    else out.push({ t: "text", v: m[3] ? `[image: ${m[3]}]` : "[image]" });
    last = idx + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

export function parseMarkdownLite(text: string): InlineToken[][] {
  return String(text ?? "").split("\n").map(parseInline);
}

function renderToken(tok: InlineToken, key: number): ReactNode {
  switch (tok.t) {
    case "text":
      return createElement(Fragment, { key }, tok.v);
    case "strong":
      return createElement("strong", { key }, tok.v);
    case "code":
      return createElement("code", { key }, tok.v);
    case "img":
      return createElement("img", {
        key,
        alt: tok.alt,
        src: tok.src,
        width: 140,
        height: 140,
        className: "mt-2 rounded-lg border border-slate-200 bg-white p-2",
      });
  }
}

export function renderMarkdownLite(text: string): ReactNode {
  const lines = parseMarkdownLite(text);
  return lines.map((tokens, i) =>
    createElement(
      Fragment,
      { key: i },
      tokens.map(renderToken),
      i < lines.length - 1 ? createElement("br") : null
    )
  );
}
