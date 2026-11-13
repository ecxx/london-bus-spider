// The load of the export (prod_design 4.1, export_format 6.1).
import { buildIndexes, type Indexes } from "./indexes";
import { mark, sample, time } from "../perf";
import type { LinesReply, LinesRequest } from "./linesWorker";
import { decodePolyline } from "./polyline";
import type { DecodedLine, Lines, Manifest, PatternKey, Patterns, Stations, Stops } from "./types";

export const FORMAT = 1; // the export format that this client reads (export_format 4.1)
export const DATA_URL = "/data/"; // the export, on the same server as the client (prod_design 4.1)

// The manifest gives a format that this client cannot read. The page must load the new client.
export class FormatError extends Error {
  constructor(readonly format: unknown) {
    super("A new version is available. Reload the page.");
  }
}

export type FetchJson = (url: string) => Promise<unknown>;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// The data for the panel: the lists and the search operate with it.
export interface Core extends Indexes {
  manifest: Manifest;
  stops: Stops;
  stations: Stations;
  patterns: Patterns;
}

// Steps 1 to 3: the manifest, the format check, then stops, stations and patterns at the same time, and the indexes.
export async function loadCore(base = DATA_URL, get: FetchJson = fetchJson): Promise<Core> {
  const manifest = (await get(base + "manifest.json")) as Manifest;
  if (manifest.format !== FORMAT) throw new FormatError(manifest.format);
  const [stops, stations, patterns] = (await Promise.all([
    get(base + manifest.files.stops),
    get(base + manifest.files.stations),
    get(base + manifest.files.patterns),
  ])) as [Stops, Stations, Patterns];
  return { manifest, stops, stations, patterns, ...buildIndexes(stops, patterns) };
}

// Step 4 on the current thread: the lines, decoded. The keys are the pattern keys, in the order of the
// file. The unit tests use it. The client uses loadLinesInWorker.
export async function loadLines(core: Core, base = DATA_URL, get: FetchJson = fetchJson): Promise<Map<PatternKey, DecodedLine>> {
  return decodeLines((await get(base + core.manifest.files.lines)) as Lines);
}

// Step 4 in a Web Worker (data/linesWorker.ts): the get, the parse and the decode. The main thread only
// makes the map of the decoded lines.
export function loadLinesInWorker(core: Core, base = DATA_URL): Promise<Map<PatternKey, DecodedLine>> {
  return new Promise((ok, fail) => {
    const w = new Worker(new URL("./linesWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<LinesReply>) => {
      w.terminate();
      const r = e.data;
      if (!r.ok) return fail(new Error(r.error));
      // prod_design 9, step 15: the times in the worker, and the work on the main thread.
      sample("linesFetch", r.ms.fetch);
      sample("decode", r.ms.decode);
      const out = time("linesMain", () => {
        const lines = new Map<PatternKey, DecodedLine>();
        r.pids.forEach((pid, i) => lines.set(pid, { coords: r.coords[i]!, stopPoints: r.stopPoints[i]! }));
        return lines;
      });
      mark("linesParsed");
      ok(out);
    };
    w.onerror = (e) => {
      w.terminate();
      fail(new Error(e.message || "The lines worker stopped."));
    };
    const msg: LinesRequest = { url: new URL(base + core.manifest.files.lines, location.href).href };
    w.postMessage(msg);
  });
}

export function decodeLines(lines: Lines): Map<PatternKey, DecodedLine> {
  const out = new Map<PatternKey, DecodedLine>();
  for (const [pid, [polyline, stopPoints]] of Object.entries(lines)) {
    out.set(pid, { coords: decodePolyline(polyline), stopPoints });
  }
  return out;
}
