"""Make stops.json and stations.json of a data folder.

    cd src
    python3 -m stops data_131026     # writes data/data_131026/stops.json and stations.json

Run it after the patterns (python3 -m patterns), because each stop lists the
patterns that serve it.
"""

import argparse
import json
import os
import sys
import time
from collections import Counter

from .build import build

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


def write(path, data):
    with open(path + ".part", "w") as f:
        json.dump(data, f)
    os.replace(path + ".part", path)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", help="data folder, inside <project root>/data (e.g. data_131026)")
    args = parser.parse_args()

    path = os.path.join(project_root(), "data", args.folder)
    if not os.path.exists(os.path.join(path, "svc_patterns.json")):
        sys.exit("No svc_patterns.json in %s. Run python3 -m patterns %s first."
                 % (path, args.folder))

    start = time.time()
    stops, stations = build(path)
    write(os.path.join(path, "stops.json"), stops)
    write(os.path.join(path, "stations.json"), stations)
    no_naptan = [s for s in stops.values() if not s["stationNaptan"]]
    print("stops: %d (%d with no NaPTAN station, %d of them in a NaPTAN station by icsCode)"
          % (len(stops), len(no_naptan),
             sum(1 for s in no_naptan if stations[s["station"]]["source"] == "naptan")))
    sources = Counter(s["source"] for s in stations.values())
    print("stations: %d (%s)" % (len(stations),
                                 ", ".join("%s %d" % kv for kv in sorted(sources.items()))))
    print("wrote stops.json and stations.json in %s in %.1f s" % (path, time.time() - start))


if __name__ == "__main__":
    main()
