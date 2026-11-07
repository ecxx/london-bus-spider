"""Backup timetables, for the originators whose own timetable the API does not give.

For each missing originator, ask /Line/{lineId}/Timetable/{stop}?direction=...
for these stops, in order, until one answers with a timetable:

    1. the originator's station (stationNaptan in stops/), if it differs from
       the originator itself
    2. each other stop with the originator's icsCode (in stops/). TfL can
       answer at one of these with the originator's own timetable: for the
       292 outbound, Rossington Avenue gives the timetable of Wetherby Road.
    3. each stop after the originator along the route (orderedLineRoutes in
       svc/<lineId>-<direction>.json)

Writes:
    timetables/backup/<lineId>-<direction>-<stop>.json   the timetable from <stop>
    timetables/backup/_backups.json                      (<lineId>-<direction>-<originator>: backup file)
    timetables/backup/_failures.json                     (originators no stop could replace)

Resumable: an originator already in _backups.json is skipped.
"""

import glob
import json
import os

from .api import FetchFailed, NotFound, load_json, save_bytes, save_json, timetable
from .jobs import write_failures
from .paths import svc_filename, timetable_filename
from .primary import originator_jobs


def load_stops(folder):
    """Return (naptanId -> stationNaptan, naptanId -> icsCode) for the stops in stops/."""
    stations, ics = {}, {}
    for path in glob.glob(os.path.join(folder.stops, "stops-*.json")):
        if path.endswith("stops-info.json"):
            continue
        with open(path) as f:
            for stop in json.load(f):
                if stop.get("stationNaptan"):
                    stations[stop["naptanId"]] = stop["stationNaptan"]
                if stop.get("icsCode"):
                    ics[stop["naptanId"]] = stop["icsCode"]
    return stations, ics


def ics_twins(ics, originator):
    """The other stops with the originator's icsCode. Empty if it has no icsCode."""
    code = ics.get(originator)
    if not code:
        return []
    return sorted(s for s, c in ics.items() if c == code and s != originator)


def route_after(folder, line, direction, originator):
    """The stops after originator along its route, in order.

    Uses the first route in orderedLineRoutes that holds the originator,
    preferring one that starts there and is a Regular service.
    """
    svc = load_json(os.path.join(folder.svc, svc_filename((line, direction))), {})
    routes = [r for r in svc.get("orderedLineRoutes", []) if originator in r["naptanIds"]]
    if not routes:
        return []
    routes.sort(key=lambda r: (r["naptanIds"].index(originator) != 0,
                               r.get("serviceType") != "Regular"))
    ids = routes[0]["naptanIds"]
    return ids[ids.index(originator) + 1:]


def candidates(folder, stations, ics, line, direction, originator):
    out = []
    station = stations.get(originator)
    if station and station != originator:
        out.append(station)
    for stop in ics_twins(ics, originator):
        if stop not in out:
            out.append(stop)
    for stop in route_after(folder, line, direction, originator):
        if stop not in out and stop != originator:
            out.append(stop)
    return out


def missing_originators(folder, lines):
    return [j for j in originator_jobs(lines)
            if not os.path.exists(os.path.join(folder.timetables, timetable_filename(j)))]


def download_backup(folder, stations, ics, job):
    """Try each candidate stop in turn. Return (backup filename, tries) or (None, tries)."""
    line, direction, originator = job
    tries = []
    for stop in candidates(folder, stations, ics, line, direction, originator):
        name = timetable_filename((line, direction, stop))
        if os.path.exists(os.path.join(folder.backup, name)):
            return name, tries
        try:
            body, data = timetable(line, stop, direction)
        except NotFound:
            tries.append((stop, "404"))
            continue
        except FetchFailed as e:
            tries.append((stop, str(e)))
            continue
        # A stop with no timetable answers 200 with no "timetable" key.
        if not data.get("timetable"):
            tries.append((stop, "empty"))
            continue
        save_bytes(os.path.join(folder.backup, name), body)
        return name, tries
    return None, tries


def download_backups(folder, lines):
    """Download a backup for each missing originator. Return the failures."""
    os.makedirs(folder.backup, exist_ok=True)
    backups_path = os.path.join(folder.backup, "_backups.json")
    backups = load_json(backups_path, {})

    stations, ics = load_stops(folder)
    missing = missing_originators(folder, lines)
    todo = [j for j in missing if "-".join(j) not in backups]
    print("backup: %d timetables missing, %d already backed up, %d to fetch"
          % (len(missing), len(missing) - len(todo), len(todo)), flush=True)

    failures = []
    for job in todo:
        label = "-".join(job)
        name, tries = download_backup(folder, stations, ics, job)
        if name:
            backups[label] = name
            save_json(backups_path, backups)
            print("  %s -> backup/%s (after %d failed)" % (label, name, len(tries)), flush=True)
        else:
            print("  %s: no stop worked (%d tried)" % (label, len(tries)), flush=True)
            failures.append({"line": job[0], "direction": job[1], "originator": job[2],
                             "tried": [{"stop": s, "note": n} for s, n in tries]})
    write_failures("backup", folder.backup, failures)
    return failures
