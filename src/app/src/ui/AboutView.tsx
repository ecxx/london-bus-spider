// app_design 6.7: the about view.
import type { Core } from "../data/load";
import { CARTO, GEOMNI, OS, OSM, TFL, TFL_TERMS } from "../map/attribution";
import { datasetDate } from "../model/text";
import { chooseScheme, chosenScheme, type Scheme } from "../state/signals";

const SCHEMES: [Scheme | null, string][] = [
  [null, "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export function AboutView({ d }: { d: Core }) {
  const date = datasetDate(d.manifest.dataset);
  return (
    <div class="about">
      <p>Explore route patterns and stop passing routes for TfL services.</p>
      <p>TangledBuses is not a TfL-endorsed product.</p>
      <h2>Data sources</h2>
      <ul>
        <li>
          <a href={OSM.href} target="_blank" rel="noopener">{OSM.text}</a>, <a href={CARTO.href} target="_blank" rel="noopener">{CARTO.text}</a>
        </li>
        <li>
          {TFL}. <a href={TFL_TERMS.href} target="_blank" rel="noopener">{TFL_TERMS.text}</a>
        </li>
        <li>{OS}</li>
        <li>{GEOMNI}</li>
      </ul>
      {date && <p>Data last updated {date}</p>}
      <h2>Colour scheme</h2>
      <div class="chip-row" role="group" aria-label="Colour scheme">
        {SCHEMES.map(([s, label]) => (
          <button key={label} class="chip" type="button" aria-pressed={chosenScheme.value === s} onClick={() => chooseScheme(s)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
