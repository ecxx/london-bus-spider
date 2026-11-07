"""Make the line of each pattern from the lineStrings of its svc file.

See docs/svc_line_algorithm.md for the procedure. The step numbers below refer to
section 6 of that file.
"""

import bisect
import json
import math
import os

M_PER_DEG = 111320          # metres in one degree of latitude
POSITION_M = 60             # largest distance from a stop to a position
END_POSITION_M = 150        # ... for the first stop and the last stop of a pattern
FAR_M = 60                  # a placed stop farther than this is a far stop
BACK_M = 100                # largest step back along the part
UNPLACED_COST = 300         # cost of an unplaced stop
MIN_PLACED_SHARE = 0.5      # smallest share of placed stops in a valid fit
CUT_TOLERANCE_M = 50        # cut length tolerance in part selection
BAD_M = 500                 # smallest distance from a bad-position stop to the stops before and after it
BAD_FACTOR = 2              # ... and the smallest ratio to the distance between those two stops


class Folder:
    """The inputs of one data folder: svc_patterns.json, stops.json and the svc files."""

    def __init__(self, path):
        self.path = path
        with open(os.path.join(path, "svc_patterns.json")) as f:
            self.patterns = json.load(f)
        with open(os.path.join(path, "stops.json")) as f:
            self.stops = json.load(f)
        with open(os.path.join(path, "service_files.json")) as f:
            self.index = json.load(f)

        missing = sorted({s for r in self.patterns.values() for p in r["patterns"]
                          for s in p["stops"] if s not in self.stops})
        if missing:
            raise ValueError("pattern stops that are not in stops.json: %s" % ", ".join(missing))

    def keys(self):
        return list(self.patterns)

    def svc(self, key):
        with open(os.path.join(self.path, "svc", self.index[key]["svc"])) as f:
            return json.load(f)


class Projection:
    """Equirectangular approximation, in metres, around one latitude."""

    def __init__(self, lat0):
        self.kx = M_PER_DEG * math.cos(math.radians(lat0))

    def xy(self, lon, lat):
        return lon * self.kx, lat * M_PER_DEG


class Part:
    """One part of a svc file (step 2): its points, in degrees and metres, and their offsets."""

    def __init__(self, index, points, proj):
        self.index = index
        self.ll = points
        self.xy = [proj.xy(*p) for p in points]
        self.off = [0.0]
        for a, b in zip(self.xy, self.xy[1:]):
            self.off.append(self.off[-1] + math.dist(a, b))
        # The bounding box of each segment, larger by END_POSITION_M, to skip far segments.
        m = END_POSITION_M
        self.boxes = [(min(a[0], b[0]) - m, max(a[0], b[0]) + m, min(a[1], b[1]) - m, max(a[1], b[1]) + m)
                      for a, b in zip(self.xy, self.xy[1:])]

    def positions(self, p):
        """Step 3: [(offset, distance)] of the points of this part that are the nearest
        point of a segment to p, and END_POSITION_M or less from p."""
        out = []
        px, py = p
        for i, (x0, x1, y0, y1) in enumerate(self.boxes):
            if not (x0 <= px <= x1 and y0 <= py <= y1):
                continue
            (ax, ay), (bx, by) = self.xy[i], self.xy[i + 1]
            dx, dy = bx - ax, by - ay
            seg = self.off[i + 1] - self.off[i]
            t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (seg * seg)))
            d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d <= END_POSITION_M:
                out.append((self.off[i] + t * seg, d))
        return out

    def point_at(self, offset):
        """The [lon, lat] point of the part at an offset."""
        i = min(max(bisect.bisect_right(self.off, offset) - 1, 0), len(self.off) - 2)
        seg = self.off[i + 1] - self.off[i]
        t = 0.0 if seg == 0 else max(0.0, min(1.0, (offset - self.off[i]) / seg))
        (a0, a1), (b0, b1) = self.ll[i], self.ll[i + 1]
        return [a0 + t * (b0 - a0), a1 + t * (b1 - a1)]

    def between(self, a, b):
        """The points of the part with an offset more than a and less than b."""
        i = bisect.bisect_right(self.off, a)
        j = bisect.bisect_left(self.off, b)
        return self.ll[i:j]


