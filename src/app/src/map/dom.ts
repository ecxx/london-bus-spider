// DOM helpers for the marks above the map: the tooltips, the route menu, the markers (prod_design 5.5,
// 5.6). Texts go in as text nodes, never as HTML.
import type { LineInfo } from "../data/types";
import { badgeStyle } from "../model/text";

type Child = Node | string | null | false | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of children) if (c) e.append(c);
  return e;
}

// app_design 3.3: a route badge, as the Badge component of the panel makes it.
export function badge(line: LineInfo, size: "sm" | "xs"): HTMLSpanElement {
  const style = badgeStyle(line);
  return el("span", `badge ${style === "red" ? "" : style} ${size}`, line.name);
}
