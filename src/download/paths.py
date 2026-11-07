"""Where each file of a data folder goes."""

import datetime
import os

# The project root is the nearest folder, at or above this file, that holds
# one of these. Downloads go to its data/ folder wherever the code lives.
ROOT_MARKERS = (".venv",)


def project_root():
    here = os.path.dirname(os.path.abspath(__file__))
    d = here
    while True:
        if any(os.path.exists(os.path.join(d, m)) for m in ROOT_MARKERS):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise FileNotFoundError("Cannot find the project root above %s (looked for %s)."
                                    % (here, " or ".join(ROOT_MARKERS)))
        d = parent


def default_folder_name():
    return datetime.date.today().strftime("data_%d%m%y")


class Folder:
    """The files of one data folder, for example data/data_131026."""

    def __init__(self, name):
        self.name = name
        self.root = os.path.join(project_root(), "data", name)
        self.master = os.path.join(self.root, "buses_master.json")
        self.svc = os.path.join(self.root, "svc")
        self.stops = os.path.join(self.root, "stops")
        self.timetables = os.path.join(self.root, "timetables")
        self.backup = os.path.join(self.timetables, "backup")
        self.supplemental = os.path.join(self.timetables, "supplemental")
        self.service_files = os.path.join(self.root, "service_files.json")


def svc_filename(job):
    """(lineId, direction) -> <lineId>-<direction>.json"""
    return "%s-%s.json" % job


def timetable_filename(job):
    """(lineId, direction, stop) -> <lineId>-<direction>-<stop>.json"""
    return "%s-%s-%s.json" % job