def make_parts(svc, proj_for):
    """Step 2. proj_for(first point) gives the projection of the line-direction."""
    lines = []
    for text in svc.get("lineStrings") or []:
        for line in json.loads(text):
            points = []
            for p in line:
                p = [p[0], p[1]]
                if not points or p != points[-1]:
                    points.append(p)
            if len(points) >= 2 and points not in lines:
                lines.append(points)
    if not lines:
        return [], None
    proj = proj_for(lines[0][0])
    return [Part(i, pts, proj) for i, pts in enumerate(lines)], proj


class Fit:
    """Step 4: the placed stops of one pattern on one part."""

    def __init__(self, part, placed):
        self.part = part
        self.placed = placed                # one (offset, distance) or None for each stop
        on = [p for p in placed if p]
        self.unplaced = len(placed) - len(on)
        self.far = sum(1 for _, d in on if d > FAR_M)
        self.distance = sum(d for _, d in on)
        self.cut = on[-1][0] - on[0][0] if on else 0.0
        self.valid = len(on) >= 2 and len(on) >= MIN_PLACED_SHARE * len(placed)


def fit(part, positions):
    """Step 4: the fit with the lowest cost. positions has the positions of each stop."""
    # A state is (offset, (cost, -placed), path). path is a linked list of (offset,
    # distance) or None, one for each stop, from the last stop back.
    states = [(-math.inf, (0.0, 0), None)]
    for ps in positions:
        offsets = [s[0] for s in states]
        new = []
        for off, d in ps:
            k = bisect.bisect_right(offsets, off + BACK_M) - 1
            if k >= 0:
                _, (cost, neg), path = states[k]
                new.append((off, (cost + d, neg - 1), (path, (off, d))))
        for off, (cost, neg), path in states:
            new.append((off, (cost + UNPLACED_COST, neg), (path, None)))
        # Keep only the states that can give a better fit: sorted by offset, each
        # kept state has a lower key than all kept states before it. Thus the last
        # state with an offset of X or less is the best state for that offset.
        new.sort(key=lambda s: (s[0], s[1]))
        states = []
        for s in new:
            if not states or s[1] < states[-1][1]:
                states.append(s)
    path = min(states, key=lambda s: s[1])[2]
    placed = []
    while path is not None:
        path, p = path
        placed.append(p)
    placed.reverse()
    return Fit(part, placed)


def select(fits):
    """Step 5: the selected fit, or None if no fit is valid."""
    fits = [f for f in fits if f.valid]
    if not fits:
        return None
    least = min(f.unplaced for f in fits)
    fits = [f for f in fits if f.unplaced == least]
    least = min(f.far for f in fits)
    fits = [f for f in fits if f.far == least]
    shortest = min(f.cut for f in fits)
    fits = [f for f in fits if f.cut <= shortest + CUT_TOLERANCE_M]
    return min(fits, key=lambda f: (f.distance, f.part.index))


def bad_positions(placed, xy):
    """Step 6: the indexes of the bad-position stops."""
    bad = set()
    for i in range(1, len(placed) - 1):
        if placed[i] is None and placed[i - 1] and placed[i + 1]:
            a, s, b = xy[i - 1], xy[i], xy[i + 1]
            near = min(math.dist(a, s), math.dist(s, b))
            if near >= BAD_M and near >= BAD_FACTOR * math.dist(a, b):
                bad.add(i)
    return bad


