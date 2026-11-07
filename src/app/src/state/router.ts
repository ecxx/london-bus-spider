// app_design 4.3: the hash router.
import { effect } from "@preact/signals";
import { parseHash, resolveView, upView, viewHash, type View } from "../model/url";
import { core, highlight, rowHover, view } from "./signals";

// Open a view. replace: replace the history entry (D12), else add one.
export function go(hash: string, replace = false): void {
  if (location.hash === hash || (hash === "#/" && location.hash === "")) {
    route();
    return;
  }
  if (replace) {
    history.replaceState(null, "", hash);
    route();
  } else location.hash = hash;
}

export const goView = (v: View, replace = false): void => go(viewHash(v), replace);

// One level up (the close button and the Esc key). From the hash, not from the view signal: the
// hashchange event comes after the hash changes, so two fast Esc keys would otherwise see the same view.
export function goUp(): void {
  const d = core.value;
  if (d) goView(upView(d, resolveView(d, parseHash(location.hash))));
}

// The view of the current hash (for the keys, which can come before the hashchange event).
export const currentView = (): View => {
  const d = core.value;
  return d ? resolveView(d, parseHash(location.hash)) : view.peek();
};

function route(): void {
  const d = core.value;
  if (!d) return; // the views open when the data is loaded
  const parsed = parseHash(location.hash);
  const v = resolveView(d, parsed);
  if (v !== parsed || (parsed.kind === "home" && location.hash !== "" && location.hash !== "#/")) {
    history.replaceState(null, "", viewHash(v));
  }
  // A new view: the row under the pointer and the highlighted routes are of the old view.
  highlight.value = null;
  rowHover.value = null;
  view.value = v;
}

export function startRouter(): void {
  addEventListener("hashchange", route);
  // The first route when the data is loaded.
  effect(() => {
    if (core.value) route();
  });
}
