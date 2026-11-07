"""service_files.json: for each <lineId>-<direction>, the files that hold it.

    {"<lineId>-<direction>": {
        "svc": "<lineId>-<direction>.json",               # null if not downloaded
        "timetables": ["<originator file>", ...,          # originator timetables on disk,
                       "backup/<file>", ...],             # then backups of the missing ones
        "late_start": ["supplemental/<file>", ...]}}      # start-stop timetables

The index is made from the files on disk each time, so a failed or partial
download shows as a null svc or a shorter list.
"""

import os

from .api import load_json, save_json
from .paths import svc_filename, timetable_filename
from .primary import originator_jobs


def build_index(folder, lines):
    originators = {}
    for line, direction, originator in originator_jobs(lines):
        originators.setdefault((line, direction), []).append(originator)
    backups = load_json(os.path.join(folder.backup, "_backups.json"), {})
    probes = load_json(os.path.join(folder.supplemental, "_probes.json"), {})

    index = {}
    for key in sorted(originators):
        line, direction = key
        svc = svc_filename(key)
        names = [timetable_filename(key + (o,)) for o in sorted(originators[key])]
        timetables = [n for n in names if os.path.exists(os.path.join(folder.timetables, n))]
        for o in sorted(originators[key]):
            label = "%s-%s-%s" % (line, direction, o)
            if timetable_filename(key + (o,)) in timetables or label not in backups:
                continue
            if os.path.exists(os.path.join(folder.backup, backups[label])):
                timetables.append("backup/" + backups[label])
        late = ["supplemental/" + timetable_filename(key + (s["stop"],))
                for s in probes.get("%s-%s" % key, {}).get("starts", [])]
        late = [n for n in late if os.path.exists(os.path.join(folder.timetables, n))]
        index["%s-%s" % key] = {
            "svc": svc if os.path.exists(os.path.join(folder.svc, svc)) else None,
            "timetables": timetables,
            "late_start": late,
        }
    return index


def write_index(folder, lines):
    index = build_index(folder, lines)
    save_json(folder.service_files, index)
    print("service_files.json: %d line-directions, %d backup and %d late-start timetables"
          % (len(index),
             sum(1 for e in index.values() for t in e["timetables"] if t.startswith("backup/")),
             sum(len(e["late_start"]) for e in index.values())))
    return index