class Line:
    """The points of a line, with no point the same as the point before it, and its length."""

    def __init__(self, proj):
        self.proj = proj
        self.points = []
        self.length = 0.0

    def add(self, p):
        p = [round(p[0], 6), round(p[1], 6)]
        if self.points and p == self.points[-1]:
            return
        if self.points:
            self.length += math.dist(self.proj.xy(*self.points[-1]), self.proj.xy(*p))
        self.points.append(p)


def make_line(stops, ll, xy, selected, proj):
    """Steps 6 to 8: (line, stopOffsets, source, flags, unplaced indexes)."""
    line = Line(proj)
    offsets = [None] * len(stops)
    if selected is None:                                        # step 8
        for i, p in enumerate(ll):
            line.add(p)
            offsets[i] = line.length
        return line, offsets, "stops", ["straight_section"], list(range(len(stops)))

    part, placed = selected.part, selected.placed
    bad = bad_positions(placed, xy)
    unplaced = [i for i, p in enumerate(placed) if p is None]
    anchors = []                                                # (stop index, offset or None)
    top, back = -math.inf, False
    for i, p in enumerate(placed):
        if i in bad:
            continue
        if p is None:
            anchors.append((i, None))
            continue
        back = back or p[0] < top
        top = max(top, p[0])
        anchors.append((i, top))

    straight = False
    for k, (i, off) in enumerate(anchors):
        if k and off is not None and anchors[k - 1][1] is not None:
            for q in part.between(anchors[k - 1][1], off):
                line.add(q)
        elif k:
            straight = True
        line.add(part.point_at(off) if off is not None else ll[i])
        offsets[i] = line.length

    flags = [name for name, on in (("far_stop", selected.far), ("bad_stop_position", bad),
                                   ("straight_section", straight), ("stop_order", back)) if on]
    return line, offsets, "mixed" if straight else "line", flags, unplaced


def parts_and_projection(folder, key):
    """Step 2: the parts of a line-direction and its projection. lat0 is the latitude
    of the first point of part 0, or of the first stop of the main pattern if there
    is no part."""
    parts, proj = make_parts(folder.svc(key), lambda p: Projection(p[1]))
    if proj is None:
        first = folder.stops[folder.patterns[key]["patterns"][0]["stops"][0]]
        proj = Projection(first["lat"])
    return parts, proj


def build_line_direction(folder, key):
    """Return {pattern id: record} for one line-direction."""
    record = folder.patterns[key]
    parts, proj = parts_and_projection(folder, key)

    cache = {}                                  # (stop ID, part index) -> positions
    out = {}
    for pattern in record["patterns"]:
        stops = pattern["stops"]
        ll = [[folder.stops[s]["lon"], folder.stops[s]["lat"]] for s in stops]
        xy = [proj.xy(*p) for p in ll]
        fits = []
        for part in parts:
            ps = []
            for i, (s, p) in enumerate(zip(stops, xy)):
                if (s, part.index) not in cache:
                    cache[(s, part.index)] = part.positions(p)
                limit = END_POSITION_M if i in (0, len(stops) - 1) else POSITION_M
                ps.append([q for q in cache[(s, part.index)] if q[1] <= limit])
            fits.append(fit(part, ps))
        selected = select(fits)
        line, offsets, source, flags, unplaced = make_line(stops, ll, xy, selected, proj)
        on = [p[1] for p in selected.placed if p] if selected else []
        out[pattern["id"]] = {
            "id": pattern["id"],
            "lineDirection": key,
            "source": source,
            "part": selected.part.index if selected else None,
            "coordinates": line.points,
            "length": round(line.length, 1),
            "stopOffsets": [None if o is None else round(o, 1) for o in offsets],
            "maxStopDistance": round(max(on), 1) if on else None,
            "unplacedStops": unplaced,
            "flags": flags,
        }
    return out


def build(path, keys=None):
    """Return {pattern id: record} for keys, or for all line-directions, in svc_patterns.json order."""
    folder = Folder(path)
    out = {}
    for key in (keys or folder.keys()):
        out.update(build_line_direction(folder, key))
    return out
