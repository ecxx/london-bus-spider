"""Late-start timetables: the timetables of stops where journeys start after a line's first stop.

A timetable from a stop lists only the journeys that depart from that stop, so
the timetables from route-section originators miss every journey that starts
further along the route (for example the 313, whose originator is a school stop
that only the school bus serves). For each line-direction:

    1. count, for each stop that the originator timetables show, the journeys
       those timetables send through it (the expected count)
    2. ask for the timetable at the probe stops -- the second stop and the last
       stop before the end of each interval -- and compare the journeys that
       depart from it with the expected count, schedule by schedule
    3. where the API shows more, binary-search the stops before the probe for
       the first stop with the surplus, and keep that stop's timetable
    4. repeat 2-3 at the same probe until no surplus remains, at most
       MAX_ROUNDS times

Only timed stops (stops in stationIntervals) are probed: the API gives no
timetable at an untimed stop, even when buses serve it.

Writes:
    timetables/supplemental/<lineId>-<direction>-<stop>.json  timetable from a start stop
    timetables/supplemental/_probes.json    per line-direction: each probe (counts
                                            only) and each start stop found
    timetables/supplemental/_failures.json  line-directions that could not finish

Resumable: a line-direction already in _probes.json is skipped, unless its
timetables have changed since it was probed.
"""

import json
import os
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from .api import WORKERS, Fatal, FetchFailed, NotFound, load_json, save_bytes, save_json, timetable
from .jobs import write_failures
from .paths import timetable_filename

MAX_ROUNDS = 5
SAVE_EVERY = 25


# ---- timetables as journey sources -------------------------------------------
def intervals(data, stop=None):
    """Parse a timetable response into routes of (stops, journeys per schedule).

    stops is [first stop] + the interval's stops. The first stop is stop, the
    stop the timetable was asked for, or departureStopId when stop is None.
    departureStopId can be a different stop of the same stop area, so give stop
    when it is known. Returns None when the response has no timetable.
    """
    tt = data.get("timetable") if data else None
    if not tt:
        return None
    dep = stop or tt.get("departureStopId")
    routes = []
    for r in tt.get("routes", []):
        jr = {}
        for sc in r["schedules"]:
            for j in sc["knownJourneys"]:
                jr.setdefault(int(j["intervalId"]), Counter())[sc["name"]] += 1
        routes.append([([dep] + [i["stopId"] for i in si["intervals"]],
                        jr.get(int(si["id"]), Counter()))
                       for si in r["stationIntervals"]])
    return routes


def departing(routes):
    """Journeys that depart from the timetable's stop, per schedule.

    A second TT route usually repeats the first one's journeys as seen from a
    later stop, so take the largest route, not the sum.
    """
    best = Counter()
    for r in routes:
        total = Counter()
        for _, jr in r:
            total.update(jr)
        for name, n in total.items():
            best[name] = max(best[name], n)
    return best


def passing(routes, stop, after=None):
    """Journeys of routes that depart from stop, per schedule.

    With after, count only the intervals that serve after before stop. A stop
    that is the last stop of an interval is not departed from.
    """
    best = Counter()
    for r in routes:
        total = Counter()
        for stops, jr in r:
            body = stops[:-1]
            if after is not None:
                if after not in body:
                    continue
                body = body[body.index(after) + 1:]
            if stop in body:
                total.update(jr)
        for name, n in total.items():
            best[name] = max(best[name], n)
    return best


class Sources:
    """The journey sources of one line-direction: originator timetables and start stops."""

    def __init__(self, origins):
        self.origins = origins          # [routes]
        self.starts = {}                # stop -> routes

    def expected(self, stops, i):
        """Journeys expected to depart from stops[i], per schedule.

        stops is the interval that the probe comes from. The timetable at the
        nearest start stop at or before i already holds every journey that
        passes that stop, from any earlier start. Add only the originator
        journeys that reach stops[i] without passing it.
        """
        stop = stops[i]
        near = [j for j in range(i + 1) if stops[j] in self.starts]
        exp = Counter()
        if not near:
            for routes in self.origins:
                exp.update(passing(routes, stop))
            return exp
        s = stops[near[-1]]
        if s == stop:
            return departing(self.starts[s])
        exp.update(passing(self.starts[s], stop))
        for routes in self.origins:
            exp.update(passing(routes, stop))
            exp.subtract(passing(routes, stop, after=s))
        return +exp


def surplus(dep, exp):
    return {name: dep[name] - exp.get(name, 0) for name in dep if dep[name] > exp.get(name, 0)}


