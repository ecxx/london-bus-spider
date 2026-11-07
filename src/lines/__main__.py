"""Make the line of each pattern of a data folder.

    cd src
    python3 -m lines data_131026                       # writes data/data_131026/svc_lines.json
    python3 -m lines data_131026 1-outbound 19-inbound # prints those line-directions only

Run it after the patterns and the stops (python3 -m patterns, python3 -m stops).
"""

import argparse
import json
import os
import sys
import time
from collections import Counter

from .build import Folder, build_line_direction

OUTPUT = "svc_lines.json"

# The project root is the nearest folder, at or above this file, that holds one
# of these. Data folders are in its data/ folder.
ROOT_MARKERS = (".venv",)


def project_root():
    d = here = os.path.dirname(os.path.abspath(__file__))
    while True:
        if any(os.path.exists(os.path.join(d, m)) for m in ROOT_MARKERS):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise FileNotFoundError("Cannot find the project root above %s (looked for %s)."
                                    % (here, " or ".join(ROOT_MARKERS)))
        d = parent


def summary(records):
    sources = Counter(r["source"] for r in records.values())
    flags = Counter(f for r in records.values() for f in r["flags"])
    dist = sorted(r["maxStopDistance"] for r in records.values() if r["maxStopDistance"] is not None)
    print("patterns: %d" % len(records))
    print("sources: %s" % ", ".join("%s %d" % kv for kv in sources.most_common()))
    print("flags: %s" % ", ".join("%s %d" % kv for kv in flags.most_common()))
    if dist:
        print("max stop distance (m): median %.1f, 99%% %.1f, largest %.1f"
              % (dist[len(dist) // 2], dist[int(0.99 * (len(dist) - 1))], dist[-1]))


def show(folder, key, records):
    stops = {p["id"]: p["stops"] for p in folder.patterns[key]["patterns"]}
    for r in records.values():
        names = [folder.stops[stops[r["id"]][i]]["commonName"] for i in r["unplacedStops"]]
        print("   %-8s %-6s part %-4s %6.1f km  max %5s m  %s  %s" % (
            r["id"], r["source"], r["part"], r["length"] / 1000, r["maxStopDistance"],
            ",".join(r["flags"]), ("unplaced: " + "; ".join(names)) if names else ""))


def write(path, data):
    with open(path + ".part", "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(path + ".part", path)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", help="data folder, inside <project root>/data (e.g. data_131026)")
    parser.add_argument("keys", nargs="*", help="line-directions to print, e.g. 1-outbound; "
                                                "with none, build all and write %s" % OUTPUT)
    args = parser.parse_args()

    path = os.path.join(project_root(), "data", args.folder)
    for name, module in (("svc_patterns.json", "patterns"), ("stops.json", "stops")):
        if not os.path.exists(os.path.join(path, name)):
            sys.exit("No %s in %s. Run python3 -m %s %s first." % (name, path, module, args.folder))
    folder = Folder(path)
    unknown = [k for k in args.keys if k not in folder.patterns]
    if unknown:
        sys.exit("Not in svc_patterns.json: %s" % ", ".join(unknown))

    start = time.time()
    if args.keys:
        for k in args.keys:
            print("## %s" % k)
            show(folder, k, build_line_direction(folder, k))
        return
    records = {}
    for k in folder.keys():
        records.update(build_line_direction(folder, k))
    write(os.path.join(path, OUTPUT), records)
    summary(records)
    print("wrote %s in %.1f s" % (os.path.join(path, OUTPUT), time.time() - start))


if __name__ == "__main__":
    main()
