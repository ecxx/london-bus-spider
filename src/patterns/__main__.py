"""Build the service patterns of a data folder.

    cd src
    python3 -m patterns data_131026                  # writes data/data_131026/svc_patterns.json
    python3 -m patterns data_131026 313-inbound b12-inbound   # prints those line-directions only

Run it after the download (python3 -m download).
"""

import argparse
import json
import os
import sys
import time
from collections import Counter

from . import Dataset, build_all

OUTPUT = "svc_patterns.json"


def summary(records):
    npat = Counter(len(r["patterns"]) for r in records.values())
    classes = Counter(p["serviceClass"] for r in records.values() for p in r["patterns"])
    flags = Counter(f for r in records.values() for p in r["patterns"] for f in p["flags"])
    print("line-directions: %d" % len(records))
    print("patterns: %d   (per line-direction: %s)"
          % (sum(len(r["patterns"]) for r in records.values()),
             ", ".join("%d: %d" % kv for kv in sorted(npat.items()))))
    print("service classes: %s" % ", ".join("%s %d" % kv for kv in classes.most_common()))
    print("flags: %s" % ", ".join("%s %d" % kv for kv in flags.most_common()))
    print("unconfirmed paths: %d" % sum(len(r["unconfirmedPaths"]) for r in records.values()))


def show(ds, record):
    print("## %s-%s" % (record["lineId"], record["direction"]))
    for p in record["patterns"]:
        print("   %-8s %3d stops  %7.1f/week  %-8s %s -> %s  %s" % (
            p["id"], len(p["stops"]), p["weeklyJourneys"], p["serviceClass"],
            ds.name_of(p["stops"][0]), ds.name_of(p["stops"][-1]), ",".join(p["flags"])))
    for u in record["unconfirmedPaths"]:
        print("   unconfirmed: %d stops %s" % (len(u["stops"]), u["candidate"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", help="data folder, inside <project root>/data (e.g. data_131026)")
    parser.add_argument("keys", nargs="*", help="line-directions to print, e.g. 313-inbound; "
                                                "with none, build all and write %s" % OUTPUT)
    args = parser.parse_args()

    ds = Dataset.from_name(args.folder)
    unknown = [k for k in args.keys if k not in ds.index]
    if unknown:
        sys.exit("Not in service_files.json: %s" % ", ".join(unknown))

    start = time.time()
    records = build_all(ds, args.keys or None)
    if args.keys:
        for k in args.keys:
            show(ds, records[k])
        return
    path = os.path.join(ds.path, OUTPUT)
    with open(path + ".part", "w") as f:
        json.dump(records, f)
    os.replace(path + ".part", path)
    summary(records)
    print("wrote %s in %.1f s" % (path, time.time() - start))


if __name__ == "__main__":
    main()
