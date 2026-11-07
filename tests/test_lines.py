"""Tests of the lines module on data/data_131026.

    .venv/bin/python -m unittest discover tests

They need data/data_131026 with svc_patterns.json and stops.json and are skipped
without them. The reference cases are in docs/svc_line_algorithm.md, section 8.2.
"""

import json
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from lines import build                            # noqa: E402
from patterns.data import project_root            # noqa: E402

FOLDER = os.path.join(project_root(), "data", "data_131026")


def metres(a, b):
    k = 111320 * math.cos(math.radians(a[1]))
    return math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * 111320)


@unittest.skipUnless(all(os.path.exists(os.path.join(FOLDER, f))
                         for f in ("svc_patterns.json", "stops.json")),
                     "needs data/data_131026/svc_patterns.json and stops.json")
class Lines(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.lines = build(FOLDER)
        with open(os.path.join(FOLDER, "svc_patterns.json")) as f:
            cls.patterns = {p["id"]: p for r in json.load(f).values() for p in r["patterns"]}

    def test_counts(self):
        self.assertEqual(list(self.lines), list(self.patterns))
        sources = [r["source"] for r in self.lines.values()]
        self.assertEqual(sources.count("line"), 1454)
        self.assertEqual(sources.count("mixed"), 19)
        self.assertEqual(sources.count("stops"), 0)

    def test_record_format(self):
        for pid, r in self.lines.items():
            stops = self.patterns[pid]["stops"]
            pts = r["coordinates"]
            self.assertTrue(all(a != b for a, b in zip(pts, pts[1:])), pid)
            self.assertEqual(len(r["stopOffsets"]), len(stops), pid)
            offsets = [o for o in r["stopOffsets"] if o is not None]
            self.assertEqual(offsets, sorted(offsets), pid)
            self.assertEqual(r["stopOffsets"][0], 0.0, pid)
            self.assertAlmostEqual(r["stopOffsets"][-1], r["length"], delta=0.1, msg=pid)
            self.assertEqual(r["unplacedStops"], sorted(set(r["unplacedStops"])), pid)
            self.assertLessEqual(r["maxStopDistance"], 150, pid)
            bad = [i for i, o in enumerate(r["stopOffsets"]) if o is None]
            self.assertTrue(set(bad) <= set(r["unplacedStops"]), pid)
            self.assertEqual(bool(bad), "bad_stop_position" in r["flags"], pid)
            self.assertEqual(r["source"] == "mixed", "straight_section" in r["flags"], pid)

    def test_line_ends_at_the_end_stops(self):
        with open(os.path.join(FOLDER, "stops.json")) as f:
            stops = json.load(f)
        for pid, r in self.lines.items():
            ends = (self.patterns[pid]["stops"][0], self.patterns[pid]["stops"][-1])
            for stop, point in zip(ends, (r["coordinates"][0], r["coordinates"][-1])):
                position = (stops[stop]["lon"], stops[stop]["lat"])
                self.assertLessEqual(metres(point, position), 150.1, (pid, stop))

    def test_line_with_a_section_on_a_different_road(self):
        # The line does not go past Chenies Place and St Pancras (section 4.1, item 9).
        r = self.lines["1-O"]
        self.assertEqual((r["source"], r["unplacedStops"]), ("mixed", [14, 15, 16]))
        # The line goes on the OLR diversion at Highbury.
        r = self.lines["19-I"]
        self.assertEqual((r["source"], r["unplacedStops"]), ("mixed", list(range(36, 44))))

    def test_bad_stop_position(self):
        # Oakhill Road Sutton is 6.4 km from the stop before it (section 4.2, item 2).
        r = self.lines["s2-O"]
        self.assertEqual(r["source"], "line")
        self.assertEqual(r["unplacedStops"], [32])
        self.assertIsNone(r["stopOffsets"][32])
        for pid in ("p13-O", "18-O", "n18-O", "n118-O", "88-I", "214-I"):
            self.assertIn("bad_stop_position", self.lines[pid]["flags"], pid)

    def test_stop_off_the_line_is_not_a_bad_position(self):
        # Richmond Mews is 573 m from the next stop. The line does not go there.
        r = self.lines["336-I"]
        self.assertEqual((r["source"], r["unplacedStops"]), ("mixed", [51]))
        self.assertIsNotNone(r["stopOffsets"][51])
        # Beckton Bus Station is 93 m from the line.
        r = self.lines["474-I"]
        self.assertEqual((r["source"], r["unplacedStops"]), ("mixed", [19]))

    def test_part_of_each_pattern(self):
        cases = {"229-I1": 0, "229-I2": 1, "229-I3": 0, "313-I3": 1,
                 "e7-I1": 0, "e7-I2": 1, "358-I1": 0, "358-I2": 1}
        for pid, part in cases.items():
            self.assertEqual(self.lines[pid]["part"], part, pid)
            self.assertEqual(self.lines[pid]["source"], "line", pid)

    def test_short_working_and_late_start_are_cut(self):
        # 229-I3 is a short working of the main pattern 229-I1 on the same part.
        self.assertLess(self.lines["229-I3"]["length"], self.lines["229-I1"]["length"] - 5000)
        # 313-I1 starts at Potters Bar Station, 2.3 km after the first point of part 2.
        self.assertLess(self.lines["313-I1"]["length"], self.lines["313-I2"]["length"] - 2000)

    def test_real_skip_uses_the_shorter_part(self):
        # e7-I1 does not go to 4 stops of branch 2 (svc_pattern_algorithm.md, section 9.2).
        self.assertLess(self.lines["e7-I1"]["length"], self.lines["e7-I2"]["length"] - 1000)

    def test_circular_route(self):
        r = self.lines["h2-O"]
        self.assertEqual(r["source"], "line")
        self.assertLess(metres(r["coordinates"][0], r["coordinates"][-1]), 100)

    def test_loop_visits_a_stop_two_times(self):
        r = self.lines["b11-O"]
        stops = self.patterns["b11-O"]["stops"]
        visits = [r["stopOffsets"][i] for i, s in enumerate(stops) if s == "490012539N"]
        self.assertEqual(len(visits), 2)
        self.assertGreater(visits[1] - visits[0], 1000)


if __name__ == "__main__":
    unittest.main()
