"""Tests of the stops module on data/data_131026.

    .venv/bin/python -m unittest discover tests

They need data/data_131026 with svc_patterns.json and are skipped without it.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from patterns.data import project_root            # noqa: E402
from stops import build                            # noqa: E402
from stops.build import GROUP_DISTANCE, distance   # noqa: E402

FOLDER = os.path.join(project_root(), "data", "data_131026")


@unittest.skipUnless(os.path.exists(os.path.join(FOLDER, "svc_patterns.json")),
                     "needs data/data_131026/svc_patterns.json")
class Stops(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stops, cls.stations = build(FOLDER)
        with open(os.path.join(FOLDER, "svc_patterns.json")) as f:
            cls.patterns = {p["id"]: p for r in json.load(f).values() for p in r["patterns"]}

    def test_counts(self):
        self.assertEqual(len(self.stops), 19985)
        self.assertEqual(len(self.stations), 11571)
        self.assertEqual(sum(1 for s in self.stops.values() if s["stationNaptan"] is None), 1756)
        sources = {}
        for station in self.stations.values():
            sources[station["source"]] = sources.get(station["source"], 0) + 1
        self.assertEqual(sources, {"naptan": 10834, "ics": 734, "stop": 3})

    def test_no_hubs(self):
        self.assertFalse([k for k in self.stops if k.startswith("HUB")])
        self.assertFalse([k for k in self.stations if k.startswith("HUB")])

    def test_every_line_has_a_pattern(self):
        for sid, stop in self.stops.items():
            self.assertTrue(stop["lines"], sid)
            self.assertTrue(all(stop["lines"].values()), sid)

    def test_stations_and_stops_agree(self):
        for sid, station in self.stations.items():
            self.assertEqual(station["stops"], sorted(station["stops"]), sid)
            for stop in station["stops"]:
                self.assertEqual(self.stops[stop]["station"], sid)
        for stop in self.stops.values():
            self.assertIn(stop["id"], self.stations[stop["station"]]["stops"])
            if stop["stationNaptan"]:
                self.assertEqual(stop["station"], stop["stationNaptan"])

    def test_new_station_ids(self):
        for sid, station in self.stations.items():
            prefix = {"naptan": "", "ics": "ICS", "stop": "STOP"}[station["source"]]
            self.assertTrue(sid.startswith(prefix), sid)
            if station["source"] != "naptan":
                self.assertTrue(all(self.stops[s]["stationNaptan"] is None
                                    for s in station["stops"]), sid)

    def test_new_stations_with_same_ics_are_apart(self):
        by_ics = {}
        for station in self.stations.values():
            if station["source"] == "ics":
                by_ics.setdefault(station["icsCode"], []).append(station)
        for ics, group in by_ics.items():
            for a in group:
                for b in group:
                    if a is b:
                        continue
                    gap = min(distance(self.stops[x], self.stops[y])
                              for x in a["stops"] for y in b["stops"])
                    self.assertGreater(gap, GROUP_DISTANCE, ics)

    def test_grouping_reference_cases(self):
        # Rule 2: the bus stops at a Tube station, with no NaPTAN station.
        self.assertEqual(self.stations["ICS1000004"]["stops"], [
            "490000004E", "490000004N", "490000004W", "490000004Z", "490019414S"])
        self.assertEqual(self.stations["ICS1000004"]["commonName"], "Aldgate East Station")
        # Rule 1: the other side of the road has a NaPTAN station with the same icsCode.
        self.assertEqual(self.stops["1590008601"]["stationNaptan"], None)
        self.assertEqual(self.stops["1590008601"]["station"], "159G0008601")
        # Rule 2, split: the same icsCode, but more than GROUP_DISTANCE apart.
        self.assertEqual(self.stations["ICS1001983"]["stops"], ["490001983XY"])
        self.assertEqual(self.stations["ICS1001983-2"]["stops"], ["490001983YY"])
        self.assertEqual(self.stations["ICS1023096-2"]["stops"], ["2400A008600A"])
        # Rule 3: no icsCode.
        self.assertEqual(self.stops["2400107791"]["icsCode"], None)
        self.assertEqual(self.stations["STOP2400107791"]["stops"], ["2400107791"])

    def test_lines_field(self):
        served = {}
        for pid, p in self.patterns.items():
            for stop in p["stops"]:
                served.setdefault(stop, set()).add(pid)
        for sid, stop in self.stops.items():
            ids = [pid for pids in stop["lines"].values() for pid in pids]
            self.assertEqual(set(ids), served.get(sid, set()), sid)
            self.assertEqual(len(ids), len(set(ids)), sid)
            self.assertEqual(list(stop["lines"]), sorted(stop["lines"]), sid)
            for line, pids in stop["lines"].items():
                for pid in pids:
                    self.assertTrue(pid.startswith(line + "-"), (sid, line, pid))

    def test_loop_stop_lists_pattern_once(self):
        # b11-outbound visits 490012539N two times (svc_pattern_algorithm.md, 9.2).
        self.assertEqual(self.stops["490012539N"]["lines"], {"301": ["301-O"], "b11": ["b11-O"]})

    def test_line_with_no_pattern_is_removed(self):
        # The stop page gives the n19 at 490003053N, but only the unconfirmed n19 path
        # goes there. The stop page gives the 675 at 490001268ZC, but its svc file does not.
        self.assertEqual(self.stops["490003053N"]["lines"], {"19": ["19-I"]})
        self.assertEqual(self.stops["490001268ZC"]["lines"], {"212": ["212-O"]})

    def test_stop_with_no_pattern_is_removed(self):
        # The stop pages give a line at these stops, but no pattern goes there.
        for sid in ("490000249K", "490006394W", "490011979E", "490011979M",
                    "490011979N", "490015259L"):
            self.assertNotIn(sid, self.stops)
        # Their stations are removed if they have no other kept stops.
        self.assertNotIn("490G00011979", self.stations)
        self.assertNotIn("490G00011980", self.stations)
        self.assertEqual(self.stations["490G00006394"]["stops"], ["490006394S"])

    def test_record(self):
        self.assertEqual(self.stops["490007856W"], {
            "id": "490007856W", "commonName": "Harrow Road", "indicator": "->W",
            "stopLetter": "->W", "icsCode": "1007856", "lat": 51.44652, "lon": -0.45788,
            "stationNaptan": "490G00007856", "station": "490G00007856", "hubNaptanCode": None,
            "towards": "Ashford Hospital", "compassPoint": "W",
            "lines": {"116": ["116-I"]}})
        self.assertEqual(self.stations["490G00007856"]["source"], "naptan")
        self.assertEqual(self.stations["490G00007856"]["stops"], ["490007856E", "490007856W"])


if __name__ == "__main__":
    unittest.main()
