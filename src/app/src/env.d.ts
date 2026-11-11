/// <reference types="vite/client" />

// prod_design 5.2: the CARTO key of the build mode, from vite.config.ts. The code gets the key only from this constant.
declare const __CARTO_KEY__: string;

interface Window {
  __map?: import("maplibre-gl").Map; // the map, for the browser tests (development server, or ?perf)
  __fitBusy?: () => boolean; // a fit waits for its frame or moves the map (development server, or ?perf)
  __settled?: () => boolean; // the end labels and the station names are placed for the zoom now (development server, or ?perf)
  __perf?: { report: () => import("./perf").PerfReport; reset: () => void }; // the measurements (development server, or ?perf)
}
