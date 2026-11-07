"""Tests of the export module on data/data_131026.

    .venv/bin/python -m unittest discover tests

They need data/data_131026 with svc_patterns.json, stops.json, stations.json and
svc_lines.json and are skipped without them. The format is in docs/export_format.md.
"""

import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from export import build, write                    # noqa: E402
from export.build import decode_polyline, encode_polyline   # noqa: E402
from patterns.data import project_root            # noqa: E402

FOLDER = os.path.join(project_root(), "data", "data_131026")
INPUTS = ("svc_patterns.json", "stops.json", "stations.json", "svc_lines.json")


@unittest.skipUnless(all(os.path.exists(os.path.join(FOLDER, f)) for f in INPUTS),
                     "needs data/data_131026/" + ", ".join(INPUTS))
class Export(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.files = build(FOLDER)
        cls.inputs = {}
        for name in INPUTS:
            with open(os.path.join(FOLDER, name)) as f:
                cls.inputs[name] = json.load(f)
        cls.source_patterns = {p["id"]: p for r in cls.inputs["svc_patterns.json"].values()
                               for p in r["patterns"]}

    def test_counts_and_keys(self):
        stops, stations, patterns, lines = (self.files[n] for n in
                                            ("stops", "stations", "patterns", "lines"))
        self.assertEqual(len(stops), 19985)
        self.assertEqual(len(stations), 11571)
        self.assertEqual(list(stops), sorted(stops))
        self.assertEqual(list(stations), sorted(stations))
        self.assertEqual(list(patterns), list(self.source_patterns))
        self.assertEqual(list(lines), list(patterns))

    def test_stops_and_stations(self):
        stops, stations = self.files["stops"], self.files["stations"]
        self.assertEqual(stops["490007856W"], ["Harrow Road", "->W", 51.44652, -0.45788, "490G00007856"])
        self.assertEqual(stations["490G00007856"], ["Harrow Road", 51.44682, -0.45768])
        for key, stop in stops.items():
            self.assertIn(stop[4], stations, key)

    def test_patterns(self):
        stops = self.files["stops"]
        self.assertEqual(self.files["patterns"]["1-I"][:4], ["1", "1", "inbound", "day"])
        self.assertEqual(self.files["patterns"]["n19-O"][:4], ["n19", "N19", "outbound", "night"])
        for pid, p in self.files["patterns"].items():
            self.assertEqual(p[4], self.source_patterns[pid]["stops"], pid)
            self.assertIn(p[3], ("day", "night", "24-hour", "limited"), pid)
            self.assertTrue(all(s in stops for s in p[4]), pid)

    def test_polyline_round_trip(self):
        points = [[-0.45788, 51.44652], [-0.45788, 51.44652], [0.161111, 51.437118], [-120.2, 38.5]]
        decoded = decode_polyline(encode_polyline(points))
        self.assertEqual(decoded, [[51.44652, -0.45788], [51.44652, -0.45788],
                                   [51.43712, 0.16111], [38.5, -120.2]])
        # The example of the Google Maps Platform documentation.
        self.assertEqual(encode_polyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]),
                         "_p~iF~ps|U_ulLnnqC_mqNvxq`@")

    def test_lines_keep_all_points(self):
        for pid, (text, _) in self.files["lines"].items():
            coordinates = self.inputs["svc_lines.json"][pid]["coordinates"]
            decoded = decode_polyline(text)
            self.assertEqual(len(decoded), len(coordinates), pid)
            for (lat, lon), (lon0, lat0) in zip(decoded, coordinates):
                self.assertAlmostEqual(lat, lat0, delta=0.0000051, msg=pid)
                self.assertAlmostEqual(lon, lon0, delta=0.0000051, msg=pid)

    def test_stop_points(self):
        for pid, (text, points) in self.files["lines"].items():
            n = len(decode_polyline(text))
            offsets = self.inputs["svc_lines.json"][pid]["stopOffsets"]
            self.assertEqual(len(points), len(self.source_patterns[pid]["stops"]), pid)
            self.assertEqual([i for i, p in enumerate(points) if p is None],
                             [i for i, o in enumerate(offsets) if o is None], pid)
            self.assertEqual(points[0], 0, pid)
            self.assertEqual(points[-1], n - 1, pid)
            known = [p for p in points if p is not None]
            self.assertEqual(known, sorted(known), pid)

    def test_bad_stop_position_has_no_point(self):
        # Oakhill Road Sutton (svc_line_algorithm.md, section 8.2).
        self.assertIsNone(self.files["lines"]["s2-O"][1][32])

    def test_loop_visits_a_stop_two_times(self):
        stops = self.files["patterns"]["b11-O"][4]
        points = self.files["lines"]["b11-O"][1]
        visits = [points[i] for i, s in enumerate(stops) if s == "490012539N"]
        self.assertEqual(len(visits), 2)
        self.assertLess(visits[0], visits[1])

    def test_write(self):
        with tempfile.TemporaryDirectory() as out:
            old = os.path.join(out, "stops.00000000.json")
            other = os.path.join(out, "notes.txt")
            for path in (old, other):
                with open(path, "w") as f:
                    f.write("x")
            manifest = write(out, "data_131026", self.files)
            self.assertEqual(manifest["format"], 1)
            self.assertEqual(manifest["dataset"], "data_131026")
            self.assertEqual(sorted(os.listdir(out)),
                             sorted(list(manifest["files"].values()) + ["manifest.json", "notes.txt"]))
            for name, file in manifest["files"].items():
                self.assertRegex(file, r"^%s\.[0-9a-f]{8}\.json$" % re.escape(name))
                with open(os.path.join(out, file), encoding="utf-8") as f:
                    self.assertEqual(json.load(f), self.files[name], name)
            with open(os.path.join(out, "manifest.json")) as f:
                self.assertEqual(json.load(f), manifest)
            # The same data gives the same file names.
            self.assertEqual(write(out, "data_131026", self.files), manifest)


if __name__ == "__main__":
    unittest.main()
