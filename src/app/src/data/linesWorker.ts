// prod_design 4.1, step 4, in a Web Worker: get the lines and decode the polylines. The reply transfers
// the decoded coordinates (no copy).
import { decodePolyline } from "./polyline";
import type { DecodedLine, Lines, PatternKey } from "./types";

export interface LinesRequest {
  url: string; // the absolute URL of the lines file
}

export type LinesReply =
  | {
      ok: true;
      pids: PatternKey[]; // in the order of the file
      coords: Float64Array[];
      stopPoints: DecodedLine["stopPoints"][];
      ms: { fetch: number; decode: number }; // the times in the worker (prod_design 9, step 15)
    }
  | { ok: false; error: string };

const post = (r: LinesReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer);

self.onmessage = async (e: MessageEvent<LinesRequest>) => {
  try {
    const t0 = performance.now();
    const res = await fetch(e.data.url);
    if (!res.ok) throw new Error(`${e.data.url}: HTTP ${res.status}`);
    const raw = (await res.json()) as Lines;
    const t1 = performance.now();
    const pids = Object.keys(raw);
    const coords = pids.map((pid) => decodePolyline(raw[pid]![0]));
    const t2 = performance.now();
    post(
      { ok: true, pids, coords, stopPoints: pids.map((pid) => raw[pid]![1]), ms: { fetch: t1 - t0, decode: t2 - t1 } },
      coords.map((c) => c.buffer),
    );
  } catch (err) {
    post({ ok: false, error: String(err) });
  }
};
