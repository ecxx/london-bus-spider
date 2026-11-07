"""Make the export folder of a data folder.

    cd src
    python3 -m export data_131026     # writes data/export_131026/

Run it after the patterns, the stops and the lines (python3 -m patterns,
python3 -m stops, python3 -m lines).
"""

import argparse
import gzip
import os
import sys
import time

from .build import NAMES, build, write

# The project root is the nearest folder, at or above this file, that holds one
# of these. Data folders are in its data/ folder.
ROOT_MARKERS = (".venv",)
PREFIX = "data_"


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


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", help="data folder, inside <project root>/data (e.g. data_131026)")
    args = parser.parse_args()

    if not args.folder.startswith(PREFIX):
        sys.exit("The data folder name must start with %s, for example data_131026." % PREFIX)
    data = os.path.join(project_root(), "data")
    path = os.path.join(data, args.folder)
    for name, module in (("svc_patterns.json", "patterns"), ("stops.json", "stops"),
                         ("stations.json", "stops"), ("svc_lines.json", "lines")):
        if not os.path.exists(os.path.join(path, name)):
            sys.exit("No %s in %s. Run python3 -m %s %s first." % (name, path, module, args.folder))
    out = os.path.join(data, "export_" + args.folder[len(PREFIX):])

    start = time.time()
    files = build(path)
    manifest = write(out, args.folder, files)
    total = [0, 0]
    for name in NAMES:
        file = manifest["files"][name]
        with open(os.path.join(out, file), "rb") as f:
            content = f.read()
        size = (len(content), len(gzip.compress(content, 9)))
        total = [total[0] + size[0], total[1] + size[1]]
        print("%-28s %6d records  %5d KB  %5d KB gz"
              % (file, len(files[name]), size[0] // 1024, size[1] // 1024))
    print("%-28s %14s  %5d KB  %5d KB gz" % ("total", "", total[0] // 1024, total[1] // 1024))
    print("wrote %s in %.1f s" % (out, time.time() - start))


if __name__ == "__main__":
    main()
