"""Regression tests: the reference cases of docs/svc_pattern_algorithm.md, section 9.2.

    .venv/bin/python -m unittest discover tests

They need the data folder data/data_131026 (with the supplemental download)
and are skipped without it.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from patterns import Dataset, build_all            # noqa: E402
from patterns.data import project_root            # noqa: E402

FOLDER = "data_131026"
KEYS = ["1-outbound", "129-outbound", "125-inbound", "223-inbound", "229-inbound",
        "313-inbound", "313-outbound", "60-outbound", "601-inbound", "624-outbound",
        "371-outbound", "b11-outbound", "b12-inbound", "b14-outbound", "h13-inbound",
        "638-inbound", "e7-inbound", "h2-outbound", "n19-inbound", "19-inbound",
        "r5-inbound", "w11-outbound", "292-outbound", "n98-outbound", "14-inbound"]


@unittest.skipUnless(os.path.exists(os.path.join(project_root(), "data", FOLDER, "service_files.json")),
                     "needs data/%s" % FOLDER)
class ReferenceCases(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.R = build_all(Dataset.from_name(FOLDER), KEYS)

    def sizes(self, key):
        return [len(p["stops"]) for p in self.R[key]["patterns"]]

    def unconfirmed(self, key):
        return [len(u["stops"]) for u in self.R[key]["unconfirmedPaths"]]

    def main(self, key):
        return self.R[key]["patterns"][0]

    def test_one_branch(self):
        self.assertEqual(self.sizes("1-outbound"), [48])

    def test_wrong_stop_id_in_interval(self):
        self.assertEqual(self.sizes("129-outbound"), [44])
        self.assertIn("490009918W", self.main("129-outbound")["stops"])     # Pontoon Dock Station

    def test_duplicate_secondary_route(self):
        self.assertEqual(self.sizes("125-inbound"), [53])
        self.assertEqual(self.sizes("223-inbound"), [36])

    def test_two_timetables_merge_graph(self):
        self.assertEqual(self.sizes("229-inbound"), [65, 35, 37])

    def test_late_start_second_stop(self):
        self.assertEqual(self.sizes("313-inbound"), [36, 37, 24])
        m = self.main("313-inbound")
        self.assertEqual(m["stops"][0], "210021000010")                    # Potters Bar Station
        self.assertIn("late_start", m["flags"])
        self.assertEqual(m["serviceClass"], "day")

    def test_late_start_makes_short_working(self):
        self.assertEqual(self.sizes("313-outbound"), [41, 28])
        self.assertEqual(self.R["313-outbound"]["patterns"][1]["stops"][0], "490006576B")
        self.assertEqual(self.unconfirmed("313-outbound"), [42])

    def test_late_start_later_stop(self):
        self.assertEqual(self.sizes("60-outbound"), [55, 59])

    def test_two_late_start_files(self):
        self.assertEqual(self.sizes("601-inbound"), [47, 46, 41])
        self.assertIn("main_tie", self.main("601-inbound")["flags"])

    def test_main_tie_destination(self):
        self.assertEqual(self.sizes("624-outbound"), [34, 21])

    def test_short_working(self):
        self.assertEqual(self.sizes("371-outbound"), [41, 21])

    def test_loop_through_branch(self):
        self.assertEqual(self.sizes("b11-outbound"), [41])
        stops = self.main("b11-outbound")["stops"]
        self.assertEqual(stops.count("490012539N"), 2)
        self.assertEqual(stops.count("490000987Z"), 2)
        self.assertEqual(self.unconfirmed("b11-outbound"), [30])

    def test_late_start_secondary_route(self):
        self.assertEqual(self.sizes("b12-inbound"), [54, 37, 18])
        self.assertEqual(self.R["b12-inbound"]["patterns"][1]["stops"][0], "490012799W")

    def test_loop_branch(self):
        self.assertEqual(self.sizes("b14-outbound")[0], 51)
        self.assertEqual(self.main("b14-outbound")["stops"].count("490013112W"), 2)
        self.assertEqual(self.unconfirmed("b14-outbound"), [48])

    def test_alternatives_one_stop(self):
        self.assertEqual(self.sizes("h13-inbound"), [40])
        self.assertIn("490000197A", self.main("h13-inbound")["stops"])     # Ruislip Station
        self.assertEqual(self.unconfirmed("h13-inbound"), [39])

    def test_self_reference_short_before_branch(self):
        self.assertEqual(self.sizes("638-inbound"), [30, 44, 31, 19])
        self.assertEqual(self.unconfirmed("638-inbound"), [45])

    def test_real_skip(self):
        self.assertEqual(self.sizes("e7-inbound"), [34, 38])

    def test_circular(self):
        self.assertEqual(self.sizes("h2-outbound"), [39])
        stops = self.main("h2-outbound")["stops"]
        self.assertEqual(stops[0], "490015496GW")
        self.assertEqual(stops[-1], "490015496GW")

    def test_alternative_branches_same_id(self):
        self.assertEqual(self.sizes("n19-inbound"), [57])
        self.assertIn("490000108A", self.main("n19-inbound")["stops"])     # Highbury & Islington

    def test_gap_prefers_sps(self):
        self.assertEqual(self.sizes("19-inbound"), [45])
        self.assertTrue(self.main("19-inbound")["candidate"].startswith("sps:"))

    def test_missing_sps_branch(self):
        self.assertEqual(self.sizes("r5-inbound"), [42, 40])

    def test_tail_extended(self):
        self.assertEqual(self.sizes("w11-outbound"), [18])
        self.assertIn("tail_extended", self.main("w11-outbound")["flags"])

    def test_backup_timetable(self):
        self.assertEqual(self.sizes("292-outbound"), [42])
        self.assertIn("backup_timetable", self.main("292-outbound")["flags"])

    def test_service_classes(self):
        self.assertEqual(self.main("n98-outbound")["serviceClass"], "night")
        self.assertEqual(self.main("14-inbound")["serviceClass"], "24-hour")
        self.assertEqual(self.main("1-outbound")["serviceClass"], "day")
        self.assertEqual(self.main("601-inbound")["serviceClass"], "limited")

    def test_ids(self):
        self.assertEqual([p["id"] for p in self.R["1-outbound"]["patterns"]], ["1-O"])
        self.assertEqual([p["id"] for p in self.R["b12-inbound"]["patterns"]],
                         ["b12-I1", "b12-I2", "b12-I3"])


if __name__ == "__main__":
    unittest.main()
