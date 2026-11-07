// The badges, roundels and station rings (app_design 3.3, 3.4), and the icons of the panel.
import type { LineInfo } from "../data/types";
import { badgeStyle } from "../model/text";

export function Badge({ line, size }: { line: LineInfo; size?: "lg" | "sm" | "xs" }) {
  const style = badgeStyle(line);
  return <span class={`badge ${style === "red" ? "" : style} ${size ?? ""}`}>{line.name}</span>;
}

export function Roundel({ text, stand, size }: { text: string; stand: boolean; size?: "lg" }) {
  return (
    <span class={`roundel ${stand ? "stand" : ""} ${size ?? ""}`} aria-hidden="true">
      {text}
    </span>
  );
}

export function StationRing({ text, stand = false, long = false, size }: { text: string; stand?: boolean; long?: boolean; size?: "lg" }) {
  return (
    <span class={`st-icon ${stand ? "stand" : ""} ${long ? "long" : ""} ${size ?? ""}`} aria-hidden="true">
      {text}
    </span>
  );
}

export const BusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4.5" y="3" width="15" height="15" rx="3" />
    <path d="M4.5 10.5h15M8 21v-3M16 21v-3" />
    <path d="M8 14.5h.01M16 14.5h.01" stroke-width="3" />
  </svg>
);

export const ChevronRight = () => (
  <svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m6 3 5 5-5 5" />
  </svg>
);

export const ChevronUp = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m4 10 4-4 4 4" />
  </svg>
);

export const CloseIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);
