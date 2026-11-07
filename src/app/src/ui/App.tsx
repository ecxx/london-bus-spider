// The root component: the panel, the keyboard keys of app_design 4.3 and the page title.
import { useEffect, useRef } from "preact/hooks";
import { stationName, stopName } from "../model/text";
import { currentView, goUp } from "../state/router";
import { core, view } from "../state/signals";
import { Panel } from "./Panel";
import { ScrollContext } from "./scroll";

const TITLE = "Bus Router London";

export function App() {
  const scroll = useRef<HTMLDivElement>(null);

  // "/" puts the cursor in the search field. Esc goes up one level (in the search field, it clears the field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const typing = (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("#q")?.focus();
      } else if (e.key === "Escape" && !typing && currentView().kind !== "home") {
        goUp();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // The page title of the view.
  const d = core.value;
  const v = view.value;
  useEffect(() => {
    let t = TITLE;
    if (d && v.kind === "station") t = `${stationName(d, v.key)} · ${TITLE}`;
    else if (d && v.kind === "stop") t = `${stopName(d, v.key)} · ${TITLE}`;
    else if (d && v.kind === "route") t = `Route ${d.lines.get(v.line)?.name ?? v.line} · ${TITLE}`;
    else if (v.kind === "about") t = `About · ${TITLE}`;
    document.title = t;
  }, [d, v]);

  return (
    <ScrollContext.Provider value={scroll}>
      <Panel />
    </ScrollContext.Provider>
  );
}
