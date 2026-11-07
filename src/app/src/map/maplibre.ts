// The one import of MapLibre GL JS for the client (prod_design 5.1).
// MapLibre finds its worker file from import.meta.url. The Vite dependency bundle and the build
// move the code away from the worker file, so give the worker URL here. Vite copies the worker
// file into the bundle with a hashed name.
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
