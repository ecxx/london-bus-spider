import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { effect } from "@preact/signals";
import { render } from "preact";
import { FormatError, loadCore, loadLines } from "./data/load";
import { startMap } from "./map/map";
import { startRouter } from "./state/router";
import { core, forcedScheme, lines, loadError, scheme } from "./state/signals";
import { App } from "./ui/App";

// app_design 3.1: ?theme=light or ?theme=dark overrides the system colour scheme.
if (forcedScheme) document.documentElement.dataset.theme = forcedScheme;
effect(() => {
  document.documentElement.dataset.scheme = scheme.value;
});

render(<App />, document.getElementById("app")!);
startRouter();
startMap(document.getElementById("map")!);

// prod_design 4.1: the panel operates after stops, stations and patterns. The lines come after.
(async () => {
  try {
    const c = await loadCore();
    core.value = c;
    lines.value = await loadLines(c);
  } catch (err) {
    console.error(err);
    loadError.value = err instanceof FormatError ? err.message : "The bus data did not load. Reload the page.";
  }
})();
