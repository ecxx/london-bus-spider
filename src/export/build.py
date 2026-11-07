"""Make the export files of a data folder.

See docs/export_format.md for the format. The section numbers below refer to that file.
"""

import bisect
import hashlib
import json
import math
import os
import re

from lines.build import Folder, parts_and_projection

FORMAT = 1
NAMES = ("stops", "stations", "patterns", "lines")    # the files, in manifest order
DECIMALS = 5                # decimal places of a coordinate
STOP_POINT_M = 0.5          # largest difference between a stop offset and the offset of its point
HASH_LENGTH = 8
EXPORT_FILE = re.compile(r"^(%s)\.[0-9a-f]{%d}\.json$" % ("|".join(NAMES), HASH_LENGTH))


def encode_polyline(points):
    """Section 5: the encoded polyline of [lon, lat] points, with precision 5."""
    out = []
    prev = (0, 0)
    for lon, lat in points:
        cur = (round(lat * 10 ** DECIMALS), round(lon * 10 ** DECIMALS))
        for d in (cur[0] - prev[0], cur[1] - prev[1]):
            v = ~(d << 1) if d < 0 else d << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev = cur
    return "".join(out)


def decode_polyline(text):
    """The [lat, lon] points of an encoded polyline with precision 5."""
    values, v, shift = [], 0, 0
    for c in text:
        b = ord(c) - 63
        v |= (b & 0x1f) << shift
        shift += 5
        if b < 0x20:
            values.append(~(v >> 1) if v & 1 else v >> 1)
            v, shift = 0, 0
    points, lat, lon = [], 0, 0
    for dlat, dlon in zip(values[::2], values[1::2]):
        lat += dlat
        lon += dlon
        points.append([lat / 10 ** DECIMALS, lon / 10 ** DECIMALS])
    return points


def stop_points(pid, coordinates, offsets, proj):
    """Section 4.5: the index of the point of each stop, or None for a bad-position stop."""
    off = [0.0]
    for a, b in zip(coordinates, coordinates[1:]):
        off.append(off[-1] + math.dist(proj.xy(*a), proj.xy(*b)))
    out = []
    for o in offsets:
        if o is None:
            out.append(None)
            continue
        i = bisect.bisect_left(off, o)
        i = min((j for j in (i - 1, i) if 0 <= j < len(off)), key=lambda j: abs(off[j] - o))
        if abs(off[i] - o) > STOP_POINT_M:
            raise ValueError("%s: no point of the line is at the stop offset %.1f m "
                             "(nearest %.1f m)" % (pid, o, off[i]))
        out.append(i)
    return out


def coordinate(x):
    return round(x, DECIMALS)


def build(path):
    """Return {file name: data} for the files of section 4, without the manifest."""
    folder = Folder(path)
    with open(os.path.join(path, "stations.json")) as f:
        stations = json.load(f)
    with open(os.path.join(path, "svc_lines.json")) as f:
        lines = json.load(f)
    with open(os.path.join(path, "buses_master.json")) as f:
        names = {line["id"]: line["name"] for line in json.load(f)}

    missing = sorted({s["station"] for s in folder.stops.values()} - set(stations))
    if missing:
        raise ValueError("stations that are not in stations.json: %s" % ", ".join(missing))
    missing = sorted({r["lineId"] for r in folder.patterns.values()} - set(names))
    if missing:
        raise ValueError("lines that are not in buses_master.json: %s" % ", ".join(missing))

    out_stops = {k: [s["commonName"], s["indicator"], coordinate(s["lat"]), coordinate(s["lon"]),
                     s["station"]]
                 for k, s in sorted(folder.stops.items())}
    out_stations = {k: [s["commonName"], coordinate(s["lat"]), coordinate(s["lon"])]
                    for k, s in sorted(stations.items())}
    out_patterns, out_lines = {}, {}
    for key in folder.keys():
        record = folder.patterns[key]
        _, proj = parts_and_projection(folder, key)
        for p in record["patterns"]:
            pid = p["id"]
            if pid not in lines:
                raise ValueError("%s is not in svc_lines.json" % pid)
            out_patterns[pid] = [record["lineId"], names[record["lineId"]], record["direction"],
                                 p["serviceClass"], p["stops"]]
            line = lines[pid]
            out_lines[pid] = [encode_polyline(line["coordinates"]),
                              stop_points(pid, line["coordinates"], line["stopOffsets"], proj)]
    return {"stops": out_stops, "stations": out_stations,
            "patterns": out_patterns, "lines": out_lines}


def dump(data):
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def write_file(path, content):
    with open(path + ".part", "wb") as f:
        f.write(content)
    os.replace(path + ".part", path)


def write(out, dataset, files):
    """Write the files and then the manifest into the folder out. Remove the export
    files of an earlier run. Return the manifest."""
    os.makedirs(out, exist_ok=True)
    manifest = {"format": FORMAT, "dataset": dataset, "files": {}}
    for name in NAMES:
        content = dump(files[name])
        file = "%s.%s.json" % (name, hashlib.sha256(content).hexdigest()[:HASH_LENGTH])
        write_file(os.path.join(out, file), content)
        manifest["files"][name] = file
    write_file(os.path.join(out, "manifest.json"), dump(manifest))
    keep = set(manifest["files"].values())
    for file in os.listdir(out):
        if EXPORT_FILE.match(file) and file not in keep:
            os.remove(os.path.join(out, file))
    return manifest
