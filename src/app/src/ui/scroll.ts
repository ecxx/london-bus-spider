import { createContext } from "preact";
import type { RefObject } from "preact";

// The scroll area of the panel content. The views read and set its scroll position.
export const ScrollContext = createContext<RefObject<HTMLDivElement | null>>({ current: null });

// app_design 6.5 and 4.2: a route view opened. The panel scrolls its stop list to the first red stop
// when it has its height and is open (Panel.tsx). If the panel is folded, the scroll waits for the open.
export const redScroll = { pending: false };

// Scroll the first red stop to the middle of the scroll area. client: the height of the scroll area at
// the end of the height transition of the panel.
export function scrollToRed(area: HTMLElement, client: number): void {
  const li = area.querySelector<HTMLElement>(".tl li.here, .tl li.near");
  if (!li) return;
  const top = li.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
  area.scrollTop = Math.max(0, top - (client - li.offsetHeight) / 2);
}
