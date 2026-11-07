// app_design 6.7: the about view.
import type { Core } from "../data/load";
import { CARTO, GEOMNI, OS, OSM, TFL, TFL_TERMS } from "../map/attribution";
import { datasetDate } from "../model/text";

export function AboutView({ d }: { d: Core }) {
  const date = datasetDate(d.manifest.dataset);
  return (
    <div class="about">
      <p>Bus Router shows the London bus routes that go through a stop or a station.</p>
      <p>Bus Router is not an official TfL product. TfL does not endorse it.</p>
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
      {date && <p>Bus data of {date}</p>}
    </div>
  );
}
