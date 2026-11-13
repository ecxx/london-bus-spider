// prod_design 9, step 15: the measurements of the client. The development server, or a page with ?perf
// in the URL, records the times. With ?perf, a box on the page shows them (for the phone). Else the
// functions do nothing.
//
// A mark: one time from the start of the page (performance.now()), the first time only.
// A sample: one duration of a series (the decode, one hit test, one frame of the station list).
// A span: the work after one event, from the event to the last touch() before the task ends (the
// open of a spider graph: the router, the panel render and the map sources run in the same task).
const BROWSER = typeof window !== "undefined"; // the unit tests run in Node
export const PERF_SHOW = BROWSER && new URLSearchParams(location.search).has("perf");
export const PERF_ON = BROWSER && (import.meta.env.DEV || PERF_SHOW);

const SAMPLE_MAX = 2000; // the samples kept for each series (the last ones)

const marks = new Map<string, number>();
const samples = new Map<string, number[]>();
const spans = new Map<string, { t0: number; end: number; label: string } | null>();

export const now = (): number => performance.now();

export function mark(name: string): void {
  if (PERF_ON && !marks.has(name)) marks.set(name, now());
}

export function sample(name: string, ms: number): void {
  if (!PERF_ON) return;
  let s = samples.get(name);
  if (!s) samples.set(name, (s = []));
  s.push(ms);
  if (s.length > SAMPLE_MAX) s.shift();
}

export function time<T>(name: string, f: () => T): T {
  if (!PERF_ON) return f();
  const t0 = now();
  try {
    return f();
  } finally {
    sample(name, now() - t0);
  }
}

// A span starts at an event. The touches in the same task (and its microtasks) move its end. The span
// closes in a later task, and its duration becomes a sample. The label (for example the station key)
// is in the report.
export function spanStart(name: string, label: string): void {
  if (!PERF_ON) return;
  const sp = { t0: now(), end: 0, label };
  spans.set(name, sp);
  setTimeout(() => {
    if (spans.get(name) !== sp) return;
    spans.set(name, null);
    if (sp.end) {
      sample(name, sp.end - sp.t0);
      lastLabel.set(name, sp.label);
    }
  });
}

export function spanTouch(name: string): void {
  const sp = PERF_ON && spans.get(name);
  if (sp) sp.end = now();
}

const lastLabel = new Map<string, string>();

export interface Stats {
  n: number;
  median: number;
  p95: number;
  max: number;
  last: number;
}

function stats(s: number[]): Stats {
  const a = [...s].sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))]!;
  return { n: a.length, median: q(0.5), p95: q(0.95), max: a.at(-1)!, last: s.at(-1)! };
}

export interface PerfReport {
  marks: Record<string, number>;
  series: Record<string, Stats>;
  labels: Record<string, string>;
}

export function perfReport(): PerfReport {
  return {
    marks: Object.fromEntries(marks),
    series: Object.fromEntries([...samples].map(([k, s]) => [k, stats(s)])),
    labels: Object.fromEntries(lastLabel),
  };
}

// Clear the series (not the marks): a measurement starts again.
export function perfReset(): void {
  samples.clear();
  lastLabel.clear();
}

if (PERF_ON) {
  window.__perf = { report: perfReport, reset: perfReset };
  // The tasks of 50 ms or more on the main thread: the page does not respond during them (Chrome only).
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => sample("longTask", e.duration))).observe({ type: "longtask", buffered: true });
  } catch {
    // The browser has no long task entries.
  }
}

// The time from now to the next paint: the next frame, then a task after it.
export function afterPaint(f: () => void): void {
  if (PERF_ON) requestAnimationFrame(() => setTimeout(f));
}

// The box of ?perf. It shows the values each second. A tap on the box clears the series.
const ROWS: [string, string][] = [
  ["linesFetch", "lines fetch (worker)"],
  ["decode", "decode (worker)"],
  ["linesMain", "lines main thread"],
  ["homeBuild", "build home source"],
  ["homeChunk", "home group (one task)"],
  ["homeSetData", "home groups (sum)"],
  ["stationsSet", "stations setData"],
  ["longTask", "long tasks (>= 50 ms)"],
  ["spider", "open spider (script)"],
  ["spiderPaint", "open spider (to paint)"],
  ["hitTest", "hit test"],
  ["listFrame", "station list frame"],
];
const MARKS: [string, string][] = [
  ["script", "script start"],
  ["core", "core loaded"],
  ["lists", "home lists"],
  ["listsPaint", "home lists painted"],
  ["linesParsed", "lines fetched"],
  ["homeSet", "home source set"],
];

const f1 = (v: number) => v.toFixed(1);

export function showPerf(): void {
  if (!PERF_SHOW) return;
  const box = document.createElement("pre");
  box.className = "perf-box";
  box.title = "Tap to clear the series";
  box.addEventListener("click", perfReset);
  document.body.append(box);
  const draw = () => {
    const r = perfReport();
    const lines = [`${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? ""}`, `cores ${navigator.hardwareConcurrency} · dpr ${devicePixelRatio}`, ""];
    lines.push("ms from page start:");
    for (const [k, label] of MARKS) if (r.marks[k] !== undefined) lines.push(`  ${label.padEnd(20)} ${f1(r.marks[k]!)}`);
    lines.push("", "ms: n / median / p95 / max");
    for (const [k, label] of ROWS) {
      const s = r.series[k];
      if (s) lines.push(`  ${label.padEnd(22)} ${s.n} / ${f1(s.median)} / ${f1(s.p95)} / ${f1(s.max)}`);
    }
    if (r.labels.spider) lines.push(`  spider: ${r.labels.spider}`);
    box.textContent = lines.join("\n");
  };
  draw();
  setInterval(draw, 1000);
}
