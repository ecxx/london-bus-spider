"""Download a TfL bus data folder: lines, routes, stops and timetables.

    pip install -r requirements.txt
    export TFL_APP_KEY=your_key_here
    cd src
    python3 -m download                          # writes data/data_<today as DDMMYY>/
    python3 -m download data_131026              # resumes an earlier download
    python3 -m download data_131026 --phases backup,supplemental

Phases, in order (buses_master.json is always read or downloaded first):

    svc           svc/<lineId>-<direction>.json                      route sequences
    stops         stops/stops-<page>.json, stops/stops-info.json     all bus stops
    timetables    timetables/<lineId>-<direction>-<originator>.json  timetable from each originator
    backup        timetables/backup/...                              timetables for originators with none
    supplemental  timetables/supplemental/...                        timetables of late-start stops

service_files.json is written after the backup phase and again at the end.

Resumable: re-run it and each phase skips what it already has. Files are
written to a .part name first and renamed when complete, so an interrupted run
never leaves a truncated file that a later run would skip.
"""

import argparse
import os
import sys

from .api import APP_KEY, Fatal, FetchFailed, NotFound
from .backup import download_backups
from .index import write_index
from .paths import Folder, default_folder_name
from .primary import (download_master, download_services, download_stops,
                      download_timetables, originator_jobs)
from .supplemental import download_late_starts

PHASES = ("svc", "stops", "timetables", "backup", "supplemental")


def complete_entries(index, lines):
    """The index entries whose every originator has a timetable or a backup."""
    count = {}
    for line, direction, _ in originator_jobs(lines):
        key = "%s-%s" % (line, direction)
        count[key] = count.get(key, 0) + 1
    return {k: e for k, e in index.items() if len(e["timetables"]) >= count.get(k, 0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", nargs="?", default=default_folder_name(),
                        help="output folder, inside <project root>/data "
                             "(default: data_<today as DDMMYY>)")
    parser.add_argument("--phases", default=",".join(PHASES),
                        help="comma-separated phases to run (default: all): " + ",".join(PHASES))
    args = parser.parse_args()
    phases = [p.strip() for p in args.phases.split(",") if p.strip()]
    unknown = [p for p in phases if p not in PHASES]
    if unknown:
        sys.exit("Unknown phase: %s. Use: %s" % (", ".join(unknown), ",".join(PHASES)))

    if not APP_KEY:
        sys.exit("Set the API key first: export TFL_APP_KEY=your_key_here")

    folder = Folder(args.folder)
    os.makedirs(folder.root, exist_ok=True)
    print("Downloading into %s" % folder.root)

    failed = []
    try:
        lines = download_master(folder)
        print("buses_master.json: %d bus lines" % len(lines))

        if "svc" in phases and download_services(folder, lines):
            failed.append("svc")
        if "stops" in phases:
            try:
                download_stops(folder)
            except (NotFound, FetchFailed) as e:
                print("stops: failed: %s -- run again to resume" % e)
                failed.append("stops")
        transient = []
        if "timetables" in phases:
            # A 404 or HTTP 400 is permanent: the backup phase replaces those
            # timetables. Any other failure can pass, so retry it before a
            # backup replaces the originator with a later stop.
            transient = [f for f in download_timetables(folder, lines)
                         if f["result"] == "failed" and not f["note"].startswith("HTTP 400")]
            if transient:
                failed.append("timetables")
                print("timetables: %d failures can pass on a retry; the backup phase waits"
                      % len(transient))
        if "backup" in phases and not transient and download_backups(folder, lines):
            failed.append("backup")

        index = write_index(folder, lines)

        if "supplemental" in phases:
            ready = complete_entries(index, lines)
            if len(ready) < len(index):
                print("supplemental: %d line-directions skipped until all their originators "
                      "have a timetable" % (len(index) - len(ready)))
            if download_late_starts(folder, ready):
                failed.append("supplemental")
            write_index(folder, lines)
    except Fatal as e:
        sys.exit(str(e))
    except (NotFound, FetchFailed) as e:
        sys.exit("buses_master.json: failed: %s" % e)

    if failed:
        sys.exit("Incomplete: %s. Run again to retry." % ", ".join(failed))
    print("Complete.")


if __name__ == "__main__":
    main()
