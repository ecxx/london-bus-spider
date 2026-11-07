"""Make the stop and station records of one data folder.

A stop is a record with no children. It is kept if one or more patterns of
svc_patterns.json contain it. Its lines are the lines of those patterns. A
station is the direct parent of a stop: the stationNaptan of the stop. A
station is kept if one or more of its stops are kept. HUB records have
children, and they are the parents of stations, not of stops. Thus they are not
kept.

The lines of a stop page are not used. They can give a line that no pattern
takes to the stop, for example during a road closure.

TfL gives no station to some stops. The module puts each of these stops into a
station with these rules, so that each stop has a station:

1. If a stop of a NaPTAN station has the same icsCode, and is GROUP_DISTANCE or
   less from the stop, the stop joins that station. If there are two or more
   such stations, it joins the nearest one.
2. If not, the stops with the same icsCode make a new station. Two stops are in
   the same new station if a chain of these stops joins them, and each step of
   the chain is GROUP_DISTANCE or less.
3. A stop with no icsCode is a new station by itself.

The station of a stop is in its "station" field. Its "stationNaptan" field is
the TfL value.
"""

import glob
import json
import math
import os
from collections import Counter

# The largest distance, in metres, between two stops of a new station, and
# between a stop and the station that it joins (rule 1). In data_131026, 99% of
# the icsCode groups of the stops with no station are 472 m or less across.
GROUP_DISTANCE = 500


def load_pages(path):
    """All records of stops/stops-<n>.json, without stops-info.json."""
    records = []
    for p in sorted(glob.glob(os.path.join(path, "stops", "stops-*.json"))):
        if p.endswith("stops-info.json"):
            continue
        with open(p) as f:
            records += json.load(f)
    return records


def pattern_index(path):
    """stop ID -> {lineId: the pattern IDs that serve it}, in svc_patterns.json order."""
    with open(os.path.join(path, "svc_patterns.json")) as f:
        records = json.load(f)
    index = {}
    for record in records.values():
        for p in record["patterns"]:
            for stop in p["stops"]:
                ids = index.setdefault(stop, {}).setdefault(record["lineId"], [])
                if p["id"] not in ids:          # a loop visits a stop two times
                    ids.append(p["id"])
    return index


def direction(record, key):
    for a in record["additionalProperties"]:
        if a["category"] == "Direction" and a["key"] == key:
            return a["value"]
    return None


def distance(a, b):
    """Metres between two stops, with an equirectangular approximation."""
    x = (a["lon"] - b["lon"]) * 111320 * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    y = (a["lat"] - b["lat"]) * 111320
    return math.hypot(x, y)


def components(group):
    """The sets of stops of a group that chains of steps of GROUP_DISTANCE or less join.

    Each set is sorted by stop ID. The sets are sorted by their first stop ID.
    """
    todo = sorted(group, key=lambda s: s["id"])
    result = []
    while todo:
        found = [todo.pop(0)]
        for s in found:                 # found grows while the loop runs
            near = [t for t in todo if distance(s, t) <= GROUP_DISTANCE]
            todo = [t for t in todo if t not in near]
            found += near
        result.append(sorted(found, key=lambda s: s["id"]))
    return result


def new_station(sid, source, members):
    """A station record for stops that TfL gives no station."""
    names = Counter(s["commonName"] for s in members)
    top = max(names.values())
    return {
        "id": sid,
        "source": source,
        "commonName": min(n for n, c in names.items() if c == top),
        "icsCode": members[0]["icsCode"],
        "lat": round(sum(s["lat"] for s in members) / len(members), 5),
        "lon": round(sum(s["lon"] for s in members) / len(members), 5),
        "hubNaptanCode": None,
        "stops": [s["id"] for s in members],
    }


def group_stops(stops, stations):
    """Give a station to each stop with no stationNaptan. Change stops and stations."""
    by_ics = {}
    for stop in stops.values():
        if stop["stationNaptan"] and stop["icsCode"]:
            by_ics.setdefault(stop["icsCode"], []).append(stop)

    rest = []
    for stop in stops.values():
        if stop["stationNaptan"]:
            continue
        near = [(distance(stop, t), t["stationNaptan"]) for t in by_ics.get(stop["icsCode"], [])]
        near = [n for n in near if n[0] <= GROUP_DISTANCE]
        if near:                                            # rule 1
            stop["station"] = min(near)[1]
            stations[stop["station"]]["stops"].append(stop["id"])
        else:
            rest.append(stop)

    by_ics = {}
    for stop in rest:
        if stop["icsCode"]:
            by_ics.setdefault(stop["icsCode"], []).append(stop)
        else:                                               # rule 3
            stop["station"] = "STOP" + stop["id"]
            stations[stop["station"]] = new_station(stop["station"], "stop", [stop])
    for ics, group in by_ics.items():                       # rule 2
        for n, members in enumerate(components(group), 1):
            sid = "ICS" + ics + ("" if n == 1 else "-%d" % n)
            stations[sid] = new_station(sid, "ics", members)
            for s in members:
                s["station"] = sid

    for station in stations.values():
        station["stops"].sort()


def build(path):
    """Return (stops, stations): two dicts from ID to record, sorted by ID."""
    records = load_pages(path)
    patterns = pattern_index(path)

    stops = {}
    for r in sorted(records, key=lambda r: r["id"]):
        if r["children"] or r["id"] not in patterns:    # a station or a HUB, or no pattern
            continue
        by_line = patterns[r["id"]]
        stops[r["id"]] = {
            "id": r["id"],
            "commonName": r["commonName"],
            "indicator": r.get("indicator"),
            "stopLetter": r.get("stopLetter"),
            "icsCode": r.get("icsCode"),
            "lat": r["lat"],
            "lon": r["lon"],
            "stationNaptan": r.get("stationNaptan"),
            "station": r.get("stationNaptan"),
            "hubNaptanCode": r.get("hubNaptanCode"),
            "towards": direction(r, "Towards"),
            "compassPoint": direction(r, "CompassPoint"),
            "lines": {line: by_line[line] for line in sorted(by_line)},
        }

    children = {}
    for stop in stops.values():
        if stop["stationNaptan"]:
            children.setdefault(stop["stationNaptan"], []).append(stop["id"])

    by_id = {r["id"]: r for r in records}
    stations = {}
    for sid in sorted(children):
        r = by_id[sid]
        if sid.startswith(("ICS", "STOP")):
            raise ValueError("a NaPTAN station ID has the prefix of a new station: %s" % sid)
        stations[sid] = {
            "id": sid,
            "source": "naptan",
            "commonName": r["commonName"],
            "icsCode": r.get("icsCode"),
            "lat": r["lat"],
            "lon": r["lon"],
            "hubNaptanCode": r.get("hubNaptanCode"),
            "stops": children[sid],
        }
    group_stops(stops, stations)
    stations = {sid: stations[sid] for sid in sorted(stations)}

    missing = sorted(set(patterns) - set(stops))
    if missing:
        raise ValueError("pattern stops that are not kept stops: %s" % ", ".join(missing))
    return stops, stations