# ---- one line-direction ------------------------------------------------------
def search(line, direction, origins):
    """Probe one line-direction. Return (log, {start stop: response body})."""
    cache = {}

    def tt(stop):
        if stop not in cache:
            try:
                body, data = timetable(line, stop, direction)
                cache[stop] = (body, intervals(data, stop))
            except NotFound:
                cache[stop] = (None, None)
        return cache[stop]

    src = Sources(origins)
    log = {"probes": [], "starts": []}
    bodies = {}

    def probe(stops, i, kind):
        stop = stops[i]
        _, routes = tt(stop)
        if routes is None:
            log["probes"].append({"stop": stop, "kind": kind, "timetable": False})
            return None
        dep, exp = departing(routes), src.expected(stops, i)
        log["probes"].append({"stop": stop, "kind": kind, "departing": dict(dep),
                              "expected": dict(exp)})
        return surplus(dep, exp)

    # Probe stops, with the interval that each one comes from.
    firsts, lasts = {}, {}
    for routes in origins:
        for r in routes:
            for stops, _ in r:
                if len(stops) >= 3:
                    firsts.setdefault(stops[1], stops)
                    lasts.setdefault(stops[-2], stops)
    plan = [(x, "second", s) for x, s in firsts.items()]
    plan += [(x, "last", s) for x, s in lasts.items() if x not in firsts]

    for x, kind, stops in plan:
        xi = len(stops) - 2 if kind == "last" else 1
        for _ in range(MAX_ROUNDS):
            sur = probe(stops, xi, kind)
            if not sur:
                break
            # The originator (index 0), or the last start stop found before x,
            # has no surplus; x has one.
            lo = max([j for j in range(xi) if stops[j] in src.starts], default=0)
            hi = xi
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if probe(stops, mid, "search"):
                    hi = mid
                else:
                    lo = mid
            s = stops[hi]
            if s in src.starts:
                log["unresolved"] = log.get("unresolved", []) + [x]
                break
            body, routes = tt(s)
            sur_s = surplus(departing(routes), src.expected(stops, hi))
            src.starts[s] = routes
            bodies[s] = body
            log["starts"].append({"stop": s, "probe": x, "surplus": sur_s})
            kind = "recheck"
    return log, bodies


# ---- all line-directions -----------------------------------------------------
def load_origins(folder, entry):
    """The originator and backup timetables of one service_files.json entry."""
    out = []
    for name in entry["timetables"]:
        with open(os.path.join(folder.timetables, name)) as f:
            routes = intervals(json.load(f))
        if routes:
            out.append(routes)
    return out


def download_late_starts(folder, index):
    """Probe each line-direction of index that is not in _probes.json. Return the failures."""
    os.makedirs(folder.supplemental, exist_ok=True)
    probes_path = os.path.join(folder.supplemental, "_probes.json")
    probes = load_json(probes_path, {})

    # Probe again when the timetables of a line-direction have changed, for
    # example when an originator's own timetable replaces its backup. A record
    # without "timetables" (from api_download_supplemental.py) is kept.
    stale = lambda k: probes[k].get("timetables", index[k]["timetables"]) != index[k]["timetables"]
    todo = [k for k in sorted(index) if index[k]["timetables"] and (k not in probes or stale(k))]
    print("supplemental: %d line-directions, %d already probed, %d to probe"
          % (len(index), len(probes), len(todo)), flush=True)

    lock = threading.Lock()
    failures = []

    def work(key):
        line, direction = key.rsplit("-", 1)
        log, bodies = search(line, direction, load_origins(folder, index[key]))
        log["timetables"] = index[key]["timetables"]
        for stop, body in bodies.items():
            save_bytes(os.path.join(folder.supplemental,
                                    timetable_filename((line, direction, stop))), body)
        return log

    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(work, k): k for k in todo}
            try:
                for done, fut in enumerate(as_completed(futures), 1):
                    key = futures[fut]
                    try:
                        log = fut.result()
                    except FetchFailed as e:
                        failures.append({"line-direction": key, "note": str(e)})
                        continue
                    with lock:
                        probes[key] = log
                        if log["starts"]:
                            print("  %s: %d start stop(s) %s" % (
                                key, len(log["starts"]), [s["stop"] for s in log["starts"]]),
                                flush=True)
                        if done % SAVE_EVERY == 0:
                            save_json(probes_path, probes)
                            print("  %d/%d probed" % (done, len(todo)), flush=True)
            except Fatal:
                pool.shutdown(wait=False, cancel_futures=True)
                raise
    finally:
        save_json(probes_path, probes)

    write_failures("supplemental", folder.supplemental, failures)
    print("supplemental: %d start stops in %d line-directions"
          % (sum(len(log["starts"]) for log in probes.values()),
             sum(1 for log in probes.values() if log["starts"])))
    return failures
