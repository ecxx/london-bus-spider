"""Run download jobs in parallel, skipping the ones already on disk."""

import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from .api import WORKERS, Fatal, FetchFailed, NotFound, save_json


def run_jobs(label, outdir, jobs, fields, filename, worker):
    """Run worker(job) for each job whose file is missing. Return the failures.

    worker returns a result key ("ok", "empty", ...) or raises NotFound,
    FetchFailed or Fatal. The failures are also written to outdir/_failures.json.
    """
    os.makedirs(outdir, exist_ok=True)
    todo = [j for j in jobs if not os.path.exists(os.path.join(outdir, filename(j)))]
    print("%s: %d jobs, %d already downloaded, %d to fetch"
          % (label, len(jobs), len(jobs) - len(todo), len(todo)), flush=True)

    counts = Counter()
    failures = []
    start = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(worker, j): j for j in todo}
        try:
            for done, fut in enumerate(as_completed(futures), 1):
                job = futures[fut]
                try:
                    key, note = fut.result(), None
                except NotFound:
                    key, note = "notfound", "404"
                except FetchFailed as e:
                    key, note = "failed", str(e)
                counts[key] += 1
                if note:
                    failures.append(dict(zip(fields, job), result=key, note=note))
                if done % 25 == 0 or done == len(todo):
                    rate = done / max(time.time() - start, 1e-9)
                    left = (len(todo) - done) / max(rate, 1e-9)
                    print("  %d/%d  %s  ~%dm left"
                          % (done, len(todo),
                             " ".join("%s=%d" % kv for kv in sorted(counts.items())),
                             left / 60),
                          flush=True)
        except Fatal:
            pool.shutdown(wait=False, cancel_futures=True)
            raise

    print("%s: done in %.1f min: %s" % (label, (time.time() - start) / 60, dict(counts)))
    write_failures(label, outdir, failures)
    return failures


def write_failures(label, outdir, failures):
    fp = os.path.join(outdir, "_failures.json")
    if failures:
        save_json(fp, failures)
        print("%s: %d failures written to %s -- run again to retry them"
              % (label, len(failures), fp))
    elif os.path.exists(fp):
        os.remove(fp)
