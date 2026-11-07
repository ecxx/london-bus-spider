"""Read one data folder: the service index, svc files, timetables, stops and destinations.

See docs/svc_pattern_algorithm.md, section 3, for the files and fields.
"""

import glob
import json
import math
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field

# The project root is the nearest folder, at or above this file, that holds one
# of these. Data folders are in its data/ folder.
ROOT_MARKERS = (".venv",)

NEAR_M = 150                # metres: the largest distance for a level 1 stop match


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


@dataclass
class Interval:
    """One stationInterval of a TT route."""
    id: int
    stops: list                     # stop IDs after the departure stop
    tta: list                       # timeToArrival of each stop, in minutes
    journeys: Counter               # schedule name -> number of journeys
    times: dict                     # schedule name -> sorted departure times, in minutes


@dataclass
class Timetable:
    """One TT file of a line-direction."""
    file: str                       # path relative to timetables/
    role: str                       # "origin", "backup" or "late"
    dep: str                        # departureStopId
    routes: list = field(default_factory=list)      # [[Interval]]


def parse_timetable(data, file, role):
    tt = (data or {}).get("timetable") or {}
    routes = []
    for r in tt.get("routes", []):
        journeys = defaultdict(Counter)
        times = defaultdict(lambda: defaultdict(list))
        for sc in r["schedules"]:
            for j in sc["knownJourneys"]:
                iid = int(j["intervalId"])
                journeys[iid][sc["name"]] += 1
                times[iid][sc["name"]].append(int(j["hour"]) * 60 + int(j["minute"]))
        routes.append([
            Interval(id=int(si["id"]),
                     stops=[i["stopId"] for i in si["intervals"]],
                     tta=[i["timeToArrival"] for i in si["intervals"]],
                     journeys=journeys[int(si["id"])],
                     times={k: sorted(v) for k, v in times[int(si["id"])].items()})
            for si in r["stationIntervals"]])
    return Timetable(file=file, role=role, dep=tt.get("departureStopId"), routes=routes)


class Dataset:
    """One data folder, for example data/data_131026."""

    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(os.path.normpath(path))
        with open(os.path.join(path, "service_files.json")) as f:
            self.index = json.load(f)

        self.stops = {}
        for p in glob.glob(os.path.join(path, "stops", "stops-*.json")):
            if p.endswith("stops-info.json"):
                continue
            with open(p) as f:
                for stop in json.load(f):
                    self.stops[stop["id"]] = stop

        self.destinations = defaultdict(set)
        with open(os.path.join(path, "buses_master.json")) as f:
            for line in json.load(f):
                for sec in line.get("routeSections", []):
                    self.destinations[(line["id"], sec["direction"])].add(sec["destination"])

        self._levels = {}

    @classmethod
    def from_name(cls, name):
        return cls(os.path.join(project_root(), "data", name))

    def keys(self):
        return sorted(self.index)

    def level(self, a, b):
        """Similarity level of two stop IDs (step 2): 3, 2, 1 or 0."""
        if a == b:
            return 3
        k = (a, b) if a < b else (b, a)
        if k not in self._levels:
            self._levels[k] = self._level(a, b)
        return self._levels[k]

    def _level(self, a, b):
        A, B = self.stops.get(a), self.stops.get(b)
        if not A or not B:
            return 0
        if A.get("icsCode") and A.get("icsCode") == B.get("icsCode"):
            return 2
        dy = (A["lat"] - B["lat"]) * 111320
        dx = (A["lon"] - B["lon"]) * 111320 * math.cos(math.radians(A["lat"]))
        return 1 if math.hypot(dx, dy) <= NEAR_M else 0

    def name_of(self, stop):
        s = self.stops.get(stop)
        if not s:
            return stop
        return s["commonName"] + ("/" + s["stopLetter"] if s.get("stopLetter") else "")

    def svc(self, key):
        with open(os.path.join(self.path, "svc", self.index[key]["svc"])) as f:
            return json.load(f)

    def timetables(self, key):
        """The TT files of a line-direction: originator and backup files, then late-start files."""
        entry = self.index[key]
        files = [(f, "backup" if f.startswith("backup/") else "origin") for f in entry["timetables"]]
        files += [(f, "late") for f in entry.get("late_start", [])]
        out = []
        for f, role in files:
            with open(os.path.join(self.path, "timetables", f)) as fh:
                out.append(parse_timetable(json.load(fh), f, role))
        return out
