// prod_design 6: the map reads the colour tokens of tokens.css.
import type { ExpressionSpecification } from "maplibre-gl";

export interface Colors {
  red: string;
  night: string;
  behind: string;
  stopFill: string;
  stopRing: string;
  ink: string;
}

export function readColors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return { red: v("--red"), night: v("--night"), behind: v("--behind"), stopFill: v("--stop-fill"), stopRing: v("--stop-ring"), ink: v("--ink") };
}

// prod_design 5.4: the line colour, from the class of the main pattern of the line.
export const lineColor = (c: Colors): ExpressionSpecification => ["match", ["get", "lcls"], "night", c.night, c.red];
