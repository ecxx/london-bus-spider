"""The first downloads: the line list, route sequences, stops and originator timetables.

    buses_master.json                                  /Line/Mode/bus/Route
    svc/<lineId>-<direction>.json                      /Line/{lineId}/Route/Sequence/{direction}
    stops/stops-<page>.json                            /StopPoint/mode/bus?page={page}
    stops/stops-info.json                              (first_page, last_page)
    timetables/<lineId>-<direction>-<originator>.json  /Line/{lineId}/Timetable/{originator}?direction={direction}
"""

import os

from .api import fetch, load_json, q, save_bytes, save_json, timetable
from .jobs import run_jobs
from .paths import svc_filename, timetable_filename


def download_master(folder):
    """Download buses_master.json if it is missing. Return the bus lines."""
    if os.path.exists(folder.master):
        print("buses_master.json: already downloaded")
    else:
        body, _ = fetch("/Line/Mode/bus/Route")
        save_bytes(folder.master, body)
        print("buses_master.json: downloaded")
    return [line for line in load_json(folder.master) if line["modeName"] == "bus"]


def line_directions(lines):
    return sorted({(line["id"], sec["direction"]) for line in lines for sec in line["routeSections"]})


def originator_jobs(lines):
    return sorted({(line["id"], sec["direction"], sec["originator"])
                   for line in lines for sec in line["routeSections"]})


def download_services(folder, lines):
    def worker(job):
        line, direction = job
        body, _ = fetch("/Line/%s/Route/Sequence/%s" % (q(line), q(direction)))
        save_bytes(os.path.join(folder.svc, svc_filename(job)), body)
        return "ok"

    return run_jobs("svc", folder.svc, line_directions(lines), ("line", "direction"),
                    svc_filename, worker)


def download_stops(folder):
    """Download each stop page that is missing. Raises NotFound or FetchFailed on failure."""
    os.makedirs(folder.stops, exist_ok=True)

    # Pages run until one answers with a pageSize of 0. Each existing page is
    # kept, so a resumed run only fetches the pages it lacks plus that empty one.
    page = 1
    fetched = 0
    while True:
        path = os.path.join(folder.stops, "stops-%d.json" % page)
        if not os.path.exists(path):
            _, data = fetch("/StopPoint/mode/bus", page=page)
            if data["pageSize"] == 0:
                break
            save_json(path, data["stopPoints"])
            fetched += 1
        page += 1

    # last_page is the first empty page, as in the 09_26 download.
    save_json(os.path.join(folder.stops, "stops-info.json"), {"first_page": 1, "last_page": page})
    print("stops: %d pages, %d fetched" % (page - 1, fetched))


def download_timetables(folder, lines):
    def worker(job):
        line, direction, originator = job
        body, data = timetable(line, originator, direction)
        save_bytes(os.path.join(folder.timetables, timetable_filename(job)), body)
        # A line with no timetable answers 200 with no "timetable" key.
        return "ok" if data.get("timetable") else "empty"

    return run_jobs("timetables", folder.timetables, originator_jobs(lines),
                    ("line", "direction", "originator"), timetable_filename, worker)
