import { createContext } from "preact";
import type { RefObject } from "preact";

// The scroll area of the panel content. The views read and set its scroll position.
export const ScrollContext = createContext<RefObject<HTMLDivElement | null>>({ current: null });
